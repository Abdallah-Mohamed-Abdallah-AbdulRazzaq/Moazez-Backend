import { Injectable } from '@nestjs/common';
import { PlacementTestStatus } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../../applications/applications-scope';
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import {
  CreatePlacementTestDto,
  PlacementTestResponseDto,
} from '../dto/placement-test.dto';
import { PlacementTestsRepository } from '../infrastructure/placement-tests.repository';
import { presentPlacementTest } from '../presenters/placement-test.presenter';
import { PlacementTestScheduleValidator } from '../validators/placement-test-schedule.validator';

@Injectable()
export class CreatePlacementTestUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly placementTestsRepository: PlacementTestsRepository,
    private readonly placementTestScheduleValidator: PlacementTestScheduleValidator,
  ) {}

  async execute(
    command: CreatePlacementTestDto,
  ): Promise<PlacementTestResponseDto> {
    const scope = requireApplicationsScope();

    const application =
      await this.applicationsRepository.findApplicationById(command.applicationId);
    if (!application) {
      throw new NotFoundDomainException('Application not found', {
        applicationId: command.applicationId,
      });
    }

    const normalizedType = command.type.trim();
    if (normalizedType.length === 0) {
      throw new ValidationDomainException('Placement test type is required', {
        field: 'type',
      });
    }

    if (command.subjectId) {
      const subject = await this.placementTestsRepository.findSubjectById(
        command.subjectId,
      );
      if (!subject) {
        throw new NotFoundDomainException('Subject not found', {
          subjectId: command.subjectId,
        });
      }
    }

    await this.placementTestScheduleValidator.ensureNoConflictingScheduledTest({
      applicationId: command.applicationId,
      type: normalizedType,
      subjectId: command.subjectId ?? null,
    });

    const placementTest = await this.placementTestsRepository.createPlacementTest({
      schoolId: scope.schoolId,
      applicationId: command.applicationId,
      subjectId: command.subjectId ?? null,
      type: normalizedType,
      scheduledAt: new Date(command.scheduledAt),
      score: null,
      result: null,
      status: PlacementTestStatus.SCHEDULED,
    });

    return presentPlacementTest(placementTest);
  }
}
