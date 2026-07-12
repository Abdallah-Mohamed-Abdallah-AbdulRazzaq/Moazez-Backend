import { buildDashboardAttendanceAnalyticsBuckets } from '../domain/dashboard-attendance-analytics-buckets';
import { resolveDashboardAnalyticsFixedWindow } from '../domain/dashboard-analytics-query';
import { buildDashboardTimeContext } from '../domain/dashboard-time-context';

describe('Dashboard Attendance analytics buckets', () => {
  it.each(['UTC', 'Africa/Cairo'])(
    'creates one ordered civil-date bucket per fixed-range date for %s',
    (timezone) => {
      const window = resolveDashboardAnalyticsFixedWindow(
        '7d',
        buildDashboardTimeContext({
          generatedAt: new Date('2026-07-12T22:30:00.000Z'),
          schoolTimezone: timezone,
        }),
      );
      const buckets = buildDashboardAttendanceAnalyticsBuckets({
        granularity: 'day',
        startCivilDate: window.startCivilDate,
        endCivilDate: window.endCivilDate,
      });

      expect(buckets).toHaveLength(7);
      expect(buckets.map((bucket) => bucket.key)).toEqual(
        Array.from({ length: 7 }, (_, index) => buckets[index].startDate),
      );
      expect(buckets[0].point(1)).toMatchObject({
        x: buckets[0].startDate,
        coordinate: { kind: 'civil_date', date: buckets[0].startDate },
      });
    },
  );

  it('uses Monday weeks and clips the first and last interval', () => {
    const buckets = buildDashboardAttendanceAnalyticsBuckets({
      granularity: 'week',
      startCivilDate: '2026-07-01',
      endCivilDate: '2026-07-17',
    });

    expect(buckets.map((bucket) => bucket.key)).toEqual([
      '2026-07-01/2026-07-05',
      '2026-07-06/2026-07-12',
      '2026-07-13/2026-07-17',
    ]);
    expect(buckets[1].point(2)).toMatchObject({
      x: '2026-07-06/2026-07-12',
      coordinate: {
        kind: 'week_interval',
        startDate: '2026-07-06',
        endDate: '2026-07-12',
      },
    });
  });

  it('creates deterministic calendar-month buckets across a leap day', () => {
    const buckets = buildDashboardAttendanceAnalyticsBuckets({
      granularity: 'month',
      startCivilDate: '2024-02-28',
      endCivilDate: '2024-03-02',
    });

    expect(buckets).toMatchObject([
      {
        key: '2024-02',
        startDate: '2024-02-28',
        endDate: '2024-02-29',
      },
      {
        key: '2024-03',
        startDate: '2024-03-01',
        endDate: '2024-03-02',
      },
    ]);
    expect(buckets[0].point(3)).toMatchObject({
      x: '2024-02',
      coordinate: { kind: 'calendar_month', month: '2024-02' },
    });
  });

  it('preserves partial month boundaries and stable chronological order', () => {
    const buckets = buildDashboardAttendanceAnalyticsBuckets({
      granularity: 'month',
      startCivilDate: '2026-01-31',
      endCivilDate: '2026-03-01',
    });

    expect(buckets.map((bucket) => bucket.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    expect(buckets[0]).toMatchObject({
      startDate: '2026-01-31',
      endDate: '2026-01-31',
    });
    expect(buckets[2]).toMatchObject({
      startDate: '2026-03-01',
      endDate: '2026-03-01',
    });
  });
});
