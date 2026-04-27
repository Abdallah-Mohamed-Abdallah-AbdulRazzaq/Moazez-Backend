import { AttendanceExcuseStatus, AttendanceExcuseType } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  AttendanceExcuseAlreadyReviewedException,
  AttendanceExcuseInvalidDateRangeException,
  AttendanceExcuseInvalidMinutesException,
  AttendanceExcuseInvalidPeriodSelectionException,
} from './excuse.exceptions';

export interface ExcuseTermRange {
  id: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
}

export interface NormalizedExcuseValues {
  type: AttendanceExcuseType;
  dateFrom: Date;
  dateTo: Date;
  selectedPeriodKeys: string[];
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  reasonAr: string | null;
  reasonEn: string | null;
}

export interface ExcuseValueInput {
  type: AttendanceExcuseType;
  dateFrom: string | Date;
  dateTo: string | Date;
  selectedPeriodKeys: string[];
  lateMinutes?: number | null;
  earlyLeaveMinutes?: number | null;
  reasonAr?: string | null;
  reasonEn?: string | null;
}

export function resolveExcuseAcademicYearId(input: {
  academicYearId?: string;
  yearId?: string;
}): string {
  const academicYearId = input.academicYearId ?? input.yearId;
  if (!academicYearId) {
    throw new ValidationDomainException('Academic year is required', {
      field: 'yearId',
    });
  }

  return academicYearId;
}

export function assertPendingExcuseRequest(input: {
  id: string;
  status: AttendanceExcuseStatus;
}): void {
  if (input.status !== AttendanceExcuseStatus.PENDING) {
    throw new AttendanceExcuseAlreadyReviewedException({
      excuseRequestId: input.id,
      status: input.status,
    });
  }
}

export function assertExcuseTermWritable(term: ExcuseTermRange): void {
  if (!term.isActive) {
    throw new ValidationDomainException(
      'Attendance excuse requests cannot be changed in a closed term',
      { termId: term.id },
    );
  }
}

export function normalizeSelectedPeriodKeys(input: {
  selectedPeriodKeys?: string[] | null;
  selectedPeriodIds?: string[] | null;
}): string[] {
  const raw = input.selectedPeriodKeys ?? input.selectedPeriodIds ?? [];
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of raw) {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new AttendanceExcuseInvalidPeriodSelectionException({
        field: 'selectedPeriodKeys',
      });
    }

    if (!seen.has(trimmed)) {
      normalized.push(trimmed);
      seen.add(trimmed);
    }
  }

  return normalized;
}

export function validateAndNormalizeExcuseValues(
  input: ExcuseValueInput,
  term?: ExcuseTermRange,
): NormalizedExcuseValues {
  const dateFrom = parseExcuseDate(input.dateFrom, 'dateFrom');
  const dateTo = parseExcuseDate(input.dateTo, 'dateTo');
  validateExcuseDateRange(dateFrom, dateTo, term);
  validateExcuseMinutes(input);
  validateExcusePeriodSelection(input);

  return {
    type: input.type,
    dateFrom,
    dateTo,
    selectedPeriodKeys: input.selectedPeriodKeys,
    lateMinutes:
      input.type === AttendanceExcuseType.LATE
        ? (input.lateMinutes ?? null)
        : null,
    earlyLeaveMinutes:
      input.type === AttendanceExcuseType.EARLY_LEAVE
        ? (input.earlyLeaveMinutes ?? null)
        : null,
    reasonAr: normalizeOptionalString(input.reasonAr),
    reasonEn: normalizeOptionalString(input.reasonEn),
  };
}

export function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function parseExcuseDate(value: string | Date, field: string): Date {
  if (value instanceof Date) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AttendanceExcuseInvalidDateRangeException({ field });
  }

  return date;
}

function validateExcuseDateRange(
  dateFrom: Date,
  dateTo: Date,
  term?: ExcuseTermRange,
): void {
  if (dateFrom > dateTo) {
    throw new AttendanceExcuseInvalidDateRangeException({
      dateFrom: formatDateOnly(dateFrom),
      dateTo: formatDateOnly(dateTo),
    });
  }

  if (!term) return;

  if (dateFrom < term.startDate || dateTo > term.endDate) {
    throw new AttendanceExcuseInvalidDateRangeException({
      termId: term.id,
      termStartDate: formatDateOnly(term.startDate),
      termEndDate: formatDateOnly(term.endDate),
      dateFrom: formatDateOnly(dateFrom),
      dateTo: formatDateOnly(dateTo),
    });
  }
}

function validateExcuseMinutes(input: ExcuseValueInput): void {
  validateOptionalWholeMinutes(input.lateMinutes, 'lateMinutes');
  validateOptionalWholeMinutes(input.earlyLeaveMinutes, 'earlyLeaveMinutes');

  if (
    input.type === AttendanceExcuseType.LATE &&
    (!input.lateMinutes || input.lateMinutes <= 0)
  ) {
    throw new AttendanceExcuseInvalidMinutesException({
      field: 'lateMinutes',
      type: input.type,
    });
  }

  if (
    input.type === AttendanceExcuseType.EARLY_LEAVE &&
    (!input.earlyLeaveMinutes || input.earlyLeaveMinutes <= 0)
  ) {
    throw new AttendanceExcuseInvalidMinutesException({
      field: 'earlyLeaveMinutes',
      type: input.type,
    });
  }
}

function validateOptionalWholeMinutes(
  value: number | null | undefined,
  field: string,
): void {
  if (value === undefined || value === null) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new AttendanceExcuseInvalidMinutesException({ field });
  }
}

function validateExcusePeriodSelection(input: ExcuseValueInput): void {
  if (
    (input.type === AttendanceExcuseType.LATE ||
      input.type === AttendanceExcuseType.EARLY_LEAVE) &&
    input.selectedPeriodKeys.length === 0
  ) {
    throw new AttendanceExcuseInvalidPeriodSelectionException({
      field: 'selectedPeriodKeys',
      type: input.type,
    });
  }
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
