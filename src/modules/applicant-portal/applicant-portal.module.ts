import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import { ApplicantPortalAccessService } from './application/applicant-portal-access.service';
import { CreateApplicantAccountUseCase } from './application/create-applicant-account.use-case';
import { CreateApplicantRequestUseCase } from './application/create-applicant-request.use-case';
import { GetDiscoverableSchoolUseCase } from './application/get-discoverable-school.use-case';
import { GetApplicantRequestUseCase } from './application/get-applicant-request.use-case';
import { GetApplicantProfileUseCase } from './application/get-applicant-profile.use-case';
import { ListAdmissionRequiredDocumentsUseCase } from './application/list-admission-required-documents.use-case';
import { ListApplicantRequestsUseCase } from './application/list-applicant-requests.use-case';
import { ListDiscoverableSchoolsUseCase } from './application/list-discoverable-schools.use-case';
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
    ListDiscoverableSchoolsUseCase,
    GetDiscoverableSchoolUseCase,
    ListAdmissionRequiredDocumentsUseCase,
    CreateApplicantRequestUseCase,
    ListApplicantRequestsUseCase,
    GetApplicantRequestUseCase,
  ],
})
export class ApplicantPortalModule {}
