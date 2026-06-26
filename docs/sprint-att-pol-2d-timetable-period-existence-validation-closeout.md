# ATT-POL-2D - Timetable Period Existence Validation Closeout

## Baseline

- Baseline commit: `bb16bd6 docs: audit timetable period validation`
- Sprint type: Conservative runtime implementation sprint
- Final verdict: `ATT_POL_2D_TIMETABLE_PERIOD_VALIDATION_READY`

## Sprint Scope

ATT-POL-2D implements strict timetable period reference validation for:

- `AttendancePolicy.selectedPeriodIds` on create.
- `AttendancePolicy.selectedPeriodIds` on update only when the field is supplied.
- Roll-call request `periodId` only while creating a new `PERIOD` attendance session and only when a normalized `periodId` is present.

The sprint preserves ATT-POL-2B selected-period membership gating, session idempotency, existing route contracts, and current attendance rule semantics.

## Files Changed

- `src/modules/academics/timetable/application/timetable-attendance-period-reference.service.ts`
- `src/modules/academics/timetable/infrastructure/timetable.repository.ts`
- `src/modules/academics/timetable/timetable.module.ts`
- `src/modules/academics/timetable/tests/timetable.use-case.spec.ts`
- `src/modules/attendance/policies/application/create-attendance-policy.use-case.ts`
- `src/modules/attendance/policies/application/policy-period-reference.validation.ts`
- `src/modules/attendance/policies/application/update-attendance-policy.use-case.ts`
- `src/modules/attendance/policies/policies.module.ts`
- `src/modules/attendance/policies/tests/attendance-policy.use-case.spec.ts`
- `src/modules/attendance/roll-call/application/resolve-roll-call-session.use-case.ts`
- `src/modules/attendance/roll-call/roll-call.module.ts`
- `src/modules/attendance/roll-call/tests/roll-call.use-case.spec.ts`
- `test/e2e/attendance-foundation.e2e-spec.ts`
- `test/security/tenancy.attendance.spec.ts`
- `docs/sprint-att-pol-2d-timetable-period-existence-validation-closeout.md`

## Schema, Migration, Package Confirmation

- Prisma schema changes: none.
- Migrations: none.
- Package or lockfile changes: none.
- Controller paths, HTTP methods, and response envelopes: unchanged.

## Exact Behavior Implemented

Timetable period references are now considered valid for attendance only when the referenced `TimetablePeriod.id` is visible through the active school scope and belongs to a `TimetableConfig` with:

- the same `academicYearId`,
- the same `termId`,
- `status` in `DRAFT` or `ACTIVE`.

Periods under `ARCHIVED` timetable configs, wrong academic years, wrong terms, nonexistent ids, and cross-school ids are rejected through generic attendance validation errors.

## Timetable Validation Service

Added `TimetableAttendancePeriodReferenceService` in the academics timetable module. It exposes:

- `findValidPeriodIdsForAttendanceContext(...)`
- `isPeriodValidForAttendanceContext(...)`

The service returns only ids or booleans. It does not return timetable records, tenant fields, or raw Prisma payloads to Attendance.

The timetable repository now has a bulk lookup method for attendance context validation. The lookup uses one query for many ids and continues to use the timetable module's scoped Prisma access.

## Policy Create And Update Validation

Policy create:

- Keeps existing structural normalization from ATT-POL-1.
- Allows empty `selectedPeriodIds`.
- Validates non-empty selected ids against timetable periods in the policy academic context.
- Rejects invalid ids with `validation.failed`.

Policy update:

- Validates `selectedPeriodIds` only when the update body supplies the field.
- Treats supplied ids as a full replacement.
- Allows `selectedPeriodIds: []` to clear the selection.
- Does not validate old stored ids when the field is omitted.
- Uses the next `academicYearId` and `termId` when the update supplies selected ids.

## Roll-Call Validation Behavior

Roll-call resolve now:

- Looks up an existing session first and returns it immediately when found.
- Does not re-resolve policy or validate timetable periods for existing sessions.
- Leaves `DAILY` sessions unchanged.
- Leaves `PERIOD` sessions with omitted `periodId` unchanged when legacy behavior allows omission.
- Runs ATT-POL-2B selected-period membership gating before timetable existence lookup.
- Validates a supplied normalized `PERIOD` `periodId` against timetable periods in the active school and academic context before creating a new session.
- Rejects invalid `periodId` without creating a session.
- Still stores the resolved `policyId` on newly created sessions.

## Idempotency Rules

Existing attendance sessions are not revalidated. This preserves the established roll-call idempotency contract and avoids historical mutation when timetable or policy data changes later.

## Academic Context Matching Rules

Validation matches only:

- active school scope through scoped repository access,
- same `academicYearId`,
- same `termId`,
- timetable config status `DRAFT` or `ACTIVE`.

It intentionally does not require the same timetable config, timetable entry, classroom, section, grade, stage, publication state, or timetable scope.

## Error Behavior And No-Leak Notes

Policy selected-period validation rejects with:

- exception style: `ValidationDomainException`
- code: `validation.failed`
- status: 400
- safe details: `field`, `invalidPeriodIds`, `reason`

Roll-call period validation rejects with:

- exception style: `ValidationDomainException`
- code: `validation.failed`
- status: 400
- safe details: `field`, `mode`, `periodId`, `reason`

Errors do not disclose whether a rejected id exists in another school. Responses must not expose `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, internal actor ids, raw Prisma payloads, or timetable internals.

## Security Coverage

Added attendance tenancy coverage proving:

- School A cannot save School B's `TimetablePeriod.id` in `selectedPeriodIds` on policy create.
- School A cannot save School B's `TimetablePeriod.id` in `selectedPeriodIds` on policy update.
- Even if a School A policy is manually seeded with a School B period id, School A roll-call creation rejects that `periodId` and creates no session.
- Validation errors avoid tenant/internal field leaks.

Existing academics timetable tenancy coverage remains green.

## Tests Added Or Updated

- Timetable unit tests cover DRAFT/ACTIVE accepted ids, ARCHIVED exclusion, wrong-term exclusion, wrong-year exclusion, nonexistent id exclusion, and single-id validation through the bulk path.
- Policy unit tests cover create/update acceptance, invalid selected-period rejection, clearing `selectedPeriodIds`, omitted-field preservation, and no-leak validation details.
- Roll-call unit tests cover idempotency before validation, DAILY bypass, legacy omitted-period behavior, invalid supplied `periodId`, selected-period missing/disallowed ordering, valid selected-period creation, and no threshold mutation.
- Attendance foundation E2E now creates real timetable periods and validates policy create/list/effective plus roll-call with a valid timetable period id.
- Attendance security E2E covers cross-school timetable period rejection.

## Verification Commands And Results

- `git status --short --untracked-files=all` - PASS, expected working tree changes only.
- `git diff --name-only` - PASS.
- `git diff --stat` - PASS.
- `git diff --check` - PASS.
- `npx prisma validate` - PASS.
- `npx prisma generate` - PASS.
- `npm run build` - PASS after removing stale generated `dist` output. Initial attempt hit a Windows `ENOTEMPTY` cleanup error in `dist`.
- `npm run test -- timetable --runInBand` - PASS, 1 suite / 35 tests.
- `npm run test -- attendance-policy --runInBand` - PASS, 2 suites / 15 tests.
- `npm run test -- roll-call --runInBand` - PASS, 4 suites / 37 tests.
- `npm run test -- attendance --runInBand` - PASS, 22 suites / 147 tests.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts` - PASS, 1 suite / 1 test.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/academics-timetable-dashboard-workflows.e2e-spec.ts` - PASS, 1 suite / 6 tests.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts` - PASS, 1 suite / 41 tests.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.academics-timetable-dashboard-workflows.spec.ts` - PASS, 1 suite / 6 tests.
- `npm run test:security -- --runInBand` - PASS.
- Final `git status --short --untracked-files=all` - PASS, expected working tree changes only.

## Deferred Items

- Threshold mutation and `PRESENT -> LATE` conversion.
- Threshold mutation and `PRESENT -> EARLY_LEAVE` conversion.
- Threshold warning/rejection response contracts.
- `autoAbsentAfterMinutes` runtime behavior.
- `DERIVED_FROM_PERIODS` daily computation.
- Persisted derived `DAILY` sessions.
- Report-only derived daily computation.
- Notification dispatch and communication enqueueing.
- Timetable entry validation.
- Same timetable config validation.
- Same timetable scope/classroom/section/grade/stage validation.
- Timetable publication validation.
- Teacher App, Parent App, Student App, Dashboard/report behavior changes.
- Historical cleanup, backfill, or revalidation of existing sessions.

## Final Verdict

`ATT_POL_2D_TIMETABLE_PERIOD_VALIDATION_READY`
