# ATT-POL-2B - Selected-Period Roll-Call Gating Closeout

## Baseline Commit

- Baseline: `cd153e8 docs: audit attendance policy rule application`
- Sprint title: `ATT-POL-2B - Attendance Policy Selected-Period Roll-Call Gating`
- Sprint type: Conservative runtime implementation sprint

## Sprint Scope

Implemented the ATT-POL-2A decision to apply `AttendancePolicy.selectedPeriodIds` only as a backward-compatible gate for creating new `PERIOD` roll-call sessions.

This sprint does not implement broader attendance rule application.

## Files Changed

- `src/modules/attendance/roll-call/application/resolve-roll-call-session.use-case.ts`
- `src/modules/attendance/roll-call/domain/policy-period-selection.ts`
- `src/modules/attendance/roll-call/infrastructure/attendance-roll-call.repository.ts`
- `src/modules/attendance/roll-call/tests/roll-call.use-case.spec.ts`
- `test/e2e/attendance-foundation.e2e-spec.ts`
- `docs/sprint-att-pol-2b-selected-period-roll-call-gating-closeout.md`

## Schema, Migration, Package, and Lockfile Status

- Prisma schema changes: none.
- Migrations created: none.
- Package changes: none.
- Lockfile changes: none.
- Controller paths, methods, guards, permissions, and public response envelopes: unchanged.

## Exact Behavior Implemented

Roll-call effective policy candidate selection now includes `selectedPeriodIds`.

When resolving a roll-call session:

1. The resolver continues to validate academic context, scope, date, and period key exactly as before.
2. The resolver continues to look up an existing session by the current uniqueness key before resolving or applying policy rules.
3. If an existing session is found, it is returned unchanged.
4. If no existing session is found, the resolver asserts the term is writable.
5. The resolver selects the effective policy using the existing priority:
   - `CLASSROOM`
   - `SECTION`
   - `GRADE`
   - `STAGE`
   - `SCHOOL`
6. For new `DAILY` sessions, `selectedPeriodIds` is ignored.
7. For new `PERIOD` sessions with no effective policy, legacy behavior is preserved.
8. For new `PERIOD` sessions with an effective policy whose `selectedPeriodIds` is empty, legacy behavior is preserved.
9. For new `PERIOD` sessions with an effective policy whose `selectedPeriodIds` is non-empty:
   - `periodId` is required after trimming.
   - The trimmed `periodId` must be included in the effective policy `selectedPeriodIds`.
   - Missing or disallowed `periodId` is rejected with `ValidationDomainException`.
10. New allowed sessions continue storing `policyId` on `AttendanceSession`.

The new helper is `assertPeriodAllowedByEffectivePolicyForNewSession(...)` in `src/modules/attendance/roll-call/domain/policy-period-selection.ts`.

## Idempotency Rules

Existing session lookup remains first. Existing sessions are returned before selected-period validation.

This preserves the current session uniqueness and idempotency contract:

`schoolId`, `academicYearId`, `termId`, `date`, `scopeType`, `scopeKey`, `mode`, `periodKey`

## Why Existing Sessions Are Not Revalidated

Existing sessions may have been created before policy selected periods were configured or before ATT-POL-2B existed. Revalidating them on resolve would break idempotent reads, mutate historical expectations, and make policy edits retroactively affect existing roll-call sessions.

ATT-POL-2B applies only to creating new `PERIOD` sessions.

## Why DAILY Sessions Are Unaffected

`selectedPeriodIds` is a period selection gate. `DAILY` sessions use the normalized period key `daily`, remain manual daily roll-call sessions, and do not require `periodId`.

ATT-POL-2B does not implement `DERIVED_FROM_PERIODS` daily computation.

## Why Empty selectedPeriodIds Preserves Legacy Behavior

An empty `selectedPeriodIds` array means no selected-period gate is configured. Requiring `periodId` for every `PERIOD` policy would break old data and legacy period-session creation behavior.

Therefore, `periodId` is required only when an effective policy exists and has a non-empty `selectedPeriodIds` array.

## Timetable Existence Validation Deferred

ATT-POL-2B does not validate whether `periodId` exists in the timetable.

Reason: ATT-POL-2A deferred strict timetable validation because it introduces cross-module dependencies and fixture expansion. For this sprint, membership in the effective policy `selectedPeriodIds` is the intended conservative gate.

The contract remains:

- `selectedPeriodIds` stores `TimetablePeriod.id` values.
- Roll-call request `periodId` carries the `TimetablePeriod.id` when timetable-backed.
- `periodKey` remains the roll-call uniqueness/idempotency key.
- `periodKey` was not reinterpreted.

## No-leak and Security Notes

The implementation uses the already school-scoped effective policy selection path. No timetable or cross-module lookup was added.

Rejection details include only safe validation context:

- `field`
- `mode`
- `policyId`
- `periodId` when provided and normalized

No new response exposes:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- internal actor ids
- guardian or studentGuardian ids
- raw Prisma payloads
- notification internals

Existing tenancy tests remain the relevant protection because no new cross-school lookup path was introduced.

## Tests Added or Updated

Unit tests updated in `src/modules/attendance/roll-call/tests/roll-call.use-case.spec.ts`:

- New `PERIOD` session with no effective policy preserves legacy behavior.
- New `DAILY` session ignores selectedPeriodIds.
- New `PERIOD` session with effective policy and empty selectedPeriodIds preserves legacy behavior.
- New `PERIOD` session with non-empty selectedPeriodIds and missing periodId is rejected.
- New `PERIOD` session with non-empty selectedPeriodIds and disallowed periodId is rejected.
- New `PERIOD` session with non-empty selectedPeriodIds and allowed periodId creates the session and stores policyId.
- Existing `PERIOD` session is returned idempotently before selected-period validation.
- Draft entry saves keep explicit status/minutes unchanged, proving thresholds do not mutate roll-call entry status in this sprint.

E2E test updated in `test/e2e/attendance-foundation.e2e-spec.ts`:

- Creates an AttendancePolicy with selectedPeriodIds.
- Resolves a `PERIOD` roll-call session with an allowed periodId and verifies policyId linkage.
- Attempts a disallowed periodId and verifies a validation error.
- Verifies the rejected periodKey did not create a session row.
- Existing daily roll-call, submit, absences, reports, and unsubmit behavior remains covered in the same flow.

Security tests:

- No new security test was added because no timetable lookup or new cross-school-sensitive lookup was introduced.
- Existing `test/security/tenancy.attendance.spec.ts` was run and passed.

## Verification Commands and Results

- `git status --short --untracked-files=all`: PASS
  - Output:
    - `M src/modules/attendance/roll-call/application/resolve-roll-call-session.use-case.ts`
    - `M src/modules/attendance/roll-call/infrastructure/attendance-roll-call.repository.ts`
    - `M src/modules/attendance/roll-call/tests/roll-call.use-case.spec.ts`
    - `M test/e2e/attendance-foundation.e2e-spec.ts`
    - `?? docs/sprint-att-pol-2b-selected-period-roll-call-gating-closeout.md`
    - `?? src/modules/attendance/roll-call/domain/policy-period-selection.ts`
  - Warning emitted by Git: unable to access `C:\Users\Abdal/.config/git/ignore`: Permission denied.
- `git diff --name-only`: PASS
  - Output:
    - `src/modules/attendance/roll-call/application/resolve-roll-call-session.use-case.ts`
    - `src/modules/attendance/roll-call/infrastructure/attendance-roll-call.repository.ts`
    - `src/modules/attendance/roll-call/tests/roll-call.use-case.spec.ts`
    - `test/e2e/attendance-foundation.e2e-spec.ts`
  - Note: untracked new files are visible in `git status`, not `git diff --name-only`.
  - Warning emitted by Git: LF will be replaced by CRLF for the tracked modified files the next time Git touches them.
- `git diff --stat`: PASS
  - Output: 4 tracked files changed, 391 insertions, 19 deletions.
  - Note: untracked new files are visible in `git status`, not `git diff --stat`.
  - Warning emitted by Git: LF will be replaced by CRLF for the tracked modified files the next time Git touches them.
- `git diff --check`: PASS
  - Output: no whitespace errors.
  - Warning emitted by Git: LF will be replaced by CRLF for the tracked modified files the next time Git touches them.
- `npx prisma validate`: PASS
  - Schema valid.
- `npx prisma generate`: PASS
  - Prisma Client v6.19.3 generated.
- `npm run build`: PASS
  - `nest build` completed.
- `npm run test -- roll-call --runInBand`: PASS
  - 4 suites passed, 36 tests passed.
- `npm run test -- attendance-policy --runInBand`: PASS
  - 2 suites passed, 10 tests passed.
- `npm run test -- attendance --runInBand`: PASS
  - 22 suites passed, 141 tests passed.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts`: PASS
  - 1 suite passed, 1 test passed.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-excuses-corrections.e2e-spec.ts`: PASS
  - 1 suite passed, 2 tests passed.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`: PASS
  - 1 suite passed, 38 tests passed.
- `npm run test:security -- --runInBand`: PASS after rerun with a longer command timeout
  - First attempt timed out at the 300s tool timeout before Jest printed totals.
  - Rerun completed: 50 suites passed, 816 tests passed.
- Final `git status --short --untracked-files=all`: PASS
  - Output:
    - `M src/modules/attendance/roll-call/application/resolve-roll-call-session.use-case.ts`
    - `M src/modules/attendance/roll-call/infrastructure/attendance-roll-call.repository.ts`
    - `M src/modules/attendance/roll-call/tests/roll-call.use-case.spec.ts`
    - `M test/e2e/attendance-foundation.e2e-spec.ts`
    - `?? docs/sprint-att-pol-2b-selected-period-roll-call-gating-closeout.md`
    - `?? src/modules/attendance/roll-call/domain/policy-period-selection.ts`
  - Warning emitted by Git: unable to access `C:\Users\Abdal/.config/git/ignore`: Permission denied.

## Deferred Items

Deferred beyond ATT-POL-2B:

- Threshold mutation.
- Automatic `PRESENT` to `LATE` conversion.
- Automatic `PRESENT` to `EARLY_LEAVE` conversion.
- Threshold-based rejection or warning response contracts.
- `autoAbsentAfterMinutes` runtime application.
- Derived daily attendance.
- Persisted derived `DAILY` sessions.
- Report-only derived daily computation.
- Strict timetable period existence validation.
- Notification dispatch.
- Communication notification enqueueing.
- Teacher App behavior changes.
- Parent App behavior changes.
- Student App behavior changes.
- Dashboard/report behavior changes.
- Historical session mutation or revalidation.

## Final Verdict

ATT_POL_2B_SELECTED_PERIOD_GATING_READY

ATT-POL-2B is complete for conservative selected-period roll-call gating. Broader attendance rule application remains deferred.
