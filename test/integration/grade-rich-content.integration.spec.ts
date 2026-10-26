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
