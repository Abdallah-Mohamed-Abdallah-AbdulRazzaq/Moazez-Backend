import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { PersistedUrlPolicy } from '../../src/infrastructure/storage/provider-url.policy';
import { PrismaTeacherAllocationOperationalWriteGate } from '../../src/modules/academics/teacher-allocation/infrastructure/prisma-teacher-allocation-operational-write-gate';
import { AssessmentMediaRuntimePolicy } from '../../src/modules/files/assessment-media/application/assessment-media-runtime.policy';
import { AuthRepository } from '../../src/modules/iam/auth/infrastructure/auth.repository';
import { HomeworkRepository } from '../../src/modules/homework/infrastructure/homework.repository';
import { HomeworkQuestionAssetsRepository } from '../../src/modules/homework/infrastructure/homework-question-assets.repository';
import { HomeworkRichContentService } from '../../src/modules/homework/application/homework-rich-content.service';
import {
  CreateHomeworkQuestionUseCase,
  UpdateHomeworkQuestionUseCase,
  CreateHomeworkQuestionOptionUseCase,
  UpdateHomeworkQuestionOptionUseCase,
  ReorderHomeworkQuestionOptionUseCase,
  DeleteHomeworkQuestionOptionUseCase,
} from '../../src/modules/homework/application/homework-questions.use-cases';
import {
  CreateHomeworkQuestionDto,
  CreateHomeworkQuestionOptionDto,
  UpdateHomeworkQuestionDto,
  UpdateHomeworkQuestionOptionDto,
} from '../../src/modules/homework/dto/homework-question.dto';
import {
  presentHomeworkRichContent,
  homeworkRichState,
} from '../../src/modules/homework/infrastructure/homework-rich-content.projection';
import { richContentFallback } from '../../src/common/rich-content/rich-content.compatibility';
import { normalizeRichContent } from '../../src/common/rich-content/rich-content.validation';
import { GradeAssetsFixture } from '../fixtures/grade-assets.fixture';
import { GradeAssetsRepository } from '../../src/modules/grades/assessments/infrastructure/grade-assets.repository';
import { GradesAssessmentQuestionsRepository } from '../../src/modules/grades/assessments/infrastructure/grades-assessment-questions.repository';
import { normalizeQuestionPayload } from '../../src/modules/grades/assessments/domain/grade-question-domain';
import {
  presentGradeRichContent,
  gradeRichState,
} from '../../src/modules/grades/assessments/infrastructure/grade-rich-content.projection';

const doc = (text: string) => ({
  language: 'und',
  direction: 'auto',
  blocks: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
});
const questionRich = (text = 'Question') =>
  normalizeRichContent({
    contentVersion: 1,
    kind: 'question',
    stem: doc(text),
  });
const optionRich = (text = 'Option') =>
  normalizeRichContent({ contentVersion: 1, kind: 'option', label: doc(text) });
const embedded = (assetId: string, kind = 'document', option = false) =>
  normalizeRichContent({
    contentVersion: 1,
    kind: option ? 'option' : 'question',
    [option ? 'label' : 'stem']: {
      ...doc(''),
      blocks: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'assetReference',
              assetId,
              kind,
              altText: 'Owned reference',
              caption: 'Caption',
            },
          ],
        },
      ],
    },
  });

describe('ST08-C real PostgreSQL Homework Rich transactions and cross-domain isolation', () => {
  jest.setTimeout(120000);
  const prisma = new PrismaService();
  let fixture: GradeAssetsFixture;
  let graph: Awaited<ReturnType<GradeAssetsFixture['graph']>>;
  let repository: HomeworkRepository;
  let rich: HomeworkRichContentService;
  let assets: HomeworkQuestionAssetsRepository;
  const gate = new PrismaTeacherAllocationOperationalWriteGate();
  const actor = () => ({
    surface: 'teacher' as const,
    classId: fixture.allocations.teacher,
  });
  const teacher = <T>(operation: () => Promise<T>) =>
    fixture.asMediaActor('teacher', operation);
  const resource = (questionId = graph.questions[0].id) => ({
    homeworkId: graph.homework.id,
    questionId,
  });
  const auth = () => new AuthRepository(prisma);
  const create = async () => {
    const response = await teacher(() =>
      new CreateHomeworkQuestionUseCase(repository, auth()).execute(
        graph.homework.id,
        plainToInstance(CreateHomeworkQuestionDto, {
          type: 'SINGLE_CHOICE',
          richContent: questionRich(),
          points: 2,
          metadata: { question: 'kept' },
          options: [
            {
              richContent: optionRich('A'),
              isCorrect: true,
              metadata: { option: 'kept' },
            },
            { richContent: optionRich('B'), isCorrect: false },
          ],
        }),
        actor(),
      ),
    );
    return teacher(() =>
      repository.findQuestionById(resource(response.question.questionId)),
    ).then((q) => {
      if (!q) throw new Error('Created question absent');
      return q;
    });
  };
  const snapshot = (questionId: string) =>
    prisma.homeworkQuestion.findUniqueOrThrow({
      where: { id: questionId },
      include: { options: { orderBy: { id: 'asc' } } },
    });
  const update = (
    target: 'question' | 'option',
    q: Awaited<ReturnType<typeof create>>,
    explicit: boolean,
  ) =>
    teacher(() =>
      target === 'question'
        ? repository.updateQuestion({
            ...resource(q.id),
            actor: actor(),
            data: explicit
              ? {
                  richContent: questionRich('Changed'),
                  metadata: { attempted: true },
                }
              : { prompt: 'Changed', metadata: { attempted: true } },
          })
        : repository.updateQuestionOption({
            ...resource(q.id),
            optionId: q.options[0].id,
            actor: actor(),
            data: explicit
              ? { richContent: optionRich('Changed'), isCorrect: false }
              : { text: 'Changed', isCorrect: false },
          }),
    );
  const project = async (q: Awaited<ReturnType<typeof create>>) => {
    await teacher(() =>
      repository.projectRichQuestions(
        graph.homework.id,
        [q],
        'question',
        actor(),
      ),
    );
    return q;
  };
  beforeAll(async () => {
    fixture = new GradeAssetsFixture(prisma);
    await prisma.$connect();
  });
  beforeEach(async () => {
    fixture = new GradeAssetsFixture(prisma);
    await fixture.create();
    graph = await fixture.graph();
    const urls = new PersistedUrlPolicy({
      s3CompatibleEndpoints: [
        fixture.config.getOrThrow<string>('STORAGE_ENDPOINT'),
      ],
    });
    assets = new HomeworkQuestionAssetsRepository(
      prisma,
      gate,
      fixture.repository,
      new AssessmentMediaRuntimePolicy(fixture.config),
      fixture.storage,
      urls,
    );
    rich = new HomeworkRichContentService(prisma, gate, assets);
    repository = new HomeworkRepository(prisma, gate, rich);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture.dispose();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists Rich-only question/options and generated fallback atomically with actual UUIDs and audit', async () => {
    const q = await project(await create());
    expect(q.prompt).toBe('Question');
    expect(q.richContent).toEqual(questionRich());
    expect(q.options.map((o) => o.text)).toEqual(['A', 'B']);
    expect(new Set(q.options.map((o) => o.id)).size).toBe(2);
    expect(q.options.every((o) => o.homeworkQuestionId === q.id)).toBe(true);
    expect(presentHomeworkRichContent(q)).toEqual({
      richContent: questionRich(),
    });
    expect(presentHomeworkRichContent(q.options[0])).toEqual({
      richContent: optionRich('A'),
    });
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: q.id,
          action: 'homework.question.create',
          actorId: fixture.actors.teacher.userId,
        },
      }),
    ).toBe(1);
  });
  it('replaces, preserves and clears question instructions as one envelope without changing answers or metadata', async () => {
    const q = await create();
    const richContent = normalizeRichContent({
      ...questionRich('Replacement'),
      instructions: doc('Instructions'),
    });
    await teacher(() =>
      new UpdateHomeworkQuestionUseCase(repository, auth()).execute(
        graph.homework.id,
        q.id,
        plainToInstance(UpdateHomeworkQuestionDto, { richContent }),
        actor(),
      ),
    );
    let current = await snapshot(q.id);
    expect(current).toMatchObject({
      prompt: 'Replacement',
      instructions: 'Instructions',
      metadata: { question: 'kept' },
      points: new Prisma.Decimal(2),
    });
    await teacher(() =>
      repository.updateQuestion({
        ...resource(q.id),
        actor: actor(),
        data: {
          prompt: 'Replacement',
          instructions: 'Instructions',
          isRequired: false,
        },
      }),
    );
    expect((await snapshot(q.id)).richContent).toEqual(richContent);
    await teacher(() =>
      repository.updateQuestion({
        ...resource(q.id),
        actor: actor(),
        data: { instructions: 'Genuine edit' },
      }),
    );
    current = await snapshot(q.id);
    expect(current.richContent).toBeNull();
    expect(current.prompt).toBe('Replacement');
    expect(
      current.options.map((o) => [o.id, o.text, o.isCorrect]).sort(),
    ).toEqual(q.options.map((o) => [o.id, o.text, o.isCorrect]).sort());
  });
  it('uses exact independent option UUIDs through create/update/reorder/retirement and preserves correctness/metadata', async () => {
    const q = await create();
    const first = q.options[0];
    await teacher(() =>
      new UpdateHomeworkQuestionOptionUseCase(repository, auth()).execute(
        graph.homework.id,
        q.id,
        first.id,
        plainToInstance(UpdateHomeworkQuestionOptionDto, {
          richContent: optionRich('New A'),
        }),
        actor(),
      ),
    );
    await teacher(() =>
      new ReorderHomeworkQuestionOptionUseCase(repository, auth()).execute(
        graph.homework.id,
        q.id,
        first.id,
        { sortOrder: 9 },
        actor(),
      ),
    );
    let row = await prisma.homeworkQuestionOption.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(row).toMatchObject({
      homeworkQuestionId: q.id,
      text: 'New A',
      isCorrect: true,
      sortOrder: 9,
      metadata: { option: 'kept' },
      richContent: optionRich('New A'),
    });
    await teacher(() =>
      new CreateHomeworkQuestionOptionUseCase(repository, auth()).execute(
        graph.homework.id,
        q.id,
        plainToInstance(CreateHomeworkQuestionOptionDto, {
          richContent: optionRich('C'),
        }),
        actor(),
      ),
    );
    const options = await prisma.homeworkQuestionOption.findMany({
      where: { homeworkQuestionId: q.id },
      orderBy: { id: 'asc' },
    });
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.id)).toEqual(
      expect.arrayContaining(q.options.map((o) => o.id)),
    );
    await teacher(() =>
      new DeleteHomeworkQuestionOptionUseCase(repository, auth()).execute(
        graph.homework.id,
        q.id,
        first.id,
        actor(),
      ),
    );
    row = await prisma.homeworkQuestionOption.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(row.deletedAt).not.toBeNull();
    expect(row.richContent).toEqual(optionRich('New A'));
    expect(
      (
        await teacher(() => repository.findQuestionById(resource(q.id)))
      )?.options.map((o) => o.id),
    ).not.toContain(first.id);
  });
  it.each(['question', 'option'] as const)(
    'stores explicit %s clear as SQL NULL, not JSON null',
    async (target) => {
      const q = await create();
      if (target === 'question')
        await teacher(() =>
          repository.updateQuestion({
            ...resource(q.id),
            actor: actor(),
            data: { richContent: null },
          }),
        );
      else
        await teacher(() =>
          repository.updateQuestionOption({
            ...resource(q.id),
            optionId: q.options[0].id,
            actor: actor(),
            data: { richContent: null },
          }),
        );
      const rows =
        target === 'question'
          ? await prisma.$queryRaw<
              Array<{ absent: boolean }>
            >`SELECT rich_content IS NULL AS absent FROM homework_questions WHERE id = ${q.id}::uuid`
          : await prisma.$queryRaw<
              Array<{ absent: boolean }>
            >`SELECT rich_content IS NULL AS absent FROM homework_question_options WHERE id = ${q.options[0].id}::uuid`;
      expect(rows).toEqual([{ absent: true }]);
      const current = await project(
        (await teacher(() => repository.findQuestionById(resource(q.id))))!,
      );
      expect(
        homeworkRichState(target === 'question' ? current : current.options[0]),
      ).toBe('absent');
    },
  );
  it.each(['question', 'option'] as const)(
    'classifies stored %s JSON null separately and protects its implicit clear',
    async (target) => {
      const q = await create();
      if (target === 'question')
        await prisma.homeworkQuestion.update({
          where: { id: q.id },
          data: { richContent: Prisma.JsonNull },
        });
      else
        await prisma.homeworkQuestionOption.update({
          where: { id: q.options[0].id },
          data: { richContent: Prisma.JsonNull },
        });
      const current = await project(
        (await teacher(() => repository.findQuestionById(resource(q.id))))!,
      );
      expect(
        homeworkRichState(target === 'question' ? current : current.options[0]),
      ).toBe('invalid');
      const before = await snapshot(q.id);
      await revoke('permission');
      await expect(update(target, q, false)).rejects.toMatchObject({
        code: 'not_found',
      });
      expect(await snapshot(q.id)).toEqual(before);
    },
  );
  it.each(['membership', 'permission', 'allocation'] as const)(
    'rejects explicit and implicit question/option changes after previously authorized read and %s revocation',
    async (reason) => {
      const q = await create();
      expect(
        await teacher(() => repository.findQuestionById(resource(q.id))),
      ).not.toBeNull();
      const before = await snapshot(q.id);
      await revoke(reason);
      for (const target of ['question', 'option'] as const)
        for (const explicit of [true, false]) {
          await expect(update(target, q, explicit)).rejects.toMatchObject({
            code: 'not_found',
          });
          expect(await snapshot(q.id)).toEqual(before);
        }
    },
  );
  it('keeps SQL-null legacy editing behavior when no protected Rich mutation occurs', async () => {
    const q = graph.questions[0];
    await revoke('permission');
    await teacher(() =>
      repository.updateQuestion({
        ...resource(q.id),
        data: { prompt: 'Legacy compatibility' },
      }),
    );
    expect((await snapshot(q.id)).prompt).toBe('Legacy compatibility');
  });
  it('preserves unrelated and unchanged display updates on existing Rich rows under ordinary authorization', async () => {
    const q = await create();
    await revoke('permission');
    await teacher(() =>
      repository.updateQuestion({
        ...resource(q.id),
        data: {
          prompt: q.prompt,
          instructions: q.instructions,
          points: new Prisma.Decimal(4),
          metadata: { changed: true },
        },
      }),
    );
    await teacher(() =>
      repository.updateQuestionOption({
        ...resource(q.id),
        optionId: q.options[0].id,
        data: { text: q.options[0].text, sortOrder: 7, isCorrect: false },
      }),
    );
    const current = await snapshot(q.id);
    expect(current.richContent).toEqual(q.richContent);
    expect(
      current.options.find((o) => o.id === q.options[0].id)?.richContent,
    ).toEqual(q.options[0].richContent);
  });
  it.each(['otherTeacher', 'foreignTeacher'] as const)(
    'denies %s Rich writes without changing any question/option field',
    async (name) => {
      const q = await create(),
        before = await snapshot(q.id);
      await expect(
        fixture.asMediaActor(name, () =>
          repository.updateQuestion({
            ...resource(q.id),
            data: { richContent: questionRich('Forbidden') },
            actor: { surface: 'teacher', classId: fixture.allocations[name] },
          }),
        ),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(await snapshot(q.id)).toEqual(before);
    },
  );
  it('denies a wrong route allocation even when the Teacher owns the actual assignment', async () => {
    const q = await create(),
      before = await snapshot(q.id);
    await expect(
      teacher(() =>
        repository.updateQuestion({
          ...resource(q.id),
          actor: {
            surface: 'teacher',
            classId: fixture.allocations.otherTeacher,
          },
          data: { richContent: questionRich('Wrong route') },
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await snapshot(q.id)).toEqual(before);
  });
  it.each(['foreign', 'retired'] as const)(
    'rejects a %s option identity atomically',
    async (mode) => {
      const q = await create(),
        other = await create();
      const id = mode === 'foreign' ? other.options[0].id : q.options[0].id;
      if (mode === 'retired')
        await prisma.homeworkQuestionOption.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
      const before = await snapshot(q.id);
      await expect(
        teacher(() =>
          repository.updateQuestionOption({
            ...resource(q.id),
            optionId: id,
            actor: actor(),
            data: { richContent: optionRich('Not permitted') },
          }),
        ),
      ).rejects.toMatchObject({ code: 'homework.question.option_not_found' });
      expect(await snapshot(q.id)).toEqual(before);
    },
  );
  it('withholds stored future/invalid/mismatched data without repairing or backfilling rows', async () => {
    const q = await create();
    for (const value of [
      { ...questionRich(), contentVersion: 2 },
      { arbitrary: '<script>' },
      questionRich('Mismatched'),
    ]) {
      await prisma.homeworkQuestion.update({
        where: { id: q.id },
        data: { richContent: value as Prisma.InputJsonValue },
      });
      const before = await snapshot(q.id);
      const current = await project(
        (await teacher(() => repository.findQuestionById(resource(q.id))))!,
      );
      expect(presentHomeworkRichContent(current)).toEqual({});
      expect(await snapshot(q.id)).toEqual(before);
    }
  });
  it('rejects invalid/contradictory Rich data before a coupled write and preserves the full snapshot', async () => {
    const q = await create(),
      before = await snapshot(q.id);
    await expect(
      teacher(() =>
        new UpdateHomeworkQuestionUseCase(repository, auth()).execute(
          graph.homework.id,
          q.id,
          plainToInstance(UpdateHomeworkQuestionDto, {
            prompt: 'Contradiction',
            richContent: questionRich(),
            metadata: { attempted: true },
          }),
          actor(),
        ),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(await snapshot(q.id)).toEqual(before);
  });

  async function managed(questionId: string) {
    const ready = await fixture.ready(graph.homework.id);
    const view = await teacher(() =>
      assets.create(actor(), resource(questionId), {
        sourceType: 'MANAGED_FILE',
        fileId: ready.fileId,
        uploadId: ready.uploadId,
        title: null,
        description: null,
      }),
    );
    return { ready, view };
  }
  it('validates genuine READY managed question assets on exact question and independent option Rich content', async () => {
    const q = await create(),
      { view } = await managed(q.id);
    const richContent = embedded(view.asset.id);
    await teacher(() =>
      repository.updateQuestion({
        ...resource(q.id),
        actor: actor(),
        data: { richContent },
      }),
    );
    await teacher(() =>
      repository.updateQuestionOption({
        ...resource(q.id),
        optionId: q.options[0].id,
        actor: actor(),
        data: { richContent: embedded(view.asset.id, 'document', true) },
      }),
    );
    const current = await project(
      (await teacher(() => repository.findQuestionById(resource(q.id))))!,
    );
    expect(presentHomeworkRichContent(current)).toEqual({ richContent });
    expect(presentHomeworkRichContent(current.options[0])).toHaveProperty(
      'richContent',
    );
  });
  it.each([
    'raw-file',
    'upload',
    'other-question',
    'wrong-kind',
    'external',
  ] as const)(
    'rejects %s substitution and rolls back Rich plus legacy fields',
    async (mode) => {
      const q = await create();
      const { ready, view } = await managed(
        mode === 'other-question' ? graph.questions[1].id : q.id,
      );
      let id =
        mode === 'raw-file'
          ? ready.fileId
          : mode === 'upload'
            ? ready.uploadId
            : view.asset.id;
      if (mode === 'external')
        id = (
          await teacher(() =>
            assets.create(actor(), resource(q.id), {
              sourceType: 'EXTERNAL_HTTPS',
              externalUrl: 'https://media.example.org/reference.txt',
              title: null,
              description: null,
            }),
          )
        ).asset.id;
      const before = await snapshot(q.id);
      await expect(
        teacher(() =>
          repository.updateQuestion({
            ...resource(q.id),
            actor: actor(),
            data: {
              richContent: embedded(
                id,
                mode === 'wrong-kind' ? 'image' : 'document',
              ),
              metadata: { attempted: true },
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(await snapshot(q.id)).toEqual(before);
    },
  );
  it.each(['asset', 'file', 'provenance', 'policy'] as const)(
    'withholds a stale %s reference and rejects reuse without rewriting historical AST',
    async (mode) => {
      const q = await create(),
        { ready, view } = await managed(q.id);
      await teacher(() =>
        repository.updateQuestion({
          ...resource(q.id),
          actor: actor(),
          data: { richContent: embedded(view.asset.id) },
        }),
      );
      if (mode === 'asset')
        await prisma.homeworkQuestionAsset.update({
          where: { id: view.asset.id },
          data: { deletedAt: new Date() },
        });
      if (mode === 'file')
        await prisma.file.update({
          where: { id: ready.fileId },
          data: { deletedAt: new Date() },
        });
      if (mode === 'provenance')
        await prisma.file.update({
          where: { id: ready.fileId },
          data: { checksumSha256: 'b'.repeat(64) },
        });
      if (mode === 'policy')
        await prisma.schoolAssessmentMediaPolicy.update({
          where: { schoolId: fixture.school.schoolId },
          data: { allowInlinePreview: false, allowDownload: false },
        });
      const before = await snapshot(q.id);
      expect(
        presentHomeworkRichContent(
          await project(
            (await teacher(() => repository.findQuestionById(resource(q.id))))!,
          ),
        ),
      ).toEqual({});
      await expect(
        teacher(() =>
          repository.updateQuestionOption({
            ...resource(q.id),
            optionId: q.options[0].id,
            actor: actor(),
            data: { richContent: embedded(view.asset.id, 'document', true) },
          }),
        ),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(await snapshot(q.id)).toEqual(before);
    },
  );
  it('keeps Homework/Grades JSONB, option identities, null semantics and asset authority separate', async () => {
    const q = await create(),
      bound = await managed(q.id),
      gradeGraph = await fixture.gradeGraph();
    const gradeAssets = new GradeAssetsRepository(
      prisma,
      gate,
      fixture.repository,
      new AssessmentMediaRuntimePolicy(fixture.config),
      fixture.config,
      new PersistedUrlPolicy({
        s3CompatibleEndpoints: [
          fixture.config.getOrThrow<string>('STORAGE_ENDPOINT'),
        ],
      }),
    );
    const grades = new GradesAssessmentQuestionsRepository(prisma, gradeAssets);
    const data = normalizeQuestionPayload(
      { type: 'ESSAY', points: 1, richContent: questionRich() },
      { requirePrompt: true },
    );
    // Cross-domain Grades persistence uses the authorized Core management path.
    const g = await fixture.asMediaActor('admin', () =>
      grades.createQuestionWithOptions({
        schoolId: fixture.school.schoolId,
        assessmentId: gradeGraph.assessment.id,
        type: data.type!,
        prompt: data.prompt!,
        richContent: data.richContent,
        points: 1,
        sortOrder: 4,
        required: true,
        options: data.options ?? [],
      }),
    );
    expect(g.richContent).toEqual(q.richContent);
    expect(presentGradeRichContent(g)).toHaveProperty('richContent');
    const gradeReady = await fixture.readyGrade(gradeGraph.assessment.id);
    const gradeBound = await teacher(() =>
      gradeAssets.create(
        actor(),
        { assessmentId: gradeGraph.assessment.id, questionId: g.id },
        {
          sourceType: 'MANAGED_FILE',
          fileId: gradeReady.fileId,
          uploadId: gradeReady.uploadId,
          title: null,
          description: null,
        },
      ),
    );
    const before = await snapshot(q.id);
    await expect(
      teacher(() =>
        repository.updateQuestion({
          ...resource(q.id),
          actor: actor(),
          data: { richContent: embedded(gradeBound.asset.id) },
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await snapshot(q.id)).toEqual(before);
    await expect(
      teacher(() =>
        grades.updateQuestionAndReplaceOptions(g.id, {
          data: normalizeQuestionPayload({
            richContent: embedded(bound.view.asset.id),
          }),
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    await prisma.gradeAssessmentQuestion.update({
      where: { id: g.id },
      data: { richContent: Prisma.JsonNull },
    });
    const invalid = await teacher(() =>
      grades.findQuestionByIdWithAssessment(g.id),
    );
    expect(gradeRichState(invalid!)).toBe('invalid');
    expect(presentGradeRichContent(invalid!)).toEqual({});
    expect((await snapshot(q.id)).richContent).toEqual(q.richContent);
    await prisma.gradeAssessmentQuestion.update({
      where: { id: g.id },
      data: { richContent: Prisma.DbNull },
    });
    expect(
      gradeRichState(
        (await teacher(() => grades.findQuestionByIdWithAssessment(g.id)))!,
      ),
    ).toBe('absent');
  });

  it.each(['assignment', 'school'] as const)(
    'rejects an actually verified asset from another %s',
    async (boundary) => {
      const q = await create();
      const sourceActor = boundary === 'school' ? 'foreignTeacher' : 'teacher';
      const source = await fixture.graph(sourceActor);
      const ready = await fixture.ready(source.homework.id, sourceActor);
      const bound = await fixture.asMediaActor(sourceActor, () =>
        assets.create(
          { surface: 'teacher', classId: fixture.allocations[sourceActor] },
          {
            homeworkId: source.homework.id,
            questionId: source.questions[0].id,
          },
          {
            sourceType: 'MANAGED_FILE',
            fileId: ready.fileId,
            uploadId: ready.uploadId,
            title: null,
            description: null,
          },
        ),
      );
      const before = await snapshot(q.id);
      await expect(
        teacher(() =>
          repository.updateQuestion({
            ...resource(q.id),
            actor: actor(),
            data: { richContent: embedded(bound.asset.id) },
          }),
        ),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(await snapshot(q.id)).toEqual(before);
    },
  );

  it.each(['question', 'option'] as const)(
    'withholds a newer %s AST from a stale selected legacy row without rewriting either version',
    async (target) => {
      const q = await create();
      if (target === 'question')
        await prisma.homeworkQuestion.update({
          where: { id: q.id },
          data: {
            prompt: 'New snapshot',
            richContent: questionRich('New snapshot') as Prisma.InputJsonValue,
          },
        });
      else
        await prisma.homeworkQuestionOption.update({
          where: { id: q.options[0].id },
          data: {
            text: 'New option snapshot',
            richContent: optionRich(
              'New option snapshot',
            ) as Prisma.InputJsonValue,
          },
        });
      const before = await snapshot(q.id);
      await project(q);
      expect(
        presentHomeworkRichContent(target === 'question' ? q : q.options[0]),
      ).toEqual({});
      expect(await snapshot(q.id)).toEqual(before);
    },
  );

  async function revoke(reason: 'membership' | 'permission' | 'allocation') {
    if (reason === 'membership')
      await prisma.membership.update({
        where: { id: fixture.actors.teacher.membershipId },
        data: { endedAt: new Date() },
      });
    if (reason === 'permission')
      await prisma.rolePermission.deleteMany({
        where: {
          roleId: fixture.actors.teacher.roleId,
          permission: { code: 'homework.questions.manage' },
        },
      });
    if (reason === 'allocation')
      await prisma.teacherSubjectAllocation.update({
        where: { id: fixture.allocations.teacher },
        data: { teacherUserId: fixture.actors.otherTeacher.userId },
      });
  }
  function latch<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }
  async function blockedBy(pid: number) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<
        Array<{ pid: number }>
      >`SELECT pid FROM pg_stat_activity WHERE ${pid}=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'`;
      if (rows.length) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Expected real PostgreSQL lock wait was not observed');
  }
  it.each(['membership', 'permission', 'allocation'] as const)(
    'observes and rejects a concurrent %s revocation that wins its PostgreSQL lock',
    async (reason) => {
      const q = await create(),
        before = await snapshot(q.id),
        entered = latch<number>(),
        release = latch<void>();
      const revoking = prisma.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          if (reason === 'membership')
            await tx.membership.update({
              where: { id: fixture.actors.teacher.membershipId },
              data: { endedAt: new Date() },
            });
          if (reason === 'permission')
            await tx.rolePermission.deleteMany({
              where: {
                roleId: fixture.actors.teacher.roleId,
                permission: { code: 'homework.questions.manage' },
              },
            });
          if (reason === 'allocation')
            await tx.teacherSubjectAllocation.update({
              where: { id: fixture.allocations.teacher },
              data: { teacherUserId: fixture.actors.otherTeacher.userId },
            });
          entered.resolve(pid);
          await release.promise;
        },
        { timeout: 30000 },
      );
      const pid = await entered.promise,
        writing = update('question', q, true).then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
      try {
        await blockedBy(pid);
        release.resolve();
        await revoking;
        expect(await writing).toMatchObject({ error: { code: 'not_found' } });
        expect(await snapshot(q.id)).toEqual(before);
      } finally {
        release.resolve();
        await Promise.allSettled([revoking, writing]);
      }
    },
  );

  it.each(['question', 'option'] as const)(
    'revalidates DRAFT after publication wins the assignment lock before a %s Rich write',
    async (target) => {
      const q = await create(),
        before = await snapshot(q.id),
        entered = latch<number>(),
        release = latch<void>();
      const publishing = prisma.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          await tx.$queryRaw`SELECT id FROM homework_assignments WHERE id = ${graph.homework.id}::uuid FOR UPDATE`;
          await tx.homeworkAssignment.update({
            where: { id: graph.homework.id },
            data: { status: 'PUBLISHED', publishedAt: new Date() },
          });
          entered.resolve(pid);
          await release.promise;
        },
        { timeout: 30000 },
      );
      const pid = await entered.promise;
      const writing = update(target, q, true).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      try {
        await blockedBy(pid);
        release.resolve();
        await publishing;
        expect(await writing).toMatchObject({
          error: { code: 'homework.question.read_only' },
        });
        expect(await snapshot(q.id)).toEqual(before);
      } finally {
        release.resolve();
        await Promise.allSettled([publishing, writing]);
      }
    },
  );
  it.each(['question', 'option'] as const)(
    'rediscovers concurrent %s JSON introduction and rolls back before ordered authorization retry',
    async (target) => {
      const q = await create();
      if (target === 'question')
        await prisma.homeworkQuestion.update({
          where: { id: q.id },
          data: { richContent: Prisma.DbNull },
        });
      else
        await prisma.homeworkQuestionOption.update({
          where: { id: q.options[0].id },
          data: { richContent: Prisma.DbNull },
        });
      const entered = latch<number>(),
        release = latch<void>();
      let expected: unknown;
      const blocker = prisma.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          await tx.$queryRaw`SELECT id FROM homework_assignments WHERE id = ${graph.homework.id}::uuid FOR UPDATE`;
          if (target === 'question')
            await tx.homeworkQuestion.update({
              where: { id: q.id },
              data: { richContent: questionRich() as Prisma.InputJsonValue },
            });
          else
            await tx.homeworkQuestionOption.update({
              where: { id: q.options[0].id },
              data: { richContent: optionRich('A') as Prisma.InputJsonValue },
            });
          await tx.rolePermission.deleteMany({
            where: {
              roleId: fixture.actors.teacher.roleId,
              permission: { code: 'homework.questions.manage' },
            },
          });
          expected = await tx.homeworkQuestion.findUniqueOrThrow({
            where: { id: q.id },
            include: { options: { orderBy: { id: 'asc' } } },
          });
          entered.resolve(pid);
          await release.promise;
        },
        { timeout: 30000 },
      );
      const pid = await entered.promise,
        writing = update(target, q, false).then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
      try {
        await blockedBy(pid);
        release.resolve();
        await blocker;
        expect(await writing).toMatchObject({ error: { code: 'not_found' } });
        expect(await snapshot(q.id)).toEqual(expected);
      } finally {
        release.resolve();
        await Promise.allSettled([blocker, writing]);
      }
    },
  );
  it('serializes authorized Rich and legacy writers without a stale fallback or lost non-display changes', async () => {
    const q = await create();
    await Promise.all([
      teacher(() =>
        repository.updateQuestion({
          ...resource(q.id),
          actor: actor(),
          data: {
            richContent: questionRich('Concurrent Rich'),
            metadata: { marker: 'retained' },
          },
        }),
      ),
      teacher(() =>
        repository.updateQuestion({
          ...resource(q.id),
          actor: actor(),
          data: { prompt: 'Concurrent legacy', points: new Prisma.Decimal(5) },
        }),
      ),
    ]);
    const current = await snapshot(q.id);
    expect(current.points.toNumber()).toBe(5);
    expect(current.metadata).toEqual({ marker: 'retained' });
    if (current.richContent !== null)
      expect(
        richContentFallback(current.richContent, 'homeworkQuestion'),
      ).toEqual({ prompt: current.prompt, instructions: current.instructions });
    else expect(current.prompt).toBe('Concurrent legacy');
  });
});
