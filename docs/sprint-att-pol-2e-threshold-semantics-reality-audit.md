# ATT-POL-2E - Attendance Threshold Semantics Reality Audit

## 1. Title and status

- Sprint: `ATT-POL-2E - Attendance Threshold Semantics Reality Audit`
- Sprint type: Documentation-only audit and decision-lock sprint
- Status: complete
- Final verdict: `READY_FOR_ATT_POL_2F_IMPLEMENTATION`

## 2. Baseline

- Baseline commit: `388893f fix: validate attendance timetable periods`
- Worktree before audit: clean
- Runtime changes: none
- Schema changes: none
- Migrations: none
- Tests changed: none
- Package changes: none

## 3. Scope and non-goals

Scope:

- Audit current attendance entry, roll-call, correction, absences, reports, dashboard, Teacher App, Parent App, Student App, discipline, and communication behavior.
- Decide safe semantics for `lateThresholdMinutes` and `earlyLeaveThresholdMinutes`.
- Decide whether `autoAbsentAfterMinutes`, `absentIfMissedPeriodsCount`, `DERIVED_FROM_PERIODS`, `requireExcuseReason`, and notifications belong in ATT-POL-2F.
- Produce a precise implementation plan for ATT-POL-2F.

Non-goals:

- No runtime implementation.
- No source-code edits.
- No Prisma schema edits.
- No migrations.
- No test edits.
- No package or lockfile edits.
- No commits.
- No notification dispatch.
- No automatic absence timers.
- No derived daily attendance computation.
- No historical recompute.
- No Teacher App, Parent App, Student App, Dashboard, or route contract changes.

## 4. Sources reviewed

Required documents reviewed:

- `AGENT_CONTEXT_PRIMER.md`
- `CLAUDE.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `DOMAIN_GLOSSARY.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `DIRECTORY_STRUCTURE.md`
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
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`
- `adr/School-Dashboard/sis_dashboard-attendance_backend_handoff_spec.md`
- `docs/sprint-att-pol-1-attendance-policy-contract-persistence-repair-closeout.md`
- `docs/sprint-att-pol-2a-attendance-policy-rule-application-reality-audit.md`
- `docs/sprint-att-pol-2b-selected-period-roll-call-gating-closeout.md`
- `docs/sprint-att-pol-2c-timetable-period-validation-reality-audit.md`
- `docs/sprint-att-pol-2d-timetable-period-existence-validation-closeout.md`

No listed document was missing.

Runtime and test areas inspected:

- `prisma/schema.prisma`
- `src/modules/attendance/**`
- `src/modules/attendance/roll-call/**`
- `src/modules/attendance/policies/**`
- `src/modules/attendance/absences/**`
- `src/modules/attendance/reports/**`
- `src/modules/teacher-app/**`
- `src/modules/parent-app/**`
- `src/modules/student-app/**`
- `src/modules/dashboard/**`
- `src/modules/communication/**`
- `src/modules/discipline/**`
- attendance, roll-call, absences, reports, teacher-app, parent-app, student-app, dashboard, communication, and discipline tests by targeted source inspection

## 5. Current entry/status truth

Data model:

- `AttendanceEntry.status` is an enum with `PRESENT`, `ABSENT`, `LATE`, `EXCUSED`, `EARLY_LEAVE`, and `UNMARKED`.
- `AttendanceEntry.lateMinutes` and `AttendanceEntry.earlyLeaveMinutes` are nullable integer columns.
- `AttendancePolicy` persists `lateThresholdMinutes`, `earlyLeaveThresholdMinutes`, `autoAbsentAfterMinutes`, `absentIfMissedPeriodsCount`, and `dailyComputationStrategy`.
- Roll-call effective policy selection currently reads policy id, scope, selected periods, effectivity dates, and `updatedAt`; it does not read threshold fields for entry saves.

Status interpretation today:

- `PRESENT` is the only status counted as present in core reports and Parent/Student progress summaries.
- `ABSENT`, `LATE`, `EARLY_LEAVE`, and `EXCUSED` are attendance incidents in core absences, reports, and discipline-derived timeline.
- `UNMARKED` is not an incident. It is counted in core attendance reports and Teacher App summaries as unmarked.
- Core absence incident lists include `ABSENT`, `LATE`, `EARLY_LEAVE`, and `EXCUSED`.
- Core reports count all submitted entries and calculate:
  - attendance rate from `PRESENT / totalEntries`,
  - absence rate from `ABSENT / totalEntries`,
  - late rate from `LATE / totalEntries`,
  - incident count from `ABSENT + LATE + EARLY_LEAVE + EXCUSED`.
- Dashboard summary and alert cards count today's absent and late entries directly; they do not currently count early-leave cards.
- Teacher App read models support all six statuses, including `early_leave` and `unmarked`.
- Teacher App write models support only `present`, `absent`, `late`, and `excused`.
- Parent/Student progress and behavior summaries group submitted entries by status and expose present, absent, and late counts. They do not currently surface early-leave and excused counts in those summary counters.
- Discipline-derived reads treat `ABSENT`, `LATE`, `EARLY_LEAVE`, and `EXCUSED` as attendance incidents.

Minute field truth:

- Draft roll-call entry DTOs allow `lateMinutes` and `earlyLeaveMinutes` for any status as optional non-negative integers.
- Draft save stores supplied minute fields as-is.
- Presenters expose `lateMinutes`, `minutesLate`, `earlyLeaveMinutes`, and `minutesEarlyLeave`.
- Submitted correction is stricter:
  - `PRESENT` clears both minute fields and excuse reason.
  - `ABSENT` clears both minute fields and excuse reason.
  - `LATE` requires positive `lateMinutes` and clears `earlyLeaveMinutes`.
  - `EARLY_LEAVE` requires positive `earlyLeaveMinutes` and clears `lateMinutes`.
  - `EXCUSED` can preserve or accept minute fields and supplies an excuse reason fallback.
- Excuse request validation also requires positive minutes for LATE and EARLY_LEAVE excuse request types.

## 6. Draft save behavior

Current behavior:

- Draft saves use `SaveRollCallEntriesUseCase`.
- Targeted entry upsert delegates to the same save path through `UpsertRollCallEntryUseCase`.
- Accepted fields are `studentId`, optional `enrollmentId`, `status`, optional `lateMinutes`, optional `earlyLeaveMinutes`, optional `excuseReason`, and optional `note`.
- `lateMinutes` and `earlyLeaveMinutes` are accepted as integers `>= 0`.
- `PRESENT` with `lateMinutes > 0` is allowed.
- `PRESENT` with `earlyLeaveMinutes > 0` is allowed.
- `LATE` without `lateMinutes` is allowed.
- `EARLY_LEAVE` without `earlyLeaveMinutes` is allowed in core draft saves.
- Draft save does not normalize status/minutes.
- Draft save does not reject inconsistent combinations.
- A current roll-call unit test explicitly asserts that policy thresholds are not applied when saving draft entries.

What stricter draft save could break:

- Teacher App writes `late` without minutes because its current write DTO has no `lateMinutes` field and its adapter maps only status and note into core roll-call.
- Existing core Dashboard clients may already send status/minute combinations independently.
- Dashboard cards count today's entries regardless of submitted status, so draft-time mutation can affect dashboard cards before submit.
- Tests and fixtures currently rely on permissive draft save behavior.

## 7. Submit behavior

Current behavior:

- Submit uses `SubmitRollCallSessionUseCase`.
- It loads the session, checks term writability, verifies the session is `DRAFT`, updates session status to `SUBMITTED`, sets `submittedAt` and `submittedById`, and writes an audit log for session submission.
- Submit does not validate entry status/minute consistency.
- Submit does not normalize entries.
- Submit does not derive `LATE` or `EARLY_LEAVE` from minute values.
- Submit does not create separate absence/report rows. Absences and reports are derived from submitted entries at read time.

Submit-time mutation evaluation:

- It would avoid changing draft data before final submission.
- It would surprise clients because a saved draft response could show `PRESENT`, then submit response/read surfaces could show `LATE` or `EARLY_LEAVE`.
- It would require mutating entries during a session submission flow whose audit log currently records only session metadata.
- It would immediately affect Parent App, Student App, reports, absences, discipline, and dashboard submitted-session semantics.
- It would make unsubmit/resubmit semantics ambiguous: should thresholds reapply every resubmit or only once?

Submit-time threshold mutation is not recommended for ATT-POL-2F.

## 8. Correction behavior

Current behavior:

- Submitted entries are corrected through `CorrectAttendanceEntryUseCase`.
- Corrections require the session to be `SUBMITTED`.
- Corrections reject `UNMARKED`.
- `LATE` corrections require positive `lateMinutes`.
- `EARLY_LEAVE` corrections require positive `earlyLeaveMinutes`.
- `PRESENT` and `ABSENT` corrections clear incident minute fields.
- Corrections write explicit audit logs with before/after entry state and correction reason.

Decision:

- Corrections should continue to honor the explicit status selected by the user.
- ATT-POL-2F should not apply threshold auto-conversion to corrections.
- Corrections are already the user-audited override path for submitted data. Thresholds should not silently override that explicit correction intent.

## 9. Teacher App impact

Current Teacher App behavior:

- Teacher App attendance is adapter-backed on top of core roll-call use-cases.
- It resolves DAILY classroom sessions through core roll-call.
- It updates entries through core `SaveRollCallEntriesUseCase`.
- It submits through core `SubmitRollCallSessionUseCase`.
- Teacher App write statuses are `present`, `absent`, `late`, and `excused`.
- Teacher App does not currently write `lateMinutes`.
- Teacher App does not currently write `earlyLeaveMinutes`.
- Teacher App does not currently write `early_leave`.
- Teacher App read surfaces can display `early_leave`, `unmarked`, and minute fields if core entries contain them.

Impact decision:

- ATT-POL-2F must preserve Teacher App write behavior.
- ATT-POL-2F must not reject Teacher App `late` writes merely because no minutes are present.
- ATT-POL-2F should avoid Teacher App DTO or route changes.
- Draft-save threshold normalization is safe for Teacher App only if it triggers exclusively from explicit minute fields, because Teacher App currently sends no minute fields.

## 10. Parent/Student App impact

Current Parent/Student behavior:

- Parent and Student progress/behavior read models consume submitted attendance entries.
- Present counts use `PRESENT`.
- Absence counts use `ABSENT`.
- Lateness counts use `LATE`.
- Early-leave and excused values are not included in those summary counters, though discipline-derived surfaces can expose them as incidents.

Impact decision:

- Any conversion from `PRESENT` to `LATE` lowers present counts and raises lateness counts after submission.
- Any conversion from `PRESENT` to `EARLY_LEAVE` lowers present counts and can affect core reports/discipline, even if some Parent/Student summary counters do not expose early-leave.
- Submit-time mutation would be most surprising to these app surfaces.
- Draft-save normalization is less surprising because the saved entry response immediately reflects the normalized status before submission.
- ATT-POL-2F should add tests around Parent/Student progress/behavior only if it changes submitted semantics beyond draft-save normalization. If ATT-POL-2F is scoped to draft save, focused core E2E plus existing Parent/Student regressions are sufficient.

## 11. Dashboard/reports/absences impact

Current behavior:

- Core reports read submitted sessions and entries.
- Core absences read submitted incidents only.
- Dashboard summary and alerts count today's sessions and entries directly.
- Dashboard absent and late cards count `ABSENT` and `LATE`.
- Dashboard does not currently have an early-leave card.
- Discipline-derived timeline reads submitted attendance incidents.

Impact decision:

- Converting `PRESENT` to `LATE` changes attendance rate, late rate, incident count, dashboard late cards, Parent/Student lateness summaries, and discipline timelines once submitted.
- Converting `PRESENT` to `EARLY_LEAVE` changes attendance rate, incident count, core report early-leave count, absences incident lists, and discipline timelines once submitted.
- Draft-time conversion also affects dashboard cards that count today's draft entries.
- Reports are ready to represent `LATE` and `EARLY_LEAVE`, but they are not ready for hidden submit-time mutation because no entry-level audit accompanies submit today.

## 12. lateThresholdMinutes decision

Options evaluated:

- Option A - auto-convert during draft save:
  - Backward compatibility: moderate impact, but only on edited entries and only when a policy threshold and explicit positive `lateMinutes` are present.
  - API contract impact: response still uses existing entry shape; no envelope change.
  - Teacher App impact: low if conversion requires explicit minutes, because Teacher App does not send minutes.
  - Parent/Student impact: visible after submission, but saved draft already reflects the status.
  - Dashboard/report impact: dashboard can see draft late counts; submitted reports become consistent with saved entries.
  - Auditability: acceptable for draft edits because `markedById` and `markedAt` are updated; no submitted entry audit needed.
  - User surprise: lower than submit-time mutation because the save response shows the normalized status.
  - Test complexity: focused unit/E2E changes.
  - Implementation risk: moderate but containable.
- Option B - auto-convert during submit:
  - Higher user surprise, entry mutation during session audit, unclear unsubmit/resubmit semantics.
  - Not recommended.
- Option C - reject inconsistent combinations:
  - Breaks Teacher App `late` writes if LATE requires minutes.
  - Could break existing core clients and fixtures.
  - Not recommended as a broad rule.
- Option D - return non-blocking warnings:
  - No warning envelope currently exists.
  - Adding warnings would be a public response contract change.
  - Not recommended.
- Option E - keep stored-only:
  - Safest short-term option, but leaves a persisted contract field with no runtime effect after ATT-POL-2D.
  - Useful fallback if implementation risk rises, but not the recommended ATT-POL-2F target.

Recommended ATT-POL-2F decision:

- Implement Option A with narrow semantics.
- On draft entry save only, when the linked session policy has `lateThresholdMinutes !== null`, convert an incoming `PRESENT` entry to `LATE` if `lateMinutes` is a positive integer and `lateMinutes >= lateThresholdMinutes`.
- Do not mutate entries on submit.
- Do not mutate corrections.
- Do not require `LATE` entries to have minutes in ATT-POL-2F.
- Do not change entries whose status is already `LATE`, `ABSENT`, `EARLY_LEAVE`, `EXCUSED`, or `UNMARKED`.
- If both late and early-leave threshold rules would trigger for the same incoming `PRESENT` entry, reject the entry as ambiguous instead of choosing a hidden priority.

## 13. earlyLeaveThresholdMinutes decision

Options evaluated:

- Option A - auto-convert during draft save:
  - Backward compatibility: moderate impact, but only on edited entries and only when a policy threshold and explicit positive `earlyLeaveMinutes` are present.
  - API contract impact: response still uses existing entry shape.
  - Teacher App impact: low because Teacher App does not send early-leave minutes or write early-leave.
  - Parent/Student impact: visible after submission through reduced present counts and discipline/core reports.
  - Dashboard/report impact: core reports and absences support early leave; dashboard does not have an early-leave card today.
  - Auditability: acceptable for draft edits.
  - User surprise: lower than submit-time mutation.
  - Test complexity: focused unit/E2E changes.
  - Implementation risk: moderate but containable.
- Option B - auto-convert during submit:
  - Same submit-time surprise and audit concerns as late threshold.
  - Not recommended.
- Option C - reject inconsistent combinations:
  - Would force new minute/status consistency rules not present in draft save today.
  - Not recommended broadly.
- Option D - return non-blocking warnings:
  - Requires a new warning response contract.
  - Not recommended.
- Option E - keep stored-only:
  - Safe fallback but leaves the field inert.

Recommended ATT-POL-2F decision:

- Implement Option A with narrow semantics.
- On draft entry save only, when the linked session policy has `earlyLeaveThresholdMinutes !== null`, convert an incoming `PRESENT` entry to `EARLY_LEAVE` if `earlyLeaveMinutes` is a positive integer and `earlyLeaveMinutes >= earlyLeaveThresholdMinutes`.
- Do not mutate entries on submit.
- Do not mutate corrections.
- Do not require `EARLY_LEAVE` entries to have minutes in ATT-POL-2F.
- Do not add Teacher App early-leave write support in ATT-POL-2F.
- If both late and early-leave threshold rules trigger for the same incoming `PRESENT` entry, reject as ambiguous.

## 14. autoAbsentAfterMinutes decision

Current runtime reality:

- No attendance-specific scheduled job applies time-based status changes.
- Attendance sessions store date, mode, period id/key, and optional period labels, not a reliable session start/end timestamp.
- Timetable periods have start/end times, but roll-call sessions are not guaranteed to be timetable-backed in all modes.
- There is no check-in/check-out model for students.
- Teacher App daily roll-call is not tied to a timetable period.
- Applying auto-absence would require time source rules, job scheduling, idempotency, audit logs, notification rules, and recompute/unsubmit behavior.

Decision:

- Keep `autoAbsentAfterMinutes` deferred.
- Do not implement it in ATT-POL-2F.
- It needs a separate audit after timing, scheduler, audit, and notification semantics are designed.

## 15. absentIfMissedPeriodsCount / DERIVED_FROM_PERIODS boundary

Current runtime reality:

- ATT-POL-1 validates that `DERIVED_FROM_PERIODS` requires selected periods and missed period count.
- ATT-POL-2B and ATT-POL-2D made selected periods meaningful for PERIOD roll-call creation.
- No runtime code derives DAILY attendance from PERIOD sessions.
- No runtime code computes missed-period counts.
- Existing daily absences and period absences are independent submitted entries.

Boundary decision:

- `absentIfMissedPeriodsCount` belongs to derived daily attendance, not threshold semantics.
- Defer `absentIfMissedPeriodsCount` and `DERIVED_FROM_PERIODS` runtime application to ATT-POL-2G.
- If implemented later, missed-period semantics should likely count `ABSENT` as missed, should not count `LATE` or `EARLY_LEAVE` as missed by default, should treat `EXCUSED` as an incident but not an unexcused miss unless product decides otherwise, and should not count `UNMARKED` as missed without an explicit incomplete-session rule.

## 16. requireExcuseReason boundary

Current runtime reality:

- `requireExcuseReason` is persisted and returned by policy APIs.
- It is not enforced in roll-call draft save, correction, excuse request creation, or excuse approval.
- Existing excuse approval enforces `requireExcuseAttachment` through the policy linked to submitted matching sessions.
- Excuse request validation normalizes optional reasons but does not require them.
- Submitted entry correction requires a correction reason, but that is not the same as `excuseReason`.

Decision:

- Do not include `requireExcuseReason` in ATT-POL-2F.
- It should be a separate small policy-enforcement sprint.
- That sprint should decide whether the requirement applies to:
  - roll-call entries marked `EXCUSED`,
  - submitted entry corrections to `EXCUSED`,
  - absence excuse requests,
  - excuse approval,
  - or all of the above.

## 17. Notifications boundary

Current runtime reality:

- Communication has notification infrastructure and attendance notification types such as `attendance_absence` and `attendance_late`.
- Attendance roll-call, submit, correction, absences, and reports do not currently emit attendance notifications.
- ATT-POL-1 persisted notification flags, but prior ATT-POL audits deferred dispatch.

Decision:

- ATT-POL-2F should emit no notifications.
- If threshold normalization later changes an entry to `LATE` or `EARLY_LEAVE`, notification dispatch should remain deferred to a later notification sprint.
- Future notification design must define event points, audiences, idempotency keys, resubmit behavior, correction behavior, and no-leak payloads before dispatch is enabled.

## 18. Error/warning behavior

Warning behavior:

- No warning response envelope exists for roll-call saves.
- Adding non-blocking warnings would be a public response contract change.
- ATT-POL-2F should not add warnings.

Validation behavior:

- ATT-POL-2F should avoid broad new consistency rejection.
- The only recommended new rejection is the ambiguous case where an incoming `PRESENT` draft entry has both `lateMinutes` and `earlyLeaveMinutes` triggering their configured thresholds.
- Use `ValidationDomainException`.
- Use code `validation.failed`.
- Use HTTP 400.
- Safe details:
  - `field: "status"`
  - `studentId`
  - `lateMinutes`
  - `earlyLeaveMinutes`
  - `lateThresholdMinutes`
  - `earlyLeaveThresholdMinutes`
  - `reason: "ambiguous_threshold_match"`
- Do not expose `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, internal actor ids, raw Prisma payloads, or notification internals.
- No new error catalog entry is needed if existing `validation.failed` is used.

## 19. Backward compatibility decision

Backward-compatible constraints for ATT-POL-2F:

- No schema or migration.
- No route changes.
- No response envelope changes.
- No historical recompute.
- Existing submitted sessions are not mutated.
- Existing draft sessions are not mutated unless a user edits entries through draft save/upsert.
- Submit does not reapply thresholds.
- Corrections ignore thresholds and honor explicit submitted correction status.
- Unsubmit alone does not reapply thresholds.
- If a user unsubmits and then edits entries, the draft save path applies ATT-POL-2F threshold normalization to the edited entries only.
- Sessions without `policyId` do not apply thresholds.
- Sessions whose linked policy has null thresholds do not apply thresholds.
- Existing Teacher App writes remain valid.
- Existing `LATE` without minutes remains valid in draft save for ATT-POL-2F.

Policy change timing:

- A session stores `policyId`, not a policy snapshot.
- ATT-POL-2F should not re-resolve the effective policy for existing sessions.
- Threshold normalization should use the linked `policyId` on the session if present.
- Because policy fields are not snapshotted, edits to a policy after session creation can affect later draft entry edits for that linked session. This is acceptable for ATT-POL-2F if documented and covered by tests; solving historical policy snapshots is out of scope.

## 20. Recommended ATT-POL-2F implementation plan

Exact scope:

- Apply `lateThresholdMinutes` and `earlyLeaveThresholdMinutes` during draft roll-call entry save/upsert only.
- Normalize only incoming `PRESENT` entries with explicit positive minute values meeting policy thresholds.
- Preserve existing selected-period roll-call gating and timetable validation.
- Preserve existing submit behavior.
- Preserve existing correction behavior.
- Preserve Teacher App write contract.

Exact non-goals:

- No schema/migration.
- No notifications.
- No `autoAbsentAfterMinutes`.
- No derived daily attendance.
- No `absentIfMissedPeriodsCount` runtime behavior.
- No `requireExcuseReason` enforcement.
- No warning response envelope.
- No strict timetable entry validation.
- No app route or DTO changes.
- No historical recompute.
- No submitted-entry mutation outside explicit correction.

Likely files to change:

- `src/modules/attendance/roll-call/infrastructure/attendance-roll-call.repository.ts`
- `src/modules/attendance/roll-call/application/save-roll-call-entries.use-case.ts`
- `src/modules/attendance/roll-call/domain/entry-threshold-normalization.ts` or similar new helper
- `src/modules/attendance/roll-call/tests/roll-call.use-case.spec.ts`
- `test/e2e/attendance-foundation.e2e-spec.ts` or a focused attendance threshold E2E if the project pattern prefers separate E2E coverage
- `test/security/tenancy.attendance.spec.ts` only if a new policy lookup is added in a way that could affect tenancy
- `docs/sprint-att-pol-2f-attendance-threshold-runtime-closeout.md`

Schema/migration:

- No.

Repository/application changes:

1. Extend roll-call session detail selection or add a narrow repository method to read the linked policy threshold fields by `policyId` in the active school scope.
2. Do not re-resolve effective policy by scope/date during entry save.
3. Do not select or expose tenant/internal fields.
4. In `SaveRollCallEntriesUseCase.save`, after session loading, draft/session writability checks, roster validation, and structural entry normalization, apply threshold normalization before `bulkUpsertEntries`.
5. `UpsertRollCallEntryUseCase` automatically uses the same behavior because it delegates to `SaveRollCallEntriesUseCase.save`.

Algorithm:

1. Load the session as today.
2. If session has no `policyId`, skip threshold normalization.
3. If linked policy thresholds are both null, skip threshold normalization.
4. Normalize roster entries as today.
5. For each normalized entry:
   - If `status !== PRESENT`, leave it unchanged.
   - Resolve `lateTriggered = lateThresholdMinutes !== null && lateMinutes !== null && lateMinutes > 0 && lateMinutes >= lateThresholdMinutes`.
   - Resolve `earlyLeaveTriggered = earlyLeaveThresholdMinutes !== null && earlyLeaveMinutes !== null && earlyLeaveMinutes > 0 && earlyLeaveMinutes >= earlyLeaveThresholdMinutes`.
   - If both trigger, throw `ValidationDomainException` with safe ambiguous-threshold details.
   - If only late triggers, set status to `LATE`, preserve `lateMinutes`, and set `earlyLeaveMinutes` to null.
   - If only early leave triggers, set status to `EARLY_LEAVE`, preserve `earlyLeaveMinutes`, and set `lateMinutes` to null.
   - If neither triggers, leave entry unchanged.
6. Persist via existing bulk upsert.
7. Return the existing saved-entry presenter shape.

Validation behavior:

- Do not reject `PRESENT` with below-threshold minutes.
- Do not reject `LATE` without minutes.
- Do not reject `EARLY_LEAVE` without minutes in draft save.
- Do not reject `ABSENT`, `EXCUSED`, or `UNMARKED` with minute fields in ATT-POL-2F unless existing validation already rejects them.
- Reject only ambiguous dual-threshold trigger for one `PRESENT` entry.

Response behavior:

- No new response fields.
- No warnings.
- The saved entry response should show the normalized status and stored minute fields.

Idempotency/recompute rules:

- No historical recompute.
- No submit-time reapplication.
- No correction-time reapplication.
- Re-saving the same already normalized `LATE` or `EARLY_LEAVE` entry should not perform additional threshold mutation because the entry status is no longer `PRESENT`.
- Existing sessions are not re-resolved against a newly effective policy.
- Policy changes affect only future draft edits on sessions linked to that policy.

App-facing impact:

- Core School Dashboard roll-call save responses can show `LATE`/`EARLY_LEAVE` after a user submits `PRESENT` with threshold-triggering minutes.
- Teacher App is unchanged because it does not send minute fields.
- Parent/Student reads change only after submitted entries contain normalized statuses.
- Dashboard cards may reflect draft late counts if a draft save normalizes to LATE; this is consistent with current dashboard counting behavior.

Security/no-leak coverage:

- Use school-scoped repository access for any linked policy lookup.
- Do not expose policy internals in entry save responses.
- Ambiguous threshold errors must not expose tenant/internal fields.
- Existing attendance tenancy coverage should remain green.

Verification commands for ATT-POL-2F:

- `git status --short --untracked-files=all`
- `git diff --name-only`
- `git diff --stat`
- `git diff --check`
- `npx prisma validate`
- `npm run build`
- `npm run test -- roll-call --runInBand`
- `npm run test -- attendance-policy --runInBand`
- `npm run test -- attendance --runInBand`
- `npm run test -- teacher-app --runInBand`
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts`
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-excuses-corrections.e2e-spec.ts`
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/teacher-app-classroom-operations.e2e-spec.ts`
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.teacher-app.spec.ts`
- `npm run test:security -- --runInBand`

## 21. Tests required for ATT-POL-2F

Unit tests:

- Draft save converts `PRESENT` plus threshold-triggering `lateMinutes` to `LATE`.
- Draft save converts `PRESENT` plus threshold-triggering `earlyLeaveMinutes` to `EARLY_LEAVE`.
- Draft save leaves `PRESENT` unchanged when minutes are below threshold.
- Draft save leaves `PRESENT` unchanged when policy thresholds are null.
- Draft save leaves entries unchanged when session has no `policyId`.
- Draft save leaves explicit `LATE` unchanged even when `lateMinutes` is missing.
- Draft save leaves explicit `EARLY_LEAVE` unchanged even when `earlyLeaveMinutes` is missing.
- Draft save rejects one `PRESENT` entry when both late and early-leave threshold triggers match.
- Targeted upsert uses the same threshold normalization through `SaveRollCallEntriesUseCase`.
- Submit does not mutate entry statuses based on thresholds.
- Corrections do not mutate based on thresholds and still require positive minutes for explicit LATE/EARLY_LEAVE corrections.
- Teacher App adapter still writes `late` without minutes successfully.

E2E tests:

- Create a policy with `lateThresholdMinutes`, resolve a DAILY session, save a `PRESENT` entry with late minutes above threshold, and verify the save response and stored entry are `LATE`.
- Create a policy with `earlyLeaveThresholdMinutes`, resolve a DAILY session, save a `PRESENT` entry with early-leave minutes above threshold, and verify the save response and stored entry are `EARLY_LEAVE`.
- Save below-threshold minutes and verify status remains `PRESENT`.
- Submit after draft normalization and verify reports/absences reflect the normalized status through existing read endpoints.
- Verify Teacher App attendance flow still passes with present/absent/late/excused writes and no minutes.
- Verify no new session or policy route contract changes.

Security tests:

- Existing `tenancy.attendance` must remain green.
- Existing `tenancy.teacher-app` must remain green.
- If an ambiguous threshold validation test is added to security coverage, assert the response does not leak `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, internal actor ids, raw Prisma payloads, or notification internals.

## 22. Deferred items

Deferred beyond ATT-POL-2F:

- `autoAbsentAfterMinutes` runtime application.
- `absentIfMissedPeriodsCount` runtime application.
- `DERIVED_FROM_PERIODS` daily computation.
- Persisted derived DAILY sessions.
- Report-only derived daily computation.
- Notification dispatch for absences, late arrivals, and early leaves.
- `requireExcuseReason` enforcement.
- Strict entry/status consistency validation for draft saves.
- Teacher App early-leave writes.
- Teacher App minute writes.
- Warning response envelope.
- Historical recompute or backfill.
- Policy snapshotting for thresholds.
- Dashboard early-leave cards.

## 23. Verification evidence

Required lightweight checks:

- `git status --short --untracked-files=all`: PASS
  - Output: `?? docs/sprint-att-pol-2e-threshold-semantics-reality-audit.md`
- `git diff --name-only`: PASS
  - Output: empty. The only repository change is a new untracked documentation file, so plain `git diff` has no tracked-file diff to report.
- `git diff --stat`: PASS
  - Output: empty for the same reason.
- `git diff --check`: PASS
  - Output: empty.

Optional read-only checks:

- `npm run build`: NOT_RUN - documentation-only audit, no runtime files changed.
- `npm run test -- attendance --runInBand`: NOT_RUN - documentation-only audit, no runtime files changed.
- `npm run test -- roll-call --runInBand`: NOT_RUN - documentation-only audit, no runtime files changed.
- `npm run test -- teacher-app --runInBand`: NOT_RUN - documentation-only audit, no runtime files changed.

No migrations were run. `npx prisma generate` was not run.

## 24. Final verdict

`READY_FOR_ATT_POL_2F_IMPLEMENTATION`

ATT-POL-2F should implement a narrow, draft-save-only threshold normalization path for explicit minute values on incoming `PRESENT` entries. It should not mutate entries on submit, should not affect corrections, should not emit notifications, should not implement auto absent or derived daily attendance, and should preserve Teacher App behavior.
