# ATT-POL-1 - Attendance Policy Contract Persistence Repair Closeout

## Baseline

- Baseline commit: `86bfd77 fix: harden settings iam health readiness`
- Sprint title: `ATT-POL-1 - Attendance Policy Contract Persistence Repair`

## Problem Fixed

The Attendance Policy API accepted advanced policy contract fields in DTOs and exposed them in response DTOs, but those values were not persisted, selected, or presented from PostgreSQL. Policy responses returned placeholder values for selected periods, thresholds, excuse reason requirements, and notification flags.

This sprint repairs the persistence contract only. It does not implement automatic attendance rule application.

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260625033222_0044_attendance_policy_contract_persistence_repair/migration.sql`
- `src/modules/attendance/policies/domain/policy-contract.validation.ts`
- `src/modules/attendance/policies/application/policy-use-case.helpers.ts`
- `src/modules/attendance/policies/dto/attendance-policy.dto.ts`
- `src/modules/attendance/policies/infrastructure/attendance-policies.repository.ts`
- `src/modules/attendance/policies/presenters/attendance-policy.presenter.ts`
- `src/modules/attendance/policies/tests/attendance-policy.presenter.spec.ts`
- `src/modules/attendance/policies/tests/attendance-policy.use-case.spec.ts`
- `test/e2e/attendance-foundation.e2e-spec.ts`
- `docs/sprint-att-pol-1-attendance-policy-contract-persistence-repair-closeout.md`

## Migration

- Migration name: `20260625033222_0044_attendance_policy_contract_persistence_repair`
- The migration was generated with Prisma migration tooling and then pruned to the ATT-POL-1 table change only.
- Existing policy rows remain valid through nullable integer columns and boolean or array defaults.

## Fields Added

Added to `AttendancePolicy` / `attendance_policies`:

- `selectedPeriodIds` / `selected_period_ids` as `TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`
- `lateThresholdMinutes` / `late_threshold_minutes`
- `earlyLeaveThresholdMinutes` / `early_leave_threshold_minutes`
- `autoAbsentAfterMinutes` / `auto_absent_after_minutes`
- `absentIfMissedPeriodsCount` / `absent_if_missed_periods_count`
- `requireExcuseReason` / `require_excuse_reason`
- `notifyTeachers` / `notify_teachers`
- `notifyStudents` / `notify_students`
- `notifyOnLate` / `notify_on_late`
- `notifyOnEarlyLeave` / `notify_on_early_leave`

Existing fields were preserved:

- `requireExcuseAttachment`
- `allowParentExcuseRequests`
- `notifyGuardiansOnAbsence`

## API Behavior After Fix

- `POST /api/v1/attendance/policies` persists advanced policy fields accepted by `CreateAttendancePolicyDto`.
- `PATCH /api/v1/attendance/policies/:id` updates advanced fields only when supplied.
- Explicit boolean `false` values are persisted.
- Explicit nullable numeric fields can clear stored values with `null`.
- `selectedPeriodIds` replaces the full stored array when supplied.
- `GET /api/v1/attendance/policies` returns persisted advanced fields.
- `GET /api/v1/attendance/policies/effective` returns the same advanced fields through the normal presenter.
- Existing aliases remain compatible:
  - `yearId` mirrors `academicYearId`
  - `requireAttachmentForExcuse` mirrors `requireExcuseAttachment`
  - `allowExcuses` mirrors `allowParentExcuseRequests`
  - `notifyGuardians` and `notifyOnAbsent` continue to reflect `notifyGuardiansOnAbsence`

## Validation Behavior

- `selectedPeriodIds` defaults to `[]`.
- `selectedPeriodIds` values are trimmed before persistence.
- Empty selected period ids are rejected.
- Duplicate selected period ids are rejected after trimming.
- Numeric thresholds must be `null`, omitted, or non-negative integers.
- `DERIVED_FROM_PERIODS` requires both non-empty `selectedPeriodIds` and a provided `absentIfMissedPeriodsCount`.
- Timetable period existence validation is not implemented in ATT-POL-1.

## Explicitly Deferred

- Auto late or early-leave classification.
- Auto absent behavior.
- Derived daily attendance computation from period sessions.
- Notification dispatch.
- Communication notification enqueueing.
- Strict school-scoped timetable period existence validation.
- Teacher App, Student App, Parent App, and roll-call status behavior changes beyond preserving the existing effective `policyId` link.

## Verification

- `git status --short --untracked-files=all`: showed the expected modified attendance policy files plus new migration, validation helper, and closeout doc.
- `git diff --name-only`: listed tracked policy/schema/E2E changes. New untracked files were visible in `git status`.
- `git diff --stat`: completed successfully. Before the closeout doc was added, tracked diff was 8 files, 597 insertions, 50 deletions.
- `git diff --check`: passed with only Windows CRLF normalization warnings.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed; Prisma Client v6.19.3 generated.
- `npm run build`: first attempt timed out at 120s, next attempt hit transient `dist` cleanup `ENOTEMPTY`, final retry passed.
- `npm run test -- attendance-policy --runInBand`: passed, 2 suites / 10 tests.
- `npm run test -- roll-call --runInBand`: passed, 4 suites / 28 tests.
- `npm run test -- attendance --runInBand`: passed, 22 suites / 133 tests.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts`: passed, 1 suite / 1 test.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-excuses-corrections.e2e-spec.ts`: passed, 1 suite / 2 tests.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`: passed, 1 suite / 38 tests.
- `npm run test:security -- --runInBand`: passed, 50 suites / 816 tests.
- `npx prisma migrate deploy`: applied `20260625033222_0044_attendance_policy_contract_persistence_repair` before E2E; final requested deploy check passed with no pending migrations.

## Final Status

ATT-POL-1 is complete for contract persistence repair. ATT-POL-2 remains deferred for rule application and runtime attendance behavior.
