import { Injectable } from '@nestjs/common';
import { requireSettingsScope } from '../../settings-context';
import { BrandingResponseDto } from '../dto/branding-response.dto';
import { BrandingRepository } from '../infrastructure/branding.repository';
import { presentBranding } from '../presenters/branding.presenter';
import { ResolveSchoolLogoUrlService } from './resolve-school-logo-url.service';

@Injectable()
export class GetBrandingUseCase {
  constructor(
    private readonly brandingRepository: BrandingRepository,
    private readonly logoResolver: ResolveSchoolLogoUrlService,
  ) {}

  async execute(): Promise<BrandingResponseDto> {
    const scope = requireSettingsScope();
    const [profile, schoolName, logoUrl] = await Promise.all([
      this.brandingRepository.findBySchoolId(scope.schoolId),
      this.brandingRepository.findSchoolName(scope.schoolId),
      this.logoResolver.resolveForSchool(scope.schoolId),
    ]);

    return presentBranding(profile, schoolName, logoUrl);
  }
}
