# DASHBOARD-ANALYTICS-1A Closeout

## Sprint

`DASHBOARD-ANALYTICS-1A` — runtime API foundation for the internal Dashboard Analytics catalog.

## Baseline

- Repository HEAD at implementation time: `d38a8891 feat: add dashboard widgets registry`
- Baseline status before edits: clean
- Baseline Prisma validation: passed
- `DIRECTORY_STRUCTURE.md` was not present; `DIRECTORY_STRUCTURE_VISUAL.md` was used as the closest repository structure guide.

## Scope delivered

- Added static, server-defined dashboard analytics catalog definitions.
- Added runtime API endpoints:
  - `GET /api/v1/dashboard/analytics/catalog`
  - `GET /api/v1/dashboard/analytics/charts`
  - `GET /api/v1/dashboard/analytics/charts/:chartKey`
- Added the permission seed entry `dashboard.analytics.view`.
- Added application use cases, DTOs, and presenter shaping for analytics catalog responses.
- Updated dashboard route/security inventories so existing dashboard routes remain explicit and protected.
- Added focused unit, E2E, and security coverage for the analytics catalog foundation.

## Schema and migration changes

- Prisma schema changes: none
- Migrations added: none
- Tables/persistence added: none

## Seed changes

- Added `dashboard.analytics.view` to `prisma/seeds/01-permissions.seed.ts` with:
  - module: `dashboard`
  - resource: `analytics`
  - action: `view`
- No explicit teacher, parent, or student role permission arrays were expanded.
- Admin-like roles inherit through the existing seed conventions that consume the central permission catalog.

## Runtime contract

The analytics catalog is definition-only in this sprint. Responses expose catalog metadata and future data contracts, not computed analytics data.

Implemented catalog areas:

- Sources: admissions, students, academics, attendance, grades, homework, behavior, reinforcement, communication, settings
- Supported chart types: line, bar, stacked-bar, area, donut, pie, funnel, heatmap, radial-progress, table, timeline
- Supported ranges: 7d, 30d, 90d, term, academic_year, custom
- Supported granularities: day, week, month
- Statuses: available, planned, deferred

Initial catalog content:

- Metrics: 16
- KPIs: 11
- Charts: 37

All chart definitions currently return `status: planned` and `meta.dataAvailability: definition_only`. Computed series, drilldowns, saved reports, custom dashboards, exports, and realtime analytics remain explicitly deferred.

## Security and no-leak posture

- All analytics routes require `dashboard.analytics.view`.
- Analytics use cases still require an active dashboard school scope.
- Presenter responses do not include tenant/internal identifiers such as `schoolId`, `organizationId`, `membershipId`, `roleId`, user identifiers, storage internals, password hashes, or soft-delete fields.
- Out-of-scope tenant override-shaped input is ignored by the use case layer and not echoed.
- Existing dashboard routes were preserved:
  - `summary`
  - `alerts`
  - `activity-feed`
  - `command-center`
  - `widgets`
  - `widgets/:widgetKey`

## Tests added or updated

Added:

- `src/modules/dashboard/tests/dashboard-analytics.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics.presenter.spec.ts`
- `test/e2e/dashboard-analytics-catalog-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-analytics.spec.ts`

Updated route/security inventory coverage:

- `test/e2e/dashboard-command-center-foundation.e2e-spec.ts`
- `test/e2e/dashboard-widgets-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard.spec.ts`
- `test/security/tenancy.dashboard-command-center.spec.ts`
- `test/security/tenancy.dashboard-widgets.spec.ts`
- `test/security/tenancy.dashboard-alerts.spec.ts`
- `test/security/tenancy.dashboard-activity-feed.spec.ts`

## Verification

Passed:

- `npx prisma validate`
- `npx prisma generate`
- `npm run build`
- `npx tsc -p tsconfig.build.json --noEmit`
- `npx jest --runInBand src/modules/dashboard/tests/dashboard-analytics.use-case.spec.ts`
- `npx jest --runInBand src/modules/dashboard/tests/dashboard-analytics.presenter.spec.ts`
- `npm run test -- dashboard --runInBand`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-analytics-catalog-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-widgets-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-command-center-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-summary-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-alerts-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-activity-feed-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-analytics.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-widgets.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-command-center.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-alerts.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-activity-feed.spec.ts`

Notable command results:

- Dashboard unit/regression suite: 24 suites passed, 135 tests passed
- Analytics E2E: 1 suite passed, 7 tests passed
- Analytics security: 1 suite passed, 3 tests passed

## Known issues

- None for this sprint.
- Git may print LF-to-CRLF warnings on Windows because of repository line-ending settings; `git diff --check` is the authoritative whitespace gate.

## Final verdict

READY FOR REVIEW
