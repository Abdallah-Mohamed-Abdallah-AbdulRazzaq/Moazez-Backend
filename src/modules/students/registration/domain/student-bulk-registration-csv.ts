import { createHash } from 'node:crypto';
import { isEmail, isPhoneNumber } from 'class-validator';
import { parse } from 'csv-parse/sync';
import type { SchoolLoginSettings } from '@prisma/client';
import {
  buildLoginEmail,
  normalizeContactEmail,
  normalizeUsername,
  validateUsername,
} from '../../../settings/login-identity/domain/login-identity.policy';
import {
  resolveStudentBirthDate,
  resolveStudentName,
  resolveStudentProfileFields,
} from '../../students/domain/student-record.inputs';
import { normalizeOptionalText } from '../../students/domain/person-name.helper';
import { STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS } from './student-bulk-registration.constants';

export const STUDENT_BULK_REGISTRATION_ERROR_CODES = {
  malformedCsv: 'students.bulk_registration.csv_malformed',
  invalidHeader: 'students.bulk_registration.header_invalid',
  noDataRows: 'students.bulk_registration.no_data_rows',
  invalidField: 'students.bulk_registration.field_invalid',
  duplicateUsername: 'students.bulk_registration.duplicate_username',
  duplicateRow: 'students.bulk_registration.duplicate_row',
  loginIdentityConflict: 'iam.user.login_email_taken',
  loginSettingsUnavailable: 'settings.login_identity.not_configured',
} as const;

export type StudentBulkRegistrationNormalizedData = {
  firstNameEn: string | null;
  fatherNameEn: string | null;
  grandfatherNameEn: string | null;
  familyNameEn: string | null;
  firstNameAr: string | null;
  fatherNameAr: string | null;
  grandfatherNameAr: string | null;
  familyNameAr: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  username: string;
  contactEmail: string | null;
  studentPhone: string | null;
};

export type StudentBulkRegistrationRowError = {
  code: string;
  field: string | null;
  reason?: string;
};

export type StudentBulkRegistrationValidationRow = {
  rowNumber: number;
  normalizedData: StudentBulkRegistrationNormalizedData;
  rowHash: string;
  errors: StudentBulkRegistrationRowError[];
};

export type StudentBulkRegistrationCsvResult = {
  rows: StudentBulkRegistrationValidationRow[];
  batchErrors: string[];
};

export function parseStudentBulkRegistrationCsv(
  source: Buffer,
): StudentBulkRegistrationCsvResult {
  let records: string[][];
  try {
    records = parse(source, {
      bom: true,
      delimiter: ',',
      encoding: 'utf8',
      relax_column_count: true,
      skip_empty_lines: true,
    });
  } catch {
    return {
      rows: [],
      batchErrors: [STUDENT_BULK_REGISTRATION_ERROR_CODES.malformedCsv],
    };
  }

  const [header, ...dataRecords] = records;
  if (!header || !isCanonicalHeader(header)) {
    return {
      rows: [],
      batchErrors: [STUDENT_BULK_REGISTRATION_ERROR_CODES.invalidHeader],
    };
  }
  if (
    dataRecords.some(
      (record) =>
        record.length !== STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.length,
    )
  ) {
    return {
      rows: [],
      batchErrors: [STUDENT_BULK_REGISTRATION_ERROR_CODES.malformedCsv],
    };
  }
  if (dataRecords.length === 0) {
    return {
      rows: [],
      batchErrors: [STUDENT_BULK_REGISTRATION_ERROR_CODES.noDataRows],
    };
  }

  const rows = dataRecords.map((record, index) =>
    normalizeRecord(record, index + 2),
  );
  markDuplicateRows(rows);
  return { rows, batchErrors: [] };
}

export function validateStudentBulkRegistrationIdentityRows(
  rows: StudentBulkRegistrationValidationRow[],
  settings: SchoolLoginSettings,
  existingLoginEmails: ReadonlySet<string>,
): void {
  for (const row of rows) {
    const username = validateUsername(row.normalizedData.username, settings);
    if (!username.valid) {
      addError(row, {
        code: 'iam.user.username_invalid',
        field: 'username',
        reason: username.reason ?? undefined,
      });
      continue;
    }
    const loginEmail = buildLoginEmail(username.username, settings.loginDomain);
    if (existingLoginEmails.has(loginEmail)) {
      addError(row, {
        code: STUDENT_BULK_REGISTRATION_ERROR_CODES.loginIdentityConflict,
        field: 'username',
      });
    }
  }
  markDuplicateUsernames(rows);
}

export function collectCandidateLoginEmails(
  rows: StudentBulkRegistrationValidationRow[],
  settings: SchoolLoginSettings,
): string[] {
  return [
    ...new Set(
      rows
        .filter((row) => row.errors.length === 0)
        .map((row) => validateUsername(row.normalizedData.username, settings))
        .filter((result) => result.valid)
        .map((result) =>
          buildLoginEmail(result.username, settings.loginDomain),
        ),
    ),
  ];
}

export function isStudentBulkRegistrationNormalizedData(
  value: unknown,
): value is StudentBulkRegistrationNormalizedData {
  if (!isRecord(value)) return false;
  return STUDENT_BULK_REGISTRATION_NORMALIZED_KEYS.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(value, key) &&
      (key === 'username'
        ? typeof value[key] === 'string'
        : value[key] === null || typeof value[key] === 'string'),
  );
}

export function isStudentBulkRegistrationRowErrors(
  value: unknown,
): value is StudentBulkRegistrationRowError[] {
  return (
    Array.isArray(value) &&
    value.every(
      (error) =>
        isRecord(error) &&
        typeof error.code === 'string' &&
        (error.field === null || typeof error.field === 'string') &&
        (error.reason === undefined || typeof error.reason === 'string'),
    )
  );
}

const STUDENT_BULK_REGISTRATION_NORMALIZED_KEYS: ReadonlyArray<
  keyof StudentBulkRegistrationNormalizedData
> = [
  'firstNameEn',
  'fatherNameEn',
  'grandfatherNameEn',
  'familyNameEn',
  'firstNameAr',
  'fatherNameAr',
  'grandfatherNameAr',
  'familyNameAr',
  'dateOfBirth',
  'gender',
  'nationality',
  'username',
  'contactEmail',
  'studentPhone',
];

function normalizeRecord(
  record: string[],
  rowNumber: number,
): StudentBulkRegistrationValidationRow {
  const normalizedData: StudentBulkRegistrationNormalizedData = {
    firstNameEn: normalizeOptionalText(record[0]),
    fatherNameEn: normalizeOptionalText(record[1]),
    grandfatherNameEn: normalizeOptionalText(record[2]),
    familyNameEn: normalizeOptionalText(record[3]),
    firstNameAr: normalizeOptionalText(record[4]),
    fatherNameAr: normalizeOptionalText(record[5]),
    grandfatherNameAr: normalizeOptionalText(record[6]),
    familyNameAr: normalizeOptionalText(record[7]),
    dateOfBirth: normalizeDate(record[8]),
    gender: normalizeOptionalText(record[9]),
    nationality: normalizeOptionalText(record[10]),
    username: normalizeUsername(record[11] ?? ''),
    contactEmail: normalizeNullableContactEmail(record[12]),
    studentPhone: normalizeOptionalText(record[13]),
  };
  const row: StudentBulkRegistrationValidationRow = {
    rowNumber,
    normalizedData,
    rowHash: hashNormalizedRow(normalizedData),
    errors: [],
  };

  validateStudentFields(row, record[8]);
  return row;
}

function validateStudentFields(
  row: StudentBulkRegistrationValidationRow,
  rawDateOfBirth: string | undefined,
): void {
  const fields = row.normalizedData;
  for (const field of [
    'firstNameEn',
    'fatherNameEn',
    'grandfatherNameEn',
    'familyNameEn',
    'firstNameAr',
    'fatherNameAr',
    'grandfatherNameAr',
    'familyNameAr',
  ] as const) {
    if ((fields[field]?.length ?? 0) > 120)
      invalidField(row, field, 'max_length');
  }
  if ((fields.gender?.length ?? 0) > 50)
    invalidField(row, 'gender', 'max_length');
  if ((fields.nationality?.length ?? 0) > 120) {
    invalidField(row, 'nationality', 'max_length');
  }
  if ((fields.contactEmail?.length ?? 0) > 200) {
    invalidField(row, 'contactEmail', 'max_length');
  } else if (fields.contactEmail && !isEmail(fields.contactEmail)) {
    invalidField(row, 'contactEmail', 'invalid_email');
  }
  if (fields.studentPhone && !isPhoneNumber(fields.studentPhone)) {
    invalidField(row, 'studentPhone', 'invalid_phone');
  }
  if (normalizeOptionalText(rawDateOfBirth) && !fields.dateOfBirth) {
    invalidField(row, 'dateOfBirth', 'invalid_date');
  }

  try {
    resolveStudentName({
      first_name_en: fields.firstNameEn,
      father_name_en: fields.fatherNameEn,
      grandfather_name_en: fields.grandfatherNameEn,
      family_name_en: fields.familyNameEn,
      first_name_ar: fields.firstNameAr,
      father_name_ar: fields.fatherNameAr,
      grandfather_name_ar: fields.grandfatherNameAr,
      family_name_ar: fields.familyNameAr,
    });
  } catch {
    invalidField(row, 'name', 'invalid_student_name');
  }
  resolveStudentProfileFields({
    father_name_en: fields.fatherNameEn,
    grandfather_name_en: fields.grandfatherNameEn,
    first_name_ar: fields.firstNameAr,
    father_name_ar: fields.fatherNameAr,
    grandfather_name_ar: fields.grandfatherNameAr,
    family_name_ar: fields.familyNameAr,
    gender: fields.gender,
    nationality: fields.nationality,
    contact: {
      student_email: fields.contactEmail,
      student_phone: fields.studentPhone,
    },
  });
  if (fields.dateOfBirth) resolveStudentBirthDate(fields.dateOfBirth);
}

function normalizeDate(value: string | undefined): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null;
}

function normalizeNullableContactEmail(
  value: string | undefined,
): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalizeContactEmail(normalized) : null;
}

function hashNormalizedRow(
  data: StudentBulkRegistrationNormalizedData,
): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function markDuplicateRows(rows: StudentBulkRegistrationValidationRow[]): void {
  markDuplicates(rows, (row) => row.rowHash, {
    code: STUDENT_BULK_REGISTRATION_ERROR_CODES.duplicateRow,
    field: null,
  });
}

function markDuplicateUsernames(
  rows: StudentBulkRegistrationValidationRow[],
): void {
  markDuplicates(rows, (row) => row.normalizedData.username || null, {
    code: STUDENT_BULK_REGISTRATION_ERROR_CODES.duplicateUsername,
    field: 'username',
  });
}

function markDuplicates(
  rows: StudentBulkRegistrationValidationRow[],
  keyOf: (row: StudentBulkRegistrationValidationRow) => string | null,
  error: StudentBulkRegistrationRowError,
): void {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const row of rows) {
    const key = keyOf(row);
    if (key && (counts.get(key) ?? 0) > 1) addError(row, error);
  }
}

function invalidField(
  row: StudentBulkRegistrationValidationRow,
  field: string,
  reason: string,
): void {
  addError(row, {
    code: STUDENT_BULK_REGISTRATION_ERROR_CODES.invalidField,
    field,
    reason,
  });
}

function addError(
  row: StudentBulkRegistrationValidationRow,
  error: StudentBulkRegistrationRowError,
): void {
  if (
    !row.errors.some(
      (existing) =>
        existing.code === error.code &&
        existing.field === error.field &&
        existing.reason === error.reason,
    )
  ) {
    row.errors.push(error);
  }
}

function isCanonicalHeader(header: string[]): boolean {
  return (
    header.length === STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.length &&
    header.every(
      (value, index) =>
        value === STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS[index],
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
