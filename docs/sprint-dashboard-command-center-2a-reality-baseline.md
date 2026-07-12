# DASHBOARD-COMMAND-CENTER-2A Reality Baseline

## 1. Sprint identity

- Sprint: `DASHBOARD-COMMAND-CENTER-2A-REALITY-BASELINE`
- Branch: `docs/dashboard-command-center-2a-reality-baseline`
- Baseline commit: `852668bab20b9130fc44d84d33d05614e95fd17c`
- Purpose: record the current Dashboard implementation reality at the stated baseline and replace historical intent with a source-verified execution baseline.
- Scope: documentation only. This sprint changes no runtime code, tests, Prisma schema, migrations, seeds, packages, workflows, configuration, or environment files.

The branch name and exact HEAD commit were verified before inspection. The working tree was clean before this document was created.

## 2. Truth hierarchy

When sources disagree, this document applies the following authority order:

1. current runtime code
2. current Prisma schema and migrations
3. current tests
4. current permission seed
5. current closeout documents
6. historical planning reports

Historical planning documents are intent references only. They are not implementation evidence and are not authoritative when they conflict with the current branch.

`DIRECTORY_STRUCTURE.md`, named by the repository reading order, is absent at this baseline. `DIRECTORY_STRUCTURE_VISUAL.md` was inspected as the available structural reference; no missing-document content was inferred.

## 3. Current route inventory

The global prefix is set by `app.setGlobalPrefix('api/v1')`. The current Dashboard surface contains exactly 17 routes.

### DashboardController: 13 read-only routes

| # | Method and route | Required permission |
| ---: | --- | --- |
| 1 | `GET /api/v1/dashboard/command-center` | `dashboard.command_center.view` |
| 2 | `GET /api/v1/dashboard/light-mode-dropdown` | `dashboard.light_mode_dropdown.view` |
| 3 | `GET /api/v1/dashboard/analytics/catalog` | `dashboard.analytics.view` |
| 4 | `GET /api/v1/dashboard/analytics/charts` | `dashboard.analytics.view` |
| 5 | `GET /api/v1/dashboard/analytics/charts/:chartKey` | `dashboard.analytics.view` |
| 6 | `GET /api/v1/dashboard/analytics/charts/:chartKey/data` | `dashboard.analytics.view` |
| 7 | `GET /api/v1/dashboard/modules` | `dashboard.modules.view` |
| 8 | `GET /api/v1/dashboard/modules/:moduleKey` | `dashboard.modules.view` |
| 9 | `GET /api/v1/dashboard/widgets` | `dashboard.widgets.view` |
| 10 | `GET /api/v1/dashboard/widgets/:widgetKey` | `dashboard.widgets.view` |
| 11 | `GET /api/v1/dashboard/summary` | `dashboard.summary.view` |
| 12 | `GET /api/v1/dashboard/alerts` | `dashboard.alerts.view` |
| 13 | `GET /api/v1/dashboard/activity-feed` | `dashboard.activity_feed.view` |

### DashboardTodosController: 4 routes

| # | Method and route | Required permission |
| ---: | --- | --- |
| 14 | `GET /api/v1/dashboard/light-mode-dropdown/todos` | `dashboard.todos.view` |
| 15 | `POST /api/v1/dashboard/light-mode-dropdown/todos` | `dashboard.todos.manage` |
| 16 | `PATCH /api/v1/dashboard/light-mode-dropdown/todos/:todoId` | `dashboard.todos.manage` |
| 17 | `DELETE /api/v1/dashboard/light-mode-dropdown/todos/:todoId` | `dashboard.todos.manage` |

`DashboardTodosController` is class-decorated with `SchoolManagementOnly`. The current guard permits only `organization_user` and `school_user` actors on that controller, even if another actor type is granted the Todo permission strings.

## 4. Current permission inventory

The current permission seed contains exactly these 10 Dashboard permissions:

| Permission | Current use |
| --- | --- |
| `dashboard.summary.view` | Summary route |
| `dashboard.alerts.view` | Alerts route |
| `dashboard.activity_feed.view` | Activity Feed route |
| `dashboard.command_center.view` | Command Center route |
| `dashboard.widgets.view` | Widget list and detail routes |
| `dashboard.analytics.view` | Analytics catalog, definition, and data routes |
| `dashboard.modules.view` | Module list and detail routes |
| `dashboard.light_mode_dropdown.view` | LightModeDropdown composition route |
| `dashboard.todos.view` | Todo list route |
| `dashboard.todos.manage` | Todo create, update, and delete routes |

Current system-role inheritance is defined in `prisma/seeds/02-system-roles.seed.ts`:

| System role | Dashboard permission behavior |
| --- | --- |
| `platform_super_admin` | Inherits `ALL = PERMISSION_CODES`, which includes all 10 Dashboard permissions. Dashboard school context requirements still apply, and `SchoolManagementOnly` does not admit `platform_user` to Todo routes. |
| `organization_admin` | Inherits `NON_PLATFORM`; all Dashboard permissions are non-platform permissions and are included. |
| `school_admin` | Inherits `SCHOOL_LEVEL = NON_PLATFORM`; all Dashboard permissions are included. |
| `teacher` | Explicit allowlist contains no `dashboard.*` permission. |
| `parent` | Explicit allowlist contains no `dashboard.*` permission. |
| `student` | Explicit allowlist contains no `dashboard.*` permission. |

The exclusions are not inferred from role names. They are verified against the three explicit allowlists and the Dashboard security tests, including the separate Todo permission checks.

## 5. Dashboard surface implementation matrix

| Surface | Classification | Current reality |
| --- | --- | --- |
| Summary | `NEEDS NORMALIZATION` | DB-backed aggregation is implemented, but its date windows use server-local time and its deferred metadata is stale. |
| Alerts | `NEEDS NORMALIZATION` | Read-time operational alerts are implemented, but day boundaries use server-local time and some deferred metadata is stale. |
| Activity Feed | `COMPLETE` | Audit-backed, filtered, cursor-paginated, school-scoped read surface is implemented for its current contract. |
| Command Center | `NEEDS NORMALIZATION` | Composition is implemented, but date/freshness semantics and deferred capability metadata need correction. |
| Widgets Registry | `FOUNDATION COMPLETE / TARGET PARTIAL` | Twelve server-defined widgets are live; layouts, preferences, additional widget families, and richer composition remain deferred or absent. |
| Analytics Catalog | `NEEDS NORMALIZATION` | The complete current definition registry exists, but computed-series deferral and chart endpoint metadata no longer match runtime reality cleanly. |
| Analytics Data Packs | `PARTIAL` | One six-chart snapshot pack exists; 31 definitions have no computation and no historical series exist. |
| Module Pages | `FOUNDATION COMPLETE / TARGET PARTIAL` | Generic list/detail pages exist for 10 modules; only four modules contain partial analytics data. |
| LightModeDropdown | `FOUNDATION COMPLETE / TARGET PARTIAL` | Location/time/date resolution and Todo composition exist; weather and planner events do not. |
| Dashboard Todos | `COMPLETE` | Persisted owner-scoped CRUD is implemented and the sprint is closed. |
| Weather | `NOT IMPLEMENTED` | No provider adapter, provider call, weather cache, or populated weather data exists. |
| Planner | `PARTIAL` | The response shell and persisted Todo composition exist; calendar and cross-module events are not implemented. |
| Alert Lifecycle | `NOT IMPLEMENTED` | No persistence, acknowledge, dismiss, snooze, or read-state runtime exists. |
| Realtime | `NOT IMPLEMENTED` | No Dashboard realtime invalidation/event contract is implemented. |
| Cache and Performance | `NOT IMPLEMENTED` | No Dashboard cache is used and no measured optimization closeout exists. |
| Final Dashboard Closeout | `NOT IMPLEMENTED` | The required normalization, analytics, planner, weather, lifecycle, realtime, and performance work remains open. |

## 6. Current Summary implementation

Summary is DB-backed. `GetDashboardSummaryUseCase` requires current Dashboard scope, builds a date window, loads a school-scoped snapshot from `DashboardSummaryRepository`, and passes it through `presentDashboardSummary`.

The current cards aggregate normalized source-domain data from:

- admissions: leads, applications, placement tests, interviews, and recent decisions;
- students: active students, enrollments, guardians, new enrollments, and withdrawals;
- academics: active year/term context, structures, subjects, rooms, allocations, curricula, lesson plans, timetable entries, and publications;
- attendance: today's sessions and entries plus pending excuses;
- grades: assessment workflow states, items, submissions, and answer reviews;
- homework: assignments, review backlog, and grade-sync readiness;
- behavior: recent positive/negative records and review backlog;
- reinforcement: tasks, submissions, assignments, XP ledger activity, and rewards;
- communication: announcements, messages, conversations, and moderation reports.

Current date-window behavior is exact but not timezone-normalized:

- `now` is the request-time `Date`.
- `todayStart` is produced with `setHours(0, 0, 0, 0)`, so it is midnight in the backend process's local timezone.
- `last7DaysStart` is the same local clock time seven calendar days earlier; it is not truncated to a day boundary.
- `last30DaysStart` is the same local clock time 30 calendar days earlier; it is not truncated to a day boundary.
- Attendance's "today" queries compare their date field to `todayStart`.
- Recent messages use the seven-day threshold; recent decisions, new enrollments, behavior records, and XP ledger entries use the 30-day threshold.

The repository does load the school's configured timezone for response context, but that timezone does not drive these query boundaries. Summary also currently emits `school.locale: null`.

## 7. Current Command Center implementation

Command Center is a read-model composition of:

- Summary;
- Alert signals, mapped into current computed alerts;
- Activity Feed audit records, mapped into safe activity preview items.

The use case loads those three inputs concurrently. The response contains `generatedAt` and these current output areas:

- `school`
- `academicContext`
- `operator`
- `today`
- `quickStats`
- `operationalHealth`
- `moduleReadiness`
- `topRisks`
- `topActions`
- `alertsPreview`
- `activityPreview`
- `meta`

`today` is formatted using a validated school timezone with a UTC fallback. That display behavior does not normalize the underlying Summary and Alert query windows, which still use server-local boundaries.

Current `meta.deferred` is stale: it marks `widgets`, `analytics`, `lightModeDropdown`, and `todos` as deferred even though all four now have runtime implementations. Weather, planner events, alert lifecycle, and realtime remain genuinely deferred. `dataFreshness: live` means request-time aggregation in current code, but it does not define source timestamps, consistency, staleness tolerance, or cache semantics.

## 8. Current Widget Registry

The current registry contains exactly 12 widgets:

| Widget key | Type | Source |
| --- | --- | --- |
| `students.active` | `stat-card` | students |
| `admissions.open_applications` | `stat-card` | admissions |
| `attendance.pending_today` | `action-card` | attendance |
| `attendance.absences_today` | `risk-card` | attendance |
| `homework.waiting_review` | `action-card` | homework |
| `grades.pending_review` | `action-card` | grades |
| `behavior.pending_review` | `action-card` | behavior |
| `reinforcement.pending_reviews` | `action-card` | reinforcement |
| `communication.moderation_queue` | `risk-card` | communication |
| `settings.email_connection` | `action-card` | settings |
| `settings.login_identity` | `action-card` | settings |
| `activity.recent` | `timeline-card` | activity |

Implemented widget types are `stat-card` (2), `action-card` (7), `risk-card` (2), and `timeline-card` (1). `progress-card` is accepted by the DTO type contract but has no current registry instance. Historical proposals for mini-chart, calendar, Todo, weather, and table widget types are not part of the current runtime type union.

Current widget response metadata defers custom layouts, widget preferences, analytics-chart widgets, weather widgets, and Todo widgets. The `analyticsCharts` and `todoWidgets` terms describe missing widget integration, not absence of the standalone Analytics and Todo surfaces; this distinction should be made explicit during normalization.

Both list and detail use cases currently load the full overlapping Summary, Alert, and Activity inputs before presenter selection, including when one widget needs only a subset.

## 9. Current Analytics Catalog

The current catalog is a server-defined, school-scope-gated definition registry with:

- 10 sources: admissions, students, academics, attendance, grades, homework, behavior, reinforcement, communication, and settings;
- 11 supported chart types: line, bar, stacked-bar, area, donut, pie, funnel, heatmap, radial-progress, table, and timeline;
- 6 ranges: `7d`, `30d`, `90d`, `term`, `academic_year`, and `custom`;
- 3 granularities: `day`, `week`, and `month`;
- 16 metric definitions;
- 11 KPI definitions;
- 37 chart definitions.

Catalog availability and computed data availability are different:

- All 37 charts are available as definitions through the catalog/list/detail endpoints.
- Only six definitions have `status: available` and `meta.dataAvailability: computed_snapshot`.
- The other 31 have `status: planned` and `meta.dataAvailability: definition_only`.
- Metrics and KPIs are definitions with `status: planned`; their presence does not mean a metric/KPI computation endpoint exists.

The catalog-level `deferred.computedSeries` and chart-list/detail `deferred.computedSeries` values predate the first data pack and are now stale or overly broad because six computed snapshots exist.

## 10. Current Analytics Data Pack

The only implemented pack is:

```text
operational_snapshot_v1
```

Current implementation counts:

| Capability | Count |
| --- | ---: |
| Computed charts | 6 |
| Definition-only charts remaining | 31 |
| Historical time-series charts | 0 |
| Executable drilldowns | 0 |
| Exports | 0 |

The six computed chart keys are:

1. `attendance.pending_sessions`
2. `grades.pending_submission_reviews`
3. `grades.pending_answer_reviews`
4. `communication.moderation_queue`
5. `settings.email_connection_readiness`
6. `settings.login_identity_readiness`

The first four values come from the current Summary snapshot. The two Settings readiness values combine Summary loading with Alert readiness signals. The current pack is snapshot-only: every computed point currently uses `x: "snapshot"`, not a historical date/week/month bucket. The DTO also admits `x: "today"`, but current presenter code does not emit it.

Known, definition-only chart requests return a safe `200` envelope with empty data and `reason: not_implemented`. Unknown chart keys return `404`.

## 11. Current Module Pages

The registry contains these 10 module page keys:

1. `admissions`
2. `students`
3. `academics`
4. `attendance`
5. `grades`
6. `homework`
7. `behavior`
8. `reinforcement`
9. `communication`
10. `settings`

The route design is generic rather than one controller method per module:

- `GET /api/v1/dashboard/modules` lists registry entries with status/source/limit filters.
- `GET /api/v1/dashboard/modules/:moduleKey` resolves one registry definition or returns `404`.

Detail pages compose module-scoped widgets, chart definitions, any current snapshot data, computed overview risks/actions, sections, and capabilities. Missing registry references are omitted safely.

| Analytics data state | Modules |
| --- | --- |
| Partial | attendance, grades, communication, settings |
| Planned | admissions, students, academics, homework, behavior, reinforcement |

All 10 modules have chart definitions. Partial means only some registered charts have data from `operational_snapshot_v1`; it does not mean historical analytics are available.

## 12. Current LightModeDropdown

Current resolution and composition behavior is:

- Location data is read from the active school's `SchoolProfile` plus the matching `School` record.
- Display label uses normalized `formattedAddress`, otherwise normalized `city, country`. The school name affects the reported location source when no profile exists but is not used as the location label.
- Location source is `school_profile` when a profile row exists, `school_record` when only a school record is present, otherwise `fallback`.
- Timezone resolution order is valid query timezone, valid school-profile timezone, then `UTC`.
- `locale` accepts `en|ar` and defaults to `en`.
- `units` accepts `metric|imperial` and defaults to `metric`.
- `date` accepts a valid `YYYY-MM-DD`; otherwise it is the generated date in the resolved timezone.
- Persisted Todos are loaded for the resolved date, current school, and current owner, ordered by the Todo repository.

No weather provider is configured or called. `weather.provider` is `null`; current temperatures and observation time are null. Weather status is `provider_not_configured` when usable profile location text exists and `location_missing` otherwise. `hints`, `highlights`, `cities`, and `forecast` are empty.

Planner currently returns the resolved `timezone` and `date`, persisted owner Todos, and empty `eventDates` and `events`. There is no academic-calendar or cross-module planner composition.

Current metadata reports:

- `todosStatus: persisted`;
- `plannerStatus: foundation_only`;
- Todo persistence as persisted;
- weather provider/cache, planner calendar, cross-module planner items, and realtime as deferred.

Locale and units are normalized and echoed as metadata only. Because no weather content exists, they do not currently translate, localize, or convert weather values.

## 13. Dashboard Todos

Dashboard Todos is `COMPLETE` and `CLOSED` for its accepted sprint contract.

Persistence and migration:

- Prisma model: `DashboardTodo` mapped to `dashboard_todos`.
- Migration: `prisma/migrations/20260711162248_dashboard_todos/migration.sql`.
- Status enum: `PENDING | COMPLETED`.
- Priority enum: `LOW | NORMAL | HIGH`.
- Stored fields include school, owner, date, title, notes, status, priority, sort order, completion time, timestamps, and soft-delete time.
- Indexes cover school/owner/date/deletion, school/owner/status/deletion, and owner.

Runtime contract:

- School scope comes from request context; `DashboardTodo` participates in automatic Prisma school injection for reads and mutations. Creation explicitly writes the scoped school ID.
- Owner scope is always `ownerUserId = current actor`.
- CRUD is implemented on the four dedicated Todo routes.
- List requires `dashboard.todos.view`; create/update/delete require `dashboard.todos.manage`.
- `DashboardTodosController` is protected by `SchoolManagementOnly`.
- Client input has no school, organization, or owner override field; global validation rejects non-whitelisted override-shaped input.
- Delete is a soft delete that sets `deletedAt`; scoped reads automatically add `deletedAt: null`.
- Updating to `completed` sets `completedAt` when it was not already set. Updating to `pending` clears `completedAt`. Reapplying completed status preserves an existing completion timestamp.
- List ordering is `sortOrder ASC`, then `createdAt ASC`, then `id ASC`.
- Unknown, cross-owner, and cross-school mutation targets use the same safe `404` behavior.
- Presenters expose the contract `todoId` but do not expose school, organization, owner, membership, role, or soft-delete identifiers.
- LightModeDropdown composes persisted current-owner Todos for its resolved date.

Focused coverage exists in:

- `src/modules/dashboard/tests/dashboard-todos.use-case.spec.ts`;
- `src/modules/dashboard/tests/dashboard-todos.presenter.spec.ts`;
- `test/security/tenancy.dashboard-todos.spec.ts`;
- `test/e2e/dashboard-todos-crud.e2e-spec.ts`;
- the focused LightModeDropdown unit, security, and E2E suites.

These tests cover split permissions, the management-only actor boundary, owner/school isolation, safe 404 behavior, CRUD/status transitions, `completedAt`, soft delete, no-leak shaping, override rejection, and LightModeDropdown composition.

## 14. Current security posture

The following controls are verified in current code and focused tests:

- Request-context school scope: every Dashboard use case calls `requireDashboardScope()`, which requires an authenticated actor and active membership containing `schoolId`.
- Organization and school membership scope: Dashboard scope carries both IDs; direct school-record lookups constrain both current `schoolId` and `organizationId`.
- Scoped Prisma: source-domain Summary and Alert repositories use `prisma.scoped` for school-scoped models.
- DashboardTodo automatic school scoping: `DashboardTodo` is in `SCHOOL_SCOPED_MODELS`, so supported reads/mutations receive the active membership's school predicate.
- DashboardTodo soft-delete filtering: `DashboardTodo` is in `SOFT_DELETE_MODELS`, so reads exclude deleted rows unless the explicit global bypass is used; Dashboard code does not use that bypass.
- Owner filtering: every Todo repository operation filters the current actor as owner.
- No tenant override input: Dashboard request DTOs do not accept `schoolId`, `organizationId`, membership, role, or owner override fields; global validation uses whitelist plus `forbidNonWhitelisted`.
- Safe 404 behavior: unknown and cross-owner/cross-school Todo mutations are indistinguishable at the API contract.
- No internal identifier leakage: presenters and focused tests exclude tenant IDs, membership/role IDs, owner IDs, raw rows, deleted markers, and sensitive payload fields. Contract-approved academic context IDs, activity IDs on the standalone feed, and Todo IDs remain intentionally exposed where the current DTO requires them.
- Role exclusions: teacher, parent, and student system-role allowlists contain no Dashboard permission; Todo routes add the `SchoolManagementOnly` actor-type boundary.
- Focused tenancy/security tests exercise school A/school B isolation for Summary/source models, Alerts, Activity Feed, Command Center, Widgets, Analytics definitions/data, Module Pages, LightModeDropdown, and Todos.

`AuditLog` is intentionally outside automatic school scoping. The Activity Feed repository therefore adds its own `schoolId = current scope` predicate and only includes successful outcomes from approved modules.

This baseline does not claim database RLS, defense-in-depth beyond the current Prisma/application controls, field-level authorization for future drilldowns, or production performance behavior that the current tests do not prove.

## 15. Required findings register

| # | Finding | Classification | Impact | Recommended treatment |
| ---: | --- | --- | --- | --- |
| 1 | Summary and Alerts use server-local day boundaries, while LightModeDropdown and Todos use an explicit resolved school/query timezone. Command Center formats `today` in school time but consumes the server-local Summary/Alert windows. | Correctness / normalization | Around timezone differences and midnight, displayed date and underlying "today" counts can refer to different civil days. Seven- and 30-day thresholds also preserve the server-local clock time rather than a normalized boundary. | Introduce one Dashboard date context and use it across Summary, Alerts, Command Center, analytics snapshots, LightModeDropdown, and Todos. Add Cairo, UTC, and midnight-boundary regressions. |
| 2 | Analytics `range`, `granularity`, dates, and hierarchy filters are normalized and echoed but do not affect any of the six snapshot computations. | Contract truthfulness | A client can reasonably assume changing filters changes data when the value remains the same request-time snapshot. | Until query execution exists, mark filters as informational/ignored for snapshot packs or reject unsupported combinations. In the query-foundation sprint, make filters drive repository inputs and test value changes. |
| 3 | Analytics hierarchy filter IDs use string validation only. They do not currently require UUID shape or same-school existence because they are not active query inputs. | Security prerequisite | Activating them without stronger validation could create cross-school existence leaks or unsafe filtering. | Before any filter affects a query, validate UUIDs, resolve each hierarchy ID through scoped repositories, validate parent-child consistency, and return safe `404` for missing/out-of-scope resources. |
| 4 | `DashboardAnalyticsChartDataPointDto.x` is limited to `snapshot | today`; current data emits only `snapshot`. | Contract limitation | The current point shape cannot represent full date, week, month, categorical, table, funnel, or other coordinates required by the 37-definition catalog. | Replace the narrow union with an explicit discriminated coordinate contract before historical packs. Define date, week, month, category, and table/funnel shapes without weakening typing. |
| 5 | Each chart definition exposes `endpoint: /dashboard/analytics/charts/:chartKey`, which is the definition detail route, while computed data is served by `/dashboard/analytics/charts/:chartKey/data`. | Metadata ambiguity | Consumers can misread `endpoint` as the data endpoint and call the wrong route. | Rename it to `definitionEndpoint` and add `dataEndpoint`, or document endpoint kind explicitly while preserving shipped paths. |
| 6 | Freshness and deferred metadata contain stale or overloaded terminology. Examples include Summary deferring Activity Feed/Alerts, Command Center deferring four implemented surfaces, Analytics deferring all computed series, widget metadata using `analyticsCharts`/`todoWidgets` for integration gaps, and multiple request-time aggregates labeled simply `live`. | Metadata normalization | Clients cannot reliably distinguish unavailable capability, unavailable composition, request-time snapshot, source freshness, or no-cache behavior. | Define explicit capability states and freshness semantics, then correct presenters without changing route paths. Separate standalone capability availability from widget/module integration availability. |
| 7 | Multiple Dashboard endpoints independently reload overlapping Summary, Alert, and Activity aggregates. Summary, Command Center, Widgets list/detail, Analytics data, Module detail, and Module list repeat subsets of the same repositories; widget detail currently loads all three foundations before selecting one widget. | Scalability risk | Query count and latency can grow with traffic and future analytics complexity. This is a scalability risk, not a currently proven production failure. Current tests do not demonstrate a production incident or an SLO breach. | First instrument endpoint latency and query counts. Then reduce unnecessary loads, introduce request-local composition reuse, batch where appropriate, and add cache only after measured evidence and invalidation requirements are known. |

## 16. Revised execution roadmap

The execution order is:

1. `DASHBOARD-CONTEXT-NORMALIZATION-1A`
2. `DASHBOARD-ANALYTICS-QUERY-FOUNDATION-2A`
3. `DASHBOARD-ANALYTICS-ATTENDANCE-2B`
4. `DASHBOARD-ANALYTICS-ADMISSIONS-STUDENTS-2C`
5. `DASHBOARD-ANALYTICS-ACADEMICS-2D`
6. `DASHBOARD-ANALYTICS-GRADES-HOMEWORK-2E`
7. `DASHBOARD-ANALYTICS-BEHAVIOR-REINFORCEMENT-2F`
8. `DASHBOARD-ANALYTICS-COMMUNICATION-SETTINGS-2G`
9. `DASHBOARD-WIDGETS-COMPOSITION-2A`
10. `DASHBOARD-PLANNER-CALENDAR-1A`
11. `DASHBOARD-PLANNER-CROSS-MODULE-1B`
12. `DASHBOARD-WEATHER-CONTRACT-0A`
13. `DASHBOARD-WEATHER-PROVIDER-1A`
14. `DASHBOARD-ALERT-LIFECYCLE-0A`
15. `DASHBOARD-ALERT-LIFECYCLE-1A`
16. `DASHBOARD-REALTIME-1A`
17. `DASHBOARD-PERFORMANCE-1A`
18. `DASHBOARD-COMMAND-CENTER-FINAL-CLOSEOUT`

## 17. Next sprint contract

The next sprint is:

```text
DASHBOARD-CONTEXT-NORMALIZATION-1A
```

### Intended scope

- unified Dashboard timezone-aware date context;
- Summary date-window normalization;
- Alerts date-window normalization;
- Command Center date normalization;
- corrected deferred capability metadata;
- explicit freshness semantics;
- analytics definition/data endpoint metadata clarification;
- regression tests around `Africa/Cairo`, `UTC`, and midnight boundaries.

The normalization must preserve all 17 existing route paths and methods, current permission names, school/owner isolation, and current frontend response fields unless a backward-compatible metadata addition or explicitly approved contract correction is used.

### Non-goals

- no analytics historical series;
- no new chart packs;
- no weather provider;
- no planner integration;
- no alert persistence;
- no realtime;
- no cache;
- no schema or migration unless a separately approved finding proves one is required.

## 18. Verification evidence

This is a documentation-only sprint. The required final checks are:

```text
git status --short --untracked-files=all
git diff --name-status
git diff --stat
git diff --check
git diff -- docs/sprint-dashboard-command-center-2a-reality-baseline.md
git diff --cached --name-only
```

Final verification results:

- `git status --short --untracked-files=all` returned only `?? docs/sprint-dashboard-command-center-2a-reality-baseline.md`.
- `git diff --name-status` returned no output because the only changed file is untracked.
- `git diff --stat` returned no output for the same reason.
- `git diff --check` returned no output and exited successfully.
- `git diff -- docs/sprint-dashboard-command-center-2a-reality-baseline.md` returned no output because the file is untracked.
- `git diff --cached --name-only` returned no output; no files are staged.

Ordinary `git diff` commands do not display an untracked file until it is tracked, so `git status --short --untracked-files=all` is the authoritative changed-file inventory for this intentionally unstaged documentation-only state. The checks establish that:

- only `docs/sprint-dashboard-command-center-2a-reality-baseline.md` is untracked or modified;
- no staged files;
- `git diff --check` exits successfully;
- no runtime, test, Prisma, migration, seed, package, workflow, configuration, or environment file changed;
- the full regression suite was not run because this sprint is documentation only.

## 19. Final verdict

DASHBOARD-COMMAND-CENTER-2A-REALITY-BASELINE: READY FOR REVIEW
