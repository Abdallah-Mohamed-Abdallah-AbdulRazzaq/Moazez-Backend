# DASHBOARD-ANALYTICS-ADMISSIONS-STUDENTS-2C Closeout

## Sprint identity

- Sprint: `DASHBOARD-ANALYTICS-ADMISSIONS-STUDENTS-2C`
- Branch: `feat/dashboard-analytics-admissions-students-2c`
- Baseline and unchanged HEAD: `ca4cbe9d09be4a7aa93e2028a76bc7e4cee9a751`
- Start gate: passed. The branch, HEAD, merge base, zero-commit delta, clean worktree/index, `origin/main`, and absence of a remote Phase 2C branch were verified before edits.

## Implemented charts

The `admissions_students_v1` pack contains exactly:

1. `admissions.applications_by_status` — `computed_category`
2. `admissions.applications_over_time` — `computed_series`
3. `students.enrollment_growth` — `computed_series`
4. `students.withdrawal_trend` — `computed_series`
5. `students.guardian_coverage` — `computed_category`

`admissions.funnel` remains `definition_only`, has no pack or computation identity, loads no repository, and retains its safe `200 not_implemented` data envelope.

The catalog remains at 37 definitions and transitions from 11 computed / 26 definition-only to 16 computed / 21 definition-only.

## Counting units and formulas

### Applications by status

- Counts current nondeleted `Application` rows through scoped Prisma.
- Uses exact persisted status categories, in order: `documents_pending`, `submitted`, `under_review`, `accepted`, `rejected`, `waitlisted`.
- Maps `academicYearId` to `requestedAcademicYearId` and `gradeId` to `requestedGradeId`.
- Applies no time predicate and does not join `AdmissionDecision`.
- Emits every category with a zero when absent.
- Summary is the sum of all six Application counts; empty means that sum is zero.

### Applications over time

- Submitted events use non-null `Application.submittedAt` on nondeleted Applications.
- Accepted events use `AdmissionDecision.decision = ACCEPT` and `AdmissionDecision.decidedAt`, joined to a nondeleted Application by both application and trusted school.
- Neither `createdAt`, mutable `updatedAt`, nor current Application status is used to infer an event.
- Uses a half-open instant range: event timestamp `>= startInclusive` and `< endExclusive`.
- PostgreSQL stores these Prisma `DateTime` columns as `TIMESTAMP(3)` without timezone. The query treats stored values as UTC explicitly, converts them to the effective school timezone, and groups by school civil date without depending on the database session, Node process, or host timezone.
- Database daily aggregates are transformed into shared deterministic day, Monday-week, or calendar-month buckets and zero-filled over identical submitted/accepted coordinates.
- Summary is submitted events plus accepted events, not a unique-Application count.

### Enrollment growth

- Meaning: point-in-time active Enrollment stock, not enrollment-event volume, cumulative starts, or net change.
- Lifecycle interval: `[Enrollment.enrolledAt, Enrollment.endedAt)`.
- Excludes soft-deleted Enrollment and Student rows.
- Does not filter historical points by current Student status.
- Completed and withdrawn rows remain eligible at earlier evaluation instants.
- All hierarchy predicates apply to the historical Enrollment being counted.
- Uses one bounded `VALUES` aggregate query, not one query per reporting interval and not individual Enrollment rows.
- The last emitted stock value is the total and summary; stock values are never summed across time.
- A future custom end date is retained in resolved query metadata, but emitted stock points stop at the current school civil date and the current partial interval is evaluated at `generatedAt`.

Completed reporting interval SQL boundaries:

```sql
enrolled_at < bucket_end_exclusive
AND (ended_at IS NULL OR ended_at >= bucket_end_exclusive)
```

Current partial interval SQL boundaries:

```sql
enrolled_at <= generated_at
AND (ended_at IS NULL OR ended_at > generated_at)
```

Thus a start exactly at a completed interval’s exclusive end is excluded, an end exactly there is counted immediately before that end, a start exactly at `generatedAt` is active, and an end exactly at `generatedAt` is inactive.

### Withdrawal trend

- Counts retained nondeleted Enrollments where `status = WITHDRAWN` and `endedAt IS NOT NULL`.
- Excludes active, completed, soft-deleted Enrollment, and soft-deleted Student rows.
- Uses `Enrollment.endedAt` as the event timestamp; it does not use Student status or Enrollment `updatedAt`.
- Applies every hierarchy predicate through the withdrawn Enrollment’s historical placement.
- Uses a half-open instant range and school-timezone daily aggregation, followed by shared deterministic rollup and zero filling.

### Guardian coverage

- Denominator is distinct current nondeleted Students with `Student.status = ACTIVE`.
- Without hierarchy filters, an active Student remains eligible without an active Enrollment.
- With hierarchy filters, one nondeleted active Enrollment must satisfy every supplied predicate; multiple matching Enrollments do not multiply the Student.
- Covered means at least one `StudentGuardian` relationship to a same-school nondeleted Guardian.
- Deleted Guardians and removed links do not provide coverage; multiple Guardians do not inflate the count.
- The resolved time window is not used by repository queries.
- Summary is covered plus missing active Students; empty means the eligible population is zero.

## Shared bucket behavior

The Attendance bucket implementation was extracted into a neutral Dashboard Analytics helper. The prior Attendance file now re-exports the same public names, so existing imports and all Attendance output remain compatible. The shared implementation owns civil-date day intervals, Monday-based clipped weeks, calendar-month intervals, deterministic ordering, coordinate formatting, and zero filling without backend-local date arithmetic.

## Time-filter mode

The frontend-visible `timeFilterMode` is additive to existing capability fields:

- `historical`: range and granularity apply.
- `range_only`: range applies; `day` is accepted but not applicable; `week/month` are rejected.
- `compatibility_defaults`: only `30d/day` are accepted and both are not applicable.
- `snapshot_compatibility`: preserves existing snapshot behavior.
- `unsupported`: omitted defaults permit normal flow; explicit time keys are rejected.

Explicit assignments cover the five Attendance historical/category charts and the five new charts. Existing snapshots resolve to `snapshot_compatibility`. Every unrelated chart without an override first calculates its pre-2C snapshot, time, granularity, and supported-array behavior, then derives the new mode from those legacy values. Consequently, standard-filter definition-only charts such as `admissions.funnel` retain their existing time-query behavior, while Homework and Behavior review definitions remain explicit-time unsupported.

Public query metadata names remain `requestedFilters`, `appliedFilters`, `notApplicableFilters`, and `resolvedWindow`. Supported resolved hierarchy keys remain in `appliedFilters` even when time defaults are not applicable.

## Filter and hierarchy matrix

| Chart | Time behavior | Academic year | Term | Grade | Section | Classroom |
|---|---|---:|---:|---:|---:|---:|
| Applications by status | compatibility `30d/day`; dates rejected | applied | 400 | applied | 400 | 400 |
| Applications over time | range, custom dates, day/week/month applied | applied | 400 | applied | 400 | 400 |
| Enrollment growth | range, custom dates, day/week/month applied | applied | applied | applied | applied | applied |
| Withdrawal trend | range, custom dates, day/week/month applied | applied | applied | applied | applied | applied |
| Guardian coverage | compatibility `30d/day`; dates rejected | applied | applied | applied | applied | applied |

All identifiers retain UUID validation, same-school scoped resolution, hierarchy consistency checks, safe `404`, and unsupported-filter `400` behavior.

## Pack and computation identities

- Pack: `admissions_students_v1`
- `admissions_current_application_status_distribution`
- `admissions_application_submission_acceptance_events`
- `students_point_in_time_active_enrollment_stock`
- `students_withdrawal_events`
- `students_current_guardian_coverage`

Existing `operational_snapshot_v1`, `attendance_v1`, and their computation identifiers are unchanged.

## Repository and dispatch architecture

`DashboardAdmissionsAnalyticsRepository` provides:

- `countCurrentApplicationsByStatus()`
- `aggregateApplicationEventsByCivilDate()`

`DashboardStudentsAnalyticsRepository` provides:

- `countActiveEnrollmentsAtBucketCloses()`
- `aggregateWithdrawalsByCivilDate()`
- `countCurrentGuardianCoverage()`

Raw SQL is isolated to these repositories, uses tagged `$queryRaw`, `Prisma.sql`, bound request-derived values, explicit trusted school predicates, school-safe joins, static optional predicates, and explicit soft-delete conditions. It returns only bounded aggregate keys, civil dates/evaluation keys, and numbers. Current category operations use scoped Prisma aggregation/counts.

Dispatch remains explicit: unknown key, existing snapshot, Attendance pack, Admissions/Students pack, then safe definition-only fallback. Each approved chart invokes only its required repository method. Dashboard Summary is not loaded.

## Presenter, DTO, and Module Page behavior

The response pack/computation unions were extended without weakening them to `string`. New computed responses use `dashboard_analytics_data_pack`, `admissions_students_v1`, truthful `computed_series` or `computed_category`, and `request_time_snapshot`. Drilldown, exports, and realtime remain deferred; current category charts also defer historical series.

Admissions and Students Module Pages expose the updated chart definitions and capabilities but do not load standalone pack data. `availableData` remains empty for these charts, so no five-query Module Page fanout was added. Data remains available only through the existing chart `/data` route.

## Security and tenancy

- Existing route and `dashboard.analytics.view` permission are unchanged.
- Trusted Dashboard school scope is used; no tenant override is accepted.
- Raw SQL includes explicit trusted school predicates because Prisma scope extensions do not modify raw SQL.
- Current-category Prisma roots use scoped Prisma; nested Enrollment, Guardian, Classroom, and Section predicates state school, deletion, and status constraints explicitly.
- Responses expose no source identifiers, tenant identifiers, personal fields, raw rows, SQL, Prisma, table, deletion, or existence details.
- School A/B regression covers Applications, Decisions, Students, Enrollments, Guardians, StudentGuardian-derived coverage, Attendance sources, and all hierarchy identifiers.
- Existing management access and teacher/parent/student permission exclusions remain unchanged.

## Files changed

### Application, domain, DTO, presenter, and module wiring

- `src/modules/dashboard/application/get-dashboard-analytics-chart-data.use-case.ts`
- `src/modules/dashboard/dashboard.module.ts`
- `src/modules/dashboard/domain/dashboard-admissions-students-analytics.ts`
- `src/modules/dashboard/domain/dashboard-analytics-buckets.ts`
- `src/modules/dashboard/domain/dashboard-analytics-catalog.ts`
- `src/modules/dashboard/domain/dashboard-analytics-data-pack.ts`
- `src/modules/dashboard/domain/dashboard-analytics-query.ts`
- `src/modules/dashboard/domain/dashboard-attendance-analytics-buckets.ts`
- `src/modules/dashboard/dto/dashboard-analytics-data.dto.ts`
- `src/modules/dashboard/dto/dashboard-analytics.dto.ts`
- `src/modules/dashboard/presenters/dashboard-analytics-data.presenter.ts`

### Repositories

- `src/modules/dashboard/infrastructure/dashboard-admissions-analytics.repository.ts`
- `src/modules/dashboard/infrastructure/dashboard-students-analytics.repository.ts`

### Unit tests

- `src/modules/dashboard/tests/dashboard-admissions-analytics.repository.spec.ts`
- `src/modules/dashboard/tests/dashboard-admissions-students-analytics.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-data.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-data.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-analytics-query-context.service.spec.ts`
- `src/modules/dashboard/tests/dashboard-modules.presenter.spec.ts`
- `src/modules/dashboard/tests/dashboard-students-analytics.repository.spec.ts`

### E2E and security tests

- `test/e2e/dashboard-analytics-catalog-foundation.e2e-spec.ts`
- `test/e2e/dashboard-analytics-data-pack-foundation.e2e-spec.ts`
- `test/e2e/dashboard-module-pages-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-analytics-data.spec.ts`

### Documentation

- `docs/sprint-dashboard-analytics-admissions-students-2c-closeout.md`

## Verification results

- Focused Analytics/Admissions/Students unit command: 7 suites, 66 tests passed.
- Final Dashboard plus affected Attendance unit command: 32 suites, 218 tests passed.
- Focused Analytics catalog/data/Module Page E2E coverage: all 3 suites passed; 33 tests across the suites.
- Complete Dashboard E2E surface: 10 suites, 68 tests passed.
- Focused Analytics/Module tenancy-security command: 3 suites, 14 tests passed.
- Complete Dashboard security surface: 10 suites, 45 tests passed.
- `npx prisma validate`: passed; schema valid.
- `npx prisma generate`: passed; Prisma Client 6.19.3 generated.
- `npm run build`: passed.
- `npx tsc -p tsconfig.build.json --noEmit`: passed.
- `git diff --check`: passed.
- Staged files: 0.

No full-project non-Dashboard regression was claimed or run. The complete affected Dashboard dependency surface, affected Attendance unit coverage, build, TypeScript, Prisma, E2E, and security regressions were run.

## No-change declarations

- Prisma schema: unchanged
- Migrations: unchanged
- Seeds: unchanged
- Permissions and roles: unchanged
- Dependencies and lockfiles: unchanged
- Workflows: unchanged
- Configuration and environment files: unchanged
- Routes and route permission: unchanged
- Application registration closure semantics: unchanged

## Known limitations and deferred risks

- `admissions.funnel` remains deferred because current Lead/Application data does not establish an authoritative conversion cohort or immutable stage history.
- `UNDER_REVIEW` remains a persisted category even though current runtime has no discovered transition writer.
- Application/Decision alignment relies on existing transactional runtime behavior rather than a database check constraint.
- Multiple active Enrollments are prevented by application logic rather than a database partial unique constraint; stock intentionally counts persisted Enrollment observations.
- Historical guardian coverage remains impossible after a StudentGuardian link is hard-deleted; only current coverage is implemented.
- The bounded Enrollment stock query is correct by contract but should be measured under production-scale enrollment volumes before any separately approved optimization sprint.

## Final verdict

DASHBOARD-ANALYTICS-ADMISSIONS-STUDENTS-2C: READY FOR REVIEW
