import { Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireGradesScope } from '../../grades-context';
import type { GradeReviewAudience } from '../domain/grade-review-policy';
import { currentParentGuardianWhere } from '../../../students/guardians/domain/current-parent-guardian';
import { assertGradeLiveMutationPermission } from './grades-resource-access';

export interface GradeReviewAudienceResource {
  assessmentId: string;
  studentId?: string;
  submissionId?: string;
  examOnly?: boolean;
}

/** Same live academic target boundary as Grades media, with exact guardian ownership. */
export async function assertGradeReviewAudienceResource(
  tx: Prisma.TransactionClient,
  audience: GradeReviewAudience,
  input: GradeReviewAudienceResource,
) {
  const scope = requireGradesScope();
  if (
    scope.userType !== audience ||
    (audience === 'PARENT' && !input.studentId)
  )
    throw new NotFoundDomainException();
  await assertGradeLiveMutationPermission(tx, 'grades.assessments.view');
  await tx.$queryRaw`SELECT id FROM grade_assessments WHERE id=${input.assessmentId}::uuid AND school_id=${scope.schoolId}::uuid AND deleted_at IS NULL FOR SHARE`;
  const rows = await tx.$queryRaw<Array<{ id: string; studentId: string }>>`
    SELECT g.id, g.student_id AS "studentId" FROM grade_submissions g
    JOIN grade_assessments a ON a.id=g.assessment_id AND a.school_id=g.school_id
    JOIN students s ON s.id=g.student_id AND s.school_id=g.school_id
    JOIN student_enrollments e ON e.id=g.enrollment_id AND e.student_id=s.id AND e.school_id=g.school_id
    JOIN classrooms c ON c.id=e.classroom_id AND c.school_id=g.school_id
    JOIN sections se ON se.id=c.section_id AND se.school_id=g.school_id
    JOIN grades gr ON gr.id=se.grade_id AND gr.school_id=g.school_id
    JOIN stages st ON st.id=gr.stage_id AND st.school_id=g.school_id
    JOIN academic_years ay ON ay.id=a.academic_year_id AND ay.school_id=g.school_id
    JOIN subjects su ON su.id=a.subject_id AND su.school_id=g.school_id
    JOIN terms te ON te.id=a.term_id AND te.school_id=g.school_id AND te.academic_year_id=a.academic_year_id
    WHERE a.id=${input.assessmentId}::uuid AND g.school_id=${scope.schoolId}::uuid
      AND s.organization_id=${scope.organizationId}::uuid AND s.status='ACTIVE' AND s.deleted_at IS NULL
      AND a.deleted_at IS NULL AND a.delivery_mode='QUESTION_BASED'
      AND e.status='ACTIVE' AND e.ended_at IS NULL AND e.deleted_at IS NULL
      AND e.academic_year_id=a.academic_year_id AND (e.term_id IS NULL OR e.term_id=a.term_id) AND g.term_id=a.term_id
      AND c.deleted_at IS NULL AND se.deleted_at IS NULL AND gr.deleted_at IS NULL AND st.deleted_at IS NULL
      AND ay.deleted_at IS NULL AND te.deleted_at IS NULL AND su.deleted_at IS NULL AND su.is_active=true
      AND ((a.scope_type='SCHOOL' AND a.scope_key=g.school_id) OR (a.scope_type='STAGE' AND a.scope_key=st.id)
        OR (a.scope_type='GRADE' AND a.scope_key=gr.id) OR (a.scope_type='SECTION' AND a.scope_key=se.id)
        OR (a.scope_type='CLASSROOM' AND a.scope_key=c.id))
      AND EXISTS (SELECT 1 FROM teacher_subject_allocations ta WHERE ta.school_id=g.school_id
        AND ta.classroom_id=c.id AND ta.term_id=a.term_id AND ta.subject_id=a.subject_id FOR SHARE OF ta)
      ${audience === 'STUDENT' ? Prisma.sql`AND s.user_id=${scope.actorId}::uuid` : Prisma.empty}
      ${input.studentId ? Prisma.sql`AND s.id=${input.studentId}::uuid` : Prisma.empty}
      ${input.submissionId ? Prisma.sql`AND g.id=${input.submissionId}::uuid` : Prisma.empty}
      ${input.examOnly ? Prisma.sql`AND a.type IN ('QUIZ','MONTH_EXAM','MIDTERM','TERM_EXAM','FINAL')` : Prisma.empty}
    FOR SHARE OF g,s,e,c,se,gr,st,ay,su,te`;
  const row = rows[0];
  if (!row || rows.length !== 1) throw new NotFoundDomainException();
  if (audience === 'PARENT') {
    const links = await tx.studentGuardian.findMany({
      where: {
        studentId: row.studentId,
        schoolId: scope.schoolId,
        guardian: {
          ...currentParentGuardianWhere(scope.actorId),
          schoolId: scope.schoolId,
          organizationId: scope.organizationId,
        },
      },
      select: { id: true },
    });
    if (!links.length) throw new NotFoundDomainException();
    const guardians = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT sg.id FROM student_guardian_links sg
      JOIN guardians g ON g.id=sg.guardian_id AND g.school_id=sg.school_id
      JOIN users u ON u.id=g.user_id
      WHERE sg.id IN (${Prisma.join(links.map((link) => Prisma.sql`${link.id}::uuid`))})
        AND sg.student_id=${row.studentId}::uuid AND sg.school_id=${scope.schoolId}::uuid
        AND g.organization_id=${scope.organizationId}::uuid AND g.deleted_at IS NULL
        AND g.user_id=${scope.actorId}::uuid AND u.user_type='PARENT' AND u.status='ACTIVE' AND u.deleted_at IS NULL
      FOR SHARE OF sg,g,u`;
    if (!guardians.length) throw new NotFoundDomainException();
  }
  return row;
}
