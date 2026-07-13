import { Injectable } from '@nestjs/common';
import { HomeworkAssignmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';
import { DashboardAnalyticsResolvedHierarchy } from '../domain/dashboard-analytics-query';

export interface DashboardHomeworkAssignmentStatusAggregate {
  draft: number;
  published: number;
  closed: number;
  cancelled: number;
}

export interface DashboardHomeworkSubmissionReviewDailyAggregate {
  civilDate: string;
  submitted: number;
  reviewed: number;
}

export interface DashboardHomeworkGradeSyncCoverageAggregate {
  linked: number;
  pending: number;
}

interface HomeworkSubmissionReviewRawRow {
  date: string;
  submitted: bigint | number;
  reviewed: bigint | number;
}

@Injectable()
export class DashboardHomeworkAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async countCurrentAssignmentStatusDistribution(input: {
    scope: DashboardScope;
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardHomeworkAssignmentStatusAggregate> {
    const rows = await this.scopedPrisma.homeworkAssignment.groupBy({
      by: ['status'],
      where: {
        deletedAt: null,
        status: {
          in: [
            HomeworkAssignmentStatus.DRAFT,
            HomeworkAssignmentStatus.PUBLISHED,
            HomeworkAssignmentStatus.CLOSED,
            HomeworkAssignmentStatus.CANCELLED,
          ],
        },
        ...homeworkHierarchyWhere(input.scope.schoolId, input.hierarchy),
      },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });
    const counts = new Map(rows.map((row) => [row.status, row._count._all]));

    return {
      draft: counts.get(HomeworkAssignmentStatus.DRAFT) ?? 0,
      published: counts.get(HomeworkAssignmentStatus.PUBLISHED) ?? 0,
      closed: counts.get(HomeworkAssignmentStatus.CLOSED) ?? 0,
      cancelled: counts.get(HomeworkAssignmentStatus.CANCELLED) ?? 0,
    };
  }

  async aggregateSubmissionReviewEventsByCivilDate(input: {
    scope: DashboardScope;
    timezone: string;
    window: { startInclusive: Date; endExclusive: Date };
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardHomeworkSubmissionReviewDailyAggregate[]> {
    const hierarchySql = homeworkHierarchySql(input.hierarchy);
    const rows = await this.scopedPrisma.$queryRaw<
      HomeworkSubmissionReviewRawRow[]
    >(
      Prisma.sql`
        SELECT
          event_date AS date,
          SUM(submitted)::bigint AS submitted,
          SUM(reviewed)::bigint AS reviewed
        FROM (
          SELECT
            to_char(
              (hs.submitted_at AT TIME ZONE 'UTC') AT TIME ZONE ${input.timezone},
              'YYYY-MM-DD'
            ) AS event_date,
            COUNT(*)::bigint AS submitted,
            0::bigint AS reviewed
          FROM homework_submissions hs
          INNER JOIN homework_assignments ha
            ON ha.id = hs.homework_assignment_id
           AND ha.school_id = hs.school_id
          INNER JOIN classrooms c
            ON c.id = ha.classroom_id
           AND c.school_id = ha.school_id
          INNER JOIN sections sec
            ON sec.id = c.section_id
           AND sec.school_id = c.school_id
          INNER JOIN grades g
            ON g.id = sec.grade_id
           AND g.school_id = sec.school_id
          INNER JOIN stages st
            ON st.id = g.stage_id
           AND st.school_id = g.school_id
          WHERE hs.school_id = ${input.scope.schoolId}::uuid
            AND ha.school_id = ${input.scope.schoolId}::uuid
            AND c.school_id = ${input.scope.schoolId}::uuid
            AND sec.school_id = ${input.scope.schoolId}::uuid
            AND g.school_id = ${input.scope.schoolId}::uuid
            AND st.school_id = ${input.scope.schoolId}::uuid
            AND ha.deleted_at IS NULL
            AND c.deleted_at IS NULL
            AND sec.deleted_at IS NULL
            AND g.deleted_at IS NULL
            AND st.deleted_at IS NULL
            AND hs.submitted_at IS NOT NULL
            AND hs.submitted_at >= (${input.window.startInclusive}::timestamptz AT TIME ZONE 'UTC')
            AND hs.submitted_at < (${input.window.endExclusive}::timestamptz AT TIME ZONE 'UTC')
            ${hierarchySql}
          GROUP BY event_date

          UNION ALL

          SELECT
            to_char(
              (hs.reviewed_at AT TIME ZONE 'UTC') AT TIME ZONE ${input.timezone},
              'YYYY-MM-DD'
            ) AS event_date,
            0::bigint AS submitted,
            COUNT(*)::bigint AS reviewed
          FROM homework_submissions hs
          INNER JOIN homework_assignments ha
            ON ha.id = hs.homework_assignment_id
           AND ha.school_id = hs.school_id
          INNER JOIN classrooms c
            ON c.id = ha.classroom_id
           AND c.school_id = ha.school_id
          INNER JOIN sections sec
            ON sec.id = c.section_id
           AND sec.school_id = c.school_id
          INNER JOIN grades g
            ON g.id = sec.grade_id
           AND g.school_id = sec.school_id
          INNER JOIN stages st
            ON st.id = g.stage_id
           AND st.school_id = g.school_id
          WHERE hs.school_id = ${input.scope.schoolId}::uuid
            AND ha.school_id = ${input.scope.schoolId}::uuid
            AND c.school_id = ${input.scope.schoolId}::uuid
            AND sec.school_id = ${input.scope.schoolId}::uuid
            AND g.school_id = ${input.scope.schoolId}::uuid
            AND st.school_id = ${input.scope.schoolId}::uuid
            AND ha.deleted_at IS NULL
            AND c.deleted_at IS NULL
            AND sec.deleted_at IS NULL
            AND g.deleted_at IS NULL
            AND st.deleted_at IS NULL
            AND hs.reviewed_at IS NOT NULL
            AND hs.reviewed_at >= (${input.window.startInclusive}::timestamptz AT TIME ZONE 'UTC')
            AND hs.reviewed_at < (${input.window.endExclusive}::timestamptz AT TIME ZONE 'UTC')
            ${hierarchySql}
          GROUP BY event_date
        ) events
        GROUP BY event_date
        ORDER BY event_date ASC
      `,
    );

    return rows.map((row) => ({
      civilDate: row.date,
      submitted: Number(row.submitted),
      reviewed: Number(row.reviewed),
    }));
  }

  async countCurrentGradeSyncLinkCoverage(input: {
    scope: DashboardScope;
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardHomeworkGradeSyncCoverageAggregate> {
    const baseWhere: Prisma.HomeworkAssignmentWhereInput = {
      deletedAt: null,
      isGraded: true,
      status: {
        in: [
          HomeworkAssignmentStatus.DRAFT,
          HomeworkAssignmentStatus.PUBLISHED,
          HomeworkAssignmentStatus.CLOSED,
        ],
      },
      ...homeworkHierarchyWhere(input.scope.schoolId, input.hierarchy),
    };
    const [linked, pending] = await Promise.all([
      this.scopedPrisma.homeworkAssignment.count({
        where: { ...baseWhere, gradeAssessmentId: { not: null } },
      }),
      this.scopedPrisma.homeworkAssignment.count({
        where: { ...baseWhere, gradeAssessmentId: null },
      }),
    ]);

    return { linked, pending };
  }
}

function homeworkHierarchyWhere(
  schoolId: string,
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.HomeworkAssignmentWhereInput {
  return {
    ...(hierarchy.academicYearId
      ? { academicYearId: hierarchy.academicYearId }
      : {}),
    ...(hierarchy.termId ? { termId: hierarchy.termId } : {}),
    ...(hierarchy.classroomId ? { classroomId: hierarchy.classroomId } : {}),
    classroom: {
      is: {
        schoolId,
        deletedAt: null,
        section: {
          is: {
            schoolId,
            deletedAt: null,
            ...(hierarchy.sectionId ? { id: hierarchy.sectionId } : {}),
            ...(hierarchy.gradeId ? { gradeId: hierarchy.gradeId } : {}),
            grade: {
              is: {
                schoolId,
                deletedAt: null,
                stage: { is: { schoolId, deletedAt: null } },
              },
            },
          },
        },
      },
    },
  };
}

function homeworkHierarchySql(
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.Sql {
  const predicates = [
    ...(hierarchy.academicYearId
      ? [
          Prisma.sql`AND ha.academic_year_id = ${hierarchy.academicYearId}::uuid`,
        ]
      : []),
    ...(hierarchy.termId
      ? [Prisma.sql`AND ha.term_id = ${hierarchy.termId}::uuid`]
      : []),
    ...(hierarchy.gradeId
      ? [Prisma.sql`AND g.id = ${hierarchy.gradeId}::uuid`]
      : []),
    ...(hierarchy.sectionId
      ? [Prisma.sql`AND sec.id = ${hierarchy.sectionId}::uuid`]
      : []),
    ...(hierarchy.classroomId
      ? [Prisma.sql`AND c.id = ${hierarchy.classroomId}::uuid`]
      : []),
  ];
  return predicates.length > 0 ? Prisma.join(predicates, ' ') : Prisma.empty;
}
