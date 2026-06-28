import {
  ApplicationRegistrationHandoffDocumentDto,
  ApplicationRegistrationHandoffGuardianDraftDto,
  ApplicationRegistrationHandoffResponseDto,
  ApplicationRegistrationHandoffWizardDraftDto,
} from '../dto/application-registration-handoff.dto';
import {
  mapApplicationDocumentStatusToApi,
  mapApplicationSourceToApi,
  mapApplicationStatusToApi,
} from '../domain/application.enums';
import { ApplicationRegistrationHandoffRecord } from '../infrastructure/applications.repository';
import { presentEnrollment } from '../../../students/enrollments/presenters/enrollment.presenter';
import { presentStudent } from '../../../students/students/presenters/student.presenter';

export interface ApplicationRegistrationHandoffWorkflowSummary {
  total: number;
  completed: number;
}

export interface ApplicationRegistrationHandoffPresentationInput {
  application: ApplicationRegistrationHandoffRecord;
  placementTests: ApplicationRegistrationHandoffWorkflowSummary;
  interviews: ApplicationRegistrationHandoffWorkflowSummary;
}

function publicText(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length > 0 ? normalized : null;
}

function presentDateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function presentDateTime(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function deriveLabel(
  value: { nameEn: string; nameAr: string } | null | undefined,
): string | null {
  if (!value) return null;

  return publicText(value.nameEn) ?? publicText(value.nameAr);
}

function normalizeForComparison(value: string | null | undefined): string | null {
  return publicText(value)?.toLowerCase() ?? null;
}

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function hasLinkedApplicantRequest(
  application: ApplicationRegistrationHandoffRecord,
): application is ApplicationRegistrationHandoffRecord & {
  applicantAdmissionRequest: NonNullable<
    ApplicationRegistrationHandoffRecord['applicantAdmissionRequest']
  >;
} {
  const request = application.applicantAdmissionRequest;

  return Boolean(
    request &&
      request.schoolId === application.schoolId &&
      request.applicationId === application.id,
  );
}

function presentApplicationSource(
  application: ApplicationRegistrationHandoffRecord,
): ApplicationRegistrationHandoffResponseDto['source']['application'] {
  return {
    id: application.id,
    studentName: application.studentName,
    requestedAcademicYearId: application.requestedAcademicYearId,
    requestedAcademicYearName: deriveLabel(application.requestedAcademicYear),
    requestedGradeId: application.requestedGradeId,
    requestedGradeName: deriveLabel(application.requestedGrade),
    source: mapApplicationSourceToApi(application.source),
    status: mapApplicationStatusToApi(application.status),
    submittedAt: presentDateTime(application.submittedAt),
  };
}

function presentApplicantRequestSource(
  application: ApplicationRegistrationHandoffRecord,
): ApplicationRegistrationHandoffResponseDto['source']['applicantRequest'] {
  if (!hasLinkedApplicantRequest(application)) {
    return null;
  }

  const request = application.applicantAdmissionRequest;
  const applicant = request.applicantProfile;

  return {
    id: request.id,
    childFullName: request.childFullName,
    childFirstName: request.childFirstName,
    childLastName: publicText(request.childLastName),
    dateOfBirth: presentDateOnly(request.childDateOfBirth),
    gender: publicText(request.childGender),
    nationality: publicText(request.childNationality),
    requestedAcademicYearId: request.requestedAcademicYearId,
    requestedAcademicYearName: deriveLabel(request.requestedAcademicYear),
    requestedGradeId: request.requestedGradeId,
    requestedGradeName: deriveLabel(request.requestedGrade),
    previousSchool: publicText(request.previousSchool),
    notesProvided: Boolean(publicText(request.notes)),
    submittedAt: presentDateTime(request.submittedAt),
    applicant: {
      fullName: applicant.fullName,
      relationship: applicant.relationship,
      phoneNumber: publicText(applicant.phoneNumber),
      city: publicText(applicant.city),
      email:
        publicText(applicant.user.contactEmail) ??
        publicText(applicant.user.email),
    },
  };
}

function presentLeadSource(
  application: ApplicationRegistrationHandoffRecord,
): ApplicationRegistrationHandoffResponseDto['source']['lead'] {
  if (!application.lead) {
    return null;
  }

  return {
    id: application.lead.id,
    studentName: application.lead.studentName,
    primaryContactName: publicText(application.lead.primaryContactName),
    phone: application.lead.phone,
    email: publicText(application.lead.email),
  };
}

function buildSource(
  application: ApplicationRegistrationHandoffRecord,
): ApplicationRegistrationHandoffResponseDto['source'] {
  return {
    application: presentApplicationSource(application),
    applicantRequest: presentApplicantRequestSource(application),
    lead: presentLeadSource(application),
  };
}

function buildStudentDraft(
  application: ApplicationRegistrationHandoffRecord,
  warnings: string[],
): ApplicationRegistrationHandoffWizardDraftDto['student'] {
  const applicantRequest = hasLinkedApplicantRequest(application)
    ? application.applicantAdmissionRequest
    : null;
  const applicationName = publicText(application.studentName);
  const applicantChildName = publicText(applicantRequest?.childFullName);

  if (
    applicationName &&
    applicantChildName &&
    normalizeForComparison(applicationName) !==
      normalizeForComparison(applicantChildName)
  ) {
    pushUnique(warnings, 'application.applicant_request_name_conflict');
  }

  const fullName = applicationName ?? applicantChildName;
  const birthDate = presentDateOnly(applicantRequest?.childDateOfBirth);

  return {
    name: fullName,
    first_name_en: publicText(applicantRequest?.childFirstName),
    father_name_en: null,
    grandfather_name_en: null,
    family_name_en: publicText(applicantRequest?.childLastName),
    first_name_ar: null,
    father_name_ar: null,
    grandfather_name_ar: null,
    family_name_ar: null,
    full_name_en: fullName,
    full_name_ar: null,
    dateOfBirth: birthDate,
    date_of_birth: birthDate,
    gender: publicText(applicantRequest?.childGender),
    nationality: publicText(applicantRequest?.childNationality),
    status: 'active',
    contact: {
      address_line: null,
      city: null,
      district: null,
      student_phone: null,
      student_email: null,
    },
  };
}

function emptyGuardianProfile(): ApplicationRegistrationHandoffGuardianDraftDto['profile'] {
  return {
    full_name: null,
    first_name: null,
    last_name: null,
    relation: null,
    phone_primary: null,
    phone_secondary: null,
    email: null,
    national_id: null,
    job_title: null,
    workplace: null,
    can_pickup: null,
    can_receive_notifications: null,
  };
}

function buildGuardianDraftFromApplicant(
  application: ApplicationRegistrationHandoffRecord,
): ApplicationRegistrationHandoffGuardianDraftDto | null {
  if (!hasLinkedApplicantRequest(application)) {
    return null;
  }

  const applicant = application.applicantAdmissionRequest.applicantProfile;

  return {
    profile: {
      ...emptyGuardianProfile(),
      full_name: applicant.fullName,
      relation: applicant.relationship,
      phone_primary: publicText(applicant.phoneNumber),
      email:
        publicText(applicant.user.contactEmail) ??
        publicText(applicant.user.email),
    },
    relationship: { is_primary: true },
    account: { mode: 'none' },
  };
}

function buildGuardianDraftFromLead(
  application: ApplicationRegistrationHandoffRecord,
): ApplicationRegistrationHandoffGuardianDraftDto | null {
  const lead = application.lead;
  if (!lead) {
    return null;
  }

  return {
    profile: {
      ...emptyGuardianProfile(),
      full_name: publicText(lead.primaryContactName),
      phone_primary: publicText(lead.phone),
      email: publicText(lead.email),
    },
    relationship: { is_primary: true },
    account: { mode: 'none' },
  };
}

function buildGuardianDrafts(params: {
  application: ApplicationRegistrationHandoffRecord;
  warnings: string[];
  missingRequiredForRegistration: string[];
}): ApplicationRegistrationHandoffGuardianDraftDto[] {
  const guardianDraft =
    buildGuardianDraftFromApplicant(params.application) ??
    buildGuardianDraftFromLead(params.application);

  if (!guardianDraft) {
    pushUnique(params.warnings, 'guardian.source_missing');
    pushUnique(
      params.missingRequiredForRegistration,
      'guardians[0].profile.full_name',
    );
    pushUnique(
      params.missingRequiredForRegistration,
      'guardians[0].profile.relation',
    );
    pushUnique(
      params.missingRequiredForRegistration,
      'guardians[0].profile.phone_primary',
    );
    return [];
  }

  if (!publicText(guardianDraft.profile.full_name)) {
    pushUnique(params.warnings, 'guardian.full_name_missing');
    pushUnique(
      params.missingRequiredForRegistration,
      'guardians[0].profile.full_name',
    );
  }

  if (!publicText(guardianDraft.profile.relation)) {
    pushUnique(params.warnings, 'guardian.relation_missing');
    pushUnique(
      params.missingRequiredForRegistration,
      'guardians[0].profile.relation',
    );
  }

  if (!publicText(guardianDraft.profile.phone_primary)) {
    pushUnique(params.warnings, 'guardian.phone_primary_missing');
    pushUnique(
      params.missingRequiredForRegistration,
      'guardians[0].profile.phone_primary',
    );
  }

  return [guardianDraft];
}

function buildEnrollmentDraft(
  application: ApplicationRegistrationHandoffRecord,
  warnings: string[],
  missingRequiredForRegistration: string[],
): ApplicationRegistrationHandoffWizardDraftDto['enrollment'] {
  const applicantRequest = hasLinkedApplicantRequest(application)
    ? application.applicantAdmissionRequest
    : null;
  const requestedAcademicYearId =
    application.requestedAcademicYearId ??
    applicantRequest?.requestedAcademicYearId ??
    null;
  const requestedGradeId =
    application.requestedGradeId ?? applicantRequest?.requestedGradeId ?? null;

  if (
    application.requestedAcademicYearId &&
    applicantRequest?.requestedAcademicYearId &&
    application.requestedAcademicYearId !==
      applicantRequest.requestedAcademicYearId
  ) {
    pushUnique(warnings, 'application.requested_academic_year_conflict');
  }

  if (
    application.requestedGradeId &&
    applicantRequest?.requestedGradeId &&
    application.requestedGradeId !== applicantRequest.requestedGradeId
  ) {
    pushUnique(warnings, 'application.requested_grade_conflict');
  }

  if (!requestedAcademicYearId) {
    pushUnique(warnings, 'enrollment.academicYearId_required');
    pushUnique(
      missingRequiredForRegistration,
      'enrollment.academicYearId',
    );
  }

  pushUnique(warnings, 'enrollment.classroomId_required');
  pushUnique(warnings, 'enrollment.enrollmentDate_required');
  pushUnique(missingRequiredForRegistration, 'enrollment.classroomId');
  pushUnique(missingRequiredForRegistration, 'enrollment.enrollmentDate');

  return {
    academicYearId: requestedAcademicYearId,
    gradeId: requestedGradeId,
    sectionId: null,
    classroomId: null,
    termId: null,
    enrollmentDate: null,
    status: 'active',
  };
}

function buildWizardDraft(
  application: ApplicationRegistrationHandoffRecord,
  warnings: string[],
  missingRequiredForRegistration: string[],
): ApplicationRegistrationHandoffWizardDraftDto {
  return {
    student: buildStudentDraft(application, warnings),
    guardians: buildGuardianDrafts({
      application,
      warnings,
      missingRequiredForRegistration,
    }),
    enrollment: buildEnrollmentDraft(
      application,
      warnings,
      missingRequiredForRegistration,
    ),
    studentAccount: { mode: 'none' },
  };
}

function presentDocuments(
  application: ApplicationRegistrationHandoffRecord,
  warnings: string[],
): ApplicationRegistrationHandoffDocumentDto[] {
  const documents = application.documents.map((document) => ({
    applicationDocumentId: document.id,
    documentType: document.documentType,
    status: mapApplicationDocumentStatusToApi(document.status),
    notes: document.notes,
    source:
      document.applicantAdmissionRequestDocuments.length > 0
        ? ('applicant_upload' as const)
        : ('admissions_upload' as const),
    file: {
      id: document.file.id,
      originalName: document.file.originalName,
      mimeType: document.file.mimeType,
      sizeBytes: document.file.sizeBytes.toString(),
    },
  }));

  if (documents.some((document) => document.status === 'pending_review')) {
    pushUnique(warnings, 'documents.pending_review_present');
    pushUnique(warnings, 'documents.not_blocking_current_handoff');
  }

  return documents;
}

function presentEligibility(params: {
  alreadyRegistered: boolean;
  placementTests: ApplicationRegistrationHandoffWorkflowSummary;
  interviews: ApplicationRegistrationHandoffWorkflowSummary;
}): ApplicationRegistrationHandoffResponseDto['eligibility'] {
  return {
    canPrepareHandoff: !params.alreadyRegistered,
    canSubmitRegistration: false,
    reasonCodes: params.alreadyRegistered
      ? ['application.already_registered']
      : [],
    placementTests: params.placementTests,
    interviews: params.interviews,
    documents: {
      included: true,
      blockingPolicy: 'not_enforced_by_current_handoff',
    },
  };
}

function presentAlreadyRegistered(
  input: ApplicationRegistrationHandoffPresentationInput,
  warnings: string[],
): ApplicationRegistrationHandoffResponseDto['registered'] {
  const student = input.application.student;
  if (!student) {
    return null;
  }

  const activeEnrollment = student.enrollments[0] ?? null;
  if (!activeEnrollment) {
    pushUnique(
      warnings,
      'application.already_has_student_without_active_enrollment',
    );
  }

  return {
    student: presentStudent(student),
    enrollment: activeEnrollment ? presentEnrollment(activeEnrollment) : null,
  };
}

export function presentApplicationRegistrationHandoff(
  input: ApplicationRegistrationHandoffPresentationInput,
): ApplicationRegistrationHandoffResponseDto {
  const warnings: string[] = [];
  const missingRequiredForRegistration: string[] = [];
  const alreadyRegistered = Boolean(input.application.student);
  const documents = presentDocuments(input.application, warnings);

  if (alreadyRegistered) {
    pushUnique(warnings, 'application.already_registered');
  }

  const registered = alreadyRegistered
    ? presentAlreadyRegistered(input, warnings)
    : null;

  const wizardDraft = alreadyRegistered
    ? null
    : buildWizardDraft(
        input.application,
        warnings,
        missingRequiredForRegistration,
      );

  return {
    applicationId: input.application.id,
    status: mapApplicationStatusToApi(input.application.status),
    eligible: !alreadyRegistered,
    alreadyRegistered,
    eligibility: presentEligibility({
      alreadyRegistered,
      placementTests: input.placementTests,
      interviews: input.interviews,
    }),
    source: buildSource(input.application),
    wizardDraft,
    documents,
    registered,
    warnings,
    missingRequiredForRegistration: alreadyRegistered
      ? []
      : missingRequiredForRegistration,
  };
}
