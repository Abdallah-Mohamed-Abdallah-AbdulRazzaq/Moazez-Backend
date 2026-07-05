# PARENT-DISMISSAL-1B — Parent Pickup Request Creation Closeout

## Sprint Name

PARENT-DISMISSAL-1B — Parent Pickup Request Creation

## Baseline Commit

Expected and actual baseline: `c1c7903 feat: add parent smart pickup readiness`.

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260705054526_parent_pickup_request_creation/migration.sql`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `src/infrastructure/database/school-scope.extension.ts`
- `src/modules/parent-app/parent-app.module.ts`
- `src/modules/parent-app/smart-pickup/application/create-parent-smart-pickup-request.use-case.ts`
- `src/modules/parent-app/smart-pickup/application/parent-smart-pickup.errors.ts`
- `src/modules/parent-app/smart-pickup/controller/parent-smart-pickup.controller.ts`
- `src/modules/parent-app/smart-pickup/dto/parent-smart-pickup-request.dto.ts`
- `src/modules/parent-app/smart-pickup/infrastructure/parent-smart-pickup-request.repository.ts`
- `src/modules/parent-app/smart-pickup/presenter/parent-smart-pickup-request.presenter.ts`
- `test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts`
- `test/security/tenancy.parent-smart-pickup-request.spec.ts`
- Updated stale security assertions in Parent App, Parent Smart Pickup readiness, Dismissal Core, Dismissal Staff, Dismissal IAM, and Teacher App security suites.

## Permission Catalog Changes

Added one permission:

- `parent.smart_pickup.request`
  - module: `parent`
  - resource: `smart_pickup`
  - action: `request`
  - description: `Create Parent App smart pickup requests for linked children`

The permission was added to `PARENT_PERMISSIONS` only. No `parent.smart_pickup.cancel`, `dismissal.*`, communication, file, Teacher, or Student role grants were added.

## Schema Changes

Added:

- `DismissalRequestStatus`
- `DismissalRequestEventType`
- `DismissalRequest`
- `DismissalRequestEvent`

Updated existing relations on `School`, `User`, `Student`, `Guardian`, `Enrollment`, and `DismissalGate`.

No dismissal shifts, staff assignment changes, notification runtime tables, realtime tables, pickup-code tables, waiting-student tables, or device-token surface changes were added.

## Migration Name

`20260705054526_parent_pickup_request_creation`

`npx prisma migrate dev --name parent_pickup_request_creation` was attempted, but the local database reported pre-existing migration drift/checksum differences from earlier dismissal migrations and requested a reset. The reset was not performed. The sprint migration SQL was generated from the Prisma schema diff and applied with `npx prisma db execute`.

## Models Added

- `DismissalRequest`
- `DismissalRequestEvent`

## Routes Added

- `POST /api/v1/parent/smart-pickup/requests`

No cancel, recent-calls, pickup root, waiting-students root, active queue, handover, or lifecycle transition routes were added.

## Permissions Enforced

`ParentSmartPickupController.createRequest` uses:

- `JwtAuthGuard`
- `ScopeResolverGuard`
- `PermissionsGuard`
- `@RequiredPermissions('parent.smart_pickup.request')`

The use case additionally requires `UserType.PARENT`; non-parent callers with the permission are rejected with `parent.smart_pickup.invalid_actor_type`.

## Request Creation Behavior

The endpoint creates an initial `REQUESTED` dismissal request only after validating:

- current actor is a parent
- current school scope exists
- child is owned by the current parent through the existing Guardian/StudentGuardian path
- student is active
- active enrollment exists in the current school
- `Guardian.canPickup=true`
- dismissal settings exist and are enabled
- request window is open using server-side school-local time
- zone coordinates resolve from settings or SchoolProfile
- parent coordinates are inside the configured geofence
- selected or resolved gate is current-school, active, non-deleted, and `OPEN` or `BUSY`
- no active request already exists for the same student

The request and initial `REQUEST_CREATED` event are written in one transaction. A sensitive audit log is written for the successful creation.

## Gate Selection Behavior

If `gateId` is supplied, it must identify an available current-school gate.

If `gateId` is omitted, the use case uses the configured default gate when available, otherwise uses the only available gate when exactly one exists. Multiple available gates without an explicit/default gate return `dismissal.request.gate_required`.

## Idempotency Behavior

`clientRequestId` is optional and scoped to `(schoolId, requestedById, clientRequestId)`.

Repeating the same client request for the same child returns the existing request response. Reusing the same client request for a different child or materially different gate intent returns `dismissal.request.idempotency_conflict`.

## No-Leak Guarantees

The presenter returns only safe request, child, gate, and policy fields. Responses do not expose:

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
- `parentLatitude`
- `parentLongitude`
- `distanceMeters`
- `geofencePassed`
- `deletedAt`
- raw relation objects

## Security Decisions

- Controllers remain thin and do not access Prisma directly.
- School scoping is enforced in use-case/repository reads and by composite same-school foreign keys.
- `DismissalRequest` and `DismissalRequestEvent` are registered in the school-scope extension.
- `DismissalRequest` is registered for soft-delete scoping.
- The active-request invariant is enforced in application code and by a partial unique index for active statuses.
- Closed, maintenance, inactive, deleted, and cross-school gates are not usable.
- Failed validation paths do not persist requests/events.

## Explicit Non-Goals Preserved

Not implemented:

- pickup request cancellation
- request lifecycle transitions beyond initial creation
- active queue
- waiting students
- pickup code generation or verification
- handover
- notifications runtime
- realtime
- chat/communication integration
- files
- device-token surface changes
- external pickup delegate account flow
- `GET /api/v1/parent/smart-pickup/recent-calls`
- `POST /api/v1/parent/smart-pickup/requests/:id/cancel`
- `/api/v1/pickup`
- `/api/v1/waiting-students`

## Tests Added

- `test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts`
- `test/security/tenancy.parent-smart-pickup-request.spec.ts`

Updated stale static/security regressions for the new request model, route, and parent permission count.

## Commands Run

- `git status --short --untracked-files=all` — clean before implementation.
- `git log --oneline -10` — baseline included `c1c7903 feat: add parent smart pickup readiness`.
- `npx prisma validate` — passed before changes.
- `npx prisma migrate dev --name parent_pickup_request_creation` — blocked by existing local migration drift/reset prompt; no reset performed.
- `npx prisma db execute --file prisma\migrations\20260705054526_parent_pickup_request_creation\migration.sql --schema prisma\schema.prisma` — passed.
- `npx prisma validate` — passed.
- `npx prisma generate` — passed.
- `npm run seed` — passed; seeded 221 permissions.
- `npm run build` — passed after clearing stale locked `dist` output from an interrupted build process.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts` — passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup-request.spec.ts` — passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-readiness.e2e-spec.ts` — passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup.spec.ts` — passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts` — passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts` — passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts` — passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts` — passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts` — passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` — passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts` — passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` — passed.

## Known Follow-Ups

- PARENT-DISMISSAL-1C — Parent Pickup Cancellation + Recent Calls
- DISMISSAL-CALLS-1A — Active Requests Queue
- DISMISSAL-CALLS-1B — Request Lifecycle Transitions
- DISMISSAL-WAITING-1A — Waiting Students + Arrival Confirmation
- DISMISSAL-DELIVERY-1A — Pickup Code Verification + Handover
- DISMISSAL-NOTIFICATIONS-1A — Dismissal Notifications Runtime

## Final Verdict

READY FOR REVIEW
