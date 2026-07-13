import { Injectable } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeItemStatus,
  GradeScopeType,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';
import { DashboardAnalyticsResolvedHierarchy } from '../domain/dashboard-analytics-query';

export interface DashboardAssessmentStatusDistributionAggregate {
  draft: number;
  published: number;
  approved: number;
  locked: number;
}

export interface DashboardGradebookCompletionAggregate {
  complete: number;
  missing: number;
}

interface AssessmentStatusRawRow {
  draft: bigint | number;
  published: bigint | number;
  approved: bigint | number;
  locked: bigint | number;
}

interface GradebookCompletionRawRow {
  complete: bigint | number;
  missing: bigint | number;
}

@Injectable()
export class DashboardGradesAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async countCurrentAssessmentStatusDistribution(input: {
    scope: DashboardScope;
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardAssessmentStatusDistributionAggregate> {
    const placementSql = assessmentPlacementSql(
      input.scope.schoolId,
      input.hierarchy,
    );
    const rows = await this.scopedPrisma.$queryRaw<AssessmentStatusRawRow[]>(
      Prisma.sql`
        WITH selected_placement AS (
          ${placementSql}
        )
        SELECT
          COUNT(*) FILTER (
            WHERE ga.locked_at IS NULL
              AND ga.approval_status = ${GradeAssessmentApprovalStatus.DRAFT}::grade_assessment_approval_status
          )::bigint AS draft,
          COUNT(*) FILTER (
            WHERE ga.locked_at IS NULL
              AND ga.approval_status = ${GradeAssessmentApprovalStatus.PUBLISHED}::grade_assessment_approval_status
          )::bigint AS published,
          COUNT(*) FILTER (
            WHERE ga.locked_at IS NULL
              AND ga.approval_status = ${GradeAssessmentApprovalStatus.APPROVED}::grade_assessment_approval_status
          )::bigint AS approved,
          COUNT(*) FILTER (WHERE ga.locked_at IS NOT NULL)::bigint AS locked
        FROM grade_assessments ga
        CROSS JOIN selected_placement sp
        WHERE ga.school_id = ${input.scope.schoolId}::uuid
          AND ga.deleted_at IS NULL
          ${input.hierarchy.academicYearId ? Prisma.sql`AND ga.academic_year_id = ${input.hierarchy.academicYearId}::uuid` : Prisma.empty}
          ${input.hierarchy.termId ? Prisma.sql`AND ga.term_id = ${input.hierarchy.termId}::uuid` : Prisma.empty}
          AND (
            sp.grade_id IS NULL
            OR ga.scope_type = ${GradeScopeType.SCHOOL}::grade_scope_type
            OR (
              ga.scope_type = ${GradeScopeType.STAGE}::grade_scope_type
              AND ga.scope_key = sp.stage_id
            )
            OR (
              ga.scope_type = ${GradeScopeType.GRADE}::grade_scope_type
              AND ga.scope_key = sp.grade_id
            )
            OR (
              sp.section_id IS NOT NULL
              AND ga.scope_type = ${GradeScopeType.SECTION}::grade_scope_type
              AND ga.scope_key = sp.section_id
            )
            OR (
              sp.classroom_id IS NOT NULL
              AND ga.scope_type = ${GradeScopeType.CLASSROOM}::grade_scope_type
              AND ga.scope_key = sp.classroom_id
            )
          )
      `,
    );
    const row = rows[0];

    return {
      draft: Number(row?.draft ?? 0),
      published: Number(row?.published ?? 0),
      approved: Number(row?.approved ?? 0),
      locked: Number(row?.locked ?? 0),
    };
  }

  async countCurrentGradebookCompletion(input: {
    scope: DashboardScope;
    hierarchy: DashboardAnalyticsResolvedHierarchy;
  }): Promise<DashboardGradebookCompletionAggregate> {
    const hierarchy = input.hierarchy;
    const rows = await this.scopedPrisma.$queryRaw<GradebookCompletionRawRow[]>(
      Prisma.sql`
        WITH qualifying_enrollments AS (
          SELECT DISTINCT
            e.id AS enrollment_id,
            e.student_id,
            st.id AS stage_id,
            g.id AS grade_id,
            sec.id AS section_id,
            c.id AS classroom_id
          FROM student_enrollments e
          INNER JOIN students s
            ON s.id = e.student_id
           AND s.school_id = e.school_id
          INNER JOIN classrooms c
            ON c.id = e.classroom_id
           AND c.school_id = e.school_id
          INNER JOIN sections sec
            ON sec.id = c.section_id
           AND sec.school_id = c.school_id
          INNER JOIN grades g
            ON g.id = sec.grade_id
           AND g.school_id = sec.school_id
          INNER JOIN stages st
            ON st.id = g.stage_id
           AND st.school_id = g.school_id
          WHERE e.school_id = ${input.scope.schoolId}::uuid
            AND s.school_id = ${input.scope.schoolId}::uuid
            AND c.school_id = ${input.scope.schoolId}::uuid
            AND sec.school_id = ${input.scope.schoolId}::uuid
            AND g.school_id = ${input.scope.schoolId}::uuid
            AND st.school_id = ${input.scope.schoolId}::uuid
            AND e.deleted_at IS NULL
            AND s.deleted_at IS NULL
            AND c.deleted_at IS NULL
            AND sec.deleted_at IS NULL
            AND g.deleted_at IS NULL
            AND st.deleted_at IS NULL
            AND e.status = ${StudentEnrollmentStatus.ACTIVE}::student_enrollment_status
            AND s.status = ${StudentStatus.ACTIVE}::student_status
            AND e.academic_year_id = ${hierarchy.academicYearId}::uuid
            AND (e.term_id = ${hierarchy.termId}::uuid OR e.term_id IS NULL)
            ${hierarchy.gradeId ? Prisma.sql`AND g.id = ${hierarchy.gradeId}::uuid` : Prisma.empty}
            ${hierarchy.sectionId ? Prisma.sql`AND sec.id = ${hierarchy.sectionId}::uuid` : Prisma.empty}
            ${hierarchy.classroomId ? Prisma.sql`AND c.id = ${hierarchy.classroomId}::uuid` : Prisma.empty}
        ),
        qualifying_assessments AS (
          SELECT ga.id, ga.scope_type, ga.scope_key
          FROM grade_assessments ga
          WHERE ga.school_id = ${input.scope.schoolId}::uuid
            AND ga.deleted_at IS NULL
            AND ga.academic_year_id = ${hierarchy.academicYearId}::uuid
            AND ga.term_id = ${hierarchy.termId}::uuid
            AND ga.delivery_mode IN (
              ${GradeAssessmentDeliveryMode.SCORE_ONLY}::grade_assessment_delivery_mode,
              ${GradeAssessmentDeliveryMode.QUESTION_BASED}::grade_assessment_delivery_mode
            )
            AND ga.approval_status IN (
              ${GradeAssessmentApprovalStatus.PUBLISHED}::grade_assessment_approval_status,
              ${GradeAssessmentApprovalStatus.APPROVED}::grade_assessment_approval_status
            )
        ),
        expected_cells AS (
          SELECT DISTINCT
            e.enrollment_id,
            e.student_id,
            a.id AS assessment_id
          FROM qualifying_enrollments e
          INNER JOIN qualifying_assessments a
            ON a.scope_type = ${GradeScopeType.SCHOOL}::grade_scope_type
            OR (
              a.scope_type = ${GradeScopeType.STAGE}::grade_scope_type
              AND a.scope_key = e.stage_id
            )
            OR (
              a.scope_type = ${GradeScopeType.GRADE}::grade_scope_type
              AND a.scope_key = e.grade_id
            )
            OR (
              a.scope_type = ${GradeScopeType.SECTION}::grade_scope_type
              AND a.scope_key = e.section_id
            )
            OR (
              a.scope_type = ${GradeScopeType.CLASSROOM}::grade_scope_type
              AND a.scope_key = e.classroom_id
            )
        ),
        grade_item_state AS (
          SELECT
            gi.assessment_id,
            gi.student_id,
            BOOL_OR(
              gi.status IN (
                ${GradeItemStatus.ENTERED}::grade_item_status,
                ${GradeItemStatus.ABSENT}::grade_item_status
              )
            ) AS is_complete
          FROM grade_items gi
          WHERE gi.school_id = ${input.scope.schoolId}::uuid
          GROUP BY gi.assessment_id, gi.student_id
        )
        SELECT
          COUNT(*) FILTER (WHERE COALESCE(gis.is_complete, FALSE))::bigint AS complete,
          COUNT(*) FILTER (WHERE NOT COALESCE(gis.is_complete, FALSE))::bigint AS missing
        FROM expected_cells ec
        LEFT JOIN grade_item_state gis
          ON gis.assessment_id = ec.assessment_id
         AND gis.student_id = ec.student_id
      `,
    );
    const row = rows[0];

    return {
      complete: Number(row?.complete ?? 0),
      missing: Number(row?.missing ?? 0),
    };
  }
}

function assessmentPlacementSql(
  schoolId: string,
  hierarchy: DashboardAnalyticsResolvedHierarchy,
): Prisma.Sql {
  if (hierarchy.classroomId) {
    return Prisma.sql`
      SELECT st.id AS stage_id, g.id AS grade_id, sec.id AS section_id, c.id AS classroom_id
      FROM classrooms c
      INNER JOIN sections sec
        ON sec.id = c.section_id
       AND sec.school_id = c.school_id
      INNER JOIN grades g
        ON g.id = sec.grade_id
       AND g.school_id = sec.school_id
      INNER JOIN stages st
        ON st.id = g.stage_id
       AND st.school_id = g.school_id
      WHERE c.id = ${hierarchy.classroomId}::uuid
        AND c.school_id = ${schoolId}::uuid
        AND sec.school_id = ${schoolId}::uuid
        AND g.school_id = ${schoolId}::uuid
        AND st.school_id = ${schoolId}::uuid
        AND c.deleted_at IS NULL
        AND sec.deleted_at IS NULL
        AND g.deleted_at IS NULL
        AND st.deleted_at IS NULL
    `;
  }
  if (hierarchy.sectionId) {
    return Prisma.sql`
      SELECT st.id AS stage_id, g.id AS grade_id, sec.id AS section_id, NULL::uuid AS classroom_id
      FROM sections sec
      INNER JOIN grades g
        ON g.id = sec.grade_id
       AND g.school_id = sec.school_id
      INNER JOIN stages st
        ON st.id = g.stage_id
       AND st.school_id = g.school_id
      WHERE sec.id = ${hierarchy.sectionId}::uuid
        AND sec.school_id = ${schoolId}::uuid
        AND g.school_id = ${schoolId}::uuid
        AND st.school_id = ${schoolId}::uuid
        AND sec.deleted_at IS NULL
        AND g.deleted_at IS NULL
        AND st.deleted_at IS NULL
    `;
  }
  if (hierarchy.gradeId) {
    return Prisma.sql`
      SELECT st.id AS stage_id, g.id AS grade_id, NULL::uuid AS section_id, NULL::uuid AS classroom_id
      FROM grades g
      INNER JOIN stages st
        ON st.id = g.stage_id
       AND st.school_id = g.school_id
      WHERE g.id = ${hierarchy.gradeId}::uuid
        AND g.school_id = ${schoolId}::uuid
        AND st.school_id = ${schoolId}::uuid
        AND g.deleted_at IS NULL
        AND st.deleted_at IS NULL
    `;
  }
  return Prisma.sql`
    SELECT NULL::uuid AS stage_id, NULL::uuid AS grade_id, NULL::uuid AS section_id, NULL::uuid AS classroom_id
  `;
}
