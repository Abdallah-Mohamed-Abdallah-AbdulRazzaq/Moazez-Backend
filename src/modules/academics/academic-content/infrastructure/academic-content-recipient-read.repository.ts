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
  ParentAcademicContentType,
  ParentRecipientContext,
  ParentRecipientChildrenContext,
  StudentAcademicContentType,
} from '../domain/academic-content-recipient.query';

type StudentRecipientContext = Extract<
  AcademicContentCurrentRecipientContext,
  { actorKind: 'STUDENT' }
>;

type RecipientActor = { schoolId: string; userId: string } & (
  | { actorKind: 'STUDENT' }
  | { actorKind: 'PARENT'; guardianIds: readonly string[] }
);
type RecipientChildSql = Record<
  'studentId' | 'enrollmentId' | 'classroomId' | 'academicYearId' | 'termId',
  Prisma.Sql
>;
function childSql(
  context: AcademicContentCurrentRecipientContext,
): RecipientChildSql {
  return {
    studentId: Prisma.sql`${context.studentId}`,
    enrollmentId: Prisma.sql`${context.enrollmentId}`,
    classroomId: Prisma.sql`${context.classroomId}`,
    academicYearId: Prisma.sql`${context.academicYearId}`,
    termId: Prisma.sql`${context.termId}`,
  };
}

// Reuses the ACC-10A matcher semantics against live relationships and immutable targets.
// Every raw query explicitly constrains the School; no recipient snapshot is an ACL.
function currentRecipientPublicationQuery(
  context: RecipientActor,
  now: Date,
  child: RecipientChildSql,
) {
  const relationship =
    context.actorKind === 'STUDENT'
      ? Prisma.sql`actor.id = student.user_id AND actor.user_type = 'STUDENT'`
      : Prisma.sql`actor.user_type = 'PARENT' AND EXISTS (
        SELECT 1 FROM student_guardian_links link
        JOIN guardians guardian ON guardian.id = link.guardian_id AND guardian.school_id = link.school_id
        WHERE link.student_id = student.id AND link.school_id = p.school_id
          AND guardian.id = ANY(${[...context.guardianIds]}::uuid[])
          AND guardian.user_id = actor.id AND guardian.deleted_at IS NULL
      )`;
  const audience =
    context.actorKind === 'STUDENT'
      ? Prisma.sql`r.audience IN ('STUDENTS', 'STUDENTS_AND_GUARDIANS')`
      : Prisma.sql`r.audience IN ('GUARDIANS', 'STUDENTS_AND_GUARDIANS')`;
  const types =
    context.actorKind === 'STUDENT'
      ? Prisma.sql`r.type IN ('WEEKLY_PLAN', 'SUBJECT_RESOURCE', 'ONLINE_SESSION', 'GENERAL_RESOURCE')`
      : Prisma.sql`r.type IN ('WEEKLY_PLAN', 'GUARDIAN_WEEKLY_NOTE', 'SUBJECT_RESOURCE', 'ONLINE_SESSION', 'GENERAL_RESOURCE')`;
  return Prisma.sql`
    FROM academic_content_publications p
    JOIN academic_content_revisions r ON r.id = p.revision_id AND r.school_id = p.school_id AND r.academic_content_id = p.academic_content_id
    JOIN academic_contents c ON c.id = p.academic_content_id AND c.school_id = p.school_id
    JOIN schools school ON school.id = p.school_id
    JOIN organizations organization ON organization.id = school.organization_id
    JOIN student_enrollments e ON e.id = ${child.enrollmentId}::uuid AND e.school_id = p.school_id
    JOIN students student ON student.id = e.student_id AND student.school_id = e.school_id
    JOIN users actor ON actor.id = ${context.userId}::uuid
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
      AND r.academic_year_id = ${child.academicYearId}::uuid AND r.term_id = ${child.termId}::uuid
      AND ${types} AND ${audience}
      AND student.id = ${child.studentId}::uuid AND student.status = 'ACTIVE' AND student.deleted_at IS NULL
      AND actor.status = 'ACTIVE' AND actor.deleted_at IS NULL AND ${relationship}
      AND e.status = 'ACTIVE' AND e.deleted_at IS NULL
      AND e.classroom_id = ${child.classroomId}::uuid
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
    WHEN 'GUARDIAN_WEEKLY_NOTE' THEN jsonb_build_object('priority', r.type_specific_snapshot #> '{state,priority}', 'requiresAcknowledgement', r.type_specific_snapshot #> '{state,requiresAcknowledgement}')
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

  private async listCurrentRecipientPublications<
    T extends ParentAcademicContentType,
  >(
    context: AcademicContentCurrentRecipientContext,
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
      (AcademicContentRecipientCard<T> & { total: number })[]
    >(Prisma.sql`
      WITH eligible AS (
        SELECT ${CARD_COLUMNS} ${currentRecipientPublicationQuery(context, now, childSql(context))}
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

  private async findCurrentRecipientPublication(
    context: AcademicContentCurrentRecipientContext,
    contentId: string,
    now: Date,
  ) {
    const rows = await this.prisma.$queryRaw<
      { publicationId: string; revisionId: string }[]
    >(Prisma.sql`
      SELECT p.id AS "publicationId", p.revision_id AS "revisionId"
      ${currentRecipientPublicationQuery(context, now, childSql(context))}
        AND p.academic_content_id = ${contentId}::uuid AND ${matchingRevisionTarget()}
      ORDER BY p.visible_from DESC, p.id DESC LIMIT 1`);
    return rows[0] ?? null;
  }

  private async findCurrentRecipientDetail<T extends ParentAcademicContentType>(
    context: AcademicContentCurrentRecipientContext,
    identity: { publicationId: string; revisionId: string },
    now: Date,
  ) {
    // Called only after authorization; the same live predicates also fence this final
    // sensitive read against cancellation, relationship changes and successor races.
    const rows = await this.prisma.$queryRaw<
      AcademicContentRecipientDetail<T>[]
    >(Prisma.sql`
      SELECT ${CARD_COLUMNS}, r.type_specific_snapshot AS "typeSpecificSnapshot",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('fileId', asset.file_id, 'originalName', file.original_name, 'mimeType', file.mime_type, 'sizeBytes', file.size_bytes::text, 'sortOrder', asset.sort_order) ORDER BY asset.sort_order)
          FROM academic_content_revision_assets asset JOIN files file ON file.id = asset.file_id AND file.school_id = asset.school_id
          WHERE asset.revision_id = r.id AND asset.school_id = p.school_id), '[]'::jsonb) AS assets,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('label', link.label, 'url', link.url, 'sortOrder', link.sort_order) ORDER BY link.sort_order)
          FROM academic_content_revision_links link WHERE link.revision_id = r.id AND link.school_id = p.school_id), '[]'::jsonb) AS links,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('displayValue', tag.display_value, 'sortOrder', tag.sort_order) ORDER BY tag.sort_order)
          FROM academic_content_revision_tags tag WHERE tag.revision_id = r.id AND tag.school_id = p.school_id), '[]'::jsonb) AS tags
      ${currentRecipientPublicationQuery(context, now, childSql(context))}
        AND p.id = ${identity.publicationId}::uuid AND r.id = ${identity.revisionId}::uuid
        AND ${matchingRevisionTarget()}
      LIMIT 1`);
    return rows[0] ?? null;
  }

  listCurrentStudentPublications(
    context: StudentRecipientContext,
    query: AcademicContentRecipientFeedQuery,
    now: Date,
  ) {
    return this.listCurrentRecipientPublications<StudentAcademicContentType>(
      context,
      query,
      now,
    );
  }
  listCurrentParentPublications(
    context: ParentRecipientContext,
    query: AcademicContentRecipientFeedQuery,
    now: Date,
  ) {
    return this.listCurrentRecipientPublications<ParentAcademicContentType>(
      context,
      query,
      now,
    );
  }
  findCurrentStudentPublication(
    context: StudentRecipientContext,
    contentId: string,
    now: Date,
  ) {
    return this.findCurrentRecipientPublication(context, contentId, now);
  }
  findCurrentParentPublication(
    context: ParentRecipientContext,
    contentId: string,
    now: Date,
  ) {
    return this.findCurrentRecipientPublication(context, contentId, now);
  }
  findCurrentStudentDetail(
    context: StudentRecipientContext,
    identity: { publicationId: string; revisionId: string },
    now: Date,
  ) {
    return this.findCurrentRecipientDetail<StudentAcademicContentType>(
      context,
      identity,
      now,
    );
  }
  findCurrentParentDetail(
    context: ParentRecipientContext,
    identity: { publicationId: string; revisionId: string },
    now: Date,
  ) {
    return this.findCurrentRecipientDetail<ParentAcademicContentType>(
      context,
      identity,
      now,
    );
  }

  async listCurrentParentAccessibleChildren(
    context: ParentRecipientChildrenContext,
    contentId: string,
    now: Date,
  ) {
    // One parameterized statement revalidates all server-resolved child contexts.
    // Notification metadata and historical recipient rows never enter this query.
    const child: RecipientChildSql = {
      studentId: Prisma.sql`current_child."studentId"`,
      enrollmentId: Prisma.sql`current_child."enrollmentId"`,
      classroomId: Prisma.sql`current_child."classroomId"`,
      academicYearId: Prisma.sql`current_child."academicYearId"`,
      termId: Prisma.sql`current_child."termId"`,
    };
    return this.prisma.$queryRaw<
      { academicContentId: string; publicationId: string; studentId: string }[]
    >(Prisma.sql`
      WITH current_children AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(context.children)}::jsonb)
          AS child("studentId" uuid, "enrollmentId" uuid, "classroomId" uuid, "academicYearId" uuid, "termId" uuid)
      ), eligible AS (
        SELECT DISTINCT authorized.* FROM current_children current_child
        CROSS JOIN LATERAL (
          SELECT p.academic_content_id AS "academicContentId", p.id AS "publicationId", p.revision_id AS "revisionId", p.visible_from AS "visibleFrom", student.id AS "studentId"
          ${currentRecipientPublicationQuery({ ...context, actorKind: 'PARENT' }, now, child)}
            AND p.academic_content_id = ${contentId}::uuid AND ${matchingRevisionTarget()}
          ORDER BY p.visible_from DESC, p.id DESC LIMIT 1
        ) authorized
      ), canonical AS (
        SELECT "publicationId", "revisionId" FROM eligible ORDER BY "visibleFrom" DESC, "publicationId" DESC LIMIT 1
      )
      SELECT eligible."academicContentId", eligible."publicationId", eligible."studentId" FROM eligible
      JOIN canonical USING ("publicationId", "revisionId") ORDER BY eligible."studentId" ASC`);
  }

  async findCurrentRecipientAsset(
    context: AcademicContentCurrentRecipientContext,
    contentId: string,
    fileId: string,
    now: Date,
  ) {
    const rows = await this.prisma.$queryRaw<
      {
        publicationId: string;
        revisionId: string;
        visibleUntil: Date | null;
        bucket: string;
        objectKey: string;
        originalName: string;
        mimeType: string;
      }[]
    >(Prisma.sql`
      WITH canonical_publication AS MATERIALIZED (
        SELECT p.id, p.school_id, p.revision_id, p.visible_until
        ${currentRecipientPublicationQuery(context, now, childSql(context))}
          AND p.academic_content_id = ${contentId}::uuid AND ${matchingRevisionTarget()}
        ORDER BY p.visible_from DESC, p.id DESC LIMIT 1
      )
      SELECT canonical.id AS "publicationId", canonical.revision_id AS "revisionId",
        canonical.visible_until AS "visibleUntil", file.bucket, file.object_key AS "objectKey",
        file.original_name AS "originalName", file.mime_type AS "mimeType"
      FROM canonical_publication canonical
      JOIN academic_content_revision_assets asset
        ON asset.revision_id = canonical.revision_id AND asset.school_id = canonical.school_id
        AND asset.file_id = ${fileId}::uuid
      JOIN files file ON file.id = asset.file_id AND file.school_id = canonical.school_id
      WHERE file.deleted_at IS NULL AND file.size_bytes > 0 AND file.visibility = 'PRIVATE'
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
