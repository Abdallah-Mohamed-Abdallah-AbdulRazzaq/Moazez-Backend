# TEACH-PERM-1F — Teacher App Permission Final Closeout

## Sprint Name

TEACH-PERM-1F — Teacher App Permission Final Closeout

## Baseline Commit

Expected baseline was `4f9763e3 feat: enforce teacher communication action permissions`.

Actual HEAD matched: `4f9763e3 feat: enforce teacher communication action permissions`.

## Files Changed

- `test/e2e/teacher-app-final-closeout.e2e-spec.ts`
- `docs/sprint-teach-perm-1f-teacher-app-permission-final-closeout.md`
- `src/modules/teacher-app/profile/dto/teacher-profile.dto.ts`
- `src/modules/teacher-app/profile/presenters/teacher-profile.presenter.ts`
- `src/modules/teacher-app/profile/application/get-teacher-profile.use-case.ts`
- `src/modules/teacher-app/profile/infrastructure/teacher-profile-read.adapter.ts`

No seed, schema, migration, package, lock, env, common guard/decorator/auth/files, parent security, or student security files were modified. The only production changes are under `src/modules/teacher-app/profile/**` and remove the Teacher Profile `roleId` response leak.

## Why The Final Closeout E2E Was Stale

The reserved final closeout E2E still represented the pre-final Teacher App route surface and failed on the first run for these current-contract mismatches:

- Route inventory omitted 24 current Teacher App routes from 1B-1E, including announcements, notifications, message contacts/search/info/readers/attachment redirect routes, attendance today, and message conversation create.
- The spec still asserted current 1E routes such as `POST /teacher/messages/conversations`, `GET /teacher/announcements`, and `GET /teacher/notifications` were absent.
- Non-teacher denials now often fail at `PermissionsGuard` with `auth.scope.missing` because every Teacher App route has permission metadata.
- Task selectors now return `none`, `moral`, `financial`, `points`, and `xp`.
- Cleanup deleted users before scoped `communication_notifications` rows, causing `communication_notifications_recipient_user_id_fkey`.

The spec also lacked the final 1F role/catalog assertions and a representative 1D homework action smoke.

## What Was Updated In The Final Closeout E2E

- Replaced the stale hand-maintained full route list with a controller metadata inventory using the same `REQUIRED_PERMISSIONS_METADATA` key and Nest route method metadata.
- Added exact final inventory assertions for `111` audited Teacher App handlers, `111` decorated handlers, and `0` undecorated handlers.
- Added database assertions for the permission catalog and default Teacher, Parent, and Student roles.
- Added forbidden permission checks against Teacher route metadata and Teacher role permissions.
- Added representative positive action smokes for:
  - 1C attendance session resolve.
  - 1D homework assignment create.
  - 1E notifications read-all.
- Kept existing representative Teacher home, task/review, XP, profile/settings, and messages coverage.
- Updated task reward selector expectation to the current contract.
- Updated non-teacher denial expectation to allow either `auth.scope.missing` or `teacher_app.actor.required_teacher`, depending on guard short-circuit.
- Added scoped cleanup for communication notifications, notification deliveries/push attempts, notification preferences, homework assignment trees created by this spec, and attendance sessions created by this spec.

## Final Teacher App Handler Inventory

- Total audited Teacher App route handlers: `111`
- Handlers with `@RequiredPermissions(...)` metadata: `111`
- Remaining undecorated Teacher App handlers: `0`

The final inventory includes home/classes/classroom, attendance, classroom grades/submission review, homeworks, tasks/review queue/XP, messages, notifications, announcements, profile/settings, schedule/calendar, and lesson-preparation controller groups.

## Teacher Role / Catalog Verification Result

- Permission catalog count: `205`
- Teacher role permission count: `54`
- Teacher role contains the final approved Teacher App permissions from 1A-1E.
- Teacher role excludes forbidden generic files, broad communication/admin/moderation, removed behavior/hero/reward, grades manage/analytics/snapshot, lesson-plan manage, and student homework self-service permissions.

## Parent / Student Role Unchanged Verification Result

- Parent role permission count: `43`
- Student role permission count: `57`

## Forbidden Permission Verification Result

Teacher App route metadata does not use:

- `files.downloads.view`
- `communication.announcements.manage`
- `communication.messages.attachments.manage`
- broad communication manage/edit/delete/report/moderation/admin/platform permissions
- `communication.notifications.manage`
- `behavior.*`
- `reinforcement.hero.*`
- `reinforcement.rewards.*`
- `grades.assessments.manage`
- `grades.questions.manage`
- `grades.analytics.view`
- `grades.snapshots.view`
- `academics.lesson_plans.manage`
- student self-service homework permissions

Message attachment download/preview routes remain governed by `communication.messages.view`. Homework attachment creation remains governed by `homework.attachments.manage` and `files.uploads.manage`.

## Representative Positive Teacher App Access Result

The final closeout E2E verifies a valid Teacher can access or execute representative current routes:

- `GET /api/v1/teacher/home`
- `POST /api/v1/teacher/classroom/:classId/attendance/session/resolve`
- `POST /api/v1/teacher/homeworks/classes/:classId/assignments`
- `POST /api/v1/teacher/notifications/read-all`
- Existing task create/review and message send/read flows remain covered.

## Representative Negative Actor / Scope Result

The final closeout E2E keeps representative negative checks:

- School admin, Parent, and Student actors receive `403` on Teacher App routes.
- Teacher A cannot access other-teacher or cross-school task/XP/message resources.
- Non-owned or cross-school resources remain hidden with `404` where existing project convention requires hiding.

## No-Leak Verification Result

Representative Teacher App responses continue to reject internal storage/auth/tenant keys such as:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- `sessionId`
- `refreshToken`
- `applicationId`
- `studentUserId`
- `guardianUserId`
- `objectKey`
- `bucket`
- `provider`
- `storageProvider`
- `actorUserId`
- raw storage marker values

`GET /api/v1/teacher/profile` is now covered by the same no-`roleId` helper as other representative Teacher App responses.

## TEACH-PERM-1F-A Corrective Fix

What leaked:

- `roleId` was serialized under `role.roleId` in the Teacher Profile response.

Production files changed:

- `src/modules/teacher-app/profile/dto/teacher-profile.dto.ts`
- `src/modules/teacher-app/profile/presenters/teacher-profile.presenter.ts`
- `src/modules/teacher-app/profile/application/get-teacher-profile.use-case.ts`
- `src/modules/teacher-app/profile/infrastructure/teacher-profile-read.adapter.ts`

How `roleId` was removed from actual response JSON:

- Removed `roleId` from `TeacherProfileRoleDto`.
- Removed `roleId` from `TeacherProfilePresenter.presentProfile()` output.
- Removed the `fallbackRoleId` presenter input supplied by `GetTeacherProfileUseCase`.
- Stopped selecting membership `roleId` and role `id` in `TeacherProfileReadAdapter`; the profile response keeps only the safe role display `name`.

Final no-leak test update:

- Removed the final closeout E2E `allowRoleId` exception.
- `expectSafeTeacherPayload(profile.body)` now forbids `roleId` for `GET /api/v1/teacher/profile`.

Commands rerun:

- `npx prisma validate` - passed
- `npm run build` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/teacher-app-final-closeout.e2e-spec.ts` - passed, `8` tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts` - passed, `55` tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts` - passed, `7` tests

Final verdict after the corrective fix:

- `READY FOR REVIEW`

## Generic Files Boundary Result

- No route metadata uses `files.downloads.view`.
- No route metadata uses `communication.messages.attachments.manage`.
- Message attachment download/preview remains app-owned and protected by `communication.messages.view`.
- Homework attachment creation requires `homework.attachments.manage` and `files.uploads.manage`.
- `src/modules/files/**` was not modified.

## Cleanup / Stability Fix Summary

Cleanup now deletes scoped child rows before parent rows for:

- communication notification push attempts, deliveries, notifications, and preferences tied to this spec's users/schools;
- homework assignment children tied to homework assignments created by this spec;
- attendance entries/sessions created by this spec.

The cleanup remains scoped to IDs created or discovered for this spec and does not use broad table wipes.

## Commands Run

Pre-edit:

- `git status --short --untracked-files=all` — clean
- `git log --oneline -10` — HEAD matched `4f9763e3`
- `npx prisma validate` — passed

Stale confirmation:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/teacher-app-final-closeout.e2e-spec.ts` — initially failed on stale route inventory, non-teacher error code, task reward selector, and notification cleanup FK ordering.

Post-edit:

- `npx prisma validate` — passed
- `npm run build` — passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/teacher-app-final-closeout.e2e-spec.ts` — passed, `8` tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts` — passed, `55` tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.spec.ts` — passed, `7` tests

## Optional Tests Run

- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` — passed, `30` tests
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` — passed, `33` tests

## Final Verdict

READY FOR REVIEW

The Teacher Profile `roleId` leak was removed from production response JSON, the final closeout E2E enforces the strict no-`roleId` rule without exceptions, and all required verification commands pass.
