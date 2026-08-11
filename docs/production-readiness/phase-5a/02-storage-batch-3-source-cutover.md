# Storage Batch 3 source cutover inventory

## Boundary and non-authorization

This inventory was rebuilt from `feat/storage-gcs-cutover` at starting HEAD
`8e497dc51b592b3d417621b0232853a5c2a31d26` on 2026-08-11
(Africa/Cairo). It is source evidence only. No cloud command, production
database connection, production bucket access, object write, Prisma schema
change, or migration is part of Batch 3.

```text
PHASE_5A=NOT_COMPLETE
PRODUCTION_LAUNCH_AUTHORIZED=NO
STORAGE_CUTOVER_READY_FOR_REAL_DATA=NO
UNRESOLVED_PROVIDER_URL_SURFACE=NONE
```

The staging/production application boundary is:

```text
feature/application -> StorageService -> ObjectStoragePort -> GcsAdapter
```

MinIO remains available only for development/test. Production feature code has
zero direct `MinioAdapter`, `GcsAdapter`, MinIO SDK, or Google Storage SDK
consumers.

## Provider URL persistence inventory

One pure policy at
`src/infrastructure/storage/provider-url.policy.ts` classifies absent values,
managed/internal references, ordinary external HTTPS, direct GCS, direct
S3-compatible/MinIO, and unsafe/malformed values. It parses structurally and
never returns provider input, query signatures, credentials, or tokens in a
provider/unsafe result.

Recognized provider forms are `gs://`, `storage.googleapis.com` path style,
`*.storage.googleapis.com` virtual-host style, `storage.cloud.google.com`, the
Google Storage JSON/download API path on `www.googleapis.com`, `s3://`, AWS S3
path/region/virtual-host forms, this repository's local MinIO endpoints
(`localhost`, loopback, or `host.docker.internal` on 9000/9001), repository
fixture/container host labels containing a structural `minio` label, and an
explicit actual S3-compatible endpoint passed to the policy. Query parameters
do not affect provider classification.

An arbitrary third-party S3-compatible public hostname cannot be distinguished
deterministically from an ordinary external HTTPS site without its actual
configured endpoint. The policy therefore does not invent an internet-wide
hostname blacklist; callers with such configuration must pass that endpoint.
The active repository adapters/configuration generate the recognized forms.

| Persisted surface | Current writer/read behavior | Batch 3 classification |
| --- | --- | --- |
| `GradeAssessmentQuestion.metadata.mediaUrl` | create/update normalize through one domain command path; reads unchanged | Q041 ordinary external HTTPS or absent/null on new writes; provider/HTTP/malformed blocked |
| `LessonContentItem.url` | VIDEO_LINK/EXTERNAL_LINK create/update share normalization | ordinary external link semantics retained; direct recognized provider URLs blocked |
| `HeroBadge.assetPath` | badge create/update share command helpers | relative/internal and ordinary external assets retained; direct recognized provider URLs blocked |
| `SchoolProfile.logoUrl` | current writes cannot set it; managed File has read precedence | Q042 safe external HTTPS read-only compatibility/null; provider and unsafe/malformed values fail closed |
| `CommunicationAnnouncement.actionUrl` | Prisma column is dormant: no production source writer or reader | included in the read-only pre-real-data audit; no write guard is reachable |

`File.bucket`/`File.objectKey` and `FileUploadSession` staging/final coordinates
are normalized internal managed-object coordinates, not public provider URLs.
Generated signed PUT/GET URLs are transient response values. The source gate
finds no persistence of `createSignedPutUrl`, `createSignedGetUrl`,
`getSignedUrl`, `createUploadUrl`, or `createDownloadUrl` capability URLs.

The read-only Owner audit is
`scripts/audits/pre-real-data-provider-url-audit.ts`. It pages bounded queries
over all five surfaces above, emits counts/classifications only, prints no raw
row value/database URL/secret, performs no mutation, and exits non-zero unless
`PROVIDER_URL_COUNT`, `LEGACY_PROVIDER_URL_COUNT`, and
`UNSAFE_LEGACY_URL_COUNT` are all zero. Batch 3 does not execute it against
production.

## Exact production storage consumers

Current count: **22 consumer classes across 21 files**.

| # | File | Consumer class(es) |
| ---: | --- | --- |
| 1 | `src/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.coordinator.ts` | `LessonContentPlaybackCoordinator` |
| 2 | `src/modules/applicant-portal/application/get-applicant-document-download-url.use-case.ts` | `GetApplicantDocumentDownloadUrlUseCase` |
| 3 | `src/modules/applicant-portal/application/replace-applicant-document.use-case.ts` | `ReplaceApplicantDocumentUseCase` |
| 4 | `src/modules/applicant-portal/application/upload-applicant-document.use-case.ts` | `UploadApplicantDocumentUseCase` |
| 5 | `src/modules/communication/application/communication-message-attachment-download.use-case.ts` | `GetCommunicationMessageAttachmentDownloadUrlUseCase` |
| 6 | `src/modules/files/imports/application/create-import-job.use-case.ts` | `CreateImportJobUseCase` |
| 7 | `src/modules/files/imports/application/process-import-validation.use-case.ts` | `ProcessImportValidationUseCase` |
| 8 | `src/modules/files/uploads/application/get-file-download-url.use-case.ts` | `GetFileDownloadUrlUseCase` |
| 9 | `src/modules/files/uploads/application/learning-media-cleanup.service.ts` | `LearningMediaCleanupService` |
| 10 | `src/modules/files/uploads/application/learning-media-upload.use-cases.ts` | `CreateLearningMediaUploadUseCase`; `CompleteLearningMediaUploadUseCase` |
| 11 | `src/modules/files/uploads/application/media-verifier.service.ts` | `MediaVerifierService` |
| 12 | `src/modules/files/uploads/application/upload-file.use-case.ts` | `UploadFileUseCase` |
| 13 | `src/modules/health/operational-probe.service.ts` | `OperationalProbeService` |
| 14 | `src/modules/parent-app/files/application/get-parent-child-file-download-url.use-case.ts` | `GetParentChildFileDownloadUrlUseCase` |
| 15 | `src/modules/reinforcement/reviews/application/reinforcement-proof-content-verifier.service.ts` | `ReinforcementProofContentVerifierService` |
| 16 | `src/modules/settings/branding/application/branding-logo-cleanup-queue.service.ts` | `BrandingLogoCleanupQueueService` |
| 17 | `src/modules/settings/branding/application/delete-branding-logo.use-case.ts` | `DeleteBrandingLogoUseCase` |
| 18 | `src/modules/settings/branding/application/get-public-school-branding-logo.use-case.ts` | `GetPublicSchoolBrandingLogoUseCase` |
| 19 | `src/modules/settings/branding/application/process-branding-logo-cleanup.use-case.ts` | `ProcessBrandingLogoCleanupUseCase` |
| 20 | `src/modules/settings/branding/application/upload-branding-logo.use-case.ts` | `UploadBrandingLogoUseCase` |
| 21 | `src/modules/student-app/profile/application/upload-student-avatar.use-case.ts` | `UploadStudentAvatarUseCase` |

Every class above imports/injects `StorageService`; none injects
`ObjectStoragePort` or a concrete provider. API has zero BullMQ consumers. Core
Worker, Media Worker, and Maintenance Scheduler ownership is unchanged.

## Upload/reference family inventory

Current count: **16 functional families**: six server-multipart families
(seven endpoints), one direct signed-PUT family, and nine managed-reference
families. No count drift exists from Batch 0, but every row was revalidated.

| # | Feature and entry route/use case | Mechanism and managed identity | Common boundary / signed URL / runtime | Provider URL persisted / GCS-specific feature path |
| ---: | --- | --- | --- | --- |
| 1 | Generic Files — `POST /api/v1/files` | server multipart; private object plus `File` | `UploadFileUseCase` → `StorageService`; signed GET on download; API | NO / NO |
| 2 | Imports — `POST /api/v1/files/imports` | server multipart; `File` plus ImportJob | API upload, Core validation through `StorageService`; no signed write | NO / NO |
| 3 | Student documents — `POST /api/v1/students-guardians/students/:studentId/documents` | hybrid multipart or existing `File.id`; managed relation | upload uses common service; API; protected download path | NO / NO |
| 4 | Applicant documents — request document and replacement POST routes | server multipart; applicant-owned `File` relation/object key | upload/replace and signed GET through `StorageService`; API | NO / NO |
| 5 | Branding logo — `POST /api/v1/settings/branding/logo` | validated multipart; private `File.logoFileId` | common service; public server stream; API/Core/Scheduler lifecycle ownership unchanged | NO / NO |
| 6 | Student avatar — `POST /api/v1/student/profile/avatar` | server multipart; private managed avatar `File` | common service; API; no provider signed write | NO / NO |
| 7 | Learning Media — create upload and synchronous complete POST routes | direct signed PUT to session staging coordinate; final `File` and session coordinates | common service/port; signed PUT and signed GET playback; API + Media cleanup + Scheduler discovery | NO / NO |
| 8 | Learning Content FILE create/update routes | managed `File.id` intake on LessonContentItem | reference validation; later playback signed GET via common service; API | NO / NO |
| 9 | Admissions application documents — POST association | managed `File.id` relation | reference-only application path; managed download boundary; API | NO / NO |
| 10 | Attendance excuse attachments — POST association | managed `File.id` relation | reference-only; generic managed download path; API | NO / NO |
| 11 | Generic resource Attachments — `POST /api/v1/files/attachments` | managed `File.id` relation | reference-only; generic signed download through common service; API | NO / NO |
| 12 | Communication message/announcement attachments and conversation avatar routes | managed attachment/File IDs | reference-only writes; message signed GET through common service; API | NO / NO |
| 13 | Homework assignment/submission attachment routes | managed `File.id` relations | reference-only; managed File download behavior; API | NO / NO |
| 14 | Reinforcement proof submit routes | managed proof `File.id` | reference-only; content stat/stream and parent signed GET through common service; API | NO / NO |
| 15 | Hero badge create/update routes | `fileId` relation; `assetPath` separately guarded | reference-only for managed media; no signed URL at write; API | NO / NO |
| 16 | Reward catalog create/update routes | managed image `File.id` | reference-only; no signed URL at write; API | NO / NO |

Learning Media completion remains
`POST /api/v1/academics/learning-media/uploads/:uploadId/complete`, synchronous
HTTP 200, with no queue substitution, polling contract, or HTTP 202 response.
