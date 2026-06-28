import {
  ApplicationRegistrationSubmitExistingSummaryDto,
  ApplicationRegistrationSubmitResponseDto,
} from '../dto/application-registration-submit.dto';
import { ApplicationRegistrationHandoffRecord } from '../infrastructure/applications.repository';
import { SchoolRegistrationResponseDto } from '../../../students/registration/dto/school-registration.dto';
import { presentEnrollment } from '../../../students/enrollments/presenters/enrollment.presenter';
import { presentStudent } from '../../../students/students/presenters/student.presenter';

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

export function presentAlreadyRegisteredApplicationRegistration(
  application: ApplicationRegistrationHandoffRecord,
): ApplicationRegistrationSubmitResponseDto {
  const warnings = ['application.already_registered'];
  const student = application.student;

  if (!student) {
    throw new Error('Already registered application is missing student');
  }

  const activeEnrollment = student.enrollments[0] ?? null;
  if (!activeEnrollment) {
    pushUnique(
      warnings,
      'application.already_has_student_without_active_enrollment',
    );
  }

  const registration: ApplicationRegistrationSubmitExistingSummaryDto = {
    student: presentStudent(student),
    enrollment: activeEnrollment ? presentEnrollment(activeEnrollment) : null,
  };

  return {
    applicationId: application.id,
    registered: true,
    alreadyRegistered: true,
    registration,
    warnings,
  };
}

export function presentAcceptedApplicationRegistrationSubmit(params: {
  applicationId: string;
  registration: SchoolRegistrationResponseDto;
}): ApplicationRegistrationSubmitResponseDto {
  return {
    applicationId: params.applicationId,
    registered: true,
    alreadyRegistered: false,
    registration: params.registration,
    warnings: params.registration.warnings,
  };
}
