# PARENT-DISMISSAL-1A - Parent Smart Pickup Readiness Closeout

## Sprint name

PARENT-DISMISSAL-1A - Parent Smart Pickup Readiness

## Baseline commit

Expected and actual baseline matched:

```text
811fe70 feat: add dismissal staff assignments and profile
```

## Files changed

```text
prisma/seeds/01-permissions.seed.ts
prisma/seeds/02-system-roles.seed.ts
src/modules/parent-app/parent-app.module.ts
src/modules/parent-app/smart-pickup/**
test/e2e/parent-smart-pickup-readiness.e2e-spec.ts
test/security/tenancy.parent-smart-pickup.spec.ts
test/security/tenancy.parent-app.spec.ts
test/security/tenancy.dismissal-core.spec.ts
test/security/tenancy.dismissal-staff.spec.ts
test/security/tenancy.dismissal-iam.spec.ts
test/security/tenancy.teacher-app.spec.ts
docs/sprint-parent-dismissal-1a-smart-pickup-readiness-closeout.md
```

`test/security/tenancy.dismissal-core.spec.ts` and `test/security/tenancy.dismissal-staff.spec.ts` were updated only because their previous assertions expected `GET /api/v1/parent/smart-pickup` to be absent. They now keep blocking deferred request/recent-calls/cancel/root pickup/waiting-students routes.

`test/security/tenancy.dismissal-iam.spec.ts`, `test/security/tenancy.parent-app.spec.ts`, and `test/security/tenancy.teacher-app.spec.ts` were updated only for the one new parent permission and route inventory count.

## Permission catalog changes

Added exactly one permission:

```text
parent.smart_pickup.view
module: parent
resource: smart_pickup
action: view
description: View Parent App smart pickup readiness for linked children
```

Added `parent.smart_pickup.view` to `PARENT_PERMISSIONS`.

No `parent.smart_pickup.request`, `parent.smart_pickup.cancel`, `dismissal.*`, `communication.*`, or `files.*` permissions were added to the Parent role.

## Routes added

Under the framework global `/api/v1` prefix:

```text
GET /api/v1/parent/smart-pickup
```

No POST smart-pickup request route, recent-calls route, cancel route, `/api/v1/pickup`, or `/api/v1/waiting-students` route was added.

## Readiness behavior

The endpoint returns:

- dismissal enabled/configured state
- school zone center and radius
- server-side request window state
- policy booleans
- linked current-school children with pickup eligibility
- available current-school gates
- child/gate summary counts

When no `DismissalSettings` exists, it computes defaults from `SchoolProfile` and does not persist settings.

When settings exist, it uses settings coordinates, timezone, radius, request window, and policies, falling back to `SchoolProfile` coordinates only when settings coordinates are missing.

`canRequestNow=true` only when dismissal is enabled, settings are configured, zone coordinates exist, the request window is open, at least one child is eligible, and at least one available gate exists.

## Window calculation behavior

Request windows are evaluated with server time in the configured timezone.

Rules implemented:

- missing start or end means closed
- `start <= end` is an inclusive same-day window
- `start > end` is an inclusive overnight window
- client time is not trusted

## Parent ownership behavior

The read model follows the existing Parent App ownership path:

```text
authenticated parent user
-> Guardian.userId
-> StudentGuardian
-> Student
-> active Enrollment for current school
```

The endpoint resolves the active school from `RequestContext`; it does not trust child IDs from input and has no child input.

Linked children in other schools are hidden by school-scoped queries.

## Gate availability behavior

Available gates are current-school gates with:

```text
isActive=true
deletedAt=null
status in OPEN or BUSY
```

Closed, maintenance, inactive, soft-deleted, and cross-school gates are omitted.

## No-leak guarantees

Presenters return app-facing DTOs only and omit:

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
updatedById
deletedAt
actorId
raw relation objects
audit internals
storage internals
```

## Security decisions

- Route uses `JwtAuthGuard`, `ScopeResolverGuard`, and `PermissionsGuard`.
- Route requires exactly `parent.smart_pickup.view`.
- Non-parent actors with the permission are rejected with `parent.smart_pickup.invalid_actor_type`.
- Missing parent school/guardian context uses local stable smart-pickup error codes.
- Controllers remain thin and contain no Prisma/business logic.
- Read adapter uses scoped Prisma and read-only queries only.

## Explicit non-goals preserved

Not implemented:

```text
POST /api/v1/parent/smart-pickup/requests
GET /api/v1/parent/smart-pickup/recent-calls
POST /api/v1/parent/smart-pickup/requests/:id/cancel
DismissalRequest
DismissalRequestEvent
request lifecycle
active queue
waiting students
pickup code
handover
parent location persistence
notifications runtime
realtime
chat integration
files
AppDeviceTokenSurface.DISMISSAL_STAFF
external pickup delegate account flow
```

No schema or migration files were changed.

## Tests added

```text
test/e2e/parent-smart-pickup-readiness.e2e-spec.ts
test/security/tenancy.parent-smart-pickup.spec.ts
```

Coverage includes default settings fallback, no-persist GET behavior, configured settings, normal and overnight windows, outside-window behavior, current-school child filtering, no-active-enrollment and `canPickup=false` eligibility, available gate filtering, no-leak assertions, exact metadata, auth/RBAC, non-parent actor rejection, forbidden route absence, no request tables, and no dismissal staff device-token surface.

## Commands run

```text
git status --short --untracked-files=all
git log --oneline -10
npx prisma validate
npx prisma generate
npm run seed
npm run build
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-smart-pickup-readiness.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-smart-pickup.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
```

Build note:

The first build attempt timed out and left stale generated `dist/` handles. The stuck `npm run build` / `nest build` processes were stopped, generated `dist/` was removed, and `npm run build` passed cleanly.

## Known follow-ups

```text
PARENT-DISMISSAL-1B - Parent Pickup Request Creation
DISMISSAL-CALLS-1A - Active Requests Queue
DISMISSAL-CALLS-1B - Request Lifecycle Transitions
DISMISSAL-WAITING-1A - Waiting Students + Arrival Confirmation
DISMISSAL-DELIVERY-1A - Pickup Code Verification + Handover
```

## Final verdict

READY FOR REVIEW
