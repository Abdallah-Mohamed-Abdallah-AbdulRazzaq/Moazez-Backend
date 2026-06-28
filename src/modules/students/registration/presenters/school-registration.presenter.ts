import {
  GuardianAccountLinkResponseDto,
  StudentAccountLinkResponseDto,
} from '../../account/dto/account-linking.dto';
import { presentEnrollment } from '../../enrollments/presenters/enrollment.presenter';
import { presentGuardianLink } from '../../guardians/presenters/guardian.presenter';
import { presentStudent } from '../../students/presenters/student.presenter';
import {
  SchoolRegistrationAccountSummaryDto,
  SchoolRegistrationResponseDto,
} from '../dto/school-registration.dto';
import { RegistrationCoreRecord } from '../infrastructure/school-registration.repository';

export interface ParentAccountPresentation {
  guardianId: string;
  mode: 'none' | 'create' | 'link';
  result?: GuardianAccountLinkResponseDto;
  failed?: boolean;
}

export interface StudentAccountPresentation {
  mode: 'none' | 'create' | 'link';
  result?: StudentAccountLinkResponseDto;
  failed?: boolean;
}

function presentAccountUser(
  account:
    | GuardianAccountLinkResponseDto['user']
    | StudentAccountLinkResponseDto['user'],
): SchoolRegistrationAccountSummaryDto['user'] {
  return {
    fullName: account.fullName,
    username: account.username,
    loginEmail: account.loginEmail,
    contactEmail: account.contactEmail,
    userType: account.userType as 'parent' | 'student',
    roleKey: account.roleKey,
    roleName: account.roleName,
    credentialStatus: account.status,
    hasPassword: account.hasPassword,
    mustChangePassword: account.mustChangePassword,
  };
}

function presentParentAccount(
  account: ParentAccountPresentation,
): SchoolRegistrationAccountSummaryDto {
  if (!account.result) {
    return {
      target: 'parent',
      guardianId: account.guardianId,
      mode: account.mode,
      status: account.failed ? 'failed' : 'skipped',
    };
  }

  return {
    target: 'parent',
    guardianId: account.guardianId,
    mode: account.mode,
    status: account.mode === 'create' ? 'created' : 'linked',
    user: presentAccountUser(account.result.user),
    ...(account.result.temporaryPassword
      ? { temporaryPassword: account.result.temporaryPassword }
      : {}),
  };
}

function presentStudentAccount(
  account: StudentAccountPresentation,
): SchoolRegistrationAccountSummaryDto {
  if (!account.result) {
    return {
      target: 'student',
      mode: account.mode,
      status: account.failed ? 'failed' : 'skipped',
    };
  }

  return {
    target: 'student',
    mode: account.mode,
    status: account.mode === 'create' ? 'created' : 'linked',
    user: presentAccountUser(account.result.user),
    ...(account.result.temporaryPassword
      ? { temporaryPassword: account.result.temporaryPassword }
      : {}),
  };
}

export function presentSchoolRegistration(args: {
  core: RegistrationCoreRecord;
  parentAccounts: ParentAccountPresentation[];
  studentAccount: StudentAccountPresentation;
  warnings: string[];
  completedAt: Date;
}): SchoolRegistrationResponseDto {
  return {
    registrationId: args.core.student.id,
    student: presentStudent(args.core.student),
    guardians: args.core.guardianLinks.map(presentGuardianLink),
    enrollment: presentEnrollment(args.core.enrollment),
    parentAccounts: args.parentAccounts.map(presentParentAccount),
    studentAccount: presentStudentAccount(args.studentAccount),
    warnings: args.warnings,
    createdAt: args.core.student.createdAt.toISOString(),
    completedAt: args.completedAt.toISOString(),
  };
}
