# ATT-POL-2H - Derived Daily Report-only Closeout

## Baseline

- Baseline commit: `949c699 docs: audit derived daily attendance semantics`
- Sprint type: conservative runtime implementation
- Final verdict: `ATT_POL_2H_DERIVED_DAILY_REPORT_ONLY_READY`

## Sprint scope

ATT-POL-2H adds one isolated Attendance Reports read surface for report-only derived daily absences. The implementation computes derived absence rows from submitted selected PERIOD attendance evidence at read time only.

No `AttendanceSession` or `AttendanceEntry` rows are created, updated, deleted, or backfilled by the new report runtime.

## Files changed

- `src/modules/attendance/reports/controller/attendance-reports.controller.ts`
- `src/modules/attendance/reports/dto/attendance-reports.dto.ts`
- `src/modules/attendance/reports/application/get-derived-daily-absences-report.use-case.ts`
- `src/modules/attendance/reports/domain/derived-daily-attendance.ts`
- `src/modules/attendance/reports/infrastructure/attendance-reports.repository.ts`
- `src/modules/attendance/reports/presenters/attendance-reports.presenter.ts`
- `src/modules/attendance/reports/reports.module.ts`
- `src/modules/attendance/reports/tests/attendance-reports-derived-daily.domain.spec.ts`
- `src/modules/attendance/reports/tests/attendance-reports.presenter.spec.ts`
- `src/modules/attendance/reports/tests/attendance-reports.repository.spec.ts`
- `src/modules/attendance/reports/tests/attendance-reports.use-case.spec.ts`
- `test/e2e/attendance-foundation.e2e-spec.ts`
- `test/security/tenancy.attendance.spec.ts`
- `docs/sprint-att-pol-2h-derived-daily-report-only-closeout.md`

No Prisma schema, migration, package, or lockfile changes were made.

## Endpoint added

- `GET /api/v1/attendance/reports/derived-daily-absences`
- Uses the existing Attendance Reports controller and `attendance.reports.view` permission.
- Reuses existing attendance report query conventions for academic year, term, date/date range, and scope filters.

## Exact report-only behavior implemented

The new report returns derived absence rows only when submitted selected PERIOD evidence reaches the policy threshold:

- linked policy `dailyComputationStrategy` is `DERIVED_FROM_PERIODS`
- linked policy `selectedPeriodIds` is non-empty
- linked policy `absentIfMissedPeriodsCount` is not null
- source session is `SUBMITTED`
- source session mode is `PERIOD`
- source session has a non-null `periodId`
- source session has a non-null `policyId`
- source session date/year/term/scope match the query filters
- source session `periodId` is included in the linked policy `selectedPeriodIds`

Invalid or incomplete legacy derived policies are skipped defensively and do not crash report reads.

## Source evidence rules

The repository reads minimal submitted PERIOD evidence under the active school scope. The derived evidence select includes only fields required for computation and presentation:

- session date, scope, mode, period, policy link, status, and timestamps
- entry id, student id, enrollment id, status, and timestamp
- policy id, `dailyComputationStrategy`, `selectedPeriodIds`, and `absentIfMissedPeriodsCount`

The repository does not expose school ids, organization ids, membership ids, role ids, deleted markers, actor ids, raw Prisma payloads, guardian ids, notification internals, storage internals, or timetable internals in the new response.

## Missed-period semantics

- `ABSENT` counts as missed.
- `PRESENT` does not count as missed.
- `LATE` does not count as missed.
- `EARLY_LEAVE` does not count as missed.
- `EXCUSED` does not count as missed.
- `UNMARKED` does not count as missed.
- `DRAFT` sessions never count.
- `DAILY` sessions never count.
- PERIOD sessions outside the policy selected periods never count.

No derived `PRESENT` rows are emitted. The report emits one row per derived daily absence only.

## Grouping and deduplication rules

Evidence is grouped by:

- date
- scope type
- scope key
- policy id
- student id

Within each group, the helper keeps at most one evidence item per distinct `periodId`. Duplicate evidence for the same period uses the most recently updated entry, then submitted/updated session timestamps, then stable id ordering as deterministic fallback.

## Response contract and no-leak notes

Each returned row is explicitly report-only and includes:

- `date`
- `studentId`
- `scopeType`
- `scopeKey`
- `scopeIds`
- `policyId`
- `missedPeriodCount`
- `requiredMissedPeriodsCount`
- `missedPeriodIds`
- `evidencePeriodCount`
- `sourcePeriodIds`
- `derivedStatus: ABSENT`
- `source: DERIVED_FROM_PERIODS`
- `reportOnly: true`

The response intentionally does not include a derived DAILY `sessionId`, because no DAILY session exists.

## Existing behavior unchanged

The implementation does not modify:

- existing attendance report summary, daily trend, or scope breakdown behavior
- attendance absences routes
- dashboard attendance behavior
- teacher app attendance behavior
- parent app attendance behavior
- student app attendance behavior
- discipline behavior
- communication or notification behavior
- roll-call submit/correction behavior
- historical attendance rows

## Tests added or updated

- Added pure domain tests for derived daily absence computation, including non-derivable policies, submitted-only evidence, DAILY/DRAFT/null-period exclusions, selected-period filtering, status semantics, threshold behavior, duplicate period deduplication, and no derived PRESENT rows.
- Added use-case coverage for filter parsing, repository invocation, presenter response, and no tenant/internal field leakage.
- Added repository tests for submitted PERIOD evidence filtering and safe select shape.
- Added presenter tests for the new report response contract and no persisted session fields.
- Updated attendance foundation E2E with real timetable periods and a derived daily report scenario proving:
  - selected submitted PERIOD absences produce one report-only derived ABSENT row
  - PRESENT/LATE/EARLY_LEAVE/EXCUSED/UNMARKED evidence does not count as missed
  - no DAILY session is created
  - existing report summary remains based on real submitted sessions/entries only
- Added attendance tenancy security coverage proving school A cannot derive rows from school B source evidence or policy evidence.

## Verification commands and results

- `git status --short --untracked-files=all` - PASS; showed only ATT-POL-2H working tree changes.
- `git diff --name-only` - PASS; showed attendance reports, attendance foundation E2E, and attendance tenancy files. Untracked new files are listed by `git status`.
- `git diff --stat` - PASS; showed scoped ATT-POL-2H changes only.
- `git diff --check` - PASS; no whitespace errors. Git reported existing line-ending normalization warnings.
- `npx prisma validate` - PASS; schema valid.
- `npm run build` - PASS on rerun with a longer timeout. An initial 120s run timed out before returning output; no build errors remained after rerun.
- `npm run test -- attendance --runInBand` - PASS; 24 suites, 173 tests.
- `npm run test -- attendance-reports --runInBand` - PASS; 4 suites, 15 tests.
- `npm run test -- roll-call --runInBand` - PASS; 5 suites, 53 tests.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts` - PASS; 1 suite, 3 tests.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-excuses-corrections.e2e-spec.ts` - PASS; 1 suite, 2 tests.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts` - PASS; 1 suite, 42 tests.
- `npm run test:security -- --runInBand` - PASS; 50 suites, 820 tests.

## Deferred items

- Persisted derived DAILY sessions.
- Derived attendance source/provenance schema.
- Policy snapshotting.
- Historical recompute/backfill.
- Submit-time derivation.
- Manual derive/finalize route.
- Merging derived daily into existing report summary/trend/breakdown.
- Merging derived daily into absences routes.
- Merging derived daily into dashboard cards.
- Parent App derived attendance exposure.
- Student App derived attendance exposure.
- Teacher App derived daily visibility.
- Discipline derived absence incidents.
- Notification dispatch.
- Notification duplicate prevention for derived absences.
- `autoAbsentAfterMinutes` runtime application.
- `requireExcuseReason` enforcement.
- Treating `EXCUSED` as missed.
- Treating `UNMARKED` as missed.
- Same timetable config/scope/entry/publication validation for derivation.
- Teacher App route snapshot drift repair, if still present.

## Final verdict

`ATT_POL_2H_DERIVED_DAILY_REPORT_ONLY_READY`
