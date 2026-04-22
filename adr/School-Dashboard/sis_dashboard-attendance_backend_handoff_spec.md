# Attendance Backend Handoff Spec

## Scope

This handoff is based on the current attendance module in `sis_dashboard`.

Confirmed attendance routes and submodules:
- `/attendance` redirects to `/attendance/policies`
- `/attendance/policies`
- `/attendance/roll-call`
- `/attendance/absences`
- `/attendance/excuses`

This spec covers the backend contract needed for:
- shared year/term attendance context
- attendance policies
- roll call sessions and entries
- derived absences/incidents
- excuse requests and decisions

## High-level backend rules

1. **Attendance is term-scoped**  
   Almost every attendance flow is keyed by `yearId` and `termId`.

2. **Closed terms are read-only**  
   The shared attendance context exposes `isReadOnly` when the selected term is closed. The backend should enforce this on all writes.

3. **Scope hierarchy matters**  
   Attendance scope is hierarchical:
   - `SCHOOL`
   - `STAGE`
   - `GRADE`
   - `SECTION`
   - `CLASSROOM`

4. **Policy resolution is hierarchical**  
   Effective attendance policy priority is:
   - `CLASSROOM`
   - `SECTION`
   - `GRADE`
   - `STAGE`
   - `SCHOOL`

5. **Absences are derived from roll call**  
   The absences page is not a standalone source of truth. It is computed from submitted roll-call sessions and their entries.

6. **Excuse requests affect attendance**  
   Approved excuse requests are applied back to attendance and keep `linkedSessionIds`.

---

## 1) Shared enums

### Attendance scope
```json
{
  "AttendanceScopeType": ["SCHOOL", "STAGE", "GRADE", "SECTION", "CLASSROOM"]
}
```

### Attendance policy mode
```json
{
  "AttendanceMode": ["DAILY", "PERIOD"],
  "DailyComputationStrategy": ["MANUAL", "DERIVED_FROM_PERIODS"]
}
```

### Roll call
```json
{
  "AttendanceStatus": ["PRESENT", "ABSENT", "LATE", "EXCUSED", "EARLY_LEAVE", "UNMARKED"],
  "AttendanceSessionStatus": ["DRAFT", "SUBMITTED"],
  "AttendanceSessionMode": ["DAILY", "PERIOD"]
}
```

### Absences
```json
{
  "AttendanceIncidentType": ["ABSENT", "LATE", "EARLY_LEAVE", "EXCUSED", "UNMARKED"],
  "AttendanceGranularity": ["PERIOD", "DAILY_DERIVED"]
}
```

### Excuses
```json
{
  "ExcuseType": ["ABSENCE", "LATE", "EARLY_LEAVE"],
  "ExcuseStatus": ["PENDING", "APPROVED", "REJECTED"]
}
```

---

## 2) Shared context and reference endpoints

These are needed across all attendance tabs.

### `GET /api/academics/years`
Response:
```json
{
  "items": [
    {
      "id": "year-1",
      "name": "2024-2025",
      "nameAr": "2024-2025",
      "nameEn": "2024-2025",
      "startDate": "2024-09-01",
      "endDate": "2025-06-30"
    }
  ]
}
```

### `GET /api/academics/terms?yearId={yearId}`
Response:
```json
{
  "items": [
    {
      "id": "term-1-1",
      "yearId": "year-1",
      "name": "Term 1",
      "nameAr": "الفصل الأول",
      "nameEn": "Term 1",
      "status": "open",
      "startDate": "2024-09-01",
      "endDate": "2024-12-31"
    }
  ]
}
```

### `GET /api/academics/structure-tree?yearId={yearId}&termId={termId}`
Must return:
- stages
- grades
- sections
- classrooms

### `GET /api/academics/timetable/configs?termId={termId}`
Needed for:
- policy selected periods
- period-based roll call
- derived daily attendance logic

### `GET /api/attendance/context?yearId={yearId}&termId={termId}`
Optional convenience endpoint.

Suggested response:
```json
{
  "yearId": "year-1",
  "termId": "term-1-1",
  "termStatus": "open",
  "termRange": {
    "startDate": "2024-09-01",
    "endDate": "2024-12-31"
  },
  "isReadOnly": false
}
```

---

## 3) Suggested database tables

## `attendance_policies`
```json
{
  "id": "policy-uuid",
  "yearId": "year-1",
  "termId": "term-1-1",
  "nameAr": "سياسة الحضور الافتراضية",
  "nameEn": "Default Attendance Policy",
  "descriptionAr": "السياسة الافتراضية للحضور",
  "descriptionEn": "Default attendance policy",
  "notesAr": "",
  "notesEn": "",
  "scopeType": "SCHOOL",
  "scopeIds": null,
  "mode": "PERIOD",
  "dailyComputationStrategy": null,
  "selectedPeriodIds": ["p1", "p2", "p3"],
  "lateThresholdMinutes": 15,
  "earlyLeaveThresholdMinutes": 15,
  "autoAbsentAfterMinutes": null,
  "absentIfMissedPeriodsCount": 2,
  "allowExcuses": true,
  "requireExcuseReason": false,
  "requireAttachmentForExcuse": false,
  "notifyTeachers": true,
  "notifyStudents": false,
  "notifyGuardians": true,
  "notifyOnAbsent": true,
  "notifyOnLate": true,
  "notifyOnEarlyLeave": false,
  "effectiveStartDate": "2024-09-01",
  "effectiveEndDate": "2024-12-31",
  "isActive": true,
  "createdAt": "2024-08-15T00:00:00Z",
  "updatedAt": "2024-08-15T00:00:00Z"
}
```

## `attendance_sessions`
Unique key recommendation:
- `yearId`
- `termId`
- `date`
- `scopeType`
- normalized scope ids
- `mode`
- `periodId` nullable

```json
{
  "id": "session-uuid",
  "yearId": "year-1",
  "termId": "term-1-1",
  "date": "2024-09-15",
  "scopeType": "CLASSROOM",
  "scopeIds": {
    "stageId": "stage-1",
    "gradeId": "grade-1",
    "sectionId": "section-1",
    "classroomId": "classroom-1"
  },
  "mode": "PERIOD",
  "periodId": "p1",
  "periodIndex": 1,
  "periodNameAr": "الحصة الأولى",
  "periodNameEn": "Period 1",
  "status": "DRAFT",
  "createdAt": "2024-09-15T07:00:00Z",
  "updatedAt": "2024-09-15T07:10:00Z"
}
```

## `attendance_entries`
```json
{
  "id": "entry-uuid",
  "sessionId": "session-uuid",
  "studentId": "student-uuid",
  "status": "LATE",
  "minutesLate": 10,
  "minutesEarlyLeave": null,
  "excuseReason": null,
  "excuseAttachments": [],
  "note": "Traffic",
  "updatedAt": "2024-09-15T07:12:00Z"
}
```

## `attendance_excuse_requests`
```json
{
  "id": "excuse-uuid",
  "yearId": "year-1",
  "termId": "term-1-1",
  "studentId": "student-uuid",
  "studentNameAr": "أحمد علي",
  "studentNameEn": "Ahmed Ali",
  "studentNumber": "ST-1001",
  "scopeType": "CLASSROOM",
  "scopeIds": {
    "gradeId": "grade-1",
    "sectionId": "section-1",
    "classroomId": "classroom-1"
  },
  "type": "ABSENCE",
  "dateFrom": "2024-09-20",
  "dateTo": "2024-09-20",
  "selectedPeriodIds": [],
  "minutesLate": null,
  "minutesEarlyLeave": null,
  "reasonAr": "موعد طبي",
  "reasonEn": "Medical appointment",
  "attachments": [
    {
      "id": "att-1",
      "name": "medical-note.pdf",
      "size": 248000,
      "type": "application/pdf",
      "url": "https://files.example.com/medical-note.pdf"
    }
  ],
  "status": "PENDING",
  "decisionNote": null,
  "decidedAt": null,
  "decidedBy": null,
  "createdAt": "2024-09-19T10:00:00Z",
  "updatedAt": "2024-09-19T10:00:00Z",
  "linkedSessionIds": []
}
```

## `attendance_excuse_request_attachments`
Can be stored inline as JSON if preferred, but a separate table is safer for file lifecycle.

---

## 4) Attendance policies

## Frontend needs
- list policies by term
- create/edit/delete policy
- activate/deactivate policy
- resolve effective policy for a scope/date
- unique name checks within same scope
- period selection from timetable config

## Policy backend rules
- uniqueness should be checked within the same `yearId + termId + scopeType + scopeIds`
- effective policy should honor date range and active flag
- priority order: `CLASSROOM > SECTION > GRADE > STAGE > SCHOOL`

### `GET /api/attendance/policies?yearId={yearId}&termId={termId}`
Response:
```json
{
  "items": [
    {
      "id": "policy-1",
      "yearId": "year-1",
      "termId": "term-1-1",
      "nameAr": "سياسة الحضور الافتراضية",
      "nameEn": "Default Attendance Policy",
      "scopeType": "SCHOOL",
      "scopeIds": null,
      "mode": "PERIOD",
      "selectedPeriodIds": ["p1", "p2"],
      "lateThresholdMinutes": 15,
      "earlyLeaveThresholdMinutes": 15,
      "absentIfMissedPeriodsCount": 2,
      "allowExcuses": true,
      "requireExcuseReason": false,
      "requireAttachmentForExcuse": false,
      "notifyTeachers": true,
      "notifyStudents": false,
      "notifyGuardians": true,
      "notifyOnAbsent": true,
      "notifyOnLate": true,
      "notifyOnEarlyLeave": false,
      "effectiveStartDate": "2024-09-01",
      "effectiveEndDate": "2024-12-31",
      "isActive": true,
      "createdAt": "2024-08-15T00:00:00Z",
      "updatedAt": "2024-08-15T00:00:00Z"
    }
  ]
}
```

### `POST /api/attendance/policies`
Request:
```json
{
  "yearId": "year-1",
  "termId": "term-1-1",
  "nameAr": "سياسة الصف الأول",
  "nameEn": "Grade 1 Policy",
  "descriptionAr": "",
  "descriptionEn": "",
  "notesAr": "",
  "notesEn": "",
  "scopeType": "GRADE",
  "scopeIds": {
    "stageId": "stage-1",
    "gradeId": "grade-1"
  },
  "mode": "PERIOD",
  "dailyComputationStrategy": null,
  "selectedPeriodIds": ["p1", "p2", "p3"],
  "lateThresholdMinutes": 10,
  "earlyLeaveThresholdMinutes": 10,
  "absentIfMissedPeriodsCount": 3,
  "allowExcuses": true,
  "requireExcuseReason": true,
  "requireAttachmentForExcuse": true,
  "notifyTeachers": true,
  "notifyStudents": true,
  "notifyGuardians": true,
  "notifyOnAbsent": true,
  "notifyOnLate": false,
  "notifyOnEarlyLeave": false,
  "effectiveStartDate": "2024-09-01",
  "effectiveEndDate": "2024-12-31",
  "isActive": true
}
```

### `PATCH /api/attendance/policies/:id`
Supports full updates and simple toggle:
```json
{
  "isActive": false
}
```

### `DELETE /api/attendance/policies/:id`

### `GET /api/attendance/policies/effective`
Query:
- `yearId`
- `termId`
- `scopeType`
- scope ids
- `date`

Example:
`GET /api/attendance/policies/effective?yearId=year-1&termId=term-1-1&scopeType=CLASSROOM&gradeId=grade-1&sectionId=section-1&classroomId=classroom-1&date=2024-09-15`

Response:
```json
{
  "policy": {
    "id": "policy-1",
    "scopeType": "SCHOOL",
    "mode": "PERIOD",
    "selectedPeriodIds": ["p1", "p2"],
    "lateThresholdMinutes": 15,
    "earlyLeaveThresholdMinutes": 15,
    "allowExcuses": true,
    "requireExcuseReason": false,
    "requireAttachmentForExcuse": false
  }
}
```

### `GET /api/attendance/policies/validate-name`
Query:
- `yearId`
- `termId`
- `scopeType`
- scope ids
- `nameAr`
- `nameEn`
- optional `excludeId`

Response:
```json
{
  "uniqueAr": true,
  "uniqueEn": false
}
```

---

## 5) Roll call

## Frontend needs
- fetch roster by scope
- resolve effective policy
- create or fetch session for date/scope/period
- save draft entries
- submit session
- unsubmit session
- fetch sessions in date range
- fetch entries for session(s)
- update or create single entry for corrections
- export current session

## Important backend rules
- period mode requires `periodId`
- session is editable in `DRAFT`, locked in `SUBMITTED`
- unsubmit reopens a submitted session
- roster requires complete scope selection
- writes should be blocked if selected term is closed

### `GET /api/attendance/roster`
Query:
- `scopeType`
- scope ids

Response:
```json
{
  "items": [
    {
      "id": "student-1",
      "nameAr": "أحمد علي",
      "nameEn": "Ahmed Ali",
      "studentNumber": "ST-1001",
      "photoUrl": null
    }
  ]
}
```

### `POST /api/attendance/sessions/resolve`
This replaces the current frontend `getOrCreateSession(...)` behavior.

Request:
```json
{
  "yearId": "year-1",
  "termId": "term-1-1",
  "date": "2024-09-15",
  "scopeType": "CLASSROOM",
  "scopeIds": {
    "stageId": "stage-1",
    "gradeId": "grade-1",
    "sectionId": "section-1",
    "classroomId": "classroom-1"
  },
  "mode": "PERIOD",
  "periodId": "p1",
  "periodIndex": 1,
  "periodNameAr": "الحصة الأولى",
  "periodNameEn": "Period 1"
}
```

Response:
```json
{
  "session": {
    "id": "session-uuid",
    "yearId": "year-1",
    "termId": "term-1-1",
    "date": "2024-09-15",
    "scopeType": "CLASSROOM",
    "scopeIds": {
      "stageId": "stage-1",
      "gradeId": "grade-1",
      "sectionId": "section-1",
      "classroomId": "classroom-1"
    },
    "mode": "PERIOD",
    "periodId": "p1",
    "periodIndex": 1,
    "periodNameAr": "الحصة الأولى",
    "periodNameEn": "Period 1",
    "status": "DRAFT",
    "createdAt": "2024-09-15T07:00:00Z",
    "updatedAt": "2024-09-15T07:00:00Z"
  },
  "entries": []
}
```

### `PUT /api/attendance/sessions/:id/entries`
Request:
```json
{
  "entries": [
    {
      "id": "entry-1",
      "studentId": "student-1",
      "status": "LATE",
      "minutesLate": 8,
      "minutesEarlyLeave": null,
      "excuseReason": null,
      "excuseAttachments": [],
      "note": "Traffic"
    }
  ]
}
```

Response:
```json
{
  "session": {
    "id": "session-uuid",
    "status": "DRAFT",
    "updatedAt": "2024-09-15T07:15:00Z"
  },
  "entries": [
    {
      "id": "entry-1",
      "sessionId": "session-uuid",
      "studentId": "student-1",
      "status": "LATE",
      "minutesLate": 8,
      "updatedAt": "2024-09-15T07:15:00Z"
    }
  ]
}
```

### `POST /api/attendance/sessions/:id/submit`
Response:
```json
{
  "id": "session-uuid",
  "status": "SUBMITTED",
  "updatedAt": "2024-09-15T07:20:00Z"
}
```

### `POST /api/attendance/sessions/:id/unsubmit`
Response:
```json
{
  "id": "session-uuid",
  "status": "DRAFT",
  "updatedAt": "2024-09-15T07:25:00Z"
}
```

### `GET /api/attendance/sessions`
Query:
- `yearId`
- `termId`
- optional `startDate`
- optional `endDate`
- optional `scopeType`
- optional scope ids

### `GET /api/attendance/sessions/:id/entries`

### `PATCH /api/attendance/entries/upsert`
Used by absences corrections and targeted roll-call edits.

Request:
```json
{
  "yearId": "year-1",
  "termId": "term-1-1",
  "sessionId": "session-uuid",
  "studentId": "student-1",
  "patch": {
    "status": "EXCUSED",
    "excuseReason": "Medical note attached",
    "excuseAttachments": [
      {
        "id": "att-1",
        "name": "medical-note.pdf",
        "size": 248000,
        "type": "application/pdf",
        "url": "https://files.example.com/medical-note.pdf"
      }
    ]
  }
}
```

---

## 6) Absences

## Frontend needs
- list absence/late/early-leave/excused incidents
- KPI summary
- scope/date/status/search filters
- edit excuse on a record
- edit early-leave minutes
- policy-aware excuse behavior

## Important backend rules
- source is **submitted roll-call sessions only**
- current UI fixes the page to `granularities = ["PERIOD"]`
- types support `DAILY_DERIVED`, but the current page is effectively period-first
- derived daily status is optional but backend can support it

### `GET /api/attendance/absences`
Query:
- `yearId`
- `termId`
- `dateFrom`
- `dateTo`
- `scopeType`
- scope ids
- `status`
- `granularities[]`
- `onlyUnexcused`
- `search`

Response:
```json
{
  "items": [
    {
      "id": "entry-1-period",
      "yearId": "year-1",
      "termId": "term-1-1",
      "date": "2024-09-15",
      "studentId": "student-1",
      "studentNumber": "ST-1001",
      "studentNameAr": "أحمد علي",
      "studentNameEn": "Ahmed Ali",
      "scopeType": "CLASSROOM",
      "scopeIds": {
        "gradeId": "grade-1",
        "sectionId": "section-1",
        "classroomId": "classroom-1"
      },
      "gradeNameAr": "الصف الأول",
      "gradeNameEn": "Grade 1",
      "sectionNameAr": "شعبة أ",
      "sectionNameEn": "Section A",
      "classroomNameAr": "فصل 101",
      "classroomNameEn": "Classroom 101",
      "granularity": "PERIOD",
      "periodIndex": 1,
      "periodNameAr": "الحصة الأولى",
      "periodNameEn": "Period 1",
      "status": "LATE",
      "minutesLate": 8,
      "minutesEarlyLeave": null,
      "excuse": null,
      "sourceSessionId": "session-uuid",
      "updatedAt": "2024-09-15T07:15:00Z"
    }
  ],
  "kpis": {
    "totalIncidents": 24,
    "absentCount": 8,
    "excusedCount": 5,
    "lateCount": 7,
    "earlyLeaveCount": 4,
    "dailyAbsentCount": 0
  }
}
```

### `PATCH /api/attendance/absences/:id/excuse`
Recommended request shape:
```json
{
  "reason": "Medical appointment",
  "attachments": [
    {
      "id": "att-1",
      "name": "medical-note.pdf",
      "size": 248000,
      "type": "application/pdf",
      "url": "https://files.example.com/medical-note.pdf"
    }
  ]
}
```

Backend behavior:
- must resolve underlying `sourceSessionId`
- should reject update if record is derived and has no editable session source
- should update underlying attendance entry to `EXCUSED`

### `PATCH /api/attendance/absences/:id/early-leave`
Request:
```json
{
  "minutes": 12
}
```

Backend behavior:
- must resolve underlying source entry
- set status to `EARLY_LEAVE`
- update `minutesEarlyLeave`

---

## 7) Excuse requests

## Frontend needs
- list excuse requests
- create/update/delete pending requests
- approve/reject pending requests
- validate against policy and term range
- resolve effective policy for selected request
- store attachments and optional decision note
- apply approved requests back to attendance and return linked session ids

## Important backend rules
- only `PENDING` requests are editable/deletable
- only `PENDING` requests are approvable/rejectable
- approval must validate policy again before applying to attendance
- approved requests should store `linkedSessionIds`

### `GET /api/attendance/excuse-requests`
Query:
- `yearId`
- `termId`
- `dateFrom`
- `dateTo`
- `scopeType`
- scope ids
- `status`
- `type`
- `search`
- `hasAttachment`

Response:
```json
{
  "items": [
    {
      "id": "excuse-1",
      "yearId": "year-1",
      "termId": "term-1-1",
      "studentId": "student-1",
      "studentNameAr": "أحمد علي",
      "studentNameEn": "Ahmed Ali",
      "studentNumber": "ST-1001",
      "scopeType": "CLASSROOM",
      "scopeIds": {
        "gradeId": "grade-1",
        "sectionId": "section-1",
        "classroomId": "classroom-1"
      },
      "type": "ABSENCE",
      "dateFrom": "2024-09-20",
      "dateTo": "2024-09-20",
      "selectedPeriodIds": [],
      "periodIndexes": [],
      "minutesLate": null,
      "minutesEarlyLeave": null,
      "reasonAr": "موعد طبي",
      "reasonEn": "Medical appointment",
      "attachments": [
        {
          "id": "att-1",
          "name": "medical-note.pdf",
          "size": 248000,
          "type": "application/pdf",
          "url": "https://files.example.com/medical-note.pdf"
        }
      ],
      "status": "PENDING",
      "decisionNote": null,
      "decidedAt": null,
      "decidedBy": null,
      "createdAt": "2024-09-19T10:00:00Z",
      "updatedAt": "2024-09-19T10:00:00Z",
      "linkedSessionIds": []
    }
  ]
}
```

### `POST /api/attendance/excuse-requests`
Request:
```json
{
  "yearId": "year-1",
  "termId": "term-1-1",
  "studentId": "student-1",
  "studentNameAr": "أحمد علي",
  "studentNameEn": "Ahmed Ali",
  "studentNumber": "ST-1001",
  "scopeType": "CLASSROOM",
  "scopeIds": {
    "gradeId": "grade-1",
    "sectionId": "section-1",
    "classroomId": "classroom-1"
  },
  "type": "ABSENCE",
  "dateFrom": "2024-09-20",
  "dateTo": "2024-09-20",
  "selectedPeriodIds": [],
  "minutesLate": null,
  "minutesEarlyLeave": null,
  "reasonAr": "موعد طبي",
  "reasonEn": "Medical appointment",
  "attachments": [
    {
      "id": "att-1",
      "name": "medical-note.pdf",
      "size": 248000,
      "type": "application/pdf",
      "url": "https://files.example.com/medical-note.pdf"
    }
  ]
}
```

Response:
```json
{
  "id": "excuse-uuid",
  "status": "PENDING",
  "createdAt": "2024-09-19T10:00:00Z",
  "updatedAt": "2024-09-19T10:00:00Z"
}
```

### `PATCH /api/attendance/excuse-requests/:id`
Only for pending requests.

### `DELETE /api/attendance/excuse-requests/:id`
Only for pending requests.

### `POST /api/attendance/excuse-requests/:id/approve`
Request:
```json
{
  "decisionNote": "Approved after document review",
  "decidedBy": "Attendance Admin"
}
```

Response:
```json
{
  "id": "excuse-uuid",
  "status": "APPROVED",
  "decisionNote": "Approved after document review",
  "decidedBy": "Attendance Admin",
  "decidedAt": "2024-09-19T12:00:00Z",
  "linkedSessionIds": ["session-uuid-1", "session-uuid-2"]
}
```

### `POST /api/attendance/excuse-requests/:id/reject`
Request:
```json
{
  "decisionNote": "Needs supporting evidence",
  "decidedBy": "Attendance Admin"
}
```

### `POST /api/attendance/excuse-requests/validate`
Optional preflight endpoint.

Request:
```json
{
  "yearId": "year-1",
  "termId": "term-1-1",
  "studentId": "student-1",
  "scopeType": "CLASSROOM",
  "scopeIds": {
    "gradeId": "grade-1",
    "sectionId": "section-1",
    "classroomId": "classroom-1"
  },
  "type": "LATE",
  "dateFrom": "2024-09-20",
  "dateTo": "2024-09-20",
  "selectedPeriodIds": ["p1"],
  "minutesLate": 12,
  "reasonAr": "",
  "reasonEn": "",
  "attachments": []
}
```

Response:
```json
{
  "valid": false,
  "errors": {
    "reason": "At least one reason language is required",
    "attachments": "Attachment is required by policy"
  }
}
```

---

## 8) Suggested convenience endpoints

### `GET /api/attendance/absences/kpis`
### `GET /api/attendance/excuse-requests/kpis`
### `GET /api/attendance/sessions/:id`
### `GET /api/attendance/students/search`

---

## 9) Recommended validation rules

## Policies
- unique bilingual names within same scope and term
- `effectiveStartDate <= effectiveEndDate`
- `lateThresholdMinutes >= 0`
- `earlyLeaveThresholdMinutes >= 0`
- `selectedPeriodIds` required for `PERIOD` mode
- `dailyComputationStrategy` required when `mode = DAILY`
- `absentIfMissedPeriodsCount` relevant only in period-based logic
- `autoAbsentAfterMinutes` relevant only in daily mode

## Roll call
- cannot submit an already submitted session
- cannot edit submitted session unless unsubmitted
- cannot write in closed term
- in `PERIOD` mode, `periodId` required
- excuse entries must satisfy policy:
  - reason required when policy says so
  - attachment required when policy says so
- early leave requires positive minutes

## Excuses
- `dateFrom <= dateTo`
- request range must stay inside term range
- policy may disable excuses entirely
- late and early-leave requests need selected periods
- late requires `minutesLate > 0`
- early leave requires `minutesEarlyLeave > 0`
- only pending requests editable/deletable/decidable

---

## 10) Known frontend/backend alignment notes

1. **Module root redirect**  
   `/attendance` currently redirects to `/attendance/policies`.

2. **Read-only is centralized**  
   All attendance tabs use the shared `useAttendanceTermContext()` hook. Backend should consistently reject writes for closed terms.

3. **Absences page is currently PERIOD-first**  
   The types support `DAILY_DERIVED`, but the current absences page hard-codes `granularities: ["PERIOD"]`. Backend can support both, but current UI mainly consumes period incidents.

4. **Roll call is the source of truth**  
   Absences and excuse application depend on roll-call sessions and entries.

5. **Policy resolution is cross-cutting**  
   Policies affect roll call, absences, and excuse request validation. This should stay centralized in backend logic.

6. **Attachments are modeled as metadata**  
   Current attendance excuse and entry models use attachment metadata objects. Backend should either:
   - accept uploaded files first and return metadata/URLs, or
   - support multipart submission and normalize to this metadata shape

Recommended pattern:
- `POST /api/files/upload`
- then include returned attachment metadata in attendance APIs

---

## 11) Minimum backend contract to unblock the current frontend

1. shared years / terms / structure / timetable config
2. attendance policies CRUD + effective policy resolution
3. roll call roster + session resolve/save/submit/unsubmit
4. absences read endpoint
5. absence excuse / early-leave correction endpoints
6. excuse requests CRUD + approve/reject

That sequence matches the dependency chain in the current UI:
- policies drive roll call rules
- roll call drives absences
- excuses validate against policies and apply back to attendance
