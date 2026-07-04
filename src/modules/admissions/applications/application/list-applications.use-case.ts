import { Injectable } from '@nestjs/common';
import { requireApplicationsScope } from '../applications-scope';
import { ApplicationResponseDto, ListApplicationsQueryDto } from '../dto/application.dto';
import { mapApplicationStatusFromApi } from '../domain/application.enums';
import { ApplicationsRepository } from '../infrastructure/applications.repository';
import { presentApplication } from '../presenters/application.presenter';
import { ResolveAdmissionWorkflowPolicyService } from '../../workflow-policy/application/resolve-admission-workflow-policy.service';

@Injectable()
export class ListApplicationsUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly resolveAdmissionWorkflowPolicyService: ResolveAdmissionWorkflowPolicyService,
  ) {}

  async execute(
    query: ListApplicationsQueryDto,
  ): Promise<ApplicationResponseDto[]> {
    requireApplicationsScope();

    const [applications, workflowPolicy] = await Promise.all([
      this.applicationsRepository.listApplications({
        status: query.status
          ? mapApplicationStatusFromApi(query.status)
          : undefined,
      }),
      this.resolveAdmissionWorkflowPolicyService.resolveForCurrentSchool(),
    ]);

    return applications.map((application) =>
      presentApplication(application, workflowPolicy),
    );
  }
}
