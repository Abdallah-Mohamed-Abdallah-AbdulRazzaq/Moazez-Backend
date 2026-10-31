import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import request from 'supertest';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

type Detail = {
  gradeItem: unknown;
  submission: {
    answers: Array<{
      answerText: string | null;
      awardedPoints: number | null;
      reviewerComment: string | null;
      selectedOptions: unknown[];
    }>;
  };
};

/** Exercises real JWT-backed management transitions on the legacy suite's own rows.
 * It restores the fixture lifecycle after revocation; retained evidence remains until
 * the serial disposable owner teardown below, never through application DELETE. */
export async function exerciseLegacyStudentReviewRelease(input: {
  server: Server;
  prisma: PrismaClient;
  assessmentId: string;
  studentToken: string;
  adminToken: string;
}) {
  assertLegacyDisposableTarget();
  const { server, prisma, assessmentId, studentToken, adminToken } = input;
  const root = '/api/v1/grades/assessments/' + assessmentId;
  const detailPath = '/api/v1/student/grades/assessments/' + assessmentId;
  const student = () =>
    request(server)
      .get(detailPath)
      .set('Authorization', 'Bearer ' + studentToken);
  const exam = () =>
    request(server)
      .get('/api/v1/student/exams/' + assessmentId + '/submission')
      .set('Authorization', 'Bearer ' + studentToken);
  const management = { Authorization: 'Bearer ' + adminToken };
  const original = await prisma.gradeAssessment.findUniqueOrThrow({
    where: { id: assessmentId },
  });
  const submissions = await prisma.gradeSubmission.findMany({
    where: { assessmentId },
    include: { answers: true },
  });
  expect(submissions.length).toBeGreaterThan(0);
  const before = (await student().expect(200)).body as Detail;
  const jsonNullFacts = await prisma.$queryRaw<
    Array<{ id: string; sqlNull: boolean }>
  >`SELECT id, answer_json IS NULL AS "sqlNull" FROM grade_submission_answers WHERE assessment_id=${assessmentId}::uuid`;
  expect(before.submission.answers.length).toBeGreaterThan(0);
  for (const answer of before.submission.answers)
    expect(answer).toMatchObject({
      awardedPoints: null,
      reviewerComment: null,
    });
  await request(server)
    .get(detailPath + '/review')
    .set('Authorization', 'Bearer ' + studentToken)
    .expect(404);
  try {
    // Existing marks do not authorize disclosure. Existing manual review/finalize
    // and paper approval remain mandatory before the management release command.
    for (const submission of submissions) {
      for (const answer of submission.answers)
        await request(server)
          .patch(
            `/api/v1/grades/submissions/${submission.id}/answers/${answer.id}/review`,
          )
          .set(management)
          .send({
            awardedPoints: Number(answer.awardedPoints ?? 0),
            reviewerComment: 'ST12 legacy released feedback',
          })
          .expect(200);
      // These historical privacy fixtures intentionally contain text/raw JSON on
      // choices. They remain readable, but cannot pass current final validation.
      const historical = await request(server)
        .post(`/api/v1/grades/submissions/${submission.id}/review/finalize`)
        .set(management);
      expect(historical.status).toBe(400);
      expect((historical.body as { error: { code: string } }).error.code).toBe(
        'validation.failed',
      );
      // Construct the canonical choice state only inside this owned fixture to
      // exercise valid release; finally restores historical payload/null values.
      for (const answer of submission.answers)
        await prisma.gradeSubmissionAnswer.update({
          where: { id: answer.id },
          data: { answerText: null, answerJson: Prisma.DbNull },
        });
      const finalized = await request(server)
        .post(`/api/v1/grades/submissions/${submission.id}/review/finalize`)
        .set(management);
      expect((finalized.body as { error?: unknown }).error).toBeUndefined();
      expect(finalized.status).toBe(201);
    }
    await request(server)
      .post(root + '/approve')
      .set(management)
      .send({})
      .expect(201);
    await request(server)
      .put(root + '/review-release')
      .set(management)
      .send({
        studentLevel: 'DETAILS',
        parentLevel: 'NONE',
        expectedVersion: 0,
        requestId: randomUUID(),
      })
      .expect(200);
    const after = (await student().expect(200)).body as Detail;
    expect(after.gradeItem).toEqual(before.gradeItem);
    expect(after.submission.answers.map((a) => a.selectedOptions)).toEqual(
      before.submission.answers.map((a) => a.selectedOptions),
    );
    for (const answer of after.submission.answers) {
      expect(answer.awardedPoints).not.toBeNull();
      expect(answer.reviewerComment).toBe('ST12 legacy released feedback');
    }
    const releasedExam = (await exam().expect(200)).body as {
      submission: {
        answers: Array<{ score: number | null; feedback: string | null }>;
      };
    };
    for (const answer of releasedExam.submission.answers) {
      expect(answer.score).not.toBeNull();
      expect(answer.feedback).toBe('ST12 legacy released feedback');
    }
    expect(JSON.stringify(after)).not.toMatch(
      /"answerKey"|"isCorrect"|"correctAnswer"/u,
    );
    await request(server)
      .put(root + '/review-release')
      .set(management)
      .send({
        studentLevel: 'NONE',
        parentLevel: 'NONE',
        expectedVersion: 1,
        requestId: randomUUID(),
      })
      .expect(200);
    await request(server)
      .get(detailPath + '/review')
      .set('Authorization', 'Bearer ' + studentToken)
      .expect(404);
    const revoked = (await student().expect(200)).body as Detail;
    expect(revoked.gradeItem).toEqual(before.gradeItem);
    for (const answer of revoked.submission.answers)
      expect(answer).toMatchObject({
        awardedPoints: null,
        reviewerComment: null,
      });
    const revokedExam = (await exam().expect(200)).body as {
      submission: {
        answers: Array<{ score: number | null; feedback: string | null }>;
      };
    };
    for (const answer of revokedExam.submission.answers)
      expect(answer).toMatchObject({ score: null, feedback: null });
  } finally {
    const policy = await prisma.gradeReviewReleasePolicy.findFirst({
      where: { assessmentId },
    });
    if (
      policy &&
      (policy.studentLevel !== 'NONE' || policy.parentLevel !== 'NONE')
    )
      await request(server)
        .put(root + '/review-release')
        .set(management)
        .send({
          studentLevel: 'NONE',
          parentLevel: 'NONE',
          expectedVersion: policy.version,
          requestId: randomUUID(),
        })
        .expect(200);
    for (const submission of submissions) {
      for (const answer of submission.answers)
        await prisma.gradeSubmissionAnswer.update({
          where: { id: answer.id },
          data: {
            awardedPoints: answer.awardedPoints,
            answerText: answer.answerText,
            answerJson:
              answer.answerJson === null
                ? jsonNullFacts.find((f) => f.id === answer.id)!.sqlNull
                  ? Prisma.DbNull
                  : Prisma.JsonNull
                : answer.answerJson,
            correctionStatus: answer.correctionStatus,
            reviewerComment: answer.reviewerComment,
            reviewerCommentAr: answer.reviewerCommentAr,
            reviewedAt: answer.reviewedAt,
            reviewedById: answer.reviewedById,
            updatedAt: answer.updatedAt,
          },
        });
      await prisma.gradeSubmission.update({
        where: { id: submission.id },
        data: {
          status: submission.status,
          correctedAt: submission.correctedAt,
          reviewedById: submission.reviewedById,
          totalScore: submission.totalScore,
          maxScore: submission.maxScore,
          updatedAt: submission.updatedAt,
        },
      });
    }
    await prisma.gradeAssessment.update({
      where: { id: assessmentId },
      data: {
        approvalStatus: original.approvalStatus,
        approvedAt: original.approvedAt,
        approvedById: original.approvedById,
        lockedAt: original.lockedAt,
        updatedAt: original.updatedAt,
      },
    });
  }
}

export async function disposeLegacyReviewEvidence(
  prisma: PrismaClient,
  ownedAssessmentIds: readonly string[],
) {
  assertLegacyDisposableTarget();
  const policies = await prisma.gradeReviewReleasePolicy.findMany({
    select: { assessmentId: true },
  });
  expect(
    policies.every((p) => ownedAssessmentIds.includes(p.assessmentId)),
  ).toBe(true);
  expect(await prisma.gradeQuestionKeyApproval.count()).toBe(0);
  expect(await prisma.gradeScoringSuggestion.count()).toBe(0);
  if (policies.length)
    await prisma.$executeRaw`TRUNCATE grade_review_release_policies`;
}

function assertLegacyDisposableTarget() {
  assertDisposablePostgresTarget({
    databaseUrl: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    universalRegressionMarker:
      process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
    localDatabasePredicate: (name) => /^ci_[0-9a-f]{12,64}$/u.test(name),
    errorMessage:
      'Legacy ST12 evidence teardown requires the owned disposable serial DB',
  });
}
