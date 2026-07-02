# TEACH-PERM-1D - Teacher Homework Action Permissions Closeout

## Sprint Name

TEACH-PERM-1D - Teacher Homework Action Permissions

## Baseline Commit

Expected and actual baseline matched:

```text
4a9703ba feat: enforce teacher classroom action permissions
```

Initial working tree was clean.

## Files Changed

```text
src/modules/teacher-app/homeworks/controller/teacher-homeworks.controller.ts
test/security/tenancy.teacher-app.spec.ts
docs/sprint-teach-perm-1d-homework-action-permissions-closeout.md
```

No seed, schema, migration, package, environment, common guard/decorator, files, IAM, communication, notification, announcement, DTO, presenter, ownership, or route-path changes were made.

## New 1D Homework Action/Write Decorated Handler Count

```text
24
```

The current controller contains 8 question/option action routes, matching the audited 24-handler target:

```text
5 assignment lifecycle
1 targets resolve
1 assignment grade sync
8 question/option actions
4 assignment attachment actions
4 submission review actions
1 submission grade sync
```

## Read-only Handler Count Preserved From 1B

```text
63
```

## 1C Classroom/Action Handler Count Preserved

```text
11
```

## Total Decorated Handler Count After 1D

```text
98
```

## Remaining Deferred Handler Count For 1E

```text
13
```

Deferred handlers are limited to Teacher App messages, notifications, and announcements action/write routes for TEACH-PERM-1E.

## Exact 1D Permission Matrix Summary

```text
createAssignment: homework.assignments.manage
updateAssignment: homework.assignments.manage
publishAssignment: homework.assignments.manage
closeAssignment: homework.assignments.manage
cancelAssignment: homework.assignments.manage
resolveTargets: homework.targets.manage
syncAssignmentToGrades: homework.grade_sync.manage
createQuestion: homework.questions.manage
updateQuestion: homework.questions.manage
reorderQuestion: homework.questions.manage
deleteQuestion: homework.questions.manage
createOption: homework.questions.manage
updateOption: homework.questions.manage
reorderOption: homework.questions.manage
deleteOption: homework.questions.manage
createAttachment: homework.attachments.manage, files.uploads.manage
updateAttachment: homework.attachments.manage
reorderAttachment: homework.attachments.manage
deleteAttachment: homework.attachments.manage
reviewSubmissionAnswer: homework.submissions.review
bulkReviewSubmissionAnswers: homework.submissions.review
reviewSubmission: homework.submissions.review
patchReviewSubmission: homework.submissions.review
syncSubmissionToGrades: homework.grade_sync.manage
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

Teacher homework grade sync uses `homework.grade_sync.manage`, not `grades.items.manage`.

## Static Metadata Test Result

Passed in:

```powershell
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests: 53 passed, 53 total
```

Static assertions verify:

```text
Teacher App total audited handlers: 111
1B read-only decorated handlers: 63
1C classroom/action decorated handlers: 11
1D homework action/write decorated handlers: 24
Total decorated handlers after 1D: 98
Remaining 1E deferred handlers: 13
```

## Missing-permission HTTP Test Result

Passed in `test/security/tenancy.teacher-app.spec.ts`.

Representative 403 `auth.scope.missing` coverage includes:

```text
homework.assignments.manage
homework.targets.manage
homework.grade_sync.manage
homework.questions.manage
homework.attachments.manage
files.uploads.manage
homework.submissions.review
```

Both assignment and submission homework grade-sync representative routes are covered for `homework.grade_sync.manage`.

## Ownership/No-leak Regression Result

Existing Teacher App security suite passed, preserving:

```text
TeacherSubjectAllocation.id as Teacher App classId
owned allocation checks
cross-school and non-owned resource hiding
non-teacher actor rejection
student/parent actor rejection on Teacher App routes
Teacher response no-leak assertions
TeacherHomeworkOwnershipService-backed homework ownership checks
```

Baseline tenancy regression also passed.

## Generic Files Boundary Result

Preserved.

```text
files.downloads.view was not used.
src/modules/files/** was not modified.
Teacher homework attachment creation requires homework.attachments.manage and files.uploads.manage.
Existing Teacher homework attachment read decorators were not changed.
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
git log top: 4a9703ba feat: enforce teacher classroom action permissions
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
npm run build: passed after cleaning stale generated dist output
test/security/tenancy.teacher-app.spec.ts: passed, 53 tests
test/security/tenancy.spec.ts: passed, 7 tests
```

Build note:

```text
The first build attempt timed out; the second surfaced ENOTEMPTY while Nest removed dist.
Generated dist was verified inside the workspace, cleaned, and npm run build then passed.
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
