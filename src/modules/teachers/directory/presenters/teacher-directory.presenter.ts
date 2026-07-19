import type { TeacherDirectoryRecord } from '../domain/teacher-directory.types';
import type {
  TeacherDirectoryDetailDto,
  TeacherDirectoryListItemDto,
  TeacherCredentialSummaryDto,
} from '../dto/teacher-directory.dto';

export function presentTeacherDirectoryListItem(
  record: TeacherDirectoryRecord,
): TeacherDirectoryListItemDto {
  return {
    id: record.id,
    userId: record.userId,
    loginEmail: record.loginEmail,
    username: record.username,
    contactEmail: record.contactEmail,
    phone: record.phone,
    teacherCode: record.teacherCode,
    firstNameAr: record.firstNameAr,
    lastNameAr: record.lastNameAr,
    firstNameEn: record.firstNameEn,
    lastNameEn: record.lastNameEn,
    displayName: {
      firstName: record.displayFirstName,
      lastName: record.displayLastName,
      fullName: `${record.displayFirstName} ${record.displayLastName}`.trim(),
    },
    gender: record.gender,
    department: record.department,
    specialization: record.specialization,
    accountStatus: record.accountStatus,
    membershipStatus: record.membershipStatus,
    membershipEndedAt: toIso(record.membershipEndedAt),
    employmentStatus: record.employmentStatus,
    profileCompleteness: record.profileCompleteness,
    credentialSummary: presentCredentialSummary(record),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function presentTeacherDirectoryDetail(
  record: TeacherDirectoryRecord,
): TeacherDirectoryDetailDto {
  return {
    ...presentTeacherDirectoryListItem(record),
    employmentType: record.employmentType,
    experienceYears: record.experienceYears,
    hireDate: record.hireDate?.toISOString().slice(0, 10) ?? null,
    workingDays: record.workingDays,
    workStartTime: formatTime(record.workStartTime),
    workEndTime: formatTime(record.workEndTime),
    notesAr: record.notesAr,
    notesEn: record.notesEn,
  };
}

function presentCredentialSummary(
  record: TeacherDirectoryRecord,
): TeacherCredentialSummaryDto {
  return {
    hasPassword: record.credentialSummary.hasPassword,
    status: record.credentialSummary.status,
    mustChangePassword: record.credentialSummary.mustChangePassword,
    passwordProvisionedAt: toIso(
      record.credentialSummary.passwordProvisionedAt,
    ),
    passwordChangedAt: toIso(record.credentialSummary.passwordChangedAt),
    credentialVersion: record.credentialSummary.credentialVersion,
  };
}

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function formatTime(value: Date | null): string | null {
  return value?.toISOString().slice(11, 19) ?? null;
}
