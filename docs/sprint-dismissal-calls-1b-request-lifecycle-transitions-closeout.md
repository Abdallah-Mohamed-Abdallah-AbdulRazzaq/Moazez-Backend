# DISMISSAL-CALLS-1B - Request Lifecycle Transitions Closeout

## Sprint Name

DISMISSAL-CALLS-1B - Request Lifecycle Transitions

## Baseline Commit

Expected and actual baseline:

```text
506a180 feat: add dismissal active requests queue
```

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260705130000_dismissal_request_status_changed_event/migration.sql`
- `src/modules/dismissal/dismissal.module.ts`
- `src/modules/dismissal/requests/**`
- `src/modules/dismissal/shared/dismissal.errors.ts`
- `src/modules/dismissal/shared/dismissal.types.ts`
- `test/e2e/dismissal-request-lifecycle-transitions.e2e-spec.ts`
- `test/security/tenancy.dismissal-transitions.spec.ts`
- `test/security/tenancy.dismissal-calls.spec.ts`
- `test/security/tenancy.parent-smart-pickup-request.spec.ts`
- `docs/sprint-dismissal-calls-1b-request-lifecycle-transitions-closeout.md`

The two existing security specs were updated only to remove stale assertions that `PATCH /api/v1/dismissal/requests/:id/status` must be absent. Deferred call, ready, deliver, escalate, waiting-students, recent-calls, cancel, pickup root, and waiting-students root route assertions remain.

## Schema Changes

Added exactly one enum value:

```prisma
REQUEST_STATUS_CHANGED
```

to:

```prisma
enum DismissalRequestEventType
```

No tables, indexes, relations, seed data, device-token surfaces, waiting-student models, delivery models, or notification models were added.

## Migration Changes

Added migration:

```text
20260705130000_dismissal_request_status_changed_event
```

Migration SQL:

```sql
ALTER TYPE "dismissal_request_event_type" ADD VALUE 'REQUEST_STATUS_CHANGED';
```

`npx prisma migrate dev --name dismissal_request_status_changed_event` was attempted, but the local database reported existing migration drift and requested a reset. The database was not reset. The enum-only migration file was created manually and applied locally with `npx prisma db execute`.

## Permission Changes

None.

The new route uses the existing permission:

```text
dismissal.requests.manage
```

No permission seed files were changed.

## Routes Added

Under the framework global `/api/v1` prefix:

```text
PATCH /api/v1/dismissal/requests/:id/status
```

The route uses:

```text
JwtAuthGuard
ScopeResolverGuard
PermissionsGuard
@RequiredPermissions('dismissal.requests.manage')
```

## Transition Policy

Allowed transitions:

```text
REQUESTED -> QUEUED
REQUESTED -> CALLED
QUEUED -> CALLED
CALLED -> MOVING
CALLED -> AT_GATE
MOVING -> AT_GATE
AT_GATE -> READY
```

Same-status updates are idempotent no-ops and do not create events or audit logs.

Rejected:

```text
backward transitions
skipped transitions not in the matrix
READY -> HANDED_OVER
terminal targets HANDED_OVER, CANCELLED, EXPIRED
REQUESTED as a mutation target
```

## Assignment-Scoped Mutation Behavior

`UserType.DISMISSAL_STAFF` status mutation uses the same assignment visibility rules as the active queue:

- active current-school assignment
- same staff user
- not soft-deleted
- valid startsAt/endsAt window
- OR across multiple assignments
- AND across dimensions within one assignment
- gate, stage, grade, section, and classroom dimensions must match when provided

Hidden requests return safe 404 and are not mutated.

## Admin Mutation Behavior

School-side non-`DISMISSAL_STAFF` actors with `dismissal.requests.manage` may transition current-school active requests. Cross-school, terminal, and deleted requests return safe 404.

## Event Behavior

Successful status changes update `DismissalRequest.status` and create one `DismissalRequestEvent` in the same transaction:

```text
type = REQUEST_STATUS_CHANGED
statusFrom = previous active status
statusTo = new active status
actorUserId = current actor
note = sanitized note or null
metadata = omitted
```

Failed transitions and idempotent no-ops do not create events.

## Audit Behavior

Successful changed transitions write a safe audit log through the existing `AuthRepository.createAuditLog` path:

```text
module: dismissal
action: dismissal.request.status_changed
resourceType: dismissal_request
outcome: success
```

Audit metadata is limited to status and note presence. It does not include parent location, guardian/user IDs, assignment IDs, raw relations, event IDs, or request internals. Idempotent no-ops and failed validations do not write audit logs.

## Queue/Detail Regression Behavior

Existing queue and detail reads reflect updated request statuses. Detail timelines now safely present:

```text
request_created
request_status_changed
```

List summary counts reflect post-transition statuses.

## No-Leak Guarantees

The PATCH presenter omits:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `guardianId`
- `guardian.userId`
- `student.userId`
- `student.applicationId`
- `enrollmentId`
- `requestedById`
- `actorUserId`
- `staffUserId`
- `parentLatitude`
- `parentLongitude`
- `distanceMeters`
- `geofencePassed`
- `clientRequestId`
- `deletedAt`
- assignment IDs
- internal event IDs
- raw event metadata
- raw relations
- audit/storage internals

## Security Decisions

- Controllers remain thin and contain no Prisma/business logic.
- School scope comes from `RequestContext`, never from body/query.
- Body validation rejects extra fields through the global validation pipe.
- Mutation uses active-only lookup before write.
- Staff visibility is enforced before write.
- Request status and domain event are persisted atomically.
- Audit is safe and separate from public response shape.
- No new permissions or seeds were added.

## Explicit Non-Goals Preserved

Not implemented:

- `POST /api/v1/dismissal/requests/:id/call`
- `POST /api/v1/dismissal/requests/:id/ready`
- `POST /api/v1/dismissal/requests/:id/deliver`
- `POST /api/v1/dismissal/requests/:id/escalate`
- `GET /api/v1/dismissal/waiting-students`
- `POST /api/v1/dismissal/waiting-students/:id/arrival`
- `GET /api/v1/parent/smart-pickup/recent-calls`
- `POST /api/v1/parent/smart-pickup/requests/:id/cancel`
- handover
- pickup code generation or verification
- delivery confirmation
- parent cancellation
- recent calls
- waiting-students specialized read model
- delayed request escalation
- dismissal notifications runtime
- realtime/socket events
- communication/chat integration
- files
- `AppDeviceTokenSurface.DISMISSAL_STAFF`
- `/api/v1/pickup`
- `/api/v1/waiting-students`

## Tests Added

- `test/e2e/dismissal-request-lifecycle-transitions.e2e-spec.ts`
- `test/security/tenancy.dismissal-transitions.spec.ts`

Coverage includes the allowed transition matrix, event creation, sanitized notes, queue/detail updates, safe timeline, idempotent no-op, invalid/skipped/backward/terminal transitions, terminal/deleted/cross-school 404s, staff assignment-scoped mutation, parent forbidden behavior, no-leak assertions, route metadata, guards, RBAC boundaries, forbidden route absence, enum-only migration, and no device-token/waiting-student surfaces.

## Commands Run

- `git status --short --untracked-files=all` - clean before implementation.
- `git log --oneline -10` - confirmed `506a180 feat: add dismissal active requests queue`.
- `npx prisma validate` - passed before implementation.
- `npx prisma migrate dev --name dismissal_request_status_changed_event` - blocked by existing local migration drift/reset prompt; no reset performed.
- `npx prisma db execute --file prisma\migrations\20260705130000_dismissal_request_status_changed_event\migration.sql --schema prisma\schema.prisma` - passed.
- `npx prisma validate` - passed.
- `npx prisma generate` - passed.
- `npm run build` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-request-lifecycle-transitions.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-transitions.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-active-requests-queue.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-calls.spec.ts` - passed.
- `npx prisma validate` - passed.
- `npx prisma generate` - passed.
- `npm run seed` - passed; seeded 221 permissions and 7 system roles.
- `npm run build` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-request.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-readiness.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` - passed.

## Known Follow-Ups

- DISMISSAL-WAITING-1A - Waiting Students + Arrival Confirmation
- DISMISSAL-DELIVERY-1A - Pickup Code Verification + Handover
- PARENT-DISMISSAL-1C - Recent Calls + Cancel Before Called
- DISMISSAL-NOTIFICATIONS-1A - Dismissal Notifications Runtime
- DISMISSAL-REALTIME-1A - Queue Realtime Events

## Final Verdict

READY FOR REVIEW
