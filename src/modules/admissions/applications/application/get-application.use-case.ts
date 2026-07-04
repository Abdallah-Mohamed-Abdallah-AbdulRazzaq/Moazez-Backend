import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../applications-scope';
import { ApplicationResponseDto } from '../dto/application.dto';
import { ApplicationsRepository } from '../infrastructure/applications.repository';
import { presentApplication } from '../presenters/application.presenter';
import { ResolveAdmissionWorkflowPolicyService } from '../../workflow-policy/application/resolve-admission-workflow-policy.service';

@Injectable()
export class GetApplicationUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly resolveAdmissionWorkflowPolicyService: ResolveAdmissionWorkflowPolicyService,
  ) {}

  async execute(applicationId: string): Promise<ApplicationResponseDto> {
    requireApplicationsScope();

    const [application, workflowPolicy] = await Promise.all([
      this.applicationsRepository.findApplicationById(applicationId),
      this.resolveAdmissionWorkflowPolicyService.resolveForCurrentSchool(),
    ]);
    if (!application) {
      throw new NotFoundDomainException('Application not found', {
        applicationId,
      });
    }

    return presentApplication(application, workflowPolicy);
  }
}
