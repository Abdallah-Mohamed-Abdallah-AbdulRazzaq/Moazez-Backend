# TEACH-PERM-1A - Teacher Permission Catalog + Role Seed Closeout

## Sprint name

TEACH-PERM-1A - Teacher Permission Catalog + Role Seed

## Baseline commit

Expected baseline and actual starting `HEAD` matched:

```text
75097189 docs: audit teacher app permission coverage
```

Initial `git status --short --untracked-files=all` was clean.

Required reading note: `DIRECTORY_STRUCTURE.md` is referenced by `AGENTS.md` but is not present in this checkout. `DIRECTORY_STRUCTURE_VISUAL.md` exists, but was not treated as the required file.

## Files changed

```text
prisma/seeds/01-permissions.seed.ts
prisma/seeds/02-system-roles.seed.ts
test/security/tenancy.teacher-app.spec.ts
docs/sprint-teach-perm-1a-catalog-teacher-role-seed-closeout.md
```

No `src/**`, Prisma schema, migrations, package, lockfile, env, Student App, Parent App, or Teacher e2e closeout files were changed.

## Catalog starting count

```text
190 permissions
```

## Catalog added permissions

```text
teacher.home.view
teacher.classes.view
teacher.classroom.view
teacher.profile.view
teacher.settings.view
teacher.lesson_preparation.view
teacher.lesson_preparation.status.manage
teacher.announcements.manage
homework.questions.view
homework.questions.manage
homework.attachments.view
homework.attachments.manage
homework.submissions.review
homework.grade_sync.view
homework.grade_sync.manage
```

## Catalog final count

```text
205 permissions
```

Static audit verified all 205 catalog codes are unique.

## Teacher role previous count

```text
42 permissions
```

## Teacher role final count

```text
54 permissions
```

## Exact final TEACHER_PERMISSIONS

```ts
[
  'app.device_tokens.manage',
  'academics.calendar.view',
  'academics.curriculum.view',
  'academics.lesson_plans.view',
  'academics.timetable.view',
  'attendance.entries.manage',
  'attendance.sessions.manage',
  'attendance.sessions.submit',
  'attendance.sessions.view',
  'communication.announcements.view',
  'communication.contacts.view',
  'communication.conversations.create',
  'communication.conversations.read',
  'communication.conversations.view',
  'communication.messages.send',
  'communication.messages.view',
  'communication.notifications.archive',
  'communication.notifications.preferences.manage',
  'communication.notifications.read',
  'communication.notifications.view',
  'files.uploads.manage',
  'grades.assessments.view',
  'grades.gradebook.view',
  'grades.items.manage',
  'grades.items.view',
  'grades.questions.view',
  'grades.submissions.review',
  'grades.submissions.view',
  'homework.assignments.manage',
  'homework.assignments.view',
  'homework.attachments.manage',
  'homework.attachments.view',
  'homework.grade_sync.manage',
  'homework.grade_sync.view',
  'homework.questions.manage',
  'homework.questions.view',
  'homework.submissions.review',
  'homework.submissions.view',
  'homework.targets.manage',
  'homework.targets.view',
  'reinforcement.reviews.manage',
  'reinforcement.reviews.view',
  'reinforcement.tasks.manage',
  'reinforcement.tasks.view',
  'reinforcement.xp.view',
  'students.records.view',
  'teacher.announcements.manage',
  'teacher.classroom.view',
  'teacher.classes.view',
  'teacher.home.view',
  'teacher.lesson_preparation.status.manage',
  'teacher.lesson_preparation.view',
  'teacher.profile.view',
  'teacher.settings.view',
]
```

## Permissions intentionally excluded

The final Teacher role excludes generic file download, broad communication management/moderation/admin, student self-service homework, student documents/medical/guardians, admissions, settings, platform, dashboard, behavior, Hero/reward, and broad grades management/analytics permissions.

Representative locked exclusions:

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
academics.lesson_plans.manage
grades.assessments.manage
grades.questions.manage
grades.analytics.view
grades.snapshots.view
grades.assessments.approve
grades.assessments.lock
behavior.overview.view
behavior.categories.view
behavior.records.view
behavior.records.create
behavior.points.view
reinforcement.templates.view
reinforcement.hero.view
reinforcement.hero.progress.view
reinforcement.rewards.view
reinforcement.rewards.redemptions.view
reinforcement.rewards.redemptions.request
homework.submissions.save
homework.submissions.submit
homework.answers.manage
homework.submission_attachments.manage
students.records.manage
students.guardians.view
students.guardians.manage
students.documents.view
students.documents.manage
students.medical.view
students.medical.manage
admissions.*
settings.*
platform.*
dashboard.*
```

## Over-grants removed/deferred

The following current Teacher over-grants from TEACH-PERM-0A were removed/deferred from default Teacher:

```text
communication.conversations.manage
communication.participants.manage
communication.messages.edit
communication.messages.delete
communication.messages.report
reinforcement.rewards.redemptions.request
reinforcement.hero.view
reinforcement.hero.progress.view
reinforcement.rewards.view
reinforcement.rewards.redemptions.view
reinforcement.templates.view
grades.assessments.manage
grades.questions.manage
grades.analytics.view
grades.snapshots.view
behavior.overview.view
behavior.categories.view
behavior.records.view
behavior.records.create
behavior.points.view
```

No committed required test failed because of these removals. The optional Teacher final closeout e2e failure was stale route inventory/task selector/cleanup behavior, not a missing Teacher permission failure.

## Announcement management decision

Default Teacher receives the new narrow permission:

```text
teacher.announcements.manage
```

Default Teacher does not receive:

```text
communication.announcements.manage
```

This keeps Teacher App announcement management scoped to Teacher-App-owned announcements and owned class targets for later decorator work.

## Generic files boundary decision

Default Teacher keeps:

```text
files.uploads.manage
```

Default Teacher does not receive:

```text
files.downloads.view
```

Teacher file downloads should continue through Teacher-App-owned routes that prove assignment, conversation, lesson, or other app visibility before signed URL generation.

## Message attachment decision

Default Teacher does not receive:

```text
communication.messages.attachments.manage
```

Current Teacher App attachment download/preview routes are visibility-backed reads. There is no approved Teacher App attachment CRUD route requiring this manage permission in this sprint.

## Student and Parent role preservation result

Static audit result:

```text
PARENT_PERMISSIONS: 43
STUDENT_PERMISSIONS: 57
```

The Parent and Student role arrays were not changed.

## Seed guardrail result

The existing seed guardrail remains in `prisma/seeds/02-system-roles.seed.ts`.

Runtime seed result:

```text
npm run seed
PASS - seeded 205 permissions and 6 system roles
```

Static audit also verified every permission referenced by `TEACHER_PERMISSIONS`, `PARENT_PERMISSIONS`, and `STUDENT_PERMISSIONS` exists in `PERMISSION_CODES`.

## Test/static audit result

`test/security/tenancy.teacher-app.spec.ts` now includes focused static seed inventory coverage verifying:

```text
PERMISSION_CODES includes all 15 new permissions
Catalog count is 205 and unique
TEACHER_PERMISSIONS count is 54
TEACHER_PERMISSIONS exactly equals the approved target list
TEACHER_PERMISSIONS has no extras beyond the approved target
TEACHER_PERMISSIONS excludes forbidden generic files, broad communication, student self-service, behavior, hero/reward, admissions, settings, platform, dashboard, and admin permissions
PARENT_PERMISSIONS remains 43
STUDENT_PERMISSIONS remains 57
All Teacher/Parent/Student role permission references exist in PERMISSION_CODES
The missing-permission seed guardrail remains present
```

The same spec also includes a `/auth/me` Teacher regression proving exactly 54 active membership permissions are exposed.

Focused test result:

```text
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts
PASS - 44 passed, 44 total
```

## Verification command results

```text
git status --short --untracked-files=all
PASS - clean before sprint changes

git log --oneline -10
PASS - HEAD matched 75097189 docs: audit teacher app permission coverage

npx prisma validate
PASS - schema is valid before edits

npx prisma validate
PASS - schema is valid after edits

npm run seed
PASS - seeded 205 permissions and 6 system roles

npm run build
PASS - final build completed

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts
PASS - 44 passed, 44 total

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts
PASS - 7 passed, 7 total

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts
PASS - 30 passed, 30 total

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
PASS - 33 passed, 33 total
```

Build note: one intermediate `npm run build` attempt hit stale Windows `dist` cleanup state (`ENOTEMPTY` under `dist/src/modules/students/documents`). `dist` was verified as untracked/generated, removed with an in-repo path check, and the final `npm run build` passed.

## Optional tests

Run:

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/teacher-app-final-closeout.e2e-spec.ts
```

Result:

```text
FAIL - optional stale closeout spec
```

Observed failures:

```text
Teacher route inventory expected older route list and missed current notification, announcement, message attachment/info/search, contacts, attendance today, and conversation create routes.
Task selector expected only moral/financial reward types but current response also includes none/points/xp.
Cleanup missed communication_notifications rows and hit a recipient_user_id FK on user deletion.
```

This file is explicitly out of scope for TEACH-PERM-1A and was not modified.

## Known follow-up sprints

```text
TEACH-PERM-1B - Teacher App Read-only Route Decorators
TEACH-PERM-1C - Teacher Classroom Action Permissions
TEACH-PERM-1D - Teacher Homework Action Permissions
TEACH-PERM-1E - Teacher Communication / Notifications / Announcements Action Permissions
TEACH-PERM-1F - Final Teacher Permission Closeout + Regression Audit
```

## Final verdict

```text
READY FOR REVIEW
```
