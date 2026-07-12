import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import {
  DashboardAnalyticsChartDefinition,
  DashboardAnalyticsDataQueryKey,
  DashboardAnalyticsGranularity,
  DashboardAnalyticsHierarchyFilterKey,
  DashboardAnalyticsRange,
} from './dashboard-analytics-catalog';
import {
  DashboardTimeContext,
  addDashboardCivilDays,
  dashboardCivilDateToPrismaDate,
  startOfDashboardCivilDate,
} from './dashboard-time-context';

const DAY_MS = 24 * 60 * 60 * 1000;
export const DASHBOARD_ANALYTICS_MAX_CUSTOM_RANGE_DAYS = 366;

export interface DashboardAnalyticsRawQuery {
  range?: unknown;
  granularity?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  academicYearId?: unknown;
  termId?: unknown;
  gradeId?: unknown;
  sectionId?: unknown;
  classroomId?: unknown;
}

export interface DashboardAnalyticsNormalizedQuery {
  range: DashboardAnalyticsRange;
  granularity: DashboardAnalyticsGranularity;
  dateFrom: string | null;
  dateTo: string | null;
  academicYearId: string | null;
  termId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
}

export interface DashboardAnalyticsResolvedHierarchy {
  academicYearId: string | null;
  termId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
}

export interface DashboardAnalyticsResolvedWindow {
  startInclusive: Date;
  endExclusive: Date;
  startCivilDate: string;
  endCivilDate: string;
}

export interface DashboardAnalyticsQueryContext {
  generatedAt: Date;
  timezone: string;
  range: DashboardAnalyticsRange;
  granularity: DashboardAnalyticsGranularity;
  startInclusive: Date;
  endExclusive: Date;
  startCivilDate: string;
  endCivilDate: string;
  hierarchy: DashboardAnalyticsResolvedHierarchy;
  explicitlySuppliedKeys: readonly DashboardAnalyticsDataQueryKey[];
  filtersApplied: readonly DashboardAnalyticsDataQueryKey[];
  filtersNotApplicable: readonly DashboardAnalyticsDataQueryKey[];
}

export function normalizeDashboardAnalyticsQuery(
  raw: DashboardAnalyticsRawQuery,
): DashboardAnalyticsNormalizedQuery {
  const range = raw.range ?? '30d';
  const granularity = raw.granularity ?? 'day';

  if (!isRange(range)) {
    throw validationError('Analytics range is invalid', ['range']);
  }
  if (!isGranularity(granularity)) {
    throw validationError('Analytics granularity is invalid', ['granularity']);
  }

  return {
    range,
    granularity,
    dateFrom: optionalString(raw.dateFrom, 'dateFrom'),
    dateTo: optionalString(raw.dateTo, 'dateTo'),
    academicYearId: optionalString(raw.academicYearId, 'academicYearId'),
    termId: optionalString(raw.termId, 'termId'),
    gradeId: optionalString(raw.gradeId, 'gradeId'),
    sectionId: optionalString(raw.sectionId, 'sectionId'),
    classroomId: optionalString(raw.classroomId, 'classroomId'),
  };
}

export function explicitlySuppliedDashboardAnalyticsKeys(
  raw: DashboardAnalyticsRawQuery,
): DashboardAnalyticsDataQueryKey[] {
  const keys: DashboardAnalyticsDataQueryKey[] = [
    'range',
    'granularity',
    'dateFrom',
    'dateTo',
    'academicYearId',
    'termId',
    'gradeId',
    'sectionId',
    'classroomId',
  ];

  return keys.filter(
    (key) =>
      Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined,
  );
}

export function validateDashboardAnalyticsChartQueryCapabilities(
  chart: DashboardAnalyticsChartDefinition,
  query: DashboardAnalyticsNormalizedQuery,
  explicitlySuppliedKeys: readonly DashboardAnalyticsDataQueryKey[],
): void {
  const capabilities = chart.queryCapabilities;
  const explicitHierarchy = explicitlySuppliedKeys.filter(
    (key): key is DashboardAnalyticsHierarchyFilterKey =>
      isHierarchyFilterKey(key),
  );
  const unsupportedHierarchy = explicitHierarchy.filter(
    (key) => !capabilities.supportedHierarchyFilters.includes(key),
  );

  if (unsupportedHierarchy.length > 0) {
    throw validationError(
      'Analytics filter is not supported by this chart',
      unsupportedHierarchy,
    );
  }

  const explicitTimeKeys = explicitlySuppliedKeys.filter((key) =>
    ['range', 'granularity', 'dateFrom', 'dateTo'].includes(key),
  );

  if (capabilities.snapshotOnly) {
    const invalidSnapshotTimeKeys = explicitTimeKeys.filter((key) => {
      if (key === 'range') return query.range !== '30d';
      if (key === 'granularity') return query.granularity !== 'day';
      return true;
    });

    if (invalidSnapshotTimeKeys.length > 0) {
      throw validationError(
        'Snapshot chart does not support the requested time filter',
        invalidSnapshotTimeKeys,
      );
    }
    return;
  }

  if (!capabilities.timeFiltersApplicable && explicitTimeKeys.length > 0) {
    throw validationError(
      'Analytics time filter is not supported by this chart',
      explicitTimeKeys,
    );
  }

  if (
    capabilities.timeFiltersApplicable &&
    (!capabilities.supportedRanges.includes(query.range) ||
      !capabilities.supportedGranularities.includes(query.granularity))
  ) {
    throw validationError('Analytics range or granularity is not supported', [
      'range',
      'granularity',
    ]);
  }
}

export function resolveDashboardAnalyticsFixedWindow(
  range: Extract<DashboardAnalyticsRange, '7d' | '30d' | '90d'>,
  timeContext: DashboardTimeContext,
): DashboardAnalyticsResolvedWindow {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const startCivilDate = addDashboardCivilDays(
    timeContext.civilDate,
    -(days - 1),
  );

  return {
    startInclusive: startOfDashboardCivilDate(
      startCivilDate,
      timeContext.timezone,
    ),
    endExclusive: timeContext.todayEndExclusive,
    startCivilDate,
    endCivilDate: timeContext.civilDate,
  };
}

export function resolveDashboardAnalyticsCustomWindow(
  query: DashboardAnalyticsNormalizedQuery,
  timeContext: DashboardTimeContext,
): DashboardAnalyticsResolvedWindow {
  if (!query.dateFrom || !query.dateTo) {
    throw validationError('Custom analytics range requires both dates', [
      'dateFrom',
      'dateTo',
    ]);
  }

  const startDate = parseCivilDate(query.dateFrom, 'dateFrom');
  const endDate = parseCivilDate(query.dateTo, 'dateTo');

  if (startDate.getTime() > endDate.getTime()) {
    throw validationError('Custom analytics range is reversed', [
      'dateFrom',
      'dateTo',
    ]);
  }

  const inclusiveDays =
    Math.floor((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;
  if (inclusiveDays > DASHBOARD_ANALYTICS_MAX_CUSTOM_RANGE_DAYS) {
    throw validationError('Custom analytics range is too large', [
      'dateFrom',
      'dateTo',
    ]);
  }

  return {
    startInclusive: startOfDashboardCivilDate(
      query.dateFrom,
      timeContext.timezone,
    ),
    endExclusive: startOfDashboardCivilDate(
      addDashboardCivilDays(query.dateTo, 1),
      timeContext.timezone,
    ),
    startCivilDate: query.dateFrom,
    endCivilDate: query.dateTo,
  };
}

export function resolveDashboardAnalyticsPeriodWindow(
  startDate: Date,
  endDate: Date,
  timeContext: DashboardTimeContext,
): DashboardAnalyticsResolvedWindow | null {
  const startCivilDate = startDate.toISOString().slice(0, 10);
  const configuredEndCivilDate = endDate.toISOString().slice(0, 10);
  const startInclusive = startOfDashboardCivilDate(
    startCivilDate,
    timeContext.timezone,
  );
  const configuredEndExclusive = startOfDashboardCivilDate(
    addDashboardCivilDays(configuredEndCivilDate, 1),
    timeContext.timezone,
  );
  const endExclusive = new Date(
    Math.min(
      configuredEndExclusive.getTime(),
      timeContext.generatedAt.getTime(),
    ),
  );

  if (
    startDate.getTime() > endDate.getTime() ||
    startInclusive.getTime() >= endExclusive.getTime()
  ) {
    return null;
  }

  return {
    startInclusive,
    endExclusive,
    startCivilDate,
    endCivilDate:
      configuredEndExclusive.getTime() > timeContext.generatedAt.getTime()
        ? timeContext.civilDate
        : configuredEndCivilDate,
  };
}

export function rejectDashboardAnalyticsDateBoundsForNonCustomRange(
  query: DashboardAnalyticsNormalizedQuery,
): void {
  if (query.range === 'custom') return;

  const fields = [
    query.dateFrom ? 'dateFrom' : null,
    query.dateTo ? 'dateTo' : null,
  ].filter((field): field is 'dateFrom' | 'dateTo' => field !== null);
  if (fields.length > 0) {
    throw validationError(
      'Analytics date bounds require the custom range',
      fields,
    );
  }
}

export function validateDashboardAnalyticsGranularity(
  granularity: DashboardAnalyticsGranularity,
  window: DashboardAnalyticsResolvedWindow,
): void {
  const inclusiveDays = civilDayCount(
    window.startCivilDate,
    window.endCivilDate,
  );

  if (granularity === 'week' && inclusiveDays < 7) {
    throw validationError(
      'Weekly analytics requires at least seven civil days',
      ['granularity', 'range'],
    );
  }
  if (granularity === 'month' && inclusiveDays < 28) {
    throw validationError(
      'Monthly analytics requires at least twenty-eight civil days',
      ['granularity', 'range'],
    );
  }
}

export function dashboardAnalyticsFilterMetadata(
  chart: DashboardAnalyticsChartDefinition,
  explicitlySuppliedKeys: readonly DashboardAnalyticsDataQueryKey[],
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): {
  applied: DashboardAnalyticsDataQueryKey[];
  notApplicable: DashboardAnalyticsDataQueryKey[];
} {
  if (chart.queryCapabilities.snapshotOnly) {
    const applied = chart.queryCapabilities.supportedHierarchyFilters.filter(
      (key) => hierarchy[key] !== null,
    );
    return {
      applied,
      notApplicable: ['range', 'granularity'].filter(
        (key): key is DashboardAnalyticsDataQueryKey =>
          !applied.includes(key as DashboardAnalyticsHierarchyFilterKey),
      ),
    };
  }

  if (!chart.queryCapabilities.timeFiltersApplicable) {
    return { applied: [], notApplicable: ['range', 'granularity'] };
  }

  const applied = new Set<DashboardAnalyticsDataQueryKey>([
    'range',
    'granularity',
  ]);
  for (const key of explicitlySuppliedKeys) {
    if (key === 'dateFrom' || key === 'dateTo') applied.add(key);
  }
  for (const key of chart.queryCapabilities.supportedHierarchyFilters) {
    if (hierarchy[key] !== null) applied.add(key);
  }

  return { applied: [...applied], notApplicable: [] };
}

export function parseDashboardAnalyticsCivilDate(
  value: string,
  field: string,
): Date {
  return parseCivilDate(value, field);
}

function parseCivilDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError('Analytics civil date is invalid', [field]);
  }

  try {
    return dashboardCivilDateToPrismaDate(value);
  } catch {
    throw validationError('Analytics civil date is invalid', [field]);
  }
}

function civilDayCount(start: string, end: string): number {
  const startDate = parseCivilDate(start, 'dateFrom');
  const endDate = parseCivilDate(end, 'dateTo');
  return Math.floor((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validationError('Analytics filter value is invalid', [field]);
  }
  return value.trim();
}

function isRange(value: unknown): value is DashboardAnalyticsRange {
  return ['7d', '30d', '90d', 'term', 'academic_year', 'custom'].includes(
    value as string,
  );
}

function isGranularity(value: unknown): value is DashboardAnalyticsGranularity {
  return ['day', 'week', 'month'].includes(value as string);
}

function isHierarchyFilterKey(
  key: DashboardAnalyticsDataQueryKey,
): key is DashboardAnalyticsHierarchyFilterKey {
  return [
    'academicYearId',
    'termId',
    'gradeId',
    'sectionId',
    'classroomId',
  ].includes(key);
}

function validationError(
  message: string,
  fields: readonly string[],
): ValidationDomainException {
  return new ValidationDomainException(message, { fields });
}
