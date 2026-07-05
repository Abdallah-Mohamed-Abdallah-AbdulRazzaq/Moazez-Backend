# PARENT-DISMISSAL-1C - Recent Calls + Cancel Before Called Closeout

## Sprint name

PARENT-DISMISSAL-1C - Recent Calls + Cancel Before Called

## Baseline commit

Expected and actual baseline:

```text
01a3c1e4 feat: add dismissal pickup code handover
```

## Files changed

- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `src/modules/parent-app/parent-app.module.ts`
- `src/modules/parent-app/smart-pickup/**`
- `test/e2e/parent-smart-pickup-recent-calls-cancel.e2e-spec.ts`
- `test/security/tenancy.parent-smart-pickup-cancel.spec.ts`
- `test/security/tenancy.parent-smart-pickup.spec.ts`
- `test/security/tenancy.parent-smart-pickup-request.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`
- `test/security/tenancy.dismissal-calls.spec.ts`
- `test/security/tenancy.dismissal-transitions.spec.ts`
- `test/security/tenancy.dismissal-waiting.spec.ts`
- `test/security/tenancy.dismissal-delivery.spec.ts`
- `test/security/tenancy.dismissal-core.spec.ts`
- `test/security/tenancy.dismissal-staff.spec.ts`
- `test/security/tenancy.dismissal-iam.spec.ts`
- `test/security/tenancy.teacher-app.spec.ts`
- `docs/sprint-parent-dismissal-1c-recent-calls-cancel-closeout.md`

## Schema changes

None.

## Migration changes

None.

## Permission changes

Added exactly one permission:

```text
parent.smart_pickup.cancel
```

Metadata:

```text
module: parent
resource: smart_pickup
action: cancel
description: Cancel Parent App smart pickup requests before school-side processing starts
```

The permission was added only to `PARENT_PERMISSIONS`. No dismissal, communication, file, teacher, student, or dismissal staff role grants were added.

Expected counts now hold:

```text
Permission catalog: 222
Parent role permissions: 46
```

## Routes added

Under the global `/api/v1` prefix:

```text
GET  /api/v1/parent/smart-pickup/recent-calls
POST /api/v1/parent/smart-pickup/requests/:id/cancel
```

Permissions:

```text
GET  /parent/smart-pickup/recent-calls          parent.smart_pickup.view
POST /parent/smart-pickup/requests/:id/cancel  parent.smart_pickup.cancel
```

Both routes use `JwtAuthGuard`, `ScopeResolverGuard`, and `PermissionsGuard`.

## Recent-calls behavior

The read model returns current-parent, current-school dismissal requests across:

```text
REQUESTED
QUEUED
CALLED
MOVING
AT_GATE
READY
HANDED_OVER
CANCELLED
EXPIRED
```

It excludes soft-deleted, unowned, and cross-school requests. It supports `childId`, `status`, `activeOnly`, `page`, `limit`, and `sort`.

`activeOnly=true` returns only active statuses:

```text
REQUESTED
QUEUED
CALLED
MOVING
AT_GATE
READY
```

Responses include safe summary counts and per-request `canCancel`.

## Cancellation behavior

Parent cancellation allows:

```text
REQUESTED -> CANCELLED
QUEUED    -> CANCELLED
```

Already `CANCELLED` owned requests are idempotent no-ops with `changed=false`; no duplicate event or audit row is written.

Rejected states:

```text
CALLED
MOVING
AT_GATE
READY
HANDED_OVER
EXPIRED
```

Cancellation uses secure default behavior: if `DismissalSettings.allowParentCancelBeforeCalled` is missing or false, cancellation is rejected with `dismissal.request.cancel_disabled`.

Cross-school, unowned, deleted, or hidden requests return safe 404 with `dismissal.request.not_found`.

## Parent ownership behavior

Reads and cancellation use the existing Parent App ownership path:

```text
authenticated parent user
-> Guardian.userId
-> StudentGuardian
-> Student
-> DismissalRequest in active school scope
```

Recent-calls can show owned historical requests even if enrollment later changes. Cancellation additionally requires the request enrollment to remain active.

## Event behavior

Successful cancellation creates one `DismissalRequestEvent`:

```text
type = REQUEST_STATUS_CHANGED
statusFrom = REQUESTED or QUEUED
statusTo = CANCELLED
actorUserId = current parent user
note = sanitized optional note
metadata = omitted
```

Failed cancellation and idempotent no-op cancellation do not create events.

## Audit behavior

Successful changed cancellations create a safe audit log:

```text
module = dismissal
action = dismissal.request.cancelled_by_parent
resourceType = dismissal_request
outcome = success
```

Audit payload is limited to before/after status and note presence. Failed and idempotent cancellations do not write audit rows.

## Dismissal regression behavior

Cancelled requests are terminal and are excluded from:

```text
GET /api/v1/dismissal/requests/active
GET /api/v1/dismissal/waiting-students
GET /api/v1/dismissal/requests/:id
```

They cannot be lifecycle-transitioned, delivered, or arrival-confirmed. The same parent can create a new request for the same child after cancellation because the active-request constraint no longer applies.

## Pickup-code no-leak behavior

Recent-calls and cancel responses never expose raw pickup codes, pickup code hashes, or salts. They return only:

```text
pickup.codeRequired
pickup.codeIssued
```

Raw pickup code remains limited to the first successful request creation response when code policy requires it.

## No-leak guarantees

Presenters omit:

```text
schoolId
organizationId
membershipId
roleId
guardianId
guardian.userId
student.userId
student.applicationId
enrollmentId
requestedById
actorUserId
staffUserId
handedOverById
pickupCodeHash
pickupCodeSalt
raw pickupCode
parentLatitude
parentLongitude
distanceMeters
geofencePassed
clientRequestId
deletedAt
assignment IDs
internal event IDs
raw event metadata
raw relation objects
audit internals
storage internals
```

## Security decisions

- Controllers remain thin and contain no Prisma/business logic.
- School scope comes from `RequestContext`, never request input.
- Non-parent actors with route permissions receive `parent.smart_pickup.invalid_actor_type`.
- Parent cancellation never trusts status, school, student, guardian, requested-by, gate, or actor fields from request input.
- Cancellation mutation, event creation, and audit write happen in one transaction.
- No dismissal permissions or staff/admin route behavior were added.

## Explicit non-goals preserved

Not implemented:

```text
notifications runtime
realtime/socket events
communication/chat integration
files
pickup-code resend
pickup-code rotation
pickup-code QR rendering
delegate account creation
staff-side escalation
dismissal call/ready/deliver/escalate action routes
waiting-student ready/deliver routes
handover changes
delivery changes
root /api/v1/pickup
root /api/v1/waiting-students
new tables
new migrations
new enums
new user types
new dismissal permissions
```

## Tests added

- `test/e2e/parent-smart-pickup-recent-calls-cancel.e2e-spec.ts`
- `test/security/tenancy.parent-smart-pickup-cancel.spec.ts`

Existing security specs were updated only for the new parent cancel permission, new route inventory, and stale route-absence assertions.

## Commands run

Preflight:

- `git status --short --untracked-files=all`
- `git log --oneline -10`
- `npx prisma validate`

Implementation verification:

- `npm run build` - first attempt timed out; second attempt hit stale generated `dist` cleanup; `dist` was removed and build passed.
- `npm run seed` - passed; seeded 222 permissions and 7 system roles.
- `npx prisma validate` - passed.
- `npx prisma generate` - passed.
- `npm run seed` - passed.
- `npm run build` - passed.

Focused tests:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-recent-calls-cancel.e2e-spec.ts` - first run failed before reseed because the Parent role did not yet have `parent.smart_pickup.cancel`; passed after `npm run seed`.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-cancel.spec.ts` - passed.

Parent regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-request.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-readiness.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup.spec.ts` - passed.

Dismissal regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-active-requests-queue.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-calls.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-request-lifecycle-transitions.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-transitions.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-waiting-students-arrival.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-waiting.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-delivery-handover.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-delivery.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts` - passed.

Role/app regressions:

- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` - passed.

Git hygiene:

- Pending at document creation; final command output is in the sprint response.

## Known follow-ups

- DISMISSAL-NOTIFICATIONS-1A - Dismissal Notifications Runtime
- DISMISSAL-REALTIME-1A - Queue Realtime Events
- DISMISSAL-DELIVERY-1B - Pickup Delegate Verification Enhancements
- PARENT-DISMISSAL-1D - Parent Smart Pickup Polish / UX Contract Hardening

## Final verdict

READY FOR REVIEW
