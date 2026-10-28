import { Prisma } from '@prisma/client';
import {
  HomeworkQuestionAssetsHttp,
  st06Json,
  type HttpHomeworkGraph,
} from '../fixtures/homework-question-assets.http';
import { HomeworkRichContentService } from '../../src/modules/homework/application/homework-rich-content.service';

const fill = {
  definitionVersion: 1,
  kind: 'fill',
  blanks: [{ id: 'b', order: 1 }],
  segments: [{ text: 'Capital ' }, { blankId: 'b' }],
};
const key = {
  keyVersion: 1,
  kind: 'fill',
  blanks: [{ blankId: 'b', acceptedAnswers: ['PRIVATE_ST09BC_KEY'] }],
};
const matching = {
  definitionVersion: 1,
  kind: 'matching',
  left: [
    { id: 'l1', order: 1, label: 'One' },
    { id: 'l2', order: 2, label: 'Two' },
  ],
  right: [
    { id: 'r1', order: 1, label: '1' },
    { id: 'r2', order: 2, label: '2' },
  ],
  reuseRight: false,
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('ST09-B/C BC-1 actual HTTP authoring and publication', () => {
  jest.setTimeout(180000);
  const h = new HomeworkQuestionAssetsHttp();
  const teacher = (g: HttpHomeworkGraph) =>
    `/api/v1/teacher/homeworks/classes/${h.fixture.allocations.teacher}/assignments/${g.homework.id}`;
  const core = (g: HttpHomeworkGraph) =>
    `/api/v1/homework/assignments/${g.homework.id}`;
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeCase());
  afterAll(() => h.close());
  async function create(
    g: HttpHomeworkGraph,
    type = 'FILL_IN_BLANK',
    metadata: unknown = fill,
    answerKey?: unknown,
  ) {
    const response = await h
      .http()
      .post(teacher(g) + '/questions')
      .set(h.headers())
      .send({
        type,
        prompt: 'Typed question',
        metadata,
        ...(answerKey === undefined ? {} : { answerKey }),
      })
      .expect(201);
    return st06Json<{
      question: {
        questionId: string;
        type: string;
        metadata: unknown;
        answerKey?: unknown;
      };
    }>(response).question;
  }
  it('creates/replaces/clears private keys atomically and never serializes a key through view-only authority', async () => {
    const g = await h.fixture.graph();
    const q = await create(g, 'FILL_IN_BLANK', fill, {
      state: 'value',
      value: key,
    });
    expect(q.type).toBe('fill_in_blank');
    expect(q.answerKey).toEqual(key);
    const before = await h.prisma.homeworkQuestion.findUniqueOrThrow({
      where: { id: q.questionId },
    });
    const changed = {
      ...fill,
      blanks: [{ id: 'other', order: 1 }],
      segments: [{ blankId: 'other' }],
    };
    await h
      .http()
      .patch(teacher(g) + '/questions/' + q.questionId)
      .set(h.headers())
      .send({ metadata: changed })
      .expect(422);
    expect(
      await h.prisma.homeworkQuestion.findUniqueOrThrow({
        where: { id: q.questionId },
      }),
    ).toEqual(before);
    await h
      .http()
      .patch(teacher(g) + '/questions/' + q.questionId)
      .set(h.headers())
      .send({ metadata: changed, answerKey: { state: 'clear' } })
      .expect(200);
    const [cleared] = await h.prisma.$queryRaw<
      Array<{ absent: boolean }>
    >`SELECT answer_key IS NULL AS absent FROM homework_questions WHERE id=${q.questionId}::uuid`;
    expect(cleared.absent).toBe(true);
    await h
      .http()
      .patch(teacher(g) + '/questions/' + q.questionId)
      .set(h.headers())
      .send({ metadata: fill, answerKey: { state: 'value', value: key } })
      .expect(200);
    await h.prisma.rolePermission.deleteMany({
      where: {
        roleId: h.fixture.actors.teacher.roleId,
        permission: { code: 'homework.questions.manage' },
      },
    });
    const view = await h
      .http()
      .get(teacher(g) + '/questions/' + q.questionId)
      .set(h.headers())
      .expect(200);
    expect(JSON.stringify(view.body)).not.toContain('PRIVATE_ST09BC_KEY');
    expect(st06Json<{ question: object }>(view).question).not.toHaveProperty(
      'answerKey',
    );
  });
  it('supports Core management authoring and key clearing without granting private keys to a Core viewer', async () => {
    const g = await h.fixture.graph();
    for (const [type, metadata] of [
      ['FILL_IN_BLANK', fill],
      ['MATCHING', matching],
      [
        'MEDIA',
        {
          definitionVersion: 1,
          kind: 'media',
          answer: { kind: 'text', multiline: true },
        },
      ],
    ] as const) {
      const response = await h
        .http()
        .post(core(g) + '/questions')
        .set(h.headers('admin'))
        .send({
          type,
          prompt: 'Core typed authoring',
          metadata,
          ...(type === 'FILL_IN_BLANK'
            ? { answerKey: { state: 'value', value: key } }
            : {}),
        })
        .expect(201);
      const question = st06Json<{
        question: { questionId: string; type: string; answerKey?: unknown };
      }>(response).question;
      expect(question.type).toBe(type.toLowerCase());
      if (type !== 'FILL_IN_BLANK') continue;
      expect(question.answerKey).toEqual(key);
      await h.prisma.rolePermission.deleteMany({
        where: {
          roleId: h.fixture.actors.admin.roleId,
          permission: { code: 'homework.assignments.manage' },
        },
      });
      const viewed = await h
        .http()
        .get(core(g) + '/questions/' + question.questionId)
        .set(h.headers('admin'))
        .expect(200);
      expect(
        st06Json<{ question: object }>(viewed).question,
      ).not.toHaveProperty('answerKey');
      expect(JSON.stringify(viewed.body)).not.toContain('PRIVATE_ST09BC_KEY');
      await h.fixture.grantAssets(h.fixture.actors.admin.roleId, [
        'homework.assignments.manage',
      ]);
      await h
        .http()
        .patch(core(g) + '/questions/' + question.questionId)
        .set(h.headers('admin'))
        .send({ answerKey: { state: 'clear' } })
        .expect(200);
      const [stored] = await h.prisma.$queryRaw<
        Array<{ absent: boolean }>
      >`SELECT answer_key IS NULL AS absent FROM homework_questions WHERE id=${question.questionId}::uuid`;
      expect(stored.absent).toBe(true);
    }
  });
  it.each(['FILL_IN_BLANK', 'MATCHING', 'MEDIA'])(
    'rejects incomplete %s publication without target/status mutations',
    async (type) => {
      const g = await h.fixture.graph();
      const metadata =
        type === 'MEDIA'
          ? {
              definitionVersion: 1,
              kind: 'media',
              answer: { kind: 'text', multiline: true },
            }
          : {
              definitionVersion: 1,
              kind: type === 'MATCHING' ? 'matching' : 'fill',
            };
      await create(g, type, metadata);
      const before = await h.prisma.homeworkAssignment.findUniqueOrThrow({
        where: { id: g.homework.id },
        include: { targets: { orderBy: { id: 'asc' } } },
      });
      await h
        .http()
        .post(teacher(g) + '/publish')
        .set(h.headers())
        .send({})
        .expect(422);
      expect(
        await h.prisma.homeworkAssignment.findUniqueOrThrow({
          where: { id: g.homework.id },
          include: { targets: { orderBy: { id: 'asc' } } },
        }),
      ).toEqual(before);
    },
  );
  it('publishes complete Fill/Matching and an authorized external MEDIA binding through the existing lifecycle', async () => {
    const g = await h.fixture.graph();
    await create(g);
    await create(g, 'MATCHING', matching);
    const media = await create(g, 'MEDIA', {
      definitionVersion: 1,
      kind: 'media',
      answer: { kind: 'text', multiline: true, maxLength: 500 },
    });
    const asset = await h
      .http()
      .post(teacher(g) + '/questions/' + media.questionId + '/assets')
      .set(h.headers())
      .send({
        sourceType: 'EXTERNAL_HTTPS',
        externalUrl: 'https://media.example.org/lesson.txt',
      })
      .expect(201);
    const assetId = st06Json<{ asset: { assetId: string } }>(asset).asset
      .assetId;
    await h
      .http()
      .patch(teacher(g) + '/questions/' + media.questionId)
      .set(h.headers())
      .send({
        metadata: {
          definitionVersion: 1,
          kind: 'media',
          source: { kind: 'homeworkQuestionAsset', assetId },
          answer: { kind: 'text', multiline: true, maxLength: 500 },
        },
      })
      .expect(200);
    await h.publish(g);
    expect(
      (
        await h.prisma.homeworkAssignment.findUniqueOrThrow({
          where: { id: g.homework.id },
        })
      ).status,
    ).toBe('PUBLISHED');
    await h
      .http()
      .patch(teacher(g) + '/questions/' + media.questionId)
      .set(h.headers())
      .send({ prompt: 'After publication' })
      .expect(409);
  });
  it('rejects foreign asset identity, typed options, stale expectedAnswer and JSON-null keys', async () => {
    const g = await h.fixture.graph(),
      other = await h.fixture.graph();
    const asset = await h.external(other);
    const media = await create(g, 'MEDIA', {
      definitionVersion: 1,
      kind: 'media',
      answer: { kind: 'text', multiline: true },
    });
    const before = await h.prisma.homeworkQuestion.findUniqueOrThrow({
      where: { id: media.questionId },
    });
    await h
      .http()
      .patch(teacher(g) + '/questions/' + media.questionId)
      .set(h.headers())
      .send({
        metadata: {
          ...(before.metadata as object),
          source: { kind: 'homeworkQuestionAsset', assetId: asset.assetId },
        },
      })
      .expect(404);
    expect(
      await h.prisma.homeworkQuestion.findUniqueOrThrow({
        where: { id: media.questionId },
      }),
    ).toEqual(before);
    await h
      .http()
      .post(teacher(g) + '/questions/' + media.questionId + '/options')
      .set(h.headers())
      .send({ text: 'Forbidden' })
      .expect(422);
    await h
      .http()
      .post(core(g) + '/questions')
      .set(h.headers('admin'))
      .send({
        type: 'FILL_IN_BLANK',
        prompt: 'Bad',
        metadata: fill,
        expectedAnswer: 'PRIVATE_STALE',
      })
      .expect(422);
    const q = await create(g);
    await h.prisma.homeworkQuestion.update({
      where: { id: q.questionId },
      data: { answerKey: Prisma.JsonNull },
    });
    await h
      .http()
      .post(core(g) + '/publish')
      .set(h.headers('admin'))
      .send({})
      .expect(422);
  });
  it('preserves UUID for safe transitions and rejects incompatible option relationships', async () => {
    const g = await h.fixture.graph(),
      q = await create(g);
    await h
      .http()
      .patch(teacher(g) + '/questions/' + q.questionId)
      .set(h.headers())
      .send({
        type: 'MATCHING',
        metadata: matching,
        answerKey: { state: 'clear' },
      })
      .expect(200);
    await h
      .http()
      .patch(teacher(g) + '/questions/' + q.questionId)
      .set(h.headers())
      .send({
        type: 'LONG_TEXT',
        metadata: null,
        answerKey: { state: 'clear' },
      })
      .expect(200);
    expect(
      (
        await h.prisma.homeworkQuestion.findUniqueOrThrow({
          where: { id: q.questionId },
        })
      ).id,
    ).toBe(q.questionId);
    const choice = await h
      .http()
      .post(teacher(g) + '/questions')
      .set(h.headers())
      .send({
        type: 'SINGLE_CHOICE',
        prompt: 'Choose',
        options: [{ text: 'A', isCorrect: true }, { text: 'B' }],
      })
      .expect(201);
    const choiceId = st06Json<{ question: { questionId: string } }>(choice)
      .question.questionId;
    await h
      .http()
      .patch(teacher(g) + '/questions/' + choiceId)
      .set(h.headers())
      .send({ type: 'MATCHING', metadata: matching })
      .expect(422);
    expect(
      await h.prisma.homeworkQuestionOption.count({
        where: { homeworkQuestionId: choiceId },
      }),
    ).toBe(2);
  });
  it('denies wrong allocation, school and revoked allocation without creating typed rows', async () => {
    const g = await h.fixture.graph();
    const payload = {
      type: 'FILL_IN_BLANK',
      prompt: 'Protected',
      metadata: fill,
    };
    const before = await h.prisma.homeworkQuestion.findMany({
      where: { homeworkAssignmentId: g.homework.id },
      orderBy: { id: 'asc' },
    });
    await h
      .http()
      .post(teacher(g) + '/questions')
      .set(h.headers('otherTeacher'))
      .send(payload)
      .expect(404);
    await h
      .http()
      .post(
        teacher(g).replace(
          h.fixture.allocations.teacher,
          h.fixture.allocations.otherTeacher,
        ) + '/questions',
      )
      .set(h.headers())
      .send(payload)
      .expect(404);
    await h
      .http()
      .post(teacher(g) + '/questions')
      .set(h.headers('foreignTeacher'))
      .send(payload)
      .expect(404);
    const rich = h.app.get<HomeworkRichContentService>(
      HomeworkRichContentService,
    );
    const original = rich.assertWrite.bind(rich) as typeof rich.assertWrite;
    jest.spyOn(rich, 'assertWrite').mockImplementationOnce(async (...args) => {
      await h.prisma.teacherSubjectAllocation.update({
        where: { id: h.fixture.allocations.teacher },
        data: { teacherUserId: h.fixture.actors.otherTeacher.userId },
      });
      return original(...args);
    });
    await h
      .http()
      .post(teacher(g) + '/questions')
      .set(h.headers())
      .send(payload)
      .expect(404);
    expect(
      await h.prisma.homeworkQuestion.findMany({
        where: { homeworkAssignmentId: g.homework.id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(before);
  });
  it('publishes genuinely READY managed MEDIA and retains independent GET/HEAD/Range and enrollment checks', async () => {
    const g = await h.fixture.graph();
    const media = await create(g, 'MEDIA', {
      definitionVersion: 1,
      kind: 'media',
      answer: { kind: 'text', multiline: true },
    });
    const ready = await h.fixture.ready(
      g.homework.id,
      'teacher',
      Buffer.from('0123456789 owned MEDIA\n'),
    );
    const binding = await h
      .http()
      .post(teacher(g) + '/questions/' + media.questionId + '/assets')
      .set(h.headers())
      .send({
        sourceType: 'MANAGED_FILE',
        fileId: ready.fileId,
        uploadId: ready.uploadId,
      })
      .expect(201);
    const assetId = st06Json<{ asset: { assetId: string } }>(binding).asset
      .assetId;
    await h
      .http()
      .patch(teacher(g) + '/questions/' + media.questionId)
      .set(h.headers())
      .send({
        metadata: {
          definitionVersion: 1,
          kind: 'media',
          source: { kind: 'homeworkQuestionAsset', assetId },
          answer: { kind: 'text', multiline: true },
        },
      })
      .expect(200);
    await h.publish(g);
    const path = `/api/v1/student/homeworks/${g.homework.id}/questions/${media.questionId}/assets/${assetId}/preview`;
    const full = await h.http().get(path).set(h.headers('student')).expect(200);
    expect(Buffer.from(full.text)).toEqual(ready.bytes);
    expect(full.headers['cache-control']).toContain('no-store');
    const range = await h
      .http()
      .get(path)
      .set(h.headers('student'))
      .set('Range', 'bytes=2-5')
      .expect(206);
    expect(range.text).toBe('2345');
    await h.http().head(path).set(h.headers('student')).expect(200);
    await h.http().get(path).set(h.headers('otherStudent')).expect(404);
    await h.prisma.enrollment.update({
      where: { id: h.fixture.children[0].enrollmentId },
      data: { endedAt: new Date() },
    });
    await h.http().get(path).set(h.headers('student')).expect(404);
    await h.http().head(path).set(h.headers('student')).expect(404);
  });
  it('serializes an author definition update before publication and preserves targets on late invalidity', async () => {
    const g = await h.fixture.graph(),
      q = await create(g);
    const before = await h.prisma.homeworkAssignment.findUniqueOrThrow({
      where: { id: g.homework.id },
      include: { targets: { orderBy: { id: 'asc' } } },
    });
    const rich = h.app.get<HomeworkRichContentService>(
      HomeworkRichContentService,
    );
    const original = rich.assertWrite.bind(rich) as typeof rich.assertWrite;
    const locked = deferred(),
      release = deferred(),
      publisherStarted = deferred();
    jest.spyOn(rich, 'assertWrite').mockImplementation(async (...args) => {
      if (args[3] === 'homework.assignments.manage') publisherStarted.resolve();
      await original(...args);
      if (args[1].questionId === q.questionId) {
        locked.resolve();
        await release.promise;
      }
    });
    const update = h
      .http()
      .patch(teacher(g) + '/questions/' + q.questionId)
      .set(h.headers())
      .send({ metadata: { definitionVersion: 1, kind: 'fill' } })
      .then((response) => response.status);
    try {
      await locked.promise;
      const publish = h
        .http()
        .post(teacher(g) + '/publish')
        .set(h.headers())
        .send({})
        .then((response) => response.status);
      await publisherStarted.promise;
      release.resolve();
      expect(await update).toBe(200);
      expect(await publish).toBe(422);
      expect(
        await h.prisma.homeworkAssignment.findUniqueOrThrow({
          where: { id: g.homework.id },
          include: { targets: { orderBy: { id: 'asc' } } },
        }),
      ).toEqual(before);
    } finally {
      release.resolve();
      await update;
    }
  });
  it('serializes publication before a stale author update and rejects the update after terminal authoring state', async () => {
    const g = await h.fixture.graph(),
      q = await create(g);
    const originalQuestion = await h.prisma.homeworkQuestion.findUniqueOrThrow({
      where: { id: q.questionId },
    });
    const rich = h.app.get<HomeworkRichContentService>(
      HomeworkRichContentService,
    );
    const original = rich.assertWrite.bind(rich) as typeof rich.assertWrite;
    const locked = deferred(),
      release = deferred(),
      writerStarted = deferred();
    jest.spyOn(rich, 'assertWrite').mockImplementation(async (...args) => {
      if (args[1].questionId === q.questionId) writerStarted.resolve();
      await original(...args);
      if (args[3] === 'homework.assignments.manage') {
        locked.resolve();
        await release.promise;
      }
    });
    const publish = h
      .http()
      .post(teacher(g) + '/publish')
      .set(h.headers())
      .send({})
      .then((response) => response.status);
    try {
      await locked.promise;
      const update = h
        .http()
        .patch(teacher(g) + '/questions/' + q.questionId)
        .set(h.headers())
        .send({ metadata: { definitionVersion: 1, kind: 'fill' } })
        .then((response) => response.status);
      await writerStarted.promise;
      release.resolve();
      expect(await publish).toBe(200);
      expect(await update).toBe(409);
      expect(
        await h.prisma.homeworkQuestion.findUniqueOrThrow({
          where: { id: q.questionId },
        }),
      ).toEqual(originalQuestion);
      expect(
        (
          await h.prisma.homeworkAssignment.findUniqueOrThrow({
            where: { id: g.homework.id },
          })
        ).status,
      ).toBe('PUBLISHED');
    } finally {
      release.resolve();
      await publish;
    }
  });
});
