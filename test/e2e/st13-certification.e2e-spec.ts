import { St12GradesHttp, ST12_TYPES } from '../fixtures/st12-grades.http';
import type { GradeReleasedReviewResponseDto } from '../../src/modules/grades/assessments/dto/grade-review.dto';

describe('ST13 real HTTP authorization, confidentiality and transaction certification', () => {
  jest.setTimeout(180000);
  const h = new St12GradesHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeSt12Case());
  afterAll(() => h.close());

  it.each(ST12_TYPES)(
    'ST13-AUDIENCE %s separates NONE, DETAILS, approved KEYS and revoked Student/Parent reads',
    async (type) => {
      const draft = await h.draft(type);
      await h.approveKey(draft);
      const f = await h.submitDraft(draft);
      for (const audience of ['student', 'parent'] as const)
        await h
          .http()
          .get(h.reviewPath(f, audience))
          .set(h.headers(audience))
          .expect(404);
      await h.manual(f, 1, 'ST13 authorized private feedback');
      await h.finalize(f);
      await h.approvePaper(f);
      await h
        .release(f, 'DETAILS', 'DETAILS')
        .then((r) => expect(r.status).toBe(200));
      for (const audience of ['student', 'parent'] as const) {
        const response = await h
          .http()
          .get(h.reviewPath(f, audience))
          .set(h.headers(audience))
          .expect(200);
        const details = response.body as GradeReleasedReviewResponseDto;
        expect(details.level).toBe('DETAILS');
        expect(details.questions).toHaveLength(1);
        expect(details.questions[0].canonicalType).toBe(type);
        expect(details.questions[0].answer?.awardedPoints).toBe(1);
        expect(details.questions[0].answer?.reviewerComment).toBe(
          'ST13 authorized private feedback',
        );
        expect(details.questions[0].correctAnswerAvailable).toBe(false);
        for (const privateField of [
          'answerKey',
          'metadata',
          'isCorrect',
          'correctAnswer',
        ])
          expect(JSON.stringify(details)).not.toContain(`"${privateField}":`);
      }
      await h
        .release(f, 'KEYS', 'KEYS', 1)
        .then((r) => expect(r.status).toBe(200));
      for (const audience of ['student', 'parent'] as const) {
        const response = await h
          .http()
          .get(h.reviewPath(f, audience))
          .set(h.headers(audience))
          .expect(200);
        const keys = response.body as GradeReleasedReviewResponseDto;
        expect(keys.level).toBe('KEYS');
        expect(keys.questions[0].correctAnswerAvailable).toBe(true);
        expect(keys.questions[0].correctAnswer).toEqual(expect.any(Object));
        expect(JSON.stringify(keys)).not.toContain('"answerKey":');
        expect(JSON.stringify(keys)).not.toContain('"isCorrect":');
      }
      await h
        .release(f, 'NONE', 'NONE', 2)
        .then((r) => expect(r.status).toBe(200));
      for (const audience of ['student', 'parent'] as const)
        await h
          .http()
          .get(h.reviewPath(f, audience))
          .set(h.headers(audience))
          .expect(404);
      const legacy = await h
        .http()
        .get(f.student + '/submission')
        .set(h.headers('student'))
        .expect(200);
      expect(JSON.stringify(legacy.body)).not.toContain(
        'ST13 authorized private feedback',
      );
      expect(
        await h.prisma.gradeItem.count({
          where: { assessmentId: f.assessmentId },
        }),
      ).toBe(0);
      const current = await h.prisma.gradeSubmission.findUniqueOrThrow({
        where: { id: f.submissionId },
      });
      expect(current.totalScore?.toFixed(2)).toBe('1.00');
    },
  );

  it('ST13-SYNC-AUDIT rolls back GradeItem synchronization when its committed audit cannot be written', async () => {
    const f = await h.submitDraft(await h.draft());
    await h.manual(f);
    await h.finalize(f);
    await h.prisma.$executeRawUnsafe(
      "ALTER TABLE audit_logs ADD CONSTRAINT st13_owned_sync_audit_failure CHECK(action <> 'grades.submission.grade_item.sync') NOT VALID",
    );
    try {
      await h
        .http()
        .post(`/api/v1/grades/submissions/${f.submissionId}/sync-grade-item`)
        .set(h.headers('admin'))
        .expect(500);
      expect(
        await h.prisma.gradeItem.count({
          where: { assessmentId: f.assessmentId },
        }),
      ).toBe(0);
      expect(
        await h.prisma.auditLog.count({
          where: {
            resourceId: f.submissionId,
            action: 'grades.submission.grade_item.sync',
          },
        }),
      ).toBe(0);
      const current = await h.prisma.gradeSubmission.findUniqueOrThrow({
        where: { id: f.submissionId },
      });
      expect(current.totalScore?.toFixed(2)).toBe('1.00');
      expect(current.status).toBe('CORRECTED');
    } finally {
      await h.prisma.$executeRawUnsafe(
        'ALTER TABLE audit_logs DROP CONSTRAINT st13_owned_sync_audit_failure',
      );
    }
  });

  it('ST13-RACE-05 invalidates approval when the same question revision changes concurrently', async () => {
    const draft = await h.draft();
    const revision = draft.question.updatedAt;
    const responses = await h.heldLock(
      (tx) => tx.$queryRaw`
        SELECT id FROM grade_assessments WHERE id=${draft.assessmentId}::uuid FOR UPDATE
      `,
      [
        () =>
          h
            .http()
            .post(`${draft.core}/questions/${draft.question.id}/key-approval`)
            .set(h.headers('admin'))
            .send({ expectedQuestionUpdatedAt: revision }),
        () =>
          h
            .http()
            .patch(`${draft.teacher}/authoring/questions/${draft.question.id}`)
            .set(h.headers())
            .send({
              expectedQuestionUpdatedAt: revision,
              prompt: 'Revised after approval snapshot',
            }),
      ],
    );
    expect([201, 409]).toContain(responses[0].status);
    expect(responses[1].status).toBe(200);
    const current = await h.prisma.gradeAssessmentQuestion.findUniqueOrThrow({
      where: { id: draft.question.id },
    });
    expect(current.prompt).toBe('Revised after approval snapshot');
    const submitted = await h.submitDraft(draft);
    const suggestion = await h.evaluate(submitted);
    expect(suggestion.reason).toBe('KEY_NOT_APPROVED');
    expect(suggestion.suggestedPoints).toBeNull();
    expect(
      await h.prisma.gradeItem.count({
        where: { assessmentId: draft.assessmentId },
      }),
    ).toBe(0);
  });

  it('ST13-RACE-10 rejects synchronization after a concurrently committed assessment lock', async () => {
    const f = await h.submitDraft(await h.draft());
    await h.manual(f);
    await h.finalize(f);
    await h.approvePaper(f);
    const responses = await h.heldLock(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM grade_assessments WHERE id=${f.assessmentId}::uuid FOR UPDATE
        `;
        await tx.gradeAssessment.update({
          where: { id: f.assessmentId },
          data: { lockedAt: new Date() },
        });
      },
      [
        () =>
          h
            .http()
            .post(
              `/api/v1/grades/submissions/${f.submissionId}/sync-grade-item`,
            )
            .set(h.headers('admin')),
      ],
    );
    expect(responses[0].status).toBe(409);
    expect(
      await h.prisma.gradeItem.count({
        where: { assessmentId: f.assessmentId },
      }),
    ).toBe(0);
    expect(
      await h.prisma.auditLog.count({
        where: {
          resourceId: f.submissionId,
          action: 'grades.submission.grade_item.sync',
        },
      }),
    ).toBe(0);
    const submission = await h.prisma.gradeSubmission.findUniqueOrThrow({
      where: { id: f.submissionId },
    });
    expect(submission.status).toBe('CORRECTED');
    expect(submission.totalScore?.toFixed(2)).toBe('1.00');
  });
});
