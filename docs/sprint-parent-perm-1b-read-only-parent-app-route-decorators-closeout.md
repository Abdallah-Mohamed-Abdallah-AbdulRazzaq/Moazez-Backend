# PARENT-PERM-1B Read-only Parent App Route Decorators Closeout

## Sprint Name

PARENT-PERM-1B - Read-only Parent App Route Decorators

## Baseline Commit

Expected baseline:

```text
86068e1a feat: seed parent app permissions
```

Actual repository HEAD at sprint start matched:

```text
86068e1a feat: seed parent app permissions
```

Initial `git status --short --untracked-files=all` was clean.

## Files Changed

```text
src/modules/parent-app/announcements/controller/parent-announcements.controller.ts
src/modules/parent-app/behavior/controller/parent-behavior.controller.ts
src/modules/parent-app/calendar/controller/parent-calendar.controller.ts
src/modules/parent-app/children/controller/parent-children.controller.ts
src/modules/parent-app/discipline/controller/parent-discipline.controller.ts
src/modules/parent-app/files/controller/parent-files.controller.ts
src/modules/parent-app/grades/controller/parent-grades.controller.ts
src/modules/parent-app/hero/controller/parent-hero.controller.ts
src/modules/parent-app/home/controller/parent-home.controller.ts
src/modules/parent-app/homeworks/controller/parent-homeworks.controller.ts
src/modules/parent-app/lessons/controller/parent-child-lessons.controller.ts
src/modules/parent-app/messages/controller/parent-messages.controller.ts
src/modules/parent-app/notifications/controller/parent-notifications.controller.ts
src/modules/parent-app/profile/controller/parent-profile.controller.ts
src/modules/parent-app/progress/controller/parent-progress.controller.ts
src/modules/parent-app/reports/controller/parent-reports.controller.ts
src/modules/parent-app/rewards/controller/parent-rewards.controller.ts
src/modules/parent-app/schedule/controller/parent-schedule.controller.ts
src/modules/parent-app/tasks/controller/parent-tasks.controller.ts
test/security/tenancy.parent-app.spec.ts
docs/sprint-parent-perm-1b-read-only-parent-app-route-decorators-closeout.md
```

No seeds, schema files, migrations, common guards, common decorators, files module files, IAM files, Parent App application/infrastructure/DTO/presenter files, package files, or environment files were changed.

## Controllers Updated

Added method-level `@RequiredPermissions()` metadata to the read-only handlers in:

```text
ParentHomeController
ParentChildrenController
ParentProfileController
ParentGradesController
ParentHomeworksController
ParentBehaviorController
ParentDisciplineController
ParentProgressController
ParentReportsController
ParentScheduleController
ParentCalendarController
ParentChildLessonsController
ParentTasksController
ParentHeroController
ParentRewardsController
ParentMessagesController
ParentNotificationsController
ParentAnnouncementsController
ParentFilesController
```

Static inventory count:

```text
parent_app_read_only_required_permissions=58
```

## Read-only Permissions Added

The route decorators use narrow app-facing read/view permissions:

```text
parent.home.view
parent.children.view
parent.profile.view
parent.progress.view
parent.reports.view
students.records.view
students.enrollments.view
academics.calendar.view
academics.curriculum.view
academics.lesson_plans.view
academics.subjects.view
academics.timetable.view
attendance.absences.view
attendance.sessions.view
behavior.points.view
behavior.records.view
discipline.timeline.view
grades.assessments.view
grades.gradebook.view
grades.submissions.view
homework.assignments.view
homework.submissions.view
reinforcement.hero.badges.view
reinforcement.hero.progress.view
reinforcement.hero.view
reinforcement.rewards.redemptions.view
reinforcement.rewards.view
reinforcement.submissions.view
reinforcement.tasks.view
reinforcement.xp.view
communication.announcements.view
communication.contacts.view
communication.conversations.view
communication.messages.view
communication.notifications.view
```

Parent-owned task proof file download was decorated with:

```text
reinforcement.submissions.view
```

It was intentionally not decorated with `files.downloads.view`.

## Generic Files Boundary Preservation

PARENT-PERM-1A removed `files.downloads.view` and `files.uploads.manage` from the Parent role after runtime security evidence showed that `files.downloads.view` authorizes the generic shared route:

```text
GET /api/v1/files/:fileId/download
```

That generic route does not apply Parent App child ownership checks. PARENT-PERM-1B preserves the decision:

```text
GET /api/v1/parent/children/:studentId/files/:fileId/download
```

uses `reinforcement.submissions.view` plus the existing Parent App owned-child and proof-file visibility use case. Shared `/files` route behavior was not changed.

## Routes Intentionally Left For 1C

No decorators were added to Parent App write/action routes:

```text
POST /parent/messages/conversations
POST /parent/messages/conversations/:conversationId/messages
POST /parent/messages/conversations/:conversationId/read
POST /parent/announcements/:announcementId/read
POST /parent/notifications/read-all
PATCH /parent/notifications/preferences
POST /parent/notifications/device-tokens
DELETE /parent/notifications/device-tokens/current
POST /parent/notifications/:notificationId/read
POST /parent/notifications/:notificationId/archive
```

These remain deferred to:

```text
PARENT-PERM-1C - Communication / Notifications Parent Action Permissions
```

## Tests Added/Updated

Updated `test/security/tenancy.parent-app.spec.ts` with:

```text
Static metadata inventory for all 58 PARENT-PERM-1B read-only handlers.
Explicit controller route inventory that includes 58 read-only handlers plus 10 known deferred action handlers.
A test-only no-permission Parent role fixture.
Representative missing-permission HTTP denial coverage across home, children, profile, grades, homework, behavior, discipline, progress, reports, schedule, calendar, lessons, tasks, parent-owned files, hero, rewards, messages, notifications, and announcements.
```

Existing tests still cover:

```text
linked parent happy paths
same-school unlinked child safe 404
cross-school child safe 404
non-parent actor rejection
Parent-owned task proof file download 307
generic shared /files download route 403 for parent
message/announcement audience and participant visibility
no-leak response expectations
no write effects for read-only reinforcement surfaces
```

## Verification Commands And Results

Baseline:

```powershell
git status --short --untracked-files=all
git log --oneline -10
```

Result:

```text
Initial status: clean
HEAD: 86068e1a feat: seed parent app permissions
```

Prisma validation:

```powershell
npx prisma validate
```

Result:

```text
Prisma schema loaded from prisma\schema.prisma
The schema at prisma\schema.prisma is valid
Loaded Prisma config from prisma.config.ts.
Prisma config detected, skipping environment variable loading.
```

Build:

```powershell
npm run build
```

Result:

```text
First run timed out at 180 seconds without TypeScript errors.
Second run with a longer timeout passed.
```

Focused Parent App security test:

```powershell
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests:       25 passed, 25 total
Snapshots:   0 total
Time:        85.076 s
```

General tenancy baseline:

```powershell
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        23.86 s
```

Parent child lessons security test:

```powershell
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app-child-lessons.spec.ts
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        10.498 s
```

Parent child lessons e2e test:

```powershell
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-child-lessons.e2e-spec.ts
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        10.373 s
```

The stale `test/e2e/parent-app-final-closeout.e2e-spec.ts` was not run as a required pass gate. PARENT-PERM-1B follows the sprint instruction that this spec has known route-inventory debt on the current baseline and should not block this decorator sprint.

## No-leak / Behavior Preservation Notes

This sprint did not modify presenters, DTOs, use cases, repositories, adapters, ownership checks, guards, seeds, or file module behavior.

Permission checks are additive:

```text
JwtAuthGuard still authenticates.
ScopeResolverGuard still resolves active school scope and membership permissions.
PermissionsGuard now enforces read-only Parent App permissions where metadata exists.
ParentAppAccessService still resolves linked guardians, linked children, and active enrollments.
Use cases still enforce ownership, child visibility, same-school checks, audience checks, participant checks, and safe not-found behavior.
```

No response shape changes were introduced. Existing tests continue to assert that Parent App responses do not expose tenant IDs, membership IDs, role IDs, deleted rows, storage internals, password/session fields, medical/document details, or unsupported V1 surfaces.

## Known Follow-up Sprint

```text
PARENT-PERM-1C - Communication / Notifications Parent Action Permissions
```

PARENT-PERM-1C should add action permissions for parent messaging, announcement read markers, notification read/archive/preferences, and device-token routes. It should not use broad communication admin/manage permissions.

## Final Verdict

READY FOR REVIEW
