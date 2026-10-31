import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  PRISMA_CLIENT_OPTIONS,
  createPrismaClientOptions,
} from '../../src/infrastructure/database/prisma-client-options.provider';
import { St12GradesHttp } from './st12-grades.http';
import { groupTextStimulus } from './st11-multipart.http';
import type { QuestionGroupContext } from '../../src/common/question-groups/question-group.projection';

export interface NumericObservations {
  queryCount: number;
  queryDurationMs: number;
  transactionDurationsMs: number[];
}
export interface MeasuredSt13Http extends St12GradesHttp {
  observations: NumericObservations;
  resetObservations(): void;
}

/** Transparent test instrumentation. No SQL, parameters, keys or response bodies are retained. */
export function measuredSt13Harness(
  Base = St12GradesHttp,
  clientToken = PrismaService,
  optionsToken = PRISMA_CLIENT_OPTIONS,
  optionsFactory = createPrismaClientOptions,
): new () => MeasuredSt13Http {
  return class extends Base {
    // Explicit owned target also permits read-only baseline SDK reuse without regenerating it.
    readonly prisma = new clientToken({
      datasourceUrl: process.env.DATABASE_URL,
    });
    observations: NumericObservations = {
      queryCount: 0,
      queryDurationMs: 0,
      transactionDurationsMs: [],
    };
    protected configure(builder: TestingModuleBuilder): TestingModuleBuilder {
      return super
        .configure(builder)
        .overrideProvider(optionsToken)
        .useFactory({
          inject: [ConfigService],
          factory: (config: ConfigService) => ({
            ...optionsFactory(config),
            log: [{ level: 'query', emit: 'event' }],
          }),
        });
    }
    async start(): Promise<void> {
      await super.start();
      const client = this.app.get<PrismaService>(clientToken);
      const events = client as unknown as {
        $on(event: 'query', listener: (event: Prisma.QueryEvent) => void): void;
      };
      events.$on('query', (event) => {
        this.observations.queryCount++;
        this.observations.queryDurationMs += event.duration;
      });
      const scoped = client.scoped;
      const original = scoped.$transaction;
      if (typeof original !== 'function')
        throw new Error(
          'ST13 transaction timing requires the actual scoped client method',
        );
      const observations = () => this.observations;
      const timed = (...args: unknown[]) => {
        const started = performance.now();
        // Preserve the actual client, options, callback, rejection and transaction result.
        const result: unknown = Reflect.apply(original, scoped, args);
        return Promise.resolve(result).finally(() => {
          observations().transactionDurationsMs.push(
            performance.now() - started,
          );
        });
      };
      Object.defineProperty(scoped, '$transaction', {
        value: timed,
        configurable: true,
      });
      if (scoped.$transaction !== timed)
        throw new Error('ST13 transaction timing probe could not be installed');
    }
    resetObservations() {
      this.observations = {
        queryCount: 0,
        queryDurationMs: 0,
        transactionDurationsMs: [],
      };
    }
  };
}

export function durationSummary(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  return {
    sampleCount: sorted.length,
    p50_ms: percentile(0.5),
    p95_ms: percentile(0.95),
    max_ms: sorted.at(-1) ?? null,
  };
}

/** Manual benchmark only: correctness is asserted; no wall-clock latency threshold enters CI. */
export async function measureSt13Workload(
  h: MeasuredSt13Http,
  workloadId: string,
  fixture: {
    questionCount: number;
    groupCount: number;
    studentCount: number;
    assetCount: number;
    physicalFileCount: number;
  },
  request: () => PromiseLike<unknown>,
  concurrency = 1,
) {
  const warmupCount = 3,
    sampleCount = 20;
  for (let i = 0; i < warmupCount; i++) await request();
  await new Promise<void>((resolve) => setImmediate(resolve));
  h.resetObservations();
  const before = process.memoryUsage();
  let next = 0,
    errors = 0;
  const elapsed: number[] = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next++ < sampleCount) {
        const started = performance.now();
        try {
          await request();
        } catch {
          errors++;
        }
        elapsed.push(performance.now() - started);
      }
    }),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  const after = process.memoryUsage();
  const observations = h.observations;
  expect(elapsed).toHaveLength(sampleCount);
  expect(errors).toBe(0);
  expect(observations.queryCount).toBeGreaterThan(0);
  return {
    workload_id: workloadId,
    environment:
      'owned disposable loopback PostgreSQL/Redis/MinIO + actual Nest HTTP',
    node_version: process.version,
    fixture_size: fixture,
    question_count: fixture.questionCount,
    group_count: fixture.groupCount,
    student_count: fixture.studentCount,
    asset_count: fixture.assetCount,
    concurrency,
    sample_count: sampleCount,
    warmup_count: warmupCount,
    ...durationSummary(elapsed),
    error_count: errors,
    database_query_count: observations.queryCount,
    observed_query_duration_total_ms: observations.queryDurationMs,
    transaction_duration: durationSummary(observations.transactionDurationsMs),
    transaction_timing_definition:
      'caller-observed scoped transaction elapsed, including queue/commit; transparent delegation, not pure lock hold time',
    memory_or_resource_observations: { before, after },
    approved_budget_or_baseline:
      'No approved workload-specific latency SLO; equivalent baseline is recorded separately when executed',
    result_classification: 'MEASURED_NO_APPROVED_SLO',
  };
}

export async function runSt13Performance(h: MeasuredSt13Http) {
  // The benchmark's owned custom role needs the existing Student summary-read grant.
  await h.fixture.grantAssets(h.fixture.actors.student.roleId, [
    'grades.snapshots.view',
  ]);
  h.fixture.actors.student.permissions = [
    ...new Set([
      ...h.fixture.actors.student.permissions,
      'grades.snapshots.view',
    ]),
  ];
  const f = await h.draft();
  const schoolId = h.fixture.school.schoolId;
  const base = await h.prisma.gradeAssessmentQuestion.findUniqueOrThrow({
    where: { id: f.question.id },
  });
  const groups = Array.from({ length: 20 }, (_, i) => ({
    id: randomUUID(),
    schoolId,
    assessmentId: f.assessmentId,
    createdByUserId: h.fixture.actors.teacher.userId,
    title: `ST13 bounded group ${i}`,
    layoutOrder: i,
    sharedStimulus: groupTextStimulus() as unknown as Prisma.InputJsonValue,
  }));
  // Canonical owned fixture construction, not an alternative authoring API or data migration.
  await h.prisma.gradeAssessmentQuestionGroup.createMany({ data: groups });
  await h.prisma.gradeAssessmentQuestion.update({
    where: { id: f.question.id },
    data: { groupId: groups[0].id, layoutOrder: 0, sortOrder: 0 },
  });
  await h.prisma.gradeAssessmentQuestion.createMany({
    data: Array.from({ length: 199 }, (_, offset) => {
      const i = offset + 1;
      return {
        schoolId,
        assessmentId: f.assessmentId,
        type: 'NUMERIC' as const,
        prompt: `ST13 bounded numeric question ${i}`,
        points: 2,
        required: false,
        sortOrder: i,
        groupId: groups[Math.floor(i / 10)].id,
        layoutOrder: i % 10,
        metadata: base.metadata as Prisma.InputJsonValue,
        answerKey: base.answerKey as Prisma.InputJsonValue,
      };
    }),
  });
  await h.prisma.gradeAssessment.update({
    where: { id: f.assessmentId },
    data: { maxScore: 400, type: 'ASSIGNMENT' },
  });
  const totals = await h.prisma.gradeAssessmentQuestion.aggregate({
    where: { assessmentId: f.assessmentId, deletedAt: null },
    _count: true,
    _sum: { points: true },
  });
  expect(totals._count).toBe(200);
  expect(totals._sum.points?.toFixed(2)).toBe('400.00');
  const upload = await h.paperUpload(
    f,
    Buffer.from('Owned ST13 bounded private transfer\n'.repeat(8192)),
  );
  let paperAssetId = '';
  for (const resource of [
    '/assets',
    `/questions/${f.question.id}/assets`,
    `/groups/${groups[0].id}/assets`,
  ]) {
    const response = await h
      .http()
      .post(f.teacher + '/authoring' + resource)
      .set(h.headers())
      .send({
        sourceType: 'MANAGED_FILE',
        uploadId: upload.ready.uploadId,
        fileId: upload.ready.fileId,
      })
      .expect(201);
    const body = response.body as {
      asset?: { assetId: string };
      id?: string;
      assetId?: string;
    };
    if (resource === '/assets')
      paperAssetId = body.asset?.assetId ?? body.assetId ?? body.id ?? '';
  }
  expect(paperAssetId).not.toBe('');
  const fixture = {
    questionCount: 200,
    groupCount: 20,
    studentCount: 1,
    assetCount: 3,
    physicalFileCount: 1,
  };
  const rows: Awaited<ReturnType<typeof measureSt13Workload>>[] = [];
  const measure = async (
    id: string,
    action: () => PromiseLike<unknown>,
    concurrency = 1,
  ) => {
    console.info('ST13_PERFORMANCE_WORKLOAD=' + id);
    rows.push(await measureSt13Workload(h, id, fixture, action, concurrency));
  };
  await measure('PERF-G-AUTHOR-200', () =>
    h
      .http()
      .get(f.teacher + '/authoring/questions')
      .set(h.headers())
      .expect(200)
      .expect((response) =>
        expect(
          (response.body as { questions: unknown[] }).questions,
        ).toHaveLength(200),
      ),
  );
  await h.approveKey(f);
  await h
    .http()
    .post(f.core + '/publish')
    .set(h.headers('admin'))
    .send({})
    .expect(201);
  await h
    .http()
    .post(f.core + '/submissions/resolve')
    .set(h.headers('student'))
    .send({
      studentId: h.fixture.children[0].studentId,
      enrollmentId: h.fixture.children[0].enrollmentId,
    })
    .expect(201);
  const submission = await h.prisma.gradeSubmission.findFirstOrThrow({
    where: {
      assessmentId: f.assessmentId,
      studentId: h.fixture.children[0].studentId,
    },
  });
  await h
    .http()
    .put(`/api/v1/grades/submissions/${submission.id}/answers`)
    .set(h.headers('student'))
    .send({
      answers: [
        {
          questionId: f.question.id,
          answerJson: { value: '12.5', unitCode: 'm' },
        },
      ],
    })
    .expect(200);
  await h
    .http()
    .post(`/api/v1/grades/submissions/${submission.id}/submit`)
    .set(h.headers('student'))
    .send({})
    .expect(201);
  const submitted = await h.submittedIdentity(f);
  const studentDetail = `/api/v1/student/grades/assessments/${f.assessmentId}`;
  const teacherQueue = `/api/v1/teacher/classroom/${h.fixture.allocations.teacher}/assignments/${f.assessmentId}/submissions`;
  await measure('PERF-G-STUDENT-LIST', () =>
    h
      .http()
      .get('/api/v1/student/grades')
      .set(h.headers('student'))
      .expect(200)
      .expect((response) =>
        expect(JSON.stringify(response.body)).toContain(f.assessmentId),
      ),
  );
  await measure('PERF-G-STUDENT-DETAIL-200', () =>
    h
      .http()
      .get(studentDetail)
      .set(h.headers('student'))
      .expect(200)
      .expect((response) =>
        expect(
          (response.body as { questions: unknown[] }).questions,
        ).toHaveLength(200),
      ),
  );
  await measure('PERF-G-GROUP-DISPLAY-20', () =>
    h
      .http()
      .get(studentDetail)
      .set(h.headers('student'))
      .expect(200)
      .expect((response) => {
        const body = response.body as QuestionGroupContext;
        expect(body.groups).toHaveLength(20);
        expect(body.groups.reduce((sum, g) => sum + Number(g.points), 0)).toBe(
          400,
        );
      }),
  );
  await measure('PERF-G-QUESTION-ASSET-METADATA', () =>
    h
      .http()
      .get(f.teacher + `/questions/${f.question.id}/assets`)
      .set(h.headers())
      .expect(200)
      .expect((response) =>
        expect((response.body as { assets: unknown[] }).assets).toHaveLength(1),
      ),
  );
  await measure('PERF-G-TEACHER-QUEUE', () =>
    h
      .http()
      .get(teacherQueue)
      .set(h.headers())
      .expect(200)
      .expect((response) =>
        expect(JSON.stringify(response.body)).toContain(submission.id),
      ),
  );
  await measure('PERF-G-TEACHER-PAGINATION', () =>
    h
      .http()
      .get(teacherQueue + '?page=1&limit=1')
      .set(h.headers())
      .expect(200),
  );
  await measure('PERF-G-TEACHER-DETAIL-200', () =>
    h
      .http()
      .get(teacherQueue + '/' + submission.id)
      .set(h.headers())
      .expect(200)
      .expect((response) => {
        const body = JSON.stringify(response.body);
        expect(body).toContain(f.question.id);
        expect(body).not.toContain('"answerKey":');
      }),
  );
  await measure('PERF-G-OBJECTIVE-EVALUATION', async () => {
    const suggestion = await h.evaluate(submitted);
    expect(suggestion.suggestedPoints).toBe(2);
  });
  await measure(
    'PERF-G-CONCURRENT-MANUAL-REVIEW',
    () => h.manual(submitted, 1, 'ST13 bounded explicit review'),
    4,
  );
  await h.finalize(submitted);
  await h.approvePaper(submitted);
  await h
    .release(submitted, 'NONE', 'DETAILS')
    .then((r) => expect(r.status).toBe(200));
  await measure('PERF-G-PARENT-RELEASED-200', () =>
    h
      .http()
      .get(h.reviewPath(submitted, 'parent'))
      .set(h.headers('parent'))
      .expect(200)
      .expect((response) =>
        expect(
          (response.body as { questions: unknown[] }).questions,
        ).toHaveLength(200),
      ),
  );
  const bytes = studentDetail + '/assets/' + paperAssetId + '/download';
  await h.http().head(bytes).set(h.headers('student')).expect(200);
  await h
    .http()
    .get(bytes)
    .set(h.headers('student'))
    .set('Range', 'bytes=0-63')
    .expect(206)
    .expect((response) =>
      expect(response.text).toBe(upload.bytes.subarray(0, 64).toString()),
    );
  await h
    .http()
    .get(bytes)
    .set(h.headers('student'))
    .set('Range', `bytes=${upload.bytes.length + 100}-`)
    .expect(416);
  await measure('PERF-G-PRIVATE-BYTES', () =>
    h
      .http()
      .get(bytes)
      .set(h.headers('student'))
      .expect(200)
      .expect((response) =>
        expect(response.text).toBe(upload.bytes.toString()),
      ),
  );
  expect(
    await h.prisma.gradeItem.count({ where: { assessmentId: f.assessmentId } }),
  ).toBe(0);
  let syncedGradeItemId: string | undefined;
  await measure('PERF-G-EXPLICIT-SYNC', () =>
    h
      .http()
      .post(`/api/v1/grades/submissions/${submission.id}/sync-grade-item`)
      .set(h.headers('admin'))
      .expect(201)
      .expect((response) => {
        const result = response.body as {
          synced: boolean;
          idempotent: boolean;
          gradeItem: { id: string; score: number };
        };
        expect(result.synced).toBe(true);
        expect(result.idempotent).toBe(syncedGradeItemId !== undefined);
        if (syncedGradeItemId)
          expect(result.gradeItem.id).toBe(syncedGradeItemId);
        syncedGradeItemId = result.gradeItem.id;
        expect(result.gradeItem.score).toBe(1);
      }),
  );
  expect(
    await h.prisma.gradeItem.count({ where: { assessmentId: f.assessmentId } }),
  ).toBe(1);
  const answerFile = await h.setupResponse('Grades', 'FILE_ONLY');
  const answerUpload = await h.bindReady(answerFile.media);
  rows.push(
    await measureSt13Workload(
      h,
      'PERF-G-ANSWER-ASSET-METADATA',
      {
        questionCount: 2,
        groupCount: 0,
        studentCount: 1,
        assetCount: 1,
        physicalFileCount: 1,
      },
      () =>
        h
          .http()
          .get(answerFile.media + '/answer-assets')
          .set(h.headers('student'))
          .expect(200)
          .expect((response) =>
            expect(JSON.stringify(response.body)).toContain(
              answerUpload.asset.id,
            ),
          ),
    ),
  );
  const homework = await h.grouped('Homework');
  await h
    .http()
    .post(homework.publish)
    .set(h.headers(homework.author))
    .send({})
    .expect(200);
  rows.push(
    await measureSt13Workload(
      h,
      'PERF-H-GROUPED-ELEVEN-TYPE-DETAIL',
      {
        questionCount: 11,
        groupCount: 1,
        studentCount: 1,
        assetCount: 1,
        physicalFileCount: 0,
      },
      () =>
        h
          .http()
          .get(homework.student)
          .set(h.headers('student'))
          .expect(200)
          .expect((response) =>
            expect(JSON.stringify(response.body)).toContain(homework.groupId),
          ),
    ),
  );
  const [database] = await h.prisma.$queryRaw<
    Array<{ version: string }>
  >`SELECT current_setting('server_version') AS version`;
  expect(rows.some((row) => row.transaction_duration.sampleCount > 0)).toBe(
    true,
  );
  return {
    methodology:
      '20 samples and 3 warmups per workload; actual JWT/loopback HTTP; numeric-only query events and transparent transaction timing; no p95 pass threshold',
    postgres_version: database.version,
    private_transfer_bytes: upload.bytes.length,
    workloads: rows,
    performance_measured: true,
    performance_slo_certification: 'NOT_CERTIFIED',
    dr07_security_provider_approval: 'PENDING',
    production_mutation: false,
  };
}
