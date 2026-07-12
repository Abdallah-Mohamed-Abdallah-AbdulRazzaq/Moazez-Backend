import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import {
  dashboardAnalyticsCalendarMonthPoint,
  dashboardAnalyticsCategoryPoint,
  dashboardAnalyticsCivilDatePoint,
  dashboardAnalyticsSnapshotPoint,
  dashboardAnalyticsWeekIntervalPoint,
  validateDashboardAnalyticsChartDataPoint,
} from '../domain/dashboard-analytics-coordinate';

describe('Dashboard analytics coordinate contract', () => {
  it('preserves legacy snapshot x with a required snapshot coordinate', () => {
    expect(dashboardAnalyticsSnapshotPoint(7)).toEqual({
      x: 'snapshot',
      y: 7,
      coordinate: { kind: 'snapshot' },
    });
  });

  it('builds validated Attendance date, week, month, and category points', () => {
    expect(dashboardAnalyticsCivilDatePoint('2026-07-12', 1)).toMatchObject({
      x: '2026-07-12',
      coordinate: { kind: 'civil_date' },
    });
    expect(
      dashboardAnalyticsWeekIntervalPoint('2026-07-06', '2026-07-12', 2),
    ).toMatchObject({
      x: '2026-07-06/2026-07-12',
      coordinate: { kind: 'week_interval' },
    });
    expect(dashboardAnalyticsCalendarMonthPoint('2026-07', 3)).toMatchObject({
      x: '2026-07',
      coordinate: { kind: 'calendar_month' },
    });
    expect(
      dashboardAnalyticsCategoryPoint('pending', 'Pending', 4),
    ).toMatchObject({
      x: 'pending',
      coordinate: { kind: 'category' },
    });
  });

  it.each([
    {
      x: '2026-07-12',
      y: 1,
      coordinate: { kind: 'civil_date', date: '2026-07-12' } as const,
    },
    {
      x: '2026-07-06/2026-07-12',
      y: 2,
      coordinate: {
        kind: 'week_interval',
        startDate: '2026-07-06',
        endDate: '2026-07-12',
      } as const,
    },
    {
      x: '2026-07',
      y: 3,
      coordinate: { kind: 'calendar_month', month: '2026-07' } as const,
    },
    {
      x: 'present',
      y: 4,
      coordinate: {
        kind: 'category',
        key: 'present',
        label: 'Present',
      } as const,
    },
    {
      x: 'student-1',
      y: 5,
      coordinate: { kind: 'table_row', rowKey: 'student-1' } as const,
    },
    {
      x: 'submitted',
      y: 6,
      coordinate: {
        kind: 'funnel_stage',
        stageKey: 'submitted',
        order: 1,
      } as const,
    },
  ])(
    'validates future $coordinate.kind coordinates without emitting them',
    (point) => {
      expect(validateDashboardAnalyticsChartDataPoint(point)).toEqual(point);
    },
  );

  it.each([
    {
      x: 'anything',
      y: 1,
      coordinate: { kind: 'snapshot' } as const,
    },
    {
      x: '2026-02-30',
      y: 1,
      coordinate: { kind: 'civil_date', date: '2026-02-30' } as const,
    },
    {
      x: '2026-07-12/2026-07-06',
      y: 1,
      coordinate: {
        kind: 'week_interval',
        startDate: '2026-07-12',
        endDate: '2026-07-06',
      } as const,
    },
    {
      x: '2026-13',
      y: 1,
      coordinate: { kind: 'calendar_month', month: '2026-13' } as const,
    },
    {
      x: '',
      y: 1,
      coordinate: { kind: 'category', key: '', label: '' } as const,
    },
    {
      x: '',
      y: 1,
      coordinate: { kind: 'table_row', rowKey: '' } as const,
    },
    {
      x: 'stage',
      y: 1,
      coordinate: {
        kind: 'funnel_stage',
        stageKey: 'stage',
        order: -1,
      } as const,
    },
  ])('rejects malformed $coordinate.kind coordinates', (point) => {
    expect(() => validateDashboardAnalyticsChartDataPoint(point)).toThrow(
      ValidationDomainException,
    );
  });
});
