import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import {
  DASHBOARD_ANALYTICS_MAX_CUSTOM_RANGE_DAYS,
  normalizeDashboardAnalyticsQuery,
  rejectDashboardAnalyticsDateBoundsForNonCustomRange,
  resolveDashboardAnalyticsCustomWindow,
  resolveDashboardAnalyticsFixedWindow,
  resolveDashboardAnalyticsPeriodWindow,
  validateDashboardAnalyticsGranularity,
} from '../domain/dashboard-analytics-query';
import { buildDashboardTimeContext } from '../domain/dashboard-time-context';

describe('Dashboard analytics query range foundation', () => {
  it.each([
    ['7d', '2026-07-06'],
    ['30d', '2026-06-13'],
    ['90d', '2026-04-14'],
  ] as const)(
    'resolves %s over inclusive UTC civil dates',
    (range, expectedStartCivilDate) => {
      const window = resolveDashboardAnalyticsFixedWindow(
        range,
        timeContext('UTC', '2026-07-12T12:00:00.000Z'),
      );

      expect(window).toEqual({
        startInclusive: new Date(`${expectedStartCivilDate}T00:00:00.000Z`),
        endExclusive: new Date('2026-07-13T00:00:00.000Z'),
        startCivilDate: expectedStartCivilDate,
        endCivilDate: '2026-07-12',
      });
    },
  );

  it.each([
    ['7d', '2026-07-05T21:00:00.000Z', '2026-07-12T21:00:00.000Z'],
    ['30d', '2026-06-12T21:00:00.000Z', '2026-07-12T21:00:00.000Z'],
    ['90d', '2026-04-13T22:00:00.000Z', '2026-07-12T21:00:00.000Z'],
  ] as const)(
    'resolves %s using Africa/Cairo civil midnights',
    (range, expectedStart, expectedEnd) => {
      const window = resolveDashboardAnalyticsFixedWindow(
        range,
        timeContext('Africa/Cairo', '2026-07-12T12:00:00.000Z'),
      );

      expect(window.startInclusive.toISOString()).toBe(expectedStart);
      expect(window.endExclusive.toISOString()).toBe(expectedEnd);
    },
  );

  it('converts an inclusive custom Cairo range to an exclusive next-day instant', () => {
    const query = normalizeDashboardAnalyticsQuery({
      range: 'custom',
      granularity: 'day',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-03',
    });
    const window = resolveDashboardAnalyticsCustomWindow(
      query,
      timeContext('Africa/Cairo', '2026-07-12T12:00:00.000Z'),
    );

    expect(window).toEqual({
      startInclusive: new Date('2026-06-30T21:00:00.000Z'),
      endExclusive: new Date('2026-07-03T21:00:00.000Z'),
      startCivilDate: '2026-07-01',
      endCivilDate: '2026-07-03',
    });
  });

  it.each([
    [{ range: 'custom', dateFrom: '2026-07-01' }, 'missing boundary'],
    [
      { range: 'custom', dateFrom: '2026-07-03', dateTo: '2026-07-01' },
      'reversed',
    ],
    [
      { range: 'custom', dateFrom: '2026-02-30', dateTo: '2026-03-01' },
      'invalid date',
    ],
    [
      { range: 'custom', dateFrom: '2025-01-01', dateTo: '2026-01-02' },
      'excessive',
    ],
  ])('rejects custom ranges with %s (%s)', (rawQuery) => {
    const query = normalizeDashboardAnalyticsQuery(rawQuery);
    expect(() =>
      resolveDashboardAnalyticsCustomWindow(
        query,
        timeContext('UTC', '2026-07-12T12:00:00.000Z'),
      ),
    ).toThrow(ValidationDomainException);
  });

  it('documents the 366 inclusive-day custom maximum', () => {
    expect(DASHBOARD_ANALYTICS_MAX_CUSTOM_RANGE_DAYS).toBe(366);
  });

  it('rejects custom date bounds on a non-custom range', () => {
    const query = normalizeDashboardAnalyticsQuery({
      range: '30d',
      dateFrom: '2026-07-01',
    });
    expect(() =>
      rejectDashboardAnalyticsDateBoundsForNonCustomRange(query),
    ).toThrow(ValidationDomainException);
  });

  it('caps term and academic-year windows at the generated instant', () => {
    const context = timeContext('Africa/Cairo', '2026-07-12T12:00:00.000Z');
    const window = resolveDashboardAnalyticsPeriodWindow(
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-12-31T00:00:00.000Z'),
      context,
    );

    expect(window).toEqual({
      startInclusive: new Date('2026-06-30T21:00:00.000Z'),
      endExclusive: new Date('2026-07-12T12:00:00.000Z'),
      startCivilDate: '2026-07-01',
      endCivilDate: '2026-07-12',
    });
  });

  it('enforces the granularity compatibility matrix without building buckets', () => {
    const context = timeContext('UTC', '2026-07-12T12:00:00.000Z');
    const sevenDays = resolveDashboardAnalyticsFixedWindow('7d', context);
    const thirtyDays = resolveDashboardAnalyticsFixedWindow('30d', context);

    expect(() =>
      validateDashboardAnalyticsGranularity('day', sevenDays),
    ).not.toThrow();
    expect(() =>
      validateDashboardAnalyticsGranularity('week', sevenDays),
    ).not.toThrow();
    expect(() =>
      validateDashboardAnalyticsGranularity('month', sevenDays),
    ).toThrow(ValidationDomainException);
    for (const granularity of ['day', 'week', 'month'] as const) {
      expect(() =>
        validateDashboardAnalyticsGranularity(granularity, thirtyDays),
      ).not.toThrow();
    }
  });
});

function timeContext(timezone: string, generatedAt: string) {
  return buildDashboardTimeContext({
    generatedAt: new Date(generatedAt),
    schoolTimezone: timezone,
  });
}
