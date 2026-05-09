import type {
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';

export type ParentAppParentUserId = string;
export type ParentAppGuardianId = string;
export type ParentAppStudentId = string;
export type ParentAppEnrollmentId = string;
export type ParentAppClassroomId = string;

export interface ParentAppBaseContext {
  parentUserId: ParentAppParentUserId;
  schoolId: string;
  organizationId: string;
  membershipId: string;
  roleId: string;
  permissions: string[];
}

export interface ParentAppAccessibleChild {
  studentId: ParentAppStudentId;
  enrollmentId: ParentAppEnrollmentId;
  classroomId: ParentAppClassroomId;
  academicYearId: string;
  termId: string | null;
}

export interface ParentAppContext extends ParentAppBaseContext {
  guardianIds: ParentAppGuardianId[];
  children: ParentAppAccessibleChild[];
}

export interface ParentAppLinkedUserRecord {
  id: string;
  userType: UserType;
  status: UserStatus;
  deletedAt: Date | null;
}

export interface ParentAppGuardianRecord {
  id: ParentAppGuardianId;
  schoolId: string;
  organizationId: string;
  userId: string | null;
  deletedAt: Date | null;
  user: ParentAppLinkedUserRecord | null;
}

export interface ParentAppLinkedStudentRecord {
  id: ParentAppStudentId;
  schoolId: string;
  organizationId: string;
  status: StudentStatus;
  deletedAt: Date | null;
}

export interface ParentAppStudentGuardianLinkRecord {
  id: string;
  schoolId: string;
  studentId: ParentAppStudentId;
  guardianId: ParentAppGuardianId;
  student: ParentAppLinkedStudentRecord | null;
}

export interface ParentAppEnrollmentRecord {
  id: ParentAppEnrollmentId;
  schoolId: string;
  studentId: ParentAppStudentId;
  academicYearId: string;
  termId: string | null;
  classroomId: ParentAppClassroomId;
  status: StudentEnrollmentStatus;
  deletedAt: Date | null;
  student: ParentAppLinkedStudentRecord | null;
}
