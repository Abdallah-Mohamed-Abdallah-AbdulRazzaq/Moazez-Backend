# DISMISSAL-REALTIME-1A - Queue Realtime Events Closeout

## Sprint name

DISMISSAL-REALTIME-1A - Queue Realtime Events

## Baseline commit

`5be714fb feat: add dismissal notification runtime`

HEAD matched the expected baseline at start.

## Files changed

- `src/infrastructure/realtime/realtime-event-names.ts`
- `src/infrastructure/realtime/tests/realtime-event-names.spec.ts`
- `src/modules/dismissal/dismissal.module.ts`
- `src/modules/dismissal/realtime/dismissal-realtime-events.service.ts`
- `src/modules/dismissal/realtime/dismissal-realtime.presenter.ts`
- `src/modules/dismissal/realtime/dismissal-realtime.repository.ts`
- `src/modules/dismissal/requests/application/update-dismissal-request-status.use-case.ts`
- `src/modules/dismissal/requests/application/deliver-dismissal-request.use-case.ts`
- `src/modules/dismissal/waiting-students/application/confirm-student-arrival.use-case.ts`
- `src/modules/dismissal/notifications/application/mark-dismissal-notification-read.use-case.ts`
- `src/modules/dismissal/notifications/application/mark-all-dismissal-notifications-read.use-case.ts`
- `src/modules/parent-app/parent-app.module.ts`
- `src/modules/parent-app/smart-pickup/application/create-parent-smart-pickup-request.use-case.ts`
- `src/modules/parent-app/smart-pickup/application/cancel-parent-smart-pickup-request.use-case.ts`
- `test/e2e/dismissal-realtime-events.e2e-spec.ts`
- `test/security/tenancy.dismissal-realtime.spec.ts`
- `docs/sprint-dismissal-realtime-1a-queue-events-closeout.md`

## Schema changes

None.

## Migration changes

None.

## Permission changes

None.

## Routes/gateways added

No REST routes were added.

No new gateway was added. The existing Socket.IO gateway under `/api/v1/realtime` is reused through `RealtimePublisherService`.

## Realtime event names

- `dismissal.request.created`
- `dismissal.request.cancelled`
- `dismissal.request.status_changed`
- `dismissal.request.arrival_confirmed`
- `dismissal.request.delivered`
- `dismissal.queue.changed`
- `parent.smart_pickup.request.changed`
- `dismissal.notification.created`
- `dismissal.notification.read`
- `dismissal.notifications.read_all`

## Event sources

- Parent request creation emits request created, queue changed, parent request changed, and staff notification created after the creation transaction and audit succeed.
- Parent cancellation emits request cancelled, queue changed, and parent request changed only for changed cancellations.
- Staff status transition emits status changed, queue changed, and parent request changed only when the status actually changes.
- Arrival confirmation emits arrival confirmed, queue changed, and parent request changed only for `CALLED` or `MOVING` to `AT_GATE`.
- Delivery emits delivered, queue changed, and parent request changed only after successful handover.
- Dismissal notification read emits notification read to the current actor.
- Dismissal notification read-all emits read-all to the current actor only when unread rows changed.

## Staff recipient behavior

Staff queue recipients are resolved from active `DismissalStaffAssignment` rows. Matching requires same school, active dismissal staff user and membership, active non-deleted assignment, valid assignment time window, and matching gate/classroom/section/grade/stage dimensions.

Events are sent to per-user rooms through `publishToUser`; no school-wide queue broadcast is used.

## Parent recipient behavior

Parent smart-pickup events are sent only to `DismissalRequest.requestedById`.

Other guardians, delegates, unrelated parents, and school-wide parent rooms are not targeted in this sprint.

## Notification realtime behavior

Dismissal notification created events are emitted for committed in-app dismissal staff notification rows only. Parent-facing dismissal notifications continue to rely on REST and parent smart-pickup request change events in this sprint.

Notification read/read-all events are sent only to the current actor's user room.

## Subscription/auth behavior

The existing realtime gateway authenticates sockets and auto-joins the school/user baseline rooms. No dismissal-specific subscribe command was added.

`socket.io-client` is not a project dependency, so focused e2e tests assert mutation-triggered delivery through `RealtimePublisherService.publishToUser` spies, while the security test verifies unauthenticated gateway sockets do not join tenant rooms.

## Transaction/publish behavior

Domain mutations remain transactional and REST-first.

Realtime publishing is called after the source transaction/audit path succeeds. Publisher/repository failures are caught and logged in `DismissalRealtimeEventsService` and do not roll back committed domain state.

## No-push/no-device-token behavior

No push notification sending was added.

No `CommunicationNotificationPushAttempt` creation was added.

No `AppDeviceTokenSurface.DISMISSAL_STAFF` was added.

## No-realtime-persistence behavior

No durable outbox, replay table, realtime subscription table, worker, or migration was added.

## No-leak guarantees

Realtime payload presenters expose only safe request, child, gate, notification, event reason, timestamp, and generated delivery `eventId` fields.

Payloads do not expose school IDs, organization IDs, membership/role IDs, guardian IDs, requested-by IDs, actor/staff/handover IDs, assignment IDs, pickup code/hash/salt, parent location, distance/geofence internals, client request IDs, deleted timestamps, raw metadata, room names, or socket IDs.

## Security decisions

- Reused the existing authenticated `/api/v1/realtime` gateway.
- Used per-user delivery rather than school broadcast.
- Kept dismissal staff assignment scoping in the dismissal domain.
- Kept Parent App delivery scoped to the requesting parent only.
- Kept notification realtime scoped to recipient/current actor only.
- Added no permission, seed, schema, device-token, push, chat, or file work.

## Explicit non-goals preserved

- No push sending.
- No FCM/APNS integration.
- No app-device-token surface changes.
- No schema or migration changes.
- No new permissions or seed changes.
- No chat integration.
- No file work.
- No pickup code resend/rotation/QR work.
- No delegate account creation.
- No escalation/history/read-model expansion.
- No new lifecycle states or transitions.
- No root `/api/v1/notifications`, `/api/v1/pickup`, or `/api/v1/waiting-students` routes.

## Tests added

- `test/e2e/dismissal-realtime-events.e2e-spec.ts`
- `test/security/tenancy.dismissal-realtime.spec.ts`

## Commands run

Preflight:

- `git status --short --untracked-files=all`
- `git log --oneline -10`
- `npx prisma validate`

Implementation verification:

- `npx prisma validate`
- `npx prisma generate`
- `npm run seed`
- `npm run build`
- `npm run test -- realtime-event-names --runInBand`

Focused tests:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-realtime-events.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-realtime.spec.ts`

Notification regressions:

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
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts`

Role/app regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts`

Git hygiene:

- To be run after closeout creation.

## Known follow-ups

- DISMISSAL-DELIVERY-1B - Pickup Delegate Verification Enhancements
- PARENT-DISMISSAL-1D - Parent Smart Pickup Polish / UX Contract Hardening
- DISMISSAL-NOTIFICATIONS-1B - Push Delivery / Device Tokens, only if product approves
- DISMISSAL-REALTIME-1B - Durable outbox / reconnect replay, only if product approves

## Final verdict

READY FOR REVIEW
