# ATT-POL-2K - Guardian Absence Notification Dispatch Audit

## 1. Title and status

Sprint: ATT-POL-2K - Guardian Absence Notification Dispatch Audit.

Status: Documentation-only audit complete. No runtime dispatch is implemented in this sprint.

Final verdict: READY_FOR_ATT_POL_2L_IMPLEMENTATION.

## 2. Baseline

Current baseline: `ed85193 feat: add notification idempotency infrastructure`.

This audit assumes the ATT-POL-2J notification infrastructure is present: internal notification idempotency keys, school-scoped idempotency uniqueness, the Communication-owned command service, the ATTENDANCE preference category, and ATTENDANCE_EARLY_LEAVE type plumbing.

## 3. Scope and non-goals

Scope:

- Decide the first safe Attendance runtime notification dispatch design.
- Limit the next runtime sprint to guardian/parent in-app ABSENT notifications on roll-call submit only.
- Use the session-linked AttendancePolicy and Communication-owned idempotent command path.
- Preserve existing Attendance, Parent App, Teacher App, Student App, dashboard, reports, derived daily, absence, excuse, and correction behavior.

Non-goals:

- No source code, Prisma schema, migration, test, package, or runtime behavior changes in ATT-POL-2K.
- No notification dispatch in this sprint.
- No push, email, SMS, or device-token behavior.
- No teacher, student, admin, or attendance officer notification audience.
- No LATE or EARLY_LEAVE runtime dispatch.
- No draft-save, correction, unsubmit, derived daily report, absence/excuse, or policy notification dispatch.
- No historical backfill.

## 4. Sources reviewed

Required project and architecture sources reviewed:

- `AGENT_CONTEXT_PRIMER.md`
- `CLAUDE.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `DOMAIN_GLOSSARY.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `ERROR_CATALOG.md`
- `TESTING_STRATEGY.md`
- `OBSERVABILITY.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`
- `adr/School-Dashboard/sis_dashboard-attendance_backend_handoff_spec.md`

Attendance policy sprint sources reviewed:

- `docs/sprint-att-pol-2i-attendance-notifications-reality-audit.md`
- `docs/sprint-att-pol-2j-notification-infrastructure-readiness-closeout.md`
- `docs/sprint-att-pol-2h-derived-daily-report-only-closeout.md`
- `docs/sprint-att-pol-2f-attendance-threshold-runtime-closeout.md`
- `docs/sprint-att-pol-1-attendance-policy-contract-persistence-repair-closeout.md`

Runtime areas inspected:

- `prisma/schema.prisma`
- `src/modules/attendance/roll-call/application/submit-roll-call-session.use-case.ts`
- `src/modules/attendance/roll-call/application/unsubmit-roll-call-session.use-case.ts`
- `src/modules/attendance/roll-call/infrastructure/attendance-roll-call.repository.ts`
- `src/modules/attendance/roll-call/roll-call.module.ts`
- `src/modules/attendance/policies/**`
- `src/modules/communication/application/communication-notification-command.service.ts`
- `src/modules/communication/infrastructure/communication-notification-command.repository.ts`
- `src/modules/communication/application/communication-notification-preference.service.ts`
- `src/modules/communication/infrastructure/communication-notification-preference.repository.ts`
- `src/modules/communication/application/communication-app-notification-center.service.ts`
- `src/modules/communication/infrastructure/communication-notification.repository.ts`
- `src/modules/communication/presenters/communication-app-notification.presenter.ts`
- `src/modules/communication/presenters/communication-notification-preference.presenter.ts`
- `src/modules/parent-app/access/parent-app-access.service.ts`
- `src/modules/parent-app/access/parent-app-guardian-read.adapter.ts`
- `src/modules/parent-app/notifications/**`
- selected attendance roll-call and communication notification tests

Missing source note:

- `DIRECTORY_STRUCTURE.md` is required by the workspace AGENTS/CLAUDE reading order but was not present; `DIRECTORY_STRUCTURE_VISUAL.md` was reviewed instead.

## 5. Current submit flow truth

`SubmitRollCallSessionUseCase` currently:

- loads the current attendance scope with `requireAttendanceScope()`;
- loads the session through `AttendanceRollCallRepository.findSessionById(sessionId)`;
- receives a detailed session record that includes `policyId`, status, mode, scope, term, and entries;
- validates closed/inactive term protection through `assertRollCallSessionTermWritable(session)`;
- rejects any non-DRAFT session with `AttendanceSessionAlreadySubmittedException`;
- updates the session to SUBMITTED through `submitSession`;
- writes an audit log with before/after submission state;
- returns `presentRollCallSession(submitted)`.

Submit does not currently:

- load linked AttendancePolicy fields;
- inspect notification flags;
- inspect thresholds;
- create notifications;
- enqueue communication jobs;
- mutate entries beyond the submit status update.

Submit is not idempotent at the HTTP/use-case level. A second submit against an already SUBMITTED session is rejected. The system does support unsubmit: `UnsubmitRollCallSessionUseCase` can move a submitted session back to DRAFT and clear submission metadata, then the session can be submitted again.

ATT-POL-2L safest notification point:

- After `submitSession` succeeds and the audit log is attempted/written.
- Outside the Attendance submit persistence path.
- Best-effort: notification failure must not roll back or fail Attendance submission.
- Use safe logging only if the notification command fails.

## 6. Current policy lookup truth

AttendanceSession stores `policyId`, and roll-call session creation has already been repaired to resolve the effective policy and store the selected policy id. Submit receives that stored `policyId` in the loaded session record.

Required ATT-POL-2L decision:

- Use `session.policyId` only.
- Do not re-resolve the currently effective policy by date/scope.
- Skip notification dispatch if `session.policyId` is null.
- Skip notification dispatch if the linked policy cannot be read under the active school scope.
- Read only the fields needed for guardian absence notification: `id` and `notifyGuardiansOnAbsence`.

Rationale:

- Re-resolving would make notification behavior drift from the policy that governed session creation.
- Session-linked `policyId` preserves the already accepted roll-call contract.
- The policy is not snapshotted, so ATT-POL-2L should use the live linked policy row at submit time. Historical policy snapshotting remains deferred.

## 7. Guardian recipient resolution

Data model truth:

- `Student` is school-scoped and can have many `StudentGuardian` links.
- `Guardian` is school-scoped, may have `userId`, and can be soft deleted through `deletedAt`.
- `StudentGuardian` links students and guardians under the same `schoolId`.
- A guardian can have no user account.
- A student can have multiple guardians.
- One guardian user can be linked to multiple students.
- Parent App notification center reads notifications by `recipientUserId`.

Existing Parent App access patterns require:

- current school scoped Prisma access;
- `Guardian.deletedAt = null`;
- `Guardian.userId` matching an active `User`;
- `User.userType = PARENT`;
- `User.status = ACTIVE`;
- `User.deletedAt = null`;
- active linked student and active enrollment checks for child ownership reads.

Required ATT-POL-2L decision:

- Notify only guardian/parent recipients with a safe active user recipient in the current school context.
- Skip guardian links without `guardian.userId`.
- Skip deleted guardians, inactive/deleted/non-parent users, inactive/deleted students, and recipients not resolvable through current-school scoped relationships.
- Deduplicate by recipient user id per absent student.

Implementation should follow the Parent App guardian read adapter eligibility pattern rather than inventing a broader audience.

## 8. Student entry eligibility

Eligible entries for ATT-POL-2L:

- Session has just been durably submitted by the roll-call submit flow.
- Session status after submit is SUBMITTED.
- Entry belongs to that submitted session.
- Entry status is exactly ABSENT.
- Session has a non-null `policyId`.
- Linked policy has `notifyGuardiansOnAbsence = true`.
- Student and guardian recipients are resolved safely under the active school context.

Ineligible entries:

- PRESENT
- LATE
- EARLY_LEAVE
- EXCUSED
- UNMARKED
- draft entries
- entries from derived daily report-only rows
- entries from sessions without `policyId`
- entries from missing/inaccessible policies

EXCUSED suppresses absence notification because the durable submitted status is not ABSENT.

## 9. Policy flag behavior

`notifyGuardiansOnAbsence` is persisted on AttendancePolicy with default `true` and returned by policy APIs. Compatibility aliases `notifyGuardians` and `notifyOnAbsent` are DTO/presenter contract aliases for the same stored field.

Required ATT-POL-2L decision:

- Use the stored `notifyGuardiansOnAbsence` field.
- If false, create no guardian absence notifications.
- Do not use `notifyGuardians` or `notifyOnAbsent` internally except through existing policy DTO compatibility.
- Do not let `notifyOnLate`, `notifyOnEarlyLeave`, `notifyTeachers`, or `notifyStudents` affect this path.
- Policy changes after session creation affect submit notification only because the linked policy row is live, not snapshotted. Policy snapshotting remains deferred.

## 10. Idempotency key design

ATT-POL-2J added `CommunicationNotification.idempotencyKey` as an internal nullable key with school-scoped uniqueness on `(schoolId, idempotencyKey)`.

Required ATT-POL-2L idempotency key:

`attendance.absence.submit:<sessionId>:<entryId>:<studentId>:<recipientUserId>:ABSENT`

Behavior:

- Duplicate notification command retries reuse the existing notification.
- Multiple guardians for one student receive separate notifications because recipient user id is included.
- One guardian linked to multiple absent students receives one notification per student because entry/student ids differ.
- Unsubmit and resubmit of the same session entry reuses the original notification rather than notifying again.
- `submittedAt` is intentionally excluded so unsubmit/resubmit does not create duplicate notifications.
- The key is internal and must not be exposed by any API response.

This key is stable enough for retry safety without requiring a new correction/submission occurrence table.

## 11. SourceId and public notification contract

Current app notification presenters expose `sourceId`. Raw `AttendanceSession.id` and `AttendanceEntry.id` are not approved as public notification source identifiers.

Required ATT-POL-2L decision:

- Set `sourceModule = ATTENDANCE`.
- Set a clear `sourceType`, recommended: `attendance_absence_submit`.
- Set `sourceId = null`.
- Set `deepLink = null` by relying on the current presenter behavior for attendance notifications.
- Do not introduce a safe opaque public attendance source id in ATT-POL-2L.
- Do not put raw AttendanceSession or AttendanceEntry ids in public response fields.
- Metadata should be omitted or limited to non-sensitive values that are not needed by the client, such as event/status/date. Prefer no raw attendance ids in metadata for ATT-POL-2L.

The idempotency key is the dedupe mechanism; `sourceId` is not.

## 12. Payload design

Notification command fields for ATT-POL-2L:

- `type = ATTENDANCE_ABSENCE`
- `sourceModule = ATTENDANCE`
- `sourceType = attendance_absence_submit`
- `sourceId = null`
- `priority = NORMAL`
- `deliveryChannels = [IN_APP]`
- `preferenceCategory = ATTENDANCE`
- `actorUserId = null` or the submit actor only if existing Communication policy treats actor id as internal and safe. Prefer `null` for the first sprint.

Safe title/body:

- Title: `Attendance absence recorded`
- Body may include the absent student's display name and session date because the recipient is that student's guardian.
- Example body: `<Student Display Name> was marked absent on <YYYY-MM-DD>.`

Do not include:

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
- excuse reason
- private note
- teacher/admin actor
- policy internals
- other students' data

Localization/templates remain deferred.

## 13. Preference behavior

ATT-POL-2J added `CommunicationNotificationPreferenceCategory.ATTENDANCE`. Preference defaults are enabled when no explicit preference row exists.

`CommunicationNotificationCommandService` checks `shouldCreateInAppNotification` when a preference category is supplied and IN_APP delivery is requested. If disabled, the command returns `skippedReason = in_app_preference_disabled` and creates no notification.

Required ATT-POL-2L decision:

- Pass `preferenceCategory = ATTENDANCE`.
- Respect guardian/parent user opt-out.
- School policy flags do not override user preference.
- Push preference is irrelevant because ATT-POL-2L is in-app only.
- A skipped preference result should not fail submit. Optional safe logging may record counts, not private payloads.

## 14. Channel behavior

Required ATT-POL-2L decision:

- Create in-app notifications only.
- Request only `CommunicationNotificationDeliveryChannel.IN_APP`.
- Do not inspect device tokens.
- Do not request push.
- Do not send email, SMS, or WhatsApp.
- Do not create attendance push deep links.

The Communication command repository creates one IN_APP delivery row and reuses it on duplicate idempotent calls.

## 15. Transaction and error behavior

Required ATT-POL-2L decision:

- Attendance submit remains successful even if notification creation fails.
- Notification creation runs after durable Attendance submission.
- Notification creation should not run inside the Attendance session update transaction.
- Notification command uses its own Communication transaction.
- Failures are caught and logged with safe aggregate context only.
- Submit response shape and status must remain unchanged.

Rationale:

- Attendance is the source-of-truth write.
- Notification dispatch is side-effecting communication infrastructure.
- Without an Attendance outbox, failing the primary Attendance write due to communication failure would be a user-visible regression.

## 16. Recipient deduplication

Required ATT-POL-2L decision:

- Deduplicate guardian links by recipient user id for each absent student.
- If the same guardian is linked more than once to the same student, send one notification.
- If one guardian is linked to multiple absent students, send one notification per absent student.
- If one absent student has multiple eligible guardians, each guardian receives one notification.
- Do not group multiple absent students into one notification in V1.

This keeps idempotency keys simple and makes parent notification center behavior predictable.

## 17. Correction and unsubmit boundaries

Required ATT-POL-2L decisions:

- No notifications on submitted corrections.
- No notifications on unsubmit.
- No resolved or cleared incident notifications.
- No notification when a later correction changes PRESENT to ABSENT.
- No notification when ABSENT becomes EXCUSED.
- No notification retry tied to correction history.

Correction notifications require a separate durable occurrence/idempotency design and remain deferred.

## 18. Derived daily and auto absent boundaries

Required ATT-POL-2L decisions:

- No notifications from report-only derived daily absences.
- No notifications from derived daily report reads.
- No notifications from `autoAbsentAfterMinutes`.
- No scheduler/job behavior.
- No notifications from future persisted derived daily rows until a durable derived event and duplicate-prevention design exists.

## 19. Architecture placement

Recommended ATT-POL-2L placement:

- Add a small Attendance roll-call application service, for example `GuardianAbsenceNotificationService` or `AttendanceGuardianAbsenceNotificationService`.
- Invoke it from `SubmitRollCallSessionUseCase` after durable submit and audit logging.
- Keep controllers unchanged.
- Keep Prisma access in repositories.
- Use the Communication-owned `CommunicationNotificationCommandService` for notification creation.
- Import `CommunicationModule` into `RollCallModule` if needed; `CommunicationModule` already exports `CommunicationNotificationCommandService`.
- Add a narrow Attendance-side repository method or repository class to:
  - read linked policy notification fields by `policyId` under school scope;
  - resolve eligible guardian recipient user ids by student ids under school scope.

No module architecture blocker was found:

- Communication notification command service is exported.
- Communication does not need to import Attendance for this path.
- Roll-call can depend on Communication as an outbound side-effect integration if kept narrow and application-owned.

## 20. Recommended ATT-POL-2L implementation plan

Exact scope:

- Roll-call submit only.
- Guardian/parent ABSENT notifications only.
- In-app only.
- Policy-gated by linked `session.policyId` and `notifyGuardiansOnAbsence`.
- Preference-aware through ATTENDANCE category.
- Idempotent through Communication idempotency key.
- Best-effort after successful submit.

Exact non-goals:

- No schema or migration expected.
- No public response envelope changes.
- No Attendance controller changes.
- No draft-save, correction, unsubmit, derived daily, report, absence, excuse, or policy dispatch.
- No teacher/student/admin audiences.
- No LATE/EARLY_LEAVE dispatch.
- No push/email/SMS.
- No sourceId exposure.
- No historical backfill.

Likely files to change in ATT-POL-2L:

- `src/modules/attendance/roll-call/roll-call.module.ts`
- `src/modules/attendance/roll-call/application/submit-roll-call-session.use-case.ts`
- new `src/modules/attendance/roll-call/application/attendance-guardian-absence-notification.service.ts`
- optional new `src/modules/attendance/roll-call/domain/guardian-absence-notification.ts`
- `src/modules/attendance/roll-call/infrastructure/attendance-roll-call.repository.ts` or a new focused notification recipient repository
- `src/modules/attendance/roll-call/tests/roll-call.use-case.spec.ts`
- optional new roll-call notification service/domain spec
- `test/e2e/attendance-foundation.e2e-spec.ts` or a focused attendance notification e2e spec if local conventions allow
- `test/security/tenancy.attendance.spec.ts`
- ATT-POL-2L closeout document

Algorithm:

1. Submit use-case loads DRAFT session exactly as today.
2. Submit use-case writes SUBMITTED state exactly as today.
3. Submit use-case writes audit log exactly as today.
4. If `submitted.policyId` is null, return response with no notification work.
5. Load the linked policy notification flag under current school scope.
6. If policy missing/inaccessible or `notifyGuardiansOnAbsence` is false, return response.
7. Filter submitted entries to `status === ABSENT`.
8. If no ABSENT entries, return response.
9. Resolve active parent recipient user ids for each absent student under current school scope.
10. Deduplicate recipient user ids per student.
11. For each student/recipient pair, call `CommunicationNotificationCommandService.createOrReuseNotification` with:
    - `sourceModule = ATTENDANCE`
    - `sourceType = attendance_absence_submit`
    - `sourceId = null`
    - `type = ATTENDANCE_ABSENCE`
    - `deliveryChannels = [IN_APP]`
    - `preferenceCategory = ATTENDANCE`
    - idempotency key `attendance.absence.submit:<sessionId>:<entryId>:<studentId>:<recipientUserId>:ABSENT`
    - safe title/body.
12. Catch/log notification failures without failing submit.
13. Return the existing submit presenter response.

Schema/migration:

- No schema or migration is expected for ATT-POL-2L if ATT-POL-2J infrastructure remains available.

Verification commands for ATT-POL-2L:

- `git status --short --untracked-files=all`
- `git diff --name-only`
- `git diff --stat`
- `git diff --check`
- `npx prisma validate`
- `npm run build`
- `npm run test -- roll-call --runInBand`
- `npm run test -- attendance --runInBand`
- `npm run test -- communication --runInBand`
- `npm run test -- parent-app --runInBand`
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts`
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/communication-realtime-announcements-notifications.e2e-spec.ts`
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`
- `npm run test:security -- --runInBand`

## 21. Tests required for ATT-POL-2L

Unit tests:

- Submit notifies eligible guardian for ABSENT when `notifyGuardiansOnAbsence` is true.
- Submit does not notify when policy flag is false.
- Submit does not notify for PRESENT, LATE, EARLY_LEAVE, EXCUSED, or UNMARKED.
- Draft save does not notify.
- Submit does not notify sessions with null `policyId`.
- Submit uses `session.policyId` and does not re-resolve effective policy.
- Multiple guardians receive separate notifications.
- Duplicate guardian links dedupe by recipient user id.
- Guardian without `userId` is skipped.
- Deleted guardian, inactive/deleted/non-parent user, or inactive/deleted student is skipped.
- ATTENDANCE in-app preference disabled skips creation.
- Notification command failure does not fail submit.
- Idempotency key is stable and per recipient.
- `sourceId` is null for attendance notifications.
- No notification on derived daily report reads.
- Submit response remains unchanged.

E2E tests:

- Create a policy with `notifyGuardiansOnAbsence = true`.
- Create/link an active parent user/guardian to a student.
- Resolve/save/submit DAILY or PERIOD roll-call with an ABSENT entry.
- Verify the parent notification center receives one `attendance_absence` notification.
- Verify notification has `sourceModule = attendance`, `sourceId = null`, no raw attendance ids, and no tenant/internal fields.
- Verify duplicate retry behavior where practical. If duplicate submit is rejected, use unsubmit/resubmit to assert the idempotency key prevents duplicate notification.
- Verify `notifyGuardiansOnAbsence = false` creates no notification.
- Verify ATTENDANCE in-app preference disabled creates no notification.
- Verify submit response shape remains unchanged.
- Verify no extra AttendanceSession or AttendanceEntry mutation.

Security tests:

- School A guardian cannot receive School B absence notification.
- School A parent notification center cannot see School B attendance notification.
- Response does not leak schoolId, organizationId, membershipId, roleId, deletedAt, internal actor ids, guardian ids, raw Prisma, idempotencyKey, raw AttendanceSession ids, or raw AttendanceEntry ids.
- Existing `test/security/tenancy.attendance.spec.ts` remains green.
- Existing communication notification security coverage remains green if present.

## 22. Deferred items

- Submitted correction notifications.
- Resolved/cleared incident notifications.
- LATE notification dispatch.
- EARLY_LEAVE notification dispatch.
- Teacher attendance incident notifications.
- Student attendance incident notifications.
- Broad school admin or attendance officer notifications.
- Push attendance notifications.
- Email/SMS attendance notifications.
- Attendance deep links.
- Attendance notification localization/templates.
- Excuse request notifications.
- Excuse approval/rejection notifications.
- `requireExcuseReason` enforcement.
- `autoAbsentAfterMinutes` notifications.
- Derived daily notifications.
- Persisted derived DAILY sessions.
- Historical notification backfill.
- Policy snapshotting for notification flags.
- Public opaque attendance notification source ids.
- Notification grouping by multiple absent students.

## 23. Verification evidence

Documentation-only sprint rules followed:

- No migrations run.
- No Prisma generate run.
- No heavy tests run.
- Optional build/tests not run because this audit changed documentation only.

Required lightweight checks:

- `git status --short --untracked-files=all`: PASS - output: `?? docs/sprint-att-pol-2k-guardian-absence-notification-dispatch-audit.md`
- `git diff --name-only`: PASS - no tracked-file output because the new documentation file is untracked.
- `git diff --stat`: PASS - no tracked-file output because the new documentation file is untracked.
- `git diff --check`: PASS - no whitespace errors.

Optional read-only checks:

- `npm run build`: NOT_RUN
- `npm run test -- attendance --runInBand`: NOT_RUN
- `npm run test -- communication --runInBand`: NOT_RUN
- `npm run test -- parent-app --runInBand`: NOT_RUN
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`: NOT_RUN

## 24. Final verdict

READY_FOR_ATT_POL_2L_IMPLEMENTATION.

ATT-POL-2L can safely implement narrow runtime dispatch if it stays within this scope:

- roll-call submit only;
- guardian/parent ABSENT only;
- linked session policy only;
- `notifyGuardiansOnAbsence` only;
- in-app only;
- ATTENDANCE preference-aware;
- idempotent with internal Communication notification key;
- `sourceId = null`;
- best-effort after durable submit;
- no corrections, draft save, derived daily, teacher/student/admin audiences, push/email/SMS, or response contract changes.

No recipient-resolution, module-architecture, or schema blocker was found for this narrow scope.
