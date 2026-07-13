import { Injectable } from '@nestjs/common';
import {
  BehaviorRecordStatus,
  BehaviorRecordType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';
import { DashboardAnalyticsResolvedHierarchy } from '../domain/dashboard-analytics-query';

export interface DashboardBehaviorRecordTypeDailyAggregate {
  civilDate: string;
  positive: number;
  negative: number;
}

export interface DashboardBehaviorCategoryAggregate {
  label: string;
  count: number;
}

interface BehaviorRecordTypeRawRow {
  date: string;
  positive: bigint | number;
  negative: bigint | number;
}

interface BehaviorPendingReviewRawRow {
  pendingReview: bigint | number;
}

interface BehaviorCategoryRawRow {
  label: string;
  count: bigint | number;
}

@Injectable()
export class DashboardBehaviorAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async aggregateApprovedRecordTypesByCivilDate(input: {
    scope: DashboardScope;
    timezone: string;
    window: { startInclusive: Date; endExclusive: Date };
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardBehaviorRecordTypeDailyAggregate[]> {
    const rows = await this.scopedPrisma.$queryRaw<BehaviorRecordTypeRawRow[]>(
      Prisma.sql`
        SELECT
          to_char(
            (br.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE ${input.timezone},
            'YYYY-MM-DD'
          ) AS date,
          COUNT(*) FILTER (
            WHERE br.type = ${BehaviorRecordType.POSITIVE}::behavior_record_type
          )::bigint AS positive,
          COUNT(*) FILTER (
            WHERE br.type = ${BehaviorRecordType.NEGATIVE}::behavior_record_type
          )::bigint AS negative
        FROM behavior_records br
        WHERE br.school_id = ${input.scope.schoolId}::uuid
          AND br.deleted_at IS NULL
          AND br.status = ${BehaviorRecordStatus.APPROVED}::behavior_record_status
          AND br.occurred_at >= (${input.window.startInclusive}::timestamptz AT TIME ZONE 'UTC')
          AND br.occurred_at < (${input.window.endExclusive}::timestamptz AT TIME ZONE 'UTC')
          ${behaviorAcademicContextSql(input.hierarchy)}
          ${behaviorEnrollmentHierarchySql(input.scope.schoolId, input.hierarchy)}
        GROUP BY date
        ORDER BY date ASC
      `,
    );

    return rows.map((row) => ({
      civilDate: row.date,
      positive: Number(row.positive),
      negative: Number(row.negative),
    }));
  }

  async countCurrentPendingReview(input: {
    scope: DashboardScope;
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<number> {
    const rows = await this.scopedPrisma.$queryRaw<
      BehaviorPendingReviewRawRow[]
    >(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS "pendingReview"
        FROM behavior_records br
        WHERE br.school_id = ${input.scope.schoolId}::uuid
          AND br.deleted_at IS NULL
          AND br.status = ${BehaviorRecordStatus.SUBMITTED}::behavior_record_status
          ${behaviorAcademicContextSql(input.hierarchy)}
          ${behaviorEnrollmentHierarchySql(input.scope.schoolId, input.hierarchy)}
      `,
    );

    return Number(rows[0]?.pendingReview ?? 0);
  }

  async countApprovedRecordsByCategory(input: {
    scope: DashboardScope;
    window: { startInclusive: Date; endExclusive: Date };
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardBehaviorCategoryAggregate[]> {
    const rows = await this.scopedPrisma.$queryRaw<BehaviorCategoryRawRow[]>(
      Prisma.sql`
        SELECT
          COALESCE(
            NULLIF(BTRIM(bc.name_en), ''),
            NULLIF(BTRIM(bc.name_ar), ''),
            NULLIF(BTRIM(bc.code), ''),
            'Uncategorized'
          ) AS label,
          COUNT(*)::bigint AS count
        FROM behavior_records br
        LEFT JOIN behavior_categories bc
          ON bc.id = br.category_id
         AND bc.school_id = br.school_id
         AND bc.deleted_at IS NULL
        WHERE br.school_id = ${input.scope.schoolId}::uuid
          AND br.deleted_at IS NULL
          AND br.status = ${BehaviorRecordStatus.APPROVED}::behavior_record_status
          AND br.occurred_at >= (${input.window.startInclusive}::timestamptz AT TIME ZONE 'UTC')
          AND br.occurred_at < (${input.window.endExclusive}::timestamptz AT TIME ZONE 'UTC')
          ${behaviorAcademicContextSql(input.hierarchy)}
          ${behaviorEnrollmentHierarchySql(input.scope.schoolId, input.hierarchy)}
        GROUP BY label
        ORDER BY count DESC, label ASC
      `,
    );

    return rows.map((row) => ({ label: row.label, count: Number(row.count) }));
  }
}

function behaviorAcademicContextSql(
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.Sql {
  return Prisma.sql`
    ${hierarchy.academicYearId ? Prisma.sql`AND br.academic_year_id = ${hierarchy.academicYearId}::uuid` : Prisma.empty}
    ${hierarchy.termId ? Prisma.sql`AND br.term_id = ${hierarchy.termId}::uuid` : Prisma.empty}
  `;
}

function behaviorEnrollmentHierarchySql(
  schoolId: string,
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.Sql {
  if (!hierarchy.gradeId && !hierarchy.sectionId && !hierarchy.classroomId) {
    return Prisma.empty;
  }

  return Prisma.sql`
    AND EXISTS (
      SELECT 1
      FROM student_enrollments e
      INNER JOIN classrooms c
        ON c.id = e.classroom_id
       AND c.school_id = e.school_id
      INNER JOIN sections sec
        ON sec.id = c.section_id
       AND sec.school_id = c.school_id
      INNER JOIN grades g
        ON g.id = sec.grade_id
       AND g.school_id = sec.school_id
      WHERE e.id = br.enrollment_id
        AND e.school_id = br.school_id
        AND e.school_id = ${schoolId}::uuid
        AND e.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND sec.deleted_at IS NULL
        AND g.deleted_at IS NULL
        ${hierarchy.gradeId ? Prisma.sql`AND g.id = ${hierarchy.gradeId}::uuid` : Prisma.empty}
        ${hierarchy.sectionId ? Prisma.sql`AND sec.id = ${hierarchy.sectionId}::uuid` : Prisma.empty}
        ${hierarchy.classroomId ? Prisma.sql`AND c.id = ${hierarchy.classroomId}::uuid` : Prisma.empty}
    )
  `;
}
