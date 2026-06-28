import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { RegistrationModule } from '../../students/registration/registration.module';
import { CreateApplicationUseCase } from './application/create-application.use-case';
import { EnrollApplicationHandoffUseCase } from './application/enroll-application-handoff.use-case';
import { GetApplicationRegistrationHandoffUseCase } from './application/get-application-registration-handoff.use-case';
import { GetApplicationUseCase } from './application/get-application.use-case';
import { ListApplicationsUseCase } from './application/list-applications.use-case';
import { RegisterAcceptedApplicationUseCase } from './application/register-accepted-application.use-case';
import { SubmitApplicationUseCase } from './application/submit-application.use-case';
import { UpdateApplicationUseCase } from './application/update-application.use-case';
import { ApplicationsController } from './controller/applications.controller';
import { ApplicationsRepository } from './infrastructure/applications.repository';
import { ApplicationEnrollmentHandoffValidator } from './validators/application-enrollment-handoff.validator';

@Module({
  imports: [AuthModule, RegistrationModule],
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
    GetApplicationRegistrationHandoffUseCase,
    RegisterAcceptedApplicationUseCase,
  ],
  exports: [ApplicationsRepository],
})
export class ApplicationsModule {}
