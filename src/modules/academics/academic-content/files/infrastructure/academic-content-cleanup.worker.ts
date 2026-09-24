import { Injectable, OnModuleInit } from '@nestjs/common';
import { FileUploadPurpose, FileUploadSessionStatus } from '@prisma/client';
import { BullmqService } from '../../../../../infrastructure/queue/bullmq.service';
import { StorageService } from '../../../../../infrastructure/storage/storage.service';
import {
  ACADEMIC_CONTENT_CLEANUP_QUEUE,
  ACADEMIC_CONTENT_DISCOVERY_JOB,
  ACADEMIC_CONTENT_OBJECT_CLEANUP_JOB,
  ACADEMIC_CONTENT_STALE_CLAIM_MS,
} from '../domain/academic-content-file.constants';
import { AcademicContentFileRepository } from './academic-content-file.repository';

@Injectable()
export class AcademicContentCleanupWorker implements OnModuleInit {
  constructor(
    private readonly queue: BullmqService,
    private readonly repository: AcademicContentFileRepository,
    private readonly storage: StorageService,
  ) {}

  onModuleInit(): void {
    this.queue.createWorker<{ uploadId?: string }>(
      ACADEMIC_CONTENT_CLEANUP_QUEUE,
      async (job) => {
        if (job.name === ACADEMIC_CONTENT_DISCOVERY_JOB)
          return this.discoverAndEnqueue();
        if (job.name === ACADEMIC_CONTENT_OBJECT_CLEANUP_JOB) {
          const uploadId = job.data?.uploadId;
          if (
            typeof uploadId !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
              uploadId,
            )
          )
            throw new Error('academic_content_cleanup_job_invalid');
          return this.cleanUpload(uploadId);
        }
        throw new Error('academic_content_cleanup_job_unknown');
      },
    );
  }

  async discoverAndEnqueue(now = new Date()): Promise<number> {
    await this.repository.expireAbandoned(now);
    const staleBefore = new Date(
      now.getTime() - ACADEMIC_CONTENT_STALE_CLAIM_MS,
    );
    await this.repository.recoverStaleVerification(staleBefore);
    const candidates = await this.repository.cleanupCandidates(
      now,
      staleBefore,
    );
    let enqueued = 0;
    for (const candidate of candidates) {
      const result = await this.queue.ensureJobFromPersistedTruth(
        ACADEMIC_CONTENT_CLEANUP_QUEUE,
        ACADEMIC_CONTENT_OBJECT_CLEANUP_JOB,
        { uploadId: candidate.id },
        {
          jobId: `academic-content-cleanup-${candidate.id}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: false,
          removeOnFail: false,
        },
      );
      if (result === 'created' || result === 'replaced') enqueued++;
    }
    return enqueued;
  }

  async cleanUpload(uploadId: string, now = new Date()): Promise<void> {
    const staleBefore = new Date(
      now.getTime() - ACADEMIC_CONTENT_STALE_CLAIM_MS,
    );
    const claim = await this.repository.prisma.$transaction(async (tx) => {
      const session = await this.repository.lockById(tx, uploadId);
      if (
        !session ||
        !new Set<string>([
          FileUploadSessionStatus.FAILED,
          FileUploadSessionStatus.CANCELLED,
          FileUploadSessionStatus.EXPIRED,
        ]).has(session.status) ||
        !session.finalCleanupEligibleAt ||
        session.finalCleanupEligibleAt > now ||
        session.finalObjectDeletedAt ||
        (session.finalCleanupClaimedAt &&
          session.finalCleanupClaimedAt >= staleBefore)
      )
        return null;
      await tx.fileUploadSession.update({
        where: { id: session.id },
        data: { finalCleanupClaimedAt: now },
      });
      return { bucket: session.finalBucket, objectKey: session.finalObjectKey };
    });
    if (!claim) {
      await this.cleanReadyOrphan(uploadId, now);
      return;
    }
    try {
      await this.storage.deleteObjectAndConfirmAbsent({
        bucket: claim.bucket,
        objectKey: claim.objectKey,
      });
    } catch (error) {
      await this.repository.prisma.fileUploadSession.updateMany({
        where: {
          id: uploadId,
          purpose: FileUploadPurpose.ACADEMIC_CONTENT,
          finalCleanupClaimedAt: now,
          finalObjectDeletedAt: null,
        },
        data: { finalCleanupClaimedAt: null },
      });
      throw error;
    }
    await this.repository.prisma.$transaction(async (tx) => {
      const session = await this.repository.lockById(tx, uploadId);
      if (
        !session ||
        !session.finalCleanupClaimedAt ||
        session.finalCleanupClaimedAt.getTime() !== now.getTime() ||
        session.finalObjectDeletedAt
      )
        return;
      if (
        new Set<string>([
          FileUploadSessionStatus.FAILED,
          FileUploadSessionStatus.CANCELLED,
          FileUploadSessionStatus.EXPIRED,
        ]).has(session.status)
      ) {
        await tx.fileUploadSession.update({
          where: { id: uploadId },
          data: { finalObjectDeletedAt: new Date() },
        });
      }
    });
  }

  private async cleanReadyOrphan(uploadId: string, now: Date): Promise<void> {
    // The ACC DB contract forbids a persisted claim while status is READY. Keep
    // the row lock across deletion, then record claim and deletion atomically
    // with the READY -> PURGED transition. A failed transaction is retryable.
    await this.repository.prisma.$transaction(
      async (tx) => {
        const session = await this.repository.lockById(tx, uploadId);
        if (
          !session ||
          session.status !== FileUploadSessionStatus.READY ||
          !session.fileId ||
          !session.finalCleanupEligibleAt ||
          session.finalCleanupEligibleAt > now
        )
          return;
        const fileRows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM files WHERE id = ${session.fileId}::uuid AND school_id = ${session.schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
        if (fileRows.length === 0) return;
        const active = await tx.academicContentAsset.count({
          where: {
            schoolId: session.schoolId,
            fileId: session.fileId,
            deletedAt: null,
          },
        });
        if (active > 0) return;
        await this.storage.deleteObjectAndConfirmAbsent({
          bucket: session.finalBucket,
          objectKey: session.finalObjectKey,
        });
        const stillActive = await tx.academicContentAsset.count({
          where: {
            schoolId: session.schoolId,
            fileId: session.fileId,
            deletedAt: null,
          },
        });
        if (stillActive > 0)
          throw new Error('academic_content_cleanup_asset_race');
        await tx.file.updateMany({
          where: {
            id: session.fileId,
            schoolId: session.schoolId,
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });
        await tx.fileUploadSession.update({
          where: { id: uploadId },
          data: {
            status: FileUploadSessionStatus.PURGED,
            finalCleanupClaimedAt: now,
            finalObjectDeletedAt: new Date(),
          },
        });
      },
      { maxWait: 10000, timeout: 120000 },
    );
  }
}
