import { randomUUID } from 'node:crypto';
import { St12GradesHttp } from '../fixtures/st12-grades.http';
import { expectSqlState } from '../fixtures/assessment-assets.fixture';

describe('ST12 real PostgreSQL exact evidence ancestry, retention and audit atomicity', () => {
  jest.setTimeout(180000);
  const h = new St12GradesHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeSt12Case());
  afterAll(() => h.close());
  it('rejects cross-tenant approvals and exact answer/student mismatches at the SQL boundary', async () => {
    const draft = await h.draft();
    await h.approveKey(draft);
    const f = await h.submitDraft(draft),
      suggestion = await h.evaluate(f);
    const school = h.fixture.school,
      foreign = h.fixture.schools[1];
    await expect(
      h.prisma.gradeQuestionKeyApproval.create({
        data: {
          schoolId: foreign.schoolId,
          assessmentId: f.assessmentId,
          questionId: f.question.id,
          questionFingerprint: 'a'.repeat(64),
          approvedById: h.fixture.actors.admin.userId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expectSqlState(
      () =>
        h.prisma.$executeRawUnsafe(
          'INSERT INTO grade_scoring_suggestions (school_id,answer_id,submission_id,assessment_id,question_id,student_id,key_approval_id,question_fingerprint,answer_fingerprint,fingerprint,evaluation_version,policy_version,outcome,reason,suggested_points,max_points,manual_review_required,evaluated_by_id,updated_at) SELECT school_id,answer_id,submission_id,assessment_id,question_id,$1::uuid,key_approval_id,question_fingerprint,answer_fingerprint,$2,evaluation_version,policy_version,outcome,reason,suggested_points,max_points,manual_review_required,evaluated_by_id,updated_at FROM grade_scoring_suggestions WHERE id=$3::uuid',
          h.fixture.children[1].studentId,
          'b'.repeat(64),
          suggestion.id,
        ),
      '23503',
    );
    await expectSqlState(
      () =>
        h.prisma.$executeRawUnsafe(
          'UPDATE grade_scoring_suggestions SET fingerprint=$1 WHERE id=$2::uuid',
          'c'.repeat(64),
          suggestion.id,
        ),
      '23514',
    );
    await expectSqlState(
      () =>
        h.prisma.$executeRawUnsafe(
          'DELETE FROM grade_scoring_suggestions WHERE id=$1::uuid',
          suggestion.id,
        ),
      '23514',
    );
    expect(
      await h.prisma.gradeScoringSuggestion.count({
        where: { schoolId: school.schoolId },
      }),
    ).toBe(1);
  });
  it('rejects partial/duplicate application and retains key approval and policy identity', async () => {
    const draft = await h.draft(),
      approval = await h.approveKey(draft);
    const f = await h.submitDraft(draft),
      suggestion = await h.evaluate(f);
    await expectSqlState(
      () =>
        h.prisma.$executeRawUnsafe(
          'UPDATE grade_scoring_suggestions SET applied_at=NOW(), applied_by_id=$1::uuid, applied_points=2 WHERE id=$2::uuid',
          h.fixture.actors.teacher.userId,
          suggestion.id,
        ),
      '23514',
    );
    await h
      .http()
      .post(f.scoring + '/' + suggestion.id + '/apply')
      .set(h.headers())
      .send({ mode: 'APPLY' })
      .expect(201);
    await expectSqlState(
      () =>
        h.prisma.$executeRawUnsafe(
          'UPDATE grade_scoring_suggestions SET applied_points=1 WHERE id=$1::uuid',
          suggestion.id,
        ),
      '23514',
    );
    await expectSqlState(
      () =>
        h.prisma.$executeRawUnsafe(
          'DELETE FROM grade_question_key_approvals WHERE id=$1::uuid',
          approval.id,
        ),
      '23514',
    );
    await h.finalize(f);
    await h.approvePaper(f);
    await h.release(f).then((response) => expect(response.status).toBe(200));
    await expectSqlState(
      () =>
        h.prisma.$executeRawUnsafe(
          "UPDATE grade_review_release_policies SET student_level='KEYS' WHERE assessment_id=$1::uuid",
          f.assessmentId,
        ),
      '23514',
    );
    const [policy] = await h.prisma.$queryRawUnsafe<
      Array<{ invoker: boolean; private: boolean }>
    >(
      "SELECT NOT p.prosecdef AS invoker, NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS private FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='enforce_grade_review_evidence_identity'",
    );
    expect(policy).toEqual({ invoker: true, private: true });
  });
  it.each(['APPLY', 'OVERRIDE'] as const)(
    'rolls back the mark, decision and audit when the final %s audit insert fails',
    async (mode) => {
      const draft = await h.draft();
      await h.approveKey(draft);
      const f = await h.submitDraft(draft);
      if (mode === 'OVERRIDE') await h.manual(f, 1);
      const suggestion = await h.evaluate(f),
        before = await h.prisma.gradeSubmissionAnswer.findUniqueOrThrow({
          where: { id: f.answerId },
        }),
        auditCount = await h.prisma.auditLog.count({
          where: { resourceId: f.answerId },
        });
      const name = 'st12_test_apply_audit_' + randomUUID().replaceAll('-', ''),
        action =
          mode === 'APPLY' ? 'grades.scoring.apply' : 'grades.scoring.override';
      await h.prisma.$executeRawUnsafe(
        'ALTER TABLE audit_logs ADD CONSTRAINT "' +
          name +
          '" CHECK(action <> ' +
          "'" +
          action +
          "') NOT VALID",
      );
      try {
        await h
          .http()
          .post(f.scoring + '/' + suggestion.id + '/apply')
          .set(h.headers())
          .send(
            mode === 'APPLY'
              ? { mode }
              : { mode, awardedPoints: 0.5, reason: 'PARTIAL_CREDIT' },
          )
          .expect(500);
        expect(
          await h.prisma.gradeSubmissionAnswer.findUniqueOrThrow({
            where: { id: f.answerId },
          }),
        ).toEqual(before);
        const evidence =
          await h.prisma.gradeScoringSuggestion.findUniqueOrThrow({
            where: { id: suggestion.id },
          });
        expect(evidence.appliedAt).toBeNull();
        expect(evidence.appliedPoints).toBeNull();
        expect(evidence.decision).toBeNull();
        expect(
          await h.prisma.auditLog.count({ where: { resourceId: f.answerId } }),
        ).toBe(auditCount);
      } finally {
        await h.prisma.$executeRawUnsafe(
          'ALTER TABLE audit_logs DROP CONSTRAINT "' + name + '"',
        );
      }
    },
  );
  it('rolls back a suggestion when its real transactional audit insert fails', async () => {
    const draft = await h.draft();
    await h.approveKey(draft);
    const f = await h.submitDraft(draft);
    const name = 'st12_test_audit_' + randomUUID().replaceAll('-', '');
    await h.prisma.$executeRawUnsafe(
      'ALTER TABLE audit_logs ADD CONSTRAINT "' +
        name +
        "\" CHECK(action <> 'grades.scoring.evaluate') NOT VALID",
    );
    try {
      await h.http().post(f.scoring).set(h.headers()).send({}).expect(500);
      expect(
        await h.prisma.gradeScoringSuggestion.count({
          where: { answerId: f.answerId },
        }),
      ).toBe(0);
      expect(
        (
          await h.prisma.gradeSubmissionAnswer.findUniqueOrThrow({
            where: { id: f.answerId },
          })
        ).awardedPoints,
      ).toBeNull();
      expect(
        await h.prisma.auditLog.count({
          where: { resourceId: f.answerId, action: 'grades.scoring.evaluate' },
        }),
      ).toBe(0);
    } finally {
      await h.prisma.$executeRawUnsafe(
        'ALTER TABLE audit_logs DROP CONSTRAINT "' + name + '"',
      );
    }
  });
});
