# Assessment Media technical verification DevOps handoff

Source authority is `e65f4e8ee71c5bdea4ac9f1bc7e5d1fa21ef0e83` from
`origin/main`. The repository task is MOAZEZ-BE-ASSESSMENT-MEDIA-SIMPLIFICATION-01.

## Source and route findings

Paths below start with `/api/v1`. The existing
[route register](st14-client-route-register.csv) owns the expanded legacy
consumer and reviewer paths, methods and permissions.

| Journey | Baseline | Source and authorization | Impact and verification |
| --- | --- | --- | --- |
| F01 general Homework attachments | Independent of DR07 | `POST /files` or Teacher Homework multipart upload, then resource `homework/assignments/:homeworkId/attachments`. `UploadsController`, `HomeworkAttachmentsController`, `TeacherHomeworksController`, existing file and attachment use cases/repositories. Core writes require `homework.assignments.manage`. Teacher writes use the current attachments permissions and live allocation. Student reads require actual assigned visibility and the existing download permissions. | Preserved the generic private File, update, reorder, removal and redirect/content contracts. Regression owners include Homework attachments, Files upload/download and tenancy suites. |
| F02 Homework question assets | External references and binding/read routes present. Managed producer existed only as an internal method, and READY required DR07. | Core `/homework/assignments/:homeworkId/questions/:questionId/assets`, Teacher `/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/assets` and Student `/student/homeworks/:homeworkId/questions/:questionId/assets/:assetId/:mode`. `HomeworkQuestionAssetsService` and its repository prove parent, draft, live allocation and actor permissions. | Add authoring upload routes on Core and Teacher Homework, then use the existing bind. HTTP tests follow real bytes into the exact question and read them as an assigned student. |
| F03 Grades/Exams assets and groups | Managed READY blocked by DR07. Scoped Teacher Grades had a question-based upload route. Core Grades had a binding/read surface with an internal producer. | `/grades/assessments/:assessmentId/assets`, `/grades/assessments/:assessmentId/questions/:questionId/assets`, and each resource's `groups/:groupId/assets` surface. `GradeAssetsService`, `GradeAssetsRepository`, group domain repositories and `QuestionGroupMedia`. Teacher authoring uses `grades.teacher_authoring.manage`, exact creator/allocation and question-based assessment. Management uses existing Grades permissions. Student Exams and Grades have separate audience adapters. | Add Core Grades upload over the same parent producer. SCORE_ONLY keeps assessment-level assets. QUESTION_BASED preserves assessment, question and group bindings. |
| F04 and F05 question-bound answers | Existing create, status, complete, cancel, bind, list, replace and remove contracts. Both app and DB claims required DR07. | Student Homework `/student/homeworks/:homeworkId/questions/:questionId` and Student Exams `/student/exams/:assessmentId/submissions/:submissionId/questions/:questionId` with `/answer-uploads` and `/answer-assets`; existing eligible Core submissions surfaces. Homework requires `homework.submission_attachments.manage`; Grades requires `grades.submissions.submit`. The domain services and repositories combine live enrollment, mutable submission, question and response config with `AnswerMediaRegistry`. | READY and claims accept the new evidence. Student ownership, per-answer modality/count, final submission and manual review rules remain in their owning domains. |
| F06 and F07 private reads | The existing resource surfaces could serve valid historical records. New managed files lacked eligible evidence. | Resource-specific `GET` and `HEAD` `/preview` and `/download`. Teacher reviewer routes require live allocation and a submitted resource. Management/reviewer routes use the existing submission permissions and visibility. `PrivateMediaContentService` reauthorizes delivery. | Technical evidence binds provider identity across reads. GET 200/206/416, HEAD 200, disposition and privacy headers are retained. Runtime flag gates writes. School controls gate preview and download. |
| F04 legacy general submission attachments | Independent of DR07 | `/student/homeworks/:homeworkId/submission/attachments` and Teacher submission attachment readers. `StudentHomeworksController` and Homework attachment use cases/repositories use the legacy private File and exact draft/submission relationship. | Existing file-only general submission and reviewer contracts remain covered by the ST01 suites. |
| F08 external HTTPS references | Independent of DR07 | Existing question/assessment/group asset binders accept safe `EXTERNAL_HTTPS` references under the current resource permissions. Existing validation/presentation is shared across Homework and Grades. | Preserved URL classification and external-reference representation. |

The additive upload bases are below. All use the existing upload body and
status envelope, `POST` create, `GET /:uploadId`, `POST /:uploadId/complete` and
`POST /:uploadId/cancel`. Upload capabilities are returned only on the initial
create response. The route returns cache-control `private, no-store`.

| Base | Permission |
| --- | --- |
| `/homework/assignments/:homeworkId/authoring/uploads` | `homework.attachments.manage` for School/Organization management |
| `/teacher/homeworks/classes/:classId/assignments/:homeworkId/authoring/uploads` | `homework.attachments.manage` with the exact active teacher allocation |
| `/grades/assessments/:assessmentId/authoring/uploads` | `grades.questions.manage` for School/Organization management |

Grades answer progress and final-submission projections recognize both READY
versions. The final write still validates each file's full provenance under
the existing submission locks.

The existing Teacher Grades base is
`/teacher/classroom/:classId/grades/assessments/:assessmentId/authoring/uploads`.
Its independent authorization and compatible DTOs still apply. A destination
asset's bind permission is checked independently of upload permission.

## MIME and operating limits

| Format | Technical verification | Delivery |
| --- | --- | --- |
| TXT | Full UTF-8 validation and allowed text bytes | School-controlled preview and download |
| JPEG | Common baseline, extended sequential and progressive Huffman frames, bounded dimensions, scan framing and terminal EOI | School-controlled preview and download |
| PNG | Bounded dimensions, chunk boundaries/CRC, zlib completion and expected filtered scanline length including Adam7 | School-controlled preview and download |
| PDF | Supported PDF header, trailing EOF and bounded cross-reference/trailer framing | School-controlled attachment download. Inline route unavailable for managed PDF |
| MP3, M4A, WebM audio | Existing bounded FFprobe container, codec and duration checks | School-controlled preview and download |
| MP4 and WebM video | Existing authoring allowlist and bounded FFprobe container, codec, dimensions and duration checks | School-controlled; question-bound student modes exclude video |

Technical checks provide file conformance. They give no malware verdict or
content sanitization. A structurally valid PDF may contain active content or
embedded files. Browser previews and opening downloaded files still rely on
the client environment. Office, archives, executable types and expanded codecs
are outside the current allowlist.

The verifier retains the 10 MiB non-video and 200 MiB video ceilings, two
simultaneous verification flights per process and a 90-second caller deadline.
It uses bounded temporary disk and reads the final bytes back through storage.
The 120-second database claim lease allows a caller to settle abandoned
verification. An already-issued opaque provider operation can finish late.
The original claim fence prevents READY in that case. A failed attempt is
terminal and a retry uses a new request ID. The caller may query status after
an uncertain response. A successful complete retry returns the same File.

Abandoned and failed staging/final bytes remain charged until deletion can be
proven under separate retention authority. Provider capabilities count until
their recorded expiry. MinIO POST capabilities can rewrite their staging key
within their lifetime. The GCS adapter conservatively records the provider's
seven-day resumable lifetime, which can exhaust the two-capability quota even
after completed operations. Measure this behavior and resolve the sustained
upload capacity decision before a production rollout.

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

CI and local coverage should include assessment lifecycle and claims,
Homework and Grades asset binding, multipart, Student answers, rubric/review
and GradeItem sync, focused tenancy, generic storage reads, Learning Media
and Academic Content. Read exact candidate results on the Draft PR. The base's
historical coverage records are references for regression ownership.
