import { createHash, randomUUID } from 'node:crypto';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { GradeQuestionType, Prisma } from '@prisma/client';
import type { Response } from 'supertest';
import { St11MultipartHttp } from './st11-multipart.http';
import { st06Json } from './homework-question-assets.http';
import {
  gradeEightAuthor,
  gradeEightAnswer,
} from './grades-eight-types.fixture';
import { st10bCases } from './st10b-question-contracts.fixture';
import { postAssessmentUpload } from './assessment-media.fixture';
import type { AssessmentMediaUploadDto } from '../../src/modules/files/assessment-media/domain/assessment-media.contract';
import type { GradeAssessmentQuestionResponseDto } from '../../src/modules/grades/assessments/dto/grade-assessment-question.dto';
import type { GradeScoringSuggestionResponseDto } from '../../src/modules/grades/assessments/dto/grade-review.dto';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

export const ST12_PERMISSION = 'grades.teacher_authoring.manage';
export const ST12_TYPES: GradeQuestionType[] = [
  'MCQ_SINGLE',
  'MCQ_MULTI',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'ESSAY',
  'FILL_IN_BLANK',
  'MATCHING',
  'MEDIA',
  'ORDERING',
  'NUMERIC',
  'MATH_EXPRESSION',
];
export function st12Command(type: GradeQuestionType) {
  if (type === 'MATH_EXPRESSION')
    return {
      type,
      prompt: 'Proved constant expression',
      points: 2,
      required: true,
      metadata: {
        definitionVersion: 1,
        kind: 'math_expression',
        variables: [],
      },
      answerKey: { keyVersion: 1, kind: 'math_expression', expression: '5' },
    };
  const structured = st10bCases.find((item) => item.type === type);
  if (structured)
    return {
      type,
      prompt: 'ST12 objective question',
      points: 2,
      required: true,
      metadata: structured.definition,
      answerKey: structured.key,
    };
  const command = gradeEightAuthor(type);
  if (type === 'FILL_IN_BLANK')
    return {
      ...command,
      answerKey: {
        keyVersion: 1,
        kind: 'fill',
        normalization: 'NFC_TRIM',
        blanks: [
          { blankId: 'capital', acceptedTexts: ['Paris'] },
          { blankId: 'river', acceptedTexts: ['Seine'] },
        ],
      },
    };
  if (['SHORT_ANSWER', 'ESSAY', 'MEDIA'].includes(type))
    return {
      ...command,
      answerKey: {
        keyVersion: 1,
        kind: 'model_text',
        text: 'Approved model response',
      },
    };
  return command;
}
export type St12Draft = {
  assessmentId: string;
  question: GradeAssessmentQuestionResponseDto;
  teacher: string;
  core: string;
  student: string;
};
export type St12Submitted = St12Draft & {
  submissionId: string;
  answerId: string;
  scoring: string;
  coreScoring: string;
};

/** Real JWT + live database and owned storage. Test attestations never enter runtime wiring. */
export class St12GradesHttp extends St11MultipartHttp {
  private readonly paperUploads = new Map<
    string,
    { assessmentId: string; actorId: string }
  >();
  protected configure(builder: TestingModuleBuilder) {
    const configured = super.configure(builder);
    const answerAttestation = this.testSecurity.beforeAttest!;
    this.testSecurity.beforeAttest = async (input) => {
      const session = await this.prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: input.uploadId },
      });
      if (session.purpose !== 'GRADE_ASSESSMENT_MEDIA')
        return answerAttestation(input);
      const expected = this.paperUploads.get(session.id);
      if (
        !expected ||
        expected.assessmentId !== session.purposeContextId ||
        expected.actorId !== session.createdByUserId ||
        !this.fixture.schools.some(
          (school) => school.schoolId === session.schoolId,
        ) ||
        session.status !== 'VERIFYING' ||
        input.bucket !== this.fixture.storage.resolveBucket('PRIVATE') ||
        input.bucket !== session.finalBucket ||
        input.objectKey !== session.finalObjectKey
      )
        throw new Error('ST12 test attestor refuses unrelated paper bytes');
      const stat = await this.fixture.storage.statObject({
        bucket: input.bucket,
        objectKey: input.objectKey,
      });
      if (
        BigInt(stat.size) !== session.expectedSizeBytes ||
        stat.contentType !== session.expectedMimeType ||
        input.objectIdentity !==
          JSON.stringify([
            stat.etag,
            stat.generation,
            stat.version,
            stat.size,
            stat.contentType,
          ])
      )
        throw new Error('ST12 test object identity mismatch');
      const source = await this.fixture.storage.getObject({
        bucket: input.bucket,
        objectKey: input.objectKey,
        raw: true,
      });
      const hash = createHash('sha256');
      try {
        for await (const chunk of source)
          hash.update(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array),
          );
      } finally {
        source.destroy();
      }
      if (hash.digest('hex') !== input.facts.checksumSha256)
        throw new Error('ST12 test digest mismatch');
    };
    return configured;
  }
  async reset() {
    await super.reset();
    for (const name of ['teacher', 'otherTeacher', 'foreignTeacher'] as const) {
      const actor = this.fixture.actors[name];
      const denied = [
        'grades.questions.manage',
        'grades.assessments.manage',
        'grades.assessments.publish',
        'grades.assessments.approve',
      ];
      await this.prisma.rolePermission.deleteMany({
        where: { roleId: actor.roleId, permission: { code: { in: denied } } },
      });
      await this.fixture.grantAssets(actor.roleId, [ST12_PERMISSION]);
      actor.permissions = [
        ...actor.permissions.filter((code) => !denied.includes(code)),
        ST12_PERMISSION,
      ];
    }
    for (const name of ['admin', 'organization'] as const) {
      const actor = this.fixture.actors[name];
      await this.fixture.grantAssets(actor.roleId, [
        'grades.assessments.approve',
      ]);
      actor.permissions.push('grades.assessments.approve');
    }
    for (const name of ['student', 'otherStudent', 'foreignStudent'] as const) {
      const actor = this.fixture.actors[name];
      const denied = [
        'grades.questions.manage',
        'grades.assessments.manage',
        'grades.assessments.publish',
        'grades.assessments.approve',
        'grades.submissions.review',
        'grades.items.manage',
      ];
      await this.prisma.rolePermission.deleteMany({
        where: { roleId: actor.roleId, permission: { code: { in: denied } } },
      });
      actor.permissions = actor.permissions.filter(
        (code) => !denied.includes(code),
      );
    }
  }
  async draft(
    type: GradeQuestionType = 'NUMERIC',
    extra: Record<string, unknown> = {},
  ): Promise<St12Draft> {
    const assessment = await this.fixture.assessment();
    const teacher = `/api/v1/teacher/classroom/${this.fixture.allocations.teacher}/grades/assessments/${assessment.id}`;
    const created = await this.http()
      .post(teacher + '/authoring/questions')
      .set(this.headers())
      .send({ ...st12Command(type), ...extra })
      .expect(201);
    return {
      assessmentId: assessment.id,
      teacher,
      core: '/api/v1/grades/assessments/' + assessment.id,
      student: '/api/v1/student/exams/' + assessment.id,
      question: st06Json<GradeAssessmentQuestionResponseDto>(created),
    };
  }
  async approveKey(f: St12Draft) {
    const question =
      await this.prisma.gradeAssessmentQuestion.findUniqueOrThrow({
        where: { id: f.question.id },
      });
    return st06Json<{ id: string }>(
      await this.http()
        .post(f.core + '/questions/' + question.id + '/key-approval')
        .set(this.headers('admin'))
        .send({ expectedQuestionUpdatedAt: question.updatedAt.toISOString() })
        .expect(201),
    );
  }
  async submitDraft(f: St12Draft, payload?: object): Promise<St12Submitted> {
    await this.http()
      .post(f.core + '/publish')
      .set(this.headers('admin'))
      .send({})
      .expect(201);
    await this.http()
      .post(f.student + '/start')
      .set(this.headers('student'))
      .expect(201);
    const structured = st10bCases.find(
      (item) => item.type === f.question.canonicalType,
    );
    const answer =
      payload ??
      (structured
        ? {
            answerJson:
              structured.type === 'MATH_EXPRESSION'
                ? { expression: '2+3' }
                : structured.answer,
          }
        : gradeEightAnswer(
            f.question.canonicalType!,
            f.question.options.map((option) => option.id),
          ));
    await this.http()
      .put(f.student + '/submission/answers')
      .set(this.headers('student'))
      .send({ answers: [{ questionId: f.question.id, ...answer }] })
      .expect(200);
    await this.http()
      .post(f.student + '/submission/submit')
      .set(this.headers('student'))
      .send({})
      .expect(201);
    return this.submittedIdentity(f);
  }
  async submittedIdentity(f: St12Draft): Promise<St12Submitted> {
    const submission = await this.prisma.gradeSubmission.findFirstOrThrow({
      where: {
        assessmentId: f.assessmentId,
        studentId: this.fixture.children[0].studentId,
      },
    });
    const answer = await this.prisma.gradeSubmissionAnswer.findFirstOrThrow({
      where: { submissionId: submission.id, questionId: f.question.id },
    });
    return {
      ...f,
      submissionId: submission.id,
      answerId: answer.id,
      scoring: `${f.teacher}/submissions/${submission.id}/answers/${answer.id}/scoring/suggestions`,
      coreScoring: `${f.core}/submissions/${submission.id}/answers/${answer.id}/scoring/suggestions`,
    };
  }
  async evaluate(f: St12Submitted) {
    return st06Json<GradeScoringSuggestionResponseDto>(
      await this.http()
        .post(f.scoring)
        .set(this.headers())
        .send({})
        .expect(201),
    );
  }
  async manual(
    f: St12Submitted,
    points = 1,
    reviewerComment = 'Private reviewer note',
  ) {
    return this.http()
      .patch(
        `/api/v1/grades/submissions/${f.submissionId}/answers/${f.answerId}/review`,
      )
      .set(this.headers('admin'))
      .send({ awardedPoints: points, reviewerComment })
      .expect(200);
  }
  async finalize(f: St12Submitted) {
    await this.http()
      .post(`/api/v1/grades/submissions/${f.submissionId}/review/finalize`)
      .set(this.headers('admin'))
      .expect(201);
  }
  async approvePaper(f: St12Draft) {
    await this.http()
      .post(f.core + '/approve')
      .set(this.headers('admin'))
      .send({})
      .expect(201);
  }
  reviewPath(
    f: St12Draft,
    audience: 'student' | 'parent' = 'student',
    child = 0,
  ) {
    return audience === 'student'
      ? `/api/v1/student/grades/assessments/${f.assessmentId}/review`
      : `/api/v1/parent/children/${this.fixture.children[child].studentId}/grades/assessments/${f.assessmentId}/review`;
  }
  async release(
    f: St12Draft,
    studentLevel = 'DETAILS',
    parentLevel = 'NONE',
    expectedVersion = 0,
    requestId = randomUUID(),
  ) {
    return this.http()
      .put(f.core + '/review-release')
      .set(this.headers('admin'))
      .send({ studentLevel, parentLevel, expectedVersion, requestId });
  }
  async paperUpload(
    f: St12Draft,
    bytes = Buffer.from('Owned ST12 private reference\n'),
  ) {
    const path = f.teacher + '/authoring/uploads';
    const created = st06Json<AssessmentMediaUploadDto>(
      await this.http()
        .post(path)
        .set(this.headers())
        .send({
          clientRequestId: randomUUID(),
          originalName: 'reference.txt',
          expectedMimeType: 'text/plain',
          expectedSizeBytes: String(bytes.length),
        })
        .expect(201),
    );
    if (!created.uploadCapability)
      throw new Error('Expected actual owned upload capability');
    this.paperUploads.set(created.uploadId, {
      assessmentId: f.assessmentId,
      actorId: this.fixture.actors.teacher.userId,
    });
    expect(
      (
        await postAssessmentUpload(
          created.uploadCapability,
          bytes,
          'text/plain',
        )
      ).ok,
    ).toBe(true);
    const ready = st06Json<AssessmentMediaUploadDto>(
      await this.http()
        .post(path + '/' + created.uploadId + '/complete')
        .set(this.headers())
        .send({})
        .expect(201),
    );
    return { ready, bytes };
  }
  async disposeSt12Case() {
    assertDisposablePostgresTarget({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      universalRegressionMarker:
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
      localDatabasePredicate: (name) => /^ci_[0-9a-f]{12,64}$/u.test(name),
      errorMessage:
        'ST12 retained evidence teardown requires the owned disposable serial DB',
    });
    // Application DELETE is prohibited. Only the guarded disposable fixture owner has TRUNCATE.
    await this.prisma
      .$executeRaw`TRUNCATE grade_scoring_suggestions, grade_question_key_approvals, grade_review_release_policies`;
    await this.disposeMultipartCase();
  }
  async heldLock(
    acquire: (tx: Prisma.TransactionClient) => Promise<unknown>,
    requests: Array<() => PromiseLike<Response>>,
  ) {
    let ready!: (pid: number) => void, release!: () => void;
    const acquired = new Promise<number>((resolve) => {
      ready = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = this.prisma.$transaction(
      async (tx) => {
        await acquire(tx);
        const [row] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        ready(row.pid);
        await released;
      },
      { timeout: 20000 },
    );
    const pid = await acquired;
    const pending = requests.map((request) => Promise.resolve(request()));
    try {
      let proved = false;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const rows = await this.prisma.$queryRaw<
          Array<{ pid: number; blockers: number[] }>
        >`SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`;
        const chain = new Set([pid]);
        for (let i = 0; i <= rows.length; i++)
          for (const row of rows)
            if (row.blockers.some((blocker) => chain.has(blocker)))
              chain.add(row.pid);
        if (chain.size - 1 >= requests.length) {
          proved = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(proved).toBe(true);
      console.info('ST12_LOCK_DEPENDENCY=PROVED');
      release();
      await holder;
      return await Promise.all(pending);
    } finally {
      release();
      await Promise.allSettled([holder, ...pending]);
    }
  }
}
