import { StudentEnrollmentStatus, StudentStatus } from '@prisma/client';

export interface ReinforcementTaskAllocationScope {
  academicYearId: string | undefined;
  termId: string;
  subjectId: string;
  classroomId: string;
}

export interface ReinforcementTaskScopeCandidate {
  academicYearId: string;
  termId: string;
  subjectId: string | null;
  assignedById: string | null;
  createdById: string | null;
  assignments: Array<{
    enrollment: {
      academicYearId: string;
      termId: string | null;
      classroomId: string;
      status: StudentEnrollmentStatus;
      deletedAt: Date | null;
      student: {
        status: StudentStatus;
        deletedAt: Date | null;
      };
    };
  }>;
}

export function buildReinforcementTaskAllocationScope(allocation: {
  term?: { academicYearId: string } | null;
  termId: string;
  subjectId: string;
  classroomId: string;
}): ReinforcementTaskAllocationScope {
  return {
    academicYearId: allocation.term?.academicYearId,
    termId: allocation.termId,
    subjectId: allocation.subjectId,
    classroomId: allocation.classroomId,
  };
}

export function isTeacherAuthoredReinforcementTaskInAllocationScope(params: {
  task: ReinforcementTaskScopeCandidate;
  scope: ReinforcementTaskAllocationScope;
  teacherUserId: string;
}): boolean {
  const { task, scope, teacherUserId } = params;

  if (
    !scope.academicYearId ||
    task.academicYearId !== scope.academicYearId ||
    task.termId !== scope.termId ||
    (task.subjectId !== null && task.subjectId !== scope.subjectId) ||
    (task.assignedById !== teacherUserId && task.createdById !== teacherUserId)
  ) {
    return false;
  }

  return task.assignments.some(
    ({ enrollment }) =>
      enrollment.academicYearId === scope.academicYearId &&
      enrollment.termId === scope.termId &&
      enrollment.classroomId === scope.classroomId &&
      enrollment.status === StudentEnrollmentStatus.ACTIVE &&
      enrollment.deletedAt === null &&
      enrollment.student.status === StudentStatus.ACTIVE &&
      enrollment.student.deletedAt === null,
  );
}
