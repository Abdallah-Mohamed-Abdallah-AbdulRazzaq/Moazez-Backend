# Assessment Media technical verification DevOps handoff

Source authority is `e65f4e8ee71c5bdea4ac9f1bc7e5d1fa21ef0e83` from
`origin/main`. This handoff includes the corrections to the implementation
reviewed at `e8e8cce6f6a25af83cc80e689f9fa34717c855fd`.
[Post-review source audit](assessment-media-post-review-source-audit.md)

## Source and route findings

Paths below start with `/api/v1`. The existing
[route register](st14-client-route-register.csv) owns the expanded legacy
consumer and reviewer paths, methods and permissions.

| Journey                                   | Baseline                                                                                                                                                  | Source and authorization                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Impact and verification                                                                                                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 general Homework attachments          | Independent of DR07                                                                                                                                       | `POST /files` or Teacher Homework multipart upload, then resource `homework/assignments/:homeworkId/attachments`. `UploadsController`, `HomeworkAttachmentsController`, `TeacherHomeworksController`, existing file and attachment use cases/repositories. Core writes require `homework.assignments.manage`. Teacher writes use the current attachments permissions and live allocation. Student reads require actual assigned visibility and the existing download permissions.                                      | Preserved the generic private File, update, reorder, removal and redirect/content contracts. Regression owners include Homework attachments, Files upload/download and tenancy suites.                  |
| F02 Homework question assets              | External references and binding/read routes present. Managed producer existed only as an internal method, and READY required DR07.                        | Core `/homework/assignments/:homeworkId/questions/:questionId/assets`, Teacher `/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/assets` and Student `/student/homeworks/:homeworkId/questions/:questionId/assets/:assetId/:mode`. `HomeworkQuestionAssetsService` and its repository prove parent, draft, live allocation and actor permissions.                                                                                                                                     | Add authoring upload routes on Core and Teacher Homework, then use the existing bind. HTTP tests follow real bytes into the exact question and read them as an assigned student.                        |
| F03 Grades/Exams assets and groups        | Managed READY blocked by DR07. Scoped Teacher Grades had a question-based upload route. Core Grades had a binding/read surface with an internal producer. | `/grades/assessments/:assessmentId/assets`, `/grades/assessments/:assessmentId/questions/:questionId/assets`, and each resource's `groups/:groupId/assets` surface. `GradeAssetsService`, `GradeAssetsRepository`, group domain repositories and `QuestionGroupMedia`. Teacher authoring uses `grades.teacher_authoring.manage`, exact creator/allocation and question-based assessment. Management uses existing Grades permissions. Student Exams and Grades have separate audience adapters.                        | Add Core Grades upload over the same parent producer. SCORE_ONLY keeps assessment-level assets. QUESTION_BASED preserves assessment, question and group bindings.                                       |
| F04 and F05 question-bound answers        | Existing create, status, complete, cancel, bind, list, replace and remove contracts. Both app and DB claims required DR07.                                | Student Homework `/student/homeworks/:homeworkId/questions/:questionId` and Student Exams `/student/exams/:assessmentId/submissions/:submissionId/questions/:questionId` with `/answer-uploads` and `/answer-assets`; existing eligible Core submissions surfaces. Homework requires `homework.submission_attachments.manage`; Grades requires `grades.submissions.submit`. The domain services and repositories combine live enrollment, mutable submission, question and response config with `AnswerMediaRegistry`. | READY and claims accept the new evidence. Student ownership, per-answer modality/count, final submission and manual review rules remain in their owning domains.                                        |
| F06 and F07 private reads                 | The existing resource surfaces could serve valid historical records. New managed files lacked eligible evidence.                                          | Resource-specific `GET` and `HEAD` `/preview` and `/download`. Teacher reviewer routes require live allocation and a submitted resource. Management/reviewer routes use the existing submission permissions and visibility. `PrivateMediaContentService` reauthorizes delivery.                                                                                                                                                                                                                                        | Technical evidence binds provider identity across reads. GET 200/206/416, HEAD 200, disposition and privacy headers are retained. Runtime flag gates writes. School controls gate preview and download. |
| F04 legacy general submission attachments | Independent of DR07                                                                                                                                       | `/student/homeworks/:homeworkId/submission/attachments` and Teacher submission attachment readers. `StudentHomeworksController` and Homework attachment use cases/repositories use the legacy private File and exact draft/submission relationship.                                                                                                                                                                                                                                                                    | Existing file-only general submission and reviewer contracts remain covered by the ST01 suites.                                                                                                         |
| F08 external HTTPS references             | Independent of DR07                                                                                                                                       | Existing question/assessment/group asset binders accept safe `EXTERNAL_HTTPS` references under the current resource permissions. Existing validation/presentation is shared across Homework and Grades.                                                                                                                                                                                                                                                                                                                | Preserved URL classification and external-reference representation.                                                                                                                                     |

The additive upload bases are below. All use the existing upload body and
status envelope, `POST` create, `GET /:uploadId`, `POST /:uploadId/complete` and
`POST /:uploadId/cancel`. Upload capabilities are returned only on the initial
create response. The route returns cache-control `private, no-store`.

| Base                                                                            | Permission                                                             |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `/homework/assignments/:homeworkId/authoring/uploads`                           | `homework.attachments.manage` for School/Organization management       |
| `/teacher/homeworks/classes/:classId/assignments/:homeworkId/authoring/uploads` | `homework.attachments.manage` with the exact active teacher allocation |
| `/grades/assessments/:assessmentId/authoring/uploads`                           | `grades.questions.manage` for School/Organization management           |

Grades answer progress and final-submission projections recognize both READY
versions. The final write still validates each file's full provenance under
the existing submission locks.

The existing Teacher Grades base is
`/teacher/classroom/:classId/grades/assessments/:assessmentId/authoring/uploads`.
Its independent authorization and compatible DTOs still apply. A destination
asset's bind permission is checked independently of upload permission.

## MIME and operating limits

| Format               | Technical verification                                                                                                                        | Delivery                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| TXT                  | Full UTF-8 validation and allowed text bytes                                                                                                  | School-controlled preview and download                        |
| JPEG                 | Common baseline, extended sequential and progressive Huffman frames, bounded dimensions, scan framing and terminal EOI                        | School-controlled preview and download                        |
| PNG                  | Bounded dimensions, chunk boundaries/CRC, zlib completion and expected filtered scanline length including Adam7                               | School-controlled preview and download                        |
| PDF                  | Supported header and EOF, bounded classic xref entries and trailers, or direct-length xref stream framing with bounded Flate integrity checks | School-controlled attachment download                         |
| MP3, M4A, WebM audio | Existing bounded FFprobe container, codec and duration checks                                                                                 | School-controlled preview and download                        |
| MP4 and WebM video   | Existing authoring allowlist and bounded FFprobe container, codec, dimensions and duration checks                                             | School-controlled; question-bound student modes exclude video |

Technical checks provide file conformance. They give no malware verdict or
content sanitization. A structurally valid PDF may contain active content or
embedded files. Browser previews and opening downloaded files still rely on
the client environment. Office, archives, executable types and expanded codecs
are outside the current allowlist.

The verifier retains the 10 MiB non-video and 200 MiB video ceilings, two
simultaneous verification flights per process and a 90-second caller deadline.
It uses bounded temporary disk and reads the final bytes back through storage.
The 120-second database claim lease allows a caller to settle abandoned
verification. An already-issued provider operation can finish late.
The database claim fence prevents a terminal attempt from becoming READY and
protects the identity of an already verified File.

## Reservation and client recovery

| Accounting                         | Scope and release                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active file upload or verification | Per actor and School. CREATED and UPLOADING occupy one slot until the upload intent deadline. VERIFYING occupies one until the earlier of the intent deadline and the claim lease deadline. READY, CANCELLED, FAILED and EXPIRED free the slot. Capacity is capped at two.                                                                                          |
| Provider capability                | Recorded separately for the staging key. GCS uses create-only resumable writes and a conservative seven-day deadline. MinIO POST can rewrite the same staging key while the bearer is valid. An unrecorded deadline leaves expiry unproven.                                                                                                                         |
| Storage reservation                | Per School, one declared size charge for each potentially retained staging and final object. Per purpose and parent, one charge per retained session. The accounting includes unbound READY and terminal attempts. Application status and bearer expiry do not prove deletion.                                                                                      |
| Active references                  | Count separately for each Homework question, Grade assessment root, Grade question, and Homework or Grade group. Student answers use the smaller of the School cap and the question's `responseConfig.maxFiles`. An active replacement consumes one reference. A removed reference releases its logical slot. Historical records retain provenance and reservation. |
| Request rate                       | Every admitted attempt counts against the rolling per-actor School limit, including replacement attempts and terminal sessions.                                                                                                                                                                                                                                     |

Persist `clientRequestId` and the original immutable create fields before sending
Create. If the response was lost, repeat the same authenticated request, with
the same School and original resource. The response identifies the original
`uploadId` and status. On READY the response identifies the same File. If bytes
already reached staging, continue with the existing Complete route. If the
client lost its bearer and still has bytes to send, cancel the old intent and
create another with a new `clientRequestId`. A terminal attempt can proceed
directly to a new request ID. A recovering device can use the same contract as
long as it has the original request details and session ownership. Create issues
the storage bearer once. Status, retries and recovery responses give no
storage bearer. A replacement is subject to ordinary rate and byte limits.

Each intent has a distinct staging and final key. A capability addresses only
the staging key. A late MinIO upload or GCS generation can leave retained bytes.
It cannot overwrite an approved final generation or publish another success
for the original intent.

## Database, runtime and rollback

Apply `20261119091622_assessment_media_technical_verification` through the governed Migration Job before
enabling technical writes. It replaces the session CHECK and updates the
READY and answer-claim trigger predicates. It adds an invoker-only File
identity guard, with no direct PUBLIC or runtime EXECUTE grant. It performs no
backfill and uses the existing column and Prisma schema. Schedule the DDL lock
and validation within the migration window for the target database.

Keep `ASSESSMENT_MEDIA_UPLOADS_ENABLED=false` during migration and mixed-version
rollout. Enable it only after all participating API instances can read and bind
both evidence versions, and only for explicit School policy settings. Existing
replicas that require the attested version cannot read technical rows. Once a
technical row exists, rollback means disabling further writes while keeping a
compatible reader available, then applying a compatible forward fix. An isolated
restore needs its own data-authority decision. A schema down migration would
invalidate technical sessions and their claims. Generic Files, Academic Content,
Learning Media and existing grading and reviewer processes retain their
contracts.

## Production enablement

GCS, IAM, Cloud Run and edge configuration stay on their existing interfaces.
Before enabling, DevOps needs an approved isolated provider rehearsal covering
private staging and final objects, size/MIME and Origin/CORS, keyless IAM
restrictions, create-only staging and resumable lifetime, object generation
pinning, Range/HEAD, storage failures and abort, resource and deadline budgets,
and the retained byte/capability limits with realistic student workloads.
Validate the pinned Linux FFprobe executable for schools allowing audio/video.
Local MinIO and adapter doubles give local and contract evidence. A real GCS
rehearsal remains an operational gate. Production enablement also requires
separate Owner/DevOps approval and explicit acceptance of the residual malware
risk. This source handoff is for operational review.

### Proposed School policy procedure

The runtime evaluates `SchoolAssessmentMediaPolicy` by exact School. Source
and seed entry points currently have no approved writer. Keep the runtime
flag and School upload controls disabled until the Owner approves the
configuration and DevOps approves an audited provisioning path.

1. The Owner signs off on the exact Organization ID and School ID, the enabled
   author and student audiences, the MIME subset, numeric caps and separate
   preview, download and guardian controls. Proposed initial settings keep
   upload and read booleans false and the MIME list empty pending that decision.
   Use a conservative subset of the existing purpose allowlists and explicit
   positive limits at or below the effective application caps. Current defaults
   include 10 MiB per file, 80 MiB per parent, 1 GiB per School, eight files per
   resource, two active uploads per actor and 30 admitted attempts per actor per
   hour. Video, higher dimensions and broader audiences require explicit review.
2. The separately approved provisioning workflow should resolve exactly one
   active School under its expected Organization, reject any mismatch and
   compare the current policy revision before a scoped transactional write.
   Require independent approval of the target and proposed values. Record the
   approval, operator, timestamp, exact IDs and before/after values in an audit
   trail. Read the committed policy back by both IDs and verify denial for a
   second, unconfigured School. The controlled write path and its authority are
   prerequisites to enabling the pilot.
3. DevOps rehearses migration compatibility, validates workload IAM and
   Origin/CORS, and checks the pinned runtime and private delivery in the
   approved isolated environment. With the runtime flag on, verify that a
   missing row, disabled row and mismatched School still deny uploads. Review
   prior READY files and their MIME, size, duration, dimensions and delivery
   modes against the proposed policy before changing the active values.
4. To revoke writes, set `uploadsEnabled=false` for the approved School or turn
   off the runtime flag for a service-wide stop. To withdraw existing delivery
   as well, disable both `allowInlinePreview` and `allowDownload`. MIME and
   numeric limits also affect existing access, so validate the same historical
   sample after a policy change. Audit the rollback and verify its effects
   while retaining Files and claims.

### Retention decision

The current contract reserves potential physical bytes for the lifetime of the
retained record. Measure that usage with representative concurrency and retry
rates. Owner approval is required for retention windows, records under hold and
the point at which cleanup can return capacity. A separate cleanup design
should start with an isolated dry run that reports candidates, current
references, known expiry and exact storage coordinates and generation. A
staging object becomes a candidate only once the capability can no longer
write; unknown expiry requires decision or proof. A final object is eligible
only after accounting for active and historical references, claims, holds and
the approved retention period. Fence the check against new references, use
provider-supported generation-matched deletion, then confirm deletion for that
generation before changing accounting. Record the candidate and operation
outcome. Uncertain results retain capacity until reconciled.

## Verification evidence

- PostgreSQL and MinIO acceptance covers provenance, private bytes, recovery,
  parallel reservation and active reference limits.
- The pinned Linux media suite exercises actual MP3, M4A, audio WebM,
  H.264 MP4 and VP8 WebM, and checks duration, dimensions, timeout and codec
  rejection. The Assessment lifecycle suite exercises image and PDF fixtures,
  including historical attested reads.
- This correction uses the existing schema and preserves all 40 migrations.
  The migration and runtime gates exercise fresh and repeat deploy,
  historical checksums and scoped privileges.

The canonical CI run and verification counts for the corrected commit are
recorded on the same draft. [Draft PR #237](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/237)
