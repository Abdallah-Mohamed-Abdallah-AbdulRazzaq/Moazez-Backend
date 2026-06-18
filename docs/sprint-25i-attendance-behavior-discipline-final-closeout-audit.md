# Sprint 25I - Attendance Behavior Discipline Final Closeout Audit

## 1. Executive Decision

Decision: PASS.

Final family status: **V1_READY_WITH_DEFERRED_GAPS**.

The Attendance / Behavior / Discipline feature family is coherent for the current V1 backend contract. Attendance remains the source of truth for sessions, entries, incidents, excuses, and reports. Behavior remains the source of truth for manual positive/negative behavior records and behavior points. Discipline is now a read-only derived layer for Student App, Parent App, and Parent Reports, with no write source or duplicated storage.

Recommended next sprint: **Sprint 26A - next module reality/contract audit**. No runtime Sprint 25J is required unless product chooses to prioritize one of the deferred decisions.

## 2. Sprint History Summary

| Sprint | Commit | Decision / closure |
|---|---|---|
| 25A | `89cf021 docs: audit attendance discipline behavior gaps` | Reality/contract audit. Attendance was PARTIAL with a strong core; Behavior core was strong; Discipline required a product/backend decision and must not become a duplicate write source. |
| 25B | `2d3e6a6 fix: enforce closed-term attendance write protection` | Closed the high-severity Attendance gap: all existing roll-call session mutations reject closed/inactive terms. |
| 25C | `c9a6a47 feat: add attendance absence correction endpoints` | Added source-preserving absence correction routes: `PATCH /api/v1/attendance/absences/:id/excuse` and `PATCH /api/v1/attendance/absences/:id/early-leave`. |
| 25D | `9a84142 docs: decide discipline derived layer contract` | Accepted Option C: Discipline is a read-only derived layer, no Discipline writes, no Prisma model, no migration, no duplicated Attendance or Behavior data. |
| 25E | `ccab5c1 feat: add student parent discipline read models` | Added Student and Parent Discipline timeline/summary routes derived from submitted Attendance incidents and approved Behavior records. |
| 25F | `456303b feat: align parent reports discipline summary` | Added Parent Reports `discipline` summary additively while preserving legacy attendance-derived `disciplinePercentage`. |
| 25G | `177c434 docs: decide teacher attendance mapping contract` | Accepted Teacher App Attendance Option C: keep canonical roll-call writes, add only narrow read mapping, defer ambiguous writes. |
| 25H | `5890a0c feat: add teacher attendance read mapping` | Added explicit Teacher App read mapping for `unmarked` and `early_leave`, plus read-only `GET /api/v1/teacher/classroom/:classId/attendance/today`. |

## 3. Module Status Matrix

| Area | Status | Evidence | Remaining gaps | Blocks V1? |
|---|---|---|---|---|
| Attendance | CLOSED for scoped V1 core | Policies, roll-call, submitted entry correction, derived absences, direct absence corrections, formal excuses, reports, closed-term writes, tenancy tests | Route drift vs ADR examples; optional `/attendance/context` | No |
| Behavior | CLOSED for scoped V1 core/app reads | Categories, records, review queue, approve/reject, point ledger, dashboard summaries, Student/Parent approved-only reads | Optional mixed Behavior feed compatibility mode | No |
| Discipline | CLOSED for scoped V1 read layer | Shared derived read service, Student/Parent routes, Parent Reports summary, no writes/models/migrations | Dashboard KPI and score formula | No |
| Teacher App Attendance | CLOSED for 25H read mapping; PARTIAL for future writes | Canonical write routes preserved; `today` read route; `unmarked` and `early_leave` reads; ownership/no-leak tests | arrival/dismissal, late minutes, early-leave/excuse authority, PERIOD/scheduleId writes, unsubmit/correction wrappers | No |
| Student App Discipline | CLOSED | `GET /student/discipline`, `GET /student/discipline/summary`; current-student access; submitted Attendance + approved Behavior only | Optional frontend compatibility under Behavior route names | No |
| Parent App Discipline | CLOSED | `GET /parent/children/:studentId/discipline`, `GET /summary`; linked-child access; no internal leaks | Optional compatibility under Behavior route names | No |
| Parent Reports Discipline | CLOSED additively | `discipline` object added to reports/list summary paths; legacy `disciplinePercentage` unchanged | Future combined score/percentage formula | No |
| Dashboard Discipline KPI | DEFERRED_PRODUCT_DECISION | No formal KPI route implemented by design | KPI contract, score formula, dashboard placement | No |

## 4. Route Inventory

### Core Attendance Routes

| Group | Method | Route | Status | Source of truth | Owner / security posture | Final classification |
|---|---|---|---|---|---|---|
| Policies | GET | `/api/v1/attendance/policies` | Existing | AttendancePolicy | Dashboard permission + school scope | CLOSED |
| Policies | GET | `/api/v1/attendance/policies/effective` | Existing | AttendancePolicy | Dashboard permission + scope hierarchy | CLOSED |
| Policies | GET | `/api/v1/attendance/policies/validate-name` | Existing | AttendancePolicy | Dashboard permission + school scope | CLOSED |
| Policies | POST | `/api/v1/attendance/policies` | Existing | AttendancePolicy | `attendance.policies.manage`, closed-term checks | CLOSED |
| Policies | PATCH | `/api/v1/attendance/policies/:id` | Existing | AttendancePolicy | `attendance.policies.manage`, closed-term checks | CLOSED |
| Policies | DELETE | `/api/v1/attendance/policies/:id` | Existing | AttendancePolicy | `attendance.policies.manage`, scoped delete | CLOSED |
| Roll-call | GET | `/api/v1/attendance/roll-call/roster` | Existing | AttendanceSession/Entry read | `attendance.sessions.view` | CLOSED |
| Roll-call | POST | `/api/v1/attendance/roll-call/session/resolve` | Existing | AttendanceSession | `attendance.sessions.manage`, closed-term create guard | CLOSED |
| Roll-call | GET | `/api/v1/attendance/roll-call/sessions` | Existing | AttendanceSession | `attendance.sessions.view` | CLOSED |
| Roll-call | GET | `/api/v1/attendance/roll-call/sessions/:id` | Existing | AttendanceSession/Entry | `attendance.sessions.view`, scoped session lookup | CLOSED |
| Roll-call | POST | `/api/v1/attendance/roll-call/sessions/:id/submit` | Existing | AttendanceSession | `attendance.sessions.submit`, closed-term guard | CLOSED |
| Roll-call | POST | `/api/v1/attendance/roll-call/sessions/:id/unsubmit` | Existing | AttendanceSession | `attendance.sessions.submit`, closed-term guard | CLOSED |
| Roll-call | PUT | `/api/v1/attendance/roll-call/sessions/:id/entries` | Existing | AttendanceEntry | `attendance.entries.manage`, roster/enrollment validation, closed-term guard | CLOSED |
| Roll-call | PUT | `/api/v1/attendance/roll-call/sessions/:id/entries/:studentId` | Existing | AttendanceEntry | Delegates to save path | CLOSED |
| Roll-call | POST | `/api/v1/attendance/roll-call/sessions/:sessionId/entries/:studentId/correct` | Existing | AttendanceEntry | Submitted-session correction, closed-term guard | CLOSED |
| Absences | GET | `/api/v1/attendance/absences` | Existing | Derived AttendanceEntry incidents | `attendance.absences.view`, submitted sessions only | CLOSED |
| Absences | GET | `/api/v1/attendance/absences/summary` | Existing | Derived AttendanceEntry incidents | `attendance.absences.view` | CLOSED |
| Absences | PATCH | `/api/v1/attendance/absences/:id/excuse` | Added 25C | AttendanceEntry | `attendance.entries.manage`, submitted only, active term | CLOSED |
| Absences | PATCH | `/api/v1/attendance/absences/:id/early-leave` | Added 25C | AttendanceEntry | `attendance.entries.manage`, submitted only, active term | CLOSED |
| Excuses | GET | `/api/v1/attendance/excuse-requests` | Existing | AttendanceExcuseRequest | `attendance.excuses.view` | CLOSED |
| Excuses | GET | `/api/v1/attendance/excuse-requests/:id` | Existing | AttendanceExcuseRequest | Scoped read | CLOSED |
| Excuses | GET | `/api/v1/attendance/excuse-requests/:id/attachments` | Existing | Excuse attachment links | Safe file metadata | CLOSED |
| Excuses | POST | `/api/v1/attendance/excuse-requests` | Existing | AttendanceExcuseRequest | `attendance.excuses.manage` | CLOSED |
| Excuses | PATCH | `/api/v1/attendance/excuse-requests/:id` | Existing | AttendanceExcuseRequest | `attendance.excuses.manage` | CLOSED |
| Excuses | POST | `/api/v1/attendance/excuse-requests/:id/attachments` | Existing | Excuse attachment links | File ownership + scope | CLOSED |
| Excuses | POST | `/api/v1/attendance/excuse-requests/:id/approve` | Existing | AttendanceExcuseRequest + matching AttendanceEntry | `attendance.excuses.review` | CLOSED |
| Excuses | POST | `/api/v1/attendance/excuse-requests/:id/reject` | Existing | AttendanceExcuseRequest | `attendance.excuses.review` | CLOSED |
| Excuses | DELETE | `/api/v1/attendance/excuse-requests/:id/attachments/:attachmentId` | Existing | Excuse attachment links | Scoped delete | CLOSED |
| Excuses | DELETE | `/api/v1/attendance/excuse-requests/:id` | Existing | AttendanceExcuseRequest | Scoped delete | CLOSED |
| Reports | GET | `/api/v1/attendance/reports/summary` | Existing | Submitted Attendance entries | `attendance.reports.view` | CLOSED |
| Reports | GET | `/api/v1/attendance/reports/daily-trend` | Existing | Submitted Attendance entries | `attendance.reports.view` | CLOSED |
| Reports | GET | `/api/v1/attendance/reports/scope-breakdown` | Existing | Submitted Attendance entries | `attendance.reports.view` | CLOSED |

### Teacher App Attendance Routes

| Method | Route | Status | Source of truth | App-facing owner | Security posture | Final classification |
|---|---|---|---|---|---|---|
| GET | `/api/v1/teacher/classroom/:classId/attendance/roster` | Existing | Core Attendance roster read | Teacher App allocation adapter | teacher owns `TeacherSubjectAllocation.id`; no create | CLOSED |
| GET | `/api/v1/teacher/classroom/:classId/attendance/today` | Added 25H | Core Attendance roster read | Teacher App allocation adapter | read-only, no leaks, same ownership | CLOSED |
| POST | `/api/v1/teacher/classroom/:classId/attendance/session/resolve` | Existing canonical write | Core Attendance session resolve | Teacher App allocation adapter | teacher ownership + core closed-term guard | CLOSED |
| GET | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId` | Existing | Core Attendance session detail | Teacher App allocation adapter | session must belong to owned allocation | CLOSED |
| PUT | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/entries` | Existing canonical write | Core Attendance entries | Teacher App allocation adapter | roster membership + core draft/closed-term rules | CLOSED |
| POST | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/submit` | Existing canonical write | Core Attendance session | Teacher App allocation adapter | ownership + core closed-term rules | CLOSED |
| Any | `/api/v1/teacher/classrooms/*` | Intentionally absent | None | None | no plural alias added | DEFERRED_PRODUCT_DECISION |
| Any | scheduleId attendance writes | Intentionally absent | None | None | no schedule occurrence write contract | DEFERRED_PRODUCT_DECISION |
| PATCH | Teacher early-leave/excuse shortcuts | Intentionally absent | Core Attendance only | None | teacher authority not approved | DEFERRED_PRODUCT_DECISION |

### Student Behavior / Discipline Routes

| Module | Method | Route | Status | Source of truth | Security posture | Final classification |
|---|---|---|---|---|---|---|
| Behavior | GET | `/api/v1/student/behavior` | Existing | Approved BehaviorRecord | current student + active enrollment | CLOSED |
| Behavior | GET | `/api/v1/student/behavior/summary` | Existing | Approved BehaviorRecord + attendance counters | current student + active enrollment | CLOSED |
| Behavior | GET | `/api/v1/student/behavior/:recordId` | Existing | Approved BehaviorRecord | current student record ownership | CLOSED |
| Discipline | GET | `/api/v1/student/discipline` | Added 25E | Submitted Attendance + approved Behavior | current student + active enrollment | CLOSED |
| Discipline | GET | `/api/v1/student/discipline/summary` | Added 25E | Submitted Attendance + approved Behavior | current student + active enrollment | CLOSED |

### Parent Behavior / Discipline / Reports Routes

| Module | Method | Route | Status | Source of truth | Security posture | Final classification |
|---|---|---|---|---|---|---|
| Behavior | GET | `/api/v1/parent/children/:studentId/behavior` | Existing | Approved BehaviorRecord | linked child + active enrollment | CLOSED |
| Behavior | GET | `/api/v1/parent/children/:studentId/behavior/summary` | Existing | Approved BehaviorRecord + attendance counters | linked child + active enrollment | CLOSED |
| Behavior | GET | `/api/v1/parent/children/:studentId/behavior/:recordId` | Existing | Approved BehaviorRecord | linked child record ownership | CLOSED |
| Discipline | GET | `/api/v1/parent/children/:studentId/discipline` | Added 25E | Submitted Attendance + approved Behavior | linked child + scoped school | CLOSED |
| Discipline | GET | `/api/v1/parent/children/:studentId/discipline/summary` | Added 25E | Submitted Attendance + approved Behavior | linked child + scoped school | CLOSED |
| Reports | GET | `/api/v1/parent/children/:studentId/reports` | Existing + additive 25F | Parent reports read model + Discipline summary | linked child + no breaking field changes | CLOSED |
| Reports | GET | `/api/v1/parent/children/:studentId/reports/summary` | Existing + additive 25F | Parent reports read model + Discipline summary | linked child + no breaking field changes | CLOSED |

### Dashboard / Admin Related Routes

| Method | Route | Status | Source of truth | Security posture | Final classification |
|---|---|---|---|---|---|
| GET | `/api/v1/dashboard/summary` | Existing | dashboard aggregate read models | dashboard permissions + school scope | CLOSED for dashboard foundation |
| GET | `/api/v1/dashboard/alerts` | Existing | dashboard alert read models | dashboard permissions + school scope | CLOSED for dashboard foundation |
| GET | `/api/v1/dashboard/activity-feed` | Existing | audit/activity read model | dashboard permissions + school scope | CLOSED for dashboard foundation |
| GET | dashboard Discipline KPI route | Not implemented | future derived Discipline analytics | product decision required | DEFERRED_PRODUCT_DECISION |

## 5. Source-of-Truth Boundary Review

Attendance owns attendance policies, roll-call sessions, attendance entries, absence/lateness/early-leave/excused incidents, excuse requests, and attendance reports.

Behavior owns manual positive/negative behavior records, category lifecycle, review queue, approve/reject workflow, and the behavior point ledger.

Discipline is read-only in V1. It derives from submitted Attendance incidents plus approved Behavior records. There is no Discipline Prisma table/model/enum, no migration, no Discipline write route, and no duplicated storage.

Parent Reports now has an additive `discipline` summary object. Its legacy `disciplinePercentage` remains attendance-derived for backward compatibility and is not a combined Discipline score.

Teacher App Attendance remains adapter-backed. It calls core Attendance use cases and presenters; it does not own a second attendance lifecycle or table.

No route aliases were added outside approved route bases. ADR route examples that differ from backend-native stable paths remain documented as route drift, not runtime bugs.

## 6. Security and Tenancy Review

Attendance security posture:

- Dashboard/core routes are permission-gated by Attendance permissions.
- Repositories use scoped Prisma paths and school scope.
- Closed-term writes are rejected for session resolve/create, bulk saves, single upserts, submit, unsubmit, and submitted-entry correction.
- Submitted vs draft rules are enforced: draft sessions can be updated; submitted sessions require correction flows.
- Cross-school reads/writes use safe not-found behavior.
- Absence correction endpoints require submitted sessions and active terms.

Behavior security posture:

- Dashboard/core routes use Behavior permissions for category, record, review, and dashboard access.
- Behavior review approval creates ledger entries; rejection does not create points.
- App-facing Student/Parent Behavior routes expose approved positive/negative records only.
- Behavior point totals remain separate from XP.
- Teacher App task/review flows are not treated as Behavior writes unless explicitly implemented by their own module.

Discipline security posture:

- Student Discipline uses current-student access and active enrollment.
- Parent Discipline uses linked-child ownership and active child enrollment.
- Only submitted Attendance sessions contribute.
- Only approved Behavior records contribute.
- Draft/unsubmitted Attendance, deleted Attendance sessions, and draft/submitted/rejected/cancelled/deleted Behavior records are excluded.
- Closed-term reads are allowed because Discipline is read-only.

Teacher App security posture:

- Teacher App routes require a teacher actor and active membership.
- `classId` is `TeacherSubjectAllocation.id`; ownership is checked before Attendance adapter work.
- Same-school unowned allocations and cross-school allocations are hidden.
- Guessed cross-school session ids through an owned wrapper return safe not-found.
- Non-teacher actors are denied.
- The 25H `today` route is read-only and no-leak tested.
- No scheduleId write alias exists.

Student/Parent App security posture:

- Student routes are own-student only.
- Parent routes are linked-child only.
- Cross-school/unlinked children use safe not-found behavior.
- Reports, Behavior, and Discipline routes avoid internal source fields.

## 7. Response Safety / No-Leak Review

The audited app-facing response surfaces avoid exposing:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- `answerKey`
- `correctAnswer`
- `correctAnswers`
- `isCorrect`
- `objectKey`
- `bucket`
- `signedUrl`
- raw metadata
- storage metadata
- `reviewedById`
- `submittedById`
- `markedById`
- teacher-only notes
- audit internals

Purpose-built app presenters are used for Student/Parent Behavior, Student/Parent Discipline, Parent Reports, and Teacher App Attendance. Core/dashboard presenters are not reused directly for Student/Parent Discipline.

Safe display fields are allowed where already part of the app contract, such as display names, date strings, submitted timestamps, occurred-at timestamps, category names, behavior titles, and app-safe notes/descriptions. These are not internal actor ids or audit metadata.

## 8. Test Evidence

Sprint 25I is docs-only. No unit/security/e2e suites were re-run before drafting this document. This audit relies on immediately preceding sprint evidence plus code/docs inspection, and then runs final docs-safe verification commands.

Latest known sprint evidence:

| Area | Evidence |
|---|---|
| 25B Attendance closed-term writes | Unit coverage in `roll-call.use-case.spec.ts`, `attendance-entry-correction.use-case.spec.ts`, and Teacher App adapter tests; closeout marked PASS. |
| 25C absence corrections | Unit, security, and e2e coverage in Attendance absence specs, `test/security/tenancy.attendance.spec.ts`, and `attendance-excuses-corrections.e2e-spec.ts`; closeout marked PASS. |
| 25E Discipline read models | `npm test -- --runInBand discipline` passed 4 suites / 11 tests; `student-app` passed 45 suites / 195 tests; `parent-app` passed 40 suites / 151 tests; Student/Parent tenancy and final closeout e2e suites passed per 25E closeout. |
| 25F Parent Reports alignment | `parent-app` passed 40 suites / 152 tests; `discipline` passed 4 suites / 11 tests; Parent tenancy and Parent final closeout e2e suites passed per 25F closeout. |
| 25H Teacher attendance read mapping | `teacher-app` passed 43 suites / 236 tests; `teacher-classroom-attendance` passed 3 suites / 22 tests; `attendance` passed 22 suites / 126 tests; Teacher App tenancy, classroom operations e2e, and attendance foundation e2e passed per 25H closeout. |
| Prisma/build | Prior closeouts report `npx prisma validate`, `npx prisma generate`, and `npm run build` passing where runtime code changed. Sprint 25I re-runs docs-safe validation/build commands. |

## 9. Remaining Deferred Gaps

| Gap | Reason deferred | Product decision needed? | Backend risk | Proposed future sprint | Blocks V1? |
|---|---|---:|---|---|---:|
| Teacher App arrival/dismissal semantics | No accepted mapping to Attendance source fields | Yes | Medium if guessed incorrectly | Teacher App Attendance Write Decision Audit | No |
| Teacher `lateMinutes` write support | Current Teacher write DTO records `late` only | Yes | Low/medium | Teacher App Attendance Write Decision Audit | No |
| Teacher early-leave write authority | 25H read support exists; write authority not approved | Yes | Medium | Teacher App Attendance Write Decision Audit | No |
| Teacher excuse authority | Could conflict with formal excuse workflow | Yes | Medium | Teacher App Attendance Write Decision Audit | No |
| PERIOD/scheduleId attendance writes | Schedule occurrence identity and period mapping are not accepted | Yes | Medium/high | Teacher App Attendance Write Decision Audit | No |
| Teacher App unsubmit/correction wrappers | Core routes exist; Teacher authority not scoped | Yes | Medium | Teacher App Attendance Write Decision Audit | No |
| Dashboard Discipline KPI | No accepted KPI formula or dashboard placement | Yes | Medium | Dashboard Discipline KPI Decision Audit | No |
| Combined Discipline score/percentage formula | Scoring affects Parent Reports/dashboard/student interpretation | Yes | Medium/high | Dashboard Discipline KPI or Reports Formula Decision Audit | No |
| Optional Behavior-feed compatibility mode | Existing Behavior routes intentionally remain positive/negative-only | Yes | Low/medium | Frontend Compatibility Decision Audit | No |
| `/attendance/context` | Convenience endpoint only | Possibly | Low | Attendance Contract Convenience Sprint | No |
| Attendance route aliases | Stable backend-native routes exist and are tested | Yes, only if frontend requires | Low/medium | API Compatibility Decision Audit | No |

## 10. Closeout Decision

The Attendance / Behavior / Discipline family can be closed for V1 backend planning as **V1_READY_WITH_DEFERRED_GAPS**.

No Sprint 25J runtime/security fix is required based on the evidence inspected. The remaining work is a set of product and contract decisions, not an active leak, duplicate source, broken source-of-truth model, or missing required V1 backend route.

## 11. Recommended Next Sprint

Recommended next sprint: **Sprint 26A - next module reality/contract audit**.

Alternative future decision sprints, if product prioritizes this family again:

- Dashboard Discipline KPI Decision Audit.
- Teacher App Attendance Write Decision Audit.
- Deployment Readiness Audit.

Do not choose a runtime sprint for this family until one of those decision audits approves a precise contract.

## 12. Final Verdict

Sprint 25I passes with final status **V1_READY_WITH_DEFERRED_GAPS** because Attendance core gaps were closed, Behavior remains a clean reviewed-record source, Discipline is implemented as a read-only derived app layer, Parent Reports alignment is additive and non-breaking, and Teacher App Attendance read mapping is closed without duplicate writes or aliases. Remaining gaps are product decisions around Teacher write authority, schedule/period mapping, dashboard KPIs, and combined scoring. Commit/deploy can proceed after normal review if verification remains clean.
