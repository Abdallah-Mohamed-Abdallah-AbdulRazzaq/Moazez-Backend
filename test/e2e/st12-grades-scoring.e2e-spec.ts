import { St12GradesHttp, ST12_TYPES } from '../fixtures/st12-grades.http';
import type { GradeScoringSuggestionResponseDto } from '../../src/modules/grades/assessments/dto/grade-review.dto';

describe('ST12-C real reviewer suggestion, apply, override and stale evidence', () => {
  jest.setTimeout(180000);
  const h = new St12GradesHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeSt12Case());
  afterAll(() => h.close());
  it('refuses approval of an inconsistent complete-choice key in the real database', async () => {
    const f = await h.draft('MCQ_MULTI');
    const question = await h.prisma.gradeAssessmentQuestion.update({
      where: { id: f.question.id },
      data: { metadata: { minSelections: 1, maxSelections: 1 } },
    });
    await h.prisma.gradeAssessmentQuestionOption.updateMany({
      where: { questionId: f.question.id },
      data: { isCorrect: true },
    });
    const denied = await h
      .http()
      .post(f.core + '/questions/' + f.question.id + '/key-approval')
      .set(h.headers('admin'))
      .send({ expectedQuestionUpdatedAt: question.updatedAt.toISOString() });
    expect(denied.status).toBe(400);
    expect(
      await h.prisma.gradeQuestionKeyApproval.count({
        where: { questionId: f.question.id },
      }),
    ).toBe(0);
  });
  it.each(ST12_TYPES)(
    '%s evaluates without changing marks and requires a human decision',
    async (type) => {
      const draft = await h.draft(type);
      await h.approveKey(draft);
      const f = await h.submitDraft(draft),
        first = await h.evaluate(f),
        second = await h.evaluate(f);
      expect(second.id).toBe(first.id);
      expect(first).not.toHaveProperty('questionFingerprint');
      expect(first).not.toHaveProperty('answerFingerprint');
      const subjective = ['SHORT_ANSWER', 'ESSAY', 'MEDIA'].includes(type);
      expect(first.manualReviewRequired).toBe(subjective);
      expect(first.suggestedPoints).toBe(subjective ? null : 2);
      expect(first.outcome).toBe(
        subjective ? 'UNKNOWN_REQUIRES_MANUAL_REVIEW' : 'PROVED_EQUIVALENT',
      );
      const before = await h.prisma.gradeSubmissionAnswer.findUniqueOrThrow({
        where: { id: f.answerId },
      });
      expect(before.awardedPoints).toBeNull();
      expect(
        await h.prisma.gradeItem.count({
          where: { assessmentId: f.assessmentId },
        }),
      ).toBe(0);
      const applied = await h
        .http()
        .post(f.scoring + '/' + first.id + '/apply')
        .set(h.headers())
        .send({ mode: 'APPLY' });
      expect(applied.status).toBe(subjective ? 409 : 201);
      if (subjective)
        await h
          .http()
          .post(f.scoring + '/' + first.id + '/apply')
          .set(h.headers())
          .send({
            mode: 'OVERRIDE',
            awardedPoints: 1,
            reason: 'REVIEWER_JUDGMENT',
          })
          .expect(201);
      await h
        .http()
        .post(f.scoring + '/' + first.id + '/apply')
        .set(h.headers())
        .send({ mode: 'APPLY' })
        .expect(409);
      expect(
        await h.prisma.gradeScoringSuggestion.count({
          where: { answerId: f.answerId },
        }),
      ).toBe(1);
      expect(
        await h.prisma.gradeItem.count({
          where: { assessmentId: f.assessmentId },
        }),
      ).toBe(0);
      await h.finalize(f);
      await h.http().post(f.scoring).set(h.headers()).expect(409);
      await h
        .http()
        .get(f.scoring + '/' + first.id)
        .set(h.headers())
        .expect(200)
        .expect((response) =>
          expect(
            (response.body as GradeScoringSuggestionResponseDto).applicability,
          ).toBe('APPLIED'),
        );
    },
  );
  it.each(['answer', 'question'] as const)(
    'denies a suggestion after its %s revision changes',
    async (kind) => {
      const draft = await h.draft();
      await h.approveKey(draft);
      const f = await h.submitDraft(draft),
        suggestion = await h.evaluate(f);
      if (kind === 'answer')
        await h.prisma.gradeSubmissionAnswer.update({
          where: { id: f.answerId },
          data: { answerJson: { value: '13', unitCode: 'm' } },
        });
      else
        await h.prisma.gradeAssessmentQuestion.update({
          where: { id: f.question.id },
          data: { prompt: 'Changed historical revision' },
        });
      await h
        .http()
        .post(f.scoring + '/' + suggestion.id + '/apply')
        .set(h.headers())
        .send({ mode: 'APPLY' })
        .expect(409);
      expect(
        (
          await h.prisma.gradeSubmissionAnswer.findUniqueOrThrow({
            where: { id: f.answerId },
          })
        ).awardedPoints,
      ).toBeNull();
    },
  );
  it('serializes an explicit override against review finalization without overwriting finalized marks', async () => {
    const draft = await h.draft();
    await h.approveKey(draft);
    const f = await h.submitDraft(draft);
    await h.manual(f, 1);
    const suggestion = await h.evaluate(f);
    const responses = await h.heldLock(
      (tx) =>
        tx.$queryRawUnsafe(
          'SELECT id FROM grade_assessments WHERE id=$1::uuid FOR UPDATE',
          f.assessmentId,
        ),
      [
        () =>
          h
            .http()
            .post(f.scoring + '/' + suggestion.id + '/apply')
            .set(h.headers())
            .send({
              mode: 'OVERRIDE',
              awardedPoints: 0.5,
              reason: 'PARTIAL_CREDIT',
            }),
        () =>
          h
            .http()
            .post(
              '/api/v1/grades/submissions/' +
                f.submissionId +
                '/review/finalize',
            )
            .set(h.headers('admin'))
            .send({}),
      ],
    );
    expect([201, 409]).toContain(responses[0].status);
    expect(responses[1].status).toBe(201);
    const final = await h.prisma.gradeSubmission.findUniqueOrThrow({
        where: { id: f.submissionId },
      }),
      answer = await h.prisma.gradeSubmissionAnswer.findUniqueOrThrow({
        where: { id: f.answerId },
      });
    expect(final.status).toBe('CORRECTED');
    expect(final.totalScore?.toFixed(2)).toBe(answer.awardedPoints?.toFixed(2));
    expect(final.totalScore?.toFixed(2)).toBe(
      responses[0].status === 201 ? '0.50' : '1.00',
    );
  });
  it('keeps variable-expression proof UNKNOWN on the unchanged ST10 engine and requires manual review', async () => {
    const draft = await h.draft('MATH_EXPRESSION', {
      metadata: {
        definitionVersion: 1,
        kind: 'math_expression',
        variables: ['x'],
      },
      answerKey: { keyVersion: 1, kind: 'math_expression', expression: '2*x' },
    });
    await h.approveKey(draft);
    const f = await h.submitDraft(draft, { answerJson: { expression: 'x+x' } });
    const result = await h.evaluate(f);
    expect(result.outcome).toBe('UNKNOWN_REQUIRES_MANUAL_REVIEW');
    expect(result.suggestedPoints).toBeNull();
    await h
      .http()
      .post(f.scoring + '/' + result.id + '/apply')
      .set(h.headers())
      .send({ mode: 'APPLY' })
      .expect(409);
    expect(
      (
        await h.prisma.gradeSubmissionAnswer.findUniqueOrThrow({
          where: { id: f.answerId },
        })
      ).awardedPoints,
    ).toBeNull();
  });
  it('records an explicit override of an existing manual mark and retains the actual previous mark', async () => {
    const draft = await h.draft();
    await h.approveKey(draft);
    const f = await h.submitDraft(draft);
    await h.manual(f, 1);
    const suggestion = await h.evaluate(f);
    expect(suggestion.applicability).toBe('MANUAL_ONLY');
    await h
      .http()
      .post(f.scoring + '/' + suggestion.id + '/apply')
      .set(h.headers())
      .send({ mode: 'APPLY' })
      .expect(409);
    await h
      .http()
      .post(f.scoring + '/' + suggestion.id + '/apply')
      .set(h.headers())
      .send({ mode: 'OVERRIDE', awardedPoints: 0.5, reason: 'PARTIAL_CREDIT' })
      .expect(201);
    const history = await h.prisma.gradeScoringSuggestion.findUniqueOrThrow({
      where: { id: suggestion.id },
    });
    expect(history.previousAwardedPoints?.toFixed(2)).toBe('1.00');
    expect(history.appliedPoints?.toFixed(2)).toBe('0.50');
    const audits = await h.prisma.auditLog.findMany({
      where: { resourceId: f.answerId },
    });
    expect(
      audits.filter((audit) => audit.action === 'grades.scoring.override'),
    ).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain('reference');
    expect(JSON.stringify(audits)).not.toContain('questionFingerprint');
  });
  it('denies an old suggestion after a manual decision or approval revocation', async () => {
    const draft = await h.draft();
    const approval = await h.approveKey(draft);
    const f = await h.submitDraft(draft),
      suggestion = await h.evaluate(f);
    await h.manual(f);
    await h
      .http()
      .get(f.scoring + '/' + suggestion.id)
      .set(h.headers())
      .expect(200)
      .expect((response) =>
        expect(
          (response.body as GradeScoringSuggestionResponseDto).applicability,
        ).toBe('STALE'),
      );
    await h
      .http()
      .post(f.scoring + '/' + suggestion.id + '/apply')
      .set(h.headers())
      .send({ mode: 'APPLY' })
      .expect(409);
    const current = await h.evaluate(f);
    await h
      .http()
      .post(f.core + '/questions/' + f.question.id + '/key-approval/revoke')
      .set(h.headers('admin'))
      .send({ approvalId: approval.id })
      .expect(201);
    await h
      .http()
      .post(f.scoring + '/' + current.id + '/apply')
      .set(h.headers())
      .send({ mode: 'OVERRIDE', awardedPoints: 0, reason: 'KEY_ISSUE' })
      .expect(409);
    expect(
      (
        await h.prisma.gradeSubmissionAnswer.findUniqueOrThrow({
          where: { id: f.answerId },
        })
      ).awardedPoints?.toFixed(2),
    ).toBe('1.00');
  });
  it('serializes simultaneous applications and finalization without duplicate success or implicit sync', async () => {
    const draft = await h.draft();
    await h.approveKey(draft);
    const f = await h.submitDraft(draft),
      suggestion = await h.evaluate(f),
      path = f.scoring + '/' + suggestion.id + '/apply';
    const results = await h.heldLock(
      (tx) =>
        tx.$queryRawUnsafe(
          'SELECT id FROM grade_assessments WHERE id=$1::uuid FOR UPDATE',
          f.assessmentId,
        ),
      [
        () => h.http().post(path).set(h.headers()).send({ mode: 'APPLY' }),
        () => h.http().post(path).set(h.headers()).send({ mode: 'APPLY' }),
      ],
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await h.prisma.auditLog.count({
        where: { resourceId: f.answerId, action: 'grades.scoring.apply' },
      }),
    ).toBe(1);
    await h.finalize(f);
    expect(
      await h.prisma.gradeItem.count({
        where: { assessmentId: f.assessmentId },
      }),
    ).toBe(0);
    await h
      .http()
      .post('/api/v1/grades/submissions/' + f.submissionId + '/sync-grade-item')
      .set(h.headers('admin'))
      .expect(201);
    expect(
      await h.prisma.gradeItem.count({
        where: { assessmentId: f.assessmentId },
      }),
    ).toBe(1);
  });
  it('denies Student/Parent, wrong allocation, cross-school and mismatched answer resources', async () => {
    const draft = await h.draft(),
      f = await h.submitDraft(draft);
    for (const actor of [
      'student',
      'parent',
      'otherTeacher',
      'foreignTeacher',
    ] as const) {
      const response = await h
        .http()
        .post(f.scoring)
        .set(h.headers(actor))
        .send({});
      expect([403, 404]).toContain(response.status);
    }
    await h
      .http()
      .post(f.coreScoring)
      .set(h.headers('organization'))
      .send({})
      .expect(201)
      .expect((response) => {
        const result = response.body as GradeScoringSuggestionResponseDto;
        expect(result.suggestedPoints).toBeNull();
        expect(result.reason).toBe('KEY_NOT_APPROVED');
      });
    await h
      .http()
      .post(f.scoring.replace(f.answerId, h.fixture.children[1].studentId))
      .set(h.headers())
      .send({})
      .expect(404);
  });

  it('serializes an explicit override against apply and retains only one successful decision', async () => {
    const draft = await h.draft();
    await h.approveKey(draft);
    const f = await h.submitDraft(draft),
      suggestion = await h.evaluate(f),
      path = f.scoring + '/' + suggestion.id + '/apply';
    const results = await h.heldLock(
      (tx) =>
        tx.$queryRawUnsafe(
          'SELECT id FROM grade_assessments WHERE id=$1::uuid FOR UPDATE',
          f.assessmentId,
        ),
      [
        () => h.http().post(path).set(h.headers()).send({ mode: 'APPLY' }),
        () =>
          h
            .http()
            .post(f.coreScoring + '/' + suggestion.id + '/apply')
            .set(h.headers('admin'))
            .send({
              mode: 'OVERRIDE',
              awardedPoints: 0.5,
              reason: 'PARTIAL_CREDIT',
            }),
      ],
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const record = await h.prisma.gradeScoringSuggestion.findUniqueOrThrow({
      where: { id: suggestion.id },
    });
    expect(['APPLY', 'OVERRIDE']).toContain(record.decision);
    expect(
      (
        await h.prisma.gradeSubmissionAnswer.findUniqueOrThrow({
          where: { id: f.answerId },
        })
      ).awardedPoints?.toFixed(2),
    ).toBe(record.appliedPoints?.toFixed(2));
  });
  it('records the locked previous mark when ordinary manual review races a suggestion', async () => {
    const draft = await h.draft();
    await h.approveKey(draft);
    const f = await h.submitDraft(draft),
      suggestion = await h.evaluate(f);
    const results = await h.heldLock(
      (tx) =>
        tx.$queryRawUnsafe(
          'SELECT id FROM grade_assessments WHERE id=$1::uuid FOR UPDATE',
          f.assessmentId,
        ),
      [
        () =>
          h
            .http()
            .post(f.scoring + '/' + suggestion.id + '/apply')
            .set(h.headers())
            .send({ mode: 'APPLY' }),
        () =>
          h
            .http()
            .patch(
              '/api/v1/grades/submissions/' +
                f.submissionId +
                '/answers/' +
                f.answerId +
                '/review',
            )
            .set(h.headers('admin'))
            .send({
              awardedPoints: 1,
              reviewerComment: 'Explicit manual decision',
            }),
      ],
    );
    expect([201, 409]).toContain(results[0].status);
    expect(results[1].status).toBe(200);
    expect(
      (
        await h.prisma.gradeSubmissionAnswer.findUniqueOrThrow({
          where: { id: f.answerId },
        })
      ).awardedPoints?.toFixed(2),
    ).toBe('1.00');
    const audits = await h.prisma.auditLog.findMany({
      where: {
        resourceId: f.answerId,
        action: 'grades.submission.answer.review',
      },
      orderBy: { createdAt: 'asc' },
    });
    const latest = audits.at(-1)!;
    expect(latest.before).toMatchObject({
      awardedPoints: results[0].status === 201 ? '2.00' : null,
    });
    expect(latest.after).toMatchObject({ awardedPoints: '1.00' });
  });
});
