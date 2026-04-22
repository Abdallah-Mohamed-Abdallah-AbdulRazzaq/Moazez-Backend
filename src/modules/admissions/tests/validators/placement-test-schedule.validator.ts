import { Injectable } from '@nestjs/common';
import { PlacementTestsRepository } from '../infrastructure/placement-tests.repository';
import { PlacementTestAlreadyScheduledException } from '../domain/placement-test.exceptions';

@Injectable()
export class PlacementTestScheduleValidator {
  constructor(
    private readonly placementTestsRepository: PlacementTestsRepository,
  ) {}

  async ensureNoConflictingScheduledTest(params: {
    applicationId: string;
    type: string;
    subjectId?: string | null;
  }): Promise<void> {
    const existing =
      await this.placementTestsRepository.findConflictingScheduledTest(params);

    if (!existing) {
      return;
    }

    throw new PlacementTestAlreadyScheduledException({
      applicationId: params.applicationId,
      type: params.type,
      subjectId: params.subjectId ?? null,
      placementTestId: existing.id,
    });
  }
}
