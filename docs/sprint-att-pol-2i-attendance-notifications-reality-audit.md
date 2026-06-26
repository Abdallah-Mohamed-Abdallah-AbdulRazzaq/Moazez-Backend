# ATT-POL-2I - Attendance Policy Notifications Reality Audit

Status: documentation-only audit and decision lock.

Final verdict: NEEDS_NOTIFICATION_INFRASTRUCTURE_FIRST.

## 1. Title and status

Sprint: ATT-POL-2I - Attendance Policy Notifications Reality Audit.

Baseline: `7baad31 feat: add derived daily absence report`.

This sprint audited notification semantics only. No runtime behavior, source code, Prisma schema, migrations, tests, package files, or commits were changed.

## 2. Baseline

Current baseline commit: `7baad31`.

Relevant completed context:

- ATT-POL-1 persisted AttendancePolicy notification flags and presenter output.
- ATT-POL-2B applied selected-period roll-call gating only.
- ATT-POL-2D added strict timetable period existence validation.
- ATT-POL-2F added draft-save-only late/early-leave threshold normalization without notifications.
- ATT-POL-2H added a report-only derived daily absence read surface without notifications.

## 3. Scope and non-goals

Scope:

- Audit current communication and notification infrastructure.
- Audit attendance event points where notification dispatch could happen later.
- Decide policy flag semantics, audience boundaries, timing, idempotency, privacy, preferences, channels, and error behavior.
- Produce a precise ATT-POL-2J plan.

Non-goals:

- No attendance notification dispatch.
- No communication notification enqueueing changes.
- No schema or migration work.
- No route, controller, app-facing, report, absence, dashboard, teacher app, parent app, or student app changes.
- No auto absent, derived daily persistence, requireExcuseReason enforcement, or notification backfill.

## 4. Sources reviewed

Required repository docs reviewed:

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
- `adr/ADR-0002-files-attachment-storage.md`
- `adr/ADR-0003-shared-query-export-contracts.md`
- `adr/School-Dashboard/sis_dashboard-attendance_backend_handoff_spec.md`
- `docs/sprint-att-pol-1-attendance-policy-contract-persistence-repair-closeout.md`
- `docs/sprint-att-pol-2a-attendance-policy-rule-application-reality-audit.md`
- `docs/sprint-att-pol-2b-selected-period-roll-call-gating-closeout.md`
- `docs/sprint-att-pol-2c-timetable-period-validation-reality-audit.md`
- `docs/sprint-att-pol-2d-timetable-period-existence-validation-closeout.md`
- `docs/sprint-att-pol-2e-threshold-semantics-reality-audit.md`
- `docs/sprint-att-pol-2f-attendance-threshold-runtime-closeout.md`
- `docs/sprint-att-pol-2g-derived-daily-missed-periods-reality-audit.md`
- `docs/sprint-att-pol-2h-derived-daily-report-only-closeout.md`

No required document was missing.

Runtime areas inspected:

- `prisma/schema.prisma`
- `src/modules/attendance/**`
- `src/modules/communication/**`
- `src/modules/app-device-tokens/**`
- `src/modules/teacher-app/**`
- `src/modules/parent-app/**`
- `src/modules/student-app/**`
- `src/modules/dashboard/**`
- `test/e2e/**`
- `test/security/**`
- existing communication, notification, attendance, parent app, student app, teacher app, and security tests by file discovery and targeted search

Runtime areas requested but not present:

- `src/modules/notifications/**` does not exist; notifications are communication-owned.
- `src/modules/identity/**` does not exist; IAM/auth and user-linked app access modules are the relevant identity surfaces.

## 5. Current notification infrastructure truth

Notification runtime is owned by `src/modules/communication`, not a separate notifications module.

Current database support:

- `CommunicationNotification` stores in-app notification records with school scope, recipient user, optional actor, source module/type/id, type, title/body, priority, status, expiry, metadata, and deliveries.
- `CommunicationNotificationDelivery` stores channel-specific delivery rows for `IN_APP`, `EMAIL`, `SMS`, and `PUSH`.
- `CommunicationNotificationPushAttempt` stores per-device push attempts with a unique `(deliveryId, deviceTokenId)` guard.
- `CommunicationNotificationPreference` stores per-user category preferences for in-app and push.
- `AppDeviceToken` stores encrypted device tokens by school, user, and app surface.

Current notification enum support:

- `CommunicationNotificationSourceModule` already includes `ATTENDANCE`.
- `CommunicationNotificationType` already includes `ATTENDANCE_ABSENCE` and `ATTENDANCE_LATE`.
- There is no `ATTENDANCE_EARLY_LEAVE` type.
- `CommunicationNotificationPreferenceCategory` includes only `MESSAGE_RECEIVED` and `ANNOUNCEMENT`; there is no attendance preference category.

Current generation support:

- `CommunicationNotificationGenerationService` generates notifications for published announcements and created messages.
- Announcement generation is queued through BullMQ with a deterministic announcement job id.
- Message notification generation runs after message creation and logs failures without failing the message write.
- Existing generation creates in-app delivery rows and optional push delivery rows.
- Existing generation filters recipients through notification preferences for announcement/message categories.
- Existing generation publishes realtime notification-created events after notification creation.
- Existing push delivery uses app device tokens and Firebase push provider infrastructure.

Current idempotency support:

- Message and announcement generation use source lookups plus advisory transaction locks in `CommunicationNotificationGenerationRepository`.
- Push jobs use delivery-based job ids.
- Push attempts are unique by delivery and device token.
- `CommunicationNotification` does not have a reusable unique idempotency key.
- `CommunicationNotification.sourceId` is nullable but is exposed by app notification presenters, so raw attendance session/entry ids should not be placed there without a deliberate public contract decision.

Current channel support:

- In-app notification records and app notification centers are implemented.
- Push delivery infrastructure is implemented for Firebase-backed device-token delivery.
- The schema has `EMAIL` and `SMS` delivery channels, but the audited communication notification generation path is in-app plus push. No attendance-ready email/SMS dispatch path was found.

Current app read support:

- Parent App, Student App, and Teacher App notification use-cases read from `CommunicationAppNotificationCenterService`.
- Parent and Student use dual alias response style; Teacher uses camel style.
- App notification presenters expose `notificationId`, `type`, `sourceModule`, `sourceId`, title/body, priority, status, timestamps, and deepLink.
- App notification category grouping currently treats only message and announcement types as named groups; attendance types fall into `other`.

## 6. Current Attendance notification truth

Attendance does not emit notifications today.

Audited attendance paths:

- Roll-call session resolve/create stores `policyId`, but does not notify.
- Draft save and targeted upsert normalize thresholds, persist draft entries, and do not notify.
- Submit changes session status to `SUBMITTED`, writes an attendance audit log, and does not notify.
- Unsubmit changes session status back to `DRAFT`, writes an audit log, and does not notify.
- Submitted entry correction updates an entry, writes an audit log, and does not notify.
- Absence correction use-cases delegate to submitted correction behavior and do not notify.
- Excuse request create, approve, and reject write audit logs and do not notify.
- Excuse approval may update matching submitted entries to `EXCUSED`, but does not notify.
- The derived daily absence report is read-only and does not notify.

Attendance policy notification flags are read for create/update/list/presenter contract persistence, but no attendance runtime path reads them for dispatch.

## 7. Policy notification flags truth

`notifyGuardiansOnAbsence`:

- Persisted on `AttendancePolicy`.
- Default is `true`.
- Returned by policy presenters.
- Existing aliases `notifyGuardians` and `notifyOnAbsent` mirror it.
- Runtime effect today: none.
- V1 semantic decision: school policy flag for guardian/parent ABSENT notifications only. It must not imply LATE or EARLY_LEAVE notifications.

`notifyTeachers`:

- Persisted on `AttendancePolicy`.
- Default is `false`.
- Returned by policy presenters.
- Runtime effect today: none.
- V1 semantic decision: audience toggle only. It should not notify teachers unless paired with an enabled notifiable status rule and a safe teacher recipient resolver.

`notifyStudents`:

- Persisted on `AttendancePolicy`.
- Default is `false`.
- Returned by policy presenters.
- Runtime effect today: none.
- V1 semantic decision: audience toggle only. Student notifications require a safe `Student.userId` recipient and product confirmation that students should receive these incidents.

`notifyOnLate`:

- Persisted on `AttendancePolicy`.
- Default is `false`.
- Returned by policy presenters.
- Runtime effect today: none.
- V1 semantic decision: status toggle for LATE notifications. It should not by itself decide audience.

`notifyOnEarlyLeave`:

- Persisted on `AttendancePolicy`.
- Default is `false`.
- Returned by policy presenters.
- Runtime effect today: none.
- V1 semantic decision: status toggle for EARLY_LEAVE notifications, but dispatch cannot be implemented cleanly before adding a notification type such as `ATTENDANCE_EARLY_LEAVE`.

Policy changes should affect future notification decisions only. They should not backfill old sessions or mutate existing notification records.

## 8. Event point evaluation

Draft save:

- Not durable because entries can be changed before submit.
- Repeated often and can be partial.
- Threshold normalization can change PRESENT to LATE/EARLY_LEAVE, but ATT-POL-2F explicitly kept notifications out.
- Decision: do not notify.

Targeted upsert:

- Delegates through draft save.
- Same non-durable behavior.
- Decision: do not notify.

Roll-call submit:

- Durable transition from `DRAFT` to `SUBMITTED`.
- Has session, entries, actor, linked session policy, scope, and submitted timestamp.
- Existing submit cannot be repeated while already submitted, but unsubmit/resubmit exists.
- Good future event point after idempotency/source-reference infrastructure exists.
- Decision: candidate for future dispatch, not safe for ATT-POL-2J runtime without infrastructure-first work.

Submitted correction:

- Durable status mutation on an already submitted entry.
- Has before/after entry state and actor.
- Existing correction does not create a separate correction row; audit log is written separately.
- Candidate for future dispatch, but needs durable event occurrence/idempotency design.
- Decision: candidate after infrastructure-first work.

Absence excuse request creation:

- Durable request event.
- Different audience and policy semantics than incident creation.
- Decision: defer to an excuse notification sprint.

Absence excuse approval/rejection:

- Durable review event.
- Approval can convert entries to `EXCUSED`, which may suppress future unresolved absence notifications but should not reuse the same policy notification flags without separate semantics.
- Decision: defer.

Derived daily report read:

- Read-only computation with no persisted status change.
- Re-reading a report could otherwise resend notifications.
- Decision: must not notify.

Future auto absent job:

- No runtime job/event exists yet.
- Decision: defer.

Future persisted derived daily creation or manual finalize:

- Would be durable only if later implemented.
- Decision: defer until that runtime exists.

## 9. Status notification semantics

ABSENT:

- Should be the first notifiable attendance status.
- Guardian notifications map to `notifyGuardiansOnAbsence`.
- Teacher/student notifications require explicit audience toggles and safe recipient resolution.
- Existing type: `ATTENDANCE_ABSENCE`.

LATE:

- Should be notifiable only when `notifyOnLate` is true and the target audience is enabled.
- Existing type: `ATTENDANCE_LATE`.
- Guardian late notifications remain product-ambiguous; the conservative V1 should not infer that `notifyGuardiansOnAbsence` covers LATE.

EARLY_LEAVE:

- Should be notifiable only when `notifyOnEarlyLeave` is true and the target audience is enabled.
- Current schema lacks an `ATTENDANCE_EARLY_LEAVE` notification type.
- Dispatch should remain deferred until the notification enum/contract is extended.

EXCUSED:

- Should not generate a new incident notification under attendance policy flags.
- It may later have an excuse workflow notification, but that is a separate product path.
- EXCUSED should suppress unresolved absence-style incident notification once an entry has already become EXCUSED before submit-time dispatch.

PRESENT:

- Should not notify.

UNMARKED:

- Should not notify.

Correction semantics:

- Correction from PRESENT/UNMARKED/EXCUSED to ABSENT can become a new notifiable incident after infrastructure exists.
- Correction from ABSENT to PRESENT or EXCUSED should not send a new incident notification; a future resolved/update notification would need separate product design.
- Correction from ABSENT to LATE/EARLY_LEAVE is a changed incident type, but the safe V1 should defer broad correction notification until idempotency and payload semantics are locked.

## 10. Audience rules

Guardians/parents:

- Guardian records have optional `userId`.
- Student-to-guardian links exist through `StudentGuardian`.
- A guardian can receive in-app/push only when linked to an active user in the current school context.
- Safest future audience: guardians for ABSENT only.
- Guardians without a user account should be skipped for app notifications.

Students:

- `Student.userId` exists and Student App notification readers use the student user id.
- Student notifications are technically resolvable, but product semantics are sensitive.
- Decision: defer student incident notifications beyond infrastructure-first work.

Teachers:

- Teacher App uses `teacherUserId` and teacher subject allocations.
- Communication announcement recipient resolution can resolve allocation teacher users for classroom scopes.
- Attendance incident teacher audience is ambiguous: homeroom teacher, subject teacher for period, all allocated teachers, or attendance officer are different products.
- Decision: defer teacher incident notifications until recipient rules are explicitly narrowed.

School admins and attendance officers:

- Role/permission-based notification audience was not found as a reusable notification recipient resolver.
- Decision: defer.

Platform admins:

- Must not be notified for school attendance incidents.

## 11. Policy flag mapping

Recommended locked interpretation:

- `notifyGuardiansOnAbsence`: guardian/parent audience receives ABSENT incident notifications only.
- `notifyTeachers`: teacher audience toggle, only meaningful with an enabled status notification and a safe teacher resolver.
- `notifyStudents`: student audience toggle, only meaningful with an enabled status notification and a safe student recipient.
- `notifyOnLate`: LATE status toggle, not an audience toggle.
- `notifyOnEarlyLeave`: EARLY_LEAVE status toggle, not an audience toggle.

Flag combinations:

- If `notifyOnLate = true` but `notifyTeachers = false` and `notifyStudents = false`, no LATE non-guardian notification should be sent in conservative V1.
- If `notifyGuardiansOnAbsence = false`, guardians should not receive ABSENT notifications even if other audience flags are true.
- If `notifyGuardiansOnAbsence = true`, guardians receive ABSENT only, not LATE or EARLY_LEAVE.
- If `notifyTeachers = true`, teacher notifications must still be constrained by status toggles and recipient rules.
- If `notifyStudents = true`, student notifications must still be constrained by status toggles and recipient rules.

Because broader audience semantics are ambiguous, ATT-POL-2J should not implement broad dispatch. The first runtime dispatch sprint after infrastructure should be narrowed to guardians ABSENT only.

## 12. Timing semantics

Decision:

- Do not notify on draft save.
- Do not notify on targeted upsert.
- Do not notify on report-only derived daily reads.
- Do not notify on old submitted sessions.
- Do not backfill notifications.
- Future durable notification timing should be roll-call submit and, after durable correction idempotency exists, submitted correction.

For submit:

- Use the `AttendanceSession.policyId` linked at session creation time.
- Do not re-resolve the currently effective policy.
- Evaluate submitted entries after all draft-time threshold normalization has already happened.
- Notify only entries whose final submitted status is notifiable.

For correction:

- Compare before and after status.
- Notify only when correction creates a new notifiable incident according to policy flags.
- Do not notify when a correction resolves an incident unless a separate resolved notification contract is approved.

## 13. Idempotency and duplicate prevention

Current infrastructure is not sufficient for safe attendance notification dispatch.

Reasons:

- `CommunicationNotification` has no unique idempotency key.
- Existing duplicate prevention is specialized to message/announcement generation through source lookups and advisory locks.
- `sourceId` is exposed by app notification presenters, so raw `AttendanceEntry.id` or `AttendanceSession.id` should not be used as the only dedupe key without accepting it as a public app contract.
- Submit can be retried at the HTTP/job layer and sessions can be unsubmitted/resubmitted.
- Corrections update the same entry row and do not create a durable correction event row that can naturally identify one correction occurrence.
- A correction to ABSENT after a previous different status should be notifiable, but duplicate retries of the same correction must not fan out duplicate notifications.

Required infrastructure before runtime dispatch:

- Add a non-public notification idempotency/source-reference contract.
- Prefer a `CommunicationNotification.idempotencyKey` or separate source-reference table with a unique school-scoped key.
- Do not expose the idempotency key in app notification presenters.
- Provide a communication-owned create-or-reuse API that accepts source module, type, recipient, title/body, internal idempotency key, safe source metadata, channel preferences, and delivery options.
- Support transaction-safe or advisory-lock-safe creation for concurrent retries.
- For submit events, use a stable idempotency key such as school plus event type plus session plus entry plus status, stored internally.
- For corrections, either add a durable correction event id or have correction audit creation return a usable event id before enabling correction notifications.

Decision:

- ATT-POL-2J should not dispatch attendance notifications yet.
- ATT-POL-2J should be infrastructure-first: add the reusable idempotency/source-reference support and attendance notification preference/type prerequisites.

## 14. Payload and privacy

Safe content for future attendance incident notifications:

- Status label such as absent or late.
- Attendance date.
- Student display name only when the recipient is allowed to know that student.
- Optional classroom/scope display name if already safe for that recipient.
- Generic call-to-action text.

Fields to avoid in title/body/data:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- password or credential fields
- internal actor/user ids
- guardian ids
- raw Prisma payloads
- storage internals
- raw signed URLs
- notification internals
- policy internals not needed by recipient
- other students' data
- teacher/admin private notes
- excuse reason or correction notes unless explicitly approved
- raw `AttendanceSession.id` or `AttendanceEntry.id` in public response fields

Metadata may be useful internally, but current app presenters do not expose notification metadata. Any future attendance deep link must be reviewed separately because source ids are currently exposed.

## 15. Preferences and opt-out

Current preference infrastructure supports:

- per-user in-app enabled
- per-user push enabled
- category defaults of enabled when no preference row exists
- categories `message_received` and `announcement`

Current preference infrastructure does not support:

- attendance category
- separate absence/late/early-leave categories
- separate parent/student/teacher attendance preference semantics
- email/SMS attendance preferences

Decision:

- User opt-out should override school policy flags for non-emergency in-app/push notifications.
- School policy flags should enable whether the school wants a notification class; they should not override user preference unless a legal/product rule explicitly requires mandatory absence notices.
- ATT-POL-2J infrastructure-first should add or decide an `ATTENDANCE` notification preference category before any dispatch.
- If attendance preference behavior remains undecided, runtime dispatch should remain blocked.

## 16. Channels

In-app:

- Implemented and tested through communication notification records and app notification centers.
- Safest future first channel.

Push:

- Implemented through app device tokens, push deliveries, push attempts, Firebase provider, and queue workers.
- Should only be enabled after attendance preference category and idempotent notification creation exist.

Email:

- Present as a delivery enum, but no audited attendance-ready notification email dispatch path was found.
- Defer.

SMS:

- Present as a delivery enum, but no audited attendance-ready SMS dispatch path was found.
- Defer.

Recommended channel decision:

- ATT-POL-2J should not dispatch.
- The first runtime dispatch sprint after infrastructure should use in-app only, with push added only if preference/category tests are green and existing push pipeline can be reused without attendance-specific leakage.

## 17. Error handling and transaction behavior

Attendance writes must remain source-of-truth.

Decision:

- Notification failures should not fail roll-call submit or correction.
- Notification work should happen after the attendance state transition, or through a transactional outbox/source-reference design if one is added.
- If enqueueing fails, attendance should remain successful and the failure should be logged with safe identifiers only.
- If a notification job later fails, retry through queue semantics.
- Do not put external push/email/SMS delivery inside the attendance write transaction.
- Do not expose notification failure details through attendance API responses.

Existing communication precedent:

- Message notification generation failures are logged without failing message creation.
- Announcement publish queues notification generation after publish and can be replayed by source.

## 18. Derived daily notifications boundary

ATT-POL-2H added report-only derived daily absences.

Decision:

- Report-only derived daily rows must not trigger notifications.
- Report reads are not durable events.
- Repeated report reads would duplicate notifications.
- Derived daily notifications should wait until a future persisted/finalized derived absence event exists, if that product path is approved.

## 19. autoAbsentAfterMinutes boundary

`autoAbsentAfterMinutes` still has no runtime event, scheduler, durable job, audit behavior, or recompute semantics in attendance.

Decision:

- No auto absent notification in ATT-POL-2J.
- Auto absent notifications remain deferred until auto absent runtime behavior exists and has its own idempotent event model.

## 20. requireExcuseReason and excuse workflow boundary

`requireExcuseReason` is persisted and returned by policy APIs but is not currently enforced.

Excuse request and review workflows are durable and audited, but they have separate product semantics from incident notifications.

Decision:

- Do not include excuse workflow notifications in ATT-POL-2J runtime dispatch.
- Excuse request, approval, rejection, and requireExcuseReason notifications should be handled in a separate excuse notification sprint after attendance incident dispatch infrastructure is safe.

## 21. Existing tests and regressions

Existing relevant test coverage:

- Communication notification generation service and repository tests.
- Communication notification queue and push queue tests.
- Communication notification push payload and delivery tests.
- Communication notification preference service tests.
- Communication app notification center and presenter tests.
- Parent, Student, and Teacher notification app use-case tests.
- Attendance policy use-case and presenter tests for persisted flags.
- Attendance roll-call, absences, reports, and security tests.
- Communication E2E tests for announcement notifications.
- Attendance tenancy security tests.

Gaps for attendance notification dispatch:

- No attendance notification event mapping tests.
- No attendance recipient resolver tests.
- No attendance notification idempotency tests.
- No attendance notification payload no-leak tests.
- No attendance preference category tests.
- No attendance push deep-link tests.
- No tests for no notification on draft save.
- No tests for no notification on derived daily report reads.
- No tests for submit/correction duplicate prevention.

## 22. Recommended ATT-POL-2J implementation plan

Recommended outcome: Option C - do not implement runtime dispatch yet; first add notification idempotency/source-reference infrastructure.

Exact ATT-POL-2J scope:

- Add a communication-owned idempotent notification creation contract.
- Add a non-public idempotency/source-reference field or table with school-scoped uniqueness.
- Add or decide an attendance notification preference category.
- Add the missing early-leave notification type only if ATT-POL-2J explicitly prepares full status coverage; otherwise keep early-leave dispatch deferred.
- Add a narrow attendance notification mapping domain helper that can be unit tested without dispatching from attendance runtime.
- Do not call the helper from roll-call submit/correction yet unless idempotency and preference behavior are completed in the same sprint.
- Keep Attendance controllers and routes unchanged.

Likely files for ATT-POL-2J infrastructure-first:

- `prisma/schema.prisma`
- new Prisma migration under `prisma/migrations/**`
- `src/modules/communication/domain/communication-notification-generation-domain.ts`
- `src/modules/communication/domain/communication-notification-preference-domain.ts`
- `src/modules/communication/presenters/communication-notification-preference.presenter.ts`
- `src/modules/communication/application/communication-notification-generation.service.ts` or a new generic command service
- `src/modules/communication/infrastructure/communication-notification-generation.repository.ts` or a new notification command repository
- `src/modules/communication/presenters/communication-app-notification.presenter.ts` if attendance deep links or source id hiding is needed
- `src/modules/communication/tests/**`
- `test/e2e/communication-realtime-announcements-notifications.e2e-spec.ts` or a focused notification E2E
- `test/security/tenancy.attendance.spec.ts` only when attendance runtime dispatch begins

Schema/migration:

- Yes, if adding a durable non-public idempotency key or source-reference table.
- No attendance schema changes are needed.

Algorithm for the future first runtime dispatch sprint after infrastructure:

1. On roll-call submit, after the session is submitted, load the submitted session with entries and linked policy.
2. Use `session.policyId`; do not re-resolve current effective policy.
3. Consider only final submitted entry statuses.
4. For the first runtime dispatch, include ABSENT guardian notifications only.
5. Resolve guardians through current-school `StudentGuardian -> Guardian.userId`, filter active users/memberships, and deduplicate recipients.
6. Apply `notifyGuardiansOnAbsence`.
7. Apply attendance notification preferences.
8. Create notifications through the idempotent communication API using a non-public idempotency key.
9. Create in-app delivery rows; push only if attendance preference and push delivery are explicitly enabled.
10. Log failures safely and do not fail attendance submit.

Correction behavior for later:

- Enable only after a durable correction event id or equivalent idempotency key is available.
- Notify only when a correction creates a new ABSENT incident for an eligible recipient.

Response behavior:

- Attendance submit/correction responses should not gain a notification envelope.
- Notification records are read through existing app notification centers.

Observability:

- Log skipped reasons such as no recipients, policy disabled, preference disabled, no idempotency key, and duplicate source.
- Do not log tenant/internal ids in user-visible errors.

## 23. Tests required for ATT-POL-2J

Infrastructure-first tests:

- Unit test idempotent notification create-or-reuse for the same school/key.
- Unit test same key in different schools does not collide.
- Unit test notification idempotency key is not exposed by app presenters.
- Unit test sourceId hiding or safe sourceId behavior for attendance-shaped notifications.
- Unit test attendance preference category normalization and presentation if added.
- Unit test default attendance preferences.
- Unit test user opt-out filtering for attendance category.
- Unit test push deliveries are skipped when push is disabled.
- Unit test reusable command API creates in-app delivery rows exactly once.
- Unit test concurrent duplicate creation behavior where practical.

Future runtime dispatch tests:

- Unit test policy flag mapping.
- Unit test guardian recipient resolution.
- Unit test student/teacher recipient resolution if those audiences are later enabled.
- Unit test no notification on draft save and targeted upsert.
- Unit test no notification on derived daily report reads.
- Unit test submit creates guardian ABSENT notifications only when enabled.
- Unit test submit does not notify PRESENT, EXCUSED, UNMARKED, or below-scope statuses.
- Unit test LATE/EARLY_LEAVE remain deferred or are gated by exact status flags.
- Unit test duplicate submit/job retry does not create duplicate notifications.
- Unit test correction from non-incident to ABSENT is idempotent if correction dispatch is enabled.
- Unit test payload does not leak tenant/internal fields.

E2E/security tests:

- Communication notification E2E remains green.
- Attendance foundation and attendance security remain green.
- School A cannot see School B attendance notifications.
- School A cannot derive recipients from School B attendance sessions, students, guardians, policies, or notification records.
- Parent/Student/Teacher notification lists remain scoped to the actor.
- Response does not include `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, internal actor ids, guardian ids, raw Prisma payloads, storage internals, or notification internals.

## 24. Deferred items

- Attendance runtime notification dispatch.
- Roll-call submit ABSENT guardian notifications.
- Submitted correction notifications.
- LATE notifications.
- EARLY_LEAVE notification type and dispatch.
- Teacher attendance incident notifications.
- Student attendance incident notifications.
- Broad school admin or attendance officer notifications.
- Email delivery.
- SMS delivery.
- Attendance push deep links.
- Attendance notification preference UX beyond infrastructure.
- Excuse request notifications.
- Excuse approval/rejection notifications.
- requireExcuseReason enforcement.
- autoAbsentAfterMinutes notifications.
- Derived daily notifications.
- Persisted derived DAILY sessions.
- Historical notification backfill.
- Resolved/cleared incident notifications.
- Notification localization/templates for attendance.

## 25. Verification evidence

Required checks:

- `git status --short --untracked-files=all`: PASS - output: `?? docs/sprint-att-pol-2i-attendance-notifications-reality-audit.md`
- `git diff --name-only`: PASS - no tracked file output.
- `git diff --stat`: PASS - no tracked diff output.
- `git diff --check`: PASS - no whitespace errors.

Optional checks:

- `npm run build`: NOT_RUN - documentation-only audit; no runtime files changed.
- `npm run test -- attendance --runInBand`: NOT_RUN - documentation-only audit; no runtime files changed.
- `npm run test -- communication --runInBand`: NOT_RUN - documentation-only audit; no runtime files changed.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`: NOT_RUN - documentation-only audit; no runtime files changed.

## 26. Final verdict

Final verdict: NEEDS_NOTIFICATION_INFRASTRUCTURE_FIRST.

Reason:

- Communication notification records, app notification centers, push delivery, and preferences exist.
- Attendance has no current notification dispatch integration.
- Attendance policy notification flags are persisted but runtime-unused.
- Existing communication generation is source-specific and does not provide a reusable non-public idempotency key.
- Current app notification presenters expose `sourceId`, which makes raw attendance session/entry ids unsafe as the sole dedupe/source contract.
- Preferences lack an attendance category.
- The schema lacks an early-leave notification type.
- Correction events lack a durable occurrence id suitable for retry-safe notification dedupe.

ATT-POL-2J should therefore be infrastructure-first, not attendance runtime dispatch. The first safe runtime dispatch after that should be narrowed to in-app guardian ABSENT notifications on roll-call submit, with no draft-save, read-report, derived-daily, auto-absent, teacher, student, email, SMS, or correction dispatch until the required contracts are in place.
