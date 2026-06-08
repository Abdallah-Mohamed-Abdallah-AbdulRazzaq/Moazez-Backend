import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma, UserType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';
import {
  DASHBOARD_ACTIVITY_FEED_SOURCES,
  DashboardActivityActorType,
  DashboardActivityFeedSource,
} from '../dto/dashboard-activity-feed.dto';

const DASHBOARD_ACTIVITY_AUDIT_LOG_ARGS =
  Prisma.validator<Prisma.AuditLogDefaultArgs>()({
    select: {
      id: true,
      actorId: true,
      userType: true,
      module: true,
      action: true,
      resourceType: true,
      resourceId: true,
      createdAt: true,
      actor: {
        select: {
          firstName: true,
          lastName: true,
          userType: true,
        },
      },
    },
  });

export type DashboardActivityAuditRecord = Prisma.AuditLogGetPayload<
  typeof DASHBOARD_ACTIVITY_AUDIT_LOG_ARGS
>;

export interface DashboardActivityAuditCursor {
  occurredAt: Date;
  auditLogId: string;
}

export interface DashboardActivityAuditQuery {
  source?: DashboardActivityFeedSource;
  eventType?: string;
  actorType?: DashboardActivityActorType;
  dateFrom?: Date;
  dateTo?: Date;
  cursor?: DashboardActivityAuditCursor;
  take: number;
}

const AUDIT_MODULES_BY_SOURCE: Record<DashboardActivityFeedSource, string[]> = {
  admissions: ['admissions'],
  students: ['students'],
  academics: ['academics'],
  attendance: ['attendance'],
  grades: ['grades'],
  homework: ['homework'],
  behavior: ['behavior'],
  reinforcement: ['reinforcement'],
  communication: ['communication'],
  settings: ['settings', 'iam', 'auth'],
};

const ALL_ACTIVITY_AUDIT_MODULES = unique(
  Object.values(AUDIT_MODULES_BY_SOURCE).flat(),
);

@Injectable()
export class DashboardActivityFeedRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listActivityAuditRecords(
    scope: DashboardScope,
    query: DashboardActivityAuditQuery,
  ): Promise<DashboardActivityAuditRecord[]> {
    return this.prisma.auditLog.findMany({
      where: buildActivityAuditWhere(scope, query),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: query.take,
      ...DASHBOARD_ACTIVITY_AUDIT_LOG_ARGS,
    });
  }
}

function buildActivityAuditWhere(
  scope: DashboardScope,
  query: DashboardActivityAuditQuery,
): Prisma.AuditLogWhereInput {
  const clauses: Prisma.AuditLogWhereInput[] = [
    {
      schoolId: scope.schoolId,
      outcome: AuditOutcome.SUCCESS,
      module: {
        in: query.source
          ? AUDIT_MODULES_BY_SOURCE[query.source]
          : ALL_ACTIVITY_AUDIT_MODULES,
      },
    },
  ];

  const createdAt = buildCreatedAtFilter(query);
  if (createdAt) clauses.push({ createdAt });

  const cursor = buildCursorFilter(query.cursor);
  if (cursor) clauses.push(cursor);

  const eventType = buildEventTypeFilter(query.eventType);
  if (eventType) clauses.push(eventType);

  const actorType = buildActorTypeFilter(query.actorType);
  if (actorType) clauses.push(actorType);

  return { AND: clauses };
}

function buildCreatedAtFilter(
  query: DashboardActivityAuditQuery,
): Prisma.DateTimeFilter | undefined {
  if (!query.dateFrom && !query.dateTo) return undefined;

  return {
    ...(query.dateFrom ? { gte: query.dateFrom } : {}),
    ...(query.dateTo ? { lte: query.dateTo } : {}),
  };
}

function buildCursorFilter(
  cursor: DashboardActivityAuditCursor | undefined,
): Prisma.AuditLogWhereInput | undefined {
  if (!cursor) return undefined;

  return {
    OR: [
      { createdAt: { lt: cursor.occurredAt } },
      {
        AND: [
          { createdAt: cursor.occurredAt },
          { id: { gt: cursor.auditLogId } },
        ],
      },
    ],
  };
}

function buildEventTypeFilter(
  eventType: string | undefined,
): Prisma.AuditLogWhereInput | undefined {
  const source = resolveSourceFromEventType(eventType);
  if (!eventType || !source) return undefined;

  const suffix = eventType.slice(source.length + 1);
  const actions =
    source === 'settings'
      ? unique([
          eventType,
          `settings.${suffix}`,
          `iam.${suffix}`,
          `auth.${suffix}`,
          suffix,
        ])
      : unique([eventType, suffix]);

  return { action: { in: actions } };
}

function buildActorTypeFilter(
  actorType: DashboardActivityActorType | undefined,
): Prisma.AuditLogWhereInput | undefined {
  switch (actorType) {
    case 'admin':
      return {
        userType: {
          in: [
            UserType.PLATFORM_USER,
            UserType.ORGANIZATION_USER,
            UserType.SCHOOL_USER,
          ],
        },
      };
    case 'teacher':
      return { userType: UserType.TEACHER };
    case 'student':
      return { userType: UserType.STUDENT };
    case 'parent':
      return { userType: UserType.PARENT };
    case 'system':
      return {
        OR: [
          { userType: UserType.SERVICE_ACCOUNT },
          { actorId: null, userType: null },
        ],
      };
    case 'unknown':
      return {
        OR: [
          { actorId: { not: null }, userType: null },
          { userType: { in: [UserType.APPLICANT, UserType.PICKUP_DELEGATE] } },
        ],
      };
    default:
      return undefined;
  }
}

export function resolveSourceFromEventType(
  eventType: string | undefined,
): DashboardActivityFeedSource | null {
  const source = eventType?.split('.')[0];
  if (
    source &&
    (DASHBOARD_ACTIVITY_FEED_SOURCES as readonly string[]).includes(source)
  ) {
    return source as DashboardActivityFeedSource;
  }

  return null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
