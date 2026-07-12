# DASHBOARD-CONTEXT-NORMALIZATION-1A Closeout

## Sprint identity

- Sprint: `DASHBOARD-CONTEXT-NORMALIZATION-1A`
- Branch: `feat/dashboard-context-normalization-1a`
- Required baseline and current `HEAD`: `3e215446a2670ba71b35317f5eacac4b3c2d2f6a`
- Source-of-truth baseline: `docs/sprint-dashboard-command-center-2a-reality-baseline.md`
- Scope: focused Dashboard runtime normalization, metadata clarification, focused regression coverage, and this closeout document.

The start gate passed before modification: the branch name and `HEAD` matched the required values, the branch had no commits after the baseline, its merge base with the baseline was the baseline itself, and the working tree was clean.

## Behavior before and after

| Area | Before | After |
| --- | --- | --- |
| Dashboard time context | Summary and Alerts built windows with server-local `Date` mutation; LightModeDropdown had separate timezone helpers. | One reusable context produces the request timestamp, resolved timezone, civil date, Prisma date carrier, and timezone-aware boundaries. |
| Summary | “Today” depended on the server-local timezone and its attendance date used that local instant. | Uses the authenticated school's civil date and boundaries, one `generatedAt`, and a civil-date carrier for Prisma `@db.Date` comparisons. The response exposes the same effective timezone used for calculation. |
| Alerts | “Today,” 30-day history, and announcement expiry used server-local arithmetic. | Uses the same school-local context semantics as Summary; announcement expiry ends at an exact rolling seven-day instant. |
| Command Center | Created its own timestamp while Summary and Alerts derived independent local windows; the displayed date used a separate formatter. | Resolves one school time context and derives response generation time, effective school timezone, civil date, Summary windows, and Alert windows from it. |
| Deferred metadata | Several existing standalone surfaces were described as wholly deferred. | Metadata distinguishes available, foundation, snapshot-only, persisted, integration-deferred, and genuinely deferred capabilities. |
| Freshness | Legacy values such as `live` overloaded request-time computation and realtime delivery. | Explicit freshness identifies static catalogs, request-time database snapshots, and persisted user data while declaring cache and realtime as unused. |
| Analytics endpoints | `endpoint` identified a chart definition route without explicitly distinguishing the data route. | Legacy `endpoint` remains the definition endpoint; `definitionEndpoint`, `dataEndpoint`, and `endpointPurpose` make both contracts explicit. |
| Module List freshness | The response was marked as a static catalog even though alert-derived risks and actions are computed per request. | The response is marked `request_time_snapshot`; Module Detail retains the same request-time snapshot semantics. |
| Analytics computed-series metadata | Chart list/detail responses unconditionally reported `snapshot_only`. | List/detail metadata is derived from only the returned definitions: at least one computed snapshot reports `snapshot_only`; an all-definition-only response reports `deferred`. |

No Dashboard route, controller permission decorator, permission name, tenant input contract, or response field was removed or renamed.

## Unified timezone resolution

The reusable Dashboard time context resolves timezones in this order:

1. A valid explicit timezone when the existing route contract permits it. This applies to LightModeDropdown; it does not add a client timezone input to Summary, Alerts, or Command Center.
2. A valid active `SchoolProfile.timezone` loaded through scoped Prisma.
3. `UTC` when the school timezone is absent or invalid.

Timezone validity and civil-date formatting use the standard `Intl.DateTimeFormat` runtime. No date dependency was added. Summary, Alerts, Command Center, widgets, modules, and analytics snapshot composition resolve from authenticated school context. LightModeDropdown preserves its existing explicit-timezone capability and now delegates resolution and date handling to the shared abstraction.

Summary and Command Center expose the resolved effective timezone, not the raw profile value. A valid configured timezone is preserved. Invalid, blank, or absent profile timezones are exposed as `UTC`. Command Center's `school.timezone`, `today.timezone`, civil date, Summary windows, Alert windows, and `generatedAt` therefore all come from the same time context.

## Date-window semantics

For a generated instant whose resolved school-local civil date is `D`, the context provides:

- `generatedAt`: one copied request timestamp used throughout the composition;
- `civilDate`: `D` in `YYYY-MM-DD` form;
- `todayDate`: UTC-midnight representation of `D` for deterministic Prisma `@db.Date` equality;
- `todayStart`: the real UTC instant at which civil date `D` starts in the resolved timezone;
- `todayEndExclusive`: the real UTC instant at which `D + 1` starts;
- `last7DaysStart`: start of civil date `D - 7`;
- `last30DaysStart`: start of civil date `D - 30`;
- `next7DaysEndExclusive`: the exact rolling instant `generatedAt + (7 * 24 * 60 * 60 * 1000)`.

Timestamp queries remain bounded by the request timestamp where the existing metrics require a current snapshot. Attendance date equality uses `todayDate`, while timestamp-backed metrics use actual timezone-aware instants. Announcement expiry retains the exclusive `lt next7DaysEndExclusive` comparison and therefore does not extend toward an eighth day. The conversion is deterministic and does not depend on the machine's local timezone.

## Metadata corrections

### Capability states

- Activity Feed and Alerts are marked available as standalone request-time snapshot surfaces.
- Widgets are available as a standalone registry/composition surface; widget preferences and custom layouts remain deferred.
- Analytics is marked snapshot-only where the six computed data packs exist; historical analytics, drilldowns, exports, saved reports, and custom dashboards remain deferred.
- LightModeDropdown is marked as a foundation surface.
- Dashboard Todos is marked as persisted standalone user data; its integration into widget composition remains explicitly distinguishable from standalone availability.
- Weather provider, planner calendar/cross-module events, alert lifecycle, realtime, caching, and other unimplemented capabilities remain deferred.

Legacy public metadata fields and enum values remain present for compatibility. New fields add precision instead of changing existing route or response names.

### Freshness contract

The explicit freshness contract supports these semantics:

- `static_catalog`: definitions served from the runtime catalog;
- `request_time_snapshot`: values computed from database state during the request;
- `persisted_user_data`: stored owner-scoped data such as Dashboard Todos;
- `cached`: reserved for a future implemented cache path;
- `realtime`: reserved for future push-backed data.

Current responses declare `cacheStatus: not_used` and `realtimeStatus: not_used`. Legacy values such as Command Center's `dataFreshness: live` and widget `freshness: live` are retained only for backward compatibility and are disambiguated by the new explicit freshness metadata.

The Module List is explicitly `request_time_snapshot` because its risk counts and actions consume request-time Alerts. Module Detail remains `request_time_snapshot`.

### Analytics endpoint contract

Each chart definition now exposes:

- `endpoint`: preserved legacy definition endpoint;
- `definitionEndpoint`: `/dashboard/analytics/charts/:chartKey`;
- `dataEndpoint`: `/dashboard/analytics/charts/:chartKey/data`;
- `endpointPurpose`: `definition`.

The actual controller paths and the global `/api/v1` prefix are unchanged.

Catalog-level `computedSeries` remains `snapshot_only` because the full catalog includes six computed snapshots. Chart lists and details derive `computedSeries` from their returned chart definitions: `snapshot_only` when at least one returned chart has `meta.dataAvailability: computed_snapshot`, otherwise `deferred`. Historical series remain deferred in both cases.

## Exact files changed

### Runtime and contracts

- `src/modules/dashboard/application/dashboard-time-context.service.ts`
- `src/modules/dashboard/application/get-dashboard-analytics-chart-data.use-case.ts`
- `src/modules/dashboard/application/get-dashboard-command-center.use-case.ts`
- `src/modules/dashboard/application/get-dashboard-light-mode-dropdown.use-case.ts`
- `src/modules/dashboard/application/get-dashboard-module-page.use-case.ts`
- `src/modules/dashboard/application/get-dashboard-summary.use-case.ts`
- `src/modules/dashboard/application/get-dashboard-widget.use-case.ts`
- `src/modules/dashboard/application/list-dashboard-alerts.use-case.ts`
- `src/modules/dashboard/application/list-dashboard-modules.use-case.ts`
- `src/modules/dashboard/application/list-dashboard-widgets.use-case.ts`
- `src/modules/dashboard/dashboard.module.ts`
- `src/modules/dashboard/domain/dashboard-analytics-catalog.ts`
- `src/modules/dashboard/domain/dashboard-time-context.ts`
- `src/modules/dashboard/dto/dashboard-activity-feed.dto.ts`
- `src/modules/dashboard/dto/dashboard-alerts.dto.ts`
- `src/modules/dashboard/dto/dashboard-analytics-data.dto.ts`
- `src/modules/dashboard/dto/dashboard-analytics.dto.ts`
- `src/modules/dashboard/dto/dashboard-command-center.dto.ts`
- `src/modules/dashboard/dto/dashboard-light-mode-dropdown.dto.ts`
- `src/modules/dashboard/dto/dashboard-metadata.dto.ts`
- `src/modules/dashboard/dto/dashboard-modules.dto.ts`
- `src/modules/dashboard/dto/dashboard-summary.dto.ts`
- `src/modules/dashboard/dto/dashboard-todos.dto.ts`
- `src/modules/dashboard/dto/dashboard-widgets.dto.ts`
- `src/modules/dashboard/infrastructure/dashboard-alerts.repository.ts`
- `src/modules/dashboard/infrastructure/dashboard-summary.repository.ts`
- `src/modules/dashboard/infrastructure/dashboard-time-context.repository.ts`
- `src/modules/dashboard/presenters/dashboard-activity-feed.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-alerts.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-analytics-data.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-analytics.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-command-center.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-light-mode-dropdown.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-metadata.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-modules.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-summary.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-todos.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-widgets.presenter.ts`

### Unit tests and test support

- `src/modules/dashboard/tests/dashboard-activity-feed.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-alerts.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-alerts.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-data.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-command-center.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-command-center.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-light-mode-dropdown.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-modules.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-modules.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-summary.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-summary.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-test-time-context.ts`
- `src/modules/dashboard/tests/dashboard-time-context.spec.ts`
- `src/modules/dashboard/tests/dashboard-todos.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-widgets.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-widgets.use-case.spec.ts`

### E2E and security tests

- `test/e2e/dashboard-alerts-foundation.e2e-spec.ts`
- `test/e2e/dashboard-analytics-catalog-foundation.e2e-spec.ts`
- `test/e2e/dashboard-command-center-foundation.e2e-spec.ts`
- `test/e2e/dashboard-module-pages-foundation.e2e-spec.ts`
- `test/e2e/dashboard-summary-foundation.e2e-spec.ts`
- `test/e2e/dashboard-widgets-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-alerts.spec.ts`
- `test/security/tenancy.dashboard-analytics-data.spec.ts`
- `test/security/tenancy.dashboard-command-center.spec.ts`
- `test/security/tenancy.dashboard-modules.spec.ts`
- `test/security/tenancy.dashboard-widgets.spec.ts`
- `test/security/tenancy.dashboard.spec.ts`

### Documentation

- `docs/sprint-dashboard-context-normalization-1a-closeout.md`

## Tests added or updated

Focused time-context coverage verifies:

- a UTC school near UTC midnight;
- Africa/Cairo when its civil date differs from the UTC date;
- Africa/Cairo start-of-day conversion;
- seven-day and 30-day boundaries;
- invalid and absent school timezones falling back to UTC;
- valid, invalid, blank, and absent profile timezone response behavior for Summary and Command Center;
- explicit, school, and fallback timezone resolution order;
- one supplied generated timestamp retained by the time-context service;
- one shared Command Center timestamp and matching Summary/Alert windows.

Summary and Alert use-case tests verify exact Cairo civil boundaries and the rolling seven-day alert horizon without relying on the host timezone. Analytics presenter/use-case tests verify both definition-only `deferred` and computed `snapshot_only` list/detail responses. Presenter, catalog, widget, module, LightModeDropdown, Todos, E2E, and tenancy tests verify the capability/freshness/endpoint metadata while retaining existing route, permission, scoping, owner-isolation, no-leak, and safe-response behavior.

## Verification commands and exact results

| Command | Result |
| --- | --- |
| Start-gate branch, `HEAD`, merge-base, ahead-count, and clean-tree checks | PASS — exact branch and baseline; zero commits ahead; clean before edits. |
| `npm run infra:up` | PASS — local PostgreSQL and Redis infrastructure started for E2E verification. |
| `npm run db:migrations:status` | PASS — 2 migrations found; database schema up to date. This was a read-only status check. |
| Focused time-context, Summary, Alerts, Command Center, Analytics, and Module unit suites via `npx jest --runInBand ...` | PASS — 11 suites, 57 tests. |
| All ten Dashboard E2E suites via `npx jest --config ./test/jest-e2e.json --runInBand ...` | PASS — 10 suites, 55 tests. |
| All `test/security/tenancy.dashboard*.spec.ts` suites | PASS — 10 suites, 42 tests. |
| `npm run test -- dashboard --runInBand` | PASS — 33 suites, 191 tests. |
| `npx prisma validate` | PASS — schema valid. |
| `npx prisma generate` | PASS — Prisma Client v6.19.3 generated. |
| `npm run build` | PASS. |
| `npx tsc -p tsconfig.build.json --noEmit` | PASS. |
| `git diff --check` | PASS — exit code 0. |

The complete Dashboard E2E surface was covered in one final run: 10 suites and 55 tests total. A repository-wide regression was not run because the changed dependency graph is confined to the Dashboard module and the required Dashboard unit, E2E, and tenancy/security layers provide the policy-proportionate coverage. No destructive database command was run.

## Schema, migration, seed, and permission status

- Prisma schema changes: none.
- Migration changes: none.
- Seed changes: none.
- Permission definitions or decorators changed: none.
- System-role inheritance changed: none.
- Package or dependency changes: none.
- Workflow, configuration, or environment changes: none.

Existing `requireDashboardScope()`, organization/school membership enforcement, scoped Prisma access, Dashboard Todo `SchoolManagementOnly`, owner isolation, safe 404 behavior, internal-identifier response shaping, and tenant-override rejection remain in place.

## Known limitations

- Analytics still has exactly six request-time computed snapshots; filters are normalized and echoed but do not yet change those computations.
- Historical analytics, drilldowns, exports, saved reports, and custom dashboards are not implemented.
- The analytics data-point `x` contract remains snapshot-oriented.
- Weather provider data, planner calendar/cross-module events, alert lifecycle persistence/actions, realtime push, and Dashboard caching are not implemented.
- Freshness metadata defines future cache and realtime states, but current responses truthfully report both mechanisms as unused.
- Multiple Dashboard endpoints can still reload overlapping Summary, Alert, and Activity aggregates. This remains a scalability risk to measure before introducing caching or optimization, not a proven production failure.

## Next sprint

`DASHBOARD-ANALYTICS-QUERY-FOUNDATION-2A`

The next sprint can build active, school-safe analytics query semantics on the normalized time and metadata foundation. It should retain the distinction between catalog definitions and request-time computed data and must validate hierarchy identifiers before using them as query inputs.

## Final verdict

DASHBOARD-CONTEXT-NORMALIZATION-1A: READY FOR REVIEW
