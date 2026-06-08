import {
  DashboardActivityActorType,
  DashboardActivityFeedItemDto,
  DashboardActivityFeedResponseDto,
  DashboardActivityFeedSource,
} from '../dto/dashboard-activity-feed.dto';

export interface DashboardActivityFeedPresentationInput {
  generatedAt: Date;
  items: DashboardActivityFeedItemDto[];
  pageInfo: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  filters: {
    source?: DashboardActivityFeedSource;
    eventType?: string;
    actorType?: DashboardActivityActorType;
    dateFrom?: string;
    dateTo?: string;
  };
}

export function presentDashboardActivityFeed(
  input: DashboardActivityFeedPresentationInput,
): DashboardActivityFeedResponseDto {
  return {
    generatedAt: input.generatedAt.toISOString(),
    items: input.items.map((item) => ({
      activityId: item.activityId,
      source: item.source,
      eventType: item.eventType,
      title: item.title,
      description: item.description,
      actor: {
        id: item.actor.id,
        displayName: item.actor.displayName,
        type: item.actor.type,
      },
      subject: {
        type: item.subject.type,
        id: item.subject.id,
        label: item.subject.label,
      },
      occurredAt: item.occurredAt,
    })),
    pageInfo: {
      limit: input.pageInfo.limit,
      nextCursor: input.pageInfo.nextCursor,
      hasMore: input.pageInfo.hasMore,
    },
    filters: {
      source: input.filters.source ?? null,
      eventType: input.filters.eventType ?? null,
      actorType: input.filters.actorType ?? null,
      dateFrom: input.filters.dateFrom ?? null,
      dateTo: input.filters.dateTo ?? null,
    },
    deferred: {
      readState: 'deferred',
      pinning: 'deferred',
      realtime: 'deferred',
      analyticsBuilder: 'deferred',
    },
  };
}
