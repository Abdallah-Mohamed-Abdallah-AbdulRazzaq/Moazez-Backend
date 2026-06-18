# Sprint 25B — Attendance Core Contract Closeout

## 1. Executive Decision

**Decision: PASS.**

The Sprint 25A HIGH severity closed-term write gap is closed for existing Attendance roll-call sessions. Existing roll-call write mutations now re-check the owning term before changing session state or attendance entries.

Attendance remains **PARTIAL** as a feature family because Sprint 25A route drift, optional context API, absence correction endpoints, Teacher App contract gaps, and Student/Parent derived read-model gaps remain outside this sprint.

## 2. Scope

Runtime files changed:

- `src/modules/attendance/roll-call/application/roll-call-use-case.helpers.ts`
- `src/modules/attendance/roll-call/application/save-roll-call-entries.use-case.ts`
- `src/modules/attendance/roll-call/application/submit-roll-call-session.use-case.ts`
- `src/modules/attendance/roll-call/application/unsubmit-roll-call-session.use-case.ts`
- `src/modules/attendance/roll-call/application/correct-attendance-entry.use-case.ts`
- `src/modules/attendance/roll-call/infrastructure/attendance-roll-call.repository.ts`

Tests changed:

- `src/modules/attendance/roll-call/tests/roll-call.use-case.spec.ts`
- `src/modules/attendance/roll-call/tests/attendance-entry-correction.use-case.spec.ts`
- `src/modules/teacher-app/classroom/attendance/tests/teacher-classroom-attendance.adapter.spec.ts`

Docs changed:

- `docs/sprint-25b-attendance-core-contract-closeout.md`

## 3. Contract Decision

The accepted backend-native Attendance route contract remains `/api/v1/attendance/roll-call/*`.

No route aliases were added. No `/attendance/sessions/*` aliases were added.

`/attendance/context` was not added in Sprint 25B.

Absence correction endpoints remain deferred to Sprint 25C.

Discipline remains out of scope. Sprint 25B does not create Discipline write models, Discipline routes, Student/Parent discipline timelines, or duplicated attendance-derived records.

## 4. Closed-Term Write Protection Matrix

| Mutation | Protected? | Where enforced | Test evidence |
| --- | --- | --- | --- |
| Bulk save entries | Yes | `SaveRollCallEntriesUseCase` calls `assertRollCallSessionTermWritable(session)` before roster lookup or `bulkUpsertEntries` | `roll-call.use-case.spec.ts` rejects bulk saving entries when the term is inactive |
| Single entry upsert | Yes | `UpsertRollCallEntryUseCase` delegates to `SaveRollCallEntriesUseCase.save` | `roll-call.use-case.spec.ts` rejects targeted entry upsert when the term is inactive |
| Submit session | Yes | `SubmitRollCallSessionUseCase` calls `assertRollCallSessionTermWritable(session)` before `submitSession` | `roll-call.use-case.spec.ts` rejects submitting a session when the term is inactive |
| Unsubmit session | Yes | `UnsubmitRollCallSessionUseCase` calls `assertRollCallSessionTermWritable(session)` before `unsubmitSession` | `roll-call.use-case.spec.ts` rejects unsubmitting a session when the term is inactive |
| Correct submitted entry | Yes | `CorrectAttendanceEntryUseCase` calls `assertRollCallSessionTermWritable(session)` before correction validation and write | `attendance-entry-correction.use-case.spec.ts` rejects correction when the term is inactive |
| Teacher App update entries | Yes | Teacher App delegates to core `SaveRollCallEntriesUseCase`; adapter propagates the core validation error | `teacher-classroom-attendance.adapter.spec.ts` propagates core closed-term protection for entry updates |
| Teacher App submit | Yes | Teacher App delegates to core `SubmitRollCallSessionUseCase`; adapter propagates the core validation error | `teacher-classroom-attendance.adapter.spec.ts` propagates core closed-term protection for session submit |

## 5. Read-Only Closed-Term Behavior

Read-only roll-call behavior remains allowed for closed or inactive terms. Sprint 25B added the term write check only to mutation use cases.

Listing sessions, getting session detail, getting roster data, and resolving an already-created session remain readable/idempotent. Creating a new session in a closed term remains rejected by the existing session resolution check.

## 6. Security / No-Leak Notes

The closed-term error reuses the existing `ValidationDomainException` message: `Attendance sessions cannot be changed in a closed term`.

The new checks do not expose `schoolId`, `organizationId`, `membershipId`, `roleId`, deleted records, storage metadata, raw internal metadata, or teacher-only notes.

No permissions were broadened. No cross-school behavior changed. Tenant scoping remains owned by the existing Attendance repository/context flow.

Teacher App write paths inherit the core Attendance protection instead of implementing a separate policy.

## 7. Remaining Attendance Gaps

- Route drift remains documented and was not fixed with aliases.
- `/attendance/context` remains deferred.
- Absence correction endpoints remain deferred to Sprint 25C.
- Teacher App DAILY-only behavior remains deferred to a later sprint.
- Teacher arrival/dismissal/early_leave mapping remains deferred.
- Student/Parent discipline timelines remain deferred to the future derived/read layer decision.

## 8. Final Decision

Sprint 25B passes.

The closed-term write gap for existing roll-call sessions is closed, and runtime changes are limited to Attendance roll-call write protection plus focused Teacher App adapter test coverage.

The next sprint should be **Sprint 25C — Attendance Absence Corrections** because the remaining Attendance core gap is still in the Attendance source-of-truth layer. Sprint 25D should follow when product/backend are ready to decide the derived Discipline read-layer contract.
