import { Injectable, Optional } from '@nestjs/common';
import {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentType,
  AuditOutcome,
  Prisma,
  UserType,
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
import { TeacherAllocationOperationalWriteGate } from '../../teacher-allocation/application/teacher-allocation-operational-write-gate';
import { AcademicContentTargetValidator } from '../application/academic-content-target-validator';
import { AcademicContentValidationRepository } from './academic-content-validation.repository';
import type { NormalizedAcademicContentTarget } from '../domain/academic-content-target.policy';
import {
  AcademicContentTeacherWriteScope,
  assertTeacherAcademicContentClassIds,
  authorizeTeacherAcademicContentMutation,
  lockTeacherAcademicContentAllocations,
  teacherAcademicContentTargets,
} from './academic-content-teacher-write.authorization';
import type {
  AcademicContentLibraryQuery,
  AcademicContentLibraryResolvedScope,
} from '../domain/academic-content-library.query';
import { normalizeAcademicContentTagValue } from '../domain/academic-content-links-tags.policy';
import {
  academicContentSubjectApplicability,
  academicContentTargetScopePredicate,
  resolveAcademicContentScope,
} from './academic-content-library-scope.query';

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

const ACADEMIC_CONTENT_LIBRARY_ITEM_ARGS =
  Prisma.validator<Prisma.AcademicContentDefaultArgs>()({
    select: {
      id: true,
      academicYearId: true,
      termId: true,
      type: true,
      audience: true,
      title: true,
      description: true,
      status: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      preparationDetail: { select: { topic: true } },
      weeklyPlanDetail: {
        select: { weekStartDate: true, weekEndDate: true },
      },
      guardianNoteDetail: {
        select: { priority: true, requiresAcknowledgement: true },
      },
      subjectResourceDetail: { select: { resourceCategory: true } },
      onlineSessionDetail: {
        select: { platform: true, startAt: true, endAt: true },
      },
    },
  });

const ACADEMIC_CONTENT_DETAIL_ARGS =
  Prisma.validator<Prisma.AcademicContentDefaultArgs>()({
    select: {
      ...ACADEMIC_CONTENT_ARGS.select,
      publications: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          id: true,
          status: true,
          publishAt: true,
          visibleFrom: true,
          visibleUntil: true,
        },
      },
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
export type AcademicContentLibraryItem = Prisma.AcademicContentGetPayload<
  typeof ACADEMIC_CONTENT_LIBRARY_ITEM_ARGS
>;
export type AcademicContentManagementDetail = Prisma.AcademicContentGetPayload<
  typeof ACADEMIC_CONTENT_DETAIL_ARGS
>;

/** Trusted allocation reader scope, supplied by an actor-specific application layer. */
export type AcademicContentAllocationReader = {
  teacherUserId: string;
  allocationId?: string;
};

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
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly allocationWriteGate?: TeacherAllocationOperationalWriteGate,
  ) {}

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

  listForManagement(
    schoolId: string,
    page: number,
    limit: number,
    query: AcademicContentLibraryQuery = {},
  ) {
    return this.listLibrary(schoolId, page, limit, query);
  }

  async listLibrary(
    schoolId: string,
    page: number,
    limit: number,
    query: AcademicContentLibraryQuery = {},
    reader?: AcademicContentAllocationReader,
  ) {
    // A trusted reader always overrides any caller-supplied teacher filter.
    if (reader) query = { ...query, teacherUserId: reader.teacherUserId };
    const scope = await resolveAcademicContentScope(
      this.prisma,
      schoolId,
      query,
    );
    if (scope === null) return { items: [], page, limit, total: 0 };
    const predicate = this.libraryPredicate(schoolId, query, scope, reader);
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
        ...(reader ? this.allocationReaderWhere(schoolId, reader) : {}),
      },
      ...ACADEMIC_CONTENT_LIBRARY_ITEM_ARGS,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = ids.flatMap(({ id }) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    return { items, page, limit, total: Number(totals[0]?.total ?? 0) };
  }

  private libraryPredicate(
    schoolId: string,
    query: AcademicContentLibraryQuery,
    scope: AcademicContentLibraryResolvedScope | undefined,
    reader?: AcademicContentAllocationReader,
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

    if (query.resourceCategory)
      clauses.push(Prisma.sql`c.type = 'SUBJECT_RESOURCE'::academic_content_type AND EXISTS (
        SELECT 1 FROM academic_content_subject_resource_details resource_detail
        WHERE resource_detail.academic_content_id = c.id
          AND resource_detail.school_id = c.school_id
          AND resource_detail.resource_category = ${query.resourceCategory}::academic_subject_resource_category)`);
    if (query.weeklyDateFrom || query.weeklyDateTo) {
      const weekly: Prisma.Sql[] = [
        Prisma.sql`weekly_detail.academic_content_id = c.id`,
        Prisma.sql`weekly_detail.school_id = c.school_id`,
      ];
      if (query.weeklyDateFrom)
        weekly.push(
          Prisma.sql`weekly_detail.week_end_date >= ${query.weeklyDateFrom}::date`,
        );
      if (query.weeklyDateTo)
        weekly.push(
          Prisma.sql`weekly_detail.week_start_date <= ${query.weeklyDateTo}::date`,
        );
      clauses.push(Prisma.sql`c.type = 'WEEKLY_PLAN'::academic_content_type AND EXISTS (
        SELECT 1 FROM academic_content_weekly_plan_details weekly_detail
        WHERE ${Prisma.join(weekly, ' AND ')})`);
    }
    if (
      query.sessionPlatform ||
      query.sessionStartAtFrom ||
      query.sessionStartAtTo
    ) {
      const session: Prisma.Sql[] = [
        Prisma.sql`session_detail.academic_content_id = c.id`,
        Prisma.sql`session_detail.school_id = c.school_id`,
      ];
      if (query.sessionPlatform)
        session.push(
          Prisma.sql`session_detail.platform = ${query.sessionPlatform}::academic_online_session_platform`,
        );
      if (query.sessionStartAtFrom)
        session.push(
          Prisma.sql`session_detail.start_at >= (${query.sessionStartAtFrom}::timestamptz AT TIME ZONE 'UTC')`,
        );
      if (query.sessionStartAtTo)
        session.push(
          Prisma.sql`session_detail.start_at <= (${query.sessionStartAtTo}::timestamptz AT TIME ZONE 'UTC')`,
        );
      clauses.push(Prisma.sql`c.type = 'ONLINE_SESSION'::academic_content_type AND EXISTS (
        SELECT 1 FROM academic_content_online_session_details session_detail
        WHERE ${Prisma.join(session, ' AND ')})`);
    }
    if (query.guardianPriority)
      clauses.push(Prisma.sql`c.type = 'GUARDIAN_WEEKLY_NOTE'::academic_content_type AND EXISTS (
        SELECT 1 FROM academic_content_guardian_note_details guardian_detail
        WHERE guardian_detail.academic_content_id = c.id
          AND guardian_detail.school_id = c.school_id
          AND guardian_detail.priority = ${query.guardianPriority}::academic_guardian_note_priority)`);

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
        target.push(academicContentTargetScopePredicate(scope));
      }
      if (query.subjectId)
        target.push(Prisma.sql`t.subject_id = ${query.subjectId}::uuid`);
      if (reader?.allocationId)
        target.push(
          Prisma.sql`t.teacher_subject_allocation_id = ${reader.allocationId}::uuid`,
        );
      if (query.teacherUserId)
        target.push(Prisma.sql`EXISTS (
          SELECT 1 FROM teacher_subject_allocations teacher_allocation
          WHERE teacher_allocation.id = t.teacher_subject_allocation_id
            AND teacher_allocation.school_id = c.school_id
            AND teacher_allocation.teacher_user_id = ${query.teacherUserId}::uuid)`);
      if (scope || query.subjectId)
        target.push(
          Prisma.sql`(t.subject_id IS NULL OR ${academicContentSubjectApplicability(scope, Prisma.sql`c.academic_year_id`, Prisma.sql`c.term_id`)})`,
        );
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM academic_content_targets t
        WHERE ${Prisma.join(target, ' AND ')})`);
    }
    return Prisma.sql`${Prisma.join(clauses, ' AND ')}`;
  }

  private allocationReaderWhere(
    schoolId: string,
    reader: AcademicContentAllocationReader,
  ): Prisma.AcademicContentWhereInput {
    return {
      targets: {
        some: {
          schoolId,
          teacherSubjectAllocationId: reader.allocationId,
          teacherSubjectAllocation: {
            is: { schoolId, teacherUserId: reader.teacherUserId },
          },
        },
      },
    };
  }

  findAllocationReaderDetail(
    id: string,
    schoolId: string,
    reader: AcademicContentAllocationReader,
  ) {
    return this.prisma.academicContent.findFirst({
      where: {
        id,
        schoolId,
        deletedAt: null,
        ...this.allocationReaderWhere(schoolId, reader),
      },
      select: {
        ...ACADEMIC_CONTENT_DETAIL_ARGS.select,
        term: {
          select: {
            schoolId: true,
            academicYearId: true,
            deletedAt: true,
            startDate: true,
            endDate: true,
            isActive: true,
          },
        },
        targets: {
          ...ACADEMIC_CONTENT_DETAIL_ARGS.select.targets,
          select: {
            ...ACADEMIC_CONTENT_DETAIL_ARGS.select.targets.select,
            teacherSubjectAllocation: {
              select: { schoolId: true, teacherUserId: true },
            },
          },
        },
      },
    });
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
    return this.prisma.$transaction((tx) => this.createInTransaction(tx, data));
  }

  createForTeacherAllocation(
    input: AcademicContentTeacherWriteScope & {
      classId: string;
      type: AcademicContentType;
      audience: AcademicContentAudienceType;
      title: string;
      description: string | null;
      now: Date;
    },
  ): Promise<AcademicContentRecord> {
    assertTeacherAcademicContentClassIds([input.classId]);
    if (input.actorId !== input.teacherUserId)
      throw new NotFoundDomainException('Academic content or class not found');
    return this.prisma.$transaction(async (tx) => {
      const [allocation] = await lockTeacherAcademicContentAllocations(
        tx,
        this.allocationWriteGate,
        { ...input, allocationIds: [input.classId] },
      );
      const term = await tx.term.findFirst({
        where: {
          id: allocation.termId,
          schoolId: input.schoolId,
          deletedAt: null,
          academicYear: { schoolId: input.schoolId, deletedAt: null },
        },
        select: {
          academicYearId: true,
          startDate: true,
          endDate: true,
          isActive: true,
        },
      });
      if (!term)
        throw new NotFoundDomainException('Academic content term not found');
      assertAcademicContentTermWritable(term, input.now);
      assertAcademicContentAudience(input.type, input.audience);
      return this.createInTransaction(
        tx,
        {
          schoolId: input.schoolId,
          organizationId: input.organizationId,
          academicYearId: term.academicYearId,
          termId: allocation.termId,
          type: input.type,
          audience: input.audience,
          title: input.title,
          description: input.description,
          status: AcademicContentStatus.DRAFT,
          createdByUserId: input.teacherUserId,
        },
        teacherAcademicContentTargets(input.type, [allocation]),
      );
    });
  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    data: CreateAcademicContentInput,
    initialTargets?: readonly NormalizedAcademicContentTarget[],
  ): Promise<AcademicContentRecord> {
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
    if (initialTargets) {
      await new AcademicContentTargetValidator(
        new AcademicContentValidationRepository(tx),
      ).validate(content, initialTargets, {
        id: data.createdByUserId,
        userType: UserType.TEACHER,
      });
      await tx.academicContentTarget.createMany({
        data: initialTargets.map((target) => ({
          ...target,
          schoolId: data.schoolId,
          academicContentId: content.id,
          createdByUserId: data.createdByUserId,
        })),
      });
    }
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
  }

  // Lock order for ACC mutations: AcademicContent, then upload session (when
  // needed), File, Asset. File finalization claims its upload before external
  // verification; the final database transaction takes the aggregate first.
  async mutate(input: {
    id: string;
    schoolId: string;
    organizationId: string;
    actorId: string;
    teacherUserId?: string;
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
      if (input.teacherUserId !== undefined)
        await authorizeTeacherAcademicContentMutation(
          tx,
          this.allocationWriteGate,
          { ...input, teacherUserId: input.teacherUserId },
          current.createdByUserId,
        );
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
        where: { id_schoolId: { id: input.id, schoolId: input.schoolId } },
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
