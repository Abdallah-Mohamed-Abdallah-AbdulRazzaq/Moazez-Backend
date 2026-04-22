# Students-Guardians Backend Handoff Spec

## Scope

This handoff is based on the current **students-guardians** module in `sis_dashboard`.

Confirmed module surfaces:
- `/students-guardians` → dashboard
- `/students-guardians/students` → students directory
- `/students-guardians/guardians` → guardians directory
- `/students-guardians/students/[studentId]` → student profile with tabs
- `/students-guardians/guardians/[guardianId]` → guardian profile with tabs

The current student profile shell exposes these tabs:
- overview
- personal
- guardians
- enrollment
- attendance
- grades
- behavior
- documents
- medical
- notes
- timeline

The current guardian profile shell exposes:
- overview
- students

This spec covers the backend contract needed for:
- scoped year/term student and guardian browsing
- student and guardian directory reads
- student core profile updates
- guardian relations
- documents
- medical profile
- notes and XP summary
- timeline
- enrollment placement, history, transfer, withdrawal, promotion, and bulk classroom assignment
- dashboard data

---

## High-level backend rules

1. **The whole module is year/term scoped**
   The dashboard, students list, and guardians list all use the shared year/term context provider.

2. **Students are enrollment-aware**
   The current UI does not treat students as flat records only. It joins each student with:
   - current enrollment
   - selected term
   - year-to-date performance
   - context performance for the selected term

3. **Guardians are also scope-aware**
   The guardians list is filtered to only guardians linked to students in the selected year/term context.

4. **Student core data and enrollment placement are separate writes**
   The current personal info tab saves:
   - student identity/contact changes through `updateStudent`
   - placement/enrollment changes through `updateEnrollment` or `upsertEnrollment`

5. **Enrollment operations are a subdomain**
   Placement validation, transfer, withdrawal, promotion, and bulk classroom assignment are already isolated into a separate enrollment service/adapter.

6. **Some UI actions are still placeholders**
   In the current list pages:
   - add note from list is still TODO
   - bulk upload is still TODO
   - student/guardian password change is still TODO
   - some edit buttons are placeholders

   These should not be treated as fully wired backend requirements yet.

---

## 1) Shared enums

### Student status
```json
{
  "StudentStatus": ["Active", "Suspended", "Withdrawn"]
}
```

### Risk flags
```json
{
  "RiskFlag": ["attendance", "grades", "behavior"]
}
```

### Note category / visibility
Suggested canonical enums based on current notes/XP usage:
```json
{
  "StudentNoteCategory": ["behavior", "academic", "attendance", "general"],
  "StudentNoteVisibility": ["internal", "guardian_visible"]
}
```

### Enrollment status and movements
Suggested canonical enums based on current enrollment logic:
```json
{
  "StudentEnrollmentStatus": ["active", "completed", "withdrawn"],
  "EnrollmentMovementAction": [
    "enrolled",
    "transferred_internal",
    "transferred_external",
    "withdrawn",
    "promoted",
    "reassigned_bulk"
  ]
}
```

---

## 2) Core entities

## `students`
```json
{
  "id": "student-uuid",
  "student_id": "STD-1001",
  "name": "Ahmed Hassan",
  "first_name_en": "Ahmed",
  "father_name_en": "Hassan",
  "grandfather_name_en": "Ali",
  "family_name_en": "Mostafa",
  "first_name_ar": "أحمد",
  "father_name_ar": "حسن",
  "grandfather_name_ar": "علي",
  "family_name_ar": "مصطفى",
  "full_name_en": "Ahmed Hassan Ali Mostafa",
  "full_name_ar": "أحمد حسن علي مصطفى",
  "dateOfBirth": "2014-05-10",
  "date_of_birth": "2014-05-10",
  "gender": "Male",
  "nationality": "Egyptian",
  "status": "Active",
  "grade": "Grade 5",
  "section": "A",
  "stage": "Primary",
  "contact": {
    "address_line": "Street 1",
    "city": "Cairo",
    "district": "Nasr City",
    "student_phone": null,
    "student_email": null
  },
  "attendance_percentage": 92,
  "current_average": 85,
  "risk_flags": ["attendance"],
  "created_at": "2026-01-01T10:00:00Z",
  "updated_at": "2026-03-01T12:00:00Z"
}
```

## `guardians`
```json
{
  "guardianId": "guardian-uuid",
  "full_name": "Mohammed Hassan",
  "relation": "father",
  "phone_primary": "+201001112233",
  "phone_secondary": "+201005556666",
  "email": "father@example.com",
  "national_id": "12345678901234",
  "job_title": "Engineer",
  "workplace": "Company X",
  "is_primary": true,
  "can_pickup": true,
  "can_receive_notifications": true
}
```

## `student_guardian_links`
```json
{
  "studentId": "student-uuid",
  "guardianId": "guardian-uuid",
  "is_primary": true,
  "relation": "father"
}
```

## `student_documents`
```json
{
  "id": "doc-uuid",
  "studentId": "student-uuid",
  "type": "Birth Certificate",
  "name": "birth-certificate.pdf",
  "status": "complete",
  "uploadedDate": "2026-02-01T10:00:00Z",
  "url": "https://files.example.com/birth-certificate.pdf"
}
```

## `student_medical_profiles`
```json
{
  "id": "medical-uuid",
  "studentId": "student-uuid",
  "allergies": "Peanuts",
  "notes": "Carries inhaler",
  "bloodType": "O+",
  "conditions": ["Asthma"],
  "medications": ["Inhaler"]
}
```

## `student_notes`
```json
{
  "id": "note-uuid",
  "studentId": "student-uuid",
  "date": "2026-03-10T08:00:00Z",
  "category": "behavior",
  "note": "Helped classmates during activity",
  "xpAdjustment": 5,
  "visibility": "internal",
  "created_by": "Teacher A"
}
```

## `student_timeline_events`
```json
{
  "id": "timeline-uuid",
  "studentId": "student-uuid",
  "date": "2026-03-12T09:00:00Z",
  "type": "note_added",
  "label": "Behavior note added",
  "description": "Positive note added by Teacher A"
}
```

## `student_enrollments`
```json
{
  "enrollmentId": "ENR-student-uuid-2025-2026",
  "studentId": "student-uuid",
  "academicYear": "2025-2026",
  "academicYearId": "year-2",
  "grade": "Grade 5",
  "section": "A",
  "classroom": "Classroom 10",
  "gradeId": "grade-5",
  "sectionId": "section-8",
  "classroomId": "classroom-10",
  "enrollmentDate": "2025-09-01",
  "status": "active"
}
```

## `enrollment_terms`
```json
{
  "termRecordId": "term-2-2",
  "enrollmentId": "ENR-student-uuid-2025-2026",
  "term": "Term 2",
  "attendancePercentage": 91,
  "gradeAverage": 84,
  "riskFlags": ["attendance"]
}
```

## `enrollment_movements`
```json
{
  "id": "MOVE-1",
  "studentId": "student-uuid",
  "academicYear": "2025-2026",
  "actionType": "transferred_internal",
  "fromGradeId": "grade-5",
  "fromSectionId": "section-8",
  "fromClassroomId": "classroom-10",
  "toGradeId": "grade-5",
  "toSectionId": "section-9",
  "toClassroomId": "classroom-11",
  "fromGrade": "Grade 5",
  "fromSection": "A",
  "fromClassroom": "Classroom 10",
  "toGrade": "Grade 5",
  "toSection": "B",
  "toClassroom": "Classroom 11",
  "effectiveDate": "2026-03-15",
  "reason": "Capacity balancing",
  "notes": "",
  "sourceRequestId": null,
  "createdAt": "2026-03-15T10:00:00Z"
}
```

---

## 3) Shared context endpoints

The shared year/term context provider is a real dependency of this module.

### `GET /api/academics/years`

### `GET /api/academics/terms?yearId={yearId}`

### `GET /api/students-guardians/context?yearId={yearId}&termId={termId}`
Optional convenience endpoint if backend wants to centralize context resolution.

Suggested response:
```json
{
  "academicYears": [
    {
      "id": "year-2",
      "name": "2025-2026",
      "nameAr": "2025-2026",
      "nameEn": "2025-2026"
    }
  ],
  "terms": [
    {
      "id": "term-2-2",
      "name": "Term 2",
      "status": "open"
    }
  ],
  "yearId": "year-2",
  "termId": "term-2-2",
  "termStatus": "open",
  "isReadOnly": false
}
```

---

## 4) Dashboard contract

The current dashboard loads all students for the selected context and computes:
- statistics
- risk distribution
- chart summaries

Backend can either:
- let the frontend continue computing from the scoped student list, or
- provide a summary endpoint

### Minimum current-compatible path
The dashboard already works if this endpoint exists:

### `GET /api/students-guardians/students/with-enrollment?academicYearId={yearId}&termId={termId}`

Response item shape:
```json
{
  "id": "student-uuid",
  "student_id": "STD-1001",
  "full_name_en": "Ahmed Hassan",
  "full_name_ar": "أحمد حسن",
  "status": "Active",
  "gradeRequested": "Grade 5",
  "enrollment": {
    "enrollmentId": "ENR-1",
    "studentId": "student-uuid",
    "academicYear": "2025-2026",
    "academicYearId": "year-2",
    "grade": "Grade 5",
    "section": "A",
    "classroom": "Classroom 10",
    "gradeId": "grade-5",
    "sectionId": "section-8",
    "classroomId": "classroom-10",
    "status": "active"
  },
  "currentTerm": {
    "termRecordId": "term-2-2",
    "term": "Term 2",
    "attendancePercentage": 91,
    "gradeAverage": 84,
    "riskFlags": ["attendance"]
  },
  "selectedTerm": {
    "termRecordId": "term-2-2",
    "term": "Term 2",
    "attendancePercentage": 91,
    "gradeAverage": 84,
    "riskFlags": ["attendance"]
  },
  "ytdPerformance": {
    "attendance": 92,
    "gradeAverage": 85,
    "riskFlags": ["attendance"]
  },
  "contextPerformance": {
    "attendance": 91,
    "gradeAverage": 84,
    "riskFlags": ["attendance"]
  }
}
```

### Optional summary endpoint
### `GET /api/students-guardians/dashboard/summary?academicYearId={yearId}&termId={termId}`

Suggested response:
```json
{
  "stats": {
    "total": 1200,
    "active": 1140,
    "suspended": 25,
    "withdrawn": 35,
    "atRisk": 98
  },
  "riskDistribution": {
    "attendance": 40,
    "grades": 35,
    "behavior": 23
  }
}
```

---

## 5) Students directory

The students list page currently needs:
- scoped students with enrollment context
- search
- grade / section / classroom filters
- status filter
- date filter
- profile navigation
- export
- note/password/bulk-upload UI hooks

### `GET /api/students-guardians/students`
Baseline list endpoint if backend wants a plain student directory.

### `GET /api/students-guardians/students/with-enrollment`
This is the stronger endpoint and already implied by the current API adapter.

Query params:
- `academicYearId`
- `termId`
- optional future:
  - `search`
  - `grade`
  - `section`
  - `classroom`
  - `status`
  - `dateFrom`
  - `dateTo`

If backend supports server-side filtering, it will simplify the current page.

### `GET /api/students-guardians/students/:studentId`
Returns base student record.

### `PATCH /api/students-guardians/students/:studentId`
This is already explicitly implied by the current API adapter.

Request:
```json
{
  "name": "Ahmed Hassan Ali Mostafa",
  "first_name_en": "Ahmed",
  "father_name_en": "Hassan",
  "grandfather_name_en": "Ali",
  "family_name_en": "Mostafa",
  "first_name_ar": "أحمد",
  "father_name_ar": "حسن",
  "grandfather_name_ar": "علي",
  "family_name_ar": "مصطفى",
  "full_name_en": "Ahmed Hassan Ali Mostafa",
  "full_name_ar": "أحمد حسن علي مصطفى",
  "gender": "Male",
  "dateOfBirth": "2014-05-10",
  "date_of_birth": "2014-05-10",
  "nationality": "Egyptian",
  "status": "Active",
  "contact": {
    "address_line": "Street 1",
    "city": "Cairo",
    "district": "Nasr City",
    "student_phone": null,
    "student_email": null
  }
}
```

### Important note
The current personal tab update flow **does not** save grade/section/classroom through the student PATCH endpoint.  
Those go through the enrollment service.

---

## 6) Student profile tabs backend needs

The current student profile shell exposes multiple tabs. Backend can either:
- return one large profile payload, or
- keep them as separate endpoints

The current frontend structure favors separate data sources.

## Overview tab
Currently reads:
- student record
- XP summary
- risk flags
- some chart placeholders

### `GET /api/students-guardians/students/:studentId/xp-summary`
Suggested response:
```json
{
  "totalXp": 32,
  "recentXp": 8,
  "weeklyXpDelta": 8,
  "positiveNotesCount": 6,
  "negativeNotesCount": 2,
  "totalNotesCount": 8,
  "positivePointsTotal": 40,
  "negativePointsTotal": 8
}
```

## Personal tab
Uses:
- `PATCH /students/:studentId`
- enrollment placement validation
- enrollment upsert/update

No extra read endpoint required beyond base student + enrollment.

## Guardians tab
### `GET /api/students-guardians/students/:studentId/guardians`

### `GET /api/students-guardians/students/:studentId/guardians/primary`

Response:
```json
[
  {
    "guardianId": "guardian-uuid",
    "full_name": "Mohammed Hassan",
    "relation": "father",
    "phone_primary": "+201001112233",
    "email": "father@example.com",
    "is_primary": true,
    "can_pickup": true,
    "can_receive_notifications": true
  }
]
```

## Enrollment tab
Needs:
- current active enrollment
- enrollment history
- placement history

### `GET /api/students-guardians/enrollments/current?studentId={studentId}&academicYear={optionalYear}`

### `GET /api/students-guardians/enrollments/history?studentId={studentId}`

### `GET /api/students-guardians/enrollments/movements?studentId={studentId}`

## Attendance tab
The tab exists in the shell, but the students service does not currently expose a dedicated attendance endpoint.  
Recommended backend:
### `GET /api/students-guardians/students/:studentId/attendance-summary?academicYearId=&termId=`

## Grades tab
Recommended backend:
### `GET /api/students-guardians/students/:studentId/grades-summary?academicYearId=&termId=`
This can be backed by the grades student snapshot endpoint if product wants reuse.

## Behavior tab
Current overview already uses note-derived XP behavior metrics.
Recommended backend:
### `GET /api/students-guardians/students/:studentId/behavior-summary`

## Documents tab
### `GET /api/students-guardians/students/:studentId/documents`

### `GET /api/students-guardians/students/:studentId/documents/missing`

Recommended future write endpoints:
- `POST /api/students-guardians/students/:studentId/documents`
- `PATCH /api/students-guardians/documents/:documentId`

## Medical tab
### `GET /api/students-guardians/students/:studentId/medical-profile`

Recommended future write endpoint:
### `PATCH /api/students-guardians/students/:studentId/medical-profile`

## Notes tab
The service already supports note creation and XP derivation.

### `GET /api/students-guardians/students/:studentId/notes`

### `POST /api/students-guardians/students/:studentId/notes`
Request:
```json
{
  "category": "behavior",
  "note": "Helped classmates during activity",
  "xpAdjustment": 5,
  "visibility": "internal",
  "created_by": "Teacher A"
}
```

Important validation:
- `xpAdjustment` must be integer
- range `-50..50`
- cannot be zero

## Timeline tab
### `GET /api/students-guardians/students/:studentId/timeline`

---

## 7) Guardians directory and guardian profile

The guardians list page currently needs:
- all guardians
- scope filtering to only guardians linked to students in current context
- guardian detail view
- guardian students
- password change UI hook

### `GET /api/students-guardians/guardians`
Recommended query params:
- optional `academicYearId`
- optional `termId`
- optional `relation`
- optional `search`

The current adapter path actually implied by the code is:
- `GET /students-guardians/students/guardians`
because the students adapter uses the students base path

For backend cleanliness, I recommend normalizing product endpoints to:
- `GET /api/students-guardians/guardians`

### `GET /api/students-guardians/guardians/:guardianId`

### `GET /api/students-guardians/guardians/:guardianId/students`
This is already explicitly implied by the current adapter.

Response:
```json
{
  "guardian": {
    "guardianId": "guardian-uuid",
    "full_name": "Mohammed Hassan",
    "relation": "father",
    "phone_primary": "+201001112233",
    "email": "father@example.com",
    "is_primary": true,
    "can_pickup": true,
    "can_receive_notifications": true
  },
  "students": [
    {
      "id": "student-uuid",
      "student_id": "STD-1001",
      "full_name_en": "Ahmed Hassan",
      "status": "Active"
    }
  ]
}
```

### Guardian tabs
The current guardian profile shell only exposes:
- overview
- students

So no larger guardian submodule is required yet.

---

## 8) Enrollment subdomain

This is the most concrete backend area after the students base CRUD, because the current code already has a dedicated API adapter for it.

### Existing implied base path
`/students-guardians/enrollments`

### `POST /api/students-guardians/enrollments`
Create a new enrollment.

Request:
```json
{
  "studentId": "student-uuid",
  "academicYear": "2025-2026",
  "grade": "Grade 5",
  "section": "A",
  "classroom": "Classroom 10",
  "gradeId": "grade-5",
  "sectionId": "section-8",
  "classroomId": "classroom-10",
  "enrollmentDate": "2025-09-01",
  "status": "active"
}
```

### `PATCH /api/students-guardians/enrollments/:enrollmentId`
Update placement/status.

### `POST /api/students-guardians/enrollments/upsert`
Create-or-update active enrollment for same student/year.

### `POST /api/students-guardians/enrollments/transfer`
Request:
```json
{
  "studentId": "student-uuid",
  "targetSectionId": "section-9",
  "targetClassroomId": "classroom-11",
  "effectiveDate": "2026-03-15",
  "reason": "Capacity balancing",
  "notes": "",
  "sourceRequestId": null
}
```

### `POST /api/students-guardians/enrollments/withdraw`
Request:
```json
{
  "studentId": "student-uuid",
  "effectiveDate": "2026-03-20",
  "reason": "Family relocation",
  "notes": "",
  "actionType": "withdrawn",
  "sourceRequestId": null
}
```

### `POST /api/students-guardians/enrollments/promote`
Request:
```json
{
  "studentId": "student-uuid",
  "targetAcademicYear": "2026-2027",
  "effectiveDate": "2026-09-01",
  "notes": "Auto promotion"
}
```

### `POST /api/students-guardians/enrollments/bulk-assign`
Request:
```json
{
  "academicYear": "2025-2026",
  "sectionId": "section-8",
  "allowOverflow": false
}
```

Response:
```json
{
  "assignedCount": 24,
  "unassignedCount": 2,
  "perClassroomCounts": [
    {
      "classroomId": "classroom-10",
      "classroomName": "Classroom 10",
      "count": 12,
      "capacity": 12
    }
  ]
}
```

### `POST /api/students-guardians/enrollments/promote-active`
Request:
```json
{
  "targetAcademicYear": "2026-2027",
  "effectiveDate": "2026-09-01"
}
```

### `GET /api/students-guardians/enrollments/academic-years`
This is already explicitly implied by the current enrollment API adapter.

### Recommended validation endpoint
The current personal tab validates placement client-side through the service.

### `POST /api/students-guardians/enrollments/validate`
Request:
```json
{
  "studentId": "student-uuid",
  "academicYear": "2025-2026",
  "grade": "Grade 5",
  "section": "A",
  "classroom": "Classroom 10",
  "gradeId": "grade-5",
  "sectionId": "section-8",
  "classroomId": "classroom-10"
}
```

Response:
```json
{
  "valid": true,
  "errors": []
}
```

### Enrollment validation rules backend should own
- student required
- academic year required
- grade/section/classroom ids must exist
- section must belong to grade
- classroom must belong to section
- duplicate active enrollment in same year not allowed
- classroom capacity check unless explicitly bypassed

---

## 9) Recommended convenience endpoints

### `GET /api/students-guardians/students/:studentId/profile`
Optional aggregated endpoint returning:
- student
- guardians
- current enrollment
- documents
- medical profile
- notes summary
- xp summary
- timeline preview

This could simplify the profile shell if the product later moves away from per-tab local service reads.

### `POST /api/students-guardians/students/:studentId/change-password`
UI exists, but current implementation is still TODO.

### `POST /api/students-guardians/guardians/:guardianId/change-password`
UI exists, but current implementation is still TODO.

### `POST /api/students-guardians/students/bulk-upload`
UI exists, but current implementation is still TODO.

---


## 10) Transfers-withdrawals subfeature

This is a real standalone product area, not just an implication of enrollment history.

Confirmed routes:
- `/students-guardians/transfers-withdrawals` redirects to transfers
- `/students-guardians/transfers-withdrawals/transfers`
- `/students-guardians/transfers-withdrawals/withdrawals`

Confirmed current behavior:
- transfers overview analytics
- withdrawals overview analytics
- transfer and withdrawal request objects
- create transfer request
- create withdrawal request
- update transfer status
- update withdrawal status
- execution of approved requests through the enrollment service

### Core enums
```json
{
  "TransferType": ["internal", "external"],
  "WithdrawalReason": ["relocation", "financial", "academic", "behavior", "health", "other"],
  "ApplicationStatus": [
    "draft",
    "submitted",
    "under_review",
    "finance_clearance",
    "behavior_review",
    "approved",
    "rejected",
    "executed"
  ],
  "BehaviorBand": ["low", "medium", "high"],
  "Stage": ["primary", "preparatory", "secondary"]
}
```

### `transfer_applications`
```json
{
  "id": "TRF-2024-001",
  "studentId": "student-uuid",
  "studentName": "Omar Ali",
  "studentNameAr": "عمر علي",
  "stage": "preparatory",
  "grade": "Grade 8",
  "section": "A",
  "classroom": "Classroom 801",
  "type": "internal",
  "targetSection": "B",
  "targetSectionId": "section-4",
  "targetClassroom": "Classroom 802",
  "targetClassroomId": "classroom-4",
  "targetClass": "B • Classroom 802",
  "externalSchool": null,
  "reason": "Better academic fit",
  "behaviorScore": 90,
  "behaviorBand": "high",
  "status": "approved",
  "requestDate": "2024-02-13",
  "effectiveDate": "2024-03-01",
  "notes": "",
  "attachments": [],
  "createdBy": "admin",
  "approvedBy": "system",
  "rejectionReason": null
}
```

### `withdrawal_applications`
```json
{
  "id": "WTH-2024-001",
  "studentId": "student-uuid",
  "studentName": "Ahmed Hassan",
  "studentNameAr": "أحمد حسن",
  "stage": "primary",
  "grade": "Grade 5",
  "section": "A",
  "classroom": "Classroom 501",
  "reason": "relocation",
  "behaviorAvg": 85,
  "behaviorBand": "high",
  "attendancePercent": 92,
  "financialClearance": "cleared",
  "status": "submitted",
  "requestDate": "2024-02-15",
  "effectiveDate": "2024-03-01",
  "notes": "",
  "attachments": [],
  "createdBy": "admin",
  "approvedBy": null,
  "rejectionReason": null
}
```

### Backend rule that matters most
When status becomes `executed`, this subfeature should call the enrollment domain:
- internal transfer → internal placement transfer
- external transfer → external transfer-out / withdrawal
- withdrawal → withdrawal flow

So this module is not analytics-only. It has real operational impact.

### Current API adapter endpoints already implied by the repo

#### `POST /api/students-guardians/transfers-withdrawals/transfers`
Request:
```json
{
  "studentId": "student-uuid",
  "studentName": "Omar Ali",
  "studentNameAr": "عمر علي",
  "stage": "preparatory",
  "grade": "Grade 8",
  "section": "A",
  "classroom": "Classroom 801",
  "type": "internal",
  "targetSection": "B",
  "targetSectionId": "section-4",
  "targetClassroom": "Classroom 802",
  "targetClassroomId": "classroom-4",
  "targetClass": "B • Classroom 802",
  "reason": "Better academic fit",
  "behaviorScore": 90,
  "behaviorBand": "high",
  "effectiveDate": "2024-03-01",
  "notes": "",
  "attachments": [],
  "createdBy": "admin"
}
```

#### `POST /api/students-guardians/transfers-withdrawals/withdrawals`
Request:
```json
{
  "studentId": "student-uuid",
  "studentName": "Ahmed Hassan",
  "studentNameAr": "أحمد حسن",
  "stage": "primary",
  "grade": "Grade 5",
  "section": "A",
  "classroom": "Classroom 501",
  "reason": "relocation",
  "behaviorAvg": 85,
  "behaviorBand": "high",
  "attendancePercent": 92,
  "financialClearance": "pending",
  "effectiveDate": "2024-03-01",
  "notes": "",
  "attachments": [],
  "createdBy": "admin"
}
```

#### `PATCH /api/students-guardians/transfers-withdrawals/transfers/:id/status`
Request:
```json
{
  "status": "approved",
  "rejectionReason": null
}
```

#### `PATCH /api/students-guardians/transfers-withdrawals/withdrawals/:id/status`
Request:
```json
{
  "status": "behavior_review",
  "rejectionReason": null
}
```

### Analytics endpoints already implied by the current API adapter

- `GET /api/students-guardians/transfers-withdrawals/analytics/overview`
- `GET /api/students-guardians/transfers-withdrawals/analytics/trend?stage={stage}`
- `GET /api/students-guardians/transfers-withdrawals/analytics/stage-breakdown`
- `GET /api/students-guardians/transfers-withdrawals/analytics/withdrawal-reasons?stage={stage}`
- `GET /api/students-guardians/transfers-withdrawals/analytics/behavior-breakdown`
- `GET /api/students-guardians/transfers-withdrawals/analytics/request-rows`

Suggested `GET /analytics/overview` response:
```json
{
  "transfersThisMonth": 12,
  "withdrawalsThisMonth": 6,
  "pendingRequests": 5,
  "dropoutRate": 3.2,
  "behaviorRelatedWithdrawals": 2
}
```

### Recommended additional read endpoints
The service layer already models these reads, even though the current adapter does not expose all of them yet. They are useful for completing the product backend:

- `GET /api/students-guardians/transfers-withdrawals/transfers`
- `GET /api/students-guardians/transfers-withdrawals/transfers/:id`
- `GET /api/students-guardians/transfers-withdrawals/withdrawals`
- `GET /api/students-guardians/transfers-withdrawals/withdrawals/:id`
- `GET /api/students-guardians/students/:studentId/transfers`
- `GET /api/students-guardians/students/:studentId/withdrawals`

### Validation rules
- `studentId` required
- `effectiveDate` required
- transfer `type` required
- internal transfer requires `targetSectionId`
- external transfer should carry `externalSchool`
- `executed` cannot run twice
- `rejected` should keep `rejectionReason`
- behavior/finance review states should remain valid intermediate statuses before approval/execution

---

## 11) Documents center subfeature

This is also a real standalone product surface, not only the student profile documents tab.

Confirmed route:
- `/students-guardians/documents`

Confirmed current behavior:
- fetch all student documents for center
- fetch center stats
- filter by search and status client-side
- view/download existing docs
- upload button exists but is still placeholder UI

### `student_document_center_items`
```json
{
  "id": "doc-uuid",
  "studentId": "student-uuid",
  "studentName": "Ahmed Hassan",
  "grade": "Grade 5",
  "type": "Birth Certificate",
  "name": "birth-certificate.pdf",
  "status": "complete",
  "uploadedDate": "2026-02-01T10:00:00Z",
  "url": "https://files.example.com/birth-certificate.pdf",
  "fileType": "pdf"
}
```

### `student_documents_stats`
```json
{
  "total": 1200,
  "complete": 1080,
  "missing": 120,
  "completionRate": 90
}
```

### Current API adapter endpoints already implied by the repo

#### `GET /api/students-guardians/documents`
Response:
```json
[
  {
    "id": "doc-uuid",
    "studentId": "student-uuid",
    "studentName": "Ahmed Hassan",
    "grade": "Grade 5",
    "type": "Birth Certificate",
    "name": "birth-certificate.pdf",
    "status": "complete",
    "uploadedDate": "2026-02-01T10:00:00Z",
    "url": "https://files.example.com/birth-certificate.pdf",
    "fileType": "pdf"
  }
]
```

#### `GET /api/students-guardians/documents/stats`
Response:
```json
{
  "total": 1200,
  "complete": 1080,
  "missing": 120,
  "completionRate": 90
}
```

### Student-scoped document reads that should stay
These are still needed for the student profile tabs:

- `GET /api/students-guardians/students/:studentId/documents`
- `GET /api/students-guardians/students/:studentId/documents/missing`

### Recommended future write endpoints
The standalone documents center does not yet have a write adapter, but these are the natural next backend additions once the upload button is wired for real:

#### `POST /api/students-guardians/students/:studentId/documents`
Request:
```json
{
  "type": "Birth Certificate",
  "name": "birth-certificate.pdf",
  "status": "complete",
  "url": "https://files.example.com/birth-certificate.pdf",
  "fileType": "pdf"
}
```

#### `PATCH /api/students-guardians/documents/:documentId`
Request:
```json
{
  "status": "complete",
  "name": "updated-file.pdf",
  "url": "https://files.example.com/updated-file.pdf",
  "fileType": "pdf"
}
```

#### Optional `DELETE /api/students-guardians/documents/:documentId`

### Validation rules
- `studentId` must exist
- `type` required
- status enum must be `complete | missing`
- if `status = complete`, file metadata should exist
- if `status = missing`, uploaded file fields can be null
- center stats should be derived from current document rows, not stored separately


## 10) Known frontend/backend alignment notes

1. **Adapter paths are slightly awkward**
   The current students API adapter uses base path:
   - `/students-guardians/students`

   and then hangs guardian endpoints off it:
   - `/students-guardians/students/guardians`
   - `/students-guardians/students/guardians/:guardianId`
   - `/students-guardians/students/guardians/:guardianId/students`

   Backend can support that for compatibility, but product structure would be cleaner with:
   - `/students-guardians/guardians`
   - `/students-guardians/guardians/:guardianId`
   - `/students-guardians/guardians/:guardianId/students`

2. **Student list is enrollment-context driven**
   The most important read is not plain `GET /students`; it is the scoped enriched list:
   - `GET /students/with-enrollment?academicYearId=&termId=`

3. **Guardian list is also context-scoped**
   The current guardians page loads all guardians plus scoped students, then filters client-side. Backend can reduce work by supporting direct guardian scoping.

4. **Several actions are still UI placeholders**
   Do not overfit backend scope to the list-page TODO buttons yet:
   - add note from list
   - bulk upload
   - password changes
   - edit buttons

5. **Student profile writes are split**
   Saving personal info currently performs:
   - `PATCH /students/:studentId`
   - then enrollment update/upsert

   Backend should keep that separation or provide one orchestrated endpoint intentionally.

6. **Attendance / grades / behavior tabs are visible but not fully standardized in this module**
   They likely need cross-module data from attendance, grades, and behavior/note systems. Keep those contracts explicit and separate.

---

## 12) Known frontend/backend alignment notes

Recommended delivery order:

1. years / terms / shared context
2. students with enrollment for selected context
3. guardians list + guardian students
4. student detail + guardian links
5. student PATCH
6. enrollment CRUD / upsert / transfer / withdraw / promote / bulk-assign
7. transfers-withdrawals requests + analytics
8. documents center reads + stats
9. documents / medical / notes / timeline / xp-summary
10. optional password and bulk-upload endpoints once UI wiring is finished

That matches the actual dependency chain in the current module:
- shared context boots the module
- dashboard, students list, and guardians list depend on scoped enrollment-aware reads
- student profile writes require both student core data and enrollment placement