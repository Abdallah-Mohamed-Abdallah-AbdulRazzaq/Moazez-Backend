import { AdmissionApplicationStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../applications-scope';
import {
  ApplicationResponseDto,
  CreateApplicationDto,
} from '../dto/application.dto';
import {
  mapApplicationSourceFromApi,
} from '../domain/application.enums';
import { normalizeRequiredApplicationText } from '../domain/application-inputs';
import { ApplicationsRepository } from '../infrastructure/applications.repository';
import { presentApplication } from '../presenters/application.presenter';

@Injectable()
export class CreateApplicationUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
  ) {}

  async execute(
    command: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    const scope = requireApplicationsScope();

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

    const application = await this.applicationsRepository.createApplication({
      schoolId: scope.schoolId,
      organizationId: scope.organizationId,
      leadId: command.leadId ?? null,
      studentName: normalizeRequiredApplicationText(
        command.studentName,
        'studentName',
      ),
      requestedAcademicYearId: command.requestedAcademicYearId ?? null,
      requestedGradeId: command.requestedGradeId ?? null,
      source: mapApplicationSourceFromApi(command.source),
      status: AdmissionApplicationStatus.DOCUMENTS_PENDING,
      submittedAt: null,
    });

    return presentApplication(application);
  }
}
