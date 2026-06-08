import { SchoolEntitlementStatus } from '@prisma/client';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import {
  SchoolEntitlementStatusApiValue,
  UpsertPlatformSchoolEntitlementDto,
} from '../dto/platform-admin-entitlement.dto';
import {
  PlatformEntitlementInvalidDateRangeException,
  PlatformEntitlementInvalidStatusException,
  PlatformEntitlementStudentSeatLimitInvalidException,
} from './platform-admin-errors';

export interface ExistingEntitlementDateRange {
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface NormalizedEntitlementInput {
  status?: SchoolEntitlementStatus;
  startsAt?: Date | null;
  endsAt?: Date | null;
  studentSeatLimit?: number | null;
  notes?: string | null;
  providedFields: Array<
    'status' | 'startsAt' | 'endsAt' | 'studentSeatLimit' | 'notes'
  >;
}

export function normalizeEntitlementInput(
  command: UpsertPlatformSchoolEntitlementDto,
  existing?: ExistingEntitlementDateRange | null,
): NormalizedEntitlementInput {
  const normalized: NormalizedEntitlementInput = {
    providedFields: [],
  };

  if (command.status !== undefined) {
    normalized.status = mapEntitlementStatusFromApi(command.status);
    normalized.providedFields.push('status');
  }

  if (command.startsAt !== undefined) {
    normalized.startsAt = parseNullableDate(command.startsAt, 'startsAt');
    normalized.providedFields.push('startsAt');
  }

  if (command.endsAt !== undefined) {
    normalized.endsAt = parseNullableDate(command.endsAt, 'endsAt');
    normalized.providedFields.push('endsAt');
  }

  if (command.studentSeatLimit !== undefined) {
    normalized.studentSeatLimit = normalizeStudentSeatLimit(
      command.studentSeatLimit,
    );
    normalized.providedFields.push('studentSeatLimit');
  }

  if (command.notes !== undefined) {
    normalized.notes = normalizeEntitlementNotes(command.notes);
    normalized.providedFields.push('notes');
  }

  if (normalized.providedFields.length === 0) {
    throw new ValidationDomainException('Entitlement update is empty');
  }

  assertValidEntitlementDateRange({
    startsAt:
      normalized.startsAt !== undefined
        ? normalized.startsAt
        : (existing?.startsAt ?? null),
    endsAt:
      normalized.endsAt !== undefined
        ? normalized.endsAt
        : (existing?.endsAt ?? null),
  });

  return normalized;
}

export function mapEntitlementStatusFromApi(
  status: SchoolEntitlementStatusApiValue,
): SchoolEntitlementStatus {
  switch (status) {
    case 'active':
      return SchoolEntitlementStatus.ACTIVE;
    case 'trial':
      return SchoolEntitlementStatus.TRIAL;
    case 'suspended':
      return SchoolEntitlementStatus.SUSPENDED;
    case 'expired':
      return SchoolEntitlementStatus.EXPIRED;
    case 'archived':
      return SchoolEntitlementStatus.ARCHIVED;
    default:
      throw new PlatformEntitlementInvalidStatusException(status);
  }
}

export function mapEntitlementStatusToApi(
  status: SchoolEntitlementStatus,
): SchoolEntitlementStatusApiValue {
  switch (status) {
    case SchoolEntitlementStatus.ACTIVE:
      return 'active';
    case SchoolEntitlementStatus.TRIAL:
      return 'trial';
    case SchoolEntitlementStatus.SUSPENDED:
      return 'suspended';
    case SchoolEntitlementStatus.EXPIRED:
      return 'expired';
    case SchoolEntitlementStatus.ARCHIVED:
      return 'archived';
  }
}

export function normalizeStudentSeatLimit(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new PlatformEntitlementStudentSeatLimitInvalidException(value);
  }
  return value;
}

function parseNullableDate(value: string | null, field: string): Date | null {
  if (value === null) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationDomainException('Date is invalid', { field });
  }

  return date;
}

function normalizeEntitlementNotes(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length > 1000) {
    throw new ValidationDomainException('Entitlement notes are too long', {
      field: 'notes',
      maxLength: 1000,
    });
  }
  return normalized.length > 0 ? normalized : null;
}

function assertValidEntitlementDateRange(input: {
  startsAt: Date | null;
  endsAt: Date | null;
}): void {
  if (!input.startsAt || !input.endsAt) return;

  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new PlatformEntitlementInvalidDateRangeException({
      startsAt: input.startsAt.toISOString(),
      endsAt: input.endsAt.toISOString(),
    });
  }
}
