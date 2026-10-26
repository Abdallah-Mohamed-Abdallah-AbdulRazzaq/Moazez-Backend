import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { PersistedUrlPolicy } from '../../src/infrastructure/storage/provider-url.policy';
import { PrismaTeacherAllocationOperationalWriteGate } from '../../src/modules/academics/teacher-allocation/infrastructure/prisma-teacher-allocation-operational-write-gate';
import { AssessmentMediaRuntimePolicy } from '../../src/modules/files/assessment-media/application/assessment-media-runtime.policy';
import { GradeAssetsRepository } from '../../src/modules/grades/assessments/infrastructure/grade-assets.repository';
import { GradesAssessmentQuestionsRepository } from '../../src/modules/grades/assessments/infrastructure/grades-assessment-questions.repository';
import { normalizeQuestionPayload } from '../../src/modules/grades/assessments/domain/grade-question-domain';
import {
  gradeRichState,
  presentGradeRichContent,
} from '../../src/modules/grades/assessments/infrastructure/grade-rich-content.projection';
import { GradeAssetsFixture } from '../fixtures/grade-assets.fixture';
import { StudentExamsReadAdapter } from '../../src/modules/student-app/exams/infrastructure/student-exams-read.adapter';
import { StudentGradesReadAdapter } from '../../src/modules/student-app/grades/infrastructure/student-grades-read.adapter';
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../../src/modules/student-app/access/student-app-student-read.adapter';

const doc = (text: string) => ({
  language: 'und',
  direction: 'auto',
  blocks: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
});
const questionRich = (text = 'Scientific question') => ({
  contentVersion: 1,
  kind: 'question',
  stem: doc(text),
});
const optionRich = (text: string) => ({
  contentVersion: 1,
  kind: 'option',
  label: doc(text),
});
const assetRich = (assetId: string, kind = 'other') => ({
  ...questionRich(),
  stem: {
    ...doc(''),
    blocks: [
      {
        type: 'paragraph',
        children: [
          { type: 'assetReference', assetId, kind, altText: 'Reference' },
        ],
      },
    ],
  },
});

describe('ST08-B real PostgreSQL Grades Rich authorization and persistence', () => {
  jest.setTimeout(120000);
  const prisma = new PrismaService();
  let fixture: GradeAssetsFixture;
  let assets: GradeAssetsRepository;
  let repository: GradesAssessmentQuestionsRepository;
  let graph: Awaited<ReturnType<GradeAssetsFixture['gradeGraph']>>;
  const teacher = <T>(operation: () => Promise<T>) =>
    fixture.asMediaActor('teacher', operation);
  const update = (
    id: string,
    command: Parameters<typeof normalizeQuestionPayload>[0],
  ) => {
    const data = normalizeQuestionPayload(command);
    return repository.updateQuestionAndReplaceOptions(id, {
      data,
      options: data.options,
    });
  };
  const create = (options = false) =>
    teacher(async () => {
      const data = normalizeQuestionPayload(
        {
          type: options ? 'MCQ_SINGLE' : 'ESSAY',
          points: 1,
          richContent: questionRich(),
          ...(options
            ? {
                options: [
                  { richContent: optionRich('A'), isCorrect: true },
                  { richContent: optionRich('B') },
                ],
              }
            : {}),
        },
        { requirePrompt: true },
      );
      return repository.createQuestionWithOptions({
        schoolId: fixture.school.schoolId,
        assessmentId: graph.assessment.id,
        type: data.type!,
        prompt: data.prompt!,
        richContent: data.richContent,
        promptAr: data.promptAr,
        points: 1,
        sortOrder: 4,
        required: true,
        options: data.options ?? [],
      });
    });
  beforeAll(() => prisma.$connect());
  beforeEach(async () => {
    fixture = new GradeAssetsFixture(prisma);
    await fixture.create();
    graph = await fixture.gradeGraph();
    assets = new GradeAssetsRepository(
      prisma,
      new PrismaTeacherAllocationOperationalWriteGate(),
      fixture.repository,
      new AssessmentMediaRuntimePolicy(fixture.config),
      fixture.config,
      new PersistedUrlPolicy({
        s3CompatibleEndpoints: [fixture.config.getOrThrow('STORAGE_ENDPOINT')],
      }),
    );
    repository = new GradesAssessmentQuestionsRepository(prisma, assets);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture.dispose();
  });
  afterAll(() => prisma.$disconnect());

  it.each(['question', 'option'] as const)(
    'ST08B-REV-01 rejects an implicit %s Rich clear after creator ownership changes',
    async (target) => {
      const q = await create(true);
      await prisma.gradeAssessment.update({
        where: { id: q.assessmentId },
        data: { createdById: fixture.actors.otherTeacher.userId },
      });
      // Matching allocation, live membership and existing Grades access remain.
      expect(
        await teacher(() => repository.findQuestionByIdWithAssessment(q.id)),
      ).toMatchObject({ id: q.id, richContent: questionRich() });
      const before = await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
        where: { id: q.id },
        include: { options: { orderBy: { id: 'asc' } } },
      });
      const data = normalizeQuestionPayload({
        ...(target === 'question'
          ? { prompt: 'Unauthorized legacy edit' }
          : {}),
        points: 2,
        options: [
          { id: q.options[1].id, label: 'B', sortOrder: 1 },
          {
            id: q.options[0].id,
            label: target === 'option' ? 'Unauthorized option edit' : 'A',
            isCorrect: true,
            sortOrder: 2,
            metadata: { rejected: true },
          },
        ],
      });
      await expect(
        teacher(() =>
          repository.updateQuestionAndReplaceOptions(q.id, {
            data,
            options: data.options,
            metadataPatch: { rejected: true },
          }),
        ),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(
        await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
          where: { id: q.id },
          include: { options: { orderBy: { id: 'asc' } } },
        }),
      ).toEqual(before);
    },
  );

  it('ST08B-REV-01 permits owned implicit question/option clears and commits their legacy fields atomically', async () => {
    const q = await create(true);
    const changed = await teacher(() =>
      update(q.id, {
        prompt: 'Owned legacy question edit',
        metadata: { edited: true },
        options: [
          { id: q.options[1].id, label: 'B', sortOrder: 1 },
          {
            id: q.options[0].id,
            label: 'Owned legacy option edit',
            isCorrect: true,
            sortOrder: 2,
            metadata: { edited: true },
          },
        ],
      }),
    );
    expect(changed).toMatchObject({
      prompt: 'Owned legacy question edit',
      metadata: { edited: true },
      richContent: null,
    });
    expect(changed.options.map((o) => o.id)).toEqual([
      q.options[1].id,
      q.options[0].id,
    ]);
    expect(changed.options[1]).toMatchObject({
      label: 'Owned legacy option edit',
      metadata: { edited: true },
      richContent: null,
    });
    const [stored] = await prisma.$queryRaw<
      Array<{ questionNull: boolean; optionNull: boolean }>
    >`
      SELECT q.rich_content IS NULL AS "questionNull", o.rich_content IS NULL AS "optionNull"
      FROM grade_assessment_questions q JOIN grade_assessment_question_options o ON o.question_id=q.id
      WHERE q.id=${q.id}::uuid AND o.id=${q.options[0].id}::uuid`;
    expect(stored).toEqual({ questionNull: true, optionNull: true });
    expect(changed.options[0].richContent).toEqual(optionRich('B'));
  });

  it('ST08B-REV-01 preserves Rich content for unrelated and unchanged legacy edits without requiring creator ownership', async () => {
    const q = await create(true);
    await prisma.gradeAssessment.update({
      where: { id: q.assessmentId },
      data: { createdById: fixture.actors.otherTeacher.userId },
    });
    await teacher(() =>
      update(q.id, { points: 2, sortOrder: 5, metadata: { unrelated: true } }),
    );
    const unchanged = await teacher(() =>
      update(q.id, {
        questionTextEn: q.prompt,
        questionTextAr: q.promptAr,
        options: [
          {
            id: q.options[1].id,
            label: 'B',
            sortOrder: 1,
            metadata: { unrelated: true },
          },
          { id: q.options[0].id, label: 'A', isCorrect: true, sortOrder: 2 },
        ],
      }),
    );
    expect(unchanged).toMatchObject({
      points: new Prisma.Decimal(2),
      sortOrder: 5,
      metadata: { unrelated: true },
      richContent: questionRich(),
    });
    expect(unchanged.options.map((o) => [o.id, o.richContent])).toEqual([
      [q.options[1].id, optionRich('B')],
      [q.options[0].id, optionRich('A')],
    ]);
  });

  it.each(['CREATOR', 'SCHOOL_SCOPE'] as const)(
    'ST08B-REV-01 preserves ordinary legacy question/option replacement with a differing %s boundary',
    async (boundary) => {
      const q = await teacher(() =>
        repository.createQuestionWithOptions({
          schoolId: fixture.school.schoolId,
          assessmentId: graph.assessment.id,
          type: 'MCQ_SINGLE',
          prompt: 'Legacy question',
          points: 1,
          sortOrder: 4,
          required: true,
          options: normalizeQuestionPayload({
            options: [
              { label: 'Legacy A', isCorrect: true },
              { label: 'Legacy B' },
            ],
          }).options!,
        }),
      );
      await prisma.gradeAssessment.update({
        where: { id: q.assessmentId },
        data:
          boundary === 'CREATOR'
            ? { createdById: fixture.actors.otherTeacher.userId }
            : {
                scopeType: 'SCHOOL',
                scopeKey: fixture.school.schoolId,
                classroomId: null,
              },
      });
      const changed = await teacher(() =>
        update(q.id, {
          prompt: 'Updated legacy question',
          options: [
            { label: 'Updated legacy A', isCorrect: true },
            { label: 'Updated legacy B' },
          ],
        }),
      );
      expect(changed.prompt).toBe('Updated legacy question');
      expect(changed.richContent).toBeNull();
      expect(
        changed.options.map((o) => [o.id, o.label, o.richContent]),
      ).toEqual([
        [q.options[0].id, 'Updated legacy A', null],
        [q.options[1].id, 'Updated legacy B', null],
      ]);
    },
  );

  it.each([
    ['question', 'replace'],
    ['question', 'clear'],
    ['option', 'replace'],
    ['option', 'clear'],
  ] as const)(
    'ST08B-REV-01 retains explicit %s %s authorization',
    async (target, operation) => {
      const q = await create(true);
      await prisma.gradeAssessment.update({
        where: { id: q.assessmentId },
        data: { createdById: fixture.actors.otherTeacher.userId },
      });
      const before = await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
        where: { id: q.id },
        include: { options: { orderBy: { id: 'asc' } } },
      });
      await expect(
        teacher(() =>
          update(
            q.id,
            target === 'question'
              ? {
                  richContent:
                    operation === 'clear'
                      ? null
                      : questionRich('Denied replacement'),
                }
              : {
                  options: [
                    {
                      id: q.options[0].id,
                      label: operation === 'clear' ? 'A' : 'Denied replacement',
                      richContent:
                        operation === 'clear'
                          ? null
                          : optionRich('Denied replacement'),
                      isCorrect: true,
                    },
                    { id: q.options[1].id, label: 'B' },
                  ],
                },
          ),
        ),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(
        await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
          where: { id: q.id },
          include: { options: { orderBy: { id: 'asc' } } },
        }),
      ).toEqual(before);
    },
  );

  it.each(['question', 'option'] as const)(
    'ST08B-REV-01 distinguishes stored JSON null from SQL NULL for an implicit %s clear',
    async (target) => {
      const q = await create(true);
      const option = q.options[0];
      await prisma.gradeAssessment.update({
        where: { id: q.assessmentId },
        data: { createdById: fixture.actors.otherTeacher.userId },
      });
      const setNull = (value: typeof Prisma.JsonNull | typeof Prisma.DbNull) =>
        target === 'question'
          ? prisma.gradeAssessmentQuestion.update({
              where: { id: q.id },
              data: { richContent: value },
            })
          : prisma.gradeAssessmentQuestionOption.update({
              where: { id: option.id },
              data: { richContent: value },
            });
      const sqlNull = async () =>
        (target === 'question'
          ? await prisma.$queryRaw<
              Array<{ absent: boolean }>
            >`SELECT rich_content IS NULL AS absent FROM grade_assessment_questions WHERE id=${q.id}::uuid`
          : await prisma.$queryRaw<
              Array<{ absent: boolean }>
            >`SELECT rich_content IS NULL AS absent FROM grade_assessment_question_options WHERE id=${option.id}::uuid`)[0]
          .absent;
      const command =
        target === 'question'
          ? { prompt: 'Changed legacy text' }
          : {
              options: [
                {
                  id: option.id,
                  label: 'Changed legacy text',
                  isCorrect: true,
                },
                { id: q.options[1].id, label: 'B' },
              ],
            };
      await setNull(Prisma.JsonNull);
      await teacher(() => update(q.id, { points: 2 }));
      expect(await sqlNull()).toBe(false);
      const before = await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
        where: { id: q.id },
        include: { options: { orderBy: { id: 'asc' } } },
      });
      await expect(teacher(() => update(q.id, command))).rejects.toMatchObject({
        code: 'not_found',
      });
      expect(await sqlNull()).toBe(false);
      expect(
        await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
          where: { id: q.id },
          include: { options: { orderBy: { id: 'asc' } } },
        }),
      ).toEqual(before);
      await setNull(Prisma.DbNull);
      const changed = await teacher(() => update(q.id, command));
      expect(await sqlNull()).toBe(true);
      expect(
        target === 'question' ? changed.prompt : changed.options[0].label,
      ).toBe('Changed legacy text');
    },
  );

  function latch<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  }
  async function blockedBy(pid: number) {
    const until = Date.now() + 10000;
    while (Date.now() < until) {
      const rows = await prisma.$queryRaw<Array<{ pid: number }>>`
        SELECT pid FROM pg_stat_activity WHERE ${pid}=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'`;
      if (rows.length) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Expected real PostgreSQL assessment lock wait was absent');
  }
  it.each(['question', 'option'] as const)(
    'ST08B-REV-01 rechecks concurrent %s Rich introduction after waiting on the assessment lock',
    async (target) => {
      const q = await create(true);
      await prisma.gradeAssessment.update({
        where: { id: q.assessmentId },
        data: { createdById: fixture.actors.otherTeacher.userId },
      });
      if (target === 'question')
        await prisma.gradeAssessmentQuestion.update({
          where: { id: q.id },
          data: { richContent: Prisma.DbNull },
        });
      else
        await prisma.gradeAssessmentQuestionOption.update({
          where: { id: q.options[0].id },
          data: { richContent: Prisma.DbNull },
        });
      expect(
        await teacher(() => repository.findQuestionByIdWithAssessment(q.id)),
      ).toBeTruthy();
      const ready = latch<number>(),
        release = latch<void>();
      let expected: unknown;
      const blocker = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM grade_assessments WHERE id=${q.assessmentId}::uuid FOR UPDATE`;
          const [connection] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          if (target === 'question')
            await tx.gradeAssessmentQuestion.update({
              where: { id: q.id },
              data: { richContent: questionRich() },
            });
          else
            await tx.gradeAssessmentQuestionOption.update({
              where: { id: q.options[0].id },
              data: { richContent: optionRich('A') },
            });
          expected = await tx.gradeAssessmentQuestion.findUniqueOrThrow({
            where: { id: q.id },
            include: { options: { orderBy: { id: 'asc' } } },
          });
          ready.resolve(connection.pid);
          await release.promise;
        },
        { timeout: 15000 },
      );
      void blocker.catch((error) => ready.reject(error));
      let pending: Promise<unknown> | undefined;
      try {
        const pid = await ready.promise;
        pending = teacher(() =>
          update(
            q.id,
            target === 'question'
              ? {
                  prompt: 'Racing unauthorized clear',
                  metadata: { rejected: true },
                }
              : {
                  options: [
                    {
                      id: q.options[0].id,
                      label: 'Racing unauthorized clear',
                      isCorrect: true,
                      metadata: { rejected: true },
                    },
                    { id: q.options[1].id, label: 'B' },
                  ],
                },
          ),
        ).then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        await blockedBy(pid);
      } finally {
        release.resolve();
        await blocker;
      }
      expect(await pending).toMatchObject({ error: { code: 'not_found' } });
      expect(
        await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
          where: { id: q.id },
          include: { options: { orderBy: { id: 'asc' } } },
        }),
      ).toEqual(expected);
    },
  );

  it('ST08B-REV-01 serializes concurrent owned implicit clears without changing ST07 lock order', async () => {
    const q = await create(true);
    await Promise.all([
      teacher(() => update(q.id, { prompt: 'Concurrent owned question edit' })),
      teacher(() =>
        update(q.id, {
          options: [
            {
              id: q.options[0].id,
              label: 'Concurrent owned option edit',
              isCorrect: true,
            },
            { id: q.options[1].id, label: 'B' },
          ],
        }),
      ),
    ]);
    const row = await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
      where: { id: q.id },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
    expect(row).toMatchObject({
      prompt: 'Concurrent owned question edit',
      richContent: null,
    });
    expect(row.options[0]).toMatchObject({
      id: q.options[0].id,
      label: 'Concurrent owned option edit',
      richContent: null,
    });
    expect(row.options[1]).toMatchObject({
      id: q.options[1].id,
      richContent: optionRich('B'),
    });
  });

  it('persists question/options atomically, preserves identity across reorder and serializes concurrent edits', async () => {
    const q = await create(true);
    const [a, b] = q.options;
    const reordered = await teacher(() =>
      update(q.id, {
        options: [
          { id: b.id, label: 'B', isCorrect: false, sortOrder: 1 },
          { id: a.id, label: 'A', isCorrect: true, sortOrder: 2 },
        ],
      }),
    );
    expect(
      reordered.options.map((o) => [
        o.id,
        o.label,
        presentGradeRichContent(o).richContent,
      ]),
    ).toEqual([
      [b.id, 'B', optionRich('B')],
      [a.id, 'A', optionRich('A')],
    ]);
    await Promise.all([
      teacher(() =>
        update(q.id, { richContent: questionRich('Concurrent question') }),
      ),
      teacher(() =>
        update(q.id, {
          options: [
            {
              id: a.id,
              richContent: optionRich('Updated A'),
              isCorrect: true,
              sortOrder: 1,
            },
            { id: b.id, label: 'B', sortOrder: 2 },
          ],
        }),
      ),
    ]);
    const final = await teacher(() =>
      repository.findQuestionByIdWithAssessment(q.id),
    );
    expect(final?.prompt).toBe('Concurrent question');
    expect(final?.options.map((o) => [o.id, o.label])).toEqual([
      [a.id, 'Updated A'],
      [b.id, 'B'],
    ]);
    expect(final?.options[0].richContent).toEqual(optionRich('Updated A'));
  });
  it('distinguishes SQL NULL, JSON null, invalid and unsupported JSON without rewriting rows', async () => {
    const q = await create(true);
    for (const [value, state] of [
      [Prisma.DbNull, 'absent'],
      [Prisma.JsonNull, 'invalid'],
      [{ contentVersion: 2, kind: 'question' }, 'unsupported'],
      [{ malformed: true }, 'invalid'],
    ] as const) {
      await prisma.gradeAssessmentQuestion.update({
        where: { id: q.id },
        data: { richContent: value },
      });
      await prisma.gradeAssessmentQuestionOption.update({
        where: { id: q.options[0].id },
        data: { richContent: value },
      });
      const read = await teacher(() =>
        repository.findQuestionByIdWithAssessment(q.id),
      );
      expect(gradeRichState(read!)).toBe(state);
      expect(gradeRichState(read!.options[0])).toBe(state);
      expect(presentGradeRichContent(read!)).toEqual({});
      const [stored] = await prisma.$queryRaw<
        Array<{ sqlNull: boolean; value: unknown }>
      >`SELECT rich_content IS NULL AS "sqlNull",rich_content AS value FROM grade_assessment_questions WHERE id=${q.id}::uuid`;
      expect(stored.sqlNull).toBe(state === 'absent');
      if (value !== Prisma.DbNull && value !== Prisma.JsonNull)
        expect(stored.value).toEqual(value);
    }
  });
  it('preserves unrelated/unchanged edits and explicit clear stores SQL NULL while legacy edits clear stale display', async () => {
    const q = await create();
    await teacher(() => update(q.id, { points: 2, prompt: q.prompt }));
    expect(
      (
        await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
          where: { id: q.id },
        })
      ).richContent,
    ).toEqual(questionRich());
    await teacher(() => update(q.id, { richContent: null }));
    let [nullRow] = await prisma.$queryRaw<
      Array<{ absent: boolean; prompt: string }>
    >`SELECT rich_content IS NULL AS absent,prompt FROM grade_assessment_questions WHERE id=${q.id}::uuid`;
    expect(nullRow).toEqual({ absent: true, prompt: q.prompt });
    await teacher(() => update(q.id, { richContent: questionRich() }));
    await teacher(() => update(q.id, { questionTextEn: 'Legacy changed' }));
    [nullRow] = await prisma.$queryRaw<
      Array<{ absent: boolean; prompt: string }>
    >`SELECT rich_content IS NULL AS absent,prompt FROM grade_assessment_questions WHERE id=${q.id}::uuid`;
    expect(nullRow).toEqual({ absent: true, prompt: 'Legacy changed' });
  });
  it('preserves bilingual option display on unchanged legacy input and explicit rich clear', async () => {
    const q = await create(true);
    const bilingual = { ...optionRich('A'), labelAr: doc('أ') };
    await teacher(() =>
      update(q.id, {
        options: [
          { id: q.options[0].id, richContent: bilingual, isCorrect: true },
          { id: q.options[1].id, label: 'B' },
        ],
      }),
    );
    const same = await teacher(() =>
      update(q.id, {
        options: [
          { id: q.options[0].id, textEn: 'A', isCorrect: true },
          { id: q.options[1].id, label: 'B' },
        ],
      }),
    );
    expect(same.options[0]).toMatchObject({
      label: 'A',
      labelAr: 'أ',
      richContent: bilingual,
    });
    const cleared = await teacher(() =>
      update(q.id, {
        options: [
          {
            id: q.options[0].id,
            label: 'A',
            richContent: null,
            isCorrect: true,
          },
          { id: q.options[1].id, label: 'B' },
        ],
      }),
    );
    expect(cleared.options[0]).toMatchObject({
      label: 'A',
      labelAr: 'أ',
      richContent: null,
    });
    expect(gradeRichState(cleared.options[0])).toBe('absent');
  });
  it.each([
    'foreign',
    'crossSchool',
    'retired',
    'duplicate',
    'ambiguous',
  ] as const)('rejects %s option identity atomically', async (kind) => {
    const q = await create(true),
      [a, b] = q.options;
    let id = a.id;
    if (kind === 'foreign')
      id = (
        await prisma.gradeAssessmentQuestionOption.create({
          data: {
            schoolId: q.schoolId,
            assessmentId: q.assessmentId,
            questionId: graph.questions[0].id,
            label: 'Foreign',
            isCorrect: true,
            sortOrder: 1,
          },
        })
      ).id;
    if (kind === 'crossSchool') {
      const foreign = await fixture.gradeGraph('foreignTeacher');
      id = (
        await prisma.gradeAssessmentQuestionOption.create({
          data: {
            schoolId: foreign.assessment.schoolId,
            assessmentId: foreign.assessment.id,
            questionId: foreign.questions[0].id,
            label: 'Foreign School',
            isCorrect: true,
            sortOrder: 1,
          },
        })
      ).id;
    }
    if (kind === 'retired') {
      await prisma.gradeAssessmentQuestionOption.update({
        where: { id: a.id },
        data: { deletedAt: new Date() },
      });
    }
    const before = await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
      where: { id: q.id },
      include: { options: { orderBy: { id: 'asc' } } },
    });
    await expect(
      teacher(() =>
        update(q.id, {
          prompt: 'Must roll back',
          options: [
            {
              ...(kind === 'ambiguous' ? {} : { id }),
              label: 'A',
              isCorrect: true,
              sortOrder: 1,
            },
            {
              id: kind === 'duplicate' ? a.id : b.id,
              label: 'B',
              sortOrder: 2,
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      code:
        kind === 'foreign' || kind === 'crossSchool' || kind === 'retired'
          ? 'not_found'
          : 'validation.failed',
    });
    expect(
      await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
        where: { id: q.id },
        include: { options: { orderBy: { id: 'asc' } } },
      }),
    ).toEqual(before);
  });
  it('resolves exact question assets and withholds retired references; invalid asset writes roll back legacy and AST', async () => {
    const q = await create();
    const binding = await teacher(() =>
      assets.create(
        { surface: 'teacher', classId: fixture.allocations.teacher },
        { assessmentId: q.assessmentId, questionId: q.id },
        {
          sourceType: 'EXTERNAL_HTTPS',
          externalUrl: 'https://media.example.org/reference.txt',
          title: null,
          description: null,
          category: 'OTHER',
        },
      ),
    );
    const content = assetRich(binding.asset.id);
    const result = await teacher(() => update(q.id, { richContent: content }));
    expect(presentGradeRichContent(result).richContent).toEqual(content);
    for (const bad of [
      assetRich(graph.questions[0].id),
      assetRich(binding.asset.id, 'image'),
    ])
      await expect(
        teacher(() => update(q.id, { richContent: bad })),
      ).rejects.toMatchObject({ code: 'not_found' });
    expect(
      (
        await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
          where: { id: q.id },
        })
      ).richContent,
    ).toEqual(content);
    await prisma.gradeAssessmentQuestionAsset.update({
      where: { id: binding.asset.id },
      data: { deletedAt: new Date() },
    });
    const read = await teacher(() =>
      repository.findQuestionByIdWithAssessment(q.id),
    );
    expect(presentGradeRichContent(read!)).toEqual({});
    expect(read?.prompt).toBe('[Reference]');
  });
  it('requires genuine READY provenance and exact question/option/category for managed references', async () => {
    const q = await create(true);
    const ready = await fixture.readyGrade(q.assessmentId);
    const binding = await teacher(() =>
      assets.create(
        { surface: 'teacher', classId: fixture.allocations.teacher },
        { assessmentId: q.assessmentId, questionId: q.id },
        {
          sourceType: 'MANAGED_FILE',
          fileId: ready.fileId,
          uploadId: ready.uploadId,
          title: null,
          description: null,
        },
      ),
    );
    const content = {
      contentVersion: 1,
      kind: 'option',
      label: assetRich(binding.asset.id, 'document').stem,
    };
    const patched = await teacher(() =>
      update(q.id, {
        options: [
          { id: q.options[0].id, richContent: content, isCorrect: true },
          { id: q.options[1].id, label: 'B' },
        ],
      }),
    );
    expect(presentGradeRichContent(patched.options[0]).richContent).toEqual(
      content,
    );
    await expect(
      teacher(() =>
        update(graph.questions[0].id, {
          richContent: assetRich(binding.asset.id, 'document'),
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      teacher(() => update(q.id, { richContent: assetRich(ready.fileId) })),
    ).rejects.toMatchObject({ code: 'not_found' });
    await prisma.file.update({
      where: { id: ready.fileId },
      data: { deletedAt: new Date() },
    });
    await expect(
      teacher(() =>
        update(q.id, { richContent: assetRich(binding.asset.id, 'document') }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    const read = await teacher(() =>
      repository.findQuestionByIdWithAssessment(q.id),
    );
    expect(presentGradeRichContent(read!.options[0])).toEqual({});
    expect(read!.options[0].label).toBe('[Reference]');
  });
  it('preserves legacy option replacement and rejects revoked permission after a successful read', async () => {
    const q = await teacher(() =>
      repository.createQuestionWithOptions({
        schoolId: fixture.school.schoolId,
        assessmentId: graph.assessment.id,
        type: 'MCQ_SINGLE',
        prompt: 'Legacy question',
        points: 1,
        sortOrder: 4,
        required: true,
        options: normalizeQuestionPayload({
          options: [{ label: 'Old A', isCorrect: true }, { label: 'Old B' }],
        }).options!,
      }),
    );
    const replaced = await teacher(() =>
      update(q.id, {
        options: [{ label: 'New A', isCorrect: true }, { label: 'New B' }],
      }),
    );
    expect(replaced.options.map((o) => o.id)).toEqual(
      q.options.map((o) => o.id),
    );
    expect(replaced.options.every((o) => o.richContent === null)).toBe(true);
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'grades.questions.manage' },
    });
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: fixture.actors.teacher.roleId,
        permissionId: permission.id,
      },
    });
    await expect(
      teacher(() => update(q.id, { richContent: questionRich('Denied') })),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(
      (
        await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
          where: { id: q.id },
        })
      ).prompt,
    ).toBe('Legacy question');
  });
  it.each(['otherTeacher', 'foreignTeacher'] as const)(
    'denies %s tenant/allocation ownership',
    async (actor) => {
      const q = await create();
      await expect(
        fixture.asMediaActor(actor, () =>
          update(q.id, { richContent: questionRich('Unauthorized') }),
        ),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(
        (
          await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
            where: { id: q.id },
          })
        ).prompt,
      ).toBe(q.prompt);
    },
  );
  it.each([
    'PUBLISHED',
    'LOCKED',
    'SUBMISSION',
    'MEMBERSHIP',
    'ALLOCATION',
    'CREATOR',
    'SCOPE',
    'TERM',
    'YEAR',
  ] as const)(
    'revalidates %s at final mutation after successful read',
    async (state) => {
      const q = await create();
      expect(
        await teacher(() => repository.findQuestionByIdWithAssessment(q.id)),
      ).toBeTruthy();
      if (state === 'PUBLISHED')
        await prisma.gradeAssessment.update({
          where: { id: q.assessmentId },
          data: { approvalStatus: 'PUBLISHED' },
        });
      if (state === 'LOCKED')
        await prisma.gradeAssessment.update({
          where: { id: q.assessmentId },
          data: { lockedAt: new Date() },
        });
      if (state === 'SUBMISSION')
        await prisma.gradeSubmission.create({
          data: {
            schoolId: q.schoolId,
            assessmentId: q.assessmentId,
            termId: fixture.school.termId,
            studentId: fixture.children[0].studentId,
            enrollmentId: fixture.children[0].enrollmentId,
            status: 'IN_PROGRESS',
          },
        });
      if (state === 'MEMBERSHIP')
        await prisma.membership.update({
          where: { id: fixture.actors.teacher.membershipId },
          data: { status: 'INACTIVE', endedAt: new Date() },
        });
      if (state === 'ALLOCATION')
        await prisma.teacherSubjectAllocation.update({
          where: { id: fixture.allocations.teacher },
          data: { teacherUserId: fixture.actors.otherTeacher.userId },
        });
      if (state === 'CREATOR')
        await prisma.gradeAssessment.update({
          where: { id: q.assessmentId },
          data: { createdById: fixture.actors.otherTeacher.userId },
        });
      if (state === 'SCOPE')
        await prisma.gradeAssessment.update({
          where: { id: q.assessmentId },
          data: {
            scopeType: 'SCHOOL',
            scopeKey: fixture.school.schoolId,
            classroomId: null,
          },
        });
      if (state === 'TERM')
        await prisma.term.update({
          where: { id: fixture.school.termId },
          data: { isActive: false },
        });
      if (state === 'YEAR')
        await prisma.academicYear.update({
          where: { id: fixture.school.yearId },
          data: { deletedAt: new Date() },
        });
      await expect(
        teacher(() =>
          update(q.id, { richContent: questionRich('Unauthorized') }),
        ),
      ).rejects.toMatchObject({
        code:
          state === 'PUBLISHED'
            ? 'grades.assessment.invalid_status_transition'
            : state === 'LOCKED'
              ? 'grades.assessment.locked'
              : state === 'SUBMISSION'
                ? 'grades.question.structure_locked'
                : state === 'TERM'
                  ? 'grades.term.closed'
                  : 'not_found',
      });
      expect(
        (
          await prisma.gradeAssessmentQuestion.findUniqueOrThrow({
            where: { id: q.id },
          })
        ).prompt,
      ).toBe(q.prompt);
    },
  );
  it('preserves distinct Student Exams and Grades audiences and rejects stale term context', async () => {
    const q = await create(true);
    await prisma.gradeAssessment.update({
      where: { id: q.assessmentId },
      data: { approvalStatus: 'PUBLISHED', type: 'ASSIGNMENT' },
    });
    const access = new StudentAppAccessService(
      new StudentAppStudentReadAdapter(prisma),
    );
    const exams = new StudentExamsReadAdapter(prisma, assets),
      grades = new StudentGradesReadAdapter(prisma, assets);
    await fixture.asMediaActor('student', async () => {
      const context = await access.getStudentAppContext();
      expect(
        await exams.findExam({ context, assessmentId: q.assessmentId }),
      ).toBeNull();
      const grade = await grades.findAssessmentGrade({
        context,
        assessmentId: q.assessmentId,
      });
      expect(
        presentGradeRichContent(
          grade!.assessment.questions.find((row) => row.id === q.id)!,
        ),
      ).toEqual({ richContent: questionRich() });
      await prisma.enrollment.update({
        where: { id: context.enrollmentId },
        data: { termId: null },
      });
      await expect(
        grades.findAssessmentGrade({ context, assessmentId: q.assessmentId }),
      ).rejects.toMatchObject({ code: 'not_found' });
    });
  });
});
