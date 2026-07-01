# STU-PERM-1B - Read-only Student App Route Decorators Closeout

## Sprint Name

STU-PERM-1B - Read-only Student App Route Decorators

## Baseline Commit

Expected baseline:

```text
e7c29693 feat: seed student app permissions
```

Actual repository HEAD at start matched:

```text
e7c29693 feat: seed student app permissions
```

Initial worktree status was clean.

## Files Changed

```text
src/modules/student-app/announcements/controller/student-announcements.controller.ts
src/modules/student-app/behavior/controller/student-behavior.controller.ts
src/modules/student-app/calendar/controller/student-calendar.controller.ts
src/modules/student-app/discipline/controller/student-discipline.controller.ts
src/modules/student-app/exams/controller/student-exams.controller.ts
src/modules/student-app/grades/controller/student-grades.controller.ts
src/modules/student-app/hero/controller/student-hero.controller.ts
src/modules/student-app/home/controller/student-home.controller.ts
src/modules/student-app/homeworks/controller/student-homeworks.controller.ts
src/modules/student-app/lessons/controller/student-lessons.controller.ts
src/modules/student-app/messages/controller/student-messages.controller.ts
src/modules/student-app/notifications/controller/student-notifications.controller.ts
src/modules/student-app/profile/controller/student-profile.controller.ts
src/modules/student-app/progress/controller/student-progress.controller.ts
src/modules/student-app/rewards/controller/student-rewards.controller.ts
src/modules/student-app/schedule/controller/student-schedule.controller.ts
src/modules/student-app/subjects/controller/student-subjects.controller.ts
src/modules/student-app/tasks/controller/student-tasks.controller.ts
test/security/tenancy.student-app.spec.ts
docs/sprint-stu-perm-1b-read-only-student-app-route-decorators-closeout.md
```

No seeds, schema files, migrations, common guards, common decorators, IAM files, Student App access/shared/application/infrastructure/presenter files, package files, or environment files were changed.

## Controllers Updated

Added method-level `@RequiredPermissions()` metadata to the read-only handlers in:

```text
StudentHomeController
StudentProfileController
StudentSubjectsController
StudentGradesController
StudentExamsController
StudentBehaviorController
StudentDisciplineController
StudentProgressController
StudentHeroController
StudentScheduleController
StudentTasksController
StudentMessagesController
StudentNotificationsController
StudentAnnouncementsController
StudentCalendarController
StudentLessonsController
StudentHomeworksController
StudentRewardsController
```

Static count:

```text
student_app_controller_required_permissions=63
```

## Read-only Permissions Added

The route decorators use only narrow read/view permissions:

```text
student.home.view
student.profile.view
student.profile.correction_requests.view
academics.subjects.view
grades.snapshots.view
grades.assessments.view
grades.submissions.view
behavior.records.view
behavior.points.view
discipline.timeline.view
student.progress.view
reinforcement.xp.view
reinforcement.hero.view
reinforcement.hero.progress.view
reinforcement.hero.badges.view
academics.timetable.view
reinforcement.tasks.view
reinforcement.submissions.view
communication.contacts.view
communication.conversations.view
communication.messages.view
files.downloads.view
communication.notifications.view
communication.announcements.view
academics.calendar.view
academics.lesson_plans.view
homework.assignments.view
homework.submissions.view
reinforcement.rewards.view
reinforcement.rewards.redemptions.view
```

## Routes Intentionally Left For 1C/1D/1E

No decorators were added to the write/action route categories:

```text
profile avatar upload/delete
profile correction request create/cancel
exam start/save/submit
homework draft/save
homework answer write
homework attachment create/update/reorder/delete
homework submit
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

These remain assigned to:

```text
STU-PERM-1C - Homework + Exams Action Permissions
STU-PERM-1D - Reinforcement / Rewards / Hero Action Permissions
STU-PERM-1E - Communication / Notifications / Profile Action Permissions
```

## Tests Added/Updated

Updated `test/security/tenancy.student-app.spec.ts` with:

```text
Static metadata inventory test for all 63 STU-PERM-1B read-only handlers.
HTTP missing-permission denial loop using a test-only no-permission student role.
Representative denial coverage across home, profile, subjects, grades, exams, behavior, discipline, progress, hero, schedule, tasks, messages, file download redirects, notifications, announcements, calendar, lessons, homeworks, and rewards.
```

Existing Student App security/e2e coverage continues to prove linked-student happy paths, same-school/cross-school safe not-found behavior, non-student rejection, unlinked student rejection, inactive/no active enrollment rejection, and no-leak response expectations.

## Verification Commands and Results

Baseline:

```powershell
git status --short --untracked-files=all
git log --oneline -10
```

Result:

```text
Initial status: clean
HEAD: e7c29693 feat: seed student app permissions
```

Static decorator count:

```powershell
node <inline student app controller decorator count script>
```

Result:

```text
student_app_controller_required_permissions=63
```

Prisma validation:

```powershell
npx prisma validate
```

Result:

```text
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

Local database seed alignment:

```powershell
npm run seed
```

Result:

```text
seeded 185 permissions
seeded 6 system roles
OK seed complete
```

Note: the first local run of `test/security/tenancy.student-app.spec.ts` failed with 403 responses for previously happy Student App read routes because the local database still had the pre-STU-PERM-1A Student role permissions. After running `npm run seed`, the focused tests passed.

Focused tests:

```powershell
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app-lessons.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-lessons.e2e-spec.ts
```

Results:

```text
test/security/tenancy.student-app.spec.ts: 26 passed
test/e2e/student-app-final-closeout.e2e-spec.ts: 17 passed
test/security/tenancy.student-app-lessons.spec.ts: 5 passed
test/e2e/student-app-lessons.e2e-spec.ts: 5 passed
```

## No-leak / Behavior Preservation Notes

This sprint did not modify presenters, DTOs, adapters, use cases, ownership checks, or file download response behavior.

Permission checks are additive:

```text
JwtAuthGuard still authenticates.
ScopeResolverGuard still resolves active membership and permissions.
PermissionsGuard now enforces read-only Student App permissions where metadata exists.
StudentAppAccessService still resolves linked student and active enrollment.
Use cases still enforce ownership, same-school visibility, and safe not-found behavior.
```

No response changes were introduced, and tests still assert app-facing responses do not expose tenant, storage, credential, or internal identity fields.

## Known Follow-up Sprints

```text
STU-PERM-1C - Homework + Exams Action Permissions
STU-PERM-1D - Reinforcement / Rewards / Hero Action Permissions
STU-PERM-1E - Communication / Notifications / Profile Action Permissions
STU-PERM-1F - Final Security Closeout + Regression Audit
```

## Final Verdict

READY FOR REVIEW
