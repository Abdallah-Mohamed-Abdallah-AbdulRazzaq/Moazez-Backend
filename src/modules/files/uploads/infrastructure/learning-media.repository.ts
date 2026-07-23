import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  FileUploadPurpose,
  FileUploadSession,
  FileUploadSessionStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type {
  LearningMediaAuditContext,
  LearningMediaFinalizeInput,
  LearningMediaIntentInput,
  LearningMediaTransactionContext,
} from '../application/learning-media.unit-of-work';

export type LearningMediaCleanupClaim = {
  session: FileUploadSession;
  cleanStaging: boolean;
  cleanFinal: boolean;
  target: LearningMediaCleanupTarget;
};

export type LearningMediaCleanupTarget =
  | 'staging'
  | 'final'
  | 'finalization-recovery';

export type LearningMediaCleanupCandidate = {
  uploadId: string;
  target: LearningMediaCleanupTarget;
};

@Injectable()
export class LearningMediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  createTransactionContext(
    transaction: Prisma.TransactionClient,
  ): LearningMediaTransactionContext {
    const context: LearningMediaTransactionContext = {
      createOrFindIntent: (input) =>
        this.createOrFindIntent(transaction, input),
      persistUploadUrlCapability: (input) =>
        this.persistUploadUrlCapability(transaction, input),
      markSigningFailed: (input) => this.markSigningFailed(transaction, input),
      claimVerification: (input) => this.claimVerification(transaction, input),
      claimLegacyVerification: (input) =>
        this.claimLegacyVerification(transaction, input),
      finalize: (input) => this.finalize(transaction, input),
      markFailed: (input) => this.markFailed(transaction, input),
      releaseVerification: (input) =>
        this.releaseVerification(transaction, input),
      markFinalCleanupPending: (input) =>
        this.markFinalCleanupPending(transaction, input),
      cancel: (input) => this.cancel(transaction, input),
      updateStatus: (input) => this.updateStatus(transaction, input),
    };
    return Object.freeze(context);
  }

  findOwnedSessionByRequest(input: {
    schoolId: string;
    actorId: string;
    clientRequestId: string;
  }): Promise<FileUploadSession | null> {
    return this.prisma.fileUploadSession.findUnique({
      where: {
        schoolId_createdByUserId_purpose_clientRequestId: {
          schoolId: input.schoolId,
          createdByUserId: input.actorId,
          purpose: FileUploadPurpose.LESSON_CONTENT,
          clientRequestId: input.clientRequestId,
        },
      },
    });
  }

  async discoverCleanupCandidates(
    now: Date,
    staleBefore: Date,
  ): Promise<LearningMediaCleanupCandidate[]> {
    const sessions = await this.prisma.fileUploadSession.findMany({
      where: {
        OR: [
          {
            stagingCleanupEligibleAt: { lte: now },
            stagingObjectDeletedAt: null,
            OR: [
              { stagingCleanupClaimedAt: null },
              { stagingCleanupClaimedAt: { lt: staleBefore } },
            ],
          },
          {
            finalCleanupEligibleAt: { lte: now },
            finalObjectDeletedAt: null,
            OR: [
              { finalCleanupClaimedAt: null },
              { finalCleanupClaimedAt: { lt: staleBefore } },
            ],
          },
        ],
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    const candidates: LearningMediaCleanupCandidate[] = [];
    for (const session of sessions) {
      if (
        session.stagingCleanupEligibleAt !== null &&
        session.stagingCleanupEligibleAt <= now &&
        session.stagingObjectDeletedAt === null &&
        (session.stagingCleanupClaimedAt === null ||
          session.stagingCleanupClaimedAt < staleBefore)
      ) {
        candidates.push({ uploadId: session.id, target: 'staging' });
      }
      if (
        session.finalCleanupEligibleAt !== null &&
        session.finalCleanupEligibleAt <= now &&
        session.finalObjectDeletedAt === null &&
        (session.finalCleanupClaimedAt === null ||
          session.finalCleanupClaimedAt < staleBefore)
      ) {
        if (session.status === FileUploadSessionStatus.READY) {
          candidates.push({ uploadId: session.id, target: 'final' });
        } else if (
          session.status === FileUploadSessionStatus.VERIFYING &&
          session.failureReason === 'finalization_cleanup_pending'
        ) {
          candidates.push({
            uploadId: session.id,
            target: 'finalization-recovery',
          });
        }
      }
    }
    return candidates;
  }

  async expireAbandonedSessions(now: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "file_upload_sessions"
        WHERE "status" IN ('CREATED', 'UPLOADING')
          AND "expires_at" <= ${now}
        ORDER BY "expires_at" ASC, "id" ASC
        LIMIT 100
        FOR UPDATE SKIP LOCKED
      `);
      let expiredCount = 0;
      for (const row of rows) {
        const session = await tx.fileUploadSession.findUniqueOrThrow({
          where: { id: row.id },
        });
        const cleanupEligibleAt = maximumDate(
          now,
          session.latestUploadUrlExpiresAt,
        );
        const expired = await tx.fileUploadSession.update({
          where: { id: session.id },
          data: {
            status: FileUploadSessionStatus.EXPIRED,
            stagingCleanupEligibleAt: cleanupEligibleAt,
          },
        });
        await this.writeAudit(
          tx,
          {
            actorId: null,
            userType: UserType.SERVICE_ACCOUNT,
            organizationId: session.organizationId,
            schoolId: session.schoolId,
          },
          'learning.media.upload.expire',
          session.id,
          session.status,
          expired.status,
        );
        expiredCount += 1;
      }
      return expiredCount;
    });
  }

  async claimCleanup(
    uploadId: string,
    target: LearningMediaCleanupTarget,
    now: Date,
    staleBefore: Date,
    allowExistingClaim = false,
  ): Promise<LearningMediaCleanupClaim | null> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "file_upload_sessions"
        WHERE "id" = ${uploadId}::uuid
        FOR UPDATE
      `);
      const session = rows[0]
        ? await tx.fileUploadSession.findUnique({ where: { id: rows[0].id } })
        : null;
      if (!session || session.status === FileUploadSessionStatus.LEGACY) {
        return null;
      }

      const cleanStaging =
        target === 'staging' &&
        session.stagingBucket !== null &&
        session.stagingObjectKey !== null &&
        session.stagingCleanupEligibleAt !== null &&
        session.stagingCleanupEligibleAt <= now &&
        session.stagingObjectDeletedAt === null &&
        (session.stagingCleanupClaimedAt === null ||
          session.stagingCleanupClaimedAt < staleBefore ||
          allowExistingClaim);
      let cleanFinal =
        target !== 'staging' &&
        session.finalCleanupEligibleAt !== null &&
        session.finalCleanupEligibleAt <= now &&
        session.finalObjectDeletedAt === null &&
        (session.finalCleanupClaimedAt === null ||
          session.finalCleanupClaimedAt < staleBefore ||
          allowExistingClaim);

      if (cleanFinal && session.status === FileUploadSessionStatus.READY) {
        if (
          session.stagingObjectKey !== null &&
          session.stagingObjectDeletedAt === null
        ) {
          cleanFinal = false;
        }
        if (!session.fileId) return null;
        const file = await tx.file.findFirst({
          where: {
            id: session.fileId,
            schoolId: session.schoolId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!file) cleanFinal = false;
        const references = await tx.lessonContentItem.count({
          where: { fileId: session.fileId, deletedAt: null },
        });
        if (references !== 0) cleanFinal = false;
      }
      if (
        cleanFinal &&
        ((target === 'final' &&
          session.status !== FileUploadSessionStatus.READY) ||
          (target === 'finalization-recovery' &&
            !(
              session.status === FileUploadSessionStatus.VERIFYING &&
              session.failureReason === 'finalization_cleanup_pending'
            )))
      ) {
        cleanFinal = false;
      }
      if (!cleanStaging && !cleanFinal) return null;

      const claimed = await tx.fileUploadSession.update({
        where: { id: session.id },
        data: {
          ...(cleanStaging ? { stagingCleanupClaimedAt: now } : {}),
          ...(cleanFinal ? { finalCleanupClaimedAt: now } : {}),
        },
      });
      return { session: claimed, cleanStaging, cleanFinal, target };
    });
  }

  async finishCleanup(input: {
    uploadId: string;
    target: LearningMediaCleanupTarget;
    now: Date;
    stagingDeleted: boolean;
    finalDeleted: boolean;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.fileUploadSession.findUniqueOrThrow({
        where: { id: input.uploadId },
      });
      let status = session.status;
      let failureReason: string | null | undefined;
      if (
        input.finalDeleted &&
        session.status === FileUploadSessionStatus.READY &&
        session.fileId
      ) {
        await tx.file.updateMany({
          where: { id: session.fileId, deletedAt: null },
          data: { deletedAt: input.now },
        });
        status = FileUploadSessionStatus.PURGED;
      } else if (
        input.finalDeleted &&
        input.target === 'finalization-recovery' &&
        session.status === FileUploadSessionStatus.VERIFYING &&
        session.failureReason === 'finalization_cleanup_pending'
      ) {
        status = FileUploadSessionStatus.UPLOADING;
        failureReason = null;
      }
      await tx.fileUploadSession.update({
        where: { id: session.id },
        data: {
          status,
          ...(failureReason !== undefined ? { failureReason } : {}),
          ...(input.stagingDeleted
            ? { stagingObjectDeletedAt: input.now }
            : {}),
          ...(input.finalDeleted && input.target === 'finalization-recovery'
            ? {
                finalCleanupEligibleAt: null,
                finalCleanupClaimedAt: null,
                finalObjectDeletedAt: null,
              }
            : input.finalDeleted
              ? { finalObjectDeletedAt: input.now }
              : {}),
        },
      });
      await this.writeAudit(
        tx,
        {
          actorId: null,
          userType: UserType.SERVICE_ACCOUNT,
          organizationId: session.organizationId,
          schoolId: session.schoolId,
        },
        'learning.media.upload.cleanup',
        session.id,
        session.status,
        status,
        {
          stagingDeleted: input.stagingDeleted,
          finalDeleted: input.finalDeleted,
        },
      );
    });
  }

  private async createOrFindIntent(
    tx: Prisma.TransactionClient,
    input: LearningMediaIntentInput,
  ) {
    const existing = await tx.fileUploadSession.findUnique({
      where: {
        schoolId_createdByUserId_purpose_clientRequestId: {
          schoolId: input.schoolId,
          createdByUserId: input.actorId,
          purpose: FileUploadPurpose.LESSON_CONTENT,
          clientRequestId: input.clientRequestId,
        },
      },
    });
    if (existing) return { session: existing, created: false };
    const session = await tx.fileUploadSession.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        schoolId: input.schoolId,
        createdByUserId: input.actorId,
        clientRequestId: input.clientRequestId,
        purpose: FileUploadPurpose.LESSON_CONTENT,
        originalName: input.originalName,
        expectedMimeType: input.expectedMimeType,
        expectedSizeBytes: input.expectedSizeBytes,
        stagingBucket: input.stagingBucket,
        stagingObjectKey: input.stagingObjectKey,
        finalBucket: input.finalBucket,
        finalObjectKey: input.finalObjectKey,
        status: FileUploadSessionStatus.CREATED,
        expiresAt: input.expiresAt,
        createdAt: input.createdAt,
      },
    });
    await this.writeAudit(
      tx,
      input,
      'learning.media.upload_intent.create',
      session.id,
      null,
      session.status,
    );
    return { session, created: true };
  }

  private async persistUploadUrlCapability(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      actorId: string;
      uploadId: string;
      capabilityExpiresAt: Date;
      now: Date;
    },
  ): Promise<FileUploadSession | null> {
    const session = await this.lockOwnedSession(tx, input);
    if (!session) return null;
    const latestUploadUrlExpiresAt = maximumDate(
      input.capabilityExpiresAt,
      session.latestUploadUrlExpiresAt,
    );
    if (session.expiresAt <= input.now) {
      if (
        session.status === FileUploadSessionStatus.CREATED ||
        session.status === FileUploadSessionStatus.UPLOADING
      ) {
        return tx.fileUploadSession.update({
          where: { id: session.id },
          data: {
            status: FileUploadSessionStatus.EXPIRED,
            latestUploadUrlExpiresAt,
            stagingCleanupEligibleAt: maximumDate(
              input.now,
              latestUploadUrlExpiresAt,
            ),
          },
        });
      }
      return session;
    }
    if (
      session.status === FileUploadSessionStatus.CREATED ||
      session.status === FileUploadSessionStatus.UPLOADING
    ) {
      return tx.fileUploadSession.update({
        where: { id: session.id },
        data: {
          status: FileUploadSessionStatus.UPLOADING,
          latestUploadUrlExpiresAt,
        },
      });
    }
    if (
      session.status === FileUploadSessionStatus.FAILED &&
      session.failureReason === 'signing_failed'
    ) {
      return tx.fileUploadSession.update({
        where: { id: session.id },
        data: {
          latestUploadUrlExpiresAt,
          stagingCleanupEligibleAt: maximumDate(
            session.stagingCleanupEligibleAt,
            latestUploadUrlExpiresAt,
          ),
        },
      });
    }
    return session;
  }

  private async markSigningFailed(
    tx: Prisma.TransactionClient,
    input: LearningMediaAuditContext & { uploadId: string; now: Date },
  ): Promise<FileUploadSession | null> {
    const session = await this.lockOwnedSession(tx, input);
    if (!session) return null;
    if (session.status !== FileUploadSessionStatus.CREATED) return session;
    const failed = await tx.fileUploadSession.update({
      where: { id: session.id },
      data: {
        status: FileUploadSessionStatus.FAILED,
        failedAt: input.now,
        failureReason: 'signing_failed',
        stagingCleanupEligibleAt: input.now,
      },
    });
    await this.writeFailureAudit(
      tx,
      failed,
      input,
      'signing_failed',
      'learning.media.upload.signing_failed',
      FileUploadSessionStatus.CREATED,
    );
    return failed;
  }

  private async lockOwnedSession(
    tx: Prisma.TransactionClient,
    input: { schoolId: string; actorId: string; uploadId: string },
  ): Promise<FileUploadSession | null> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "file_upload_sessions"
      WHERE "id" = ${input.uploadId}::uuid
        AND "school_id" = ${input.schoolId}::uuid
        AND "created_by_user_id" = ${input.actorId}::uuid
        AND "purpose" = 'LESSON_CONTENT'
      LIMIT 1
      FOR UPDATE
    `);
    return rows[0]
      ? tx.fileUploadSession.findUnique({ where: { id: rows[0].id } })
      : null;
  }

  private async claimVerification(
    tx: Prisma.TransactionClient,
    input: { schoolId: string; actorId: string; uploadId: string; now: Date },
  ) {
    const session = await this.lockOwnedSession(tx, input);
    if (!session) return { status: 'not_found' as const };
    if (session.status === FileUploadSessionStatus.READY) {
      return { status: 'ready' as const, session };
    }
    if (session.expiresAt <= input.now) {
      if (
        session.status === FileUploadSessionStatus.CREATED ||
        session.status === FileUploadSessionStatus.UPLOADING
      ) {
        const expired = await tx.fileUploadSession.update({
          where: { id: session.id },
          data: {
            status: FileUploadSessionStatus.EXPIRED,
            stagingCleanupEligibleAt: maximumDate(
              input.now,
              session.latestUploadUrlExpiresAt,
            ),
          },
        });
        return { status: 'expired' as const, session: expired };
      }
      return { status: 'expired' as const, session };
    }
    if (session.status !== FileUploadSessionStatus.UPLOADING) {
      return { status: 'conflict' as const, session };
    }
    const claimed = await tx.fileUploadSession.update({
      where: { id: session.id },
      data: { status: FileUploadSessionStatus.VERIFYING },
    });
    return { status: 'claimed' as const, session: claimed };
  }

  private async claimLegacyVerification(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      schoolId: string;
      actorId: string;
      uploadId: string;
    },
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT fus."id"
      FROM "file_upload_sessions" fus
      JOIN "files" f ON f."id" = fus."file_id"
      WHERE fus."id" = ${input.uploadId}::uuid
        AND fus."school_id" = ${input.schoolId}::uuid
        AND fus."organization_id" = ${input.organizationId}::uuid
        AND fus."purpose" = 'LESSON_CONTENT'
        AND fus."status" = 'LEGACY'
        AND fus."staging_object_key" IS NULL
        AND f."school_id" = ${input.schoolId}::uuid
        AND f."organization_id" = ${input.organizationId}::uuid
        AND f."deleted_at" IS NULL
        AND EXISTS (
          SELECT 1 FROM "lesson_content_items" lci
          WHERE lci."file_id" = f."id"
        )
      LIMIT 1
      FOR UPDATE OF fus, f
    `);
    if (!rows[0]) return { status: 'not_found' as const };
    const claimed = await tx.fileUploadSession.update({
      where: { id: rows[0].id },
      data: { status: FileUploadSessionStatus.VERIFYING },
    });
    return { status: 'claimed' as const, session: claimed };
  }

  private async finalize(
    tx: Prisma.TransactionClient,
    input: LearningMediaFinalizeInput,
  ) {
    const session = await this.lockSessionForActorOrLegacy(tx, input);
    if (!session || session.status !== FileUploadSessionStatus.VERIFYING) {
      throw new Error('learning_media_finalize_state_conflict');
    }
    const file = session.fileId
      ? await this.updateLegacyFile(tx, session, input)
      : await tx.file.create({
          data: {
            id: input.fileId,
            organizationId: session.organizationId,
            schoolId: session.schoolId,
            uploaderId: session.createdByUserId,
            bucket: session.finalBucket,
            objectKey: session.finalObjectKey,
            originalName: session.originalName,
            mimeType: input.verifiedMimeType,
            sizeBytes: input.actualSizeBytes,
            checksumSha256: input.checksumSha256,
            visibility: input.visibility,
          },
        });
    const ready = await tx.fileUploadSession.update({
      where: { id: session.id },
      data: {
        status: FileUploadSessionStatus.READY,
        fileId: file.id,
        completedAt: input.completedAt,
        stagingCleanupEligibleAt: input.stagingCleanupEligibleAt,
        finalCleanupEligibleAt: input.finalCleanupEligibleAt,
        finalCleanupClaimedAt: null,
        finalObjectDeletedAt: null,
        failureReason: null,
        verifiedMimeType: input.verifiedMimeType,
        actualSizeBytes: input.actualSizeBytes,
        checksumSha256: input.checksumSha256,
        durationSeconds: input.durationSeconds,
        width: input.width,
        height: input.height,
        verifiedAt: input.verifiedAt,
        verificationVersion: input.verificationVersion,
      },
    });
    await this.writeAudit(
      tx,
      input,
      'learning.media.upload.complete',
      ready.id,
      FileUploadSessionStatus.VERIFYING,
      ready.status,
      {
        mimeType: ready.verifiedMimeType,
        sizeBytes: ready.actualSizeBytes?.toString(),
        durationSeconds: ready.durationSeconds,
      },
    );
    return ready;
  }

  private async lockSessionForActorOrLegacy(
    tx: Prisma.TransactionClient,
    input: { schoolId: string; actorId: string; uploadId: string },
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "file_upload_sessions"
      WHERE "id" = ${input.uploadId}::uuid
        AND "school_id" = ${input.schoolId}::uuid
        AND (
          "created_by_user_id" = ${input.actorId}::uuid
          OR "staging_object_key" IS NULL
        )
      LIMIT 1
      FOR UPDATE
    `);
    return rows[0]
      ? tx.fileUploadSession.findUnique({ where: { id: rows[0].id } })
      : null;
  }

  private async markFailed(
    tx: Prisma.TransactionClient,
    input: LearningMediaAuditContext & {
      uploadId: string;
      reasonCode: string;
      now: Date;
    },
  ): Promise<void> {
    const session = await this.lockSessionForActorOrLegacy(tx, input);
    if (!session || session.status !== FileUploadSessionStatus.VERIFYING)
      return;
    const failed = await tx.fileUploadSession.update({
      where: { id: session.id },
      data: {
        status: FileUploadSessionStatus.FAILED,
        failedAt: input.now,
        stagingCleanupEligibleAt: session.stagingObjectKey
          ? session.latestUploadUrlExpiresAt
          : null,
        failureReason: input.reasonCode,
      },
    });
    await this.writeFailureAudit(tx, failed, input, input.reasonCode);
  }

  private async releaseVerification(
    tx: Prisma.TransactionClient,
    input: { schoolId: string; uploadId: string },
  ): Promise<void> {
    await tx.fileUploadSession.updateMany({
      where: {
        id: input.uploadId,
        schoolId: input.schoolId,
        status: FileUploadSessionStatus.VERIFYING,
        stagingObjectKey: { not: null },
      },
      data: { status: FileUploadSessionStatus.UPLOADING, failureReason: null },
    });
    await tx.fileUploadSession.updateMany({
      where: {
        id: input.uploadId,
        schoolId: input.schoolId,
        status: FileUploadSessionStatus.VERIFYING,
        stagingObjectKey: null,
        verificationVersion: 'legacy_metadata_v1',
      },
      data: { status: FileUploadSessionStatus.LEGACY, failureReason: null },
    });
  }

  private async markFinalCleanupPending(
    tx: Prisma.TransactionClient,
    input: { schoolId: string; uploadId: string; now: Date },
  ): Promise<void> {
    await tx.fileUploadSession.updateMany({
      where: {
        id: input.uploadId,
        schoolId: input.schoolId,
        status: FileUploadSessionStatus.VERIFYING,
      },
      data: {
        failureReason: 'finalization_cleanup_pending',
        finalCleanupEligibleAt: input.now,
      },
    });
  }

  private async updateLegacyFile(
    tx: Prisma.TransactionClient,
    session: FileUploadSession,
    input: LearningMediaFinalizeInput,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "files"
      WHERE "id" = ${session.fileId}::uuid
        AND "school_id" = ${session.schoolId}::uuid
        AND "organization_id" = ${session.organizationId}::uuid
        AND "bucket" = ${session.finalBucket}
        AND "object_key" = ${session.finalObjectKey}
        AND "deleted_at" IS NULL
      LIMIT 1
      FOR UPDATE
    `);
    if (!rows[0]) throw new Error('learning_media_legacy_file_unavailable');
    return tx.file.update({
      where: { id: rows[0].id },
      data: {
        mimeType: input.verifiedMimeType,
        sizeBytes: input.actualSizeBytes,
        checksumSha256: input.checksumSha256,
      },
    });
  }

  private async cancel(
    tx: Prisma.TransactionClient,
    input: LearningMediaAuditContext & { uploadId: string; now: Date },
  ) {
    const session = await this.lockOwnedSession(tx, input);
    if (
      !session ||
      (session.status !== FileUploadSessionStatus.CREATED &&
        session.status !== FileUploadSessionStatus.UPLOADING)
    ) {
      return null;
    }
    const cancelled = await tx.fileUploadSession.update({
      where: { id: session.id },
      data: {
        status: FileUploadSessionStatus.CANCELLED,
        cancelledAt: input.now,
        stagingCleanupEligibleAt: maximumDate(
          input.now,
          session.latestUploadUrlExpiresAt,
        ),
      },
    });
    await this.writeAudit(
      tx,
      input,
      'learning.media.upload.cancel',
      session.id,
      session.status,
      cancelled.status,
    );
    return cancelled;
  }

  private async updateStatus(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      uploadId: string;
      from: FileUploadSessionStatus;
      to: FileUploadSessionStatus;
    },
  ): Promise<boolean> {
    const result = await tx.fileUploadSession.updateMany({
      where: {
        id: input.uploadId,
        schoolId: input.schoolId,
        status: input.from,
      },
      data: { status: input.to },
    });
    return result.count === 1;
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    input: {
      actorId: string | null;
      userType: UserType | null;
      organizationId: string;
      schoolId: string;
    },
    action: string,
    resourceId: string,
    beforeStatus: FileUploadSessionStatus | null,
    afterStatus: FileUploadSessionStatus,
    safeAfter?: Record<string, unknown>,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        userType: input.userType,
        organizationId: input.organizationId,
        schoolId: input.schoolId,
        module: 'files',
        action,
        resourceType: 'file_upload_session',
        resourceId,
        outcome: AuditOutcome.SUCCESS,
        before: beforeStatus ? { status: beforeStatus } : undefined,
        after: { status: afterStatus, ...(safeAfter ?? {}) },
      },
    });
  }

  private async writeFailureAudit(
    tx: Prisma.TransactionClient,
    session: FileUploadSession,
    actor: LearningMediaAuditContext,
    reasonCode: string,
    action = 'learning.media.upload.verification_failed',
    beforeStatus: FileUploadSessionStatus = FileUploadSessionStatus.VERIFYING,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: actor.actorId,
        userType: actor.userType,
        organizationId: session.organizationId,
        schoolId: session.schoolId,
        module: 'files',
        action,
        resourceType: 'file_upload_session',
        resourceId: session.id,
        outcome: AuditOutcome.FAILURE,
        before: { status: beforeStatus },
        after: { status: FileUploadSessionStatus.FAILED, reasonCode },
      },
    });
  }
}

function maximumDate(first: Date, second: Date | null): Date;
function maximumDate(first: Date | null, second: Date): Date;
function maximumDate(first: Date | null, second: Date | null): Date {
  if (first === null && second === null) {
    throw new Error('learning_media_date_required');
  }
  if (first === null) return second!;
  if (second === null) return first;
  return first >= second ? first : second;
}
