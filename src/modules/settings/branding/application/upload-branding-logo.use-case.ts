import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { requireSettingsScope } from '../../settings-context';
import {
  BRANDING_LOGO_MAX_SIZE_BYTES,
  brandingLogoExtension,
  brandingLogoObjectPrefix,
} from '../domain/branding-logo.constants';
import {
  BrandingLogoFileRequiredException,
  BrandingLogoInvalidStructureException,
  BrandingLogoMimeMismatchException,
  BrandingLogoMimeNotAllowedException,
  BrandingLogoSizeExceededException,
} from '../domain/branding-logo.errors';
import {
  detectBrandingLogoMimeType,
  detectBrandingLogoSignatureMimeType,
  normalizeBrandingLogoDeclaredMime,
} from '../domain/branding-logo-signature';
import {
  BrandingLogoActorScope,
  BrandingLogoMultipartFile,
} from '../domain/branding-logo.types';
import { BrandingResponseDto } from '../dto/branding-response.dto';
import { BrandingRepository } from '../infrastructure/branding.repository';
import { BrandingLogoCleanupQueueService } from './branding-logo-cleanup-queue.service';
import { GetBrandingUseCase } from './get-branding.use-case';

@Injectable()
export class UploadBrandingLogoUseCase {
  private readonly logger = new Logger(UploadBrandingLogoUseCase.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly brandingRepository: BrandingRepository,
    private readonly cleanupQueue: BrandingLogoCleanupQueueService,
    private readonly getBrandingUseCase: GetBrandingUseCase,
  ) {}

  async execute(
    file: BrandingLogoMultipartFile | undefined,
  ): Promise<BrandingResponseDto> {
    const scope = requireSettingsScope();
    let uploadedFile: BrandingLogoMultipartFile;
    try {
      uploadedFile = this.validate(file);
    } catch (error: unknown) {
      this.logger.warn({ event: 'branding.logo.upload.validation_failed' });
      await this.recordFailure(
        scope,
        'branding.logo.upload.validation_failed',
        'validation_failure',
      );
      throw error;
    }
    const mimeType = detectBrandingLogoMimeType(uploadedFile.buffer)!;
    const objectKey = `${brandingLogoObjectPrefix(scope.schoolId)}${randomUUID()}.${brandingLogoExtension(mimeType)}`;
    let stored: { bucket: string; etag: string };
    try {
      stored = await this.storageService.saveObject({
        objectKey,
        body: uploadedFile.buffer,
        visibility: FileVisibility.PRIVATE,
        contentType: mimeType,
      });
    } catch (error: unknown) {
      this.logger.error({ event: 'branding.logo.upload.storage_write_failed' });
      await this.recordFailure(
        scope,
        'branding.logo.upload.storage_write_failed',
        'storage_write_failure',
      );
      throw error;
    }

    let replaced;
    try {
      replaced = await this.brandingRepository.replaceManagedLogo({
        scope,
        expectedPrivateBucket: this.storageService.resolveBucket(
          FileVisibility.PRIVATE,
        ),
        file: {
          bucket: stored.bucket,
          objectKey,
          originalName: this.normalizeOriginalName(uploadedFile.originalname),
          mimeType,
          sizeBytes: BigInt(uploadedFile.buffer.byteLength),
          checksumSha256: createHash('sha256')
            .update(uploadedFile.buffer)
            .digest('hex'),
        },
      });
    } catch (error: unknown) {
      this.logger.error({ event: 'branding.logo.upload.transaction_failed' });
      await this.recordFailure(
        scope,
        'branding.logo.upload.transaction_failed',
        'database_transaction_failure',
      );
      try {
        await this.storageService.deleteObject({
          bucket: stored.bucket,
          objectKey,
        });
      } catch {
        this.logger.error({
          event: 'branding.logo.upload.compensation_failed',
        });
        await this.recordFailure(
          scope,
          'branding.logo.upload.compensation_failed',
          'compensation_failure',
        );
      }
      throw error;
    }

    if (replaced.previousFile) {
      await this.cleanupQueue.cleanupAfterCommit(replaced.previousFile);
    }
    return this.getBrandingUseCase.execute();
  }

  private validate(
    file: BrandingLogoMultipartFile | undefined,
  ): BrandingLogoMultipartFile {
    if (
      !file ||
      !Buffer.isBuffer(file.buffer) ||
      file.buffer.byteLength === 0
    ) {
      throw new BrandingLogoFileRequiredException();
    }
    if (file.buffer.byteLength > BRANDING_LOGO_MAX_SIZE_BYTES) {
      throw new BrandingLogoSizeExceededException(BRANDING_LOGO_MAX_SIZE_BYTES);
    }

    const declared = normalizeBrandingLogoDeclaredMime(file.mimetype);
    if (!declared) throw new BrandingLogoMimeNotAllowedException();
    const signature = detectBrandingLogoSignatureMimeType(file.buffer);
    if (signature && signature !== declared) {
      throw new BrandingLogoMimeMismatchException();
    }
    const detected = detectBrandingLogoMimeType(file.buffer);
    if (!detected) throw new BrandingLogoInvalidStructureException();
    if (detected !== declared) throw new BrandingLogoMimeMismatchException();
    return file;
  }

  private normalizeOriginalName(value: string): string {
    const baseName = value.replace(/\\/g, '/').split('/').pop() ?? 'logo';
    const sanitized = baseName.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return (sanitized || 'logo').slice(0, 255);
  }

  private recordFailure(
    scope: BrandingLogoActorScope,
    action: string,
    failureKind: string,
  ): Promise<void> {
    return this.brandingRepository.recordLogoFailure({
      scope,
      action,
      failureKind,
    });
  }
}
