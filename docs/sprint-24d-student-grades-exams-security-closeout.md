# Sprint 24D - Student Grades / Exams Security Closeout

## 1. Executive Decision

Decision: PASS.

The Student Grades / Exams gap family is safe to close for accepted V1 scope after Sprint 24A, Sprint 24B, Sprint 24C, and this Sprint 24D security closeout.

Closeout conclusion:

- Student Exams read routes are present and remain Student App-safe.
- Student Exams write routes are present under `/api/v1/student/exams/*` and are owned by the authenticated current student.
- Student Grades assessment detail enrichment is present under the existing route and remains backward-compatible.
- Core `/api/v1/grades/submissions/*` routes remain School Dashboard/Core routes and are not accepted as Student App frontend contracts.
- No schema, migration, package, deployment, CORS, PM2, Docker, README, Parent App, Teacher App, notification, XP, reward, export, or analytics change is required.

One narrow no-leak hardening was applied during closeout:

- `src/modules/student-app/exams/presenters/student-exams.presenter.ts` now strips raw metadata key names from Student Exam `answerJson` in addition to existing answer-key, correctness, URL, and storage key names.
- `src/modules/student-app/exams/tests/student-exams.presenter.spec.ts` now covers those metadata keys.

No follow-up sprint is required for the accepted Student Grades / Exams gap family. Future optional work is limited to product-approved integrations or analytics outside this closeout scope.

## 2. Scope Reviewed

Documents reviewed:

- `adr/Student-App/STUDENT_GRADES_EXAMS_BACKEND_GAPS.md`
- `docs/sprint-24a-student-grades-exams-gap-contract-audit.md`
- `SECURITY_MODEL.md`
- `API_CONTRACT_RULES.md`
- `TESTING_STRATEGY.md`
- `V1_SCOPE.md`
- `MODULES.md`
- Recent Sprint 24B/24C commits:
  - `f77a8bb feat: add student exam submission workflow`
  - `1928c00 feat: enrich student assessment grade detail`

Student App Exams code reviewed:

- `src/modules/student-app/exams/controller/student-exams.controller.ts`
- `src/modules/student-app/exams/dto/student-exams.dto.ts`
- `src/modules/student-app/exams/application/list-student-exams.use-case.ts`
- `src/modules/student-app/exams/application/get-student-exam.use-case.ts`
- `src/modules/student-app/exams/application/get-student-exam-submission.use-case.ts`
- `src/modules/student-app/exams/application/start-student-exam-submission.use-case.ts`
- `src/modules/student-app/exams/application/bulk-save-student-exam-answers.use-case.ts`
- `src/modules/student-app/exams/application/save-student-exam-answer.use-case.ts`
- `src/modules/student-app/exams/application/submit-student-exam-submission.use-case.ts`
- `src/modules/student-app/exams/application/student-exam-submission-use-case.helpers.ts`
- `src/modules/student-app/exams/infrastructure/student-exams-read.adapter.ts`
- `src/modules/student-app/exams/infrastructure/student-exams-submission-write.adapter.ts`
- `src/modules/student-app/exams/presenters/student-exams.presenter.ts`

Student App Grades code reviewed:

- `src/modules/student-app/grades/controller/student-grades.controller.ts`
- `src/modules/student-app/grades/application/get-student-assessment-grade.use-case.ts`
- `src/modules/student-app/grades/infrastructure/student-grades-read.adapter.ts`
- `src/modules/student-app/grades/presenters/student-grades.presenter.ts`
- `src/modules/student-app/grades/dto/student-grades.dto.ts`

Access and core Grades code reviewed:

- `src/modules/student-app/access/student-app-access.service.ts`
- `src/modules/grades/assessments/domain/grade-submission-domain.ts`
- `src/modules/grades/assessments/infrastructure/grades-submissions.repository.ts`
- `src/modules/grades/assessments/controller/grades-submissions.controller.ts`

Tests reviewed and used as closeout evidence:

- `src/modules/student-app/exams/tests/student-exams-read.adapter.spec.ts`
- `src/modules/student-app/exams/tests/student-exams.presenter.spec.ts`
- `src/modules/student-app/exams/tests/student-exams.use-case.spec.ts`
- `src/modules/student-app/exams/tests/student-exams-submission.use-case.spec.ts`
- `src/modules/student-app/exams/tests/student-exams-submission-write.adapter.spec.ts`
- `src/modules/student-app/grades/tests/student-grades-read.adapter.spec.ts`
- `src/modules/student-app/grades/tests/student-grades.presenter.spec.ts`
- `src/modules/student-app/grades/tests/student-grades.use-case.spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- Relevant core Grades submission tests under `src/modules/grades/assessments/tests/*submission*`
- Relevant core Grades tenancy tests in `test/security/tenancy.grades.spec.ts`

## 3. Route Inventory

All routes below are public paths after the global `/api/v1` prefix.

| Route | Exists? | Purpose | Student App contract? | Ownership model | Security classification |
| --- | --- | --- | --- | --- | --- |
| `GET /api/v1/student/exams` | Yes | List visible exam-like assessments for the current student. | Yes | `StudentAppAccessService` current student context; read adapter filters by current enrollment, allocated subjects, academic year, term, and assessment scope. | COMPLETE |
| `GET /api/v1/student/exams/:assessmentId` | Yes | Return safe exam detail with stages/questions/options. | Yes | Same Student App read ownership; submission summary is filtered by current `studentId` and `enrollmentId`. | COMPLETE |
| `GET /api/v1/student/exams/:assessmentId/submission` | Yes | Return current student's submission state or `submission: null`. | Yes | Same Student App read ownership; full submission is filtered by current `studentId` and `enrollmentId`. | COMPLETE |
| `POST /api/v1/student/exams/:assessmentId/start` | Yes | Create or return current student's own in-progress question-based submission. | Yes | `StudentAppAccessService`; visible assessment check; submission create uses server-side current `studentId` and `enrollmentId`. | COMPLETE |
| `PUT /api/v1/student/exams/:assessmentId/submission/answers` | Yes | Bulk-save answers for current student's own in-progress submission. | Yes | `StudentAppAccessService`; own submission lookup by assessment/current student/current enrollment; domain question/option validation. | COMPLETE |
| `PATCH /api/v1/student/exams/:assessmentId/submission/answers/:questionId` | Yes | Save one answer for current student's own in-progress submission. | Yes | `StudentAppAccessService`; own submission lookup by assessment/current student/current enrollment; route `questionId` validated against assessment. | COMPLETE |
| `POST /api/v1/student/exams/:assessmentId/submission/submit` | Yes | Submit current student's own in-progress submission. | Yes | `StudentAppAccessService`; own submission lookup by assessment/current student/current enrollment; required answer validation. | COMPLETE |
| `GET /api/v1/student/grades/assessments/:assessmentId` | Yes | Return current student's assessment grade detail with safe grade item alias, questions, and own answers. | Yes | `StudentAppAccessService`; read adapter filters visible assessment and own submission by current `studentId` and `enrollmentId`. | COMPLETE |
| `POST /api/v1/grades/assessments/:assessmentId/submissions/resolve` | Yes | Dashboard/Core resolve or create grade submission for request-supplied student/enrollment. | No | Dashboard Grades permission model with `grades.submissions.submit`; not Student App ownership. | DASHBOARD_ONLY |
| `PUT /api/v1/grades/submissions/:submissionId/answers/:questionId` | Yes | Dashboard/Core save one submission answer by `submissionId`. | No | Dashboard Grades permission model with `grades.submissions.submit`; not Student App ownership. | DASHBOARD_ONLY |
| `PUT /api/v1/grades/submissions/:submissionId/answers` | Yes | Dashboard/Core bulk-save answers by `submissionId`. | No | Dashboard Grades permission model with `grades.submissions.submit`; not Student App ownership. | DASHBOARD_ONLY |
| `POST /api/v1/grades/submissions/:submissionId/submit` | Yes | Dashboard/Core submit by `submissionId`. | No | Dashboard Grades permission model with `grades.submissions.submit`; not Student App ownership. | DASHBOARD_ONLY |

## 4. Student Exams Write Workflow Security Verdict

Verdict: PASS.

| Requirement | Evidence | Result |
| --- | --- | --- |
| Current student only | All write use-cases call `StudentAppAccessService.getCurrentStudentWithEnrollment()` before invoking the write adapter. | PASS |
| `StudentAppAccessService` is used | `start`, bulk save, single save, and submit use-cases all depend on `StudentAppAccessService`. | PASS |
| Client cannot send `studentId` | Student Exam write DTOs have no `studentId`; controller receives `assessmentId`, optional `questionId`, and answer payload only. | PASS |
| Client cannot send `enrollmentId` | Student Exam write DTOs have no `enrollmentId`; write adapter uses `context.enrollmentId`. | PASS |
| Client cannot send `submissionId` for mutation | Student Exam write routes are assessment-scoped and do not accept `submissionId`. | PASS |
| Assessment visibility is verified | `StudentExamsSubmissionWriteAdapter.findVisibleSubmissionAssessmentOrThrow` uses current enrollment, allocated subjects, academic year, term, approval status, and scope checks before mutation. | PASS |
| Own submission resolved by current student/enrollment | Mutable submission lookup uses `assessmentId`, current `studentId`, and current `enrollmentId`; existing start submission is rejected if it belongs to another enrollment. | PASS |
| Score-only assessments rejected | Write adapter calls `assertSubmissionAssessmentAcceptsDrafts`, which requires `QUESTION_BASED`; unit tests cover `SCORE_ONLY` rejection. | PASS |
| Hidden/unpublished/wrong-scope rejected | Visible assessment lookup returns safe not-found before repository mutation; e2e/security tests cover same-school wrong-classroom and cross-school IDs. | PASS |
| Submitted/corrected mutation blocked | `assertSubmissionMutable` allows only `IN_PROGRESS`; tests cover submitted mutation blocking. | PASS |
| Invalid question rejected | Core helper/domain validation rejects a question from another assessment; write adapter tests cover this. | PASS |
| Invalid option rejected | Core helper/domain validation rejects selected options from another question; write adapter tests cover this. | PASS |
| No answer keys/correct answers/`isCorrect`/storage internals leak | Student Exams presenter sanitizes answer JSON recursively and safe-selects options without `isCorrect`; closeout added metadata-key no-leak coverage. | PASS |

The Student Exams write workflow is accepted as the Student App exam-solving contract. It may reuse core GradeSubmission domain/repository logic only behind the Student App ownership adapter; it does not expose core dashboard GradeSubmission DTOs.

## 5. Student Grades Assessment Detail Security Verdict

Verdict: PASS.

| Requirement | Evidence | Result |
| --- | --- | --- |
| Backward-compatible route | Existing `GET /api/v1/student/grades/assessments/:assessmentId` remains the only route; existing `assessment`, `grade`, and `submission` fields are preserved. | PASS |
| Only current student's own answers returned | `StudentGradesReadAdapter.findAssessmentGrade` filters submission by `assessment.id`, current `studentId`, and current `enrollmentId`. | PASS |
| Another student's answers not returned | `test/e2e/student-app-final-closeout.e2e-spec.ts` and `test/security/tenancy.student-app.spec.ts` seed another same-assessment submission and assert hidden answer strings are absent. | PASS |
| Questions are safe | Detail adapter selects question id/type/prompt/points/required/sort order and safe option labels/values only; adapter tests assert no `answerKey`, metadata, `isCorrect`, tenant, or soft-delete fields are selected. | PASS |
| `answerJson` recursively sanitized | `StudentGradesPresenter.sanitizeAnswerJson` strips answer keys, correct answers, correctness flags, storage keys/URLs, and raw metadata recursively. | PASS |
| Score-only returns no solving data | Presenter returns `questions: []` and `submission.answers: []` for non-question-based assessments; presenter tests cover this. | PASS |
| No `answerKey`/`correctAnswer`/`correctAnswers`/`isCorrect` leak | Presenter/use-case/e2e/security tests assert these strings are absent. | PASS |
| No tenant/internal ID leak | App-facing presenter does not emit `schoolId`, `organizationId`, `membershipId`, `roleId`, or `deletedAt`; e2e/security no-leak helpers assert absence. | PASS |
| No storage internals leak | Presenter strips `objectKey`, `bucket`, `signedUrl`, `directUrl`, `fileUrl`, `storageKey`, storage metadata, and raw metadata; tests assert absence. | PASS |
| No `reviewedById` or teacher-only notes leak | Adapter does not select `reviewedById`; presenter exposes only reviewer comments as student-visible feedback fields already accepted by Student App submission conventions. | PASS |

Reviewer comments are treated as student-visible feedback, not teacher-only notes. No reviewer id or internal reviewer metadata is emitted.

## 6. Core Grades Routes Decision

Decision: direct Student App use of core `/grades/submissions/*` routes remains rejected.

Core Grades submission routes remain School Dashboard/Core routes because:

- Controllers are under `@Controller('grades')`.
- Routes are guarded with `@RequiredPermissions('grades.submissions.*')`.
- Resolve accepts request-supplied `studentId` and optional `enrollmentId`.
- Save/bulk-save/submit mutate by `submissionId`.
- Use-cases rely on Grades context and repository/domain rules, not `StudentAppAccessService`.
- Core response DTOs are dashboard/core shapes, not Student App-safe presenters.

Frontend contract decisions:

- Student App exam solving must use `/api/v1/student/exams/:assessmentId/start`.
- Student App exam answer save must use `/api/v1/student/exams/:assessmentId/submission/answers` and `/api/v1/student/exams/:assessmentId/submission/answers/:questionId`.
- Student App exam submit must use `/api/v1/student/exams/:assessmentId/submission/submit`.
- Student App grade detail must use `/api/v1/student/grades/assessments/:assessmentId`.
- Direct Student App frontend calls to `/api/v1/grades/assessments/:assessmentId/submissions/resolve` or `/api/v1/grades/submissions/*` are not accepted.

## 7. Test Evidence Matrix

| Risk | Evidence | Result |
| --- | --- | --- |
| Cross-school | `test/security/tenancy.student-app.spec.ts` hides tenant B grade/exam IDs; `test/security/tenancy.grades.spec.ts` covers core grades cross-school submission routes. | Covered |
| Cross-student | Student Grades detail e2e/security tests seed another same-assessment submission and assert it is absent; write adapter rejects existing submission from another enrollment. | Covered |
| Non-student actor | Student Exams and Student Grades use-case tests reject non-student actors through `StudentAppAccessService`; e2e/security tests assert admin/teacher/parent actors receive 403 on Student App routes. | Covered |
| Parent actor | `test/security/tenancy.student-app.spec.ts` includes parent actor in non-student route rejection loop. | Covered |
| Teacher/admin actor | `test/security/tenancy.student-app.spec.ts` and `test/e2e/student-app-final-closeout.e2e-spec.ts` include teacher/admin actor rejection loops. | Covered |
| Hidden/wrong-scope assessment | Student Exam write adapter hides invisible assessments; e2e/security tests assert same-school other-classroom and cross-school exam/grade IDs return 404. | Covered |
| Score-only assessment | Student Exam write adapter test rejects score-only start; Student Grades presenter test returns no solving data for score-only detail. | Covered |
| No start before save/submit | Student Exam write adapter test requires start before save; e2e/security non-student/wrong-scope flows cover submit not resolving unsafe submissions. | Covered |
| Submitted mutation | Student Exam write adapter test blocks submitted mutation with `grades.submission.already_submitted`; core grades tests cover submitted mutation blocking. | Covered |
| Invalid question | Student Exam write adapter rejects question from another assessment; core grades security tests reject school B question use. | Covered |
| Invalid option | Student Exam write adapter rejects option from another question; core grades security tests reject school B option use. | Covered |
| No answer key leak | Student Exams presenter/use-case/read adapter tests, Student Grades presenter/use-case/read adapter tests, e2e final closeout, and security tenancy tests assert absence. | Covered |
| No correctness leak | Same no-leak tests assert `isCorrect`, `correctAnswer`, and `correctAnswers` are absent. | Covered |
| No storage leak | Student Exams presenter no-leak test now strips storage and raw metadata keys; Student Grades presenter tests and e2e/security helpers assert storage internals are absent. | Covered |
| No tenant/internal ID leak | Student App e2e/security helpers assert no `schoolId`, `organizationId`, membership/role/session/token/storage internals, and app presenters omit reviewer ids. | Covered |

Current tests are sufficient after the narrow Student Exams answer JSON sanitizer hardening. No duplicate test file was added.

## 8. Remaining Risks / Deferred Items

No blocking security risks remain for accepted V1.

Non-blocking deferred items:

- Sprint 24C does not implement notifications, XP, rewards, exports, or advanced analytics.
- Advanced analytics builder remains out of V1 scope.
- No schema migration is expected or required.
- Reviewer comments exposed in Student Grades and Student Exams are treated as student-visible feedback only; reviewer ids and teacher-only notes remain hidden.
- Core dashboard GradeSubmission presenter/DTOs are intentionally broader than Student App DTOs and must not be used directly as Student App frontend contracts.

## 9. Final Acceptance Checklist

| Check | Result |
| --- | --- |
| Prisma validate passed | PASS - `npx prisma validate` |
| Prisma generate passed | PASS - `npx prisma generate` |
| Build passed | PASS - `npm run build` |
| `student-exams` tests passed | PASS - 5 suites, 29 tests |
| `student-grades` tests passed | PASS - 3 suites, 12 tests |
| `student-app` tests passed | PASS - 44 suites, 192 tests |
| `grades` tests passed | PASS - 32 suites, 248 tests |
| E2E final closeout passed | PASS - 1 suite, 17 tests |
| Security tenancy Student App passed | PASS - 1 suite, 21 tests |
| No schema/package/deployment changes | PASS - only Student Exams sanitizer/test and this closeout doc changed |
| No forbidden route exposure | PASS |

Final verification command results:

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS - final status shows one Student Exams presenter change, one Student Exams presenter spec change, and this untracked closeout doc. |
| `git diff --name-only` | PASS - tracked diff limited to `src/modules/student-app/exams/presenters/student-exams.presenter.ts` and `src/modules/student-app/exams/tests/student-exams.presenter.spec.ts`; untracked doc is not listed by Git diff. |
| `git diff --stat` | PASS - tracked diff was 2 files, 26 insertions; untracked doc is not listed by Git diff. |
| `git diff --check` | PASS - no whitespace errors; only Windows line-ending warnings. |
| `npx prisma validate` | PASS - schema is valid. |
| `npx prisma generate` | PASS - Prisma Client generated. |
| `npm run build` | PASS. |
| `npm test -- --runInBand student-exams` | PASS - 5 suites, 29 tests. |
| `npm test -- --runInBand student-grades` | PASS - 3 suites, 12 tests. |
| `npm test -- --runInBand student-app` | PASS - 44 suites, 192 tests. |
| `npm test -- --runInBand grades` | PASS - 32 suites, 248 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts` | PASS - 1 suite, 17 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` | PASS - 1 suite, 21 tests. |

## 10. Final Decision

Sprint 24D result: PASS.

The Student Grades / Exams gap family is closed for accepted V1 scope.

Deploy is allowed after the normal deployment checklist and environment-specific release gates.

No future required sprint is recommended. Optional future sprints may be opened only for explicitly approved product scope such as notifications, XP/rewards, exports, or advanced analytics; those are outside this closeout.
