# ATT-POL-2F - Attendance Threshold Draft-Save Normalization Closeout

## 1. Baseline commit

- Baseline: `892aff3 docs: audit attendance threshold semantics`
- Sprint: `ATT-POL-2F - Attendance Threshold Draft-Save Normalization`
- Sprint type: Conservative runtime implementation sprint
- Final verdict: `ATT_POL_2F_THRESHOLD_DRAFT_SAVE_NORMALIZATION_READY`

## 2. Sprint scope

Implemented the ATT-POL-2E decision: attendance policy late and early-leave thresholds are applied only during draft roll-call entry save/upsert, and only for incoming `PRESENT` entries with explicit positive minute values meeting the linked policy thresholds.

The implementation does not add a broader attendance rule engine and does not change submit, correction, reports, dashboard, Teacher App, Parent App, or Student App contracts.

## 3. Files changed

- `src/modules/attendance/roll-call/domain/entry-threshold-normalization.ts`
- `src/modules/attendance/roll-call/application/save-roll-call-entries.use-case.ts`
- `src/modules/attendance/roll-call/infrastructure/attendance-roll-call.repository.ts`
- `src/modules/attendance/roll-call/tests/entry-threshold-normalization.spec.ts`
- `src/modules/attendance/roll-call/tests/roll-call.use-case.spec.ts`
- `src/modules/attendance/roll-call/tests/attendance-entry-correction.use-case.spec.ts`
- `src/modules/teacher-app/classroom/attendance/tests/teacher-classroom-attendance.adapter.spec.ts`
- `test/e2e/attendance-foundation.e2e-spec.ts`
- `docs/sprint-att-pol-2f-attendance-threshold-runtime-closeout.md`

## 4. Schema, migration, and package confirmation

- Prisma schema changes: none
- Migrations: none
- Package changes: none
- Lockfile changes: none
- Controller path changes: none
- Public response envelope changes: none

## 5. Exact behavior implemented

Draft save now performs policy-threshold normalization immediately before the existing bulk attendance entry upsert.

For each incoming draft entry:

- Non-`PRESENT` statuses are left unchanged.
- Entries are left unchanged when the session has no `policyId`.
- Entries are left unchanged when the linked policy has both threshold fields set to `null`.
- `PRESENT` plus explicit positive `lateMinutes >= lateThresholdMinutes` becomes `LATE`.
- `PRESENT` plus explicit positive `earlyLeaveMinutes >= earlyLeaveThresholdMinutes` becomes `EARLY_LEAVE`.
- Below-threshold minutes and zero minutes remain valid and unchanged.
- Ambiguous entries that match both thresholds are rejected before persistence.

Normalization preserves the matching minute field and clears the opposite minute field:

- `LATE` preserves `lateMinutes` and sets `earlyLeaveMinutes` to `null`.
- `EARLY_LEAVE` preserves `earlyLeaveMinutes` and sets `lateMinutes` to `null`.

## 6. Threshold lookup behavior

The roll-call repository now exposes a narrow school-scoped threshold lookup by linked policy id:

- `id`
- `lateThresholdMinutes`
- `earlyLeaveThresholdMinutes`

`SaveRollCallEntriesUseCase` uses `AttendanceSession.policyId` only. It does not re-resolve the currently effective policy by scope/date, and it does not use unrelated policy fields.

If the linked policy is not found in the active school scope, threshold normalization is skipped.

## 7. Draft save normalization behavior

The normalization entry point is `SaveRollCallEntriesUseCase.save`.

The orchestration remains:

1. Load session.
2. Enforce closed-term and draft-session protections.
3. Load roster.
4. Normalize and validate entries against roster membership.
5. Load linked policy thresholds when `session.policyId` is present.
6. Normalize incoming draft entries by thresholds.
7. Bulk upsert through the existing repository path.

`UpsertRollCallEntryUseCase` inherits the same behavior because it already delegates to `SaveRollCallEntriesUseCase.save`.

## 8. Submit behavior unchanged

`SubmitRollCallSessionUseCase` was not changed.

Submit still:

- does not inspect thresholds,
- does not normalize entries,
- does not mutate status/minute combinations,
- only moves the session from `DRAFT` to `SUBMITTED` and writes the existing audit log.

## 9. Correction behavior unchanged

`CorrectAttendanceEntryUseCase` runtime behavior was not changed.

Submitted corrections still:

- honor the explicit correction status,
- reject `UNMARKED`,
- require positive `lateMinutes` for `LATE`,
- require positive `earlyLeaveMinutes` for `EARLY_LEAVE`,
- clear incident minute fields for `PRESENT` and `ABSENT`,
- do not consult policy thresholds.

## 10. Teacher App compatibility

Teacher App DTOs and routes were not changed.

Teacher App attendance writes still map:

- `present` -> `PRESENT`
- `absent` -> `ABSENT`
- `late` -> `LATE`
- `excused` -> `EXCUSED`

The adapter still does not send `lateMinutes` or `earlyLeaveMinutes` to core roll-call. A unit regression verifies Teacher App `late` writes remain compatible without minute fields.

## 11. Error behavior and no-leak notes

Ambiguous dual-threshold draft entries throw `ValidationDomainException`:

- code: `validation.failed`
- HTTP status: 400
- message: `Attendance entry cannot match both late and early-leave thresholds`

Safe details:

- `field`
- `studentId`
- `lateMinutes`
- `earlyLeaveMinutes`
- `lateThresholdMinutes`
- `earlyLeaveThresholdMinutes`
- `reason: ambiguous_threshold_match`

The error does not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- internal actor ids
- raw Prisma payloads
- notification internals

## 12. Tests added or updated

Added:

- Pure threshold normalization helper unit tests.
- Roll-call draft save threshold normalization unit tests.
- Targeted upsert threshold normalization unit test.
- Submit no-threshold-mutation regression.
- Correction no-threshold-mutation regression.
- Teacher App adapter late-without-minutes compatibility regression.
- Attendance foundation E2E threshold draft-save normalization flow.

Updated:

- Existing roll-call save tests now assert no threshold lookup occurs when the session has no linked policy.

## 13. Verification commands and results

- `git status --short --untracked-files=all`: PASS before implementation with clean worktree. Final status is recorded in the final sprint response.
- `git diff --name-only`: PASS. Tracked edits are limited to roll-call, Teacher App test, and attendance E2E files; new files appear through `git status`.
- `git diff --stat`: PASS.
- `git diff --check`: PASS.
- `npx prisma validate`: PASS. Prisma schema is valid.
- `npm run build`: PASS.
- `npm run test -- roll-call --runInBand`: PASS, 5 suites, 53 tests.
- `npm run test -- attendance-policy --runInBand`: PASS, 2 suites, 15 tests.
- `npm run test -- attendance --runInBand`: PASS, 23 suites, 164 tests.
- `npm run test -- teacher-app --runInBand`: PASS, 47 suites, 274 tests.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts`: PASS, 1 suite, 2 tests.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-excuses-corrections.e2e-spec.ts`: PASS, 1 suite, 2 tests.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/teacher-app-classroom-operations.e2e-spec.ts`: FAIL, 1 suite failed, 1 test failed, 1 test passed. Failure is an unrelated Teacher App route snapshot drift: the app registers additional existing teacher announcements/messages/notifications routes not listed in the snapshot expectation. The attendance flow in the same file passed.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`: PASS, 1 suite, 41 tests.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.teacher-app.spec.ts`: PASS, 1 suite, 42 tests.
- `npm run test:security -- --runInBand`: PASS, 50 suites, 819 tests.

No migrations were run. `npx prisma generate` was not required or run.

## 14. Deferred items

- `autoAbsentAfterMinutes` runtime application.
- `absentIfMissedPeriodsCount` runtime application.
- `DERIVED_FROM_PERIODS` daily computation.
- Persisted derived `DAILY` sessions.
- Report-only derived daily computation.
- Notification dispatch.
- Communication notification enqueueing.
- `requireExcuseReason` enforcement.
- Warning response envelope.
- Strict draft consistency validation.
- Teacher App early-leave writes.
- Teacher App minute writes.
- Parent App changes.
- Student App changes.
- Dashboard/report contract changes.
- Historical recompute or backfill.
- Policy snapshotting for thresholds.
- Dashboard early-leave cards.

## 15. Final verdict

`ATT_POL_2F_THRESHOLD_DRAFT_SAVE_NORMALIZATION_READY`

The ATT-POL-2F runtime behavior is implemented behind the existing roll-call draft save/upsert path. Rule application remains limited to linked-policy threshold normalization for incoming `PRESENT` draft entries with explicit positive minute values. ATT-POL-2G and later work remains deferred for derived daily attendance, auto absent, notifications, stricter draft validation, and app-facing contract expansion.
