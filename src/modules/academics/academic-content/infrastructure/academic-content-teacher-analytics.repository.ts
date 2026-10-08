import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  academicContentAnalyticsRangeDays,
  type AcademicContentAnalyticsCounts,
  type AcademicContentAnalyticsRange,
} from '../domain/academic-content-analytics.contract';

/** Internal server-resolved Teacher identity, never a client filter. */
export type AcademicContentTeacherAnalyticsScope = {
  schoolId: string;
  organizationId: string;
  teacherUserId: string;
  membershipId: string;
};
export type AcademicContentTeacherAnalyticsRow =
  AcademicContentAnalyticsCounts & {
    from: Date;
    toExclusive: Date;
    includedPublicationCount: string;
    revisionId: string | null;
  };

/** Same creator + every bound allocation identity as Teacher authoring, with
 * stricter all-target checks: unbound targets and invalid live relations deny.
 * Authorization and metrics share ONE statement snapshot at READ COMMITTED.
 * A read already started may precede a concurrent revocation's commit.
 */
export function teacherAcademicContentAnalyticsQuery(
  scope: AcademicContentTeacherAnalyticsScope,
  contentId: string,
  range: AcademicContentAnalyticsRange = '30d',
  publicationId?: string,
): Prisma.Sql {
  const days = academicContentAnalyticsRangeDays(range);
  const targetOwned = (year: Prisma.Sql, term: Prisma.Sql) => Prisma.sql`
    target.scope_type = 'CLASSROOM'
    AND target.stage_id IS NULL AND target.grade_id IS NULL AND target.section_id IS NULL
    AND EXISTS (SELECT 1 FROM owned_allocations allocation
      WHERE allocation.id = target.teacher_subject_allocation_id
        AND allocation.school_id = target.school_id
        AND allocation.classroom_id = target.classroom_id
        AND allocation.subject_id = target.subject_id
        AND allocation.academic_year_id = ${year} AND allocation.term_id = ${term})`;
  return Prisma.sql`
    WITH request_clock AS MATERIALIZED (
      SELECT statement_timestamp() AT TIME ZONE 'UTC' AS at
    ), authorized_actor AS MATERIALIZED (
      SELECT school.id AS school_id FROM schools school
      JOIN organizations organization ON organization.id = school.organization_id
      JOIN users actor ON actor.id = ${scope.teacherUserId}::uuid
      JOIN memberships membership ON membership.user_id = actor.id AND membership.school_id = school.id
      JOIN roles role ON role.id = membership.role_id
      WHERE school.id = ${scope.schoolId}::uuid AND school.organization_id = ${scope.organizationId}::uuid
        AND school.status = 'ACTIVE' AND school.deleted_at IS NULL
        AND organization.status = 'ACTIVE' AND organization.deleted_at IS NULL
        AND actor.user_type = 'TEACHER' AND actor.status = 'ACTIVE' AND actor.deleted_at IS NULL
        AND membership.id = ${scope.membershipId}::uuid AND membership.user_type = 'TEACHER'
        AND membership.organization_id = school.organization_id AND membership.status = 'ACTIVE'
        AND membership.deleted_at IS NULL AND membership.ended_at IS NULL
        AND role.deleted_at IS NULL AND (role.school_id IS NULL OR role.school_id = school.id)
        AND (SELECT count(DISTINCT permission.code) FROM role_permissions grant_row
          JOIN permissions permission ON permission.id = grant_row.permission_id
          WHERE grant_row.role_id = role.id AND permission.code IN
            ('academics.academic_content.view', 'academics.academic_content.analytics.own.view')) = 2
    ), owned_allocations AS MATERIALIZED (
      SELECT allocation.id, allocation.school_id, allocation.classroom_id, allocation.subject_id,
        allocation.term_id, term.academic_year_id
      FROM teacher_subject_allocations allocation
      JOIN authorized_actor actor ON actor.school_id = allocation.school_id
      JOIN terms term ON term.id = allocation.term_id AND term.school_id = allocation.school_id AND term.deleted_at IS NULL
      JOIN academic_years year ON year.id = term.academic_year_id AND year.school_id = allocation.school_id AND year.deleted_at IS NULL
      JOIN classrooms classroom ON classroom.id = allocation.classroom_id AND classroom.school_id = allocation.school_id AND classroom.deleted_at IS NULL
      JOIN sections section ON section.id = classroom.section_id AND section.school_id = allocation.school_id AND section.deleted_at IS NULL
      JOIN grades grade ON grade.id = section.grade_id AND grade.school_id = allocation.school_id AND grade.deleted_at IS NULL
      JOIN stages stage ON stage.id = grade.stage_id AND stage.school_id = allocation.school_id AND stage.deleted_at IS NULL
      JOIN subjects subject ON subject.id = allocation.subject_id AND subject.school_id = allocation.school_id AND subject.deleted_at IS NULL
      WHERE allocation.teacher_user_id = ${scope.teacherUserId}::uuid
        AND EXISTS (SELECT 1 FROM subject_allocations curriculum
          WHERE curriculum.school_id = allocation.school_id AND curriculum.subject_id = allocation.subject_id
            AND curriculum.grade_id = grade.id AND curriculum.academic_year_id = year.id
            AND curriculum.term_id = term.id AND curriculum.weekly_hours > 0 AND curriculum.deleted_at IS NULL)
    ), authorized_content AS MATERIALIZED (
      SELECT content.id, content.school_id FROM academic_contents content
      JOIN authorized_actor actor ON actor.school_id = content.school_id
      WHERE content.id = ${contentId}::uuid AND content.deleted_at IS NULL
        AND content.created_by_user_id = ${scope.teacherUserId}::uuid
        AND EXISTS (SELECT 1 FROM academic_content_targets target WHERE target.school_id = content.school_id AND target.academic_content_id = content.id)
        AND NOT EXISTS (SELECT 1 FROM academic_content_targets target
          WHERE target.school_id = content.school_id AND target.academic_content_id = content.id
            AND NOT COALESCE((${targetOwned(Prisma.sql`content.academic_year_id`, Prisma.sql`content.term_id`)}), false))
    ), eligible_publications AS MATERIALIZED (
      SELECT publication.id, publication.school_id, publication.academic_content_id, publication.revision_id
      FROM academic_content_publications publication
      JOIN authorized_content content ON content.id = publication.academic_content_id AND content.school_id = publication.school_id
      JOIN academic_content_revisions revision ON revision.id = publication.revision_id
        AND revision.school_id = publication.school_id AND revision.academic_content_id = content.id
      WHERE publication.published_at IS NOT NULL AND revision.snapshot_contract_version = 2
        ${publicationId === undefined ? Prisma.empty : Prisma.sql`AND publication.id = ${publicationId}::uuid`}
        AND EXISTS (SELECT 1 FROM academic_content_revision_targets target WHERE target.school_id = revision.school_id AND target.revision_id = revision.id)
        AND NOT EXISTS (SELECT 1 FROM academic_content_revision_targets target
          WHERE target.school_id = revision.school_id AND target.revision_id = revision.id
            AND NOT COALESCE((${targetOwned(Prisma.sql`revision.academic_year_id`, Prisma.sql`revision.term_id`)}), false))
    ), measurement_window AS MATERIALIZED (
      SELECT at - ${days}::integer * interval '1 day' AS from_at, at AS to_at FROM request_clock
    ), events AS MATERIALIZED (
      SELECT event.event_type, event.actor_kind, event.actor_user_id, event.student_id
      FROM academic_content_engagement_events event
      JOIN eligible_publications publication ON publication.id = event.publication_id
        AND publication.school_id = event.school_id AND publication.revision_id = event.revision_id
        AND publication.academic_content_id = event.academic_content_id
      CROSS JOIN measurement_window WHERE event.school_id = ${scope.schoolId}::uuid AND event.academic_content_id = ${contentId}::uuid
        AND event.created_at >= measurement_window.from_at AND event.created_at < measurement_window.to_at
    ), acknowledgements AS MATERIALIZED (
      SELECT acknowledgement.actor_user_id, acknowledgement.student_id FROM academic_content_acknowledgements acknowledgement
      JOIN eligible_publications publication ON publication.id = acknowledgement.publication_id
        AND publication.school_id = acknowledgement.school_id AND publication.revision_id = acknowledgement.revision_id
        AND publication.academic_content_id = acknowledgement.academic_content_id
      CROSS JOIN measurement_window WHERE acknowledgement.school_id = ${scope.schoolId}::uuid AND acknowledgement.academic_content_id = ${contentId}::uuid
        AND acknowledgement.acknowledged_at >= measurement_window.from_at AND acknowledgement.acknowledged_at < measurement_window.to_at
    ), event_counts AS (
      SELECT event_type::text, actor_kind::text, count(*)::text AS count FROM events GROUP BY event_type, actor_kind
    )
    SELECT measurement_window.from_at AS "from", measurement_window.to_at AS "toExclusive",
      (SELECT count(*)::text FROM eligible_publications) AS "includedPublicationCount",
      ${publicationId === undefined ? Prisma.sql`NULL::uuid` : Prisma.sql`(SELECT revision_id FROM eligible_publications)`} AS "revisionId",
      (SELECT count(*)::text FROM events) AS "totalEventReports",
      (SELECT count(DISTINCT student_id) FILTER (WHERE actor_kind = 'STUDENT')::text FROM events) AS "distinctStudentActorsEngaged",
      (SELECT count(DISTINCT (actor_user_id, student_id)) FILTER (WHERE actor_kind = 'PARENT')::text FROM events) AS "distinctParentChildPairsEngaged",
      (SELECT count(*)::text FROM acknowledgements) AS "acknowledgementRecords",
      (SELECT count(DISTINCT (actor_user_id, student_id))::text FROM acknowledgements) AS "distinctAcknowledgingParentChildPairs",
      (SELECT jsonb_agg(jsonb_build_object('eventType', kind.event_type, 'actorKind', actor.actor_kind, 'count', COALESCE(counts.count, '0'))
        ORDER BY kind.position, actor.position)
       FROM (VALUES ('CONTENT_VIEWED', 1), ('FILE_PREVIEWED', 2), ('FILE_DOWNLOADED', 3), ('LINK_CLICKED', 4), ('JOIN_LINK_CLICKED', 5)) kind(event_type, position)
       CROSS JOIN (VALUES ('STUDENT', 1), ('PARENT', 2)) actor(actor_kind, position)
       LEFT JOIN event_counts counts ON counts.event_type = kind.event_type AND counts.actor_kind = actor.actor_kind) AS "eventCountsByTypeAndActorKind"
    FROM measurement_window WHERE EXISTS (SELECT 1 FROM authorized_content)
      ${publicationId === undefined ? Prisma.empty : Prisma.sql`AND EXISTS (SELECT 1 FROM eligible_publications)`}`;
}

@Injectable()
export class AcademicContentTeacherAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async read(
    scope: AcademicContentTeacherAnalyticsScope,
    contentId: string,
    range: AcademicContentAnalyticsRange = '30d',
    publicationId?: string,
  ): Promise<AcademicContentTeacherAnalyticsRow> {
    const query = teacherAcademicContentAnalyticsQuery(
      scope,
      contentId,
      range,
      publicationId,
    );
    const rows = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
        return tx.$queryRaw<AcademicContentTeacherAnalyticsRow[]>(query);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 1000,
        timeout: 5000,
      },
    );
    if (!rows[0])
      throw new NotFoundDomainException('Academic content not found');
    return rows[0];
  }
}
