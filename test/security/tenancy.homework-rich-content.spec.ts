import {
  HomeworkQuestionAssetsHttp,
  st06Json,
} from '../fixtures/homework-question-assets.http';
import type { StudentHomeworkResponseDto } from '../../src/modules/student-app/homeworks/dto/student-homeworks.dto';

const doc = (text: string) => ({
  language: 'und',
  direction: 'auto',
  blocks: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
});
const questionRich = (text = 'Authorized display') => ({
  contentVersion: 1,
  kind: 'question',
  stem: doc(text),
});
describe('ST08-C actual HTTP Homework Rich tenant, audience and closed-schema boundaries', () => {
  jest.setTimeout(180000);
  const h = new HomeworkQuestionAssetsHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeCase());
  afterAll(() => h.close());
  it('denies same-school nonowner, wrong allocation and cross-school authoring with no row mutation', async () => {
    const graph = await h.fixture.graph(),
      questionId = graph.questions[0].id;
    const path = `/api/v1/teacher/homeworks/classes/${h.fixture.allocations.teacher}/assignments/${graph.homework.id}/questions/${questionId}`;
    const before = await h.prisma.homeworkQuestion.findUniqueOrThrow({
      where: { id: questionId },
    });
    for (const actor of ['otherTeacher', 'foreignTeacher'] as const)
      await h
        .http()
        .patch(path)
        .set(h.headers(actor))
        .send({ richContent: questionRich('Denied') })
        .expect(404);
    await h
      .http()
      .patch(
        path.replace(
          h.fixture.allocations.teacher,
          h.fixture.allocations.otherTeacher,
        ),
      )
      .set(h.headers())
      .send({ richContent: questionRich('Wrong allocation') })
      .expect(404);
    await h
      .http()
      .patch(
        `/api/v1/homework/assignments/${graph.homework.id}/questions/${questionId}`,
      )
      .set(h.headers())
      .send({ richContent: questionRich('Core escalation') })
      .expect(403);
    expect(
      await h.prisma.homeworkQuestion.findUniqueOrThrow({
        where: { id: questionId },
      }),
    ).toEqual(before);
  });
  it.each(['DRAFT', 'CANCELLED', 'ARCHIVED'] as const)(
    'does not grant Student Rich access to %s Homework',
    async (status) => {
      const graph = await h.fixture.graph();
      await h
        .http()
        .patch(
          `/api/v1/teacher/homeworks/classes/${h.fixture.allocations.teacher}/assignments/${graph.homework.id}/questions/${graph.questions[0].id}`,
        )
        .set(h.headers())
        .send({ richContent: questionRich() })
        .expect(200);
      if (status !== 'DRAFT')
        await h.prisma.homeworkAssignment.update({
          where: { id: graph.homework.id },
          data: { status },
        });
      await h
        .http()
        .get(`/api/v1/student/homeworks/${graph.homework.id}`)
        .set(h.headers('student'))
        .expect(404);
    },
  );
  it.each(['otherStudent', 'foreignStudent'] as const)(
    'denies %s target substitution before Rich presentation',
    async (actor) => {
      const graph = await h.fixture.graph();
      await h.publish(graph);
      await h
        .http()
        .get(`/api/v1/student/homeworks/${graph.homework.id}`)
        .set(h.headers(actor))
        .expect(404);
    },
  );
  it.each(['ended-enrollment', 'term-mismatch', 'deleted-question'] as const)(
    'enforces the current %s read boundary',
    async (mode) => {
      const graph = await h.fixture.graph(),
        qId = graph.questions[0].id;
      await h
        .http()
        .patch(
          `/api/v1/teacher/homeworks/classes/${h.fixture.allocations.teacher}/assignments/${graph.homework.id}/questions/${qId}`,
        )
        .set(h.headers())
        .send({ richContent: questionRich() })
        .expect(200);
      await h.publish(graph);
      if (mode === 'ended-enrollment')
        await h.prisma.enrollment.update({
          where: { id: h.fixture.children[0].enrollmentId },
          data: { endedAt: new Date() },
        });
      if (mode === 'term-mismatch') {
        const term = await h.prisma.term.create({
          data: {
            schoolId: h.fixture.school.schoolId,
            academicYearId: h.fixture.school.yearId,
            nameAr: 'فصل آخر',
            nameEn: 'Another term',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2027-12-31'),
            isActive: false,
          },
        });
        await h.prisma.enrollment.update({
          where: { id: h.fixture.children[0].enrollmentId },
          data: { termId: term.id },
        });
      }
      if (mode === 'deleted-question') {
        await h.prisma.homeworkQuestion.update({
          where: { id: qId },
          data: { deletedAt: new Date() },
        });
        const detail = st06Json<StudentHomeworkResponseDto>(
          await h
            .http()
            .get(`/api/v1/student/homeworks/${graph.homework.id}`)
            .set(h.headers('student'))
            .expect(200),
        );
        expect(
          detail.homework.questions.map((q) => q.questionId),
        ).not.toContain(qId);
      } else {
        const response = await h
          .http()
          .get(`/api/v1/student/homeworks/${graph.homework.id}`)
          .set(h.headers('student'));
        expect([403, 404]).toContain(response.status);
        expect(response.text).not.toContain('richContent');
      }
    },
  );
  it.each([
    questionRich('<script>alert(1)</script>'),
    questionRich('<svg onload=alert(1)>'),
    questionRich('<iframe src=x>'),
    questionRich('&lt;script&gt;'),
    questionRich('javascript:alert(1)'),
    questionRich('unsafe\u202Etext'),
    { ...questionRich(), contentVersion: 2 },
    { ...questionRich(), answerKey: 'PRIVATE_ANSWER' },
    { contentVersion: 1, kind: 'option', label: doc('Wrong kind') },
    {
      ...questionRich(),
      stem: {
        ...doc(''),
        blocks: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'assetReference',
                assetId: '00000000-0000-4000-8000-000000000001',
                kind: 'document',
                altText: 'Reference',
                url: 'https://private.invalid/capability',
              },
            ],
          },
        ],
      },
    },
  ])(
    'rejects unsafe/unsupported Rich HTTP content without partial mutation %#',
    async (richContent) => {
      const graph = await h.fixture.graph(),
        id = graph.questions[0].id,
        before = await h.prisma.homeworkQuestion.findUniqueOrThrow({
          where: { id },
        });
      const response = await h
        .http()
        .patch(
          `/api/v1/teacher/homeworks/classes/${h.fixture.allocations.teacher}/assignments/${graph.homework.id}/questions/${id}`,
        )
        .set(h.headers())
        .send({ richContent, metadata: { attempted: true } })
        .expect(400);
      for (const secret of ['alert(1)', 'PRIVATE_ANSWER', 'private.invalid'])
        expect(response.text).not.toContain(secret);
      expect(
        await h.prisma.homeworkQuestion.findUniqueOrThrow({ where: { id } }),
      ).toEqual(before);
    },
  );
  it('rejects Rich/legacy contradictions and a forged internal actor command over HTTP', async () => {
    const graph = await h.fixture.graph(),
      path = `/api/v1/teacher/homeworks/classes/${h.fixture.allocations.teacher}/assignments/${graph.homework.id}/questions/${graph.questions[0].id}`;
    await h
      .http()
      .patch(path)
      .set(h.headers())
      .send({ richContent: questionRich(), prompt: 'Contradiction' })
      .expect(400);
    await h
      .http()
      .patch(path)
      .set(h.headers())
      .send({ richContent: questionRich(), actor: { surface: 'core' } })
      .expect(400);
  });
  it('keeps Parent question-media routes unavailable and omits Rich even when guardian visibility is enabled', async () => {
    const graph = await h.fixture.graph(),
      bound = await h.bind(graph);
    await h
      .http()
      .patch(
        `/api/v1/teacher/homeworks/classes/${h.fixture.allocations.teacher}/assignments/${graph.homework.id}/questions/${graph.questions[0].id}`,
      )
      .set(h.headers())
      .send({ richContent: questionRich() })
      .expect(200);
    await h.publish(graph);
    await h.prisma.schoolAssessmentMediaPolicy.update({
      where: { schoolId: h.fixture.school.schoolId },
      data: { allowGuardianVisibility: true },
    });
    const parentBase = `/api/v1/parent/children/${h.fixture.children[0].studentId}/homeworks/${graph.homework.id}`;
    const detail = await h
      .http()
      .get(parentBase)
      .set(h.headers('parent'))
      .expect(200);
    expect(detail.text).not.toContain('richContent');
    expect(detail.text).not.toContain(bound.asset.assetId);
    await h
      .http()
      .get(
        `${parentBase}/questions/${graph.questions[0].id}/assets/${bound.asset.assetId}/preview`,
      )
      .set(h.headers('parent'))
      .expect(404);
  });
});
