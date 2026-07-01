# STU-PERM-1A - Permission Catalog + Student Role Seed Closeout

## Sprint Name

STU-PERM-1A - Permission Catalog + Student Role Seed

## Baseline Commit

Expected baseline:

```text
b10c1225 docs: audit student app permission coverage
```

Actual repository HEAD at start matched the expected baseline:

```text
b10c1225 docs: audit student app permission coverage
```

The worktree was clean before implementation.

## Files Changed

```text
prisma/seeds/01-permissions.seed.ts
prisma/seeds/02-system-roles.seed.ts
docs/sprint-stu-perm-1a-permission-catalog-student-role-seed-closeout.md
```

No Student App controllers, guards, decorators, DTOs, ownership services, Prisma schema files, migrations, package files, or environment files were changed.

## Permission Catalog Changes

Added the missing Student App permission catalog entries approved by STU-PERM-0A:

```text
app.device_tokens.manage
academics.timetable.view
communication.announcements.read
communication.contacts.view
communication.conversations.read
communication.notifications.archive
communication.notifications.preferences.manage
communication.notifications.read
discipline.timeline.view
grades.submissions.save
grades.submissions.start
homework.answers.manage
homework.submission_attachments.manage
homework.submissions.save
homework.submissions.submit
reinforcement.hero.missions.complete
reinforcement.hero.missions.start
reinforcement.hero.objectives.complete
reinforcement.submissions.submit
reinforcement.submissions.view
student.home.view
student.profile.avatar.manage
student.profile.correction_requests.cancel
student.profile.correction_requests.create
student.profile.correction_requests.view
student.profile.view
student.progress.view
```

Each entry includes `code`, `module`, `resource`, `action`, and `description`. Descriptions mark app-facing/self-service intent where the permission is specific to Student App behavior.

## STUDENT_PERMISSIONS Changes

The seeded `student` system role was expanded from 4 permissions to 57 permissions.

Previous Student role coverage:

```text
attendance.sessions.view
grades.assessments.view
reinforcement.tasks.view
students.records.view
```

Final Student role coverage:

```text
app.device_tokens.manage
academics.calendar.view
academics.lesson_plans.view
academics.subjects.view
academics.timetable.view
attendance.sessions.view
behavior.points.view
behavior.records.view
communication.announcements.read
communication.announcements.view
communication.contacts.view
communication.conversations.create
communication.conversations.read
communication.conversations.view
communication.messages.attachments.manage
communication.messages.send
communication.messages.view
communication.notifications.archive
communication.notifications.preferences.manage
communication.notifications.read
communication.notifications.view
discipline.timeline.view
files.downloads.view
files.uploads.manage
grades.assessments.view
grades.snapshots.view
grades.submissions.save
grades.submissions.start
grades.submissions.submit
grades.submissions.view
homework.answers.manage
homework.assignments.view
homework.submission_attachments.manage
homework.submissions.save
homework.submissions.submit
homework.submissions.view
reinforcement.hero.badges.view
reinforcement.hero.missions.complete
reinforcement.hero.missions.start
reinforcement.hero.objectives.complete
reinforcement.hero.progress.view
reinforcement.hero.view
reinforcement.rewards.redemptions.request
reinforcement.rewards.redemptions.view
reinforcement.rewards.view
reinforcement.submissions.submit
reinforcement.submissions.view
reinforcement.tasks.view
reinforcement.xp.view
student.home.view
student.profile.avatar.manage
student.profile.correction_requests.cancel
student.profile.correction_requests.create
student.profile.correction_requests.view
student.profile.view
student.progress.view
students.records.view
```

The expanded list prepares RBAC data for later route-level enforcement but does not enforce route permissions yet.

## No Controller Decorators Added

No `@RequiredPermissions()` decorators were added in this sprint. Route enforcement is intentionally deferred to:

```text
STU-PERM-1B - Read-only Student App Route Decorators
STU-PERM-1C - Homework + Exams Action Permissions
STU-PERM-1D - Reinforcement / Rewards / Hero Action Permissions
STU-PERM-1E - Communication / Notifications / Profile Action Permissions
```

This sprint only establishes the permission catalog and seeded Student role data required by those follow-up sprints.

## No Student App Route Behavior Changed

No Student App controller, application, presenter, adapter, shared access, or ownership logic was changed. Existing user type, active membership, linked student, active enrollment, same-school, ownership, and visibility checks remain unchanged.

Because no route decorators were added, current route authorization behavior is unchanged by this sprint.

## Forbidden Student Permissions

The Student role was checked and does not include the forbidden dashboard/admin permissions identified in the STU-PERM-0A audit:

```text
students.records.manage
students.documents.manage
students.medical.manage
communication.notifications.manage
communication.conversations.manage
communication.messages.edit
communication.messages.delete
communication.messages.moderate
communication.admin.view
communication.admin.manage
reinforcement.hero.progress.manage
reinforcement.tasks.manage
reinforcement.rewards.manage
settings.*
platform.*
```

Static verification result:

```text
student_forbidden_count=0
```

## Seed Guardrail Against Missing Catalog Codes

`prisma/seeds/02-system-roles.seed.ts` now validates every permission code referenced by each system role.

If a role references a permission code that does not exist in the seeded permission catalog, seeding fails with a clear error:

```text
Missing permissions for system role <role-key>: <missing-codes>
```

The role permission join rows are also created from the ordered role permission list instead of relying on unordered database results.

Static verification result:

```text
student_role_missing_from_catalog=0
```

## Verification Commands and Results

Initial baseline checks:

```powershell
git status --short --untracked-files=all
git log --oneline -10
```

Result:

```text
Initial status: clean
HEAD: b10c1225 docs: audit student app permission coverage
```

Static seed checks:

```powershell
node <inline seed verification script>
```

Result:

```text
catalog_missing_required=0
student_permission_count=57
student_forbidden_count=0
student_role_missing_from_catalog=0
```

Prisma validation:

```powershell
npx prisma validate
```

Result:

```text
Prisma schema loaded from prisma\schema.prisma
The schema at prisma\schema.prisma is valid
```

Build:

```powershell
npm run build
```

Result:

```text
PASS
```

Note: an earlier build attempt timed out, and a follow-up build attempt reported `ENOTEMPTY` while removing stale generated `dist` output. The generated `dist` directory was removed after verifying the resolved path was inside the workspace, then `npm run build` passed.

Targeted auth/me security e2e:

```powershell
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests: 7 passed, 7 total
Snapshots: 0 total
```

## Known Follow-Up Sprints

```text
STU-PERM-1B - Read-only Student App Route Decorators
STU-PERM-1C - Homework + Exams Action Permissions
STU-PERM-1D - Reinforcement / Rewards / Hero Action Permissions
STU-PERM-1E - Communication / Notifications / Profile Action Permissions
STU-PERM-1F - Final Security Closeout + Regression Audit
```

## Final Verdict

READY FOR REVIEW
