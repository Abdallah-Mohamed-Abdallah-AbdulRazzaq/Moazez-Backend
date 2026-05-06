import {
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import type { RequestContext } from '../../../common/context/request-context';
import {
  StudentAppClassroomNotFoundException,
  StudentAppEnrollmentNotFoundException,
  StudentAppRequiredStudentException,
  StudentAppStudentNotFoundException,
} from './student-app-errors';
import type {
  StudentAppBaseContext,
  StudentAppContext,
  StudentAppEnrollmentRecord,
  StudentAppStudentRecord,
} from './student-app.types';

export const STUDENT_APP_STUDENT_ID_BACKING_MODEL = 'Student.id' as const;
export const STUDENT_APP_ENROLLMENT_ID_BACKING_MODEL = 'Enrollment.id' as const;
export const STUDENT_APP_CLASSROOM_ID_BACKING_MODEL =
  'Enrollment.classroomId' as const;

export function buildStudentAppBaseContextFromRequestContext(
  context: RequestContext | undefined,
): StudentAppBaseContext {
  const actor = context?.actor;
  const activeMembership = context?.activeMembership;

  if (!actor) {
    throw new StudentAppRequiredStudentException({ reason: 'actor_missing' });
  }

  if (actor.userType !== UserType.STUDENT) {
    throw new StudentAppRequiredStudentException({
      reason: 'actor_not_student',
      userType: actor.userType,
    });
  }

  if (!activeMembership) {
    throw new StudentAppRequiredStudentException({
      reason: 'active_membership_missing',
    });
  }

  return {
    studentUserId: requireContextValue(actor.id, 'studentUserId'),
    schoolId: requireContextValue(activeMembership.schoolId, 'schoolId'),
    organizationId: requireContextValue(
      activeMembership.organizationId,
      'organizationId',
    ),
    membershipId: requireContextValue(
      activeMembership.membershipId,
      'membershipId',
    ),
    roleId: requireContextValue(activeMembership.roleId, 'roleId'),
    requestedAcademicYearId: optionalContextValue(
      context?.academicContext?.academicYearId,
    ),
    requestedTermId: optionalContextValue(context?.academicContext?.termId),
    permissions: [...(activeMembership.permissions ?? [])],
  };
}

export function assertStudentAppLinkedStudent(params: {
  context: StudentAppBaseContext;
  student: StudentAppStudentRecord | null;
}): StudentAppStudentRecord {
  const { context, student } = params;

  if (!student) {
    throw new StudentAppStudentNotFoundException({
      reason: 'linked_student_missing',
    });
  }

  if (
    student.userId !== context.studentUserId ||
    student.schoolId !== context.schoolId ||
    student.organizationId !== context.organizationId ||
    student.status !== StudentStatus.ACTIVE ||
    student.deletedAt !== null
  ) {
    throw new StudentAppStudentNotFoundException({
      reason: 'linked_student_not_active_or_outside_scope',
      studentId: student.id,
    });
  }

  if (
    !student.user ||
    student.user.id !== context.studentUserId ||
    student.user.userType !== UserType.STUDENT ||
    student.user.deletedAt !== null
  ) {
    throw new StudentAppStudentNotFoundException({
      reason: 'linked_user_invalid',
      studentId: student.id,
    });
  }

  return student;
}

export function assertStudentAppActiveEnrollment(params: {
  context: StudentAppBaseContext;
  student: StudentAppStudentRecord;
  enrollment: StudentAppEnrollmentRecord | null;
}): StudentAppEnrollmentRecord {
  const { context, student, enrollment } = params;

  if (!enrollment) {
    throw new StudentAppEnrollmentNotFoundException({
      reason: 'active_enrollment_missing',
      studentId: student.id,
    });
  }

  if (
    enrollment.studentId !== student.id ||
    enrollment.schoolId !== context.schoolId ||
    enrollment.status !== StudentEnrollmentStatus.ACTIVE ||
    enrollment.deletedAt !== null
  ) {
    throw new StudentAppEnrollmentNotFoundException({
      reason: 'active_enrollment_not_owned_or_inactive',
      enrollmentId: enrollment.id,
    });
  }

  if (
    context.requestedAcademicYearId &&
    enrollment.academicYearId !== context.requestedAcademicYearId
  ) {
    throw new StudentAppEnrollmentNotFoundException({
      reason: 'active_enrollment_academic_year_mismatch',
      enrollmentId: enrollment.id,
    });
  }

  if (context.requestedTermId && enrollment.termId !== context.requestedTermId) {
    throw new StudentAppEnrollmentNotFoundException({
      reason: 'active_enrollment_term_mismatch',
      enrollmentId: enrollment.id,
    });
  }

  return enrollment;
}

export function buildStudentAppContext(params: {
  baseContext: StudentAppBaseContext;
  student: StudentAppStudentRecord;
  enrollment: StudentAppEnrollmentRecord;
}): StudentAppContext {
  const { baseContext, student, enrollment } = params;

  return {
    ...baseContext,
    studentId: student.id,
    enrollmentId: enrollment.id,
    classroomId: enrollment.classroomId,
    academicYearId: enrollment.academicYearId,
    termId: enrollment.termId,
  };
}

export function assertStudentAppOwnsStudentRecord(params: {
  context: StudentAppContext;
  student: StudentAppStudentRecord | null;
  studentId: string;
}): StudentAppStudentRecord {
  const { context, student, studentId } = params;

  if (!student || student.id !== studentId || student.id !== context.studentId) {
    throw new StudentAppStudentNotFoundException({ studentId });
  }

  return assertStudentAppLinkedStudent({ context, student });
}

export function assertStudentAppOwnsEnrollmentRecord(params: {
  context: StudentAppContext;
  enrollment: StudentAppEnrollmentRecord | null;
  enrollmentId: string;
}): StudentAppEnrollmentRecord {
  const { context, enrollment, enrollmentId } = params;

  if (
    !enrollment ||
    enrollment.id !== enrollmentId ||
    enrollment.studentId !== context.studentId
  ) {
    throw new StudentAppEnrollmentNotFoundException({ enrollmentId });
  }

  if (
    enrollment.schoolId !== context.schoolId ||
    enrollment.status !== StudentEnrollmentStatus.ACTIVE ||
    enrollment.deletedAt !== null
  ) {
    throw new StudentAppEnrollmentNotFoundException({ enrollmentId });
  }

  return enrollment;
}

export function assertStudentAppOwnsClassroomEnrollmentRecord(params: {
  context: StudentAppContext;
  enrollment: StudentAppEnrollmentRecord | null;
  classroomId: string;
}): StudentAppEnrollmentRecord {
  const { context, enrollment, classroomId } = params;

  if (
    !enrollment ||
    enrollment.classroomId !== classroomId ||
    enrollment.classroomId !== context.classroomId ||
    enrollment.studentId !== context.studentId
  ) {
    throw new StudentAppClassroomNotFoundException({ classroomId });
  }

  if (
    enrollment.schoolId !== context.schoolId ||
    enrollment.status !== StudentEnrollmentStatus.ACTIVE ||
    enrollment.deletedAt !== null
  ) {
    throw new StudentAppClassroomNotFoundException({ classroomId });
  }

  return enrollment;
}

function requireContextValue(
  value: string | null | undefined,
  field: string,
): string {
  if (!value || value.trim().length === 0) {
    throw new StudentAppRequiredStudentException({
      reason: 'student_context_incomplete',
      field,
    });
  }

  return value;
}

function optionalContextValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}
