# Sprint 19A - Applicant Admissions Document Review Contract Audit

## 1. Purpose and Scope

Sprint 19A-0 is a documentation-only contract and architecture audit for the next Applicant Portal / Admissions workflow sprint.

This audit proposes the school-side document review contract for applicant-submitted documents that were bridged into Admissions as `ApplicationDocument` records in Sprint 18M. It does not authorize runtime implementation.

No runtime, schema, migration, generated Prisma client, DTO, controller, service, repository, presenter, guard, test, seed, package, deployment, CORS, server, `.env`, `README.md`, `Moazez-Project-Structure.json`, or source-code changes are authorized by this audit.

The only intended changed file is:

- `docs/sprint-19a-applicant-document-review-contract-audit.md`

Repository note: the required-reading list references `DIRECTORY_STRUCTURE.md`, but this checkout contains `DIRECTORY_STRUCTURE_VISUAL.md` instead. This audit uses the available directory reference plus actual repository structure.

## 2. Current Baseline

Expected current HEAD:

- `99b4817 test: stabilize import job status assertion`

Completed Applicant Portal / Admissions bridge state:

- Applicant accounts are `UserType.APPLICANT`.
- Applicant accounts remain membershipless before acceptance.
- Applicant Portal access is route-local through `@AllowApplicantPortalAccess()` and `ApplicantPortalAccessService`.
- Public school discovery and required document discovery are implemented.
- Applicant-owned requests can be created, listed, read, and submitted.
- Submit creates or reuses exactly one school-scoped Admissions `Application`.
- Applicant documents can be uploaded, listed, read, downloaded, replaced, and deleted within current applicant-side lifecycle rules.
- Submitted applicant documents are bridged to school-scoped `ApplicationDocument` rows.
- Bridged applicant `UPLOADED` documents map to `AdmissionDocumentStatus.PENDING_REVIEW` and API `pending_review`.
- Applicant responses hide internal `applicationId` and `applicationDocumentId`.

Current implemented routes involved:

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
- `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download`
- `POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/replacements`
- `DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId`
- `GET /api/v1/admissions/applications/:applicationId/documents`
- `POST /api/v1/admissions/applications/:applicationId/documents`
- `DELETE /api/v1/admissions/applications/:applicationId/documents/:documentId`

Current missing workflow actions:

- No school-side accept document action.
- No school-side reject document action.
- No school-side request replacement action.
- No school-side reopen document collection action.
- No applicant replacement flow after a bridged document is school-requested for replacement.
- No school-side review notes or reviewer metadata contract.
- No applicant-to-parent conversion.
- No Student, Guardian, StudentGuardian, Enrollment, school membership, or Parent App activation side effects.

## 3. ADR and Contract Interpretation

ADR-0003 applies directly to Sprint 19A because school review touches applicant-owned document records, school-scoped Admissions records, and membershipless applicant access.

Required ADR-0003 constraints:

- Applicants remain `UserType.APPLICANT`.
- Applicants remain membershipless before acceptance.
- Applicant accounts are not Parent accounts.
- Existing school-created Guardian/Parent flows remain valid and unchanged.
- Applicant Portal routes use route-local applicant access checks.
- Global `ScopeResolverGuard`, `PermissionsGuard`, and Prisma `schoolScope` must not be weakened.
- Applicant-owned data requires explicit applicant ownership checks.
- Applicant-to-parent/guardian/student/enrollment conversion remains deferred.

ADR examples are product intent references, not literal backend route contracts. They do not automatically rename, reshape, or replace shipped backend routes.

For Sprint 19A, authoritative contract inputs are:

- Existing `/api/v1` backend routes.
- Controllers, DTOs, presenters, and use-cases in `src/modules/admissions/**` and `src/modules/applicant-portal/**`.
- `API_CONTRACT_RULES.md`, especially the mandatory `/api/v1` prefix and no-breaking-change rule.
- Current Prisma enums and normalized model boundaries.

Do not rename existing Admissions or Applicant Portal routes based only on ADR examples. Do not weaken existing `/api/v1` contracts.

Any future implementation that requires applicant identity changes, global guard changes, `schoolScope` changes, applicant membership, or accepted-application conversion requires a new ADR or explicit ADR-0003 update.

## 4. Proposed Sprint 19A Runtime Scope

Recommended runtime scope after this audit:

- School-side document review only.
- Accept applicant-bridged document.
- Reject applicant-bridged document.
- Request replacement for applicant-bridged document.
- Reopen applicant document collection only when replacement is requested.
- Allow applicant replacement of submitted/bridged documents only after a school-side replacement request.
- Keep append-only document replacement behavior.
- Keep school-side review under the existing Admissions surface.
- Keep Applicant Portal responses safe and continue hiding internal bridge ids.
- Keep school-side access school-scoped through Admissions application/document scope.

The basic review workflow should operate on the linked school-scoped `ApplicationDocument` and, when present, its linked `ApplicantAdmissionRequestDocument`.

Recommended minimum mapping:

- Accept: `ApplicationDocument.status = COMPLETE`; linked applicant document `status = ACCEPTED`.
- Reject: `ApplicationDocument.status = MISSING`; linked applicant document `status = REJECTED`.
- Request replacement: `ApplicationDocument.status = MISSING`; linked applicant document `status = NEEDS_REPLACEMENT`; linked application remains or moves to `DOCUMENTS_PENDING`.
- Applicant replacement after request: create a new applicant document/file record; mark the prior applicant document `SUPERSEDED`; bridge the replacement to a new `ApplicationDocument` as `PENDING_REVIEW`.

## 5. Proposed Non-Goals

Sprint 19A runtime should not include:

- Applicant-to-parent conversion.
- Student creation.
- Guardian creation.
- StudentGuardian creation.
- Enrollment creation.
- School membership creation.
- Organization membership creation.
- Parent App activation.
- Email, SMS, push, or in-app notification delivery.
- Physical file purge.
- Generic applicant upload routes.
- Generic school upload routes.
- Advanced Admissions workflow.
- Advanced analytics builder.
- Dashboard changes.
- Platform/billing changes.
- Feature-enforcement changes.
- Marketplace, wallet, finance, or HR work.

## 6. Lifecycle Matrix

Current relevant Prisma statuses:

- `AdmissionDocumentStatus`: `COMPLETE`, `MISSING`, `PENDING_REVIEW`.
- `ApplicantAdmissionRequestDocumentStatus`: `UPLOADED`, `NEEDS_REPLACEMENT`, `ACCEPTED`, `REJECTED`, `SUPERSEDED`.
- `AdmissionApplicationStatus`: `SUBMITTED`, `DOCUMENTS_PENDING`, `UNDER_REVIEW`, `ACCEPTED`, `WAITLISTED`, `REJECTED`.
- `ApplicantAdmissionRequestStatus`: `DRAFT`, `SUBMITTED`.

Current statuses are sufficient for a minimum Sprint 19A review workflow. No new enum value appears required for accept, reject, request replacement, applicant replacement after request, or replacement re-bridge.

Schema extension is likely not required for the minimum contract. Schema extension is likely required later if product requires explicit reviewer id, reviewed timestamp, applicant-visible review messages, replacement reasons, reopen event history, current-vs-historical document filtering, or physical retention metadata.

| Scenario | Current state | Proposed transition | Schema need |
| --- | --- | --- | --- |
| `ApplicationDocument` before review | Bridged applicant docs appear as `PENDING_REVIEW` / `pending_review`; applicant doc usually `UPLOADED`. | Keep as school-visible pending review. | No change. |
| Accept document | Pending applicant document is reviewed by permitted school user. | Set `ApplicationDocument.status = COMPLETE`; set linked applicant document `status = ACCEPTED`. If application was `DOCUMENTS_PENDING` and all mandatory docs are now satisfied, future use-case may move application to `SUBMITTED` without starting advanced workflow. | No enum change. |
| Reject document | School rejects the current uploaded file but does not open replacement collection. | Set `ApplicationDocument.status = MISSING`; set linked applicant document `status = REJECTED`. Keep applicant replacement unavailable unless a replacement request is explicitly made. | No enum change. |
| Request replacement | School asks applicant for a replacement file. | Set `ApplicationDocument.status = MISSING`; set linked applicant document `status = NEEDS_REPLACEMENT`; ensure linked application is `DOCUMENTS_PENDING` so Applicant Portal presents `needs_action`. | No enum change. Review reason persistence may need a future field. |
| Applicant replacement after request | Applicant calls replacement route only for own document after school set `NEEDS_REPLACEMENT`. | Create new private `File` and new `ApplicantAdmissionRequestDocument` with `UPLOADED`; mark old applicant document `SUPERSEDED`; retain old file and old school document. | No enum change. Implementation must narrow current post-submit replacement policy to school-requested replacement. |
| Re-bridge replacement document | Replacement is uploaded after school request and application is in document collection. | Bridge replacement to a new `ApplicationDocument` with `PENDING_REVIEW`; keep applicant response free of `applicationDocumentId`. | No enum change. Current append-only bridge style fits. |
| Repeated submit behavior | Repeated submit already reuses the linked application and bridges only unbridged active documents. | Preserve idempotency. Repeated submit must not duplicate `Application`, duplicate already bridged docs, or re-open collection by itself. | No change. |
| Missing mandatory document behavior | Missing count is derived from active mandatory required documents minus active applicant docs in satisfying statuses (`UPLOADED`, `ACCEPTED`). | After request replacement or reject, `NEEDS_REPLACEMENT`, `REJECTED`, `SUPERSEDED`, and deleted docs do not satisfy mandatory requirements. Replacement `UPLOADED` satisfies applicant action while pending school review. | No enum change. |
| Bridged document delete/replace policy | Current applicant replace/delete rejects bridged docs because `applicationDocumentId` is set. | Future implementation must add a controlled exception for school-requested replacement, without allowing arbitrary applicant mutation of bridged docs. | No schema change required if implemented by status/scope checks. |

Important distinction:

- `ApplicationDocument.status` is the school-side document tracking status.
- `ApplicantAdmissionRequestDocument.status` is the applicant-facing document lifecycle status.
- Applicant Portal should not expose internal `ApplicationDocument.id`.
- School Admissions can expose `ApplicationDocument.id` as part of the existing school-side contract.

## 7. Proposed Routes

Proposed school-side Admissions routes:

- `POST /api/v1/admissions/applications/:applicationId/documents/:documentId/accept`
- `POST /api/v1/admissions/applications/:applicationId/documents/:documentId/reject`
- `POST /api/v1/admissions/applications/:applicationId/documents/:documentId/request-replacement`

These routes should live under the existing Admissions documents surface:

- Controller area: `src/modules/admissions/documents/controller/`
- Use-cases: `src/modules/admissions/documents/application/`
- Repository work: `src/modules/admissions/documents/infrastructure/`
- Presenter/DTO updates only as needed for review responses.

Do not invent broad generic upload or review routes.

The existing applicant replacement route should be narrowed/extended for school-requested replacement:

- `POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/replacements`

Recommended applicant replacement behavior after Sprint 19A:

- Draft replacement can remain applicant-controlled for unsubmitted draft documents.
- Submitted/bridged replacement must be allowed only when the school-side action has set the applicant document to `NEEDS_REPLACEMENT` and the linked application is in `DOCUMENTS_PENDING`.
- Replacement must remain append-only: create a new file and applicant document, mark the previous applicant document `SUPERSEDED`, and bridge the replacement as a new `ApplicationDocument`.
- Applicant responses must continue to hide `applicationDocumentId`, raw bucket, raw object key, and signed URLs outside download redirects.

No new applicant upload route should be added.

## 8. Proposed Permissions

Current Admissions permissions in `prisma/seeds/01-permissions.seed.ts` include:

- `admissions.applications.view`
- `admissions.applications.manage`
- `admissions.documents.view`
- `admissions.documents.manage`

Recommended permission for review mutations:

- Use `admissions.documents.manage` for accept, reject, and request replacement.

Rationale:

- Review actions mutate the document lifecycle.
- Existing create/delete document actions already use `admissions.documents.manage`.
- No new permission is needed for the minimum review workflow.

Optional future split:

- If product needs a narrower role capability, introduce `admissions.documents.review` in a later implementation phase.
- That would require permission seed changes, role composition updates, and migration/seed implications.
- Do not add a new permission unless role policy requires separating upload/manage from review.

## 9. Audit Logging Plan

School-side review mutations must write explicit audit logs.

Recommended audit action names:

- `admissions.document.accept`
- `admissions.document.reject`
- `admissions.document.request_replacement`

Existing applicant replacement audit remains:

- `applicant.document.replace`

Recommended audit fields:

- `actorId`
- `userType`
- `organizationId`
- `schoolId`
- `module = admissions`
- action name
- `resourceType = admission_application_document`
- `resourceId = ApplicationDocument.id`
- `outcome`
- `before` with safe status snapshot
- `after` with safe status snapshot

Safe metadata examples:

- `applicationId`
- `applicationDocumentId`
- linked `applicantDocumentId` if present
- `fileId`
- `requiredDocumentId` if present
- `previousApplicationDocumentStatus`
- `nextApplicationDocumentStatus`
- `previousApplicantDocumentStatus`
- `nextApplicantDocumentStatus`
- `applicationStatusBefore`
- `applicationStatusAfter`
- `reasonProvided: true | false`

Audit payloads must not include:

- signed URLs
- buckets
- object keys
- raw storage provider URLs
- file contents
- full applicant notes
- full rejection/replacement reason text if it may include PII
- passwords
- tokens
- excessive applicant or child PII

If reviewer comments must be retained verbatim, that needs a deliberate product/security decision and likely a dedicated applicant-safe review note field or review event model.

## 10. Security and Tenancy Requirements

Required runtime behavior:

- School A cannot review School B documents.
- Review routes require active school scope.
- Review routes must query the `Application` and `ApplicationDocument` through current school scope.
- Applicants cannot call school Admissions review routes.
- Parent, student, teacher, and unrelated school users cannot call school review routes unless their existing role policy grants the required Admissions permission.
- Missing permission returns forbidden.
- Cross-school guessed `applicationId` or `documentId` returns not found where existence would otherwise leak.
- Cross-applicant document guessing through Applicant Portal remains not found.
- School users must not use Applicant Portal routes to bypass Admissions permissions.
- Applicant replacement after submission is allowed only after school-side replacement request.
- Applicant replacement cannot mutate school decision, tests, interviews, enrollment handoff, or application final decision.
- No raw bucket, object key, provider URL, file content, or signed URL appears in list/detail/review responses.
- Signed URL generation remains isolated to authorized download routes.
- Global `ScopeResolverGuard`, `PermissionsGuard`, and Prisma `schoolScope` must not be loosened.
- No platform bypass is needed for normal school review.
- No applicant membership is created.
- No Student, Guardian, StudentGuardian, Enrollment, or Parent account is created.

School-side review should not directly query applicant-owned models unless the query is anchored through the scoped `ApplicationDocument` and linked current-school `Application`, or the model is explicitly added to scope coverage in a later migration/code phase with security tests. Current Sprint 18N noted that applicant-owned models are protected by route-local explicit filters rather than automatic `SCHOOL_SCOPED_MODELS` injection.

## 11. Testing Plan

Future unit/use-case tests:

- `src/modules/admissions/documents/tests/application-document-review.use-case.spec.ts`
- `src/modules/admissions/documents/tests/application-document-review.presenter.spec.ts`
- Update `src/modules/applicant-portal/tests/applicant-portal-documents.spec.ts`

Unit cases:

- Accept requires scoped application and document.
- Accept maps `PENDING_REVIEW` to `COMPLETE`.
- Accept maps linked applicant document `UPLOADED` to `ACCEPTED`.
- Reject maps school document to `MISSING`.
- Reject maps linked applicant document to `REJECTED`.
- Request replacement maps school document to `MISSING`.
- Request replacement maps linked applicant document to `NEEDS_REPLACEMENT`.
- Request replacement moves or keeps linked application in `DOCUMENTS_PENDING`.
- Applicant replacement is denied for bridged documents unless status is `NEEDS_REPLACEMENT`.
- Applicant replacement after request creates a new file/document and marks old applicant document `SUPERSEDED`.
- Replacement re-bridge creates one new `ApplicationDocument` with `PENDING_REVIEW`.
- Audit payload excludes signed URL, bucket, object key, file content, token, password, and excessive PII.

Future E2E tests:

- `test/e2e/applicant-portal-document-review.e2e-spec.ts`

E2E cases:

- School user with `admissions.documents.manage` accepts a pending applicant document.
- School user rejects a pending applicant document.
- School user requests replacement.
- Applicant sees `needs_action` after replacement request.
- Applicant can replace only after replacement request.
- Replacement appears to school as a new `pending_review` Admissions document.
- Repeated submit does not duplicate application or already bridged documents.
- Missing mandatory documents keep applicant request/application in needs-action behavior.
- Applicant responses hide `applicationId` and `applicationDocumentId`.
- No Student, Guardian, StudentGuardian, Enrollment, membership, or Parent account side effects.

Future security tests:

- `test/security/tenancy.applicant-portal-document-review.spec.ts`

Security cases:

- School A cannot accept/reject/request replacement for School B application documents.
- Applicant cannot call school review routes.
- Parent/student/teacher cannot call review routes unless explicitly granted by existing school role policy.
- School user missing `admissions.documents.manage` receives forbidden.
- Guessed cross-school application/document ids return not found.
- Cross-applicant replacement guessing remains not found.
- Applicant cannot use generic school Admissions review routes.
- School user cannot use Applicant Portal replacement route.
- Generic `/api/v1/files/:id/download` remains unavailable to applicants.
- No raw storage fields or signed URLs appear in non-download responses.
- Global guard and `schoolScope` behavior remain unchanged.

## 12. Implementation Phases After This Audit

Recommended future phases:

1. Schema/domain lifecycle check.
   - Confirm no enum changes are needed for the minimum workflow.
   - Add schema only if reviewer metadata, review notes, explicit reopen timestamps, or current/historical document filtering is required.

2. School-side review actions.
   - Add accept, reject, and request-replacement use-cases under Admissions documents.
   - Protect with `admissions.documents.manage`.
   - Require scoped application/document lookup.

3. Applicant replacement-after-request behavior.
   - Narrow submitted/bridged replacement to `NEEDS_REPLACEMENT`.
   - Preserve draft replacement behavior if product still wants draft edits.
   - Keep append-only file/document replacement.
   - Bridge replacement documents as `PENDING_REVIEW`.

4. Audit logging.
   - Add school-side review audit entries.
   - Keep audit payloads id-based and storage-safe.

5. E2E and security verification.
   - Add document review E2E coverage.
   - Add cross-school/cross-actor security coverage.
   - Verify no conversion or operational identity side effects.

6. Final closeout audit.
   - Document implemented route inventory.
   - Confirm lifecycle transitions.
   - Confirm deferred conversion and notification behavior.
   - Confirm no guard or `schoolScope` weakening.

## 13. Risks and Explicit Revisit Triggers

Risks:

- Existing `ApplicationDocument` has no review metadata. Basic status transitions are possible, but reviewer identity, reviewed timestamp, and safe applicant-facing feedback require additional design.
- Existing applicant replacement currently rejects bridged documents because `applicationDocumentId` is set. Runtime work must add a controlled exception only for school-requested replacement.
- Append-only replacement may leave historical `ApplicationDocument` rows visible unless presenters or future schema distinguish current vs historical documents.
- Applicant/required-document models are not currently listed in `SCHOOL_SCOPED_MODELS`; any direct school-side querying of those models needs explicit scoped coverage or equivalent tested filters.
- Using free-text rejection/replacement reasons can introduce PII into audit logs or applicant responses unless separately governed.

ADR-0003 must be revisited if future work introduces:

- Applicant-to-parent conversion.
- Applicant receiving any school or organization membership.
- Global guard changes.
- `ScopeResolverGuard` changes beyond existing route-local Applicant Portal access.
- `PermissionsGuard` weakening.
- Prisma `schoolScope` changes or bypasses for applicant/school review.
- Mandatory Applicant Portal onboarding.
- Richer public school discovery that exposes operational fields.
- Direct school-side querying of applicant-owned models without explicit scoped coverage.
- Creation of Student, Guardian, StudentGuardian, Enrollment, school membership, or Parent account from applicant review routes.
- Notification/email/SMS behavior coupled to document review without a scheduled notification sprint.

## 14. Final Recommendation

Proceed to a narrow Sprint 19A runtime implementation focused on school-side Admissions document review.

Use existing route shape under Admissions, existing `admissions.documents.manage` permission, and existing statuses for the minimum lifecycle. Do not add a new enum unless product requires richer school-visible states beyond `pending_review`, `complete`, and `missing`.

The likely safest implementation is:

- Accept: school document `complete`, applicant document `accepted`.
- Reject: school document `missing`, applicant document `rejected`.
- Request replacement: school document `missing`, applicant document `needs_replacement`, application `documents_pending`.
- Applicant replacement after request: append-only replacement, old applicant document `superseded`, new applicant document `uploaded`, new school document `pending_review`.

Keep all conversion, notification, physical purge, advanced workflow, and platform/dashboard changes out of scope.
