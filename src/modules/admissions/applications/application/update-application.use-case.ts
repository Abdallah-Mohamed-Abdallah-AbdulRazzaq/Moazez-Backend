import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../applications-scope';
import {
  ApplicationResponseDto,
  UpdateApplicationDto,
} from '../dto/application.dto';
import { mapApplicationSourceFromApi } from '../domain/application.enums';
import { normalizeRequiredApplicationText } from '../domain/application-inputs';
import { ApplicationsRepository } from '../infrastructure/applications.repository';
import { presentApplication } from '../presenters/application.presenter';

@Injectable()
export class UpdateApplicationUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
  ) {}

  async execute(
    applicationId: string,
    command: UpdateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    requireApplicationsScope();

    if (command.leadId) {
      const lead = await this.applicationsRepository.findLeadById(command.leadId);
      if (!lead) {
        throw new NotFoundDomainException('Lead not found', {
          leadId: command.leadId,
        });
      }
    }

    if (command.requestedAcademicYearId) {
      const academicYear =
        await this.applicationsRepository.findAcademicYearById(
          command.requestedAcademicYearId,
        );
      if (!academicYear) {
        throw new NotFoundDomainException('Academic year not found', {
          academicYearId: command.requestedAcademicYearId,
        });
      }
    }

    if (command.requestedGradeId) {
      const grade = await this.applicationsRepository.findGradeById(
        command.requestedGradeId,
      );
      if (!grade) {
        throw new NotFoundDomainException('Grade not found', {
          gradeId: command.requestedGradeId,
        });
      }
    }

    const application = await this.applicationsRepository.updateApplication(
      applicationId,
      {
        ...(command.leadId !== undefined ? { leadId: command.leadId } : {}),
        ...(command.studentName !== undefined
          ? {
              studentName: normalizeRequiredApplicationText(
                command.studentName,
                'studentName',
              ),
            }
          : {}),
        ...(command.requestedAcademicYearId !== undefined
          ? { requestedAcademicYearId: command.requestedAcademicYearId }
          : {}),
        ...(command.requestedGradeId !== undefined
          ? { requestedGradeId: command.requestedGradeId }
          : {}),
        ...(command.source !== undefined
          ? { source: mapApplicationSourceFromApi(command.source) }
          : {}),
      },
    );

    if (!application) {
      throw new NotFoundDomainException('Application not found', {
        applicationId,
      });
    }

    return presentApplication(application);
  }
}
