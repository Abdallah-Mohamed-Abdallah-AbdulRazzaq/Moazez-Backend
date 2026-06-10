# Sprint 18D — Applicant Request Ownership and Required Documents Contract Audit

## 1. Purpose and Scope

Sprint 18D is documentation-only. It decides the safest future backend contract before any schema, route, DTO, controller, use-case, repository, presenter, guard, decorator, test, seed, or runtime implementation is changed.

This audit analyzes and decides the future contract for:

- applicant-owned admission requests
- required admission documents
- document ownership and linking boundaries
- relationship between Applicant Portal and Admissions Core
- school-side visibility of applicant requests
- status mapping
- future implementation sequencing

The only intended changed file is:

- `docs/sprint-18d-applicant-request-ownership-required-documents-contract-audit.md`

Explicitly out of scope for Sprint 18D:

- runtime code
- schema changes
- migrations
- tests
- package scripts
- route creation
- request submission implementation
- document upload implementation
- required document runtime implementation
- accepted-application conversion
- parent/guardian/student/enrollment creation
- project structure update

No implementation is authorized by this audit alone.

## 2. Baseline and Completed Applicant Portal State

Current baseline:

- `124d0cd docs: update project structure after applicant portal discovery`

Current implemented Applicant Portal routes:

- `POST /api/v1/applicant-portal/accounts`
- `GET /api/v1/applicant-portal/profile`
- `GET /api/v1/applicant-portal/schools`
- `GET /api/v1/applicant-portal/schools/:schoolId`

Current established rules:

- Applicant account creation uses `UserType.APPLICANT`.
- Applicant accounts have no school membership and no organization membership.
- `ApplicantProfile` exists and is linked one-to-one to the applicant user.
- Applicant profile access is route-local through Applicant Portal access checks.
- Applicant school discovery is public-safe and returns active schools from active organizations only.
- Applicant school discovery does not expose internal tenant fields, feature controls, entitlement data, staff data, counts, raw storage keys, or deleted/inactive schools.
- No applicant request/application submission route exists yet.
- No required admission documents route exists yet.
- No applicant-owned documents exist yet.

The Sprint 18B and 18C tests explicitly assert that these deferred routes are still absent:

- `GET /api/v1/applicant-portal/schools/:schoolId/admission-required-documents`
- `POST /api/v1/applicant-portal/requests`
- `GET /api/v1/applicant-portal/requests`
- `GET /api/v1/applicant-portal/requests/:requestId`

## 3. Product Logic Restatement

Applicant Portal is an optional onboarding and acquisition path. It does not replace the normal school-managed Guardian/Parent account flow.

Both flows are valid and must remain separate.

### Existing school-managed parent/guardian flow

- School creates or links Guardian/Parent.
- The operational user becomes `UserType.PARENT`.
- Parent App access is based on linked children and active school context.
- The access chain is Guardian -> StudentGuardian -> active Enrollment -> current school context.

### Optional Applicant Portal flow

- External pre-admission user creates `UserType.APPLICANT`.
- Applicant has no school membership and no organization membership.
- Applicant chooses a school from safe public discovery.
- Applicant submits an admission request for a child.
- The selected school can later review the submitted request.
- Applicant may later be converted or linked to Guardian/Parent after acceptance through a separate workflow.

This distinction must be preserved in all future design. Applicant Portal must not make Applicant accounts behave like Parent accounts, and school-created Parent accounts must not be forced through Applicant Portal.

## 4. Current Admissions Core Findings

Current admission applications are represented by the Prisma model `Application`, mapped to the `admission_applications` table.

Current `Application` fields:

- `id`
- `schoolId`
- `organizationId`
- `leadId`
- `studentName`
- `requestedAcademicYearId`
- `requestedGradeId`
- `status`
- `source`
- `submittedAt`
- `createdAt`
- `updatedAt`
- `deletedAt`

Current `Application` relations:

- `school`
- `organization`
- optional `lead`
- optional `requestedAcademicYear`
- optional `requestedGrade`
- `documents`
- `placementTests`
- `interviews`
- optional `decision`
- optional `student`

The current DTO that creates applications is `CreateApplicationDto` with:

- optional `leadId`
- required `studentName`
- optional `requestedAcademicYearId`
- optional `requestedGradeId`
- required `source`

The current create flow uses `CreateApplicationUseCase`. It sets:

- `status = AdmissionApplicationStatus.DOCUMENTS_PENDING`
- `submittedAt = null`

Current application statuses are:

- `SUBMITTED` -> `submitted`
- `DOCUMENTS_PENDING` -> `documents_pending`
- `UNDER_REVIEW` -> `under_review`
- `ACCEPTED` -> `accepted`
- `WAITLISTED` -> `waitlisted`
- `REJECTED` -> `rejected`

The current create flow requires active school scope through `requireApplicationsScope()`. That helper reads `RequestContext.activeMembership.schoolId`, `organizationId`, `roleId`, actor id, and user type. If no active school membership exists, it throws `auth.scope.missing`.

Current school-dashboard Admissions routes are permission-gated:

- `admissions.applications.view`
- `admissions.applications.manage`
- `admissions.documents.view`
- `admissions.documents.manage`
- `admissions.tests.view`
- `admissions.tests.manage`
- `admissions.interviews.view`
- `admissions.interviews.manage`
- `admissions.decisions.view`
- `admissions.decisions.manage`

The current application model does not support applicant ownership. It has no `applicantUserId`, no `applicantProfileId`, and no applicant request relation.

The current application model does not support detailed child profile data. It stores `studentName` only, plus requested academic year and grade ids. The product request shape needs richer child data such as first name, family name, birth date, gender, nationality, previous school, and notes.

The current application model does not store documents directly. Documents are represented by the separate `ApplicationDocument` model.

The current accepted/handoff flow is preview-only. `POST /api/v1/admissions/applications/:id/enroll` validates accepted status and completed admissions steps, then returns draft student/guardian/enrollment data. It does not create actual `Student`, `Guardian`, `StudentGuardian`, or `Enrollment` records. Existing E2E coverage verifies no student lifecycle side effects are introduced by the handoff preview.

Conclusion: current school-dashboard Admissions routes cannot be reused directly by Applicant Portal. They require school-scoped dashboard context and admissions permissions. Applicant Portal needs its own portal-facing contract and ownership checks, while delegating to Admissions Core only through a future safe application service path.

## 5. Current Files/Documents Findings

There is an `ApplicationDocument` model, mapped to `admission_application_documents`.

Current `ApplicationDocument` fields:

- `id`
- `schoolId`
- `applicationId`
- `fileId`
- `documentType`
- `status`
- `notes`
- `createdAt`
- `updatedAt`

`ApplicationDocument` uses `fileId`, not a raw file URL. The create DTO is `CreateApplicationDocumentDto` and accepts:

- `fileId`
- `documentType`
- optional `status`
- optional `notes`

No `AdmissionRequiredDocument`, `ApplicationRequiredDocument`, or equivalent required-document configuration model exists in the inspected Prisma schema or Admissions/Settings runtime.

Current file upload/download routes are school-scoped:

- `POST /api/v1/files`
- `GET /api/v1/files/:id/download`

Both require active school scope through `requireFilesScope()` and permissions such as `files.uploads.manage` and `files.downloads.view`.

Current file metadata stores raw object storage details internally:

- `bucket`
- `objectKey`
- `originalName`
- `mimeType`
- `sizeBytes`
- `checksumSha256`
- `visibility`

Current file presenters do not expose `bucket` or `objectKey`. File download returns a short-lived signed URL only after authorization. Student document presenters build `/api/v1/files/:fileId/download`, not direct object storage URLs.

There is no current ownership model suitable for applicant-uploaded documents. `File` has nullable `schoolId`, nullable `organizationId`, and nullable `uploaderId`, but existing upload/download use-cases require active school scope and cannot be safely used by membershipless applicants as-is.

Safe reuse options:

- Reuse the `File` metadata concept and object storage adapter.
- Reuse signed download URL creation after authorization.
- Reuse `ApplicationDocument` for school-scoped submitted application documents only after applicant submission creates or links a school-owned Admissions application.
- Add a future applicant-safe file/document boundary for membershipless applicants before exposing upload or download.

Applicant Portal should not store raw URLs or raw storage keys. It should use file ids and metadata through a future applicant-safe file boundary.

## 6. Required Admission Documents Decision Space

### Option A — School-level required documents

Documents are configured per school.

Pros:

- simpler
- easier first implementation
- enough for many schools

Cons:

- less accurate if grades/programs require different documents

### Option B — School + grade required documents

Documents are configured per school and grade.

Pros:

- closer to admissions reality
- supports grade-specific requirements

Cons:

- needs safe public grade availability contract
- more schema and validation

### Option C — Reuse existing dashboard settings if present

Only safe if the repository already has a safe source of truth.

Pros:

- avoids duplication

Cons:

- no current required-document source of truth was found
- may expose internal settings
- may use the wrong ownership boundary
- could leak school operational configuration through public Applicant Portal routes

### Option D — Defer required documents and allow optional documents only

Pros:

- simpler request submission

Cons:

- weak applicant UX
- cannot compute missing documents accurately
- makes `missing_items_count` and progress values unreliable
- pushes required document validation into later school-side manual review

Recommended safest V1 path:

- Introduce a minimal `AdmissionRequiredDocument` or similarly named model in a future sprint.
- Make it school-scoped.
- Include fields such as title, description, mandatory flag, accepted file types, max files, active flag, and sort order.
- Support nullable `gradeId` only if the current `Grade` model can be safely referenced for the selected school.
- Treat school-level requirements as the default.
- Add grade-specific overrides only after a safe public grade availability/read contract is available.
- Expose requirements through an Applicant Portal read-only presenter.
- Do not implement required documents in Sprint 18D.

Because no current required-document configuration model exists, Option C is not available today. Option D is too weak for the requested Applicant Portal contract. Option A with optional future grade specificity is the safest next step.

## 7. Applicant Request Ownership Model Options

### Option A — Extend current AdmissionApplication/Application model

Add `applicantUserId` and possibly applicant child/profile fields to the current `Application` model.

Pros:

- school dashboard can see applicant-submitted applications in the existing Admissions module
- avoids duplicate request lifecycle
- aligns with selected school ownership

Cons:

- current create flow is school-scoped and requires `RequestContext.activeMembership.schoolId`
- current model is too compact for detailed child profile data
- current `DOCUMENTS_PENDING` plus `submittedAt = null` behavior is dashboard-visible and not clearly applicant draft-safe
- applicant ownership must be carefully enforced
- may require nullable fields and presenter mapping

### Option B — Add separate ApplicantAdmissionRequest model

Applicant Portal has its own request model, later promoted or converted into an Admissions Application.

Pros:

- clean applicant ownership
- safe draft workflow
- avoids disrupting Admissions Core
- supports richer child/request data without forcing it into dashboard Application immediately

Cons:

- creates two lifecycle models
- requires promotion/sync logic
- school dashboard visibility may need new intake queue or application bridge

### Option C — Hybrid

Create an applicant-owned request model and create/link an Admissions application only on submit.

Pros:

- supports applicant draft safely
- keeps submitted data visible to Admissions
- avoids exposing drafts in the school dashboard
- keeps applicant ownership checks independent from school membership
- lets current Admissions statuses remain the school-side source after submission

Cons:

- more complex lifecycle
- needs transaction and clear idempotency
- needs a link between applicant request and Admissions application
- needs careful status synchronization/presenter mapping

### Option D — Do not persist draft; create Admissions application only on final submission

Pros:

- simple
- lower schema complexity

Cons:

- no applicant draft
- no missing document progress until submit
- harder UX
- cannot support applicant portal request cards before final submission

Recommended V1 path:

Use Option C, the hybrid model.

Add a small applicant-owned request model in a future sprint, tentatively `ApplicantAdmissionRequest`, with selected school, applicant profile/user, child details, requested grade/year, draft/submitted lifecycle, and nullable link to an Admissions `Application`.

On final submit, create or link a school-scoped `Application` row in the Admissions Core inside a transaction. That row makes the request visible to the selected school's Admissions dashboard. The applicant-owned request remains the ownership anchor for Applicant Portal list/read/update actions.

This is safer than extending `Application` directly for drafts because the current `Application` model is school-scoped, permission-gated, compact, and dashboard-visible. It is also safer than a fully separate lifecycle because schools must eventually see submitted requests in Admissions.

## 8. Recommended V1 Contract

These routes are proposed only. They do not exist today.

Do not copy raw ADR paths literally. Product paths must be mapped under `/api/v1` and reconciled with backend module boundaries.

| Route | Auth requirement | Actor type | High-level request shape | High-level response shape | Ownership rule | Admissions Core touch? | Requires schema/migration? | Sprint |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/applicant-portal/schools/:schoolId/admission-required-documents` | Public-safe; may accept anonymous or applicant token but response must be identical | Anonymous or `APPLICANT` | `schoolId`; optional future `gradeId` query only after safe grade contract exists | Array of safe document requirements: id, title, description, isMandatory, accepted file types, maxFiles, sortOrder | Only active discoverable school configuration is exposed | Reads required-document model, not application rows | Yes, if new model is added | Sprint 18E |
| `POST /api/v1/applicant-portal/requests` | Authenticated | `UserType.APPLICANT` only | selected `schoolId`, child details, requested grade/year, previous school, notes; no file upload in first pass | Applicant request card/detail with request id, school summary, child summary, status `draft`, progress, missing count | Creates only the authenticated applicant's request | No Admissions application until submit | Yes | Sprint 18F |
| `GET /api/v1/applicant-portal/requests` | Authenticated | `UserType.APPLICANT` only | optional filters/pagination later | List of applicant request cards | Return only requests where `applicantUserId` is current actor | May read linked application status for submitted requests | Yes | Sprint 18F |
| `GET /api/v1/applicant-portal/requests/:requestId` | Authenticated | `UserType.APPLICANT` only | `requestId` | Applicant request detail with child, school, required docs summary, uploaded docs summary when implemented, status/progress | 404 for another applicant's request id | May read linked application status | Yes | Sprint 18F |
| `PATCH /api/v1/applicant-portal/requests/:requestId` | Authenticated | `UserType.APPLICANT` only | editable draft fields; possibly limited applicant action fields | Updated request detail | Own request only; draft-only unless future policy allows specific needs-action edits | No direct Admissions mutation for draft edits | Yes | Optional Sprint 18F or deferred |
| `POST /api/v1/applicant-portal/requests/:requestId/submit` | Authenticated | `UserType.APPLICANT` only | no body or confirmation/idempotency key | Submitted request card/detail with linked application id omitted or safely represented | Own draft request only; selected school must still be active/discoverable | Yes, creates or links school-scoped Admissions `Application` transactionally | Yes | Sprint 18G |

Applicant request routes should use the existing Applicant Portal access pattern:

- `AllowApplicantPortalAccess` only on Applicant Portal authenticated routes.
- `ApplicantPortalAccessService` or a similarly narrow route-local service.
- Explicit applicant ownership checks.
- No school membership requirement for applicant-owned reads/writes.
- No weakening of global guard, permission, or `schoolScope` behavior.

## 9. School-Side Visibility Contract

The selected school must eventually see applicant requests submitted to it.

Recommendation:

- School Dashboard Admissions should include applicant-submitted requests after submission.
- Applicant drafts should not appear in the school dashboard.
- Applicant requests should become current Admissions `Application` rows immediately on submit.
- The submitted `Application` row should remain school-scoped and protected by the existing `schoolScope` extension and admissions permissions.
- A separate applicant intake queue can be added later if product wants a distinct workflow, but V1 should avoid creating a parallel school-side queue unless the dashboard contract requires it.

Who can review submitted applicant requests:

- School users with existing admissions view/manage permissions can view and process them.
- Existing permissions should apply:
  - `admissions.applications.view`
  - `admissions.applications.manage`
  - `admissions.documents.view`
  - `admissions.documents.manage`
  - `admissions.tests.view/manage`
  - `admissions.interviews.view/manage`
  - `admissions.decisions.view/manage`

Safe school staff visibility:

- applicant full name
- applicant email/contact email
- applicant phone number if provided
- applicant city if provided
- applicant relationship
- child full name and application child details
- requested grade/year
- previous school and notes
- uploaded document metadata after submission

Unsafe school staff visibility:

- applicant password or credential state
- sessions/tokens
- unrelated applicant requests to other schools
- raw file bucket/object keys
- internal platform feature controls
- internal public discovery filtering internals

Cross-school leakage is avoided by creating the submitted Admissions `Application` with the selected school's `schoolId` and `organizationId`, then relying on the existing school-scoped Admissions repositories for school-dashboard reads. Applicant Portal reads must not use the school dashboard queue and must instead check applicant ownership by current actor.

Applicant should never read the school's internal Admissions queue. School users should see only requests submitted to their own school. Platform Admin is not part of Sprint 18D unless future governance explicitly requires it.

## 10. Status Mapping and Lifecycle

Current Admissions Core statuses:

- `submitted`
- `documents_pending`
- `under_review`
- `accepted`
- `waitlisted`
- `rejected`

Proposed Applicant Portal presenter statuses:

- `draft`
- `submitted`
- `needs_action`
- `under_review`
- `waitlisted`
- `accepted`
- `rejected`

Recommended internal strategy:

- Applicant-owned request model owns `draft` before submission.
- `draft` should not be represented as a school-dashboard `Application` row.
- On submit, create/link a school-scoped `Application`.
- After submit, Admissions Core status becomes the review source of truth.
- Applicant Portal presenter maps internal request/application state to applicant-facing status labels.

Recommended mapping:

| Applicant-facing status | Internal source |
| --- | --- |
| `draft` | Applicant request exists with no `submittedAt` and no linked submitted application |
| `submitted` | Linked `Application.status = SUBMITTED` and no required applicant action is pending |
| `needs_action` | Linked `Application.status = DOCUMENTS_PENDING` after submission, or required documents are missing, or school requests applicant correction |
| `under_review` | Linked `Application.status = UNDER_REVIEW` |
| `waitlisted` | Linked `Application.status = WAITLISTED` |
| `accepted` | Linked `Application.status = ACCEPTED` |
| `rejected` | Linked `Application.status = REJECTED` |

`documents_pending` should not be shown literally in Applicant Portal unless product wants internal labels. The likely applicant-facing label is `needs_action`.

Progress value should be presenter-derived, not stored as source of truth. A safe V1 calculation:

- Draft with minimum child/school data: low progress.
- Submitted with all required documents: medium progress.
- Needs action: medium progress but blocked by missing items.
- Under review: higher progress.
- Waitlisted: high but non-terminal.
- Accepted/rejected: terminal progress.

Missing documents count should be derived from active required-document configuration minus complete linked applicant/request/application documents. It should not be manually stored unless later performance requires a denormalized cache.

Draft status can be represented by a separate request model and nullable `submittedAt`. If the team instead extends `Application`, draft would require nullable `submittedAt`, but that is riskier because current dashboard application lists already include `DOCUMENTS_PENDING` rows.

Submitted requests should not be freely editable. V1 should allow:

- draft edits before submit
- document replacement or missing-document action through a controlled future document route
- no applicant mutation of school review, tests, interviews, decisions, or enrollment handoff

## 11. Document Upload and Ownership Boundary

Future document upload actors:

- Applicant uploads applicant-owned admission documents before or after creating a draft request.
- School staff may view submitted documents after the request is submitted to their school.
- School staff may later request missing documents through Admissions workflow, but that mutation is deferred.

Recommended future safe path:

- Create request first, then upload/link documents to that request.
- Allow pre-request upload only if a temporary upload session model exists; otherwise avoid orphaned applicant files.
- Store file bytes in object storage.
- Store metadata in `File`.
- Link uploaded files through a future applicant-safe request document model, tentatively `ApplicantAdmissionRequestDocument`.
- On submit, link or copy document metadata into school-scoped `ApplicationDocument` rows for the submitted Admissions `Application`.

Ownership enforcement:

- Before submission, applicant can access only files linked to their own applicant request.
- Before submission, applicant can delete or replace own draft documents if request is still editable.
- After submission, applicant access remains through Applicant Portal ownership checks, not generic school-scoped file permissions.
- After submission, school access is through the selected school's submitted `Application` and document relation.
- Cross-applicant and cross-school access must return 404-style not found responses where resource existence would otherwise leak.

School document access:

- School users with `admissions.documents.view` should view document metadata for their own submitted applications.
- School users with `admissions.documents.manage` should manage document review state if that is implemented later.
- School users should not receive raw storage keys.

Signed download URL rules:

- Raw bucket/object keys must never be returned.
- Direct permanent object storage URLs must not be returned for private documents.
- Signed download URLs should be issued only after checking applicant ownership or school-scoped admissions access.
- The existing generic `/api/v1/files/:id/download` route is school-scoped and not sufficient for applicant-owned files.
- A future applicant document download route or document-aware download service should authorize by request/document ownership before creating the signed URL.

Do not implement any file route in Sprint 18D.

## 12. Security and Tenancy Requirements

Future runtime must satisfy all of these requirements:

- Applicant can access only own requests.
- Applicant cannot guess another applicant's request id.
- Applicant cannot submit request for inactive, suspended, archived, or deleted school.
- Applicant cannot submit request for a school whose organization is inactive, suspended, archived, or deleted.
- Applicant cannot submit request that creates membership.
- Applicant cannot create `Student`, `Guardian`, `StudentGuardian`, or `Enrollment` directly.
- Applicant cannot mutate admissions decision.
- Applicant cannot access school dashboard admissions queue.
- Applicant cannot access Parent App child routes through applicant identity.
- School users can see only requests submitted to their own school.
- Parent, Teacher, and Student users cannot act as applicants.
- Public required documents route must expose only safe configuration.
- Required documents route must not leak internal settings, feature controls, entitlement data, staff data, billing data, or operational queues.
- File access must be applicant-owned before submission and school-scoped after submission, according to the future design.
- Raw storage keys and buckets must never be exposed in API responses.
- Signed download URLs must be guarded by ownership or school scope.
- `schoolScope` and global guards must not be weakened.
- Any platform/school bypass must be explicitly justified and tested.
- Applicant routes should use route-local applicant access checks rather than granting applicants school roles or permissions.

Current Sprint 18B/18C security tests already prove applicant tokens are rejected from Parent, Student, Teacher, Admissions dashboard, and Platform Admin surfaces. Future request/document tests must preserve those guarantees.

## 13. Data Model Gap Matrix

| Concern | Current state | Gap | Candidate design | Recommended decision | Requires migration? | Risk level |
| --- | --- | --- | --- | --- | --- | --- |
| applicant request ownership | `ApplicantProfile` exists; `Application` has no applicant owner | No applicant can own/list/read requests | Add `ApplicantAdmissionRequest` with `applicantUserId` and `applicantProfileId` | Use applicant-owned request model as ownership anchor | Yes | High |
| link to school | Public discovery returns active school ids; `Application` is school-scoped | Applicant request needs selected school before membership | Store selected `schoolId` and `organizationId` on applicant request after validating discoverability | Required | Yes | High |
| link to applicant profile/user | `ApplicantProfile.userId` exists | No request relation to applicant | FK to `User` and `ApplicantProfile` | Required | Yes | High |
| child details | `Application.studentName` only | Product needs detailed child profile data | Store normalized child snapshot JSON or explicit columns on request model | Prefer explicit columns for V1 essentials; avoid operational `Student` | Yes | High |
| requested grade/year | `Application` has optional `requestedAcademicYearId` and `requestedGradeId`; `Grade` is school-scoped | Applicant needs safe school-selected grade/year validation | Store requested grade/year on request; validate against selected school | Required; grade optional until safe public grade contract | Yes | Medium |
| required documents | No required-document model found | Cannot compute missing docs | Add `AdmissionRequiredDocument` school-scoped model | Required before reliable missing count | Yes | Medium |
| uploaded documents | `ApplicationDocument` exists with `fileId`; no applicant document link | Applicant uploads need ownership and draft support | Add applicant request document link; bridge to `ApplicationDocument` on submit | Required for applicant upload sprint | Yes | High |
| draft/submitted lifecycle | Current `Application` uses `DOCUMENTS_PENDING` + `submittedAt = null` | Dashboard-visible draft is unsafe for applicant drafts | Draft on applicant request; submit creates/links `Application` | Hybrid model | Yes | High |
| school dashboard visibility | Dashboard lists school-scoped `Application` rows | Applicant requests would be invisible if only applicant model exists | Create/link `Application` on submit | Required | Yes | High |
| applicant list/read ownership | Applicant profile read exists only for current user | No request read ownership | Query by current `applicantUserId`; 404 on mismatch | Required | Yes | High |
| file ownership | Files are school-scoped; `File.uploaderId` exists | No membershipless applicant file authorization | Applicant-specific file/document boundary | Required before upload | Maybe/Yes | High |
| status mapping | Core statuses exist; portal statuses differ | Need applicant-friendly labels | Presenter mapping over request + application state | Required | No/Maybe | Medium |
| accepted conversion | Handoff preview only; no operational records created | No accepted applicant conversion | Future accepted-application workflow | Defer | Likely Yes | High |
| audit logging | Applicant account create and admissions decisions audited | Request submission/document actions not audited yet | Add explicit audit logs for submit and sensitive document actions | Required for runtime | No schema if using existing audit log | Medium |
| notifications/email | Email delivery exists; no applicant notifications | No applicant notifications contract | Defer or add event later | Defer | Maybe | Low |
| feature control enforcement | `applicant_portal` feature control exists as governance/config | Discovery currently filters active schools, not feature gate | Future route may check feature control only if product approves public gating | Defer enforcement decision | No/Maybe | Medium |
| parent/guardian linking | Guardian/Student account linking exists in Students module | No applicant-to-parent conversion policy | Future accepted workflow creates/links Guardian/Parent separately | Defer | Maybe/Yes | High |

## 14. Proposed Future Sprint Breakdown

### Sprint 18E — Required Documents Read Model

- Add schema/model if needed.
- Add school-scoped required document configuration.
- Support optional `gradeId` only if grade visibility/validation is safe.
- Add applicant-safe read endpoint:
  - `GET /api/v1/applicant-portal/schools/:schoolId/admission-required-documents`
- Keep response public-safe.
- Do not add request submission yet.

### Sprint 18F — Applicant Request Ownership Foundation

- Add applicant-owned request schema and ownership relation.
- Store selected school and applicant child details.
- Add create/list/read own requests.
- Add draft status presenter.
- Do not add file upload if too large.
- Do not create Admissions `Application` rows until submit sprint unless explicitly scoped.

### Sprint 18G — Applicant Request Submission + School Intake

- Add submit action.
- Transactionally create/link school-scoped Admissions `Application`.
- Make submitted requests visible to the selected school's Admissions list.
- Add applicant portal status presenter over linked Admissions status.
- Add security tests for cross-applicant and cross-school denial.

### Sprint 18H — Applicant Documents Foundation

- Add applicant-safe upload/link document boundary.
- Add missing document count.
- Add replace/delete policy for draft or needs-action states.
- Add signed download authorization for applicant-owned and school-scoped access.
- Bridge applicant documents to `ApplicationDocument` after submission.

### Sprint 18I — Applicant Portal Final Closeout Audit

- Documentation-only final audit.
- Confirm route inventory.
- Confirm deferred accepted-conversion policy.
- Confirm no parent flow replacement.
- Confirm security and tenancy coverage.

This order is safer than submitting requests before required documents because the requested applicant portal card includes `missing_items_count` and progress, which need a real required-document source.

## 15. Testing Plan for Future Runtime

Unit tests:

- request DTO validation
- applicant request ownership policy
- selected school active/discoverable validation
- status mapping
- required document presenter
- missing document count
- file ownership checks
- submit idempotency
- audit payload shape for submit/document actions

E2E tests:

- applicant sees required documents for active school
- applicant cannot see required documents for suspended/archived/deleted school
- applicant creates request for active school
- applicant lists only own requests
- applicant cannot read another applicant request
- applicant cannot submit to suspended/deleted school
- applicant submit creates or links a school-scoped Admissions application
- school dashboard sees only own school submitted applicant requests
- request routes remain unavailable to parent/student/teacher users
- request routes remain unavailable to school users through Applicant Portal

Security tests:

- cross-applicant denial
- cross-school denial
- school user cannot see other school applicant requests
- applicant cannot access admissions dashboard
- applicant cannot create operational student/guardian/enrollment
- applicant cannot mutate decisions, tests, interviews, or enrollment handoff
- applicant file access cannot leak raw keys
- feature controls and entitlements are not leaked
- global guards unchanged
- `schoolScope` unchanged
- any platform/school bypass explicitly tested

Do not run these tests in Sprint 18D because no runtime files are changed.

## 16. Explicit Non-Goals

- no runtime implementation in Sprint 18D
- no schema changes
- no migrations
- no request submission
- no required documents endpoint
- no file upload
- no document linking
- no school dashboard intake implementation
- no applicant-to-parent conversion
- no Guardian creation
- no Student creation
- no StudentGuardian creation
- no Enrollment creation
- no parent flow replacement
- no public exposure of internal admissions queue
- no global guard changes
- no `schoolScope` changes
- no project structure update in this sprint

## 17. Final Recommendation

Recommended request ownership model:

- Use a hybrid model for V1.
- Add a small applicant-owned `ApplicantAdmissionRequest` model in a future sprint.
- Keep applicant drafts in that model.
- On submit, transactionally create/link a school-scoped Admissions `Application` so the selected school can review the request through Admissions.
- Keep Applicant Portal list/read ownership anchored on `applicantUserId` and `ApplicantProfile`, not school membership.

Recommended required documents model:

- Add a minimal school-scoped `AdmissionRequiredDocument` model in a future sprint.
- Make school-level requirements the V1 default.
- Add optional `gradeId` only when the selected school's grade can be safely validated and exposed.
- Expose requirements through `GET /api/v1/applicant-portal/schools/:schoolId/admission-required-documents` as a public-safe read model.

Recommended next sprint:

- Sprint 18E — Required Documents Read Model.

Must remain deferred:

- applicant request submission
- applicant document upload/linking
- applicant-owned file access
- school-side intake implementation beyond future submitted `Application` visibility
- applicant-to-parent conversion
- Guardian/Student/StudentGuardian/Enrollment creation
- admissions decision mutation by applicant
- global guard or `schoolScope` changes

ADR decision:

- A new ADR is probably not needed if implementation stays within ADR-0003 boundaries: route-local Applicant Portal access, no global guard weakening, no `schoolScope` weakening, no applicant membership before acceptance, and no applicant-to-parent conversion.
- A new ADR is required before runtime implementation if the design changes global guard behavior, changes `schoolScope`, defines applicant-to-parent conversion policy, or creates a new cross-school identity model beyond ADR-0003.
