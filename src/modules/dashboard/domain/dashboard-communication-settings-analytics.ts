import type {
  DashboardAnnouncementStatusAggregate,
  DashboardCommunicationMessageDailyAggregate,
} from '../infrastructure/dashboard-communication-analytics.repository';
import {
  buildDashboardAnalyticsBuckets,
  findDashboardAnalyticsBucket,
} from './dashboard-analytics-buckets';
import { DashboardAnalyticsCommunicationSettingsPackChartKey } from './dashboard-analytics-catalog';
import {
  DashboardAnalyticsChartDataPoint,
  dashboardAnalyticsCategoryPoint,
} from './dashboard-analytics-coordinate';
import { DashboardAnalyticsQueryContext } from './dashboard-analytics-query';

export interface DashboardCommunicationSettingsAnalyticsData {
  series: readonly {
    key: string;
    label: string;
    points: readonly DashboardAnalyticsChartDataPoint[];
  }[];
  totals: Record<string, number>;
  summary: { value: number; label: string };
  empty: boolean;
}

export function computeDashboardCommunicationSettingsAnalyticsData(input: {
  chartKey: DashboardAnalyticsCommunicationSettingsPackChartKey;
  queryContext: DashboardAnalyticsQueryContext;
  messageVolume?: readonly DashboardCommunicationMessageDailyAggregate[];
  announcementStatus?: DashboardAnnouncementStatusAggregate;
}): DashboardCommunicationSettingsAnalyticsData {
  switch (input.chartKey) {
    case 'communication.message_volume':
      return messageVolumeData(input.queryContext, input.messageVolume ?? []);
    case 'communication.announcement_status':
      return announcementStatusData(
        input.announcementStatus ?? {
          draft: 0,
          scheduled: 0,
          published: 0,
          archived: 0,
          cancelled: 0,
        },
      );
  }
}

function messageVolumeData(
  context: DashboardAnalyticsQueryContext,
  rows: readonly DashboardCommunicationMessageDailyAggregate[],
): DashboardCommunicationSettingsAnalyticsData {
  const buckets = buildDashboardAnalyticsBuckets({
    granularity: context.granularity,
    startCivilDate: context.startCivilDate,
    endCivilDate: context.endCivilDate,
  });
  const counts = new Map(buckets.map((bucket) => [bucket.key, 0]));

  for (const row of rows) {
    const bucket = findDashboardAnalyticsBucket(buckets, row.civilDate);
    if (!bucket) continue;
    counts.set(bucket.key, counts.get(bucket.key)! + row.messages);
  }

  const messages = [...counts.values()].reduce(
    (total, count) => total + count,
    0,
  );

  return {
    series: [
      {
        key: 'messages',
        label: 'Messages',
        points: buckets.map((bucket) => bucket.point(counts.get(bucket.key)!)),
      },
    ],
    totals: { messages },
    summary: { value: messages, label: 'Sent communication messages' },
    empty: messages === 0,
  };
}

function announcementStatusData(
  aggregate: DashboardAnnouncementStatusAggregate,
): DashboardCommunicationSettingsAnalyticsData {
  const categories = [
    { key: 'draft', label: 'Draft', value: aggregate.draft },
    { key: 'scheduled', label: 'Scheduled', value: aggregate.scheduled },
    { key: 'published', label: 'Published', value: aggregate.published },
    { key: 'archived', label: 'Archived', value: aggregate.archived },
    { key: 'cancelled', label: 'Cancelled', value: aggregate.cancelled },
  ] as const;
  const total = categories.reduce((sum, category) => sum + category.value, 0);

  return {
    series: categories.map((category) => ({
      key: category.key,
      label: category.label,
      points: [
        dashboardAnalyticsCategoryPoint(
          category.key,
          category.label,
          category.value,
        ),
      ],
    })),
    totals: Object.fromEntries(
      categories.map((category) => [category.key, category.value]),
    ),
    summary: { value: total, label: 'Current announcements' },
    empty: total === 0,
  };
}
