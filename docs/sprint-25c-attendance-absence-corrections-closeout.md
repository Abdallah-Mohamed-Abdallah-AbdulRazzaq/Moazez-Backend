# Sprint 25C — Attendance Absence Corrections Closeout

## 1. Executive Decision

**Decision: PASS.**

The Sprint 25A/25B absence correction gap is closed for School Dashboard/Core Attendance.

Sprint 25C adds safe correction convenience endpoints for derived absence/incidence rows. These endpoints mutate only the source `AttendanceEntry` rows behind submitted `AttendanceSession` rows.

Attendance remains **PARTIAL** as a feature family because route drift, optional context, Teacher App contract gaps, and Student/Parent derived discipline timelines remain outside this sprint.

## 2. Scope

Runtime files changed:

- `src/modules/attendance/absences/absences.module.ts`
- `src/modules/attendance/absences/controller/attendance-absences.controller.ts`
- `src/modules/attendance/absences/application/mark-attendance-absence-excused.use-case.ts`
- `src/modules/attendance/absences/application/correct-attendance-absence-early-leave.use-case.ts`
- `src/modules/attendance/absences/domain/attendance-incident.ts`
- `src/modules/attendance/absences/dto/attendance-absences.dto.ts`
- `src/modules/attendance/absences/infrastructure/attendance-absences.repository.ts`

Tests changed:

- `src/modules/attendance/absences/tests/attendance-absences.use-case.spec.ts`
- `src/modules/attendance/absences/tests/attendance-absences.repository.spec.ts`
- `src/modules/attendance/absences/tests/attendance-absences.presenter.spec.ts`
- `test/security/tenancy.attendance.spec.ts`
- `test/e2e/attendance-excuses-corrections.e2e-spec.ts`

Docs changed:

- `docs/sprint-25c-attendance-absence-corrections-closeout.md`

## 3. Contract Decision

Added routes:

- `PATCH /api/v1/attendance/absences/:id/excuse`
- `PATCH /api/v1/attendance/absences/:id/early-leave`

No route aliases were added.

`/attendance/context` remains deferred.

Discipline remains out of scope.

The direct `/attendance/absences/:id/excuse` correction route does **not** create `AttendanceExcuseRequest` records. The formal excuse request lifecycle remains separate.

## 4. Source-of-Truth Decision

Absence rows are derived from `AttendanceEntry` rows in submitted `AttendanceSession` rows.

The new endpoints mutate `AttendanceEntry` only:

- excuse correction sets the source entry to `EXCUSED`
- early-leave correction sets the source entry to `EARLY_LEAVE`

No Absence model was created. No Discipline model was created. No Behavior record was created. No attendance data was duplicated into Discipline or Behavior.

## 5. Correction Matrix

| Correction | Source statuses accepted | Source statuses rejected | Submitted-session required? | Closed-term required? | Audit behavior | Test evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Mark excused | `ABSENT`, `LATE`, `EARLY_LEAVE` | `PRESENT`, `UNMARKED`, already `EXCUSED` | Yes | Active term required | `attendance.entry.correct` audit with `correctionSource: attendance.absences.excuse` | Unit, security, and e2e |
| Correct early leave | `ABSENT`, `LATE`, `EARLY_LEAVE` | `PRESENT`, `UNMARKED`, `EXCUSED` | Yes | Active term required | `attendance.entry.correct` audit with `correctionSource: attendance.absences.early_leave` | Unit, security, and e2e |

Both routes return the existing safe absence incident presenter shape and do not expose the internally selected term data.

## 6. Security / No-Leak Notes

Tenancy is enforced through the existing Attendance request scope and scoped Prisma repository path.

Cross-school and guessed entry ids resolve as safe `404 not_found`.

Draft-session entries are hidden/rejected by the submitted-session repository filter. Use cases also defensively assert submitted-session status.

Closed/inactive terms are rejected through the Sprint 25B `assertRollCallSessionTermWritable` helper with the existing message: `Attendance sessions cannot be changed in a closed term`.

Responses do not expose `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, raw storage metadata, or internal actor ids.

No permissions were broadened. The new writes use the existing dashboard/core Attendance write permission `attendance.entries.manage`.

## 7. Remaining Attendance Gaps

- Route drift remains documented and was not fixed with aliases.
- `/attendance/context` remains deferred.
- Teacher App DAILY-only behavior remains deferred.
- Teacher arrival/dismissal/early_leave mapping remains deferred.
- Student/Parent discipline timelines remain deferred to the future derived/read layer decision.
- Formal excuse request attachment policy remains separate from direct dashboard corrections.

## 8. Final Decision

Sprint 25C passes.

The next sprint should be **Sprint 25D — Discipline Derived Layer Decision Audit** unless product chooses to prioritize a smaller Attendance contract cleanup before Discipline decisions.
