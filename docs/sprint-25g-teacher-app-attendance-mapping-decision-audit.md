# Sprint 25G - Teacher App Attendance Mapping Decision Audit

## 1. Executive Decision

Decision: PASS.

Recommended option: Option C - Hybrid.

Runtime implementation may start in Sprint 25H only within a narrow adapter-backed scope. The safe 25H path is read-only Teacher App attendance mapping over the existing core Attendance source, plus explicit contract cleanup for statuses and summaries. New Teacher App write semantics for scheduleId, arrival, dismissal, early leave, or teacher-entered excuses should not start until product confirms the workflow and the exact mapping.

The Attendance / Behavior / Discipline feature family remains PARTIAL. Attendance core is strong and the Student/Parent Discipline and Parent Reports alignment work is complete for their scoped surfaces, but Teacher App attendance mapping and any Dashboard Discipline KPI contract remain deferred.

## 2. Current Backend Reality

Core Attendance is the source of truth for AttendancePolicy, AttendanceSession, AttendanceEntry, AttendanceExcuseRequest, attendance reports, and derived absence/incident views. It supports:

- Attendance modes `DAILY` and `PERIOD`.
- Attendance statuses `PRESENT`, `ABSENT`, `LATE`, `EXCUSED`, `EARLY_LEAVE`, and `UNMARKED`.
- Session scope hierarchy `SCHOOL`, `STAGE`, `GRADE`, `SECTION`, and `CLASSROOM`.
- Period metadata on sessions: `periodId`, `periodKey`, `periodLabelAr`, and `periodLabelEn`.
- Entry fields for `lateMinutes`, `earlyLeaveMinutes`, `excuseReason`, `note`, `markedById`, and `markedAt`.
- Closed-term write protection on roll-call session mutations after Sprint 25B.
- Dashboard/Core absence correction routes after Sprint 25C, mutating source `AttendanceEntry` rows only.

Teacher App attendance currently lives under `src/modules/teacher-app/classroom/attendance/**`. It is an app-facing adapter around core Attendance, not a separate source of truth. The current backend-native route base is:

`/api/v1/teacher/classroom/:classId/attendance`

Here `classId` is a `TeacherSubjectAllocation.id`, not a schedule occurrence id and not a raw classroom id. Teacher ownership is enforced by `TeacherAppAccessService.assertTeacherOwnsAllocation()` before the attendance adapter calls core Attendance use cases.

Teacher App attendance currently supports owned classroom DAILY roll-call:

- Read roster for a date without creating a session.
- Resolve or create a DAILY classroom session for a date.
- Read owned session detail.
- Update draft session entries.
- Submit draft session.

Teacher App attendance currently does not support:

- PERIOD attendance from Teacher App.
- A scheduleId-based attendance write route.
- Teacher App unsubmit route.
- Teacher App submitted-entry correction route.
- `early_leave` as an accepted Teacher App status.
- Mapping `arrivalTime` or `dismissalTime` to any Attendance source field.
- Surfacing core `EARLY_LEAVE` as `early_leave`; the current Teacher presenter maps `EARLY_LEAVE` and `UNMARKED` to `null`.

Teacher Schedule routes now expose app-facing schedule items with a computed read identity:

`scheduleId = timetable-entry:<entryId>:<YYYY-MM-DD>`

That schedule identity is useful for read composition, but it is not currently accepted by the Teacher App attendance adapter and there is no persisted `ScheduleOccurrence` model. Attendance sessions still resolve through classroom/date/mode/periodKey.

## 3. Route Inventory

### Core Attendance Routes

| Area | Method | Route | Current purpose | Security owner | Notes |
|---|---|---|---|---|---|
| Policies | GET | `/api/v1/attendance/policies` | List attendance policies | Dashboard permission + school scope | View-only. |
| Policies | GET | `/api/v1/attendance/policies/effective` | Resolve effective policy | Dashboard permission + school scope | Uses scope hierarchy. |
| Policies | GET | `/api/v1/attendance/policies/validate-name` | Validate policy naming | Dashboard permission + school scope | View validation helper. |
| Policies | POST | `/api/v1/attendance/policies` | Create policy | Dashboard permission + school scope | Closed-term protected. |
| Policies | PATCH | `/api/v1/attendance/policies/:id` | Update policy | Dashboard permission + school scope | Closed-term protected. |
| Policies | DELETE | `/api/v1/attendance/policies/:id` | Delete policy | Dashboard permission + school scope | Closed-term protected. |
| Roll call | GET | `/api/v1/attendance/roll-call/roster` | Roster plus existing session entries | Dashboard permission + school scope | Supports `DAILY` default and `PERIOD` with `periodKey`. |
| Roll call | POST | `/api/v1/attendance/roll-call/session/resolve` | Idempotently resolve/create session | Dashboard permission + school scope | Existing sessions remain readable; new closed-term sessions are rejected. |
| Roll call | GET | `/api/v1/attendance/roll-call/sessions` | List sessions | Dashboard permission + school scope | Read-only closed-term access allowed. |
| Roll call | GET | `/api/v1/attendance/roll-call/sessions/:id` | Session detail | Dashboard permission + school scope | Read-only closed-term access allowed. |
| Roll call | PUT | `/api/v1/attendance/roll-call/sessions/:id/entries` | Bulk save draft entries | Dashboard permission + school scope | Closed-term and DRAFT-only protected. |
| Roll call | PUT | `/api/v1/attendance/roll-call/sessions/:id/entries/:studentId` | Single entry upsert | Dashboard permission + school scope | Delegates to save behavior. |
| Roll call | POST | `/api/v1/attendance/roll-call/sessions/:id/submit` | Submit draft session | Dashboard permission + school scope | Closed-term protected. |
| Roll call | POST | `/api/v1/attendance/roll-call/sessions/:id/unsubmit` | Reopen submitted session | Dashboard permission + school scope | Closed-term protected. |
| Roll call | POST | `/api/v1/attendance/roll-call/sessions/:sessionId/entries/:studentId/correct` | Correct submitted entry | Dashboard permission + school scope | Requires submitted session and correction reason. |
| Absences | GET | `/api/v1/attendance/absences` | List submitted-session incidents | Dashboard permission + school scope | Derived from `AttendanceEntry`; no Absence table. |
| Absences | GET | `/api/v1/attendance/absences/summary` | Incident summary | Dashboard permission + school scope | Counts absent, late, early leave, excused. |
| Absences | PATCH | `/api/v1/attendance/absences/:id/excuse` | Mark incident entry as excused | Dashboard permission + school scope | Added in 25C; mutates source `AttendanceEntry`. |
| Absences | PATCH | `/api/v1/attendance/absences/:id/early-leave` | Correct incident to early leave | Dashboard permission + school scope | Added in 25C; mutates source `AttendanceEntry`. |
| Excuses | GET | `/api/v1/attendance/excuse-requests` | List excuse requests | Dashboard permission + school scope | Formal request lifecycle. |
| Excuses | GET | `/api/v1/attendance/excuse-requests/:id` | Excuse request detail | Dashboard permission + school scope | Safe scoped read. |
| Excuses | GET | `/api/v1/attendance/excuse-requests/:id/attachments` | List request attachments | Dashboard permission + school scope | Must not expose storage internals. |
| Excuses | POST | `/api/v1/attendance/excuse-requests` | Create request | Dashboard permission + school scope | Separate from direct absence corrections. |
| Excuses | PATCH | `/api/v1/attendance/excuse-requests/:id` | Update request | Dashboard permission + school scope | Formal workflow. |
| Excuses | POST | `/api/v1/attendance/excuse-requests/:id/attachments` | Link attachments | Dashboard permission + school scope | File authorization required. |
| Excuses | POST | `/api/v1/attendance/excuse-requests/:id/approve` | Approve request | Dashboard permission + school scope | Applies matching submitted entries. |
| Excuses | POST | `/api/v1/attendance/excuse-requests/:id/reject` | Reject request | Dashboard permission + school scope | Does not mutate attendance entries. |
| Excuses | DELETE | `/api/v1/attendance/excuse-requests/:id/attachments/:attachmentId` | Remove attachment link | Dashboard permission + school scope | Formal workflow. |
| Excuses | DELETE | `/api/v1/attendance/excuse-requests/:id` | Delete request | Dashboard permission + school scope | Formal workflow. |
| Reports | GET | `/api/v1/attendance/reports/summary` | Attendance summary | Dashboard permission + school scope | Submitted-session-derived counts. |
| Reports | GET | `/api/v1/attendance/reports/daily-trend` | Daily trend | Dashboard permission + school scope | Supports mode/period filters. |
| Reports | GET | `/api/v1/attendance/reports/scope-breakdown` | Scope breakdown | Dashboard permission + school scope | Supports scope hierarchy. |

### Teacher App Attendance/Classroom Routes

| Area | Method | Route | Current purpose | Security owner | Notes |
|---|---|---|---|---|---|
| Teacher classes | GET | `/api/v1/teacher/my-classes` | List owned allocations | Teacher App access | Uses `TeacherSubjectAllocation.id` as `classId`. |
| Teacher classes | GET | `/api/v1/teacher/my-classes/:classId` | Owned class detail | Teacher App access | No `scheduleId` exposure in this class surface. |
| Teacher classroom | GET | `/api/v1/teacher/classroom/:classId` | Classroom operational detail | Teacher App access | Schedule currently marked unavailable in this surface. |
| Teacher classroom | GET | `/api/v1/teacher/classroom/:classId/roster` | Owned classroom roster | Teacher App access | No attendance session mutation. |
| Teacher schedule | GET | `/api/v1/teacher/schedule` | Daily published timetable entries | Teacher App access | Returns computed `scheduleId` read identity. |
| Teacher schedule | GET | `/api/v1/teacher/schedule/week` | Weekly published timetable entries | Teacher App access | Read-only schedule composition. |
| Teacher attendance | GET | `/api/v1/teacher/classroom/:classId/attendance/roster` | Owned attendance roster for date | Teacher App access + core Attendance read | Does not create a session. DAILY only. |
| Teacher attendance | POST | `/api/v1/teacher/classroom/:classId/attendance/session/resolve` | Resolve/create DAILY classroom session | Teacher App access + core Attendance write | Delegates to `ResolveRollCallSessionUseCase`. |
| Teacher attendance | GET | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId` | Owned session detail | Teacher App access + core Attendance read | Safe not-found for wrong classroom/session. |
| Teacher attendance | PUT | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/entries` | Update draft entries | Teacher App access + core Attendance write | Delegates to `SaveRollCallEntriesUseCase`. |
| Teacher attendance | POST | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/submit` | Submit session | Teacher App access + core Attendance write | Delegates to `SubmitRollCallSessionUseCase`. |

The route inventory tests intentionally keep scheduleId-style attendance routes absent, including `/api/v1/teacher/classroom/:classId/attendance/scheduleId`.

### Related Absence/Correction Routes

| Area | Method | Route | Current purpose | Teacher App impact |
|---|---|---|---|---|
| Core correction | POST | `/api/v1/attendance/roll-call/sessions/:sessionId/entries/:studentId/correct` | Submitted-entry correction | Dashboard/Core route only. Teacher App has no wrapper. |
| Absence correction | PATCH | `/api/v1/attendance/absences/:id/excuse` | Direct incident-to-excused correction | Dashboard/Core route only. Teacher permission/workflow not decided. |
| Absence correction | PATCH | `/api/v1/attendance/absences/:id/early-leave` | Direct incident-to-early-leave correction | Dashboard/Core route only. Teacher permission/workflow not decided. |
| Excuse workflow | POST | `/api/v1/attendance/excuse-requests/:id/approve` | Formal request approval | Separate from Teacher App classroom attendance. |

### Dashboard/Admin Attendance Routes Relevant To The Decision

| Area | Method | Route | Current purpose | Notes |
|---|---|---|---|---|
| Dashboard | GET | `/api/v1/dashboard/summary` | Dashboard aggregate cards | Includes attendance counts, not a Teacher mapping layer. |
| Dashboard | GET | `/api/v1/dashboard/alerts` | Dashboard alerts | Attendance alerts include pending sessions, absent entries, late entries, pending excuses. |
| Dashboard | GET | `/api/v1/dashboard/activity-feed` | Audit/activity feed | Includes attendance submit/excuse events. |
| Attendance reports | GET | `/api/v1/attendance/reports/*` | Attendance analytics | Dashboard/Core read surface, not Teacher App. |

## 4. Mapping Matrix

| Product concept | Existing core Attendance support | Existing Teacher App support | Current route(s) | Source-of-truth model | App-facing response state | Gap status | Notes |
|---|---|---|---|---|---|---|---|
| DAILY attendance | `AttendanceMode.DAILY`, `periodKey = daily`, classroom scope supported | Yes, for owned allocation/date | Teacher attendance roster, resolve, entries, submit | `AttendanceSession`, `AttendanceEntry` | `present`, `absent`, `late`, `excused`, or `null` | PARTIAL | DAILY works, but no high-level today overview/summary route. |
| Period attendance | `AttendanceMode.PERIOD` with required `periodKey` and optional period labels | No Teacher App mapping | Core `/attendance/roll-call/*` only | `AttendanceSession`, `AttendanceEntry`, timetable period metadata | Not exposed in Teacher attendance | MISSING / NEEDS_PRODUCT_DECISION | Schedule routes expose period data separately; attendance adapter does not accept it. |
| Arrival | No explicit arrival timestamp field on `AttendanceEntry` | DTO accepts `arrivalTime`, adapter ignores it | Teacher entries update route | None currently | Always `null` | NEEDS_PRODUCT_DECISION | Product must decide whether arrival means status, timestamp, late minutes, or separate workflow. |
| Dismissal | No explicit dismissal timestamp field on `AttendanceEntry` | DTO accepts `dismissalTime`, adapter ignores it | Teacher entries update route | None currently | Always `null` | NEEDS_PRODUCT_DECISION | Product must decide if dismissal maps to early leave or a separate event. |
| Absence | `AttendanceStatus.ABSENT`; absences derived from submitted entries | Can mark `absent` in DAILY draft entries | Teacher entries update/detail; core absences reads | `AttendanceEntry` | `absent` | PARTIAL | Visibility exists for DAILY; no teacher incident timeline/correction wrapper. |
| Lateness | `AttendanceStatus.LATE` and `lateMinutes` | Can mark `late`, but does not submit `lateMinutes` | Teacher entries update/detail | `AttendanceEntry` | `late` | PARTIAL | Needs decision on late minutes and arrival-time mapping. |
| Early leave | `AttendanceStatus.EARLY_LEAVE` and `earlyLeaveMinutes`; core correction exists | Not accepted; core `EARLY_LEAVE` maps to `null` in Teacher presenter | Core roll-call/absences only | `AttendanceEntry` | `null` through Teacher App today | MISSING / CONTRACT_DRIFT | Must not be hidden as `null` long term if Teacher needs incident visibility. |
| Excused | `AttendanceStatus.EXCUSED`, `excuseReason`, formal requests | Can mark `excused`, but no `excuseReason` mapping | Teacher entries update/detail | `AttendanceEntry`, `AttendanceExcuseRequest` for formal flow | `excused` | PARTIAL | Teacher direct excused entry may be allowed today, but formal excuse authority needs product policy. |
| Unmarked | `AttendanceStatus.UNMARKED` default source state | Not accepted as explicit status; missing/no entry maps to `null` | Teacher roster/detail | `AttendanceEntry` absence or `UNMARKED` entry | `null` | PARTIAL / CONTRACT_DRIFT | Teacher ADR expects `unmarked`; backend currently emits `null`. |
| Correction | Core submitted-entry correction and 25C absence corrections | No Teacher App correction route | Core correction routes only | `AttendanceEntry` | Not exposed through Teacher App | MISSING / NEEDS_PRODUCT_DECISION | Teacher correction authority must be decided before adding wrappers. |
| Closed-term write protection | Complete for roll-call mutations after 25B | Inherited for update/submit through core use cases | Teacher entries update and submit | `Term.isActive` via session term | Safe error, no tenant ids | CLOSED | Existing Teacher adapter tests cover core error propagation. |
| Submitted vs draft sessions | DRAFT editable, SUBMITTED locked; submitted correction route exists | Teacher can update DRAFT and submit; no unsubmit/correct wrapper | Teacher update/detail/submit | `AttendanceSession.status` | `draft` or `submitted` | PARTIAL | Read is allowed; write follows core rules. Missing Teacher unsubmit/correction is intentional pending product decision. |

## 5. Option Evaluation

| Option | Pros | Cons | Backend risk | Frontend impact | Security risk | Route drift risk | Decision |
|---|---|---|---|---|---|---|---|
| Option A - Keep Teacher App roll-call-session native | Lowest runtime change. Existing routes are tested. Teacher writes already delegate to core Attendance and inherit closed-term protection. | Frontend must understand session resolve, session ids, DRAFT/SUBMITTED, and missing mapping semantics. Does not address arrival/dismissal/early_leave. | Low | Medium/high if frontend expects scheduleId contract. | Low because current ownership and core checks are strong. | Medium because ADR examples remain different. | Rejected as the complete V1 answer, but keep existing routes as canonical. |
| Option B - Add Teacher App classroom attendance mapping adapter broadly | Gives frontend classroom-friendly views and possible action shortcuts. Can hide Attendance internals behind app-safe presenters. | Easy to overbuild. Broad write shortcuts could duplicate core rules or accidentally redefine attendance semantics. Needs product decisions for arrival/dismissal/excused/early_leave. | Medium/high | Low after implemented, but route contract must be precise. | Medium unless every shortcut delegates to core and rechecks teacher ownership. | Medium/high if aliases are added just for naming. | Rejected as a broad 25H implementation. |
| Option C - Hybrid | Keeps current backend-native roll-call write routes stable. Adds only narrow mapping/read helpers where Teacher App cannot safely infer meaning. Defers ambiguous writes. Preserves Attendance as source of truth. | Requires staged implementation and explicit frontend/product coordination. Some ADR drift remains documented. | Low/medium | Medium initially, then lower with a today/summary adapter. | Low if presenter is app-safe and writes continue through core. | Low if no aliases are added by default. | Recommended for V1. |

## 6. Recommended V1 Contract

The accepted V1 direction is Option C.

Existing backend-native Teacher App attendance routes should remain canonical:

- `GET /api/v1/teacher/classroom/:classId/attendance/roster`
- `POST /api/v1/teacher/classroom/:classId/attendance/session/resolve`
- `GET /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId`
- `PUT /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/entries`
- `POST /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/submit`

No plural `/teacher/classrooms/*` alias should be added solely because the ADR uses plural examples. No scheduleId attendance write alias should be added until product confirms schedule occurrence attendance semantics.

Future 25H route candidates:

| Candidate | Read-only/write | Adapter-backed | Delegates to core Attendance | Safe for V1 | Decision |
|---|---|---:|---:|---:|---|
| `GET /api/v1/teacher/classroom/:classId/attendance/today?date=YYYY-MM-DD` | Read-only | Yes | Yes, read only | Yes | Recommended 25H if frontend needs one classroom-friendly attendance screen model. |
| `GET /api/v1/teacher/classroom/:classId/attendance/sessions?date=&mode=` | Read-only | Yes | Yes, read only | Yes | Optional if frontend needs teacher-scoped session listing; otherwise core/dashboard listing is enough. |
| Extend existing `GET /api/v1/teacher/classroom/:classId/attendance/roster` presenter to expose `unmarked` and `early_leave` safely | Read-only response mapping | Yes | Yes, read only | Yes | Recommended before adding new writes. |
| Extend existing `PUT /sessions/:sessionId/entries` to accept `lateMinutes` only | Write | Yes | Yes | Maybe | Safe only if product confirms teacher can record late minutes directly. |
| Extend existing `PUT /sessions/:sessionId/entries` to accept `early_leave` + `earlyLeaveMinutes` | Write | Yes | Yes | Deferred | Requires product decision on teacher early-leave authority. |
| Extend existing `POST /session/resolve` to accept `mode=PERIOD` and `periodKey` | Write | Yes | Yes | Deferred | Requires schedule/period mapping decision. |
| `PATCH /api/v1/teacher/classroom/:classId/attendance/entries/:entryId/early-leave` | Write | Yes | Must delegate to core correction | Deferred | Do not implement until submitted-session correction authority is approved. |
| `PATCH /api/v1/teacher/classroom/:classId/attendance/entries/:entryId/excuse` | Write | Yes | Must delegate to core correction/formal excuse policy | Deferred | Teacher-entered excuse may conflict with attendance-office/formal request workflow. |
| `POST /api/v1/teacher/classrooms/:scheduleId/attendance` | Write | Yes | Would need scheduleId resolver | Deferred/rejected for 25H | Do not add as alias. Consider only if frontend/product explicitly requires scheduleId write contract. |

Recommended 25H contract:

1. Keep existing Teacher App write routes as the canonical write surface.
2. Add a small read-only mapping layer only if needed, preferably a `today`/summary route under the existing singular route base.
3. Normalize Teacher App attendance read mapping so core `UNMARKED` and missing marks can be represented as `unmarked`, and core `EARLY_LEAVE` can be represented as `early_leave`, without adding write authority yet.
4. Keep schedule routes as schedule routes. If scheduleId attendance is approved later, resolve scheduleId inside an adapter to classroom/date/mode/periodKey and then call core Attendance; do not create a second attendance source.
5. Defer arrival/dismissal writes until product decides whether they are timestamps, late/early-leave minutes, or separate attendance events.

## 7. Source-of-Truth Rules

- Core Attendance owns `AttendanceSession` and `AttendanceEntry`.
- Teacher App must never directly own attendance state.
- Teacher App attendance routes may call core Attendance use cases through an adapter.
- Teacher App routes must not create a Teacher-specific attendance table, status enum, or lifecycle.
- Absence correction routes from Sprint 25C mutate `AttendanceEntry` only.
- Closed-term write protection from Sprint 25B must apply to all future Teacher App write paths.
- PERIOD attendance, if added, must still create or resolve core `AttendanceSession` rows with `mode = PERIOD` and a validated period key.
- Schedule/timetable data may help resolve classroom/date/period, but it must not become a duplicate attendance write source.
- Discipline remains a derived/read layer only and is unrelated to Teacher App attendance writes.
- Behavior must not be changed to represent attendance events.

## 8. Security Requirements for Sprint 25H

Required unit tests:

- Teacher App access service is called before any attendance adapter action.
- Teacher App read mapping does not expose `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, `passwordHash`, raw metadata, `objectKey`, `bucket`, `signedUrl`, or audit internals.
- Teacher App does not expose `markedById` or `submittedById` unless a future contract explicitly marks them teacher-safe.
- `EARLY_LEAVE` and `UNMARKED` read mappings are explicit and do not collapse into ambiguous `null`.
- Any future write route delegates to core Attendance and does not write through Prisma directly from the Teacher App controller.

Required security/e2e tests:

- Teacher can access only assigned/current classroom allocation scope.
- Teacher cannot read another teacher's same-school classroom attendance.
- Teacher cannot read cross-school classroom attendance.
- Teacher cannot guess a cross-school attendance session id through an owned-class wrapper.
- Teacher cannot update students outside the owned classroom roster.
- Non-teacher actors are denied Teacher App attendance routes.
- Closed-term writes are rejected for every Teacher App write path.
- Submitted-session edit rules remain enforced.
- Draft-session reads and writes remain limited to owned allocation context.
- Read-only closed-term routes remain allowed.
- Future period attendance must validate that the period/timetable occurrence belongs to the teacher's owned allocation, current school, date, and term.
- Safe 404 semantics must be used for unowned/cross-school resources.
- No internal field leaks in new response shapes.

## 9. Non-Goals

- No runtime implementation in Sprint 25G.
- No routes in Sprint 25G.
- No DTO, presenter, controller, use-case, repository, or module changes in Sprint 25G.
- No Prisma schema or migration changes.
- No Attendance lifecycle changes.
- No Teacher App runtime changes.
- No Student App or Parent App changes.
- No Parent Reports changes.
- No Discipline or Behavior changes.
- No deployment, Docker, PM2, server config, `main.ts`, or realtime gateway changes.
- No route aliases solely to match ADR examples.
- No Teacher App duplicate attendance source.
- No Teacher App Discipline writes.

## 10. Implementation Plan for Sprint 25H

Recommended next sprint: Sprint 25H - Teacher App Attendance Mapping Read Closeout.

Suggested 25H sequence:

1. Confirm with product whether 25H is read-only mapping only. If product cannot answer arrival/dismissal/teacher early-leave authority, keep 25H read-only.
2. Add a purpose-built Teacher App attendance mapping presenter/helper that maps core statuses to app-safe values, including `unmarked` and `early_leave`.
3. Add a narrow read-only `today` model only if frontend needs a single classroom attendance screen shape. It should compose existing Teacher App allocation ownership, core roll-call roster/session detail, and safe summary counts.
4. Keep existing write routes unchanged unless product explicitly approves a tiny non-breaking DTO extension such as `lateMinutes`.
5. Add tests for ownership, cross-school denial, no-leak, submitted/draft rules, closed-term inherited behavior, and route inventory.
6. Defer scheduleId-driven writes, period attendance writes, arrival/dismissal writes, teacher early-leave corrections, and teacher excuse shortcuts to a later sprint with explicit product decisions.

If product insists 25H must include writes, the smallest safe write path is to extend existing Teacher App session routes rather than adding aliases:

- Resolve owned schedule item or allocation into classroom/date/mode/periodKey.
- Call core roll-call use cases.
- Keep closed-term checks, roster validation, submitted-session rules, and audit behavior in core Attendance.
- Add no new storage and no direct Prisma writes from controllers.

## 11. Remaining Gaps

- Arrival semantics: Does arrival mean timestamp capture, late threshold calculation, or only display text?
- Dismissal semantics: Does dismissal mean normal dismissal, early leave, or a separate pickup/attendance event?
- Period attendance: Should Teacher App attendance be per scheduled lesson, per classroom daily roll-call, or both?
- `scheduleId` mapping: Should attendance writes accept computed schedule occurrence ids, or should schedule only help the frontend choose class/date/period?
- Early leave workflow: Can a teacher create early-leave marks directly, or should only attendance office/dashboard corrections do that?
- Excused workflow: Can a teacher mark `excused`, or should excuses flow through formal request/approval only?
- Lateness minutes: Should Teacher App record `lateMinutes`, derive it from arrival time, or only record `late` status?
- Unmarked visibility: Should Teacher App expose `unmarked` instead of `null` for all not-yet-marked students?
- Teacher App summary: Does the classroom attendance screen need `unmarkedCount`, `presentCount`, `absentCount`, `lateCount`, `excusedCount`, `earlyLeaveCount`, `resolvedCount`, and `totalCount`?
- Parent/student visibility: Should any Teacher App attendance mapping changes alter Student/Parent discipline timelines? Current answer: no.
- Dashboard KPI alignment: Dashboard Discipline KPI remains out of scope unless product scopes it.

## 12. Final Decision

Sprint 25G passes as a docs-only decision audit.

The exact next sprint recommendation is Sprint 25H - Teacher App Attendance Mapping Read Closeout, using Option C:

- Keep current Teacher App roll-call session write routes as canonical.
- Add only adapter-backed read/model mapping where needed.
- Do not add route aliases by default.
- Do not add scheduleId attendance writes until product approves the schedule occurrence mapping.
- Do not implement arrival, dismissal, early-leave, or teacher-entered excuse writes until their product semantics are explicit.
- Continue to delegate all Attendance state changes to core Attendance.
