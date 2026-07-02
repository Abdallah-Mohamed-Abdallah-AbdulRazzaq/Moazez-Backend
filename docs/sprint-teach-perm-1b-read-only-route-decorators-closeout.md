# TEACH-PERM-1B - Teacher App Read-only Route Decorators Closeout

## Sprint Name

TEACH-PERM-1B - Teacher App Read-only Route Decorators

## Baseline Commit

- Expected baseline: `79f04695 feat: seed teacher app permissions`
- Actual baseline/HEAD: `79f04695 feat: seed teacher app permissions`
- Baseline difference: none

## Files Changed

- `src/modules/teacher-app/home/controller/teacher-home.controller.ts`
- `src/modules/teacher-app/my-classes/controller/teacher-my-classes.controller.ts`
- `src/modules/teacher-app/classroom/controller/teacher-classroom.controller.ts`
- `src/modules/teacher-app/classroom/attendance/controller/teacher-classroom-attendance.controller.ts`
- `src/modules/teacher-app/classroom/grades/controller/teacher-classroom-grades.controller.ts`
- `src/modules/teacher-app/classroom/grades/controller/teacher-classroom-assignments.controller.ts`
- `src/modules/teacher-app/homeworks/controller/teacher-homeworks.controller.ts`
- `src/modules/teacher-app/tasks/controller/teacher-tasks.controller.ts`
- `src/modules/teacher-app/tasks/review/controller/teacher-task-review-queue.controller.ts`
- `src/modules/teacher-app/xp/controller/teacher-xp.controller.ts`
- `src/modules/teacher-app/messages/controller/teacher-messages.controller.ts`
- `src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts`
- `src/modules/teacher-app/announcements/controller/teacher-announcements.controller.ts`
- `src/modules/teacher-app/profile/controller/teacher-profile.controller.ts`
- `src/modules/teacher-app/settings/controller/teacher-settings.controller.ts`
- `src/modules/teacher-app/schedule/controller/teacher-schedule.controller.ts`
- `src/modules/teacher-app/calendar/controller/teacher-calendar.controller.ts`
- `src/modules/teacher-app/lesson-preparation/controller/teacher-lesson-preparation.controller.ts`
- `test/security/tenancy.teacher-app.spec.ts`
- `docs/sprint-teach-perm-1b-read-only-route-decorators-closeout.md`

No seed, schema, migration, package, env, guard, decorator, auth, files module, DTO, presenter, or ownership/business-logic files were changed.

## Handler Counts

- Read-only decorated handler count: 63
- Deferred action/write handler count: 48
- Total Teacher App handler count: 111

## Exact Read-only Permission Matrix Summary

- Home/classes/classroom: 5 handlers decorated with `teacher.home.view`, `teacher.classes.view`, `teacher.classroom.view`, and `students.records.view`.
- Attendance reads: 3 handlers decorated with `attendance.sessions.view`.
- Grades/classroom assignment reads: 7 handlers decorated with `grades.assessments.view`, `grades.questions.view`, `grades.gradebook.view`, `grades.items.view`, and `grades.submissions.view`.
- Homeworks reads: 12 handlers decorated with `homework.assignments.view`, `homework.targets.view`, `homework.grade_sync.view`, `homework.questions.view`, `homework.attachments.view`, and `homework.submissions.view`.
- Tasks/review queue/XP reads: 10 handlers decorated with `reinforcement.tasks.view`, `reinforcement.reviews.view`, `reinforcement.xp.view`, and `students.records.view`.
- Messages reads: 9 handlers decorated with `communication.contacts.view`, `communication.conversations.view`, and `communication.messages.view`.
- Notifications reads: 4 handlers decorated with `communication.notifications.view` and `communication.notifications.preferences.manage`.
- Announcements reads: 2 handlers decorated with `communication.announcements.view`.
- Profile/settings reads: 4 handlers decorated with `teacher.profile.view` and `teacher.settings.view`.
- Schedule/calendar/lesson-preparation reads: 7 handlers decorated with `academics.timetable.view`, `academics.calendar.view`, `teacher.lesson_preparation.view`, `academics.lesson_plans.view`, and `academics.curriculum.view`.

## Deferred Action/Write Handlers

The following groups intentionally remain without new `@RequiredPermissions(...)` metadata for later Teacher permission sprints:

- Attendance resolve/update/submit handlers.
- Classroom submission review handlers in `TeacherClassroomSubmissionReviewController`.
- Homework create/update/publish/close/cancel/target resolve/question manage/option manage/attachment manage/submission review/grade-sync action handlers.
- Task create and review approve/reject handlers.
- Message create/send/read handlers.
- Notification read/archive/preferences/device-token action handlers.
- Announcement create/update/publish/archive handlers.
- Lesson-preparation status update handler.

## Forbidden Permission Checks

Static metadata coverage verifies no read-only Teacher App route uses:

- `files.downloads.view`
- `communication.announcements.manage`
- `communication.messages.attachments.manage`
- Broad communication manage/edit/delete/participants/report permissions
- Student self-service homework permissions
- `behavior.*`
- `reinforcement.hero.*`
- `reinforcement.rewards.*`

## Static Metadata Test Result

`test/security/tenancy.teacher-app.spec.ts` now includes static metadata assertions that:

- Verify all 63 read-only handlers have exact expected `@RequiredPermissions(...)` metadata.
- Verify all 48 deferred action/write handlers still have no permission metadata.
- Discover Teacher App controller route handlers through Nest route method metadata and assert the audited total remains 111.
- Assert no read-only route metadata uses forbidden permission codes or forbidden permission prefixes.

Result: passed in the focused Teacher security suite.

## Missing-permission HTTP Test Result

`test/security/tenancy.teacher-app.spec.ts` now includes representative missing-permission HTTP coverage for each required read-only permission family. The test creates temporary school-scoped Teacher roles that intentionally omit one required permission at a time, swaps the Teacher membership role, and verifies representative routes return `403` with `auth.scope.missing`.

Covered families:

- `teacher.home.view`
- `teacher.classes.view`
- `teacher.classroom.view`
- `students.records.view`
- `attendance.sessions.view`
- `grades.assessments.view`
- `grades.questions.view`
- `grades.gradebook.view`
- `grades.items.view`
- `grades.submissions.view`
- `homework.assignments.view`
- `homework.targets.view`
- `homework.grade_sync.view`
- `homework.questions.view`
- `homework.attachments.view`
- `homework.submissions.view`
- `reinforcement.tasks.view`
- `reinforcement.reviews.view`
- `reinforcement.xp.view`
- `communication.contacts.view`
- `communication.conversations.view`
- `communication.messages.view`
- `communication.notifications.view`
- `communication.notifications.preferences.manage`
- `communication.announcements.view`
- `teacher.profile.view`
- `teacher.settings.view`
- `academics.timetable.view`
- `academics.calendar.view`
- `teacher.lesson_preparation.view`
- `academics.lesson_plans.view`
- `academics.curriculum.view`

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

Teacher App message attachment download/preview routes are decorated with `communication.messages.view`. This sprint did not add `files.downloads.view` to any Teacher App route and did not modify the generic files module.

## Commands Run

Before edits:

- `git status --short --untracked-files=all` - passed, clean
- `git log --oneline -10` - passed, HEAD matched `79f04695 feat: seed teacher app permissions`
- `npx prisma validate` - passed

After edits:

- `npx prisma validate` - passed
- `npm run build` - first run timed out at 120s without output; rerun with a 300s timeout passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts` - passed, 49 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts` - passed, 7 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` - passed, 30 tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` - passed, 33 tests

## Optional Tests Run or Skipped

- Ran optional `test/security/tenancy.parent-app.spec.ts`: passed.
- Ran optional `test/security/tenancy.student-app.spec.ts`: passed.
- Did not run stale optional `test/e2e/teacher-app-final-closeout.e2e-spec.ts`; it is intentionally left for `TEACH-PERM-1F`.

## Known Stale Teacher Final Closeout E2E Status

`test/e2e/teacher-app-final-closeout.e2e-spec.ts` is known stale from the sprint brief and was not modified or used as a gate for TEACH-PERM-1B.

## Final Verdict

READY FOR REVIEW
