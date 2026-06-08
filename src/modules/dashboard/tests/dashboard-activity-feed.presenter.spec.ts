import { DashboardActivityFeedItemDto } from '../dto/dashboard-activity-feed.dto';
import { presentDashboardActivityFeed } from '../presenters/dashboard-activity-feed.presenter';

describe('Dashboard activity feed presenter', () => {
  it('returns a stable empty feed response', () => {
    expect(
      presentDashboardActivityFeed({
        generatedAt: new Date('2026-06-01T09:00:00.000Z'),
        items: [],
        pageInfo: {
          limit: 20,
          nextCursor: null,
          hasMore: false,
        },
        filters: {},
      }),
    ).toEqual({
      generatedAt: '2026-06-01T09:00:00.000Z',
      items: [],
      pageInfo: {
        limit: 20,
        nextCursor: null,
        hasMore: false,
      },
      filters: {
        source: null,
        eventType: null,
        actorType: null,
        dateFrom: null,
        dateTo: null,
      },
      deferred: {
        readState: 'deferred',
        pinning: 'deferred',
        realtime: 'deferred',
        analyticsBuilder: 'deferred',
      },
    });
  });

  it('hides tenant fields and raw backing payloads', () => {
    const response = presentDashboardActivityFeed({
      generatedAt: new Date('2026-06-01T09:00:00.000Z'),
      items: [
        {
          ...activityItem(),
          schoolId: 'school-1',
          organizationId: 'org-1',
          raw: { schoolId: 'school-1' },
        } as DashboardActivityFeedItemDto,
      ],
      pageInfo: {
        limit: 20,
        nextCursor: null,
        hasMore: false,
      },
      filters: {
        source: 'homework',
        eventType: 'homework.submission.review',
        actorType: 'teacher',
        dateFrom: '2026-06-01T00:00:00.000Z',
        dateTo: '2026-06-02T00:00:00.000Z',
      },
    });

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('raw');
    expect(response.filters).toEqual({
      source: 'homework',
      eventType: 'homework.submission.review',
      actorType: 'teacher',
      dateFrom: '2026-06-01T00:00:00.000Z',
      dateTo: '2026-06-02T00:00:00.000Z',
    });
  });
});

function activityItem(): DashboardActivityFeedItemDto {
  return {
    activityId: 'audit:activity-1',
    source: 'homework',
    eventType: 'homework.submission.review',
    title: 'Homework reviewed',
    description: 'A homework submission was reviewed.',
    actor: {
      id: 'teacher-1',
      displayName: 'Teacher One',
      type: 'teacher',
    },
    subject: {
      type: 'homework_submission',
      id: 'submission-1',
      label: 'Homework Submission',
    },
    occurredAt: '2026-06-01T09:00:00.000Z',
  };
}
