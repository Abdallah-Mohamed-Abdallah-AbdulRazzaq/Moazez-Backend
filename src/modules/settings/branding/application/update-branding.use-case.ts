import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { BrandingResponseDto } from '../dto/branding-response.dto';
import { UpdateBrandingDto } from '../dto/update-branding.dto';
import { BrandingRepository } from '../infrastructure/branding.repository';
import { presentBranding } from '../presenters/branding.presenter';

@Injectable()
export class UpdateBrandingUseCase {
  constructor(
    private readonly brandingRepository: BrandingRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: UpdateBrandingDto): Promise<BrandingResponseDto> {
    const scope = requireSettingsScope();
    const updated = await this.brandingRepository.upsert(scope.schoolId, scope.actorId, {
      schoolId: scope.schoolId,
      schoolName: command.schoolName,
      shortName: command.shortName,
      timezone: command.timezone,
      addressLine: command.addressLine,
      formattedAddress: command.formattedAddress,
      city: command.city,
      country: command.country,
      footerSignature: command.footerSignature,
      logoUrl: command.logoUrl,
      latitude: command.latitude as Prisma.Decimal | number | undefined,
      longitude: command.longitude as Prisma.Decimal | number | undefined,
      mapPlaceLabel: command.mapPlaceLabel,
      updatedById: scope.actorId,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    });

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
        logoUrl: updated.logoUrl,
      },
    });

    return presentBranding(updated, null);
  }
}
