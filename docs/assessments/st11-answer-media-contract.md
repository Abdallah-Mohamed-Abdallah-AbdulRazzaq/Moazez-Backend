# ST11-A question-level File/Audio answer contract

Authority: full ST11 Owner mandate, 2026-10-30; initial main `5f42c4937a4c5bb50680cf78a7b23d2783cf32b2`. Architecture: [ADR-0023](../../adr/ADR-0023-question-bound-answer-media.md). Actual routes: [client API handoff](st11-client-api-handoff.md).

## Responsibility map

| Boundary | Implementation / authority |
| --- | --- |
| Configuration | Shared `common/assessment-answer/response-config`; domain adapters and closed DB CHECKs; authoring/publication and recipient/reviewer projections |
| Upload reservation/retry | Existing AssessmentMedia service/repository, purpose-specific domain authorization and exact Question binding; immutable intent before capability |
| Homework binding/final/review | HomeworkAnswerMediaRepository; existing Target/Submission mutation locks and atomic answer/final path |
| Grades binding/final/review | GradeAnswerMediaRepository; existing IN_PROGRESS Submission, unique Answer identity and GradesSubmissionsRepository |
| Provenance and File checks | Composite physical FKs; global immutable claim; shared AnswerMediaRegistry; existing READY evidence/content policy |
| Private bytes | Existing private media content service and response transport with resource-specific authorization |
| Retention | Existing global File lifetime repository plus immutable claim; claimed asset history retained |
| Groups | Separate ST11-B source work; no Answer/group points or question enum expansion |

## Response modes

| V1 mode | Required final answer | Forbidden |
| --- | --- | --- |
| TEXT_ONLY | Bounded nonempty text | Any asset; maxFiles config key |
| FILE_ONLY | Eligible document/image/text asset | Text, audio, video |
| AUDIO_ONLY | Eligible audio asset | Text, non-audio, video |
| TEXT_OR_FILE | Bounded text or eligible File | Audio/video |
| TEXT_AND_FILE | Bounded text and eligible File | Partial supplied final response; audio/video |
| FILE_OR_AUDIO | Eligible File or Audio | Text/video |

V1 is closed: unknown versions, modes, keys, invalid caps, incompatible question types and JSON null persistence are rejected. The canonical non-TEXT_ONLY config includes maxFiles (default 1, maximum 3). A missing/SQL-NULL config retains the exact historical behavior and DTO omission. Optional absence is valid; nonempty supplied optional final answers must satisfy the same mode. Draft partial text/asset responses are allowed only within their permitted modalities. New structured JSON/options do not substitute for text or File.

Files and audio remain an intersection with current media policy. Reservation and binding share School/resource caps, including outstanding upload capability reservations. Deleting a reference does not free physical reservations. Existing metadata/duration caps apply to audio. Missing verification capability fails closed; PDF/images have no new deep inspection implementation or release approval.

## Security and lifecycle

Every prepare/status/complete/cancel/retry verifies the exact intent question, actor, Student, School, purpose and parent context. Reusing a request ID for another question returns 409 without returning the original capability. Status and successful retries return identity/state only. Invalid ownership returns a non-disclosing denial.

Binding accepts only an upload ID and optional replacement asset ID. The server resolves File and immutable ancestry. READY/CLEAN/version/checksum/MIME/size/private storage identity, current question mode, active asset count and current policy are revalidated in the mutation transaction. First-Answer creation rolls back with a failed bind. A duplicate live Homework Answer identity fails closed. Binding retries return the existing live asset; deleted bindings never revive.

Replacement soft-deletes the exact old asset and creates a new claim/asset atomically. Neither File identity nor uploader changes in place. Claimed asset hard deletion and soft-delete revival are rejected in SQL. Existing unclaimed legacy asset rows and their nullable claim IDs remain unchanged; their Files are already consumed for future claims.

Homework permits draft media writes only on the live owned Target while its assignment accepts student work. Grades requires an existing own IN_PROGRESS Submission, current enrollment/term and published writable assessment. Terminal answer media writes are denied. School/membership/resource authorization is repeated at the final boundary. Teacher new Grades configuration authoring is denied; no permission grants are added. Teacher Homework authoring retains its existing allocation gates.

Final submission and manual review use current eligible assets, not stale upload counts. Homework clearAnswer clears text/options and soft-deletes active question answer assets in the same atomic path. SQL NULL clearing is explicit for configured Grades answers. Grades pending/progress counters exclude empty opt-in answers after removal. Existing manual review, marks and explicit Homework/GradeItem sync are unchanged authorities; no upload/bind awards marks or starts sync.

## Database invariants

- Response configuration is nullable only as SQL NULL and valid only on the four text question types.
- An intent has exactly one complete domain ancestry, and its session/context/question/actor tuple is physically constrained.
- A claim consumes one intent and File globally and immutably across both answer tables; typed Answer FKs prevent cross-domain rebinding.
- Asset creator must match the claim actor. A soft-deleted claimed asset cannot revive or be hard-deleted.
- All ancestor uniqueness includes an existing primary key. No new Homework live-answer uniqueness, historic cleanup, backfill or cascade deletion is imposed.
- File reference inventory after A: 28 physical relations, 27 retained consumers and 28 live-reference triggers; UploadSession provenance remains the single retention exclusion.

Migrations: `20261030131316_st11a_answer_response_and_provenance`, `20261030141000_st11a_answer_media_history_guards`, `20261030141931_st11a_answer_asset_creator_guard`. Later guards are forward-only because the preceding SQL had already been applied to the owned test database. No live migration occurred.

## Verification ownership

Shared modality unit tests cover closed grammar and all six modes. `st11-answer-media`, `st11-answer-media-security` and `st11-response-modalities` HTTP suites exercise actual JWT, PostgreSQL and private MinIO bytes, including replay, enrollment revocation, concurrent first binds, cancellation while attestation is paused, File deletion, replacement, clear and final completeness. `learning-media-st11-answer-audio.integration.spec.ts` belongs to the canonical media-runtime owner and verifies actual FFmpeg/FFprobe audio bytes. Existing ST05 structural fixtures now include explicit immutable claims, separately labeled synthetic SQL evidence; they do not certify streaming/security attestation. Full exact-head Actions evidence is required before source review handoff.

Additional HTTP coverage includes Core Grades ASSIGNMENT Student ownership, the real dashboard pending-review counter, Teacher Classroom manual review/finalize and explicit GradeItem sync, Homework manual rollup, and author/publication configuration guards. Reviewer Homework reads require the student's applicable active classroom/year/term enrollment. Bind-versus-submit and replace-versus-submit run as genuine simultaneous HTTP mutations in both domains. The real upgrade regression first deploys the 34 inherited migrations, inserts historical unclaimed asset rows, then applies ST11 and proves those rows unchanged.

Local non-mutating lint uses the verified initial main and the same changed-file set, locked dependencies and ESLint options. Both sides retain 27 errors and zero warnings; three messages differ only in Prisma enum-member ordering on identical source lines and are explicitly paired in the comparison evidence. The whole-repository baseline exhausts the 4 GiB Node heap before diagnostics; full feature lint is therefore not certified. No global lint cleanup or `--fix` is performed. Standalone whole-project typecheck is reported separately from the application build in the final evidence.

`DR07_OPERATIONAL_RELEASE=PENDING`; `LIVE_MIGRATION=NOT_AUTHORIZED`; `READY_FOR_REVIEW=NO`; `MERGE=NO`; `ST12–ST14=NOT_STARTED`.
