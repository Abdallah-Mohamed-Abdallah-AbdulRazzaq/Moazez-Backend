import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { GetBrandingUseCase } from './application/get-branding.use-case';
import { UpdateBrandingUseCase } from './application/update-branding.use-case';
import { BrandingController } from './controller/branding.controller';
import { BrandingRepository } from './infrastructure/branding.repository';

@Module({
  imports: [AuthModule],
  controllers: [BrandingController],
  providers: [BrandingRepository, GetBrandingUseCase, UpdateBrandingUseCase],
})
export class BrandingModule {}
