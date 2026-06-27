# ATT-POL-2L - Guardian Absence Notification Dispatch Closeout

## 1. Baseline commit

Baseline: `61fa33b docs: audit guardian absence notification dispatch`.

## 2. Sprint scope

Implemented the first narrow Attendance runtime notification dispatch path:

- roll-call submit only;
- guardian/parent recipients only;
- submitted ABSENT entries only;
- in-app channel only;
- linked `AttendanceSession.policyId` only;
- `AttendancePolicy.notifyGuardiansOnAbsence` only;
- Communication-owned idempotent notification command only;
- best-effort side effect after durable submit and existing audit logging.

## 3. Files changed

- `src/modules/attendance/roll-call/application/submit-roll-call-session.use-case.ts`
- `src/modules/attendance/roll-call/application/attendance-guardian-absence-notification.service.ts`
- `src/modules/attendance/roll-call/domain/guardian-absence-notification.ts`
- `src/modules/attendance/roll-call/infrastructure/attendance-roll-call.repository.ts`
- `src/modules/attendance/roll-call/roll-call.module.ts`
- `src/modules/attendance/roll-call/tests/attendance-guardian-absence-notification.service.spec.ts`
- `src/modules/attendance/roll-call/tests/roll-call.use-case.spec.ts`
- `test/e2e/attendance-foundation.e2e-spec.ts`
- `docs/sprint-att-pol-2l-guardian-absence-notification-dispatch-closeout.md`

No Prisma schema, migration, package, or lockfile changes were made.

## 4. Implementation summary

Added `AttendanceGuardianAbsenceNotificationService` to orchestrate guardian absence notification dispatch after roll-call submit. The service:

- skips sessions without `policyId`;
- reads only the linked policy guardian absence notification flag;
- filters submitted session entries to ABSENT only;
- resolves eligible parent/guardian recipient user ids under school scope;
- dedupes recipients by student;
- calls `CommunicationNotificationCommandService.createOrReuseNotification`;
- catches/logs notification failures without failing submit.

`SubmitRollCallSessionUseCase` still performs validation, submit persistence, and audit logging as before, then invokes the notification service as a best-effort side effect. The returned presenter response is unchanged.

## 5. Architecture placement

The notification orchestration lives in the Attendance roll-call application layer. Prisma access remains in `AttendanceRollCallRepository`, and notification creation remains Communication-owned through `CommunicationNotificationCommandService`.

`RollCallModule` imports `CommunicationModule` to use the exported command service. Communication does not import Attendance, so the dependency remains one-way and narrow.

Controllers were not changed.

## 6. Policy lookup behavior

ATT-POL-2L uses the submitted session's linked `policyId` only.

Behavior:

- `policyId = null`: skip notification.
- linked policy missing or inaccessible under current school scope: skip notification.
- `notifyGuardiansOnAbsence = false`: skip notification.
- `notifyGuardiansOnAbsence = true`: continue to ABSENT entry and recipient checks.

The implementation does not re-resolve the currently effective policy and does not use compatibility aliases (`notifyGuardians`, `notifyOnAbsent`) internally.

## 7. Guardian recipient resolution behavior

Recipient lookup is school-scoped and returns only active parent user recipients through guardian links.

Eligibility:

- `StudentGuardian.schoolId` matches the submitted session school.
- student is active and not deleted.
- guardian is not deleted.
- guardian has `userId`.
- user exists, is `PARENT`, is active, and is not deleted.
- user has an active current-school parent membership.

The application service dedupes recipient user ids per student. Multiple guardians for one absent student each receive one notification; one guardian linked to multiple absent students receives one notification per student.

## 8. Eligibility/status rules

Notifications are created only for submitted entries with `status = ABSENT`.

No notifications are created for:

- PRESENT
- LATE
- EARLY_LEAVE
- EXCUSED
- UNMARKED
- draft save/upsert
- targeted upsert
- submitted corrections
- unsubmit
- derived daily report-only rows
- sessions without `policyId`
- policies with `notifyGuardiansOnAbsence = false`

## 9. Idempotency key design

The idempotency key is:

`attendance.absence.submit:<sessionId>:<entryId>:<studentId>:<recipientUserId>:ABSENT`

This key is internal and is passed only to the Communication command service. It is not exposed in app notification responses.

Behavior:

- duplicate command retry reuses the same notification;
- unsubmit/resubmit of the same entry reuses the same notification;
- multiple guardians get separate notifications;
- one guardian with multiple absent students gets one notification per student.

## 10. SourceId/deepLink decision

Attendance notifications use:

- `sourceModule = ATTENDANCE`
- `sourceType = attendance_absence_submit`
- `sourceId = null`
- no attendance deep link

Raw AttendanceSession and AttendanceEntry ids are not exposed through `sourceId`, metadata, or response payloads.

## 11. Payload/no-leak behavior

Notification command payload:

- type: `ATTENDANCE_ABSENCE`
- title: `Attendance absence recorded`
- body: `<Student Display Name> was marked absent on <YYYY-MM-DD>.`
- priority: `NORMAL`
- metadata: `null`
- actorUserId: `null`

The body may include the student display name and date because the recipient is that student's guardian.

The response must not expose:

- schoolId
- organizationId
- membershipId
- roleId
- deletedAt
- internal actor ids
- guardian ids
- raw AttendanceSession ids
- raw AttendanceEntry ids
- raw Prisma payloads
- idempotencyKey
- private notes or excuse reasons

## 12. Preference/channel behavior

The implementation requests only `IN_APP` delivery and passes `CommunicationNotificationPreferenceCategory.ATTENDANCE`.

If a parent disables ATTENDANCE in-app notifications, the Communication command returns a skipped result and creates no notification. Attendance submit still succeeds.

No push, email, SMS, device-token inspection, or attendance deep-link behavior was added.

## 13. Best-effort error behavior

Notification side effects are best-effort:

- submit persistence remains durable;
- existing submit audit logging behavior is preserved;
- notification failures are caught and logged safely;
- notification failures are not returned to the submit API;
- notification failures do not roll back Attendance submit.

Logs include only generic failure names, not tenant ids, guardian ids, attendance entry ids, or raw payloads.

## 14. Out-of-scope dispatch confirmation

No notification dispatch was added for:

- draft save
- targeted upsert
- submitted correction
- unsubmit
- resolved/cleared incidents
- LATE
- EARLY_LEAVE
- teachers
- students
- admins/attendance officers
- derived daily reports
- report reads
- auto absent
- excuse workflows

No public app notification response shape was changed.

## 15. Tests added/updated

Added:

- `attendance-guardian-absence-notification.service.spec.ts`

Updated:

- `roll-call.use-case.spec.ts`
- `attendance-foundation.e2e-spec.ts`

Covered:

- eligible ABSENT guardian notification command creation;
- `notifyGuardiansOnAbsence = false` skip;
- `policyId = null` skip;
- non-ABSENT status skip;
- multiple guardians receive separate notifications;
- duplicate guardian links dedupe by recipient user id;
- one guardian linked to multiple absent students gets one notification per student;
- unresolved/ineligible recipients skip;
- ATTENDANCE preference opt-out path through Communication command result;
- notification command failure does not fail submit orchestration;
- command shape uses ATTENDANCE source module, `attendance_absence_submit`, `sourceId = null`, ATTENDANCE_ABSENCE, IN_APP, and ATTENDANCE preference category;
- submit invokes notification after audit;
- submit response remains unchanged;
- e2e parent notification center receives one safe attendance_absence notification;
- e2e policy flag disabled creates no notification;
- e2e ATTENDANCE in-app preference disabled creates no notification;
- notification response does not expose idempotencyKey, raw session id, raw entry id, schoolId, organizationId, or guardian id.

## 16. Verification commands/results

- `git status --short --untracked-files=all`: PASS during implementation, showed only ATT-POL-2L working tree changes.
- `git diff --name-only`: PASS during implementation, reviewed scoped tracked file list.
- `git diff --stat`: PASS during implementation, reviewed scoped tracked diff.
- `git diff --check`: PASS with only existing CRLF conversion warnings.
- `npx prisma validate`: PASS.
- `npm run build`: first run timed out at 124s without a compiler failure; rerun PASS (`nest build`).
- `npm run test -- roll-call --runInBand`: initially failed due a test helper treating explicit `policyId: null` as default; fixed; rerun PASS, 6 suites / 68 tests.
- `npm run test -- attendance --runInBand`: PASS, 25 suites / 188 tests.
- `npm run test -- communication --runInBand`: PASS, 60 suites / 324 tests.
- `npm run test -- parent-app --runInBand`: PASS, 50 suites / 206 tests.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts`: initially failed because the local database had not applied the existing ATT-POL-2J enum migration; ran `npx prisma migrate deploy` to apply `20260627120000_0045_notification_idempotency_attendance_readiness`; rerun PASS, 1 suite / 4 tests.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/communication-realtime-announcements-notifications.e2e-spec.ts`: PASS, 1 suite / 1 test.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`: PASS, 1 suite / 42 tests.
- `npm run test:security -- --runInBand`: PASS, 50 suites / 820 tests.

Final git checks:

- `git status --short --untracked-files=all`: PASS, shows the five modified tracked files and four untracked ATT-POL-2L files:
  - `M src/modules/attendance/roll-call/application/submit-roll-call-session.use-case.ts`
  - `M src/modules/attendance/roll-call/infrastructure/attendance-roll-call.repository.ts`
  - `M src/modules/attendance/roll-call/roll-call.module.ts`
  - `M src/modules/attendance/roll-call/tests/roll-call.use-case.spec.ts`
  - `M test/e2e/attendance-foundation.e2e-spec.ts`
  - `?? docs/sprint-att-pol-2l-guardian-absence-notification-dispatch-closeout.md`
  - `?? src/modules/attendance/roll-call/application/attendance-guardian-absence-notification.service.ts`
  - `?? src/modules/attendance/roll-call/domain/guardian-absence-notification.ts`
  - `?? src/modules/attendance/roll-call/tests/attendance-guardian-absence-notification.service.spec.ts`
- `git diff --name-only`: PASS, lists only tracked source/test files; untracked new files are expected not to appear.
- `git diff --stat`: PASS, tracked diff reviewed; untracked new files are expected not to appear.
- `git diff --check`: PASS with only CRLF conversion warnings on touched tracked files and no whitespace errors.

## 17. Deferred items

- submitted correction notifications
- resolved/cleared incident notifications
- LATE notification dispatch
- EARLY_LEAVE notification dispatch
- teacher attendance incident notifications
- student attendance incident notifications
- broad school admin/attendance officer notifications
- push attendance notifications
- email/SMS attendance notifications
- attendance deep links
- localization/templates
- excuse request notifications
- excuse approval/rejection notifications
- requireExcuseReason enforcement
- autoAbsentAfterMinutes notifications
- derived daily notifications
- persisted derived DAILY sessions
- historical notification backfill
- policy snapshotting
- public opaque attendance notification source ids
- notification grouping by multiple absent students

## 18. Final verdict

ATT_POL_2L_GUARDIAN_ABSENCE_NOTIFICATION_DISPATCH_READY
