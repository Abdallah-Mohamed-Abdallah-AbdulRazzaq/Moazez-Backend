# Sprint 23F — Homework Grades Assessments Security Closeout

## Status
- Result: PASS
- Baseline: `3750b9f docs: audit teacher app grades write decision`
- Runtime changes: None
- Test changes: Yes. Security tests were extended only.
- Schema changes: None
- Migration changes: None
- Package changes: None
- Generated/deployment/project-structure changes: None

## Executive Summary

Sprint 23F closes the Homework, Grades, and Assessments feature family security sweep for the accepted V1 scope.

The sprint added targeted security assertions over the existing implemented surfaces:

- Teacher App direct score-only GradeItem write routes remain absent after Sprint 23D skipped 23E.
- Student App grade summary enrichment from Sprint 23C is verified at the HTTP security boundary and remains no-leak.
- Parent App child grade summary enrichment from Sprint 23C is verified at the HTTP security boundary and remains no-leak.
- Parent App homework remains read-only; parent submit, answer, attachment, and file mutation paths remain unregistered for mutation methods.

No runtime security bug was found. No runtime code was changed.

Sprint 23H final closeout can proceed.

## Surfaces Covered

- School Dashboard Grades / Assessments
- Sprint 23B Grades Dashboard bootstrap and overview read models
- School Dashboard Homework Core
- Teacher App Homework
- Teacher App Classroom Grades
- Teacher App classroom submission review and GradeItem sync paths
- Student App Homework
- Student App Grades
- Parent App Homework
- Parent App Grades
- Sprint 23C Student/Parent grades summary enrichment
- Safe error/no-leak behavior across the relevant feature family

## School Dashboard Grades / Assessments Security Evidence

Evidence comes from `test/security/tenancy.grades.spec.ts` and module-local Grades tests.

Verified coverage includes:

- Auth and permission boundaries for Grades read/write routes.
- Cross-school assessment, question, option, submission, item, gradebook, analytics, rules, snapshot, bootstrap, and overview isolation.
- `GET /api/v1/grades/bootstrap` requires `grades.gradebook.view`.
- `GET /api/v1/grades/overview` requires `grades.analytics.view`.
- Bootstrap/overview responses exclude cross-school academic structures, subjects, assessments, students, and internal fields.
- Draft assessments are hidden from read models that should only expose visible assessment state.
- Locked approved assessments are readable in gradebook/analytics/overview contexts.
- Locked assessments block GradeItem writes, question mutation, submission review/finalization, and GradeItem sync.
- Closed/inactive terms block GradeItem mutation, review/finalization, sync, publish, and other protected writes.
- Score bounds and question-based-vs-score-only rules remain enforced.
- No direct answer key/correct answer/internal storage fields are exposed from dashboard-safe aggregate read models.

## Grades Bootstrap / Overview Security Evidence

Sprint 23B endpoints are covered by `test/security/tenancy.grades.spec.ts`.

Verified behavior:

- `/api/v1/grades/bootstrap` returns 401 unauthenticated.
- `/api/v1/grades/bootstrap` returns 403 without `grades.gradebook.view`.
- `/api/v1/grades/bootstrap` includes current-school academic years, terms, stages, grades, sections, classrooms, and subjects only.
- `/api/v1/grades/bootstrap` does not expose tenant/internal fields.
- `/api/v1/grades/overview` returns 401 unauthenticated.
- `/api/v1/grades/overview` returns 403 without `grades.analytics.view`.
- `/api/v1/grades/overview` safely rejects cross-school scope IDs.
- `/api/v1/grades/overview` does not include cross-school assessments, students, subjects, or internal fields.
- `/api/v1/grades/overview` handles visible published/approved/locked data as read-only aggregate data.

## Homework Core Security Evidence

Evidence comes from:

- `test/security/tenancy.homework.spec.ts`
- `test/security/tenancy.homework-questions-attachments.spec.ts`
- `test/security/tenancy.homework-answers-attachments.spec.ts`
- `test/security/tenancy.homework-answer-review.spec.ts`
- `test/security/tenancy.homework-grade-sync.spec.ts`

Verified coverage includes:

- Authentication and homework permission boundaries.
- Cross-school homework assignment read/mutation denial.
- Cross-school target resolution denial.
- Cross-school homework questions/options/attachments denial.
- Cross-school submissions, answers, answer review, submission attachments, and grade sync denial.
- Teacher, student, and parent app actors cannot use dashboard Homework core routes.
- Homework responses avoid tenant/internal/storage fields.
- Student submission ownership and reviewed/closed mutation boundaries.
- Grade sync link/sync-one/bulk-sync respects GradeAssessment compatibility, locked assessment protection, closed-term protection, active enrollment, and score bounds.

## Teacher App Homework Security Evidence

Evidence comes from `test/security/tenancy.homework.spec.ts`, homework-specific security specs, and Teacher App security tests.

Verified coverage includes:

- Only teacher actors can use Teacher App homework routes.
- Teachers can manage only owned classroom/subject/term allocations.
- Same-school unowned teacher homework and cross-school homework are safely denied.
- Teacher homework creation, lifecycle, questions, options, attachments, submissions, review, and grade sync remain allocation-scoped.
- Teacher homework responses do not expose tenant/internal/storage fields.
- Teacher homework grade sync cannot bypass locked/closed/grade-assessment protections.

## Teacher App Classroom Grades Security Evidence

Evidence comes from `test/security/tenancy.teacher-app.spec.ts`.

Verified coverage includes:

- Teacher classroom grade assessments list/detail are owned-allocation scoped.
- Teacher classroom gradebook is owned-allocation scoped.
- Same-school unowned class/subject/term access is safely denied.
- Cross-school class, assessment, submission, answer, and student boundaries are safely denied.
- Question-based submission review, bulk review, finalization, and sync are owned-allocation scoped.
- Teacher App grades/review responses avoid tenant IDs, answer keys, correct answers, `isCorrect`, storage metadata, and soft-delete fields.
- Teacher App direct score-only GradeItem write routes remain absent:
  - `PUT /api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/items/:studentId`
  - `PUT /api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/items`

## Student App Homework Security Evidence

Evidence comes from `test/security/tenancy.homework.spec.ts`.

Verified coverage includes:

- Only the authenticated current student can read and submit Student App homework.
- Students cannot access another student's same-school homework or cross-school homework.
- Student App shows only assigned visible homework.
- Student answer and attachment mutations are scoped to the current student's own submission.
- Student submit is blocked by existing lifecycle rules for hidden/unsafe assignment states.
- Student homework responses do not expose tenant IDs, answer keys/correct answers, teacher-only fields, storage internals, or soft-delete fields.

## Student App Grades Security Evidence

Evidence comes from `test/security/tenancy.student-app.spec.ts` and Student App Grades presenter tests.

Sprint 23F strengthened the HTTP security test to assert:

- Student grade summary includes enriched totals, counts, selected academic year/term, subject breakdown, and rating.
- Student grade summary does not leak tenant/internal fields, answer keys, correct answers, `isCorrect`, storage internals, or soft-delete fields.
- Student assessment grade detail applies the answer-key/correct-answer no-leak helper at the security boundary.

Existing coverage also verifies:

- Students read only their own grades.
- Draft/unpublished assessments are hidden.
- Other-classroom and cross-school assessments are hidden.

## Parent App Homework Security Evidence

Evidence comes from `test/security/tenancy.homework.spec.ts`.

Sprint 23F strengthened the parent read-only check:

- Parent homework submit, submission, answers, attachments, and file routes remain unregistered for `GET`, `POST`, `PUT`, `PATCH`, and `DELETE` probes where applicable.

Existing coverage also verifies:

- Parents can read only linked-child homework.
- Same-school unlinked child and cross-school child homework is safely denied.
- Parent App homework routes reject teacher, student, and school-admin actors.
- Parent homework responses avoid tenant/internal/storage fields.

## Parent App Grades Security Evidence

Evidence comes from `test/security/tenancy.parent-app.spec.ts` and Parent App Grades presenter tests.

Sprint 23F strengthened the HTTP security test to assert:

- Parent child grade summary includes enriched totals, counts, selected academic year/term, subject breakdown, rating, and motivational message.
- Parent child grade summary does not leak tenant/internal fields, answer keys, correct answers, `isCorrect`, storage internals, or soft-delete fields.

Existing coverage also verifies:

- Parent grade reads are linked-child scoped.
- Same-school unlinked and cross-school children are denied.
- Parent grades are read-only.
- Draft/unpublished assessments are hidden from parent assessment detail.

## Safe Error / No-Leak Evidence

The security suites verify the accepted safe-error convention:

- Cross-school and unowned resources return safe 404/403 responses according to existing app/module conventions.
- Forbidden app-boundary actors receive 403 before resource ownership is exposed.
- Cross-school dashboard/resource IDs are not serialized into safe not-found responses in the covered surfaces.
- App-facing responses do not leak tenant IDs, membership/role IDs, password/session fields, answer keys, correct answers, `isCorrect`, object storage keys, bucket names, or soft-delete metadata.

Teacher-facing review routes intentionally remain teacher-safe review surfaces. Student and Parent payloads continue to hide correctness and answer-key data.

## Fixes Applied

No runtime fixes were required.

Test hardening applied:

- Extended `test/security/tenancy.teacher-app.spec.ts` to assert Teacher App direct score-only GradeItem write routes remain absent.
- Extended `test/security/tenancy.student-app.spec.ts` to assert Sprint 23C enriched Student grade summary fields and no-leak behavior over HTTP.
- Extended `test/security/tenancy.parent-app.spec.ts` to assert Sprint 23C enriched Parent child grade summary fields and no-leak behavior over HTTP.
- Extended `test/security/tenancy.homework.spec.ts` to assert Parent App homework mutation routes remain absent across mutation methods.

## Accepted Non-Goals

- No Teacher App direct grade entry.
- No Sprint 23E implementation.
- No parent homework submit.
- No route renames.
- No ADR-only aliases.
- No notifications, XP, rewards, exports, or advanced analytics builder.
- No schema or migration changes.
- No package script changes.
- No generated/deployment/project-structure changes.

## Remaining Risks

No blocking security, tenancy, ownership, closed-term, locked-assessment, or no-leak risks remain for the accepted V1 scope.

Future product decisions would require new security work if they reopen:

- Teacher App direct grade entry.
- Parent homework submit.
- Notifications or XP side effects for homework/grades.
- Export or advanced analytics workflows.

## Verification Results

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | Shows four modified security specs and this untracked closeout doc. |
| `git diff --name-only` | Shows the four modified security specs; untracked doc is not included by Git diff. |
| `git diff --stat` | Shows 4 tracked files changed, 99 insertions, 3 deletions; untracked doc is not included by Git diff. |
| `git diff --check` | Passed; only Windows line-ending warnings were printed. |
| `npx prisma validate` | Passed; schema is valid. |
| `npx prisma generate` | Passed; Prisma Client generated under ignored dependency output. |
| `npx prisma migrate status` | Passed; 39 migrations found and database schema is up to date. |
| `npm run build` | Passed. |
| `npm run test -- grades --runInBand` | Passed; 32 suites, 247 tests. |
| `npm run test -- homework --runInBand` | Passed; 15 suites, 139 tests. |
| `npm run test -- teacher-app --runInBand` | Passed; 42 suites, 231 tests. |
| `npm run test -- student-app --runInBand` | Passed; 42 suites, 173 tests. |
| `npm run test -- parent-app --runInBand` | Passed; 39 suites, 148 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.grades.spec.ts` | Passed; 1 suite, 111 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.homework.spec.ts test/security/tenancy.homework-answer-review.spec.ts test/security/tenancy.homework-answers-attachments.spec.ts test/security/tenancy.homework-grade-sync.spec.ts test/security/tenancy.homework-questions-attachments.spec.ts` | Passed; 5 suites, 46 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts test/security/tenancy.student-app.spec.ts test/security/tenancy.parent-app.spec.ts` | Passed; 3 suites, 82 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand "test/security/homework*.spec.ts"` | No tests found. Exact pattern has 0 matches because homework security specs use the `tenancy.homework*.spec.ts` naming convention; nearest matching family above passed. |

## Final Decision

Sprint 23F Result: PASS.

Homework, Grades, and Assessments are security-closeout ready for accepted V1 scope. No runtime code was changed, no new product features were added, Teacher App direct grade writes remain absent, Parent App homework remains read-only, and the final Sprint 23H closeout audit can proceed.
