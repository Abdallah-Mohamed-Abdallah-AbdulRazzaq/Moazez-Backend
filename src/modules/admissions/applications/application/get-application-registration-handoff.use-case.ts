import { Injectable } from '@nestjs/common';
import { InterviewStatus, PlacementTestStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../applications-scope';
import { ApplicationRegistrationHandoffResponseDto } from '../dto/application-registration-handoff.dto';
import { ApplicationsRepository } from '../infrastructure/applications.repository';
import {
  ApplicationRegistrationHandoffWorkflowSummary,
  presentApplicationRegistrationHandoff,
} from '../presenters/application-registration-handoff.presenter';
import { ApplicationEnrollmentHandoffValidator } from '../validators/application-enrollment-handoff.validator';

@Injectable()
export class GetApplicationRegistrationHandoffUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly applicationEnrollmentHandoffValidator: ApplicationEnrollmentHandoffValidator,
  ) {}

  async execute(
    applicationId: string,
  ): Promise<ApplicationRegistrationHandoffResponseDto> {
    requireApplicationsScope();

    const application =
      await this.applicationsRepository.findApplicationRegistrationHandoffById(
        applicationId,
      );
    if (!application) {
      throw new NotFoundDomainException('Application not found', {
        applicationId,
      });
    }

    await this.applicationEnrollmentHandoffValidator.ensureApplicationCanPrepareEnrollmentHandoff(
      application,
    );

    const [placementTests, interviews] = await Promise.all([
      this.countPlacementTests(application.id),
      this.countInterviews(application.id),
    ]);

    return presentApplicationRegistrationHandoff({
      application,
      placementTests,
      interviews,
    });
  }

  private async countPlacementTests(
    applicationId: string,
  ): Promise<ApplicationRegistrationHandoffWorkflowSummary> {
    const [total, completed] = await Promise.all([
      this.applicationsRepository.countPlacementTestsForApplication({
        applicationId,
      }),
      this.applicationsRepository.countPlacementTestsForApplication({
        applicationId,
        status: PlacementTestStatus.COMPLETED,
      }),
    ]);

    return { total, completed };
  }

  private async countInterviews(
    applicationId: string,
  ): Promise<ApplicationRegistrationHandoffWorkflowSummary> {
    const [total, completed] = await Promise.all([
      this.applicationsRepository.countInterviewsForApplication({
        applicationId,
      }),
      this.applicationsRepository.countInterviewsForApplication({
        applicationId,
        status: InterviewStatus.COMPLETED,
      }),
    ]);

    return { total, completed };
  }
}
