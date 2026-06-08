import { Injectable } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { Buffer } from 'node:buffer';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { requireDashboardScope } from '../dashboard-context';
import {
  DASHBOARD_ACTIVITY_FEED_DEFAULT_LIMIT,
  DASHBOARD_ACTIVITY_FEED_MAX_LIMIT,
  DASHBOARD_ACTIVITY_FEED_SOURCES,
  DashboardActivityActorType,
  DashboardActivityFeedItemDto,
  DashboardActivityFeedResponseDto,
  DashboardActivityFeedSource,
  ListDashboardActivityFeedQueryDto,
} from '../dto/dashboard-activity-feed.dto';
import {
  DashboardActivityAuditCursor,
  DashboardActivityAuditRecord,
  DashboardActivityFeedRepository,
  resolveSourceFromEventType,
} from '../infrastructure/dashboard-activity-feed.repository';
import { presentDashboardActivityFeed } from '../presenters/dashboard-activity-feed.presenter';

interface NormalizedActivityFeedQuery {
  source?: DashboardActivityFeedSource;
  eventType?: string;
  actorType?: DashboardActivityActorType;
  dateFrom?: Date;
  dateTo?: Date;
  dateFromIso?: string;
  dateToIso?: string;
  limit: number;
  cursor?: DashboardActivityAuditCursor;
}

type ActivityText = {
  title: string;
  description: string;
};

const EVENT_TEXT: Record<string, ActivityText> = {
  'admissions.lead.create': {
    title: 'Lead created',
    description: 'An admissions lead was created.',
  },
  'admissions.application.create': {
    title: 'Application created',
    description: 'An admissions application was created.',
  },
  'admissions.application.decision': {
    title: 'Application decision recorded',
    description: 'An admissions application decision was recorded.',
  },
  'students.enrollment.create': {
    title: 'Enrollment created',
    description: 'A student enrollment was created.',
  },
  'students.enrollment.transfer': {
    title: 'Enrollment transferred',
    description: 'A student enrollment transfer was recorded.',
  },
  'students.enrollment.withdraw': {
    title: 'Enrollment withdrawn',
    description: 'A student enrollment withdrawal was recorded.',
  },
  'students.enrollment.promote': {
    title: 'Enrollment promoted',
    description: 'A student enrollment promotion was recorded.',
  },
  'academics.curriculum.activate': {
    title: 'Curriculum activated',
    description: 'A curriculum was activated.',
  },
  'academics.lesson_plan.activate': {
    title: 'Lesson plan activated',
    description: 'A lesson plan was activated.',
  },
  'academics.lesson_plan.archive': {
    title: 'Lesson plan archived',
    description: 'A lesson plan was archived.',
  },
  'attendance.session.submit': {
    title: 'Attendance session submitted',
    description: 'A roll-call attendance session was submitted.',
  },
  'attendance.excuse.approve': {
    title: 'Attendance excuse approved',
    description: 'An attendance excuse request was approved.',
  },
  'attendance.excuse.reject': {
    title: 'Attendance excuse rejected',
    description: 'An attendance excuse request was rejected.',
  },
  'grades.assessment.publish': {
    title: 'Assessment published',
    description: 'A grade assessment was published.',
  },
  'grades.assessment.lock': {
    title: 'Assessment locked',
    description: 'A grade assessment was locked.',
  },
  'grades.submission.review.finalize': {
    title: 'Grade submission reviewed',
    description: 'A grade submission review was finalized.',
  },
  'homework.assignment.publish': {
    title: 'Homework published',
    description: 'A homework assignment was published.',
  },
  'homework.submission.submit': {
    title: 'Homework submitted',
    description: 'A homework submission was received.',
  },
  'homework.submission.review': {
    title: 'Homework reviewed',
    description: 'A homework submission was reviewed.',
  },
  'homework.grade_sync.submission_sync': {
    title: 'Homework synced to grades',
    description: 'A homework submission was synced to grades.',
  },
  'behavior.record.create': {
    title: 'Behavior record created',
    description: 'A behavior record was created.',
  },
  'behavior.record.approve': {
    title: 'Behavior review completed',
    description: 'A behavior record was approved.',
  },
  'behavior.record.reject': {
    title: 'Behavior review completed',
    description: 'A behavior record was rejected.',
  },
  'reinforcement.task.create': {
    title: 'Reinforcement task created',
    description: 'A reinforcement task was created.',
  },
  'reinforcement.review.approve': {
    title: 'Reinforcement submission reviewed',
    description: 'A reinforcement submission was approved.',
  },
  'reinforcement.review.reject': {
    title: 'Reinforcement submission reviewed',
    description: 'A reinforcement submission was rejected.',
  },
  'reinforcement.reward.redemption.approve': {
    title: 'Reward redemption reviewed',
    description: 'A reward redemption was approved.',
  },
  'reinforcement.reward.redemption.reject': {
    title: 'Reward redemption reviewed',
    description: 'A reward redemption was rejected.',
  },
  'communication.announcement.publish': {
    title: 'Announcement published',
    description: 'A communication announcement was published.',
  },
  'communication.message_report.update': {
    title: 'Message report updated',
    description: 'A communication message report was updated.',
  },
  'communication.moderation_action.create': {
    title: 'Moderation action recorded',
    description: 'A communication moderation action was recorded.',
  },
  'settings.user.create': {
    title: 'User created',
    description: 'A school user account was created or invited.',
  },
  'settings.role.permissions.change': {
    title: 'Role permissions changed',
    description: 'A role permission set was changed.',
  },
  'settings.login_identity.change': {
    title: 'Login identity settings changed',
    description: 'School login identity settings were changed.',
  },
  'settings.email.connection.update': {
    title: 'Email connection updated',
    description: 'School email connection settings were updated.',
  },
};

@Injectable()
export class ListDashboardActivityFeedUseCase {
  constructor(
    private readonly dashboardActivityFeedRepository: DashboardActivityFeedRepository,
  ) {}

  async execute(
    query: ListDashboardActivityFeedQueryDto = new ListDashboardActivityFeedQueryDto(),
  ): Promise<DashboardActivityFeedResponseDto> {
    const scope = requireDashboardScope();
    const normalized = normalizeActivityFeedQuery(query);

    const records =
      await this.dashboardActivityFeedRepository.listActivityAuditRecords(
        scope,
        {
          source: normalized.source,
          eventType: normalized.eventType,
          actorType: normalized.actorType,
          dateFrom: normalized.dateFrom,
          dateTo: normalized.dateTo,
          cursor: normalized.cursor,
          take: normalized.limit + 1,
        },
      );

    const items = records
      .map(mapAuditRecordToDashboardActivity)
      .filter((item): item is DashboardActivityFeedItemDto => item !== null)
      .filter((item) => matchesActivityFilters(item, normalized))
      .sort(compareDashboardActivityItems);
    const pageItems = items.slice(0, normalized.limit);
    const hasMore = items.length > normalized.limit;

    return presentDashboardActivityFeed({
      generatedAt: new Date(),
      items: pageItems,
      pageInfo: {
        limit: normalized.limit,
        nextCursor:
          hasMore && pageItems.length > 0
            ? encodeActivityCursor(pageItems[pageItems.length - 1])
            : null,
        hasMore,
      },
      filters: {
        source: normalized.source,
        eventType: normalized.eventType,
        actorType: normalized.actorType,
        dateFrom: normalized.dateFromIso,
        dateTo: normalized.dateToIso,
      },
    });
  }
}

export function normalizeActivityFeedQuery(
  query: ListDashboardActivityFeedQueryDto,
): NormalizedActivityFeedQuery {
  const eventType = normalizeEventPath(query.eventType);
  const eventTypeSource = resolveSourceFromEventType(eventType);

  if (eventType && !eventTypeSource) {
    throw new ValidationDomainException(
      'Dashboard activity event type is invalid',
      { eventType: query.eventType },
    );
  }

  const dateFrom = parseOptionalDate(query.dateFrom, 'dateFrom');
  const dateTo = parseOptionalDate(query.dateTo, 'dateTo');
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ValidationDomainException(
      'Dashboard activity date range is invalid',
      { dateFrom: query.dateFrom, dateTo: query.dateTo },
    );
  }

  return {
    source: query.source,
    eventType,
    actorType: query.actorType,
    dateFrom,
    dateTo,
    dateFromIso: query.dateFrom,
    dateToIso: query.dateTo,
    limit: normalizeActivityLimit(query.limit),
    cursor: query.cursor ? decodeActivityCursor(query.cursor) : undefined,
  };
}

export function mapAuditRecordToDashboardActivity(
  record: DashboardActivityAuditRecord,
): DashboardActivityFeedItemDto | null {
  const source = resolveActivitySource(record.module, record.action);
  if (!source) return null;

  const eventType = resolveActivityEventType(source, record.action);
  if (!eventType) return null;

  const text = EVENT_TEXT[eventType] ?? buildFallbackActivityText(eventType);
  const actorType = resolveActorType(record);
  const actorName = resolveActorDisplayName(record, actorType);
  const subjectType = normalizeSubjectType(record.resourceType);
  const occurredAt = record.createdAt.toISOString();

  return {
    activityId: `audit:${record.id}`,
    source,
    eventType,
    title: text.title,
    description: text.description,
    actor: {
      id: record.actorId ?? null,
      displayName: actorName,
      type: actorType,
    },
    subject: {
      type: subjectType,
      id: record.resourceId ?? null,
      label: humanizeIdentifier(subjectType),
    },
    occurredAt,
  };
}

export function compareDashboardActivityItems(
  left: DashboardActivityFeedItemDto,
  right: DashboardActivityFeedItemDto,
): number {
  const occurredAtDiff =
    new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
  if (occurredAtDiff !== 0) return occurredAtDiff;

  return left.activityId.localeCompare(right.activityId);
}

function matchesActivityFilters(
  item: DashboardActivityFeedItemDto,
  query: NormalizedActivityFeedQuery,
): boolean {
  return (
    (!query.source || item.source === query.source) &&
    (!query.eventType || item.eventType === query.eventType) &&
    (!query.actorType || item.actor.type === query.actorType)
  );
}

function resolveActivitySource(
  moduleName: string,
  action: string,
): DashboardActivityFeedSource | null {
  const moduleSource = normalizeSource(moduleName);
  if (moduleSource) return moduleSource;

  const actionSource = normalizeSource(action.split('.')[0]);
  return actionSource;
}

function normalizeSource(
  value: string | undefined,
): DashboardActivityFeedSource | null {
  if (!value) return null;
  if (value === 'iam' || value === 'auth') return 'settings';
  if ((DASHBOARD_ACTIVITY_FEED_SOURCES as readonly string[]).includes(value)) {
    return value as DashboardActivityFeedSource;
  }

  return null;
}

function resolveActivityEventType(
  source: DashboardActivityFeedSource,
  action: string,
): string | null {
  const normalizedAction = normalizeEventPath(action);
  if (!normalizedAction) return null;

  if (source === 'settings') {
    if (normalizedAction.startsWith('settings.')) return normalizedAction;
    if (normalizedAction.startsWith('iam.')) {
      return `settings.${normalizedAction.slice('iam.'.length)}`;
    }
    if (normalizedAction.startsWith('auth.')) {
      return `settings.${normalizedAction.slice('auth.'.length)}`;
    }

    return `settings.${normalizedAction}`;
  }

  if (normalizedAction.startsWith(`${source}.`)) {
    return normalizedAction;
  }

  return `${source}.${normalizedAction}`;
}

function resolveActorType(
  record: DashboardActivityAuditRecord,
): DashboardActivityActorType {
  switch (record.userType ?? record.actor?.userType ?? null) {
    case UserType.PLATFORM_USER:
    case UserType.ORGANIZATION_USER:
    case UserType.SCHOOL_USER:
      return 'admin';
    case UserType.TEACHER:
      return 'teacher';
    case UserType.STUDENT:
      return 'student';
    case UserType.PARENT:
      return 'parent';
    case UserType.SERVICE_ACCOUNT:
      return 'system';
    default:
      return record.actorId ? 'unknown' : 'system';
  }
}

function resolveActorDisplayName(
  record: DashboardActivityAuditRecord,
  actorType: DashboardActivityActorType,
): string {
  const name = record.actor
    ? [record.actor.firstName, record.actor.lastName]
        .filter((part) => typeof part === 'string' && part.trim().length > 0)
        .join(' ')
        .trim()
    : '';

  if (name.length > 0) return name;
  if (actorType === 'system') return 'System';
  return 'Unknown actor';
}

function buildFallbackActivityText(eventType: string): ActivityText {
  const parts = eventType.split('.').slice(1);
  const action = humanizeIdentifier(parts.join(' '));

  return {
    title: action,
    description: `A ${action.toLowerCase()} activity was recorded.`,
  };
}

function normalizeSubjectType(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'record';
}

function humanizeIdentifier(value: string): string {
  const normalized = value
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 'Record';

  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeEventPath(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/[^a-z0-9_.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^[._]+|[._]+$/g, '');

  return normalized.length > 0 ? normalized : undefined;
}

function parseOptionalDate(
  value: string | undefined,
  field: string,
): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationDomainException('Dashboard activity date is invalid', {
      field,
      value,
    });
  }

  return date;
}

function normalizeActivityLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DASHBOARD_ACTIVITY_FEED_DEFAULT_LIMIT;
  }

  return Math.min(
    Math.max(Math.trunc(limit), 1),
    DASHBOARD_ACTIVITY_FEED_MAX_LIMIT,
  );
}

function encodeActivityCursor(item: DashboardActivityFeedItemDto): string {
  const payload = {
    occurredAt: item.occurredAt,
    auditLogId: item.activityId.replace(/^audit:/, ''),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeActivityCursor(cursor: string): DashboardActivityAuditCursor {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const payload = JSON.parse(raw) as {
      occurredAt?: unknown;
      auditLogId?: unknown;
    };

    if (
      typeof payload.occurredAt !== 'string' ||
      typeof payload.auditLogId !== 'string'
    ) {
      throw new Error('Malformed cursor');
    }

    const occurredAt = new Date(payload.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new Error('Invalid cursor date');
    }

    return { occurredAt, auditLogId: payload.auditLogId };
  } catch {
    throw new ValidationDomainException(
      'Dashboard activity cursor is invalid',
      { cursor },
    );
  }
}
