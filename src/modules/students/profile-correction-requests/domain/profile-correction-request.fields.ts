import { Prisma } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export const REQUESTABLE_PROFILE_CORRECTION_FIELDS = [
  'firstName',
  'fatherNameEn',
  'grandfatherNameEn',
  'lastName',
  'firstNameAr',
  'fatherNameAr',
  'grandfatherNameAr',
  'familyNameAr',
  'gender',
  'birthDate',
  'nationality',
  'studentPhone',
  'studentEmail',
  'addressLine',
  'city',
  'district',
] as const;

export type RequestableProfileCorrectionField =
  (typeof REQUESTABLE_PROFILE_CORRECTION_FIELDS)[number];

export type NormalizedProfileCorrectionChanges = Partial<
  Record<RequestableProfileCorrectionField, string | null>
>;

export interface ProfileCorrectionStudentSnapshotSource {
  firstName: string;
  fatherNameEn: string | null;
  grandfatherNameEn: string | null;
  lastName: string;
  firstNameAr: string | null;
  fatherNameAr: string | null;
  grandfatherNameAr: string | null;
  familyNameAr: string | null;
  gender: string | null;
  birthDate: Date | null;
  nationality: string | null;
  studentPhone: string | null;
  studentEmail: string | null;
  addressLine: string | null;
  city: string | null;
  district: string | null;
}

const ALLOWED_FIELD_SET = new Set<string>(REQUESTABLE_PROFILE_CORRECTION_FIELDS);

const MAX_LENGTH_BY_FIELD: Record<RequestableProfileCorrectionField, number> = {
  firstName: 120,
  fatherNameEn: 120,
  grandfatherNameEn: 120,
  lastName: 120,
  firstNameAr: 120,
  fatherNameAr: 120,
  grandfatherNameAr: 120,
  familyNameAr: 120,
  gender: 50,
  birthDate: 10,
  nationality: 120,
  studentPhone: 50,
  studentEmail: 200,
  addressLine: 300,
  city: 120,
  district: 120,
};

const NON_NULLABLE_FIELDS = new Set<RequestableProfileCorrectionField>([
  'firstName',
  'lastName',
  'gender',
  'birthDate',
]);

export function normalizeProfileCorrectionChanges(
  changes: Record<string, unknown> | null | undefined,
): NormalizedProfileCorrectionChanges {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new ValidationDomainException('Correction changes must be an object', {
      field: 'changes',
    });
  }

  const normalized: NormalizedProfileCorrectionChanges = {};
  for (const [field, rawValue] of Object.entries(changes)) {
    if (!ALLOWED_FIELD_SET.has(field)) {
      throw new ValidationDomainException(
        'Correction request contains a field that is not requestable',
        { field },
      );
    }

    const requestableField = field as RequestableProfileCorrectionField;
    normalized[requestableField] = normalizeFieldValue(
      requestableField,
      rawValue,
    );
  }

  if (Object.keys(normalized).length === 0) {
    throw new ValidationDomainException(
      'At least one profile field correction is required',
      { field: 'changes' },
    );
  }

  return normalized;
}

export function normalizeCorrectionReason(
  reason: string | null | undefined,
): string | null {
  if (reason === undefined || reason === null) {
    return null;
  }

  const normalized = reason.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > 1000) {
    throw new ValidationDomainException('Correction reason is too long', {
      field: 'reason',
      maxLength: 1000,
    });
  }

  return normalized;
}

export function buildCurrentProfileSnapshot(
  student: ProfileCorrectionStudentSnapshotSource,
  changes: NormalizedProfileCorrectionChanges,
): Record<string, string | null> {
  return Object.keys(changes).reduce<Record<string, string | null>>(
    (snapshot, field) => {
      const requestableField = field as RequestableProfileCorrectionField;
      snapshot[requestableField] = serializeStudentField(
        student,
        requestableField,
      );
      return snapshot;
    },
    {},
  );
}

export function buildStudentUpdateDataFromCorrectionChanges(
  changes: Prisma.JsonValue,
): Prisma.StudentUncheckedUpdateInput {
  const normalized = normalizePersistedChanges(changes);
  const data: Prisma.StudentUncheckedUpdateInput = {};

  for (const [field, value] of Object.entries(normalized)) {
    switch (field as RequestableProfileCorrectionField) {
      case 'firstName':
        data.firstName = requireNonNullUpdateValue(value, field);
        break;
      case 'fatherNameEn':
        data.fatherNameEn = value;
        break;
      case 'grandfatherNameEn':
        data.grandfatherNameEn = value;
        break;
      case 'lastName':
        data.lastName = requireNonNullUpdateValue(value, field);
        break;
      case 'firstNameAr':
        data.firstNameAr = value;
        break;
      case 'fatherNameAr':
        data.fatherNameAr = value;
        break;
      case 'grandfatherNameAr':
        data.grandfatherNameAr = value;
        break;
      case 'familyNameAr':
        data.familyNameAr = value;
        break;
      case 'gender':
        data.gender = value;
        break;
      case 'birthDate':
        data.birthDate = value ? new Date(`${value}T00:00:00.000Z`) : null;
        break;
      case 'nationality':
        data.nationality = value;
        break;
      case 'studentPhone':
        data.studentPhone = value;
        break;
      case 'studentEmail':
        data.studentEmail = value;
        break;
      case 'addressLine':
        data.addressLine = value;
        break;
      case 'city':
        data.city = value;
        break;
      case 'district':
        data.district = value;
        break;
    }
  }

  return data;
}

function requireNonNullUpdateValue(
  value: string | null,
  field: string,
): string {
  if (value === null) {
    throw new ValidationDomainException('Correction field cannot be cleared', {
      field,
    });
  }

  return value;
}

export function changedFieldNamesFromChanges(
  changes: Record<string, unknown> | Prisma.JsonValue,
): string[] {
  if (!isPlainRecord(changes)) {
    return [];
  }

  return Object.keys(changes).filter((field) => ALLOWED_FIELD_SET.has(field));
}

function normalizePersistedChanges(
  changes: Prisma.JsonValue,
): NormalizedProfileCorrectionChanges {
  if (!isPlainRecord(changes)) {
    throw new ValidationDomainException(
      'Stored correction changes are not valid',
      { field: 'requestedChanges' },
    );
  }

  return normalizeProfileCorrectionChanges(changes);
}

function normalizeFieldValue(
  field: RequestableProfileCorrectionField,
  rawValue: unknown,
): string | null {
  if (rawValue === null) {
    if (NON_NULLABLE_FIELDS.has(field)) {
      throw new ValidationDomainException('Correction field cannot be cleared', {
        field,
      });
    }

    return null;
  }

  if (typeof rawValue !== 'string') {
    throw new ValidationDomainException('Correction field value must be text', {
      field,
    });
  }

  const value = rawValue.trim();
  if (!value) {
    if (NON_NULLABLE_FIELDS.has(field)) {
      throw new ValidationDomainException('Correction field is required', {
        field,
      });
    }

    return null;
  }

  const maxLength = MAX_LENGTH_BY_FIELD[field];
  if (value.length > maxLength) {
    throw new ValidationDomainException('Correction field value is too long', {
      field,
      maxLength,
    });
  }

  if (field === 'birthDate') {
    return normalizeBirthDate(value);
  }

  if (field === 'studentEmail') {
    assertEmail(value, field);
  }

  return value;
}

function normalizeBirthDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationDomainException('Birth date must use YYYY-MM-DD', {
      field: 'birthDate',
    });
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationDomainException('Birth date is invalid', {
      field: 'birthDate',
    });
  }

  return parsed.toISOString().slice(0, 10);
}

function assertEmail(value: string, field: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new ValidationDomainException('Student email is invalid', { field });
  }
}

function serializeStudentField(
  student: ProfileCorrectionStudentSnapshotSource,
  field: RequestableProfileCorrectionField,
): string | null {
  const value = student[field];
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
