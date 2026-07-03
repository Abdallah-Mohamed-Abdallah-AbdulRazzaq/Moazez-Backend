# TEACH-PERM-1E - Teacher Communication / Notifications / Announcements Action Permissions Closeout

## Sprint Name

TEACH-PERM-1E - Teacher Communication / Notifications / Announcements Action Permissions

## Baseline Commit

Expected and actual baseline matched:

```text
9d4316f6 feat: enforce teacher homework action permissions
```

Initial working tree was clean.

## Files Changed

```text
src/modules/teacher-app/messages/controller/teacher-messages.controller.ts
src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts
src/modules/teacher-app/announcements/controller/teacher-announcements.controller.ts
test/security/tenancy.teacher-app.spec.ts
docs/sprint-teach-perm-1e-communication-notifications-announcements-action-permissions-closeout.md
```

No seed, schema, migration, package, environment, common guard/decorator, files, IAM, homework, classroom, task, DTO, presenter, ownership, business-logic, or route-path changes were made.

## New 1E Communication/Notification/Announcement Action/Write Decorated Handler Count

```text
13
```

The current controllers contain the audited 13-handler set:

```text
3 Teacher message actions
6 Teacher notification actions
4 Teacher announcement actions
```

## Read-only Handler Count Preserved From 1B

```text
63
```

## 1C Classroom/Action Handler Count Preserved

```text
11
```

## 1D Homework Action/Write Handler Count Preserved

```text
24
```

## Total Decorated Handler Count After 1E

```text
111
```

## Remaining Deferred Handler Count

```text
0
```

## Exact 1E Permission Matrix Summary

```text
TeacherMessagesController.createConversation: communication.conversations.create
TeacherMessagesController.sendMessage: communication.messages.send
TeacherMessagesController.markRead: communication.conversations.read
TeacherNotificationsController.markAllRead: communication.notifications.read
TeacherNotificationsController.updatePreferences: communication.notifications.preferences.manage
TeacherNotificationsController.registerDeviceToken: app.device_tokens.manage
TeacherNotificationsController.unregisterCurrentDeviceToken: app.device_tokens.manage
TeacherNotificationsController.markRead: communication.notifications.read
TeacherNotificationsController.archive: communication.notifications.archive
TeacherAnnouncementsController.createAnnouncement: teacher.announcements.manage
TeacherAnnouncementsController.updateAnnouncement: teacher.announcements.manage
TeacherAnnouncementsController.publishAnnouncement: teacher.announcements.manage
TeacherAnnouncementsController.archiveAnnouncement: teacher.announcements.manage
```

## Forbidden Permission Checks

Static metadata coverage verifies no decorated Teacher App route uses:

```text
files.downloads.view
communication.announcements.manage
communication.messages.attachments.manage
communication.conversations.manage
communication.participants.manage
communication.messages.edit
communication.messages.delete
communication.messages.report
communication.messages.moderate
communication.conversations.moderate
communication.admin.view
communication.admin.manage
communication.platform.view
communication.platform.manage
communication.notifications.manage
behavior.*
reinforcement.hero.*
reinforcement.rewards.*
grades.assessments.manage
grades.questions.manage
grades.analytics.view
grades.snapshots.view
academics.lesson_plans.manage
homework.submissions.save
homework.submissions.submit
homework.answers.manage
homework.submission_attachments.manage
```

Teacher App announcement management uses the narrow `teacher.announcements.manage`, not `communication.announcements.manage`.

## Static Metadata Test Result

Passed in:

```powershell
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests: 55 passed, 55 total
```

Static assertions verify:

```text
Teacher App total audited handlers: 111
1B read-only decorated handlers: 63
1C classroom/action decorated handlers: 11
1D homework action/write decorated handlers: 24
1E communication/notification/announcement action/write decorated handlers: 13
Total decorated handlers after 1E: 111
Remaining deferred handlers: 0
No Teacher App route handler remains undecorated
```

## Missing-permission HTTP Test Result

Passed in `test/security/tenancy.teacher-app.spec.ts`.

Representative 403 `auth.scope.missing` coverage includes:

```text
communication.conversations.create
communication.messages.send
communication.conversations.read
communication.notifications.read
communication.notifications.preferences.manage
app.device_tokens.manage
communication.notifications.archive
teacher.announcements.manage
```

## Ownership/No-leak Regression Result

Existing Teacher App security suite passed, preserving:

```text
TeacherSubjectAllocation.id as Teacher App classId
owned allocation checks
cross-school and non-owned resource hiding
non-teacher actor rejection
student/parent actor rejection on Teacher App routes
Teacher response no-leak assertions
Teacher homework ownership checks
Teacher message conversation visibility checks
Teacher announcement visibility checks
Teacher notification ownership/recipient checks
```

Baseline tenancy regression also passed.

## Generic Files Boundary Result

Preserved.

```text
files.downloads.view was not used.
communication.messages.attachments.manage was not used.
src/modules/files/** was not modified.
Message attachment download/preview routes remain guarded by communication.messages.view.
No raw signed URL, bucket, objectKey, provider, or storage-path behavior was changed.
```

## Commands Run

Pre-edit:

```powershell
git status --short --untracked-files=all
git log --oneline -10
npx prisma validate
```

Results:

```text
git status: clean
git log top: 9d4316f6 feat: enforce teacher homework action permissions
npx prisma validate: passed
```

Post-edit:

```powershell
npx prisma validate
npm run build
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts
```

Results:

```text
npx prisma validate: passed
npm run build: passed
test/security/tenancy.teacher-app.spec.ts: passed, 55 tests
test/security/tenancy.spec.ts: passed, 7 tests
```

## Optional Tests Run Or Skipped

Run and passed:

```powershell
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
```

Results:

```text
test/security/tenancy.parent-app.spec.ts: passed, 30 tests
test/security/tenancy.student-app.spec.ts: passed, 33 tests
```

## Known Stale Teacher Final Closeout E2E Status

Not run and not modified:

```text
test/e2e/teacher-app-final-closeout.e2e-spec.ts
```

It remains reserved for TEACH-PERM-1F.

## Final Verdict

```text
READY FOR REVIEW
```
