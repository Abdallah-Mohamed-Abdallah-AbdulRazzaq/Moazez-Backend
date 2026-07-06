# DISMISSAL-DELIVERY-1B - Pickup Delegate Verification Enhancements Closeout

## Sprint name

DISMISSAL-DELIVERY-1B - Pickup Delegate Verification Enhancements

## Baseline commit

Expected and actual baseline:

```text
8ef57d99 feat: add dismissal realtime queue events
```

## Files changed

- `src/modules/dismissal/dismissal.module.ts`
- `src/modules/dismissal/requests/application/deliver-dismissal-request.use-case.ts`
- `src/modules/dismissal/requests/application/list-dismissal-pickup-recipients.use-case.ts`
- `src/modules/dismissal/requests/application/pickup-recipient-token.service.ts`
- `src/modules/dismissal/requests/controller/dismissal-requests.controller.ts`
- `src/modules/dismissal/requests/dto/deliver-dismissal-request.dto.ts`
- `src/modules/dismissal/requests/dto/list-pickup-recipients.dto.ts`
- `src/modules/dismissal/requests/infrastructure/dismissal-requests-delivery.repository.ts`
- `src/modules/dismissal/requests/presenter/dismissal-request-queue.presenter.ts`
- `src/modules/dismissal/requests/presenter/dismissal-pickup-recipients.presenter.ts`
- `src/modules/dismissal/shared/dismissal.errors.ts`
- `test/e2e/dismissal-delivery-delegate-verification.e2e-spec.ts`
- `test/security/tenancy.dismissal-delivery-delegates.spec.ts`
- `test/e2e/dismissal-delivery-handover.e2e-spec.ts`
- `test/security/tenancy.dismissal-delivery.spec.ts`
- `test/e2e/dismissal-realtime-events.e2e-spec.ts`
- `test/e2e/dismissal-notifications-runtime.e2e-spec.ts`
- `docs/sprint-dismissal-delivery-1b-pickup-delegate-verification-closeout.md`

Regression specs were updated only to use the new verified recipient token contract and safe delivery event metadata.

## Schema changes

None.

## Migration changes

None.

## Permission changes

None.

The new pickup-recipient discovery route and existing delivery route both use the existing permission:

```text
dismissal.requests.deliver
```

No seed files were changed.

## Routes added

```text
GET /api/v1/dismissal/requests/:id/pickup-recipients
```

## Routes updated

```text
POST /api/v1/dismissal/requests/:id/deliver
```

Delivery now requires `pickupRecipientToken`. Free-form `receiverName` and `receiverRelation` are not accepted by the DTO contract.

## Pickup recipient discovery behavior

`GET /pickup-recipients` returns safe recipient choices only for current-school, READY, assignment-visible requests.

It returns requesting guardian only when `allowDelegatePickup=false`, and returns requesting guardian plus other can-pickup student guardians when `allowDelegatePickup=true`.

Non-READY active requests return `dismissal.delivery.not_ready`. Terminal, deleted, cross-school, and assignment-hidden requests return safe `dismissal.delivery.not_found`.

## Pickup recipient token behavior

Recipient tokens are stateless HMAC-signed opaque tokens using the existing JWT access secret. Tokens bind to request, school, student, student-guardian link, guardian, and issued timestamp. Tokens expire after 15 minutes and are not persisted.

Delivery rejects missing, malformed, tampered, expired, cross-request, cross-school, and stale-recipient tokens with stable delivery error codes.

## Delegate policy behavior

Secure default is `allowDelegatePickup=false` when settings are missing.

When disabled, only the requesting guardian linked by `Guardian.userId == DismissalRequest.requestedById` can be used.

When enabled, any current StudentGuardian recipient with `Guardian.canPickup=true` and non-deleted guardian record can be used.

## Delivery verification behavior

Delivery still requires `READY`, current-school scope, assignment visibility for dismissal staff, `dismissal.requests.deliver`, and pickup code verification when policy requires it.

After pickup code verification, delivery verifies the pickup recipient token, re-resolves the live StudentGuardian/Guardian link, rechecks `Guardian.canPickup=true`, checks active student/enrollment eligibility, and applies delegate policy before mutating.

Successful delivery stores verified receiver display name and relation from the guardian record, not request body input.

## Event behavior

Successful verified delivery still creates one `REQUEST_STATUS_CHANGED` event from `READY` to `HANDED_OVER`.

Event metadata contains only safe booleans/labels:

```text
pickupRecipientVerified=true
pickupRecipientSource=guardian_link
```

Failed recipient verification creates no status event.

## Audit behavior

Successful delivery audit remains `dismissal.request.delivered`. Audit `after` includes status, pickup-code verification, pickup-recipient verification, recipient source, and receiver/note presence booleans only.

Failed recipient verification writes no success audit.

## Notification/realtime behavior

Successful verified delivery preserves existing parent notification and realtime delivery behavior. Failed recipient verification does not create notifications and does not publish realtime events.

No push/device-token work was added.

## No-leak guarantees

Recipient discovery and delivery responses do not expose:

```text
schoolId
organizationId
membershipId
roleId
guardianId
guardian.userId
studentGuardianId
student.userId
student.applicationId
enrollmentId
requestedById
actorUserId
staffUserId
handedOverById
assignment IDs
internal event IDs
pickupCode
pickupCodeHash
pickupCodeSalt
parentLatitude
parentLongitude
distanceMeters
geofencePassed
clientRequestId
deletedAt
raw phone
raw relation objects
audit/storage internals
```

The recipient token appears only in the pickup-recipient discovery response and is never echoed by delivery, events, audit, notification, or realtime payloads.

## Security decisions

- Controllers remain thin and contain no Prisma/business logic.
- Current school scope is resolved server-side.
- Staff visibility reuses active assignment matching.
- Recipient selection never accepts school, student, guardian, student-guardian, requested-by, actor, handover actor, status, gate, receiver name, or receiver relation from the delivery body.
- No new permission, seed, schema, migration, user type, delegate model, external delegate login, file, chat, push, or device-token surface was added.

## Explicit non-goals preserved

Not implemented:

- external PickupDelegate account creation
- PickupDelegate login surface
- temporary external delegate invitation
- delegate OTP or QR
- pickup-code resend, rotation, or QR rendering
- identity document upload
- files
- chat or staff-parent communication
- push notifications
- device-token changes
- new lifecycle states or transitions
- handover from non-READY
- staff escalation
- history endpoint
- root `/api/v1/pickup`
- root `/api/v1/waiting-students`
- root `/api/v1/notifications`

## Tests added

- `test/e2e/dismissal-delivery-delegate-verification.e2e-spec.ts`
- `test/security/tenancy.dismissal-delivery-delegates.spec.ts`

Existing delivery, realtime, and notification regression specs were updated for the verified-recipient delivery contract.

## Commands run

Preflight:

- `git status --short --untracked-files=all` - clean
- `git log --oneline -10` - confirmed `8ef57d99 feat: add dismissal realtime queue events`
- `npx prisma validate` - passed

Implementation verification:

- `npm run build` - first run timed out and left build child processes; stopped the stale node processes and reran
- `npm run build` - failed once on a TypeScript enum helper issue; fixed and reran
- `npm run build` - passed
- `npx prisma validate` - passed
- `npx prisma generate` - passed
- `npm run seed` - passed, seeded 222 permissions and 7 system roles
- `npm run build` - passed

Focused tests:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-delivery-delegate-verification.e2e-spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-delivery-delegates.spec.ts` - first run timed out due cleanup order in the new spec; fixed cleanup order and reran
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-delivery-delegates.spec.ts` - passed

Delivery regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-delivery-handover.e2e-spec.ts` - passed after updating stale free-form receiver calls
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-delivery.spec.ts` - passed after updating safe event metadata assertion

Realtime and notification regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-realtime-events.e2e-spec.ts` - passed after updating stale delivery call
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-realtime.spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-notifications-runtime.e2e-spec.ts` - passed after updating stale delivery call
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-notifications.spec.ts` - passed

Parent regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-request.spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-recent-calls-cancel.e2e-spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-cancel.spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-readiness.e2e-spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup.spec.ts` - passed

Dismissal regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-active-requests-queue.e2e-spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-calls.spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-request-lifecycle-transitions.e2e-spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-transitions.spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-waiting-students-arrival.e2e-spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-waiting.spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts` - passed

Role/app regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts` - passed
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` - passed

Git hygiene:

- Pending final sprint response.

## Known follow-ups

- PARENT-DISMISSAL-1D - Parent Smart Pickup Polish / UX Contract Hardening
- DISMISSAL-HISTORY-1A - History + Delays + Escalations
- DISMISSAL-DELIVERY-1C - Temporary External Delegate Authorization, only if product approves
- DISMISSAL-NOTIFICATIONS-1B - Push Delivery / Device Tokens, only if product approves
- DISMISSAL-REALTIME-1B - Durable Outbox / Reconnect Replay, only if product approves

## Final verdict

READY FOR REVIEW
