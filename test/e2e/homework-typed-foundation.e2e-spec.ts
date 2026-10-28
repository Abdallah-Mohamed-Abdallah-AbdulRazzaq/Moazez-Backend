import { HomeworkQuestionType } from '@prisma/client';
import { HomeworkRepository } from '../../src/modules/homework/infrastructure/homework.repository';
import {
  HomeworkQuestionAssetsHttp,
  type HttpHomeworkGraph,
} from '../fixtures/homework-question-assets.http';

describe('ST09-A storage/privacy preservation under authorized ST09-B/C integration', () => {
  jest.setTimeout(180000);
  const h = new HomeworkQuestionAssetsHttp();
  const teacher = (g: HttpHomeworkGraph) =>
    `/api/v1/teacher/homeworks/classes/${h.fixture.allocations.teacher}/assignments/${g.homework.id}`;
  const core = (g: HttpHomeworkGraph) =>
    `/api/v1/homework/assignments/${g.homework.id}`;
  const student = (g: HttpHomeworkGraph) =>
    `/api/v1/student/homeworks/${g.homework.id}`;
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(async () => {
    jest.restoreAllMocks();
    const where = {
      schoolId: { in: h.fixture.schools.map((s) => s.schoolId) },
    };
    await h.prisma.homeworkSubmissionAnswer.deleteMany({ where });
    await h.prisma.homeworkSubmission.deleteMany({ where });
    await h.disposeCase();
  });
  afterAll(() => h.close());
  async function rows(g: HttpHomeworkGraph) {
    const where = { homeworkAssignmentId: g.homework.id };
    return {
      assignment: await h.prisma.homeworkAssignment.findUniqueOrThrow({
        where: { id: g.homework.id },
      }),
      questions: await h.prisma.homeworkQuestion.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      targets: await h.prisma.homeworkTarget.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      submissions: await h.prisma.homeworkSubmission.findMany({
        where,
        orderBy: { id: 'asc' },
        include: { answers: { orderBy: { id: 'asc' } } },
      }),
    };
  }
  it.each(['FILL_IN_BLANK', 'MATCHING', 'MEDIA', 'FUTURE'])(
    'rejects unknown or incomplete %s Core/Teacher payloads without changing rows',
    async (type) => {
      const g = await h.fixture.graph();
      const before = await rows(g);
      for (const [base, actor] of [
        [core(g), 'admin'],
        [teacher(g), 'teacher'],
      ] as const) {
        await h
          .http()
          .post(base + '/questions')
          .set(h.headers(actor))
          .send({ type, prompt: 'Future question' })
          .expect(type === 'FUTURE' ? 400 : 422);
        await h
          .http()
          .patch(base + '/questions/' + g.questions[0].id)
          .set(h.headers(actor))
          .send({ type })
          .expect(type === 'FUTURE' ? 400 : 422);
        await h
          .http()
          .patch(base + '/questions/' + g.questions[0].id)
          .set(h.headers(actor))
          .send({ answerKey: { keyVersion: 1 } })
          .expect(422);
      }
      expect(await rows(g)).toEqual(before);
    },
  );
  it.each(['FILL_IN_BLANK', 'MATCHING', 'MEDIA'] as const)(
    'blocks malformed stored %s publication, every save and both submit aliases, including optional unanswered questions',
    async (type) => {
      const g = await h.fixture.graph();
      const q = g.questions[0];
      await h.prisma.homeworkQuestion.update({
        where: { id: q.id },
        data: { type, isRequired: false },
      });
      const beforePublish = await rows(g);
      for (const [base, actor] of [
        [core(g), 'admin'],
        [teacher(g), 'teacher'],
      ] as const)
        await h
          .http()
          .post(base + '/publish')
          .set(h.headers(actor))
          .send({})
          .expect(422);
      expect(await rows(g)).toEqual(beforePublish);
      // A type alone is insufficient: historical/imported rows lack a valid public definition.
      await h.prisma.homeworkAssignment.update({
        where: { id: g.homework.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      await h.fixture.grantAssets(h.fixture.actors.student.roleId, [
        'homework.answers.manage',
        'homework.submissions.save',
        'homework.submissions.submit',
      ]);
      const before = await rows(g),
        base = student(g);
      await h
        .http()
        .patch(base + '/submission/answers/' + q.id)
        .set(h.headers('student'))
        .send({ textAnswer: 'Attempt' })
        .expect(422);
      await h
        .http()
        .put(base + '/submission/answers')
        .set(h.headers('student'))
        .send({
          answers: [
            { questionId: g.questions[1].id, textAnswer: 'Would be valid' },
            { questionId: q.id, textAnswer: 'Attempt' },
          ],
        })
        .expect(422);
      await h
        .http()
        .put(base + '/submission')
        .set(h.headers('student'))
        .send({ bodyText: 'Attempt' })
        .expect(422);
      await h
        .http()
        .post(base + '/submission/draft')
        .set(h.headers('student'))
        .send({ bodyText: 'Attempt' })
        .expect(422);
      for (const suffix of ['submit', 'submission/submit'])
        await h
          .http()
          .post(base + '/' + suffix)
          .set(h.headers('student'))
          .send({})
          .expect(422);
      await h
        .http()
        .patch(base + '/submission/answers/' + q.id)
        .set(h.headers('student'))
        .send({ answerJson: { blanks: [] } })
        .expect(422);
      expect(await rows(g)).toEqual(before);
    },
  );
  it('rechecks the current type inside the publication transaction after a successful earlier read', async () => {
    const g = await h.fixture.graph();
    const repo = h.app.get<HomeworkRepository>(HomeworkRepository),
      original = repo.listQuestions.bind(repo) as typeof repo.listQuestions;
    let changed = false;
    jest.spyOn(repo, 'listQuestions').mockImplementation(async (...args) => {
      const snapshot = await original(...args);
      if (!changed) {
        changed = true;
        await h.prisma.homeworkQuestion.update({
          where: { id: g.questions[0].id },
          data: { type: HomeworkQuestionType.MEDIA },
        });
      }
      return snapshot;
    });
    const before = await rows(g);
    await h
      .http()
      .post(core(g) + '/publish')
      .set(h.headers('admin'))
      .send({})
      .expect(422);
    expect(changed).toBe(true);
    const after = await rows(g);
    expect(after.assignment).toEqual(before.assignment);
    expect(after.targets).toEqual(before.targets);
    expect(after.submissions).toEqual(before.submissions);
  });
  it('keeps new private columns out of Core, Teacher, Student, Parent and review responses', async () => {
    const g = await h.fixture.graph(),
      q = g.questions[0],
      marker = 'ST09A_PRIVATE_KEY_MARKER';
    await h.prisma.homeworkQuestion.update({
      where: { id: q.id },
      data: { answerKey: { marker }, metadata: { privateMarker: marker } },
    });
    await h.fixture.grantAssets(h.fixture.actors.student.roleId, [
      'homework.answers.manage',
      'homework.submissions.save',
      'homework.submissions.submit',
    ]);
    await h.fixture.grantAssets(h.fixture.actors.teacher.roleId, [
      'homework.submissions.review',
    ]);
    await h.publish(g);
    const base = student(g);
    await h
      .http()
      .patch(base + '/submission/answers/' + q.id)
      .set(h.headers('student'))
      .send({ textAnswer: 'Legacy answer' })
      .expect(200);
    const s = await h.prisma.homeworkSubmission.findFirstOrThrow({
      where: { homeworkAssignmentId: g.homework.id },
      include: { answers: true },
    });
    await h.prisma.homeworkSubmissionAnswer.update({
      where: { id: s.answers[0].id },
      data: { answerJson: { marker } },
    });
    for (const [path, actor] of [
      [core(g) + '/questions', 'admin'],
      [teacher(g) + '/questions', 'teacher'],
      [base, 'student'],
      [
        `/api/v1/parent/children/${h.fixture.children[0].studentId}/homeworks/${g.homework.id}`,
        'parent',
      ],
    ] as const) {
      const response = await h
        .http()
        .get(path)
        .set(h.headers(actor))
        .expect(200);
      expect(response.text).not.toContain('answerKey');
      expect(response.text).not.toContain('answerJson');
      // Existing author metadata is intentionally retained only on the author surfaces.
      if (actor === 'student' || actor === 'parent')
        expect(response.text).not.toContain(marker);
    }
    await h
      .http()
      .post(base + '/submit')
      .set(h.headers('student'))
      .send({})
      .expect(200);
    const reviewed = await h
      .http()
      .patch(
        teacher(g) + `/submissions/${s.id}/answers/${s.answers[0].id}/review`,
      )
      .set(h.headers())
      .send({ teacherComment: 'Legacy review', awardedPoints: 1 })
      .expect(200);
    expect(reviewed.text).not.toContain('answerKey');
    expect(reviewed.text).not.toContain('answerJson');
    expect(reviewed.text).not.toContain(marker);
  });
});
