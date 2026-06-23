# Sprint HW-B Dashboard Homework Submissions Review Surface Closeout

## Baseline

- Baseline commit: `d04b871`
- Baseline message: `fix: support question-based grade assessment contracts`

## Problem Summary

Dashboard/Core homework content review routes existed for submission answers and attachments, but dashboard users had no Core route to list assignment submissions, obtain `HomeworkSubmission.id`, inspect a single submission, or review the whole submission.

Existing content routes remained registered:

- `GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/answers`
- `GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/answers/:answerId`
- `PATCH /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/answers/:answerId/review`
- `PUT /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/answers/review`
- `GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/attachments`

## Confirmed Root Cause

The Core Homework module exported the review use-cases, and Teacher App already wrapped them, but Homework/Core did not register a dashboard submissions controller for list/detail/full-submission review. Dashboard clients therefore could not discover `HomeworkSubmission.id` without using app-facing Student or Teacher routes.

## Routes Added

- `GET /api/v1/homework/assignments/:homeworkId/submissions`
- `GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId`
- `POST /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/review`
- `PATCH /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/review`

## Routes Still Deferred

- `GET /api/v1/homework/submissions`
- `POST /api/v1/homework/submissions`
- `POST /api/v1/homework/assignments/:homeworkId/submissions`
- Parent submission mutation routes
- Student submission history route
- Proof/upload/file routes outside the existing attachment contracts
- Homework-specific XP/reward/notification routes
- Teacher `sync-grade-item` alias

## Files Changed

- `src/modules/homework/application/homework-submission-review-surface.use-cases.ts`
- `src/modules/homework/controller/homework-submissions.controller.ts`
- `src/modules/homework/dto/homework-submission.dto.ts`
- `src/modules/homework/dto/homework-submission-response.dto.ts`
- `src/modules/homework/presenters/homework-submission.presenter.ts`
- `src/modules/homework/homework.module.ts`
- `src/modules/homework/tests/homework-submissions.use-case.spec.ts`
- `test/e2e/homework-final-closeout.e2e-spec.ts`
- `test/e2e/homework-submissions-final-closeout.e2e-spec.ts`
- `test/security/tenancy.homework.spec.ts`
- `docs/sprint-hw-b-dashboard-homework-submissions-review-surface-closeout.md`

## Schema and Package Status

- No Prisma schema changes.
- No migration added.
- No package or lockfile changes.
- `npx prisma generate` may refresh generated Prisma client files under ignored/generated output only; no generated files are expected in the git diff.

## DTO, Presenter, and Use-Case Structure

- Added Core Homework request DTOs:
  - `ListHomeworkSubmissionsQueryDto`
  - `HomeworkSubmissionReviewDto`
- Added Core Homework response DTOs:
  - `HomeworkSubmissionDto`
  - `HomeworkSubmissionStudentDto`
  - `HomeworkSubmissionsPaginationDto`
  - `HomeworkSubmissionsListResponseDto`
  - `HomeworkSubmissionResponseDto`
- Added `HomeworkSubmissionPresenter` to convert `HomeworkReviewSubmissionRecord` and `ListHomeworkReviewSubmissionsResult` into dashboard-safe response bodies.
- Added wrapper use-cases:
  - `ListHomeworkAssignmentSubmissionsUseCase`
  - `GetHomeworkAssignmentSubmissionUseCase`
  - `ReviewHomeworkAssignmentSubmissionUseCase`

The wrappers reuse existing Core Homework review use-cases and do not duplicate repository or review business logic.

## Permission Policy

- List submissions: `homework.submissions.view`
- Get submission detail: `homework.submissions.view`
- Review submission by `POST`: `homework.assignments.manage`
- Review submission by `PATCH`: `homework.assignments.manage`

`reviewedByUserId` is taken from `requireHomeworkScope().actorId`; it is not accepted from the request body.

## Response and No-Leak Policy

The new submission list/detail/review presenter returns:

- submission id
- homework id
- target id
- student id/display name/student number
- lower-case status
- body text
- submitted/reviewed timestamps
- review note
- awarded/total marks
- late flag
- created/updated timestamps

It does not return tenant, actor, storage, question-answer internals, answer keys, correctness flags, deleted state, or raw metadata.

## Status Filter Policy

`GET /submissions` accepts:

- `submitted` -> `SUBMITTED`
- `late` -> `LATE`
- `reviewed` -> `REVIEWED`
- `pending_review` -> `SUBMITTED`, `LATE`

No status filter uses the existing review-visible default of submitted, late, and reviewed submissions.

## Tests Added or Updated

- Unit/controller coverage in `homework-submissions.use-case.spec.ts`:
  - dashboard list presentation and no-leak checks
  - status filter mapping
  - detail response and mismatched submission not found
  - review actor id from current homework scope
  - controller permission metadata
  - POST/PATCH review alias equivalence
- Route inventory in `homework-final-closeout.e2e-spec.ts`
- Dashboard submission review e2e flow in `homework-submissions-final-closeout.e2e-spec.ts`
- Security coverage in `tenancy.homework.spec.ts`:
  - missing `homework.submissions.view` blocks list/detail
  - missing `homework.assignments.manage` blocks review
  - dashboard list/detail/review no-leak checks
  - mismatched submission/homework rejected
  - cross-school submission list returns no rows

## Verification Results

- PASS: `git status --short --untracked-files=all`
- PASS: `git diff --name-only`
- PASS: `git diff --stat`
- PASS: `git diff --check`
- PASS: `npx prisma validate`
- PASS: `npx prisma generate`
- PASS: `npm run build`
- PASS: `npm run test -- homework-submissions --runInBand`
- PASS: `npm run test -- homework-answers --runInBand`
- FAIL: `npm run test -- homework-submission-attachments --runInBand`
  - Reason: no matching spec file exists in this checkout.
  - Fallback PASS: `npm run test -- homework-answers-attachments --runInBand`
- PASS: `npm run test -- homework --runInBand`
- PASS: `npm run test -- teacher-app --runInBand`
- PASS: `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/homework-final-closeout.e2e-spec.ts`
- FAIL: `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/homework-question-submission-grade-sync.e2e-spec.ts`
  - Reason: `test/e2e/homework-question-submission-grade-sync.e2e-spec.ts` does not exist in this checkout.
  - Fallback PASS: `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/homework-submissions-final-closeout.e2e-spec.ts`
- PASS: `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/homework-submissions-final-closeout.e2e-spec.ts`
- PASS: `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.homework.spec.ts test/security/tenancy.homework-questions-attachments.spec.ts`
- PASS: `npm run test:security -- --runInBand`

Initial `npm run build` timed out at 120 seconds while `nest build` was still running. The build process exited afterward, and the rerun with a 300 second timeout passed.

## Final Verdict

`DASHBOARD_HOMEWORK_SUBMISSIONS_REVIEW_SURFACE_COMPLETE`
