import { Injectable } from '@nestjs/common';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { PlatformSchoolResponseDto } from '../dto/platform-admin-school.dto';
import { PlatformSchoolNotFoundException } from '../domain/platform-admin-errors';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformSchool } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class GetPlatformSchoolUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
  ) {}

  async execute(schoolId: string): Promise<PlatformSchoolResponseDto> {
    requirePlatformAdminScope();

    const school = await this.platformAdminRepository.findSchoolById(schoolId);
    if (!school) {
      throw new PlatformSchoolNotFoundException(schoolId);
    }

    return presentPlatformSchool(school);
  }
}
