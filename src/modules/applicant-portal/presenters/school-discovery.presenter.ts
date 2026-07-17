import {
  DiscoverableSchoolResponseDto,
  DiscoverableSchoolsListResponseDto,
} from '../dto/school-discovery.dto';
import { DiscoverableSchoolRecord } from '../infrastructure/applicant-portal.repository';

export function presentDiscoverableSchool(
  school: DiscoverableSchoolRecord,
  logoUrl: string | null = null,
): DiscoverableSchoolResponseDto {
  const profile = school.schoolProfile;

  return {
    id: school.id,
    name: firstPublicText(profile?.schoolName, school.name) ?? school.name,
    shortName: publicText(profile?.shortName),
    city: publicText(profile?.city),
    country: publicText(profile?.country),
    address: firstPublicText(profile?.formattedAddress, profile?.addressLine),
    logoUrl,
  };
}

export function presentDiscoverableSchoolsList(input: {
  items: DiscoverableSchoolRecord[];
  page: number;
  limit: number;
  total: number;
  logoUrlsBySchoolId?: Map<string, string | null>;
}): DiscoverableSchoolsListResponseDto {
  const totalPages =
    input.total === 0 ? 0 : Math.ceil(input.total / input.limit);

  return {
    data: input.items.map((school) =>
      presentDiscoverableSchool(
        school,
        input.logoUrlsBySchoolId?.get(school.id) ?? null,
      ),
    ),
    meta: {
      page: input.page,
      limit: input.limit,
      total: input.total,
      totalPages,
      hasNextPage: input.page < totalPages,
    },
  };
}

function firstPublicText(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const normalized = publicText(value);
    if (normalized) return normalized;
  }

  return null;
}

function publicText(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length > 0 ? normalized : null;
}
