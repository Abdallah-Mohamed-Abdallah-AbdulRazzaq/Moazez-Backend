import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { BrandingResponseDto } from '../dto/branding-response.dto';
import { UpdateBrandingDto } from '../dto/update-branding.dto';
import { BrandingRepository } from '../infrastructure/branding.repository';
import { presentBranding } from '../presenters/branding.presenter';
import { ResolveSchoolLogoUrlService } from './resolve-school-logo-url.service';

@Injectable()
export class UpdateBrandingUseCase {
  constructor(
    private readonly brandingRepository: BrandingRepository,
    private readonly authRepository: AuthRepository,
    private readonly logoResolver: ResolveSchoolLogoUrlService,
  ) {}

  async execute(command: UpdateBrandingDto): Promise<BrandingResponseDto> {
    const scope = requireSettingsScope();
    const updated = await this.brandingRepository.upsert(
      scope.schoolId,
      scope.actorId,
      {
        schoolName: command.schoolName,
        shortName: command.shortName,
        timezone: command.timezone,
        addressLine: command.addressLine,
        formattedAddress: command.formattedAddress,
        city: command.city,
        country: command.country,
        footerSignature: command.footerSignature,
        latitude: command.latitude as Prisma.Decimal | number | undefined,
        longitude: command.longitude as Prisma.Decimal | number | undefined,
        mapPlaceLabel: command.mapPlaceLabel,
      },
    );

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'settings',
      action: 'branding.update',
      resourceType: 'school_profile',
      resourceId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        schoolName: updated.schoolName,
        timezone: updated.timezone,
      },
    });

    return presentBranding(
      updated,
      null,
      await this.logoResolver.resolveForSchool(scope.schoolId),
    );
  }
}
