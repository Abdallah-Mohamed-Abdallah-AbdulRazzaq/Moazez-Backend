import { Injectable } from '@nestjs/common';
import {
  CurriculumStatus,
  LessonPlanStatus,
  Prisma,
  TimetableConfigStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';
import { DashboardAnalyticsResolvedHierarchy } from '../domain/dashboard-analytics-query';

export interface DashboardTeacherAllocationCoverageAggregate {
  allocated: number;
  missing: number;
}

export interface DashboardTimetablePublicationStatusAggregate {
  published: number;
  draft: number;
}

export interface DashboardCurriculumActivationAggregate {
  active: number;
  draft: number;
}

export interface DashboardLessonPlanActivationAggregate {
  active: number;
  draft: number;
}

interface DashboardTeacherAllocationCoverageRawRow {
  allocated: bigint | number;
  missing: bigint | number;
}

@Injectable()
export class DashboardAcademicsAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async countTeacherAllocationCoverage(input: {
    scope: DashboardScope;
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardTeacherAllocationCoverageAggregate> {
    const hierarchySql = teacherAllocationHierarchySql(input.hierarchy);
    const rows = await this.prisma.$queryRaw<
      DashboardTeacherAllocationCoverageRawRow[]
    >(
      Prisma.sql`
        WITH expected_units AS (
          SELECT
            sa.term_id,
            sa.grade_id,
            sa.subject_id,
            c.id AS classroom_id
          FROM subject_allocations sa
          INNER JOIN terms t
            ON t.id = sa.term_id
           AND t.school_id = sa.school_id
           AND t.academic_year_id = sa.academic_year_id
          INNER JOIN subjects subj
            ON subj.id = sa.subject_id
           AND subj.school_id = sa.school_id
          INNER JOIN grades g
            ON g.id = sa.grade_id
           AND g.school_id = sa.school_id
          INNER JOIN sections sec
            ON sec.grade_id = g.id
           AND sec.school_id = g.school_id
          INNER JOIN classrooms c
            ON c.section_id = sec.id
           AND c.school_id = sec.school_id
          WHERE sa.school_id = ${input.scope.schoolId}::uuid
            AND t.school_id = ${input.scope.schoolId}::uuid
            AND subj.school_id = ${input.scope.schoolId}::uuid
            AND g.school_id = ${input.scope.schoolId}::uuid
            AND sec.school_id = ${input.scope.schoolId}::uuid
            AND c.school_id = ${input.scope.schoolId}::uuid
            AND sa.deleted_at IS NULL
            AND t.deleted_at IS NULL
            AND subj.deleted_at IS NULL
            AND g.deleted_at IS NULL
            AND sec.deleted_at IS NULL
            AND c.deleted_at IS NULL
            ${hierarchySql}
        )
        SELECT
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM teacher_subject_allocations tsa
              INNER JOIN users u
                ON u.id = tsa.teacher_user_id
              WHERE tsa.school_id = ${input.scope.schoolId}::uuid
                AND tsa.term_id = expected_units.term_id
                AND tsa.subject_id = expected_units.subject_id
                AND tsa.classroom_id = expected_units.classroom_id
                AND u.deleted_at IS NULL
            )
          )::bigint AS allocated,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1
              FROM teacher_subject_allocations tsa
              INNER JOIN users u
                ON u.id = tsa.teacher_user_id
              WHERE tsa.school_id = ${input.scope.schoolId}::uuid
                AND tsa.term_id = expected_units.term_id
                AND tsa.subject_id = expected_units.subject_id
                AND tsa.classroom_id = expected_units.classroom_id
                AND u.deleted_at IS NULL
            )
          )::bigint AS missing
        FROM expected_units
      `,
    );
    const row = rows[0];

    return {
      allocated: Number(row?.allocated ?? 0),
      missing: Number(row?.missing ?? 0),
    };
  }

  async countCurrentTimetablePublicationStatus(input: {
    scope: DashboardScope;
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardTimetablePublicationStatusAggregate> {
    const rows = await this.scopedPrisma.timetableConfig.groupBy({
      by: ['status'],
      where: {
        status: {
          in: [TimetableConfigStatus.ACTIVE, TimetableConfigStatus.DRAFT],
        },
        ...(input.hierarchy.academicYearId
          ? { academicYearId: input.hierarchy.academicYearId }
          : {}),
        ...(input.hierarchy.termId ? { termId: input.hierarchy.termId } : {}),
      },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });
    const counts = new Map(rows.map((row) => [row.status, row._count._all]));

    return {
      published: counts.get(TimetableConfigStatus.ACTIVE) ?? 0,
      draft: counts.get(TimetableConfigStatus.DRAFT) ?? 0,
    };
  }

  async countCurrentCurriculumActivationStatus(input: {
    scope: DashboardScope;
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardCurriculumActivationAggregate> {
    const rows = await this.scopedPrisma.curriculum.groupBy({
      by: ['status'],
      where: {
        deletedAt: null,
        status: { in: [CurriculumStatus.ACTIVE, CurriculumStatus.DRAFT] },
        ...(input.hierarchy.academicYearId
          ? { academicYearId: input.hierarchy.academicYearId }
          : {}),
        ...(input.hierarchy.termId ? { termId: input.hierarchy.termId } : {}),
        ...(input.hierarchy.gradeId
          ? { gradeId: input.hierarchy.gradeId }
          : {}),
      },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });
    const counts = new Map(rows.map((row) => [row.status, row._count._all]));

    return {
      active: counts.get(CurriculumStatus.ACTIVE) ?? 0,
      draft: counts.get(CurriculumStatus.DRAFT) ?? 0,
    };
  }

  async countCurrentLessonPlanActivationStatus(input: {
    scope: DashboardScope;
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardLessonPlanActivationAggregate> {
    const hierarchy = input.hierarchy;
    const rows = await this.scopedPrisma.lessonPlan.groupBy({
      by: ['status'],
      where: {
        deletedAt: null,
        status: { in: [LessonPlanStatus.ACTIVE, LessonPlanStatus.DRAFT] },
        ...(hierarchy.academicYearId
          ? { academicYearId: hierarchy.academicYearId }
          : {}),
        ...(hierarchy.termId ? { termId: hierarchy.termId } : {}),
        ...(hierarchy.classroomId
          ? { classroomId: hierarchy.classroomId }
          : {}),
        classroom: {
          is: {
            schoolId: input.scope.schoolId,
            deletedAt: null,
            section: {
              is: {
                schoolId: input.scope.schoolId,
                deletedAt: null,
                ...(hierarchy.sectionId ? { id: hierarchy.sectionId } : {}),
                ...(hierarchy.gradeId ? { gradeId: hierarchy.gradeId } : {}),
                grade: {
                  is: {
                    schoolId: input.scope.schoolId,
                    deletedAt: null,
                  },
                },
              },
            },
          },
        },
      },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });
    const counts = new Map(rows.map((row) => [row.status, row._count._all]));

    return {
      active: counts.get(LessonPlanStatus.ACTIVE) ?? 0,
      draft: counts.get(LessonPlanStatus.DRAFT) ?? 0,
    };
  }
}

function teacherAllocationHierarchySql(
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.Sql {
  const predicates = [
    ...(hierarchy.academicYearId
      ? [
          Prisma.sql`AND sa.academic_year_id = ${hierarchy.academicYearId}::uuid`,
        ]
      : []),
    ...(hierarchy.termId
      ? [Prisma.sql`AND sa.term_id = ${hierarchy.termId}::uuid`]
      : []),
    ...(hierarchy.gradeId
      ? [Prisma.sql`AND sa.grade_id = ${hierarchy.gradeId}::uuid`]
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
