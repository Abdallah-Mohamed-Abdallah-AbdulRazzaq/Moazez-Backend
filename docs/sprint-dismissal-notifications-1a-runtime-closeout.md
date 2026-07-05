# DISMISSAL-NOTIFICATIONS-1A — Dismissal Notifications Runtime Closeout

## Sprint Name

DISMISSAL-NOTIFICATIONS-1A — Dismissal Notifications Runtime

## Baseline Commit

`b22f32d4 feat: add parent smart pickup recent calls and cancel`

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260705210000_dismissal_notifications_runtime/migration.sql`
- `src/modules/communication/domain/communication-notification-domain.ts`
- `src/modules/dismissal/dismissal.module.ts`
- `src/modules/dismissal/notifications/**`
- `src/modules/dismissal/requests/infrastructure/dismissal-requests-write.repository.ts`
- `src/modules/dismissal/requests/infrastructure/dismissal-requests-delivery.repository.ts`
- `src/modules/dismissal/shared/dismissal.errors.ts`
- `src/modules/parent-app/smart-pickup/infrastructure/parent-smart-pickup-request.repository.ts`
- `src/modules/parent-app/smart-pickup/infrastructure/parent-smart-pickup-recent-calls.repository.ts`
- `test/e2e/dismissal-notifications-runtime.e2e-spec.ts`
- `test/security/tenancy.dismissal-notifications.spec.ts`
- `test/e2e/dismissal-request-lifecycle-transitions.e2e-spec.ts`
- `test/e2e/dismissal-delivery-handover.e2e-spec.ts`
- `test/security/tenancy.dismissal-transitions.spec.ts`
- `test/security/tenancy.dismissal-delivery.spec.ts`

The four existing lifecycle/delivery regression specs were updated only to delete notification rows for their own test schools before user cleanup, because this sprint intentionally adds notification rows to those flows.

## Schema Changes

Enum-only Communication notification extension:

- Added `DISMISSAL` to `CommunicationNotificationSourceModule`.
- Added `DISMISSAL_REQUEST_CREATED`.
- Added `DISMISSAL_REQUEST_CANCELLED`.
- Added `DISMISSAL_REQUEST_CALLED`.
- Added `DISMISSAL_REQUEST_READY`.
- Added `DISMISSAL_REQUEST_HANDED_OVER`.

No new tables, columns, user types, permissions, device-token surfaces, push-attempt runtime, or realtime models were added.

## Migration Changes

Created enum-only migration:

- `20260705210000_dismissal_notifications_runtime`

`npx prisma migrate dev --name dismissal_notifications_runtime` was attempted, but local migration drift blocked it and requested a reset. No reset was run. The enum migration SQL was applied locally with `npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260705210000_dismissal_notifications_runtime/migration.sql`.

## Permission Changes

None.

Existing permissions are used:

- `dismissal.notifications.view`
- `dismissal.notifications.manage`

Seed files were not changed.

## Routes Added

- `GET /api/v1/dismissal/notifications`
- `PATCH /api/v1/dismissal/notifications/:id/read`
- `PATCH /api/v1/dismissal/notifications/read-all`

All routes use `JwtAuthGuard`, `ScopeResolverGuard`, `PermissionsGuard`, and exact permission metadata.

## Notification Events Emitted

- Parent request created emits `DISMISSAL_REQUEST_CREATED` for matching assigned dismissal staff.
- Parent request cancelled emits `DISMISSAL_REQUEST_CANCELLED` for matching assigned dismissal staff.
- Request status `CALLED` emits `DISMISSAL_REQUEST_CALLED` for the requesting parent.
- Request status `READY` emits `DISMISSAL_REQUEST_READY` for the requesting parent.
- Delivery to `HANDED_OVER` emits `DISMISSAL_REQUEST_HANDED_OVER` for the requesting parent.

Idempotency keys prevent duplicate notifications for request retries, already-cancelled retries, and same-status no-op transitions.

## Staff Notification Recipient Behavior

Staff recipients are resolved from active `DismissalStaffAssignment` rows in the current school. Matching respects active membership, `DISMISSAL_STAFF` user type, time windows, soft delete, gate scope, and academic scope dimensions. Unassigned or non-matching staff receive no notifications.

## Parent Notification Recipient Behavior

Parent notifications are sent only to the persisted `DismissalRequest.requestedById` parent user when that user resolves as an active parent. No other guardians or pickup delegates are notified in this sprint.

## Notification Persistence Behavior

Dismissal notifications reuse `CommunicationNotification` and `CommunicationNotificationDelivery`.

Each recipient receives one in-app notification row per event and one delivered `IN_APP` delivery row. Notification creation runs inside the existing request/cancel/status/delivery DB transaction where practical. No external network calls are made.

## Notification Center Behavior

The Dismissal notification center is recipient-scoped to the current actor and current school. It supports `unreadOnly`, `type`, `page`, `limit`, and `created_at_desc` / `created_at_asc` sorting.

## Mark Read / Read-All Behavior

`PATCH /dismissal/notifications/:id/read` marks only the current actor's current-school Dismissal notification and is idempotent.

`PATCH /dismissal/notifications/read-all` marks only the current actor's unread current-school Dismissal notifications.

Cross-school and other-recipient notification IDs return safe 404.

## No-Push / No-Device-Token Behavior

No `CommunicationNotificationPushAttempt` rows are created for Dismissal events. No push senders, device-token registration, or `AppDeviceTokenSurface.DISMISSAL_STAFF` support was added.

## No-Realtime Behavior

No realtime/socket events, queues, or route surfaces were added for Dismissal notifications.

## No-Leak Guarantees

Dismissal notification presenters expose only safe notification id/type/title/body timestamps, safe public request id/status, child display labels, and gate labels.

Responses and metadata avoid school IDs, organization IDs, membership IDs, role IDs, guardian IDs, internal user IDs, requestedBy IDs, actor/staff/handover IDs, assignment IDs, event IDs, pickup codes/hashes/salts, parent location/geofence/distance fields, client request IDs, deletedAt, raw metadata, raw relations, audit internals, and storage internals.

## Security Decisions

- School-side notification center remains recipient-scoped even for non-DISMISSAL_STAFF school actors with permission.
- Parent users do not receive dismissal notification center permissions.
- Dismissal Staff still receives no `communication.*` permissions.
- Parent notification records are persisted through Communication infrastructure, but no new Parent notification routes were added.

## Explicit Non-Goals Preserved

- No push notification sending.
- No `CommunicationNotificationPushAttempt` creation.
- No FCM/APNS integration.
- No `AppDeviceTokenSurface.DISMISSAL_STAFF`.
- No dismissal staff device-token registration.
- No realtime/socket events.
- No chat/files/conversation integration.
- No parent recent-calls/cancel behavior changes beyond notification side effects.
- No pickup-code resend, rotation, QR rendering, or delegate account flow.
- No manual escalation, delayed escalation, or history endpoint work.
- No root `/api/v1/notifications`, `/api/v1/pickup`, or `/api/v1/waiting-students` route.

## Tests Added

- `test/e2e/dismissal-notifications-runtime.e2e-spec.ts`
- `test/security/tenancy.dismissal-notifications.spec.ts`

Existing lifecycle/delivery regression tests received notification cleanup only.

## Commands Run

Preflight:

- `git status --short --untracked-files=all`
- `git log --oneline -10`
- `npx prisma validate`

Migration:

- `npx prisma migrate dev --name dismissal_notifications_runtime` failed due existing local drift and requested reset.
- `npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260705210000_dismissal_notifications_runtime/migration.sql` succeeded.

Implementation verification:

- `npx prisma validate`
- `npx prisma generate`
- `npm run seed`
- `npm run build`

Focused tests:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-notifications-runtime.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-notifications.spec.ts`

Parent regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-request.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-recent-calls-cancel.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-cancel.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-readiness.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup.spec.ts`

Dismissal regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-active-requests-queue.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-calls.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-request-lifecycle-transitions.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-transitions.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-waiting-students-arrival.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-waiting.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-delivery-handover.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-delivery.spec.ts`

Core/staff/IAM regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts`

Role/app regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts`

## Known Follow-Ups

- DISMISSAL-REALTIME-1A — Queue Realtime Events
- DISMISSAL-DELIVERY-1B — Pickup Delegate Verification Enhancements
- PARENT-DISMISSAL-1D — Parent Smart Pickup Polish / UX Contract Hardening
- DISMISSAL-NOTIFICATIONS-1B — Push Delivery / Device Tokens, only if product approves

## Final Verdict

READY FOR REVIEW
