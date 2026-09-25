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
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  assertAcademicContentArchived,
  assertAcademicContentMutable,
  assertAcademicContentTermWritable,
} from '../domain/academic-content-lifecycle.policy';
import { assertAcademicContentAudience } from '../domain/academic-content-audience.policy';

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

export type AcademicContentRecord = Prisma.AcademicContentGetPayload<
  typeof ACADEMIC_CONTENT_ARGS
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
