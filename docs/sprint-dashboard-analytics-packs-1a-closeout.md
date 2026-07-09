# DASHBOARD-ANALYTICS-PACKS-1A Closeout

## Sprint name

`DASHBOARD-ANALYTICS-PACKS-1A`

## Baseline commit

- Expected HEAD: `8d905e80 feat: add dashboard analytics catalog`
- Actual HEAD: `8d905e80 feat: add dashboard analytics catalog`
- Initial `git status --short --untracked-files=all`: clean
- Initial `npx prisma validate`: passed
- `DIRECTORY_STRUCTURE.md` was absent; `DIRECTORY_STRUCTURE_VISUAL.md` was used as the closest structure guide.

## Files changed

Runtime files:

- `src/modules/dashboard/application/get-dashboard-analytics-chart-data.use-case.ts`
- `src/modules/dashboard/controller/dashboard.controller.ts`
- `src/modules/dashboard/dashboard.module.ts`
- `src/modules/dashboard/domain/dashboard-analytics-catalog.ts`
- `src/modules/dashboard/domain/dashboard-analytics-data-pack.ts`
- `src/modules/dashboard/dto/dashboard-analytics.dto.ts`
- `src/modules/dashboard/dto/dashboard-analytics-data.dto.ts`
- `src/modules/dashboard/presenters/dashboard-analytics-data.presenter.ts`

Tests:

- `src/modules/dashboard/tests/dashboard-analytics-data.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-data.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics.presenter.spec.ts`
- `test/e2e/dashboard-analytics-data-pack-foundation.e2e-spec.ts`
- `test/e2e/dashboard-analytics-catalog-foundation.e2e-spec.ts`
- `test/e2e/dashboard-command-center-foundation.e2e-spec.ts`
- `test/e2e/dashboard-widgets-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-analytics-data.spec.ts`
- `test/security/tenancy.dashboard-analytics.spec.ts`
- `test/security/tenancy.dashboard-widgets.spec.ts`
- `test/security/tenancy.dashboard-command-center.spec.ts`
- `test/security/tenancy.dashboard.spec.ts`
- `test/security/tenancy.dashboard-alerts.spec.ts`
- `test/security/tenancy.dashboard-activity-feed.spec.ts`

Docs:

- `docs/sprint-dashboard-analytics-packs-1a-closeout.md`

## Schema changes

None.

## Migration changes

None.

## Seed changes

None.

This sprint reuses the existing `dashboard.analytics.view` permission and does not add a new permission. Teacher, parent, and student explicit role permission arrays remain unchanged.

## Runtime changes

Added a read-only Dashboard Analytics data route that returns safe aggregate snapshot data for the first operational analytics data pack.

Runtime additions:

- `GetDashboardAnalyticsChartDataUseCase`
- `dashboard-analytics-data-pack` domain constants
- analytics chart data DTOs
- analytics chart data presenter

The use case resolves the current dashboard school scope through `requireDashboardScope()`, loads existing dashboard summary and alert-readiness snapshots only for supported first-pack charts, and delegates response shaping to the presenter.

## Route changes

Added:

```text
GET /api/v1/dashboard/analytics/charts/:chartKey/data
```

Preserved:

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
```

No module pages, light-mode dropdown, todos, alert lifecycle, export, report, realtime, weather, planner, or external BI routes were added.

## Permission changes

No new permission.

The new data route requires:

```text
dashboard.analytics.view
```

## API contract added

`GET /api/v1/dashboard/analytics/charts/:chartKey/data` returns:

- `generatedAt`
- `chartKey`
- `source`
- `title`
- `type`
- `status`
- `range`
- `granularity`
- `filters`
- `data.series`
- `data.totals`
- `data.summary`
- `data.empty`
- `emptyState`
- `meta`

Default query behavior:

- `range: 30d`
- `granularity: day`

Approved query keys:

- `range`
- `granularity`
- `dateFrom`
- `dateTo`
- `academicYearId`
- `termId`
- `gradeId`
- `sectionId`
- `classroomId`

`schoolId` is not whitelisted and is rejected by the global validation convention.

## Analytics data pack summary

Implemented first pack:

```text
operational_snapshot_v1
```

This pack is snapshot-only. It does not produce historical time series, drilldown data, exports, realtime data, or saved dashboard/report state.

## Available chart data implemented

The following catalog chart definitions are now marked:

```text
status: available
meta.dataAvailability: computed_snapshot
```

Available charts:

- `attendance.pending_sessions`
- `grades.pending_submission_reviews`
- `grades.pending_answer_reviews`
- `communication.moderation_queue`
- `settings.email_connection_readiness`
- `settings.login_identity_readiness`

No chart-key substitutions were needed; all recommended first-pack chart keys existed exactly in the catalog.

## Charts intentionally left planned/deferred

All other existing analytics chart definitions remain:

```text
status: planned
meta.dataAvailability: definition_only
```

Known unsupported chart data requests return a safe `200` not-implemented envelope with empty series/totals and no fake computed data.

Unknown chart keys return `404` through the existing project not-found convention.

## Data computation sources

Computed from existing dashboard read models:

- `attendance.pending_sessions` -> `summary.cards.attendance.pendingSessionsToday`
- `grades.pending_submission_reviews` -> `summary.cards.grades.pendingSubmissions`
- `grades.pending_answer_reviews` -> `summary.cards.grades.pendingAnswerReviews`
- `communication.moderation_queue` -> `summary.cards.communication.pendingModerationReports`
- `settings.email_connection_readiness` -> `alertSignals.settings.missingActiveEmailConnection`
- `settings.login_identity_readiness` -> `alertSignals.settings.missingLoginIdentity`

No dashboard-owned persistence, schema changes, raw table payloads, or unbounded analytics queries were added.

## Security/no-leak posture

- Controller remains thin and delegates to the use case.
- No Prisma access in the controller.
- Existing `dashboard.analytics.view` permission is reused.
- School scope is required through `requireDashboardScope()`.
- Future filter IDs are echoed only as user-provided filter values and are not used for cross-school lookups in this sprint.
- `schoolId` is not accepted as a query parameter.
- Responses do not include tenant/internal identifiers such as `schoolId`, `organizationId`, `membershipId`, `roleId`, raw actor/user/resource ids, password hashes, deleted markers, storage internals, provider secrets, or raw row payloads.
- Security tests verify School A cannot observe School B analytics readiness data.

## Tests added/updated

Added:

- `src/modules/dashboard/tests/dashboard-analytics-data.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-data.presenter.spec.ts`
- `test/e2e/dashboard-analytics-data-pack-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-analytics-data.spec.ts`

Updated:

- analytics catalog presenter tests to assert only first-pack charts are available/computed
- analytics catalog E2E route inventory
- widgets and command-center E2E route inventories
- dashboard security inventory tests for the new data route permission metadata

## Verification commands

Passed:

- `git status --short --untracked-files=all` before changes: clean
- `git log --oneline -15` before changes: HEAD matched `8d905e80 feat: add dashboard analytics catalog`
- `npx prisma validate`
- `npx prisma generate`
- `npm run build`
- `npx tsc -p tsconfig.build.json --noEmit`
- `npx jest --runInBand src/modules/dashboard/tests/dashboard-analytics-data.use-case.spec.ts`
- `npx jest --runInBand src/modules/dashboard/tests/dashboard-analytics-data.presenter.spec.ts`
- `npx jest --runInBand src/modules/dashboard/tests/dashboard-analytics.use-case.spec.ts`
- `npx jest --runInBand src/modules/dashboard/tests/dashboard-analytics.presenter.spec.ts`
- `npm run test -- dashboard --runInBand`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-analytics-data-pack-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-analytics-catalog-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-widgets-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-command-center-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-summary-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-alerts-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-activity-feed-foundation.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-analytics-data.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-analytics.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-widgets.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-command-center.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-alerts.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-activity-feed.spec.ts`

Notable results:

- Dashboard aggregate: 26 suites passed, 146 tests passed
- Analytics data unit specs: 2 suites passed, 11 tests passed
- Analytics data E2E: 1 suite passed, 6 tests passed
- Analytics data security: 1 suite passed, 4 tests passed

## Known issues

- None for this sprint.
- Git may print LF-to-CRLF warnings on Windows because of local line-ending settings; `git diff --check` is the authoritative whitespace gate.

## Final verdict

READY FOR REVIEW
