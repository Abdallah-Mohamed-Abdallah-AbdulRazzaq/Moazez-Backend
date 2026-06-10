import {
  AdmissionApplicationStatus,
  ApplicantAdmissionRequestStatus,
} from '@prisma/client';
import {
  ApplicantRequestApiStatus,
  ApplicantRequestCardResponseDto,
  ApplicantRequestDetailResponseDto,
  ApplicantRequestsListResponseDto,
} from '../dto/applicant-request.dto';
import { ApplicantAdmissionRequestRecord } from '../infrastructure/applicant-portal.repository';

export function presentApplicantRequestDetail(
  request: ApplicantAdmissionRequestRecord,
  missingItemsCount: number,
  mandatoryItemsCount = missingItemsCount,
): ApplicantRequestDetailResponseDto {
  return {
    ...presentApplicantRequestCard(
      request,
      missingItemsCount,
      mandatoryItemsCount,
    ),
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
  missingItemsCountByRequestId: Map<string, number>;
  mandatoryItemsCountBySchoolId?: Map<string, number>;
}): ApplicantRequestsListResponseDto {
  const totalPages =
    input.total === 0 ? 0 : Math.ceil(input.total / input.limit);

  return {
    data: input.items.map((request) =>
      presentApplicantRequestCard(
        request,
        input.missingItemsCountByRequestId.get(request.id) ?? 0,
        input.mandatoryItemsCountBySchoolId?.get(request.school.id) ?? 0,
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
  mandatoryItemsCount = missingItemsCount,
): ApplicantRequestCardResponseDto {
  const status = presentRequestStatus(request);

  return {
    id: request.id,
    status,
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
    progressValue: presentProgressValue(status, {
      missingItemsCount,
      mandatoryItemsCount,
    }),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

function presentRequestStatus(
  request: ApplicantAdmissionRequestRecord,
): ApplicantRequestApiStatus {
  if (request.status === ApplicantAdmissionRequestStatus.DRAFT) return 'draft';

  switch (request.application?.status) {
    case AdmissionApplicationStatus.DOCUMENTS_PENDING:
      return 'needs_action';
    case AdmissionApplicationStatus.SUBMITTED:
      return 'submitted';
    case AdmissionApplicationStatus.UNDER_REVIEW:
      return 'under_review';
    case AdmissionApplicationStatus.WAITLISTED:
      return 'waitlisted';
    case AdmissionApplicationStatus.ACCEPTED:
      return 'accepted';
    case AdmissionApplicationStatus.REJECTED:
      return 'rejected';
    default:
      return 'submitted';
  }
}

function presentProgressValue(
  status: ApplicantRequestApiStatus,
  counts: {
    missingItemsCount: number;
    mandatoryItemsCount: number;
  },
): number {
  switch (status) {
    case 'needs_action':
      if (counts.mandatoryItemsCount > 0 && counts.missingItemsCount === 0) {
        return 55;
      }
      return 40;
    case 'submitted':
      return 50;
    case 'under_review':
      return 70;
    case 'waitlisted':
      return 80;
    case 'accepted':
    case 'rejected':
      return 100;
    case 'draft':
      if (
        counts.mandatoryItemsCount > 0 &&
        counts.missingItemsCount < counts.mandatoryItemsCount
      ) {
        return 35;
      }
      return 25;
  }
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
