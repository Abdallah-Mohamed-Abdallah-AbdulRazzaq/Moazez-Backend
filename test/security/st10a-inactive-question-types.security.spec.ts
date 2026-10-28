import {
  Prisma,
  GradeQuestionType,
  HomeworkQuestionType,
} from '@prisma/client';
import { GradesAssessmentQuestionsRepository } from '../../src/modules/grades/assessments/infrastructure/grades-assessment-questions.repository';
import { GradesSubmissionsRepository } from '../../src/modules/grades/assessments/infrastructure/grades-submissions.repository';
import { GradesAssessmentsRepository } from '../../src/modules/grades/assessments/infrastructure/grades-assessments.repository';
import { HomeworkRepository } from '../../src/modules/homework/infrastructure/homework.repository';
import { HomeworkQuestionAssetsHttp } from '../fixtures/homework-question-assets.http';
import {
  st09bcStudent,
  st09bcTeacher,
} from '../fixtures/homework-eight-type.fixture';

const inactive = ['ORDERING', 'NUMERIC', 'MATH_EXPRESSION'] as const;
const sentinel = 'ST10A_PRIVATE_KEY_MUST_NEVER_ESCAPE';
const permissions = [
  'grades.assessments.view',
  'grades.assessments.manage',
  'grades.assessments.publish',
  'grades.questions.view',
  'grades.questions.manage',
  'grades.submissions.view',
  'grades.submissions.start',
  'grades.submissions.save',
  'grades.submissions.submit',
  'grades.submissions.review',
  'homework.answers.manage',
  'homework.submissions.save',
  'homework.submissions.submit',
  'homework.submissions.review',
];
describe('ST10-A real PostgreSQL + JWT HTTP no-activation boundary', () => {
  jest.setTimeout(180000);
  const h = new HomeworkQuestionAssetsHttp();
  beforeAll(() => h.start());
  beforeEach(async () => {
    await h.reset();
    for (const actor of Object.values(h.fixture.actors)) {
      await h.fixture.grantAssets(actor.roleId, permissions);
      actor.permissions = [...new Set([...actor.permissions, ...permissions])];
    }
  });
  afterEach(async () => {
    const where = {
      schoolId: { in: h.fixture.schools.map((school) => school.schoolId) },
    };
    await h.prisma.gradeItem.deleteMany({ where });
    await h.prisma.gradeSubmissionAnswer.deleteMany({ where });
    await h.prisma.gradeAssessmentQuestion.deleteMany({ where });
    await h.prisma.homeworkSubmissionAnswer.deleteMany({ where });
    await h.disposeCase();
  });
  afterAll(() => h.close());
  function safe(value: unknown) {
    expect(JSON.stringify(value)).not.toContain(sentinel);
    expect(JSON.stringify(value)).not.toContain('expectedItemIds');
  }
  const refused = (status: number) =>
    expect([400, 404, 409, 422]).toContain(status);

  it.each(inactive)(
    'Grades %s cannot be authored, published, answered, submitted or reviewed, including direct repository writes',
    async (type) => {
      const p = h.prisma,
        f = h.fixture;
      const assessment = await f.assessment();
      await p.gradeAssessment.update({
        where: { id: assessment.id },
        data: { maxScore: 1 },
      });
      const q = await p.gradeAssessmentQuestion.create({
        data: {
          schoolId: assessment.schoolId,
          assessmentId: assessment.id,
          type: 'SHORT_ANSWER',
          prompt: 'Legacy active question',
          sortOrder: 1,
          points: 1,
          required: false,
        },
      });
      const path = `/api/v1/grades/assessments/${assessment.id}`;
      const questionPath = `/api/v1/grades/questions/${q.id}`;
      for (const alias of ['type', 'questionType']) {
        const created = await h
          .http()
          .post(path + '/questions')
          .set(h.headers('admin'))
          .send({ [alias]: type.toLowerCase(), prompt: 'Future', points: 1 });
        expect(created.status).toBe(400);
        safe(created.body);
        const updated = await h
          .http()
          .patch(questionPath)
          .set(h.headers('admin'))
          .send({ [alias]: type });
        expect(updated.status).toBe(400);
        safe(updated.body);
      }
      const questions = h.app.get(GradesAssessmentQuestionsRepository);
      await f.asMediaActor('admin', async () => {
        await expect(
          questions.createQuestionWithOptions({
            schoolId: assessment.schoolId,
            assessmentId: assessment.id,
            type: type as GradeQuestionType,
            prompt: 'Future',
            points: 1,
            sortOrder: 2,
            required: false,
            options: [],
          }),
        ).rejects.toThrow();
        await expect(
          questions.updateQuestionAndReplaceOptions(q.id, {
            data: { type: type as GradeQuestionType },
          }),
        ).rejects.toThrow();
      });
      expect(
        await p.gradeAssessmentQuestion.count({
          where: { assessmentId: assessment.id },
        }),
      ).toBe(1);
      expect(
        (
          await p.gradeAssessmentQuestion.findUniqueOrThrow({
            where: { id: q.id },
          })
        ).type,
      ).toBe('SHORT_ANSWER');
      await p.gradeAssessmentQuestion.update({
        where: { id: q.id },
        data: {
          type,
          answerKey: { private: sentinel },
          metadata: { private: sentinel },
        },
      });
      const publication = await h
        .http()
        .post(path + '/publish')
        .set(h.headers('admin'));
      refused(publication.status);
      safe(publication.body);
      await f.asMediaActor('admin', () =>
        expect(
          h.app
            .get(GradesAssessmentsRepository)
            .publishAssessment(assessment.id, {
              approvalStatus: 'PUBLISHED',
              publishedAt: new Date(),
              publishedById: f.actors.admin.userId,
            }),
        ).rejects.toMatchObject({ code: 'validation.failed' }),
      );
      expect(
        (
          await p.gradeAssessment.findUniqueOrThrow({
            where: { id: assessment.id },
          })
        ).approvalStatus,
      ).toBe('DRAFT');
      const authorRead = await h
        .http()
        .get(path + '/questions')
        .set(h.headers('admin'));
      refused(authorRead.status);
      safe(authorRead.body);

      // Publish/start through the ordinary active contract before persisting a future value.
      await p.gradeAssessmentQuestion.update({
        where: { id: q.id },
        data: {
          type: 'SHORT_ANSWER',
          answerKey: Prisma.DbNull,
          metadata: Prisma.DbNull,
        },
      });
      await h
        .http()
        .post(path + '/publish')
        .set(h.headers('admin'))
        .expect(201);
      const student = `/api/v1/student/exams/${assessment.id}`;
      await h
        .http()
        .post(student + '/start')
        .set(h.headers('student'))
        .expect(201);
      const submission = await p.gradeSubmission.findFirstOrThrow({
        where: { assessmentId: assessment.id },
      });
      await p.gradeAssessmentQuestion.update({
        where: { id: q.id },
        data: {
          type,
          answerKey: { private: sentinel },
          metadata: { private: sentinel },
        },
      });
      for (const readPath of [
        student,
        `/api/v1/student/grades/assessments/${assessment.id}`,
        student + '/submission',
      ]) {
        const response = await h.http().get(readPath).set(h.headers('student'));
        safe(response.body);
        if (response.status === 200 && readPath !== student + '/submission')
          expect(JSON.stringify(response.body)).toContain('"supported":false');
        else if (response.status !== 200) refused(response.status);
      }
      const snapshot = await p.gradeSubmission.findUniqueOrThrow({
        where: { id: submission.id },
      });
      for (const response of [
        await h
          .http()
          .patch(student + '/submission/answers/' + q.id)
          .set(h.headers('student'))
          .send({ answerText: '1' }),
        await h
          .http()
          .put(student + '/submission/answers')
          .set(h.headers('student'))
          .send({ answers: [{ questionId: q.id, answerText: '1' }] }),
        await h
          .http()
          .post(student + '/submission/submit')
          .set(h.headers('student')),
      ]) {
        refused(response.status);
        safe(response.body);
      }
      const submissions = h.app.get(GradesSubmissionsRepository);
      const save = {
        schoolId: assessment.schoolId,
        assessmentId: assessment.id,
        submissionId: submission.id,
        studentId: submission.studentId,
        questionId: q.id,
        maxPoints: new Prisma.Decimal(1),
        payload: { answerText: '1', answerJson: null, selectedOptionIds: [] },
      };
      await f.asMediaActor('student', async () => {
        await expect(
          submissions.upsertAnswerWithSelectedOptions(save),
        ).rejects.toThrow();
        await expect(
          submissions.bulkUpsertAnswersWithSelectedOptions([save]),
        ).rejects.toThrow();
        await expect(
          submissions.submitSubmission(submission.id),
        ).rejects.toThrow();
      });
      expect(
        await p.gradeSubmissionAnswer.count({
          where: { submissionId: submission.id },
        }),
      ).toBe(0);
      expect(
        await p.gradeSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        }),
      ).toEqual(snapshot);
      // Optional unanswered future question must also block final review.
      await p.gradeSubmission.update({
        where: { id: submission.id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
      const beforeFinalize = await p.gradeSubmission.findUniqueOrThrow({
        where: { id: submission.id },
      });
      const finalize = await h
        .http()
        .post(`/api/v1/grades/submissions/${submission.id}/review/finalize`)
        .set(h.headers('admin'));
      refused(finalize.status);
      safe(finalize.body);
      const finalInput = {
        submissionId: submission.id,
        status: 'CORRECTED' as const,
        correctedAt: new Date(),
        reviewedById: f.actors.admin.userId,
        totalScore: new Prisma.Decimal(0),
        maxScore: new Prisma.Decimal(1),
      };
      await f.asMediaActor('admin', () =>
        expect(submissions.finalizeSubmission(finalInput)).rejects.toThrow(),
      );
      expect(
        await p.gradeSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        }),
      ).toEqual(beforeFinalize);
      const answer = await p.gradeSubmissionAnswer.create({
        data: {
          schoolId: assessment.schoolId,
          submissionId: submission.id,
          assessmentId: assessment.id,
          questionId: q.id,
          studentId: submission.studentId,
          answerText: 'Existing legacy text',
          answerJson: { private: sentinel },
          maxPoints: 1,
        },
      });
      for (const readPath of [
        student + '/submission',
        `/api/v1/grades/submissions/${submission.id}`,
      ]) {
        const read = await h
          .http()
          .get(readPath)
          .set(
            h.headers(
              readPath === student + '/submission' ? 'student' : 'admin',
            ),
          );
        safe(read.body);
        if (read.status === 200)
          expect(JSON.stringify(read.body)).toContain('"supported":false');
        else refused(read.status);
      }
      const review = {
        answerId: answer.id,
        submissionId: submission.id,
        awardedPoints: new Prisma.Decimal(1),
        correctionStatus: 'CORRECTED' as const,
        reviewerComment: null,
        reviewerCommentAr: null,
        reviewedById: f.actors.admin.userId,
        reviewedAt: new Date(),
      };
      const reviewPath = `/api/v1/grades/submissions/${submission.id}/answers/${answer.id}/review`;
      const response = await h
        .http()
        .patch(reviewPath)
        .set(h.headers('admin'))
        .send({ awardedPoints: 1 });
      refused(response.status);
      safe(response.body);
      await f.asMediaActor('admin', async () => {
        await expect(submissions.updateAnswerReview(review)).rejects.toThrow();
        await expect(
          submissions.bulkUpdateAnswerReviews([review]),
        ).rejects.toThrow();
      });
      expect(
        await p.gradeSubmissionAnswer.findUniqueOrThrow({
          where: { id: answer.id },
        }),
      ).toEqual(answer);
      for (const actor of ['otherStudent', 'foreignStudent'] as const) {
        const denied = await h
          .http()
          .get(
            actor === 'otherStudent'
              ? `/api/v1/grades/submissions/${submission.id}`
              : student,
          )
          .set(h.headers(actor));
        expect(denied.status).toBe(404);
        safe(denied.body);
      }
    },
  );

  it.each(inactive)(
    'Homework %s stays inactive through authoring, locked publication, student mutations and review',
    async (type) => {
      const p = h.prisma,
        f = h.fixture,
        graph = await f.graph();
      const teacher = st09bcTeacher(h, graph),
        student = st09bcStudent(graph),
        q = graph.questions[0];
      const core = `/api/v1/homework/assignments/${graph.homework.id}`;
      const repository = h.app.get(HomeworkRepository);
      const created = await h
        .http()
        .post(teacher + '/questions')
        .set(h.headers())
        .send({ type, prompt: 'Future', points: 1 });
      expect(created.status).toBe(400);
      safe(created.body);
      const updated = await h
        .http()
        .patch(teacher + '/questions/' + q.id)
        .set(h.headers())
        .send({ type });
      expect(updated.status).toBe(400);
      safe(updated.body);
      const coreCreate = await h
        .http()
        .post(core + '/questions')
        .set(h.headers('admin'))
        .send({ type, prompt: 'Future', points: 1 });
      expect(coreCreate.status).toBe(400);
      safe(coreCreate.body);
      const coreUpdate = await h
        .http()
        .patch(core + '/questions/' + q.id)
        .set(h.headers('admin'))
        .send({ type });
      expect(coreUpdate.status).toBe(400);
      safe(coreUpdate.body);
      await f.asMediaActor('teacher', async () => {
        await expect(
          repository.createQuestionWithOptions({
            question: {
              ...q,
              id: undefined,
              type: type as HomeworkQuestionType,
            },
            options: [],
          }),
        ).rejects.toThrow();
        await expect(
          repository.updateQuestion({
            homeworkId: graph.homework.id,
            questionId: q.id,
            data: { type: type as HomeworkQuestionType },
          }),
        ).rejects.toThrow();
      });
      expect(
        (await p.homeworkQuestion.findUniqueOrThrow({ where: { id: q.id } }))
          .type,
      ).toBe('SHORT_TEXT');
      await p.homeworkQuestion.update({
        where: { id: q.id },
        data: {
          type,
          metadata: { private: sentinel },
          answerKey: { private: sentinel },
        },
      });
      const publication = await h
        .http()
        .post(teacher + '/publish')
        .set(h.headers())
        .send({});
      refused(publication.status);
      safe(publication.body);
      await f.asMediaActor('teacher', () =>
        expect(
          repository.publishAssignmentWithTargets(
            graph.homework.id,
            {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              publishedByUserId: f.actors.teacher.userId,
            },
            [],
          ),
        ).rejects.toMatchObject({
          code: 'homework.question.invalid_type_payload',
        }),
      );
      expect(
        (
          await p.homeworkAssignment.findUniqueOrThrow({
            where: { id: graph.homework.id },
          })
        ).status,
      ).toBe('DRAFT');
      const authorRead = await h.http().get(teacher).set(h.headers());
      refused(authorRead.status);
      safe(authorRead.body);
      await p.homeworkQuestion.update({
        where: { id: q.id },
        data: {
          type: 'SHORT_TEXT',
          metadata: Prisma.DbNull,
          answerKey: Prisma.DbNull,
        },
      });
      await h.publish(graph);
      await p.homeworkQuestion.update({
        where: { id: q.id },
        data: {
          type,
          metadata: { private: sentinel },
          answerKey: { private: sentinel },
        },
      });
      const target = await p.homeworkTarget.findFirstOrThrow({
        where: { homeworkAssignmentId: graph.homework.id },
      });
      const submission = await p.homeworkSubmission.create({
        data: {
          schoolId: target.schoolId,
          homeworkAssignmentId: graph.homework.id,
          homeworkTargetId: target.id,
          studentId: target.studentId,
          enrollmentId: target.enrollmentId,
          bodyText: 'Existing draft',
        },
      });
      const single = student + '/submission/answers/' + q.id;
      for (const response of [
        await h.http().get(student).set(h.headers('student')),
        await h
          .http()
          .patch(single)
          .set(h.headers('student'))
          .send({ textAnswer: '1' }),
        await h
          .http()
          .put(student + '/submission/answers')
          .set(h.headers('student'))
          .send({ answers: [{ questionId: q.id, textAnswer: '1' }] }),
        await h
          .http()
          .post(student + '/submit')
          .set(h.headers('student'))
          .send({ bodyText: 'Legacy' }),
      ]) {
        refused(response.status);
        safe(response.body);
      }
      await f.asMediaActor('student', () =>
        expect(
          repository.mutateTypedStudentSubmission({
            schoolId: target.schoolId,
            homeworkAssignmentId: graph.homework.id,
            homeworkTargetId: target.id,
            studentId: target.studentId,
            enrollmentId: target.enrollmentId,
            permission: 'homework.answers.manage',
            answers: [{ questionId: q.id, textAnswer: '1' }],
            finalAnswers: false,
          }),
        ).rejects.toThrow(),
      );
      await f.asMediaActor('student', () =>
        expect(
          repository.upsertSubmissionAnswer({
            data: {
              schoolId: target.schoolId,
              homeworkAssignmentId: graph.homework.id,
              homeworkTargetId: target.id,
              homeworkSubmissionId: submission.id,
              homeworkQuestionId: q.id,
              textAnswer: '1',
            },
            update: { textAnswer: '1' },
          }),
        ).rejects.toThrow(),
      );
      await f.asMediaActor('student', () =>
        expect(
          repository.submitSubmission({
            schoolId: target.schoolId,
            homeworkAssignmentId: graph.homework.id,
            homeworkTargetId: target.id,
            studentId: target.studentId,
            enrollmentId: target.enrollmentId,
            bodyText: 'Legacy',
            submissionStatus: 'SUBMITTED',
            targetStatus: 'SUBMITTED',
            submittedAt: new Date(),
            validateCurrent: () => ({
              bodyText: 'Legacy',
              submittedAt: new Date(),
              submissionStatus: 'SUBMITTED',
              targetStatus: 'SUBMITTED',
            }),
          }),
        ).rejects.toThrow(),
      );
      expect(
        await p.homeworkSubmissionAnswer.count({
          where: { homeworkSubmissionId: submission.id },
        }),
      ).toBe(0);
      expect(
        await p.homeworkSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        }),
      ).toEqual(submission);
      await p.homeworkSubmission.update({
        where: { id: submission.id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
      const before = await p.homeworkSubmission.findUniqueOrThrow({
        where: { id: submission.id },
      });
      const reviewInput = {
        schoolId: target.schoolId,
        homeworkAssignmentId: graph.homework.id,
        submissionId: submission.id,
        homeworkTargetId: target.id,
        studentId: target.studentId,
        enrollmentId: target.enrollmentId,
        reviewedByUserId: f.actors.teacher.userId,
        reviewedAt: new Date(),
        reviewNote: 'Review',
        awardedMarks: null,
      };
      const final = await h
        .http()
        .post(teacher + '/submissions/' + submission.id + '/review')
        .set(h.headers())
        .send({ reviewNote: 'Review' });
      refused(final.status);
      safe(final.body);
      await f.asMediaActor('teacher', () =>
        expect(repository.reviewSubmission(reviewInput)).rejects.toThrow(),
      );
      expect(
        await p.homeworkSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        }),
      ).toEqual(before);
      const answer = await p.homeworkSubmissionAnswer.create({
        data: {
          schoolId: target.schoolId,
          homeworkAssignmentId: graph.homework.id,
          homeworkTargetId: target.id,
          homeworkSubmissionId: submission.id,
          homeworkQuestionId: q.id,
          textAnswer: 'Legacy response',
          answerJson: { private: sentinel },
        },
      });
      const reviewPath =
        teacher +
        '/submissions/' +
        submission.id +
        '/answers/' +
        answer.id +
        '/review';
      const reviewRead = await h
        .http()
        .get(teacher + '/submissions/' + submission.id + '/answers')
        .set(h.headers());
      refused(reviewRead.status);
      safe(reviewRead.body);
      const review = await h
        .http()
        .patch(reviewPath)
        .set(h.headers())
        .send({ awardedPoints: 1 });
      refused(review.status);
      safe(review.body);
      await f.asMediaActor('teacher', () =>
        expect(
          repository.reviewSubmissionAnswers({
            ...reviewInput,
            awardedMarks: 1,
            reviews: [
              {
                answerId: answer.id,
                homeworkQuestionId: q.id,
                awardedPoints: 1,
                teacherComment: 'Reviewed',
                reviewedAt: new Date(),
                reviewedByUserId: f.actors.teacher.userId,
              },
            ],
          }),
        ).rejects.toThrow(),
      );
      expect(
        await p.homeworkSubmissionAnswer.findUniqueOrThrow({
          where: { id: answer.id },
        }),
      ).toEqual(answer);
      for (const actor of ['otherStudent', 'foreignStudent'] as const) {
        const denied = await h.http().get(student).set(h.headers(actor));
        expect(denied.status).toBe(404);
        safe(denied.body);
      }
    },
  );
});
