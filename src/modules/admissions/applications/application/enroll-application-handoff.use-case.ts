import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../applications-scope';
import { ApplicationEnrollmentHandoffResponseDto } from '../dto/application.dto';
import { ApplicationsRepository } from '../infrastructure/applications.repository';
import { presentApplicationEnrollmentHandoff } from '../presenters/application.presenter';
import { ApplicationEnrollmentHandoffValidator } from '../validators/application-enrollment-handoff.validator';

@Injectable()
export class EnrollApplicationHandoffUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly applicationEnrollmentHandoffValidator: ApplicationEnrollmentHandoffValidator,
  ) {}

  async execute(
    applicationId: string,
  ): Promise<ApplicationEnrollmentHandoffResponseDto> {
    requireApplicationsScope();

    const application =
      await this.applicationsRepository.findApplicationEnrollmentHandoffById(
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

    return presentApplicationEnrollmentHandoff(application);
  }
}
