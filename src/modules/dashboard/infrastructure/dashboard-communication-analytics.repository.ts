import { Injectable } from '@nestjs/common';
import { CommunicationAnnouncementStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';
import { DashboardAnalyticsResolvedHierarchy } from '../domain/dashboard-analytics-query';

export interface DashboardCommunicationMessageDailyAggregate {
  civilDate: string;
  messages: number;
}

export interface DashboardAnnouncementStatusAggregate {
  draft: number;
  scheduled: number;
  published: number;
  archived: number;
  cancelled: number;
}

interface CommunicationMessageRawRow {
  date: string;
  messages: bigint | number;
}

@Injectable()
export class DashboardCommunicationAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async aggregateMessageVolumeByCivilDate(input: {
    scope: DashboardScope;
    timezone: string;
    window: { startInclusive: Date; endExclusive: Date };
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardCommunicationMessageDailyAggregate[]> {
    const rows = await this.scopedPrisma.$queryRaw<
      CommunicationMessageRawRow[]
    >(
      Prisma.sql`
        SELECT
          to_char(
            (cm.sent_at AT TIME ZONE 'UTC') AT TIME ZONE ${input.timezone},
            'YYYY-MM-DD'
          ) AS date,
          COUNT(*)::bigint AS messages
        FROM communication_messages cm
        INNER JOIN communication_conversations cc
          ON cc.id = cm.conversation_id
         AND cc.school_id = cm.school_id
        WHERE cm.school_id = ${input.scope.schoolId}::uuid
          AND cc.school_id = ${input.scope.schoolId}::uuid
          AND cc.deleted_at IS NULL
          AND cm.sent_at >= (${input.window.startInclusive}::timestamptz AT TIME ZONE 'UTC')
          AND cm.sent_at < (${input.window.endExclusive}::timestamptz AT TIME ZONE 'UTC')
          ${communicationHierarchySql(input.hierarchy)}
        GROUP BY date
        ORDER BY date ASC
      `,
    );

    return rows.map((row) => ({
      civilDate: row.date,
      messages: safeAggregateCount(row.messages),
    }));
  }

  async countCurrentAnnouncementsByStatus(input: {
    scope: DashboardScope;
  }): Promise<DashboardAnnouncementStatusAggregate> {
    const rows = await this.scopedPrisma.communicationAnnouncement.groupBy({
      by: ['status'],
      where: { schoolId: input.scope.schoolId },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });
    const counts = new Map(rows.map((row) => [row.status, row._count._all]));

    return {
      draft: counts.get(CommunicationAnnouncementStatus.DRAFT) ?? 0,
      scheduled: counts.get(CommunicationAnnouncementStatus.SCHEDULED) ?? 0,
      published: counts.get(CommunicationAnnouncementStatus.PUBLISHED) ?? 0,
      archived: counts.get(CommunicationAnnouncementStatus.ARCHIVED) ?? 0,
      cancelled: counts.get(CommunicationAnnouncementStatus.CANCELLED) ?? 0,
    };
  }
}

function communicationHierarchySql(
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.Sql {
  return Prisma.sql`
    ${hierarchy.academicYearId ? Prisma.sql`AND cc.academic_year_id = ${hierarchy.academicYearId}::uuid` : Prisma.empty}
    ${hierarchy.termId ? Prisma.sql`AND cc.term_id = ${hierarchy.termId}::uuid` : Prisma.empty}
    ${hierarchy.gradeId ? Prisma.sql`AND cc.grade_id = ${hierarchy.gradeId}::uuid` : Prisma.empty}
    ${hierarchy.sectionId ? Prisma.sql`AND cc.section_id = ${hierarchy.sectionId}::uuid` : Prisma.empty}
    ${hierarchy.classroomId ? Prisma.sql`AND cc.classroom_id = ${hierarchy.classroomId}::uuid` : Prisma.empty}
  `;
}

function safeAggregateCount(value: bigint | number): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('Dashboard communication aggregate count is unsafe');
  }
  return count;
}
