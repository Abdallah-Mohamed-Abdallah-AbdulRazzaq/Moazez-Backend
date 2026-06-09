import { Injectable } from '@nestjs/common';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { PlatformSchoolFeatureControlsResponseDto } from '../dto/platform-admin-feature-control.dto';
import { PlatformSchoolNotFoundException } from '../domain/platform-admin-errors';
import { PlatformAdminFeaturesRepository } from '../infrastructure/platform-admin-features.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformSchoolFeatureControls } from '../presenters/platform-admin-feature-control.presenter';

@Injectable()
@PlatformScope()
export class GetSchoolFeatureControlsUseCase {
  constructor(
    private readonly featuresRepository: PlatformAdminFeaturesRepository,
  ) {}

  async execute(
    schoolId: string,
  ): Promise<PlatformSchoolFeatureControlsResponseDto> {
    requirePlatformAdminScope();

    const school = await this.featuresRepository.findSchoolById(schoolId);
    if (!school) {
      throw new PlatformSchoolNotFoundException(schoolId);
    }

    const controls =
      await this.featuresRepository.listFeatureControlsBySchoolId(schoolId);

    return presentPlatformSchoolFeatureControls({ school, controls });
  }
}
