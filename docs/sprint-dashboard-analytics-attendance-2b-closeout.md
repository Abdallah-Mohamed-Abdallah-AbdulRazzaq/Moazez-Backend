# DASHBOARD-ANALYTICS-ATTENDANCE-2B Closeout

## Sprint identity

- Sprint: `DASHBOARD-ANALYTICS-ATTENDANCE-2B`
- Branch: `feat/dashboard-analytics-attendance-2b`
- Baseline and unchanged `HEAD`: `29c3a6a3b053e58094f0ee0e2033c80e5c3eb9a8`
- Purpose: implement the first complete persisted historical Dashboard Analytics source pack for Attendance.
- Existing route: `GET /api/v1/dashboard/analytics/charts/:chartKey/data`
- Existing permission: `dashboard.analytics.view`

The start gate passed before modification: branch, `HEAD`, and merge base matched the baseline; the branch had zero commits after the baseline; and the worktree and index were clean.

## Implemented Attendance charts

The named pack is `attendance_v1`.

| Chart                            | Data availability   | Computation                                  |
| -------------------------------- | ------------------- | -------------------------------------------- |
| `attendance.daily_trend`         | `computed_series`   | `attendance_observation_daily_trend`         |
| `attendance.status_distribution` | `computed_series`   | `attendance_observation_status_distribution` |
| `attendance.absence_rate`        | `computed_series`   | `attendance_observation_absence_rate`        |
| `attendance.late_rate`           | `computed_series`   | `attendance_observation_late_rate`           |
| `attendance.excuse_status`       | `computed_category` | `attendance_excuse_status_distribution`      |

`attendance.pending_sessions` remains in `operational_snapshot_v1` with its existing `computed_snapshot`, `dashboard_summary_snapshot`, default `30d/day`, hierarchy filtering, legacy `x: "snapshot"`, and draft-session counting semantics.

No chart outside Attendance was implemented. The catalog now contains exactly 11 computed charts and 26 definition-only charts.

## Attendance observation contract

The four entry-based charts count persisted `AttendanceEntry` rows as observations. Each included entry must join an `AttendanceSession` that:

- belongs to the trusted Dashboard school scope;
- has `status = SUBMITTED`;
- has `deleted_at IS NULL`;
- has a civil `date` inside the resolved inclusive window;
- matches every resolved supported hierarchy filter.

Both `DAILY` and `PERIOD` sessions contribute stored observations. The pack does not deduplicate by student and civil date because period sessions represent legitimate additional observations. It does not derive, generate, mutate, or recalculate attendance, and it never executes Attendance policy derivation during a Dashboard read.

The repository aggregates in PostgreSQL by session civil date and entry status before returning bounded rows. It never loads individual entry records. The maximum returned row shape remains bounded by selected civil dates multiplied by the six persisted attendance statuses.

## Repository and tenancy behavior

Entry aggregation uses one parameterized `$queryRaw` query inside the Attendance Reports infrastructure repository. It uses only `Prisma.sql`/tagged parameters and static optional predicates. It explicitly applies the trusted school ID to both `attendance_entries` and `attendance_sessions`, requires submitted/non-deleted sessions, applies inclusive civil dates, and adds only already-validated academic/hierarchy UUIDs. No request value is concatenated and no `Prisma.raw` input path exists.

Excuse aggregation uses `prisma.scoped.attendanceExcuseRequest.groupBy`, explicitly excludes deleted requests, and returns only status/count groups. Automatic school scope remains active. No N+1 path was added.

Neither repository returns raw rows or tenant/resource identifiers to the response presenter.

## Date and hierarchy filtering

All six existing query ranges remain available through the Phase 2A query context:

- `7d`, `30d`, and `90d` use school-local civil boundaries;
- `term` and `academic_year` use safe same-school resolution and generated-time caps;
- `custom` treats `dateFrom` and `dateTo` as inclusive school civil dates with the existing 366-day maximum.

The entry charts support resolved `academicYearId`, `termId`, `gradeId`, `sectionId`, and `classroomId`. The identifiers are still UUID-validated, resolved through scoped Prisma, relationship-checked, and converted to non-disclosing 404s when missing, cross-school, or inconsistent.

`attendance.excuse_status` supports only `academicYearId` and `termId`, matching the authoritative `AttendanceExcuseRequest` fields. Explicit grade, section, or classroom filters fail with validation 400 before Attendance aggregation runs.

## Bucket semantics

The reusable bucket utility consumes validated civil-date strings and is independent of the backend machine timezone.

| Granularity | Behavior                                                               | Coordinate                               |
| ----------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| `day`       | one bucket for every selected civil date                               | `civil_date`, `x = YYYY-MM-DD`           |
| `week`      | Monday-based weeks; first/last intervals clipped to the selected range | `week_interval`, `x = startDate/endDate` |
| `month`     | calendar months; first/last months may be partial                      | `calendar_month`, `x = YYYY-MM`          |

Every series uses the same ordered bucket set and zero-fills missing values. Leap days, month transitions, clipped weeks, partial months, UTC, and Africa/Cairo inputs are covered by deterministic tests.

The coordinate module now exposes validated builders for civil-date, week-interval, calendar-month, and category points. Existing snapshot coordinate behavior is unchanged.

## Status inclusion and exclusion

| Status        | Daily trend | Status distribution | Rate denominator | Absence numerator | Late numerator |
| ------------- | ----------: | ------------------: | ---------------: | ----------------: | -------------: |
| `PRESENT`     |         yes |                 yes |              yes |                no |             no |
| `ABSENT`      |         yes |                 yes |              yes |               yes |             no |
| `LATE`        |         yes |                 yes |              yes |                no |            yes |
| `EXCUSED`     |          no |                 yes |              yes |                no |             no |
| `EARLY_LEAVE` |          no |                  no |              yes |                no |             no |
| `UNMARKED`    |          no |                  no |               no |                no |             no |

Daily trend totals are `present`, `absent`, and `late`. Status distribution totals are `present`, `absent`, `late`, and `excused`. Their summary value is the sum of represented observations, not all persisted statuses.

## Rate formulas

Absence rate is `ABSENT / considered final observations * 100`.

Late rate is `LATE / considered final observations * 100`.

Considered final observations are `PRESENT`, `ABSENT`, `LATE`, `EXCUSED`, and `EARLY_LEAVE`; `UNMARKED` is excluded. `EXCUSED` is not an absence numerator. Each bucket and overall value is rounded deterministically to two decimal places. A zero denominator emits `0`, never a non-finite value. Overall rates use full-window numerator and denominator totals rather than averaging bucket percentages.

## Excuse overlap contract

One non-deleted `AttendanceExcuseRequest` contributes once when:

```text
request.dateFrom <= query.endCivilDate
AND
request.dateTo >= query.startCivilDate
```

Multi-day requests are not expanded per day. The response contains `pending`, `approved`, and `rejected` series, each with one validated category coordinate, plus matching totals and a total-request summary.

## Capability refinement

The existing `timeFiltersApplicable` field is preserved. A backward-compatible `granularityApplicable` field now distinguishes date-window use from bucket-granularity use.

- Historical entry charts: `timeFiltersApplicable = true`, `granularityApplicable = true`.
- Excuse status: `timeFiltersApplicable = true`, `granularityApplicable = false`.
- Snapshots: both remain false with existing legacy-default behavior.

The refinement does not reclassify unrelated definition-only chart time filters. In particular, `homework.submission_review_trend` and `behavior.pending_review` retain the Phase 2A requirement that both `range` and `granularity` be declared before time filters become applicable; their `REVIEW_FILTERS` definitions do not declare granularity, so explicit time-filter queries remain rejected.

For excuse status, omitted or explicitly supplied `day` remains compatible and is reported in `notApplicableFilters`; `week` and `month` return validation 400. Range/custom date fields remain in `appliedFilters`. All five Attendance pack charts expose truthful capability metadata. `attendance.status_distribution` is both historical-series capable and category/table/funnel capable because its persisted bucketed data is `computed_series` even though its chart type is `stacked-bar`. Catalog/list/detail metadata reports computed and historical series as available when the returned definitions include implemented Attendance series, while snapshot-only and definition-only responses retain their prior truthful states.

## Response and empty-state behavior

Attendance computed responses preserve all existing top-level fields and publish:

- `meta.source = dashboard_analytics_data_pack`;
- `meta.pack = attendance_v1`;
- `meta.freshness.dataMode = request_time_snapshot`;
- `cacheStatus = not_used`;
- `realtimeStatus = not_used`;
- chart-specific `computed_series` or `computed_category` availability and computation identifiers.

Implemented historical series do not claim that historical data is deferred. Drilldowns, exports, and realtime remain deferred. Empty entry results retain zero-filled buckets; empty excuse results retain zero-valued category series. Both return `reason: no_data`, not `not_implemented`.

## Catalog and Module Page behavior

The five Attendance definitions now have `status: available` and their computed availability. Attendance Module Page exposes that updated definition metadata but still loads only its existing pending-session snapshot in `availableData`; historical data remains route-loaded to avoid increasing Module Page query fanout. `plannedCharts` no longer mislabels the five available definitions. Widget composition is unchanged.

## Security and response safety

- The controller, route, and `dashboard.analytics.view` decorator are unchanged.
- No school, organization, actor, role, membership, student, teacher, or guardian query input was added.
- Cross-school hierarchy IDs retain the generic safe 404 behavior.
- Raw SQL includes explicit trusted school predicates because scope extensions do not alter raw queries.
- Scoped Prisma protects excuse grouping.
- School A cannot observe School B entry, session, or excuse aggregates.
- DTO whitelisting rejects `schoolId` and `organizationId` query overrides.
- Responses expose no school, organization, actor, role, student, session, entry, excuse request, soft-delete, raw SQL, table, or row identifiers/details.
- Teacher, parent, and student role exclusions remain unchanged.

## Backward compatibility

- No route or permission changed.
- Approved query keys are unchanged.
- Default `30d/day` remains.
- `attendance.pending_sessions` is not redefined.
- All five non-Attendance snapshot charts are unchanged.
- Unrelated definition-only charts retain their safe 200 `not_implemented` envelope.
- Existing `filters`, query metadata, endpoint metadata, and legacy snapshot `x` remain.
- No Attendance policy derivation or mutation was introduced.

## Exact files changed

### Attendance repository wiring

- `src/modules/attendance/reports/infrastructure/attendance-dashboard-analytics.repository.ts`
- `src/modules/attendance/reports/reports.module.ts`
- `src/modules/attendance/reports/tests/attendance-dashboard-analytics.repository.spec.ts`

### Dashboard runtime and contracts

- `src/modules/dashboard/application/dashboard-analytics-query-context.service.ts`
- `src/modules/dashboard/application/get-dashboard-analytics-chart-data.use-case.ts`
- `src/modules/dashboard/dashboard.module.ts`
- `src/modules/dashboard/domain/dashboard-analytics-catalog.ts`
- `src/modules/dashboard/domain/dashboard-analytics-coordinate.ts`
- `src/modules/dashboard/domain/dashboard-analytics-data-pack.ts`
- `src/modules/dashboard/domain/dashboard-analytics-query.ts`
- `src/modules/dashboard/domain/dashboard-attendance-analytics-buckets.ts`
- `src/modules/dashboard/domain/dashboard-attendance-analytics.ts`
- `src/modules/dashboard/dto/dashboard-analytics-data.dto.ts`
- `src/modules/dashboard/dto/dashboard-analytics.dto.ts`
- `src/modules/dashboard/presenters/dashboard-analytics-data.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-analytics.presenter.ts`

### Dashboard unit tests

- `src/modules/dashboard/tests/dashboard-attendance-analytics-buckets.spec.ts`
- `src/modules/dashboard/tests/dashboard-attendance-analytics.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-coordinate.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-data.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-data.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-query-context.service.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-modules.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-modules.use-case.spec.ts`

### E2E and security tests

- `test/e2e/dashboard-analytics-catalog-foundation.e2e-spec.ts`
- `test/e2e/dashboard-analytics-data-pack-foundation.e2e-spec.ts`
- `test/e2e/dashboard-module-pages-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-analytics-data.spec.ts`

### Documentation

- `docs/sprint-dashboard-analytics-attendance-2b-closeout.md`

## Verification and exact results

| Command or group                                                                                               | Result                                                                                |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Start gate                                                                                                     | PASS — exact branch/baseline/merge-base, zero commits ahead, clean worktree and index |
| Focused Attendance repository, bucket, computation, catalog/query capability, presenter/use-case, and Module Page unit tests | PASS — 12 suites, 106 tests |
| `npm run test -- dashboard --runInBand`                                                                        | PASS — 41 suites, 271 tests                                                           |
| Dashboard Analytics catalog/data E2E                                                                           | PASS — 2 suites, 21 tests                                                             |
| Complete Dashboard E2E surface                                                                                 | PASS — 10 suites, 63 tests                                                            |
| Dashboard Analytics tenancy/security                                                                           | PASS — 2 suites, 9 tests                                                              |
| Complete affected Dashboard security surface                                                                   | PASS — 10 suites, 44 tests                                                            |
| `npx prisma validate`                                                                                          | PASS — schema valid                                                                   |
| `npx prisma generate`                                                                                          | PASS — Prisma Client v6.19.3 generated                                                |
| `npm run build`                                                                                                | PASS                                                                                  |
| `npx tsc -p tsconfig.build.json --noEmit`                                                                      | PASS                                                                                  |
| `git diff --check`                                                                                             | PASS — exit code 0                                                                    |

No destructive database command was run.

## Schema, migration, seed, permission, and dependency status

- Prisma schema changes: none.
- Migration changes: none.
- Seed changes: none.
- Permission or system-role changes: none.
- Package/dependency changes: none.
- Workflow, configuration, and environment changes: none.

## Known limitations

- The pack reports stored observations; it does not produce unique-student-day analytics.
- It does not invoke report-only derived daily absence policy logic.
- `EARLY_LEAVE` and `UNMARKED` are not shipped as standalone trend/distribution series.
- Excuse status has no grade, section, or classroom filter because the request model has no authoritative fields for them.
- Historical charts outside Attendance remain definition-only.
- Drilldowns, student/teacher lists, stage/subject filters, exports, saved reports, custom dashboards, cache, queue, realtime, performance instrumentation, widgets integration, planner, weather, and alert lifecycle remain deferred or out of scope.

## Next sprint

`DASHBOARD-ANALYTICS-ADMISSIONS-STUDENTS-2C`

That sprint can reuse the query context, capability split, validated coordinate builders, bucket conventions, scoped aggregation architecture, response metadata, and no-leak test patterns without changing this Attendance observation contract.

## Final verdict

DASHBOARD-ANALYTICS-ATTENDANCE-2B: READY FOR REVIEW
