import { Module } from '@nestjs/common';
import { CreateApplicationUseCase } from './application/create-application.use-case';
import { EnrollApplicationHandoffUseCase } from './application/enroll-application-handoff.use-case';
import { GetApplicationUseCase } from './application/get-application.use-case';
import { ListApplicationsUseCase } from './application/list-applications.use-case';
import { SubmitApplicationUseCase } from './application/submit-application.use-case';
import { UpdateApplicationUseCase } from './application/update-application.use-case';
import { ApplicationsController } from './controller/applications.controller';
import { ApplicationsRepository } from './infrastructure/applications.repository';
import { ApplicationEnrollmentHandoffValidator } from './validators/application-enrollment-handoff.validator';

@Module({
  controllers: [ApplicationsController],
  providers: [
    ApplicationsRepository,
    ApplicationEnrollmentHandoffValidator,
    ListApplicationsUseCase,
    CreateApplicationUseCase,
    GetApplicationUseCase,
    UpdateApplicationUseCase,
    SubmitApplicationUseCase,
    EnrollApplicationHandoffUseCase,
  ],
  exports: [ApplicationsRepository],
})
export class ApplicationsModule {}
