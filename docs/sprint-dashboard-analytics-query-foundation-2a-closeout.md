# DASHBOARD-ANALYTICS-QUERY-FOUNDATION-2A Closeout

## Sprint identity

- Sprint: `DASHBOARD-ANALYTICS-QUERY-FOUNDATION-2A`
- Branch: `feat/dashboard-analytics-query-foundation-2a`
- Baseline and unchanged `HEAD`: `6b9e9f2e3c0b950001f269c6bcb08eb2dd2e350c`
- Purpose: establish a truthful, timezone-aware, hierarchy-safe query foundation for future Dashboard historical analytics packs.
- Runtime scope: the existing `GET /api/v1/dashboard/analytics/charts/:chartKey/data` route and its existing `dashboard.analytics.view` permission.

The start gate passed before modification: branch and `HEAD` matched, the merge base was the baseline, the branch had zero commits after the baseline, and both the worktree and index were clean.

## Approved query keys

The data endpoint accepts only:

- `range`
- `granularity`
- `dateFrom`
- `dateTo`
- `academicYearId`
- `termId`
- `gradeId`
- `sectionId`
- `classroomId`

No school, organization, actor, membership, owner, role, stage, subject, teacher, student, or guardian override was added. Global DTO whitelisting continues to reject unknown query keys.

## Analytics query context

One reusable query context now carries:

- the single request `generatedAt` instant;
- the effective school timezone from the existing Dashboard time context;
- normalized range and granularity;
- start instant inclusive and end instant exclusive;
- start and end civil dates;
- resolved hierarchy values used internally for scoped repository filters;
- exactly which approved keys the client supplied;
- which filters actually affect the current chart query;
- which legacy defaults are accepted but not applicable to the chart.

Response metadata exposes the effective timezone, requested filter keys, applied filter keys, not-applicable keys, and resolved window. It does not expose raw hierarchy rows, tenant IDs, active membership data, or internally derived hierarchy values. The legacy `filters` object continues to echo only client-supplied hierarchy IDs; implicit active and derived IDs remain internal.

## Range semantics

All civil-date conversion reuses the Dashboard time-context primitives and is independent of the backend machine timezone.

| Range           | Inclusive civil dates                       | Start                               | Exclusive end                                               |
| --------------- | ------------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `7d`            | current school date plus previous 6 dates   | school-local midnight at `D - 6`    | school-local midnight at `D + 1`                            |
| `30d`           | current school date plus previous 29 dates  | school-local midnight at `D - 29`   | school-local midnight at `D + 1`                            |
| `90d`           | current school date plus previous 89 dates  | school-local midnight at `D - 89`   | school-local midnight at `D + 1`                            |
| `term`          | resolved term civil dates                   | school-local midnight at term start | next local midnight after term end, capped at `generatedAt` |
| `academic_year` | resolved academic-year civil dates          | school-local midnight at year start | next local midnight after year end, capped at `generatedAt` |
| `custom`        | `dateFrom` through `dateTo`, both inclusive | school-local midnight at `dateFrom` | school-local midnight after `dateTo`                        |

`term` resolves a supplied same-school `termId` or the active same-school term. `academic_year` resolves a supplied same-school `academicYearId` or the active same-school academic year. A missing, inaccessible, inconsistent, future-only, or otherwise unusable period returns the standard safe not-found response.

Custom dates must be strict valid `YYYY-MM-DD` civil dates. Both are required, `dateFrom` must not follow `dateTo`, and the inclusive maximum is 366 civil days. Date boundaries supplied with a non-custom range are rejected instead of ignored.

## Granularity compatibility matrix

No historical buckets are emitted in this sprint. The reusable compatibility rule is based on the resolved inclusive civil-day span:

| Granularity | Compatibility                     |
| ----------- | --------------------------------- |
| `day`       | any usable resolved window        |
| `week`      | at least 7 inclusive civil dates  |
| `month`     | at least 28 inclusive civil dates |

Consequently, `7d` supports `day` and `week` but rejects `month`; `30d` and `90d` support all three. Term, academic-year, and custom compatibility is evaluated after their actual dates are resolved. The legacy omitted default remains `30d` / `day`.

## Hierarchy validation

Every supplied hierarchy ID is validated as a UUID before repository access. Resolution uses only `prisma.scoped`, including current automatic school scope and soft-delete filtering.

Verified Prisma relationships used by the resolver are:

- `Term.academicYearId -> AcademicYear.id`;
- `Section.gradeId -> Grade.id`;
- `Classroom.sectionId -> Section.id`;
- `Classroom.section.gradeId -> Grade.id`.

There is no invented term-to-grade relationship. The resolver enforces:

- term belongs to the supplied academic year;
- section belongs to the supplied grade;
- classroom belongs to the supplied section;
- classroom's section belongs to the supplied grade;
- section and classroom safely derive their parent grade;
- classroom safely derives its parent section.

Missing, cross-school, soft-deleted, and inconsistent chains all return the same non-disclosing `Dashboard analytics hierarchy was not found` 404 envelope. No existence detail or supplied ID is included.

Active academic-year and term fallback resolution uses the same deterministic ordering as Dashboard Summary and Alerts: `startDate desc`, then `createdAt desc`, then `id asc`. Equal start dates therefore resolve the same active context across Dashboard surfaces.

## Chart filter capabilities

Each catalog chart now publishes one typed query capability definition covering:

- snapshot-only status;
- historical-series capability;
- category/table/funnel capability;
- definition-only status;
- whether time filters apply;
- supported ranges;
- supported granularities;
- supported hierarchy filters.

The six computed snapshots retain their legacy default `30d` / `day` response fields, but those defaults are explicitly marked not applicable because the values are request-time snapshots. Supplying those exact defaults remains backward compatible. Supplying non-default time filters or custom dates to a snapshot chart is rejected.

Hierarchy support for current computed charts is:

| Chart                                 | Supported hierarchy filters                                              |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `attendance.pending_sessions`         | academic year, term, grade, section, classroom                           |
| `grades.pending_submission_reviews`   | academic year, term, grade, section, classroom through `GradeAssessment` |
| `grades.pending_answer_reviews`       | academic year, term, grade, section, classroom through `GradeAssessment` |
| `communication.moderation_queue`      | none                                                                     |
| `settings.email_connection_readiness` | none                                                                     |
| `settings.login_identity_readiness`   | none                                                                     |

Unsupported explicit hierarchy filters return validation 400 before hierarchy lookup. Definition-only charts continue returning their existing safe 200 not-implemented envelope after applicable query validation and resolution.

## Snapshot repository behavior

The existing six snapshot values are now loaded by a bounded scoped analytics repository:

- pending attendance sessions apply the current school civil date and resolved direct AttendanceSession hierarchy fields;
- pending grade submissions and answers apply resolved hierarchy filters through the verified `GradeAssessment` relation;
- the direct analytics endpoint deliberately does not add a `GradeAssessment.deletedAt` predicate, preserving the preceding Summary, Alerts, and Module Page snapshot counting semantics instead of independently redefining the Grades snapshot;
- Communication and Settings snapshots remain school-scoped and reject meaningless hierarchy filters;
- active academic context remains an internal compatibility default where the preceding Dashboard snapshot behavior used it;
- no time range or granularity is claimed to change a snapshot value.

No historical chart computation, raw SQL, cache, queue, realtime path, or unbounded query was added.

## Requested, applied, and not-applicable semantics

- `requestedFilters`: exact approved keys explicitly supplied by the client.
- `appliedFilters`: keys that affect the resolved repository/query context, including safely derived parent hierarchy keys.
- `notApplicableFilters`: accepted compatibility defaults that do not affect the current snapshot value; currently `range` and `granularity` for snapshot charts.
- `resolvedWindow`: effective timezone-aware start/end instants and civil dates, even when a legacy snapshot marks time defaults not applicable.

## Coordinate contract

Existing snapshot points preserve `x: "snapshot"` and now also require `coordinate: { kind: "snapshot" }`.

The discriminated coordinate foundation supports:

- `snapshot`;
- `civil_date`;
- `week_interval`;
- `calendar_month`;
- `category`;
- `table_row`;
- `funnel_stage`.

Non-snapshot `x` values use a validated branded coordinate value rather than an unrestricted response string. Runtime validation enforces strict civil dates, ordered week intervals, valid calendar months, non-empty category/table keys, non-negative funnel order, coordinate-to-`x` consistency, and finite numeric values. This sprint emits no new historical, category, table, or funnel points.

## Error contract

| Case                                            | Result                                  |
| ----------------------------------------------- | --------------------------------------- |
| unknown chart                                   | existing safe 404                       |
| malformed hierarchy UUID                        | validation 400 before repository access |
| missing or cross-school hierarchy record        | generic safe 404                        |
| inconsistent hierarchy chain                    | same generic safe 404                   |
| missing custom boundary                         | validation 400                          |
| invalid, reversed, or over-366-day custom range | validation 400                          |
| date boundary on non-custom range               | validation 400                          |
| unsupported chart filter                        | validation 400                          |
| misleading granularity/window combination       | validation 400                          |
| known definition-only chart                     | safe 200 not-implemented envelope       |

No Prisma error, SQL, table name, raw hierarchy row, internal tenant identifier, or cross-school existence detail is returned.

## Backward compatibility

- Route and global `/api/v1` prefix are unchanged.
- Permission remains `dashboard.analytics.view`.
- Existing chart keys and six snapshot computations remain.
- Existing snapshot `range: 30d`, `granularity: day`, `filters`, and legacy `x: snapshot` fields remain.
- Default Grades snapshot status predicates remain unchanged, and optional hierarchy filters do not introduce an assessment soft-delete exclusion.
- Definition-only charts retain the safe 200 envelope.
- Catalog definition/data endpoint metadata remains unchanged.
- Module Page embedded analytics now uses the shared coordinate/query metadata contract without adding query inputs to Module routes.
- Teacher, parent, and student roles remain excluded from `dashboard.analytics.view`.

## Exact files changed

### Runtime and contracts

- `src/modules/dashboard/application/dashboard-analytics-query-context.service.ts`
- `src/modules/dashboard/application/get-dashboard-analytics-chart-data.use-case.ts`
- `src/modules/dashboard/application/get-dashboard-module-page.use-case.ts`
- `src/modules/dashboard/dashboard.module.ts`
- `src/modules/dashboard/domain/dashboard-analytics-catalog.ts`
- `src/modules/dashboard/domain/dashboard-analytics-coordinate.ts`
- `src/modules/dashboard/domain/dashboard-analytics-query.ts`
- `src/modules/dashboard/dto/dashboard-analytics-data.dto.ts`
- `src/modules/dashboard/dto/dashboard-analytics.dto.ts`
- `src/modules/dashboard/infrastructure/dashboard-analytics-hierarchy.repository.ts`
- `src/modules/dashboard/infrastructure/dashboard-analytics-snapshot.repository.ts`
- `src/modules/dashboard/presenters/dashboard-analytics-data.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-analytics.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-modules.presenter.ts`

### Unit tests

- `src/modules/dashboard/tests/dashboard-analytics-coordinate.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-data.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-data.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-hierarchy.repository.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-query-context.service.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-query.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-snapshot.repository.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics.presenter.spec.ts`

### E2E and security

- `test/e2e/dashboard-analytics-data-pack-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-analytics-data.spec.ts`

### Documentation

- `docs/sprint-dashboard-analytics-query-foundation-2a-closeout.md`

## Verification and exact results

| Command or group                                                                                       | Result                                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Start-gate branch, HEAD, merge-base, ahead-count, worktree, and index checks                           | PASS — exact baseline, zero commits ahead, clean start |
| Focused hierarchy and snapshot repository compatibility tests                                          | PASS — 2 suites, 8 tests                               |
| Focused query-context, hierarchy, repository, coordinate, presenter, and analytics use-case unit tests | PASS — 9 suites, 76 tests                              |
| `npm run test -- dashboard --runInBand`                                                                | PASS — 38 suites, 245 tests                            |
| Analytics catalog/data E2E suites                                                                      | PASS — 2 suites, 17 tests                              |
| Complete Dashboard E2E surface                                                                         | PASS — 10 suites, 59 tests                             |
| Analytics tenancy/security suites                                                                      | PASS — 2 suites, 8 tests                               |
| All affected Dashboard tenancy/security suites                                                         | PASS — 10 suites, 43 tests                             |
| `npx prisma validate`                                                                                  | PASS — schema valid                                    |
| `npx prisma generate`                                                                                  | PASS — Prisma Client v6.19.3 generated                 |
| `npm run build`                                                                                        | PASS                                                   |
| `npx tsc -p tsconfig.build.json --noEmit`                                                              | PASS                                                   |
| `git diff --check`                                                                                     | PASS — exit code 0                                     |

No destructive database command was run.

## Schema, migration, seed, permission, and dependency status

- Prisma schema changes: none.
- Migration changes: none.
- Seed changes: none.
- Permission or role changes: none.
- Package/dependency changes: none.
- Workflow, configuration, and environment changes: none.

## Known limitations

- Historical analytics series remain unimplemented.
- The six existing values remain request-time snapshots.
- No historical buckets, drilldowns, exports, saved reports, or custom dashboards were added.
- No stage, subject, teacher, student, or guardian query filters were added.
- No cache, performance optimization, observability infrastructure, weather, planner, alert lifecycle, or realtime implementation was added.
- The 366-day custom maximum is a query-foundation safety bound; future packs may declare narrower chart-specific bounds.

## Next sprint

`DASHBOARD-ANALYTICS-ATTENDANCE-2B`

That sprint can use the validated query context, AttendanceSession hierarchy filters, timezone-aware windows, granularity compatibility, and coordinate builders to implement real Attendance historical series without changing this route or tenant boundary.

## Final verdict

DASHBOARD-ANALYTICS-QUERY-FOUNDATION-2A: READY FOR REVIEW
