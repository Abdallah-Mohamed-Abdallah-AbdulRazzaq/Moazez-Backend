import { Injectable } from '@nestjs/common';
import {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentType,
  AuditOutcome,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  assertAcademicContentArchived,
  assertAcademicContentMutable,
  assertAcademicContentTermWritable,
} from '../domain/academic-content-lifecycle.policy';
import { assertAcademicContentAudience } from '../domain/academic-content-audience.policy';
import type {
  AcademicContentLibraryQuery,
  AcademicContentLibraryResolvedScope,
} from '../domain/academic-content-library.query';
import { normalizeAcademicContentTagValue } from '../domain/academic-content-links-tags.policy';

const ACADEMIC_CONTENT_ARGS =
  Prisma.validator<Prisma.AcademicContentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      type: true,
      audience: true,
      title: true,
      description: true,
      status: true,
      archivedAt: true,
      createdByUserId: true,
      updatedByUserId: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const ACADEMIC_CONTENT_DETAIL_ARGS =
  Prisma.validator<Prisma.AcademicContentDefaultArgs>()({
    select: {
      ...ACADEMIC_CONTENT_ARGS.select,
      targets: {
        select: {
          id: true,
          scopeType: true,
          stageId: true,
          gradeId: true,
          sectionId: true,
          classroomId: true,
          subjectId: true,
          teacherSubjectAllocationId: true,
        },
        orderBy: [{ identityFingerprint: 'asc' }, { id: 'asc' }],
      },
      assets: {
        where: { deletedAt: null, file: { is: { deletedAt: null } } },
        select: {
          id: true,
          fileId: true,
          sortOrder: true,
          createdAt: true,
          file: {
            select: { originalName: true, mimeType: true, sizeBytes: true },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      },
      links: {
        select: { id: true, label: true, url: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      },
      tags: {
        select: { id: true, displayValue: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      },
      preparationDetail: {
        select: {
          topic: true,
          objectives: true,
          learningOutcomes: true,
          teachingStrategies: true,
          activities: true,
          resourceNotes: true,
          assessmentNotes: true,
          teacherNotes: true,
          curriculumId: true,
          curriculumUnitId: true,
          curriculumLessonId: true,
          lessonPlanId: true,
          lessonPlanItemId: true,
          timetableEntryId: true,
        },
      },
      weeklyPlanDetail: {
        select: {
          weekStartDate: true,
          weekEndDate: true,
          objectives: true,
          topics: true,
          expectedHomework: true,
          upcomingAssessments: true,
          notes: true,
          homeworkReferences: {
            select: { homeworkAssignmentId: true },
            orderBy: { homeworkAssignmentId: 'asc' },
          },
          assessmentReferences: {
            select: { gradeAssessmentId: true },
            orderBy: { gradeAssessmentId: 'asc' },
          },
        },
      },
      guardianNoteDetail: {
        select: { body: true, priority: true, requiresAcknowledgement: true },
      },
      subjectResourceDetail: {
        select: {
          resourceCategory: true,
          curriculumId: true,
          curriculumUnitId: true,
          curriculumLessonId: true,
        },
      },
      onlineSessionDetail: {
        select: {
          platform: true,
          providerName: true,
          joinUrl: true,
          accessCode: true,
          instructions: true,
          startAt: true,
          endAt: true,
          timezone: true,
          timetableEntryId: true,
        },
      },
    },
  });

export type AcademicContentRecord = Prisma.AcademicContentGetPayload<
  typeof ACADEMIC_CONTENT_ARGS
>;
export type AcademicContentManagementDetail = Prisma.AcademicContentGetPayload<
  typeof ACADEMIC_CONTENT_DETAIL_ARGS
>;

export type CreateAcademicContentInput = {
  schoolId: string;
  academicYearId: string;
  termId: string;
  type: AcademicContentType;
  audience: AcademicContentAudienceType;
  title: string;
  description: string | null;
  status: typeof AcademicContentStatus.DRAFT;
  organizationId: string;
  createdByUserId: string;
  updatedByUserId?: string | null;
};

@Injectable()
export class AcademicContentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findById(id: string): Promise<AcademicContentRecord | null> {
    return this.scopedPrisma.academicContent.findFirst({
      where: { id },
      ...ACADEMIC_CONTENT_ARGS,
    });
  }

  findByIdInSchool(
    id: string,
    schoolId: string,
  ): Promise<AcademicContentRecord | null> {
    return this.prisma.academicContent.findFirst({
      where: { id, schoolId, deletedAt: null },
      ...ACADEMIC_CONTENT_ARGS,
    });
  }

  async listForManagement(
    schoolId: string,
    page: number,
    limit: number,
    query: AcademicContentLibraryQuery = {},
  ) {
    const scope = await this.resolveLibraryScope(schoolId, query);
    if (scope === null) return { items: [], page, limit, total: 0 };
    const predicate = this.libraryPredicate(schoolId, query, scope);
    const offset = (page - 1) * limit;
    const [ids, totals] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT c.id FROM academic_contents c
        WHERE ${predicate}
        ORDER BY c.updated_at DESC, c.id DESC
        LIMIT ${limit} OFFSET ${offset}`),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS total FROM academic_contents c WHERE ${predicate}`),
    ]);
    if (ids.length === 0)
      return { items: [], page, limit, total: Number(totals[0]?.total ?? 0) };
    const rows = await this.prisma.academicContent.findMany({
      where: {
        schoolId,
        deletedAt: null,
        id: { in: ids.map((row) => row.id) },
      },
      ...ACADEMIC_CONTENT_ARGS,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = ids.flatMap(({ id }) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    return { items, page, limit, total: Number(totals[0]?.total ?? 0) };
  }

  private async resolveLibraryScope(
    schoolId: string,
    query: AcademicContentLibraryQuery,
  ): Promise<AcademicContentLibraryResolvedScope | null | undefined> {
    if (query.classroomId) {
      const row = await this.prisma.classroom.findFirst({
        where: { id: query.classroomId, schoolId, deletedAt: null },
        select: {
          section: {
            select: {
              id: true,
              deletedAt: true,
              grade: {
                select: {
                  id: true,
                  deletedAt: true,
                  stage: { select: { id: true, deletedAt: true } },
                },
              },
            },
          },
        },
      });
      const section = row?.section;
      const grade = section?.grade;
      const stage = grade?.stage;
      if (
        !section ||
        section.deletedAt ||
        !grade ||
        grade.deletedAt ||
        !stage ||
        stage.deletedAt ||
        (query.sectionId && query.sectionId !== section.id) ||
        (query.gradeId && query.gradeId !== grade.id) ||
        (query.stageId && query.stageId !== stage.id)
      )
        return null;
      return {
        kind: 'CLASSROOM',
        stageId: stage.id,
        gradeId: grade.id,
        sectionId: section.id,
        classroomId: query.classroomId,
      };
    }
    if (query.sectionId) {
      const row = await this.prisma.section.findFirst({
        where: { id: query.sectionId, schoolId, deletedAt: null },
        select: {
          grade: {
            select: {
              id: true,
              deletedAt: true,
              stage: { select: { id: true, deletedAt: true } },
            },
          },
        },
      });
      const grade = row?.grade;
      const stage = grade?.stage;
      if (
        !grade ||
        grade.deletedAt ||
        !stage ||
        stage.deletedAt ||
        (query.gradeId && query.gradeId !== grade.id) ||
        (query.stageId && query.stageId !== stage.id)
      )
        return null;
      return {
        kind: 'SECTION',
        stageId: stage.id,
        gradeId: grade.id,
        sectionId: query.sectionId,
      };
    }
    if (query.gradeId) {
      const row = await this.prisma.grade.findFirst({
        where: { id: query.gradeId, schoolId, deletedAt: null },
        select: { stage: { select: { id: true, deletedAt: true } } },
      });
      if (
        !row ||
        row.stage.deletedAt ||
        (query.stageId && query.stageId !== row.stage.id)
      )
        return null;
      return { kind: 'GRADE', stageId: row.stage.id, gradeId: query.gradeId };
    }
    if (query.stageId) {
      const row = await this.prisma.stage.findFirst({
        where: { id: query.stageId, schoolId, deletedAt: null },
        select: { id: true },
      });
      return row ? { kind: 'STAGE', stageId: row.id } : null;
    }
    return undefined;
  }

  private libraryPredicate(
    schoolId: string,
    query: AcademicContentLibraryQuery,
    scope: AcademicContentLibraryResolvedScope | undefined,
  ): Prisma.Sql {
    const clauses: Prisma.Sql[] = [
      Prisma.sql`c.school_id = ${schoolId}::uuid`,
      Prisma.sql`c.deleted_at IS NULL`,
    ];
    if (query.academicYearId)
      clauses.push(
        Prisma.sql`c.academic_year_id = ${query.academicYearId}::uuid`,
      );
    if (query.termId)
      clauses.push(Prisma.sql`c.term_id = ${query.termId}::uuid`);
    if (query.type)
      clauses.push(Prisma.sql`c.type = ${query.type}::academic_content_type`);
    if (query.status)
      clauses.push(
        Prisma.sql`c.status = ${query.status}::academic_content_status`,
      );
    if (query.audience)
      clauses.push(
        Prisma.sql`c.audience = ${query.audience}::academic_content_audience_type`,
      );

    const search = query.search?.normalize('NFKC').trim();
    if (search)
      clauses.push(Prisma.sql`(
      POSITION(LOWER(${search}) IN LOWER(c.title)) > 0 OR
      POSITION(LOWER(${search}) IN LOWER(COALESCE(c.description, ''))) > 0 OR
      EXISTS (SELECT 1 FROM academic_content_tags search_tag
        WHERE search_tag.academic_content_id = c.id
          AND search_tag.school_id = c.school_id
          AND POSITION(LOWER(${search}) IN LOWER(search_tag.normalized_value)) > 0)
    )`);
    if (query.tag) {
      const tag = normalizeAcademicContentTagValue(query.tag).normalizedValue;
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM academic_content_tags exact_tag
        WHERE exact_tag.academic_content_id = c.id
          AND exact_tag.school_id = c.school_id
          AND exact_tag.normalized_value = ${tag})`);
    }

    if (scope || query.subjectId || query.teacherUserId) {
      const target: Prisma.Sql[] = [
        Prisma.sql`t.academic_content_id = c.id`,
        Prisma.sql`t.school_id = c.school_id`,
      ];
      if (scope) {
        const anchors: Prisma.Sql[] = [Prisma.sql`t.scope_type = 'SCHOOL'`];
        anchors.push(
          Prisma.sql`(t.scope_type = 'STAGE' AND t.stage_id = ${scope.stageId}::uuid)`,
        );
        if (scope.gradeId)
          anchors.push(
            Prisma.sql`(t.scope_type = 'GRADE' AND t.grade_id = ${scope.gradeId}::uuid)`,
          );
        if (scope.sectionId)
          anchors.push(
            Prisma.sql`(t.scope_type = 'SECTION' AND t.section_id = ${scope.sectionId}::uuid)`,
          );
        if (scope.classroomId)
          anchors.push(
            Prisma.sql`(t.scope_type = 'CLASSROOM' AND t.classroom_id = ${scope.classroomId}::uuid)`,
          );
        target.push(Prisma.sql`(${Prisma.join(anchors, ' OR ')})`);
      }
      if (query.subjectId)
        target.push(Prisma.sql`t.subject_id = ${query.subjectId}::uuid`);
      if (query.teacherUserId)
        target.push(Prisma.sql`EXISTS (
          SELECT 1 FROM teacher_subject_allocations teacher_allocation
          WHERE teacher_allocation.id = t.teacher_subject_allocation_id
            AND teacher_allocation.school_id = c.school_id
            AND teacher_allocation.teacher_user_id = ${query.teacherUserId}::uuid)`);
      if (scope || query.subjectId)
        target.push(
          Prisma.sql`(t.subject_id IS NULL OR ${this.librarySubjectApplicability(scope)})`,
        );
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM academic_content_targets t
        WHERE ${Prisma.join(target, ' AND ')})`);
    }
    return Prisma.sql`${Prisma.join(clauses, ' AND ')}`;
  }

  private librarySubjectApplicability(
    scope: AcademicContentLibraryResolvedScope | undefined,
  ): Prisma.Sql {
    let gradeScope: Prisma.Sql;
    if (scope?.gradeId)
      gradeScope = Prisma.sql`sa.grade_id = ${scope.gradeId}::uuid`;
    else if (scope)
      gradeScope = Prisma.sql`g.stage_id = ${scope.stageId}::uuid`;
    else
      gradeScope = Prisma.sql`(
      t.scope_type = 'SCHOOL' OR
      (t.scope_type = 'STAGE' AND t.stage_id = g.stage_id) OR
      (t.scope_type = 'GRADE' AND t.grade_id = g.id) OR
      (t.scope_type = 'SECTION' AND EXISTS (
        SELECT 1 FROM sections target_section
        WHERE target_section.id = t.section_id
          AND target_section.school_id = c.school_id
          AND target_section.deleted_at IS NULL
          AND target_section.grade_id = g.id)) OR
      (t.scope_type = 'CLASSROOM' AND EXISTS (
        SELECT 1 FROM classrooms target_classroom
        JOIN sections target_section
          ON target_section.id = target_classroom.section_id
          AND target_section.school_id = c.school_id
          AND target_section.deleted_at IS NULL
        WHERE target_classroom.id = t.classroom_id
          AND target_classroom.school_id = c.school_id
          AND target_classroom.deleted_at IS NULL
          AND target_section.grade_id = g.id))
    )`;
    return Prisma.sql`EXISTS (
      SELECT 1 FROM subject_allocations sa
      JOIN grades g ON g.id = sa.grade_id
        AND g.school_id = c.school_id AND g.deleted_at IS NULL
      JOIN stages stage ON stage.id = g.stage_id
        AND stage.school_id = c.school_id AND stage.deleted_at IS NULL
      WHERE sa.school_id = c.school_id
        AND sa.academic_year_id = c.academic_year_id
        AND sa.term_id = c.term_id
        AND sa.subject_id = t.subject_id
        AND sa.weekly_hours > 0
        AND sa.deleted_at IS NULL
        AND ${gradeScope})`;
  }

  findManagementDetail(id: string, schoolId: string) {
    return this.prisma.academicContent.findFirst({
      where: { id, schoolId, deletedAt: null },
      ...ACADEMIC_CONTENT_DETAIL_ARGS,
    });
  }

  async create(
    data: CreateAcademicContentInput,
  ): Promise<AcademicContentRecord> {
    return this.prisma.$transaction(async (tx) => {
      const content = await tx.academicContent.create({
        data: {
          schoolId: data.schoolId,
          academicYearId: data.academicYearId,
          termId: data.termId,
          type: data.type,
          audience: data.audience,
          title: data.title,
          description: data.description,
          status: data.status,
          createdByUserId: data.createdByUserId,
          updatedByUserId: data.updatedByUserId,
        },
        ...ACADEMIC_CONTENT_ARGS,
      });
      await this.recordAudit(
        tx,
        data.organizationId,
        data.schoolId,
        data.createdByUserId,
        'create',
        content.id,
        null,
        content,
      );
      return content;
    });
  }

  // Lock order for ACC mutations: AcademicContent, then upload session (when
  // needed), File, Asset. File finalization claims its upload before external
  // verification; the final database transaction takes the aggregate first.
  async mutate(input: {
    id: string;
    schoolId: string;
    organizationId: string;
    actorId: string;
    action: 'update' | 'archive' | 'restore' | 'delete';
    now: Date;
    changes?: {
      title?: string;
      description?: string | null;
      audience?: AcademicContentAudienceType;
    };
  }): Promise<AcademicContentRecord> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM academic_contents
        WHERE id = ${input.id}::uuid AND school_id = ${input.schoolId}::uuid
          AND deleted_at IS NULL FOR UPDATE`;
      if (!rows.length)
        throw new NotFoundDomainException('Academic content not found');
      const current = await tx.academicContent.findFirst({
        where: { id: input.id, schoolId: input.schoolId, deletedAt: null },
        ...ACADEMIC_CONTENT_ARGS,
      });
      if (!current)
        throw new NotFoundDomainException('Academic content not found');
      if (input.action === 'restore')
        assertAcademicContentArchived(current.status);
      else assertAcademicContentMutable(current.status);
      if (input.action !== 'archive') {
        const term = await tx.term.findFirst({
          where: {
            id: current.termId,
            schoolId: input.schoolId,
            deletedAt: null,
          },
          select: { startDate: true, endDate: true, isActive: true },
        });
        if (!term) throw new NotFoundDomainException('Term not found');
        assertAcademicContentTermWritable(term, input.now);
      }
      if (input.action === 'delete') {
        const revisionCount = await tx.academicContentRevision.count({
          where: { schoolId: input.schoolId, academicContentId: input.id },
        });
        if (revisionCount > 0)
          throw new DomainException({
            code: 'academic_content.revision_history',
            message: 'Academic content with revision history cannot be deleted',
            httpStatus: 409,
          });
      }
      const changes = input.changes ?? {};
      if (
        input.action === 'update' &&
        Object.keys(changes).some(
          (key) => !['title', 'description', 'audience'].includes(key),
        )
      )
        throw new ValidationDomainException(
          'Only draft metadata may be updated',
        );
      if (input.action === 'update' && changes.audience !== undefined)
        assertAcademicContentAudience(current.type, changes.audience);
      const data: Prisma.AcademicContentUpdateInput = {
        updatedBy: { connect: { id: input.actorId } },
        ...(input.action === 'update' ? changes : {}),
        ...(input.action === 'archive'
          ? { status: AcademicContentStatus.ARCHIVED, archivedAt: input.now }
          : {}),
        ...(input.action === 'restore'
          ? { status: AcademicContentStatus.DRAFT, archivedAt: null }
          : {}),
        ...(input.action === 'delete' ? { deletedAt: input.now } : {}),
      };
      const updated = await tx.academicContent.update({
        where: { id: input.id },
        data,
        ...ACADEMIC_CONTENT_ARGS,
      });
      await this.recordAudit(
        tx,
        input.organizationId,
        input.schoolId,
        input.actorId,
        input.action,
        input.id,
        current,
        updated,
      );
      return updated;
    });
  }

  private async recordAudit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    schoolId: string,
    actorId: string,
    action: 'create' | 'update' | 'archive' | 'restore' | 'delete',
    resourceId: string,
    before: AcademicContentRecord | null,
    after: AcademicContentRecord,
  ): Promise<void> {
    const summary = (record: AcademicContentRecord) => ({
      id: record.id,
      academicYearId: record.academicYearId,
      termId: record.termId,
      type: record.type,
      audience: record.audience,
      title: record.title,
      status: record.status,
      archivedAt: record.archivedAt?.toISOString() ?? null,
    });
    await tx.auditLog.create({
      data: {
        actorId,
        organizationId,
        schoolId,
        module: 'academic-content',
        action: `academics.academic_content.${action}`,
        resourceType: 'academic_content',
        resourceId,
        outcome: AuditOutcome.SUCCESS,
        before: before ? summary(before) : undefined,
        after: summary(after),
      },
    });
  }
}
