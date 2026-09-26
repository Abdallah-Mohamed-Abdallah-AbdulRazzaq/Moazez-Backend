import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  assertAcademicContentMutable,
  assertAcademicContentTermWritable,
} from '../domain/academic-content-lifecycle.policy';
import {
  NormalizedAcademicContentLink,
  NormalizedAcademicContentTag,
} from '../domain/academic-content-links-tags.policy';

type MutationScope = {
  contentId: string;
  schoolId: string;
  organizationId: string;
  actorId: string;
  now: Date;
};

@Injectable()
export class AcademicContentLinksTagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async lockMutableContent(
    tx: Prisma.TransactionClient,
    input: MutationScope,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM academic_contents
      WHERE id = ${input.contentId}::uuid AND school_id = ${input.schoolId}::uuid
        AND deleted_at IS NULL FOR UPDATE`;
    if (!rows.length)
      throw new NotFoundDomainException('Academic content not found');
    const content = await tx.academicContent.findFirst({
      where: { id: input.contentId, schoolId: input.schoolId, deletedAt: null },
      select: { status: true, termId: true },
    });
    if (!content)
      throw new NotFoundDomainException('Academic content not found');
    assertAcademicContentMutable(content.status);
    const term = await tx.term.findFirst({
      where: { id: content.termId, schoolId: input.schoolId, deletedAt: null },
      select: { startDate: true, endDate: true, isActive: true },
    });
    if (!term) throw new NotFoundDomainException('Term not found');
    assertAcademicContentTermWritable(term, input.now);
  }

  replaceLinks(
    input: MutationScope & { links: readonly NormalizedAcademicContentLink[] },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockMutableContent(tx, input);
        const where = {
          schoolId: input.schoolId,
          academicContentId: input.contentId,
        };
        const current = await tx.academicContentLink.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
        if (
          current.length === input.links.length &&
          current.every(
            (link, index) =>
              link.label === input.links[index].label &&
              link.url === input.links[index].url &&
              link.sortOrder === input.links[index].sortOrder,
          )
        )
          return current;
        const before = current.map(({ label, url, sortOrder }) => ({
          label,
          url,
          sortOrder,
        }));
        await tx.academicContentLink.deleteMany({ where });
        if (input.links.length)
          await tx.academicContentLink.createMany({
            data: input.links.map((link) => ({
              ...link,
              ...where,
              createdByUserId: input.actorId,
            })),
          });
        const after = await tx.academicContentLink.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            organizationId: input.organizationId,
            schoolId: input.schoolId,
            module: 'academic-content',
            action: 'academics.academic_content.links.replace',
            resourceType: 'academic_content',
            resourceId: input.contentId,
            outcome: AuditOutcome.SUCCESS,
            before,
            after: after.map(({ label, url, sortOrder }) => ({
              label,
              url,
              sortOrder,
            })),
          },
        });
        return after;
      },
      { maxWait: 20_000, timeout: 20_000 },
    );
  }

  replaceTags(
    input: MutationScope & { tags: readonly NormalizedAcademicContentTag[] },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockMutableContent(tx, input);
        const where = {
          schoolId: input.schoolId,
          academicContentId: input.contentId,
        };
        const current = await tx.academicContentTag.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
        if (
          current.length === input.tags.length &&
          current.every(
            (tag, index) =>
              tag.displayValue === input.tags[index].displayValue &&
              tag.normalizedValue === input.tags[index].normalizedValue &&
              tag.sortOrder === input.tags[index].sortOrder,
          )
        )
          return current;
        const safe = (tag: {
          displayValue: string;
          normalizedValue: string;
          sortOrder: number;
        }) => ({
          displayValue: tag.displayValue,
          normalizedValue: tag.normalizedValue,
          sortOrder: tag.sortOrder,
        });
        const before = current.map(safe);
        await tx.academicContentTag.deleteMany({ where });
        if (input.tags.length)
          await tx.academicContentTag.createMany({
            data: input.tags.map((tag) => ({
              ...tag,
              ...where,
              createdByUserId: input.actorId,
            })),
          });
        const after = await tx.academicContentTag.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            organizationId: input.organizationId,
            schoolId: input.schoolId,
            module: 'academic-content',
            action: 'academics.academic_content.tags.replace',
            resourceType: 'academic_content',
            resourceId: input.contentId,
            outcome: AuditOutcome.SUCCESS,
            before,
            after: after.map(safe),
          },
        });
        return after;
      },
      { maxWait: 20_000, timeout: 20_000 },
    );
  }
}
