import { Injectable } from '@nestjs/common';
import {
  OrganizationStatus,
  Prisma,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentCurrentRecipientContext } from '../domain/academic-content-current-access.policy';
import {
  AcademicContentRecipientCard,
  AcademicContentRecipientDetail,
  AcademicContentRecipientFeedQuery,
} from '../domain/academic-content-recipient.query';

type StudentRecipientContext = Extract<
  AcademicContentCurrentRecipientContext,
  { actorKind: 'STUDENT' }
>;

// Reuses the ACC-10A matcher semantics against live relationships and immutable targets.
// Every raw query explicitly constrains the School; no recipient snapshot is an ACL.
function currentStudentPublicationQuery(
  context: StudentRecipientContext,
  now: Date,
) {
  return Prisma.sql`
    FROM academic_content_publications p
    JOIN academic_content_revisions r ON r.id = p.revision_id AND r.school_id = p.school_id AND r.academic_content_id = p.academic_content_id
    JOIN academic_contents c ON c.id = p.academic_content_id AND c.school_id = p.school_id
    JOIN schools school ON school.id = p.school_id
    JOIN organizations organization ON organization.id = school.organization_id
    JOIN student_enrollments e ON e.id = ${context.enrollmentId}::uuid AND e.school_id = p.school_id
    JOIN students student ON student.id = e.student_id AND student.school_id = e.school_id
    JOIN users actor ON actor.id = student.user_id
    JOIN classrooms classroom ON classroom.id = e.classroom_id AND classroom.school_id = e.school_id
    JOIN sections section ON section.id = classroom.section_id AND section.school_id = e.school_id
    JOIN grades grade ON grade.id = section.grade_id AND grade.school_id = e.school_id
    JOIN stages stage ON stage.id = grade.stage_id AND stage.school_id = e.school_id
    WHERE p.school_id = ${context.schoolId}::uuid
      AND school.status = 'ACTIVE' AND school.deleted_at IS NULL
      AND organization.status = 'ACTIVE' AND organization.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND p.status = 'PUBLISHED' AND p.published_at IS NOT NULL AND p.published_at <= ${now}
      AND p.visible_from <= ${now} AND (p.visible_until IS NULL OR p.visible_until > ${now})
      AND r.snapshot_contract_version = 2
      AND r.academic_year_id = ${context.academicYearId}::uuid AND r.term_id = ${context.termId}::uuid
      AND r.type IN ('WEEKLY_PLAN', 'SUBJECT_RESOURCE', 'ONLINE_SESSION', 'GENERAL_RESOURCE')
      AND r.audience IN ('STUDENTS', 'STUDENTS_AND_GUARDIANS')
      AND student.id = ${context.studentId}::uuid AND student.status = 'ACTIVE' AND student.deleted_at IS NULL
      AND actor.id = ${context.userId}::uuid AND actor.user_type = 'STUDENT' AND actor.status = 'ACTIVE' AND actor.deleted_at IS NULL
      AND e.status = 'ACTIVE' AND e.deleted_at IS NULL
      AND e.classroom_id = ${context.classroomId}::uuid
      AND e.academic_year_id = r.academic_year_id AND e.term_id = r.term_id
      AND classroom.deleted_at IS NULL AND section.deleted_at IS NULL AND grade.deleted_at IS NULL AND stage.deleted_at IS NULL`;
}

function matchingRevisionTarget(subjectId?: string) {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM academic_content_revision_targets target
    WHERE target.revision_id = r.id AND target.school_id = p.school_id
      AND (target.scope_type = 'SCHOOL'
        OR (target.scope_type = 'STAGE' AND target.stage_id = stage.id)
        OR (target.scope_type = 'GRADE' AND target.grade_id = grade.id)
        OR (target.scope_type = 'SECTION' AND target.section_id = section.id)
        OR (target.scope_type = 'CLASSROOM' AND target.classroom_id = classroom.id))
      ${subjectId ? Prisma.sql`AND target.subject_id = ${subjectId}::uuid` : Prisma.empty}
      AND (target.subject_id IS NULL OR EXISTS (
        SELECT 1 FROM subject_allocations allocation
        WHERE allocation.school_id = p.school_id
          AND allocation.academic_year_id = e.academic_year_id AND allocation.term_id = e.term_id
          AND allocation.grade_id = grade.id AND allocation.subject_id = target.subject_id
          AND allocation.weekly_hours > 0 AND allocation.deleted_at IS NULL
      ))
  )`;
}

const CARD_COLUMNS = Prisma.sql`
  p.academic_content_id AS "contentId", p.id AS "publicationId", p.revision_id AS "revisionId",
  r.type, r.audience, r.title, r.description, p.published_at AS "publishedAt",
  p.visible_from AS "visibleFrom", p.visible_until AS "visibleUntil",
  CASE r.type
    WHEN 'WEEKLY_PLAN' THEN jsonb_build_object('weekStartDate', r.type_specific_snapshot #> '{state,weekStartDate}', 'weekEndDate', r.type_specific_snapshot #> '{state,weekEndDate}')
    WHEN 'SUBJECT_RESOURCE' THEN jsonb_build_object('resourceCategory', r.type_specific_snapshot #> '{state,resourceCategory}')
    WHEN 'ONLINE_SESSION' THEN jsonb_build_object('platform', r.type_specific_snapshot #> '{state,platform}', 'startAt', r.type_specific_snapshot #> '{state,startAt}', 'endAt', r.type_specific_snapshot #> '{state,endAt}')
    ELSE NULL
  END AS summary`;

const PUBLICATION_SELECT = {
  id: true,
  schoolId: true,
  academicContentId: true,
  revisionId: true,
  status: true,
  publishedAt: true,
  visibleFrom: true,
  visibleUntil: true,
  revision: {
    select: {
      id: true,
      schoolId: true,
      academicContentId: true,
      snapshotContractVersion: true,
      academicYearId: true,
      termId: true,
      type: true,
      audience: true,
      targets: {
        select: {
          id: true,
          schoolId: true,
          revisionId: true,
          scopeType: true,
          stageId: true,
          gradeId: true,
          sectionId: true,
          classroomId: true,
          subjectId: true,
        },
      },
    },
  },
} satisfies Prisma.AcademicContentPublicationSelect;

@Injectable()
export class AcademicContentRecipientReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listCurrentStudentPublications(
    context: StudentRecipientContext,
    query: AcademicContentRecipientFeedQuery,
    now: Date,
  ) {
    const filters: Prisma.Sql[] = [matchingRevisionTarget(query.subjectId)];
    if (query.type) filters.push(Prisma.sql`r.type::text = ${query.type}`);
    if (query.search) {
      // Treat user wildcards literally, following Prisma contains semantics.
      const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      filters.push(
        Prisma.sql`(r.title ILIKE ${pattern} OR r.description ILIKE ${pattern})`,
      );
    }
    if (query.normalizedTag)
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM academic_content_revision_tags tag WHERE tag.revision_id = r.id AND tag.school_id = p.school_id AND tag.normalized_value = ${query.normalizedTag})`,
      );
    if (query.weeklyDateFrom || query.weeklyDateTo) {
      filters.push(Prisma.sql`r.type = 'WEEKLY_PLAN'`);
      if (query.weeklyDateFrom)
        filters.push(
          Prisma.sql`r.type_specific_snapshot #>> '{state,weekEndDate}' >= ${query.weeklyDateFrom}`,
        );
      if (query.weeklyDateTo)
        filters.push(
          Prisma.sql`r.type_specific_snapshot #>> '{state,weekStartDate}' <= ${query.weeklyDateTo}`,
        );
    }
    if (
      query.sessionStartAtFrom ||
      query.sessionStartAtTo ||
      query.sessionPlatform
    ) {
      filters.push(Prisma.sql`r.type = 'ONLINE_SESSION'`);
      if (query.sessionStartAtFrom)
        filters.push(
          Prisma.sql`r.type_specific_snapshot #>> '{state,startAt}' >= ${query.sessionStartAtFrom}`,
        );
      if (query.sessionStartAtTo)
        filters.push(
          Prisma.sql`r.type_specific_snapshot #>> '{state,startAt}' <= ${query.sessionStartAtTo}`,
        );
      if (query.sessionPlatform)
        filters.push(
          Prisma.sql`r.type_specific_snapshot #>> '{state,platform}' = ${query.sessionPlatform}`,
        );
    }
    // A single statement gives count and page the same live authorization snapshot,
    // including the count when an out-of-range page has no rows. No secrets are selected.
    const rows = await this.prisma.$queryRaw<
      (AcademicContentRecipientCard & { total: number })[]
    >(Prisma.sql`
      WITH eligible AS (
        SELECT ${CARD_COLUMNS} ${currentStudentPublicationQuery(context, now)}
          AND ${Prisma.join(filters, ' AND ')}
      ), page AS (
        SELECT * FROM eligible ORDER BY "visibleFrom" DESC, "publicationId" DESC
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
      ), total AS (SELECT count(*)::integer AS total FROM eligible)
      SELECT page.*, total.total FROM total LEFT JOIN page ON true
      ORDER BY page."visibleFrom" DESC, page."publicationId" DESC`);
    return {
      items: rows
        .filter((row) => row.publicationId !== null)
        .map((row) => ({
          contentId: row.contentId,
          publicationId: row.publicationId,
          revisionId: row.revisionId,
          type: row.type,
          audience: row.audience,
          title: row.title,
          description: row.description,
          publishedAt: row.publishedAt,
          visibleFrom: row.visibleFrom,
          visibleUntil: row.visibleUntil,
          summary: row.summary,
        })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: rows[0].total,
      },
    };
  }

  async findCurrentStudentPublication(
    context: StudentRecipientContext,
    contentId: string,
    now: Date,
  ) {
    const rows = await this.prisma.$queryRaw<
      { publicationId: string; revisionId: string }[]
    >(Prisma.sql`
      SELECT p.id AS "publicationId", p.revision_id AS "revisionId"
      ${currentStudentPublicationQuery(context, now)}
        AND p.academic_content_id = ${contentId}::uuid AND ${matchingRevisionTarget()}
      ORDER BY p.visible_from DESC, p.id DESC LIMIT 1`);
    return rows[0] ?? null;
  }

  async findCurrentStudentDetail(
    context: StudentRecipientContext,
    identity: { publicationId: string; revisionId: string },
    now: Date,
  ) {
    // Called only after authorization; the same live predicates also fence this final
    // sensitive read against cancellation, relationship changes and successor races.
    const rows = await this.prisma.$queryRaw<
      AcademicContentRecipientDetail[]
    >(Prisma.sql`
      SELECT ${CARD_COLUMNS}, r.type_specific_snapshot AS "typeSpecificSnapshot",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('fileId', asset.file_id, 'originalName', file.original_name, 'mimeType', file.mime_type, 'sizeBytes', file.size_bytes::text, 'sortOrder', asset.sort_order) ORDER BY asset.sort_order)
          FROM academic_content_revision_assets asset JOIN files file ON file.id = asset.file_id AND file.school_id = asset.school_id
          WHERE asset.revision_id = r.id AND asset.school_id = p.school_id), '[]'::jsonb) AS assets,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('label', link.label, 'url', link.url, 'sortOrder', link.sort_order) ORDER BY link.sort_order)
          FROM academic_content_revision_links link WHERE link.revision_id = r.id AND link.school_id = p.school_id), '[]'::jsonb) AS links,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('displayValue', tag.display_value, 'sortOrder', tag.sort_order) ORDER BY tag.sort_order)
          FROM academic_content_revision_tags tag WHERE tag.revision_id = r.id AND tag.school_id = p.school_id), '[]'::jsonb) AS tags
      ${currentStudentPublicationQuery(context, now)}
        AND p.id = ${identity.publicationId}::uuid AND r.id = ${identity.revisionId}::uuid
        AND ${matchingRevisionTarget()}
      LIMIT 1`);
    return rows[0] ?? null;
  }

  findPublication(schoolId: string, publicationId: string) {
    return this.prisma.academicContentPublication.findFirst({
      where: {
        id: publicationId,
        schoolId,
        academicContent: { schoolId, deletedAt: null },
        school: {
          status: SchoolStatus.ACTIVE,
          deletedAt: null,
          organization: { status: OrganizationStatus.ACTIVE, deletedAt: null },
        },
      },
      select: PUBLICATION_SELECT,
    });
  }

  findCurrentEnrollment(context: AcademicContentCurrentRecipientContext) {
    const activeUser = {
      id: context.userId,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    };
    return this.prisma.enrollment.findFirst({
      where: {
        id: context.enrollmentId,
        schoolId: context.schoolId,
        studentId: context.studentId,
        classroomId: context.classroomId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: {
          schoolId: context.schoolId,
          status: StudentStatus.ACTIVE,
          deletedAt: null,
          ...(context.actorKind === 'STUDENT'
            ? {
                userId: context.userId,
                user: { ...activeUser, userType: UserType.STUDENT },
              }
            : {
                guardians: {
                  some: {
                    schoolId: context.schoolId,
                    guardianId: { in: [...context.guardianIds] },
                    guardian: {
                      schoolId: context.schoolId,
                      deletedAt: null,
                      userId: context.userId,
                      user: { ...activeUser, userType: UserType.PARENT },
                    },
                  },
                },
              }),
        },
        classroom: {
          schoolId: context.schoolId,
          deletedAt: null,
          section: {
            schoolId: context.schoolId,
            deletedAt: null,
            grade: {
              schoolId: context.schoolId,
              deletedAt: null,
              stage: { schoolId: context.schoolId, deletedAt: null },
            },
          },
        },
      },
      select: {
        id: true,
        studentId: true,
        classroomId: true,
        student: { select: { userId: true } },
        classroom: {
          select: {
            sectionId: true,
            section: {
              select: { gradeId: true, grade: { select: { stageId: true } } },
            },
          },
        },
      },
    });
  }
}
