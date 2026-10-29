import { Prisma } from '@prisma/client';
import { evaluateMathExpression } from '../../src/common/question-evaluation';
import { st06Json } from '../fixtures/homework-question-assets.http';
import {
  st10bCases,
  st10bPrivateFields,
} from '../fixtures/st10b-question-contracts.fixture';
import {
  St10bRuntimeHttp,
  type St10bDomain,
} from '../fixtures/st10b-runtime.http';

describe('ST10-B real Student HTTP, PostgreSQL and manual review', () => {
  jest.setTimeout(180000);
  const h = new St10bRuntimeHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeRuntimeCase());
  afterAll(() => h.close());
  const safe = (body: unknown) => {
    const value = JSON.stringify(body);
    for (const field of st10bPrivateFields)
      expect(value).not.toContain('"' + field + '"');
  };
  it.each(st10bCases)(
    'Grades $type supports the existing Teacher Classroom manual review surface and withholds malformed JSON',
    async (c) => {
      const f = await h.question('Grades', c);
      await h.prisma.gradeAssessment.update({
        where: { id: f.parentId },
        data: { type: 'ASSIGNMENT' },
      });
      await h
        .http()
        .post(f.publish)
        .set(h.headers('admin'))
        .send({})
        .expect(201);
      const resolved = await h
        .http()
        .post(`/api/v1/grades/assessments/${f.parentId}/submissions/resolve`)
        .set(h.headers('student'))
        .send({
          studentId: h.fixture.children[0].studentId,
          enrollmentId: h.fixture.children[0].enrollmentId,
        })
        .expect(201);
      const submissionId = st06Json<{ id: string }>(resolved).id;
      await h
        .http()
        .put(
          `/api/v1/grades/submissions/${submissionId}/answers/${f.questionId}`,
        )
        .set(h.headers('student'))
        .send({ answerJson: c.answer })
        .expect(200);
      await h
        .http()
        .post(`/api/v1/grades/submissions/${submissionId}/submit`)
        .set(h.headers('student'))
        .send({})
        .expect(201);
      const answer = await h.prisma.gradeSubmissionAnswer.findFirstOrThrow({
        where: { submissionId, questionId: f.questionId },
      });
      // Review-only permission must never inherit author-private key access.
      await h.prisma.rolePermission.deleteMany({
        where: {
          roleId: h.fixture.actors.teacher.roleId,
          permission: {
            code: { in: ['grades.questions.view', 'grades.questions.manage'] },
          },
        },
      });
      const authorDenied = await h
        .http()
        .get(f.collection)
        .set(h.headers('teacher'));
      expect([403, 404]).toContain(authorDenied.status);
      const base = `/api/v1/teacher/classroom/${h.fixture.allocations.teacher}/assignments/${f.parentId}/submissions/${submissionId}`;
      const detail = await h
        .http()
        .get(base)
        .set(h.headers('teacher'))
        .expect(200);
      safe(detail.body);
      expect(
        st06Json<{ submission: { answers: unknown[] } }>(detail).submission
          .answers[0],
      ).toMatchObject({
        canonicalType: c.type,
        interaction: { kind: c.kind, supported: true },
        studentAnswer: { json: answer.answerJson, text: null },
      });
      await h.prisma.gradeSubmissionAnswer.update({
        where: { id: answer.id },
        data: {
          answerText: 'NO_LEGACY_FALLBACK',
          answerJson: { private: 'ST10B_MALFORMED_MUST_NOT_LEAK' },
        },
      });
      const corrupted = await h.prisma.gradeSubmissionAnswer.findUniqueOrThrow({
        where: { id: answer.id },
      });
      const withheld = await h
        .http()
        .get(base)
        .set(h.headers('teacher'))
        .expect(200);
      expect(JSON.stringify(withheld.body)).not.toContain(
        'ST10B_MALFORMED_MUST_NOT_LEAK',
      );
      expect(JSON.stringify(withheld.body)).not.toContain('NO_LEGACY_FALLBACK');
      expect(
        st06Json<{ submission: { answers: unknown[] } }>(withheld).submission
          .answers[0],
      ).toMatchObject({
        interaction: { supported: false, definition: null },
        studentAnswer: { json: null, text: null },
      });
      expect(
        await h.prisma.gradeSubmissionAnswer.findUniqueOrThrow({
          where: { id: answer.id },
        }),
      ).toEqual(corrupted);
      if (answer.answerJson === null)
        throw new Error('Owned test requires a structured answer');
      await h.prisma.gradeSubmissionAnswer.update({
        where: { id: answer.id },
        data: { answerText: null, answerJson: answer.answerJson },
      });
      const denied = await h
        .http()
        .patch(base + `/answers/${answer.id}/review`)
        .set(h.headers('otherTeacher'))
        .send({ awardedPoints: 1 });
      expect(denied.status).toBe(404);
      const reviewed = await h
        .http()
        .patch(base + `/answers/${answer.id}/review`)
        .set(h.headers('teacher'))
        .send({ awardedPoints: 1 })
        .expect(200);
      safe(reviewed.body);
      expect(st06Json<{ answer: unknown }>(reviewed).answer).toMatchObject({
        canonicalType: c.type,
        interaction: { kind: c.kind, supported: true },
        score: 1,
      });
      await h
        .http()
        .post(base + '/review/finalize')
        .set(h.headers('teacher'))
        .send({})
        .expect(201)
        .expect((response) => safe(response.body));
      expect(
        await h.prisma.gradeItem.count({ where: { assessmentId: f.parentId } }),
      ).toBe(0);
    },
  );
  describe.each<St10bDomain>(['Homework', 'Grades'])('%s', (domain) => {
    it.each(st10bCases)(
      '$type supports drafts, explicit clear, single/bulk saves, final submit and manual review without automatic marks',
      async (c) => {
        const f = await h.question(domain, c);
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
        const single = f.student + '/submission/answers/' + f.questionId;
        const bulk = f.student + '/submission/answers';
        const submit =
          f.student +
          (domain === 'Homework' ? '/submit' : '/submission/submit');
        const invalid = domain === 'Homework' ? 422 : 400;
        await h
          .http()
          .patch(single)
          .set(h.headers('student'))
          .send({ answerJson: c.partial })
          .expect(200);
        const rejectedFinal = await h
          .http()
          .post(submit)
          .set(h.headers('student'))
          .send({});
        expect(rejectedFinal.status).toBe(invalid);
        await h
          .http()
          .patch(single)
          .set(h.headers('student'))
          .send(
            domain === 'Homework'
              ? { clearAnswer: true }
              : { answerJson: null },
          )
          .expect(200);
        const row =
          domain === 'Homework'
            ? await h.prisma.homeworkSubmissionAnswer.findFirstOrThrow({
                where: { homeworkQuestionId: f.questionId },
              })
            : await h.prisma.gradeSubmissionAnswer.findFirstOrThrow({
                where: { questionId: f.questionId },
              });
        const [nullFact] =
          domain === 'Homework'
            ? await h.prisma.$queryRaw<
                Array<{ sqlNull: boolean }>
              >`SELECT answer_json IS NULL AS "sqlNull" FROM homework_submission_answers WHERE id=${row.id}::uuid`
            : await h.prisma.$queryRaw<
                Array<{ sqlNull: boolean }>
              >`SELECT answer_json IS NULL AS "sqlNull" FROM grade_submission_answers WHERE id=${row.id}::uuid`;
        expect(nullFact.sqlNull).toBe(true);
        if (domain === 'Grades') {
          const cleared = await h
            .http()
            .get(f.student + '/submission')
            .set(h.headers('student'))
            .expect(200);
          expect(
            st06Json<{ submission: { answers: unknown[] } }>(cleared).submission
              .answers[0],
          ).toMatchObject({
            answerJson: null,
            interaction: { supported: true },
          });
        }
        expect(
          (await h.http().post(submit).set(h.headers('student')).send({}))
            .status,
        ).toBe(invalid);
        const saved = await h
          .http()
          .patch(single)
          .set(h.headers('student'))
          .send({ answerJson: c.answer })
          .expect(200);
        safe(saved.body);
        const duplicate = await h
          .http()
          .put(bulk)
          .set(h.headers('student'))
          .send({
            answers: [
              { questionId: f.questionId, answerJson: c.answer },
              { questionId: f.questionId, answerJson: c.answer },
            ],
          });
        expect(duplicate.status).toBe(invalid);
        const batch = await h
          .http()
          .put(bulk)
          .set(h.headers('student'))
          .send({
            answers: [{ questionId: f.questionId, answerJson: c.answer }],
          })
          .expect(200);
        safe(batch.body);
        await h
          .http()
          .get(
            f.student +
              '/submission' +
              (domain === 'Homework' ? '/answers' : ''),
          )
          .set(h.headers('student'))
          .expect(200)
          .expect((response) => safe(response.body));
        await h
          .http()
          .patch(single)
          .set(h.headers('foreignStudent'))
          .send({ answerJson: c.answer })
          .expect(404);
        const cross = await h
          .http()
          .patch(single)
          .set(h.headers('otherStudent'))
          .send({ answerJson: c.answer });
        // A same-assessment peer owns a separate attempt; the persisted answer must stay student-bound.
        expect([404, 409]).toContain(cross.status);
        const submitted = await h
          .http()
          .post(submit)
          .set(h.headers('student'))
          .send({})
          .expect(domain === 'Homework' ? 200 : 201);
        safe(submitted.body);
        const answer =
          domain === 'Homework'
            ? await h.prisma.homeworkSubmissionAnswer.findFirstOrThrow({
                where: { homeworkQuestionId: f.questionId },
              })
            : await h.prisma.gradeSubmissionAnswer.findFirstOrThrow({
                where: {
                  questionId: f.questionId,
                  studentId: h.fixture.children[0].studentId,
                },
              });
        expect(answer.awardedPoints).toBeNull();
        const submissionId =
          'homeworkSubmissionId' in answer
            ? answer.homeworkSubmissionId
            : answer.submissionId;
        expect(
          await h.prisma.gradeItem.count({
            where: { schoolId: h.fixture.school.schoolId },
          }),
        ).toBe(0);
        await h
          .http()
          .patch(single)
          .set(h.headers('student'))
          .send({ answerJson: c.answer })
          .expect(409);
        await h
          .http()
          .post(submit)
          .set(h.headers('student'))
          .send({})
          .expect(409);
        const reviewPath =
          domain === 'Homework'
            ? f.collection.replace(/\/questions$/u, '') +
              `/submissions/${submissionId}/answers/${answer.id}/review`
            : `/api/v1/grades/submissions/${submissionId}/answers/${answer.id}/review`;
        const denied = await h
          .http()
          .patch(reviewPath)
          .set(h.headers('otherTeacher'))
          .send({ awardedPoints: 1 });
        expect([403, 404]).toContain(denied.status);
        expect(
          (
            await h
              .http()
              .patch(reviewPath)
              .set(h.headers(f.author))
              .send({ awardedPoints: 2 })
          ).status,
        ).toBe(domain === 'Homework' ? 422 : 400);
        await h
          .http()
          .patch(reviewPath)
          .set(h.headers(f.author))
          .send({
            awardedPoints: 1,
            ...(domain === 'Homework'
              ? { teacherComment: 'Manual' }
              : { reviewerComment: 'Manual' }),
          })
          .expect(200)
          .expect((response) => safe(response.body));
        const finalReview =
          domain === 'Homework'
            ? f.collection.replace(/\/questions$/u, '') +
              `/submissions/${submissionId}/review`
            : `/api/v1/grades/submissions/${submissionId}/review/finalize`;
        await h
          .http()
          .post(finalReview)
          .set(h.headers(f.author))
          .send({})
          .expect(domain === 'Homework' ? 200 : 201);
        const reviewed =
          domain === 'Homework'
            ? await h.prisma.homeworkSubmission.findUniqueOrThrow({
                where: { id: submissionId },
              })
            : await h.prisma.gradeSubmission.findUniqueOrThrow({
                where: { id: submissionId },
              });
        expect(
          Number(
            'awardedMarks' in reviewed
              ? reviewed.awardedMarks
              : reviewed.totalScore,
          ),
        ).toBe(1);
        expect(
          await h.prisma.gradeItem.count({
            where: { schoolId: h.fixture.school.schoolId },
          }),
        ).toBe(0);
        if (domain === 'Grades') {
          await h
            .http()
            .post(`/api/v1/grades/submissions/${submissionId}/sync-grade-item`)
            .set(h.headers(f.author))
            .expect(201);
          expect(
            Number(
              (
                await h.prisma.gradeItem.findFirstOrThrow({
                  where: { assessmentId: f.parentId },
                })
              ).score,
            ),
          ).toBe(1);
        }
        const parent =
          `/api/v1/parent/children/${h.fixture.children[0].studentId}/` +
          (domain === 'Homework'
            ? `homeworks/${f.parentId}`
            : `grades/assessments/${f.parentId}`);
        const parentRead = await h
          .http()
          .get(parent)
          .set(h.headers('parent'))
          .expect(200);
        safe(parentRead.body);
        await h.prisma.studentGuardian.deleteMany({
          where: { studentId: h.fixture.children[1].studentId },
        });
        await h
          .http()
          .get(
            parent.replace(
              h.fixture.children[0].studentId,
              h.fixture.children[1].studentId,
            ),
          )
          .set(h.headers('parent'))
          .expect(404);
      },
    );
    it.each(st10bCases)(
      '$type keeps optional absence valid but rejects malformed/partial supplied persisted final data',
      async (c) => {
        const f = await h.question(domain, c, false);
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
        const single = f.student + '/submission/answers/' + f.questionId;
        const submit =
          f.student +
          (domain === 'Homework' ? '/submit' : '/submission/submit');
        await h
          .http()
          .patch(single)
          .set(h.headers('student'))
          .send({ answerJson: c.partial })
          .expect(200);
        expect(
          (await h.http().post(submit).set(h.headers('student')).send({}))
            .status,
        ).toBe(domain === 'Homework' ? 422 : 400);
        if (domain === 'Homework')
          await h.prisma.homeworkSubmissionAnswer.updateMany({
            where: { homeworkQuestionId: f.questionId },
            data: { answerJson: Prisma.JsonNull },
          });
        else
          await h.prisma.gradeSubmissionAnswer.updateMany({
            where: { questionId: f.questionId },
            data: { answerJson: Prisma.JsonNull },
          });
        expect(
          (await h.http().post(submit).set(h.headers('student')).send({}))
            .status,
        ).toBe(domain === 'Homework' ? 422 : 400);
        await h
          .http()
          .patch(single)
          .set(h.headers('student'))
          .send(
            domain === 'Homework'
              ? { clearAnswer: true }
              : { answerJson: null },
          )
          .expect(200);
        // Existing Homework zero-answer content rules still require body/file when nothing is answered.
        await h
          .http()
          .post(submit)
          .set(h.headers('student'))
          .send(
            domain === 'Homework'
              ? { bodyText: 'Optional question intentionally unanswered' }
              : {},
          )
          .expect(domain === 'Homework' ? 200 : 201);
      },
    );
    it('preserves Math proof/undefined outcomes without awarding marks and rejects unsafe or over-limit syntax', async () => {
      const c = st10bCases[2],
        f = await h.question(domain, c);
      const key = { keyVersion: 1, kind: c.kind, expression: '2*(3+4)' };
      await h
        .http()
        .patch(f.questionPath)
        .set(h.headers(f.author))
        .send({
          answerKey:
            domain === 'Homework' ? { state: 'value', value: key } : key,
        })
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
      const single = f.student + '/submission/answers/' + f.questionId;
      for (const expression of [
        'globalThis.process.exit()',
        'x(2)',
        '('.repeat(33) + '1' + ')'.repeat(33),
        '1+'.repeat(65) + '1',
      ]) {
        const rejected = await h
          .http()
          .patch(single)
          .set(h.headers('student'))
          .send({ answerJson: { expression } });
        expect(rejected.status).toBe(domain === 'Homework' ? 422 : 400);
        expect(JSON.stringify(rejected.body)).not.toContain(expression);
      }
      for (const [expression, outcome] of [
        ['14', 'PROVED_EQUIVALENT'],
        ['13', 'PROVED_DIFFERENT'],
        ['x+1/0', 'UNDEFINED_EXPRESSION'],
        ['((2^16)^16)^16', 'UNKNOWN_REQUIRES_MANUAL_REVIEW'],
      ]) {
        expect(
          evaluateMathExpression(
            c.definition,
            { state: 'configured', key },
            { expression },
          ),
        ).toBe(outcome);
        const saved = await h
          .http()
          .patch(single)
          .set(h.headers('student'))
          .send({ answerJson: { expression } })
          .expect(200);
        safe(saved.body);
        expect(JSON.stringify(saved.body)).not.toContain(outcome);
        const answer =
          domain === 'Homework'
            ? await h.prisma.homeworkSubmissionAnswer.findFirstOrThrow({
                where: { homeworkQuestionId: f.questionId },
              })
            : await h.prisma.gradeSubmissionAnswer.findFirstOrThrow({
                where: { questionId: f.questionId },
              });
        expect(answer.awardedPoints).toBeNull();
      }
      expect(
        await h.prisma.gradeItem.count({
          where: { schoolId: h.fixture.school.schoolId },
        }),
      ).toBe(0);
    });
    it('accepts exact bounded Numeric strings and denies undeclared units and malformed values', async () => {
      const c = st10bCases[1],
        f = await h.question(domain, c);
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
      const single = f.student + '/submission/answers/' + f.questionId;
      for (const value of [
        '١٢٫٥٠٠',
        '۱۲٫۵۰۰',
        '1.25e1',
        '-0',
        '1.23e-100',
        '1234567890123456789012345678901234',
      ])
        await h
          .http()
          .patch(single)
          .set(h.headers('student'))
          .send({ answerJson: { value, unitCode: 'm' } })
          .expect(200);
      for (const answerJson of [
        { value: '12.5', unitCode: 'kg' },
        { value: '1e101', unitCode: 'm' },
        { value: '12345678901234567890123456789012345', unitCode: 'm' },
        { value: '1'.repeat(65), unitCode: 'm' },
        { value: 12.5, unitCode: 'm' },
      ])
        expect(
          (
            await h
              .http()
              .patch(single)
              .set(h.headers('student'))
              .send({ answerJson })
          ).status,
        ).toBe(domain === 'Homework' ? 422 : 400);
    });
  });
});
