import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';

export const SNAPSHOT_CONTRACT_VERSION = 1;

const REVISION_DETAIL_ARGS =
  Prisma.validator<Prisma.AcademicContentRevisionDefaultArgs>()({
    include: {
      targets: { orderBy: [{ identityFingerprint: 'asc' }, { id: 'asc' }] },
      assets: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: {
          file: {
            select: { originalName: true, mimeType: true, sizeBytes: true },
          },
        },
      },
      links: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      tags: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
    },
  });

export type AcademicContentRevisionDetail =
  Prisma.AcademicContentRevisionGetPayload<typeof REVISION_DETAIL_ARGS>;

@Injectable()
export class AcademicContentRevisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  capture(input: {
    schoolId: string;
    organizationId: string;
    actorId: string;
    contentId: string;
    now?: Date;
  }): Promise<AcademicContentRevisionDetail> {
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM academic_contents
        WHERE id = ${input.contentId}::uuid AND school_id = ${input.schoolId}::uuid
          AND deleted_at IS NULL FOR UPDATE`;
        if (!locked.length)
          throw new NotFoundDomainException('Academic content not found');
        const content = await tx.academicContent.findFirst({
          where: {
            id: input.contentId,
            schoolId: input.schoolId,
            deletedAt: null,
          },
          select: {
            academicYearId: true,
            termId: true,
            type: true,
            audience: true,
            title: true,
            description: true,
            status: true,
          },
        });
        if (!content)
          throw new NotFoundDomainException('Academic content not found');
        const where = {
          schoolId: input.schoolId,
          academicContentId: input.contentId,
        };
        const targets = await tx.academicContentTarget.findMany({
          where,
          orderBy: [{ identityFingerprint: 'asc' }, { id: 'asc' }],
        });
        const assets = await tx.academicContentAsset.findMany({
          where: {
            ...where,
            deletedAt: null,
            file: { is: { deletedAt: null } },
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
        const links = await tx.academicContentLink.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
        const tags = await tx.academicContentTag.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
        const latest = await tx.academicContentRevision.findFirst({
          where,
          select: { revisionNumber: true },
          orderBy: { revisionNumber: 'desc' },
        });
        const { status, ...envelope } = content;
        const revision = await tx.academicContentRevision.create({
          data: {
            ...where,
            revisionNumber: (latest?.revisionNumber ?? 0) + 1,
            snapshotContractVersion: SNAPSHOT_CONTRACT_VERSION,
            ...envelope,
            sourceStatus: status,
            capturedByUserId: input.actorId,
            capturedAt: input.now ?? new Date(),
          },
        });
        if (targets.length)
          await tx.academicContentRevisionTarget.createMany({
            data: targets.map((target) => ({
              schoolId: input.schoolId,
              revisionId: revision.id,
              scopeType: target.scopeType,
              stageId: target.stageId,
              gradeId: target.gradeId,
              sectionId: target.sectionId,
              classroomId: target.classroomId,
              subjectId: target.subjectId,
              teacherSubjectAllocationId: target.teacherSubjectAllocationId,
              identityFingerprint: target.identityFingerprint,
            })),
          });
        if (assets.length)
          await tx.academicContentRevisionAsset.createMany({
            data: assets.map((asset) => ({
              schoolId: input.schoolId,
              revisionId: revision.id,
              fileId: asset.fileId,
              sortOrder: asset.sortOrder,
            })),
          });
        if (links.length)
          await tx.academicContentRevisionLink.createMany({
            data: links.map((link) => ({
              schoolId: input.schoolId,
              revisionId: revision.id,
              label: link.label,
              url: link.url,
              sortOrder: link.sortOrder,
            })),
          });
        if (tags.length)
          await tx.academicContentRevisionTag.createMany({
            data: tags.map((tag) => ({
              schoolId: input.schoolId,
              revisionId: revision.id,
              displayValue: tag.displayValue,
              normalizedValue: tag.normalizedValue,
              sortOrder: tag.sortOrder,
            })),
          });
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            organizationId: input.organizationId,
            schoolId: input.schoolId,
            module: 'academic-content',
            action: 'academics.academic_content.revision.capture',
            resourceType: 'academic_content_revision',
            resourceId: revision.id,
            outcome: AuditOutcome.SUCCESS,
            after: {
              academicContentId: input.contentId,
              revisionId: revision.id,
              revisionNumber: revision.revisionNumber,
              sourceStatus: revision.sourceStatus,
              snapshotContractVersion: SNAPSHOT_CONTRACT_VERSION,
              targets: targets.length,
              assets: assets.length,
              links: links.length,
              tags: tags.length,
            },
          },
        });
        return tx.academicContentRevision.findUniqueOrThrow({
          where: { id: revision.id },
          ...REVISION_DETAIL_ARGS,
        });
      },
      { maxWait: 20_000, timeout: 20_000 },
    );
  }

  async list(input: {
    schoolId: string;
    contentId: string;
    page: number;
    limit: number;
  }) {
    const parent = await this.prisma.academicContent.findFirst({
      where: { id: input.contentId, schoolId: input.schoolId, deletedAt: null },
      select: { id: true },
    });
    if (!parent)
      throw new NotFoundDomainException('Academic content not found');
    const where = {
      schoolId: input.schoolId,
      academicContentId: input.contentId,
    };
    const [items, total] = await Promise.all([
      this.prisma.academicContentRevision.findMany({
        where,
        select: {
          id: true,
          revisionNumber: true,
          snapshotContractVersion: true,
          sourceStatus: true,
          title: true,
          capturedAt: true,
        },
        orderBy: { revisionNumber: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.academicContentRevision.count({ where }),
    ]);
    return { items, total, page: input.page, limit: input.limit };
  }

  async detail(input: {
    schoolId: string;
    contentId: string;
    revisionId: string;
  }) {
    const revision = await this.prisma.academicContentRevision.findFirst({
      where: {
        id: input.revisionId,
        schoolId: input.schoolId,
        academicContentId: input.contentId,
        academicContent: { is: { deletedAt: null } },
      },
      ...REVISION_DETAIL_ARGS,
    });
    if (!revision)
      throw new NotFoundDomainException('Academic content revision not found');
    return revision;
  }
}
