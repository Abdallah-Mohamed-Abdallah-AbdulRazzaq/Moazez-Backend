import { Injectable } from '@nestjs/common';
import { requireSettingsScope } from '../../settings-context';
import { BrandingResponseDto } from '../dto/branding-response.dto';
import { BrandingRepository } from '../infrastructure/branding.repository';
import { presentBranding } from '../presenters/branding.presenter';

@Injectable()
export class GetBrandingUseCase {
  constructor(private readonly brandingRepository: BrandingRepository) {}

  async execute(): Promise<BrandingResponseDto> {
    const scope = requireSettingsScope();
    const [profile, schoolName] = await Promise.all([
      this.brandingRepository.findBySchoolId(scope.schoolId),
      this.brandingRepository.findSchoolName(scope.schoolId),
    ]);

    return presentBranding(profile, schoolName);
  }
}
