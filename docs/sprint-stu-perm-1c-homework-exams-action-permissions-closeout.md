# STU-PERM-1C - Homework + Exams Action Permissions Closeout

## Sprint Name

STU-PERM-1C - Homework + Exams Action Permissions

## Baseline Commit

Expected baseline:

```text
2307afd0 feat: enforce student app read permissions
```

Actual starting HEAD matched the expected baseline:

```text
2307afd0 feat: enforce student app read permissions
```

## Files Changed

```text
src/modules/student-app/exams/controller/student-exams.controller.ts
src/modules/student-app/homeworks/controller/student-homeworks.controller.ts
test/security/tenancy.student-app.spec.ts
docs/sprint-stu-perm-1c-homework-exams-action-permissions-closeout.md
```

No permission seeds, Prisma schema, migrations, common guards/decorators, Student App access/shared/application/infrastructure/presenter files, IAM files, Files module files, package files, or environment files were changed.

## Controllers Updated

Updated only the Student App homework and exam controllers:

```text
src/modules/student-app/exams/controller/student-exams.controller.ts
src/modules/student-app/homeworks/controller/student-homeworks.controller.ts
```

The changes add route permission metadata only. Controller method bodies, DTOs, response contracts, ownership checks, use cases, and persistence behavior were not changed.

## Exam Action Permissions Added

```text
POST /api/v1/student/exams/:assessmentId/start
handler: startExamSubmission
permission: grades.submissions.start

PUT /api/v1/student/exams/:assessmentId/submission/answers
handler: bulkSaveExamAnswers
permission: grades.submissions.save

PATCH /api/v1/student/exams/:assessmentId/submission/answers/:questionId
handler: saveExamAnswer
permission: grades.submissions.save

POST /api/v1/student/exams/:assessmentId/submission/submit
handler: submitExamSubmission
permission: grades.submissions.submit
```

Read-only exam route decorators from STU-PERM-1B remain unchanged.

## Homework Action Permissions Added

```text
PUT /api/v1/student/homeworks/:homeworkId/submission
handler: saveSubmissionDraft
permission: homework.submissions.save

POST /api/v1/student/homeworks/:homeworkId/submission/draft
handler: saveSubmissionDraftAlias
permission: homework.submissions.save

PUT /api/v1/student/homeworks/:homeworkId/submission/answers
handler: saveSubmissionAnswers
permission: homework.answers.manage

PATCH /api/v1/student/homeworks/:homeworkId/submission/answers/:questionId
handler: saveSubmissionAnswer
permission: homework.answers.manage

POST /api/v1/student/homeworks/:homeworkId/submission/attachments
handler: createSubmissionAttachment
permission: homework.submission_attachments.manage

PATCH /api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId
handler: updateSubmissionAttachment
permission: homework.submission_attachments.manage

PATCH /api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId/reorder
handler: reorderSubmissionAttachment
permission: homework.submission_attachments.manage

DELETE /api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId
handler: deleteSubmissionAttachment
permission: homework.submission_attachments.manage

POST /api/v1/student/homeworks/:homeworkId/submit
handler: submitHomework
permission: homework.submissions.submit

POST /api/v1/student/homeworks/:homeworkId/submission/submit
handler: submitHomeworkAlias
permission: homework.submissions.submit
```

Read-only homework route decorators from STU-PERM-1B remain unchanged.

## Routes Intentionally Left For 1D/1E

The following Student App action route categories were not changed in this sprint:

```text
profile avatar upload/delete
profile correction request create/cancel
task stage submit
reward redeem
hero mission start
hero mission complete
hero objective complete
conversation create
message send
conversation mark-read
announcement mark-read
notification mark-all-read
notification mark-read
notification archive
notification preferences update
device token register/unregister
```

These remain assigned to STU-PERM-1D and STU-PERM-1E.

## Tests Added/Updated

Updated:

```text
test/security/tenancy.student-app.spec.ts
```

Added a static metadata inventory for all 14 STU-PERM-1C homework/exam action handlers.

Added runtime missing-permission coverage using the existing no-permission student role fixture:

```text
grades.submissions.start -> exam start returns 403 auth.scope.missing
grades.submissions.save -> exam bulk/single answer save returns 403 auth.scope.missing
grades.submissions.submit -> exam submit returns 403 auth.scope.missing
homework.submissions.save -> homework draft save returns 403 auth.scope.missing
homework.answers.manage -> homework answer write returns 403 auth.scope.missing
homework.submission_attachments.manage -> homework attachment write returns 403 auth.scope.missing
homework.submissions.submit -> homework submit returns 403 auth.scope.missing
```

Expanded the existing homework happy-path test to prove that a normal student with permissions still receives safe not-found behavior when attempting to mutate another student's homework.

## Verification Commands And Results

```text
git status --short --untracked-files=all
```

Initial result: clean working tree.

```text
git log --oneline -10
```

Initial HEAD matched `2307afd0 feat: enforce student app read permissions`.

```text
npx prisma validate
```

Result: passed. Prisma schema is valid.

```text
npm run build
```

First attempt timed out while a build process was still running. A second immediate attempt failed with `ENOTEMPTY` while cleaning `dist`, caused by the still-running timed-out build process. After waiting for the stale Node build processes to exit, `npm run build` was rerun and passed.

```text
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
```

Result: passed.

```text
Test Suites: 1 passed, 1 total
Tests:       28 passed, 28 total
Snapshots:   0 total
```

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts
```

Result: passed.

```text
Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
Snapshots:   0 total
```

Final git hygiene commands were run after this document was added.

## No-Leak / Behavior Preservation Notes

The sprint adds only `@RequiredPermissions()` metadata to homework and exam action handlers.

Permission checks remain additive:

```text
JwtAuthGuard authenticates the actor.
ScopeResolverGuard resolves active school membership and membership permissions.
PermissionsGuard now enforces homework/exam action permissions on decorated handlers.
StudentAppAccessService still resolves the linked student and active enrollment.
Homework/exam use cases still enforce ownership, assignment visibility, status constraints, deadlines, same-school checks, and safe not-found behavior.
```

No presenters, DTOs, use cases, repositories, response contracts, file flows, or no-leak response shapes were changed. This sprint does not expose storage bucket names, object keys, raw signed URLs, actor internals, membership IDs, role IDs, deleted fields, password hashes, or tenant internals.

## Known Follow-Up Sprints

```text
STU-PERM-1D - Reinforcement / Rewards / Hero Action Permissions
STU-PERM-1E - Communication / Notifications / Profile Action Permissions
STU-PERM-1F - Final Security Closeout + Regression Audit
```

## Final Verdict

```text
READY FOR REVIEW
```
