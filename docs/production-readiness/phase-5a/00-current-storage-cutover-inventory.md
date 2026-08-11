# Current Storage Cutover Inventory

> Historical Batch 0 baseline. The Batch 3 recomputation and current cutover
> implementation inventory are recorded in
> `02-storage-batch-3-source-cutover.md`; the counts remain 22 consumer classes
> across 21 files and 16 functional families.

## Document control and scope

| Field | Value |
| --- | --- |
| Batch | `BATCH_0_CURRENT_BASELINE_GOVERNANCE_AND_INVENTORY` |
| Inventory date | 2026-08-10 (Africa/Cairo) |
| Branch | `feat/storage-gcs-cutover` |
| Source baseline | `1077f7fec7555c6c52c27340ead9f3ecbd133542` |
| Source authority | formally closed Production Readiness Phase 3 baseline |
| Runtime/storage changes | none |
| Cloud actions | none |

This inventory was generated from the current source tree at the source
baseline. Historical counts were treated only as search hints and were
revalidated. No `.env` file, credential, service-account private key, token,
production connection string, or secret value was read.

```text
PHASE_3=COMPLETE
PHASE_4=NOT_COMPLETE
PHASE_5A=NOT_COMPLETE
PHASE_5B=NOT_STARTED
LEARNING_MEDIA_HTTP_200_PRESERVED_REQUIRED=YES
```

## Exact current totals

| Inventory item | Exact current result |
| --- | ---: |
| Production `StorageService` consumer classes | 22 |
| Files containing those classes | 21 |
| Direct `MinioAdapter` consumer classes | 2 |
| Production files importing `MinioAdapter` | 3 |
| Direct `SignedUrlService` consumer classes | 1 |
| Server-multipart feature families | 6 |
| Server-multipart HTTP endpoints | 7 |
| Direct signed-PUT feature families | 1 |
| Managed-reference-only feature families | 9 |
| Managed-reference-only `File.id` intake endpoints | 18 |
| Managed upload/reference intake families in this classification | 16 |

The historical twenty-consumer count is stale; the exact current count is 22.
The historical six multipart-family count remains correct, but one family
(Applicant Portal documents) has two multipart endpoints, so there are seven
multipart HTTP entrypoints.

## A. Storage infrastructure

### Wiring and concrete boundary

- `src/infrastructure/storage/storage.module.ts` always provides and exports
  `MinioAdapter`, `SignedUrlService`, and `StorageService`; there is no provider
  token or provider-switch factory.
- `StorageService` injects `MinioAdapter` and `SignedUrlService` directly.
- `SignedUrlService` injects `MinioAdapter` directly.
- Exact direct `MinioAdapter` consumers are therefore `StorageService` and
  `SignedUrlService` (2). Exact production import sites are
  `storage.module.ts`, `storage.service.ts`, and `signed-url.service.ts` (3).
- The sole direct `SignedUrlService` consumer is `StorageService`; its two
  production import sites are `storage.module.ts` and `storage.service.ts`.
- Exporting `MinioAdapter` and `SignedUrlService` from `StorageModule` exposes
  provider-specific infrastructure even though no feature module currently
  consumes either directly.

### `StorageService` surface

Current methods are `saveObject`, `deleteObject`, `createDownloadUrl`,
`createUploadUrl`, `statObject`, `getObject`, `objectExists`,
`deleteObjectAndConfirmAbsent`, `listObjectsPage`, `resolveBucket`, and
`checkReadiness`.

`saveObject` and `createUploadUrl` resolve `FileVisibility` to a configured
bucket through `SignedUrlService`. Other calls accept explicit bucket/object
coordinates. `deleteObjectAndConfirmAbsent` checks existence before deletion,
deletes when present, checks again, and throws
`storage_object_still_present` if physical absence is not observed.

### `SignedUrlService`

- private bucket: `STORAGE_BUCKET`;
- public visibility bucket: `STORAGE_PUBLIC_BUCKET`;
- default signed-GET TTL: 15 minutes when a caller does not specify one;
- dispositions: `attachment`, `inline`, or `none`;
- provider query overrides: `response-content-type` and
  `response-content-disposition`;
- filenames are stripped of quote, carriage-return, and newline characters.

### `MinioAdapter`

The adapter implements put, get/stream, stat, remove, exists, paginated list,
presigned GET, presigned PUT, and bucket-existence readiness. It constructs a
normal client and a separately bounded readiness client. Readiness has a 500 ms
request timeout, zero retries, disabled keep-alive, and two maximum sockets.

Provider-specific types currently cross the concrete boundary:

- MinIO `BucketItemStat` is returned by `statObject`;
- `PresignedPutCapability` and `PresignedGetCapability` are exported from
  `minio.adapter.ts` and propagated through service return-type inference;
- list entries are reshaped to object key/size/last-modified, but pagination
  retains MinIO `startAfter` ordering semantics; put returns only an ETag and
  exposes no provider-neutral generation/version field;
- signed expiry is parsed from AWS-style `X-Amz-Date` and `X-Amz-Expires`.

List pagination uses MinIO `listObjectsV2` with `startAfter`, reads up to
`limit + 1`, destroys the stream early, and uses the last returned object name
as `nextStartAfter`.

### Request-path bucket creation

`MinioAdapter.ensureBucketExists` calls `bucketExists` then `makeBucket`. It is
invoked by both `putObject` and presigned-PUT creation. Bucket creation is
therefore performed in request paths today. This must not carry into the GCS
production adapter; PRD5A-G04 still requires IaC-provisioned buckets and a
negative bucket-create IAM proof.

### Readiness

`StorageService.checkReadiness` resolves both the private and public buckets
and checks them concurrently through `bucketExistsForReadiness`. Any rejected
or false result becomes `storage_bucket_unavailable`. `OperationalProbeService`
uses this dependency for API, Core Worker, and Media Worker manifests when
storage is required. Maintenance Scheduler does not import `StorageModule` and
has no storage readiness dependency.

### Configuration and dependency support

Only environment variable names and validators were inspected; no environment
file or value was read.

| Concern | Current source contract |
| --- | --- |
| Provider | `STORAGE_PROVIDER`; allowed values exactly `minio` or `s3`; default `minio` |
| Endpoint | `STORAGE_ENDPOINT` |
| Static credentials | `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` |
| Buckets | `STORAGE_BUCKET`, `STORAGE_PUBLIC_BUCKET` |
| Browser origins | API also validates `STORAGE_CORS_ORIGINS` in staging/production; runtime code does not configure bucket CORS |
| Roles | API, Core Worker, and Media Worker validate storage fields; Maintenance Scheduler does not |

Selecting `s3` changes validation only; current wiring still uses
`MinioAdapter`. There is no `gcs` option. `minio` `^8.0.7` is a direct
dependency. `@google-cloud/storage` 7.21.0 appears only as an optional
transitive Firebase Admin dependency in the lockfile and is not a direct
storage implementation dependency. No AWS SDK is present.

### Provider-specific error interpretation outside `MinioAdapter`

| Path | Assumption outside adapter |
| --- | --- |
| `src/modules/files/uploads/application/media-verifier.service.ts` | treats `NoSuchKey`, `NoSuchObject`, and `NotFound` as object absence |
| `src/modules/files/imports/application/process-import-validation.use-case.ts` | same codes plus `statusCode === 404` |
| `src/modules/settings/branding/domain/branding-logo.errors.ts` | same codes plus HTTP 404; reused by public serving and cleanup |
| `src/modules/settings/branding/application/get-public-school-branding-logo.use-case.ts` | reads MinIO `stat.metaData`, searches case-insensitively for `content-type`, and compares MinIO `stat.size` |

These are part of the accepted D010 normalization work; Batch 0 does not
change them.

## B. Complete `StorageService` consumer matrix

All feature objects in this matrix use the private bucket. The only public
bucket operation is readiness, which checks both configured buckets.
Authorization is recorded as occurring before storage access when the use case
loads and validates the actor/school/organization/owner/File/session claim
before invoking storage. Worker rows use persisted scoped claims rather than an
end-user request guard.

| # | Exact path and class | Feature / reachability | Operations | Authorization before storage | Focused coverage |
| ---: | --- | --- | --- | --- | --- |
| 1 | `src/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.coordinator.ts` — `LessonContentPlaybackCoordinator` | Learning Content; API through teacher, student, and parent playback | signed GET | Yes: app actor/child/lesson publication, school/org, private `File`, and final upload-session coordinates are checked; snapshot is revalidated after signing | playback coordinator/contract specs; teacher/student/parent playback integrations; Learning Media Range integration; tenancy lesson-content tests |
| 2 | `src/modules/applicant-portal/application/upload-applicant-document.use-case.ts` — `UploadApplicantDocumentUseCase` | Applicant files; API | save; compensating delete | Yes: authenticated applicant, request ownership, organization/school state, request/application status | applicant portal document spec; applicant tenancy/document tests |
| 3 | `src/modules/applicant-portal/application/replace-applicant-document.use-case.ts` — `ReplaceApplicantDocumentUseCase` | Applicant files; API | save; compensating delete | Yes: applicant/request/document ownership and replacement eligibility | applicant document spec; replace/delete tenancy tests |
| 4 | `src/modules/applicant-portal/application/get-applicant-document-download-url.use-case.ts` — `GetApplicantDocumentDownloadUrlUseCase` | Applicant files; API | signed GET | Yes: applicant/request/document ownership and non-deleted File | applicant document spec; document-download tenancy tests |
| 5 | `src/modules/communication/application/communication-message-attachment-download.use-case.ts` — `GetCommunicationMessageAttachmentDownloadUrlUseCase` | Chat attachments; API through teacher, student, and parent wrappers | signed GET | Yes: wrapper actor/conversation checks plus scoped message/attachment/File query | communication message-attachment spec; teacher/student/parent message specs; communication tenancy tests |
| 6 | `src/modules/files/uploads/application/upload-file.use-case.ts` — `UploadFileUseCase` | Generic Files; API | save; compensating delete | Yes: `requireFilesScope` and route permission precede storage | upload-file/controller specs; Files tenancy tests |
| 7 | `src/modules/files/uploads/application/media-verifier.service.ts` — `MediaVerifierService` | Learning Media verification; synchronous API completion | stat staging; get/stream staging; save final; stat final | Yes: called only after the completion use case claims and validates the owned session | Learning Media unit, storage, upload, and verification integrations; learning-media tenancy tests |
| 8 | `src/modules/files/uploads/application/learning-media-upload.use-cases.ts` — `CreateLearningMediaUploadUseCase` | Learning Media; API | resolve bucket; signed PUT | Yes: files scope, school-management/permission guards, actor/school/idempotency session ownership | learning-media upload unit/integration and tenancy tests |
| 9 | same file — `CompleteLearningMediaUploadUseCase` | Learning Media; synchronous API completion | delete + exists confirmation on failed finalization; delegates verification operations | Yes: owned session claim and state checks precede verification/storage | learning-media upload/verification/storage integrations and tenancy tests |
| 10 | `src/modules/files/uploads/application/learning-media-cleanup.service.ts` — `LearningMediaCleanupService` | Learning Media cleanup; Media Worker | delete + exists confirmation for staging/final | Persisted scoped cleanup claim before storage; worker has no end-user guard | cleanup integration; upload-session contract/unit tests; runtime role wiring tests |
| 11 | `src/modules/files/uploads/application/get-file-download-url.use-case.ts` — `GetFileDownloadUrlUseCase` | Generic Files; API | signed GET | Yes: files scope and scoped non-deleted File lookup | download-url unit spec; generic-download tenancy boundary |
| 12 | `src/modules/files/imports/application/process-import-validation.use-case.ts` — `ProcessImportValidationUseCase` | Imports; Core Worker | stat | Persisted ImportJob/File claim before storage; worker has no end-user guard | import creation unit coverage; runtime/critical-queue contracts; admissions import tenancy |
| 13 | `src/modules/files/imports/application/create-import-job.use-case.ts` — `CreateImportJobUseCase` | Imports; API producer | save; compensating delete | Yes: import scope and permission precede storage | create-import-job spec; Files/import tenancy coverage |
| 14 | `src/modules/health/operational-probe.service.ts` — `OperationalProbeService` | Operational readiness; API/Core/Media | readiness (private + public buckets) | Not tenant data access; protected management probe/policy chooses dependencies | operational-probe service/manifests; bootstrap management-probe integration/process tests |
| 15 | `src/modules/student-app/profile/application/upload-student-avatar.use-case.ts` — `UploadStudentAvatarUseCase` | Student avatar; API | save; compensating delete | Yes: active student identity, school/org, enrollment, and self ownership | student-avatar unit spec; student-avatar tenancy test |
| 16 | `src/modules/reinforcement/reviews/application/reinforcement-proof-content-verifier.service.ts` — `ReinforcementProofContentVerifierService` | Reinforcement proof; API | stat; get/stream | Yes: submit use cases validate assignment/stage and private, same-school, student-owned File first | verifier unit/integration; proof persistence/file integrations; proof-MIME tenancy |
| 17 | `src/modules/parent-app/files/application/get-parent-child-file-download-url.use-case.ts` — `GetParentChildFileDownloadUrlUseCase` | Reinforcement proof download; API | signed GET | Yes: parent-child relationship and owned child submission/File query | parent-files adapter/use-case specs; parent-app tenancy |
| 18 | `src/modules/settings/branding/application/delete-branding-logo.use-case.ts` — `DeleteBrandingLogoUseCase` | Branding; API | resolve bucket | Yes: settings scope, school-management guard, permission, and managed logo transaction | branding lifecycle/cleanup specs; branding tenancy |
| 19 | `src/modules/settings/branding/application/branding-logo-cleanup-queue.service.ts` — `BrandingLogoCleanupQueueService` | Branding cleanup/compensation; API and Core Worker composition | resolve bucket; delete | Exact school/org/private bucket/object-prefix/File metadata eligibility before delete | branding cleanup/lifecycle/concurrency specs; runtime role contracts |
| 20 | `src/modules/settings/branding/application/get-public-school-branding-logo.use-case.ts` — `GetPublicSchoolBrandingLogoUseCase` | Public Branding; API direct server stream | stat; get/stream | Public route; eligible managed school/private File is resolved before storage | public branding unit and lifecycle integration; branding tenancy |
| 21 | `src/modules/settings/branding/application/process-branding-logo-cleanup.use-case.ts` — `ProcessBrandingLogoCleanupUseCase` | Branding reconciliation/cleanup; Core Worker | resolve bucket; stat; paginated list; delete | Persisted File state plus exact school/org/private bucket/prefix/metadata eligibility; no end-user guard | branding cleanup/lifecycle/concurrency specs; runtime role and critical-queue contracts |
| 22 | `src/modules/settings/branding/application/upload-branding-logo.use-case.ts` — `UploadBrandingLogoUseCase` | Branding; API | save; resolve bucket; compensating/old-object delete | Yes: settings scope, school-management guard, and permission before storage | branding lifecycle/signature/multipart specs; branding tenancy |

Runtime composition revalidation:

- API reaches all request-facing rows and can run immediate Branding
  compensation/cleanup enqueue logic.
- Core Worker reaches import validation and Branding cleanup/reconciliation.
- Media Worker reaches Learning Media cleanup only.
- Maintenance Scheduler owns discovery/scheduling but is storage-free.

## C. Upload and reference families

### Server multipart — 6 feature families, 7 endpoints

All current multipart handlers use in-memory `FileInterceptor`; Learning Media
does not.

| Family | Endpoint(s), all under `/api/v1` | Current behavior |
| --- | --- | --- |
| Generic Files | `POST /files` | server buffer -> private object -> managed `File` |
| Imports | `POST /files/imports` | server buffer -> private object -> `File`/ImportJob -> Core Worker validation |
| Student documents | `POST /students-guardians/students/:studentId/documents` | hybrid endpoint: multipart bytes or an existing `fileId`; application-document import endpoint is reference-only |
| Applicant Portal documents | `POST /applicant-portal/requests/:requestId/documents`; `POST /applicant-portal/requests/:requestId/documents/:documentId/replacements` | two applicant-owned multipart entrypoints in one family |
| Branding logo | `POST /settings/branding/logo` | deeply validated PNG/JPEG -> private managed `File` |
| Student avatar | `POST /student/profile/avatar` | student-owned private managed `File` |

### Direct signed PUT — 1 feature family

Learning Media starts with `POST /academics/learning-media/uploads`, returns a
signed PUT capability, receives bytes directly at the object provider, and is
completed synchronously with
`POST /academics/learning-media/uploads/:uploadId/complete`. The signed PUT TTL
is 3,600 seconds, equal to the approved one-hour absolute maximum. Expected byte
count and MIME are stored on the upload session and verified at completion, but
the current MinIO presign call does not bind `Content-Type` and the API response
does not return required upload headers.

### No upload / managed reference-only — 9 feature families, 18 `File.id` intake endpoints

These paths accept or associate existing managed `File.id` values and own no
binary upload client:

| Family | Reference entrypoint(s), all under `/api/v1` |
| --- | --- |
| Learning Content `FILE` items | `POST /academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content`; `PATCH /academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId` |
| Admissions application documents | `POST /admissions/applications/:applicationId/documents` |
| Attendance excuse attachments | `POST /attendance/excuse-requests/:id/attachments` |
| Generic resource `Attachment` links | `POST /files/attachments` |
| Communication message/announcement attachments and conversation avatar | embedded attachments on `POST /communication/conversations/:conversationId/messages`; `POST /communication/messages/:messageId/attachments`; `POST /communication/announcements/:announcementId/attachments`; `POST /communication/conversations` and `PATCH /communication/conversations/:conversationId` for `avatarFileId` |
| Homework assignment and submission attachments | `POST /homework/assignments/:homeworkId/attachments`; `POST /student/homeworks/:homeworkId/submission/attachments` |
| Reinforcement stage proof files | `POST /reinforcement/assignments/:assignmentId/stages/:stageId/submit`; `POST /student/tasks/:taskId/stages/:stageId/submit` |
| Reinforcement Hero badge files | `POST /reinforcement/hero/badges`; `PATCH /reinforcement/hero/badges/:badgeId` |
| Reinforcement reward-catalog image files | `POST /reinforcement/rewards/catalog`; `PATCH /reinforcement/rewards/catalog/:rewardId` |

Student documents are not double-counted here because their single create
entrypoint is a hybrid member of the multipart family. It can also reuse an
existing File or import an application-document File without uploading bytes.

## D. Signed URLs and streaming

### Signed GET inventory

| Path family | TTL | Content-Type | Content-Disposition |
| --- | ---: | --- | --- |
| `GET /api/v1/files/:id/download` | 300 s | not overridden | `attachment; filename=<originalName>` |
| Applicant document `/download` | 300 s | not overridden | attachment with original name |
| Teacher/Student/Parent message attachment `/download` and `/preview` | 300 s | not overridden | attachment with original name for both modes; `preview` currently does not switch to inline |
| Parent child proof `GET /parent/children/:studentId/files/:fileId/download` | 300 s | not overridden | attachment with original name |
| Teacher/Student/Parent lesson-content `/playback` | 300 s | stored verified MIME | inline |

Every signed GET is returned through an authenticated/authorized application
route as a temporary provider URL. No signed URL is persisted in the schema.

### Signed PUT inventory

Only Learning Media creates signed PUT capabilities. It signs the private
staging coordinate, uses TTL 3,600 seconds, and returns the URL and expiry. It
does not currently bind `Content-Type` in the MinIO signature or return method/
headers in `LearningMediaUploadIntentResponseDto`. `MinioAdapter` creates the
bucket on this request path before signing.

### Range/playback and direct streaming

- Learning Media/Lesson Content playback redirects to a provider signed GET;
  Range behavior is therefore a provider semantic. The existing
  `learning-media-playback-range.integration.spec.ts` proves MinIO byte Range
  behavior but is not GCS proof.
- Public Branding is the only direct application server stream:
  `GET /api/v1/public/schools/:schoolId/branding/logo`. It stats then streams
  the full object with `Content-Type`, `Content-Length`, cache control, and
  `nosniff`. It does not implement or advertise byte Range.
- Media verification and Reinforcement proof detection consume object streams
  internally rather than returning them directly to clients.

### Metadata assumptions

Public Branding requires `stat.size` to match `File.sizeBytes` and obtains the
stored MIME from MinIO `stat.metaData['content-type']` with case-insensitive key
matching. Learning Media uses size/ETag/stat data and object streams. These
must become provider-neutral metadata without losing content-type, size,
generation/version, ETag, or not-found semantics needed by callers.

## E. Object lifecycle consumers

Batch 0 records existing behavior and does not redesign it.

| Lifecycle behavior | Current consumers and assumption |
| --- | --- |
| Compensating delete after failed metadata/transaction work | generic upload, import creation, applicant upload/replacement, student avatar, Branding upload |
| Delete and confirm physical absence | Learning Media final-object rollback and Learning Media staging/final cleanup; pre/post existence is required |
| Specialized Branding deletion | upload replacement, explicit logo delete/queue, cleanup worker, and orphan reconciliation |
| Existence check | exposed as `objectExists`; outside `StorageService`, current callers use it only through `deleteObjectAndConfirmAbsent` |
| Paginated object list | only Branding reconciliation; lists the managed `schools/` prefix and can delete eligible orphan objects after grace checks |
| Stat-based reconciliation/verification | Learning Media staging/final verification, import validation, Reinforcement proof verification, public Branding integrity, Branding cleanup |
| Learning Media staging/final verification | stat staging, stream/hash/probe staging, save final, stat final, transactional File/session finalization |

Physical-deletion assumptions are strong in Learning Media cleanup/failure
recovery and Branding cleanup. Provider soft delete/versioning must not change
the application-visible requirement that the live object coordinate becomes
absent after delete. Generic File soft deletion, attachment unlinking,
Applicant document soft deletion/supersession, Student avatar replacement,
Homework unlinking, and Communication unlinking do not generally delete the
underlying object. No new generalized lifecycle is authorized.

## F. Provider-specific URL persistence and acceptance

### Managed references

The normalized managed object record is `File.id` plus `bucket` and
`objectKey`; bytes are external. `FileUploadSession` additionally stores
staging/final bucket/object coordinates and only the signed-upload expiry, not
the signed URL. Product relations point to `File.id`. The cutover compatibility
lock preserves those IDs and coordinates coherently.

### External URL fields intentionally supported

| Path/schema field | Current acceptance | Storage-debt result |
| --- | --- | --- |
| `LessonContentItem.url` for `VIDEO_LINK`/`EXTERNAL_LINK` | accepts any syntactically valid `http` or `https` URL; no provider-host/signed-query exclusion | can accept a raw MinIO/S3/GCS HTTPS object URL |
| Grade question `mediaUrl` in JSON metadata | create/update DTO accepts any string up to 2,000 characters; no URL or provider validation | can persist any provider URL, including signed/provider-specific forms |
| `HeroBadge.assetPath` | accepts any string up to 500 characters | can persist a provider URL even though the field is presented as an asset path |

Other untyped JSON metadata DTOs can store arbitrary strings, but current code
does not interpret them as managed object coordinates. They remain a broad
data-classification concern rather than a known storage retrieval contract.

### Legacy/dormant URL fields

- `SchoolProfile.logoUrl` persists legacy Branding URLs. The resolver
  classifies raw keys, protected File download routes, signed storage URLs,
  arbitrary HTTP(S), invalid URLs, and other values. Only safe public HTTPS
  values without credentials, internal/special hostnames, protected download
  paths, or recognized signed query parameters are returned as fallback.
  Current `UpdateBrandingDto` does not accept `logoUrl`, and managed logo upload
  writes `logoFileId`; the current API therefore does not create new legacy
  Branding URL values.
- `CommunicationAnnouncement.actionUrl` and `imageFileId` exist in Prisma but
  are not exposed by the current announcement create/update DTOs.
- No production source literal for a MinIO, S3, GCS, `s3://`, or `gs://` object
  URL was found outside tests/configuration/dependency material. This source
  result is not a database population claim.

```text
NEW_PROVIDER_SPECIFIC_URL_DEBT_CAN_CURRENTLY_BE_CREATED=YES
```

The decisive paths are Grade `mediaUrl` and Learning Content external/video
URLs; `HeroBadge.assetPath` is an additional ungoverned string path. Therefore
the narrow PRD0-Q041/Q042 no-new-provider-URL policy must be closed before real
production data is allowed. This Batch does not approve that policy, change
these contracts, start Phase 5B, or claim any existing row population.

## G. Learning Media compatibility lock

Current behavior was revalidated as follows:

- staging key: `learning-media/{schoolId}/staging/{uploadId}`;
- final key: `learning-media/{schoolId}/final/{uploadId}`;
- both coordinates use the configured private bucket;
- upload initiation stores expected MIME/size and returns a signed PUT URL with
  3,600-second expiry; the current MinIO capability does not bind or return a
  required `Content-Type` header;
- completion claims the actor-owned session synchronously, stats and streams
  staging into bounded verification, hashes/probes it, saves the verified final
  object, stats final size, and transactionally creates/preserves managed
  `File.id` plus final session coordinates;
- finalization failure deletes the final object and confirms absence;
- cleanup uses persisted claims and delete/exists confirmation for staging and
  final coordinates;
- playback requires a READY, private, same-school/same-organization File and a
  matching finalized upload session, then returns a 300-second inline signed
  GET after actor/lesson authorization and snapshot revalidation;
- the completion controller explicitly returns HTTP 200.

```text
LEARNING_MEDIA_HTTP_200_PRESERVED_REQUIRED=YES
NO_API_SCHEMA_MIGRATION_OR_LEARNING_MEDIA_CONTRACT_CHANGE=LOCKED
```

## H. Existing tests and later GCS parity gaps

No tests were run in Batch 0. This is a source inventory of existing coverage.

| Area | Existing focused coverage |
| --- | --- |
| Generic storage/MinIO/signing | `src/infrastructure/storage/tests/storage.service.spec.ts`, `minio.adapter.spec.ts`, `signed-url.service.spec.ts` |
| Generic Files | upload/controller/filter/download specs; `test/security/tenancy.files.spec.ts`; generic-download boundary test |
| Learning Media | upload/session unit specs; storage/upload/verification/cleanup/playback-Range integrations; learning-media and lesson-content tenancy tests; teacher/student/parent playback integrations |
| Branding | logo lifecycle, cleanup, signature, multipart, repository concurrency, legacy URL, public stream unit/integration; branding tenancy |
| Imports | create-import-job spec; admissions import tenancy; runtime critical-queue/recovery contracts |
| Applicant files | applicant document/requests unit specs; document upload/download/replace/delete/bridge/review tenancy suites |
| Student documents and avatar | student-document use-case spec; avatar unit spec; student-avatar tenancy |
| Reinforcement | proof verifier unit/integration; proof File/persistence integrations; review/task/reward/Hero specs; reinforcement and proof-MIME tenancy |
| Communication/chat attachments | message and attachment unit/domain/repository/presenter specs; teacher/student/parent app message specs; communication tenancy |
| Homework/reference attachments | assignment/submission attachment specs; Homework and attachment tenancy suites |
| Learning Content | content/file-reference/publication specs and integrations; playback coordinator/contract and app playback integrations |
| Parent proof downloads | parent-files adapter/use-case specs and Parent App tenancy |
| Readiness/runtime reachability | operational-probe service/manifests; management-probe integration/process; runtime-role module/context contracts |

Existing tenancy tests cover many wrong-school/wrong-owner/File visibility
paths, especially generic files, Applicant Portal, Learning Media/Learning
Content, Branding, Student avatar, Reinforcement proof, Homework, Communication,
and Parent App access. They do not constitute GCS provider evidence because
storage is mocked or MinIO-backed.

Exact later GCS parity gaps:

1. no `ObjectStoragePort`, `GcsAdapter`, direct GCS dependency/config option,
   provider factory, or shared adapter contract suite exists;
2. no GCS put/get/stream/stat/delete/exists/list-pagination/readiness tests;
3. no normalized GCS not-found, precondition/generation, retryable/permanent,
   quota, IAM, or provider-error classification tests;
4. no real GCS keyless signed PUT/GET proof, signer-impersonation denial,
   maximum-TTL/header binding, exact CORS preflight, Content-Type,
   Content-Disposition, or browser-negative proof;
5. no real GCS authorized Range/playback proof;
6. no GCS metadata parity proof for content type, size, ETag, and
   generation/version semantics, including the public Branding path;
7. no GCS delete/live-absence/versioning/Soft-Delete parity proof for Learning
   Media cleanup and Branding cleanup;
8. no GCS list ordering/pagination/start-after parity proof for Branding
   reconciliation;
9. no proof that production runtime paths cannot create buckets and runtime IAM
   lacks bucket-create/public/IAM mutation authority;
10. no all-22-consumer GCS cutover regression matrix, and no no-new-provider-URL
    policy test for Grade MEDIA/Learning Content/Hero asset paths.

## Owner-supplied cloud preflight context

This is operator-supplied context only. Codex did not call `gcloud`, access
GCP, or generate provider proof.

| Item | Owner-supplied observation |
| --- | --- |
| Production project | `moazez-production` |
| Project number | `91001421934` |
| Project state | observed `ACTIVE` |
| Billing | observed enabled |
| APIs | observed `storage.googleapis.com` and `iamcredentials.googleapis.com` enabled |
| Existing production GCS bucket count | observed zero |
| Approved non-production project | `moazez-nonprod-91001421934` |
| Non-production result | active account could not access it, or it may not exist; exact cause unresolved |

```text
NONPROD_PROJECT_ACCESS=UNRESOLVED
REAL_GCS_NONPROD_PROOF=BLOCKED_UNTIL_RESOLVED
```

This does not block Batch 0 or later local `ObjectStoragePort`/adapter
implementation. It does block real non-production GCS proof until resolved.

## Batch 0 conclusion

The accepted D010 boundary can be implemented locally from this inventory
without waiting for full Phase 4 closeout. Real GCS work remains gated by the
storage-critical identity/signer evidence and the unresolved non-production
project access. Phase 4 and Phase 5A are not complete. No runtime, storage,
test, schema, migration, dependency, workflow, secret, database, Redis, Docker,
or cloud resource changed in this Batch.
