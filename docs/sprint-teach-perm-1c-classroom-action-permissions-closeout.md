# TEACH-PERM-1C - Teacher Classroom Action Permissions Closeout

## Sprint Name

TEACH-PERM-1C - Teacher Classroom Action Permissions

## Baseline Commit

- Expected baseline: `2fb07f19 feat: enforce teacher app read permissions`
- Actual baseline/HEAD: `2fb07f19 feat: enforce teacher app read permissions`
- Baseline difference: none

## Files Changed

- `src/modules/teacher-app/classroom/attendance/controller/teacher-classroom-attendance.controller.ts`
- `src/modules/teacher-app/classroom/grades/controller/teacher-classroom-submission-review.controller.ts`
- `src/modules/teacher-app/tasks/controller/teacher-tasks.controller.ts`
- `src/modules/teacher-app/tasks/review/controller/teacher-task-review-queue.controller.ts`
- `src/modules/teacher-app/lesson-preparation/controller/teacher-lesson-preparation.controller.ts`
- `test/security/tenancy.teacher-app.spec.ts`
- `docs/sprint-teach-perm-1c-classroom-action-permissions-closeout.md`

No seed, schema, migration, package, env, common guard/decorator, auth, files, homework, communication, notifications, announcements, DTO, presenter, ownership, or business-logic files were changed.

## Handler Counts

- New 1C action/write decorated handler count: 11
- Read-only handler count preserved from 1B: 63
- Total decorated handler count after 1C: 74
- Remaining deferred handler count: 37

## Exact 1C Permission Matrix Summary

- `TeacherClassroomAttendanceController.resolveSession`: `attendance.sessions.manage`
- `TeacherClassroomAttendanceController.updateEntries`: `attendance.entries.manage`
- `TeacherClassroomAttendanceController.submitSession`: `attendance.sessions.submit`
- `TeacherClassroomSubmissionReviewController.reviewAnswer`: `grades.submissions.review`
- `TeacherClassroomSubmissionReviewController.bulkReviewAnswers`: `grades.submissions.review`
- `TeacherClassroomSubmissionReviewController.finalizeReview`: `grades.submissions.review`
- `TeacherClassroomSubmissionReviewController.syncGradeItem`: `grades.items.manage`
- `TeacherTasksController.createTask`: `reinforcement.tasks.manage`
- `TeacherTaskReviewQueueController.approveReviewSubmission`: `reinforcement.reviews.manage`
- `TeacherTaskReviewQueueController.rejectReviewSubmission`: `reinforcement.reviews.manage`
- `TeacherLessonPreparationController.updateStatus`: `teacher.lesson_preparation.status.manage`

## Remaining Deferred Handlers

The 37 remaining action/write handlers are intentionally deferred:

- 24 Teacher homework action/write handlers for TEACH-PERM-1D.
- 13 message, notification, and announcement action/write handlers for TEACH-PERM-1E.

## Forbidden Permission Checks

Static metadata coverage verifies no decorated Teacher App route uses:

- `files.downloads.view`
- `communication.announcements.manage`
- `communication.messages.attachments.manage`
- `communication.conversations.manage`
- `communication.participants.manage`
- `communication.messages.edit`
- `communication.messages.delete`
- `communication.messages.report`
- `behavior.*`
- `reinforcement.hero.*`
- `reinforcement.rewards.*`
- `grades.assessments.manage`
- `grades.questions.manage`
- `grades.analytics.view`
- `grades.snapshots.view`
- `academics.lesson_plans.manage`
- Student self-service homework permissions

## Static Metadata Test Result

`test/security/tenancy.teacher-app.spec.ts` now verifies:

- Teacher App total audited handlers remains 111.
- TEACH-PERM-1B read-only decorated handlers remain 63 with exact metadata.
- TEACH-PERM-1C action/write decorated handlers are exactly 11 with exact metadata.
- Total decorated handlers after 1C is 74.
- Remaining deferred action/write handlers are exactly 37 with no permission metadata.
- Decorated Teacher App routes do not use forbidden permission codes or forbidden prefixes.

Result: passed in the focused Teacher security suite.

## Missing-permission HTTP Test Result

`test/security/tenancy.teacher-app.spec.ts` now includes representative 1C missing-permission HTTP coverage. The test creates temporary school-scoped Teacher roles missing one required permission at a time and verifies `403 auth.scope.missing`.

Covered 1C permission families:

- `attendance.sessions.manage`
- `attendance.entries.manage`
- `attendance.sessions.submit`
- `grades.submissions.review`
- `grades.items.manage`
- `reinforcement.tasks.manage`
- `reinforcement.reviews.manage`
- `teacher.lesson_preparation.status.manage`

Result: passed in the focused Teacher security suite.

## Ownership/No-leak Regression Result

Existing Teacher App security tests still pass, preserving:

- Teacher ownership through `TeacherSubjectAllocation.id` as the Teacher App `classId`.
- Cross-school and non-owned resource hiding.
- Non-teacher actor rejection.
- Student/Parent actor rejection on Teacher App routes.
- Existing response no-leak assertions.
- Teacher App message attachment download/preview visibility checks.

Result: passed in the focused Teacher security suite.

## Generic Files Boundary Result

This sprint did not add `files.downloads.view` to any Teacher App route and did not modify the generic files module. Message attachment download/preview behavior remains on the Teacher App visibility path from TEACH-PERM-1B.

## Commands Run

Before edits:

- `git status --short --untracked-files=all` - passed, clean
- `git log --oneline -10` - passed, HEAD matched `2fb07f19 feat: enforce teacher app read permissions`
- `npx prisma validate` - passed

After edits:

- `npx prisma validate` - passed
- `npm run build` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts` - passed, 51 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts` - passed, 7 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` - passed, 30 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` - passed, 33 tests

## Optional Tests Run or Skipped

- Ran optional `test/security/tenancy.parent-app.spec.ts`: passed.
- Ran optional `test/security/tenancy.student-app.spec.ts`: passed.
- Did not run stale optional `test/e2e/teacher-app-final-closeout.e2e-spec.ts`; it is intentionally left for TEACH-PERM-1F.

## Known Stale Teacher Final Closeout E2E Status

`test/e2e/teacher-app-final-closeout.e2e-spec.ts` is known stale from the sprint brief and was not modified or used as a gate for TEACH-PERM-1C.

## Final Verdict

READY FOR REVIEW
