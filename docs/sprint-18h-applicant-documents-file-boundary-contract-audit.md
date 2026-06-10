# Sprint 18H - Applicant Documents/File Boundary Contract Audit

## 1. Purpose and Scope

Sprint 18H is a documentation-only contract audit. It decides the safest future backend boundary for Applicant Portal documents and files before any upload, linking, download, or `ApplicationDocument` bridge is implemented.

This audit authorizes no runtime implementation. It must not be treated as approval to add routes, schema, migrations, DTOs, services, repositories, presenters, tests, seed changes, guard changes, file runtime changes, Admissions runtime changes, or `Moazez-Project-Structure.json` updates.

The goal is to preserve the Sprint 18 applicant boundary:

- Applicant Portal remains optional and pre-admission.
- Applicants remain `UserType.APPLICANT` and membershipless before acceptance.
- Applicant-owned data is authorized by applicant ownership checks, not by school membership.
- School-side Admissions visibility remains school-scoped through existing Admissions permissions.
- File access never exposes raw storage internals.
- Global guards, `ScopeResolverGuard`, and Prisma `schoolScope` must not be weakened.

## 2. Baseline and Completed Applicant Portal State

The current baseline is `d73a5ae feat: add applicant portal request submission`.

Sprint 18A established the Applicant Portal account/profile contract and the rule that Applicant Portal is optional. Sprint 18C/18E established safe public school discovery and read-only admission required document discovery. Sprint 18F added applicant-owned draft request ownership. Sprint 18G added request submission, creating and linking a school-scoped Admissions `Application` without creating operational school membership or Parent/Student records.

Current implemented Applicant Portal routes:

- `POST /api/v1/applicant-portal/accounts`
- `GET /api/v1/applicant-portal/profile`
- `GET /api/v1/applicant-portal/schools`
- `GET /api/v1/applicant-portal/schools/:schoolId`
- `GET /api/v1/applicant-portal/schools/:schoolId/admission-required-documents`
- `POST /api/v1/applicant-portal/requests`
- `GET /api/v1/applicant-portal/requests`
- `GET /api/v1/applicant-portal/requests/:requestId`
- `POST /api/v1/applicant-portal/requests/:requestId/submit`

Still intentionally absent:

- Applicant document upload.
- Applicant document list/read/delete/replace.
- Applicant file download.
- Applicant upload routes.
- Applicant-owned file access.
- Applicant-created `ApplicationDocument` records.
- Applicant-to-parent conversion.
- Guardian, Student, StudentGuardian, or Enrollment creation.

Current completed flow:

1. A public user creates an applicant account.
2. The user is `UserType.APPLICANT`.
3. The applicant has no active school membership and no active organization membership.
4. The applicant can discover public-safe active schools.
5. The applicant can read public-safe required admission documents for a safe school.
6. The applicant can create/list/read only their own applicant admission requests.
7. The applicant can submit only their own draft request.
8. Submit creates exactly one school-scoped Admissions `Application` and links it to the request.
9. The school sees the submitted request through existing Admissions `Application` visibility.
10. No file/document upload or applicant-to-parent conversion exists yet.

## 3. Current Files Module Findings

The current Files module is school-scoped and membership-based. It is not safe to expose directly to membershipless applicants.

Current model findings:

- `File` contains `organizationId`, `schoolId`, optional `uploaderId`, `bucket`, `objectKey`, `originalName`, `mimeType`, `sizeBytes`, `checksumSha256`, `visibility`, timestamps, and `deletedAt`.
- `File` is included in the Prisma school-scope extension, so school-scoped reads are constrained by active school context.
- `bucket` and `objectKey` are storage internals and must remain server-only.
- File metadata is shared by multiple modules through relations such as attachments, Admissions documents, and student documents.

Current upload route:

- `POST /api/v1/files`
- Requires school membership context.
- Requires `files.uploads.manage`.
- Accepts multipart field `file`.
- Validates size and MIME type through the Files application layer.
- Stores objects in private external storage.
- Uses a school-scoped object key pattern.
- Persists metadata with `organizationId`, `schoolId`, and `uploaderId`.
- Deletes the stored object if metadata persistence fails.

Current download route:

- `GET /api/v1/files/:id/download`
- Requires school membership context.
- Requires `files.downloads.view`.
- Loads the file through a scoped repository.
- Returns a short-lived signed URL through redirect behavior.
- Does not expose raw bucket/object key in normal API responses.

Current presenter behavior:

- File responses expose safe metadata such as id, original name, MIME type, size, checksum, visibility, and timestamps.
- File responses do not expose `bucket` or `objectKey`.
- Existing school-side document presenters may expose `fileId` because they are school dashboard contracts, not applicant-facing contracts.

Limitations for applicants:

- Membershipless applicants cannot satisfy `requireFilesScope()`.
- Granting applicants `files.uploads.manage` or `files.downloads.view` would be the wrong boundary because these permissions are school-scoped.
- Reusing `/api/v1/files` for applicants would require either fake membership, school permission grants, or guard weakening. All three options violate the Applicant Portal boundary.
- Applicant file authorization must be route-local and request/document ownership aware.

## 4. Current Admissions Document Findings

The current Admissions document boundary is school dashboard oriented.

Current model findings:

- `ApplicationDocument` belongs to a school-scoped Admissions `Application`.
- It includes `schoolId`, `applicationId`, `fileId`, `documentType`, `status`, `notes`, `createdAt`, and `updatedAt`.
- It relates to `Application` and `File`.
- Current document status values are oriented around Admissions document tracking and do not provide a full applicant upload review lifecycle.
- `ApplicationDocument` has no `deletedAt` field in the current schema.

Current routes:

- `GET /api/v1/admissions/applications/:applicationId/documents`
- `POST /api/v1/admissions/applications/:applicationId/documents`
- `DELETE /api/v1/admissions/applications/:applicationId/documents/:documentId`

Current permissions:

- List requires `admissions.documents.view`.
- Create/delete requires `admissions.documents.manage`.
- All routes require school membership context and Admissions scope.

Current relation to files:

- Creating an `ApplicationDocument` validates that the application exists in the current school scope.
- It validates that the linked file exists in the current school file scope.
- The school dashboard response may include `applicationId`, `fileId`, and safe file metadata.

Why direct Applicant Portal reuse is unsafe:

- Applicants have no school membership and should not be granted Admissions permissions.
- Draft applicant requests do not have an `Application` until submission.
- Applicant-owned documents need cross-applicant ownership checks, not only school-scope checks.
- Applicant responses must not expose `applicationId`, raw Admissions status casing, or dashboard-only fields.
- Direct reuse would make it difficult to separate draft documents from school-visible submitted documents.
- Current `ApplicationDocument` lacks enough lifecycle vocabulary for applicant upload pending review, replacement requested, accepted, rejected, and superseded states.

## 5. Current Applicant Portal Request Findings

`ApplicantAdmissionRequest` is the applicant-owned request model introduced for Sprint 18F and used by Sprint 18G submission.

Ownership model:

- Requests are anchored to `applicantUserId` and `applicantProfileId`.
- Applicant routes derive these values from authenticated applicant context.
- Request create/list/read/submit must filter by current applicant user id.
- Cross-applicant access returns not found behavior.
- Applicant responses do not expose `organizationId`, `applicantUserId`, `applicantProfileId`, `applicationId`, `deletedAt`, or raw enum casing.

Statuses:

- Internal request status values are `DRAFT` and `SUBMITTED`.
- Applicant-facing status is presenter-derived.
- Draft requests present as `draft`.
- Submitted requests use linked Admissions `Application.status` to present `needs_action`, `submitted`, `under_review`, `waitlisted`, `accepted`, or `rejected`.

Submit behavior:

- Submission is transaction-safe.
- It loads only the applicant-owned request.
- It revalidates the selected school and organization safety.
- It revalidates requested grade/year when present.
- It counts active mandatory school-level required documents.
- It creates one school-scoped Admissions `Application`.
- It links the request to the created `Application`.
- It is idempotent and does not create duplicate Applications for repeated submit.

Current missing item behavior:

- `missingItemsCount` is derived from active mandatory school-level `AdmissionRequiredDocument` rows where `gradeId = null`, `isMandatory = true`, `isActive = true`, and `deletedAt = null`.
- Uploads do not exist yet, so every mandatory required document is treated as missing.
- `progressValue` is presenter-derived and not stored in the database.

## 6. Security and Tenancy Risks

Cross-applicant file access:

- A file id alone is not enough authorization for applicant access.
- Every applicant document read/download/delete/replace must prove:
  - The request belongs to the current applicant.
  - The document belongs to that request.
  - The file belongs to that document.
  - The request and document are not deleted.

Cross-school leakage:

- Applicant document records must carry `schoolId` and `organizationId` from the owning request.
- School staff access must always be through the selected school Admissions context.
- Another school must not be able to read files or document metadata even if it guesses ids.

Raw object key exposure:

- `bucket` and `objectKey` must remain internal server fields.
- Applicant and school document responses must never include raw object keys, storage bucket names, provider URLs, or internal object paths.

Signed URL leakage:

- Signed URLs must be issued only after authorization.
- Signed URLs must be short-lived.
- Signed URLs should not be persisted in the database or returned inside list/detail responses.
- Download endpoints must return or redirect to a signed URL only for the exact authorized document/file pair.

Applicants using school-scoped files route:

- Applicants must not use `POST /api/v1/files`.
- Applicants must not use `GET /api/v1/files/:id/download`.
- Applicant upload/download must live under Applicant Portal routes and call safe internal file/storage helpers after ownership checks.

School users using applicant routes to bypass Admissions permissions:

- Applicant document routes must require `UserType.APPLICANT` through the existing Applicant Portal access path.
- Parent, student, teacher, school staff, and platform actors must be denied by the Applicant Portal access service.
- School staff must use Admissions routes and permissions, not Applicant Portal routes.

Orphaned files:

- Upload must be transactional at the application level:
  - Store object.
  - Persist `File`.
  - Persist applicant document link.
  - Delete the object if metadata/link persistence fails.
- Soft-deleted applicant documents should not make files publicly reachable.
- Future retention cleanup should be explicit, queued, and audited.

Documents uploaded to unsafe/deleted schools:

- Upload and submit-time document bridging must revalidate school and organization safety.
- Draft request creation safety is not enough because the school or organization can change later.
- Upload should reject requests whose school or organization is inactive, suspended, archived, or deleted according to the existing safe discovery semantics.

Document mutation after decision:

- Applicant mutation must stop once the linked Admissions application is under review, accepted, rejected, waitlisted, or otherwise beyond document collection, unless a future school action explicitly reopens document collection.
- Accepted and rejected decisions must not be mutated through applicant upload routes.

PII logging risks:

- Audit logs should record ids, actor, route action, school id, request id, document id, and file id.
- Logs must not include full notes, child full name, birth date, raw object key, signed URL, bucket name, or document contents.

## 7. Applicant Document Model Options

| Option | Description | Benefits | Risks | Decision |
| --- | --- | --- | --- | --- |
| A | Link applicant uploads directly to `ApplicationDocument`. | Reuses existing school Admissions document table. | Unsafe for draft requests with no `Application`; mixes applicant ownership with school dashboard ownership; lacks applicant lifecycle states; encourages applicant use of school-scoped semantics. | Not recommended. |
| B | Add `ApplicantAdmissionRequestDocument` as an applicant-owned document link, then bridge/link to `ApplicationDocument` after submit. | Preserves applicant ownership; supports draft uploads; supports safe applicant routes; enables controlled school visibility after submit; keeps response shaping separate. | Requires migration and bridge logic in a future runtime sprint. | Recommended. |
| C | Use `File` only with ownership metadata and no request-document model. | Small schema footprint. | Cannot model required document matching, replacement, review state, applicant ownership, or bridge state cleanly; file ids become overloaded as authorization facts. | Not recommended. |
| D | Defer applicant upload and allow school staff manual document collection only. | Safest short-term and no runtime work. | Does not satisfy Applicant Portal document collection; keeps missing items permanently manual; poor applicant experience. | Defer only if product pauses uploads; not the target V1 contract. |

Recommendation: choose Option B. Add a dedicated `ApplicantAdmissionRequestDocument` model in a future runtime sprint. It should be the applicant-facing source of ownership and lifecycle. `ApplicationDocument` should remain the school Admissions document artifact.

## 8. File Upload Boundary Options

| Option | Description | Benefits | Risks | Decision |
| --- | --- | --- | --- | --- |
| A | Reuse `POST /api/v1/files` for applicants. | Reuses existing upload route. | Requires school membership or school file permissions for applicants; weakens the boundary; exposes a broad file capability. | Not recommended. |
| B | Add applicant-specific upload route under Applicant Portal. | Route-local applicant ownership; can validate request status, school safety, required document matching, and file policy before storage. | Requires new controller/use-case/repository path. | Recommended for V1. |
| C | Use pre-signed upload session model. | Scales well for large uploads and direct-to-storage browser flows. | More moving parts; requires upload session lifecycle, callback/finalization, and object cleanup. | Good later, not first V1. |
| D | Defer binary upload and allow metadata-only placeholders first. | Low risk, useful for UI prototyping. | Does not collect documents; still needs later storage implementation. | Not recommended as the runtime target. |

Recommendation: choose Option B first. Applicant upload should be a document-aware Applicant Portal route, not a generic file route. It may reuse internal storage and file metadata services, but only after applicant request ownership, document matching, school safety, size, and MIME checks pass.

## 9. File Download Boundary Options

| Option | Description | Benefits | Risks | Decision |
| --- | --- | --- | --- | --- |
| A | Reuse `GET /api/v1/files/:id/download`. | Reuses existing signed URL behavior. | Requires membership and file permission; authorizes by file id rather than applicant request/document ownership; not applicant-safe. | Not recommended. |
| B | Add applicant document-aware download route. | Authorizes by applicant -> request -> document -> file; hides raw storage; easy to test for cross-applicant denial. | Duplicates some signed URL orchestration unless factored. | Recommended route boundary. |
| C | Add shared file authorization service used by applicant and school flows. | Reduces duplicated signed URL generation and audit behavior; keeps route-specific authorization inputs. | Requires careful design so generic service does not become a bypass. | Recommended internal design direction. |
| D | No applicant download in V1. | Strictest surface reduction. | Applicant cannot confirm uploaded files; support burden increases. | Acceptable only if product explicitly defers download. |

Recommendation: expose applicant downloads through Option B and factor common signed URL creation through a narrow internal helper as in Option C. Do not expose generic file download to applicants.

## 10. ApplicationDocument Bridge Options

| Option | Description | Benefits | Risks | Decision |
| --- | --- | --- | --- | --- |
| A | Create `ApplicationDocument` immediately when applicant uploads to a submitted request. | School dashboard sees uploads through existing Admissions documents. | Not useful for drafts; current `ApplicationDocument` status vocabulary is limited; can overstate unreviewed uploads as complete if reused naively. | Partially useful after submit, but not sufficient alone. |
| B | Keep applicant document links separate and expose them to school Admissions through a read adapter. | Avoids mutating school document table before review; preserves applicant lifecycle. | Requires Admissions presenter/runtime adapter changes; existing document routes may not see documents without new read path. | Useful if school UX needs pending applicant upload review separate from official documents. |
| C | On submit, bridge existing applicant documents into `ApplicationDocument`; for post-submit `needs_action` uploads, bridge in the same applicant document transaction. | Keeps draft documents applicant-only; makes submitted documents visible through existing school-scoped Admissions document records; maintains link back to applicant document. | Requires careful status mapping and idempotent bridge logic. | Recommended V1 bridge. |
| D | Create `ApplicationDocument` only when school staff accepts/reviews uploaded documents. | Keeps official Admissions documents verified. | School staff needs another way to see pending uploads; delays visibility through existing routes. | Good later if richer review workflow is added, but not the first bridge. |

Recommendation: choose Option C for the V1 bridge, with two constraints:

- Do not create `ApplicationDocument` for draft-only applicant documents.
- Never treat `ApplicationDocument` as applicant ownership. Applicant ownership remains in `ApplicantAdmissionRequestDocument`; `ApplicationDocument` is the school-side Admissions link after submission.

If the existing `AdmissionDocumentStatus` enum remains only `COMPLETE` and `MISSING`, the bridge must not imply review acceptance. A future sprint should either add a pending/rejected Admissions document status or clearly document that applicant-side `UPLOADED` is pending review while the school-side document record is only an attached artifact.

## 11. Required Document Matching Policy

Recommended policy: support required-document-linked uploads plus optional extra uploads.

Required document matching rules:

- Applicant upload may include `requiredDocumentId`.
- If `requiredDocumentId` is present, it must belong to the request school.
- The required document must be active and not deleted.
- The required document must be school-level (`gradeId = null`) for the first runtime sprint unless grade-specific validation is already safely available.
- If grade-specific documents are enabled later, a grade-specific required document must match the request's selected grade.
- If `requiredDocumentId` is absent, the upload is an optional extra document and must include a safe applicant-provided label or document type.

Mandatory document counting rules:

- Mandatory active required documents are missing when no active non-rejected applicant document is linked to that required document.
- Uploaded-but-pending-review documents should no longer count as "missing" for applicant action, but they should count as pending review in future school-facing or applicant-facing counters.
- Rejected or needs-replacement documents should count as missing again.
- Optional extra documents do not reduce `missingItemsCount`.
- Deleted or superseded applicant document records do not satisfy required document matching.

Recommendation: choose Option C from the required matching options: required-document-linked uploads plus optional extra uploads.

## 12. Document Lifecycle and Mutation Policy

The future lifecycle should be tied to applicant request status plus linked Admissions application status.

| State | Applicant upload | Applicant replace | Applicant delete | Applicant view | Applicant download | School staff behavior |
| --- | --- | --- | --- | --- | --- | --- |
| `draft` | Allowed. | Allowed. | Allowed. | Allowed for own request. | Allowed for own document. | No access; draft documents are applicant-only. |
| `submitted` with no missing mandatory docs | Optional extras deferred by default. | Not allowed unless school reopens collection. | Not allowed except unbridged optional drafts if policy allows. | Allowed for own request. | Allowed for own document. | Can see submitted application and bridged documents for own school. |
| `needs_action` / `DOCUMENTS_PENDING` | Allowed for missing or rejected required docs. | Allowed for rejected or replacement-needed docs. | Allowed only for optional or unreviewed docs when it does not hide a mandatory requirement. | Allowed for own request. | Allowed for own document. | Can see submitted application and bridged docs; may review or request replacement in future review sprint. |
| `under_review` | Not allowed by default. | Not allowed by default. | Not allowed. | Allowed. | Allowed. | Own-school Admissions staff can read/download/review according to Admissions permissions. |
| `waitlisted` | Not allowed unless a future explicit reopen action exists. | Not allowed unless reopened. | Not allowed. | Allowed. | Allowed subject to retention policy. | Own-school Admissions staff can read/download according to Admissions permissions. |
| `accepted` | Not allowed. | Not allowed. | Not allowed. | Allowed subject to retention policy. | Allowed subject to retention policy. | School may use separate accepted-student conversion workflows later; no automatic Student/Guardian/Enrollment creation. |
| `rejected` | Not allowed. | Not allowed. | Not allowed. | Allowed subject to retention policy. | Allowed subject to retention policy. | School retains or purges according to future retention policy. |

Recommended mutation policy: Applicant upload and replacement are allowed while draft and while the application is in `needs_action` / `DOCUMENTS_PENDING`. Applicant mutation stops once Admissions moves beyond document collection unless a future explicit school action reopens collection.

## 13. Recommended V1 Contract

The following routes are proposed for future runtime sprints. They are not implemented by Sprint 18H.

### `POST /api/v1/applicant-portal/requests/:requestId/documents`

- Auth requirement: authenticated applicant only.
- Actor type: `UserType.APPLICANT` through `AllowApplicantPortalAccess()` and `ApplicantPortalAccessService`.
- Allowed request status: `draft` and `needs_action` / `DOCUMENTS_PENDING`.
- Request shape: multipart form with `file`, optional `requiredDocumentId`, optional `documentType`, optional `title`, and optional `notes`.
- Response shape: safe applicant document detail with document id, request id, applicant-facing status, title, document type, required document summary if linked, safe file summary, createdAt, updatedAt, and no storage internals.
- Ownership rule: request must belong to current applicant; document is created under that request.
- Storage/file rule: private object storage only; object key generated server-side; bucket/object key never exposed.
- `ApplicationDocument` touch: no for draft; yes after submit if bridge sprint is implemented and request has linked application.
- Requires migration: yes, for `ApplicantAdmissionRequestDocument`.
- Recommended sprint: Sprint 18I for model and upload/list; bridge can land in Sprint 18K if split.

### `GET /api/v1/applicant-portal/requests/:requestId/documents`

- Auth requirement: authenticated applicant only.
- Actor type: `UserType.APPLICANT`.
- Allowed request status: all applicant-visible statuses.
- Request shape: optional pagination if document counts can grow; otherwise deterministic list sorted newest first or required-document order first.
- Response shape: safe applicant document cards; no `applicationId`, `organizationId`, `applicantUserId`, `applicantProfileId`, `bucket`, `objectKey`, or signed URL.
- Ownership rule: list only documents for the current applicant's request.
- Storage/file rule: include safe file metadata only.
- `ApplicationDocument` touch: read applicant document link only; do not expose linked `ApplicationDocument` id.
- Requires migration: yes.
- Recommended sprint: Sprint 18I.

### `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId`

- Auth requirement: authenticated applicant only.
- Actor type: `UserType.APPLICANT`.
- Allowed request status: all applicant-visible statuses.
- Request shape: path params only.
- Response shape: safe applicant document detail.
- Ownership rule: document must belong to current applicant's request.
- Storage/file rule: no signed URL in detail response.
- `ApplicationDocument` touch: read applicant document link only; do not expose linked `ApplicationDocument` id.
- Requires migration: yes.
- Recommended sprint: Sprint 18I or 18J.

### `DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId`

- Auth requirement: authenticated applicant only.
- Actor type: `UserType.APPLICANT`.
- Allowed request status: `draft` and `needs_action` with policy restrictions.
- Request shape: path params only.
- Response shape: empty success or safe deleted document acknowledgement.
- Ownership rule: document must belong to current applicant's request.
- Storage/file rule: soft-delete applicant document link; physical object deletion should be queued or deferred by retention policy.
- `ApplicationDocument` touch: if bridged, mark/unlink according to bridge policy; do not hard-delete school records unless a future review policy explicitly allows it.
- Requires migration: yes.
- Recommended sprint: Sprint 18J.

### `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download`

- Auth requirement: authenticated applicant only.
- Actor type: `UserType.APPLICANT`.
- Allowed request status: all applicant-visible statuses, subject to retention policy.
- Request shape: path params only.
- Response shape: redirect to short-lived signed URL or a safe signed URL envelope, following project convention.
- Ownership rule: current applicant must own the request; document must belong to request; file must belong to document.
- Storage/file rule: authorize before signing; signed URL short-lived; no bucket/object key in response or logs.
- `ApplicationDocument` touch: none for applicant authorization.
- Requires migration: yes for document link; no additional storage schema expected.
- Recommended sprint: Sprint 18J.

Suggested school-side behavior:

- Existing Admissions document routes and presenters should see submitted applicant documents only through the school-scoped linked `Application`.
- School users must not access applicant-owned draft documents before submit.
- School users must not use Applicant Portal document routes.
- No school-side response should expose raw storage bucket/object keys.
- Another school's Admissions context must not see applicant documents, linked files, or bridged `ApplicationDocument` records.

## 14. Recommended Data Model

Recommended future model: `ApplicantAdmissionRequestDocument`.

Recommended table: `applicant_admission_request_documents`.

Recommended enum: `ApplicantAdmissionRequestDocumentStatus`.

Recommended enum values:

- `UPLOADED` - applicant uploaded the document and it is pending school review or bridge processing.
- `NEEDS_REPLACEMENT` - school or validation requires a replacement.
- `ACCEPTED` - school accepted the uploaded document for Admissions.
- `REJECTED` - school rejected the document.
- `SUPERSEDED` - applicant replaced the document with a newer upload.

Recommended fields:

- `id` UUID primary key.
- `requestId` UUID required.
- `applicantUserId` UUID required.
- `schoolId` UUID required.
- `organizationId` UUID required.
- `requiredDocumentId` UUID nullable.
- `applicationDocumentId` UUID nullable.
- `fileId` UUID required.
- `title` varchar required.
- `documentType` varchar required.
- `status` enum default `UPLOADED`.
- `notes` text nullable for applicant-safe notes.
- `reviewNotes` text nullable only if future school review response exposes safe text.
- `reviewedAt` datetime nullable.
- `reviewedByUserId` UUID nullable.
- `replacedByDocumentId` UUID nullable.
- `createdAt`.
- `updatedAt`.
- `deletedAt` nullable.

Recommended relations:

- `request` -> `ApplicantAdmissionRequest`.
- `applicantUser` -> `User`.
- `school` -> `School`.
- `organization` -> `Organization`.
- `requiredDocument` -> `AdmissionRequiredDocument` nullable.
- `applicationDocument` -> `ApplicationDocument` nullable.
- `file` -> `File`.
- `reviewedBy` -> `User` nullable.
- `replacedBy` -> `ApplicantAdmissionRequestDocument` nullable self relation.

Recommended indexes:

- `(requestId, deletedAt, createdAt)`.
- `(applicantUserId, deletedAt, createdAt)`.
- `(schoolId, requestId, deletedAt)`.
- `(schoolId, applicationDocumentId)`.
- `(requestId, requiredDocumentId, deletedAt)`.
- `(fileId)`.
- `(status, deletedAt)`.

Recommended integrity rules:

- `schoolId` and `organizationId` are copied from the request at creation time.
- `applicantUserId` is copied from the current actor/request and never accepted from the body.
- `requiredDocumentId`, when present, must belong to the same school and be active/not deleted.
- `applicationDocumentId`, when present, must point to an `ApplicationDocument` for the linked request application and same school.
- Do not expose `applicationDocumentId` to applicants.
- The model may include `schoolId` for school-side filtering, but applicant routes must still enforce explicit applicant ownership. School-side routes must still use Admissions permissions.

Recommended `File` usage:

- Reuse the existing `File` model for binary metadata.
- Do not add applicant storage keys to applicant responses.
- Store applicant uploads as private files with `schoolId`, `organizationId`, and `uploaderId`.
- The file record alone must not grant applicant access; applicant access comes from the `ApplicantAdmissionRequestDocument` link.

## 15. Authorization Rules

Applicant upload:

- Actor must be authenticated.
- Actor must be `UserType.APPLICANT`.
- Actor must pass existing Applicant Portal membershipless access checks.
- Request must belong to actor.
- Request must not be deleted.
- Request school and organization must still be safe.
- Request status must allow mutation.
- Required document, if provided, must belong to the request school and be active/not deleted.

Applicant list/read/download:

- Actor must be authenticated applicant.
- Actor must own the request.
- Document must belong to that request.
- Deleted documents are hidden unless a future audit/history endpoint is explicitly added.
- Download signs only the document's linked file after ownership checks.

Applicant delete/replace:

- Actor must own the request and document.
- Mutation allowed only in draft or `needs_action` document collection states.
- Replacement creates a new document/file record and marks the old document `SUPERSEDED`, or follows an equivalent auditable replacement policy.
- Delete should soft-delete the applicant document link and avoid immediate physical object deletion unless a retention worker is designed.

School staff read/download:

- Actor must have active school context.
- Actor must have existing Admissions document/application permissions.
- The linked `Application` must belong to actor's current school scope.
- Draft applicant documents are not visible.
- Submitted documents are visible only through the linked `Application`.
- School staff download uses the school file/download authorization path or a school document-aware signed URL path.

School staff review/manage:

- Actor must have Admissions document manage/review permission.
- Review actions must be school-scoped to the linked `Application`.
- Review must not mutate applicant identity, create membership, or create Student/Guardian/Enrollment records.

Platform admin:

- Platform admin applicant document access should be deferred unless a dedicated support/audit route is approved.
- Platform bypass must not be used as an implicit document access path.

Parent/student/teacher denial:

- Parent, student, teacher, school staff, and platform users must be denied on Applicant Portal document routes.
- Applicant tokens must still be denied from Parent App, Student App, Teacher App, School Dashboard Admissions, Platform Admin, and generic Files routes.

## 16. Signed URL and Storage Rules

Storage rules:

- Store applicant-uploaded files in private object storage.
- Generate object keys server-side.
- Recommended key pattern: `schools/{schoolId}/applicant-requests/{requestId}/documents/{fileUuid}/{safeOriginalName}`.
- Do not include child names, applicant names, birth dates, notes, or other PII in object keys.
- Store metadata in `File`; store applicant ownership in `ApplicantAdmissionRequestDocument`.

Signed URL rules:

- Never expose raw bucket names, object keys, provider URLs, or permanent object URLs.
- Create signed URLs only after route-local authorization.
- Use short-lived URLs. The current Files module uses a five-minute signed URL; applicant document download should use the same or shorter TTL unless a future policy changes it.
- Do not include signed URLs in list or detail responses.
- Do not log signed URLs.

Validation rules:

- Validate file size against existing upload limits or a stricter applicant-specific limit.
- Validate MIME type against global safe types and, when linked to `AdmissionRequiredDocument`, against `acceptedFileTypes`.
- Reject empty files.
- Normalize and sanitize original filenames.
- Record checksum for deduplication/audit, not as an authorization token.

Deferred controls:

- Antivirus or malware scanning can be deferred only if explicitly documented in the runtime sprint and files remain private until scanning policy is defined.
- Checksum-based duplicate detection can be deferred.
- Background retention cleanup can be deferred, but orphan prevention during failed uploads must be implemented with compensating object deletion.

Audit logging:

- Audit applicant upload, replace, delete, download/sign events if consistent with existing audit volume policy.
- Always audit school review/manage actions.
- Audit entries should include actor id, user type, request id, document id, file id, school id, action, outcome, and timestamp.
- Audit entries must not include raw object keys, signed URLs, notes, child PII, or file contents.

## 17. Missing Items and Progress Rules

Missing item rules after applicant documents exist:

- Start from active mandatory required documents for the request school.
- Include grade-specific mandatory documents only after grade-specific matching is safely implemented.
- A mandatory item is missing when there is no active, non-deleted applicant document linked to that required document.
- A pending uploaded document satisfies applicant "missing" action but may be counted separately as pending review.
- A rejected or needs-replacement document does not satisfy the mandatory item.
- A superseded document does not satisfy the mandatory item unless the replacement does.
- Optional extra uploads do not affect `missingItemsCount`.
- If there are no mandatory required documents, `missingItemsCount = 0`.

Recommended future counters:

- `missingItemsCount`: mandatory required documents still needing applicant action.
- `pendingReviewItemsCount`: uploaded mandatory documents waiting for school review.
- `rejectedItemsCount`: mandatory uploaded documents requiring replacement.
- `uploadedDocumentsCount`: total active applicant-uploaded documents.

Recommended progress behavior:

- Draft with no documents: keep current baseline around `25`.
- Draft with some required documents uploaded: increase modestly, for example `35`.
- Submitted / `needs_action` with missing or rejected documents: around `40`.
- Submitted with all mandatory documents uploaded but pending review: around `55`.
- Under review: around `70`.
- Waitlisted: around `80`.
- Accepted or rejected: `100`.

Do not store progress in the database. Continue deriving it in the Applicant Portal presenter.

## 18. Testing Plan for Future Runtime

Future unit tests:

- Applicant upload creates `File` and `ApplicantAdmissionRequestDocument`.
- Applicant upload derives applicant user id, school id, and organization id from request context, not body.
- Upload rejects another applicant's request.
- Upload rejects unsafe school or unsafe organization.
- Upload rejects inactive/deleted required document.
- Upload rejects cross-school required document.
- Upload rejects invalid MIME/size according to required document and file rules.
- List/read/download return only current applicant documents.
- Delete/replace follows mutation policy by request/application status.
- Bridge creates at most one `ApplicationDocument` per active applicant document.
- Bridge is idempotent on retry.
- Presenter does not leak `applicationId`, `applicationDocumentId`, `organizationId`, `applicantUserId`, `applicantProfileId`, `bucket`, `objectKey`, signed URL, or raw enum casing.

Future e2e tests:

- Applicant can upload required-document-linked document for own draft request.
- Applicant can upload optional extra document for own draft request.
- Applicant can list/read own documents.
- Applicant can download own document through document-aware route.
- Applicant cannot access another applicant's document.
- Applicant cannot upload to another applicant's request.
- Applicant cannot upload to unsafe school request.
- Submit bridges draft documents to school-visible Admissions document records if bridge sprint is active.
- School user can see submitted documents for own school only.
- Another school's Admissions context cannot see documents.
- Draft applicant documents are invisible to school users.
- Upload/document routes do not create Student, Guardian, StudentGuardian, Enrollment, school membership, or organization membership.
- Required documents endpoint still works.
- Applicant-to-parent conversion remains absent until explicitly implemented.

Required future security tests:

- Applicant cannot access another applicant's document.
- Applicant cannot upload to another applicant's request.
- Applicant cannot upload to unsafe school request.
- Applicant cannot download raw object URL.
- Applicant cannot use generic school file route.
- School user cannot see draft applicant documents.
- School user can see submitted documents for own school only.
- Another school cannot see documents.
- Parent/student/teacher cannot use applicant document routes.
- Submit/upload does not create Student/Guardian/Enrollment.
- No raw bucket or objectKey appears in API response.
- No signed URL appears in document list/detail responses.
- School user cannot use Applicant Portal document routes to bypass Admissions permissions.
- Global guards and `schoolScope` behavior remain unchanged.

## 19. Proposed Future Sprint Breakdown

Recommended sequence:

- Sprint 18I - Applicant Document Link Model + Applicant Upload/List
  - Add `ApplicantAdmissionRequestDocument`.
  - Add applicant upload and list/read document routes.
  - Reuse internal storage safely after route-local ownership checks.
  - Do not bridge to `ApplicationDocument` yet unless the sprint remains small.

- Sprint 18J - Applicant Document Download + Replace/Delete Policy
  - Add applicant document-aware download.
  - Add delete/replace behavior.
  - Add signed URL authorization tests.
  - Add retention/orphan handling decisions.

- Sprint 18K - `ApplicationDocument` Bridge + School Admissions Visibility
  - Bridge submitted applicant documents to school-scoped `ApplicationDocument`.
  - Ensure school staff sees submitted documents through existing Admissions permissions.
  - Add review/status mapping if needed.

- Sprint 18L - Applicant Portal Documents Closeout Audit
  - Verify account, discovery, requests, submit, upload, download, bridge, and security tests together.
  - Confirm no Parent/Student/Guardian/Enrollment creation remains outside explicit conversion sprint.
  - Update `Moazez-Project-Structure.json` only as part of final full Sprint 18 closeout, not per sub-sprint.

## 20. Explicit Non-Goals

Sprint 18H non-goals:

- No runtime implementation.
- No Prisma schema change.
- No migration.
- No upload route.
- No download route.
- No applicant document list/read route.
- No applicant document delete/replace route.
- No `ApplicationDocument` creation.
- No file route change.
- No Admissions runtime change.
- No file runtime change.
- No Student, Guardian, StudentGuardian, or Enrollment creation.
- No applicant-to-parent conversion.
- No school membership creation.
- No organization membership creation.
- No global guard change.
- No `ScopeResolverGuard` change.
- No Prisma `schoolScope` change.
- No package script change.
- No tests added or changed.
- No `Moazez-Project-Structure.json` update.

## 21. Final Recommendation

Recommended applicant document ownership model:

- Add `ApplicantAdmissionRequestDocument` in a future runtime sprint.
- Treat it as the applicant-facing ownership and lifecycle source.
- Keep authorization anchored on `applicantUserId`, request ownership, document ownership, and file linkage.

Recommended upload boundary:

- Add applicant-specific document upload under `/api/v1/applicant-portal/requests/:requestId/documents`.
- Do not reuse `/api/v1/files` for applicants.
- Reuse internal storage/file helpers only after applicant ownership, school safety, required document, size, and MIME validation.

Recommended download boundary:

- Add applicant document-aware download under Applicant Portal.
- Authorize by applicant request and document ownership before signing.
- Use short-lived signed URLs.
- Never expose raw storage keys.

Recommended `ApplicationDocument` bridge:

- Do not create `ApplicationDocument` for draft documents.
- After submit, bridge applicant documents to the linked school-scoped Admissions `Application`.
- Store the bridge link on `ApplicantAdmissionRequestDocument.applicationDocumentId`.
- Keep applicant ownership and school Admissions visibility as separate concepts.

Recommended mutation policy:

- Applicant may upload/replace/delete during draft.
- Applicant may upload/replace during `needs_action` / `DOCUMENTS_PENDING`.
- Applicant mutation stops once the application moves beyond document collection unless a future school action explicitly reopens it.
- Accepted/rejected applications are immutable from Applicant Portal document routes.

Recommended next runtime sprint:

- Sprint 18I should implement the applicant document link model plus applicant upload/list/read with strict ownership and no school-side bridge yet, unless the implementation remains small enough to include a carefully tested bridge.

The safest path is incremental: create the applicant-owned document boundary first, prove cross-applicant and cross-school isolation, then bridge to Admissions documents only after the file boundary is already tested.
