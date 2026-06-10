# Sprint 18J — Applicant Document Download / Replace-Delete / ApplicationDocument Bridge Contract Audit

## 1. Purpose and Scope

Sprint 18J is a documentation-only contract audit for the next Applicant Portal document phases after Sprint 18I.

This audit decides future contracts for applicant document download, signed URL authorization, replace/delete behavior, retention, the `ApplicationDocument` bridge, school-side Admissions visibility, and future runtime sprint sequencing.

No implementation is authorized by this audit alone. Sprint 18J must not change runtime code, Prisma schema, migrations, DTOs, controllers, services, repositories, presenters, tests, package scripts, seeds, guards, decorators, school scope behavior, Admissions runtime, Files runtime, Students runtime, Parent App runtime, `README.md`, `ERROR_CATALOG.md`, or `Moazez-Project-Structure.json`.

The only changed file for this sprint is this document:

- `docs/sprint-18j-applicant-documents-download-replace-bridge-contract-audit.md`

## 2. Baseline

Baseline commit:

- `e4af872 feat: add applicant portal document uploads`

Completed Sprint 18 state through Sprint 18I:

- Sprint 18A established the Applicant Portal pre-admission boundary and confirmed Applicant Portal is optional.
- Sprint 18B established applicant account/profile foundations using `UserType.APPLICANT`.
- Sprint 18C/18E established public-safe active school discovery and public-safe required document discovery.
- Sprint 18D established applicant-owned request and required-document contracts.
- Sprint 18F added applicant request create/list/read ownership.
- Sprint 18G added applicant request submit, creating exactly one linked school-scoped Admissions `Application`.
- Sprint 18H established the applicant documents/file boundary contract.
- Sprint 18I implemented applicant document upload/list/read through `ApplicantAdmissionRequestDocument`.

Current product boundary remains:

- Applicant Portal is optional and pre-admission.
- Applicant accounts are not Parent accounts.
- Applicant accounts must not receive school membership or school permissions before acceptance.
- Applicant Portal must not create `Student`, `Guardian`, `StudentGuardian`, or `Enrollment` records.
- Existing school-managed Guardian/Parent account creation remains valid and unchanged.

## 3. Current Sprint 18I Implementation Findings

`ApplicantAdmissionRequestDocument` is now the applicant-facing document ownership model.

Current model fields:

- `id`
- `requestId`
- `applicantUserId`
- `schoolId`
- `organizationId`
- `requiredDocumentId`
- `applicationDocumentId`
- `fileId`
- `title`
- `documentType`
- `status`
- `notes`
- `createdAt`
- `updatedAt`
- `deletedAt`

Current relations:

- `request` to `ApplicantAdmissionRequest`
- `applicantUser` to `User`
- `school` to `School`
- `organization` to `Organization`
- optional `requiredDocument` to `AdmissionRequiredDocument`
- optional `applicationDocument` to `ApplicationDocument`
- `file` to `File`

Current enum values for `ApplicantAdmissionRequestDocumentStatus`:

- `UPLOADED`
- `NEEDS_REPLACEMENT`
- `ACCEPTED`
- `REJECTED`
- `SUPERSEDED`

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
- `POST /api/v1/applicant-portal/requests/:requestId/documents`
- `GET /api/v1/applicant-portal/requests/:requestId/documents`
- `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId`

Current upload behavior:

- Route is document-aware and Applicant Portal-specific.
- Route requires authenticated `UserType.APPLICANT` through `AllowApplicantPortalAccess()` and `ApplicantPortalAccessService`.
- Upload derives `applicantUserId`, `schoolId`, and `organizationId` from the authenticated applicant and applicant-owned request, not from the body.
- Upload accepts multipart field `file`.
- Upload may link to a school-level active `AdmissionRequiredDocument`.
- Optional extra uploads require `title` or `documentType`.
- Upload is allowed for draft requests.
- Upload is allowed for submitted requests only while the linked Admissions application is `DOCUMENTS_PENDING`.
- Upload is rejected after the linked Admissions application moves beyond document collection, such as `UNDER_REVIEW`, `WAITLISTED`, `ACCEPTED`, or `REJECTED`.
- Upload validates request ownership, school safety, organization safety, required-document ownership, MIME type, accepted file types, empty file, and size.
- Upload stores a private object and creates private `File` metadata.
- Upload creates an `ApplicantAdmissionRequestDocument` with `status = UPLOADED`.
- Upload currently sets `applicationDocumentId = null`.
- Upload audits `applicant.document.upload`.
- If file/document metadata persistence fails after object storage succeeds, the object is deleted as a compensating cleanup.

Current list/read behavior:

- List checks the request belongs to the current applicant.
- Read checks the document belongs to the current applicant and request.
- Responses expose safe document fields only.
- Responses include safe file metadata: `id`, `originalName`, `mimeType`, `sizeBytes`, and `checksumSha256`.
- Responses do not expose `schoolId`, `organizationId`, `applicantUserId`, `applicantProfileId`, `applicationId`, `applicationDocumentId`, `bucket`, `objectKey`, `deletedAt`, raw enum values, `signedUrl`, or `downloadUrl`.

Current file storage behavior:

- Applicant uploads create `File` rows with `organizationId`, `schoolId`, `uploaderId`, private `bucket`, server-generated `objectKey`, sanitized `originalName`, `mimeType`, `sizeBytes`, checksum, and `visibility = PRIVATE`.
- Object keys are server-generated under a school/request/document pattern.
- Object keys do not include applicant names, child names, birth dates, or notes.
- `File` metadata alone is not an applicant authorization fact. Applicant access is through `ApplicantAdmissionRequestDocument`.

Current `missingItemsCount` behavior:

- Derived from active mandatory school-level `AdmissionRequiredDocument` rows where `gradeId = null`, `isMandatory = true`, `isActive = true`, and `deletedAt = null`.
- A mandatory item is not missing when an active, non-deleted applicant document exists for that required document with status `UPLOADED` or `ACCEPTED`.
- `REJECTED`, `NEEDS_REPLACEMENT`, `SUPERSEDED`, and soft-deleted documents do not satisfy a required document under the current repository logic.
- Optional extra uploads do not affect `missingItemsCount`.
- `progressValue` is presenter-derived and not stored.

Current intentionally absent routes:

- `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download`
- `DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId`
- `PATCH /api/v1/applicant-portal/requests/:requestId/documents/:documentId`
- Applicant document replacement route.
- Applicant signed URL response.
- `ApplicationDocument` bridge.
- School-side applicant document review.

Current non-goals preserved:

- No generic applicant access to `/api/v1/files`.
- No applicant use of school-scoped Admissions document routes.
- No `ApplicationDocument` side effects.
- No school-side visibility for draft applicant documents.
- No Student, Guardian, StudentGuardian, Enrollment, membership, or applicant-to-parent conversion side effects.
- No global guard or `schoolScope` weakening.

## 4. Current Files Download Findings

Current Files download route:

- `GET /api/v1/files/:id/download`

Current auth and permissions:

- Requires bearer authentication.
- Requires active school membership through `ScopeResolverGuard`.
- Requires `files.downloads.view`.
- Calls `requireFilesScope()`, which throws if there is no authenticated actor or no active school membership.

Current authorization behavior:

- `GetFileDownloadUrlUseCase` calls `requireFilesScope()`.
- It loads the `File` through `FilesRepository.findScopedFileById(fileId)`.
- `findScopedFileById` uses scoped Prisma, so school-scoped files are restricted to the active school context.
- Cross-school guessed file ids return `files.not_found`.

Current signed URL behavior:

- The use case calls `StorageService.createDownloadUrl`.
- `StorageService.createDownloadUrl` delegates to `SignedUrlService.createDownloadUrl`.
- Current Files download explicitly sets `expiresInSeconds: 5 * 60`.
- The global signed URL service default is 15 minutes, but Files download uses 5 minutes.
- The signed URL includes a response content disposition filename when `originalName` is present.

Current redirect/envelope behavior:

- The controller uses `@Redirect(undefined, 307)`.
- The handler returns `{ url: signedUrl }`.
- Nest turns this into a temporary redirect response.
- E2E coverage expects HTTP `307` and a `Location` header containing signed URL expiry data.

Current response shape:

- Client receives a redirect, not a JSON document, when redirects are not followed.
- The signed URL is not included in regular file metadata responses.
- `bucket` and `objectKey` are never returned by the Files presenter.

Why `/api/v1/files/:id/download` remains school-scoped:

- Files is a core school-scoped module.
- `File` participates in `schoolScope`.
- Files permissions are school role permissions.
- Existing Students, Admissions, Homework, Teacher App, and other school-scoped surfaces rely on `/api/v1/files/:id/download` staying school-authorized.

Why applicants must not use it directly:

- Applicants are membershipless before acceptance.
- Applicants cannot pass `requireFilesScope()`.
- Giving applicants school file permissions would collapse the pre-admission boundary.
- File id alone is not enough to prove applicant/request/document ownership.
- Applicant downloads must authorize through applicant-owned `ApplicantAdmissionRequestDocument`, not through generic file access.

## 5. Current Admissions Document Findings

Current `ApplicationDocument` model fields:

- `id`
- `schoolId`
- `applicationId`
- `fileId`
- `documentType`
- `status`
- `notes`
- `createdAt`
- `updatedAt`

Current `ApplicationDocument` relations:

- `school`
- `application`
- `file`
- `applicantAdmissionRequestDocuments`

Current `AdmissionDocumentStatus` enum values:

- `COMPLETE`
- `MISSING`

Current Admissions document routes:

- `GET /api/v1/admissions/applications/:applicationId/documents`
- `POST /api/v1/admissions/applications/:applicationId/documents`
- `DELETE /api/v1/admissions/applications/:applicationId/documents/:documentId`

Current permissions:

- List requires `admissions.documents.view`.
- Create/delete require `admissions.documents.manage`.
- All routes require school membership and Admissions application scope.

Current file relation behavior:

- Create validates the school-scoped application exists.
- Create validates the school-scoped file exists through `FilesRepository.findScopedFileById`.
- Create upserts by `documentType`: an existing document of the same type for the application is updated rather than duplicated.
- The presenter returns `id`, `applicationId`, `fileId`, `documentType`, status, notes, timestamps, and safe file metadata.

Current list/read/download behavior:

- List exists.
- There is no dedicated read-by-document-id route.
- There is no dedicated Admissions document download route.
- School staff can download the linked file separately through `GET /api/v1/files/:id/download` if they have Files download permission.

Current delete behavior:

- Delete uses scoped `deleteMany`.
- `ApplicationDocument` has no `deletedAt`, so current delete is hard delete.

Limitations for pending applicant uploads:

- Applicant uploads are not bridged into `ApplicationDocument` yet.
- `applicationDocumentId` on applicant documents remains null.
- Existing Admissions document list will not show applicant-uploaded documents.
- School staff currently cannot see applicant-uploaded files through Admissions documents.

Limitations around review lifecycle:

- `COMPLETE` and `MISSING` are too coarse for unreviewed applicant uploads.
- Marking a bridged applicant upload as `COMPLETE` would imply verification unless a separate review policy says otherwise.
- `ApplicationDocument` has no `PENDING_REVIEW`, `REJECTED`, `NEEDS_REPLACEMENT`, review notes, reviewer, reviewed timestamp, supersede link, soft delete, or retention fields.

## 6. Security Risks

Signed URL leakage:

- Signed URLs grant temporary direct object access.
- Signed URLs must not be returned in list/detail responses, persisted in the database, or logged.
- Signed URLs should be generated only in a download route after fresh authorization.

Raw object key leakage:

- `bucket` and `objectKey` reveal storage layout and can include tenant/resource identifiers.
- They must remain server-only.
- Applicant and school document responses must not expose object keys, bucket names, provider URLs, or permanent object URLs.

File id authorization bypass:

- `File.id` alone proves only metadata identity, not business ownership.
- Applicant document download must prove current applicant owns the request and the document, and the document points to the file being signed.
- School staff file access must prove school-scoped Admissions access.

Applicant using generic file download:

- Generic `/api/v1/files/:id/download` is school-scoped and permission-gated.
- Applicants must continue to receive denial from generic Files routes.
- Future applicant download must not modify `requireFilesScope()` or grant applicants Files permissions.

Applicant reading another applicant document:

- Guessed `requestId`, `documentId`, or `fileId` must not leak existence.
- Future download, replace, and delete must query by `applicantUserId`, `requestId`, `documentId`, and `deletedAt = null`.

School user using Applicant Portal route:

- School staff must not use Applicant Portal document routes to bypass Admissions permissions or read draft documents.
- Applicant Portal routes must require `UserType.APPLICANT` through route-local applicant access checks.

School staff seeing draft documents:

- Draft applicant documents are applicant-owned only.
- No `ApplicationDocument` should be created for draft-only documents.
- No school-side read adapter should surface draft applicant documents.

Another school seeing submitted applicant documents:

- Bridged documents must be visible only through the linked school-scoped Admissions `Application`.
- Another school's Admissions context must receive not found behavior.
- `schoolScope` must continue to enforce own-school access for `Application`, `ApplicationDocument`, and `File`.

Delete hiding mandatory requirements:

- Deleting a required document can make a submitted request incomplete.
- Delete must recalculate `missingItemsCount` and, for submitted `DOCUMENTS_PENDING` requests, leave or move the request to a needs-action state.
- Delete after review/decision must be denied unless a future school reopen action explicitly allows it.

Replace leaving orphaned files:

- Replacement creates a new private object and `File`.
- The old document/file/object must remain retained until a cleanup/retention worker is defined.
- If replacement persistence fails after storage succeeds, the new object must be cleaned up.

Bridge duplicating `ApplicationDocument`:

- Submit retries, upload retries, and post-submit uploads can duplicate bridge rows unless idempotency is enforced.
- Bridge must either use a transaction plus unique/idempotent lookup by applicant document id, or safely reuse the existing `applicationDocumentId` link.

Bridge exposing applicant internals:

- Applicants must not see `applicationDocumentId`.
- School staff should see only school-relevant submitted document metadata and safe applicant context from the linked application/request presenter.
- School responses must not expose applicant session, credential, profile ownership internals, or draft-only state.

Logs containing PII or signed URLs:

- Audit/application logs must include ids and outcomes, not child birth dates, full notes, signed URLs, raw object keys, bucket names, or file contents.
- Signed URL generation should audit resource ids and outcome only.

## 7. Applicant Download Contract Options

Option A: reuse `GET /api/v1/files/:id/download`.

- Benefits: reuses existing redirect and signed URL implementation.
- Risks: requires school membership, authorizes by file id rather than applicant document ownership, and would force guard/permission changes for applicants.
- Decision: not recommended.

Option B: add applicant document-aware download route.

- Route: `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download`.
- Benefits: authorizes through applicant -> request -> document -> file; keeps Applicants out of generic Files; easy to test cross-applicant denial; keeps signed URL out of list/read responses.
- Risks: duplicates some signed URL orchestration unless factored internally.
- Decision: recommended route boundary.

Option C: internal shared signed URL service with route-specific authorization.

- Benefits: keeps signing mechanics centralized while each route owns its authorization.
- Risks: the shared helper must not become a generic bypass that signs arbitrary `File.id`.
- Decision: recommended internal implementation approach with Option B.

Option D: no applicant download in V1.

- Benefits: smaller surface.
- Risks: applicants cannot verify uploaded files; support and UX suffer; product has already moved into document upload/list/read.
- Decision: not recommended unless product explicitly pauses download.

Recommendation:

- Add the applicant document-aware route in Sprint 18K.
- Authorize locally before signing.
- Do not expose `bucket` or `objectKey`.
- Do not include signed URLs in upload/list/detail responses.
- Keep `GET /api/v1/files/:id/download` school-scoped.

## 8. Download Response Contract

Recommended response style:

- Use `307` temporary redirect, matching current Files download behavior.
- The controller should return `{ url }` internally under `@Redirect(undefined, 307)`, but clients should observe the redirect.

Recommended route:

- `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download`

Auth:

- Authenticated applicant only.
- Actor must be `UserType.APPLICANT`.
- Actor must have no active membership.
- Route must use `AllowApplicantPortalAccess()` and `ApplicantPortalAccessService`.

Authorization:

- Load document by current `applicantUserId`, `requestId`, `documentId`, and `deletedAt = null`.
- Ensure the request belongs to the applicant and is not deleted.
- Ensure the file belongs to that applicant document.
- Do not authorize by `fileId` path param.

TTL:

- Use 5 minutes (`5 * 60` seconds), consistent with current Files download.
- Do not use the `SignedUrlService` 15-minute default unless a future explicit policy changes Files and applicant downloads together.

Audit logging:

- Audit successful URL signing as `applicant.document.download` or `applicant.document.signed_url.create`.
- Audit denied/failure paths only if consistent with existing audit volume policy.
- Audit payload should include actor id, user type, request id, document id, file id, school id, organization id, action, outcome, and timestamp.
- Audit payload must not include signed URL, bucket, object key, notes, child PII, or file contents.

Returned file metadata:

- Redirect response should not include a JSON metadata envelope.
- `Content-Disposition` should use the sanitized original file name through the signed URL response headers.
- The applicant can already get `originalName`, `mimeType`, and size through document detail.

Error behavior:

- Missing/foreign request or document: `404 not_found`.
- Non-applicant, parent, student, teacher, school, platform: `403 auth.scope.missing`.
- Invalid UUID: validation failure through route pipe.
- Missing token or invalid token: auth token error.
- Deleted document: `404 not_found`.
- Deleted/missing file: `404 files.not_found` or `not_found`; prefer `files.not_found` if reusing Files exception.

Caching:

- Signed URLs must not be cached by application clients beyond their short TTL.
- API responses should not include long-lived cache headers for signed URL redirects.
- List/detail responses must never include signed URLs.

Download after terminal statuses:

- Applicant may list/read/download their own retained submitted documents after `ACCEPTED` or `REJECTED`, subject to retention policy and no deletion.
- Applicant may not mutate terminal documents.
- If a future retention policy expires document access, download should return `404` or `410` according to the retention decision.

Retention constraints:

- Document/file retention must be defined before physical object cleanup.
- Soft-deleted or superseded documents should not be downloadable by default unless a future history endpoint is explicitly added.

## 9. Replace Policy Options

Option A: update existing document row/fileId in place.

- Benefits: simple current-row semantics.
- Risks: destroys audit trail, makes old file lineage unclear, makes review history unreliable, and can break bridge idempotency.
- Decision: not recommended.

Option B: create a new document and mark old as `SUPERSEDED`.

- Benefits: append-only, auditable, preserves old file metadata, supports retry, keeps replacement lineage clear.
- Risks: current model lacks `replacedByDocumentId`, so replacement lineage would be partial unless schema is expanded.
- Decision: recommended.

Option C: upload new file and keep both active.

- Benefits: simplest if multiple files per requirement are later allowed.
- Risks: duplicate active required documents can make missing/progress/review ambiguous; does not express replacement.
- Decision: not recommended for V1 required document replacement.

Option D: no replace in V1.

- Benefits: small surface.
- Risks: applicants cannot fix wrong or rejected files except by delete plus upload, which is less auditable.
- Decision: acceptable only if product defers replacement; not the recommended target.

Recommendation:

- Replacement should create a new `File` and new `ApplicantAdmissionRequestDocument`.
- Mark the old document `SUPERSEDED`.
- Do not mutate `fileId` in place.
- Allow replacement only while the request is `DRAFT`, or while the linked Admissions application is `DOCUMENTS_PENDING` / applicant-facing `needs_action`.
- Deny replacement after `UNDER_REVIEW`, `WAITLISTED`, `ACCEPTED`, or `REJECTED`, unless a future school action explicitly reopens document collection.
- If the old document was bridged, do not silently delete or overwrite the linked `ApplicationDocument`; the bridge sprint must define how superseded bridged school artifacts are hidden, superseded, or preserved.

Preferred route:

- `POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/replacements`

Reason:

- Replacement creates a new resource, so `POST .../replacements` is clearer and safer than `PATCH`.

## 10. Delete Policy Options

Option A: hard-delete document and file immediately.

- Benefits: simple visible state.
- Risks: loses audit trail, can break school review history, can delete evidence after submission, and requires safe object cleanup semantics.
- Decision: not recommended.

Option B: soft-delete document link and retain file metadata/object for retention.

- Benefits: keeps history and avoids immediate storage deletion risk.
- Risks: retained objects need future cleanup/retention policy.
- Decision: recommended baseline.

Option C: mark as superseded/deleted but keep hidden.

- Benefits: preserves lifecycle semantics and hides from active applicant/school views.
- Risks: current enum has `SUPERSEDED` but no `DELETED` value; soft delete is better for delete.
- Decision: use soft delete for delete and `SUPERSEDED` for replacement.

Option D: no delete in V1.

- Benefits: smallest surface.
- Risks: applicants cannot remove accidental optional uploads and support burden rises.
- Decision: not recommended as final V1 target, but delete can follow download in a separate sprint.

Recommendation:

- Allow delete for draft optional/unreviewed documents.
- For required documents, allow delete before submit, and while `needs_action` if it makes the mandatory item missing again.
- Use `ApplicantAdmissionRequestDocument.deletedAt`.
- Do not immediately hard-delete `File` metadata or the physical object unless a retention/cleanup worker and retention policy are defined.
- Do not silently delete bridged `ApplicationDocument`.
- Deny delete for `ACCEPTED` applicant documents unless a future school review action reopens document collection.
- Deny delete after `UNDER_REVIEW`, `WAITLISTED`, `ACCEPTED`, or `REJECTED` application statuses unless reopened.

School-side impact:

- If no bridge exists yet, soft delete only affects applicant document visibility and missing-count calculation.
- If the document is bridged, the bridge sprint must define whether the school `ApplicationDocument` remains for audit, gets a soft-delete field, is marked superseded, or is hidden by a read adapter.

## 11. ApplicationDocument Bridge Options

Option A: bridge on upload if request is already submitted.

- Benefits: post-submit `needs_action` uploads become visible immediately.
- Risks: does not handle documents uploaded while the request was draft before submit.
- Decision: recommended as part of a phased bridge, not sufficient alone.

Option B: bridge all uploaded draft documents during submit.

- Benefits: keeps drafts invisible, then makes submitted documents visible to school Admissions at the correct boundary.
- Risks: submit transaction becomes more complex and must handle bridge failure.
- Decision: recommended as part of V1.

Option C: bridge only when school staff reviews/accepts.

- Benefits: avoids treating upload as an official Admissions document too early.
- Risks: school staff needs a separate pending upload surface to see files before review.
- Decision: not recommended as the first V1 bridge unless a new school read adapter ships first.

Option D: expose applicant documents through a school read adapter without creating `ApplicationDocument`.

- Benefits: avoids overloading current `ApplicationDocument` statuses.
- Risks: creates a parallel school-side document surface and may not satisfy existing Admissions document routes.
- Decision: useful fallback if status semantics cannot be changed, but not the primary recommendation.

Recommended phased combination for V1:

- During submit, bridge all active, non-deleted applicant documents with status `UPLOADED` or `ACCEPTED`.
- For post-submit uploads while linked application is `DOCUMENTS_PENDING`, bridge immediately after successful applicant document upload.
- Do not bridge draft-only documents before submit.
- Ensure idempotency on submit retry and upload retry.
- Keep applicant ownership in `ApplicantAdmissionRequestDocument`.
- Store `applicationDocumentId` on the applicant document after bridge.
- Do not expose `applicationDocumentId` to applicants.
- School visibility must remain through the school-scoped linked `Application` and Admissions permissions.

Idempotency expectation:

- If `applicationDocumentId` is already set, do not create another `ApplicationDocument`.
- If a bridge partially succeeds, the transaction should either roll back applicant document creation/submit or be safely retryable.
- Bridge should not create duplicate `ApplicationDocument` rows for the same active applicant document.

## 12. ApplicationDocument Status and Review Semantics

Current limitation:

- `AdmissionDocumentStatus` has only `COMPLETE` and `MISSING`.
- Applicant `UPLOADED` means uploaded by applicant, not verified or accepted by school.
- Mapping applicant `UPLOADED` to school `COMPLETE` would overstate review.

Recommended status direction:

- Add `PENDING_REVIEW` to `AdmissionDocumentStatus` in the bridge sprint if existing Admissions documents are going to display applicant-submitted uploads through `ApplicationDocument`.
- Map applicant `UPLOADED` to school `PENDING_REVIEW`.
- Map applicant `ACCEPTED` to school `COMPLETE` only after a real school review/accept action exists.
- Map applicant `NEEDS_REPLACEMENT` or `REJECTED` to a future school review status only if Admissions document review semantics are implemented.

If enum changes are deferred:

- Keep the bridge as a read-only attachment artifact and preserve applicant review state separately in `ApplicantAdmissionRequestDocument`.
- Do not claim bridged documents are complete/verified.
- School presenter copy/status must clearly show pending applicant upload review without changing core enum semantics, or a separate school endpoint must be used.

Conservative recommendation:

- In Sprint 18M, add `PENDING_REVIEW` before enabling bridge visibility through existing Admissions documents.
- Defer richer statuses such as `REJECTED` and `NEEDS_REPLACEMENT` until school-side review actions are explicitly scoped.

## 13. School-Side Visibility Contract

How school staff should see applicant-uploaded submitted documents:

- Through the linked school-scoped Admissions `Application`.
- Prefer the existing Admissions documents list route if `ApplicationDocument` status semantics are expanded enough:
  - `GET /api/v1/admissions/applications/:applicationId/documents`
- Bridged applicant documents should appear in that list only after submit.

Required permissions:

- `admissions.documents.view` to list/view bridged document metadata.
- `files.downloads.view` for generic file download if school staff downloads through `/api/v1/files/:id/download`.
- Future school document-aware download route may require `admissions.documents.view` and route-local document authorization.
- Review/manage actions, if added later, require `admissions.documents.manage` or a more specific future review permission.

Own-school-only access:

- The linked `Application` and bridged `ApplicationDocument` are school-scoped.
- Another school's active context must receive `404`.
- No platform bypass is needed for normal school staff document visibility.

No draft visibility:

- Draft applicant documents have no linked `ApplicationDocument`.
- Existing Admissions list must not query `ApplicantAdmissionRequestDocument` directly for drafts.
- A new school read adapter, if ever added, must filter to submitted requests with linked own-school `Application`.

Whether existing Admissions document list should include bridged docs:

- Yes, if `ApplicationDocument` gets a safe pending-review status.
- This keeps the school review surface inside Admissions and avoids a parallel queue.

Whether a new Admissions applicant documents endpoint is needed:

- Not required if existing Admissions document list can represent pending applicant uploads accurately.
- Add a school-scoped endpoint only if the current `ApplicationDocument` shape cannot safely represent applicant upload review state.
- Any new school route must be under Admissions, require school membership, enforce own-school application scope, and never expose draft documents.

Fields school may see:

- `ApplicationDocument.id`
- `applicationId`
- safe `fileId`
- `documentType`
- school document status such as `pending_review`
- notes that are explicitly safe for school review
- safe file metadata: original name, MIME type, size, visibility
- required document title or id if added to the bridge presenter
- submitted applicant/request summary already visible through Admissions application context if scoped

Fields that remain hidden:

- `applicantUserId`
- `applicantProfileId`
- raw applicant session/credential data
- draft-only applicant documents
- raw bucket
- raw object key
- signed URL in list/detail
- internal bridge retry data
- PII beyond what the Admissions application/request contract already permits

## 14. Applicant Document Lifecycle Matrix

| Request/application state | Upload | List/read | Download | Replace | Delete | School staff visibility | Bridge behavior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `draft` | Yes | Yes | Yes, retained active docs only | Yes | Yes, with required item becoming missing | No | No bridge before submit |
| `submitted` with application `SUBMITTED` | No by default | Yes | Yes | No | No | Yes after bridge | Bridge should already exist from submit |
| `needs_action` / `DOCUMENTS_PENDING` | Yes | Yes | Yes | Yes | Yes with restrictions | Yes for bridged submitted docs only | Post-submit uploads bridge immediately |
| `under_review` | No | Yes | Yes | No | No | Yes | Existing bridge remains visible |
| `waitlisted` | No | Yes | Yes | No | No | Yes | Existing bridge remains visible |
| `accepted` | No | Yes | Yes subject to retention | No | No | Yes | Existing bridge remains visible |
| `rejected` | No | Yes | Yes subject to retention | No | No | Yes subject to retention | Existing bridge remains visible unless retention hides it |

Notes:

- Download means short-lived signed URL generation after route-local authorization.
- Superseded and soft-deleted documents are hidden from normal list/read/download.
- A future history/audit endpoint may expose superseded/deleted metadata, but that is not part of V1 document download.
- A future school reopen action may temporarily allow upload/replace/delete after review has started; that action is not currently implemented and should require explicit schema and audit design.

## 15. Missing Items and Progress Rules After Replace/Delete/Bridge

`UPLOADED`:

- Satisfies a required item for applicant-side `missingItemsCount`.
- Should count as pending review, not school-accepted.
- If bridged to `ApplicationDocument`, map to `PENDING_REVIEW` if that enum is added.

`ACCEPTED`:

- Satisfies a required item.
- May map to `ApplicationDocument.COMPLETE` only after school review exists.

`REJECTED`:

- Does not satisfy a required item.
- Should increase `missingItemsCount` if it is the only active document for a mandatory required document.
- Should allow replacement only when the application is in `DOCUMENTS_PENDING` or collection has been reopened.

`NEEDS_REPLACEMENT`:

- Does not satisfy a required item.
- Should behave like rejected for `missingItemsCount`.
- Should allow replacement only in `draft`, `needs_action`, or explicitly reopened collection.

`SUPERSEDED`:

- Does not satisfy a required item.
- The replacement document satisfies the item only if it is active, non-deleted, and in a satisfying status.

Soft-deleted documents:

- Do not satisfy required items.
- Are hidden from normal list/read/download.
- Retained file metadata/object must not be downloadable through normal applicant routes.

Optional extras:

- Do not affect `missingItemsCount`.
- May remain visible after submit if active and bridged.
- Delete should be allowed in draft when unreviewed.

Bridged documents:

- Bridge presence does not change applicant `missingItemsCount` by itself.
- Applicant document status remains the applicant-side source for missing/progress calculation.
- School `ApplicationDocument` status is for Admissions visibility/review.

Failed bridge rollback behavior:

- Submit bridge failure should roll back submit and application/document bridge changes together, or leave a safely retryable state that cannot duplicate `ApplicationDocument`.
- Post-submit upload bridge failure should either roll back applicant document/file metadata creation or mark a retryable bridge-pending state.
- Do not return success for an upload that should be school-visible if the bridge failed silently.

`progressValue` implications:

- Draft with no required uploads remains around `25`.
- Draft with some required uploads remains around `35`.
- Submitted/needs-action with missing or rejected items remains around `40`.
- Submitted/needs-action with all mandatory documents uploaded but pending review can remain around `55`.
- `submitted` can remain around `50`.
- `under_review` remains around `70`.
- `waitlisted` remains around `80`.
- `accepted` and `rejected` remain `100`.
- Continue deriving progress in the presenter; do not store it.

## 16. Proposed Future Routes

All routes in this section are proposed only. They are not implemented in Sprint 18J.

### Applicant Download

Route:

- `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download`

Contract:

- Auth: bearer token.
- Actor type: `UserType.APPLICANT` only.
- Allowed status: all applicant-visible states for active retained documents.
- Request shape: path params only.
- Response shape: `307` redirect to a 5-minute signed URL.
- Ownership rule: current applicant must own request; document must belong to request; file must belong to document.
- Storage rule: authorize before signing; never expose `bucket` or `objectKey`; signed URL only in redirect.
- Bridge behavior: none required for applicant authorization.
- Requires schema changes: no additional schema expected beyond existing document link.
- Recommended sprint: Sprint 18K.

### Applicant Replace

Preferred route:

- `POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/replacements`

Alternative route:

- `PATCH /api/v1/applicant-portal/requests/:requestId/documents/:documentId`

Contract:

- Auth: bearer token.
- Actor type: `UserType.APPLICANT` only.
- Allowed status: request `DRAFT`, or submitted request with linked application `DOCUMENTS_PENDING`; future reopened collection if implemented.
- Request shape: multipart `file`, optional `title`, `documentType`, `notes`; required document identity inherited from old document unless future product allows changing it.
- Response shape: new safe `ApplicantDocumentResponseDto`.
- Ownership rule: current applicant owns request and old document.
- Storage rule: create new private object and `File`; mark old applicant document `SUPERSEDED`; clean new object if persistence fails.
- Bridge behavior: if submitted and bridge is active, bridge the new document; old bridged school artifact must not be silently deleted.
- Requires schema changes: recommended `replacedByDocumentId`, maybe `replacedAt` for clear lineage.
- Recommended sprint: Sprint 18L.

### Applicant Delete

Route:

- `DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId`

Contract:

- Auth: bearer token.
- Actor type: `UserType.APPLICANT` only.
- Allowed status: draft unreviewed documents; submitted `DOCUMENTS_PENDING` documents only when collection remains applicant-actionable.
- Request shape: path params only.
- Response shape: `{ ok: true }` or safe deleted acknowledgement.
- Ownership rule: current applicant owns request and document.
- Storage rule: set `deletedAt` on `ApplicantAdmissionRequestDocument`; do not hard-delete `File` or physical object without retention worker.
- Bridge behavior: do not silently delete bridged `ApplicationDocument`; bridge sprint must define hidden/superseded/read behavior.
- Requires schema changes: no for applicant document soft delete; recommended future retention fields for cleanup.
- Recommended sprint: Sprint 18L.

### School Bridge/Visibility

Preferred school route:

- Existing `GET /api/v1/admissions/applications/:applicationId/documents`

Contract:

- Auth: bearer token.
- Actor type: school-scoped Admissions staff.
- Allowed application status: submitted and later school-visible statuses.
- Request shape: path `applicationId`.
- Response shape: existing `ApplicationDocumentResponseDto`, updated only if future status fields are added.
- Scope rule: own school only through `schoolScope` and Admissions application lookup.
- Storage rule: no signed URL in list; download through authorized school file route or future school document-aware download.
- Bridge behavior: includes bridged applicant documents only after submit/post-submit upload; draft documents remain invisible.
- Requires schema changes: recommended `PENDING_REVIEW` status and optional soft-delete/review fields.
- Recommended sprint: Sprint 18M.

Fallback school route if existing list is insufficient:

- `GET /api/v1/admissions/applications/:applicationId/applicant-documents`

This fallback must be school-scoped, permission-gated, submitted-application-only, and must not expose applicant draft documents.

## 17. Proposed Data Model Changes for Future Sprints

Recommended future schema changes:

- Add `PENDING_REVIEW` to `AdmissionDocumentStatus` before bridging applicant uploads through `ApplicationDocument`.
- Add `deletedAt` to `ApplicationDocument` if bridged documents can later be hidden/superseded without hard deletion.
- Add review fields to `ApplicantAdmissionRequestDocument` or a separate review model if school review is implemented:
  - `reviewedAt`
  - `reviewedByUserId`
  - safe `reviewNotes`
- Add replacement lineage fields:
  - `replacedByDocumentId`
  - optional `replacedAt`
- Add retention fields only if cleanup is implemented:
  - `retentionUntil`
  - `purgeAfter`
  - `purgedAt`
- Add a reopened collection marker/action if schools can request more documents after review starts:
  - example: `documentCollectionReopenedAt`, `documentCollectionReopenedByUserId`, or a dedicated collection action/event model.

Current schema already supports:

- Applicant document soft delete through `ApplicantAdmissionRequestDocument.deletedAt`.
- Future bridge link through `ApplicantAdmissionRequestDocument.applicationDocumentId`.
- Applicant document status values for uploaded/replacement/review states.

Do not implement any schema change in Sprint 18J.

## 18. Testing Plan for Future Runtime

Future unit tests for download:

- Download use case authorizes by applicant request/document/file link.
- Another applicant's request/document returns not found.
- Deleted document returns not found.
- Superseded document is not downloadable through normal route.
- Signed URL is created only after authorization.
- Audit payload excludes signed URL, bucket, object key, notes, and child PII.

Future e2e/security tests for download:

- Applicant can download own document only.
- Another applicant cannot download.
- No bucket or `objectKey` is exposed.
- Signed URL only comes from download route, not list/read.
- Generic `/api/v1/files/:id/download` remains unavailable to applicant.
- Parent, student, teacher, school, and platform actors are denied from applicant download route.

Future unit tests for replace/delete:

- Replace creates new `File` and new `ApplicantAdmissionRequestDocument`.
- Replace marks old document `SUPERSEDED`.
- Replace does not mutate old `fileId` in place.
- Replace cleans up new object if persistence fails.
- Delete sets `deletedAt`.
- Required item missing count excludes superseded/deleted/rejected/needs-replacement documents.

Future e2e/security tests for replace/delete:

- Replace supersedes old document.
- Old document no longer satisfies mandatory requirement.
- Replacement satisfies requirement.
- Delete soft-deletes document.
- Delete updates `missingItemsCount`.
- Replace/delete are denied after `under_review`, `accepted`, and `rejected`.
- No physical object leak or raw key response.
- Deleted/superseded documents are hidden from list/read/download.

Future unit tests for bridge:

- Submit bridges uploaded draft documents exactly once.
- Post-submit `DOCUMENTS_PENDING` upload bridges exactly once.
- Bridge stores `applicationDocumentId` on applicant document.
- Bridge is idempotent on retry.
- Bridge maps applicant `UPLOADED` to school `PENDING_REVIEW` if enum is added.
- Bridge does not expose `applicationDocumentId` to applicants.

Future e2e/security tests for bridge:

- Submitted draft documents bridge exactly once.
- Post-submit `needs_action` upload bridges exactly once.
- School own Admissions context sees bridged documents.
- Another school does not see bridged documents.
- Draft documents are invisible to school.
- Applicant response hides `applicationDocumentId`.
- No duplicate `ApplicationDocument` on retry.
- Bridge failure rolls back applicant document state or is safely retryable.

Future regression tests:

- Applicant document routes do not create `Student`, `Guardian`, `StudentGuardian`, `Enrollment`, school membership, or organization membership.
- Applicant tokens remain denied from Parent App, Student App, Teacher App, Platform Admin, school Admissions runtime, and generic Files routes.
- Global guards and `schoolScope` behavior remain unchanged.

## 19. Recommended Future Sprint Breakdown

Recommended safest sequence:

- Sprint 18K - Applicant Document Download Runtime
  - Add document-aware applicant download route.
  - Use 5-minute signed URL redirect.
  - Add download audit and security tests.
  - Keep `/api/v1/files/:id/download` school-scoped.

- Sprint 18L - Applicant Document Replace/Delete Runtime
  - Add replacement route using append-only supersede policy.
  - Add delete route using soft delete.
  - Define retention behavior without physical purge unless cleanup worker ships.
  - Add missing-count and lifecycle tests.

- Sprint 18M - ApplicationDocument Bridge + School Admissions Visibility Runtime
  - Add `PENDING_REVIEW` to Admissions document status if using existing Admissions documents route.
  - Bridge draft uploads during submit.
  - Bridge post-submit `DOCUMENTS_PENDING` uploads immediately after upload.
  - Ensure idempotency.
  - Confirm school staff own-school visibility through Admissions.

- Sprint 18N - Applicant Portal Final Closeout Audit
  - Documentation-only audit of account, discovery, request, submit, documents, download, replace/delete, bridge, and deferred conversion.

- Final Sprint 18 Closeout
  - Update `Moazez-Project-Structure.json` once for the full Sprint 18 closeout.

Do not update `Moazez-Project-Structure.json` in Sprint 18K, 18L, 18M, or 18N as a per-sprint step.

## 20. Explicit Non-Goals

- No runtime implementation in Sprint 18J.
- No schema changes in Sprint 18J.
- No migration changes in Sprint 18J.
- No download implementation in Sprint 18J.
- No signed URL route in Sprint 18J.
- No delete/replace implementation in Sprint 18J.
- No bridge implementation in Sprint 18J.
- No Admissions runtime change.
- No Files runtime change.
- No Students runtime change.
- No Parent App runtime change.
- No DTO, controller, service, repository, presenter, guard, decorator, or test changes.
- No package script changes.
- No seed changes.
- No Student, Guardian, StudentGuardian, Enrollment, membership, or applicant-to-parent conversion.
- No global guard changes.
- No `schoolScope` changes.
- No `ERROR_CATALOG.md` change.
- No `README.md` change.
- No `Moazez-Project-Structure.json` update.

## 21. Final Recommendation

Download boundary:

- Add `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download`.
- Authorize by route-local applicant ownership before signing.
- Keep `/api/v1/files/:id/download` school-scoped and unavailable to applicants.

Signed URL response behavior:

- Use a `307` temporary redirect, consistent with current Files download.
- Use a 5-minute signed URL TTL.
- Do not expose signed URLs in upload/list/read responses.
- Do not expose `bucket` or `objectKey`.
- Audit signing without signed URL or PII.

Replace policy:

- Use append-only replacement.
- Create a new private `File` and new `ApplicantAdmissionRequestDocument`.
- Mark old document `SUPERSEDED`.
- Do not mutate `fileId` in place.
- Allow only during draft or `DOCUMENTS_PENDING` / `needs_action`, unless a future school reopen action exists.

Delete policy:

- Use soft delete on `ApplicantAdmissionRequestDocument`.
- Allow draft optional/unreviewed delete, and required delete only when the request/application state remains applicant-actionable.
- Retain `File` metadata and physical object until a retention cleanup worker/policy exists.
- Do not silently delete bridged `ApplicationDocument`.

Bridge policy:

- Bridge draft uploads during submit.
- Bridge post-submit `DOCUMENTS_PENDING` uploads immediately after successful upload.
- Do not bridge draft-only documents before submit.
- Store `applicationDocumentId` on the applicant document after bridge.
- Do not expose `applicationDocumentId` to applicants.
- School visibility remains through school-scoped Admissions `Application` and Admissions permissions.

`ApplicationDocument` status recommendation:

- Add `PENDING_REVIEW` in the bridge sprint before showing applicant uploads through existing Admissions documents.
- Do not treat applicant `UPLOADED` as school-verified `COMPLETE`.
- Defer richer review statuses until school-side document review is explicitly scoped.

Next runtime sprint:

- Sprint 18K - Applicant Document Download Runtime.
