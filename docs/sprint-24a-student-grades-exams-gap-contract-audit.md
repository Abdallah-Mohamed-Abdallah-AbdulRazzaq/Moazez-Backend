# Sprint 24A Student Grades / Exams Gap Contract Audit

## 1. Executive Decision

Classification: PARTIAL.

The frontend/backend handoff in `adr/Student-App/STUDENT_GRADES_EXAMS_BACKEND_GAPS.md` identifies true backend gaps. It is not only a naming-difference handoff.

Evidence-based conclusions:

| Area | Decision | Classification |
| --- | --- | --- |
| Student Exams read routes | Existing Student App read routes are present and student-safe. | COMPLETE |
| Student Exams detail shape | Detail currently returns stages, questions, and options without answer keys, correct-answer fields, correctness flags, or storage internals. | COMPLETE |
| Student Exams answer workflow | Student App has no start, save-answer, bulk-save, or submit routes under `/api/v1/student/exams/*`. | MISSING |
| Core Grades submission routes | Core routes provide similar dashboard/domain capabilities, but they are not safe Student App contracts because they use generic grades permissions, accept or mutate by non-student-owned identifiers, and expose internal fields. | SECURITY_GAP |
| Student Grades assessment detail | Route exists and is student-owned, but currently returns assessment, grade, and submission summary only. It does not return submission answers or questions. | PARTIAL |
| Schema readiness | Existing GradeAssessment, GradeAssessmentQuestion, GradeAssessmentQuestionOption, GradeSubmission, and GradeSubmissionAnswer models appear sufficient for the requested V1 workflow. | COMPLETE |

Sprint 24B is needed for a Student App-safe exam solving/submission workflow. Sprint 24C is needed for Student Grades assessment-detail enrichment. Neither sprint should expose `/api/v1/grades/submissions/*` as a frontend Student App contract.

## 2. Source Material Reviewed

Repository baseline verified:

- `main` HEAD: `0def8707852be408b4c44465a29accf2b2026b1f`
- Commit message expected by the sprint brief: `docs: finalize homework grades assessments closeout`

Frontend/backend gap handoff reviewed:

- `adr/Student-App/STUDENT_GRADES_EXAMS_BACKEND_GAPS.md`

Governance and scope docs reviewed:

- `AGENT_CONTEXT_PRIMER.md`
- `CLAUDE.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `DOMAIN_GLOSSARY.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `ERROR_CATALOG.md`
- `TESTING_STRATEGY.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `DIRECTORY_STRUCTURE.md` was requested by the required-reading list but was not present in the repository.

ADRs reviewed:

- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`
- `adr/Student-App/student_GRADES_BACKEND_MODEL.md`
- `adr/Student-App/student_EXAMS_BACKEND_MODEL.md`
- `adr/School-Dashboard/sis_dashboard-grades_backend_handoff_spec.md`

Relevant closeout and audit docs reviewed:

- `docs/sprint-8a-student-app-contract-audit.md`
- `docs/sprint-13a-homework-core-contract-audit.md`
- `docs/sprint-14a-homework-submissions-contract-audit.md`
- `docs/sprint-15a-academics-curriculum-homework-completion-audit.md`
- `docs/sprint-22a-academics-remaining-gaps-contract-audit.md`
- `docs/sprint-22f-app-facing-lesson-content-preparation-contract-audit.md`
- `docs/sprint-22j-app-facing-lesson-content-final-closeout-audit.md`
- `docs/sprint-23a-homework-grades-assessments-reality-audit.md`
- `docs/sprint-23d-teacher-app-grades-write-workflow-decision-audit.md`
- `docs/sprint-23f-homework-grades-assessments-security-closeout.md`
- `docs/sprint-23h-homework-grades-assessments-final-closeout-audit.md`

Actual backend areas reviewed:

- `src/modules/student-app/exams/controller/student-exams.controller.ts`
- `src/modules/student-app/exams/application/list-student-exams.use-case.ts`
- `src/modules/student-app/exams/application/get-student-exam.use-case.ts`
- `src/modules/student-app/exams/application/get-student-exam-submission.use-case.ts`
- `src/modules/student-app/exams/infrastructure/student-exams-read.adapter.ts`
- `src/modules/student-app/exams/presenters/student-exams.presenter.ts`
- `src/modules/student-app/exams/dto/student-exams.dto.ts`
- `src/modules/student-app/grades/controller/student-grades.controller.ts`
- `src/modules/student-app/grades/application/get-student-assessment-grade.use-case.ts`
- `src/modules/student-app/grades/infrastructure/student-grades-read.adapter.ts`
- `src/modules/student-app/grades/presenters/student-grades.presenter.ts`
- `src/modules/student-app/grades/dto/student-grades.dto.ts`
- `src/modules/student-app/student-app.module.ts`
- `src/modules/student-app/access/student-app-access.service.ts`
- `src/modules/student-app/access/student-app-student-read.adapter.ts`
- `src/modules/student-app/shared/student-app-domain.ts`
- `src/modules/grades/assessments/controller/grades-submissions.controller.ts`
- `src/modules/grades/assessments/application/resolve-grade-submission.use-case.ts`
- `src/modules/grades/assessments/application/save-grade-submission-answer.use-case.ts`
- `src/modules/grades/assessments/application/bulk-save-grade-submission-answers.use-case.ts`
- `src/modules/grades/assessments/application/submit-grade-submission.use-case.ts`
- `src/modules/grades/assessments/infrastructure/grades-submissions.repository.ts`
- `src/modules/grades/assessments/domain/grade-submission-domain.ts`
- `src/modules/grades/assessments/dto/grade-submission.dto.ts`
- `src/modules/grades/assessments/presenters/grade-submission.presenter.ts`
- `src/modules/grades/grades-context.ts`
- `src/common/guards/jwt-auth.guard.ts`
- `src/common/guards/scope-resolver.guard.ts`
- `src/common/guards/permissions.guard.ts`
- `src/infrastructure/database/school-scope.extension.ts`
- `prisma/schema.prisma`

Tests reviewed:

- `test/security/tenancy.student-app.spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `src/modules/student-app/exams/tests/student-exams-read.adapter.spec.ts`
- `src/modules/student-app/exams/tests/student-exams.presenter.spec.ts`
- `src/modules/student-app/exams/tests/student-exams.use-case.spec.ts`
- `src/modules/student-app/grades/tests/student-grades.presenter.spec.ts`
- Relevant `rg` search results across `test/e2e`, `test/security`, and `src/modules/**/tests` for student exam, student grade, grade submission, and question-based submission coverage.

## 3. Current Route Matrix

All paths below are externally prefixed by `app.setGlobalPrefix('api/v1')`, so the public routes are under `/api/v1/...`.

### Student Exams Read Routes

| Route | Exists? | Controller / use-case path | Current purpose | Safe for Student App? | Classification |
| --- | --- | --- | --- | --- | --- |
| `GET /api/v1/student/exams` | Yes | `src/modules/student-app/exams/controller/student-exams.controller.ts`; `list-student-exams.use-case.ts`; `student-exams-read.adapter.ts` | Lists visible exam-like assessments for the authenticated student's current enrollment. | Yes. Uses `StudentAppAccessService` and scoped read adapter. | COMPLETE |
| `GET /api/v1/student/exams/:assessmentId` | Yes | `student-exams.controller.ts`; `get-student-exam.use-case.ts`; `student-exams-read.adapter.ts`; `student-exams.presenter.ts` | Returns student-safe exam assessment detail with stage/question/option structure. | Yes. Bound to current student context and sanitized by app-facing presenter. | COMPLETE |
| `GET /api/v1/student/exams/:assessmentId/submission` | Yes | `student-exams.controller.ts`; `get-student-exam-submission.use-case.ts`; `student-exams-read.adapter.ts`; `student-exams.presenter.ts` | Returns the current student's existing submission state, or `submission: null`; does not create a submission. | Yes for read-only state. Bound to current `studentId` and `enrollmentId`. | COMPLETE |

### Student Exams Requested Write Routes

| Route | Exists? | Controller / use-case path | Current purpose | Safe for Student App? | Classification |
| --- | --- | --- | --- | --- | --- |
| `POST /api/v1/student/exams/:assessmentId/start` | No | No Student App controller/use-case exists. | Requested route to create or return the current student's own in-progress submission. | Not applicable; missing. | MISSING |
| `PUT /api/v1/student/exams/:assessmentId/submission/answers` | No | No Student App controller/use-case exists. | Requested route to bulk-save answers for the current student's own submission. | Not applicable; missing. | MISSING |
| `PATCH /api/v1/student/exams/:assessmentId/submission/answers/:questionId` | No | No Student App controller/use-case exists. | Requested route to save one answer for the current student's own submission. | Not applicable; missing. | MISSING |
| `POST /api/v1/student/exams/:assessmentId/submission/submit` | No | No Student App controller/use-case exists. | Requested route to submit the current student's own submission. | Not applicable; missing. | MISSING |

### Student Grades Assessment Detail Route

| Route | Exists? | Controller / use-case path | Current purpose | Safe for Student App? | Classification |
| --- | --- | --- | --- | --- | --- |
| `GET /api/v1/student/grades/assessments/:assessmentId` | Yes | `src/modules/student-app/grades/controller/student-grades.controller.ts`; `get-student-assessment-grade.use-case.ts`; `student-grades-read.adapter.ts`; `student-grades.presenter.ts` | Returns current assessment metadata, grade summary, and submission summary. | Yes for current fields. It uses current student ownership and app-facing response shaping. | PARTIAL |

### Core Grades Submission Routes

| Route | Exists? | Controller / use-case path | Current purpose | Safe for Student App? | Classification |
| --- | --- | --- | --- | --- | --- |
| `GET /api/v1/grades/assessments/:assessmentId/submissions` | Yes | `src/modules/grades/assessments/controller/grades-submissions.controller.ts`; `list-grade-submissions.use-case.ts` | Dashboard/core list of assessment submissions. | No. Uses grades permissions and dashboard presenter shape. | SECURITY_GAP |
| `POST /api/v1/grades/assessments/:assessmentId/submissions/resolve` | Yes | `grades-submissions.controller.ts`; `resolve-grade-submission.use-case.ts` | Resolves or creates a submission for `studentId` and optional `enrollmentId` supplied by the request. | No. Student App clients must not send or choose `studentId` / `enrollmentId`. | SECURITY_GAP |
| `GET /api/v1/grades/submissions/:submissionId` | Yes | `grades-submissions.controller.ts`; `get-grade-submission.use-case.ts` | Dashboard/core submission detail by submission id. | No. It is not bound to the authenticated student's ownership. | SECURITY_GAP |
| `PUT /api/v1/grades/submissions/:submissionId/answers/:questionId` | Yes | `grades-submissions.controller.ts`; `save-grade-submission-answer.use-case.ts` | Saves one answer on a submission id. | No. Mutation is by submission id and generic grades scope, not current Student App ownership. | SECURITY_GAP |
| `PUT /api/v1/grades/submissions/:submissionId/answers` | Yes | `grades-submissions.controller.ts`; `bulk-save-grade-submission-answers.use-case.ts` | Bulk-saves answers on a submission id. | No. Mutation is by submission id and generic grades scope, not current Student App ownership. | SECURITY_GAP |
| `POST /api/v1/grades/submissions/:submissionId/submit` | Yes | `grades-submissions.controller.ts`; `submit-grade-submission.use-case.ts` | Submits a submission id. | No. Submission ownership is not enforced through `StudentAppAccessService`. | SECURITY_GAP |

## 4. Student Exams Read Detail Shape

Route audited:

- `GET /api/v1/student/exams/:assessmentId`

Current behavior:

| Requirement | Evidence | Classification |
| --- | --- | --- |
| Returns `stages` | `StudentExamsPresenter.presentDetail` wraps assessment questions in a `stages` array with a default stage id/title. | COMPLETE |
| Stages include `questions` | `presentDetail` maps assessment `questions` into `stage.questions`. | COMPLETE |
| Questions include `options` | `student-exams-read.adapter.ts` selects question options, and the presenter maps them into `question.options`. | COMPLETE |
| Answer keys are absent | The adapter does not select `GradeAssessmentQuestion.answerKey`; tests assert `answerKey` is absent. | COMPLETE |
| `correctAnswer` / `correctAnswers` are absent | The presenter does not emit those fields, and submission answer JSON sanitization strips them recursively. | COMPLETE |
| `isCorrect` is absent | The adapter does not select option `isCorrect`; tests assert it is absent from exam detail options. | COMPLETE |
| Storage internals are absent | The detail route does not select file/storage records and does not emit `bucket`, `objectKey`, `signedUrl`, or raw storage metadata. | COMPLETE |

Overall classification: COMPLETE.

Important nuance for future writes: the current options response includes `value`. This is not the same as `isCorrect`, and existing no-leak tests accept it. Sprint 24B should still confirm that `value` is safe for every exam question type used by the product, because some authoring conventions may store human-readable answer values there.

## 5. Student Exam Answer Workflow Gap

Requested Student App routes:

- `POST /api/v1/student/exams/:assessmentId/start`
- `PUT /api/v1/student/exams/:assessmentId/submission/answers`
- `PATCH /api/v1/student/exams/:assessmentId/submission/answers/:questionId`
- `POST /api/v1/student/exams/:assessmentId/submission/submit`

Audit result:

| Route | Exists under Student App? | Classification |
| --- | --- | --- |
| `POST /api/v1/student/exams/:assessmentId/start` | No | MISSING |
| `PUT /api/v1/student/exams/:assessmentId/submission/answers` | No | MISSING |
| `PATCH /api/v1/student/exams/:assessmentId/submission/answers/:questionId` | No | MISSING |
| `POST /api/v1/student/exams/:assessmentId/submission/submit` | No | MISSING |

This is a real capability gap, not a naming mismatch.

Reasons:

- `src/modules/student-app/exams/controller/student-exams.controller.ts` only defines `GET` handlers.
- `src/modules/student-app/student-app.module.ts` registers only read use-cases and the read adapter for Student Exams.
- `rg` searches for Student App exam `@Post`, `@Put`, `@Patch`, and `@Delete` handlers found no write routes.
- The existing Student Exams submission route is read-only. Tests assert empty submission state is returned without creating a `GradeSubmission`.
- Core Grades routes have similar domain operations, but they are not app-facing Student App contracts and do not enforce authenticated-student ownership.

Expected Sprint 24B classification: MISSING until implemented behind `/api/v1/student/exams/*`.

## 6. Core Grades Submission Route Safety Analysis

Core route family audited:

- `/api/v1/grades/assessments/:assessmentId/submissions/*`
- `/api/v1/grades/submissions/:submissionId/*`

Findings:

| Safety question | Finding | Classification |
| --- | --- | --- |
| Do core routes accept `studentId` or `enrollmentId` from the request? | Yes. `ResolveGradeSubmissionDto` requires `studentId` and allows `enrollmentId`. | SECURITY_GAP |
| Are routes protected by Student App ownership? | No. Controllers use `@RequiredPermissions('grades.submissions.*')`, and use-cases call `requireGradesScope()`. | SECURITY_GAP |
| Do routes use `StudentAppAccessService`? | No. They do not resolve the current authenticated student or current enrollment through Student App access. | SECURITY_GAP |
| Can answer routes mutate by arbitrary submission id within grades scope? | Yes. Save/bulk-save/submit use `submissionId` from the route and school-scoped repository checks, not current-student ownership checks. | SECURITY_GAP |
| Do core responses expose Student App-forbidden or app-internal fields? | Yes. Core DTO/presenter shapes include fields such as `studentId`, `enrollmentId`, `termId`, `reviewedById`, student/enrollment summaries, reviewer comments, and raw `answerJson`. | SECURITY_GAP |
| Do core routes validate question/option membership? | Yes. Domain/repository logic validates questions and selected options belong to the submission assessment. | COMPLETE |
| Do core routes reject submitted/corrected mutation? | Yes. `assertSubmissionMutable` allows only `IN_PROGRESS`. | COMPLETE |
| Do core routes reject score-only assessment drafts? | Yes. `assertSubmissionAssessmentAcceptsDrafts` requires `QUESTION_BASED`. | COMPLETE |
| Can the Student App frontend safely call these routes directly? | No. They are dashboard/core routes, not current-student app-facing routes. | SECURITY_GAP |

Decision: direct frontend use of `/api/v1/grades/submissions/*` is not accepted for Student App.

The future Student Exams write workflow may reuse existing GradeSubmission domain/repository logic only behind a Student App adapter/use-case that:

- resolves current `studentId` and `enrollmentId` server-side;
- never trusts `studentId` or `enrollmentId` from the client;
- verifies the requested assessment is visible to the current student's enrollment;
- binds all mutations to the current student's own submission;
- emits a Student App presenter shape, not the core dashboard grade-submission presenter.

## 7. Student Grades Assessment Detail Gap

Route audited:

- `GET /api/v1/student/grades/assessments/:assessmentId`

Current implementation:

- Controller: `src/modules/student-app/grades/controller/student-grades.controller.ts`
- Use-case: `src/modules/student-app/grades/application/get-student-assessment-grade.use-case.ts`
- Adapter: `src/modules/student-app/grades/infrastructure/student-grades-read.adapter.ts`
- Presenter: `src/modules/student-app/grades/presenters/student-grades.presenter.ts`

Current response shape:

- `assessment`: assessment id, title, subject object, type, status, delivery mode, date, max score, weight, expected time.
- `grade`: grade item id, status, score, max score, percent, comment, entered at, virtual missing flag.
- `submission`: submission id, status, total score, max score, submitted at, corrected at; or `null`.

Requested field audit:

| Requested area | Current state | Classification |
| --- | --- | --- |
| Assessment metadata | Present, with nested `subject` object rather than only flat `subjectName`; score values are represented in grade/submission objects, not assessment aliases such as `earnedMarks` / `totalMarks`. | PARTIAL |
| Grade item summary | Present as `grade`, not as `gradeItem`. Includes grade item id, status, score, max score, percent, comment, entered at. | PARTIAL |
| Submission summary | Present. Includes id, status, total score, max score, submitted/corrected timestamps. | COMPLETE |
| Submission answers | Not selected by the adapter and not emitted by the presenter. | MISSING |
| Questions | Not selected by the adapter and not emitted by the presenter. | MISSING |
| Student-safe feedback | Partially present through `grade.comment`. Per-answer reviewer feedback is not exposed. Future exposure must avoid teacher-only notes and reviewer/internal ids. | PARTIAL |
| No `answerKey` | Current route does not select assessment questions, so it does not expose answer keys. Future enrichment must continue to omit them. | COMPLETE |
| No `correctAnswer` / `correctAnswers` | Current route does not expose them. Future enrichment must sanitize answer JSON and question metadata. | COMPLETE |
| No `isCorrect` | Current route does not expose options or correctness flags. Future enrichment must omit option `isCorrect` and answer correctness flags. | COMPLETE |
| No storage internals | Current route does not expose file/storage metadata. Future answer enrichment must sanitize `bucket`, `objectKey`, `signedUrl`, and raw file metadata. | COMPLETE |

Overall classification: PARTIAL.

This is a response enrichment gap, not a missing route. Sprint 24C should preserve the existing fields and add only student-safe fields for the current student's own submission.

## 8. Security / No-Leak Risk Register

| Risk | Current reality | Required Sprint 24B / 24C handling | Classification |
| --- | --- | --- | --- |
| Cross-school access | Student App reads use scoped Prisma and current membership context; core routes are school-scoped but not Student App-owned. | Keep scoped Prisma and current-student checks on every new write/read enrichment path. | COMPLETE for reads; SECURITY_GAP for direct core route use |
| Cross-student submission access | Student App read submission filters by current `studentId` and `enrollmentId`; core mutation routes mutate by `submissionId`. | New Student Exam writes must resolve and mutate only the current student's own submission. | SECURITY_GAP for core route use |
| Parent using student exam routes | `StudentAppAccessService` requires `UserType.STUDENT`. | Reuse the same access service for all write routes. | COMPLETE for reads |
| Teacher/admin using student routes | `StudentAppAccessService` rejects non-student actors. | Reuse the same access service for all write routes. | COMPLETE for reads |
| Unpublished/hidden assessment solving | Student App reads filter visible published/approved assessments; core submission domain rejects non-published/non-approved drafts. | New start/save/submit routes must require the assessment to be visible to the current student and published/approved. | MISSING until 24B writes exist |
| Score-only assessment solving | Student App read list includes score-only and question-based assessments; core write domain rejects non-question-based drafts. | New solving routes must reject `SCORE_ONLY` assessments. | MISSING until 24B writes exist |
| Submitted/corrected submission mutation | Core domain rejects mutation unless status is `IN_PROGRESS`. | Preserve this behavior in Student App wrappers and return safe conflict errors. | COMPLETE in core; MISSING in Student App writes |
| Invalid question from another assessment | Core domain/repository validates the question belongs to the submission assessment. | Preserve validation in Student App wrappers. | COMPLETE in core; MISSING in Student App writes |
| Invalid option from another question | Core domain/repository validates selected options belong to the question. | Preserve validation in Student App wrappers. | COMPLETE in core; MISSING in Student App writes |
| Leaked answer keys | Student App exam detail does not select or emit `answerKey`. | Continue to omit `answerKey` from exam writes and grade-detail enrichment. | COMPLETE for reads |
| Leaked `isCorrect` | Student App exam detail does not select option `isCorrect`. | Continue to omit `isCorrect` from all app-facing options and answers. | COMPLETE for reads |
| Leaked correct answers | Student App presenter strips `correctAnswer` and `correctAnswers` from answer JSON. | Reuse or extend sanitization for write responses and grade detail enrichment. | COMPLETE for current submission reads |
| Leaked tenant/internal ids | Student App presenters avoid `schoolId`, `organizationId`, `membershipId`, `roleId`, and `deletedAt`; core presenter exposes some internal grade ids. | Do not return `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, `reviewedById`, or unapproved internal tenancy metadata. | COMPLETE for reads; SECURITY_GAP for direct core route use |
| Leaked storage internals | Current Student Exams/Grades reads do not select storage internals; submission answer JSON sanitizer removes common storage keys. | Future answer payloads must strip `bucket`, `objectKey`, `signedUrl`, raw storage metadata, and direct file URLs unless an approved app-safe file DTO exists. | COMPLETE for current reads |
| Unsafe internal IDs in app-facing DTOs | Existing Student App routes expose accepted app ids such as `assessmentId`, `submissionId`, `questionId`, and `optionId`; core routes expose broader internal identifiers. | Keep app-facing DTOs limited to accepted ids. Do not expose reviewer, membership, role, tenant, or raw internal storage ids. | PARTIAL |
| Safe error handling | Current Student App access errors distinguish forbidden actor from missing owned resources; hidden/cross-owned resources generally resolve as not found. | New routes should return safe 403 for non-student actor, safe 404 for inaccessible assessment/submission, 409 for immutable submission, and 422/400 for invalid answer payloads without leaking existence across boundaries. | PARTIAL |

Never expose these fields in Student App responses:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- `answerKey`
- `correctAnswer`
- `correctAnswers`
- `isCorrect`
- `objectKey`
- `bucket`
- `signedUrl`
- raw storage metadata
- raw answer metadata
- reviewer/internal ids unless explicitly accepted
- teacher-only notes
- internal tenancy metadata

## 9. Recommended Sprint Breakdown

### Sprint 24B: Student Exams Safe Submission Workflow

Goal:

- Add a Student App-safe solving workflow under `/api/v1/student/exams/*` for the authenticated student's own question-based exam submissions.

Allowed files/areas:

- `src/modules/student-app/exams/**`
- `src/modules/student-app/student-app.module.ts`
- `src/modules/student-app/access/**` only if a narrowly scoped helper is required
- `src/modules/grades/assessments/**` only for non-breaking reuse of existing domain/repository logic, not for exposing core routes as Student App contracts
- `test/e2e/**/*student*exam*`
- `test/security/**/*student*exam*`
- `src/modules/student-app/exams/tests/**`
- `ERROR_CATALOG.md` only if new documented error codes are required

Forbidden files/areas:

- `src/main.ts`
- `src/infrastructure/realtime/realtime.gateway.ts`
- `package.json`
- package scripts
- `README.md`
- `.env`
- Docker/deployment/PM2/server config
- `prisma/schema.prisma`
- `prisma/migrations/*`
- changing or repurposing `/api/v1/grades/submissions/*` as the Student App frontend contract

Expected routes:

- `POST /api/v1/student/exams/:assessmentId/start`
- `PUT /api/v1/student/exams/:assessmentId/submission/answers`
- `PATCH /api/v1/student/exams/:assessmentId/submission/answers/:questionId`
- `POST /api/v1/student/exams/:assessmentId/submission/submit`

Required tests:

- Authenticated current student can start own visible question-based exam.
- Start creates or returns only the current student's own in-progress submission.
- Bulk answer save writes only own submission answers.
- Single answer save writes only the requested own answer.
- Submit transitions only own submission to submitted.
- Cross-school assessment returns safe not-found.
- Other student's submission cannot be read or mutated.
- Parent, teacher, admin, and platform actors cannot use Student Exam write routes.
- Unpublished, hidden, locked, wrong-scope, or score-only assessments cannot be solved.
- Submitted/corrected submissions cannot be mutated.
- Invalid question from another assessment is rejected.
- Invalid option from another question is rejected.
- Responses do not include answer keys, correct answers, `isCorrect`, tenant ids, reviewer/internal ids, or storage internals.

No-leak assertions:

- Assert absence of `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, `answerKey`, `correctAnswer`, `correctAnswers`, `isCorrect`, `bucket`, `objectKey`, `signedUrl`, and raw answer/storage metadata from every Student Exam write response.

### Sprint 24C: Student Grades Assessment Detail Enrichment

Goal:

- Enrich `GET /api/v1/student/grades/assessments/:assessmentId` with student-safe questions and current-student submission answers while preserving the current response contract.

Allowed files/areas:

- `src/modules/student-app/grades/**`
- Shared Student App presenter/sanitizer utilities if needed
- `src/modules/student-app/student-app.module.ts` only if provider wiring changes are required
- `test/e2e/**/*student*grade*`
- `test/security/**/*student*grade*`
- `src/modules/student-app/grades/tests/**`
- `ERROR_CATALOG.md` only if new documented error codes are required

Forbidden files/areas:

- `src/main.ts`
- `src/infrastructure/realtime/realtime.gateway.ts`
- `package.json`
- package scripts
- `README.md`
- `.env`
- Docker/deployment/PM2/server config
- `prisma/schema.prisma`
- `prisma/migrations/*`
- removing or renaming existing Student Grades response fields
- exposing core dashboard grade-submission presenter shapes

Expected response changes:

- Preserve existing `assessment`, `grade`, and `submission` fields.
- Add a backward-compatible `gradeItem` summary only if product naming alignment is needed.
- Add `submission.answers` for the current student's own submission only.
- Add `questions` for the requested assessment only when safe for the current student.
- Omit answer keys, correct answers, correctness flags, tenant ids, reviewer/internal ids, and storage internals.

Required tests:

- Existing Student Grades assessment detail tests continue to pass.
- Detail includes current-student submission answers when a submission exists.
- Detail does not include another student's answers.
- Detail includes questions without answer keys or correctness flags.
- Cross-school and wrong-classroom assessment ids return safe not-found.
- Non-student actors are rejected.
- Score-only assessment behavior is explicitly covered: either no `questions`, or an empty questions array, depending on product decision.

No-leak assertions:

- Assert absence of `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, `answerKey`, `correctAnswer`, `correctAnswers`, `isCorrect`, `bucket`, `objectKey`, `signedUrl`, reviewer/internal ids, teacher-only notes, and raw answer/storage metadata.

### Sprint 24D: Security Closeout

Goal:

- Verify that Student Exams writes and Student Grades detail enrichment satisfy Student App ownership, tenancy, and no-leak requirements end to end.

Allowed files/areas:

- `test/security/**/*student*exam*`
- `test/security/**/*student*grade*`
- `test/security/**/*grades*`
- `test/e2e/**/*student*exam*`
- `test/e2e/**/*student*grade*`
- `src/modules/student-app/exams/tests/**`
- `src/modules/student-app/grades/tests/**`
- Docs closeout files under `docs/`
- Narrow runtime bug fixes only if tests expose a security defect

Forbidden files/areas:

- New feature scope unrelated to Student Exams solving or Student Grades detail
- Prisma schema/migrations unless a verified blocker appears and is separately approved
- Package/deployment/server config changes
- Notifications, XP, rewards, marketplace, finance, HR, wallet, billing, advanced analytics, or advanced pickup scope

Expected verification:

- Route inventory reflects the accepted Student App routes.
- Core `/grades/submissions/*` remains dashboard/core, not Student App frontend contract.
- No-leak tests cover read, start, save, submit, and enriched grade detail responses.
- Cross-school, cross-student, non-student, hidden assessment, score-only, submitted/corrected, invalid question, and invalid option cases are covered.

## 10. Sprint 24B Contract Proposal

The future Student Exam solving workflow should be implemented under Student App routes only.

### `POST /api/v1/student/exams/:assessmentId/start`

Expected behavior:

- Require an authenticated `UserType.STUDENT`.
- Resolve current `studentId`, `enrollmentId`, classroom, academic year, and term through `StudentAppAccessService`.
- Verify the assessment is visible to the current student through the same scope rules used by Student Exams read detail.
- Require `deliveryMode = QUESTION_BASED`.
- Reject unpublished, hidden, locked, wrong-term, wrong-classroom, wrong-school, and score-only assessments.
- Create or return the current student's own `IN_PROGRESS` submission.
- Do not accept `studentId` or `enrollmentId` from the request body.
- Return a Student App-safe submission state.

### `PUT /api/v1/student/exams/:assessmentId/submission/answers`

Expected behavior:

- Require authenticated current student ownership.
- Resolve or create the current student's own in-progress submission, depending on the final product decision for whether explicit `start` is mandatory.
- Save a bulk list of answers for questions belonging to the requested assessment.
- Reject questions from another assessment.
- Reject options from another question.
- Reject updates after submit or correction.
- Reject hidden/unpublished/score-only assessments.
- Return sanitized current submission state.

### `PATCH /api/v1/student/exams/:assessmentId/submission/answers/:questionId`

Expected behavior:

- Require authenticated current student ownership.
- Resolve the current student's own in-progress submission for the requested assessment.
- Save one answer for the requested question.
- Reject if the question does not belong to the assessment.
- Reject if any selected option does not belong to the question.
- Reject updates after submit or correction.
- Return sanitized answer or submission state.

### `POST /api/v1/student/exams/:assessmentId/submission/submit`

Expected behavior:

- Require authenticated current student ownership.
- Submit only the current student's own in-progress submission.
- Optionally accept final answers only if the product explicitly chooses submit-with-final-save behavior.
- Validate required questions according to existing domain rules.
- Reject cross-student, cross-school, cross-assessment, hidden, unpublished, locked, score-only, submitted, and corrected cases.
- Return a Student App-safe submitted state.

All four routes must:

- hide answer keys, correct answers, `isCorrect`, storage internals, tenant ids, reviewer/internal ids, teacher-only notes, and raw metadata;
- use safe errors that do not disclose cross-school or cross-student resource existence;
- use the existing GradeSubmission domain/repository logic only behind Student App ownership checks and app-facing presenters.

## 11. Sprint 24C Contract Proposal

Target route:

- `GET /api/v1/student/grades/assessments/:assessmentId`

Preserve backward compatibility:

- Do not remove existing `assessment`, `grade`, or `submission` fields.
- Do not rename existing fields.
- Add new fields only where safe and available.

Proposed safe enrichment:

| Field area | Proposed behavior |
| --- | --- |
| `assessment` | Keep current fields. Optional additive aliases such as `subjectName`, `earnedMarks`, or `totalMarks` require product confirmation because equivalent values already live under `subject`, `grade`, and `submission`. |
| `grade` | Keep current grade summary. |
| `gradeItem` | Optional additive alias for frontend naming alignment. If added, it should derive from the existing grade item summary and remain student-safe. |
| `submission` | Keep current summary fields. Add `answers` only for the current student's own submission. If no submission exists, return `submission: null` or an empty `answers` array only if this does not break the accepted contract. |
| `questions` | Add safe assessment questions for the requested assessment only. Include question id, type, prompt/body, points, required, sort order, and safe options if needed. Omit answer keys and correctness. |
| feedback | Expose only student-safe feedback already approved for Student App. Do not expose teacher-only notes, reviewer ids, or internal review metadata. |

Critical rule:

- Answers and answer feedback must be for the current authenticated student's own submission only. The route must never return another student's answers, even if the assessment id is valid and in the same school.

No-leak requirements:

- Do not expose `answerKey`, `correctAnswer`, `correctAnswers`, `isCorrect`, `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, `reviewedById`, storage object keys, buckets, signed URLs, raw storage metadata, raw answer metadata, or teacher-only notes.

## 12. Final Decision

| Question | Decision |
| --- | --- |
| Is Sprint 24B needed? | Yes. Student Exams write/start/save/submit routes are missing under Student App. |
| Is Sprint 24C needed? | Yes. Student Grades assessment detail exists but needs safe enrichment for answers/questions. |
| Is schema migration expected? | No. Existing grades assessment/question/option/submission/answer models appear sufficient. |
| Are package/deployment changes needed? | No. |
| Is direct frontend use of core `/grades/submissions/*` accepted? | No. It is a SECURITY_GAP for Student App use. |
| Are notifications/XP/rewards part of this sprint? | No, unless approved elsewhere in a future sprint. |

Final classification:

- Handoff file: PARTIAL as a contract handoff, because it correctly identifies real missing Student App write capability and a real Student Grades detail enrichment need, while Student Exams read detail is already COMPLETE.
- Student Exam write workflow: MISSING.
- Student Grades assessment detail enrichment: PARTIAL.
- Core Grades submission direct Student App use: SECURITY_GAP.
