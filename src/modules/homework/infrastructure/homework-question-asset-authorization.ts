import { Prisma, UserType } from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { TeacherAllocationOperationalWriteGate } from '../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import { ownedAllocationWhere } from '../../academics/teacher-allocation/domain/owned-allocation';
import { HomeworkQuestionReadOnlyException } from '../domain/homework-question.exceptions';
import type { HomeworkAssetActor } from '../domain/homework-question-asset';
import { requireHomeworkScope } from '../homework-context';
import { assertHomeworkMediaAuthorization } from './homework-media-authorization';

const absent = () => new NotFoundDomainException();

/** Internal Rich display consumers retain their own existing route permission.
 * Asset HTTP handlers omit this argument and retain the ST06 contract. */
export type HomeworkRichReadPermission =
  | 'homework.assignments.view'
  | 'homework.assignments.manage'
  | 'homework.questions.view'
  | 'homework.questions.manage'
  | 'homework.submissions.view'
  | 'homework.submissions.review'
  | 'homework.answers.manage'
  | 'homework.submissions.save'
  | 'homework.submissions.submit';

/** Current authorization is part of the mutation transaction, not a stale app pre-read. */
export async function authorizeHomeworkQuestionAssets(
  tx: Prisma.TransactionClient,
  gate: TeacherAllocationOperationalWriteGate,
  actor: HomeworkAssetActor,
  input: { homeworkId: string; questionId?: string },
  write = false,
  managedBinding = false,
  richReadPermission?: HomeworkRichReadPermission,
  writePermission?: 'homework.assignments.manage' | 'homework.targets.manage',
  lockAuthorization = false,
) {
  const scope = requireHomeworkScope();
  const ctx = getRequestContext();
  if (
    !ctx?.activeMembership ||
    ctx.bypass.bypassSchoolScope ||
    ctx.bypass.includeSoftDeleted ||
    (actor.surface === 'core' &&
      ![UserType.SCHOOL_USER, UserType.ORGANIZATION_USER].includes(
        scope.userType as 'SCHOOL_USER' | 'ORGANIZATION_USER',
      )) ||
    (actor.surface === 'teacher' && scope.userType !== 'TEACHER') ||
    (actor.surface === 'student' && (scope.userType !== 'STUDENT' || write))
  )
    throw absent();
  if (write && richReadPermission) throw absent();
  if (
    richReadPermission === 'homework.submissions.submit' &&
    (actor.surface !== 'student' || managedBinding)
  )
    throw absent();
  const permission =
    (write ? writePermission : undefined) ??
    richReadPermission ??
    (actor.surface === 'teacher'
      ? write
        ? 'homework.questions.manage'
        : 'homework.questions.view'
      : write
        ? 'homework.assignments.manage'
        : 'homework.assignments.view');
  const required = [
    permission,
    ...(managedBinding ? ['homework.attachments.manage'] : []),
  ];
  const schools = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT s.id FROM schools s JOIN organizations o ON o.id = s.organization_id
    WHERE s.id = ${scope.schoolId}::uuid AND o.id = ${scope.organizationId}::uuid
      AND s.deleted_at IS NULL AND o.deleted_at IS NULL AND s.status = 'ACTIVE' AND o.status = 'ACTIVE'
    ${write ? Prisma.sql`FOR NO KEY UPDATE OF s FOR SHARE OF o` : lockAuthorization ? Prisma.sql`FOR SHARE OF s, o` : Prisma.empty}`);
  if (!schools.length) throw absent();
  const grants = await tx.$queryRaw<Array<{ code: string }>>(Prisma.sql`
    SELECT p.code FROM memberships m JOIN users u ON u.id = m.user_id
    JOIN roles r ON r.id = m.role_id JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p ON p.id = rp.permission_id
    WHERE m.id = ${ctx.activeMembership.membershipId}::uuid AND m.user_id = ${scope.actorId}::uuid
      AND m.role_id = ${scope.roleId}::uuid AND m.organization_id = ${scope.organizationId}::uuid
      AND (m.school_id = ${scope.schoolId}::uuid OR (m.school_id IS NULL AND m.user_type = 'ORGANIZATION_USER'))
      AND m.user_type::text = ${scope.userType} AND u.user_type::text = ${scope.userType}
      AND m.status = 'ACTIVE' AND m.ended_at IS NULL AND m.deleted_at IS NULL
      AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND r.deleted_at IS NULL
      AND (r.school_id IS NULL OR r.school_id = ${scope.schoolId}::uuid)
      AND p.code IN (${Prisma.join(required)})
    ${write || lockAuthorization ? Prisma.sql`FOR SHARE OF m, u, r, rp, p` : Prisma.empty}`);
  if (required.some((code) => !grants.some((grant) => grant.code === code)))
    throw absent();

  const findAssignment = () =>
    tx.homeworkAssignment.findFirst({
      where: {
        id: input.homeworkId,
        deletedAt: null,
        ...(actor.surface === 'teacher'
          ? {
              teacherUserId: scope.actorId,
              teacherSubjectAllocationId: actor.classId,
              teacherSubjectAllocation: {
                is: ownedAllocationWhere(scope.actorId),
              },
            }
          : {}),
      },
      select: {
        id: true,
        schoolId: true,
        status: true,
        classroomId: true,
        academicYearId: true,
        termId: true,
        subjectId: true,
        teacherUserId: true,
        teacherSubjectAllocationId: true,
        teacherSubjectAllocation: {
          select: {
            teacherUserId: true,
            classroomId: true,
            subjectId: true,
            termId: true,
            term: { select: { academicYearId: true, deletedAt: true } },
          },
        },
      },
    });
  let assignment = await findAssignment();
  if (!assignment) throw absent();
  if (write) {
    // Existing order: allocation gate, assignment row. Ownership-only keeps the
    // normal authorized read-only 409 after the locked current-state check.
    await assertHomeworkMediaAuthorization(
      tx,
      input.homeworkId,
      false,
      gate,
      true,
    );
    assignment = await findAssignment();
    if (!assignment) throw absent();
    if (assignment.status !== 'DRAFT' && !writePermission)
      throw new HomeworkQuestionReadOnlyException();
  }
  if (actor.surface === 'teacher') {
    const allocation = assignment.teacherSubjectAllocation;
    if (
      allocation.teacherUserId !== assignment.teacherUserId ||
      allocation.classroomId !== assignment.classroomId ||
      allocation.subjectId !== assignment.subjectId ||
      allocation.termId !== assignment.termId ||
      allocation.term.academicYearId !== assignment.academicYearId ||
      allocation.term.deletedAt
    )
      throw absent();
  }
  if (actor.surface === 'student') {
    if (!['PUBLISHED', 'CLOSED'].includes(assignment.status)) throw absent();
    const student = actor.student;
    const targets = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT t.id FROM homework_targets t
      JOIN students s ON s.id = t.student_id AND s.school_id = t.school_id
      JOIN student_enrollments e ON e.id = t.enrollment_id AND e.student_id = s.id AND e.school_id = t.school_id
      JOIN homework_assignments a ON a.id = t.homework_assignment_id AND a.school_id = t.school_id
      JOIN classrooms c ON c.id = a.classroom_id AND c.school_id = t.school_id
      JOIN academic_years ay ON ay.id = a.academic_year_id AND ay.school_id = t.school_id
      JOIN subjects su ON su.id = a.subject_id AND su.school_id = t.school_id
      JOIN terms te ON te.id = a.term_id AND te.school_id = t.school_id AND te.academic_year_id = a.academic_year_id
      WHERE t.homework_assignment_id = ${input.homeworkId}::uuid AND t.school_id = ${scope.schoolId}::uuid
        AND s.id = ${student.studentId}::uuid AND s.user_id = ${scope.actorId}::uuid AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
        AND e.id = ${student.enrollmentId}::uuid AND e.status = 'ACTIVE' AND e.deleted_at IS NULL AND e.ended_at IS NULL
        AND e.classroom_id = a.classroom_id AND e.academic_year_id = a.academic_year_id
        AND e.classroom_id = ${student.classroomId}::uuid AND e.academic_year_id = ${student.academicYearId}::uuid
        AND e.term_id IS NOT DISTINCT FROM ${student.termId}::uuid
        AND (${student.termId}::uuid IS NULL OR a.term_id = ${student.termId}::uuid)
        AND a.deleted_at IS NULL AND a.status IN ('PUBLISHED', 'CLOSED')
        AND c.deleted_at IS NULL AND ay.deleted_at IS NULL AND su.deleted_at IS NULL AND su.is_active = true AND te.deleted_at IS NULL`;
    if (!targets.length) throw absent();
  }
  if (input.questionId) {
    if (write)
      await tx.$queryRaw`SELECT id FROM homework_questions
      WHERE id = ${input.questionId}::uuid AND school_id = ${scope.schoolId}::uuid
        AND homework_assignment_id = ${input.homeworkId}::uuid AND deleted_at IS NULL FOR SHARE`;
    const question = await tx.homeworkQuestion.findFirst({
      where: {
        id: input.questionId,
        homeworkAssignmentId: input.homeworkId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!question) throw absent();
  }
  return { scope, assignment };
}
