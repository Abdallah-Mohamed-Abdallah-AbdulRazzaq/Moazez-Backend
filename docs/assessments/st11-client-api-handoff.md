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

## ST11-B multipart groups — actual routes

All paths below are ACTUAL additive endpoints. Existing questions, answer save/bulk/submit, manual review and explicit sync endpoints remain canonical. Every path parameter is UUID-validated. classId is the existing TeacherSubjectAllocation ID.

| Surface | Parent prefix | Read permission | Mutation permission |
| --- | --- | --- | --- |
| Core Homework | `/api/v1/homework/assignments/:homeworkId` | homework.assignments.view | homework.assignments.manage |
| Teacher Homework | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId` | homework.submissions.view | homework.questions.manage |
| Core Grades | `/api/v1/grades/assessments/:assessmentId` | grades.assessments.view | grades.questions.manage |
| Teacher Grades | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId` | grades.submissions.view | None |
| Student Homework | `/api/v1/student/homeworks/:homeworkId` | homework.assignments.view | None |
| Student Exams | `/api/v1/student/exams/:assessmentId` | grades.assessments.view | None |
| Student Grades | `/api/v1/student/grades/assessments/:assessmentId` | grades.assessments.view | None |

Each prefix supports GET `/groups` (200) and GET/HEAD `/groups/:groupId/assets/:assetId/preview` or `/download`. Managed Homework author binding also rechecks the existing homework.attachments.manage permission. All rights are intersected with live membership, exact parent/target/allocation and current lifecycle. Teacher Grades has no group write endpoints or Core-role bypass; Parents have no new surface.

Only the first three author prefixes support:

| Method and suffix | Success | Result |
| --- | --- | --- |
| POST `/groups` | 201 | Complete groups/displayItems layout |
| PATCH `/groups/:groupId` | 200 | Complete layout |
| DELETE `/groups/:groupId` | 204 | Atomic child detach and asset soft-delete |
| PUT `/groups/layout` | 200 | Complete layout after atomic membership/order update |
| POST `/groups/:groupId/assets` | 201 | Safe asset DTO |
| PATCH `/groups/:groupId/assets/:assetId` | 200 | Safe metadata/order DTO |
| DELETE `/groups/:groupId/assets/:assetId` | 204 | Soft-delete only; File retained |

Create/update display example (closed RichQuestionContent V1 is optional):

```json
{"title":"Read the passage","instructions":"Answer each child separately","layoutOrder":1,"sharedStimulus":{"contentVersion":1,"kind":"question","stem":{"language":"en","direction":"ltr","blocks":[{"type":"paragraph","children":[{"type":"text","text":"Shared passage"}]}]}}}
```

Membership/order example; UUIDs are illustrative:

```json
{"questions":[{"questionId":"11111111-1111-4111-8111-111111111111","expectedGroupId":null,"groupId":"22222222-2222-4222-8222-222222222222","layoutOrder":0}],"blocks":[{"kind":"group","id":"22222222-2222-4222-8222-222222222222","layoutOrder":1}]}
```

Move requires the exact previous group; detach uses groupId=null. Unlisted questions remain unchanged. Homework requests/groups/children are capped at 100 and Grades at 200. layoutOrder is an integer from 0 through 2147483647. Stable mixed order uses ID tie-breaks and never rewrites legacy question sortOrder.

Asset create accepts either an existing exact-parent verified authoring upload or a safe external source:

```json
{"sourceType":"MANAGED_FILE","uploadId":"33333333-3333-4333-8333-333333333333","fileId":"44444444-4444-4444-8444-444444444444","title":"Shared document"}
{"sourceType":"EXTERNAL_HTTPS","externalUrl":"https://example.org/passage","category":"DOCUMENT","title":"External passage"}
```

Do not persist upload capabilities in Rich AST. Use the returned group asset ID in a closed assetReference node belonging to that same group. Metadata PATCH accepts only title, description and sortOrder; it cannot change File/source identity. Replacement creates a new binding. Remove existing AST references before deleting an asset. Same-parent verified source reuse is separately authorized and shares the eight-reference parent limit.

The group DTO contains id, title, instructions, layoutOrder, questionIds in display order, derived points (for example `"2.00"`), sharedStimulusSupported, optional validated sharedStimulus and safe asset metadata. Assets expose availability and current preview/download flags, with filename/MIME/decimal bytes only for available Files. displayItems contains either `{kind:"question",questionId}` or `{kind:"group",groupId,questionIds}`. No group is answerable or scored twice. Legacy flat roots omit these fields until opted into groups/layout; canonical question lists remain present. Student Homework nests layout under homework; Student Exams retains stages[0].questions; Student Grades retains questions.

Existing Core/Teacher Homework submission-review responses place authorized layout under submission.groups/displayItems, including unanswered optional children. Core Grades submission detail and Teacher Classroom assessment/review responses carry root layout. These display fields do not add an answer or review operation. Existing review and explicit synchronization routes retain their own permissions and lifecycle checks.

GET uses 200/206/416 with Range and If-Range; HEAD follows existing transport policy (200 full-length headers and no body, ignoring Range). Responses remain private/no-store with safe content disposition and abort handling. Invalid stored or unavailable shared stimulus is omitted with sharedStimulusSupported=false on reads; publication rejects it, while existing child answer/review operations continue.

Invalid examples include parentGroupId/nesting, group points/answers, unknown Rich fields, a foreign group's assetReference, duplicate membership IDs, a stale expectedGroupId, cross-parent membership, unsupported source identity changes and a group ID supplied as questionId. Shape/validation errors return established 400/422; revoked/mismatched resources return non-disclosing 403/404; stale membership returns 409. Published/locked/attempted structures follow existing domain 400/404/409 errors. Parent/Teacher Grades mutation requests remain denied.

POST group/asset creation follows existing authoring semantics and is not idempotent: a retry can create another group/reference and must not be assumed safe after an uncertain transport outcome. Fetch groups to reconcile. Membership/layout uses explicit expected membership; repeating an already-applied move with the old expectation returns 409. PATCH metadata/order assigns values; DELETE on a removed resource returns 404. No new idempotency key or generic upload purpose is introduced. Production execution still requires future DR07 approval; this source change does not enable it.
