import { Prisma, UserType } from '@prisma/client';
import {
  normalizeLoginDomain,
  validateLoginDomain,
} from '../../../settings/login-identity/domain/login-identity.policy';

export const STUDENT_BULK_REGISTRATION_EXECUTION_REPORT_KEY =
  'bulkRegistrationExecution' as const;

export interface StudentBulkRegistrationExecutionMetadata {
  requestedById: string;
  requestedByUserType: UserType;
  requestedAt: string;
  loginDomain: string;
  studentRoleId: string;
}

export function appendStudentBulkRegistrationExecutionMetadata(
  reportJson: unknown,
  metadata: StudentBulkRegistrationExecutionMetadata,
): Prisma.InputJsonValue | null {
  if (
    !isRecord(reportJson) ||
    Object.prototype.hasOwnProperty.call(
      reportJson,
      STUDENT_BULK_REGISTRATION_EXECUTION_REPORT_KEY,
    ) ||
    !isStudentBulkRegistrationExecutionMetadata(metadata)
  ) {
    return null;
  }

  return {
    ...reportJson,
    [STUDENT_BULK_REGISTRATION_EXECUTION_REPORT_KEY]: metadata,
  } as unknown as Prisma.InputJsonValue;
}

export function readStudentBulkRegistrationExecutionMetadata(
  reportJson: unknown,
): StudentBulkRegistrationExecutionMetadata | null {
  if (!isRecord(reportJson)) return null;
  const value = reportJson[STUDENT_BULK_REGISTRATION_EXECUTION_REPORT_KEY];
  return isStudentBulkRegistrationExecutionMetadata(value) ? value : null;
}

export function isStudentBulkRegistrationExecutionMetadata(
  value: unknown,
): value is StudentBulkRegistrationExecutionMetadata {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  if (
    keys.join(',') !==
    [
      'loginDomain',
      'requestedAt',
      'requestedById',
      'requestedByUserType',
      'studentRoleId',
    ].join(',')
  ) {
    return false;
  }

  if (
    typeof value.requestedById !== 'string' ||
    !isUuid(value.requestedById) ||
    typeof value.studentRoleId !== 'string' ||
    !isUuid(value.studentRoleId) ||
    typeof value.requestedAt !== 'string' ||
    Number.isNaN(Date.parse(value.requestedAt)) ||
    typeof value.requestedByUserType !== 'string' ||
    !Object.values(UserType).includes(value.requestedByUserType as UserType) ||
    typeof value.loginDomain !== 'string'
  ) {
    return false;
  }

  const domain = validateLoginDomain(value.loginDomain);
  return (
    domain.valid &&
    value.loginDomain === normalizeLoginDomain(value.loginDomain)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
