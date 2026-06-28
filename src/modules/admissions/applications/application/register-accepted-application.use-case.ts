import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { CreateSchoolRegistrationUseCase } from '../../../students/registration/application/create-school-registration.use-case';
import { requireApplicationsScope } from '../applications-scope';
import {
  RegisterAcceptedApplicationDto,
  ApplicationRegistrationSubmitResponseDto,
} from '../dto/application-registration-submit.dto';
import {
  ApplicationRegistrationHandoffRecord,
  ApplicationsRepository,
} from '../infrastructure/applications.repository';
import {
  presentAcceptedApplicationRegistrationSubmit,
  presentAlreadyRegisteredApplicationRegistration,
} from '../presenters/application-registration-submit.presenter';
import { ApplicationEnrollmentHandoffValidator } from '../validators/application-enrollment-handoff.validator';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

@Injectable()
export class RegisterAcceptedApplicationUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly applicationEnrollmentHandoffValidator: ApplicationEnrollmentHandoffValidator,
    private readonly createSchoolRegistrationUseCase: CreateSchoolRegistrationUseCase,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    applicationId: string,
    command: RegisterAcceptedApplicationDto,
  ): Promise<ApplicationRegistrationSubmitResponseDto> {
    const scope = requireApplicationsScope();
    const application = await this.loadApplication(applicationId);

    await this.applicationEnrollmentHandoffValidator.ensureApplicationCanPrepareEnrollmentHandoff(
      application,
    );

    if (application.student) {
      return presentAlreadyRegisteredApplicationRegistration(application);
    }

    try {
      const registration = await this.createSchoolRegistrationUseCase.execute(
        command,
        {
          source: 'admissions_application',
          sourceApplicationId: application.id,
        },
      );

      await this.authRepository.createAuditLog({
        actorId: scope.actorId,
        userType: scope.userType,
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        module: 'admissions',
        action: 'admissions.application.register',
        resourceType: 'application',
        resourceId: application.id,
        outcome: AuditOutcome.SUCCESS,
        after: {
          applicationId: application.id,
          studentId: registration.student.id,
          enrollmentId: registration.enrollment.enrollmentId,
          guardianCount: registration.guardians.length,
          createdVia: 'admissions_application_register',
        },
      });

      return presentAcceptedApplicationRegistrationSubmit({
        applicationId: application.id,
        registration,
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const alreadyRegistered = await this.loadApplication(applicationId);
      if (alreadyRegistered.student) {
        return presentAlreadyRegisteredApplicationRegistration(alreadyRegistered);
      }

      throw error;
    }
  }

  private async loadApplication(
    applicationId: string,
  ): Promise<ApplicationRegistrationHandoffRecord> {
    const application =
      await this.applicationsRepository.findApplicationRegistrationHandoffById(
        applicationId,
      );

    if (!application) {
      throw new NotFoundDomainException('Application not found', {
        applicationId,
      });
    }

    return application;
  }
}
