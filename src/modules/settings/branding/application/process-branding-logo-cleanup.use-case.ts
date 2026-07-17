import { Injectable, Logger } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import {
  BRANDING_LOGO_MAX_SIZE_BYTES,
  BRANDING_LOGO_ORPHAN_GRACE_MS,
  BRANDING_LOGO_RECONCILIATION_BATCH_SIZE,
  brandingLogoObjectPrefix,
  isBrandingLogoMimeType,
} from '../domain/branding-logo.constants';
import { isStorageObjectNotFound } from '../domain/branding-logo.errors';
import {
  BrandingLogoCleanupCursor,
  CleanupBrandingLogoFile,
} from '../domain/branding-logo.types';
import { BrandingRepository } from '../infrastructure/branding.repository';
import { BrandingLogoCleanupQueueService } from './branding-logo-cleanup-queue.service';

const BRANDING_OBJECT_KEY =
  /^schools\/[0-9a-f-]{36}\/branding\/logos\/[0-9a-f-]{36}\.(?:png|jpg)$/i;

@Injectable()
export class ProcessBrandingLogoCleanupUseCase {
  private readonly logger = new Logger(ProcessBrandingLogoCleanupUseCase.name);

  constructor(
    private readonly brandingRepository: BrandingRepository,
    private readonly storageService: StorageService,
    private readonly cleanupQueue: BrandingLogoCleanupQueueService,
  ) {}

  async cleanup(fileId: string): Promise<void> {
    const file = await this.brandingRepository.findCleanupFile(fileId);
    if (!file || !this.isCleanupEligible(file)) return;

    try {
      await this.storageService.deleteObject({
        bucket: file.bucket,
        objectKey: file.objectKey,
      });
    } catch (error: unknown) {
      if (isStorageObjectNotFound(error)) return;
      throw error;
    }
  }

  async reconcile(): Promise<void> {
    let scheduled = 0;
    let missingObjects = 0;
    let cursor: BrandingLogoCleanupCursor | null = null;
    let filePages = 0;
    let enqueueFailures = 0;

    do {
      const softDeletedFiles =
        await this.brandingRepository.findSoftDeletedBrandingFiles(
          BRANDING_LOGO_RECONCILIATION_BATCH_SIZE,
          cursor,
        );
      filePages += 1;
      for (const file of softDeletedFiles) {
        if (!this.isCleanupEligible(file)) continue;
        try {
          await this.storageService.statObject({
            bucket: file.bucket,
            objectKey: file.objectKey,
          });
        } catch (error: unknown) {
          if (isStorageObjectNotFound(error)) {
            missingObjects += 1;
            continue;
          }
          throw error;
        }
        try {
          await this.cleanupQueue.enqueueCleanup(file.id);
          scheduled += 1;
        } catch {
          enqueueFailures += 1;
          this.logger.error({ event: 'branding.logo.cleanup.enqueue_failed' });
        }
      }

      const lastFile = softDeletedFiles[softDeletedFiles.length - 1];
      cursor =
        softDeletedFiles.length === BRANDING_LOGO_RECONCILIATION_BATCH_SIZE &&
        lastFile?.deletedAt
          ? { deletedAt: lastFile.deletedAt, id: lastFile.id }
          : null;
    } while (cursor);

    if (scheduled > 0) {
      this.logger.log({ event: 'branding.logo.cleanup.retry_scheduled' });
    }

    const privateBucket = this.storageService.resolveBucket(
      FileVisibility.PRIVATE,
    );
    let objectStartAfter: string | undefined;
    let objectPages = 0;
    let scannedObjects = 0;
    let removedOrphans = 0;
    do {
      const page = await this.storageService.listObjectsPage({
        bucket: privateBucket,
        prefix: 'schools/',
        startAfter: objectStartAfter,
        limit: BRANDING_LOGO_RECONCILIATION_BATCH_SIZE,
      });
      objectPages += 1;
      const brandingObjects = page.objects.filter((object) =>
        BRANDING_OBJECT_KEY.test(object.objectKey),
      );
      scannedObjects += page.objects.length;
      const known = await this.brandingRepository.findKnownStorageLocations(
        privateBucket,
        brandingObjects.map((object) => object.objectKey),
      );
      const orphanCutoff = Date.now() - BRANDING_LOGO_ORPHAN_GRACE_MS;

      for (const object of brandingObjects) {
        if (
          known.has(object.objectKey) ||
          object.lastModified.getTime() > orphanCutoff
        ) {
          continue;
        }
        try {
          await this.storageService.deleteObject({
            bucket: privateBucket,
            objectKey: object.objectKey,
          });
          removedOrphans += 1;
        } catch (error: unknown) {
          if (!isStorageObjectNotFound(error)) throw error;
        }
      }

      objectStartAfter = page.nextStartAfter ?? undefined;
    } while (objectStartAfter);

    this.logger.log({
      event: 'branding.logo.cleanup.reconciled',
      scheduled,
      missingObjects,
      removedOrphans,
      filePages,
      objectPages,
      scannedObjects,
      enqueueFailures,
    });

    if (enqueueFailures > 0) {
      throw new Error('branding_logo_cleanup_enqueue_failed');
    }
  }

  private isCleanupEligible(file: CleanupBrandingLogoFile): boolean {
    return (
      file.deletedAt !== null &&
      file.schoolId !== null &&
      file.organizationId !== null &&
      file.schoolOrganizationId === file.organizationId &&
      file.visibility === FileVisibility.PRIVATE &&
      file.bucket ===
        this.storageService.resolveBucket(FileVisibility.PRIVATE) &&
      file.objectKey.startsWith(brandingLogoObjectPrefix(file.schoolId)) &&
      isBrandingLogoMimeType(file.mimeType) &&
      file.sizeBytes > 0n &&
      file.sizeBytes <= BigInt(BRANDING_LOGO_MAX_SIZE_BYTES)
    );
  }
}
