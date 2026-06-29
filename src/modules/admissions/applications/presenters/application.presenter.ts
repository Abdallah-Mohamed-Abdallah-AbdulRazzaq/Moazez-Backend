import {
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
