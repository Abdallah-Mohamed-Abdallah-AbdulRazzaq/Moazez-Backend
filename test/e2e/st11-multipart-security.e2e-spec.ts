import { randomUUID } from 'node:crypto';
import { St11MultipartHttp } from '../fixtures/st11-multipart.http';
import { st06Json } from '../fixtures/homework-question-assets.http';
import type { St10bDomain } from '../fixtures/st10b-runtime.http';
import type { QuestionGroupContext } from '../../src/common/question-groups/question-group.projection';

describe('ST11-B live scoped membership, atomic layout and group security', () => {
  jest.setTimeout(180000);
  const h = new St11MultipartHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeMultipartCase());
  afterAll(() => h.close());
  const domains = ['Homework', 'Grades'] as St10bDomain[];
  it.each(domains)(
    '%s rejects nesting, wrong-parent membership and stale concurrent moves atomically',
    async (domain) => {
      const f = await h.grouped(domain);
      await h
        .http()
        .post(f.groups)
        .set(h.headers(f.author))
        .send({ title: 'Nested', parentGroupId: f.groupId })
        .expect(400);
      const second = await h
        .http()
        .post(f.groups)
        .set(h.headers(f.author))
        .send({ title: 'Second' })
        .expect(201);
      const g2 = st06Json<QuestionGroupContext>(second).groups.find(
        (g) => g.id !== f.groupId,
      )!.id;
      const layout = (
        groupId: string,
        expectedGroupId: string | null = null,
      ) => ({
        questions: [
          {
            questionId: f.answers[2].questionId,
            expectedGroupId,
            groupId,
            layoutOrder: 0,
          },
        ],
        blocks: [],
      });
      const before =
        domain === 'Homework'
          ? await h.prisma.homeworkQuestion.findUniqueOrThrow({
              where: { id: f.answers[2].questionId },
            })
          : await h.prisma.gradeAssessmentQuestion.findUniqueOrThrow({
              where: { id: f.answers[2].questionId },
            });
      const invalid = await h
        .http()
        .put(f.groups + '/layout')
        .set(h.headers(f.author))
        .send({
          questions: [
            {
              questionId: f.answers[2].questionId,
              expectedGroupId: null,
              groupId: g2,
              layoutOrder: 0,
            },
            {
              questionId: f.answers[3].questionId,
              expectedGroupId: null,
              groupId: randomUUID(),
              layoutOrder: 0,
            },
          ],
          blocks: [],
        });
      expect(invalid.status).toBe(404);
      const unchanged = await h.stored(domain, before.id);
      expect(unchanged.groupId).toBeNull();
      const responses = await Promise.all(
        [f.groupId, g2].map((g) =>
          h
            .http()
            .put(f.groups + '/layout')
            .set(h.headers(f.author))
            .send(layout(g))
            .timeout({ deadline: 10000 }),
        ),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      const after = await h.stored(domain, before.id);
      expect([f.groupId, g2]).toContain(after.groupId);
      expect(after.sortOrder).toBe(before.sortOrder);
      await h
        .http()
        .put(f.groups + '/layout')
        .set(h.headers(f.author))
        .send({
          questions: [
            {
              questionId: before.id,
              expectedGroupId: after.groupId,
              groupId: null,
              layoutOrder: 0,
            },
          ],
          blocks: [],
        })
        .expect(200);
      expect((await h.stored(domain, before.id)).groupId).toBeNull();
      const otherParent =
        domain === 'Homework'
          ? (await h.fixture.graph()).homework.id
          : (await h.fixture.assessment()).id;
      const group =
        domain === 'Homework'
          ? await h.prisma.homeworkQuestionGroup.create({
              data: {
                schoolId: h.fixture.school.schoolId,
                homeworkAssignmentId: otherParent,
                title: 'Other parent',
                createdByUserId: h.fixture.actors.teacher.userId,
              },
            })
          : await h.prisma.gradeAssessmentQuestionGroup.create({
              data: {
                schoolId: h.fixture.school.schoolId,
                assessmentId: otherParent,
                title: 'Other parent',
                createdByUserId: h.fixture.actors.admin.userId,
              },
            });
      await h
        .http()
        .put(f.groups + '/layout')
        .set(h.headers(f.author))
        .send(layout(group.id))
        .expect(404);
      expect((await h.stored(domain, before.id)).groupId).toBeNull();
    },
  );
  it.each(domains)(
    '%s denies unauthorized actors and rechecks a revoked permission after a successful read',
    async (domain) => {
      const f = await h.grouped(domain);
      await h.http().get(f.groups).set(h.headers(f.author)).expect(200);
      if (domain === 'Grades') {
        // Even an allocated Teacher with existing manage grants cannot author groups.
        await h
          .http()
          .post(f.groups)
          .set(h.headers('teacher'))
          .send({ title: 'Teacher authoring denied' })
          .expect(404);
      }
      for (const actor of [
        'student',
        'parent',
        'otherTeacher',
        'foreignTeacher',
      ] as const) {
        const denied = await h
          .http()
          .post(f.groups)
          .set(h.headers(actor))
          .send({ title: 'Forbidden' });
        expect([403, 404]).toContain(denied.status);
      }
      const owner = h.fixture.actors[f.author],
        permission =
          domain === 'Homework'
            ? 'homework.questions.manage'
            : 'grades.questions.manage';
      const grant = await h.prisma.permission.findUniqueOrThrow({
        where: { code: permission },
      });
      await h.prisma.rolePermission.deleteMany({
        where: { roleId: owner.roleId, permissionId: grant.id },
      });
      const denied = await h
        .http()
        .patch(f.groups + '/' + f.groupId)
        .set(h.headers(f.author))
        .send({ title: 'Revoked' });
      expect([403, 404]).toContain(denied.status);
      const group =
        domain === 'Homework'
          ? await h.prisma.homeworkQuestionGroup.findUniqueOrThrow({
              where: { id: f.groupId },
            })
          : await h.prisma.gradeAssessmentQuestionGroup.findUniqueOrThrow({
              where: { id: f.groupId },
            });
      expect(group.title).toBe('Multipart passage');
    },
  );
  it.each(domains)(
    '%s keeps children independently optional and never treats a group ID as an answerable question',
    async (domain) => {
      const f = await h.grouped(domain),
        optional = f.answers[1].questionId;
      const questionPath =
        domain === 'Homework'
          ? f.authorPath + '/questions/' + optional
          : '/api/v1/grades/questions/' + optional;
      await h
        .http()
        .patch(questionPath)
        .set(h.headers(f.author))
        .send(
          domain === 'Homework' ? { isRequired: false } : { required: false },
        )
        .expect(200);
      await h
        .http()
        .post(f.publish)
        .set(h.headers(f.author))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      if (domain === 'Grades')
        await h
          .http()
          .post(f.student + '/start')
          .set(h.headers('student'))
          .expect(201);
      const invalid = await h
        .http()
        .put(f.student + '/submission/answers')
        .set(h.headers('student'))
        .send({
          answers: [
            {
              questionId: f.groupId,
              ...(domain === 'Homework'
                ? { textAnswer: 'Not a question' }
                : { answerText: 'Not a question' }),
            },
          ],
        });
      expect([400, 404, 422]).toContain(invalid.status);
      const count = () =>
        domain === 'Homework'
          ? h.prisma.homeworkSubmissionAnswer.count({
              where: { homeworkAssignmentId: f.parentId },
            })
          : h.prisma.gradeSubmissionAnswer.count({
              where: { assessmentId: f.parentId },
            });
      expect(await count()).toBe(0);
      await h
        .http()
        .put(f.student + '/submission/answers')
        .set(h.headers('student'))
        .send({ answers: f.answers.filter((a) => a.questionId !== optional) })
        .expect(200);
      await h
        .http()
        .post(f.student + '/submission/submit')
        .set(h.headers('student'))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      expect(await count()).toBe(10);
      const frozen = await h
        .http()
        .put(f.groups + '/layout')
        .set(h.headers(f.author))
        .send({
          questions: [],
          blocks: [{ kind: 'group', id: f.groupId, layoutOrder: 0 }],
        });
      expect([400, 404, 409]).toContain(frozen.status);
    },
  );
});
