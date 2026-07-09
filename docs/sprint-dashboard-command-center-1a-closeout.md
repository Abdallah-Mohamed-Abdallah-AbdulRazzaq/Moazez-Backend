# DASHBOARD-COMMAND-CENTER-1A Closeout

## Sprint name

DASHBOARD-COMMAND-CENTER-1A

## Baseline commit

Expected and actual HEAD before changes:

```text
30cf43d8 docs: define dashboard command center v2 plan
```

## Files changed

```text
prisma/seeds/01-permissions.seed.ts
src/modules/dashboard/application/get-dashboard-command-center.use-case.ts
src/modules/dashboard/controller/dashboard.controller.ts
src/modules/dashboard/dashboard.module.ts
src/modules/dashboard/dto/dashboard-command-center.dto.ts
src/modules/dashboard/presenters/dashboard-command-center.presenter.ts
src/modules/dashboard/tests/dashboard-command-center.presenter.spec.ts
src/modules/dashboard/tests/dashboard-command-center.use-case.spec.ts
test/e2e/dashboard-command-center-foundation.e2e-spec.ts
test/security/tenancy.dashboard-command-center.spec.ts
test/security/tenancy.dashboard.spec.ts
test/security/tenancy.dashboard-alerts.spec.ts
test/security/tenancy.dashboard-activity-feed.spec.ts
docs/sprint-dashboard-command-center-1a-closeout.md
```

## Schema changes

None.

## Migration changes

None.

## Seed changes

Added permission catalog entry:

```text
dashboard.command_center.view
```

`platform_super_admin`, `organization_admin`, and `school_admin` receive the permission through existing `ALL`, `NON_PLATFORM`, and `SCHOOL_LEVEL` seed inheritance. Teacher, parent, and student allowlists do not include it.

## Runtime changes

Added `GetDashboardCommandCenterUseCase` and `presentDashboardCommandCenter(...)` to compose existing Dashboard summary, alerts, and activity-feed foundations into a read-only command-center overview.

No Prisma schema changes, migrations, new tables, new packages, external BI integration, widgets, analytics, todos, weather, planner, alert lifecycle, or realtime work were added.

## Route changes

Added:

```text
GET /api/v1/dashboard/command-center
```

Existing routes remain:

```text
GET /api/v1/dashboard/summary
GET /api/v1/dashboard/alerts
GET /api/v1/dashboard/activity-feed
```

## Permission changes

New route requires:

```text
dashboard.command_center.view
```

## API contract added

The command-center response includes:

```text
generatedAt
school
academicContext
operator
today
quickStats
operationalHealth
moduleReadiness
topRisks
topActions
alertsPreview
activityPreview
meta
```

## Response shape summary

The response provides school and academic context, a safe generic operator object, school-timezone-aware today metadata, quick stat cards from summary counts, operational health indicators, module readiness entries, top risks/actions from existing alert and summary signals, alert preview items, safe activity preview items, and deferred metadata for future dashboard surfaces.

## Security/no-leak posture

- Uses `requireDashboardScope()`.
- Controller remains thin and delegates to the use case.
- No Prisma access in the controller.
- No tenant override input is accepted or used.
- Response excludes `schoolId`, `organizationId`, `membershipId`, `roleId`, raw actor ids, raw resource ids, raw audit rows, storage internals, password hashes, and deleted markers.
- Activity preview strips `activityId`, actor ids, and subject ids from the standalone activity-feed mapping.
- Security tests verify school A cannot observe school B command-center data.

## Tests added/updated

Added:

```text
src/modules/dashboard/tests/dashboard-command-center.use-case.spec.ts
src/modules/dashboard/tests/dashboard-command-center.presenter.spec.ts
test/e2e/dashboard-command-center-foundation.e2e-spec.ts
test/security/tenancy.dashboard-command-center.spec.ts
```

Updated:

```text
test/security/tenancy.dashboard.spec.ts
test/security/tenancy.dashboard-alerts.spec.ts
test/security/tenancy.dashboard-activity-feed.spec.ts
```

## Verification commands

Pre-change:

```text
git status --short --untracked-files=all
PASS: clean output

git log --oneline -15
PASS: HEAD was 30cf43d8 docs: define dashboard command center v2 plan

npx prisma validate
PASS: The schema at prisma\schema.prisma is valid
```

Post-change:

```text
npx prisma validate
PASS: The schema at prisma\schema.prisma is valid

npx prisma generate
PASS: Generated Prisma Client v6.19.3

npm run build
PASS: nest build

npx tsc -p tsconfig.build.json --noEmit
PASS: no output

npx jest --runInBand src/modules/dashboard/tests/dashboard-command-center.use-case.spec.ts
PASS: Test Suites: 1 passed, Tests: 3 passed

npx jest --runInBand src/modules/dashboard/tests/dashboard-command-center.presenter.spec.ts
PASS: Test Suites: 1 passed, Tests: 4 passed

npm run test -- dashboard --runInBand
PASS: Test Suites: 20 passed, Tests: 115 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-command-center-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 4 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-summary-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 2 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-alerts-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 6 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-activity-feed-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 6 passed

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-command-center.spec.ts
PASS: Test Suites: 1 passed, Tests: 3 passed

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard.spec.ts
PASS: Test Suites: 1 passed, Tests: 6 passed

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-alerts.spec.ts
PASS: Test Suites: 1 passed, Tests: 3 passed

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-activity-feed.spec.ts
PASS: Test Suites: 1 passed, Tests: 4 passed
```

## Known issues

- `DIRECTORY_STRUCTURE.md` is not present in the repository; `DIRECTORY_STRUCTURE_VISUAL.md` was used.
- Local infrastructure was initially stopped; `npm run infra:up` was used before DB-backed tests.
- `npm run db:migrate` hit pre-existing local migration history drift: migration `20260704184455_dismissal_core_settings_gates` attempted to create enum type `dismissal_gate_operational_status`, which already existed. `npx prisma migrate status` then reported six later dismissal migrations unapplied. This sprint adds no migrations and does not touch the Prisma schema. `npm run seed` succeeded after this, and all required command-center/dashboard tests passed.

## Final verdict

READY FOR REVIEW
