# ATT-POL-2J — Notification Infrastructure Readiness Closeout

## Baseline

- Baseline commit: `351b94a docs: audit attendance notification readiness`
- Sprint type: infrastructure-first runtime implementation in Communication/Notifications.
- Final verdict: `ATT_POL_2J_NOTIFICATION_INFRASTRUCTURE_READY`

## Sprint Scope

ATT-POL-2J prepared Communication-owned notification infrastructure for later Attendance notification dispatch. It did not enable Attendance dispatch and did not change Attendance runtime behavior.

Implemented:

- Reusable internal notification idempotency key storage.
- School-scoped notification idempotency uniqueness.
- Communication-owned create-or-reuse notification command path.
- Attendance notification preference category plumbing.
- `ATTENDANCE_EARLY_LEAVE` notification type plumbing.
- Presenter no-leak coverage for internal idempotency/source-reference fields.
- Regression coverage for existing message/announcement notification behavior.

Not implemented:

- Attendance runtime notification dispatch.
- Roll-call submit/correction/draft-save notification calls.
- Derived daily, absence, excuse, policy, report, dashboard, app, or discipline notification dispatch.

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260627120000_0045_notification_idempotency_attendance_readiness/migration.sql`
- `src/modules/communication/communication.module.ts`
- `src/modules/communication/application/communication-notification-command.service.ts`
- `src/modules/communication/domain/communication-notification-command-domain.ts`
- `src/modules/communication/domain/communication-notification-domain.ts`
- `src/modules/communication/domain/communication-notification-preference-domain.ts`
- `src/modules/communication/infrastructure/communication-notification-command.repository.ts`
- `src/modules/communication/presenters/communication-notification-preference.presenter.ts`
- `src/modules/communication/tests/communication-notification-command.repository.spec.ts`
- `src/modules/communication/tests/communication-notification-command.service.spec.ts`
- `src/modules/communication/tests/communication-app-notification.presenter.spec.ts`
- `src/modules/communication/tests/communication-notification-domain.spec.ts`
- `src/modules/communication/tests/communication-notification-preference.service.spec.ts`
- `test/e2e/communication-realtime-announcements-notifications.e2e-spec.ts`
- `docs/sprint-att-pol-2j-notification-infrastructure-readiness-closeout.md`

No Attendance source files were changed.

## Schema And Migration Details

Migration: `20260627120000_0045_notification_idempotency_attendance_readiness`

Schema changes:

- Added `CommunicationNotification.idempotencyKey String? @map("idempotency_key") @db.VarChar(200)`.
- Added unique index `comm_notif_school_idempotency_key` on `(schoolId, idempotencyKey)`.
- Added `ATTENDANCE` to `CommunicationNotificationPreferenceCategory`.
- Added `ATTENDANCE_EARLY_LEAVE` to `CommunicationNotificationType`.

The idempotency key is nullable. PostgreSQL unique indexes allow multiple `NULL` values, so existing and future non-idempotent notification rows remain valid.

No Attendance schema changes were made.

## Idempotency And Source-Reference Design

The reusable command path is owned by Communication:

- `CommunicationNotificationCommandService`
- `CommunicationNotificationCommandRepository`
- `communication-notification-command-domain.ts`

Behavior:

- A call with `(schoolId, idempotencyKey)` creates one notification and returns/reuses that notification on retry.
- The lookup and unique index are school-scoped, so the same idempotency key can be reused safely in different schools.
- The repository uses a PostgreSQL advisory transaction lock for idempotent calls before lookup/create.
- The command creates an `IN_APP` delivery and does not duplicate it when reusing an existing notification.
- Calls with `idempotencyKey = null` remain explicitly non-idempotent.
- `sourceId` remains unchanged for existing message/announcement flows.
- Future Attendance notifications can use `sourceId = null` or a safe opaque public id while using the internal idempotency key for dedupe.

The command path intentionally does not add push, email, or SMS dispatch. Existing message and announcement generation retain their current in-app and push delivery behavior.

## Preference Category Changes

Added `ATTENDANCE` as a backend preference category and public category `attendance`.

Presenter behavior follows the existing default convention:

- `inAppEnabled: true`
- `pushEnabled: true`
- `canChange: true`

The reusable command honors `CommunicationNotificationPreferenceCategory.ATTENDANCE` for in-app creation when a preference category is supplied. If a user disables the category, the command returns `skippedReason: "in_app_preference_disabled"` and creates no notification or delivery rows.

Existing message and announcement preference behavior is unchanged.

## Notification Type Changes

Added `ATTENDANCE_EARLY_LEAVE` and public normalization for `attendance_early_leave`.

Existing `ATTENDANCE_ABSENCE` and `ATTENDANCE_LATE` remain unchanged.

Attendance-shaped app notification grouping still falls back to the existing `other` group unless future app contract work chooses to add a dedicated attendance group.

## Presenter And No-Leak Behavior

The new `idempotencyKey` field is intentionally not selected by app notification repositories and is not presented by notification presenters.

Presenter tests assert that app notification responses do not expose:

- `idempotencyKey`
- `idempotency_key`
- internal source-reference objects
- raw AttendanceSession or AttendanceEntry identifiers supplied as internal-only fixture fields

Existing app notification fields remain unchanged, including public `sourceId` for message/announcement flows.

## No Attendance Runtime Dispatch

No Attendance runtime dispatch was added.

This sprint did not call Communication notification APIs from:

- roll-call draft save
- targeted upsert
- roll-call submit
- submitted corrections
- absences
- excuses
- Attendance policies
- derived daily reports
- Attendance report reads

No Teacher App, Parent App, Student App, Dashboard, Discipline, or Attendance Reports behavior was changed.

## Tests Added Or Updated

Added:

- `communication-notification-command.repository.spec.ts`
- `communication-notification-command.service.spec.ts`

Updated:

- Preference service tests for the new `attendance` category.
- Notification domain tests for `attendance_early_leave`.
- App notification presenter tests for idempotency/source-reference no-leak behavior.
- Communication realtime/announcement notification E2E expectations to assert the current two-delivery behavior: delivered `IN_APP` plus pending `PUSH`.

Covered:

- First idempotent command creates one notification.
- Same school plus same key reuses existing notification.
- Same key is scoped by school.
- Reuse does not duplicate in-app delivery rows.
- Null idempotency key remains non-idempotent.
- Attendance preference opt-out prevents creation.
- Unsupported channels are rejected by the reusable command.
- Internal idempotency/source-reference fields are not exposed by app presenters.

## Verification Commands And Results

- `git status --short --untracked-files=all`: PASS, showed only this sprint's working tree changes.
- `git diff --name-only`: PASS, reviewed sprint file list.
- `git diff --stat`: PASS, reviewed scoped diff.
- `git diff --check`: PASS after final documentation update.
- `npx prisma validate`: PASS.
- `npx prisma generate`: PASS, generated Prisma Client v6.19.3.
- `npm run build`: PASS.
- `npm run test -- communication --runInBand`: PASS, 60 suites / 324 tests.
- `npm run test -- attendance --runInBand`: PASS, 24 suites / 173 tests.
- `npm run test -- teacher-app --runInBand`: PASS, 47 suites / 274 tests.
- `npm run test -- parent-app --runInBand`: PASS, 50 suites / 206 tests.
- `npm run test -- student-app --runInBand`: PASS, 50 suites / 243 tests.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/communication-realtime-announcements-notifications.e2e-spec.ts`: initially failed on stale single-delivery expectations; updated to the current in-app plus push delivery behavior; rerun PASS, 1 suite / 1 test.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts`: PASS, 1 suite / 3 tests.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`: PASS, 1 suite / 42 tests.
- `npm run test:security -- --runInBand`: PASS, 50 suites / 820 tests.
- Final `git status --short --untracked-files=all`: PASS, no committed changes.

## Source Review Notes

All user-required sprint sources were present and reviewed.

Additional AGENTS.md-required `DIRECTORY_STRUCTURE.md` was not present in the repository; `DIRECTORY_STRUCTURE_VISUAL.md` was reviewed instead.

## Deferred Items

- Attendance runtime notification dispatch.
- Roll-call submit ABSENT guardian notifications.
- Submitted correction notifications.
- Late notifications.
- Early-leave notification dispatch.
- Teacher attendance incident notifications.
- Student attendance incident notifications.
- Broad school admin or attendance officer notifications.
- Email/SMS attendance delivery.
- Attendance push deep links.
- Excuse request notifications.
- Excuse approval/rejection notifications.
- `requireExcuseReason` enforcement.
- `autoAbsentAfterMinutes` notifications.
- Derived daily notifications.
- Persisted derived DAILY sessions.
- Historical notification backfill.
- Resolved/cleared incident notifications.
- Notification localization/templates for attendance.

## Final Verdict

`ATT_POL_2J_NOTIFICATION_INFRASTRUCTURE_READY`
