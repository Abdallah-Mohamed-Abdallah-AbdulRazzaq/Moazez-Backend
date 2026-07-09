# DASHBOARD-WIDGETS-1A Closeout

## Sprint name

DASHBOARD-WIDGETS-1A

## Baseline commit

Expected and actual HEAD before changes:

```text
3d38315a feat: add dashboard command center foundation
```

Initial working tree:

```text
git status --short --untracked-files=all
PASS: clean output
```

## Files changed

```text
prisma/seeds/01-permissions.seed.ts
src/modules/dashboard/application/get-dashboard-widget.use-case.ts
src/modules/dashboard/application/list-dashboard-widgets.use-case.ts
src/modules/dashboard/controller/dashboard.controller.ts
src/modules/dashboard/dashboard.module.ts
src/modules/dashboard/domain/dashboard-widget-registry.ts
src/modules/dashboard/dto/dashboard-widgets.dto.ts
src/modules/dashboard/presenters/dashboard-widgets.presenter.ts
src/modules/dashboard/tests/dashboard-widgets.presenter.spec.ts
src/modules/dashboard/tests/dashboard-widgets.use-case.spec.ts
test/e2e/dashboard-command-center-foundation.e2e-spec.ts
test/e2e/dashboard-widgets-foundation.e2e-spec.ts
test/security/tenancy.dashboard-activity-feed.spec.ts
test/security/tenancy.dashboard-alerts.spec.ts
test/security/tenancy.dashboard-command-center.spec.ts
test/security/tenancy.dashboard-widgets.spec.ts
test/security/tenancy.dashboard.spec.ts
docs/sprint-dashboard-widgets-1a-closeout.md
```

## Schema changes

None.

## Migration changes

None.

## Seed changes

Added permission catalog entry:

```text
dashboard.widgets.view
```

`platform_super_admin`, `organization_admin`, and `school_admin` receive the permission through the existing `ALL`, `NON_PLATFORM`, and `SCHOOL_LEVEL` seed inheritance. Teacher, parent, and student explicit permission arrays do not include it.

## Runtime changes

Added a read-only Dashboard Widgets Registry surface inside the Dashboard app-facing composition module.

Runtime additions:

```text
ListDashboardWidgetsUseCase
GetDashboardWidgetUseCase
dashboard-widget-registry definitions
dashboard widgets DTOs
dashboard widgets presenter
```

The widget use cases resolve school scope with `requireDashboardScope()` and compose existing Dashboard summary, alert readiness signals, and safe activity-feed previews. No Dashboard-owned persistence, Prisma schema changes, migrations, layout storage, preferences, analytics chart engine, todos, weather, planner, alert lifecycle, realtime, or external BI integration were added.

## Route changes

Added:

```text
GET /api/v1/dashboard/widgets
GET /api/v1/dashboard/widgets/:widgetKey
```

Existing routes remain:

```text
GET /api/v1/dashboard/summary
GET /api/v1/dashboard/alerts
GET /api/v1/dashboard/activity-feed
GET /api/v1/dashboard/command-center
```

## Permission changes

Both new routes require:

```text
dashboard.widgets.view
```

## API contract added

List response includes:

```text
generatedAt
widgets
summary
filters
deferred
```

Detail response includes:

```text
generatedAt
widget
deferred
```

Optional list filters implemented:

```text
source
type
limit
```

Limit behavior:

```text
Default: 20
Max: 50
```

Unknown widget keys return 404 through the existing `NotFoundDomainException` / `not_found` convention.

## Widget registry summary

The registry is server-defined and read-only. Widgets include stable keys, approved widget types, source, title, subtitle, icon key, tone, data, safe frontend route action, empty-state placeholder, and live freshness metadata.

All widget action targets are leading-slash frontend routes. No backend route URLs, external URLs, tenant ids, or object ids are returned.

## Initial widgets implemented

```text
students.active
admissions.open_applications
attendance.pending_today
attendance.absences_today
homework.waiting_review
grades.pending_review
behavior.pending_review
reinforcement.pending_reviews
communication.moderation_queue
settings.email_connection
settings.login_identity
activity.recent
```

## Security/no-leak posture

- Controller remains thin and delegates to use cases.
- No Prisma access in controllers.
- Uses existing Dashboard school scope resolution.
- Responses do not include `schoolId`, `organizationId`, `membershipId`, `roleId`, password hashes, deleted markers, storage internals, raw Prisma rows, raw audit rows, actor ids, or raw resource ids.
- Activity timeline widget strips standalone activity-feed ids and returns safe preview fields only.
- No schoolId/body/query override is accepted or used.
- School A cannot observe School B widget data in security tests.
- Teacher, parent, and student role seed arrays remain excluded from Dashboard widget permission.

## Tests added/updated

Added:

```text
src/modules/dashboard/tests/dashboard-widgets.use-case.spec.ts
src/modules/dashboard/tests/dashboard-widgets.presenter.spec.ts
test/e2e/dashboard-widgets-foundation.e2e-spec.ts
test/security/tenancy.dashboard-widgets.spec.ts
```

Updated:

```text
test/e2e/dashboard-command-center-foundation.e2e-spec.ts
test/security/tenancy.dashboard.spec.ts
test/security/tenancy.dashboard-command-center.spec.ts
test/security/tenancy.dashboard-alerts.spec.ts
test/security/tenancy.dashboard-activity-feed.spec.ts
```

## Verification commands

Pre-change:

```text
git status --short --untracked-files=all
PASS: clean output

git log --oneline -15
PASS: HEAD was 3d38315a feat: add dashboard command center foundation

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

npx jest --runInBand src/modules/dashboard/tests/dashboard-widgets.use-case.spec.ts
PASS: Test Suites: 1 passed, Tests: 6 passed

npx jest --runInBand src/modules/dashboard/tests/dashboard-widgets.presenter.spec.ts
PASS: Test Suites: 1 passed, Tests: 5 passed

npm run test -- dashboard --runInBand
PASS: Test Suites: 22 passed, Tests: 126 passed

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

- `DIRECTORY_STRUCTURE.md` is not present in the repository; `DIRECTORY_STRUCTURE_VISUAL.md` was used.
- The first `npm run build` attempt hit stale generated-output cleanup behavior in `dist` (`ENOTEMPTY` under `dist/src/modules/student-app/exams`). `dist` was verified as inside the workspace, removed as generated output, and `npm run build` then passed.
- Git reports local LF-to-CRLF conversion warnings for touched files because local autocrlf handling is enabled.

## Final verdict

READY FOR REVIEW
