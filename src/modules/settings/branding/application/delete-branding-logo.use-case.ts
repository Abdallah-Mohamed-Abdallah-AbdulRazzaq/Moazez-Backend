import { Injectable, Logger } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { requireSettingsScope } from '../../settings-context';
import { BrandingRepository } from '../infrastructure/branding.repository';
import { BrandingLogoCleanupQueueService } from './branding-logo-cleanup-queue.service';

@Injectable()
export class DeleteBrandingLogoUseCase {
  private readonly logger = new Logger(DeleteBrandingLogoUseCase.name);

  constructor(
    private readonly brandingRepository: BrandingRepository,
    private readonly cleanupQueue: BrandingLogoCleanupQueueService,
    private readonly storageService: StorageService,
  ) {}

  async execute(): Promise<void> {
    const scope = requireSettingsScope();
    let deleted;
    try {
      deleted = await this.brandingRepository.deleteManagedLogo(
        scope,
        this.storageService.resolveBucket(FileVisibility.PRIVATE),
      );
    } catch (error: unknown) {
      this.logger.error({ event: 'branding.logo.delete.transaction_failed' });
      await this.brandingRepository.recordLogoFailure({
        scope,
        action: 'branding.logo.delete.transaction_failed',
        failureKind: 'database_transaction_failure',
      });
      throw error;
    }
    if (deleted.previousFile) {
      await this.cleanupQueue.cleanupAfterCommit(deleted.previousFile);
    }
  }
}
