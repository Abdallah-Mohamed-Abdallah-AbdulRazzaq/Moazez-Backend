import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../applications-scope';
import { ApplicationResponseDto } from '../dto/application.dto';
import { ApplicationsRepository } from '../infrastructure/applications.repository';
import { presentApplication } from '../presenters/application.presenter';

@Injectable()
export class GetApplicationUseCase {
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

    return presentApplication(application);
  }
}
