# DISMISSAL-STAFF-1A - Assignments + Profile Closeout

## Sprint name

DISMISSAL-STAFF-1A - Staff Gate/Classroom Assignments + Profile

## Baseline commit

Expected and actual baseline matched:

```text
a4834b5 feat: add dismissal settings and gates foundation
```

## Files changed

```text
prisma/schema.prisma
prisma/migrations/20260704200240_dismissal_staff_assignments_profile/migration.sql
src/infrastructure/database/school-scope.extension.ts
src/modules/dismissal/**
test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts
test/security/tenancy.dismissal-staff.spec.ts
test/security/tenancy.dismissal-core.spec.ts
docs/sprint-dismissal-staff-1a-assignments-profile-closeout.md
```

`test/security/tenancy.dismissal-core.spec.ts` was updated only to remove the stale assertion that `DismissalStaffAssignment` must not exist. Request, shift, smart-pickup, and device-token deferrals remain asserted.

## Schema changes

Added the staff assignment foundation only:

- `DismissalStaffAssignment` mapped to `dismissal_staff_assignments`.
- `School` relation for dismissal staff assignments.
- `User` relations for assigned staff, creator, and updater.
- `DismissalGate` relation for assignment visibility.
- `Stage`, `Grade`, `Section`, and `Classroom` relations for academic-scope assignment visibility.

No request, lifecycle, shift, notification, realtime, parent pickup, or waiting-student models were added.

## Migration name

```text
20260704200240_dismissal_staff_assignments_profile
```

`npx prisma migrate dev --name dismissal_staff_assignments_profile` was attempted, but the local development database reported pre-existing drift and requested a reset. The database was not reset. The migration SQL was created as a normal Prisma migration file and applied locally with `npx prisma db execute`.

## Models added

- `DismissalStaffAssignment`

## Routes added

All routes are under the framework global `/api/v1` prefix:

```text
GET    /api/v1/dismissal/profile
GET    /api/v1/dismissal/staff-assignments
POST   /api/v1/dismissal/staff-assignments
GET    /api/v1/dismissal/staff-assignments/:id
PATCH  /api/v1/dismissal/staff-assignments/:id
DELETE /api/v1/dismissal/staff-assignments/:id
```

`DELETE` is soft delete only.

## Permissions enforced

Each new controller route uses:

```text
JwtAuthGuard
ScopeResolverGuard
PermissionsGuard
```

Required permissions:

```text
GET    /dismissal/profile                    dismissal.profile.view
GET    /dismissal/staff-assignments          dismissal.staff.view
POST   /dismissal/staff-assignments          dismissal.staff.manage
GET    /dismissal/staff-assignments/:id      dismissal.staff.view
PATCH  /dismissal/staff-assignments/:id      dismissal.staff.manage
DELETE /dismissal/staff-assignments/:id      dismissal.staff.manage
```

## Assignment validation rules

- `staffUserId` must reference a `DISMISSAL_STAFF` user.
- Staff user must have an active membership in the current school.
- At least one scope dimension is required: gate, stage, grade, section, or classroom.
- Gate, stage, grade, section, and classroom IDs must resolve in the current school.
- Gate must be non-deleted.
- Academic scope consistency is enforced across classroom -> section -> grade -> stage.
- `startsAt` and `endsAt` must be valid datetimes when provided.
- `startsAt` must be before `endsAt` when both are present.
- Exact duplicate active assignments for the same staff and same persisted scope are rejected.
- `schoolId`, `createdById`, `updatedById`, and `deletedAt` are never accepted from request bodies.

## Profile behavior

- `GET /api/v1/dismissal/profile` requires `UserType.DISMISSAL_STAFF`.
- Non-dismissal staff actors with permission receive `dismissal.profile.invalid_actor_type`.
- Profile uses the active school scope from request context.
- Response includes safe profile identity, school name/timezone, active assignments, gate summaries, academic scopes, and readiness permissions.
- Staff with no active assignments receive `hasAssignments=false` and empty assignment arrays.

## No-leak guarantees

Presenters omit internal scope, actor, audit, membership, role, organization, and soft-delete fields:

```text
schoolId
staffUserId
createdById
updatedById
deletedAt
actorId
membershipId
roleId
organizationId
raw relation internals
```

## Security decisions

- School scope is resolved from the active request context, never from request bodies.
- Assignment mutations set `createdById` and `updatedById` from the authenticated actor.
- Assignment reads and mutations are current-school scoped.
- Cross-school and soft-deleted assignments return safe 404 responses.
- `DISMISSAL_STAFF` can view own profile but cannot list/create/update/delete assignments.
- `DISMISSAL_STAFF` still cannot manage settings or gates.
- School admins can manage assignments through existing school-level roles.
- Assignment mutations write audit events.

## Explicit non-goals preserved

The sprint did not implement:

```text
DismissalRequest
DismissalRequestEvent
DismissalShift
DismissalShiftAssignment
Parent smart-pickup
Pickup request creation
Pickup code generation
Handover
Active queue
Waiting students
Delayed request signals
Dismissal notifications runtime
Dismissal realtime
Communication/chat integration
Files
AppDeviceTokenSurface.DISMISSAL_STAFF
External delegate accounts
```

## Tests added

```text
test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts
test/security/tenancy.dismissal-staff.spec.ts
```

Coverage includes assignment create/list/get/update/delete, staff type validation, active membership validation, scope requirement, cross-school gate rejection, academic mismatch rejection, invalid time windows, duplicate active assignments, cross-school 404s, profile readiness, profile actor-type rejection, no-leak assertions, route metadata, guard metadata, unauthenticated and forbidden access, dismissal staff limits, school admin management, school-scope extension coverage, and forbidden route/model absence checks.

## Commands run

```text
git status --short --untracked-files=all
git log --oneline -10
npx prisma validate
npx prisma migrate dev --name dismissal_staff_assignments_profile
npx prisma db execute --file prisma\migrations\20260704200240_dismissal_staff_assignments_profile\migration.sql --schema prisma\schema.prisma
npx prisma validate
npx prisma generate
npm run build
npm run seed
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-staff-assignments-profile.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-staff.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
```

## Known follow-ups

```text
PARENT-DISMISSAL-1A - Parent Smart Pickup Readiness
PARENT-DISMISSAL-1B - Parent Pickup Request Creation
DISMISSAL-CALLS-1A - Active Requests Queue
DISMISSAL-CALLS-1B - Request Lifecycle Transitions
```

## Final verdict

READY FOR REVIEW
