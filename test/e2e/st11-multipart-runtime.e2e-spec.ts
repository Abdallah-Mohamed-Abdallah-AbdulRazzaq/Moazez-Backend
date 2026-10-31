import {
  St11MultipartHttp,
  groupAssetStimulus,
} from '../fixtures/st11-multipart.http';
import type { St10bDomain } from '../fixtures/st10b-runtime.http';
import type { QuestionGroupContext } from '../../src/common/question-groups/question-group.projection';
import { st06Json } from '../fixtures/homework-question-assets.http';

describe('ST11-B real multipart eleven-type runtime and manual score preservation', () => {
  jest.setTimeout(180000);
  const h = new St11MultipartHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeMultipartCase());
  afterAll(() => h.close());
  it.each(['Homework', 'Grades'] as St10bDomain[])(
    '%s accepts an independently configured file-only child inside a group without fake text',
    async (domain) => {
      const f = await h.grouped(domain);
      const q =
        domain === 'Homework'
          ? await h.prisma.homeworkQuestion.findFirstOrThrow({
              where: {
                homeworkAssignmentId: f.parentId,
                type: 'SHORT_TEXT',
                deletedAt: null,
              },
            })
          : await h.prisma.gradeAssessmentQuestion.findFirstOrThrow({
              where: {
                assessmentId: f.parentId,
                type: 'SHORT_ANSWER',
                deletedAt: null,
              },
            });
      const authorQuestion =
        domain === 'Homework'
          ? f.authorPath + '/questions/' + q.id
          : '/api/v1/grades/questions/' + q.id;
      await h
        .http()
        .patch(authorQuestion)
        .set(h.headers(f.author))
        .send({
          responseConfig: { version: 1, mode: 'FILE_ONLY', maxFiles: 1 },
        })
        .expect(200);
      await h
        .http()
        .put(f.groups + '/layout')
        .set(h.headers(f.author))
        .send({
          questions: [
            {
              questionId: q.id,
              expectedGroupId: q.groupId,
              groupId: f.groupId,
              layoutOrder: 2,
            },
          ],
          blocks: [],
        })
        .expect(200);
      await h
        .http()
        .post(f.publish)
        .set(h.headers(f.author))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      let media = f.student + '/questions/' + q.id;
      if (domain === 'Grades') {
        await h
          .http()
          .post(f.student + '/start')
          .set(h.headers('student'))
          .expect(201);
        const submission = await h.prisma.gradeSubmission.findFirstOrThrow({
          where: {
            assessmentId: f.parentId,
            studentId: h.fixture.children[0].studentId,
          },
        });
        media =
          f.student + '/submissions/' + submission.id + '/questions/' + q.id;
      }
      const uploaded = await h.bindReady(
        media,
        Buffer.from('Canonical grouped child answer'),
      );
      await h
        .http()
        .put(f.student + '/submission/answers')
        .set(h.headers('student'))
        .send({ answers: f.answers.filter((a) => a.questionId !== q.id) })
        .expect(200);
      await h
        .http()
        .post(f.student + '/submission/submit')
        .set(h.headers('student'))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      if (domain === 'Homework') {
        const answer = await h.prisma.homeworkSubmissionAnswer.findFirstOrThrow(
          { where: { homeworkQuestionId: q.id } },
        );
        expect(answer.textAnswer).toBeNull();
        expect(answer.answerJson).toBeNull();
        expect(
          await h.prisma.homeworkAnswerAsset.count({
            where: {
              homeworkSubmissionAnswerId: answer.id,
              fileId: uploaded.asset.fileId,
              deletedAt: null,
            },
          }),
        ).toBe(1);
      } else {
        const answer = await h.prisma.gradeSubmissionAnswer.findFirstOrThrow({
          where: { questionId: q.id },
        });
        expect(answer.answerText).toBeNull();
        expect(answer.answerJson).toBeNull();
        expect(
          await h.prisma.gradeSubmissionAnswerAsset.count({
            where: {
              answerId: answer.id,
              fileId: uploaded.asset.fileId,
              deletedAt: null,
            },
          }),
        ).toBe(1);
      }
    },
  );
  it.each(['Homework', 'Grades'] as St10bDomain[])(
    '%s preserves canonical child answers, legacy order, review and explicit sync',
    async (domain) => {
      const f = await h.grouped(domain);
      const source = await h.fixture.ready(
        f.parentId,
        f.author,
        Buffer.from('Optional shared display'),
        domain === 'Homework'
          ? 'HOMEWORK_ASSIGNMENT_MEDIA'
          : 'GRADE_ASSESSMENT_MEDIA',
      );
      const attached = await h
        .http()
        .post(f.groups + '/' + f.groupId + '/assets')
        .set(h.headers(f.author))
        .send({
          sourceType: 'MANAGED_FILE',
          uploadId: source.uploadId,
          fileId: source.fileId,
        })
        .expect(201);
      const sharedAsset = st06Json<{ id: string }>(attached);
      await h
        .http()
        .patch(f.groups + '/' + f.groupId)
        .set(h.headers(f.author))
        .send({ sharedStimulus: groupAssetStimulus(sharedAsset.id) })
        .expect(200);
      expect(f.context.groups[0].points).toBe('2.00');
      expect(f.context.groups[0].questionIds).toEqual([
        f.answers[1].questionId,
        f.answers[0].questionId,
      ]);
      const before =
        domain === 'Homework'
          ? await h.prisma.homeworkQuestion.findMany({
              where: { homeworkAssignmentId: f.parentId, deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              select: { id: true, sortOrder: true },
            })
          : await h.prisma.gradeAssessmentQuestion.findMany({
              where: { assessmentId: f.parentId, deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              select: { id: true, sortOrder: true },
            });
      expect(before).toHaveLength(11);
      await h
        .http()
        .put(f.groups + '/layout')
        .set(h.headers(f.author))
        .send({
          questions: [],
          blocks: [
            { kind: 'group', id: f.groupId, layoutOrder: 100 },
            { kind: 'question', id: f.answers[2].questionId, layoutOrder: 0 },
          ],
        })
        .expect(200);
      const after =
        domain === 'Homework'
          ? await h.prisma.homeworkQuestion.findMany({
              where: { homeworkAssignmentId: f.parentId, deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              select: { id: true, sortOrder: true },
            })
          : await h.prisma.gradeAssessmentQuestion.findMany({
              where: { assessmentId: f.parentId, deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              select: { id: true, sortOrder: true },
            });
      expect(after).toEqual(before);
      let linked: string | null = null;
      if (domain === 'Homework') {
        const a = await h.fixture.assessment('teacher', true);
        linked = a.id;
        await h.prisma.gradeAssessment.update({
          where: { id: a.id },
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
          .send({ gradeAssessmentId: a.id })
          .expect(200);
      }
      if (domain === 'Grades') {
        await h.prisma.gradeAssessment.update({
          where: { id: f.parentId },
          data: { maxScore: 12 },
        });
        await h
          .http()
          .post(f.publish)
          .set(h.headers(f.author))
          .send({})
          .expect(422);
        await h.prisma.gradeAssessment.update({
          where: { id: f.parentId },
          data: { maxScore: 11 },
        });
      }
      await h
        .http()
        .post(f.publish)
        .set(h.headers(f.author))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      await h.prisma.file.update({
        where: { id: source.fileId },
        data: { deletedAt: new Date() },
      });
      if (domain === 'Grades')
        await h
          .http()
          .post(f.student + '/start')
          .set(h.headers('student'))
          .expect(201);
      const detail = await h
        .http()
        .get(f.student)
        .set(h.headers('student'))
        .expect(200);
      const body = st06Json<{
        homework?: QuestionGroupContext & { questions: object[] };
        groups?: QuestionGroupContext['groups'];
        displayItems?: QuestionGroupContext['displayItems'];
        questions?: object[];
        stages?: Array<{ questions: object[] }>;
      }>(detail);
      const layout = domain === 'Homework' ? body.homework! : body;
      expect(layout.groups).toHaveLength(1);
      expect(layout.groups![0].sharedStimulusSupported).toBe(false);
      expect(layout.groups![0]).not.toHaveProperty('sharedStimulus');
      expect(layout.displayItems).toHaveLength(10);
      expect(
        domain === 'Homework' ? layout.questions : body.stages![0].questions,
      ).toHaveLength(11);
      expect(JSON.stringify(layout.groups)).not.toMatch(
        /"(?:answerKey|isCorrect|bucket|objectKey)"/u,
      );
      await h
        .http()
        .put(f.student + '/submission/answers')
        .set(h.headers('student'))
        .send({ answers: f.answers })
        .expect(200);
      await h
        .http()
        .post(f.student + '/submission/submit')
        .set(h.headers('student'))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      const rows =
        domain === 'Homework'
          ? await h.prisma.homeworkSubmissionAnswer.findMany({
              where: { homeworkAssignmentId: f.parentId },
            })
          : await h.prisma.gradeSubmissionAnswer.findMany({
              where: { assessmentId: f.parentId },
            });
      expect(rows).toHaveLength(11);
      expect(rows.every((r) => r.awardedPoints === null)).toBe(true);
      expect(
        await h.prisma.gradeItem.count({
          where: { schoolId: h.fixture.school.schoolId },
        }),
      ).toBe(0);
      const first = rows[0],
        submissionId =
          'homeworkSubmissionId' in first
            ? first.homeworkSubmissionId
            : first.submissionId;
      const reviews = rows.map((r: { id: string }) => ({
        answerId: r.id,
        awardedPoints: 1,
      }));
      const review =
        domain === 'Homework'
          ? f.authorPath + `/submissions/${submissionId}/answers/review`
          : `/api/v1/grades/submissions/${submissionId}/answers/review`;
      await h
        .http()
        .put(review)
        .set(h.headers(f.author))
        .send(domain === 'Homework' ? { answers: reviews } : { reviews })
        .expect(200);
      await h
        .http()
        .post(
          domain === 'Homework'
            ? f.authorPath + `/submissions/${submissionId}/review`
            : `/api/v1/grades/submissions/${submissionId}/review/finalize`,
        )
        .set(h.headers(f.author))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      expect(
        await h.prisma.gradeItem.count({
          where: { schoolId: h.fixture.school.schoolId },
        }),
      ).toBe(0);
      await h
        .http()
        .post(
          domain === 'Homework'
            ? `/api/v1/homework/assignments/${f.parentId}/submissions/${submissionId}/grade-sync`
            : `/api/v1/grades/submissions/${submissionId}/sync-grade-item`,
        )
        .set(h.headers('admin'))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      const item = await h.prisma.gradeItem.findFirstOrThrow({
        where: {
          assessmentId: linked ?? f.parentId,
          studentId: h.fixture.children[0].studentId,
        },
      });
      expect(Number(item.score)).toBe(11);
      if (domain === 'Homework') {
        for (const [path, actor] of [
          [f.authorPath + '/submissions/' + submissionId, 'teacher'],
          [
            '/api/v1/homework/assignments/' +
              f.parentId +
              '/submissions/' +
              submissionId,
            'admin',
          ],
        ] as const) {
          const result = st06Json<{ submission: QuestionGroupContext }>(
            await h.http().get(path).set(h.headers(actor)).expect(200),
          );
          expect(result.submission.groups).toHaveLength(1);
          expect(result.submission.groups[0].sharedStimulusSupported).toBe(
            false,
          );
        }
      } else {
        for (const [path, actor] of [
          ['/api/v1/student/grades/assessments/' + f.parentId, 'student'],
          [
            '/api/v1/teacher/classroom/' +
              h.fixture.allocations.teacher +
              '/grades/assessments/' +
              f.parentId,
            'teacher',
          ],
          ['/api/v1/grades/submissions/' + submissionId, 'admin'],
        ] as const) {
          const result = st06Json<QuestionGroupContext>(
            await h.http().get(path).set(h.headers(actor)).expect(200),
          );
          expect(result.groups).toHaveLength(1);
          expect(result.groups[0].sharedStimulusSupported).toBe(false);
        }
      }
      const frozen = await h
        .http()
        .patch(f.groups + '/' + f.groupId)
        .set(h.headers(f.author))
        .send({ title: 'Too late' });
      expect([400, 404, 409]).toContain(frozen.status);
    },
  );
});
