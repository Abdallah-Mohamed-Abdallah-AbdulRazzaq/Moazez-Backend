import type {
  MembershipStatus,
  TeacherEmploymentStatus,
  TeacherEmploymentType,
  TeacherGender,
  TeacherWorkDay,
  UserStatus,
} from '@prisma/client';
import type {
  TeacherLifecycleCredentialProjection,
  TeacherLifecycleProfileState,
  TeacherLifecycleUserState,
} from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import type { TeacherProfileCompleteness } from '../../profile/domain/teacher-profile.types';

export type TeacherProfileCompletenessFilter = 'complete' | 'incomplete';
export type PreferredDisplayLanguage = 'AR' | 'EN';

export interface TeacherDirectoryRecord {
  id: string;
  userId: string;
  loginEmail: string;
  username: string | null;
  contactEmail: string | null;
  phone: string | null;
  teacherCode: string | null;
  firstNameAr: string | null;
  lastNameAr: string | null;
  firstNameEn: string | null;
  lastNameEn: string | null;
  displayFirstName: string;
  displayLastName: string;
  gender: TeacherGender | null;
  department: string | null;
  specialization: string | null;
  employmentType: TeacherEmploymentType | null;
  experienceYears: number | null;
  hireDate: Date | null;
  workingDays: TeacherWorkDay[];
  workStartTime: Date | null;
  workEndTime: Date | null;
  notesAr: string | null;
  notesEn: string | null;
  accountStatus: UserStatus;
  membershipStatus: MembershipStatus;
  membershipEndedAt: Date | null;
  employmentStatus: TeacherEmploymentStatus;
  profileCompleteness: TeacherProfileCompleteness;
  credentialSummary: TeacherLifecycleCredentialProjection;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeacherDirectoryPage {
  items: TeacherDirectoryRecord[];
  total: number;
}

export function composeTeacherDirectoryRecord(input: {
  user: TeacherLifecycleUserState;
  profile: TeacherLifecycleProfileState;
  membershipStatus: MembershipStatus;
  membershipEndedAt: Date | null;
  profileCompleteness: TeacherProfileCompleteness;
}): TeacherDirectoryRecord {
  return {
    id: input.profile.id,
    userId: input.user.id,
    loginEmail: input.user.loginEmail,
    username: input.user.username,
    contactEmail: input.user.contactEmail,
    phone: input.user.phone,
    teacherCode: input.profile.teacherCode,
    firstNameAr: input.profile.firstNameAr,
    lastNameAr: input.profile.lastNameAr,
    firstNameEn: input.profile.firstNameEn,
    lastNameEn: input.profile.lastNameEn,
    displayFirstName: input.user.firstName,
    displayLastName: input.user.lastName,
    gender: input.profile.gender,
    department: input.profile.department,
    specialization: input.profile.specialization,
    employmentType: input.profile.employmentType,
    experienceYears: input.profile.experienceYears,
    hireDate: input.profile.hireDate,
    workingDays: input.profile.workingDays,
    workStartTime: input.profile.workStartTime,
    workEndTime: input.profile.workEndTime,
    notesAr: input.profile.notesAr,
    notesEn: input.profile.notesEn,
    accountStatus: input.user.status,
    membershipStatus: input.membershipStatus,
    membershipEndedAt: input.membershipEndedAt,
    employmentStatus: input.profile.employmentStatus,
    profileCompleteness: input.profileCompleteness,
    credentialSummary: input.user.credential,
    createdAt: input.profile.createdAt,
    updatedAt: input.profile.updatedAt,
  };
}
