# Sprint 25J - Attendance Behavior Discipline Frontend Contract Handoff

## 1. Executive Handoff Decision

Sprint 25J decision: PASS.

Runtime changes: none. This sprint is documentation-only and does not change backend behavior, routes, DTOs, presenters, repositories, schema, tests, package metadata, or deployment configuration.

Backend family status: V1_READY_WITH_DEFERRED_GAPS.

Frontend integration status: READY_WITH_DOCUMENTED_DRIFT.

No runtime Sprint 25J or 25K is required for the current V1 Attendance / Behavior / Discipline surfaces. Frontend can integrate safely if it follows this handoff, uses the stable backend-native routes, and treats documented drift as adapter or product-decision work rather than backend defects.

## 2. How ADRs Should Be Read For This Family

ADR and handoff documents describe frontend expectations, screen needs, intended data, user actions, and route naming hints. They are not backend-logic authority when they conflict with current source-of-truth boundaries, API stability rules, or security posture.

Backend implementation remains governed by:

- current backend architecture and module boundaries
- API stability rules under `/api/v1`
- the school tenancy and permission model
- source-of-truth ownership
- presenter and adapter composition
- current tested code reality

Naming differences are not automatically backend bugs. If an ADR uses a field such as `name`, but a stable app-facing response exposes the same meaning as `title`, `displayName`, `nameEn`, or `nameAr`, frontend should map the stable response or request a future compatibility decision. Route examples in ADRs may express desired UX intent without requiring backend aliases.

Concrete examples:

- Teacher App `classId` in `/api/v1/teacher/classroom/:classId/attendance` is a `TeacherSubjectAllocation.id`, not a raw `Classroom.id`, timetable entry id, `scheduleId`, or schedule occurrence id.
- Discipline mixed feeds are not implemented inside Behavior routes. Discipline has dedicated derived read routes under `/student/discipline` and `/parent/children/:studentId/discipline`.
- Parent Reports `disciplinePercentage` is a legacy attendance-derived percentage, not a combined Attendance + Behavior Discipline score.
- Stable backend-native routes should not be renamed or aliased solely to match ADR route examples.

## 3. Source-of-Truth Map

| Concept | Backend owner | Frontend surface | Notes |
| --- | --- | --- | --- |
| AttendancePolicy | Core Attendance | Dashboard/Admin | Policy CRUD and effective policy resolution belong to core Attendance. |
| AttendanceSession | Core Attendance | Dashboard/Admin, Teacher App adapter | Roll-call session source of truth. Teacher App resolves or reads DAILY classroom sessions through core use-cases. |
| AttendanceEntry | Core Attendance | Dashboard/Admin, Teacher App adapter, derived Discipline | Attendance status source of truth for present, absent, late, excused, early_leave, and unmarked. |
| Absence/lateness/early_leave/excused incidents | Core Attendance | Dashboard/Admin, Student/Parent Discipline derived reads | Incidents are derived from submitted AttendanceEntry rows, not stored in a separate Absence model. |
| AttendanceExcuseRequest | Core Attendance | Dashboard/Admin/core flows | Formal excuse lifecycle remains separate from direct absence correction endpoints. |
| Attendance reports | Core Attendance | Dashboard/Admin | Summary, daily trend, and scope breakdown remain core attendance reports. |
| Behavior categories | Core Behavior | Dashboard/Admin, app-safe summaries | Category lifecycle and category metadata are owned by Behavior. |
| Behavior records | Core Behavior | Dashboard/Admin, Student/Parent Behavior, Discipline derived reads | Manual positive/negative behavior records remain Behavior-owned. App routes expose approved records only. |
| Behavior point ledger | Core Behavior | Dashboard/Admin, Student/Parent Behavior, Discipline summary | Approved behavior points are Behavior-owned; Discipline reads them without mutation. |
| Discipline timeline | Derived Discipline read layer | Student App, Parent App | Read-only derived timeline from submitted Attendance incidents and approved Behavior records. |
| Discipline summary | Derived Discipline read layer | Student App, Parent App, Parent Reports additive object | Raw derived counts and behavior points. No score formula in V1. |
| Parent Reports discipline summary | Parent Reports + derived Discipline | Parent App | Additive `discipline` object. Existing `disciplinePercentage` remains legacy attendance-derived. |
| Dashboard discipline KPI | Not implemented | Dashboard/Admin future surface | Deferred product decision. No route or formula exists in V1. |
| Teacher App attendance read/write | Teacher App adapter over Core Attendance | Teacher App | Teacher App is an adapter, not a second attendance source. Writes remain canonical roll-call session writes. |

## 4. Global Frontend Integration Rules

- All routes are under `/api/v1`.
- Use bearer authentication.
- Do not expect tenant or membership internals in app-facing responses, including `schoolId`, `organizationId`, `membershipId`, or `roleId`.
- Do not expect raw storage fields such as object keys, buckets, signed URLs, or file-storage metadata unless a route explicitly returns a safe asset contract.
- App-facing routes return presenter-shaped safe DTOs, not raw Prisma models.
- Do not rely on absent or deferred routes.
- Student mobile surfaces should use `/api/v1/student/*`.
- Parent mobile surfaces should use `/api/v1/parent/children/:studentId/*`.
- Teacher mobile surfaces should use `/api/v1/teacher/*`.
- Dashboard/Admin should use `/api/v1/attendance/*`, `/api/v1/behavior/*`, and `/api/v1/dashboard/*`.
- Student and Parent apps should not call Dashboard/Admin core Attendance routes unless product explicitly approves that cross-surface behavior.
- Read-only derived Discipline routes must not be used as write surfaces.

## 5. Core Attendance Contract For Dashboard/Admin

These are Dashboard/Admin/core Attendance routes. They are permission-gated and are not the primary Student/Parent/Teacher mobile contracts.

| Method | Route | Purpose | Main query/body | Main response shape | Frontend notes | Status |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/attendance/roll-call/roster` | Preview roll-call roster for a scope/date. | Scope, date, mode, term/year filters. | Roster items with student summary and current attendance state. | Read-only; does not create a session. | Stable |
| POST | `/api/v1/attendance/roll-call/session/resolve` | Resolve or create a roll-call session. | Scope, date, mode, academicYearId/termId. | Session and roster/entry data. | Creates only when allowed; closed terms reject new writes. | Stable |
| GET | `/api/v1/attendance/roll-call/sessions` | List roll-call sessions. | Scope/date/status filters, pagination. | Session list. | Closed-term reads allowed. | Stable |
| GET | `/api/v1/attendance/roll-call/sessions/:id` | Get session detail. | Path session id. | Session detail and entries. | Read-only. | Stable |
| PUT | `/api/v1/attendance/roll-call/sessions/:id/entries` | Bulk save draft entries. | Entries with studentId, status, optional minutes/reason/note fields supported by core DTOs. | Updated session/entries. | Closed/inactive term writes rejected. | Stable |
| PUT | `/api/v1/attendance/roll-call/sessions/:id/entries/:studentId` | Save one entry. | Status and optional core entry fields. | Updated entry/session detail. | Student/enrollment validation enforced. | Stable |
| POST | `/api/v1/attendance/roll-call/sessions/:id/submit` | Submit a draft session. | Optional submit metadata if supported. | Submitted session detail. | Closed/inactive term writes rejected. | Stable |
| POST | `/api/v1/attendance/roll-call/sessions/:id/unsubmit` | Reopen submitted session where permitted. | Optional reason if supported. | Draft/reopened session detail. | Closed/inactive term writes rejected. | Stable |
| POST | `/api/v1/attendance/roll-call/sessions/:sessionId/entries/:studentId/correct` | Correct a submitted entry. | Correction reason plus target status/minutes/reason fields supported by core DTOs. | Corrected entry/session detail. | Source AttendanceEntry remains the only write target. | Stable |
| GET | `/api/v1/attendance/absences` | List derived absence/lateness/early-leave/excused incidents. | Date/scope/status filters, pagination. | Absence incident rows derived from AttendanceEntry. | No separate Absence model. | Stable |
| GET | `/api/v1/attendance/absences/summary` | Summarize incidents. | Date/scope filters. | Counts by incident type/status. | Read-only derived summary. | Stable |
| PATCH | `/api/v1/attendance/absences/:id/excuse` | Directly mark an incident entry as excused. | `correctionReason`, optional `excuseReason`, optional `note`. | Corrected incident/entry-safe response. | Mutates AttendanceEntry only; does not create AttendanceExcuseRequest. | Stable |
| PATCH | `/api/v1/attendance/absences/:id/early-leave` | Correct an incident entry to early leave. | `earlyLeaveMinutes`, `correctionReason`, optional `note`/reason fields. | Corrected incident/entry-safe response. | Mutates AttendanceEntry only. | Stable |
| GET | `/api/v1/attendance/excuse-requests` | List formal excuse requests. | Status/date/student filters, pagination. | Excuse request list. | Formal lifecycle, separate from direct correction. | Stable |
| GET | `/api/v1/attendance/excuse-requests/:id` | Get one excuse request. | Path request id. | Excuse request detail. | Permission and tenancy scoped. | Stable |
| POST | `/api/v1/attendance/excuse-requests` | Create formal excuse request. | Student/session/date/reason fields and supported request body. | Created request. | Formal workflow only. | Stable |
| PATCH | `/api/v1/attendance/excuse-requests/:id` | Update pending excuse request. | Supported editable fields. | Updated request. | Does not replace direct absence correction route. | Stable |
| GET | `/api/v1/attendance/excuse-requests/:id/attachments` | List request attachments. | Path request id. | Safe attachment metadata. | Storage internals are not app contract fields. | Stable |
| POST | `/api/v1/attendance/excuse-requests/:id/attachments` | Attach evidence to request. | Multipart/file contract as implemented. | Safe attachment response. | Uses external storage; do not rely on raw storage metadata. | Stable |
| DELETE | `/api/v1/attendance/excuse-requests/:id/attachments/:attachmentId` | Remove request attachment. | Path ids. | Deletion result. | Permission scoped. | Stable |
| POST | `/api/v1/attendance/excuse-requests/:id/approve` | Approve request. | Approval body if supported. | Approved request and applied attendance effects. | Applies only to matching submitted sessions/entries. | Stable |
| POST | `/api/v1/attendance/excuse-requests/:id/reject` | Reject request. | Rejection body if supported. | Rejected request. | Does not excuse entries. | Stable |
| DELETE | `/api/v1/attendance/excuse-requests/:id` | Delete/cancel request where permitted. | Path request id. | Deletion/cancel result. | Permission scoped. | Stable |
| GET | `/api/v1/attendance/reports/summary` | Attendance report summary. | Date/scope filters. | Summary counts and rates. | Dashboard/Admin report surface. | Stable |
| GET | `/api/v1/attendance/reports/daily-trend` | Daily attendance trend. | Date range and scope filters. | Daily trend rows. | Dashboard/Admin report surface. | Stable |
| GET | `/api/v1/attendance/reports/scope-breakdown` | Breakdown by scope. | Date range and scope filters. | Scope breakdown rows. | Dashboard/Admin report surface. | Stable |

## 6. Teacher App Attendance Contract

Stable route base:

`/api/v1/teacher/classroom/:classId/attendance`

Important identity rule:

- `classId` means `TeacherSubjectAllocation.id`.
- It is not raw `Classroom.id`.
- It is not timetable entry id.
- It is not `scheduleId`.
- It is not `ScheduleOccurrence.id`.

Teacher App attendance is an adapter over Core Attendance. Core Attendance owns sessions and entries. Teacher App checks teacher ownership of the allocation before delegating to core roll-call use-cases.

| Method | Route | Read/write | Creates session? | Body/query | Response shape | Frontend usage | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/teacher/classroom/:classId/attendance/roster?date=YYYY-MM-DD` | Read | No | Required `date`; optional search/pagination if supported. | `items`/students with app-safe attendance status mapping. | Use for roster read without side effects. | Stable |
| GET | `/api/v1/teacher/classroom/:classId/attendance/today?date=YYYY-MM-DD` | Read | No | Required `date`; optional search/pagination if supported. | `date`, `classId`, `session`, `summary`, `students`. | Preferred classroom attendance screen model. | Stable |
| POST | `/api/v1/teacher/classroom/:classId/attendance/session/resolve` | Write/resolve | Yes, if no matching DAILY session exists and term is writable. | Date/scope data implied by allocation and request body. | DAILY session plus roster/entry state. | Use only when teacher intentionally starts/resolves a session. | Stable |
| GET | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId` | Read | No | Path session id. | Session detail and entries with teacher-safe mapping. | Read existing owned session. | Stable |
| PUT | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/entries` | Write | No | Entries with `studentId`, accepted status, optional `note`; DTO accepts arrival/dismissal fields but adapter does not persist them. | Updated entries/session state. | Use for DAILY present/absent/late/excused updates only. | Stable |
| POST | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/submit` | Write | No | Submit action body if supported. | Submitted session state. | Submit owned DAILY session. | Stable |

Teacher App status mapping:

| Core status | Teacher read status | Teacher write accepted? | Notes |
| --- | --- | --- | --- |
| PRESENT | `present` | Yes | Canonical write status. |
| ABSENT | `absent` | Yes | Canonical write status. |
| LATE | `late` | Yes | Status accepted, but `lateMinutes` write persistence is not supported by the Teacher adapter. |
| EXCUSED | `excused` | Yes | Status accepted, but `excuseReason` write persistence is not supported by the Teacher adapter. |
| EARLY_LEAVE | `early_leave` | No | Read-only mapping. Teacher early-leave write authority is deferred. |
| UNMARKED | `unmarked` | No | Read-only mapping. |
| Missing entry | `unmarked` | No | Missing/no-entry roster state is explicit `unmarked` in reads. |

Teacher App unsupported/deferred route and field behavior:

| Expectation | Current status | Frontend instruction |
| --- | --- | --- |
| `/api/v1/teacher/classrooms/*` plural aliases | Absent | Use singular `/teacher/classroom/:classId/*`. |
| `scheduleId` attendance write routes | Absent | Do not use schedule ids as attendance write targets. |
| PERIOD attendance writes | Absent | Only DAILY classroom writes are supported. |
| arrival/dismissal writes | Deferred | Do not send expecting persistence. |
| `early_leave` writes | Deferred | Do not send `early_leave` in Teacher update entries. |
| excuse reason writes | Deferred | Do not send expecting persistence from Teacher App. |
| late minutes writes | Deferred | Do not send expecting persistence from Teacher App. |
| Teacher unsubmit wrapper | Absent | Use Dashboard/Admin core route only if product permits that role/surface. |
| Teacher submitted correction wrapper | Absent | Use Dashboard/Admin core correction only if product permits that role/surface. |

## 7. Student App Behavior Contract

Routes:

- GET `/api/v1/student/behavior`
- GET `/api/v1/student/behavior/summary`
- GET `/api/v1/student/behavior/:recordId`

Student Behavior routes expose approved positive/negative Behavior records for the current student scope. They are not mixed Discipline feeds. Attendance incidents are not timeline items in these routes, although behavior summary compatibility fields may include attendance counters.

Typical frontend fields:

- `id`
- `type`: `positive` or `negative`
- `title`
- `date`
- `occurredAt` / `occurred_at`
- `points`
- `note`
- `status`: `approved`
- `category` with app-safe category labels
- summary counts and point totals

Student access is current-student only. Frontend must not pass arbitrary student ids to Student App behavior routes.

## 8. Parent App Behavior Contract

Routes:

- GET `/api/v1/parent/children/:studentId/behavior`
- GET `/api/v1/parent/children/:studentId/behavior/summary`
- GET `/api/v1/parent/children/:studentId/behavior/:recordId`

Parent Behavior routes expose approved positive/negative Behavior records for a linked child. They are not mixed Discipline feeds. The parent must pass a child `studentId` linked to the current parent in the current school. Unlinked or cross-school child access is denied or returned through safe not-found semantics according to existing Parent App behavior.

Typical frontend fields match Student Behavior, with an app-safe child wrapper where implemented.

## 9. Student App Discipline Contract

Routes:

- GET `/api/v1/student/discipline`
- GET `/api/v1/student/discipline/summary`

Student Discipline is the mixed read-only timeline and summary for:

- submitted Attendance incidents
- approved Behavior records

It has no writes and no Discipline source table.

Supported filters:

- `sourceType`: `attendance` or `behavior`
- `itemType` / `type`: `absence`, `lateness`, `early_leave`, `excused`, `positive`, `negative`
- `fromDate`
- `toDate`
- `page`
- `limit`

Timeline item fields:

- `id`
- `sourceType` / `source_type`
- `itemType` / `item_type`
- `occurredAt` / `occurred_at`
- `date`
- `title`
- `description`
- `severity`
- `pointsDelta` / `points_delta`
- `status`
- `category`
- `attendance`

Item types:

- `absence`
- `lateness`
- `early_leave`
- `excused`
- `positive`
- `negative`

Summary fields:

- `totalIncidents` / `total_incidents`
- `attendanceIncidentCount` / `attendance_incident_count`
- `absenceCount` / `absence_count`
- `lateCount` / `late_count`
- `earlyLeaveCount` / `early_leave_count`
- `excusedCount` / `excused_count`
- `positiveCount` / `positive_count`
- `negativeCount` / `negative_count`
- `behaviorPoints` / `behavior_points`
- `period`
- `dateText` / `date_text`

No `disciplineScore` or combined percentage formula is exposed in V1.

## 10. Parent App Discipline Contract

Routes:

- GET `/api/v1/parent/children/:studentId/discipline`
- GET `/api/v1/parent/children/:studentId/discipline/summary`

Parent Discipline has the same derived source model and response contract as Student Discipline, scoped to a linked child. The parent must pass a linked child `studentId`. Unlinked or cross-school child access is denied or returned through safe not-found semantics.

Parent Discipline remains read-only:

- no Discipline writes
- no Attendance writes
- no Behavior writes
- no score formula
- no source table

## 11. Parent Reports Discipline Contract

Routes:

- GET `/api/v1/parent/children/:studentId/reports`
- GET `/api/v1/parent/children/:studentId/reports/summary`

Parent Reports now include an additive `discipline` object derived from the Discipline summary. Existing fields remain stable.

Important compatibility rule:

- `disciplinePercentage` is legacy/backward-compatible attendance present-rate.
- `disciplinePercentage` is not a combined Discipline score.
- The new `discipline` object provides raw derived counts from Attendance + Behavior.
- If frontend needs a combined score, product must approve the formula before backend implements it.

Parent Reports top-level areas include:

- `academic`
- `attendance`
- `behavior`
- `discipline`
- `xp`
- `unavailable`

The `discipline` object follows the derived summary count contract and does not introduce `disciplineScore`, `combinedDisciplineScore`, or `combinedDisciplinePercentage`.

## 12. Dashboard / Admin Discipline Status

Existing Dashboard routes:

- GET `/api/v1/dashboard/summary`
- GET `/api/v1/dashboard/alerts`
- GET `/api/v1/dashboard/activity-feed`

There is no Dashboard Discipline KPI route in V1. Dashboard Discipline KPI, combined score, and combined percentage formula remain deferred product decisions. Frontend must not expect a Discipline KPI card unless product creates a future KPI contract.

Dashboard/Admin can use core Attendance and Behavior routes for their respective source-of-truth surfaces. Discipline dashboard analytics are not implemented as a separate dashboard module yet.

## 13. ADR / Frontend Expectation Drift Register

| Expectation | Current backend reality | Classification | Frontend action | Backend future action |
| --- | --- | --- | --- | --- |
| Teacher `classId` means classroom id | `classId` means `TeacherSubjectAllocation.id`. | DOCUMENTED_DRIFT | Pass allocation id from Teacher App classroom context. | Rename only through future compatibility decision, not now. |
| Teacher plural `/classrooms` aliases | Stable route base is singular `/teacher/classroom/:classId`. | FRONTEND_SHOULD_ADAPT | Use singular route. | Alias decision only if product approves. |
| Teacher `scheduleId` attendance writes | Not supported. | INTENTIONAL_DEFERRED | Do not use schedule ids for writes. | Teacher attendance write decision audit. |
| Teacher arrivalTime/dismissalTime persistence | DTO may accept fields, but current adapter does not persist them. | DOCUMENTED_DRIFT | Do not rely on persistence. | Product must define arrival/dismissal semantics. |
| Teacher `lateMinutes` write | Not supported by Teacher adapter. | INTENTIONAL_DEFERRED | Do not send expecting persistence. | Future write authority decision. |
| Teacher `early_leave` write | Read-only status in Teacher App. | INTENTIONAL_DEFERRED | Do not send `early_leave`. | Future teacher early-leave authority decision. |
| Teacher excuse reason write | Not supported by Teacher adapter. | INTENTIONAL_DEFERRED | Use formal/core flows only if role/surface permits. | Future teacher excuse authority decision. |
| Teacher unsubmit/correction wrappers | Not implemented. | INTENTIONAL_DEFERRED | Do not call Teacher wrapper routes for these actions. | Future wrapper decision if needed. |
| Behavior mixed feed expectation | Behavior routes remain positive/negative only. | BACKEND_STABLE | Use Discipline routes for mixed timeline. | Optional compatibility mode only by product decision. |
| Discipline separate route vs Behavior route | Discipline has dedicated read routes. | BACKEND_STABLE | Integrate `/discipline` routes. | None required for V1. |
| Parent `disciplinePercentage` means combined discipline | It is legacy attendance-derived. | DOCUMENTED_DRIFT | Use `discipline` object for raw combined counts. | Future score formula decision. |
| Dashboard Discipline KPI | No route/formula exists. | PRODUCT_DECISION_REQUIRED | Do not render as live KPI unless product scopes it. | Dashboard KPI decision audit. |
| Combined Discipline score | Not implemented. | PRODUCT_DECISION_REQUIRED | Do not compute backend score assumptions client-side unless product owns it. | Formula decision audit. |
| `/attendance/context` convenience endpoint | Not implemented. | INTENTIONAL_DEFERRED | Use existing context/source routes. | Attendance context decision audit. |
| Attendance route aliases | Backend-native routes remain stable. | BACKEND_STABLE | Use listed routes. | Alias decision only if compatibility need is approved. |
| snake_case/camelCase differences | Some app DTOs expose both; others are camelCase. | DOCUMENTED_DRIFT | Consume implemented fields only. | Add aliases only through compatibility decision. |

## 14. Request / Response Examples

### A. Teacher today response with no session

```json
{
  "date": "2026-02-10",
  "classId": "tsa_123",
  "session": null,
  "summary": {
    "totalCount": 2,
    "presentCount": 0,
    "absentCount": 0,
    "lateCount": 0,
    "excusedCount": 0,
    "earlyLeaveCount": 0,
    "unmarkedCount": 2,
    "markedCount": 0
  },
  "students": [
    {
      "studentId": "student_1",
      "displayName": "Student One",
      "attendanceStatus": "unmarked",
      "lateMinutes": null,
      "earlyLeaveMinutes": null,
      "excuseReason": null,
      "note": null
    },
    {
      "studentId": "student_2",
      "displayName": "Student Two",
      "attendanceStatus": "unmarked",
      "lateMinutes": null,
      "earlyLeaveMinutes": null,
      "excuseReason": null,
      "note": null
    }
  ]
}
```

### B. Teacher today response with draft session

```json
{
  "date": "2026-02-10",
  "classId": "tsa_123",
  "session": {
    "id": "session_123",
    "status": "draft",
    "mode": "daily",
    "submittedAt": null
  },
  "summary": {
    "totalCount": 4,
    "presentCount": 1,
    "absentCount": 0,
    "lateCount": 1,
    "excusedCount": 0,
    "earlyLeaveCount": 1,
    "unmarkedCount": 1,
    "markedCount": 3
  },
  "students": [
    {
      "studentId": "student_1",
      "displayName": "Student One",
      "attendanceStatus": "present",
      "lateMinutes": null,
      "earlyLeaveMinutes": null,
      "excuseReason": null,
      "note": null
    },
    {
      "studentId": "student_2",
      "displayName": "Student Two",
      "attendanceStatus": "late",
      "lateMinutes": 10,
      "earlyLeaveMinutes": null,
      "excuseReason": null,
      "note": "Arrived after roll call"
    },
    {
      "studentId": "student_3",
      "displayName": "Student Three",
      "attendanceStatus": "early_leave",
      "lateMinutes": null,
      "earlyLeaveMinutes": 20,
      "excuseReason": null,
      "note": null
    },
    {
      "studentId": "student_4",
      "displayName": "Student Four",
      "attendanceStatus": "unmarked",
      "lateMinutes": null,
      "earlyLeaveMinutes": null,
      "excuseReason": null,
      "note": null
    }
  ]
}
```

### C. Teacher update entries request

Accepted Teacher write statuses are `present`, `absent`, `late`, and `excused`.

```json
{
  "entries": [
    {
      "studentId": "student_1",
      "status": "present",
      "note": null
    },
    {
      "studentId": "student_2",
      "status": "late",
      "note": "Arrived after roll call"
    },
    {
      "studentId": "student_3",
      "status": "excused",
      "note": "Approved by office"
    }
  ]
}
```

### D. Teacher invalid/deferred early_leave write example

Frontend must not send `early_leave` to Teacher update entries in V1. `early_leave` is read-only in Teacher App.

```json
{
  "entries": [
    {
      "studentId": "student_3",
      "status": "early_leave",
      "note": "Not supported by Teacher App writes"
    }
  ]
}
```

Use core Dashboard/Admin absence correction only when the user role and product surface explicitly allow it.

### E. Student Discipline timeline example

```json
{
  "items": [
    {
      "id": "attendance:entry_100",
      "sourceType": "attendance",
      "source_type": "attendance",
      "itemType": "lateness",
      "item_type": "lateness",
      "occurredAt": "2026-02-10T07:45:00.000Z",
      "occurred_at": "2026-02-10T07:45:00.000Z",
      "date": "2026-02-10",
      "title": "Late attendance",
      "description": "Marked late",
      "severity": "low",
      "pointsDelta": 0,
      "points_delta": 0,
      "status": "submitted",
      "category": null,
      "attendance": {
        "status": "late",
        "lateMinutes": 10,
        "minutesLate": 10,
        "earlyLeaveMinutes": null,
        "minutesEarlyLeave": null,
        "excuseReason": null
      }
    },
    {
      "id": "behavior:record_200",
      "sourceType": "behavior",
      "source_type": "behavior",
      "itemType": "positive",
      "item_type": "positive",
      "occurredAt": "2026-02-09T09:15:00.000Z",
      "occurred_at": "2026-02-09T09:15:00.000Z",
      "date": "2026-02-09",
      "title": "Excellent teamwork",
      "description": "Helped classmates during group work",
      "severity": "info",
      "pointsDelta": 5,
      "points_delta": 5,
      "status": "approved",
      "category": {
        "id": "category_1",
        "code": "TEAMWORK",
        "nameAr": "العمل الجماعي",
        "nameEn": "Teamwork",
        "name_ar": "العمل الجماعي",
        "name_en": "Teamwork",
        "type": "positive"
      },
      "attendance": null
    }
  ],
  "total": 2,
  "page": 1,
  "limit": 20
}
```

### F. Student/Parent Discipline summary example

```json
{
  "totalIncidents": 6,
  "total_incidents": 6,
  "attendanceIncidentCount": 3,
  "attendance_incident_count": 3,
  "absenceCount": 1,
  "absence_count": 1,
  "lateCount": 1,
  "late_count": 1,
  "earlyLeaveCount": 1,
  "early_leave_count": 1,
  "excusedCount": 0,
  "excused_count": 0,
  "positiveCount": 2,
  "positive_count": 2,
  "negativeCount": 1,
  "negative_count": 1,
  "behaviorPoints": 3,
  "behavior_points": 3,
  "period": "current_term",
  "dateText": "Current term",
  "date_text": "Current term"
}
```

### G. Parent Reports summary discipline object example

`disciplinePercentage` remains the legacy attendance-derived percentage. Use `discipline` for raw derived Discipline counts.

```json
{
  "academic": {
    "averagePercentage": 91
  },
  "attendance": {
    "presentCount": 42,
    "absenceCount": 2,
    "latenessCount": 1
  },
  "behavior": {
    "positiveCount": 3,
    "negativeCount": 1,
    "totalBehaviorPoints": 8
  },
  "disciplinePercentage": 93,
  "discipline": {
    "totalIncidents": 7,
    "total_incidents": 7,
    "attendanceIncidentCount": 3,
    "attendance_incident_count": 3,
    "absenceCount": 2,
    "absence_count": 2,
    "lateCount": 1,
    "late_count": 1,
    "earlyLeaveCount": 0,
    "early_leave_count": 0,
    "excusedCount": 0,
    "excused_count": 0,
    "positiveCount": 3,
    "positive_count": 3,
    "negativeCount": 1,
    "negative_count": 1,
    "behaviorPoints": 8,
    "behavior_points": 8,
    "period": "current_term",
    "dateText": "Current term",
    "date_text": "Current term"
  },
  "xp": {
    "totalXp": 120
  },
  "unavailable": []
}
```

## 15. Frontend Do / Do Not Checklist

Do:

- Use `/api/v1`.
- Use bearer auth.
- Use Teacher allocation id as `classId`.
- Use Teacher `today` for the classroom attendance screen.
- Use `unmarked` and `early_leave` as Teacher read statuses.
- Use Discipline routes for mixed Attendance + Behavior timelines.
- Use Parent Reports `discipline` object for raw discipline counts.
- Treat `disciplinePercentage` as legacy attendance percentage.
- Treat Behavior routes as approved positive/negative behavior only.
- Treat Discipline routes as read-only.

Do not:

- Send `early_leave` to Teacher update entries.
- Send `lateMinutes` to Teacher update entries expecting persistence.
- Send `arrivalTime` or `dismissalTime` expecting persistence.
- Use `scheduleId` as an attendance write target.
- Use `/teacher/classrooms/*` plural aliases.
- Expect Dashboard Discipline KPI in V1.
- Treat `disciplinePercentage` as a combined Discipline score.
- Combine Behavior and Discipline semantics without product-approved mapping.
- Use core Dashboard Attendance routes from Student/Parent mobile apps.
- Expect internal tenant, storage, audit, or actor id fields in app-facing responses.

## 16. Backend Future Decision Queue

| Future decision sprint | Product must decide | Why not implemented now | Risk if implemented without decision |
| --- | --- | --- | --- |
| Teacher App Attendance Write Decision Audit | Whether teachers may write late minutes, early leave, excuses, unsubmit, or submitted corrections. | 25H intentionally closed read mapping only. | Accidental authority expansion or conflicting attendance workflows. |
| Dashboard Discipline KPI Decision Audit | Whether Dashboard needs Discipline KPI and what formula/source it uses. | No combined score formula is approved. | Misleading analytics or duplicated source of truth. |
| Reports Combined Discipline Score Formula Decision Audit | Whether to compute a combined Attendance + Behavior score and how to weight it. | 25F preserved `disciplinePercentage` compatibility and added raw counts only. | Breaking existing reports or inventing product semantics. |
| API Compatibility Alias Decision Audit | Whether ADR route aliases are needed for frontend compatibility. | Backend-native routes are stable and secure. | Route drift, duplicated tests, and long-term maintenance cost. |
| Attendance Context Convenience Decision Audit | Whether `/attendance/context` is needed. | Current source routes already exist; no runtime gap blocks V1. | Convenience endpoint may duplicate existing context rules. |
| Behavior Feed Compatibility Decision Audit | Whether Behavior routes should offer optional mixed-feed mode. | 25D/25E chose dedicated Discipline routes. | Behavior source-of-truth semantics become overloaded. |

## 17. Final Handoff Verdict

Frontend can integrate the Attendance / Behavior / Discipline family safely if it follows this handoff. No runtime changes are required in Sprint 25J, and no immediate 25K runtime sprint is needed. The family can be considered closed for V1 backend and frontend handoff with documented deferred gaps around Teacher App write semantics, Dashboard Discipline KPI, combined Discipline scoring, and optional compatibility aliases. Recommended next project sprint: Sprint 26A - next module reality/contract audit.
