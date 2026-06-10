import { ApplicantAdmissionRequestStatus } from '@prisma/client';
import {
  ApplicantRequestCardResponseDto,
  ApplicantRequestDetailResponseDto,
  ApplicantRequestsListResponseDto,
} from '../dto/applicant-request.dto';
import { ApplicantAdmissionRequestRecord } from '../infrastructure/applicant-portal.repository';

export function presentApplicantRequestDetail(
  request: ApplicantAdmissionRequestRecord,
  missingItemsCount: number,
): ApplicantRequestDetailResponseDto {
  return {
    ...presentApplicantRequestCard(request, missingItemsCount),
    child: {
      firstName: request.childFirstName,
      lastName: request.childLastName ?? null,
      fullName: request.childFullName,
      dateOfBirth: presentDateOnly(request.childDateOfBirth),
      gender: publicText(request.childGender),
      nationality: publicText(request.childNationality),
    },
    previousSchool: publicText(request.previousSchool),
    notes: publicText(request.notes),
  };
}

export function presentApplicantRequestsList(input: {
  items: ApplicantAdmissionRequestRecord[];
  page: number;
  limit: number;
  total: number;
  missingItemsCountBySchoolId: Map<string, number>;
}): ApplicantRequestsListResponseDto {
  const totalPages =
    input.total === 0 ? 0 : Math.ceil(input.total / input.limit);

  return {
    data: input.items.map((request) =>
      presentApplicantRequestCard(
        request,
        input.missingItemsCountBySchoolId.get(request.school.id) ?? 0,
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

export function presentApplicantRequestCard(
  request: ApplicantAdmissionRequestRecord,
  missingItemsCount: number,
): ApplicantRequestCardResponseDto {
  return {
    id: request.id,
    status: presentRequestStatus(request.status),
    school: {
      id: request.school.id,
      name:
        firstPublicText(
          request.school.schoolProfile?.schoolName,
          request.school.name,
        ) ?? request.school.name,
      shortName: publicText(request.school.schoolProfile?.shortName),
      city: publicText(request.school.schoolProfile?.city),
      country: publicText(request.school.schoolProfile?.country),
    },
    childFullName: request.childFullName,
    requestedAcademicYear: request.requestedAcademicYear
      ? {
          id: request.requestedAcademicYear.id,
          label:
            firstPublicText(
              request.requestedAcademicYear.nameEn,
              request.requestedAcademicYear.nameAr,
            ) ?? request.requestedAcademicYear.id,
        }
      : null,
    requestedGrade: request.requestedGrade
      ? {
          id: request.requestedGrade.id,
          label:
            firstPublicText(
              request.requestedGrade.nameEn,
              request.requestedGrade.nameAr,
            ) ?? request.requestedGrade.id,
        }
      : null,
    missingItemsCount,
    progressValue: presentProgressValue(request.status),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

function presentRequestStatus(
  status: ApplicantAdmissionRequestStatus,
): 'draft' | 'submitted' {
  if (status === ApplicantAdmissionRequestStatus.SUBMITTED) return 'submitted';
  return 'draft';
}

function presentProgressValue(status: ApplicantAdmissionRequestStatus): number {
  if (status === ApplicantAdmissionRequestStatus.SUBMITTED) return 50;
  return 25;
}

function presentDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
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
