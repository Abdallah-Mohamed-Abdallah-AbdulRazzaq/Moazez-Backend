import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../../applications/applications-scope';
import { PlacementTestResponseDto } from '../dto/placement-test.dto';
import { PlacementTestsRepository } from '../infrastructure/placement-tests.repository';
import { presentPlacementTest } from '../presenters/placement-test.presenter';

@Injectable()
export class GetPlacementTestUseCase {
  constructor(
    private readonly placementTestsRepository: PlacementTestsRepository,
  ) {}

  async execute(placementTestId: string): Promise<PlacementTestResponseDto> {
    requireApplicationsScope();

    const placementTest =
      await this.placementTestsRepository.findPlacementTestById(placementTestId);
    if (!placementTest) {
      throw new NotFoundDomainException('Placement test not found', {
        placementTestId,
      });
    }

    return presentPlacementTest(placementTest);
  }
}
