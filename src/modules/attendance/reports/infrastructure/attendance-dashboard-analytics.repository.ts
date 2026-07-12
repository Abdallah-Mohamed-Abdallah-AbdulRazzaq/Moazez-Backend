import { Injectable } from '@nestjs/common';
import {
  AttendanceExcuseStatus,
  AttendanceSessionStatus,
  AttendanceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

export interface AttendanceDashboardAnalyticsScope {
  schoolId: string;
}

export interface AttendanceDashboardAnalyticsHierarchy {
  academicYearId: string | null;
  termId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
}

export interface AttendanceDashboardAnalyticsWindow {
  startCivilDate: string;
  endCivilDate: string;
}

export interface AttendanceDashboardDailyStatusAggregate {
  date: string;
  status: AttendanceStatus;
  count: number;
}

export interface AttendanceDashboardExcuseStatusAggregate {
  status: AttendanceExcuseStatus;
  count: number;
}

interface AttendanceDashboardDailyStatusRawRow {
  date: string;
  status: AttendanceStatus;
  count: bigint | number;
}

@Injectable()
export class AttendanceDashboardAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async aggregateDailyEntryStatuses(input: {
    scope: AttendanceDashboardAnalyticsScope;
    window: AttendanceDashboardAnalyticsWindow;
    hierarchy: AttendanceDashboardAnalyticsHierarchy;
  }): Promise<AttendanceDashboardDailyStatusAggregate[]> {
    const hierarchyPredicates = entryHierarchyPredicates(input.hierarchy);
    const hierarchySql =
      hierarchyPredicates.length > 0
        ? Prisma.join(hierarchyPredicates, ' ')
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      AttendanceDashboardDailyStatusRawRow[]
    >(Prisma.sql`
      SELECT
        to_char(s.date, 'YYYY-MM-DD') AS date,
        e.status::text AS status,
        COUNT(*)::bigint AS count
      FROM attendance_entries e
      INNER JOIN attendance_sessions s
        ON s.id = e.session_id
       AND s.school_id = e.school_id
      WHERE e.school_id = ${input.scope.schoolId}::uuid
        AND s.school_id = ${input.scope.schoolId}::uuid
        AND s.status = ${AttendanceSessionStatus.SUBMITTED}::attendance_session_status
        AND s.deleted_at IS NULL
        AND s.date >= ${input.window.startCivilDate}::date
        AND s.date <= ${input.window.endCivilDate}::date
        ${hierarchySql}
      GROUP BY s.date, e.status
      ORDER BY s.date ASC, e.status ASC
    `);

    return rows.map((row) => ({
      date: row.date,
      status: row.status,
      count: Number(row.count),
    }));
  }

  async aggregateExcuseStatuses(input: {
    scope: AttendanceDashboardAnalyticsScope;
    window: AttendanceDashboardAnalyticsWindow;
    hierarchy: Pick<
      AttendanceDashboardAnalyticsHierarchy,
      'academicYearId' | 'termId'
    >;
  }): Promise<AttendanceDashboardExcuseStatusAggregate[]> {
    const rows = await this.scopedPrisma.attendanceExcuseRequest.groupBy({
      by: ['status'],
      where: {
        deletedAt: null,
        dateFrom: { lte: civilDate(input.window.endCivilDate) },
        dateTo: { gte: civilDate(input.window.startCivilDate) },
        ...(input.hierarchy.academicYearId
          ? { academicYearId: input.hierarchy.academicYearId }
          : {}),
        ...(input.hierarchy.termId ? { termId: input.hierarchy.termId } : {}),
      },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });

    return rows.map((row) => ({
      status: row.status,
      count: row._count._all,
    }));
  }
}

function entryHierarchyPredicates(
  hierarchy: AttendanceDashboardAnalyticsHierarchy,
): Prisma.Sql[] {
  return [
    ...(hierarchy.academicYearId
      ? [Prisma.sql`AND s.academic_year_id = ${hierarchy.academicYearId}::uuid`]
      : []),
    ...(hierarchy.termId
      ? [Prisma.sql`AND s.term_id = ${hierarchy.termId}::uuid`]
      : []),
    ...(hierarchy.gradeId
      ? [Prisma.sql`AND s.grade_id = ${hierarchy.gradeId}::uuid`]
      : []),
    ...(hierarchy.sectionId
      ? [Prisma.sql`AND s.section_id = ${hierarchy.sectionId}::uuid`]
      : []),
    ...(hierarchy.classroomId
      ? [Prisma.sql`AND s.classroom_id = ${hierarchy.classroomId}::uuid`]
      : []),
  ];
}

function civilDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
