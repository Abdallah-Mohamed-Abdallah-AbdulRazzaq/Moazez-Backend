# PARENT-DISMISSAL-1D - Parent Smart Pickup Polish / UX Contract Hardening Closeout

## Sprint name

PARENT-DISMISSAL-1D - Parent Smart Pickup Polish / UX Contract Hardening

## Baseline commit

Expected and actual baseline matched:

```text
f7c22746 feat: verify dismissal pickup recipients
```

## Files changed

```text
src/modules/parent-app/smart-pickup/**
test/e2e/parent-smart-pickup-contract-polish.e2e-spec.ts
test/e2e/parent-smart-pickup-recent-calls-cancel.e2e-spec.ts
test/security/tenancy.parent-smart-pickup-contract.spec.ts
docs/sprint-parent-dismissal-1d-smart-pickup-contract-polish-closeout.md
```

`test/e2e/parent-smart-pickup-recent-calls-cancel.e2e-spec.ts` was updated only for the intentional idempotent cancel response shape: already-cancelled retries now report `previousStatus: "cancelled"` and stable terminal booleans.

## Schema changes

None.

## Migration changes

None.

## Permission changes

None.

No seed files were changed. Existing permissions remain:

```text
GET  /parent/smart-pickup                      parent.smart_pickup.view
POST /parent/smart-pickup/requests             parent.smart_pickup.request
GET  /parent/smart-pickup/recent-calls         parent.smart_pickup.view
POST /parent/smart-pickup/requests/:id/cancel  parent.smart_pickup.cancel
```

## Routes added

None.

## Routes updated

Existing Parent Smart Pickup routes only, response contract hardening:

```text
GET  /api/v1/parent/smart-pickup
POST /api/v1/parent/smart-pickup/requests
GET  /api/v1/parent/smart-pickup/recent-calls
POST /api/v1/parent/smart-pickup/requests/:id/cancel
```

## Readiness contract behavior

Readiness keeps the existing response fields and adds frontend-ready top-level fields:

- `enabled`
- `school.name`
- `policy.geofenceRequired`
- `policy.requestWindow.start/end/timezone/isOpenNow`
- `policy.pickupCodeRequired`
- `policy.parentCancelBeforeCalledAllowed`
- `policy.delegatePickupAllowed`

Children now include:

- `canRequestPickup`
- `blockedReason`
- `activeRequest`

Active request summaries use safe lower-snake-case statuses, `isActive`, `isTerminal`, `canCancel`, `canTrack`, safe gate labels, and pickup-code issue metadata only.

## Request creation contract behavior

Creation response keeps the legacy top-level `pickup` object for compatibility and adds canonical `request.pickup`.

`request` now includes:

- `isActive`
- `isTerminal`
- `canCancel`
- `canTrack`
- `pickup.codeRequired`
- `pickup.codeIssued`
- `pickup.codeIssuedAt`
- `pickup.code` only on the first successful creation response when pickup code is required

Idempotent retries keep returning the existing request without returning raw pickup code again.

## Recent calls contract behavior

Recent calls now include:

- lower-snake-case public statuses
- `isActive`
- `isTerminal`
- `canCancel`
- `canTrack`
- safe status timestamps: `calledAt`, `readyAt`, `handedOverAt`, `cancelledAt`
- `pickup.codeIssuedAt`
- `summary.terminalCount`
- `summary.canCancelCount`

Existing filters remain: `childId`, `status`, `activeOnly`, `page`, `limit`, and `sort`.

Invalid recent-call status/filter input now returns `parent.smart_pickup.invalid_status_filter`.

## Cancel contract behavior

Cancel response now includes:

- `isActive=false`
- `isTerminal=true`
- `canCancel=false`
- `canTrack=false`
- `cancelledAt`

Already-cancelled owned requests remain idempotent no-ops with `changed=false`, no extra event/audit/notification/realtime side effects, and now return `previousStatus: "cancelled"`.

## Status/boolean normalization

Parent Smart Pickup public request statuses are lower-snake-case:

```text
requested
queued
called
moving
at_gate
ready
handed_over
cancelled
expired
```

Active statuses expose `isActive=true` and `canTrack=true`. Terminal statuses expose `isTerminal=true`, `isActive=false`, and `canTrack=false`.

## Pickup-code public contract

Parent APIs expose pickup-code state safely:

```text
codeRequired
codeIssued
codeIssuedAt
```

The raw pickup code remains limited to first successful request creation when required. Recent calls, readiness, cancel, and idempotent creation retries do not expose raw pickup codes. Hash and salt fields are never selected or presented.

## Pickup-recipient internal hiding

Parent App code does not expose pickup recipient tokens or verified handover receiver internals.

Recent calls can show `status: "handed_over"` and `handedOverAt`, but do not expose receiver name/relation, pickup recipient token, guardian IDs, or StudentGuardian IDs.

## No-leak guarantees

Parent Smart Pickup presenters omit:

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
pickupRecipientToken
pickupCodeHash
pickupCodeSalt
parentLatitude
parentLongitude
distanceMeters
geofencePassed
clientRequestId
deletedAt
raw event metadata
raw relation objects
audit internals
storage internals
```

## Security decisions

- Controllers remain thin.
- Parent ownership still resolves through current actor -> Guardian.userId -> StudentGuardian -> Student -> active Enrollment/current school.
- No school, guardian, enrollment, requested-by, status override, pickup recipient token, or pickup-code internals are accepted by DTOs.
- Existing guards and permission metadata are unchanged.
- No Parent role dismissal permissions were added.
- No Dismissal Staff/Teacher/Student parent smart-pickup permissions were added.

## Explicit non-goals preserved

Not implemented:

```text
new routes
new permissions
schema changes
migrations
seed changes
delivery recipient token changes
pickup recipient discovery changes
external delegate account creation
temporary delegate invitation
delegate OTP
delegate QR
pickup-code resend
pickup-code rotation
pickup-code QR rendering
identity document upload
files
chat
push notifications
device-token changes
new realtime event names
new notification routes
history endpoint
delayed/escalation endpoint
parent staff chat
root /api/v1/pickup
root /api/v1/waiting-students
root /api/v1/notifications
root /api/v1/parent/notifications
```

## Tests added

```text
test/e2e/parent-smart-pickup-contract-polish.e2e-spec.ts
test/security/tenancy.parent-smart-pickup-contract.spec.ts
```

Coverage includes readiness policy and child requestability, active request shaping, creation one-time pickup-code contract, idempotent creation retry, recent calls active/terminal booleans, handed-over request visibility without receiver internals, active/status filters, invalid status error, idempotent already-cancelled response, ownership-spoofing field rejection, route metadata, guard chain, seed/schema/migration boundaries, forbidden route absence, and no Parent App token/receiver internal exposure.

## Commands run

Preflight:

```text
git status --short --untracked-files=all
git log --oneline -10
npx prisma validate
```

Implementation verification:

```text
npm run build
npx prisma validate
npx prisma generate
npm run seed
npm run build
```

Focused tests:

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-contract-polish.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-contract.spec.ts
```

Parent regressions:

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-readiness.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-request.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-recent-calls-cancel.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-cancel.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts
```

Delivery/realtime/notification regressions:

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-delivery-delegate-verification.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-delivery-delegates.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-delivery-handover.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-delivery.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-realtime-events.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-realtime.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-notifications-runtime.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-notifications.spec.ts
```

Dismissal/role regressions:

```text
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-active-requests-queue.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-calls.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-request-lifecycle-transitions.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-transitions.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-waiting-students-arrival.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-waiting.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
```

Git hygiene:

```text
git diff --name-only
git diff --stat
git diff --check
git status --short --untracked-files=all
```

## Known follow-ups

```text
DISMISSAL-HISTORY-1A - History + Delays + Escalations
DISMISSAL-DELIVERY-1C - Temporary External Delegate Authorization, only if product approves
DISMISSAL-NOTIFICATIONS-1B - Push Delivery / Device Tokens, only if product approves
DISMISSAL-REALTIME-1B - Durable Outbox / Reconnect Replay, only if product approves
PARENT-DISMISSAL-1E - Parent UI Notification/Realtime Consumption Contract, if needed
```

## Final verdict

READY FOR REVIEW
