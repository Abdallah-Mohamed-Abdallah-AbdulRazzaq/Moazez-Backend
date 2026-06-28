import type {
  ApplicationDocumentStatusApiValue,
  ApplicationSourceApiValue,
  ApplicationStatusApiValue,
} from '../domain/application.enums';
import type { StudentResponseDto } from '../../../students/students/dto/student.dto';
import type { EnrollmentResponseDto } from '../../../students/enrollments/dto/enrollment.dto';

export class ApplicationRegistrationHandoffWorkflowSummaryDto {
  total!: number;
  completed!: number;
}

export class ApplicationRegistrationHandoffDocumentsEligibilityDto {
  included!: boolean;
  blockingPolicy!: 'not_enforced_by_current_handoff';
}

export class ApplicationRegistrationHandoffEligibilityDto {
  canPrepareHandoff!: boolean;
  canSubmitRegistration!: boolean;
  reasonCodes!: string[];
  placementTests!: ApplicationRegistrationHandoffWorkflowSummaryDto;
  interviews!: ApplicationRegistrationHandoffWorkflowSummaryDto;
  documents!: ApplicationRegistrationHandoffDocumentsEligibilityDto;
}

export class ApplicationRegistrationHandoffApplicationSourceDto {
  id!: string;
  studentName!: string;
  requestedAcademicYearId!: string | null;
  requestedAcademicYearName!: string | null;
  requestedGradeId!: string | null;
  requestedGradeName!: string | null;
  source!: ApplicationSourceApiValue;
  status!: ApplicationStatusApiValue;
  submittedAt!: string | null;
}

export class ApplicationRegistrationHandoffApplicantSourceDto {
  fullName!: string;
  relationship!: string;
  phoneNumber!: string | null;
  city!: string | null;
  email!: string | null;
}

export class ApplicationRegistrationHandoffApplicantRequestSourceDto {
  id!: string;
  childFullName!: string;
  childFirstName!: string;
  childLastName!: string | null;
  dateOfBirth!: string | null;
  gender!: string | null;
  nationality!: string | null;
  requestedAcademicYearId!: string | null;
  requestedAcademicYearName!: string | null;
  requestedGradeId!: string | null;
  requestedGradeName!: string | null;
  previousSchool!: string | null;
  notesProvided!: boolean;
  submittedAt!: string | null;
  applicant!: ApplicationRegistrationHandoffApplicantSourceDto;
}

export class ApplicationRegistrationHandoffLeadSourceDto {
  id!: string;
  studentName!: string;
  primaryContactName!: string | null;
  phone!: string;
  email!: string | null;
}

export class ApplicationRegistrationHandoffSourceDto {
  application!: ApplicationRegistrationHandoffApplicationSourceDto;
  applicantRequest!: ApplicationRegistrationHandoffApplicantRequestSourceDto | null;
  lead!: ApplicationRegistrationHandoffLeadSourceDto | null;
}

export class ApplicationRegistrationHandoffStudentContactDraftDto {
  address_line!: string | null;
  city!: string | null;
  district!: string | null;
  student_phone!: string | null;
  student_email!: string | null;
}

export class ApplicationRegistrationHandoffStudentDraftDto {
  name!: string | null;
  first_name_en!: string | null;
  father_name_en!: string | null;
  grandfather_name_en!: string | null;
  family_name_en!: string | null;
  first_name_ar!: string | null;
  father_name_ar!: string | null;
  grandfather_name_ar!: string | null;
  family_name_ar!: string | null;
  full_name_en!: string | null;
  full_name_ar!: string | null;
  dateOfBirth!: string | null;
  date_of_birth!: string | null;
  gender!: string | null;
  nationality!: string | null;
  status!: 'active';
  contact!: ApplicationRegistrationHandoffStudentContactDraftDto;
}

export class ApplicationRegistrationHandoffGuardianProfileDraftDto {
  full_name!: string | null;
  first_name!: string | null;
  last_name!: string | null;
  relation!: string | null;
  phone_primary!: string | null;
  phone_secondary!: string | null;
  email!: string | null;
  national_id!: string | null;
  job_title!: string | null;
  workplace!: string | null;
  can_pickup!: boolean | null;
  can_receive_notifications!: boolean | null;
}

export class ApplicationRegistrationHandoffGuardianRelationshipDraftDto {
  is_primary!: boolean;
}

export class ApplicationRegistrationHandoffAccountDraftDto {
  mode!: 'none';
}

export class ApplicationRegistrationHandoffGuardianDraftDto {
  profile!: ApplicationRegistrationHandoffGuardianProfileDraftDto;
  relationship!: ApplicationRegistrationHandoffGuardianRelationshipDraftDto;
  account!: ApplicationRegistrationHandoffAccountDraftDto;
}

export class ApplicationRegistrationHandoffEnrollmentDraftDto {
  academicYearId!: string | null;
  gradeId!: string | null;
  sectionId!: string | null;
  classroomId!: string | null;
  termId!: string | null;
  enrollmentDate!: string | null;
  status!: 'active';
}

export class ApplicationRegistrationHandoffWizardDraftDto {
  student!: ApplicationRegistrationHandoffStudentDraftDto;
  guardians!: ApplicationRegistrationHandoffGuardianDraftDto[];
  enrollment!: ApplicationRegistrationHandoffEnrollmentDraftDto;
  studentAccount!: ApplicationRegistrationHandoffAccountDraftDto;
}

export class ApplicationRegistrationHandoffDocumentFileDto {
  id!: string;
  originalName!: string;
  mimeType!: string;
  sizeBytes!: string;
}

export class ApplicationRegistrationHandoffDocumentDto {
  applicationDocumentId!: string;
  documentType!: string;
  status!: ApplicationDocumentStatusApiValue;
  notes!: string | null;
  source!: 'applicant_upload' | 'admissions_upload' | 'unknown';
  file!: ApplicationRegistrationHandoffDocumentFileDto;
}

export class ApplicationRegistrationHandoffRegisteredSummaryDto {
  student!: StudentResponseDto;
  enrollment!: EnrollmentResponseDto | null;
}

export class ApplicationRegistrationHandoffResponseDto {
  applicationId!: string;
  status!: ApplicationStatusApiValue;
  eligible!: boolean;
  alreadyRegistered!: boolean;
  eligibility!: ApplicationRegistrationHandoffEligibilityDto;
  source!: ApplicationRegistrationHandoffSourceDto;
  wizardDraft!: ApplicationRegistrationHandoffWizardDraftDto | null;
  documents!: ApplicationRegistrationHandoffDocumentDto[];
  registered!: ApplicationRegistrationHandoffRegisteredSummaryDto | null;
  warnings!: string[];
  missingRequiredForRegistration!: string[];
}
