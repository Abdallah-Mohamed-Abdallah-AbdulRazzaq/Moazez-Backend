# DASHBOARD-MODULE-PAGES-1A Closeout

## Sprint name

`DASHBOARD-MODULE-PAGES-1A`

## Baseline commit

- Expected HEAD: `94082e7d feat: add dashboard analytics data pack`
- Actual HEAD: `94082e7d feat: add dashboard analytics data pack`
- Initial `git status --short --untracked-files=all`: clean
- Initial `npx prisma validate`: passed
- `DIRECTORY_STRUCTURE.md` was absent; `DIRECTORY_STRUCTURE_VISUAL.md` was used.

## Files changed

Runtime:

- `src/modules/dashboard/application/get-dashboard-module-page.use-case.ts`
- `src/modules/dashboard/application/list-dashboard-modules.use-case.ts`
- `src/modules/dashboard/controller/dashboard.controller.ts`
- `src/modules/dashboard/dashboard.module.ts`
- `src/modules/dashboard/domain/dashboard-module-pages.ts`
- `src/modules/dashboard/dto/dashboard-modules.dto.ts`
- `src/modules/dashboard/presenters/dashboard-modules.presenter.ts`

Seeds:

- `prisma/seeds/01-permissions.seed.ts`

Tests:

- `src/modules/dashboard/tests/dashboard-modules.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-modules.use-case.spec.ts`
- `test/e2e/dashboard-module-pages-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-modules.spec.ts`
- Existing dashboard route/security inventory tests updated for the new module routes.

Docs:

- `docs/sprint-dashboard-module-pages-1a-closeout.md`

## Schema changes

None.

## Migration changes

None.

## Seed changes

Added:

```text
dashboard.modules.view
```

The permission uses `module: 'dashboard'`, `resource: 'modules'`, and `action: 'view'`.

System role inheritance remains unchanged:

- `platform_super_admin` receives it through `ALL`.
- `organization_admin` receives it through `NON_PLATFORM`.
- `school_admin` receives it through `SCHOOL_LEVEL`.
- `teacher`, `parent`, and `student` explicit permission arrays do not include it.

## Runtime changes

Added read-only module dashboard page foundation:

- `ListDashboardModulesUseCase`
- `GetDashboardModulePageUseCase`
- server-defined module page registry
- module dashboard DTOs
- module dashboard presenter

Both use cases resolve school scope through `requireDashboardScope()`. The controller remains thin and delegates directly to use cases.

## Route changes

Added:

```text
GET /api/v1/dashboard/modules
GET /api/v1/dashboard/modules/:moduleKey
```

Preserved existing dashboard routes:

```text
GET /api/v1/dashboard/summary
GET /api/v1/dashboard/alerts
GET /api/v1/dashboard/activity-feed
GET /api/v1/dashboard/command-center
GET /api/v1/dashboard/widgets
GET /api/v1/dashboard/widgets/:widgetKey
GET /api/v1/dashboard/analytics/catalog
GET /api/v1/dashboard/analytics/charts
GET /api/v1/dashboard/analytics/charts/:chartKey
GET /api/v1/dashboard/analytics/charts/:chartKey/data
```

No light-mode dropdown, todo, alert lifecycle, export, report, realtime, weather, planner, write, or external BI routes were added.

## Permission changes

Both new routes require:

```text
dashboard.modules.view
```

## API contract added

`GET /api/v1/dashboard/modules` returns:

- `generatedAt`
- `modules`
- `summary`
- `filters`
- `deferred`
- `meta`

Supported list filters:

- `status=available|planned|deferred`
- `source=admissions|students|academics|attendance|grades|homework|behavior|reinforcement|communication|settings`
- `limit`, default `20`, max `50`

`GET /api/v1/dashboard/modules/:moduleKey` returns:

- `generatedAt`
- `module`
- `overview`
- `widgets`
- `analytics`
- `sections`
- `capabilities`
- `emptyState`
- `meta`

Unknown module keys return `404` through the existing `NotFoundDomainException` convention.

## Module page registry summary

The registry is server-defined and read-only. Each module definition includes:

- module key/source/title/description/status
- icon and tone
- safe frontend module route
- safe source module route
- widget keys
- chart keys
- primary action
- sections
- capabilities

Missing widget or chart references are omitted safely instead of failing the request.

## Modules implemented

Implemented active school dashboard module pages:

- `admissions`
- `students`
- `academics`
- `attendance`
- `grades`
- `homework`
- `behavior`
- `reinforcement`
- `communication`
- `settings`

Platform Admin and Dismissal/Smart Pickup are not exposed through these school dashboard module pages.

## Widget/analytics integration summary

Module details compose existing dashboard widget registry output and analytics catalog definitions.

Widget composition:

- includes only widgets whose keys belong to the module registry
- omits unrelated widgets, including `activity.recent`
- returns safe frontend-route actions only
- returns no raw source rows

Analytics composition:

- `analytics.charts` includes module-scoped chart definitions from the existing analytics catalog presenter
- `analytics.plannedCharts` includes planned/deferred chart definitions without fake computed data
- chart definitions remain catalog metadata and do not include generated time-series points

## Available analytics data integration summary

Available data is included only for existing `operational_snapshot_v1` computed snapshot charts:

- `attendance.pending_sessions`
- `grades.pending_submission_reviews`
- `grades.pending_answer_reviews`
- `communication.moderation_queue`
- `settings.email_connection_readiness`
- `settings.login_identity_readiness`

No new analytics pack computation, historical time series, drilldown, exports, realtime, or fake data were added.

## Sections/capabilities summary

Each detail page includes:

- `overview`
- `widgets`
- `analytics`

Capabilities are computed from actual composed content:

- widgets are `available` when current widget definitions exist
- analytics definitions are `available` when current chart definitions exist
- analytics data is `partial` only when first-pack chart data exists for part of the module
- drilldowns, exports, and realtime remain `deferred`

## Security/no-leak posture

- Routes require `dashboard.modules.view`.
- Use cases require active dashboard school scope through `requireDashboardScope()`.
- No `schoolId` query/body override is accepted by HTTP validation or used by use cases.
- Responses do not expose `schoolId`, `organizationId`, `membershipId`, `roleId`, password hashes, deleted markers, raw Prisma rows, raw audit rows, actor/user/resource ids, storage internals, JWT/session internals, provider secrets, or SMTP secrets.
- School A cannot observe School B module data in security tests.
- Teacher, parent, and student system role arrays remain excluded from `dashboard.modules.view`.
- Controller contains no business logic and no Prisma access.

## Tests added/updated

Added:

- `src/modules/dashboard/tests/dashboard-modules.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-modules.presenter.spec.ts`
- `test/e2e/dashboard-module-pages-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-modules.spec.ts`

Updated:

- `test/e2e/dashboard-analytics-catalog-foundation.e2e-spec.ts`
- `test/e2e/dashboard-analytics-data-pack-foundation.e2e-spec.ts`
- `test/e2e/dashboard-command-center-foundation.e2e-spec.ts`
- `test/e2e/dashboard-widgets-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard.spec.ts`
- `test/security/tenancy.dashboard-alerts.spec.ts`
- `test/security/tenancy.dashboard-activity-feed.spec.ts`
- `test/security/tenancy.dashboard-command-center.spec.ts`
- `test/security/tenancy.dashboard-widgets.spec.ts`
- `test/security/tenancy.dashboard-analytics.spec.ts`
- `test/security/tenancy.dashboard-analytics-data.spec.ts`

## Verification commands

Pre-change:

```text
git status --short --untracked-files=all
PASS: clean output

git log --oneline -15
PASS: HEAD was 94082e7d feat: add dashboard analytics data pack

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

npx jest --runInBand src/modules/dashboard/tests/dashboard-modules.use-case.spec.ts
PASS: Test Suites: 1 passed, Tests: 6 passed

npx jest --runInBand src/modules/dashboard/tests/dashboard-modules.presenter.spec.ts
PASS: Test Suites: 1 passed, Tests: 6 passed

npm run test -- dashboard --runInBand
PASS: Test Suites: 28 passed, Tests: 158 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-module-pages-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 7 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-analytics-data-pack-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 6 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-analytics-catalog-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 7 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-widgets-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 7 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-command-center-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 4 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-summary-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 2 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-alerts-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 6 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-activity-feed-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 6 passed

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-modules.spec.ts
PASS: Test Suites: 1 passed, Tests: 4 passed

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-analytics-data.spec.ts
PASS: Test Suites: 1 passed, Tests: 4 passed

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-analytics.spec.ts
PASS: Test Suites: 1 passed, Tests: 3 passed

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-widgets.spec.ts
PASS: Test Suites: 1 passed, Tests: 4 passed

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

- The first `npm run build` attempt exceeded the 120s command timeout and returned no build output. The same command passed when rerun with a 300s timeout.
- Git prints LF-to-CRLF warnings on Windows for touched files due to local line-ending settings. `git diff --check` is the authoritative whitespace check.

## Final verdict

READY FOR REVIEW
