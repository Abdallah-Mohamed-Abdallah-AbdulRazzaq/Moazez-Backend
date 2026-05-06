import type {
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';

export type StudentAppStudentId = string;
export type StudentAppEnrollmentId = string;
export type StudentAppClassroomId = string;

export interface StudentAppBaseContext {
  studentUserId: string;
  schoolId: string;
  organizationId: string;
  membershipId: string;
  roleId: string;
  requestedAcademicYearId?: string;
  requestedTermId?: string;
  permissions: string[];
}

export interface StudentAppContext extends StudentAppBaseContext {
  studentId: StudentAppStudentId;
  enrollmentId: StudentAppEnrollmentId;
  classroomId: StudentAppClassroomId;
  academicYearId: string;
  termId: string | null;
}

export interface StudentAppLinkedUserRecord {
  id: string;
  userType: UserType;
  status: UserStatus;
  deletedAt: Date | null;
}

export interface StudentAppStudentRecord {
  id: StudentAppStudentId;
  schoolId: string;
  organizationId: string;
  userId: string | null;
  status: StudentStatus;
  deletedAt: Date | null;
  user: StudentAppLinkedUserRecord | null;
}

export interface StudentAppEnrollmentRecord {
  id: StudentAppEnrollmentId;
  schoolId: string;
  studentId: StudentAppStudentId;
  academicYearId: string;
  termId: string | null;
  classroomId: StudentAppClassroomId;
  status: StudentEnrollmentStatus;
  deletedAt: Date | null;
}

export interface StudentAppCurrentStudentWithEnrollment {
  context: StudentAppContext;
  student: StudentAppStudentRecord;
  enrollment: StudentAppEnrollmentRecord;
}
