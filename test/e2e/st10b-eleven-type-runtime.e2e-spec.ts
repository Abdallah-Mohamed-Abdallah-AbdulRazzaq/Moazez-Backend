import { st10bPrivateFields } from '../fixtures/st10b-question-contracts.fixture';
import {
  St10bRuntimeHttp,
  type St10bDomain,
} from '../fixtures/st10b-runtime.http';

describe('ST10-B eleven types coexist with legacy manual grading and explicit synchronization', () => {
  jest.setTimeout(180000);
  const h = new St10bRuntimeHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeRuntimeCase());
  afterAll(() => h.close());
  it.each<St10bDomain>(['Homework', 'Grades'])(
    '%s performs all eleven interactions and rolls back a late invalid mixed-batch answer',
    async (domain) => {
      const f = await h.mixed(domain);
      let linkedAssessmentId: string | undefined;
      if (domain === 'Homework') {
        const assessment = await h.fixture.assessment('teacher', true);
        linkedAssessmentId = assessment.id;
        await h.prisma.gradeAssessment.update({
          where: { id: assessment.id },
          data: {
            type: 'ASSIGNMENT',
            deliveryMode: 'SCORE_ONLY',
            maxScore: 11,
          },
        });
        await h
          .http()
          .post(`/api/v1/homework/assignments/${f.parentId}/grade-sync/link`)
          .set(h.headers('admin'))
          .send({ gradeAssessmentId: assessment.id })
          .expect(200);
      }
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
      const bulk = f.student + '/submission/answers';
      await h
        .http()
        .put(bulk)
        .set(h.headers('student'))
        .send({ answers: f.answers })
        .expect(200);
      const rows: () => Promise<
        Array<{
          id: string;
          awardedPoints: unknown;
          homeworkSubmissionId?: string;
          submissionId?: string;
        }>
      > = () =>
        domain === 'Homework'
          ? h.prisma.homeworkSubmissionAnswer.findMany({
              where: { homeworkAssignmentId: f.parentId },
              orderBy: { id: 'asc' },
            })
          : h.prisma.gradeSubmissionAnswer.findMany({
              where: { assessmentId: f.parentId },
              orderBy: { id: 'asc' },
            });
      const before = await rows();
      expect(before).toHaveLength(11);
      expect(before.every((answer) => answer.awardedPoints === null)).toBe(
        true,
      );
      const invalidLast = [
        ...f.answers.filter((answer) => !('answerJson' in answer)),
        ...f.answers
          .filter((answer) => 'answerJson' in answer)
          .map((answer) => ({ ...answer })),
      ];
      const textIndex = invalidLast.findIndex(
        (answer) => answer.textAnswer != null || answer.answerText != null,
      );
      expect(textIndex).toBeGreaterThanOrEqual(0);
      invalidLast[textIndex] = {
        ...invalidLast[textIndex],
        ...(domain === 'Homework'
          ? { textAnswer: 'Must roll back' }
          : { answerText: 'Must roll back' }),
      };
      invalidLast[invalidLast.length - 1] = {
        questionId: invalidLast[invalidLast.length - 1].questionId,
        answerJson: { unknownFutureAnswer: 'invalid' },
      };
      const rejected = await h
        .http()
        .put(bulk)
        .set(h.headers('student'))
        .send({ answers: invalidLast });
      expect(rejected.status).toBe(domain === 'Homework' ? 422 : 400);
      expect(await rows()).toEqual(before);
      const submitted = await h
        .http()
        .post(f.student + '/submission/submit')
        .set(h.headers('student'))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      const json = JSON.stringify(submitted.body);
      for (const field of st10bPrivateFields)
        expect(json).not.toContain('"' + field + '"');
      const answers = await rows();
      expect(answers).toHaveLength(11);
      const first = answers[0];
      const submissionId = first.homeworkSubmissionId ?? first.submissionId;
      if (!submissionId)
        throw new Error('Owned answer lacks its submission identity');
      expect(
        await h.prisma.gradeItem.count({
          where: { schoolId: h.fixture.school.schoolId },
        }),
      ).toBe(0);
      const review =
        domain === 'Homework'
          ? f.authorPath + `/submissions/${submissionId}/answers/review`
          : `/api/v1/grades/submissions/${submissionId}/answers/review`;
      const reviews = answers.map((answer) => ({
        answerId: answer.id,
        awardedPoints: 1,
      }));
      await h
        .http()
        .put(review)
        .set(h.headers(f.author))
        .send(domain === 'Homework' ? { answers: reviews } : { reviews })
        .expect(200);
      const finalize =
        domain === 'Homework'
          ? f.authorPath + `/submissions/${submissionId}/review`
          : `/api/v1/grades/submissions/${submissionId}/review/finalize`;
      await h
        .http()
        .post(finalize)
        .set(h.headers(f.author))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      expect(
        await h.prisma.gradeItem.count({
          where: { schoolId: h.fixture.school.schoolId },
        }),
      ).toBe(0);
      const sync =
        domain === 'Homework'
          ? `/api/v1/homework/assignments/${f.parentId}/submissions/${submissionId}/grade-sync`
          : `/api/v1/grades/submissions/${submissionId}/sync-grade-item`;
      await h
        .http()
        .post(sync)
        .set(h.headers('admin'))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      const item = await h.prisma.gradeItem.findFirstOrThrow({
        where: {
          assessmentId: linkedAssessmentId ?? f.parentId,
          studentId: h.fixture.children[0].studentId,
        },
      });
      expect(Number(item.score)).toBe(11);
      const details = await h
        .http()
        .get(f.student)
        .set(h.headers('student'))
        .expect(200);
      for (const field of st10bPrivateFields)
        expect(JSON.stringify(details.body)).not.toContain('"' + field + '"');
    },
  );
});
