import { SchoolProfile } from '@prisma/client';
import { BrandingResponseDto } from '../dto/branding-response.dto';

function toNumber(value: { toNumber(): number } | null | undefined): number | null {
  return value ? value.toNumber() : null;
}

export function presentBranding(
  profile: SchoolProfile | null,
  fallbackSchoolName: string | null,
): BrandingResponseDto {
  return {
    schoolName: profile?.schoolName ?? fallbackSchoolName,
    shortName: profile?.shortName ?? null,
    timezone: profile?.timezone ?? null,
    addressLine: profile?.addressLine ?? null,
    formattedAddress: profile?.formattedAddress ?? null,
    city: profile?.city ?? null,
    country: profile?.country ?? null,
    footerSignature: profile?.footerSignature ?? null,
    logoUrl: profile?.logoUrl ?? null,
    latitude: toNumber(profile?.latitude),
    longitude: toNumber(profile?.longitude),
    mapPlaceLabel: profile?.mapPlaceLabel ?? null,
  };
}
