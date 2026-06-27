# Attendance Policy Rule Logic — Final Closeout

## 1. Executive status

The Attendance Policy Rule Logic workstream is CLOSED.

Final baseline: `18c97d9 feat: notify guardians on submitted absences`.

The original policy/runtime mismatch has been resolved for the approved safe V1 scope. Advanced AttendancePolicy contract fields are persisted and presented, selected-period controls affect new PERIOD roll-call creation, timetable references are validated, thresholds apply in the narrow draft-save path, derived daily absences have an isolated report-only read surface, and guardian ABSENT notifications dispatch on roll-call submit through Communication-owned idempotency infrastructure.

Remaining items are intentionally deferred backlog. They are not blockers for closing this workstream.

Final verdict: `ATTENDANCE_POLICY_RULE_LOGIC_CLOSED`

## 2. Original problem

The workstream started because AttendancePolicy exposed advanced Dashboard/API contract fields that were either not persisted or did not affect runtime behavior consistently.

The original risk was concrete: dashboard users could configure policy rules that the actual Attendance runtime ignored, partially honored, or returned as placeholder values. That created a mismatch between the API contract, stored PostgreSQL data, repository selection, presenter output, and actual roll-call/report/notification behavior.

Core fields involved:

- `selectedPeriodIds`
- `lateThresholdMinutes`
- `earlyLeaveThresholdMinutes`
- `autoAbsentAfterMinutes`
- `absentIfMissedPeriodsCount`
- `dailyComputationStrategy` / `DERIVED_FROM_PERIODS`
- `requireExcuseReason`
- `notifyGuardiansOnAbsence`
- `notifyTeachers`
- `notifyStudents`
- `notifyOnLate`
- `notifyOnEarlyLeave`

The approved fix was not a broad attendance rules engine. The approved fix was a conservative sequence of persistence repair, reality audits, and narrowly scoped runtime behaviors that could ship without breaking existing roll-call, reports, absences, Teacher App, Parent App, Student App, dashboard, or tenancy guarantees.

## 3. Final implemented scope

Implemented and closed:

- Policy contract persistence.
- Selected-period roll-call gating.
- Timetable period existence validation.
- Threshold draft-save normalization.
- Report-only derived daily absences.
- Communication notification idempotency infrastructure.
- Guardian/parent ABSENT in-app notification dispatch on roll-call submit.

This is the approved safe V1 runtime scope for Attendance Policy Rule Logic. It intentionally does not include a general-purpose automatic attendance rules engine.

## 4. Sprint-by-sprint closure summary

| Sprint | Commit/baseline | Type | Outcome | Runtime impact | Final status |
|---|---|---|---|---|---|
| ATT-POL-1 - Attendance Policy Contract Persistence Repair | `86bfd77 fix: harden settings iam health readiness` | Runtime/schema repair | Persisted advanced policy contract fields and returned real values from presenters. | Policy create/update/list/effective now round-trip advanced fields. | Complete |
| ATT-POL-2A - Attendance Policy Rule Application Reality Audit | `799dea9 fix: persist attendance policy contract fields` | Documentation audit | Chose conservative rule-application sequence. | None. | Ready for 2B |
| ATT-POL-2B - Selected-Period Roll-Call Gating | `cd153e8 docs: audit attendance policy rule application` | Runtime implementation | Applied `selectedPeriodIds` only as a gate for new PERIOD sessions. | New PERIOD sessions may require/validate `periodId`; existing sessions and DAILY sessions unchanged. | Complete |
| ATT-POL-2C - Timetable Period Existence Validation Reality Audit | `65cb85b fix: gate period roll-call by attendance policy` | Documentation audit | Locked same-school/year/term timetable reference validation plan. | None. | Ready for 2D |
| ATT-POL-2D - Timetable Period Existence Validation | `bb16bd6 docs: audit timetable period validation` | Runtime implementation | Validated policy selected periods and roll-call period ids against timetable periods. | Invalid/cross-context timetable ids are rejected before persistence/session creation. | Complete |
| ATT-POL-2E - Threshold Semantics Reality Audit | `388893f fix: validate attendance timetable periods` | Documentation audit | Locked draft-save-only threshold semantics. | None. | Ready for 2F |
| ATT-POL-2F - Threshold Draft-Save Normalization | `892aff3 docs: audit attendance threshold semantics` | Runtime implementation | Normalized incoming PRESENT draft entries to LATE/EARLY_LEAVE when thresholds match. | Draft save/upsert only; submit/correction/history unchanged. | Complete |
| ATT-POL-2G - Derived Daily / Missed Periods Reality Audit | `d32b7b6 fix: normalize attendance thresholds on draft save` | Documentation audit | Chose report-only derived daily absences. | None. | Ready for 2H |
| ATT-POL-2H - Report-only Derived Daily Absences | `949c699 docs: audit derived daily attendance semantics` | Runtime implementation | Added isolated derived daily absence report endpoint. | New read-only report surface; no AttendanceSession/AttendanceEntry writes. | Complete |
| ATT-POL-2I - Attendance Notifications Reality Audit | `7baad31 feat: add derived daily absence report` | Documentation audit | Found infrastructure blockers for safe dispatch. | None. | Needed infrastructure first |
| ATT-POL-2J - Notification Infrastructure Readiness | `351b94a docs: audit attendance notification readiness` | Communication infrastructure | Added internal idempotency key, ATTENDANCE preference category, and notification type plumbing. | Communication can create/reuse in-app notifications idempotently; Attendance still did not dispatch. | Complete |
| ATT-POL-2K - Guardian Absence Notification Dispatch Audit | `ed85193 feat: add notification idempotency infrastructure` | Documentation audit | Locked narrow guardian ABSENT submit notification plan. | None. | Ready for 2L |
| ATT-POL-2L - Guardian Absence Notification Dispatch Implementation | `61fa33b docs: audit guardian absence notification dispatch` | Runtime implementation | Added guardian/parent in-app ABSENT notification dispatch on roll-call submit. | Submit creates best-effort idempotent in-app notifications for eligible guardian recipients. | Complete |

## 5. Current runtime behavior

### 5.1 Policy persistence

Advanced AttendancePolicy fields are persisted on create/update and selected by the policy repository:

- `selectedPeriodIds`
- `lateThresholdMinutes`
- `earlyLeaveThresholdMinutes`
- `autoAbsentAfterMinutes`
- `absentIfMissedPeriodsCount`
- `requireExcuseReason`
- `notifyGuardiansOnAbsence`
- `notifyTeachers`
- `notifyStudents`
- `notifyOnLate`
- `notifyOnEarlyLeave`

Policy presenters return these fields from persisted data. Compatibility aliases remain API/DTO/presenter compatibility only where applicable:

- `yearId` mirrors `academicYearId`
- `requireAttachmentForExcuse` mirrors `requireExcuseAttachment`
- `allowExcuses` mirrors `allowParentExcuseRequests`
- `notifyGuardians` and `notifyOnAbsent` mirror `notifyGuardiansOnAbsence`

Policy validation normalizes selected period ids, rejects empty/duplicate period ids, rejects negative numeric thresholds, and requires enough structural configuration for `DERIVED_FROM_PERIODS`.

### 5.2 selectedPeriodIds gating

New PERIOD roll-call sessions are gated by the effective policy's `selectedPeriodIds`.

Runtime behavior:

- Effective policy priority remains `CLASSROOM > SECTION > GRADE > STAGE > SCHOOL`.
- Existing session lookup happens first and existing sessions are returned idempotently.
- `AttendanceSession.policyId` is stored when a new session is created.
- DAILY sessions are not gated by `selectedPeriodIds`.
- PERIOD sessions with no policy or an empty selected-period list preserve legacy behavior.
- PERIOD sessions with non-empty selected-period lists require a trimmed `periodId` included in the policy list.
- `periodKey` remains the uniqueness/idempotency key and is not reinterpreted as the timetable period id.

### 5.3 Timetable period validation

AttendancePolicy `selectedPeriodIds` are validated against timetable periods in the policy academic context.

Roll-call request `periodId` is validated against timetable period references when creating new PERIOD sessions and a normalized `periodId` is present or required.

Valid references must be visible under the active school scope and match:

- same `academicYearId`
- same `termId`
- timetable config status `DRAFT` or `ACTIVE`

Invalid, nonexistent, archived-config, wrong-year, wrong-term, or cross-school period ids are rejected through generic attendance validation errors. Existing sessions are not revalidated.

### 5.4 Threshold normalization

Draft save applies threshold normalization through `SaveRollCallEntriesUseCase` using `AttendanceSession.policyId`.

Runtime behavior:

- `PRESENT` plus explicit positive `lateMinutes >= lateThresholdMinutes` becomes `LATE`.
- `PRESENT` plus explicit positive `earlyLeaveMinutes >= earlyLeaveThresholdMinutes` becomes `EARLY_LEAVE`.
- When both thresholds match, the entry is rejected as ambiguous.
- Below-threshold or zero minute values remain unchanged.
- Non-PRESENT statuses are not normalized.
- Sessions without a linked policy skip threshold normalization.
- Submit does not re-normalize entries.
- Corrections do not run threshold normalization.
- Historical rows are not rewritten.

### 5.5 Derived daily absences

Derived daily attendance is report-only.

Runtime behavior:

- Endpoint: `GET /api/v1/attendance/reports/derived-daily-absences`.
- No DAILY `AttendanceSession` rows are created.
- No derived `AttendanceEntry` rows are created.
- Only submitted PERIOD entries are evidence.
- Only policies with `dailyComputationStrategy = DERIVED_FROM_PERIODS`, non-empty selected periods, and non-null `absentIfMissedPeriodsCount` participate.
- Session `periodId` must be included in the linked policy `selectedPeriodIds`.
- Only `ABSENT` counts as missed.
- `PRESENT`, `LATE`, `EARLY_LEAVE`, `EXCUSED`, and `UNMARKED` do not count as missed.
- DRAFT and DAILY sessions do not count.
- Existing summary, daily trend, scope breakdown, absences, dashboard, teacher app, parent app, student app, and discipline behavior remain unchanged unless a caller explicitly uses the derived endpoint.

### 5.6 Notification infrastructure

Communication now has reusable idempotent notification creation infrastructure.

Runtime support:

- `CommunicationNotification.idempotencyKey` is internal and nullable.
- `(schoolId, idempotencyKey)` is unique for idempotent paths.
- The reusable command can create or reuse in-app notifications.
- The command respects notification preferences when a category is supplied.
- The `ATTENDANCE` preference category exists.
- `ATTENDANCE_ABSENCE`, `ATTENDANCE_LATE`, and `ATTENDANCE_EARLY_LEAVE` notification types exist.
- App notification presenters do not expose `idempotencyKey`.

### 5.7 Guardian absence notification dispatch

Runtime dispatch exists only on roll-call submit.

Runtime behavior:

- Notification orchestration runs after the session is durably changed to SUBMITTED and after the normal submit audit path.
- Only submitted ABSENT entries notify.
- Only guardian/parent recipients notify.
- Only in-app notifications are created.
- Policy gate is linked `session.policyId` plus `notifyGuardiansOnAbsence`.
- The implementation does not re-resolve the currently effective policy.
- `sourceModule = ATTENDANCE`.
- `sourceType = attendance_absence_submit`.
- `sourceId = null`.
- No attendance deep link is created.
- Idempotency key format: `attendance.absence.submit:<sessionId>:<entryId>:<studentId>:<recipientUserId>:ABSENT`.
- Notification payload includes a safe title, student display name, and attendance date.
- Notification failure is best-effort and does not fail Attendance submit.
- Submit response shape is unchanged.

## 6. Current no-go behavior

These are intentionally not implemented in the closed workstream:

| Item | Classification |
|---|---|
| `autoAbsentAfterMinutes` runtime behavior | Deferred backlog; needs scheduler/job infrastructure and policy decision. |
| `requireExcuseReason` enforcement | Deferred backlog; needs policy decision about requests, corrections, and EXCUSED entries. |
| Persisted derived DAILY sessions | Deferred backlog; needs schema/source provenance, audit, recompute, and app contract design. |
| Correction notifications | Needs separate event model; correction occurrence/idempotency remains separate work. |
| Resolved/cleared absence notifications | Product/UX expansion; needs incident lifecycle semantics. |
| LATE notification dispatch | Product/UX expansion; notification type exists but runtime dispatch is deferred. |
| EARLY_LEAVE notification dispatch | Product/UX expansion; notification type exists but runtime dispatch is deferred. |
| Teacher attendance notifications | Product/UX expansion; needs audience and relationship rules. |
| Student attendance notifications | Product/UX expansion; needs student-recipient policy decision. |
| School admin / attendance officer notifications | Product/UX expansion; needs role/audience design. |
| Push/email/SMS attendance notifications | Needs app contract, delivery policy, and channel readiness decisions. |
| Attendance deep links | Needs app contract and safe public source identifiers. |
| Localization/templates for attendance notifications | Product/UX expansion. |
| Excuse workflow notifications | Needs separate excuse-event semantics. |
| Historical backfill | Deferred backlog; not required for V1 closure. |
| Policy snapshotting | Advanced backlog; needed only if historical policy immutability becomes a product requirement. |
| Public opaque attendance source ids | Needs app contract. |
| Grouped multi-student notifications | Product/UX expansion; V1 sends one notification per student/guardian. |

## 7. What is closed vs deferred

| Area | Status | Reason | Can ship V1 without it? | Recommended future handling |
|---|---|---|---|---|
| Policy persistence | Closed | Advanced fields persist, update, select, and present correctly. | Yes | Maintain through contract tests. |
| Selected periods | Closed | New PERIOD roll-call creation is gated safely and existing sessions remain idempotent. | Yes | Revisit only if timetable/scope semantics expand. |
| Timetable validation | Closed | Policy selected periods and supplied roll-call period ids are school/year/term validated. | Yes | Separate future work for same-config/scope/publication validation if product needs it. |
| Thresholds | Closed for V1 | Draft-save-only PRESENT normalization is implemented. | Yes | Separate stricter validation/warning UX if desired. |
| Derived daily report-only | Closed for V1 | Isolated read-only endpoint computes derived ABSENT rows without mutations. | Yes | Separate persisted-derived epic if needed. |
| Guardian absence notifications | Closed for V1 | Submit-time ABSENT guardian in-app notifications are implemented idempotently. | Yes | Extend through separate notification epics. |
| Auto absent | Deferred | Needs timing source, scheduler/job, audit, and notification/recompute semantics. | Yes | New Attendance Auto-Absent Runtime epic. |
| Require excuse reason | Deferred | Needs explicit product decision for excuse requests, submitted corrections, and EXCUSED status. | Yes | New policy enforcement backlog item. |
| Correction notifications | Deferred | Needs durable correction event occurrence and duplicate prevention. | Yes | New Attendance Correction Notification Events epic. |
| Late/early leave notifications | Deferred | Needs audience rules and product messaging. | Yes | New Attendance Late/Early Leave Notifications epic. |
| Push/email/SMS | Deferred | Needs channel-specific app/product decisions. | Yes | New Attendance Push/Deep-Link/App Contract Expansion epic. |
| Persisted derived daily | Deferred | Needs provenance schema, audit, recompute, and app/report merge decisions. | Yes | New Persisted Derived Daily Attendance epic. |
| Policy snapshotting | Deferred | Not required for approved V1 runtime behavior. | Yes | New Attendance Policy Snapshotting epic if historical immutability is required. |

## 8. Security and no-leak posture

Tenant scoping remains school-scoped. Runtime lookups use scoped repositories and current school context. Cross-school access should remain 404/denied by existing scoped repository behavior and security tests.

App-facing responses must not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- internal actor ids
- guardian ids
- raw AttendanceSession ids through notification `sourceId`
- raw AttendanceEntry ids through notification `sourceId`
- `idempotencyKey`
- raw Prisma payloads

For the approved V1 attendance notification dispatch path, notification `sourceId` remains `null`. The internal idempotency key handles deduplication without becoming public API.

## 9. Test and verification summary

Latest runtime verification from ATT-POL-2L:

- `npx prisma validate`: PASS.
- `npm run build`: PASS.
- `npm run test -- roll-call --runInBand`: PASS.
- `npm run test -- attendance --runInBand`: PASS.
- `npm run test -- communication --runInBand`: PASS.
- `npm run test -- parent-app --runInBand`: PASS.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts`: PASS.
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/communication-realtime-announcements-notifications.e2e-spec.ts`: PASS.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`: PASS.
- `npm run test:security -- --runInBand`: PASS.

This final closeout sprint is documentation-only. It does not alter runtime, so only lightweight git checks were required for this sprint.

Optional checks for this final closeout were not run:

- `npm run build`: NOT_RUN.
- `npm run test -- attendance --runInBand`: NOT_RUN.
- `npm run test -- roll-call --runInBand`: NOT_RUN.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`: NOT_RUN.

## 10. Recommended stop point

Do not continue adding new ATT-POL runtime sprints under this workstream.

The workstream should stop after ATT-POL-2L and this final closeout. Future work must be opened as separate backlog epics, not as continuation of Attendance Policy Rule Logic.

Recommended future epics:

- Attendance Auto-Absent Runtime
- Attendance Correction Notification Events
- Attendance Late/Early Leave Notifications
- Attendance Excuse Workflow Notifications
- Attendance Push/Deep-Link/App Contract Expansion
- Persisted Derived Daily Attendance
- Attendance Policy Snapshotting

## 11. Final backlog

P0 / must not be ignored if product requests it later:

- None for closing the current V1 workstream.

P1 / high-value future:

- `autoAbsentAfterMinutes` runtime.
- `requireExcuseReason` enforcement.
- Correction notifications.
- LATE/EARLY_LEAVE notifications.

P2 / expansion:

- Teacher/student/admin audiences.
- Push/email/SMS.
- Attendance deep links.
- Localization/templates.

P3 / advanced:

- Persisted derived DAILY sessions.
- Historical backfill.
- Policy snapshotting.
- Grouped multi-student notifications.

These items are not blockers for closing the current workstream.

## 12. Final verdict

`ATTENDANCE_POLICY_RULE_LOGIC_CLOSED`

Final baseline: `18c97d9 feat: notify guardians on submitted absences`.

Final closeout doc: `docs/attendance-policy-rule-logic-final-closeout.md`.

Recommended next action: move to another feature or backlog planning, not more ATT-POL runtime work.
