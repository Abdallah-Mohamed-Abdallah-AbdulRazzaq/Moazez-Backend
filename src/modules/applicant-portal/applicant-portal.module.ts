import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import { ApplicantPortalAccessService } from './application/applicant-portal-access.service';
import { CreateApplicantAccountUseCase } from './application/create-applicant-account.use-case';
import { GetApplicantProfileUseCase } from './application/get-applicant-profile.use-case';
import { ApplicantPortalController } from './controller/applicant-portal.controller';
import { ApplicantPortalRepository } from './infrastructure/applicant-portal.repository';

@Module({
  imports: [AuthModule],
  controllers: [ApplicantPortalController],
  providers: [
    ApplicantPortalRepository,
    ApplicantPortalAccessService,
    CreateApplicantAccountUseCase,
    GetApplicantProfileUseCase,
  ],
})
export class ApplicantPortalModule {}
