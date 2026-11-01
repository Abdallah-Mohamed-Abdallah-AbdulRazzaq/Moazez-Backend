# ST14 final Client API handoff

Starting/certified merged source: `789fb5311a0d2a182468808b6aafe050ae72164e`. Audience: School Dashboard, Teacher App, Student App and Parent App. Platform administration receives no new assessment bypass or authoring surface. Existing Platform permission catalogs are governance data, not authority to bypass School/Organization-only routes.

`BACKEND_API_CONTRACT=SOURCE_VERIFIED`; `FRONTEND_MOBILE_INTEGRATION=NOT_RUN / NOT_CERTIFIED`; `END_TO_END_PRODUCT_ACCEPTANCE=NOT_RUN / NOT_CERTIFIED`. No actual client repository, browser product or mobile device has been tested by this handoff.

## Exact route and DTO register

[The source-derived route register](st14-client-route-register.csv) enumerates **456 literal method/path pairs** in the current Homework/Grades/Exams Core and app controllers, including the older Teacher Assignment review/sync paths without a `/grades` segment. It records the full `/api/v1` path, controller/handler, exact required permission, Body/Query/Param DTO and source, response DTO/source, runtime success status and group-level ownership, lifecycle, errors, media, compatibility, gates and client action. It is the exhaustive route locator for the functional groups below; paths are not guessed by combining arbitrary prefixes. The register is wider than the modernization diff so clients can distinguish established adjacent operations. Source verification is not a claim that ST14 executes every listed route.

All operations retain bearer authentication, current membership and School/academic context. IDs are obtained from authorized responses. `classId` on Teacher Homework/Classroom routes means **TeacherSubjectAllocation.id**. It is neither Classroom.id nor a grant for every subject in that classroom. Read permission never implies mutation or private-byte authority. Required permissions in the register are necessary, alongside use-case/resource checks.

The eight `api_group` values below define common contract rules referenced by register rows. The individual row's exact permission, DTO, explicit HttpCode and resource path take precedence over general method conventions. For example, Teacher Homework publish/submit/Grade Sync explicitly return **200**; Core/Teacher Grades sync retain **201**. Do not infer every POST status from its verb. Stream 416 is a range error, not a successful body.

## HW-AUTHOR — Homework authoring and publication

School Dashboard uses [Core question routes](../../src/modules/homework/controller/homework-questions.controller.ts) and existing assignment, attachment, target, group and Grade Sync controllers. Teacher App uses [TeacherHomeworksController](../../src/modules/teacher-app/homeworks/controller/teacher-homeworks.controller.ts) behind its exact live allocation/assignment ownership. Core assignment access and Teacher question/attachment grants remain operation-specific; the route CSV records each separately. Author keys/correctness are restricted to authorized author projections.

The author sends a complete applicable question definition, stable option IDs, bounded points/required flags and optionally validated Rich content/responseConfig. The Backend checks current membership/permission, tenant/creator/allocation as applicable, DRAFT structural state, current question/type/option identities, complete typed definitions and compatible retained keys. Publication rechecks current questions/options/required definitions, targets, deadlines and stimulus eligibility at its final transaction. Question-based Grades and Homework publication remain separate domain operations.

Teacher journey uses these literal routes:

| Method/path | Purpose and successful result |
| --- | --- |
| POST `/api/v1/teacher/homeworks/classes/:classId/assignments` | `TeacherHomeworkCreateDto` → `TeacherHomeworkAssignmentDto`, 201 |
| POST `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions` | Existing Homework question create DTO → question wrapper, 201 |
| GET `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId` | Current authorized assignment, 200 |
| POST `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/publish` | Current complete draft → published assignment, 200 |
| GET `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/grade-sync` | `homework.grade_sync.view`; link/synchronization status DTO, 200 |
| POST `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/grade-sync` | `homework.grade_sync.manage`; existing explicit synchronization, 200 |

The Dashboard's literal Core paths/DTOs/statuses are listed independently in the route register. Homework synchronization requires its existing linked GradeAssessment and eligible reviewed submissions; it is not triggered by upload, student submit, evaluation or review alone. See [Homework typed contract](st09bc-homework-eight-type-runtime-contract.md), [ST10-B](st10b-client-api-handoff.md) and [Grade Sync DTO](../../src/modules/homework/dto/homework-grade-sync.dto.ts).

Clients display DRAFT versus published/closed/cancelled state from the actual response. Re-fetch questions/layout after writes and publication. Group/asset creation is not universally idempotent: after a lost response, reconcile the collection before retrying. Structural writes cannot be retried through a read-only or legacy endpoint to evade lifecycle checks.

## HW-STUDENT — Homework answer and file-only submission

[StudentHomeworksController](../../src/modules/student-app/homeworks/controller/student-homeworks.controller.ts) resolves the authenticated Student and live target/enrollment; caller-provided IDs do not establish ownership. PUBLISHED/CLOSED historical read eligibility is distinct from accepting a new draft/final mutation. DRAFT answer saves and final required/optional checks remain domain-owned. SUBMITTED/LATE/REVIEWED work cannot be silently resubmitted or mutated.

| Method/path | Exact existing permission | Request / response and status |
| --- | --- | --- |
| GET `/api/v1/student/homeworks/:homeworkId` | homework.assignments.view | StudentHomeworkResponseDto `{homework:...}`, 200 |
| PUT `/api/v1/student/homeworks/:homeworkId/submission` | homework.submissions.save | StudentHomeworkSubmissionBodyDto → StudentHomeworkSubmissionResponseDto, 200 |
| PATCH `/api/v1/student/homeworks/:homeworkId/submission/answers/:questionId` | homework.answers.manage | SaveHomeworkAnswerDto → HomeworkAnswerDetailResponseDto `{answer:...}`, 200 |
| PUT `/api/v1/student/homeworks/:homeworkId/submission/answers` | homework.answers.manage | BulkSaveHomeworkAnswersDto → HomeworkAnswersListResponseDto `{items:[...]}`, 200 |
| POST `/api/v1/student/homeworks/:homeworkId/submit` | homework.submissions.submit | StudentHomeworkSubmitBodyDto → submission DTO, 200 |
| POST `/api/v1/student/homeworks/:homeworkId/submission/submit` | homework.submissions.submit | Existing final alias; same contract, 200 |

The Client sends the actual question's expected text/options/closed answerJson, never arbitrary correctness fields. Partial typed Draft values use `isDraft:true`; supplied Final answers must be complete even for an optional question. Optional absence is allowed; required absence is not. Mixed batches and first-draft creation are atomic. Homework uses explicit `clearAnswer:true`; raw `answerJson:null` is not a tagged Homework clear. A genuinely empty zero-question submission fails, while a currently linked eligible submission file may satisfy the established file-only assignment mode without bodyText. Question-bound responseConfig is a separate rule from this legacy submission-level attachment behavior.

```json
{"answerJson":{"value":"12.5","unitCode":"m"},"isDraft":true}
```

```json
{"clearAnswer":true}
```

```json
{}
```

The last body may finalize **already persisted complete work** only; it is not a promise that every empty submit is valid. Backend final mutation checks current answers, attachment links, live/private File eligibility, deadlines, target and permissions. Re-fetch submission state after uncertain final submission; do not assume a transport error proves rollback or blindly repeat a terminal command.

## HW-REVIEW — Homework review and legacy attachments

Teacher review resolves the exact owned allocation, assignment, submission, question and attachment. Core management uses its distinct existing grants. The [Teacher controller](../../src/modules/teacher-app/homeworks/controller/teacher-homeworks.controller.ts) and [Core submission use cases](../../src/modules/homework/application/homework-submissions.use-cases.ts) retain manual awarded points/comments and rollup/completion validation. Clients send bounded points and existing answer IDs, review each canonical child, then explicitly complete review. They must not submit a group ID as an answer ID.

Teacher attachment byte access is explicitly under the student's **submission**:

`GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/attachments/:attachmentId/download`

The matching preview/HEAD operations and permission/DTO contract are individually enumerated in the register. Assignment-level attachments use different paths/identity. `files.downloads.view` is not granted as a substitute. Teacher answer-media reads use exact submitted question/answer resources; they do not grant Student upload/bind/remove authority. A missing, deleted, foreign, revoked or mismatched resource returns non-disclosing denial before byte headers.

## GR-CORE — Grades administration, approval and release

Core Grades owns assessment creation/publication/approval/lock, questions/options/assets/groups and gradebook items. School/Organization management boundaries remain current; broader Teacher read scope is not Core write authority. See [Grades controllers](../../src/modules/grades/assessments/controller), [resource predicates](../../src/modules/grades/assessments/infrastructure/grades-resource-access.ts), and [ST12 contract](st12-client-api-handoff.md). DRAFT/unlocked/no-attempt guards apply to structural edits; SCORE_ONLY remains a separate established mode.

| Method/path | Permission | Request / response and success |
| --- | --- | --- |
| POST `/api/v1/grades/assessments/:assessmentId/questions` | grades.questions.manage | CreateGradeAssessmentQuestionDto → GradeAssessmentQuestionResponseDto, 201 |
| PATCH `/api/v1/grades/questions/:questionId` | grades.questions.manage | Existing update DTO → question DTO, 200 |
| POST `/api/v1/grades/assessments/:assessmentId/publish` | grades.assessments.publish | Existing publication use case/assessment DTO, 201 |
| POST `/api/v1/grades/assessments/:assessmentId/questions/:questionId/key-approval` | grades.questions.manage + grades.assessments.approve | ApproveGradeKeyDto.expectedQuestionUpdatedAt → GradeKeyApprovalResponseDto, 201 |
| POST `/api/v1/grades/assessments/:assessmentId/questions/:questionId/key-approval/revoke` | Same two grants | RevokeGradeKeyDto.approvalId → approval DTO, 201 |
| GET `/api/v1/grades/assessments/:assessmentId/review-release` | grades.assessments.approve | GradeReviewReleaseResponseDto; missing policy is version 0/NONE/NONE, 200 |
| PUT `/api/v1/grades/assessments/:assessmentId/review-release` | grades.assessments.approve | SetGradeReviewReleaseDto → policy DTO, 200 |

Paper publication/approval is not current private-key approval. Key approval binds the current validated question/key/options fingerprint; stale changes invalidate dependent scoring/release. A non-NONE release requires approved paper and current finalized reviews. Student and Parent levels are independent. KEYS additionally requires current approved valid keys. Missing/SQL-NULL/invalid policy fails closed. NONE/NONE revocation remains possible without release prerequisites.

Safe revocation command example (illustrative request UUID, current version must be read first):

```json
{"expectedVersion":2,"requestId":"11111111-1111-4111-8111-111111111111","studentLevel":"NONE","parentLevel":"NONE"}
```

Every committed policy change increments version. Only a matching latest requestId/body/expectedVersion replay returns the committed response without another audit; changed/stale/older commands conflict. After a conflict, fetch current policy and deliberately compose a new command/UUID. Do not treat a reused UUID as global permanent idempotency. Private keys, hashes and correctness are absent from these examples and safe audit payloads.

## GR-AUTHOR — opt-in Teacher Grades authoring

All 42 literal operations in this group are under the exact owned Teacher authoring surface, including questions, points/order, groups/layout, assets and author uploads. [TeacherGradeAuthoringController](../../src/modules/teacher-app/classroom/grades/controller/teacher-grade-authoring.controller.ts) uses `grades.teacher_authoring.manage`; sibling controllers and DTOs are linked per route in the register. This permission is absent from **all seven default roles**. A default Teacher may therefore receive denial even though the source supports the surface.

Every operation requires current Teacher membership, exact live owned TeacherSubjectAllocation, matching School/Organization/subject/year/term/classroom, CLASSROOM scope and assessment.createdById equal to this Teacher. Writes require DRAFT/unlocked/no-attempt structure and current authorization at commit. Broader SCHOOL/STAGE/GRADE/SECTION assessments remain excluded. Eligible draft creation/publication uses existing authorized Core workflows; this opt-in permission does not create a new Teacher assessment/publish privilege.

Question PATCH additionally sends `UpdateTeacherGradeQuestionDto.expectedQuestionUpdatedAt`. Question deletion preserves the last-question guard; point changes atomically recompute assessment.maxScore. Group membership writes send expectedGroupId; stale moves conflict. Asset source identity never changes in place. Re-fetch after version, allocation, membership or permission changes; do not cache a once-successful author check as authority.

## GR-STUDENT — Exams, Grades and own attempts

[Student Exams](../../src/modules/student-app/exams/controller/student-exams.controller.ts) and [Student Grades](../../src/modules/student-app/grades/controller/student-grades.controller.ts) retain distinct category/audience filters and DTO wrappers. Students see their own live enrollment/assessment/attempt. A valid Grades read does not imply exam eligibility or mutation authority.

| Method/path | Permission | Request / response and success |
| --- | --- | --- |
| GET `/api/v1/student/exams/:assessmentId` | grades.assessments.view | StudentExamDetailResponseDto with existing stages/questions, 200 |
| POST `/api/v1/student/exams/:assessmentId/start` | grades.submissions.start | Existing attempt resolution → StudentExamSubmissionStateResponseDto, 201 |
| PATCH `/api/v1/student/exams/:assessmentId/submission/answers/:questionId` | grades.submissions.save | StudentExamSaveAnswerDto → state DTO, 200 |
| PUT `/api/v1/student/exams/:assessmentId/submission/answers` | grades.submissions.save | StudentExamBulkSaveAnswersDto → state DTO, 200 |
| POST `/api/v1/student/exams/:assessmentId/submission/submit` | grades.submissions.submit | Existing final validation → state DTO, 201 |
| GET `/api/v1/student/grades/assessments/:assessmentId` | grades.assessments.view | StudentAssessmentGradeDetailResponseDto, 200 |
| GET `/api/v1/student/exams/:assessmentId/review` | grades.assessments.view | GradeReleasedReviewResponseDto; current exam/release authority, 200 |
| GET `/api/v1/student/grades/assessments/:assessmentId/review` | grades.assessments.view | Same released DTO under independent Grades ownership, 200 |

The Client sends the exact question's canonical answer representation. Grades saves are IN_PROGRESS; no Homework isDraft flag is introduced. Explicit new-type `answerJson:null` clears to SQL NULL; omission/empty objects do not universally mean clear. Required and supplied optional completeness are rechecked on final submit. Use the owning submission ID returned by start for question-bound answer media. NONE/DETAILS/approved KEYS/revoked states affect detailed and legacy review fields, not merely the new review route. Re-fetch on revocation and remove previously cached confidential display; the Backend cannot erase already downloaded bytes.

## GR-SUBMISSION — Core/Teacher review, scoring and explicit sync

The register distinguishes own Student Core answer writes from School/Organization reviewer operations and exact Teacher review adapters. The same route prefix is not an interchangeable actor capability. Current permissions, assessment category, submission ancestry, allocation/enrollment, mutable lifecycle and term remain authoritative.

| Method/path | Existing grant | Contract and success |
| --- | --- | --- |
| PATCH `/api/v1/grades/submissions/:submissionId/answers/:answerId/review` | grades.submissions.review | ReviewGradeSubmissionAnswerDto → answer DTO, 200 |
| PUT `/api/v1/grades/submissions/:submissionId/answers/review` | Same | BulkReviewGradeSubmissionAnswersDto (`reviews`) → bulk response, 200 |
| POST `/api/v1/grades/submissions/:submissionId/review/finalize` | Same | Current completion/rollup → GradeSubmissionResponseDto, 201 |
| POST `/api/v1/grades/submissions/:submissionId/sync-grade-item` | Same | GradeSubmissionGradeItemSyncResponseDto, 201 |
| POST `/api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/sync-grade-item` | grades.items.manage | TeacherClassroomSubmissionGradeItemSyncResponseDto, 201 |

Core and Teacher scoring routes are individually listed in the register: evaluate POST, fetch suggestion GET, and explicit apply POST. [GradeScoringController](../../src/modules/grades/assessments/controller/grade-scoring.controller.ts) and [TeacherGradeScoringController](../../src/modules/teacher-app/classroom/grades/controller/teacher-grade-scoring.controller.ts) both require current `grades.submissions.review`, with distinct management/Teacher allocation ownership.

Suggestions contain current opaque identity/version, bounded outcome/points/reason and PENDING/MANUAL_ONLY/STALE/APPLIED status. Evaluation changes no marks or GradeItems. MCQ/true-false/exact sets, explicit Fill/Matching keys and approved Ordering/Numeric/constant-expression proofs can suggest; subjective/File/Audio/MEDIA and unknown/undefined/invalid proof remain manual. No automatic partial credit, unit conversion or inferred tolerance appears.

```json
{"mode":"APPLY"}
```

```json
{"mode":"OVERRIDE","awardedPoints":0.5,"reason":"REVIEWER_JUDGMENT"}
```

The reviewer must use current suggestion identity and actual point bounds. APPLY admits no extra points/reason; OVERRIDE requires bounded points and an approved reason. Duplicate/second decisions or stale answer/question/approval state return 409. Re-fetch and explicitly decide again; never silently apply an old suggestion. Manual review, finalization and explicit sync are separate actions. Sync validates current lifecycle/grants/GradeItem state and commits its audit atomically; audit failure rolls back the item. It is not a generic automatic publish/release step.

ST13-API-001: actual Core generated OpenAPI already lists 201 and is unchanged. Teacher sync's 200 response annotation is corrected to 201 with the same DTO. Its runtime 201, permission, route and transaction are unchanged. Unrelated inherited review/finalize annotations are outside this narrow correction; runtime status in this register follows actual HttpCode/default behavior.

## PARENT — linked-child results and approved review

[ParentHomeworksController](../../src/modules/parent-app/homeworks/controller/parent-homeworks.controller.ts) retains legacy Homework detail and answer-release behavior. It grants no new Homework Rich/group/private-media authority. Parent Homework detail requires both assignment-view and submission-view grants plus the current linked child/target boundary.

[ParentGradeReviewController](../../src/modules/parent-app/grades/controller/parent-grade-review.controller.ts) exposes literal GET `/api/v1/parent/children/:studentId/grades/assessments/:assessmentId/review`, with `grades.assessments.view`, `GradeReleasedReviewResponseDto` and 200. It requires current ParentAppAccessService guardian relation, live child enrollment, exact finalized submission and **Parent** release level. NONE denies details; DETAILS omits private keys; KEYS projects only currently approved bounded answers/explanations. Existing result summaries remain under their existing grants. Parent media additionally requires current School allowGuardianVisibility (default false), release and resource authority before every read. No general files/reviewer grant is implied.

Clients must display independent audience availability, clear stale review display after revocation and handle 404 without distinguishing unrelated, unreleased, revoked or missing resources. A Student release does not release Parent data. No Parent upload or new Homework media right is introduced.

## Private Media journey and transport

Use the individual existing routes in the register for **Upload Intent → Upload → Verify → READY → Bind → Private Read → Replace/Unlink → Retention**. The [ST11 client contract](st11-client-api-handoff.md), [answer DTOs](../../src/modules/files/assessment-media/dto/answer-media.dto.ts), [ST06](st06-homework-question-assets-contract.md) and [ST07](st07-grades-assessment-assets-contract.md) define exact request/response wrappers. Author managed binding and Student question-bound response uploads have different purposes/parents; neither accepts a generic uploaded File as proof of eligibility.

```json
{"clientRequestId":"22222222-2222-4222-8222-222222222222","originalName":"response.txt","expectedMimeType":"text/plain","expectedSizeBytes":"25"}
```

```json
{"uploadId":"33333333-3333-4333-8333-333333333333"}
```

Create returns state and, only for a newly issued upload, transient uploader-only capability material. Follow the returned method/fields/headers and exact length/MIME; capabilities are not included in this handoff. Never persist/log/share them, derive object keys or return them to reviewers. Status/replay does not reissue a capability. Reuse of a clientRequestId for another question conflicts. Completion verifies actual object identity/bytes, technical and current security evidence; READY alone does not bind an answer. Bind repeats exact actor/School/parent/question/uploader/File/policy/modality checks transactionally. Replacement consumes a new upload and soft-deletes the exact old link; unlink never authorizes physical File deletion or immediate storage-quota release.

Six modes have distinct Final completeness: TEXT_ONLY=text, FILE_ONLY=eligible File, AUDIO_ONLY=eligible Audio, TEXT_OR_FILE=either, TEXT_AND_FILE=both, FILE_OR_AUDIO=eligible File or Audio. Configuration applies only to Homework SHORT_TEXT/LONG_TEXT and Grades SHORT_ANSWER/ESSAY. Non-TEXT_ONLY maxFiles defaults 1, cap 3, intersected with resource/School caps. Optional absence is valid; supplied partial Final work is not. Video answers are unsupported. MIME declarations do not establish security approval; unavailable PDF/image deep inspection or scanner/provider capability fails closed.

GET private bytes returns 200, allowed ranges 206, invalid ranges 416; If-Range follows existing transport. HEAD authorizes first, returns full-length 200 headers/no body and ignores Range. Preview requires trusted inline MIME; download forces safe attachment disposition. Preserve private/no-store, nosniff, safe filename, content length/range and abort/cancellation handling. Authorization occurs before headers/conditional handling and again before streaming. Cross-school/wrong-parent/revoked/missing objects must not leak storage details. Neither resource access paths nor asset IDs are persistent signed capabilities.

Managed assessment media remains default-off, Production-denied and blocked by the unapproved security gate. Existing legacy student/assignment attachment behavior is preserved under its own controls; DR07 does not grant or remove unrelated existing routes. A future operational rollout requires the separate [DevOps/DR07 acceptance](st14-devops-operational-handoff.md).

## Shared display, errors and acceptance responsibilities

Keep the eleven Homework and eleven Grades names distinct as listed in the [architecture closeout](st14-final-program-closeout.md). Stable option/question/group/asset identities are not display indexes. Groups are non-answerable; points are child-derived. Render only validated Safe Rich AST with escaped text, explicit lang/dir isolation and accessible math/chemistry/media descriptions. Preserve Arabic/English numerals and safe historical text fallback; unknown/invalid/future content is unsupported, not secretly an essay or raw HTML.

Homework tagged key clears, Grades explicit null clears, SQL NULL absence, JSON null invalidity and field omission are different contracts. Do not manufacture fields from another domain. No examples here contain private AnswerKeys, personal records, credentials, signed capabilities or object coordinates.

Handle 401 through session renewal; 403 through existing permission UX; 404 without enumeration. DTO validation is normally 400; Homework domain typed errors include 422; terminal/state/version/immutable/policy conflicts include 409; quota/rate contracts include 429; private transport can return 416/503. [Error catalog](../../ERROR_CATALOG.md), [media exception mapping](../../src/modules/files/assessment-media/domain/assessment-media.contract.ts), the individual DTOs and linked versioned contracts remain authoritative. Do not echo rejected keys, answers or provider details. Re-fetch current state after conflict/revocation and uncertain non-idempotent writes; do not blindly retry final submission, group creation, APPLY/OVERRIDE or sync.

Client owners must execute real author→publish→answer/upload→submit→review→explicit scoring/finalize→explicit sync→independent Student/Parent release/revoke journeys, legacy flat/text/file cases, all applicable types/modes/groups, Arabic/RTL/accessibility and private GET/HEAD/Range/abort. Include foreign School/Organization, wrong Teacher class/subject, Student, Parent, submission and attachment, revoked membership/grants/enrollment and stale versions. Record app/version/device, Backend SHA, actual status/body/bytes and outcome. Source contracts and Backend CI do not certify those applications or complete product acceptance.
