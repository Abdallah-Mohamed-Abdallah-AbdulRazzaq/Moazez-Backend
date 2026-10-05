import { isISO8601 } from 'class-validator';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import type { AcademicContentLibraryQuery } from './academic-content-library.query';
import { dateOnly, instant } from './academic-content-type-detail.policy';

/** Shared library normalization preserves the established management contract. */
export function normalizeAcademicContentLibraryQuery(
  query: AcademicContentLibraryQuery,
) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (page - 1) * limit > Number.MAX_SAFE_INTEGER - limit
  ) {
    throw new ValidationDomainException('Invalid management pagination');
  }
  const weeklyDateFrom = query.weeklyDateFrom
    ? dateOnly(query.weeklyDateFrom, 'weeklyDateFrom')
    : undefined;
  const weeklyDateTo = query.weeklyDateTo
    ? dateOnly(query.weeklyDateTo, 'weeklyDateTo')
    : undefined;
  if (weeklyDateFrom && weeklyDateTo && weeklyDateFrom > weeklyDateTo)
    throw new ValidationDomainException('Invalid weekly date range');
  for (const value of [query.sessionStartAtFrom, query.sessionStartAtTo]) {
    if (value && !isISO8601(value, { strict: true, strictSeparator: true }))
      throw new ValidationDomainException('Invalid session start range');
  }
  const sessionStartAtFrom = query.sessionStartAtFrom
    ? instant(query.sessionStartAtFrom, 'sessionStartAtFrom')
    : undefined;
  const sessionStartAtTo = query.sessionStartAtTo
    ? instant(query.sessionStartAtTo, 'sessionStartAtTo')
    : undefined;
  if (
    sessionStartAtFrom &&
    sessionStartAtTo &&
    sessionStartAtFrom > sessionStartAtTo
  )
    throw new ValidationDomainException('Invalid session start range');

  return {
    ...query,
    page,
    limit,
    weeklyDateFrom,
    weeklyDateTo,
    sessionStartAtFrom,
    sessionStartAtTo,
  };
}
