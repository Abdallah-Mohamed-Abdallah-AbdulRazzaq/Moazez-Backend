# Assessment Media foundation — ST-03

ST-03 adds **no public REST route**, no generic assessment download, no policy
mutation API and no question/answer Asset link. Existing `/api/v1/files`,
Homework, Grades, Academic Content and Learning Media contracts stay in place.
The existing Generic Files 10 MiB upload contract remains independent.

## Internal application contract

`AssessmentMediaModule` exports `AssessmentMediaService`. A future authorized
domain consumer must select a fixed purpose-specific creation method; the
request body cannot supply actor/school/owner/storage coordinates or escalate
purpose. Every operation resolves request context, live membership/permission,
and actual resource ownership inside the mutation transaction.

| Creation method | Actual owner context | Eligible actor and existing permission |
| --- | --- | --- |
| `createHomeworkAssignmentUpload(homeworkId, input)` | Existing HomeworkAssignment and live allocation | Owned teacher or school/organization manager; `homework.attachments.manage` |
| `createGradeAssessmentUpload(assessmentId, input)` | Existing mutable GradeAssessment and allocated academic scope | Allocated teacher or school/organization manager; `grades.questions.manage` |
| `createHomeworkSubmissionUpload(targetId, input)` | Existing own HomeworkTarget, published homework, matching live enrollment | Student; `homework.submission_attachments.manage` |
| `createGradeSubmissionUpload(submissionId, input)` | Existing own in-progress GradeSubmission, matching live enrollment and assessment scope | Student; `grades.submissions.submit` |

Teachers receive no new default permissions and no generic File download grant.
The grade authoring permission is checked, not implicitly granted by this API.

Creation input example (internal DTO, not an HTTP endpoint):

```json
{
  "clientRequestId": "<uuid>",
  "originalName": "response.txt",
  "expectedMimeType": "text/plain",
  "expectedSizeBytes": "128"
}
```

Optional `trustedOrigin` is a server-resolved browser origin; both current
application CORS and storage origin allowlists must approve it. No arbitrary
origin URL is fetched. GCS uses `resumable` with expected-length initiation;
MinIO uses `signed-post` with exact length/MIME policy conditions. Unsupported
providers fail closed. MinIO is not described as resumable.

Successful newly issued intent shape:

```json
{
  "uploadId": "<uuid>",
  "status": "UPLOADING",
  "fileId": null,
  "expiresAt": "<ISO timestamp>",
  "uploadCapability": {
    "mode": "signed-post",
    "formFields": { "<provider field>": "<sensitive signed POST value>" },
    "url": "<sensitive short-lived uploader capability>",
    "expiresAt": "<ISO timestamp>"
  }
}
```

The capability belongs only to the authenticated intended uploader. Its URL and
POST fields include the restricted staging destination; treat the entire nested
capability as secret material. Status/retry responses expose no coordinates or
provider evidence. Never log,
cache in unrelated DTOs, or persist its URL. An identical create retry returns
the same session/current status **without reissuing a capability**. Different
immutable metadata with the same school/actor/purpose/request identity conflicts.
If the first response is lost, inspect/cancel that intent; do not reissue its
secret capability. For `signed-post`, submit every returned form field unchanged
and the file last in a multipart POST; do not set the multipart HTTP Content-Type
manually. `resumable` has no formFields and follows the existing provider session
protocol. Both bind the expected byte length and MIME. No pending or failed state has a File ID.

`complete(purpose, contextId, uploadId)` uses the exact persisted owner tuple,
claims verification atomically, verifies outside transactions, then rechecks
authorization/policy and commits one File, READY facts and audit together.
Concurrent verification returns `assessment_media.verification_in_progress`;
a successful retry returns the same File. `status`, `cancel` and
`cleanupEligibility` use the same exact owner tuple. Cancellation is idempotent;
terminal READY cannot be cancelled or replayed into another context.

## Verification and availability

Expected extension/MIME pairs are restricted to the current bounded verifier's
text/PDF/JPEG/PNG/MP3/M4A/WebM/MP4 registry. Archives, Office, HTML, scripts,
executables and ambiguous types are denied. Full bounded streaming/hash and
FFprobe container/codec/duration/dimension checks are reused where applicable.
Text UTF-8/signature inspection is prefix-bounded, not full-file classification.
Image/PDF signatures are not deep integrity or malware evidence: those formats
remain blocked pending an approved stronger capability.

All formats require a separate security release attestation. **No malware or
quarantine provider is approved or implemented.** The default gate fails closed;
there are currently **no releasable categories**. Test-only attestations verify
transaction/persistence contracts and must never be called production scanning.
Missing dependencies, timeout, object identity changes, malformed/zero/incorrect
size or MIME content never create READY or a File.

Upload capabilities are bearer secrets, not actor-authenticated storage requests.
Provider-side early revocation is not assumed: an issued capability may still
write its exact staging object until expiry after cancellation/completion. It
cannot authorize another actor to finalize an intent or overwrite its final File.
The uploader can write only staging. The server writes a distinct final object;
staging and final object identity are checked around verification. No storage
call runs inside the authorization/claim/File transaction. There are at most two
local verification flights. A deadline does not falsely claim SDK cancellation:
its slot remains occupied until the actual operation settles, and late work
cannot release a File.

## Policy and accounting

`SchoolAssessmentMediaPolicy` is independent of Academic Content. A missing row
disables uploads, teacher/student eligibility, every MIME category and all
preview/download/guardian hooks. Positive school settings remain bounded by
platform caps: non-video 10 MiB, video 200 MiB, eight files per actual resource,
two concurrent capabilities, 30 new requests/hour/actor, 3600 seconds and bounded
dimensions. The default per-file setting is 10 MiB; no category is enabled.
The proposed 25 MiB documents and 50 MiB audio remain unaccepted future resource
settings. Per-question binding remains a later-stage concern.

School-row locking serializes reservations. Capability lifetimes count even
after cancellation/completion until actual provider expiry. Resource bytes
count retained logical uploads; school storage reserves **both staging and
final bytes** until their deletion is proven. Expiry/cancellation cannot create
unbounded free object storage: byte reservations remain charged. Failed and
cancelled attempts still count toward the hourly rate. Conservative capacity
can therefore fill until a separately authorized retention decision exists.

`ASSESSMENT_MEDIA_UPLOADS_ENABLED` defaults to false. Production rejects true
at configuration validation, and the service independently rejects Production
execution. A school policy cannot enable runtime capabilities. No new worker,
queue, schedule, dependency, provider or deployment is introduced.

## Retention and compatibility

Lifecycle bookkeeping preserves session/File history and the existing retained
reference graph. Cleanup eligibility always reports `deletionPermitted: false`.
There is no physical deletion, File retirement, backfill or generalized retention
change. Active, historical, cross-purpose and uncertain references remain safe.
LEGACY/PURGED semantics for existing purposes remain unchanged; assessment
intents cannot enter those states.

Existing client REST usage remains documented in
[Homework submission files](homework-submission-files.md). Future public upload,
asset binding and read endpoints need their own authorized stage and must use
the resource-bound private-media boundary. A generic file-ID route is not an
Assessment Media authorization substitute.
