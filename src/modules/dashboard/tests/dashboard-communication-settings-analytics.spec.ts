import { computeDashboardCommunicationSettingsAnalyticsData } from '../domain/dashboard-communication-settings-analytics';
import { DashboardAnalyticsQueryContext } from '../domain/dashboard-analytics-query';

describe('Dashboard Communication/Settings analytics computations', () => {
  it('zero-fills message volume in deterministic school-civil day buckets', () => {
    const data = computeDashboardCommunicationSettingsAnalyticsData({
      chartKey: 'communication.message_volume',
      queryContext: context({
        granularity: 'day',
        startCivilDate: '2026-07-10',
        endCivilDate: '2026-07-12',
      }),
      messageVolume: [
        { civilDate: '2026-07-10', messages: 2 },
        { civilDate: '2026-07-12', messages: 3 },
      ],
    });

    expect(data.series).toHaveLength(1);
    expect(data.series[0]?.key).toBe('messages');
    expect(data.series[0]?.points.map((point) => point.x)).toEqual([
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
    ]);
    expect(data.series[0]?.points.map((point) => point.y)).toEqual([2, 0, 3]);
    expect(data.totals).toEqual({ messages: 5 });
    expect(data.summary).toEqual({
      value: 5,
      label: 'Sent communication messages',
    });
    expect(data.empty).toBe(false);
  });

  it('rolls message volume into clipped Monday-based week buckets', () => {
    const data = computeDashboardCommunicationSettingsAnalyticsData({
      chartKey: 'communication.message_volume',
      queryContext: context({
        granularity: 'week',
        startCivilDate: '2026-07-01',
        endCivilDate: '2026-07-14',
      }),
      messageVolume: [
        { civilDate: '2026-07-02', messages: 2 },
        { civilDate: '2026-07-08', messages: 4 },
      ],
    });

    expect(data.series[0]?.points.map((point) => point.x)).toEqual([
      '2026-07-01/2026-07-05',
      '2026-07-06/2026-07-12',
      '2026-07-13/2026-07-14',
    ]);
    expect(data.series[0]?.points.map((point) => point.y)).toEqual([2, 4, 0]);
    expect(
      data.series[0]?.points.map((point) => point.coordinate.kind),
    ).toEqual(['week_interval', 'week_interval', 'week_interval']);
  });

  it('rolls message volume into deterministic calendar-month buckets', () => {
    const data = computeDashboardCommunicationSettingsAnalyticsData({
      chartKey: 'communication.message_volume',
      queryContext: context({
        granularity: 'month',
        startCivilDate: '2026-06-29',
        endCivilDate: '2026-08-02',
      }),
      messageVolume: [
        { civilDate: '2026-06-30', messages: 1 },
        { civilDate: '2026-08-01', messages: 5 },
      ],
    });

    expect(data.series[0]?.points.map((point) => point.x)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
    expect(data.series[0]?.points.map((point) => point.y)).toEqual([1, 0, 5]);
  });

  it('maps all five announcement statuses in exact deterministic order', () => {
    const data = computeDashboardCommunicationSettingsAnalyticsData({
      chartKey: 'communication.announcement_status',
      queryContext: context(),
      announcementStatus: {
        draft: 1,
        scheduled: 2,
        published: 3,
        archived: 4,
        cancelled: 5,
      },
    });

    expect(data.series.map((series) => series.key)).toEqual([
      'draft',
      'scheduled',
      'published',
      'archived',
      'cancelled',
    ]);
    expect(data.series.map((series) => series.points[0]?.y)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(
      data.series.map((series) => series.points[0]?.coordinate.kind),
    ).toEqual(['category', 'category', 'category', 'category', 'category']);
    expect(data.totals).toEqual({
      draft: 1,
      scheduled: 2,
      published: 3,
      archived: 4,
      cancelled: 5,
    });
    expect(data.summary).toEqual({ value: 15, label: 'Current announcements' });
    expect(JSON.stringify(data)).not.toMatch(
      /messageId|conversationId|announcementId|schoolId|organizationId|body|title/,
    );
  });

  it.each([
    'communication.message_volume',
    'communication.announcement_status',
  ] as const)('returns a valid empty result for %s', (chartKey) => {
    const data = computeDashboardCommunicationSettingsAnalyticsData({
      chartKey,
      queryContext: context({
        startCivilDate: '2026-07-12',
        endCivilDate: '2026-07-12',
      }),
    });

    expect(data.empty).toBe(true);
    expect(data.summary.value).toBe(0);
    if (chartKey === 'communication.announcement_status') {
      expect(data.series).toHaveLength(5);
      expect(data.series.every((series) => series.points[0]?.y === 0)).toBe(
        true,
      );
    }
  });
});

function context(
  overrides: Partial<DashboardAnalyticsQueryContext> = {},
): DashboardAnalyticsQueryContext {
  return {
    generatedAt: new Date('2026-07-12T12:00:00.000Z'),
    timezone: 'Africa/Cairo',
    range: '30d',
    granularity: 'day',
    startInclusive: new Date('2026-06-12T21:00:00.000Z'),
    endExclusive: new Date('2026-07-12T21:00:00.000Z'),
    startCivilDate: '2026-06-13',
    endCivilDate: '2026-07-12',
    hierarchy: {
      academicYearId: null,
      termId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    },
    explicitlySuppliedKeys: [],
    filtersApplied: [],
    filtersNotApplicable: [],
    ...overrides,
  };
}
