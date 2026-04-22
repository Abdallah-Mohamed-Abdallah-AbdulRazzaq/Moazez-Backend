import { AdmissionApplicationStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../applications-scope';
import { ApplicationResponseDto } from '../dto/application.dto';
import { ApplicationSubmitConflictException } from '../domain/application.exceptions';
import { ApplicationsRepository } from '../infrastructure/applications.repository';
import { presentApplication } from '../presenters/application.presenter';

@Injectable()
export class SubmitApplicationUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
  ) {}

  async execute(applicationId: string): Promise<ApplicationResponseDto> {
    requireApplicationsScope();

    const application =
      await this.applicationsRepository.findApplicationById(applicationId);
    if (!application) {
      throw new NotFoundDomainException('Application not found', {
        applicationId,
      });
    }

    if (
      application.status !== AdmissionApplicationStatus.DOCUMENTS_PENDING ||
      application.submittedAt !== null
    ) {
      throw new ApplicationSubmitConflictException({
        applicationId,
        status: application.status,
      });
    }

    const updated = await this.applicationsRepository.updateApplication(
      applicationId,
      {
        status: AdmissionApplicationStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    );

    if (!updated) {
      throw new NotFoundDomainException('Application not found', {
        applicationId,
      });
    }

    return presentApplication(updated);
  }
}
