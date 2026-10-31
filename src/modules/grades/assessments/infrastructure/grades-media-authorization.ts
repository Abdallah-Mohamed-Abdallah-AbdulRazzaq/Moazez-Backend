import {
  authorizeGradeAssets,
  lockGradeTeacherAcademicHierarchy,
} from './grade-asset-authorization';
import { Prisma, UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireGradesScope } from '../../grades-context';
import {
  assertGradeAssessmentAccess,
  assertGradeLiveMutationPermission,
  assertGradeSubmissionAccess,
} from './grades-resource-access';
import { ownedAllocationWhere } from '../../../academics/teacher-allocation/domain/owned-allocation';
import {
  TeacherAllocationOperationalWriteGate,
  TeacherAllocationOperationalWriteGateError,
} from '../../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';

import { assertQuestionStructureMutable } from '../domain/grade-question-domain';

/** Grades remains the owner of assessment and submission eligibility. */
export async function assertGradesMediaAuthorization(
  tx: Prisma.TransactionClient,
  contextId: string,
  submission: boolean,
  gate: TeacherAllocationOperationalWriteGate,
  ownershipOnly = false,
  teacherAuthoringClassId?: string,
): Promise<void> {
  const scope = requireGradesScope();
  const absent = () => new NotFoundDomainException();
  if (teacherAuthoringClassId !== undefined) {
    if (submission) throw absent();
    await authorizeGradeAssets(
      tx,
      gate,
      { surface: 'teacher', classId: teacherAuthoringClassId, authoring: true },
      { assessmentId: contextId },
      true,
      true,
      true,
    );
    return;
  }
  if (submission) {
    if (scope.userType !== UserType.STUDENT) throw absent();
    const reference = await tx.gradeSubmission.findFirst({
      where: { id: contextId },
      select: { assessmentId: true },
    });
    if (!reference) throw absent();
    await tx.$queryRaw`SELECT id FROM grade_assessments
      WHERE id = ${reference.assessmentId}::uuid AND school_id = ${scope.schoolId}::uuid FOR SHARE`;
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT g.id FROM grade_submissions g
      JOIN grade_assessments a ON a.id = g.assessment_id AND a.school_id = g.school_id
      JOIN students s ON s.id = g.student_id AND s.school_id = g.school_id
      JOIN student_enrollments e ON e.id = g.enrollment_id AND e.student_id = s.id AND e.school_id = g.school_id
      JOIN classrooms c ON c.id = e.classroom_id AND c.school_id = g.school_id
      JOIN sections se ON se.id = c.section_id AND se.school_id = g.school_id
      JOIN grades gr ON gr.id = se.grade_id AND gr.school_id = g.school_id
      JOIN stages st ON st.id = gr.stage_id AND st.school_id = g.school_id
      JOIN academic_years ay ON ay.id = a.academic_year_id AND ay.school_id = g.school_id
      JOIN subjects su ON su.id = a.subject_id AND su.school_id = g.school_id
      JOIN terms te ON te.id = a.term_id AND te.school_id = g.school_id AND te.academic_year_id = a.academic_year_id
      WHERE g.id = ${contextId}::uuid AND g.school_id = ${scope.schoolId}::uuid
        AND s.user_id = ${scope.actorId}::uuid AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
        AND e.status = 'ACTIVE' AND e.ended_at IS NULL AND e.deleted_at IS NULL
        AND e.academic_year_id = a.academic_year_id AND (e.term_id IS NULL OR e.term_id = a.term_id)
        AND g.term_id = a.term_id AND a.deleted_at IS NULL
        AND c.deleted_at IS NULL AND se.deleted_at IS NULL AND gr.deleted_at IS NULL
        AND st.deleted_at IS NULL AND ay.deleted_at IS NULL AND te.deleted_at IS NULL
        AND su.deleted_at IS NULL AND su.is_active = true
        AND ((a.scope_type = 'SCHOOL' AND a.scope_key = g.school_id)
          OR (a.scope_type = 'STAGE' AND a.scope_key = gr.stage_id)
          OR (a.scope_type = 'GRADE' AND a.scope_key = gr.id)
          OR (a.scope_type = 'SECTION' AND a.scope_key = se.id)
          OR (a.scope_type = 'CLASSROOM' AND a.scope_key = c.id))
        AND EXISTS (SELECT 1 FROM teacher_subject_allocations ta JOIN subjects su ON su.id = ta.subject_id
          WHERE ta.school_id = g.school_id AND ta.classroom_id = c.id AND ta.term_id = a.term_id
            AND ta.subject_id = a.subject_id AND su.deleted_at IS NULL AND su.is_active = true FOR SHARE OF ta, su)
        ${
          ownershipOnly
            ? Prisma.empty
            : Prisma.sql`AND g.status = 'IN_PROGRESS' AND a.locked_at IS NULL
          AND a.approval_status IN ('PUBLISHED', 'APPROVED') AND te.is_active = true AND te.deleted_at IS NULL`
        }
      FOR UPDATE OF g FOR SHARE OF s, e, c, se, gr, st, te, ay, su`;
    if (!rows.length) throw absent();
    await assertGradeSubmissionAccess(tx, contextId);
    return;
  }
  if (scope.userType === UserType.TEACHER) {
    const allocations = await tx.teacherSubjectAllocation.findMany({
      where: ownedAllocationWhere(scope.actorId),
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (!allocations.length) throw absent();
    try {
      await gate.lock(tx, {
        schoolId: scope.schoolId,
        allocationIds: allocations.map((row) => row.id),
        expectedTeacherUserId: scope.actorId,
      });
    } catch (error) {
      if (error instanceof TeacherAllocationOperationalWriteGateError)
        throw absent();
      throw error;
    }
  }
  const live = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT a.id FROM grade_assessments a
    JOIN terms te ON te.id = a.term_id AND te.school_id = a.school_id AND te.academic_year_id = a.academic_year_id
    JOIN subjects su ON su.id = a.subject_id AND su.school_id = a.school_id
    JOIN academic_years ay ON ay.id = a.academic_year_id AND ay.school_id = a.school_id
    WHERE a.id = ${contextId}::uuid AND a.school_id = ${scope.schoolId}::uuid
      AND a.deleted_at IS NULL AND te.deleted_at IS NULL
      AND su.deleted_at IS NULL AND su.is_active = true AND ay.deleted_at IS NULL
    FOR UPDATE OF a FOR SHARE OF te, su, ay`;
  if (!live.length) throw absent();
  if (ownershipOnly) await assertGradeAssessmentAccess(tx, contextId);
  else {
    await assertGradeLiveMutationPermission(tx, 'grades.questions.manage');
    const assessment = await tx.gradeAssessment.findFirst({
      where: { id: contextId, deletedAt: null },
      include: { term: true, _count: { select: { submissions: true } } },
    });
    if (!assessment) throw absent();
    await assertGradeAssessmentAccess(tx, contextId);
    if (scope.userType === UserType.TEACHER) {
      if (
        assessment.scopeType !== 'CLASSROOM' ||
        assessment.createdById !== scope.actorId
      )
        throw absent();
      const allocation = await tx.teacherSubjectAllocation.findFirst({
        where: {
          AND: [
            ownedAllocationWhere(scope.actorId),
            {
              classroomId: assessment.scopeKey,
              subjectId: assessment.subjectId,
              termId: assessment.termId,
              term: { academicYearId: assessment.academicYearId },
            },
          ],
        },
        select: { id: true },
      });
      if (!allocation) throw absent();
      await lockGradeTeacherAcademicHierarchy(
        tx,
        scope.schoolId,
        allocation.id,
      );
    }
    assertQuestionStructureMutable({
      assessment,
      term: assessment.term,
      submissionCount: assessment._count.submissions,
    });
  }
}
