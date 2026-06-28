# ADM-REG-1E — Accepted Applicant Conversion Audit / Handoff Expansion

## 1. Executive Decision

ADM-REG-1E locks accepted application conversion as a school-staff handoff-to-wizard flow, not automatic applicant conversion.

The future implementation must let authorized school staff open an accepted Admissions application and receive a wizard-compatible draft for the school registration wizard introduced in ADM-REG-1D. The handoff response should prefill only data proven by Admissions, Applicant Portal, and linked document sources. It must not create Student, Guardian, StudentGuardian, Enrollment, Parent account, Student account, applicant membership, or app visibility by itself.

Locked direction:

- Future handoff should be school staff only.
- Future handoff should return a wizard-compatible draft.
- Future handoff should preserve the ADM-REG-1B identity boundary: Applicant remains `UserType.APPLICANT`.
- Future registration from an accepted application must still be completed by a school-side registration workflow.
- Application source idempotency should use `Student.applicationId` only when registration is launched from an accepted application source.
- Parent App and Student App activation must remain downstream of operational records and linked accounts.

Recommended future endpoint shape:

- Add an explicit read-only preview route: `GET /api/v1/admissions/applications/:id/registration-handoff`.
- Keep `POST /api/v1/admissions/applications/:id/enroll` as a compatibility handoff/preview route if needed, but do not make it create operational records.
- If ADM-REG-1F includes source-bound submit, use a school-staff Admissions route that passes the trusted `applicationId` server-side into the registration workflow. Do not add arbitrary public `applicationId` acceptance to the normal wizard payload.

Final decision: ADM-REG-1F can proceed with a bounded handoff expansion implementation.

## 2. Source Evidence Reviewed

Governance and decision sources reviewed:

- `docs/sprint-adm-reg-1a-registration-reality-audit.md`
- `docs/sprint-adm-reg-1b-registration-contract-decision-lock.md`
- `docs/sprint-adm-reg-1c-student-guardian-profile-persistence-repair-closeout.md`
- `docs/sprint-adm-reg-1d-school-registration-wizard-foundation-closeout.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`
- `docs/sprint-18n-applicant-portal-final-closeout-audit.md`
- `docs/sprint-19a-applicant-document-review-final-closeout-audit.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `MODULES.md`
- `DOMAIN_GLOSSARY.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `TESTING_STRATEGY.md`
- `ERROR_CATALOG.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`

Runtime evidence reviewed:

- `prisma/schema.prisma`
- `src/modules/admissions/applications/controller/applications.controller.ts`
- `src/modules/admissions/applications/application/enroll-application-handoff.use-case.ts`
- `src/modules/admissions/applications/validators/application-enrollment-handoff.validator.ts`
- `src/modules/admissions/applications/presenters/application.presenter.ts`
- `src/modules/admissions/applications/dto/application.dto.ts`
- `src/modules/admissions/applications/infrastructure/applications.repository.ts`
- `src/modules/admissions/applications/tests/enroll-application-handoff.use-case.spec.ts`
- `src/modules/admissions/decisions/application/create-admission-decision.use-case.ts`
- `src/modules/admissions/decisions/validators/decision-workflow.validator.ts`
- `src/modules/admissions/documents/controller/application-documents.controller.ts`
- `src/modules/admissions/documents/application/review-application-document.use-case.ts`
- `src/modules/admissions/documents/infrastructure/application-documents.repository.ts`
- `src/modules/admissions/documents/presenters/application-document.presenter.ts`
- `src/modules/applicant-portal/application/create-applicant-account.use-case.ts`
- `src/modules/applicant-portal/application/create-applicant-request.use-case.ts`
- `src/modules/applicant-portal/application/submit-applicant-request.use-case.ts`
- `src/modules/applicant-portal/application/applicant-portal-access.service.ts`
- `src/modules/applicant-portal/domain/applicant-profile.inputs.ts`
- `src/modules/applicant-portal/domain/applicant-request.inputs.ts`
- `src/modules/applicant-portal/dto/applicant-account.dto.ts`
- `src/modules/applicant-portal/dto/applicant-request.dto.ts`
- `src/modules/applicant-portal/infrastructure/applicant-portal.repository.ts`
- `src/modules/applicant-portal/presenters/applicant-profile.presenter.ts`
- `src/modules/applicant-portal/presenters/applicant-request.presenter.ts`
- `src/modules/students/registration/controller/school-registration.controller.ts`
- `src/modules/students/registration/application/create-school-registration.use-case.ts`
- `src/modules/students/registration/dto/school-registration.dto.ts`
- `src/modules/students/registration/infrastructure/school-registration.repository.ts`
- `src/modules/students/registration/presenters/school-registration.presenter.ts`
- `src/modules/students/students/presenters/student.presenter.ts`
- `src/modules/students/guardians/presenters/guardian.presenter.ts`
- `src/modules/parent-app/access/parent-app-access.service.ts`
- `src/modules/parent-app/access/parent-app-guardian-read.adapter.ts`
- `src/modules/student-app/access/student-app-access.service.ts`
- `src/modules/student-app/access/student-app-student-read.adapter.ts`
- `test/e2e/admissions-flow.e2e-spec.ts`
- `test/e2e/school-registration-wizard.e2e-spec.ts`
- `test/security/tenancy.admissions.spec.ts`
- `test/security/tenancy.school-registration.spec.ts`

Note: `DIRECTORY_STRUCTURE.md` is referenced by local agent instructions but is not present in the repository. `DIRECTORY_STRUCTURE_VISUAL.md` was reviewed instead.

## 3. Current Accepted Handoff Reality

Current endpoint:

- `POST /api/v1/admissions/applications/:id/enroll`
- Controller: `ApplicationsController.enrollApplication`
- Use case: `EnrollApplicationHandoffUseCase.execute`
- Permission: `admissions.applications.manage`
- Scope: `requireApplicationsScope()` and `ApplicationsRepository.findApplicationEnrollmentHandoffById()` through `prisma.scoped`

Current validations:

- Application must be in current school scope.
- At least one placement test must exist and all placement tests must be `COMPLETED`.
- At least one interview must exist and all interviews must be `COMPLETED`.
- Application status must be `ACCEPTED`.
- Latest decision must be `AdmissionDecisionType.ACCEPT`.

Evidence:

- `ApplicationEnrollmentHandoffValidator.ensureApplicationCanPrepareEnrollmentHandoff`
- `DecisionWorkflowValidator.ensureDecisionCanBeCreated`
- `test/security/tenancy.admissions.spec.ts` verifies cross-school handoff returns `404` and missing manage permission returns `403`.

Current response:

```ts
{
  applicationId: string,
  eligible: true,
  handoff: {
    studentDraft: {
      fullName: application.studentName
    },
    guardianDrafts: [],
    enrollmentDraft: {
      requestedAcademicYearId: string | null,
      requestedAcademicYearName: string | null,
      requestedGradeId: string | null,
      requestedGradeName: string | null
    }
  }
}
```

Evidence:

- `presentApplicationEnrollmentHandoff` returns `studentDraft.fullName`, hard-coded `guardianDrafts: []`, and requested academic year/grade summary.
- `ApplicationEnrollmentHandoffResponseDto` exposes only `applicationId`, `eligible`, and `handoff`.
- `src/modules/admissions/applications/tests/enroll-application-handoff.use-case.spec.ts` verifies the bounded response and that `repository.updateApplication` is not called.
- `test/e2e/admissions-flow.e2e-spec.ts` verifies the accepted and non-accepted handoff preview flow without Student lifecycle side effects.

Current non-behavior:

- Does not include Applicant Portal request details.
- Does not include applicant profile details.
- Does not include Lead contact fields.
- Does not include documents.
- Does not create Student records.
- Does not create Guardian records.
- Does not create StudentGuardian links.
- Does not create Enrollment records.
- Does not create Parent or Student accounts.
- Does not populate `Student.applicationId`.
- Does not call `CreateSchoolRegistrationUseCase`.

Why `guardianDrafts` is empty today:

- `presentApplicationEnrollmentHandoff` hard-codes `guardianDrafts: []`.
- `APPLICATION_ENROLLMENT_HANDOFF_RECORD_ARGS` selects no applicant profile, linked applicant request, Lead contact, or guardian-like fields.
- Existing Admissions `Application` stores `studentName`, requested academic year, requested grade, source, status, and optional lead id, but no guardian profile.

Document review is not part of current handoff eligibility:

- `ReviewApplicationDocumentUseCase` supports accept/reject/request-replacement for bridged applicant documents.
- `ApplicationEnrollmentHandoffValidator` does not inspect document status.
- Applicant Portal submit treats `UPLOADED` and `ACCEPTED` applicant documents as satisfying mandatory document presence, and bridges both to `ApplicationDocument` as `PENDING_REVIEW` or `COMPLETE`.

## 4. Applicant Portal Source Data Mapping

Applicant Portal source data is useful for draft prefill, but it remains applicant-owned source evidence. It must not create operational identity or membership by itself.

Available Applicant Portal sources:

- `ApplicantProfile.fullName`
- `ApplicantProfile.phoneNumber`
- `ApplicantProfile.city`
- `ApplicantProfile.relationship`
- `User.email`
- `User.contactEmail`
- `ApplicantAdmissionRequest.childFirstName`
- `ApplicantAdmissionRequest.childLastName`
- `ApplicantAdmissionRequest.childFullName`
- `ApplicantAdmissionRequest.childDateOfBirth`
- `ApplicantAdmissionRequest.childGender`
- `ApplicantAdmissionRequest.childNationality`
- `ApplicantAdmissionRequest.requestedAcademicYearId`
- `ApplicantAdmissionRequest.requestedGradeId`
- `ApplicantAdmissionRequest.previousSchool`
- `ApplicantAdmissionRequest.notes`
- `ApplicantAdmissionRequestDocument` metadata and linked `ApplicationDocument`

Evidence:

- `CreateApplicantAccountDto`
- `ApplicantProfile` model
- `CreateApplicantRequestDto`
- `ApplicantAdmissionRequest` model
- `normalizeCreateApplicantRequestInput`
- `ApplicantPortalRepository.createApplicantAdmissionRequest`
- `ApplicantPortalRepository.submitApplicantAdmissionRequest`

### Applicant/Admissions → Wizard Student Mapping

| Source | Source field | Wizard field | Decision | Reason |
| --- | --- | --- | --- | --- |
| Application | `studentName` | `student.full_name_en`, `student.name` | PREFILL_PRIMARY | Application is the school-side Admissions record and current handoff source. |
| ApplicantAdmissionRequest | `childFullName` | `student.full_name_en`, `student.name` | PREFILL_WHEN_LINKED_OR_AS_EVIDENCE | Rich applicant source; use when linked and not conflicting, otherwise include warning/evidence. |
| ApplicantAdmissionRequest | `childFirstName` | `student.first_name_en` | PREFILL_WHEN_LINKED | Direct match to wizard-supported Student English name part. |
| ApplicantAdmissionRequest | `childLastName` | `student.family_name_en` | PREFILL_WHEN_LINKED | Direct match to wizard-supported Student English family name. |
| ApplicantAdmissionRequest | `childDateOfBirth` | `student.date_of_birth` / `student.dateOfBirth` | PREFILL_WHEN_LINKED | Direct match to ADM-REG-1C persisted Student field. |
| ApplicantAdmissionRequest | `childGender` | `student.gender` | PREFILL_WHEN_LINKED | Direct match to ADM-REG-1C persisted Student field. |
| ApplicantAdmissionRequest | `childNationality` | `student.nationality` | PREFILL_WHEN_LINKED | Direct match to ADM-REG-1C persisted Student field. |
| ApplicantAdmissionRequest | `previousSchool` | none | SOURCE_EVIDENCE_ONLY | No wizard Student profile field exists for previous school. |
| ApplicantAdmissionRequest | `notes` | none | SOURCE_EVIDENCE_ONLY | Notes are not part of the Student profile contract and should not be silently copied. |
| Applicant Portal | Arabic name fields | `student.first_name_ar`, `student.father_name_ar`, `student.grandfather_name_ar`, `student.family_name_ar`, `student.full_name_ar` | NOT_AVAILABLE_FROM_CURRENT_SOURCE | Applicant Portal does not currently collect Arabic child name parts. |
| Lead | `studentName` | `student.full_name_en`, `student.name` | FALLBACK_OR_EVIDENCE | Lead can source manually created Admissions applications, but Application remains canonical once created. |

### Applicant/Admissions → Wizard Guardian Mapping

| Source | Source field | Wizard field | Decision | Reason |
| --- | --- | --- | --- | --- |
| ApplicantProfile | `fullName` | `guardians[0].profile.full_name` | PREFILL_WHEN_LINKED | Applicant profile represents the requesting adult and can seed first guardian draft. |
| ApplicantProfile | `relationship` | `guardians[0].profile.relation` | PREFILL_WHEN_LINKED | Values `father`, `mother`, `guardian`, `relative` are compatible with free-text guardian relation. |
| ApplicantProfile | `phoneNumber` | `guardians[0].profile.phone_primary` | PREFILL_WHEN_LINKED | Direct guardian contact candidate. |
| User | `contactEmail` | `guardians[0].profile.email` | PREFILL_WHEN_SAFE | Use contact email when available; avoid exposing login-only semantics as identity mutation. |
| User | `email` | `guardians[0].profile.email` | FALLBACK_WHEN_CONTACT_EMAIL_MISSING | Applicant login email may be useful as contact email, but does not convert applicant to parent. |
| ApplicantProfile | `city` | none | SOURCE_EVIDENCE_ONLY | Guardian profile has no city field; Student contact city should not be inferred from applicant city. |
| Lead | `primaryContactName` | `guardians[0].profile.full_name` | FALLBACK_OR_EVIDENCE | Lead-based applications may have contact name when no Applicant Portal profile exists. |
| Lead | `phone` | `guardians[0].profile.phone_primary` | FALLBACK_OR_EVIDENCE | Lead-based applications require phone and can seed guardian draft. |
| Lead | `email` | `guardians[0].profile.email` | FALLBACK_OR_EVIDENCE | Lead email can seed guardian draft when no applicant profile exists. |
| Applicant Portal | national id | `guardians[0].profile.national_id` | NOT_AVAILABLE_FROM_CURRENT_SOURCE | Applicant Portal does not collect guardian national id. |
| Applicant Portal | job/workplace | `guardians[0].profile.job_title`, `workplace` | NOT_AVAILABLE_FROM_CURRENT_SOURCE | Applicant Portal does not collect job title or workplace. |
| Applicant Portal | secondary phone | `guardians[0].profile.phone_secondary` | NOT_AVAILABLE_FROM_CURRENT_SOURCE | Applicant Portal does not collect secondary phone. |
| Applicant Portal | pickup/notification flags | `can_pickup`, `can_receive_notifications` | OPTIONAL_STAFF_COMPLETION | No source value exists; staff may choose during registration. |

## 5. Admissions Application Source Data Mapping

Admissions `Application` is the canonical school-side record after an application exists. Applicant Portal request data remains source evidence and a richer draft source when linked by `ApplicantAdmissionRequest.applicationId`.

Source precedence decision:

- Application is canonical for school-side workflow status, source, decision, requested academic year, and requested grade.
- ApplicantAdmissionRequest is the richest applicant-submitted source for child details when linked to the Application and same school.
- Lead is fallback/source evidence for manually created or lead-originated applications.
- If Application and ApplicantAdmissionRequest disagree, future handoff should prefer Application for workflow and placement fields, include the ApplicantAdmissionRequest values in `source`, and add a warning requiring staff confirmation.
- Do not silently overwrite staff-controlled Application placement with applicant-owned values when they differ.

Evidence:

- `Application` model has `studentName`, `requestedAcademicYearId`, `requestedGradeId`, `status`, `source`, `leadId`, `decision`, `documents`, `applicantAdmissionRequest`, and `student`.
- `ApplicantAdmissionRequest` has a unique school-scoped relation to `Application` through `applicationId`.
- `ApplicantPortalRepository.submitApplicantAdmissionRequest` creates an `Application` with `studentName: request.childFullName`, requested academic year/grade, source `IN_APP`, and bridges documents.
- `CreateApplicationUseCase` lets school staff create an Application directly from `studentName`, optional lead, requested year/grade, and source.

### Applicant/Admissions → Wizard Enrollment Mapping

| Source | Source field | Wizard field | Decision | Reason |
| --- | --- | --- | --- | --- |
| Application | `requestedAcademicYearId` | `enrollment.academicYearId` | PREFILL_PRIMARY | Application is the school-side canonical requested academic year source. |
| Application | `requestedGradeId` | `enrollment.gradeId` | PREFILL_PRIMARY | Application is the school-side canonical requested grade source. |
| ApplicantAdmissionRequest | `requestedAcademicYearId` | `enrollment.academicYearId` | SOURCE_EVIDENCE_OR_FALLBACK | Use only when linked and Application lacks the value or for conflict evidence. |
| ApplicantAdmissionRequest | `requestedGradeId` | `enrollment.gradeId` | SOURCE_EVIDENCE_OR_FALLBACK | Use only when linked and Application lacks the value or for conflict evidence. |
| Application requested year relation | `requestedAcademicYear.nameEn/nameAr` | source summary label | PREFILL_LABEL_ONLY | Useful display label; wizard submit requires ids/names accepted by 1D. |
| Application requested grade relation | `requestedGrade.nameEn/nameAr` | source summary label | PREFILL_LABEL_ONLY | Useful display label; wizard still requires classroom selection. |
| Applicant Portal | classroom | `enrollment.classroomId` | NOT_AVAILABLE_FROM_CURRENT_SOURCE | Applicant request does not collect classroom. 1D wizard requires `classroomId`. |
| Applicant Portal | section | `enrollment.sectionId` | NOT_AVAILABLE_FROM_CURRENT_SOURCE | Applicant request does not collect section. |
| Applicant Portal | term | `enrollment.termId` | NOT_AVAILABLE_FROM_CURRENT_SOURCE | Applicant request does not collect term. |
| Applicant Portal | enrollment date | `enrollment.enrollmentDate` | NOT_AVAILABLE_FROM_CURRENT_SOURCE | Staff must select enrollment date. |

Enrollment implication:

- The handoff cannot fully auto-enroll from current source data because the ADM-REG-1D wizard requires `classroomId` and `enrollmentDate`.
- Staff must choose classroom and enrollment date before submitting the wizard.
- Term and section may remain optional staff completion depending on school policy and classroom structure, but classroom validation will enforce grade/section consistency.

## 6. Future Handoff-to-Wizard Contract

Recommended read-only handoff route:

```text
GET /api/v1/admissions/applications/:id/registration-handoff
```

Compatibility route:

```text
POST /api/v1/admissions/applications/:id/enroll
```

The existing `:id/enroll` route may continue as a compatibility preview endpoint, but it should remain non-mutating unless a future ADR explicitly changes the route semantics. The clearer future route is `registration-handoff` because the current behavior is preview/draft, not enrollment creation.

Recommended future response:

```ts
{
  "applicationId": "uuid",
  "status": "accepted",
  "eligible": true,
  "alreadyRegistered": false,
  "eligibility": {
    "canPrepareHandoff": true,
    "canSubmitRegistration": false,
    "reasonCodes": [],
    "placementTests": { "total": 1, "completed": 1 },
    "interviews": { "total": 1, "completed": 1 },
    "documents": {
      "included": true,
      "blockingPolicy": "not_enforced_by_current_handoff"
    }
  },
  "source": {
    "application": {
      "id": "uuid",
      "studentName": "Layla Hassan",
      "requestedAcademicYearId": "uuid",
      "requestedGradeId": "uuid",
      "source": "in_app",
      "status": "accepted",
      "submittedAt": "2026-06-28T00:00:00.000Z"
    },
    "applicantRequest": {
      "id": "uuid",
      "childFullName": "Layla Hassan",
      "previousSchool": "ABC School",
      "notesProvided": true
    },
    "lead": null
  },
  "wizardDraft": {
    "student": {
      "name": "Layla Hassan",
      "full_name_en": "Layla Hassan",
      "first_name_en": "Layla",
      "family_name_en": "Hassan",
      "date_of_birth": "2018-04-12",
      "gender": "female",
      "nationality": "Egyptian",
      "status": "active",
      "contact": {
        "address_line": null,
        "city": null,
        "district": null,
        "student_phone": null,
        "student_email": null
      }
    },
    "guardians": [
      {
        "profile": {
          "full_name": "Nour Ali",
          "relation": "guardian",
          "phone_primary": "+20 100 000 0000",
          "phone_secondary": null,
          "email": "nour.parent@example.com",
          "national_id": null,
          "job_title": null,
          "workplace": null,
          "can_pickup": null,
          "can_receive_notifications": null
        },
        "relationship": { "is_primary": true },
        "account": { "mode": "none" }
      }
    ],
    "enrollment": {
      "academicYearId": "uuid",
      "gradeId": "uuid",
      "sectionId": null,
      "classroomId": null,
      "termId": null,
      "enrollmentDate": null,
      "status": "active"
    },
    "studentAccount": { "mode": "none" }
  },
  "documents": [
    {
      "applicationDocumentId": "uuid",
      "documentType": "birth_certificate",
      "status": "pending_review",
      "file": {
        "id": "uuid",
        "originalName": "birth-certificate.pdf",
        "mimeType": "application/pdf",
        "sizeBytes": "12345"
      },
      "source": "applicant_upload"
    }
  ],
  "warnings": [
    "enrollment.classroomId_required",
    "enrollment.enrollmentDate_required"
  ],
  "missingRequiredForRegistration": [
    "enrollment.classroomId",
    "enrollment.enrollmentDate"
  ]
}
```

Contract rules:

- The response is safe for authorized school staff only.
- The response must not be callable by applicant, parent, or student users.
- The response must not create operational records.
- The response must not mutate Applicant identity.
- The response must not grant memberships.
- The response must not activate Parent App or Student App access.
- The draft shape should be directly compatible with `CreateSchoolRegistrationDto`, except nullable missing fields are allowed in the draft preview to show staff what must be completed before wizard submit.

Source-bound submit decision:

- Normal `POST /api/v1/students-guardians/registrations` should remain school-created registration and should not accept public `applicationId`.
- If ADM-REG-1F implements application-source submission, prefer an Admissions-scoped route such as `POST /api/v1/admissions/applications/:id/register` that accepts the wizard command body but uses the route `:id` as the trusted source application id.
- That route may call the existing registration workflow internally and set `Student.applicationId` server-side.
- If source-bound submit cannot be implemented without broad wizard changes, split it into a later sprint and keep 1F read-only.

## 7. Eligibility Rules

Locked future handoff eligibility baseline:

- Application must belong to the current school scope.
- Application must not be deleted.
- Application status must be `accepted`.
- Admission decision must be `accept`.
- Placement tests must satisfy the existing handoff validator.
- Interviews must satisfy the existing handoff validator.
- Linked ApplicantAdmissionRequest, if present, must belong to the same school and same Application.
- If `Student.applicationId` is already populated for the Application in the same school, handoff must report already registered instead of preparing duplicate creation.

Document review decision:

- Do not invent a new blocking document rule in ADM-REG-1F unless current code already enforces it before acceptance.
- Current accepted handoff does not require all mandatory documents to be accepted.
- Future handoff should include document status summaries and warnings.
- If product later decides accepted application registration requires all mandatory documents accepted, that must be a separate decision because it changes Admissions workflow behavior.

Option decision:

- Adopt option B as the technical baseline currently proven by code: accepted decision + completed placement/interviews.
- Do not adopt option C, accepted decision + completed placement/interviews + all mandatory documents accepted, until product explicitly locks that behavior.

## 8. Identity Boundary Lock

ADM-REG-1E reaffirms ADM-REG-1B and ADR-0003:

- Applicant is `UserType.APPLICANT`.
- Applicant is membershipless before acceptance.
- Applicant is not Parent.
- Applicant is not Student.
- Applicant Portal routes use route-local applicant access checks.
- Applicant-to-parent/student/guardian/enrollment conversion was intentionally deferred.

Future handoff must not:

- mutate `UserType.APPLICANT`;
- turn Applicant user into Parent;
- turn Applicant user into Student;
- create applicant school membership;
- grant applicant Parent App access;
- grant applicant Student App access;
- allow applicant to create operational records directly;
- weaken global guards;
- weaken `schoolScope`;
- bypass Applicant Portal ownership checks.

Future operational flow:

1. School staff reviews an accepted application.
2. School staff opens registration handoff.
3. Backend returns a wizard-compatible draft and source evidence.
4. School staff reviews, edits, and completes missing placement/account fields.
5. School staff submits the school registration workflow.
6. The school registration workflow creates Student, Guardian, StudentGuardian, Enrollment, and optional accounts.
7. Parent App and Student App visibility activate only if their normal operational chains exist.

## 9. Student.applicationId and Idempotency Decision

Current reality:

- `Student.applicationId` exists in `prisma/schema.prisma`.
- `Student.applicationId` relates to `Application` through `[applicationId, schoolId]`.
- `Student` has `@@unique([applicationId, schoolId])`.
- ADM-REG-1D wizard currently creates Students with `applicationId: null`.
- `presentStudent` does not expose `applicationId`.
- ADM-REG-1D e2e tests verify registration responses do not contain `applicationId`.

Locked decision:

- ADM-REG-1F should populate `Student.applicationId` only when registration is submitted from an accepted Application source.
- Registration sourced from Application must be idempotent by `applicationId + schoolId`.
- If a Student already exists for the Application, the handoff endpoint must return `alreadyRegistered: true`.
- Already-registered response should include safe Student and Enrollment summary if available.
- Already-registered response must not return raw `schoolId`, `organizationId`, `userId`, `membershipId`, `roleId`, `deletedAt`, or applicant internal ids.
- Normal school-created registrations must continue to leave `Student.applicationId` null.

Recommended already-registered response shape:

```ts
{
  "applicationId": "uuid",
  "eligible": false,
  "alreadyRegistered": true,
  "registered": {
    "student": { "...safe StudentResponseDto fields": "..." },
    "enrollment": { "...safe EnrollmentResponseDto fields": "..." }
  },
  "warnings": ["application.already_registered"],
  "missingRequiredForRegistration": []
}
```

## 10. Missing Data and Staff Completion Matrix

| Field | Known from source? | Required for registration? | Decision | Staff action required? | Future sprint |
| --- | --- | --- | --- | --- | --- |
| `student.full_name_en` | Yes, from Application or ApplicantAdmissionRequest | Yes indirectly | prefilled | Confirm/edit | ADM-REG-1F |
| `student.first_name_en` | Yes, from ApplicantAdmissionRequest when linked | No | prefilled when linked | Confirm/edit | ADM-REG-1F |
| `student.family_name_en` | Yes, from ApplicantAdmissionRequest when linked | No | prefilled when linked | Confirm/edit | ADM-REG-1F |
| `student.date_of_birth` | Yes, from ApplicantAdmissionRequest when linked | No | prefilled when linked | Confirm/edit | ADM-REG-1F |
| `student.gender` | Yes, from ApplicantAdmissionRequest when linked | No | prefilled when linked | Confirm/edit | ADM-REG-1F |
| `student.nationality` | Yes, from ApplicantAdmissionRequest when linked | No | prefilled when linked | Confirm/edit | ADM-REG-1F |
| Student Arabic name parts | No | No | optional_staff_completion | Optional entry | deferred |
| Student contact address/city/district | No reliable child source | No | optional_staff_completion | Optional entry | deferred |
| Student phone/email | No reliable child source | No | optional_staff_completion | Optional entry | deferred |
| Guardian full name | Yes, from ApplicantProfile or Lead | Yes for wizard guardian profile | prefilled when available | Confirm/edit | ADM-REG-1F |
| Guardian relation | Yes, from ApplicantProfile | Yes for wizard guardian profile | prefilled when available | Confirm/edit | ADM-REG-1F |
| Guardian phone primary | Yes, from ApplicantProfile or Lead | Yes for current Guardian create behavior | prefilled when available | Complete if missing | ADM-REG-1F |
| Guardian email | Yes, from User/contactEmail or Lead | No | prefilled when available | Confirm/edit | ADM-REG-1F |
| Guardian secondary phone | No | No | optional_staff_completion | Optional entry | deferred |
| Guardian national id | No | No | optional_staff_completion | Optional entry | deferred |
| Guardian job title | No | No | optional_staff_completion | Optional entry | deferred |
| Guardian workplace | No | No | optional_staff_completion | Optional entry | deferred |
| `can_pickup` | No | No | optional_staff_completion | Optional selection | deferred |
| `can_receive_notifications` | No | No | optional_staff_completion | Optional selection | deferred |
| `enrollment.academicYearId` | Usually yes, from Application | Yes | prefilled when available | Complete if missing | ADM-REG-1F |
| `enrollment.gradeId` | Usually yes, from Application | Not directly required by DTO if classroom selected | prefilled when available | Confirm/edit | ADM-REG-1F |
| `enrollment.classroomId` | No | Yes | missing_required | Select classroom | ADM-REG-1F / wizard UI |
| `enrollment.sectionId` | No | No | optional_staff_completion | Optional/select via classroom | ADM-REG-1F / wizard UI |
| `enrollment.termId` | No | No | optional_staff_completion | Optional select | ADM-REG-1F / wizard UI |
| `enrollment.enrollmentDate` | No | Yes | missing_required | Select date | ADM-REG-1F / wizard UI |
| Parent account mode | No | No | default_none | Choose none/create/link | ADM-REG-1F / wizard UI |
| Student account mode | No | No | default_none | Choose none/create/link | ADM-REG-1F / wizard UI |
| Applicant documents | Yes, via bridged ApplicationDocument | No for wizard submit | source_evidence_only | Review separately | deferred StudentDocument migration |

## 11. Documents and Source Evidence

Current document reality:

- Applicant Portal uploads `ApplicantAdmissionRequestDocument`.
- On submit, bridgeable Applicant documents create `ApplicationDocument`.
- Applicant documents with status `UPLOADED` bridge as `AdmissionDocumentStatus.PENDING_REVIEW`.
- Applicant documents with status `ACCEPTED` bridge as `AdmissionDocumentStatus.COMPLETE`.
- School staff can list Application documents and review bridged applicant documents through Admissions document routes.
- Current handoff does not include documents.
- Current handoff does not require all documents accepted.

Future handoff document decision:

- Include safe `ApplicationDocument` summaries as source evidence for school staff.
- Do not include storage internals such as bucket or object key.
- Do not include applicant download URLs in handoff.
- Do not migrate documents into `StudentDocument` in ADM-REG-1F unless separately scoped.
- Do not make registration wizard consume documents directly in ADM-REG-1F.
- Defer StudentDocument creation from Admissions/Applicant documents.

Safe document summary fields:

- `applicationDocumentId`
- `documentType`
- `status`
- `notes` if already exposed by Admissions documents
- file summary already exposed by `presentApplicationDocument`: file id, original name, mime type, size, visibility
- applicant-source marker such as `source: "applicant_upload"` when linked through `ApplicantAdmissionRequestDocument`

Deferred document decisions:

- Whether all mandatory documents must be accepted before registration.
- Whether Admissions documents should copy to StudentDocument.
- Whether StudentDocument should retain source document lineage.
- Whether document handoff should include review warnings by mandatory document type.

## 12. Security and Tenancy Contract

Future handoff retrieval:

- Must require authenticated school-scoped staff.
- Should require `admissions.applications.manage` for parity with current `:id/enroll`, or a deliberately chosen combination of Admissions view/manage permissions if product wants read-only preview for viewers.
- If document summaries are included, the implementation must either require `admissions.documents.view` or document why `admissions.applications.manage` is sufficient for this combined handoff response.
- Must use current school scope for Application, ApplicantAdmissionRequest, ApplicationDocument, and Student lookup.
- Must reject cross-school Application ids with not-found style behavior.

Future wizard submission:

- Must require the ADM-REG-1D registration permissions: `students.records.manage`, `students.guardians.manage`, `students.enrollments.manage`.
- Source-bound submit from Admissions, if implemented, must also validate Admissions handoff eligibility before calling the registration workflow.
- Applicants, parents, and students must not call handoff expansion or source-bound registration.

### Security / No-Leak Matrix

| Data | May appear in handoff response? | Audience | Reason |
| --- | --- | --- | --- |
| `applicationId` | Yes | Authorized school staff | Already part of Admissions context and current handoff response. |
| Application status/source/requested ids | Yes | Authorized school staff | Required for school review and draft traceability. |
| `applicantRequestId` | Yes, optional | Authorized school staff | Safe as source reference when linked to same-school Application; not required for normal display. |
| `applicantUserId` | No | No app-facing audience | Internal applicant identity id; not needed for staff handoff. |
| `applicantProfileId` | No | No app-facing audience | Internal profile id; not needed for registration draft. |
| Applicant profile full name/relationship/contact | Yes | Authorized school staff | Needed to prefill Guardian draft; does not convert identity. |
| Applicant login email/contactEmail | Yes as guardian contact candidate | Authorized school staff | Useful contact data; must not imply Parent account mutation. |
| Applicant password hash | No | No audience | Secret credential data. |
| `schoolId` / `organizationId` | No | No app-facing response | Scope internals; current presenters generally hide them. |
| `userId` | No | No app-facing response | Internal account link id; wizard summaries use safe account presentation. |
| `membershipId` | No | No app-facing response | IAM internal id. |
| `roleId` | No | No app-facing response | IAM internal id; role key/name summaries are safer when needed. |
| `deletedAt` | No | No app-facing response | Internal soft-delete field. |
| `applicationDocumentId` | Yes | Authorized school staff | Already exposed in Admissions document context as `id`. |
| `fileId` | Yes if using existing Admissions document summary | Authorized school staff with document visibility | Existing `presentApplicationDocument` returns file id; do not expose storage internals. |
| `bucket` / `objectKey` | No | No app-facing response | Storage internals. |
| Signed download URL | No by default | Separate document download route only | Handoff should summarize evidence, not act as file download. |
| Guardian `national_id` | No from source | Not available from Applicant/Admissions | Applicant source does not collect it; if staff later enters it in wizard, normal Guardian response may return it. |
| Temporary password | No | Only account creation response if created in same request | Handoff preview creates no accounts. |
| Parent App visibility flag | No | Not applicable | Visibility is derived from operational chain, not handoff preview. |
| Student App visibility flag | No | Not applicable | Visibility is derived from operational chain, not handoff preview. |

Parent App boundary evidence:

- `ParentAppGuardianReadAdapter` requires current school scoped Guardian records with `Guardian.userId`, active `UserType.PARENT`, active linked Student, and active Enrollment.
- Handoff preview creates none of those.

Student App boundary evidence:

- `StudentAppStudentReadAdapter` requires `Student.userId`, active `UserType.STUDENT`, active Student, and active Enrollment.
- Handoff preview creates none of those.

## 13. Explicit Non-Goals

ADM-REG-1E does not implement and ADM-REG-1F should not silently add:

- automatic applicant-to-parent conversion;
- automatic applicant-to-student conversion;
- applicant user type mutation;
- applicant school membership creation;
- applicant-created operational records;
- Parent App rule changes;
- Student App rule changes;
- Applicant Portal behavior changes;
- Admissions decision behavior changes;
- document review policy changes;
- StudentDocument migration from Admissions documents;
- duplicate student matching engine;
- guardian deduplication;
- cross-school duplicate resolution;
- finance, HR, transport, wallet, bulk import, advanced smart pickup, or notification engine behavior;
- global guard changes;
- `schoolScope` weakening;
- new public registration route.

## 14. Deferred Backlog

Deferred items:

- Decide whether all mandatory documents must be accepted before registration.
- Decide whether Admissions/Application documents should migrate to StudentDocument.
- Decide source lineage for future StudentDocument records.
- Decide whether ApplicantProfile city should ever map to Guardian address data if Guardian address fields are introduced later.
- Decide conflict-resolution UI/contract when Application and ApplicantAdmissionRequest values differ.
- Decide whether source-bound submit belongs in ADM-REG-1F or a separate ADM-REG-1G if implementation risk is higher than expected.
- Decide whether registration handoff should support multiple guardians if Applicant Portal later collects multiple parent/guardian profiles.
- Decide whether applicant can be invited to create/link a Parent account after school registration through an explicit future workflow.

## 15. ADM-REG-1F Implementation Plan

Recommended sprint:

```text
ADM-REG-1F — Accepted Application Handoff-to-Wizard Implementation
```

Type:

```text
Focused implementation sprint.
```

Goal:

Implement the accepted application registration handoff expansion without automatic applicant conversion.

Scope:

1. Add an explicit handoff preview endpoint:
   - Preferred: `GET /api/v1/admissions/applications/:id/registration-handoff`
   - Optional compatibility: keep/expand `POST /api/v1/admissions/applications/:id/enroll` as non-mutating preview.
2. Add an application handoff source query:
   - Application summary.
   - Linked ApplicantAdmissionRequest summary.
   - ApplicantProfile and safe User contact fields.
   - Lead fallback summary if linked.
   - ApplicationDocument summaries.
   - Existing Student by `applicationId + schoolId` for idempotency.
3. Add a mapper/presenter:
   - Build `wizardDraft.student`.
   - Build first `wizardDraft.guardians[]` draft from ApplicantProfile or Lead.
   - Build `wizardDraft.enrollment`.
   - Build `warnings`.
   - Build `missingRequiredForRegistration`.
   - Build `eligibility`.
4. Preserve eligibility:
   - Reuse current accepted handoff validator as baseline.
   - Add linked ApplicantAdmissionRequest same-school validation.
   - Add already-registered detection.
5. Add source-bound registration only if it stays small:
   - Prefer `POST /api/v1/admissions/applications/:id/register`.
   - Body should align with the ADM-REG-1D wizard command, but source `applicationId` must come from route/server context.
   - It should call the school registration workflow with trusted `applicationId`.
   - It must enforce idempotency before creation.
   - If this cannot be done without broad wizard redesign, split it out and keep 1F read-only.
6. Add focused tests:
   - accepted application returns wizard-compatible draft;
   - applicant request fields prefill student draft;
   - applicant profile fields prefill guardian draft;
   - requested year/grade prefill enrollment draft;
   - missing classroom/date are reported;
   - documents are summarized safely;
   - cross-school Application id is rejected;
   - applicant/parent/student actors cannot call handoff;
   - already-registered Application returns safe alreadyRegistered response;
   - no applicant identity mutation or membership creation;
   - no Student/Guardian/Enrollment creation on preview route.
7. Add closeout document.

Explicit ADM-REG-1F non-goals:

- Do not mutate Applicant user type.
- Do not create Applicant membership.
- Do not let Applicant call the handoff.
- Do not implement mobile direct registration.
- Do not require document acceptance unless separately approved.
- Do not migrate documents to StudentDocument.
- Do not change Parent App or Student App visibility.
- Do not add duplicate resolution engine.
- Do not change package dependencies unless unavoidable.

Reason:

This keeps ADM-REG-1F as the bridge between Admissions and the existing school registration wizard. It uses the data and idempotency hooks already present in the schema while preserving the identity and tenancy boundaries locked in ADM-REG-1B.

## 16. Final Verdict

```text
ADM_REG_1E_HANDOFF_EXPANSION_READY_FOR_IMPLEMENTATION
```

Evidence is sufficient to design a safe ADM-REG-1F handoff expansion:

- Current handoff is proven preview-only.
- Applicant Portal and Admissions sources provide enough Student, Guardian, Enrollment, and document evidence for a draft.
- The ADM-REG-1D wizard can consume the draft after staff completes missing placement fields.
- `Student.applicationId` provides a schema-supported idempotency anchor for application-source registration.
- No future handoff design requires applicant identity mutation, applicant membership creation, Parent App changes, Student App changes, global guard changes, or `schoolScope` weakening.
