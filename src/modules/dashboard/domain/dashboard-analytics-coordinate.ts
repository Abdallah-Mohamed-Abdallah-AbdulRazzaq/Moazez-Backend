import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { parseDashboardAnalyticsCivilDate } from './dashboard-analytics-query';

export type DashboardAnalyticsPointCoordinate =
  | { kind: 'snapshot' }
  | { kind: 'civil_date'; date: string }
  | { kind: 'week_interval'; startDate: string; endDate: string }
  | { kind: 'calendar_month'; month: string }
  | { kind: 'category'; key: string; label: string }
  | { kind: 'table_row'; rowKey: string }
  | { kind: 'funnel_stage'; stageKey: string; order: number };

declare const dashboardAnalyticsCoordinateXBrand: unique symbol;
export type DashboardAnalyticsValidatedCoordinateX = string & {
  readonly [dashboardAnalyticsCoordinateXBrand]: true;
};

type DashboardAnalyticsNonSnapshotCoordinate = Exclude<
  DashboardAnalyticsPointCoordinate,
  { kind: 'snapshot' }
>;

export type DashboardAnalyticsChartDataPoint =
  | {
      x: 'snapshot' | 'today';
      y: number;
      coordinate: { kind: 'snapshot' };
    }
  | {
      x: DashboardAnalyticsValidatedCoordinateX;
      y: number;
      coordinate: DashboardAnalyticsNonSnapshotCoordinate;
    };

export interface DashboardAnalyticsUnvalidatedChartDataPoint {
  x: string;
  y: number;
  coordinate: DashboardAnalyticsPointCoordinate;
}

export function validateDashboardAnalyticsChartDataPoint(
  point: DashboardAnalyticsUnvalidatedChartDataPoint,
): DashboardAnalyticsChartDataPoint {
  if (!Number.isFinite(point.y)) {
    throw coordinateError('Dashboard analytics point value is invalid');
  }

  const coordinate = point.coordinate;
  switch (coordinate.kind) {
    case 'snapshot':
      if (point.x !== 'snapshot' && point.x !== 'today') {
        throw coordinateError('Dashboard snapshot coordinate is invalid');
      }
      break;

    case 'civil_date':
      parseDashboardAnalyticsCivilDate(coordinate.date, 'coordinate.date');
      if (point.x !== coordinate.date) {
        throw coordinateError('Dashboard civil-date coordinate is invalid');
      }
      break;

    case 'week_interval': {
      const start = parseDashboardAnalyticsCivilDate(
        coordinate.startDate,
        'coordinate.startDate',
      );
      const end = parseDashboardAnalyticsCivilDate(
        coordinate.endDate,
        'coordinate.endDate',
      );
      if (
        start.getTime() > end.getTime() ||
        point.x !== `${coordinate.startDate}/${coordinate.endDate}`
      ) {
        throw coordinateError('Dashboard week coordinate is invalid');
      }
      break;
    }

    case 'calendar_month':
      if (
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(coordinate.month) ||
        point.x !== coordinate.month
      ) {
        throw coordinateError('Dashboard month coordinate is invalid');
      }
      break;

    case 'category':
      if (
        !nonEmpty(coordinate.key) ||
        !nonEmpty(coordinate.label) ||
        point.x !== coordinate.key
      ) {
        throw coordinateError('Dashboard category coordinate is invalid');
      }
      break;

    case 'table_row':
      if (!nonEmpty(coordinate.rowKey) || point.x !== coordinate.rowKey) {
        throw coordinateError('Dashboard table-row coordinate is invalid');
      }
      break;

    case 'funnel_stage':
      if (
        !nonEmpty(coordinate.stageKey) ||
        !Number.isInteger(coordinate.order) ||
        coordinate.order < 0 ||
        point.x !== coordinate.stageKey
      ) {
        throw coordinateError('Dashboard funnel-stage coordinate is invalid');
      }
      break;
  }

  return point as DashboardAnalyticsChartDataPoint;
}

export function dashboardAnalyticsSnapshotPoint(
  y: number,
): DashboardAnalyticsChartDataPoint {
  return validateDashboardAnalyticsChartDataPoint({
    x: 'snapshot',
    y,
    coordinate: { kind: 'snapshot' },
  });
}

export function dashboardAnalyticsCivilDatePoint(
  date: string,
  y: number,
): DashboardAnalyticsChartDataPoint {
  return validateDashboardAnalyticsChartDataPoint({
    x: date,
    y,
    coordinate: { kind: 'civil_date', date },
  });
}

export function dashboardAnalyticsWeekIntervalPoint(
  startDate: string,
  endDate: string,
  y: number,
): DashboardAnalyticsChartDataPoint {
  return validateDashboardAnalyticsChartDataPoint({
    x: `${startDate}/${endDate}`,
    y,
    coordinate: { kind: 'week_interval', startDate, endDate },
  });
}

export function dashboardAnalyticsCalendarMonthPoint(
  month: string,
  y: number,
): DashboardAnalyticsChartDataPoint {
  return validateDashboardAnalyticsChartDataPoint({
    x: month,
    y,
    coordinate: { kind: 'calendar_month', month },
  });
}

export function dashboardAnalyticsCategoryPoint(
  key: string,
  label: string,
  y: number,
): DashboardAnalyticsChartDataPoint {
  return validateDashboardAnalyticsChartDataPoint({
    x: key,
    y,
    coordinate: { kind: 'category', key, label },
  });
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function coordinateError(message: string): ValidationDomainException {
  return new ValidationDomainException(message, { field: 'coordinate' });
}
