import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AcademicContentPublicationStatus as Status,
  AcademicContentStatus as ContentStatus,
  AuditOutcome,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentPublicationExecutionInput } from './academic-content-publication-snapshot.repository';
import { assertAcademicContentPublicationUuid } from '../domain/academic-content-publication.policy';

const SELECT = {
  id: true,
  revisionId: true,
  status: true,
  publishedAt: true,
  expiredAt: true,
  cancelledAt: true,
  cancelledByUserId: true,
  publishAt: true,
  visibleFrom: true,
  visibleUntil: true,
  studentRecipientCount: true,
  guardianRecipientContextCount: true,
} satisfies Prisma.AcademicContentPublicationSelect;
type Publication = Prisma.AcademicContentPublicationGetPayload<{
  select: typeof SELECT;
}>;
type CancellationInput = AcademicContentPublicationExecutionInput & {
  actorId: string;
  organizationId: string;
};
function safe(row: Publication) {
  const { id, ...fields } = row;
  return { publicationId: id, ...fields };
}
function conflict(): never {
  throw new DomainException({
    code: 'academic_content.publication.lifecycle_conflict',
    message: 'Publication cannot transition from its current state',
    httpStatus: HttpStatus.CONFLICT,
  });
}
function validate(input: AcademicContentPublicationExecutionInput) {
  for (const id of [input.schoolId, input.contentId, input.publicationId])
    assertAcademicContentPublicationUuid(id);
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime()))
    throw new ValidationDomainException(
      'Publication execution requires a valid instant',
    );
}

@Injectable()
export class AcademicContentPublicationLifecycleRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async lock(
    tx: Prisma.TransactionClient,
    input: AcademicContentPublicationExecutionInput,
  ) {
    // All publication writers share this parent-first lock order.
    const parents = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM academic_contents WHERE id = ${input.contentId}::uuid
        AND school_id = ${input.schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    if (!parents.length)
      throw new NotFoundDomainException('Academic content not found');
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM academic_content_publications WHERE id = ${input.publicationId}::uuid
        AND school_id = ${input.schoolId}::uuid AND academic_content_id = ${input.contentId}::uuid FOR UPDATE`;
    if (!rows.length)
      throw new NotFoundDomainException('Publication not found');
    const content = await tx.academicContent.findFirstOrThrow({
      where: { id: input.contentId, schoolId: input.schoolId, deletedAt: null },
      select: { status: true, school: { select: { organizationId: true } } },
    });
    const publication = await tx.academicContentPublication.findFirstOrThrow({
      where: {
        id: input.publicationId,
        schoolId: input.schoolId,
        academicContentId: input.contentId,
      },
      select: SELECT,
    });
    return { content, publication };
  }

  async expire(input: AcademicContentPublicationExecutionInput) {
    validate(input);
    const command = { ...input, now: new Date(input.now) };
    return this.prisma.$transaction(
      async (tx) => {
        const { content, publication: row } = await this.lock(tx, command);
        if (row.status === Status.EXPIRED || row.status === Status.CANCELLED)
          return { outcome: 'TERMINAL_NOOP' as const, ...safe(row) };
        if (
          (row.status === Status.PUBLISHED &&
            (content.status !== ContentStatus.PUBLISHED ||
              row.publishedAt === null)) ||
          (row.status === Status.SCHEDULED &&
            content.status !== ContentStatus.SCHEDULED)
        )
          conflict();
        if (row.visibleUntil === null || row.visibleUntil > command.now)
          return { outcome: 'NOT_DUE' as const, ...safe(row) };
        if (
          row.status === Status.SCHEDULED &&
          (row.publishedAt !== null ||
            row.studentRecipientCount !== 0 ||
            row.guardianRecipientContextCount !== 0 ||
            (await tx.academicContentAudienceRecipient.count({
              where: {
                schoolId: command.schoolId,
                publicationId: command.publicationId,
              },
            })) !== 0)
        )
          conflict();
        const changed = await tx.academicContentPublication.updateMany({
          where: {
            id: command.publicationId,
            schoolId: command.schoolId,
            academicContentId: command.contentId,
            revisionId: row.revisionId,
            status: row.status,
          },
          data: { status: Status.EXPIRED, expiredAt: command.now },
        });
        const changedContent = await tx.academicContent.updateMany({
          where: {
            id: command.contentId,
            schoolId: command.schoolId,
            deletedAt: null,
            status: content.status,
          },
          data: { status: ContentStatus.EXPIRED, updatedByUserId: null },
        });
        if (changed.count !== 1 || changedContent.count !== 1) conflict();
        await tx.auditLog.create({
          data: {
            actorId: null,
            userType: UserType.SERVICE_ACCOUNT,
            organizationId: content.school.organizationId,
            schoolId: command.schoolId,
            module: 'academic-content',
            action: 'academics.academic_content.publication.expire',
            resourceType: 'academic_content_publication',
            resourceId: command.publicationId,
            outcome: AuditOutcome.SUCCESS,
            after: {
              contentId: command.contentId,
              publicationId: command.publicationId,
              revisionId: row.revisionId,
              fromStatus: row.status,
              toStatus: Status.EXPIRED,
              publishedAt: row.publishedAt?.toISOString() ?? null,
              expiredAt: command.now.toISOString(),
              visibleUntil: row.visibleUntil.toISOString(),
              studentRecipientCount: row.studentRecipientCount,
              guardianRecipientContextCount: row.guardianRecipientContextCount,
              reason:
                row.status === Status.SCHEDULED
                  ? 'MISSED_VISIBILITY_WINDOW'
                  : 'VISIBILITY_WINDOW_ENDED',
            },
          },
        });
        return {
          outcome: 'EXPIRED' as const,
          ...safe({ ...row, status: Status.EXPIRED, expiredAt: command.now }),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 20_000,
        timeout: 20_000,
      },
    );
  }

  async cancel(input: CancellationInput) {
    validate(input);
    assertAcademicContentPublicationUuid(input.actorId);
    assertAcademicContentPublicationUuid(input.organizationId);
    const command = { ...input, now: new Date(input.now) };
    return this.prisma.$transaction(
      async (tx) => {
        const { content, publication: row } = await this.lock(tx, command);
        if (content.school.organizationId !== command.organizationId)
          conflict();
        if (
          row.status === Status.CANCELLED &&
          row.publishedAt !== null &&
          row.cancelledAt !== null &&
          row.cancelledByUserId !== null &&
          content.status === ContentStatus.CANCELLED
        )
          return safe(row);
        if (
          row.status !== Status.PUBLISHED ||
          row.publishedAt === null ||
          content.status !== ContentStatus.PUBLISHED
        )
          conflict();
        const changed = await tx.academicContentPublication.updateMany({
          where: {
            id: command.publicationId,
            schoolId: command.schoolId,
            academicContentId: command.contentId,
            revisionId: row.revisionId,
            status: Status.PUBLISHED,
          },
          data: {
            status: Status.CANCELLED,
            cancelledAt: command.now,
            cancelledByUserId: command.actorId,
          },
        });
        const changedContent = await tx.academicContent.updateMany({
          where: {
            id: command.contentId,
            schoolId: command.schoolId,
            deletedAt: null,
            status: ContentStatus.PUBLISHED,
          },
          data: {
            status: ContentStatus.CANCELLED,
            updatedByUserId: command.actorId,
          },
        });
        if (changed.count !== 1 || changedContent.count !== 1) conflict();
        await tx.auditLog.create({
          data: {
            actorId: command.actorId,
            organizationId: content.school.organizationId,
            schoolId: command.schoolId,
            module: 'academic-content',
            action: 'academics.academic_content.publication.cancel',
            resourceType: 'academic_content_publication',
            resourceId: command.publicationId,
            outcome: AuditOutcome.SUCCESS,
            after: {
              contentId: command.contentId,
              publicationId: command.publicationId,
              revisionId: row.revisionId,
              fromStatus: Status.PUBLISHED,
              toStatus: Status.CANCELLED,
              publishedAt: row.publishedAt.toISOString(),
              cancelledAt: command.now.toISOString(),
              visibleUntil: row.visibleUntil?.toISOString() ?? null,
              studentRecipientCount: row.studentRecipientCount,
              guardianRecipientContextCount: row.guardianRecipientContextCount,
            },
          },
        });
        return safe({
          ...row,
          status: Status.CANCELLED,
          cancelledAt: command.now,
          cancelledByUserId: command.actorId,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 20_000,
        timeout: 20_000,
      },
    );
  }
}
