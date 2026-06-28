# ADM-REG-1A - Admissions / Students / Parents Registration Reality Audit

Date: 2026-06-28

Baseline verified from `git log --oneline -10`: `e506a75 docs: close attendance policy rule logic`.

Sprint type: Documentation-only Reality Audit / Contract Gap Analysis.

Runtime change status: none. This audit intentionally does not change `src/`, `prisma/`, tests, package files, seeds, contracts, generated files, or runtime behavior.

Scope note: the requested `DIRECTORY_STRUCTURE.md` file is not present in this repository. `DIRECTORY_STRUCTURE_VISUAL.md` was inspected instead, alongside the other required governance files.

## 1. Executive Summary

Implemented today:

- Applicant Portal account creation for `UserType.APPLICANT`, applicant profile storage, school discovery, required-document discovery, applicant request creation, applicant document upload/list/read/download/replace/delete, request submit, Admissions `Application` creation on submit, and applicant-document bridging into `ApplicationDocument`.
- Admissions school-side lead, application, document, placement test, interview, decision, and accepted-application handoff preview flows.
- Student record CRUD with normalized core fields only: `firstName`, `lastName`, `birthDate`, `status`, `applicationId`, `userId`, school/org ownership, timestamps, and soft delete support.
- Guardian record CRUD with normalized core fields only: `firstName`, `lastName`, `phone`, `email`, `relation`, `isPrimary`, `userId`, school/org ownership, timestamps, and soft delete support.
- `StudentGuardian` linking, including primary-guardian demotion/protection logic in the repository layer.
- Parent and student account create/link flows from the Students module.
- Enrollment create/upsert/validate/current/history flows for existing students, including academic year, term, classroom, grade/section consistency, active-enrollment conflict prevention, seat-limit checks, and audit logging.
- Parent App read visibility once the exact operational chain exists: active parent user, active school membership, linked Guardian, linked active Student, and active Enrollment in current school scope.
- Student App self-service visibility once a linked active `Student.userId` and active Enrollment exist.

Partial today:

- Admissions accepted-application handoff is a validation/read-model handoff only. It returns draft data and does not create operational student, guardian, enrollment, parent, student-account, or membership records.
- Enrollment can accept `applicationId`, but only to validate the accepted Admissions handoff. `Enrollment` has no `applicationId` column, and normal student creation leaves `Student.applicationId = null`.
- Student and Guardian DTOs accept and presenters return richer frontend-style fields, but several of those fields are not represented in Prisma and are returned as `null`.
- Basic school-side applicant document review exists (`accept`, `reject`, `request-replacement`), but it remains separate from accepted-applicant conversion.

Missing today:

- No accepted applicant conversion into `Student`, `Guardian`, `StudentGuardian`, `Enrollment`, `Membership`, `PARENT`, or `STUDENT` account records.
- No unified one-transaction registration wizard API.
- No applicant-to-parent transition.
- No locked backend contract for a comprehensive registration form payload.
- No automatic Parent App activation from acceptance. Activation depends on manual school-side creation/linking/enrollment steps.

Intentionally deferred:

- ADR-0003 explicitly defers applicant-to-parent/guardian/student/enrollment conversion.
- Applicant accounts remain `UserType.APPLICANT` and membershipless before acceptance.
- V1 excludes unrelated advanced platform scope such as billing engine, finance, HR, wallet, marketplace, advanced smart pickup, and advanced analytics builder.

Current support level: the backend supports applicant intake, admissions review, and manual or semi-manual operational registration. It does not support full automated registration from an accepted application.

## 2. Current Architecture Map

All HTTP routes are globally prefixed by `/api/v1` through `app.setGlobalPrefix('api/v1')` in `src/main.ts`.

Module separation observed:

| Area | Current responsibility | Business truth or read model | Evidence |
| --- | --- | --- | --- |
| Applicant Portal | Pre-admission applicant identity, profile, school discovery, request, documents, submit-to-Admissions bridge | App-facing pre-admission workflow with dedicated applicant models | `src/modules/applicant-portal/controller/applicant-portal.controller.ts`, `src/modules/applicant-portal/infrastructure/applicant-portal.repository.ts` |
| Admissions | Leads, applications, documents, tests, interviews, decisions, handoff preview | Core school-side Admissions workflow, but not operational student registration | `src/modules/admissions/**`, especially `applications`, `documents`, `decisions` |
| Students | Operational student records and student account linking | Core source of truth for students | `src/modules/students/students/**`, `prisma/schema.prisma` model `Student` |
| Guardians / Parents | Operational guardian records, student links, parent account linking | Core source of truth for guardians and student-guardian relations | `src/modules/students/guardians/**`, `prisma/schema.prisma` models `Guardian`, `StudentGuardian` |
| Enrollments | Operational enrollment placement for existing students | Core source of truth for school enrollment state | `src/modules/students/enrollments/**`, `prisma/schema.prisma` model `Enrollment` |
| Parent App | Parent-facing child/profile read composition | Read-only app-facing composition over Students/Guardians/Enrollments/IAM | `src/modules/parent-app/access/parent-app-access.service.ts`, `src/modules/parent-app/access/parent-app-guardian-read.adapter.ts` |
| Student App | Student-facing read composition | Read-only app-facing composition over Student.userId and Enrollment | `src/modules/student-app/access/student-app-access.service.ts`, `src/modules/student-app/access/student-app-student-read.adapter.ts` |
| IAM | Users, memberships, roles, permissions, actor context | Identity and scope authority | `USER_TYPES.md`, `SECURITY_MODEL.md`, `prisma/schema.prisma` models `User`, `Membership`, `Role` |

Prisma model reality map:

| Model | Relevant fields and relationships | Constraints / scope | Lifecycle implication |
| --- | --- | --- | --- |
| `User` | `email`, `username`, `contactEmail`, `phone`, `passwordHash`, `firstName`, `lastName`, `userType`, `status`, profile relations | Unique email/username/phone where applicable; not school-scoped directly | Identity is global. School access is through Membership, except applicant route-local access. |
| `Membership` | `userId`, `organizationId`, optional `schoolId`, `roleId`, `userType`, `status` | School scoped through `schoolId` when present | Parent/student app access requires active membership context; applicants intentionally have none pre-acceptance. |
| `Role` | `organizationId`, optional `schoolId`, `key`, permissions | `@@unique([schoolId, key])`; school scoped | Account create/link flows require assignable `student` or `parent` role keys. |
| `ApplicantProfile` | `userId`, `fullName`, `phoneNumber`, `city`, `relationship` | `userId` unique; no `schoolId` | Applicant identity profile is not a Guardian profile. |
| `ApplicantAdmissionRequest` | applicant/profile ids, school/org ids, child names, DOB, gender, nationality, requested year/grade, previous school, notes, status, `applicationId` | `@@unique([id, schoolId])`, `@@unique([applicationId, schoolId])`; not in `SCHOOL_SCOPED_MODELS` | Applicant-owned request can be submitted into Admissions, but does not become a Student. |
| `ApplicantAdmissionRequestDocument` | request/applicant/school/org ids, required doc, application doc, file, title, type, status, notes, soft delete | Applicant ownership fields; not in `SCHOOL_SCOPED_MODELS` | Dedicated applicant document lifecycle with optional bridge to Admissions document. |
| `AdmissionRequiredDocument` | school/org, optional grade, title, mandatory flag, accepted types, max files, active flag | `@@unique([id, schoolId])`; not in `SCHOOL_SCOPED_MODELS` | Public discovery is manually filtered by active school/org/grade rules. |
| `Lead` | school/org, student/contact info, channel, status, owner | In `SCHOOL_SCOPED_MODELS`; `@@unique([id, schoolId])` | Admissions prospect only; can seed application data but not student records. |
| `Application` | school/org, optional lead, `studentName`, requested year/grade, source, status, submittedAt | In `SCHOOL_SCOPED_MODELS`; `@@unique([id, schoolId])` | Admissions application has optional relation to Student through `Student.applicationId`, but code does not populate it in normal registration. |
| `ApplicationDocument` | school, application, file, document type, status, notes | In `SCHOOL_SCOPED_MODELS` | School-side document record; applicant bridge can create/update it. |
| `PlacementTest` | school/application, name/date/result/status | In `SCHOOL_SCOPED_MODELS` | Required by decision and handoff validators. |
| `Interview` | school/application, scheduled date, interviewer, status, notes | In `SCHOOL_SCOPED_MODELS` | Required by decision and handoff validators. |
| `AdmissionDecision` | school/application, decision, reason, decidedBy, decidedAt | In `SCHOOL_SCOPED_MODELS`; `applicationId` unique | Updates `Application.status`; does not convert operational records. |
| `Student` | school/org, optional `applicationId`, unique optional `userId`, `firstName`, `lastName`, `birthDate`, `status`, soft delete | In `SCHOOL_SCOPED_MODELS`; `@@unique([applicationId, schoolId])` | Operational student truth is intentionally narrow; rich profile fields are absent. |
| `Guardian` | school/org, optional `userId`, names, phone, email, relation, `isPrimary`, soft delete | In `SCHOOL_SCOPED_MODELS`; `userId` is not DB-unique | Guardian can exist without Parent user. Current account-link use case blocks linking another guardian to the same parent user in the active school. |
| `StudentGuardian` | school, student, guardian, `isPrimary` | In `SCHOOL_SCOPED_MODELS`; `@@unique([schoolId, studentId, guardianId])` | Many-to-many student/guardian relation; primary behavior is enforced in repository transactions, not by a DB unique constraint. |
| `Enrollment` | school, student, academic year, optional term, classroom, status, dates, exit reason, soft delete | In `SCHOOL_SCOPED_MODELS`; no `applicationId` column | Enrollment consumes existing student ids only. |
| `StudentDocument` | school/student, file, type, status, notes | In `SCHOOL_SCOPED_MODELS` | Separate from applicant/admissions documents. |
| `StudentMedicalProfile` | school/student, blood type, allergies, conditions, medications, emergency notes | In `SCHOOL_SCOPED_MODELS`; `studentId` unique | Separate operational medical profile; not populated by admissions conversion. |
| `StudentNote` | school/student, author, category, note | In `SCHOOL_SCOPED_MODELS` | Operational note record; not part of applicant conversion. |

## 3. ADR and Scope Alignment

ADR-0003 alignment:

- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md` states that Applicant Portal actors are `UserType.APPLICANT`.
- Applicants are not `UserType.PARENT`.
- Applicants are membershipless before acceptance.
- Applicant Portal access must be route-local and must not weaken global guards, `PermissionsGuard`, `ScopeResolverGuard`, or Prisma `schoolScope`.
- Applicant-owned data requires explicit ownership checks.
- Applicant-to-parent/guardian/student/enrollment conversion is deferred to a later explicit accepted-application workflow.

V1 scope alignment:

- `V1_SCOPE.md` includes Admissions, Students, Parent App, Student App, and Applicant Portal as V1 areas.
- The implemented Applicant Portal final closeout in `docs/sprint-18n-applicant-portal-final-closeout-audit.md` confirms applicant request/document/bridge completion while explicitly leaving conversion out of scope.
- `docs/sprint-19a-applicant-document-review-final-closeout-audit.md` confirms document accept/reject/request-replacement was added without changing applicant identity, membership, global guards, schoolScope, or conversion policy.
- `MODULES.md`, `ARCHITECTURE_DECISION.md`, and `DIRECTORY_STRUCTURE_VISUAL.md` preserve the boundary that core domain modules own truth and app-facing modules compose read models.

## 4. Implemented Applicant Portal Flow

Routes below include the global `/api/v1` prefix.

| Step | Route | Auth mode | Main code | Data written | Data returned | Security boundary |
| --- | --- | --- | --- | --- | --- | --- |
| Create applicant account | `POST /api/v1/applicant-portal/accounts` | Public route | `CreateApplicantAccountUseCase`, `ApplicantPortalRepository.createApplicantAccount` | `User` with `UserType.APPLICANT`; `ApplicantProfile`; audit `applicant.account.create` | Applicant account/profile response with `userType: applicant` | Duplicate identity checks; no membership created |
| Read applicant profile | `GET /api/v1/applicant-portal/profile` | `AllowApplicantPortalAccess` | `ApplicantPortalAccessService`, controller profile route | None | Applicant profile | Requires active APPLICANT actor, no active membership, no existing membership, profile exists |
| Discover schools | `GET /api/v1/applicant-portal/schools`, `GET /api/v1/applicant-portal/schools/:schoolId` | Public route | `ApplicantPortalRepository.findDiscoverableSchools` / `findDiscoverableSchoolById` | None | Active discoverable school summaries | Filters active, non-deleted school and active org |
| Discover required documents | `GET /api/v1/applicant-portal/schools/:schoolId/admission-required-documents` | Public route | `ApplicantPortalRepository.listAdmissionRequiredDocuments` | None | Required document cards | Filters active school/org, active docs, deletedAt null, grade eligibility |
| Create applicant request | `POST /api/v1/applicant-portal/requests` | Applicant route-local | `CreateApplicantRequestUseCase`, `ApplicantPortalRepository.createApplicantAdmissionRequest` | `ApplicantAdmissionRequest` in `DRAFT` with child/requested school data | Request detail without internal `applicationId` | Applicant context plus school/year/grade validation |
| List/read applicant requests | `GET /api/v1/applicant-portal/requests`, `GET /api/v1/applicant-portal/requests/:requestId` | Applicant route-local | `ApplicantPortalRepository.listApplicantAdmissionRequests` / `findApplicantAdmissionRequestById` | None | Applicant-owned request summaries/details | Queries filter by `applicantUserId` and non-deleted request |
| Upload document | `POST /api/v1/applicant-portal/requests/:requestId/documents` | Applicant route-local | `UploadApplicantDocumentUseCase`, repository document create | Private `File`; `ApplicantAdmissionRequestDocument`; sometimes `ApplicationDocument` if request already bridged and mutable | Safe applicant document response; no internal bridge ids | Own request only; state checks; MIME/size/required-document checks |
| List/read document | `GET /api/v1/applicant-portal/requests/:requestId/documents`, `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId` | Applicant route-local | Repository applicant document queries | None | Safe applicant document data | Filters `applicantUserId`, `requestId`, deletedAt null |
| Download document | `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download` | Applicant route-local | Download use case and storage redirect | None | 307 redirect to short-lived file access | Own document only; no raw storage key returned in DTO |
| Replace document | `POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/replace` | Applicant route-local | `ReplaceApplicantDocumentUseCase` | New private `File`; new applicant document; previous document `SUPERSEDED`; bridged replacement if allowed | New safe applicant document response | Draft or submitted/documents-pending only; accepted docs cannot be replaced |
| Delete document | `DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId` | Applicant route-local | `DeleteApplicantDocumentUseCase` | Soft delete applicant document only | Deletion result | Draft or submitted/documents-pending only; bridged or accepted docs cannot be deleted |
| Submit request and bridge | `POST /api/v1/applicant-portal/requests/:requestId/submit` | Applicant route-local | `SubmitApplicantRequestUseCase`, `ApplicantPortalRepository.submitApplicantAdmissionRequest` | `Application`; request status `SUBMITTED`; `applicationId`; bridged `ApplicationDocument` rows | Applicant request detail; `applicationId` hidden | Advisory lock, applicant ownership, state validation, active school/org/year/grade validation |

The submit transaction creates or reuses the Admissions `Application` and bridges uploaded applicant documents to `ApplicationDocument`. It does not write `Student`, `Guardian`, `StudentGuardian`, `Enrollment`, `Membership`, Parent user, or Student user records. This is also covered by applicant-portal use-case tests such as `src/modules/applicant-portal/tests/applicant-portal-requests.spec.ts` and `src/modules/applicant-portal/tests/applicant-portal-documents.spec.ts`, which assert no student lifecycle side effects during submit/bridge paths.

## 5. Implemented Admissions Flow

School-side Admissions routes include:

| Area | Routes | Permission examples | Main code | Current behavior |
| --- | --- | --- | --- | --- |
| Leads | `/api/v1/admissions/leads` | `admissions.leads.view`, `admissions.leads.manage` | `src/modules/admissions/leads/controller/leads.controller.ts`, `CreateLeadUseCase` | CRUD-style lead tracking. Creates school/org-scoped `Lead` records only. |
| Applications | `/api/v1/admissions/applications` | `admissions.applications.view`, `admissions.applications.manage` | `src/modules/admissions/applications/controller/applications.controller.ts` | Create/list/read/update/submit applications. Application create starts with status `DOCUMENTS_PENDING`. |
| Documents | `/api/v1/admissions/applications/:applicationId/documents` | `admissions.documents.view`, `admissions.documents.manage` | `src/modules/admissions/documents/**` | Create/list/delete school-side documents and review applicant-bridged docs. |
| Document review | `POST .../:documentId/accept`, `reject`, `request-replacement` | `admissions.documents.manage` | `ReviewApplicationDocumentUseCase`, `ApplicationDocumentsRepository.reviewApplicantApplicationDocument` | Updates `ApplicationDocument` plus linked applicant doc status; replacement reopens application to `DOCUMENTS_PENDING`. |
| Placement tests | `/api/v1/admissions/tests` | `admissions.tests.view`, `admissions.tests.manage` | `PlacementTestsController` | School-scoped placement-test CRUD. |
| Interviews | `/api/v1/admissions/interviews` | `admissions.interviews.view`, `admissions.interviews.manage` | `InterviewsController` | School-scoped interview CRUD. |
| Decisions | `/api/v1/admissions/decisions` | `admissions.decisions.view`, `admissions.decisions.manage` | `CreateAdmissionDecisionUseCase`, `DecisionWorkflowValidator` | Creates one `AdmissionDecision` and updates `Application.status` after required tests/interviews are completed. |
| Enroll/handoff | `POST /api/v1/admissions/applications/:id/enroll` | `admissions.applications.manage` | `EnrollApplicationHandoffUseCase`, `ApplicationEnrollmentHandoffValidator`, `presentApplicationEnrollmentHandoff` | Validates accepted application and returns handoff draft data only. |

Explicit answers:

| Question | Answer | Evidence |
| --- | --- | --- |
| Does Admissions create Student records? | No. | `EnrollApplicationHandoffUseCase` returns presenter output only; `src/modules/admissions/applications/tests/enroll-application-handoff.use-case.spec.ts` asserts no repository update; `test/e2e/admissions-flow.e2e-spec.ts` snapshots student lifecycle tables. |
| Does Admissions create Guardian records? | No. | Handoff presenter returns `guardianDrafts: []`; no Guardian repository calls in Admissions handoff. |
| Does Admissions create StudentGuardian links? | No. | No `StudentGuardian` writes in Admissions handoff or decision use cases. |
| Does Admissions create Enrollment? | No. | `POST /admissions/applications/:id/enroll` is handoff only; `Enrollment` creation lives in Students enrollments module and requires existing `studentId`. |
| Does Admissions create Parent or Student accounts? | No. | Parent/student account creation lives in `CreateOrLinkGuardianAccountUseCase` and `CreateOrLinkStudentAccountUseCase`, both under Students. |

## 6. Implemented Student Records Flow

Routes and permissions:

- `GET /api/v1/students-guardians/students` - `students.records.view`
- `POST /api/v1/students-guardians/students` - `students.records.manage`
- `GET /api/v1/students-guardians/students/:studentId` - `students.records.view`
- `PATCH /api/v1/students-guardians/students/:studentId` - `students.records.manage`
- `POST /api/v1/students-guardians/students/:studentId/account` - `students.records.manage`

Core evidence:

- DTO: `src/modules/students/students/dto/student.dto.ts`
- Create use case: `src/modules/students/students/application/create-student.use-case.ts`
- Account use case: `src/modules/students/students/application/create-or-link-student-account.use-case.ts`
- Repository: `src/modules/students/students/infrastructure/students.repository.ts`
- Presenter: `src/modules/students/students/presenters/student.presenter.ts`
- Scope: `src/modules/students/students/domain/students-scope.ts`

Student field support table:

| Student field | DTO accepts? | Prisma stores? | Use-case writes? | Presenter returns? | Status |
| --- | --- | --- | --- | --- | --- |
| `id` | No | Yes | Yes | Yes | Implemented |
| `student_id` | No | No | No | Yes, `null` | Placeholder/null-only |
| `name` / `full_name_en` | Yes | No single full-name column | Derived into `firstName`/`lastName` | Derived from `firstName`/`lastName` | Partial normalized implementation |
| `first_name_en` | Yes | `firstName` | Yes | Yes | Implemented |
| `family_name_en` | Yes | `lastName` | Yes | Yes | Implemented |
| `father_name_en` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `grandfather_name_en` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `first_name_ar` | Yes | No Arabic column | Used only as fallback for `firstName` | Yes, `null` | Accepted-but-not-persisted as Arabic |
| `father_name_ar` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `grandfather_name_ar` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `family_name_ar` | Yes | No Arabic column | Used only as fallback for `lastName` | Yes, `null` | Accepted-but-not-persisted as Arabic |
| `full_name_ar` | Yes | No | Used only as fallback name source | Yes, `null` | Accepted-but-not-persisted as Arabic |
| `dateOfBirth` / `date_of_birth` | Yes | `birthDate` | Yes | Yes | Implemented |
| `gender` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `nationality` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `status` | Yes | `status` | Yes | Yes | Implemented |
| `contact.address_line` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `contact.city` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `contact.district` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `contact.student_phone` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `contact.student_email` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `applicationId` | No normal create DTO field | Yes | Normal create writes `null` | Not in `StudentResponseDto` | Schema-supported, not normal-flow populated |
| `userId` | No normal create DTO field | Yes, unique optional | Account endpoint writes it | Not in student presenter | Implemented internally for account linking |

Account linking behavior:

- `CreateOrLinkStudentAccountUseCase` creates a `UserType.STUDENT` user and school membership with a `student` role, then links `Student.userId`.
- Link mode requires an existing scoped membership whose user type is `STUDENT`.
- It blocks linking a user that is already linked to another student.
- It records `students.account.create` or `students.account.link` audit logs.

## 7. Implemented Guardian / Parent Flow

Routes and permissions:

- `GET /api/v1/students-guardians/students/guardians` - `students.guardians.view`
- `POST /api/v1/students-guardians/students/guardians` - `students.guardians.manage`
- `GET /api/v1/students-guardians/students/guardians/:guardianId` - `students.guardians.view`
- `PATCH /api/v1/students-guardians/students/guardians/:guardianId` - `students.guardians.manage`
- `GET /api/v1/students-guardians/students/guardians/:guardianId/students` - `students.guardians.view`
- `POST /api/v1/students-guardians/guardians/:guardianId/account` - `students.guardians.manage`
- `GET /api/v1/students-guardians/students/:studentId/guardians` - `students.guardians.view`
- `GET /api/v1/students-guardians/students/:studentId/guardians/primary` - `students.guardians.view`
- `POST /api/v1/students-guardians/students/:studentId/guardians` - `students.guardians.manage`
- `PATCH /api/v1/students-guardians/students/:studentId/guardians/:guardianId` - `students.guardians.manage`
- `DELETE /api/v1/students-guardians/students/:studentId/guardians/:guardianId` - `students.guardians.manage`

Core evidence:

- DTO: `src/modules/students/guardians/dto/guardian.dto.ts`
- Create use case: `src/modules/students/guardians/application/create-guardian.use-case.ts`
- Account use case: `src/modules/students/guardians/application/create-or-link-guardian-account.use-case.ts`
- Repository/link rules: `src/modules/students/guardians/infrastructure/guardians.repository.ts`
- Presenter: `src/modules/students/guardians/presenters/guardian.presenter.ts`

Guardian field support table:

| Guardian field | DTO accepts? | Prisma stores? | Use-case writes? | Presenter returns? | Status |
| --- | --- | --- | --- | --- | --- |
| `guardianId` | No | `id` | Yes | Yes | Implemented |
| `full_name` | Yes | No full-name column | Split into `firstName`/`lastName` | Derived | Partial normalized implementation |
| `first_name` | Yes | `firstName` | Yes | Derived in `full_name` | Implemented |
| `last_name` | Yes | `lastName` | Yes | Derived in `full_name` | Implemented |
| `relation` | Yes | `relation` | Yes | Yes | Implemented |
| `phone_primary` | Yes | `phone` | Yes | Yes | Implemented |
| `phone_secondary` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `email` | Yes | `email` | Yes | Yes | Implemented |
| `national_id` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `job_title` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `workplace` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `is_primary` | Yes | `Guardian.isPrimary` and `StudentGuardian.isPrimary` | Guardian create writes profile-level flag; link writes relation-level flag | Yes | Implemented but semantics are split |
| `can_pickup` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `can_receive_notifications` | Yes | No | No | Yes, `null` | Accepted-but-not-persisted |
| `userId` | Account DTO uses `userId` in link mode | `Guardian.userId` | Account endpoint writes it | Not in guardian presenter | Implemented internally for Parent account linking |

Relationship answers:

| Question | Answer | Evidence |
| --- | --- | --- |
| Can a Guardian exist without a Parent user? | Yes. `CreateGuardianUseCase` writes `userId: null`. | `src/modules/students/guardians/application/create-guardian.use-case.ts` |
| Can a Parent user exist without linked Guardian? | Yes at IAM level. Parent App will not show children without Guardian linkage. | `User`/`Membership` model separation; `ParentAppAccessService` requires Guardian records. |
| Can one Parent user be linked to more than one Guardian? | Prisma allows multiple `Guardian` rows with the same `userId`, but the current guardian account link use case blocks linking a user already found by `findGuardianByUserId` in the active school. | `Guardian.userId` is not unique in `prisma/schema.prisma`; `CreateOrLinkGuardianAccountUseCase.linkExistingUser`; `GuardiansRepository.findGuardianByUserId` |
| Can one Guardian be linked to multiple students? | Yes. | `StudentGuardian` many-to-many model and `GuardiansRepository.linkGuardianToStudent` |
| Can one student have multiple guardians? | Yes. | `StudentGuardian` unique pair constraint, not one-to-one |
| What enforces primary guardian behavior? | Repository transactions demote existing primary links when promoting another primary, auto-primary the first link, and prevent removing/demoting the last primary link. | `GuardiansRepository.linkGuardianToStudent`, `updateStudentGuardianLink`, `unlinkGuardianFromStudent` |

Parent account behavior:

- Create mode creates a `UserType.PARENT` user and school membership with the `parent` role, then links `Guardian.userId`.
- Link mode requires an existing scoped membership whose user type is `PARENT`.
- The use case records `students.guardian.account_create` or `students.guardian.account_link` audit logs.

## 8. Implemented Enrollment Flow

Routes and permissions:

- `GET /api/v1/students-guardians/enrollments` - `students.enrollments.view`
- `GET /api/v1/students-guardians/enrollments/current` - `students.enrollments.view`
- `GET /api/v1/students-guardians/enrollments/history` - `students.enrollments.view`
- `GET /api/v1/students-guardians/enrollments/academic-years` - `students.enrollments.view`
- `POST /api/v1/students-guardians/enrollments/validate` - `students.enrollments.manage`
- `POST /api/v1/students-guardians/enrollments` - `students.enrollments.manage`
- `POST /api/v1/students-guardians/enrollments/upsert` - `students.enrollments.manage`
- `GET /api/v1/students-guardians/enrollments/:enrollmentId` - `students.enrollments.view`

Core evidence:

- Controller: `src/modules/students/enrollments/controller/enrollments.controller.ts`
- DTO: `src/modules/students/enrollments/dto/enrollment.dto.ts`
- Create use case: `src/modules/students/enrollments/application/create-enrollment.use-case.ts`
- Shared create/audit/seat-limit behavior: `src/modules/students/enrollments/application/shared.ts`
- Placement validation: `src/modules/students/enrollments/domain/enrollment-placement.service.ts`
- Seat limit: `src/modules/platform-admin/application/student-seat-limit-policy.service.ts`

Implemented behavior:

- `studentId` is required and must resolve to an existing scoped student.
- `applicationId` is optional. If provided, `CreateEnrollmentUseCase` calls `EnrollApplicationHandoffUseCase` first.
- The application handoff validates accepted decision/workflow eligibility, then `EnrollmentPlacementService` checks requested year/grade compatibility against the command.
- Academic year is resolved by id or name, and must be active.
- `termId`, if provided, must belong to the resolved academic year.
- `classroomId` is required; section and grade are derived from classroom and validated against `sectionId` / `gradeId` when supplied.
- Existing active enrollment conflicts are blocked, except upsert can return a matching active enrollment.
- Seat limits are checked through `StudentSeatLimitPolicyService.assertCanIncreaseActiveStudentSeats`. If the student already has an active seat, the increment is reduced to avoid double counting.
- Create records an audit log action `students.enrollment.create`; `applicationId` appears only in audit metadata, not in the `Enrollment` row.

Explicit answers:

| Question | Answer |
| --- | --- |
| Does enrollment create a student? | No. It requires an existing `studentId`. |
| Does enrollment create a guardian? | No. |
| Does enrollment create parent/student accounts? | No. |
| Does enrollment update `Application.student`? | No. `Application.student` can only resolve if `Student.applicationId` is populated, and enrollment does not update that field. |
| Does enrollment consume Application handoff only for validation? | Yes. The handoff is used to validate accepted application status/workflow and requested year/grade compatibility. |

## 9. Parent App Visibility Flow

Parent App routes inspected:

- `GET /api/v1/parent/children`
- `GET /api/v1/parent/children/:studentId`
- `GET /api/v1/parent/profile`

Exact child visibility chain:

1. Request context must have an actor.
2. Actor must be `UserType.PARENT`.
3. Request context must have an active membership with school and organization ids.
4. Current-school `Guardian` rows must exist with `Guardian.userId = parent user id` and `Guardian.deletedAt = null`.
5. Linked `User` on the Guardian must be `UserType.PARENT`, `UserStatus.ACTIVE`, and not deleted.
6. `StudentGuardian` links must exist for those guardian ids.
7. Linked `Student` rows must be active, not deleted, and inside the current school/org scope.
8. Active, non-deleted `Enrollment` rows must exist for linked students in the current school scope.
9. Child/profile detail adapters re-read enrollments/students through scoped Prisma before presenting data.

Evidence:

- `src/modules/parent-app/shared/parent-app-domain.ts` builds and validates parent context.
- `src/modules/parent-app/access/parent-app-access.service.ts` orchestrates guardian, link, and enrollment checks.
- `src/modules/parent-app/access/parent-app-guardian-read.adapter.ts` filters current parent guardians, linked active students, and active owned enrollments.
- `src/modules/parent-app/children/application/list-parent-children.use-case.ts` and `src/modules/parent-app/children/infrastructure/parent-children-read.adapter.ts` compose child cards/details.
- `src/modules/parent-app/profile/application/get-parent-profile.use-case.ts` and `src/modules/parent-app/profile/infrastructure/parent-profile-read.adapter.ts` compose profile data.

Student App dependency, inspected only for account activation/visibility:

- `src/modules/student-app/shared/student-app-domain.ts` requires actor `UserType.STUDENT` and active membership.
- `src/modules/student-app/access/student-app-student-read.adapter.ts` requires `Student.userId = actor.id`, active non-deleted Student, linked active non-deleted `UserType.STUDENT`, and active Enrollment.

## 10. End-to-End Current Flows

### Flow A - Applicant Portal to Admissions

1. Applicant creates account: `UserType.APPLICANT`, `ApplicantProfile`, no Membership.
2. Applicant discovers active schools and required documents.
3. Applicant creates `ApplicantAdmissionRequest` in `DRAFT`.
4. Applicant uploads documents into `ApplicantAdmissionRequestDocument` and private `File`.
5. Applicant submits request.
6. Submit transaction creates Admissions `Application`, stores `applicationId` on the request, and bridges uploaded applicant docs to `ApplicationDocument`.
7. Admissions reviews documents/tests/interviews and creates `AdmissionDecision`.
8. Accepted application can produce handoff draft data.
9. No operational conversion occurs.

### Flow B - School-created student/guardian registration

1. School creates Student through Students module.
2. School creates Guardian through Guardians module.
3. School links Guardian to Student through `StudentGuardian`.
4. School creates or links Parent account for Guardian if Parent App access is needed.
5. School creates or links Student account if Student App access is needed.
6. School creates Enrollment for the existing Student.
7. Parent App can see the child only after parent user, guardian link, active student, and active enrollment are all present.
8. Student App can see the student surface only after student user, active student, and active enrollment are present.

### Flow C - Admissions accepted application handoff

1. Application reaches `ACCEPTED` through `AdmissionDecision`.
2. Admissions handoff endpoint validates required placement tests/interviews and accepted decision.
3. Handoff response returns:
   - `studentDraft.fullName`
   - `guardianDrafts: []`
   - requested academic year/grade draft data
4. Enrollment endpoint may accept `applicationId`, but only to validate handoff compatibility for an existing `studentId`.
5. Manual student, guardian, account, link, and enrollment work remains.

## 11. Gap Matrix

| Gap / classification | Evidence | Risk | User impact | Backend area | Frontend/API contract impact | Priority | Recommended sprint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| No accepted applicant conversion | ADR-0003 defers conversion; Applicant submit writes `Application`/docs only; Admissions handoff presenter returns drafts only; e2e tests assert no student lifecycle side effects | High | Accepted applicants do not become operational students/parents automatically | Applicant Portal, Admissions, Students, IAM | Frontend cannot assume "accept" activates registration | High | ADM-REG-1B then ADM-REG-1E |
| No unified registration wizard API | Controllers are separate for students, guardians, accounts, links, enrollments; search found no registration/wizard orchestration in `src/` | High | Staff must sequence multiple calls correctly | Students/Guardians/Enrollments/IAM | Multi-step frontend must handle partial state and recovery | High | ADM-REG-1B, then ADM-REG-1D |
| Student rich profile fields accepted/presented but not persisted | `StudentDto` accepts Arabic parts, gender, nationality, contact; `Student` Prisma lacks fields; presenter returns nulls | High | Data entered by frontend can be silently lost or appear unsupported after save | Students | Contract mismatch for registration forms | High | ADM-REG-1C |
| Guardian rich profile fields accepted/presented but not persisted | `GuardianDto` accepts secondary phone, national id, job title, workplace, pickup/notification flags; Prisma lacks fields; presenter returns nulls | High | Parent/guardian profile details can be lost or appear unsupported | Guardians | Contract mismatch for registration forms | High | ADM-REG-1C |
| Application handoff returns `guardianDrafts` empty | `presentApplicationEnrollmentHandoff` hardcodes `guardianDrafts: []` | Medium | Accepted application cannot prefill guardian registration | Admissions | Frontend cannot rely on guardian draft data | Medium | ADM-REG-1B / ADM-REG-1E |
| `Student.applicationId` not populated by normal student creation | `CreateStudentUseCase` writes `applicationId: null`; enrollment has no `applicationId`; no enrollment update writes Student.applicationId | Medium | Accepted-app-to-student traceability is missing in normal flow | Students/Enrollments | Frontend cannot query student by originating application through normal create | Medium | ADM-REG-1B |
| Parent App activation depends on manual account/link/enrollment sequence | Parent App access requires Parent user + active membership + Guardian.userId + StudentGuardian + active Student + active Enrollment | High | Parent cannot see child until every manual step is complete | Parent App, Students, IAM | Frontend onboarding must expose missing prerequisites | High | ADM-REG-1B / ADM-REG-1D |
| No one-transaction registration flow | Separate create/link/enroll/account endpoints; no shared registration transaction service found | High | Partial registration can leave inconsistent operational state | Students/Guardians/Enrollments/IAM | Frontend must recover from partial failures | High | ADM-REG-1D after contract lock |
| Applicant remains Applicant after acceptance | ADR-0003; submit/decision/handoff code does not mutate `User.userType` or create Membership | Medium | Applicant cannot become Parent/Student identity automatically | Applicant Portal/IAM | Applicant Portal and Parent App remain separate identities | High | ADM-REG-1E |
| No applicant-to-parent transition | ADR-0003 explicitly deferred; no code path links Applicant user to Guardian/Parent account | High | Accepted applicant parent must be created/linked manually | IAM/Students/Applicant Portal | Frontend must not promise automatic parent activation | High | ADM-REG-1B / ADM-REG-1E |
| Document review accept/reject lifecycle | Basic lifecycle is implemented, not missing: `ReviewApplicationDocumentUseCase` handles accept/reject/request-replacement; 19A closeout confirms no conversion side effects | Low for basic review; future risk if richer review notes/notifications are expected | Applicant can be asked for replacement; no conversion follows | Admissions documents | Do not classify as missing basic review; classify only richer review UX as future scope if needed | Low/Medium | Not next unless frontend requires richer review |
| No clear frontend/backend contract for registration form payload | Backend DTOs accept more fields than Prisma persists; frontend repo is not present in this backend workspace | High | Frontend may build forms that save null-only data | API contracts, Students, Guardians | Needs explicit decision before implementation | High | ADM-REG-1B |

## 12. Frontend / Backend Contract Risk

The frontend repository is not available in this backend repository. This audit therefore compares backend DTOs, presenters, Prisma schema, runtime code, and backend governance/closeout docs only. A later frontend-backed audit should inspect actual frontend pages, forms, adapter contracts, and state assumptions.

High-risk backend contract surfaces:

- Student Arabic/English name parts: `father_name_en`, `grandfather_name_en`, `first_name_ar`, `father_name_ar`, `grandfather_name_ar`, `family_name_ar`, and `full_name_ar` are accepted by DTOs but not stored as dedicated fields.
- Student gender/nationality/contact fields: accepted by DTOs and present in response DTOs, but not stored and returned as null.
- Guardian rich fields: `phone_secondary`, `national_id`, `job_title`, `workplace`, `can_pickup`, and `can_receive_notifications` are accepted by DTOs but not stored and returned as null.
- Registration flow expectations: backend has separate student, guardian, link, account, and enrollment endpoints. It does not expose a single registration wizard command or transaction.
- Application-to-student conversion expectations: accepted application handoff does not create a student and does not populate `Student.applicationId`.

Contract interpretation:

- If frontend treats these DTO fields as durable fields, the contract is currently misleading.
- If frontend treats these fields as future placeholders, the backend should document that explicitly in the API contract before implementation continues.
- The safest next step is a decision-lock sprint that chooses whether to persist these fields, remove them from contracts, or mark them as intentionally null-only until later.

## 13. Security / Tenancy Findings

Implemented and aligned:

- Applicant boundary is route-local. `ApplicantPortalAccessService` requires active APPLICANT actor, no active membership, no existing active memberships, and an applicant profile.
- Applicant ownership checks are explicit through `applicantUserId`, `requestId`, and document ownership filters in `ApplicantPortalRepository`.
- Admissions, Students, Guardians, and Enrollments require active school scope through `requireApplicationsScope` or `requireStudentsScope`.
- Parent App uses current active membership school scope and read adapters over `prisma.scoped`.
- Student App uses current active membership school scope and requires `Student.userId` ownership.
- No global guard weakening was found in the inspected applicant/admissions/student/parent paths.

School scope findings:

- `src/infrastructure/database/school-scope.extension.ts` includes core operational models such as `Lead`, `Application`, `ApplicationDocument`, `PlacementTest`, `Interview`, `AdmissionDecision`, `Student`, `Guardian`, `StudentGuardian`, `Enrollment`, `StudentDocument`, `StudentMedicalProfile`, and `StudentNote` in `SCHOOL_SCOPED_MODELS`.
- `AdmissionRequiredDocument`, `ApplicantAdmissionRequest`, and `ApplicantAdmissionRequestDocument` are not listed in `SCHOOL_SCOPED_MODELS`. Current Applicant Portal code manually filters these by active school/org and applicant ownership. Future school-side direct routes over these models should add explicit security tests or revisit school-scope registration.

Future security tests needed before conversion implementation:

- Accepted applicant conversion must test cross-school guessed application/request ids.
- Conversion must test applicant ownership and school-side permissions separately.
- Parent account creation/linking from applicant identity must test duplicate identities, existing parent accounts, and cross-school membership behavior.
- One-transaction registration must test partial failure rollback across Student, Guardian, StudentGuardian, Enrollment, User, Membership, and audit writes.

## 14. Recommended Stop/Go Decision

Decision: do not implement accepted-applicant conversion yet.

Reason: the repository has enough evidence that conversion is intentionally deferred and that the registration data contract is not locked. Implementing conversion now would require choosing unresolved product/security semantics:

- whether the applicant user becomes a parent, links to an existing parent, or remains separate;
- which student and guardian rich fields are real persisted fields;
- whether accepted application conversion creates accounts immediately or only drafts operational records;
- how one-transaction rollback, audit logging, and Parent App activation should work.

Go next with a decision-lock sprint that chooses one registration path and formalizes backend contracts before runtime changes.

## 15. Recommended Sprint Plan

### Track 1 - Students/Guardians Contract Repair

Sprint name: `ADM-REG-1C - Student Guardian Profile Persistence Repair`

Type: implementation, but only after `ADM-REG-1B`.

Scope:

- Decide and implement durable storage for currently accepted rich Student/Guardian fields, or remove/mark those fields from contracts.
- Add migrations, DTO/presenter updates, focused tests, and migration-safe backfill behavior if persistence is chosen.

Explicit non-goals:

- No applicant conversion.
- No registration wizard.
- No Parent App flow changes except response consistency if fields become durable.

Dependencies:

- `ADM-REG-1B` must lock which fields are supported in V1.

### Track 2 - School Registration Wizard

Sprint name: `ADM-REG-1D - School Registration Wizard Foundation`

Type: implementation, after contract lock and preferably after field repair.

Scope:

- Add a school-side orchestration API for creating/linking Student, Guardian, StudentGuardian, parent/student accounts, and Enrollment in one recoverable workflow.
- Define rollback, audit, duplicate handling, and idempotency semantics.

Explicit non-goals:

- No applicant identity conversion unless explicitly included later.
- No advanced finance/HR/wallet/marketplace/smart-pickup features.

Dependencies:

- `ADM-REG-1B` registration path decision.
- Track 1 decision for field persistence.

### Track 3 - Accepted Applicant Conversion

Sprint name: `ADM-REG-1E - Accepted Applicant Conversion Audit`

Type: audit/decision-lock first, implementation later.

Scope:

- Choose exact accepted-application conversion semantics.
- Decide applicant user transition/link policy.
- Decide whether conversion creates operational records directly, opens a wizard prefilled from Admissions, or only creates drafts.

Explicit non-goals:

- No runtime conversion in the audit sprint.
- No mutation of global guard behavior or schoolScope without ADR update.

Dependencies:

- ADR-0003 update or explicit decision record if applicant-to-parent semantics change.
- `ADM-REG-1B` decision lock.

Recommended immediate next sprint:

`ADM-REG-1B - Registration Contract Decision Lock`

Type: audit/decision-lock.

Limited scope:

- Lock the V1 registration path: manual wizard first, accepted-applicant conversion first, or shared foundation first.
- Lock supported Student/Guardian fields.
- Lock applicant-to-parent/student identity policy.
- Lock handoff response requirements.

Explicit non-goals:

- No runtime implementation.
- No migrations.
- No frontend changes unless separately scoped.

## 16. Final Verdict

ADM_REG_1A_READY_FOR_DECISION_LOCK

The backend evidence is sufficient to proceed to a decision-lock sprint. The current implementation supports applicant intake, Admissions review, manual operational registration, and app visibility after manual linking/enrollment. It does not support full automated registration or accepted applicant conversion, and that gap is aligned with ADR-0003 rather than an accidental missing endpoint. The unknown frontend contract is important, but it does not block this backend reality audit; it should be handled in the next decision-lock sprint or a separate frontend-backed audit.
