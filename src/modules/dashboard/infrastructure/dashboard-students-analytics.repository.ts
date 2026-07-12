import { Injectable } from '@nestjs/common';
import { Prisma, StudentEnrollmentStatus, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';
import { DashboardAnalyticsResolvedHierarchy } from '../domain/dashboard-analytics-query';

export interface DashboardEnrollmentStockEvaluation {
  key: string;
  instant: Date;
  kind: 'completed_bucket' | 'current_partial';
}

export interface DashboardEnrollmentStockAggregate {
  key: string;
  count: number;
}

export interface DashboardWithdrawalAggregate {
  date: string;
  count: number;
}

export interface DashboardGuardianCoverageAggregate {
  covered: number;
  missing: number;
}

interface DashboardEnrollmentStockRawRow {
  key: string;
  count: bigint | number;
}

interface DashboardWithdrawalRawRow {
  date: string;
  count: bigint | number;
}

@Injectable()
export class DashboardStudentsAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async countActiveEnrollmentsAtBucketCloses(input: {
    scope: DashboardScope;
    evaluations: readonly DashboardEnrollmentStockEvaluation[];
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardEnrollmentStockAggregate[]> {
    if (input.evaluations.length === 0) return [];

    const values = Prisma.join(
      input.evaluations.map(
        (evaluation) =>
          Prisma.sql`(
          ${evaluation.key}::text,
          (${evaluation.instant}::timestamptz AT TIME ZONE 'UTC'),
          ${evaluation.kind === 'current_partial'}::boolean
        )`,
      ),
    );
    const hierarchySql = enrollmentHierarchySql(
      input.scope.schoolId,
      input.hierarchy,
    );
    const rows = await this.prisma.$queryRaw<DashboardEnrollmentStockRawRow[]>(
      Prisma.sql`
        WITH evaluation_points(key, evaluation_at, is_current_partial) AS (
          VALUES ${values}
        )
        SELECT
          ep.key,
          (
            SELECT COUNT(*)::bigint
            FROM student_enrollments e
            INNER JOIN students s
              ON s.id = e.student_id
             AND s.school_id = e.school_id
            WHERE e.school_id = ${input.scope.schoolId}::uuid
              AND s.school_id = ${input.scope.schoolId}::uuid
              AND e.deleted_at IS NULL
              AND s.deleted_at IS NULL
              AND (
                (
                  ep.is_current_partial
                  AND e.enrolled_at <= ep.evaluation_at
                  AND (e.ended_at IS NULL OR e.ended_at > ep.evaluation_at)
                )
                OR
                (
                  NOT ep.is_current_partial
                  AND e.enrolled_at < ep.evaluation_at
                  AND (e.ended_at IS NULL OR e.ended_at >= ep.evaluation_at)
                )
              )
              ${hierarchySql}
          ) AS count
        FROM evaluation_points ep
      `,
    );

    const byKey = new Map(rows.map((row) => [row.key, Number(row.count)]));
    return input.evaluations.map((evaluation) => ({
      key: evaluation.key,
      count: byKey.get(evaluation.key) ?? 0,
    }));
  }

  async aggregateWithdrawalsByCivilDate(input: {
    scope: DashboardScope;
    timezone: string;
    window: { startInclusive: Date; endExclusive: Date };
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardWithdrawalAggregate[]> {
    const hierarchySql = enrollmentHierarchySql(
      input.scope.schoolId,
      input.hierarchy,
    );
    const rows = await this.prisma.$queryRaw<DashboardWithdrawalRawRow[]>(
      Prisma.sql`
        SELECT
          to_char(
            (e.ended_at AT TIME ZONE 'UTC') AT TIME ZONE ${input.timezone},
            'YYYY-MM-DD'
          ) AS date,
          COUNT(*)::bigint AS count
        FROM student_enrollments e
        INNER JOIN students s
          ON s.id = e.student_id
         AND s.school_id = e.school_id
        WHERE e.school_id = ${input.scope.schoolId}::uuid
          AND s.school_id = ${input.scope.schoolId}::uuid
          AND e.deleted_at IS NULL
          AND s.deleted_at IS NULL
          AND e.status = ${StudentEnrollmentStatus.WITHDRAWN}::student_enrollment_status
          AND e.ended_at IS NOT NULL
          AND e.ended_at >= (${input.window.startInclusive}::timestamptz AT TIME ZONE 'UTC')
          AND e.ended_at < (${input.window.endExclusive}::timestamptz AT TIME ZONE 'UTC')
          ${hierarchySql}
        GROUP BY date
        ORDER BY date ASC
      `,
    );

    return rows.map((row) => ({ date: row.date, count: Number(row.count) }));
  }

  async countCurrentGuardianCoverage(input: {
    scope: DashboardScope;
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardGuardianCoverageAggregate> {
    const hierarchySupplied = Object.values(input.hierarchy).some(
      (value) => value !== null,
    );
    const populationWhere: Prisma.StudentWhereInput = {
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      ...(hierarchySupplied
        ? {
            enrollments: {
              some: currentEnrollmentWhere(
                input.scope.schoolId,
                input.hierarchy,
              ),
            },
          }
        : {}),
    };
    const coveredWhere: Prisma.StudentWhereInput = {
      ...populationWhere,
      guardians: {
        some: {
          schoolId: input.scope.schoolId,
          guardian: {
            is: { schoolId: input.scope.schoolId, deletedAt: null },
          },
        },
      },
    };

    const [population, covered] = await Promise.all([
      this.scopedPrisma.student.count({ where: populationWhere }),
      this.scopedPrisma.student.count({ where: coveredWhere }),
    ]);

    return { covered, missing: Math.max(0, population - covered) };
  }
}

function enrollmentHierarchySql(
  schoolId: string,
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.Sql {
  const predicates = [
    ...(hierarchy.academicYearId
      ? [Prisma.sql`AND e.academic_year_id = ${hierarchy.academicYearId}::uuid`]
      : []),
    ...(hierarchy.termId
      ? [Prisma.sql`AND e.term_id = ${hierarchy.termId}::uuid`]
      : []),
    ...(hierarchy.classroomId
      ? [Prisma.sql`AND e.classroom_id = ${hierarchy.classroomId}::uuid`]
      : []),
    ...(hierarchy.sectionId || hierarchy.gradeId
      ? [
          Prisma.sql`
            AND EXISTS (
              SELECT 1
              FROM classrooms c
              INNER JOIN sections sec
                ON sec.id = c.section_id
               AND sec.school_id = c.school_id
              WHERE c.id = e.classroom_id
                AND c.school_id = e.school_id
                AND c.school_id = ${schoolId}::uuid
                AND c.deleted_at IS NULL
                AND sec.deleted_at IS NULL
                ${hierarchy.sectionId ? Prisma.sql`AND sec.id = ${hierarchy.sectionId}::uuid` : Prisma.empty}
                ${hierarchy.gradeId ? Prisma.sql`AND sec.grade_id = ${hierarchy.gradeId}::uuid` : Prisma.empty}
            )
          `,
        ]
      : []),
  ];
  return predicates.length > 0 ? Prisma.join(predicates, ' ') : Prisma.empty;
}

function currentEnrollmentWhere(
  schoolId: string,
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.EnrollmentWhereInput {
  return {
    schoolId,
    deletedAt: null,
    status: StudentEnrollmentStatus.ACTIVE,
    ...(hierarchy.academicYearId
      ? { academicYearId: hierarchy.academicYearId }
      : {}),
    ...(hierarchy.termId ? { termId: hierarchy.termId } : {}),
    ...(hierarchy.classroomId ? { classroomId: hierarchy.classroomId } : {}),
    ...(hierarchy.sectionId || hierarchy.gradeId
      ? {
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
                },
              },
            },
          },
        }
      : {}),
  };
}
