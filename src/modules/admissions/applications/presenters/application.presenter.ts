import {
  ApplicationEnrollmentHandoffResponseDto,
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
