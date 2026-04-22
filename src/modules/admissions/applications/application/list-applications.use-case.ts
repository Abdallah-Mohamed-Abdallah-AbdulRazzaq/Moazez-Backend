import { Injectable } from '@nestjs/common';
import { requireApplicationsScope } from '../applications-scope';
import { ApplicationResponseDto, ListApplicationsQueryDto } from '../dto/application.dto';
import { mapApplicationStatusFromApi } from '../domain/application.enums';
import { ApplicationsRepository } from '../infrastructure/applications.repository';
import { presentApplication } from '../presenters/application.presenter';

@Injectable()
export class ListApplicationsUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
  ) {}

  async execute(
    query: ListApplicationsQueryDto,
  ): Promise<ApplicationResponseDto[]> {
    requireApplicationsScope();

    const applications = await this.applicationsRepository.listApplications({
      status: query.status
        ? mapApplicationStatusFromApi(query.status)
        : undefined,
    });

    return applications.map((application) => presentApplication(application));
  }
}
