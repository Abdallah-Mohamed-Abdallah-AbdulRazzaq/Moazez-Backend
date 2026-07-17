import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import {
  BRANDING_LOGO_CLEANUP_JOB,
  BRANDING_LOGO_CLEANUP_QUEUE,
  BRANDING_LOGO_RECONCILE_INTERVAL_MS,
  BRANDING_LOGO_RECONCILE_JOB,
  BRANDING_LOGO_MAX_SIZE_BYTES,
  brandingLogoObjectPrefix,
  isBrandingLogoMimeType,
} from '../domain/branding-logo.constants';
import { isStorageObjectNotFound } from '../domain/branding-logo.errors';
import { ManagedBrandingLogoFile } from '../domain/branding-logo.types';

@Injectable()
export class BrandingLogoCleanupQueueService implements OnModuleInit {
  private readonly logger = new Logger(BrandingLogoCleanupQueueService.name);

  constructor(
    private readonly bullmqService: BullmqService,
    private readonly storageService: StorageService,
  ) {}

  onModuleInit(): void {
    void this.schedulePeriodicReconciliation().catch(() => {
      this.logger.error({ event: 'branding.logo.cleanup.enqueue_failed' });
    });
  }

  async cleanupAfterCommit(
    file: ManagedBrandingLogoFile | null,
  ): Promise<void> {
    if (!file || !this.isCleanupEligible(file)) return;
    try {
      await this.storageService.deleteObject({
        bucket: file.bucket,
        objectKey: file.objectKey,
      });
    } catch (error: unknown) {
      if (isStorageObjectNotFound(error)) return;
      this.logger.warn({ event: 'branding.logo.cleanup.retry_scheduled' });
      try {
        await this.enqueueCleanup(file.id);
      } catch {
        this.logger.error({ event: 'branding.logo.cleanup.enqueue_failed' });
      }
    }
  }

  enqueueCleanup(fileId: string) {
    return this.bullmqService.addJob(
      BRANDING_LOGO_CLEANUP_QUEUE,
      BRANDING_LOGO_CLEANUP_JOB,
      { fileId },
      {
        jobId: `branding-logo-cleanup-${randomUUID()}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    );
  }

  getReadiness() {
    return this.bullmqService.getQueueReadiness(BRANDING_LOGO_CLEANUP_QUEUE);
  }

  private schedulePeriodicReconciliation() {
    return this.bullmqService.addJob(
      BRANDING_LOGO_CLEANUP_QUEUE,
      BRANDING_LOGO_RECONCILE_JOB,
      { requestedAt: new Date().toISOString() },
      {
        jobId: BRANDING_LOGO_RECONCILE_JOB,
        repeat: { every: BRANDING_LOGO_RECONCILE_INTERVAL_MS },
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    );
  }

  private isCleanupEligible(file: ManagedBrandingLogoFile): boolean {
    if (
      !file.schoolId ||
      !file.organizationId ||
      file.deletedAt === null ||
      file.visibility !== FileVisibility.PRIVATE ||
      !isBrandingLogoMimeType(file.mimeType) ||
      file.sizeBytes <= 0n ||
      file.sizeBytes > BigInt(BRANDING_LOGO_MAX_SIZE_BYTES) ||
      !file.objectKey.startsWith(brandingLogoObjectPrefix(file.schoolId))
    ) {
      return false;
    }

    return (
      file.bucket === this.storageService.resolveBucket(FileVisibility.PRIVATE)
    );
  }
}
