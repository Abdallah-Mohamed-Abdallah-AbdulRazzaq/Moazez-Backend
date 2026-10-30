# ST11 actual client API handoff

All paths below include `/api/v1`; existing flat question/answer routes remain valid. ST11-A source routes are implemented. Operational uploads remain default-off, denied in production and blocked by the unapproved security attestor. DR07 release and live migrations are not authorized. Multipart ST11-B additions are documented in their own implementation change.

## Author response configuration

Existing Homework and Core Grades question create/update DTOs accept optional `responseConfig`. Only Homework SHORT_TEXT/LONG_TEXT and Grades SHORT_ANSWER/ESSAY may opt in. Authorized Teacher Homework authoring retains its existing exact allocation gate. New Teacher Grades configuration authoring is denied even if a caller has an unusual existing management grant. Published/locked/attempted structure cannot change.

```json
{"responseConfig":{"version":1,"mode":"FILE_ONLY","maxFiles":1}}
```

Other V1 modes: TEXT_ONLY, AUDIO_ONLY, TEXT_OR_FILE, TEXT_AND_FILE, FILE_OR_AUDIO. TEXT_ONLY has no maxFiles key. Other modes default to 1, cap at 3 and remain subject to School/resource limits. Opt-in text bounds are 1,000 code points for short text and 10,000 for long/essay. Null clears configuration only while existing structural authoring guards permit it. Absent/null configuration omits the field on historical DTOs and preserves legacy answer grammar.

Invalid examples (rejected):

```json
{"responseConfig":{"version":2,"mode":"FILE_ONLY"}}
{"responseConfig":{"version":1,"mode":"TEXT_ONLY","maxFiles":1}}
{"responseConfig":{"version":1,"mode":"FILE_ONLY","maxFiles":4}}
{"type":"MEDIA","responseConfig":{"version":1,"mode":"AUDIO_ONLY"}}
```

## Student answer upload and binding

Define `Q` as one of these ACTUAL route prefixes:

| Domain | Q | Existing permissions |
| --- | --- | --- |
| Homework | `/api/v1/student/homeworks/:homeworkId/questions/:questionId` | Upload/bind/remove: `homework.submission_attachments.manage`; asset read: `homework.submissions.view` |
| Grades Exams | `/api/v1/student/exams/:assessmentId/submissions/:submissionId/questions/:questionId` | Upload/bind/remove: `grades.submissions.submit`; asset read: `grades.submissions.view` |
| Core Grades, own Student writes/read | `/api/v1/grades/submissions/:submissionId/questions/:questionId` | Same existing Grades permissions; parent Assessment is derived from the Submission |

For Grades, call the existing `/api/v1/student/exams/:assessmentId/start` first and use that own Submission ID. No temporary Answer ID is needed for upload preparation. The supplied IDs are locators; the server revalidates ownership, current enrollment, exact ancestry, permissions, lifecycle and question mode.

| Method | Actual suffix | Behavior |
| --- | --- | --- |
| POST | `Q/answer-uploads` | Reserve immutable question intent and bounded storage upload; 201 |
| GET | `Q/answer-uploads/:uploadId` | Current state; 200; no capability replay |
| POST | `Q/answer-uploads/:uploadId/complete` | Verify actual bytes/security and make READY; 201; does not bind an Answer |
| POST | `Q/answer-uploads/:uploadId/cancel` | Existing governed cancellation; 201 |
| POST | `Q/answer-assets` | Bind READY upload atomically; 201; matching live retry is idempotent |
| GET | `Q/answer-assets` | Own active answer assets and safe availability fields; 200 |
| DELETE | `Q/answer-assets/:assetId` | Draft-only soft deletion; 204; File/claim retained |
| GET / HEAD | `Q/answer-assets/:assetId/preview` | Authorized inline-eligible content; 200/206/416 |
| GET / HEAD | `Q/answer-assets/:assetId/download` | Authorized attachment content; 200/206/416 |

Prepare request:

```json
{"clientRequestId":"11111111-1111-4111-8111-111111111111","originalName":"answer.txt","expectedMimeType":"text/plain","expectedSizeBytes":"25"}
```

Create returns uploadId, status, nullable fileId and expiresAt; a newly issued capability is transient uploader-only material. Send actual bytes using that capability's returned method/fields. Do not persist or display capabilities to reviewers. Matching request retries return state without reissuing the capability. A request ID used for another question conflicts with 409. Every status/complete/cancel/bind repeats exact intent identity checks.

Bind and atomic replacement requests:

```json
{"uploadId":"22222222-2222-4222-8222-222222222222"}
{"uploadId":"33333333-3333-4333-8333-333333333333","replaceAssetId":"44444444-4444-4444-8444-444444444444"}
```

Bind returns `{ "asset": { "id", "fileId", "sourceType", "category", "createdAt" } }`. List returns `{ "assets": [...] }`, adding originalName, mimeType, sizeBytes (decimal string), previewAllowed and downloadAllowed. No object keys, buckets, verification evidence or persistent signed capabilities are exposed. Replacement requires a new upload; changing fileId or reviving an old soft-deleted asset is unsupported.

Use existing draft/bulk answer APIs for text and `clearAnswer`, and existing `/submission/submit` routes for finalization. File-only means no fake text, JSON or option selection. Final TEXT_AND_FILE requires both. Optional absence is valid; a supplied partial final answer is rejected. Homework clearAnswer also soft-deletes active assets on that answer atomically. Grade text/JSON clearing retains SQL NULL discipline. Final submission, answer media mutations, manual review and explicit grade sync remain distinct operations.

Candidate non-audio types are text/plain, PDF, JPEG, PNG; audio types are audio/mpeg, audio/mp4, audio/webm. Actual support intersects current policy and verification. No video response is supported. PDF/image deep inspection has not been introduced and remains fail-closed. Audio obeys existing technical and School metadata/duration limits. An unavailable attestor never produces READY.

## Reviewer reads

Each ACTUAL prefix below supports GET `/answer-assets` and GET/HEAD `/answer-assets/:assetId/preview` or `/download`. All require the existing domain `*.submissions.view` permission, exact current resource ownership and a submitted/reviewable resource. Teacher endpoints have no asset mutation methods.

| Surface | Actual prefix |
| --- | --- |
| Teacher Homework | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/questions/:questionId` |
| Core Homework | `/api/v1/homework/assignments/:homeworkId/submissions/:submissionId/questions/:questionId` |
| Teacher Classroom Grades | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/submissions/:submissionId/questions/:questionId` |
| Core Grades | `/api/v1/grades/submissions/:submissionId/questions/:questionId` |

Teacher classId is the existing TeacherSubjectAllocation ID, not a free classroom grant. Core routes admit existing School/Organization management actors. Parent and generic File-download permissions do not grant these resources. GET/HEAD authorization runs before range/conditional handling and before streaming; private/no-store headers and abort handling use the existing transport. Clients may send Range and If-Range. Safe inline MIME rules remain authoritative.

Core Grades also admits Students for their own Submission media lifecycle using the same persistence and authorization as Student Exams. School/Organization actors have reviewer read access only; every upload/bind/remove operation still requires the authenticated Student owner. Use the existing Core submission resolve/submit/review/sync APIs for Grades ASSIGNMENT resources; they are distinct from HomeworkAssignment. No powerful Core role may upload for another Student.

Invalid DTO/config returns established 400/422 errors; missing/mismatched/revoked access returns non-disclosing 403/404; invalid upload state, unavailable policy/verification, conflicting replay, exhausted capacity or immutable/terminal mutation returns the existing 409 family. Terminal lifecycle operations never write scores or automatically sync grades.
