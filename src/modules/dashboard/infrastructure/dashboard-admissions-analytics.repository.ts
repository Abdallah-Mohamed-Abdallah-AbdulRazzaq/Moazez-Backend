import { Injectable } from '@nestjs/common';
import {
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';

export interface DashboardApplicationStatusAggregate {
  status: AdmissionApplicationStatus;
  count: number;
}

export type DashboardApplicationEventType = 'submitted' | 'accepted';

export interface DashboardApplicationEventAggregate {
  date: string;
  event: DashboardApplicationEventType;
  count: number;
}

interface DashboardApplicationEventRawRow {
  date: string;
  event: DashboardApplicationEventType;
  count: bigint | number;
}

export interface DashboardAdmissionsAnalyticsHierarchy {
  academicYearId: string | null;
  gradeId: string | null;
}

@Injectable()
export class DashboardAdmissionsAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async countCurrentApplicationsByStatus(input: {
    scope: DashboardScope;
    hierarchy: DashboardAdmissionsAnalyticsHierarchy;
  }): Promise<DashboardApplicationStatusAggregate[]> {
    const rows = await this.scopedPrisma.application.groupBy({
      by: ['status'],
      where: {
        deletedAt: null,
        ...(input.hierarchy.academicYearId
          ? { requestedAcademicYearId: input.hierarchy.academicYearId }
          : {}),
        ...(input.hierarchy.gradeId
          ? { requestedGradeId: input.hierarchy.gradeId }
          : {}),
      },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });

    return rows.map((row) => ({
      status: row.status,
      count: row._count._all,
    }));
  }

  async aggregateApplicationEventsByCivilDate(input: {
    scope: DashboardScope;
    timezone: string;
    window: { startInclusive: Date; endExclusive: Date };
    hierarchy: DashboardAdmissionsAnalyticsHierarchy;
  }): Promise<DashboardApplicationEventAggregate[]> {
    const hierarchySql = applicationHierarchySql(input.hierarchy);
    const rows = await this.prisma.$queryRaw<DashboardApplicationEventRawRow[]>(
      Prisma.sql`
        SELECT event_date AS date, event, SUM(event_count)::bigint AS count
        FROM (
          SELECT
            to_char(
              (a.submitted_at AT TIME ZONE 'UTC') AT TIME ZONE ${input.timezone},
              'YYYY-MM-DD'
            ) AS event_date,
            'submitted'::text AS event,
            COUNT(*)::bigint AS event_count
          FROM admission_applications a
          WHERE a.school_id = ${input.scope.schoolId}::uuid
            AND a.deleted_at IS NULL
            AND a.submitted_at IS NOT NULL
            AND a.submitted_at >= (${input.window.startInclusive}::timestamptz AT TIME ZONE 'UTC')
            AND a.submitted_at < (${input.window.endExclusive}::timestamptz AT TIME ZONE 'UTC')
            ${hierarchySql}
          GROUP BY event_date

          UNION ALL

          SELECT
            to_char(
              (d.decided_at AT TIME ZONE 'UTC') AT TIME ZONE ${input.timezone},
              'YYYY-MM-DD'
            ) AS event_date,
            'accepted'::text AS event,
            COUNT(*)::bigint AS event_count
          FROM admission_decisions d
          INNER JOIN admission_applications a
            ON a.id = d.application_id
           AND a.school_id = d.school_id
          WHERE d.school_id = ${input.scope.schoolId}::uuid
            AND a.school_id = ${input.scope.schoolId}::uuid
            AND a.deleted_at IS NULL
            AND d.decision = ${AdmissionDecisionType.ACCEPT}::admission_decision_type
            AND d.decided_at >= (${input.window.startInclusive}::timestamptz AT TIME ZONE 'UTC')
            AND d.decided_at < (${input.window.endExclusive}::timestamptz AT TIME ZONE 'UTC')
            ${hierarchySql}
          GROUP BY event_date
        ) events
        GROUP BY event_date, event
        ORDER BY event_date ASC, event ASC
      `,
    );

    return rows.map((row) => ({
      date: row.date,
      event: row.event,
      count: Number(row.count),
    }));
  }
}

function applicationHierarchySql(
  hierarchy: DashboardAdmissionsAnalyticsHierarchy,
): Prisma.Sql {
  const predicates = [
    ...(hierarchy.academicYearId
      ? [
          Prisma.sql`AND a.requested_academic_year_id = ${hierarchy.academicYearId}::uuid`,
        ]
      : []),
    ...(hierarchy.gradeId
      ? [Prisma.sql`AND a.requested_grade_id = ${hierarchy.gradeId}::uuid`]
      : []),
  ];
  return predicates.length > 0 ? Prisma.join(predicates, ' ') : Prisma.empty;
}
