import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AcademicContentApprovalStatus as ApprovalStatus,
  AcademicContentPublicationStatus as PublicationStatus,
  AcademicContentStatus as ContentStatus,
  AcademicContentType as ContentType,
  AuditOutcome,
  Prisma,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  AcademicContentPublicationCommand,
  academicContentPublicationRequestFingerprint,
  academicContentPublicationRevisionStrategy,
  assertAcademicContentPublicationCommand,
  evaluateAcademicContentPublicationReadiness,
  isAcademicContentExternallyPublishable,
  normalizeAcademicContentPublicationTiming,
} from '../domain/academic-content-publication.policy';
import { evaluateAcademicContentReadiness } from '../domain/academic-content-readiness.policy';
import { decodeAcademicContentRevisionSnapshotV2 } from '../domain/academic-content-revision-snapshot';
import { ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES } from '../files/domain/academic-content-file.constants';
import { resolveAcademicContentFileType } from '../files/domain/academic-content-file.registry';
import { AcademicContentRevisionRepository } from './academic-content-revision.repository';

type PublicationIdentity = { schoolId: string; contentId: string };
type PublicationMutation = PublicationIdentity & {
  organizationId: string;
  actorId: string;
  now?: Date;
};

const PUBLICATION_SELECT = {
  id: true,
  revisionId: true,
  status: true,
  sourceContentStatus: true,
  publishAt: true,
  visibleFrom: true,
  visibleUntil: true,
  publishedAt: true,
  expiredAt: true,
  cancelledAt: true,
  studentRecipientCount: true,
  guardianRecipientContextCount: true,
  createdByUserId: true,
  createdAt: true,
} satisfies Prisma.AcademicContentPublicationSelect;
type PublicationRow = Prisma.AcademicContentPublicationGetPayload<{
  select: typeof PUBLICATION_SELECT;
}>;
function safePublication(row: PublicationRow) {
  return {
    publicationId: row.id,
    revisionId: row.revisionId,
    status: row.status,
    sourceContentStatus: row.sourceContentStatus,
    publishAt: row.publishAt,
    visibleFrom: row.visibleFrom,
    visibleUntil: row.visibleUntil,
    publishedAt: row.publishedAt,
    expiredAt: row.expiredAt,
    cancelledAt: row.cancelledAt,
    studentRecipientCount: row.studentRecipientCount,
    guardianRecipientContextCount: row.guardianRecipientContextCount,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

const FILE_SELECT = {
  schoolId: true,
  deletedAt: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  bucket: true,
  objectKey: true,
} satisfies Prisma.FileSelect;
type Asset = { file: Prisma.FileGetPayload<{ select: typeof FILE_SELECT }> };
function assetsValid(assets: Asset[], schoolId: string): boolean {
  return assets.every(
    ({ file }) =>
      file.schoolId === schoolId &&
      file.deletedAt === null &&
      file.sizeBytes > 0n &&
      file.sizeBytes <= ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES &&
      file.bucket.trim().length > 0 &&
      file.objectKey.trim().length > 0 &&
      resolveAcademicContentFileType(file.originalName, file.mimeType) !== null,
  );
}

function conflict(code: string, message: string): never {
  throw new DomainException({
    code: `academic_content.publication.${code}`,
    message,
    httpStatus: HttpStatus.CONFLICT,
  });
}
function commandTime(now = new Date()): Date {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new ValidationDomainException(
      'Publication timing requires valid dates',
    );
  return new Date(now);
}

export function academicContentPublicationPagination(
  page: number,
  limit: number,
): number {
  const offset = (page - 1) * limit;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset > 2_147_483_647
  )
    throw new ValidationDomainException('Publication pagination is invalid');
  return offset;
}

@Injectable()
export class AcademicContentPublicationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: AcademicContentRevisionRepository,
  ) {}

  private async content(
    tx: Prisma.TransactionClient,
    input: PublicationIdentity,
  ) {
    const content = await tx.academicContent.findFirst({
      where: { id: input.contentId, schoolId: input.schoolId, deletedAt: null },
      select: {
        id: true,
        status: true,
        type: true,
        audience: true,
        title: true,
        academicYearId: true,
        termId: true,
      },
    });
    if (!content)
      throw new NotFoundDomainException('Academic content not found');
    return content;
  }

  // Canonical mutation lock order: Content, then exact Publication. Future workers must follow it.
  private async lockContent(
    tx: Prisma.TransactionClient,
    input: PublicationIdentity,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM academic_contents
      WHERE id = ${input.contentId}::uuid AND school_id = ${input.schoolId}::uuid
        AND deleted_at IS NULL FOR UPDATE`;
    if (!rows.length)
      throw new NotFoundDomainException('Academic content not found');
    return this.content(tx, input);
  }

  private async source(
    tx: Prisma.TransactionClient,
    input: PublicationIdentity,
    now: Date,
  ) {
    const content = await this.content(tx, input);
    const strategy = academicContentPublicationRevisionStrategy(content.status);
    const approved =
      strategy === 'USE_EXACT_APPROVED_REVISION'
        ? await tx.academicContentApproval.findFirst({
            where: {
              schoolId: input.schoolId,
              academicContentId: input.contentId,
            },
            orderBy: { roundNumber: 'desc' },
            select: { status: true, revisionId: true },
          })
        : null;
    const revision =
      approved?.status === ApprovalStatus.APPROVED
        ? await tx.academicContentRevision.findFirst({
            where: {
              id: approved.revisionId,
              schoolId: input.schoolId,
              academicContentId: input.contentId,
              snapshotContractVersion: 2,
            },
            select: {
              id: true,
              type: true,
              audience: true,
              title: true,
              academicYearId: true,
              termId: true,
              typeSpecificSnapshot: true,
              targets: {
                where: { schoolId: input.schoolId },
                select: { subjectId: true },
              },
              assets: {
                where: { schoolId: input.schoolId },
                select: { file: { select: FILE_SELECT } },
              },
            },
          })
        : null;
    const envelope = revision ?? content;
    const [year, term, active] = await Promise.all([
      tx.academicYear.findFirst({
        where: {
          id: envelope.academicYearId,
          schoolId: input.schoolId,
          deletedAt: null,
        },
        select: { id: true },
      }),
      tx.term.findFirst({
        where: {
          id: envelope.termId,
          schoolId: input.schoolId,
          deletedAt: null,
        },
        select: {
          academicYearId: true,
          startDate: true,
          endDate: true,
          isActive: true,
        },
      }),
      tx.academicContentPublication.findFirst({
        where: {
          schoolId: input.schoolId,
          academicContentId: input.contentId,
          status: {
            in: [PublicationStatus.SCHEDULED, PublicationStatus.PUBLISHED],
          },
        },
        select: { id: true },
      }),
    ]);
    let targets: { subjectId: string | null }[] = [];
    let assets: Asset[] = [];
    let hasTypeDetail = envelope.type === ContentType.GENERAL_RESOURCE;
    let onlineSessionEndAt: Date | null = null;
    if (strategy === 'USE_EXACT_APPROVED_REVISION') {
      if (revision) {
        targets = revision.targets;
        assets = revision.assets;
        if (revision.type !== ContentType.GENERAL_RESOURCE) {
          try {
            const snapshot = decodeAcademicContentRevisionSnapshotV2(
              revision.typeSpecificSnapshot,
              revision.type,
            );
            hasTypeDetail = true;
            if (snapshot.type === ContentType.ONLINE_SESSION)
              onlineSessionEndAt = new Date(snapshot.state.endAt);
          } catch {
            hasTypeDetail = false;
          }
        }
      }
    } else {
      const current = await tx.academicContent.findFirstOrThrow({
        where: {
          id: input.contentId,
          schoolId: input.schoolId,
          deletedAt: null,
        },
        select: {
          targets: {
            where: { schoolId: input.schoolId },
            select: { subjectId: true },
          },
          assets: {
            where: { schoolId: input.schoolId, deletedAt: null },
            select: { file: { select: FILE_SELECT } },
          },
          preparationDetail: { select: { id: true } },
          weeklyPlanDetail: { select: { id: true } },
          guardianNoteDetail: { select: { id: true } },
          subjectResourceDetail: { select: { id: true } },
          onlineSessionDetail: { select: { endAt: true } },
        },
      });
      targets = current.targets;
      assets = current.assets;
      hasTypeDetail = Boolean(
        {
          [ContentType.GENERAL_RESOURCE]: true,
          [ContentType.TEACHER_PREPARATION]: current.preparationDetail,
          [ContentType.WEEKLY_PLAN]: current.weeklyPlanDetail,
          [ContentType.GUARDIAN_WEEKLY_NOTE]: current.guardianNoteDetail,
          [ContentType.SUBJECT_RESOURCE]: current.subjectResourceDetail,
          [ContentType.ONLINE_SESSION]: current.onlineSessionDetail,
        }[content.type],
      );
      onlineSessionEndAt = current.onlineSessionDetail?.endAt ?? null;
    }
    // For APPROVED, evaluate completeness of the frozen envelope, without the mutable-status restriction.
    const authoring = evaluateAcademicContentReadiness({
      ...envelope,
      status: revision ? ContentStatus.DRAFT : content.status,
      targets,
      hasTypeDetail,
      academicYearExists: year !== null,
      term,
      now,
    });
    const readiness = evaluateAcademicContentPublicationReadiness({
      type: envelope.type,
      audience: envelope.audience,
      sourceStatus: content.status,
      revisionStrategyAvailable:
        strategy === 'CAPTURE_CURRENT_REVISION_V2' || revision !== null,
      authoringComplete: authoring.canAdvance,
      term,
      termValid:
        year !== null &&
        term !== null &&
        term.academicYearId === envelope.academicYearId,
      targetCount: targets.length,
      typeDetailComplete: hasTypeDetail,
      activeAssetsValid: assetsValid(assets, input.schoolId),
      hasActivePublication: active !== null,
      now,
      onlineSessionEndAt,
    });
    return { content, envelope, revision, term, readiness, onlineSessionEndAt };
  }

  readiness(input: PublicationIdentity & { now?: Date }) {
    const now = commandTime(input.now);
    return this.prisma.$transaction(
      async (tx) => (await this.source(tx, input, now)).readiness,
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 20_000,
        timeout: 20_000,
      },
    );
  }

  async schedule(
    input: PublicationMutation & { command: AcademicContentPublicationCommand },
  ) {
    assertAcademicContentPublicationCommand(input.contentId, input.command);
    const now = commandTime(input.now);
    const fingerprint = academicContentPublicationRequestFingerprint(
      input.contentId,
      input.command,
    );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.lockContent(tx, input);
          const existing = await tx.academicContentPublication.findUnique({
            where: {
              schoolId_clientRequestId: {
                schoolId: input.schoolId,
                clientRequestId: input.command.clientRequestId,
              },
            },
            select: { ...PUBLICATION_SELECT, requestFingerprint: true },
          });
          if (existing) {
            if (existing.requestFingerprint !== fingerprint)
              conflict(
                'idempotency_conflict',
                'Publication request conflicts with an existing request',
              );
            return safePublication(existing);
          }
          const source = await this.source(tx, input, now);
          if (
            !source.term ||
            !isAcademicContentExternallyPublishable(
              source.envelope.type,
              source.envelope.audience,
            )
          )
            conflict(
              'not_ready',
              'Academic content is not ready for publication',
            );
          const timing = normalizeAcademicContentPublicationTiming({
            ...input.command,
            now,
            type: source.envelope.type,
            term: source.term,
            onlineSessionEndAt: source.onlineSessionEndAt,
          });
          if (
            !(timing.publishAt <= now
              ? source.readiness.canPublish
              : source.readiness.canSchedule)
          )
            conflict(
              'not_ready',
              'Academic content is not ready for publication',
            );
          const revision =
            source.revision ??
            (await this.revisions.captureInTransaction(tx, { ...input, now }));
          const publication = await tx.academicContentPublication.create({
            data: {
              schoolId: input.schoolId,
              academicContentId: input.contentId,
              revisionId: revision.id,
              clientRequestId: input.command.clientRequestId,
              requestFingerprint: fingerprint,
              sourceContentStatus: source.content.status,
              status: PublicationStatus.SCHEDULED,
              ...timing,
              createdByUserId: input.actorId,
              studentRecipientCount: 0,
              guardianRecipientContextCount: 0,
            },
            select: PUBLICATION_SELECT,
          });
          await tx.academicContent.update({
            where: {
              id_schoolId: { id: input.contentId, schoolId: input.schoolId },
            },
            data: {
              status: ContentStatus.SCHEDULED,
              updatedByUserId: input.actorId,
            },
          });
          await this.audit(tx, input, publication.id, 'schedule', {
            contentId: input.contentId,
            publicationId: publication.id,
            revisionId: revision.id,
            sourceContentStatus: source.content.status,
            status: PublicationStatus.SCHEDULED,
            publishAt: timing.publishAt.toISOString(),
            visibleFrom: timing.visibleFrom.toISOString(),
            visibleUntil: timing.visibleUntil?.toISOString() ?? null,
            studentRecipientCount: 0,
            guardianRecipientContextCount: 0,
          });
          return safePublication(publication);
        },
        { maxWait: 20_000, timeout: 20_000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Different parent rows can race for a school-wide key. The losing transaction has rolled back.
        const existing =
          await this.prisma.academicContentPublication.findUnique({
            where: {
              schoolId_clientRequestId: {
                schoolId: input.schoolId,
                clientRequestId: input.command.clientRequestId,
              },
            },
            select: { id: true },
          });
        if (existing)
          conflict(
            'idempotency_conflict',
            'Publication request conflicts with an existing request',
          );
        conflict('active_conflict', 'An active publication already exists');
      }
      throw error;
    }
  }

  async unschedule(input: PublicationMutation & { publicationId: string }) {
    const now = commandTime(input.now);
    return this.prisma.$transaction(
      async (tx) => {
        const content = await this.lockContent(tx, input);
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM academic_content_publications WHERE id = ${input.publicationId}::uuid
          AND school_id = ${input.schoolId}::uuid AND academic_content_id = ${input.contentId}::uuid FOR UPDATE`;
        if (!rows.length)
          throw new NotFoundDomainException('Publication not found');
        const publication =
          await tx.academicContentPublication.findFirstOrThrow({
            where: {
              id: input.publicationId,
              schoolId: input.schoolId,
              academicContentId: input.contentId,
            },
            select: PUBLICATION_SELECT,
          });
        if (
          publication.status !== PublicationStatus.SCHEDULED ||
          content.status !== ContentStatus.SCHEDULED ||
          (publication.sourceContentStatus !== ContentStatus.DRAFT &&
            publication.sourceContentStatus !== ContentStatus.APPROVED)
        )
          conflict('cannot_unschedule', 'Publication cannot be unscheduled');
        const changed = await tx.academicContentPublication.updateMany({
          where: {
            id: input.publicationId,
            schoolId: input.schoolId,
            academicContentId: input.contentId,
            status: PublicationStatus.SCHEDULED,
          },
          data: {
            status: PublicationStatus.CANCELLED,
            cancelledAt: now,
            cancelledByUserId: input.actorId,
          },
        });
        const restored = await tx.academicContent.updateMany({
          where: {
            id: input.contentId,
            schoolId: input.schoolId,
            deletedAt: null,
            status: ContentStatus.SCHEDULED,
          },
          data: {
            status: publication.sourceContentStatus,
            updatedByUserId: input.actorId,
          },
        });
        if (changed.count !== 1 || restored.count !== 1)
          conflict('cannot_unschedule', 'Publication cannot be unscheduled');
        await this.audit(tx, input, publication.id, 'unschedule', {
          contentId: input.contentId,
          publicationId: publication.id,
          revisionId: publication.revisionId,
          fromPublicationStatus: PublicationStatus.SCHEDULED,
          toPublicationStatus: PublicationStatus.CANCELLED,
          restoredContentStatus: publication.sourceContentStatus,
          cancelledAt: now.toISOString(),
        });
        return safePublication({
          ...publication,
          status: PublicationStatus.CANCELLED,
          cancelledAt: now,
        });
      },
      { maxWait: 20_000, timeout: 20_000 },
    );
  }

  private audit(
    tx: Prisma.TransactionClient,
    input: PublicationMutation,
    publicationId: string,
    action: 'schedule' | 'unschedule',
    after: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: {
        actorId: input.actorId,
        organizationId: input.organizationId,
        schoolId: input.schoolId,
        module: 'academic-content',
        action: `academics.academic_content.publication.${action}`,
        resourceType: 'academic_content_publication',
        resourceId: publicationId,
        outcome: AuditOutcome.SUCCESS,
        after,
      },
    });
  }

  history(input: PublicationIdentity & { page: number; limit: number }) {
    const skip = academicContentPublicationPagination(input.page, input.limit);
    return this.prisma.$transaction(
      async (tx) => {
        await this.content(tx, input);
        const where = {
          schoolId: input.schoolId,
          academicContentId: input.contentId,
        };
        const [rows, total] = await Promise.all([
          tx.academicContentPublication.findMany({
            where,
            select: PUBLICATION_SELECT,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip,
            take: input.limit,
          }),
          tx.academicContentPublication.count({ where }),
        ]);
        return {
          items: rows.map(safePublication),
          total,
          page: input.page,
          limit: input.limit,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  detail(input: PublicationIdentity & { publicationId: string }) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.content(tx, input);
        const row = await tx.academicContentPublication.findFirst({
          where: {
            id: input.publicationId,
            schoolId: input.schoolId,
            academicContentId: input.contentId,
          },
          select: PUBLICATION_SELECT,
        });
        if (!row) throw new NotFoundDomainException('Publication not found');
        return safePublication(row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
