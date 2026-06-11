# Sprint 18N — Applicant Portal Final Closeout Audit

## 1. Purpose and Scope

Sprint 18N is a documentation-only final closeout audit for the full Sprint 18 Applicant Portal workstream, covering Sprint 18A through Sprint 18M.

This audit verifies the implemented Applicant Portal V1 foundation, the intentionally deferred work, the applicant/account boundary, tenancy and file safety, school-scoped Admissions visibility, and readiness for the separate final Sprint 18 project-structure update.

No runtime implementation is authorized by this sprint. This audit must not change runtime code, Prisma schema, migrations, DTOs, controllers, services, repositories, presenters, tests, package scripts, seeds, guards, decorators, `schoolScope`, Admissions runtime, Files runtime, Students runtime, Parent App runtime, `README.md`, `ERROR_CATALOG.md`, or `Moazez-Project-Structure.json`.

The only intended changed file is:

- `docs/sprint-18n-applicant-portal-final-closeout-audit.md`

## 2. Baseline

Baseline:

- `7c68120 feat: bridge applicant documents to admissions`

The repository is expected to be clean before this audit begins. This audit prepares for a separate final Sprint 18 closeout step where `Moazez-Project-Structure.json` is updated once for the whole Applicant Portal workstream.

## 3. Sprint 18 Workstream Summary

| Sprint | Type | Core result | Commit verified from git log | Runtime/schema changed | Verification status visible from scripts/tests |
| --- | --- | --- | --- | --- | --- |
| 18A - Applicant Portal Basic Contract Audit | Docs | Established Applicant Portal as optional pre-admission channel and recommended `UserType.APPLICANT` rather than Parent. | `29a0158 docs: add applicant portal basic contract audit` | No | Docs-only; no runtime verifier expected. |
| ADR-0003 - Applicant Portal Pre-Admission Account Boundary | Docs/ADR | Accepted applicant boundary: membershipless before acceptance, applicant accounts are not Parent accounts, route-local access only. | `c634401 docs: add applicant portal account boundary ADR` | No | ADR; no runtime verifier expected. |
| 18B - Applicant account/profile foundation | Runtime | Added applicant account creation and profile read. | `46aaacf feat: add applicant portal account foundation` | Runtime and schema (`ApplicantProfile`) | `verify:sprint18b` exists; this audit did not rerun it. |
| 18C - Public safe school discovery | Runtime | Added public safe school list/detail discovery. | `2384b1f feat: add applicant portal school discovery` | Runtime | `verify:sprint18c` exists; this audit did not rerun it. |
| 18D - Applicant request ownership / required documents audit | Docs | Recommended hybrid applicant-owned request plus school-scoped Admissions `Application`. | `84e78c8 docs: add applicant request ownership audit` | No | Docs-only; no runtime verifier expected. |
| 18E - Required documents read model | Runtime | Added public-safe required documents endpoint and `AdmissionRequiredDocument`. | `f8686cf feat: add applicant portal required documents` | Runtime and schema | `verify:sprint18e` exists; this audit did not rerun it. |
| 18F - Applicant request ownership foundation | Runtime | Added applicant-owned request create/list/read. | `ce4eb32 feat: add applicant portal request ownership` | Runtime and schema (`ApplicantAdmissionRequest`) | `verify:sprint18f` exists; this audit did not rerun it. |
| 18G - Applicant request submission | Runtime | Added idempotent submit that creates/links exactly one school-scoped Admissions `Application`. | `d73a5ae feat: add applicant portal request submission` | Runtime | `verify:sprint18g` exists; this audit did not rerun it. |
| 18H - Applicant documents/file boundary audit | Docs | Chose dedicated applicant document model and Applicant Portal-specific upload/download routes. | `0f55ca0 docs: add applicant documents file boundary audit` | No | Docs-only; no runtime verifier expected. |
| 18I - Applicant document upload/list/read | Runtime | Added applicant document upload/list/read, private `File` metadata, and safe responses. | `e4af872 feat: add applicant portal document uploads` | Runtime and schema (`ApplicantAdmissionRequestDocument`) | `verify:sprint18i` exists; this audit did not rerun it. |
| 18J - Download/replace/delete/bridge audit | Docs | Established 307 download, append-only replace, soft delete, and bridge policies. | `47dd067 docs: add applicant documents download bridge audit` | No | Docs-only; no runtime verifier expected. |
| 18K - Applicant document download runtime | Runtime | Added applicant document-aware download route with 5-minute signed URL redirect. | `2812f2b feat: add applicant portal document download` | Runtime | `verify:sprint18k` exists; this audit did not rerun it. |
| 18L - Applicant document replace/delete runtime | Runtime | Added append-only replacement and soft delete. | `5372657 feat: add applicant portal document replace delete` | Runtime | `verify:sprint18l` exists; this audit did not rerun it. |
| 18M - ApplicationDocument bridge / school visibility | Runtime | Added `PENDING_REVIEW` and bridged submitted applicant docs to school Admissions documents. | `7c68120 feat: bridge applicant documents to admissions` | Runtime and schema enum migration | `verify:sprint18m` exists; this audit did not rerun it. |

## 4. Final Implemented Applicant Portal API Surface

Account/profile:

- `POST /api/v1/applicant-portal/accounts`
- `GET /api/v1/applicant-portal/profile`

`POST /accounts` is public and creates an active `UserType.APPLICANT` plus `ApplicantProfile`. `GET /profile` is authenticated through `@AllowApplicantPortalAccess()` and `ApplicantPortalAccessService`, requiring an active applicant user with no active membership.

Public discovery:

- `GET /api/v1/applicant-portal/schools`
- `GET /api/v1/applicant-portal/schools/:schoolId`
- `GET /api/v1/applicant-portal/schools/:schoolId/admission-required-documents`

These are public-safe reads. They do not require applicant account creation or school membership and explicitly filter to active schools under active organizations.

Applicant requests:

- `POST /api/v1/applicant-portal/requests`
- `GET /api/v1/applicant-portal/requests`
- `GET /api/v1/applicant-portal/requests/:requestId`
- `POST /api/v1/applicant-portal/requests/:requestId/submit`

These routes require authenticated `UserType.APPLICANT` and route-local applicant access. Ownership is anchored on the current applicant user/profile. Submit creates or reuses exactly one linked, school-scoped Admissions `Application`; applicant responses hide the internal `applicationId`.

Applicant documents:

- `POST /api/v1/applicant-portal/requests/:requestId/documents`
- `GET /api/v1/applicant-portal/requests/:requestId/documents`
- `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId`
- `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download`
- `POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/replacements`
- `DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId`

These routes require authenticated applicant ownership of request and document. Upload/download/replace/delete are document-aware and Applicant Portal-specific; applicants do not use generic Files routes.

School-side Admissions visibility:

- Existing `GET /api/v1/admissions/applications/:applicationId/documents`

School users see bridged submitted applicant documents only through existing school-scoped Admissions documents, gated by `admissions.documents.view` and active school context. Draft applicant documents remain applicant-only.

## 5. Final Data Model Summary

Applicant-side:

- `ApplicantProfile`: one-to-one profile for `UserType.APPLICANT`, storing applicant full name, phone, city, and relationship attributes. It is not a Guardian or Parent account.
- `ApplicantAdmissionRequest`: applicant-owned request/draft/submission anchor. It stores selected school, organization, child/request details, requested academic context, and the nullable link to a school-scoped Admissions `Application`.
- `ApplicantAdmissionRequestStatus`: `DRAFT` and `SUBMITTED`, with applicant-facing labels derived in presenters.
- `ApplicantAdmissionRequestDocument`: applicant-owned document link to private `File` metadata, optional `AdmissionRequiredDocument`, and optional bridged `ApplicationDocument`.
- `ApplicantAdmissionRequestDocumentStatus`: `UPLOADED`, `NEEDS_REPLACEMENT`, `ACCEPTED`, `REJECTED`, `SUPERSEDED`.

Admissions / required documents:

- `AdmissionRequiredDocument`: school-scoped public-safe document requirement configuration. Applicant discovery exposes only safe fields.
- `ApplicationDocument`: school-scoped Admissions document record visible through existing Admissions document routes after bridging.
- `AdmissionDocumentStatus.PENDING_REVIEW`: added so applicant uploads are visible to school Admissions without implying school verification.

Files:

- `File`: private metadata for uploaded objects. Applicant uploads create private `File` rows with school/organization/uploader metadata, but applicant authorization comes from `ApplicantAdmissionRequestDocument`, not from `File.id` alone.

## 6. Applicant Identity and Access Boundary Verification

- Pre-admission users are created as `UserType.APPLICANT`.
- Applicant accounts are not `UserType.PARENT`.
- Applicant accounts remain membershipless before acceptance; `ApplicantPortalAccessService` rejects applicants with active memberships.
- Applicant route access is route-local through `@AllowApplicantPortalAccess()` and `ApplicantPortalAccessService`.
- `ScopeResolverGuard` still requires membership for other non-platform actors and only allows membershipless applicants on explicitly marked Applicant Portal routes.
- Applicant Portal work did not loosen global `ScopeResolverGuard` for Parent/Student/Teacher/Dashboard/Platform routes.
- Prisma `schoolScope` remains in place for existing school-scoped operational models such as `Application`, `ApplicationDocument`, and `File`. Applicant-owned reads use explicit applicant/request/document filters because applicants have no active school membership.
- Audit note: `AdmissionRequiredDocument`, `ApplicantAdmissionRequest`, and `ApplicantAdmissionRequestDocument` were not found in `SCHOOL_SCOPED_MODELS` during this audit. Current Applicant Portal safety is preserved by route-local applicant ownership checks, explicit public-safe school filters, and school-side visibility through scoped `ApplicationDocument`; future school-scoped routes that query these models directly should either add them to the scope registry or keep equivalent explicit scope tests.
- Applicant tokens do not grant Parent App, Student App, Teacher App, school Dashboard, Admissions dashboard, generic Files, or Platform Admin access according to the visible security tests.
- Relationship labels such as `father`, `mother`, `guardian`, and `relative` remain profile attributes, not user types.

## 7. Public Discovery Safety Verification

- Public school discovery filters `School.status = ACTIVE`, `School.deletedAt = null`, active organization status, and non-deleted organizations.
- Suspended, archived, deleted, inactive, and nonexistent schools are not exposed.
- Deleted or inactive organizations are not exposed.
- Public school presenters expose safe display fields only: school id, name, short name, city, country, address, and HTTP/HTTPS logo URL.
- Raw tenant internals, feature controls, entitlement data, staff data, counts, operational records, buckets, and object keys are not exposed.
- Required documents expose only safe requirement fields: id, title, description, mandatory flag, accepted file types, max files, and sort order.
- No school membership or applicant account is required for discovery.

## 8. Applicant Request Ownership Verification

- Request create/list/read is applicant-owned through the authenticated applicant context.
- Cross-applicant request access is queried by current `applicantUserId` and returns not found behavior.
- Requested school must be public-safe/active at create time.
- Submit and document mutation paths revalidate school and organization safety because school/organization status can change after draft creation.
- Requested academic year and grade are validated against the selected school when present.
- Applicant body does not supply trusted `organizationId`, `applicantUserId`, `applicantProfileId`, or `applicationId`; these are derived server-side.
- Applicant request presenters hide tenant/applicant internals and expose only contract fields.

## 9. Submit and Admissions Application Link Verification

- Submit creates or links exactly one school-scoped Admissions `Application`.
- Submit is idempotent: repeated submit for an already submitted request reuses the existing linked application and bridges any still-unbridged active documents.
- Submit revalidates school, organization, requested academic year, and requested grade safety.
- Submit status behavior matches required documents: missing mandatory documents create `DOCUMENTS_PENDING` / applicant `needs_action`; no missing mandatory documents maps to submitted behavior.
- Applicant responses hide `applicationId`.
- School-side visibility is through the linked school-scoped Admissions application and existing Admissions scope/permissions.
- Submit does not create `Student`, `Guardian`, `StudentGuardian`, `Enrollment`, school membership, organization membership, or applicant-to-parent conversion side effects.

## 10. Document Upload/List/Read Verification

- Upload creates a private object and private `File` metadata.
- Upload creates an `ApplicantAdmissionRequestDocument`.
- Upload derives applicant user, school, organization, request, and required document ownership from the authenticated applicant/request state.
- File type, size, empty file, required document ownership, and accepted MIME checks are enforced.
- List/read hide storage internals and expose only safe file metadata.
- List/read hide `applicationDocumentId`.
- Superseded and soft-deleted documents are hidden from normal list/read.
- Downloadable/readable active lifecycle is limited to active non-deleted documents, with download further restricted to `UPLOADED` and `ACCEPTED`.
- `missingItemsCount` is based on applicant documents linked to active mandatory required documents, not school `ApplicationDocument` rows.

## 11. Document Download Verification

- Applicant document-aware download route exists:
  - `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download`
- Generic `/api/v1/files/:id/download` remains school-scoped through `requireFilesScope()` and `files.downloads.view`.
- Applicants cannot use generic Files download.
- Applicant download returns a 307 redirect through `@Redirect(undefined, 307)`.
- Signed URL TTL is 5 minutes (`5 * 60` seconds).
- The signed URL is generated only after applicant/request/document/file ownership authorization.
- Signed URL is not included in upload/list/read responses.
- Bucket, object key, provider URL, and permanent object URL are not exposed.
- Superseded, rejected, needs-replacement, soft-deleted, or deleted-file documents are not downloadable through the normal applicant route.

## 12. Document Replace/Delete Verification

- Replacement is append-only.
- Replacement creates a new object, new `File`, and new `ApplicantAdmissionRequestDocument`.
- Old document becomes `SUPERSEDED`.
- Old `fileId` is not mutated.
- Old object and old `File` metadata are retained; no physical purge exists in this scope.
- Delete is soft-delete only on `ApplicantAdmissionRequestDocument.deletedAt`.
- Delete does not hard-delete `File` metadata or the physical object.
- Deleted/superseded documents are hidden from normal list/read/download.
- `missingItemsCount` updates based on active applicant documents after replace/delete.
- Bridged documents cannot be replaced/deleted in current scope because mutation paths reject documents with `applicationDocumentId`.
- No school review/reopen lifecycle was added.

## 13. ApplicationDocument Bridge Verification

- `AdmissionDocumentStatus.PENDING_REVIEW` exists and maps to API `pending_review`.
- Applicant `UPLOADED` maps to school `pending_review`.
- Applicant `ACCEPTED` can map to school `complete`, but no school-side accept/reject review action currently exists.
- Draft applicant docs do not appear to schools because no `ApplicationDocument` is created before submit.
- Submit bridges active uploaded/accepted applicant docs exactly once by selecting unbridged active documents and storing `applicationDocumentId`.
- Repeated submit does not duplicate the Admissions `Application` and only bridges documents still missing an `applicationDocumentId`.
- Post-submit `DOCUMENTS_PENDING` uploads bridge immediately in the upload transaction.
- Applicant responses hide `applicationDocumentId`.
- Selected school sees bridged docs through existing `GET /api/v1/admissions/applications/:applicationId/documents`.
- Other schools cannot see bridged docs because Admissions applications/documents are school-scoped.
- Applicants cannot access Admissions document routes.
- School document list does not expose bucket, object key, or signed URL.
- No review, accept, reject, reopen, request-replacement, or conversion action exists yet.

## 14. Security and Tenancy Verification

- [x] No global guard weakening was found.
- [x] No global `schoolScope` weakening was found. New applicant/required-document models currently rely on explicit ownership/safe filters rather than automatic school-scope injection.
- [x] No platform bypass was added for applicant work.
- [x] Applicant access to school-scoped routes remains denied.
- [x] School users cannot access applicant draft docs through Applicant Portal routes.
- [x] Cross-applicant request/document access returns not found-style behavior.
- [x] Cross-school Admissions document visibility remains denied.
- [x] Raw storage key leakage is avoided in presenters and tests.
- [x] Signed URLs are not included in upload/list/read responses.
- [x] Visible audit payloads for applicant document actions include ids/outcomes and do not include signed URLs, buckets, object keys, file contents, or full notes.
- [x] Applicant document/request/submit flows create no operational identity side effects.

## 15. Error and Response Safety Verification

- Errors follow project patterns with validation, unauthorized, forbidden/scope missing, not found, conflict, upload size, and MIME error semantics.
- Not-found behavior is used for cross-owner and unsafe target lookups where existence would otherwise leak.
- Applicant request/document/public discovery presenters hide internal fields such as:
  - `organizationId`
  - raw `schoolId` except public/selected school identifiers required by the contract
  - `applicantUserId`
  - `applicantProfileId`
  - `applicationId`
  - `applicationDocumentId`
  - `bucket`
  - `objectKey`
  - signed URLs except redirect `Location`
  - raw enum casing
  - `deletedAt`
- School Admissions document responses expose school-side `ApplicationDocument.id`, `applicationId`, and `fileId` as part of the existing Admissions contract, but still hide raw storage internals and signed URLs.
- Applicant profile response intentionally exposes applicant account/profile identifiers for the profile contract; request and document responses do not expose applicant ownership internals.
- Presenters remain contract-focused and API-safe.

## 16. Test Coverage Summary

Visible unit/module coverage includes:

- Applicant account/profile foundation, relationship validation, access service, and presenter safety.
- School discovery filters, safe public presentation, pagination, and logo URL safety.
- Required document filtering and presenter safety.
- Request ownership, status mapping, missing-count logic, submit idempotency, and submit bridge behavior.
- Document upload/list/read/download/replace/delete safety, file metadata handling, missing-count behavior, bridge behavior, and presenter safety.
- Admissions document presenter/use-case coverage for `pending_review`.
- Files upload/download coverage for safe metadata and generic signed redirect.

Visible e2e coverage includes:

- `test/e2e/applicant-portal-account-foundation.e2e-spec.ts`
- `test/e2e/applicant-portal-school-discovery.e2e-spec.ts`
- `test/e2e/applicant-portal-required-documents.e2e-spec.ts`
- `test/e2e/applicant-portal-request-ownership.e2e-spec.ts`
- `test/e2e/applicant-portal-request-submission.e2e-spec.ts`
- `test/e2e/applicant-portal-documents.e2e-spec.ts`
- `test/e2e/applicant-portal-document-download.e2e-spec.ts`
- `test/e2e/applicant-portal-document-replace-delete.e2e-spec.ts`
- `test/e2e/applicant-portal-document-bridge.e2e-spec.ts`

Visible security/tenancy coverage includes:

- `test/security/tenancy.applicant-portal.spec.ts`
- `test/security/tenancy.applicant-portal-school-discovery.spec.ts`
- `test/security/tenancy.applicant-portal-required-documents.spec.ts`
- `test/security/tenancy.applicant-portal-requests.spec.ts`
- `test/security/tenancy.applicant-portal-request-submission.spec.ts`
- `test/security/tenancy.applicant-portal-documents.spec.ts`
- `test/security/tenancy.applicant-portal-document-download.spec.ts`
- `test/security/tenancy.applicant-portal-document-replace-delete.spec.ts`
- `test/security/tenancy.applicant-portal-document-bridge.spec.ts`
- `test/security/tenancy.admissions.spec.ts`
- Relevant Files security coverage in `test/security/tenancy.files.spec.ts`

Relevant package scripts:

- `verify:sprint18b`
- `verify:sprint18c`
- `verify:sprint18e`
- `verify:sprint18f`
- `verify:sprint18g`
- `verify:sprint18i`
- `verify:sprint18k`
- `verify:sprint18l`
- `verify:sprint18m`

Sprint 18A, ADR-0003, 18D, 18H, and 18J were docs-only and therefore have no runtime verifier requirement.

This Sprint 18N audit did not rerun runtime tests. It references visible package scripts and test files from prior sprint implementation. Recommended final regression before final Sprint 18 closeout is `npm run verify:sprint18m` from a ready local environment, plus the required documentation diff checks.

## 17. Deferred / Explicit Non-Goals

Still deferred:

- School-side document review actions.
- Applicant document accept/reject lifecycle.
- Reopen document collection.
- Accepted applicant conversion.
- Parent/Guardian account linking from applicant.
- Student creation.
- Guardian creation.
- StudentGuardian creation.
- Enrollment creation.
- Parent App activation.
- Applicant-to-parent transition.
- Document retention cleanup / physical purge.
- Advanced Admissions workflow.
- Applicant notifications.
- Email/SMS events.
- Final `Moazez-Project-Structure.json` update.
- Broader UI/client contracts.

## 18. Known Limitations and Risks

- Bridged documents cannot currently be replaced or deleted.
- `PENDING_REVIEW` is visibility-only; no review workflow exists.
- No school action exists to accept, reject, or request replacement.
- No reopen collection lifecycle exists.
- No physical retention cleanup worker exists.
- Applicant remains applicant after acceptance until a future conversion workflow is implemented.
- Applicant Portal does not replace school-created Parent/Guardian flows.
- Applicant/required-document models are protected by explicit route-local filters today; any future direct school-side access to those models should revisit `SCHOOL_SCOPED_MODELS` coverage.
- Final project structure update is still pending and must happen separately.

## 19. Recommended Next Steps

1. Final Sprint 18 Closeout:
   - Update `Moazez-Project-Structure.json` once.
   - Optionally add a final docs entry if project convention requires it.
   - Verify no runtime changes.

2. Future Sprint 19 candidate:
   - School-side document review workflow.
   - Accept/reject/request replacement.
   - Reopen document collection.
   - Applicant notifications.

3. Later conversion work:
   - Accepted applicant to Parent/Guardian/Student/Enrollment flows.
   - Activation/linking workflows.
   - Parent App visibility after acceptance.

## 20. Final Audit Conclusion

Applicant Portal V1 foundation is complete for:

- Applicant pre-admission accounts.
- Public school discovery.
- Public required-document discovery.
- Applicant-owned requests.
- Submit to school Admissions application.
- Applicant document upload/list/read/download/replace/delete.
- School Admissions visibility of submitted applicant docs as `pending_review`.

The Applicant Portal boundary remains safe at this closeout point: applicants are not Parents, applicant access is route-local and narrow, membershipless access is not generalized, school Admissions remains school-scoped, private file access remains authorization-bound, and no conversion or operational identity side effects were introduced.

The workstream is ready for the separate final Sprint 18 project-structure update if no unexpected diff is found.
