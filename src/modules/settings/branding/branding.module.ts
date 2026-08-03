import { Module } from '@nestjs/common';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { AuthModule } from '../../iam/auth/auth.module';
import { BrandingLogoCleanupQueueService } from './application/branding-logo-cleanup-queue.service';
import { DeleteBrandingLogoUseCase } from './application/delete-branding-logo.use-case';
import { GetBrandingUseCase } from './application/get-branding.use-case';
import { GetPublicSchoolBrandingLogoUseCase } from './application/get-public-school-branding-logo.use-case';
import { ResolveSchoolLogoUrlService } from './application/resolve-school-logo-url.service';
import { UpdateBrandingUseCase } from './application/update-branding.use-case';
import { UploadBrandingLogoUseCase } from './application/upload-branding-logo.use-case';
import { BrandingController } from './controller/branding.controller';
import { PublicSchoolBrandingController } from './controller/public-school-branding.controller';
import { BrandingRepository } from './infrastructure/branding.repository';

@Module({
  imports: [AuthModule, QueueModule, StorageModule],
  controllers: [BrandingController, PublicSchoolBrandingController],
  providers: [
    BrandingRepository,
    ResolveSchoolLogoUrlService,
    GetBrandingUseCase,
    UpdateBrandingUseCase,
    UploadBrandingLogoUseCase,
    DeleteBrandingLogoUseCase,
    GetPublicSchoolBrandingLogoUseCase,
    BrandingLogoCleanupQueueService,
  ],
  exports: [ResolveSchoolLogoUrlService],
})
export class BrandingModule {}
