# DISMISSAL-CORE-1A — Settings + Gates Foundation Closeout

## Sprint name

DISMISSAL-CORE-1A — Settings + Gates Foundation

## Baseline commit

Expected and actual baseline matched:

```text
6fc34d5 feat: add dismissal staff identity foundation
```

## Files changed

```text
prisma/schema.prisma
prisma/migrations/20260704184455_dismissal_core_settings_gates/migration.sql
src/app.module.ts
src/infrastructure/database/school-scope.extension.ts
src/modules/dismissal/**
test/e2e/dismissal-core-settings-gates.e2e-spec.ts
test/security/tenancy.dismissal-core.spec.ts
test/security/tenancy.dismissal-iam.spec.ts
docs/sprint-dismissal-core-1a-settings-gates-foundation-closeout.md
```

`test/security/tenancy.dismissal-iam.spec.ts` was updated because its prior IAM-only assertion expected `src/modules/dismissal` not to exist. That assertion became stale once this sprint intentionally introduced the runtime dismissal module.

## Schema changes

Added the dismissal settings and gate foundation only:

- `DismissalGateOperationalStatus` enum mapped to `dismissal_gate_operational_status`.
- `DismissalSettings` mapped to `dismissal_settings`.
- `DismissalGate` mapped to `dismissal_gates`.
- `School` relations for dismissal settings and gates.
- `User` relation for settings updates.

No request, lifecycle, staff assignment, notification, realtime, parent pickup, or waiting-student models were added.

## Migration name

```text
20260704184455_dismissal_core_settings_gates
```

`npx prisma migrate dev --name dismissal_core_settings_gates` was attempted, but the local development database reported pre-existing drift and a checksum mismatch on an already-applied prior migration. The database was not reset. The migration SQL was created as a normal Prisma migration file and applied locally with `npx prisma db execute`.

## Models added

- `DismissalSettings`
- `DismissalGate`

## Routes added

All routes are under the framework global `/api/v1` prefix:

```text
GET   /api/v1/dismissal/settings
PATCH /api/v1/dismissal/settings
GET   /api/v1/dismissal/gates
POST  /api/v1/dismissal/gates
GET   /api/v1/dismissal/gates/:id
PATCH /api/v1/dismissal/gates/:id
```

No delete route was added.

## Permissions enforced

Each controller route uses:

```text
JwtAuthGuard
ScopeResolverGuard
PermissionsGuard
```

Required permissions:

```text
GET   /dismissal/settings      dismissal.settings.view
PATCH /dismissal/settings      dismissal.settings.manage
GET   /dismissal/gates         dismissal.gates.view
POST  /dismissal/gates         dismissal.gates.manage
GET   /dismissal/gates/:id     dismissal.gates.view
PATCH /dismissal/gates/:id     dismissal.gates.manage
```

## No-leak guarantees

Presenters return application-facing DTOs and omit internal scope, actor, audit, membership, role, organization, and soft-delete fields:

```text
schoolId
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
- Settings upserts set `updatedById` from the authenticated actor only.
- Gate reads and mutations are current-school scoped.
- Cross-school and soft-deleted gates return safe 404 responses.
- `DISMISSAL_STAFF` can view gates only through the existing seeded permission strategy.
- School admins can manage settings and gates through existing school-level roles.
- Sensitive settings and gate mutations write audit events.

## Explicit non-goals preserved

The sprint did not implement:

```text
DismissalRequest
DismissalRequestEvent
DismissalStaffAssignment
DismissalShift
Dismissal notifications runtime
Dismissal realtime
Parent smart-pickup
Pickup code generation
Handover
Waiting students
Active queue
Chat integration
File upload/download
AppDeviceTokenSurface.DISMISSAL_STAFF
```

## Tests added

```text
test/e2e/dismissal-core-settings-gates.e2e-spec.ts
test/security/tenancy.dismissal-core.spec.ts
```

Coverage includes settings defaults and upsert validation, gate creation/list/filter/update behavior, duplicate-code rules, cross-school 404s, no-leak response assertions, guard/permission metadata, unauthenticated and forbidden access, dismissal staff limits, school admin management, school-scope extension coverage, and forbidden route/model absence checks.

## Commands run

```text
git status --short --untracked-files=all
git log --oneline -10
npx prisma validate
npx prisma migrate dev --name dismissal_core_settings_gates
npx prisma db execute --file prisma\migrations\20260704184455_dismissal_core_settings_gates\migration.sql --schema prisma\schema.prisma
npx prisma generate
npm run seed
npm run build
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dismissal-core-settings-gates.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-core.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dismissal-iam.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
```

## Known follow-ups

```text
DISMISSAL-STAFF-1A — Staff Gate/Classroom Assignments + Profile
PARENT-DISMISSAL-1A — Parent Smart Pickup Readiness
PARENT-DISMISSAL-1B — Parent Pickup Request Creation
DISMISSAL-CALLS-1A — Active Requests Queue
```

## Final verdict

READY FOR REVIEW
