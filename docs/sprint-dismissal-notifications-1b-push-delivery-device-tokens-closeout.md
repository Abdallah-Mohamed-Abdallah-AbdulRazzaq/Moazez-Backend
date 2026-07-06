# DISMISSAL-NOTIFICATIONS-1B — Push Delivery / Device Tokens Closeout

## Sprint Name

DISMISSAL-NOTIFICATIONS-1B — Push Delivery / Device Tokens.

## Baseline Commit

Expected and actual baseline: `b0157781 chore: harden dismissal operations`.

## Files Changed

- Prisma schema/migration: `prisma/schema.prisma`, `prisma/migrations/20260706170000_dismissal_staff_device_token_surface/migration.sql`.
- Existing role seed: `prisma/seeds/02-system-roles.seed.ts`.
- Dismissal runtime: `src/modules/dismissal/**` notification token registration, push enqueue bridge, realtime integration, module registration, and local error.
- Communication push runtime: `src/modules/communication/**` payload mapping, recipient token-surface targeting, queue export, push repository select.
- App device token presenter: `src/modules/app-device-tokens/domain/app-device-token-domain.ts`.
- Firebase push guardrail: `src/infrastructure/push/firebase/firebase-push.provider.ts`.
- Docs: route inventory, FE contract, FE implementation guide, production readiness audit, `ERROR_CATALOG.md`, `OBSERVABILITY.md`, this closeout.
- Tests: new focused e2e/security tests plus stale security assertions updated to the new token-surface baseline.

## Schema Changes

- Added `DISMISSAL_STAFF` to `AppDeviceTokenSurface`.
- No request status, request table, notification table, outbox, provider credential, or retry-scheduler schema was added.

## Migration Changes

- Added enum-only migration `20260706170000_dismissal_staff_device_token_surface`.
- `npx prisma migrate dev --name dismissal_staff_device_token_surface` was blocked by pre-existing shadow database replay drift on `20260706140000_dismissal_expiry_threshold`.
- Applied with `npx prisma db execute --file prisma\migrations\20260706170000_dismissal_staff_device_token_surface\migration.sql --schema prisma\schema.prisma` and resolved with `npx prisma migrate resolve --applied 20260706170000_dismissal_staff_device_token_surface`.

## Permission Changes

- No new permission catalog entry was added.
- Existing `app.device_tokens.manage` was added to `DISMISSAL_STAFF_PERMISSIONS`, because the existing per-app device-token route architecture requires that permission for token registration.

## Routes Added

- `POST /api/v1/dismissal/notifications/device-tokens`
- `DELETE /api/v1/dismissal/notifications/device-tokens/current`

These follow the existing parent/teacher/student per-surface token route pattern. No public push-send/test-provider route was added.

## Routes Changed

- Existing `GET /api/v1/dismissal/notifications`, `PATCH /api/v1/dismissal/notifications/:id/read`, and `PATCH /api/v1/dismissal/notifications/read-all` remain unchanged.

## Runtime Source Changes

- Dismissal notification post-commit publication now creates idempotent `PUSH` delivery rows and enqueues existing communication push jobs for supported Dismissal notification rows.
- Dismissal token registration uses the shared `AppDeviceTokenService`.
- Communication push delivery now selects the correct app surface for Dismissal recipients: `DISMISSAL_STAFF` for staff and `PARENT` for parent recipients.

## Device-Token Surface Behavior

- `AppDeviceTokenSurface.DISMISSAL_STAFF` is supported and presented publicly as `dismissal_staff`.
- Token registration requires `UserType.DISMISSAL_STAFF`; parent, teacher, and student actors are rejected with `dismissal.notification.invalid_actor_type`.
- Raw tokens are stored encrypted/hashed by the existing device-token module and are not returned.

## Push Provider / Adapter Architecture

- Reuses existing Firebase/FCM provider abstraction, existing communication push queue, existing push delivery rows, and existing per-token push attempts.
- No new package, provider credential, `.env`, or provider-specific route was added.
- Provider-disabled/dry-run behavior remains the existing communication push behavior.

## Push Payload Contract

Dismissal staff payload data:

- `module=dismissal`
- `surface=dismissal_staff`
- `type=request_created|request_cancelled|request_called|request_ready|request_handed_over|request_expired`
- `notificationId`
- `requestId`
- `status`
- `screen=dismissal.notifications`

Parent Smart Pickup payload data:

- `module=parent_smart_pickup`
- `surface=parent`
- same safe public type/request/status fields
- `screen=parent.smart_pickup.recent_calls`

## Recipient Targeting Behavior

- Staff push is based on existing notification recipient rows, which are already assignment-scoped and school-scoped.
- Parent push uses existing parent notification recipient rows and the existing Parent app token surface.
- Cross-school and non-recipient users are not targeted.

## Delivery Attempt Tracking Behavior

- Reuses `CommunicationNotificationDelivery` with `PUSH` channel and `CommunicationNotificationPushAttempt`.
- One push delivery is created per notification; queue job id is derived from delivery id.

## Failure Handling Behavior

- Push enqueue/provider failures are best-effort and do not roll back Dismissal request mutations, notification rows, audit rows, or realtime.
- Invalid/unregistered provider errors use the existing token failure/deactivation convention.

## Idempotency Behavior

- Existing notification idempotency keys prevent duplicate notification rows.
- Push delivery creation checks for existing `PUSH` delivery rows and creates only missing rows.
- Read/read-all do not create push deliveries.
- Same-status lifecycle no-ops, cancel retry `changed=false`, and expiry reruns do not duplicate push.

## Parent Push Behavior

- Implemented via existing Parent App token surface.
- No Smart Pickup-specific notification route was added.

## Staff Push Behavior

- Implemented for assignment-matching Dismissal Staff notification recipients.
- Dismissal Staff can register/unregister tokens under the Dismissal notifications namespace.

## No-Leak Verification

- Push payloads are limited to safe title/body/data navigation hints.
- Firebase provider forbidden data keys now include Dismissal-sensitive fields such as pickup code, pickup-recipient token, parent coordinates, guardian ids, requestedById, staffUserId, assignmentId, raw metadata, and token material.

## Security Verification

- New security spec covers route metadata, guard chain, role seed, actor-type checks, no raw token response, forbidden push routes, and payload key guardrails.
- Older stale security assertions were updated only for the now-intentional `DISMISSAL_STAFF` app-device-token surface.

## Docs Updated

- `docs/dismissal-api-route-inventory-v1.md`
- `docs/dismissal-fe-contract-v1.md`
- `docs/dismissal-frontend-implementation-guide-v1.md`
- `docs/dismissal-production-readiness-audit-v1.md`
- `ERROR_CATALOG.md`
- `OBSERVABILITY.md`

## Tests Added

- `test/e2e/dismissal-push-notifications.e2e-spec.ts`
- `test/security/tenancy.dismissal-push-notifications.spec.ts`

## Commands Run

- `git status --short --untracked-files=all`
- `git log --oneline -12`
- `npx prisma validate`
- `npx prisma generate`
- `npx prisma migrate dev --name dismissal_staff_device_token_surface` (blocked by existing shadow drift)
- `npx prisma db execute --file prisma\migrations\20260706170000_dismissal_staff_device_token_surface\migration.sql --schema prisma\schema.prisma`
- `npx prisma migrate resolve --applied 20260706170000_dismissal_staff_device_token_surface`
- `npm run seed`
- `npm run build`
- `npx tsc -p tsconfig.build.json --noEmit`
- Focused e2e/security tests for this sprint
- Notification, realtime, expiry, golden-path, FE contract, production-hardening, queue, lifecycle, waiting, delivery, delegate, history/escalation, parent Smart Pickup, Dismissal core/staff/IAM, parent/teacher/student role regressions
- Communication push delivery and payload builder unit tests

## Regressions Run

Focused and requested regression results passed and are recorded in the final Codex response.

## Known Issues

- Local `migrate dev` shadow replay remains blocked by pre-existing Dismissal migration drift unrelated to this enum migration.
- A first `npm run build` attempt failed before compilation with `ENOTEMPTY` while Nest tried to remove a generated `dist` subdirectory. After verifying the resolved `dist` path was inside the workspace and removing `dist`, `npm run build` passed.

## Next Required Completion Sprint

DISMISSAL-FINAL-ACCEPTANCE-1A — End-to-End Product Acceptance.

## Final Verdict

READY FOR REVIEW.
