import { Injectable, Logger } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { isObjectStorageNotFoundError } from '../../../../infrastructure/storage/object-storage.errors';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import {
  BRANDING_LOGO_CLEANUP_JOB,
  BRANDING_LOGO_CLEANUP_QUEUE,
  BRANDING_LOGO_MAX_SIZE_BYTES,
  brandingLogoObjectPrefix,
  isBrandingLogoMimeType,
} from '../domain/branding-logo.constants';
import { ManagedBrandingLogoFile } from '../domain/branding-logo.types';

@Injectable()
export class BrandingLogoCleanupQueueService {
  private readonly logger = new Logger(BrandingLogoCleanupQueueService.name);

  constructor(
    private readonly bullmqService: BullmqService,
    private readonly storageService: StorageService,
  ) {}

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
      if (isObjectStorageNotFoundError(error)) return;
      this.logger.warn({ event: 'branding.logo.cleanup.retry_scheduled' });
      try {
        await this.enqueueCleanup(file.id);
      } catch {
        this.logger.error({ event: 'branding.logo.cleanup.enqueue_failed' });
      }
    }
  }

  enqueueCleanup(fileId: string) {
    return this.bullmqService.ensureJobFromPersistedTruth(
      BRANDING_LOGO_CLEANUP_QUEUE,
      BRANDING_LOGO_CLEANUP_JOB,
      { fileId },
      {
        jobId: `branding-logo-cleanup-${fileId}`,
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
