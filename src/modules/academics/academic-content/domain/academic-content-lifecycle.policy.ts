import { HttpStatus } from '@nestjs/common';
import { AcademicContentStatus } from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';

export type AcademicContentTermDates = {
  startDate: Date;
  endDate: Date;
  isActive: boolean;
};

export type AcademicContentTermPhase =
  | 'FUTURE_TERM'
  | 'CURRENT_TERM'
  | 'HISTORICALLY_ENDED';

function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function classifyAcademicContentTerm(
  term: AcademicContentTermDates,
  now: Date,
): AcademicContentTermPhase {
  const today = utcDate(now);
  if (today > utcDate(term.endDate)) return 'HISTORICALLY_ENDED';
  if (today < utcDate(term.startDate)) return 'FUTURE_TERM';
  return 'CURRENT_TERM';
}

export function isAcademicContentTermWritable(
  term: AcademicContentTermDates,
  now: Date,
): boolean {
  const phase = classifyAcademicContentTerm(term, now);
  return phase === 'FUTURE_TERM' || (phase === 'CURRENT_TERM' && term.isActive);
}

export function assertAcademicContentTermWritable(
  term: AcademicContentTermDates,
  now: Date,
): void {
  if (!isAcademicContentTermWritable(term, now)) {
    throw new DomainException({
      code: 'academic_content.term.closed',
      message: 'Academic content term is not writable',
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}

export function isAcademicContentMutable(
  status: AcademicContentStatus,
): boolean {
  return status === AcademicContentStatus.DRAFT;
}

export function assertAcademicContentMutable(
  status: AcademicContentStatus,
): void {
  if (!isAcademicContentMutable(status)) {
    throw new DomainException({
      code: 'academic_content.status.read_only',
      message: 'Academic content is read-only',
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}

export function assertAcademicContentArchived(
  status: AcademicContentStatus,
): void {
  if (status !== AcademicContentStatus.ARCHIVED) {
    throw new DomainException({
      code: 'academic_content.status.not_archived',
      message: 'Academic content is not archived',
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}

export function normalizeAcademicContentTitle(value: unknown): string {
  if (typeof value !== 'string')
    throw new ValidationDomainException('Academic content title is required');
  const title = value.trim();
  if (!isAcademicContentTitleValid(title))
    throw new ValidationDomainException(
      'Academic content title must contain 1 to 180 characters',
    );
  return title;
}

export function isAcademicContentTitleValid(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= 180
  );
}

export function normalizeAcademicContentDescription(
  value: unknown,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string')
    throw new ValidationDomainException(
      'Academic content description must be text',
    );
  const description = value.trim();
  if (description.length > 4000)
    throw new ValidationDomainException(
      'Academic content description exceeds 4000 characters',
    );
  return description || null;
}
