import {
  AdmissionApplicationStatus,
  AdmissionDocumentStatus,
  ApplicantAdmissionRequestDocumentStatus,
} from '@prisma/client';
import {
  ApplicationDocumentsSummaryDto,
  ApplicationEnrollmentHandoffResponseDto,
  ApplicationRegistrationStateDto,
  ApplicationResponseDto,
} from '../dto/application.dto';
import {
  ApplicationEnrollmentHandoffRecord,
  ApplicationRecord,
} from '../infrastructure/applications.repository';
import {
  mapApplicationSourceToApi,
  mapApplicationStatusToApi,
} from '../domain/application.enums';
import { mapEnrollmentStatusToApi } from '../../../students/enrollments/domain/enrollment-status.enums';

const REVIEWABLE_APPLICATION_STATUSES = [
  AdmissionApplicationStatus.SUBMITTED,
  AdmissionApplicationStatus.DOCUMENTS_PENDING,
  AdmissionApplicationStatus.UNDER_REVIEW,
] as const;

function isApplicationDocumentReviewableForSummary(params: {
  applicationStatus: AdmissionApplicationStatus;
  document: ApplicationRecord['documents'][number];
}): boolean {
  if (
    !REVIEWABLE_APPLICATION_STATUSES.includes(
      params.applicationStatus as (typeof REVIEWABLE_APPLICATION_STATUSES)[number],
    )
  ) {
    return false;
  }

  if (params.document.status !== AdmissionDocumentStatus.PENDING_REVIEW) {
    return false;
  }

  const linkedApplicantDocument =
    params.document.applicantAdmissionRequestDocuments.find(
      (candidate) => candidate.applicationDocumentId === params.document.id,
    ) ?? null;

  return (
    linkedApplicantDocument?.status ===
    ApplicantAdmissionRequestDocumentStatus.UPLOADED
  );
}

export function presentApplicationDocumentsSummary(
  application: ApplicationRecord,
): ApplicationDocumentsSummaryDto {
  const documents = application.documents;
  const totalCount = documents.length;
  let completeCount = 0;
  let missingCount = 0;
  let pendingReviewCount = 0;
  let reviewableCount = 0;
  let applicantPortalCount = 0;
  let needsReplacementCount = 0;

  for (const document of documents) {
    if (document.status === AdmissionDocumentStatus.COMPLETE) {
      completeCount += 1;
    }

    if (document.status === AdmissionDocumentStatus.MISSING) {
      missingCount += 1;
    }

    if (document.status === AdmissionDocumentStatus.PENDING_REVIEW) {
      pendingReviewCount += 1;
    }

    const linkedApplicantDocuments =
      document.applicantAdmissionRequestDocuments.filter(
        (candidate) => candidate.applicationDocumentId === document.id,
      );

    if (linkedApplicantDocuments.length > 0) {
      applicantPortalCount += 1;
    }

    needsReplacementCount += linkedApplicantDocuments.filter(
      (candidate) =>
        candidate.status ===
        ApplicantAdmissionRequestDocumentStatus.NEEDS_REPLACEMENT,
    ).length;

    if (
      isApplicationDocumentReviewableForSummary({
        applicationStatus: application.status,
        document,
      })
    ) {
      reviewableCount += 1;
    }
  }

  const staffUploadCount = totalCount - applicantPortalCount;

  return {
    totalCount,
    completeCount,
    missingCount,
    pendingReviewCount,
    reviewableCount,
    applicantPortalCount,
    staffUploadCount,
    needsReplacementCount,
    hasPendingReview: pendingReviewCount > 0,
    hasReviewableDocuments: reviewableCount > 0,
    hasMissingDocuments: missingCount > 0 || needsReplacementCount > 0,
  };
}

export function presentApplicationRegistrationState(
  application: ApplicationRecord,
): ApplicationRegistrationStateDto {
  const student = application.student;
  const activeEnrollment = student?.enrollments[0] ?? null;

  return {
    registered: Boolean(student),
    studentId: student?.id ?? null,
    enrollmentId: activeEnrollment?.id ?? null,
    enrollmentStatus: activeEnrollment
      ? mapEnrollmentStatusToApi(activeEnrollment.status)
      : null,
    registeredVia: student ? 'admissions_application' : null,
    registeredAt: null,
    source: 'derived_from_student_application_id',
  };
}

export function presentApplication(
  application: ApplicationRecord,
): ApplicationResponseDto {
  return {
    id: application.id,
    leadId: application.leadId,
    studentName: application.studentName,
    requestedAcademicYearId: application.requestedAcademicYearId,
    requestedGradeId: application.requestedGradeId,
    source: mapApplicationSourceToApi(application.source),
    status: mapApplicationStatusToApi(application.status),
    submittedAt: application.submittedAt?.toISOString() ?? null,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    registrationState: presentApplicationRegistrationState(application),
    documentsSummary: presentApplicationDocumentsSummary(application),
  };
}

export function presentApplicationEnrollmentHandoff(
  application: ApplicationEnrollmentHandoffRecord,
): ApplicationEnrollmentHandoffResponseDto {
  return {
    applicationId: application.id,
    eligible: true,
    handoff: {
      studentDraft: {
        fullName: application.studentName,
      },
      guardianDrafts: [],
      enrollmentDraft: {
        requestedAcademicYearId: application.requestedAcademicYearId,
        requestedAcademicYearName:
          application.requestedAcademicYear?.nameEn ?? null,
        requestedGradeId: application.requestedGradeId,
        requestedGradeName: application.requestedGrade?.nameEn ?? null,
      },
    },
  };
}
