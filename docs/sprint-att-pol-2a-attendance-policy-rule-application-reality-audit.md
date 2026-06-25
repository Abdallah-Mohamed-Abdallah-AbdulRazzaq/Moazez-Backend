# ATT-POL-2A - Attendance Policy Rule Application Reality Audit

Status: READY_FOR_REVIEW

Sprint type: Documentation-only audit and decision-lock sprint.

Runtime changes: none. This audit does not modify source code, Prisma schema, migrations, tests, package files, routes, DTOs, presenters, repositories, or runtime behavior.

## 2. Baseline

Baseline commit: `799dea9 fix: persist attendance policy contract fields`

Previous sprint decision: ATT-POL-1 repaired AttendancePolicy contract persistence. Advanced policy fields are now stored by PostgreSQL, selected by the repository, returned by the presenter, and covered by tests. ATT-POL-1 explicitly deferred rule application, derived daily attendance, notification dispatch, strict timetable validation, and app-facing behavior changes.

## 3. Scope and Non-goals

In scope:

- Audit current AttendancePolicy CRUD, effective policy resolution, roll-call session creation, entry mutation, absences, reports, timetable compatibility, communication notification infrastructure, and app-facing attendance consumers.
- Decide the safest ATT-POL-2B runtime scope for applying persisted policy rule fields.
- Document exact implementation boundaries, expected file impact, validation behavior, idempotency rules, test coverage, security constraints, and deferred work.

Non-goals:

- No automatic late or early-leave classification in this sprint.
- No automatic absent behavior in this sprint.
- No derived daily attendance computation in this sprint.
- No notification dispatch in this sprint.
- No Teacher App, Parent App, Student App, Dashboard, reports, or roll-call route contract changes in this sprint.
- No Prisma schema changes, migrations, package changes, test edits, or source edits in this sprint.

## 4. Sources Reviewed

Required governance and architecture sources reviewed:

- `AGENT_CONTEXT_PRIMER.md`
- `CLAUDE.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `DOMAIN_GLOSSARY.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `ERROR_CATALOG.md`
- `TESTING_STRATEGY.md`
- `OBSERVABILITY.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/School-Dashboard/sis_dashboard-attendance_backend_handoff_spec.md`
- `docs/sprint-25a-attendance-discipline-behavior-reality-contract-audit.md`
- `docs/sprint-25b-attendance-core-contract-closeout.md`
- `docs/sprint-25c-attendance-absence-corrections-closeout.md`
- `docs/sprint-25g-teacher-app-attendance-mapping-decision-audit.md`
- `docs/sprint-25h-teacher-app-attendance-mapping-read-closeout.md`
- `docs/sprint-25i-attendance-behavior-discipline-final-closeout-audit.md`
- `docs/sprint-25j-attendance-behavior-discipline-frontend-contract-handoff.md`
- `docs/sprint-att-pol-1-attendance-policy-contract-persistence-repair-closeout.md`

Missing required documents: none found.

Runtime sources reviewed:

- `prisma/schema.prisma`
- `src/modules/attendance/**`
- `src/modules/teacher-app/classroom/attendance/**`
- `src/modules/dashboard/**`
- `src/modules/communication/**`
- `src/modules/academics/timetable/**`
- `test/e2e/attendance-foundation.e2e-spec.ts`
- `test/e2e/attendance-excuses-corrections.e2e-spec.ts`
- `test/security/tenancy.attendance.spec.ts`
- Existing attendance policy, roll-call, absences, reports, and app-facing attendance tests found under `src/**/tests/**` and `test/**`.

Runtime source availability notes:

- No dedicated `src/modules/parent-app/**/attendance/**` tree was found. Parent attendance effects are currently consumed through parent behavior, progress, reports, and discipline read adapters.
- No dedicated `src/modules/student-app/**/attendance/**` tree was found. Student attendance effects are currently consumed through student behavior, progress, and discipline read adapters.

## 5. Current Runtime Truth

AttendancePolicy creation, update, listing, and effective resolution are owned by the core Attendance policy module.

Current policy routes remain under the global `/api/v1` prefix and controller path `attendance/policies`. The inspected controller keeps route methods stable for list, effective lookup, name validation, create, update, and delete. Permission guards remain on policy view/manage actions. Controllers delegate to application use-cases and do not use Prisma directly.

ATT-POL-1 fields persisted on `AttendancePolicy`:

- `selectedPeriodIds`
- `lateThresholdMinutes`
- `earlyLeaveThresholdMinutes`
- `autoAbsentAfterMinutes`
- `absentIfMissedPeriodsCount`
- `requireExcuseReason`
- `notifyTeachers`
- `notifyStudents`
- `notifyOnLate`
- `notifyOnEarlyLeave`
- Existing fields still present: `requireExcuseAttachment`, `allowParentExcuseRequests`, `notifyGuardiansOnAbsence`

The policy repository now selects the advanced fields through policy select args. Create and update mapping persist those fields. The presenter returns stored values instead of placeholders and keeps shipped aliases:

- `yearId` mirrors `academicYearId`
- `requireAttachmentForExcuse` mirrors `requireExcuseAttachment`
- `allowExcuses` mirrors `allowParentExcuseRequests`
- `notifyGuardians` and `notifyOnAbsent` reflect `notifyGuardiansOnAbsence`

Effective policy resolution uses the normal policy presenter, so `GET /api/v1/attendance/policies/effective` returns the persisted advanced fields for the selected policy.

Effective policy priority remains:

1. `CLASSROOM`
2. `SECTION`
3. `GRADE`
4. `STAGE`
5. `SCHOOL`

The effective policy link is stored on `AttendanceSession.policyId` when a roll-call session is first created. Existing sessions are returned idempotently by the roll-call resolver and retain their existing `policyId`.

Parts that currently read only `policyId`:

- Roll-call session creation resolves the effective policy candidate and stores the selected policy id.
- Roll-call session/detail presenters expose the session policy id on core/dashboard surfaces.
- Roll-call repository effective policy selection currently selects policy identity and effective scope metadata, not full rule settings.

Parts that currently read full policy settings:

- Attendance policy CRUD/list/effective policy endpoints.
- Policy presenter and policy use-case tests.

Parts that do not use AttendancePolicy rule settings today:

- Roll-call entry save/update/submit/unsubmit/correction behavior.
- Absences list and summary.
- Attendance reports summary, trend, and scope breakdown.
- Dashboard summary and alerts.
- Teacher App attendance adapter.
- Parent behavior, progress, reports, and discipline derived reads.
- Student behavior, progress, and discipline derived reads.
- Communication notification generation.

## 6. Roll-call Behavior Analysis

Roll-call session resolution is currently idempotent and policy-link preserving.

Session resolve/create flow:

1. Validate academic context and parse the requested date.
2. Resolve school-scoped attendance scope.
3. Normalize the period key.
4. Try to find an existing session by school, academic year, term, date, scope, mode, and period key.
5. If an existing session is found, return it without reapplying effective policy.
6. If no session exists, assert the term is writable.
7. Resolve effective policy candidates for the requested scope/date.
8. Store the selected policy id on the newly created session.
9. Return session detail and roster/entry state.

Current uniqueness key:

`schoolId`, `academicYearId`, `termId`, `date`, `scopeType`, `scopeKey`, `mode`, `periodKey`

Daily sessions:

- `AttendanceMode.DAILY` normalizes to `periodKey = "daily"`.
- `periodId` is optional.
- No derived daily behavior exists.
- Manual daily sessions remain the canonical daily attendance write path.

Period sessions:

- `AttendanceMode.PERIOD` requires a non-empty `periodKey`.
- `periodId` is optional and currently typed as a string in the roll-call request contract.
- No timetable period existence validation is performed.
- No validation compares the requested period with `AttendancePolicy.selectedPeriodIds`.

Period identity reality:

- `TimetablePeriod.id` is the stable timetable period UUID.
- `TimetableEntry.periodId` points to `TimetablePeriod.id`.
- `TimetableAttendanceCompatibilityService` can derive attendance compatibility data from a timetable entry and returns:
  - `periodId` as `TimetablePeriod.id`
  - `periodKey` as `timetable-entry:<timetableEntryId>`
  - period label/start/end metadata
- Other timetable dashboard helpers also generate display-oriented period keys, but those are not the same as the roll-call compatibility key.
- Roll-call `periodKey` is the session uniqueness key, not the timetable period id.

Policy rule application today:

- `selectedPeriodIds`: not applied.
- `lateThresholdMinutes`: not applied.
- `earlyLeaveThresholdMinutes`: not applied.
- `autoAbsentAfterMinutes`: not applied.
- `absentIfMissedPeriodsCount`: not applied.
- Derived daily attendance from missed periods: not computed.

Submitted-session behavior:

- Draft sessions can be saved and submitted.
- Submitted sessions cannot be edited through draft save routes.
- Corrections to submitted entries go through correction-specific use-cases.
- Unsubmit/reopen is supported where permitted and makes a submitted session draft again.
- Closed-term write protection applies to create, save, submit, unsubmit, and correction paths.

Derived-result implication:

- Because there are no derived daily results today, unsubmit/reopen does not currently need to invalidate or recompute derived daily attendance.
- Adding derived sessions would introduce new lifecycle semantics for submit, unsubmit, resubmit, and submitted corrections.

## 7. Entry Mutation Analysis

Draft entry save accepts per-student attendance entries and stores source fields on `AttendanceEntry`.

Accepted core entry fields:

- `studentId`
- `status`
- `lateMinutes`
- `earlyLeaveMinutes`
- `excuseReason`
- `note`

Current storage behavior:

- `lateMinutes` and `earlyLeaveMinutes` are stored nullable on the entry.
- Bulk save validates roster membership and duplicate student ids.
- Draft save does not apply policy thresholds.
- Draft save does not normalize `PRESENT` plus positive `lateMinutes` into `LATE`.
- Draft save does not require `lateMinutes` for `LATE`.
- Draft save does not require `earlyLeaveMinutes` for `EARLY_LEAVE`.

Submitted correction behavior is stricter:

- Corrections require a submitted session and writable term.
- `UNMARKED` is rejected as a correction target.
- `PRESENT` and `ABSENT` normalize minutes and excuse reason to null.
- `LATE` requires positive `lateMinutes` and clears `earlyLeaveMinutes`.
- `EARLY_LEAVE` requires positive `earlyLeaveMinutes` and clears `lateMinutes`.
- `EXCUSED` can preserve/provide relevant reason and minute fields.

Backward-compatible threshold conclusion:

- Automatically changing entry status based on policy thresholds would be a behavior change for core attendance, reports, discipline derived reads, dashboard cards, and app-facing summaries.
- Rejecting existing draft-save combinations would also be a behavior change because draft save currently tolerates looser minute/status combinations than submitted correction.
- ATT-POL-2B should not silently mutate entry status. If status/minute consistency is tightened later, it should be done as an explicit contract change with dedicated tests.

## 8. Absences and Reports Analysis

Absences are derived, not stored as a separate source table.

Current absence incident source:

- Submitted, non-deleted `AttendanceEntry` rows.
- Included statuses: `ABSENT`, `LATE`, `EARLY_LEAVE`, `EXCUSED`.
- Excluded statuses: `PRESENT`, `UNMARKED`.

Absence correction behavior:

- Direct absence correction endpoints mutate source `AttendanceEntry` rows.
- Excuse correction changes an incident to `EXCUSED`.
- Early-leave correction changes an incident to `EARLY_LEAVE`.
- Formal excuse requests remain a separate workflow.

Report behavior:

- Attendance reports aggregate submitted `AttendanceEntry` rows.
- Counters include present, absent, late, earlyLeave, excused, and unmarked.
- Incident counts include absence/lateness/early-leave/excused statuses.
- Attendance rate uses present count divided by total entries.
- Reports are filtered by school, academic year, term, date range, scope, mode, and period key as supported.

Daily versus period absence reality:

- Daily and period sessions are independent session rows today.
- There is no persisted daily session generated from period sessions.
- There is no report-only derived daily attendance layer.
- A period absence does not automatically create a daily absence.

Impact of derived daily logic:

- Creating derived daily sessions would affect existing daily session uniqueness, manual daily roll-call workflows, submitted-session semantics, unsubmit/reopen behavior, corrections, app summaries, reports, and audit expectations.
- Report-only derivation would avoid session writes but would still change dashboard/report/student/parent/discipline counts unless carefully isolated behind a new response contract.
- Existing report semantics must be protected by tests before any derived daily behavior is enabled.

## 9. DERIVED_FROM_PERIODS Decision

Evaluated options:

Option A: create or update a derived `DAILY` `AttendanceSession`.

- Migration impact: no schema migration is strictly required, but durable provenance/idempotency fields would likely become desirable.
- Idempotency risk: high. The current daily uniqueness key can conflict with manually created daily sessions.
- Backfill/recompute risk: high. Historical period sessions and corrections would need deterministic recompute rules.
- Submitted-session behavior risk: high. A derived daily session may need to change when a period session is submitted, unsubmitted, resubmitted, or corrected.
- App-facing impact: high. Teacher App, Dashboard, Parent, Student, reports, absences, and discipline reads may all see new daily incidents.
- Auditability: weak without explicit provenance.
- ATT-POL-2B recommendation: do not choose Option A.

Option B: compute derived daily attendance report-only without creating sessions.

- Migration impact: none expected.
- Idempotency risk: lower than Option A because no sessions are written.
- Backfill/recompute behavior: query-time recompute is possible, but product must define which reports and app surfaces consume derived counts.
- Submitted-session behavior: can be limited to submitted period sessions.
- Correction behavior: query-time computation can reflect corrected period entries.
- App-facing impact: medium to high if wired into existing reports/summaries.
- Auditability: lower than source sessions but acceptable for read-only analytics if clearly labeled.
- ATT-POL-2B recommendation: do not implement in 2B unless product explicitly accepts changed report semantics. If derived daily is required later, Option B is safer than Option A for V1.

Option C: keep `DERIVED_FROM_PERIODS` stored and validated, but do not compute derived daily attendance yet.

- Migration impact: none.
- Idempotency risk: none beyond current persisted policy contract.
- Backfill/recompute behavior: deferred.
- Submitted-session behavior: unchanged.
- Correction behavior: unchanged.
- App-facing impact: unchanged.
- Auditability: unchanged.
- Testability: straightforward through policy persistence and selected-period validation tests.
- ATT-POL-2B recommendation: choose Option C.

Decision:

ATT-POL-2B should not implement derived daily attendance. Keep `dailyComputationStrategy = DERIVED_FROM_PERIODS` as a persisted, policy-level declaration and continue enforcing policy configuration validity from ATT-POL-1. Runtime derivation should remain deferred until product decides whether derived daily results are persisted sessions, report-only analytics, or a separate explicit read model.

## 10. Threshold Rules Decision

`lateThresholdMinutes`

- Auto-converting `PRESENT + lateMinutes >= threshold` to `LATE` would silently change stored statuses and derived incident counts.
- Rejecting inconsistent status/minute combinations would be safer than mutation but would still break current draft-save permissiveness.
- Returning warnings would require a response contract addition and clients prepared to consume warnings.
- Stored-only remains the least disruptive behavior.

Decision: do not auto-convert or reject based on `lateThresholdMinutes` in ATT-POL-2B. Threshold should remain stored-only, or at most be evaluated by a new internal helper with no mutation until a response warning contract is approved.

`earlyLeaveThresholdMinutes`

- Auto-converting `PRESENT + earlyLeaveMinutes >= threshold` to `EARLY_LEAVE` has the same cross-surface risk as late auto-conversion.
- Draft save currently does not enforce early-leave minute/status consistency.

Decision: do not auto-convert or reject based on `earlyLeaveThresholdMinutes` in ATT-POL-2B. Keep stored-only behavior.

`autoAbsentAfterMinutes`

- Current runtime does not have a reliable attendance timing source, check-in event stream, or scheduled job contract for automatic absence conversion.
- Applying this field would require queue/timer semantics and duplicate-prevention decisions.

Decision: keep `autoAbsentAfterMinutes` deferred.

`absentIfMissedPeriodsCount`

- This field is meaningful only for period-derived daily computation.
- Counting missed periods requires a product decision on whether missed means:
  - `ABSENT` only
  - `ABSENT + UNMARKED`
  - `ABSENT + EXCUSED`
  - whether `LATE` or `EARLY_LEAVE` count partially or not at all
- Current reports treat `ABSENT`, `LATE`, `EARLY_LEAVE`, and `EXCUSED` as incidents but not as equivalent absences.

Decision: keep `absentIfMissedPeriodsCount` as persisted configuration and validation support for `DERIVED_FROM_PERIODS`, but do not use it to compute attendance in ATT-POL-2B.

Recommended threshold policy for ATT-POL-2B:

- No automatic status mutation.
- No auto absent.
- No derived missed-period computation.
- Do not change existing draft save behavior.
- Preserve submitted correction strictness as-is.
- Add tests in ATT-POL-2B proving thresholds do not mutate statuses if selected-period gating is implemented alongside persisted threshold fields.

## 11. selectedPeriodIds Decision

Current evidence supports this contract:

- `selectedPeriodIds` should represent `TimetablePeriod.id` values.
- Roll-call `periodId` should carry the selected `TimetablePeriod.id` when the session is timetable-backed.
- Roll-call `periodKey` should remain the session uniqueness/idempotency key and may continue using compatibility keys such as `timetable-entry:<timetableEntryId>`.
- `periodKey` must not be redefined as the selected period id in ATT-POL-2B.

Current validation reality:

- Policy create/update validates `selectedPeriodIds` as trimmed, non-empty, duplicate-free strings.
- Policy create/update does not validate timetable period existence.
- Roll-call resolve does not validate selected periods.
- Roll-call resolve does not validate timetable period ownership.

Strict timetable period existence validation feasibility:

- Timetable repository has period lookup/list capabilities.
- Adding strict validation to policy create/update would introduce a cross-module dependency and fixture/test expansion.
- Validating every legacy period session would risk breaking old data and current tests.

Decision:

ATT-POL-2B should implement only backward-compatible selected-period gating at roll-call session creation:

- If mode is `DAILY`, do not apply selected-period gating.
- If mode is `PERIOD` and the effective policy has an empty `selectedPeriodIds`, allow existing behavior.
- If mode is `PERIOD` and the effective policy has non-empty `selectedPeriodIds`, require a request `periodId`.
- The request `periodId` must be included in the effective policy `selectedPeriodIds`.
- Do not require selected periods for every period policy.
- Do not validate actual timetable period existence in ATT-POL-2B unless the implementation remains isolated and tests can cover cross-school access safely.
- Do not alter existing sessions when they are returned idempotently.

Validation location:

- Keep structural validation in policy create/update.
- Apply selected-period membership validation in roll-call resolve before creating a new period session.
- Apply strict timetable existence validation in a later sprint if product confirms the storage contract and fixture coverage is ready.

## 12. Notifications Decision

Persisted notification-related policy fields:

- `notifyTeachers`
- `notifyStudents`
- `notifyGuardiansOnAbsence`
- `notifyOnLate`
- `notifyOnEarlyLeave`

Communication infrastructure reality:

- Communication notification storage, queueing, in-app delivery, and push delivery infrastructure exists.
- Notification source modules include `ATTENDANCE`.
- Notification types include attendance absence and attendance late.
- Current notification generation service handles announcements and messages, not attendance events.
- Notification preferences currently cover message and announcement categories; attendance-specific preferences/audience semantics are not established.
- There is no attendance-specific notification event publisher wired to session submit, correction, resubmit, or derived recomputation.

Decision:

Do not emit attendance notifications in ATT-POL-2B. Defer notification dispatch to ATT-POL-2C.

Future ATT-POL-2C event points should be considered:

- After a session submit creates notifiable submitted incidents.
- After a submitted correction changes an entry into or out of a notifiable incident status.
- After future derived daily computation creates or changes a notifiable absence, if derived computation is ever implemented.

Future ATT-POL-2C duplicate-prevention rules:

- Use deterministic source module, source type, source id, recipient, and notification type.
- Avoid duplicate notifications on resubmit, unsubmit/reopen, correction, or recomputation.
- Do not expose notification internals through attendance responses.

Future audience rules needed:

- Teacher recipient rules for affected class/period ownership.
- Student recipient rules for the affected student user.
- Guardian recipient rules for linked guardians only.
- School-scoped membership checks for every recipient.

## 13. App-facing Impact

Teacher App:

- Teacher App attendance is an adapter over core Attendance.
- Route base remains `/api/v1/teacher/classroom/:classId/attendance`.
- `classId` means `TeacherSubjectAllocation.id`.
- Teacher App writes are DAILY classroom writes only.
- Teacher App write statuses are `present`, `absent`, `late`, and `excused`.
- Teacher App reads can show `early_leave` and `unmarked`.
- Teacher App does not persist late minutes, arrival time, dismissal time, or early-leave writes today.

ATT-POL-2B selected-period gating should not affect Teacher App because Teacher App writes resolve DAILY sessions. Threshold or derived daily behavior would affect Teacher App read summaries if implemented, so those behaviors must remain deferred.

Parent App:

- No direct parent attendance write surface was found.
- Parent behavior/progress/reports/discipline reads consume submitted attendance entry counts.
- Automatic status mutation or derived daily sessions would alter parent summaries and discipline reads.
- ATT-POL-2B should keep parent-facing behavior unchanged.

Student App:

- No direct student attendance write surface was found.
- Student behavior/progress/discipline reads consume submitted attendance entry counts.
- Automatic status mutation or derived daily sessions would alter student summaries and discipline reads.
- ATT-POL-2B should keep student-facing behavior unchanged.

Dashboard/Admin:

- Dashboard summary and alerts count submitted/draft sessions and attendance entry statuses.
- Core Attendance reports aggregate submitted entries.
- Automatic rule application would alter dashboard and report semantics.
- Selected-period gating only affects creation of new period sessions under policies that explicitly configure selected periods.

Route contracts:

- Do not rename routes.
- Do not move policy routes.
- Do not add aliases in ATT-POL-2B.
- Keep all runtime routes under `/api/v1`.

Tests needed before broader rule application:

- Report count preservation tests.
- Parent/student discipline summary preservation tests.
- Teacher App read/write preservation tests.
- Dashboard summary/alerts preservation tests.
- Roll-call submitted/unsubmitted lifecycle tests for any future derived computation.

## 14. Security / No-leak Impact

Current access model:

- Attendance policies and sessions are school-scoped.
- Runtime queries use scoped repository patterns and request context.
- Roll-call creation and mutation use school-scoped academic context and term write checks.
- Teacher App access is allocation-scoped through teacher ownership checks.
- Parent App access is linked-child scoped.
- Student App access is current-student scoped.

ATT-POL-2B selected-period gating security requirements:

- Validate against the effective policy selected under the current request school scope.
- Do not allow a period id from another school to grant access or create a valid session.
- If strict timetable existence validation is added later, it must be school-scoped and tested for cross-school rejection.

No-leak fields that must not be exposed by new policy/rule responses:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- internal actor/user ids
- guardian or studentGuardian ids
- `enrollmentId` unless already approved for that route contract
- raw Prisma payloads
- notification internals

Allowed dashboard/core policy contract ids remain:

- policy `id`
- `academicYearId` / `yearId`
- `termId`
- accepted scope ids
- `selectedPeriodIds`
- policy setting values

## 15. Recommended ATT-POL-2B Implementation Plan

Recommended scope:

Implement conservative selected-period rule gating for new PERIOD roll-call session creation only. Do not implement automatic status mutation, auto absent, derived daily computation, notification dispatch, timetable existence validation, route changes, or app-facing contract changes.

Migration: no.

Likely files to change in ATT-POL-2B:

- `src/modules/attendance/roll-call/infrastructure/attendance-roll-call.repository.ts`
- `src/modules/attendance/roll-call/application/resolve-roll-call-session.use-case.ts`
- `src/modules/attendance/roll-call/application/roll-call-use-case.helpers.ts`
- New small domain/application helper, for example `src/modules/attendance/roll-call/domain/policy-period-selection.ts` or `src/modules/attendance/policies/domain/policy-rule-application.ts`
- Focused roll-call/policy unit tests under the existing attendance test structure
- `test/e2e/attendance-foundation.e2e-spec.ts`
- `test/security/tenancy.attendance.spec.ts` only if the implementation adds timetable existence lookup or any cross-school-sensitive path beyond current scoped policy resolution

Repository change:

- Expand effective policy candidate selection used by roll-call to include `selectedPeriodIds`.
- Keep the existing effective policy priority and policy id link behavior.
- Do not select or expose raw tenant fields.

Algorithm:

1. Resolve or find existing roll-call session exactly as today.
2. If an existing session is found, return it without revalidating selected periods.
3. For a new session, resolve the effective policy exactly as today.
4. If no effective policy exists, allow current behavior.
5. If mode is `DAILY`, allow current behavior.
6. If mode is `PERIOD` and effective policy `selectedPeriodIds` is empty, allow current behavior.
7. If mode is `PERIOD` and effective policy `selectedPeriodIds` is non-empty:
   - require `periodId` in the resolve request
   - trim/normalize the provided `periodId` consistently with existing request handling
   - require the normalized `periodId` to be included in `selectedPeriodIds`
   - reject with a stable attendance validation/domain error if it is missing or not allowed
8. Create the session with the existing create data and `policyId`.
9. Do not mutate entries or derive daily sessions.

Validation behavior:

- Policy create/update structural validation remains as implemented in ATT-POL-1.
- Roll-call selected-period validation is conditional and backward-compatible.
- No timetable existence validation in ATT-POL-2B unless it is isolated, school-scoped, and covered by tests.
- No threshold-based validation in ATT-POL-2B beyond preserving existing submitted correction rules.

Idempotency and recompute rules:

- Existing session lookup remains first.
- Existing sessions are not revalidated or modified when policy settings change later.
- New selected-period gating applies only to creation of a new PERIOD session.
- No historical sessions are retroactively changed.
- No recomputation is introduced.

Tests to add/update:

- Unit: effective policy selection still stores `policyId` on new sessions.
- Unit: PERIOD session with empty selectedPeriodIds preserves legacy behavior.
- Unit: PERIOD session with selectedPeriodIds requires `periodId`.
- Unit: PERIOD session with selectedPeriodIds accepts an allowed `periodId`.
- Unit: PERIOD session with selectedPeriodIds rejects a disallowed `periodId`.
- Unit: DAILY session ignores selectedPeriodIds.
- Unit: existing session is returned idempotently even if current policy selectedPeriodIds would not allow the request.
- Unit: late/early/autoAbsent thresholds do not mutate entry statuses in ATT-POL-2B.
- E2E: create a policy with selected periods, resolve a period session with an allowed period, and verify response/session retains `policyId`.
- E2E: disallowed period under selected-period policy is rejected without creating a session.
- E2E: existing attendance foundation flow still passes.
- Security: add cross-school selected-period/timetable validation test only if ATT-POL-2B performs timetable lookup. Otherwise, current policy/session tenancy tests are enough.

Risk mitigations:

- Do not revalidate existing sessions.
- Do not require selectedPeriodIds for all PERIOD policies.
- Do not reinterpret `periodKey`.
- Do not modify Teacher App adapter behavior.
- Do not add response warnings unless a contract is explicitly approved.
- Keep selected-period validation in the core Attendance application/domain layer, not in controllers.

## 16. Deferred Items

Deferred to a later sprint:

- Automatic `PRESENT` to `LATE` conversion.
- Automatic `PRESENT` to `EARLY_LEAVE` conversion.
- Rejection/warning contract for threshold/status inconsistencies.
- `autoAbsentAfterMinutes` runtime application.
- Derived daily attendance from periods.
- Persisted derived daily sessions.
- Report-only derived daily attendance.
- Strict timetable period existence validation.
- Attendance notification dispatch.
- Attendance notification preference/audience design.
- Teacher App period attendance writes.
- Teacher App late minutes, early leave, excuse reason, unsubmit, and correction write authority.
- Dashboard Discipline KPI and combined discipline score formulas.
- Parent/Student app changes driven by derived attendance semantics.

## 17. Verification Evidence

Documentation-only verification status:

- `git status --short --untracked-files=all`: PASS
  - Output: `?? docs/sprint-att-pol-2a-attendance-policy-rule-application-reality-audit.md`
- `git diff --name-only`: PASS
  - Output: no output because the only change is the untracked documentation file.
- `git diff --stat`: PASS
  - Output: no output because the only change is the untracked documentation file.
- `git diff --check`: PASS
  - Output: no output.
- `npm run build`: NOT_RUN - optional, not needed for documentation-only audit
- `npm run test -- attendance --runInBand`: NOT_RUN - optional, not needed for documentation-only audit

## 18. Final Verdict

READY_FOR_ATT_POL_2B_IMPLEMENTATION

This verdict applies to a conservative ATT-POL-2B only: selected-period gating for new PERIOD roll-call session creation, using the persisted effective policy link and preserving all existing session, entry, report, app-facing, and notification behavior.

Broader policy rule application is not ready for ATT-POL-2B. Automatic threshold mutation, auto absent, derived daily attendance, and notification dispatch require separate product/runtime decisions and dedicated compatibility tests before implementation.
