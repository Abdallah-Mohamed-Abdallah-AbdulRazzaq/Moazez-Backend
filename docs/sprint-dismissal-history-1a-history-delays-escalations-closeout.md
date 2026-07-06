# DISMISSAL-HISTORY-1A - History + Delays + Escalations Closeout

## Sprint name

DISMISSAL-HISTORY-1A - History + Delays + Escalations

## Baseline commit

Expected and actual baseline:

```text
1a111587 feat: polish parent smart pickup contracts
```

## Files changed

```text
prisma/schema.prisma
prisma/migrations/20260706100000_dismissal_history_escalation_event/migration.sql
src/modules/dismissal/dismissal.module.ts
src/modules/dismissal/requests/controller/dismissal-requests.controller.ts
src/modules/dismissal/requests/application/list-dismissal-request-history.use-case.ts
src/modules/dismissal/requests/application/get-dismissal-request-history-detail.use-case.ts
src/modules/dismissal/requests/application/escalate-dismissal-request.use-case.ts
src/modules/dismissal/requests/dto/list-dismissal-request-history.dto.ts
src/modules/dismissal/requests/dto/escalate-dismissal-request.dto.ts
src/modules/dismissal/requests/infrastructure/dismissal-requests-history.repository.ts
src/modules/dismissal/requests/presenter/dismissal-request-history.presenter.ts
src/modules/dismissal/shared/dismissal.errors.ts
test/e2e/dismissal-history-delays-escalations.e2e-spec.ts
test/security/tenancy.dismissal-history-escalations.spec.ts
docs/sprint-dismissal-history-1a-history-delays-escalations-closeout.md
```

## Schema changes

Added one enum value only:

```prisma
REQUEST_ESCALATED
```

to:

```prisma
enum DismissalRequestEventType
```

No new tables, columns, relations, request statuses, notification enums, realtime event names, device-token surfaces, or seed data were added.

## Migration changes

Added enum-only migration:

```text
20260706100000_dismissal_history_escalation_event
```

Migration SQL:

```sql
ALTER TYPE "dismissal_request_event_type" ADD VALUE 'REQUEST_ESCALATED';
```

`npx prisma migrate dev --name dismissal_history_escalation_event` was attempted, but existing local migration drift/checksum differences requested a database reset. No reset was run. The enum-only SQL was applied with `npx prisma db execute`, following earlier Dismissal migration precedent.

## Permission changes

None.

Existing permissions are used:

```text
dismissal.requests.history.view
dismissal.requests.escalate
```

No seed files were changed.

## Routes added

Under the global `/api/v1` prefix:

```text
GET  /api/v1/dismissal/requests/history
GET  /api/v1/dismissal/requests/history/:id
POST /api/v1/dismissal/requests/:id/escalate
```

The history routes are registered before `GET /dismissal/requests/:id` to avoid dynamic-route capture.

## History list behavior

The list endpoint returns current-school, non-deleted active and terminal Dismissal requests visible to the caller. It supports:

```text
status
statuses
childId
gateId
stageId
gradeId
sectionId
classroomId
dateFrom
dateTo
activeOnly
terminalOnly
delayedOnly
urgentOnly
escalatedOnly
page
limit
sort=created_at_desc|created_at_asc|updated_at_desc|wait_minutes_desc
```

Default sort is `created_at_desc`.

## History detail behavior

The detail endpoint returns a safe historical detail for one current-school, assignment-visible request, including terminal requests. Deleted, cross-school, or staff-hidden requests return safe 404.

Timeline entries are mapped to:

```text
request_created
request_status_changed
request_escalated
```

Event IDs, actor IDs, raw metadata, and audit internals are not exposed.

## Delay/urgent computation behavior

Delay and urgency are computed at read time and never stored as statuses.

Thresholds come from `DismissalSettings` with existing defaults:

```text
delayThresholdMinutes = 15
urgentThresholdMinutes = 30
```

For active requests, wait is computed from `now - requestedAt`.

For terminal requests, wait is computed from the terminal timestamp:

```text
handedOverAt
cancelled status event timestamp
expired status event timestamp
updatedAt fallback
```

## Escalation behavior

Escalation is allowed only for active statuses:

```text
REQUESTED
QUEUED
CALLED
MOVING
AT_GATE
READY
```

Terminal requests return `dismissal.escalation.terminal_request`. Cross-school, deleted, and assignment-hidden requests return safe `dismissal.escalation.not_found`.

Escalation does not mutate request status, delivery fields, pickup code fields, recipient-token behavior, parent contracts, notifications, or realtime payloads.

## Escalation idempotency behavior

If a request already has a `REQUEST_ESCALATED` event, the API returns `changed=false` and does not create a duplicate event or audit row.

## Event behavior

First successful escalation creates one `DismissalRequestEvent`:

```text
type = REQUEST_ESCALATED
statusFrom = current status
statusTo = current status
note = sanitized optional note
metadata.reason = requested reason
metadata.escalation = true
```

Metadata excludes actor/user IDs, school IDs, organization IDs, guardian IDs, requested-by IDs, assignment IDs, pickup-code fields, parent location, and raw relations.

## Audit behavior

First successful escalation creates one safe audit record:

```text
module = dismissal
action = dismissal.request.escalated
resourceType = dismissal_request
outcome = success
after.status = current status
after.reason = escalation reason
after.notePresent = boolean
```

Idempotent escalation retries and failed validations write no success audit.

## Notification/realtime behavior

No notification records are created for escalation.

No push/device-token work is added.

No new realtime event names are added.

No realtime event is published for escalation in this sprint.

## No-leak guarantees

History and escalation presenters omit:

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
pickupRecipientToken
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
room names
socket IDs
```

## Security decisions

- New routes use `JwtAuthGuard`, `ScopeResolverGuard`, and `PermissionsGuard`.
- History routes require exact `dismissal.requests.history.view`.
- Escalation requires exact `dismissal.requests.escalate`.
- Controllers remain thin and contain no Prisma/business logic.
- School scope comes from `RequestContext`, never request input.
- `DISMISSAL_STAFF` history and escalation visibility reuses active assignment matching.
- School admins with permission are current-school scoped only.
- Parent, Teacher, and Student roles receive no dismissal history or escalation permissions.

## Explicit non-goals preserved

Not implemented:

```text
new lifecycle statuses
new lifecycle transitions
DELAYED status
URGENT status
ESCALATED status
status auto-escalation
background jobs
durable outbox
push notifications
device-token changes
new realtime event names
parent notification routes
student/teacher notification changes
external delegate workflow
pickup-code resend
pickup-code rotation
pickup-code QR rendering
delivery recipient token changes
files
chat
staff-parent messaging
analytics dashboards outside this API
CSV export
PDF export
root /api/v1/history
root /api/v1/requests/history
root /api/v1/pickup
root /api/v1/waiting-students
root /api/v1/notifications
```

## Tests added

```text
test/e2e/dismissal-history-delays-escalations.e2e-spec.ts
test/security/tenancy.dismissal-history-escalations.spec.ts
```

Coverage includes history list/detail, active and terminal statuses, filters, delay/urgent computation, staff assignment visibility, admin visibility, cross-school/deleted hiding, escalation event/audit/idempotency, terminal rejection, invalid reason rejection, no notification side effects, metadata/guard assertions, seed boundaries, enum-only migration, route ordering, forbidden route absence, and no-leak snapshots.

## Commands run

Preflight:

```text
git status --short --untracked-files=all
git log --oneline -10
npx prisma validate
```

Implementation verification:

```text
npx prisma validate
npx prisma generate
npm run build
npx prisma migrate dev --name dismissal_history_escalation_event
npx prisma db execute --file prisma\migrations\20260706100000_dismissal_history_escalation_event\migration.sql --schema prisma\schema.prisma
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-history-delays-escalations.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-history-escalations.spec.ts
```

Final required verification and regression command results are recorded in the sprint response.

## Known follow-ups

```text
DISMISSAL-HISTORY-1B - Analytics / Export / SLA dashboards, only if product approves
DISMISSAL-DELIVERY-1C - Temporary External Delegate Authorization, only if product approves
DISMISSAL-NOTIFICATIONS-1B - Push Delivery / Device Tokens, only if product approves
DISMISSAL-REALTIME-1B - Durable Outbox / Reconnect Replay, only if product approves
PARENT-DISMISSAL-1E - Parent UI Notification/Realtime Consumption Contract, if needed
```

## Final verdict

READY FOR REVIEW
