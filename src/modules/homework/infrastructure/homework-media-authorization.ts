import { Prisma, UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { requireHomeworkScope } from '../homework-context';
import { ownedAllocationWhere } from '../../academics/teacher-allocation/domain/owned-allocation';
import {
  TeacherAllocationOperationalWriteGate,
  TeacherAllocationOperationalWriteGateError,
} from '../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';

/** Homework owns its authorization; the shared media service does not infer it. */
export async function assertHomeworkMediaAuthorization(
  tx: Prisma.TransactionClient,
  contextId: string,
  submission: boolean,
  gate: TeacherAllocationOperationalWriteGate,
  ownershipOnly = false,
): Promise<void> {
  const scope = requireHomeworkScope();
  const absent = () => new NotFoundDomainException();
  if (submission) {
    if (scope.userType !== UserType.STUDENT) throw absent();
    const target = await tx.homeworkTarget.findFirst({
      where: { id: contextId },
      select: { homeworkAssignmentId: true },
    });
    if (!target) throw absent();
    await tx.$queryRaw`
      SELECT id FROM homework_assignments WHERE id = ${target.homeworkAssignmentId}::uuid
        AND school_id = ${scope.schoolId}::uuid FOR SHARE`;
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT t.id FROM homework_targets t
      JOIN homework_assignments a ON a.id = t.homework_assignment_id AND a.school_id = t.school_id
      JOIN students s ON s.id = t.student_id AND s.school_id = t.school_id
      JOIN student_enrollments e ON e.id = t.enrollment_id AND e.student_id = s.id AND e.school_id = t.school_id
      JOIN classrooms c ON c.id = a.classroom_id AND c.school_id = t.school_id
      JOIN sections se ON se.id = c.section_id AND se.school_id = t.school_id
      JOIN grades gr ON gr.id = se.grade_id AND gr.school_id = t.school_id
      JOIN stages st ON st.id = gr.stage_id AND st.school_id = t.school_id
      JOIN academic_years ay ON ay.id = a.academic_year_id AND ay.school_id = t.school_id
      JOIN subjects su ON su.id = a.subject_id AND su.school_id = t.school_id
      JOIN terms te ON te.id = a.term_id AND te.school_id = t.school_id AND te.academic_year_id = a.academic_year_id
      WHERE t.id = ${contextId}::uuid AND t.school_id = ${scope.schoolId}::uuid
        AND s.user_id = ${scope.actorId}::uuid AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
        AND e.status = 'ACTIVE' AND e.deleted_at IS NULL AND e.ended_at IS NULL
        AND e.classroom_id = a.classroom_id AND e.academic_year_id = a.academic_year_id
        AND (e.term_id IS NULL OR e.term_id = a.term_id) AND a.deleted_at IS NULL
        AND se.deleted_at IS NULL AND gr.deleted_at IS NULL AND st.deleted_at IS NULL AND ay.deleted_at IS NULL
        AND c.deleted_at IS NULL AND su.deleted_at IS NULL AND su.is_active = true AND te.deleted_at IS NULL
        ${
          ownershipOnly
            ? Prisma.empty
            : Prisma.sql`AND a.status = 'PUBLISHED' AND t.status IN ('ASSIGNED', 'VIEWED')
          AND NOT EXISTS (SELECT 1 FROM homework_submissions h WHERE h.homework_target_id = t.id AND h.status <> 'DRAFT')`
        }
      FOR UPDATE OF t FOR SHARE OF s, e, c, se, gr, st, ay, su, te`;
    if (!rows.length) throw absent();
    return;
  }

  const reference = await tx.homeworkAssignment.findFirst({
    where: { id: contextId },
    select: { teacherSubjectAllocationId: true, teacherUserId: true },
  });
  if (!reference) throw absent();
  try {
    await gate.lock(tx, {
      schoolId: scope.schoolId,
      allocationIds: [reference.teacherSubjectAllocationId],
      ...(scope.userType === UserType.TEACHER
        ? { expectedTeacherUserId: scope.actorId }
        : {}),
    });
  } catch (error) {
    if (error instanceof TeacherAllocationOperationalWriteGateError)
      throw absent();
    throw error;
  }
  await tx.$queryRaw`SELECT id FROM homework_assignments
    WHERE id = ${contextId}::uuid AND school_id = ${scope.schoolId}::uuid FOR UPDATE`;
  const assignment = await tx.homeworkAssignment.findFirst({
    where: {
      id: contextId,
      deletedAt: null,
      ...(ownershipOnly ? {} : { status: 'DRAFT' as const }),
      teacherSubjectAllocation: {
        is: ownedAllocationWhere(
          scope.userType === UserType.TEACHER
            ? scope.actorId
            : reference.teacherUserId,
        ),
      },
      ...(scope.userType === UserType.TEACHER
        ? { teacherUserId: scope.actorId }
        : {}),
    },
    select: {
      id: true,
      classroomId: true,
      subjectId: true,
      termId: true,
      academicYearId: true,
      teacherUserId: true,
      teacherSubjectAllocation: {
        select: {
          classroomId: true,
          subjectId: true,
          termId: true,
          teacherUserId: true,
          term: { select: { academicYearId: true, deletedAt: true } },
        },
      },
    },
  });
  if (!assignment) throw absent();
  const allocation = assignment.teacherSubjectAllocation;
  if (
    allocation.classroomId !== assignment.classroomId ||
    allocation.subjectId !== assignment.subjectId ||
    allocation.termId !== assignment.termId ||
    allocation.term.academicYearId !== assignment.academicYearId ||
    allocation.teacherUserId !== assignment.teacherUserId ||
    allocation.term.deletedAt
  )
    throw absent();
}
