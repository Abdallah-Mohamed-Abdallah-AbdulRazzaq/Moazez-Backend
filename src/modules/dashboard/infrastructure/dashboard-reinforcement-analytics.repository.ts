import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReinforcementTaskStatus,
  RewardRedemptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';
import { DashboardAnalyticsResolvedHierarchy } from '../domain/dashboard-analytics-query';

export interface DashboardXpActivityDailyAggregate {
  civilDate: string;
  xp: number;
}

export interface DashboardReinforcementAssignmentCompletionAggregate {
  completed: number;
  pending: number;
  overdue: number;
}

export interface DashboardRewardRedemptionFunnelAggregate {
  requested: number;
  approved: number;
  fulfilled: number;
}

interface XpActivityRawRow {
  date: string;
  xp: bigint | number;
}

interface AssignmentCompletionRawRow {
  completed: bigint | number;
  pending: bigint | number;
  overdue: bigint | number;
}

interface RewardRedemptionFunnelRawRow {
  requested: bigint | number;
  approved: bigint | number;
  fulfilled: bigint | number;
}

@Injectable()
export class DashboardReinforcementAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async aggregateXpActivityByCivilDate(input: {
    scope: DashboardScope;
    timezone: string;
    window: { startInclusive: Date; endExclusive: Date };
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardXpActivityDailyAggregate[]> {
    const rows = await this.scopedPrisma.$queryRaw<XpActivityRawRow[]>(
      Prisma.sql`
        SELECT
          to_char(
            (xl.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE ${input.timezone},
            'YYYY-MM-DD'
          ) AS date,
          SUM(xl.amount)::bigint AS xp
        FROM xp_ledger xl
        WHERE xl.school_id = ${input.scope.schoolId}::uuid
          AND xl.occurred_at >= (${input.window.startInclusive}::timestamptz AT TIME ZONE 'UTC')
          AND xl.occurred_at < (${input.window.endExclusive}::timestamptz AT TIME ZONE 'UTC')
          ${xpAcademicContextSql(input.hierarchy)}
          ${reinforcementEnrollmentHierarchySql('xp', input.scope.schoolId, input.hierarchy)}
        GROUP BY date
        ORDER BY date ASC
      `,
    );

    return rows.map((row) => ({ civilDate: row.date, xp: Number(row.xp) }));
  }

  async countCurrentAssignmentCompletion(input: {
    scope: DashboardScope;
    generatedAt: Date;
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardReinforcementAssignmentCompletionAggregate> {
    const rows = await this.scopedPrisma.$queryRaw<
      AssignmentCompletionRawRow[]
    >(
      Prisma.sql`
        SELECT
          COUNT(*) FILTER (
            WHERE ra.status = ${ReinforcementTaskStatus.COMPLETED}::reinforcement_task_status
          )::bigint AS completed,
          COUNT(*) FILTER (
            WHERE ra.status IN (
              ${ReinforcementTaskStatus.NOT_COMPLETED}::reinforcement_task_status,
              ${ReinforcementTaskStatus.IN_PROGRESS}::reinforcement_task_status,
              ${ReinforcementTaskStatus.UNDER_REVIEW}::reinforcement_task_status
            )
              AND (
                rt.due_date IS NULL
                OR rt.due_date >= (${input.generatedAt}::timestamptz AT TIME ZONE 'UTC')
              )
          )::bigint AS pending,
          COUNT(*) FILTER (
            WHERE ra.status IN (
              ${ReinforcementTaskStatus.NOT_COMPLETED}::reinforcement_task_status,
              ${ReinforcementTaskStatus.IN_PROGRESS}::reinforcement_task_status,
              ${ReinforcementTaskStatus.UNDER_REVIEW}::reinforcement_task_status
            )
              AND rt.due_date < (${input.generatedAt}::timestamptz AT TIME ZONE 'UTC')
          )::bigint AS overdue
        FROM reinforcement_assignments ra
        INNER JOIN reinforcement_tasks rt
          ON rt.id = ra.task_id
         AND rt.school_id = ra.school_id
        WHERE ra.school_id = ${input.scope.schoolId}::uuid
          AND rt.school_id = ${input.scope.schoolId}::uuid
          AND ra.status <> ${ReinforcementTaskStatus.CANCELLED}::reinforcement_task_status
          AND rt.status <> ${ReinforcementTaskStatus.CANCELLED}::reinforcement_task_status
          AND rt.deleted_at IS NULL
          ${assignmentAcademicContextSql(input.hierarchy)}
          ${reinforcementEnrollmentHierarchySql('assignment', input.scope.schoolId, input.hierarchy)}
      `,
    );
    const row = rows[0];

    return {
      completed: Number(row?.completed ?? 0),
      pending: Number(row?.pending ?? 0),
      overdue: Number(row?.overdue ?? 0),
    };
  }

  async countRewardRedemptionFunnel(input: {
    scope: DashboardScope;
    window: { startInclusive: Date; endExclusive: Date };
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardRewardRedemptionFunnelAggregate> {
    const rows = await this.scopedPrisma.$queryRaw<
      RewardRedemptionFunnelRawRow[]
    >(
      Prisma.sql`
        SELECT
          COUNT(*)::bigint AS requested,
          COUNT(*) FILTER (
            WHERE rr.status IN (
              ${RewardRedemptionStatus.APPROVED}::reward_redemption_status,
              ${RewardRedemptionStatus.FULFILLED}::reward_redemption_status
            )
          )::bigint AS approved,
          COUNT(*) FILTER (
            WHERE rr.status = ${RewardRedemptionStatus.FULFILLED}::reward_redemption_status
          )::bigint AS fulfilled
        FROM reward_redemptions rr
        WHERE rr.school_id = ${input.scope.schoolId}::uuid
          AND rr.requested_at >= (${input.window.startInclusive}::timestamptz AT TIME ZONE 'UTC')
          AND rr.requested_at < (${input.window.endExclusive}::timestamptz AT TIME ZONE 'UTC')
          ${redemptionAcademicContextSql(input.hierarchy)}
          ${reinforcementEnrollmentHierarchySql('redemption', input.scope.schoolId, input.hierarchy)}
      `,
    );
    const row = rows[0];

    return {
      requested: Number(row?.requested ?? 0),
      approved: Number(row?.approved ?? 0),
      fulfilled: Number(row?.fulfilled ?? 0),
    };
  }
}

function xpAcademicContextSql(
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.Sql {
  return Prisma.sql`
    ${hierarchy.academicYearId ? Prisma.sql`AND xl.academic_year_id = ${hierarchy.academicYearId}::uuid` : Prisma.empty}
    ${hierarchy.termId ? Prisma.sql`AND xl.term_id = ${hierarchy.termId}::uuid` : Prisma.empty}
  `;
}

function assignmentAcademicContextSql(
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.Sql {
  return Prisma.sql`
    ${hierarchy.academicYearId ? Prisma.sql`AND ra.academic_year_id = ${hierarchy.academicYearId}::uuid` : Prisma.empty}
    ${hierarchy.termId ? Prisma.sql`AND ra.term_id = ${hierarchy.termId}::uuid` : Prisma.empty}
  `;
}

function redemptionAcademicContextSql(
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.Sql {
  return Prisma.sql`
    ${hierarchy.academicYearId ? Prisma.sql`AND rr.academic_year_id = ${hierarchy.academicYearId}::uuid` : Prisma.empty}
    ${hierarchy.termId ? Prisma.sql`AND rr.term_id = ${hierarchy.termId}::uuid` : Prisma.empty}
  `;
}

function reinforcementEnrollmentHierarchySql(
  source: 'xp' | 'assignment' | 'redemption',
  schoolId: string,
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.Sql {
  if (!hierarchy.gradeId && !hierarchy.sectionId && !hierarchy.classroomId) {
    return Prisma.empty;
  }

  const enrollmentReference =
    source === 'xp'
      ? Prisma.sql`xl.enrollment_id`
      : source === 'assignment'
        ? Prisma.sql`ra.enrollment_id`
        : Prisma.sql`rr.enrollment_id`;
  const schoolReference =
    source === 'xp'
      ? Prisma.sql`xl.school_id`
      : source === 'assignment'
        ? Prisma.sql`ra.school_id`
        : Prisma.sql`rr.school_id`;

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
      WHERE e.id = ${enrollmentReference}
        AND e.school_id = ${schoolReference}
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
