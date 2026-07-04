import { AdmissionApplicationStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../applications-scope';
import { ApplicationResponseDto } from '../dto/application.dto';
import { ApplicationSubmitConflictException } from '../domain/application.exceptions';
import { ApplicationsRepository } from '../infrastructure/applications.repository';
import { presentApplication } from '../presenters/application.presenter';
import { ResolveAdmissionWorkflowPolicyService } from '../../workflow-policy/application/resolve-admission-workflow-policy.service';

@Injectable()
export class SubmitApplicationUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly resolveAdmissionWorkflowPolicyService: ResolveAdmissionWorkflowPolicyService,
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

    const [updated, workflowPolicy] = await Promise.all([
      this.applicationsRepository.updateApplication(applicationId, {
        status: AdmissionApplicationStatus.SUBMITTED,
        submittedAt: new Date(),
      }),
      this.resolveAdmissionWorkflowPolicyService.resolveForCurrentSchool(),
    ]);

    if (!updated) {
      throw new NotFoundDomainException('Application not found', {
        applicationId,
      });
    }

    return presentApplication(updated, workflowPolicy);
  }
}
