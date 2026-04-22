import { StudentSummaryResponseDto } from '../../students/dto/student.dto';
import { presentStudentSummary } from '../../students/presenters/student.presenter';
import {
  GuardianResponseDto,
  GuardianWithStudentsResponseDto,
} from '../dto/guardian.dto';
import {
  GuardianProfileRecord,
  GuardianRecord,
  StudentGuardianLinkRecord,
} from '../infrastructure/guardians.repository';

function buildGuardianFullName(
  guardian: Pick<GuardianRecord, 'firstName' | 'lastName'>,
): string {
  return `${guardian.firstName} ${guardian.lastName}`.trim();
}

export function presentGuardian(
  guardian: GuardianRecord,
  options?: { isPrimary?: boolean },
): GuardianResponseDto {
  return {
    guardianId: guardian.id,
    full_name: buildGuardianFullName(guardian),
    relation: guardian.relation,
    phone_primary: guardian.phone,
    phone_secondary: null,
    email: guardian.email,
    national_id: null,
    job_title: null,
    workplace: null,
    is_primary: options?.isPrimary ?? guardian.isPrimary,
    can_pickup: null,
    can_receive_notifications: null,
  };
}

export function presentGuardianLink(
  link: StudentGuardianLinkRecord,
): GuardianResponseDto {
  return presentGuardian(link.guardian, { isPrimary: link.isPrimary });
}

export function presentGuardianProfile(
  guardian: GuardianProfileRecord,
): GuardianWithStudentsResponseDto {
  return {
    guardian: presentGuardian(guardian, {
      isPrimary: guardian.students.some((studentLink) => studentLink.isPrimary),
    }),
    students: guardian.students.map(
      (studentLink): StudentSummaryResponseDto =>
        presentStudentSummary(studentLink.student),
    ),
  };
}
