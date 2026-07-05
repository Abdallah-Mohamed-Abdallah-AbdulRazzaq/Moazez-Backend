# DISMISSAL-WAITING-1A - Waiting Students + Arrival Confirmation Closeout

## Sprint name

DISMISSAL-WAITING-1A - Waiting Students + Arrival Confirmation

## Baseline commit

`3cb058a feat: add dismissal request lifecycle transitions`

HEAD matched the expected baseline at sprint start.

## Files changed

- `src/modules/dismissal/dismissal.module.ts`
- `src/modules/dismissal/shared/dismissal.errors.ts`
- `src/modules/dismissal/shared/dismissal.types.ts`
- `src/modules/dismissal/waiting-students/application/confirm-student-arrival.use-case.ts`
- `src/modules/dismissal/waiting-students/application/list-waiting-students.use-case.ts`
- `src/modules/dismissal/waiting-students/controller/dismissal-waiting-students.controller.ts`
- `src/modules/dismissal/waiting-students/dto/confirm-student-arrival.dto.ts`
- `src/modules/dismissal/waiting-students/dto/dismissal-waiting-students-query.dto.ts`
- `src/modules/dismissal/waiting-students/presenter/dismissal-waiting-students.presenter.ts`
- `test/e2e/dismissal-waiting-students-arrival.e2e-spec.ts`
- `test/security/tenancy.dismissal-waiting.spec.ts`
- `test/security/tenancy.dismissal-calls.spec.ts`
- `test/security/tenancy.dismissal-transitions.spec.ts`
- `docs/sprint-dismissal-waiting-1a-waiting-students-arrival-closeout.md`

The two existing security specs were updated only to remove stale 404 assertions for the newly added waiting-students routes while preserving forbidden root/deferred-route checks.

## Schema changes

None.

## Migration changes

None.

## Permission changes

None.

The new routes use existing permissions:

- `GET /api/v1/dismissal/waiting-students` -> `dismissal.requests.view`
- `POST /api/v1/dismissal/waiting-students/:id/arrival` -> `dismissal.requests.manage`

## Routes added

- `GET /api/v1/dismissal/waiting-students`
- `POST /api/v1/dismissal/waiting-students/:id/arrival`

## Waiting-students behavior

The list endpoint returns only current-school active requests in the operational waiting segment:

- `CALLED`
- `MOVING`
- `AT_GATE`
- `READY`

It excludes `REQUESTED`, `QUEUED`, terminal statuses, deleted requests, and cross-school requests. It supports `status`, `gateId`, academic scope filters, `q`, pagination, and sorting by `arrival_stage_asc`, `requested_at_asc`, `requested_at_desc`, or `urgency_desc`.

## Arrival confirmation behavior

The arrival endpoint:

- Changes `CALLED` to `AT_GATE`.
- Changes `MOVING` to `AT_GATE`.
- Treats `AT_GATE` and `READY` as idempotent no-ops with `changed=false`.
- Rejects `REQUESTED` and `QUEUED` with `dismissal.waiting.invalid_arrival_status`.
- Returns safe 404 for terminal, deleted, cross-school, or assignment-hidden requests with `dismissal.waiting.not_found`.

## Assignment-scoped visibility/mutation behavior

`DISMISSAL_STAFF` actors reuse the existing active assignment rules:

- Active school must match current scope.
- Staff user must match the actor.
- Assignment must be active, not deleted, and within its time window.
- Multiple assignments are ORed.
- Gate and academic dimensions inside one assignment are ANDed.

Staff with no matching assignment gets an empty list and safe 404 on arrival confirmation.

## Admin visibility/mutation behavior

School-side non-`DISMISSAL_STAFF` actors with the required existing permissions can list and confirm arrival for current-school waiting students. The implementation does not broaden access to platform scope and never accepts `schoolId` from request input.

## Event behavior

Changed arrivals create a `DismissalRequestEvent` with:

- `type = REQUEST_STATUS_CHANGED`
- `statusFrom = CALLED` or `MOVING`
- `statusTo = AT_GATE`
- `actorUserId = current actor`
- Sanitized optional note
- No metadata

No-op arrivals do not create duplicate events.

## Audit behavior

Changed arrivals write a safe audit entry through the existing audit repository:

- `module = dismissal`
- `action = dismissal.waiting_student.arrival_confirmed`
- `resourceType = dismissal_request`
- Before/after status and note presence only

No-op arrivals do not write audit records.

## Queue/detail regression behavior

Existing request surfaces continue to reflect arrival confirmation:

- `GET /api/v1/dismissal/requests/active` sees the updated `AT_GATE` status.
- `GET /api/v1/dismissal/requests/:id` includes the safe status-change timeline event.
- `PATCH /api/v1/dismissal/requests/:id/status` remains unchanged.

## No-leak guarantees

Waiting list and arrival presenters do not expose:

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
- parent location/geofence fields
- `clientRequestId`
- `deletedAt`
- assignment IDs
- internal event IDs
- raw metadata
- raw relation objects
- audit/storage internals

Allowed fields are limited to public request ID, child display labels, safe academic labels, safe gate fields, public status values, arrival state, timestamps, computed signals, and safe timeline fields.

## Security decisions

- New controller uses `JwtAuthGuard`, `ScopeResolverGuard`, and `PermissionsGuard`.
- Controllers stay thin and delegate all business logic.
- No Prisma access exists in controllers.
- Waiting-students filters and arrival input are DTO-backed.
- `DISMISSAL_STAFF` visibility and mutation are assignment-scoped.
- Parent, Teacher, and Student roles do not receive dismissal request permissions.

## Explicit non-goals preserved

No implementation was added for:

- request call/ready/deliver/escalate action routes
- waiting-students ready/deliver routes
- handover
- pickup code generation or verification
- delivery confirmation
- parent cancellation
- recent calls
- delayed request escalation
- notifications runtime
- realtime/socket events
- communication/chat integration
- files
- app device token changes
- root `/api/v1/pickup`
- root `/api/v1/waiting-students`

## Tests added

- `test/e2e/dismissal-waiting-students-arrival.e2e-spec.ts`
- `test/security/tenancy.dismissal-waiting.spec.ts`

Existing security regressions updated only for stale waiting-route absence assertions:

- `test/security/tenancy.dismissal-calls.spec.ts`
- `test/security/tenancy.dismissal-transitions.spec.ts`

## Commands run

Preflight:

- `git status --short --untracked-files=all`
- `git log --oneline -10`
- `npx prisma validate`

Implementation verification:

- `npm run build`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-waiting-students-arrival.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-waiting.spec.ts`
- `npx prisma validate`
- `npx prisma generate`
- `npm run seed`
- `npm run build`

Regression verification:

- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-active-requests-queue.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-calls.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-request-lifecycle-transitions.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-transitions.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-request.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-readiness.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts`

Git hygiene:

- Pending at document creation; final results are in the sprint response.

## Known follow-ups

- DISMISSAL-DELIVERY-1A - Pickup Code Verification + Handover
- PARENT-DISMISSAL-1C - Recent Calls + Cancel Before Called
- DISMISSAL-NOTIFICATIONS-1A - Dismissal Notifications Runtime
- DISMISSAL-REALTIME-1A - Queue Realtime Events

## Final verdict

READY FOR REVIEW
