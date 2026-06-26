# ATT-POL-2G - Derived Daily / Missed Periods Reality Audit

## 1. Title and status

Sprint: ATT-POL-2G - Derived Daily / Missed Periods Reality Audit.

Status: documentation-only audit complete.

Final verdict: READY_FOR_ATT_POL_2H_IMPLEMENTATION.

This audit locks a conservative implementation decision for ATT-POL-2H: implement report-only derived daily absence computation in a new isolated attendance reports read surface. Do not persist derived DAILY sessions, do not change existing reports/apps/dashboard/discipline semantics, and do not mutate historical attendance.

## 2. Baseline

Baseline commit: `d32b7b6 fix: normalize attendance thresholds on draft save`.

Starting worktree state: clean before this audit file was created.

## 3. Scope and non-goals

Scope:

- Audit current AttendanceSession, AttendanceEntry, AttendancePolicy, reports, absences, dashboard, teacher app, parent app, student app, discipline, communication, and test surfaces relevant to derived daily attendance.
- Decide safe V1 semantics for `dailyComputationStrategy = DERIVED_FROM_PERIODS`.
- Decide safe V1 semantics for `absentIfMissedPeriodsCount`.
- Produce an exact ATT-POL-2H implementation plan.
- Create this documentation file only.

Non-goals:

- No runtime behavior changes.
- No source code changes.
- No Prisma schema changes.
- No migrations.
- No test changes.
- No package or lockfile changes.
- No commits.
- No persisted derived DAILY sessions.
- No report blending into existing summary/trend/breakdown endpoints.
- No Teacher App, Parent App, Student App, Dashboard, Discipline, or Communication behavior changes.
- No auto absent behavior.
- No notification dispatch.
- No historical recompute/backfill.
- No policy snapshotting.

## 4. Sources reviewed

Required source documents were present. No listed source document was missing.

Required project and architecture sources:

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

Prior attendance policy sprint sources:

- `docs/sprint-att-pol-1-attendance-policy-contract-persistence-repair-closeout.md`
- `docs/sprint-att-pol-2a-attendance-policy-rule-application-reality-audit.md`
- `docs/sprint-att-pol-2b-selected-period-roll-call-gating-closeout.md`
- `docs/sprint-att-pol-2c-timetable-period-validation-reality-audit.md`
- `docs/sprint-att-pol-2d-timetable-period-existence-validation-closeout.md`
- `docs/sprint-att-pol-2e-threshold-semantics-reality-audit.md`
- `docs/sprint-att-pol-2f-attendance-threshold-runtime-closeout.md`

Runtime sources inspected:

- `prisma/schema.prisma`
- `src/modules/attendance/policies/**`
- `src/modules/attendance/roll-call/**`
- `src/modules/attendance/absences/**`
- `src/modules/attendance/reports/**`
- `src/modules/academics/timetable/**`
- `src/modules/dashboard/infrastructure/dashboard-summary.repository.ts`
- `src/modules/dashboard/infrastructure/dashboard-alerts.repository.ts`
- `src/modules/discipline/infrastructure/discipline-derived.repository.ts`
- `src/modules/teacher-app/classroom/attendance/**`
- `src/modules/teacher-app/shared/infrastructure/teacher-app-composition-read.adapter.ts`
- `src/modules/parent-app/progress/infrastructure/parent-progress-read.adapter.ts`
- `src/modules/parent-app/behavior/infrastructure/parent-behavior-read.adapter.ts`
- `src/modules/student-app/progress/infrastructure/student-progress-read.adapter.ts`
- `src/modules/student-app/behavior/infrastructure/student-behavior-read.adapter.ts`
- `src/modules/communication/**`

Test sources inspected:

- `test/e2e/attendance-foundation.e2e-spec.ts`
- `test/e2e/attendance-excuses-corrections.e2e-spec.ts`
- `test/security/tenancy.attendance.spec.ts`
- `src/modules/attendance/policies/tests/**`
- `src/modules/attendance/roll-call/tests/**`
- `src/modules/attendance/absences/tests/**`
- `src/modules/attendance/reports/tests/**`
- `src/modules/discipline/tests/discipline-derived.repository.spec.ts`
- `src/modules/teacher-app/classroom/attendance/tests/**`
- `src/modules/parent-app/**/tests/**`
- `src/modules/student-app/**/tests/**`

## 5. Current AttendanceSession model truth

Model facts:

- `AttendanceSession.mode` is `DAILY` or `PERIOD`.
- `AttendanceSession.status` is `DRAFT` or `SUBMITTED`.
- `AttendanceSession` stores `schoolId`, `academicYearId`, `termId`, `date`, `scopeType`, `scopeKey`, optional scope ids, `mode`, nullable `periodId`, required `periodKey`, optional period labels, nullable `policyId`, submission metadata, and soft-delete metadata.
- `AttendanceEntry` belongs to one session and is unique per `(schoolId, sessionId, studentId)`.
- `AttendanceEntry.status` is `PRESENT`, `ABSENT`, `LATE`, `EXCUSED`, `EARLY_LEAVE`, or `UNMARKED`.
- `AttendanceEntry.lateMinutes` and `AttendanceEntry.earlyLeaveMinutes` are nullable integers.
- The session uniqueness key is `(schoolId, academicYearId, termId, date, scopeType, scopeKey, mode, periodKey)`.

Behavior facts:

- DAILY sessions use normalized `periodKey = daily`.
- PERIOD sessions require a non-empty `periodKey`.
- DAILY and PERIOD sessions can coexist for the same school, academic year, term, date, scope type, and scope key because `mode` is part of the uniqueness key.
- Multiple PERIOD sessions can coexist for the same date/scope if their `periodKey` values differ.
- The schema does not make `periodId` part of the uniqueness key, so duplicate PERIOD sessions with the same `periodId` but different `periodKey` are structurally possible.
- `periodId` is nullable, so legacy PERIOD sessions without a timetable-backed `periodId` remain possible.
- After ATT-POL-2D, supplied PERIOD `periodId` values are timetable-validated for new session creation. However, omitted `periodId` is still allowed when legacy behavior allows it: no effective policy, or effective policy with empty `selectedPeriodIds`.
- New sessions store the resolved effective `policyId`. Existing sessions are returned by idempotent lookup before policy re-resolution or selected-period/timetable validation.

Current read behavior:

- Attendance reports query submitted sessions and entries. They support optional `mode` and `periodKey` filters, but default to all submitted modes.
- Absence incident lists and summaries query submitted entries whose status is `ABSENT`, `LATE`, `EARLY_LEAVE`, or `EXCUSED`; they do not default-filter by mode.
- Dashboard summary and alert counts query today's sessions and entries without mode filtering. The absent/late entry counts use today's session context and do not restrict to submitted sessions.
- Parent and Student progress/behavior adapters group submitted attendance entries by status and do not filter by mode.
- Discipline timelines query submitted attendance incidents and do not filter by mode.
- Teacher App classroom attendance resolves and writes DAILY sessions only through the core roll-call use-cases.

Implications:

- Existing core reports can already mix DAILY and PERIOD entries unless callers provide `mode`.
- Existing absence, dashboard, parent/student, and discipline reads would be affected if derived DAILY rows were persisted or merged into their current queries.
- Any ATT-POL-2H implementation must avoid silently adding derived DAILY results to existing raw-entry aggregates.

## 6. Current dailyComputationStrategy truth

Enum values:

- `MANUAL`
- `DERIVED_FROM_PERIODS`

Persistence and defaults:

- `AttendancePolicy.dailyComputationStrategy` is persisted.
- The default is `MANUAL`.
- Policy create/update mapping persists the value.
- Policy presenter returns the value.
- Policy unit and E2E tests cover the advanced policy contract.

Validation:

- `validateAdvancedPolicyContractConfig` rejects `DERIVED_FROM_PERIODS` unless both conditions are true:
  - `selectedPeriodIds` is non-empty.
  - `absentIfMissedPeriodsCount` is not `null`.
- ATT-POL-2D validates non-empty `selectedPeriodIds` against real school-scoped timetable periods in the policy academic year and term.

Runtime impact today:

- No roll-call use-case derives DAILY attendance from PERIOD sessions.
- No submit path computes DAILY attendance.
- No report path computes derived DAILY attendance.
- No absence path computes derived DAILY incidents.
- No dashboard, parent app, student app, teacher app, discipline, or communication path consumes `dailyComputationStrategy`.

Manual daily assumption:

- Existing Teacher App attendance writes DAILY sessions.
- Existing attendance reports, absences, parent/student summaries, and discipline timelines treat submitted entries as the source material and do not distinguish manual DAILY from possible future derived DAILY rows.
- The codebase currently assumes DAILY sessions are real session records, not virtual computation results.

## 7. Current absentIfMissedPeriodsCount truth

Persistence and contract:

- `AttendancePolicy.absentIfMissedPeriodsCount` is nullable.
- It is persisted, selected, mapped, and returned by policy APIs.
- It is structurally validated as a non-negative integer when supplied.
- For `DERIVED_FROM_PERIODS`, it is required by policy validation.

Runtime impact today:

- No use-case reads `absentIfMissedPeriodsCount` to compute entry status.
- No report reads it to derive daily absence.
- No absence or dashboard query reads it.
- No notification path reads it.

Can it be applied without schema changes?

- It can support a report-only read model without schema changes.
- It cannot safely support persisted derived DAILY rows without additional design, because the current schema has no source/provenance field that distinguishes manual DAILY rows from derived DAILY rows.

## 8. Missed-period status semantics

Decision for ATT-POL-2H:

- Count only submitted PERIOD sessions.
- Count only entries attached to sessions whose `periodId` is in the linked policy's `selectedPeriodIds`.
- Count a selected period as missed when the relevant entry status is `ABSENT`.
- Do not count `PRESENT` as missed.
- Do not count `LATE` as missed by default.
- Do not count `EARLY_LEAVE` as missed by default.
- Do not count `EXCUSED` as an unexcused missed period in V1.
- Do not count `UNMARKED` as missed unless a separate incomplete-session rule is approved later.
- Do not count DRAFT sessions.

Status table:

| Status | Missed for ATT-POL-2H | Attendance interpretation | Rationale |
| --- | --- | --- | --- |
| `PRESENT` | No | Attended | Explicit attendance. |
| `LATE` | No | Attended with incident | Threshold sprint treats late as incident, not missed period. |
| `EARLY_LEAVE` | No | Attended with incident | Early leave is an incident, not full missed period by default. |
| `ABSENT` | Yes | Missed | This is the only safe unexcused missed-period signal currently present. |
| `EXCUSED` | No | Excused incident | Do not convert excused absence into unexcused daily absence without product decision. |
| `UNMARKED` | No | Incomplete/no mark | Counting it would punish incomplete draft/data workflows. |

Submitted vs draft:

- Only `SUBMITTED` PERIOD sessions count.
- DRAFT sessions are excluded even if they already contain `ABSENT` entries.
- Unsubmitting a PERIOD session removes it from report-only derived computation because it is no longer submitted.

Duplicate period evidence:

- Because `periodId` is not unique per date/scope, ATT-POL-2H should count distinct selected `periodId` values, not raw entries or sessions.
- If multiple submitted entries exist for the same student/date/policy/periodId, use the most recently updated entry as the deterministic evidence for that period. This keeps the computation idempotent and lets submitted corrections affect read-time derivation without persisted recompute.

## 9. Selected-period boundary

Decision:

- Missed-period derivation must count only PERIOD sessions whose `periodId` is listed in the linked policy's `selectedPeriodIds`.
- PERIOD sessions outside `selectedPeriodIds` must not affect derived daily absence.
- PERIOD sessions with `periodId = null` must not affect derived daily absence.
- Sessions without a linked `policyId` must not be included in derived daily computation.
- Sessions linked to policies whose current `dailyComputationStrategy` is not `DERIVED_FROM_PERIODS` must not be included.
- Sessions linked to policies whose current selected periods or missed-period threshold are incomplete must be skipped rather than causing existing report reads to fail.

Empty selected periods:

- Policy create/update validation now rejects `DERIVED_FROM_PERIODS` with empty `selectedPeriodIds`.
- Old or manually seeded invalid data may still exist.
- ATT-POL-2H should not infer "all periods" from an empty selection. Empty selected periods means "not derivable".

Policy changes after sessions exist:

- Current sessions store `policyId`, but they do not snapshot the policy's selected periods or missed-period threshold.
- ATT-POL-2H should not re-resolve the currently effective policy by date/scope.
- ATT-POL-2H should use the session-linked policy record, matching the ATT-POL-2F threshold lookup pattern.
- Because policy settings are live records, historical derived report output may change if the linked policy is edited later. That risk is acceptable only for report-only analytics and must be documented in the response/closeout.
- Policy snapshotting remains deferred.

## 10. Timetable validation boundary

Current validation:

- ATT-POL-2D validates `AttendancePolicy.selectedPeriodIds` against `TimetablePeriod.id` values.
- The validation is school-scoped and requires the same academic year and term through the period's `TimetableConfig`.
- Timetable config status `DRAFT` or `ACTIVE` is allowed.
- Timetable config status `ARCHIVED` is rejected.
- Roll-call validates a supplied `periodId` for new PERIOD sessions in the same school, academic year, and term.

Decision for ATT-POL-2H:

- Reuse the existing contract: `selectedPeriodIds` means `TimetablePeriod.id`.
- Do not add same-timetable-config validation.
- Do not add same timetable scope/classroom/section/grade/stage validation.
- Do not require timetable entries.
- Do not require publication status.
- Do not re-query timetable periods during derived report computation unless ATT-POL-2H needs a display label.
- Trust persisted policy/session validation for new data, and skip non-derivable legacy rows defensively.

Reason:

- The current timetable period validation is enough to protect tenancy and academic context.
- Adding entry/scope/publication checks would broaden the sprint into timetable schedule semantics, which ATT-POL-2D explicitly deferred.

## 11. Persisted derived DAILY option evaluation

Option: create or update DAILY `AttendanceSession` and `AttendanceEntry` rows from PERIOD sessions.

Evaluation:

- Migration impact: likely required for provenance/source tracking.
- Manual DAILY conflict risk: high. The uniqueness key allows only one DAILY session per date/scope/periodKey, and manual Teacher App/core DAILY sessions already use `periodKey = daily`.
- Source ambiguity: high. The current schema cannot distinguish manual entries from derived entries.
- Idempotency: complex. Derivation would need deterministic create/update behavior across multiple submitted PERIOD sessions.
- Corrections: complex. Correcting a submitted PERIOD entry would need to update or invalidate derived DAILY rows.
- Unsubmit/resubmit: complex. Unsubmitting a PERIOD session would need to remove or recompute derived DAILY rows.
- Policy changes: unsafe without policy snapshotting or historical recompute rules.
- Auditability: insufficient. Creating/changing derived attendance rows should be auditable and distinguishable from manual teacher/admin actions.
- Notifications: high duplicate risk. Persisted derived ABSENT rows could later trigger absence notifications unless notification source semantics are added.
- App-facing impact: high. Existing dashboard, parent/student, discipline, reports, and absences would read the new rows unless every query is updated to understand source.

Decision:

- Do not implement persisted derived DAILY sessions in ATT-POL-2H.
- This option should require a separate schema/audit/provenance design if product later wants derived results to become source-of-truth attendance records.

## 12. Report-only derived daily option evaluation

Option: compute derived daily absence at read time without creating sessions or entries.

Evaluation:

- Migration impact: none expected.
- Historical mutation: none.
- Manual DAILY conflict risk: none if kept separate from existing raw-session reports.
- Idempotency: natural, because repeated reads compute from current submitted PERIOD data.
- Corrections: submitted corrections are reflected on next read if computation uses entry status/updatedAt.
- Unsubmit/resubmit: reflected on next read because only submitted PERIOD sessions are included.
- Policy changes: output can change because policies are not snapshotted, but no stored history is mutated.
- Notifications: none in ATT-POL-2H.
- App-facing impact: safe only if isolated from existing Teacher/Parent/Student/Dashboard/Discipline surfaces.
- Testability: good if implemented as a pure domain/service computation over repository records.

Decision:

- Recommend this option for ATT-POL-2H.
- Keep it isolated as a new attendance report read surface for derived daily absences.
- Do not merge derived results into existing summary, daily-trend, scope-breakdown, absences, dashboard, parent/student, teacher, or discipline endpoints in ATT-POL-2H.

## 13. Submit-time derivation option evaluation

Option: derive daily attendance whenever a PERIOD session is submitted.

Evaluation:

- Submit complexity: high. Submit currently only flips session state and writes an audit log.
- Completeness ambiguity: high. A single selected period may be submitted before other selected periods have been marked.
- Recompute ambiguity: high. Every later submit, unsubmit, resubmit, or correction could change the daily result.
- Transaction boundary: broader than current submit behavior because it must read sibling sessions for the same date/scope/student/policy.
- Client surprise: high. Submitting one PERIOD session could create or alter a DAILY attendance result elsewhere.
- App-facing impact: high if persisted rows are created or existing summaries change.

Decision:

- Do not implement submit-time derivation in ATT-POL-2H.

## 14. Manual trigger option evaluation

Option: derive daily attendance through an explicit admin/dashboard recompute/finalize action.

Evaluation:

- Route/permission impact: new mutation route and permission design would be required.
- Audit impact: required because it would create or finalize attendance outcomes.
- Idempotency/recompute: still needs a source/provenance model if persisted.
- User workflow: could be clearer than automatic submit-time derivation, but it is a product workflow rather than a narrow policy-runtime repair.
- Scope: too broad for ATT-POL-2H if persisted records are created.

Decision:

- Do not implement manual trigger derivation in ATT-POL-2H.
- Reconsider only after provenance/audit/product workflow design.

## 15. Reports/absences/dashboard impact

Current reports:

- Summary, daily trend, and scope breakdown use submitted sessions and entries.
- They default to all submitted modes unless `mode` is supplied.
- Counters treat:
  - `PRESENT` as present.
  - `ABSENT` as absence and incident.
  - `LATE` as late and incident.
  - `EARLY_LEAVE` as early leave and incident.
  - `EXCUSED` as excused and incident.
  - `UNMARKED` as unmarked, not incident.
- Attendance rate is `presentCount / totalEntries`.
- Absence rate is `absentCount / totalEntries`.
- Late rate is `lateCount / totalEntries`.

Current absences:

- Absence incident routes include submitted entries with statuses `ABSENT`, `LATE`, `EARLY_LEAVE`, and `EXCUSED`.
- They do not distinguish DAILY from PERIOD unless future filters are added.
- Adding persisted derived DAILY `ABSENT` rows would create additional absence incidents and likely duplicate period incidents.

Current dashboard:

- Dashboard summary/alerts count today's sessions and today's absent/late entries without mode filtering.
- Today absent/late counts are not restricted to submitted sessions.
- Persisted derived DAILY rows or automatic merges would affect dashboard cards immediately.

Impact decision:

- ATT-POL-2H must not change existing report/absence/dashboard calculations.
- ATT-POL-2H should add a new derived daily absence report surface and keep existing report endpoints unchanged.
- Later sprints may choose to merge derived daily into summary/rate cards only after product accepts double-count and precedence semantics.

## 16. Teacher App impact

Current Teacher App behavior:

- Teacher classroom attendance resolves DAILY sessions through core roll-call.
- Teacher App entry updates send only `studentId`, status mapped to core status, and optional note.
- Teacher App supports `present`, `absent`, `late`, and `excused` writes.
- Teacher App does not send `lateMinutes` or `earlyLeaveMinutes`.
- Teacher App does not create PERIOD sessions.
- Teacher App read/presenter paths can display core `EARLY_LEAVE` if present, but the Teacher App write DTO does not create early-leave entries.

Impact decision:

- ATT-POL-2H should not change Teacher App writes or reads.
- Derived daily report-only computation must not create DAILY sessions that Teacher App later sees as manual class attendance.
- Teacher App regression tests should still run in the implementation sprint if selectors are available, but no Teacher App code should change.

## 17. Parent/Student App impact

Current Parent App and Student App behavior:

- Progress and behavior adapters group submitted attendance entries by status.
- They count `PRESENT`, `ABSENT`, and `LATE`.
- They do not filter attendance by mode.
- They do not compute derived daily attendance.

Impact decision:

- ATT-POL-2H should not change parent/student app reads.
- Do not merge derived daily absence into parent/student attendance counts in ATT-POL-2H.
- Parent/student derived daily exposure should require a separate contract decision because it changes family-facing absence counts.

## 18. Discipline impact

Current discipline behavior:

- Discipline derived timeline reads submitted attendance entries whose status is `ABSENT`, `LATE`, `EARLY_LEAVE`, or `EXCUSED`.
- It maps attendance entries into discipline timeline items.
- It counts attendance incidents separately from behavior records.
- It does not filter by attendance mode.

Impact decision:

- ATT-POL-2H should not feed derived daily absence into discipline.
- Persisted derived DAILY absence would risk duplicate discipline incidents if period ABSENT incidents already exist.
- Discipline integration should be deferred until product decides whether period incidents, derived daily incidents, or both should appear in discipline timelines.

## 19. Notifications boundary

Current communication support:

- Communication notification DTO/domain includes categories/types for attendance and attendance absence/late.
- Attendance policy notification flags are persisted, but Attendance runtime does not dispatch policy-driven notifications for derived daily absence.

Decision:

- ATT-POL-2H must emit no notifications.
- Derived daily report-only results are read-model data, not notifiable events.
- Future notification work should use explicit event points after a durable attendance status change or an approved derived result finalization.
- Duplicate prevention must be designed before notifications consume derived absence results.

## 20. Error/warning behavior

Existing behavior:

- Validation errors use `ValidationDomainException` and `validation.failed`.
- Not-found cases use domain not-found behavior.
- There is no warning response envelope in Attendance reports.

Decision for ATT-POL-2H:

- The derived daily report should use existing report query validation patterns for invalid academic/scope/date filters.
- No new warning envelope should be added.
- No new ERROR_CATALOG entry is required for the report-only read model.
- Non-derivable legacy policy/session rows should be skipped or excluded from derived results, not surfaced as tenant-sensitive validation errors.
- If the new endpoint requires strict query fields, use `ValidationDomainException` with safe details only.

Safe details may include:

- `field`
- `date`
- `dateFrom`
- `dateTo`
- `scopeType`
- accepted scope ids
- `mode` if relevant

Do not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- internal actor/user ids
- raw Prisma payloads
- guardian/studentGuardian ids
- notification internals
- timetable internals not already part of an accepted contract

## 21. Backward compatibility decision

Existing policies:

- Existing `MANUAL` policies remain unchanged.
- Existing valid `DERIVED_FROM_PERIODS` policies remain stored and returned.
- Existing invalid/manual-seeded `DERIVED_FROM_PERIODS` policies should not break existing reads; report-only derivation should simply not produce rows for policies without selected periods or missed-period count.

Existing sessions and entries:

- No existing sessions are mutated.
- Existing DAILY sessions remain manual/source records.
- Existing PERIOD sessions remain independent period records.
- Existing submitted corrections remain the only way to alter submitted entry statuses.
- Existing unsubmit/resubmit semantics remain unchanged.

Historical recompute:

- No backfill.
- No recompute job.
- No persisted derived history.
- Report-only output reflects current submitted PERIOD entries and current linked policy settings at read time.

Policy snapshotting:

- Not present today.
- Not required for report-only ATT-POL-2H.
- Required before persisted historical derived attendance should be considered source-of-truth.

Double-count protection:

- Do not add derived rows to existing reports or absences.
- Do not change existing `mode` default behavior.
- Do not change existing app-facing counts.

## 22. Recommended ATT-POL-2H implementation plan

Recommended option: implement a report-only derived daily absence read model in Attendance Reports only.

Exact scope:

- Add a new derived daily absence report endpoint under the existing Attendance Reports controller, for example `GET /api/v1/attendance/reports/derived-daily-absences`.
- Add a new use-case dedicated to derived daily absence report computation.
- Add a repository method that reads only the minimal submitted PERIOD session/entry/policy data needed for computation.
- Add a pure domain helper that computes derived daily absence rows from repository records.
- Keep all existing endpoints and response shapes unchanged.

Exact non-goals:

- No schema/migration.
- No persisted DAILY sessions.
- No AttendanceEntry writes.
- No submit-time derivation.
- No manual recompute/finalize action.
- No absences endpoint integration.
- No dashboard integration.
- No Teacher App integration.
- No Parent App integration.
- No Student App integration.
- No Discipline integration.
- No notifications.
- No policy snapshotting.
- No auto absent.

Likely files to change in ATT-POL-2H:

- `src/modules/attendance/reports/controller/attendance-reports.controller.ts`
- `src/modules/attendance/reports/dto/attendance-reports.dto.ts`
- `src/modules/attendance/reports/reports.module.ts`
- `src/modules/attendance/reports/application/get-derived-daily-absences-report.use-case.ts`
- `src/modules/attendance/reports/domain/derived-daily-attendance.ts`
- `src/modules/attendance/reports/infrastructure/attendance-reports.repository.ts`
- `src/modules/attendance/reports/presenters/attendance-reports.presenter.ts`
- `src/modules/attendance/reports/tests/attendance-reports.use-case.spec.ts` or a new focused derived-daily spec
- `test/e2e/attendance-foundation.e2e-spec.ts` or a new focused attendance reports E2E if the suite pattern supports it
- `test/security/tenancy.attendance.spec.ts`
- `docs/sprint-att-pol-2h-derived-daily-report-only-closeout.md`

Schema/migration:

- No.

Recommended repository query:

- Query submitted PERIOD attendance entries under the active school scope.
- Filter sessions by requested academic year, term, date/date range, and optional scope filters using existing report filter helpers.
- Require `session.status = SUBMITTED`.
- Require `session.deletedAt = null`.
- Require `session.mode = PERIOD`.
- Require `session.periodId != null`.
- Require `session.policyId != null`.
- Select minimal fields:
  - session `id`, `date`, `scopeType`, `scopeKey`, scope ids, `periodId`, `periodKey`, `policyId`, `updatedAt`, `submittedAt`
  - entry `id`, `studentId`, `enrollmentId`, `status`, `updatedAt`
  - linked policy `id`, `dailyComputationStrategy`, `selectedPeriodIds`, `absentIfMissedPeriodsCount`, `updatedAt`
  - minimal student/enrollment display fields already accepted by attendance reports if the response needs display names
- Do not select tenant/internal fields for presentation.

Computation algorithm:

1. Start from submitted PERIOD entries only.
2. Ignore entries whose session has no `periodId`.
3. Ignore entries whose session has no linked policy.
4. Ignore entries whose linked policy is not `DERIVED_FROM_PERIODS`.
5. Ignore linked policies with empty `selectedPeriodIds`.
6. Ignore linked policies with `absentIfMissedPeriodsCount = null`.
7. Ignore sessions whose `periodId` is not included in the linked policy's `selectedPeriodIds`.
8. Group evidence by `(date, scopeType, scopeKey, policyId, studentId)`.
9. Within each group, keep one evidence entry per distinct `periodId`.
10. If multiple submitted entries exist for the same `(date, scope, policyId, studentId, periodId)`, use the most recently updated entry as the evidence for that period.
11. Count missed periods where the selected evidence status is `ABSENT`.
12. If `missedPeriodCount >= absentIfMissedPeriodsCount`, emit a derived daily absence row.
13. If below threshold, emit no row. ATT-POL-2H should not fabricate derived `PRESENT` rows.
14. Include safe report fields such as date, student id/display, policy id, missedPeriodCount, requiredMissedPeriodsCount, and missedPeriodIds if the response contract accepts period ids.

Response behavior:

- New response only; existing reports unchanged.
- The response should clearly represent report-only derived absence rows, not persisted attendance sessions.
- Do not include `sessionId` for derived daily rows unless it refers to source PERIOD sessions in a clearly named source field.
- Do not expose raw Prisma payloads or tenant/internal ids.

Idempotency/recompute rules:

- Read-time computation is idempotent for the same database state.
- No rows are created or updated.
- Unsubmit removes a source PERIOD session from computation on the next read.
- Resubmit re-includes it on the next read.
- Submitted corrections affect the next read through entry status/updatedAt.
- Existing DAILY sessions are ignored by the derived report.
- Existing reports continue to show raw submitted entries.

App-facing impact:

- None for ATT-POL-2H.
- Teacher App, Parent App, Student App, Dashboard, Discipline, and Absences remain unchanged.

Security/no-leak coverage:

- Use scoped Prisma/repository access.
- Existing attendance tenancy tests remain required.
- Add security coverage proving School A cannot see School B source sessions or derived daily rows.
- Ensure response does not contain `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, internal actor ids, guardian ids, raw Prisma, or notification internals.

Verification commands for ATT-POL-2H:

- `git status --short --untracked-files=all`
- `git diff --name-only`
- `git diff --stat`
- `git diff --check`
- `npx prisma validate`
- `npm run build`
- `npm run test -- attendance --runInBand`
- `npm run test -- attendance-reports --runInBand` if selector exists
- `npm run test -- roll-call --runInBand`
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts`
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-excuses-corrections.e2e-spec.ts`
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`
- `npm run test:security -- --runInBand`

## 23. Tests required for ATT-POL-2H

Unit/domain tests:

- Computes no rows when policy is `MANUAL`.
- Computes no rows when policy is `DERIVED_FROM_PERIODS` but selected periods are empty.
- Computes no rows when `absentIfMissedPeriodsCount` is null.
- Counts only submitted PERIOD sessions.
- Ignores DRAFT PERIOD sessions.
- Ignores DAILY sessions.
- Ignores sessions without `periodId`.
- Ignores sessions whose `periodId` is outside policy `selectedPeriodIds`.
- Counts `ABSENT` as missed.
- Does not count `PRESENT` as missed.
- Does not count `LATE` as missed.
- Does not count `EARLY_LEAVE` as missed.
- Does not count `EXCUSED` as missed.
- Does not count `UNMARKED` as missed.
- Emits a derived absence row when missed count reaches threshold.
- Emits no row when missed count is below threshold.
- Counts each selected `periodId` at most once per student/date/policy/scope.
- Uses the most recently updated entry when duplicate submitted entries exist for the same selected period.

Repository/use-case tests:

- Queries submitted PERIOD entries with policy fields only.
- Preserves report filters for academic year, term, date/date range, and scope.
- Does not select tenant/internal fields for presentation.
- Handles empty datasets.
- Handles linked policy deletion/incomplete legacy policy defensively.

E2E tests:

- Create timetable periods and a `DERIVED_FROM_PERIODS` attendance policy with `selectedPeriodIds` and `absentIfMissedPeriodsCount`.
- Resolve and submit selected PERIOD sessions with ABSENT entries reaching the missed-period threshold.
- Call the derived daily absence report and verify a derived absence row is returned.
- Submit below-threshold missed periods and verify no row.
- Submit LATE/EARLY_LEAVE/EXCUSED period entries and verify they do not count as missed.
- Verify existing attendance report summary/daily-trend/scope-breakdown results remain unchanged.
- Verify existing absence incident routes remain unchanged.
- Verify DAILY roll-call behavior remains unchanged.

Security tests:

- School A cannot see School B derived daily rows.
- School A source PERIOD sessions cannot include School B policy/period evidence through scoped repository access.
- Response does not leak `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, internal actor ids, guardian ids, raw Prisma payloads, or notification internals.
- Existing `test/security/tenancy.attendance.spec.ts` remains green.

Regression tests:

- Teacher App attendance flow remains DAILY-only.
- Parent/Student progress/behavior counts remain unchanged.
- Discipline derived timeline remains unchanged.
- Dashboard summary/alerts remain unchanged.

## 24. Deferred items

Deferred beyond ATT-POL-2H:

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

## 25. Verification evidence

Documentation-only verification commands:

- `git status --short --untracked-files=all` - PASS; output:
  - `?? docs/sprint-att-pol-2g-derived-daily-missed-periods-reality-audit.md`
- `git diff --name-only` - PASS; no output because the only changed file is untracked.
- `git diff --stat` - PASS; no output because the only changed file is untracked.
- `git diff --check` - PASS; no whitespace errors reported.

Optional read-only checks:

- `npm run build` - NOT_RUN documentation-only audit; no runtime, schema, test, or package files changed.
- `npm run test -- attendance --runInBand` - NOT_RUN documentation-only audit; no runtime/test files changed.
- `npm run test -- roll-call --runInBand` - NOT_RUN documentation-only audit; no runtime/test files changed.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts` - NOT_RUN documentation-only audit; no runtime/test files changed.

Changed files:

- `docs/sprint-att-pol-2g-derived-daily-missed-periods-reality-audit.md`

No runtime/schema/migration/test/package files were intentionally changed.

## 26. Final verdict

READY_FOR_ATT_POL_2H_IMPLEMENTATION.

ATT-POL-2H should implement report-only derived daily absence computation in a new isolated Attendance Reports surface. It should count submitted selected PERIOD absences against `absentIfMissedPeriodsCount`, emit no persisted attendance rows, emit no notifications, and leave existing reports, absences, dashboard, teacher app, parent app, student app, and discipline behavior unchanged.
