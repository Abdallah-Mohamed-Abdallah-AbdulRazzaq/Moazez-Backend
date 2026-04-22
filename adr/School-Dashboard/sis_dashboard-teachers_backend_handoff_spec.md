# Teachers Backend Handoff Spec

## Scope

This document turns the current **Teachers** frontend module into a backend-ready contract for database design and API implementation.

The current teachers module supports:
- teachers list
- search and filters
- teacher create
- teacher edit
- teacher details drawer
- activate / deactivate teacher
- delete teacher
- change teacher password
- export
- academic year / term context for resolving subjects, stages, grades, and sections

## Important product note

The current frontend loads:
- **teachers globally** via `fetchTeachers()`
- **reference data by selected academic year and term** via:
  - `fetchStructureTree(academicYearId, termId)`
  - `fetchSubjects(termId)`

That means the selected year/term is currently used to resolve the labels for:
- subjects
- stages
- grades
- sections

This creates an important backend design decision:

### Current frontend reality
Teachers are treated like a global directory, but their assignment references are displayed against the currently selected term's academic structure.

### Recommended backend model
Use:
- **global teacher profile records**
- **term-scoped teacher assignment records**

That avoids assignment IDs drifting when academic structure IDs differ across terms.

## Recommended canonical model

### A. Global teacher profile
Store personal and employment fields globally:
- code
- names
- email
- phone
- gender
- status
- experience
- working days / hours
- hire date
- notes

### B. Term-scoped assignment profile
Store teacher academic assignment scope by term:
- subjects
- stages
- grades
- sections

This matches the way the UI depends on selected academic year / term context.

---

## Core enums

### Teacher status
- `ACTIVE`
- `INACTIVE`

### Teacher gender
- `MALE`
- `FEMALE`

### Teacher work day
- `SUNDAY`
- `MONDAY`
- `TUESDAY`
- `WEDNESDAY`
- `THURSDAY`
- `FRIDAY`
- `SATURDAY`

---

## Validation rules the backend should enforce

These come directly from the current teacher form validation logic.

### Identity and uniqueness
- `code` is required
- `code` is normalized to uppercase with whitespace removed
- `code` max length = `20`
- `code` must be unique
- `email` is required
- `email` is normalized to lowercase
- `email` max length = `120`
- `email` must be a valid email format
- `email` must be unique

### Names
- `firstNameAr` required, max `50`
- `firstNameEn` required, max `50`
- `lastNameAr` required, max `50`
- `lastNameEn` required, max `50`

### Phone
- `phone` is optional
- if provided, max length = `20`
- phone is normalized to digits only, with optional leading `+`

### Experience
- `experienceYears` is optional
- if provided:
  - integer only
  - min `0`
  - max `60`

### Working days / times
- `workDayFrom` and `workDayTo` must be provided together or omitted together
- `workStartTime` and `workEndTime` must be provided together or omitted together
- `workDayTo` cannot be earlier than `workDayFrom`
- `workEndTime` must be later than `workStartTime`

### Assignment requirements
- at least one `subjectId`
- at least one `stageId`
- at least one `gradeId`
- at least one `sectionId`

### Notes
- `notesAr` max `500`
- `notesEn` max `500`

### Password reset
- new password required
- min password length = `8`

---

## Database design

## 1) `teachers`
Global teacher profile table.

```json
{
  "id": "teacher-uuid",
  "code": "TCH-001",
  "first_name_ar": "أحمد",
  "first_name_en": "Ahmed",
  "last_name_ar": "خالد",
  "last_name_en": "Khaled",
  "full_name_ar": "أحمد خالد",
  "full_name_en": "Ahmed Khaled",
  "email": "ahmed.khaled@school.test",
  "phone": "+201001112233",
  "gender": "MALE",
  "status": "ACTIVE",
  "experience_years": 4,
  "work_day_from": "SUNDAY",
  "work_day_to": "THURSDAY",
  "work_start_time": "07:30",
  "work_end_time": "14:30",
  "hire_date": "2022-08-18",
  "notes_ar": "يركز على تبسيط المفاهيم الأساسية.",
  "notes_en": "Focuses on simplifying foundational concepts.",
  "created_at": "2026-01-03T08:30:00Z",
  "updated_at": "2026-03-12T10:15:00Z"
}
```

Recommended constraints:
- unique index on `code`
- unique index on `lower(email)` where email is not null

## 2) `teacher_term_assignments`
One record per teacher per term.

```json
{
  "id": "teacher-term-assignment-uuid",
  "teacher_id": "teacher-uuid",
  "academic_year_id": "year-uuid",
  "term_id": "term-uuid",
  "created_at": "2026-01-03T08:30:00Z",
  "updated_at": "2026-03-12T10:15:00Z"
}
```

Unique constraint:
- `(teacher_id, term_id)`

## 3) `teacher_assignment_subjects`
```json
{
  "teacher_term_assignment_id": "teacher-term-assignment-uuid",
  "subject_id": "subj-1"
}
```

## 4) `teacher_assignment_stages`
```json
{
  "teacher_term_assignment_id": "teacher-term-assignment-uuid",
  "stage_id": "stage-1"
}
```

## 5) `teacher_assignment_grades`
```json
{
  "teacher_term_assignment_id": "teacher-term-assignment-uuid",
  "grade_id": "grade-1"
}
```

## 6) `teacher_assignment_sections`
```json
{
  "teacher_term_assignment_id": "teacher-term-assignment-uuid",
  "section_id": "section-1"
}
```

## 7) auth / credentials table
Do **not** store plaintext passwords in teacher records.

Use your existing auth model, for example:
- `users`
- `user_credentials`
- `password_resets`
- `auth_identities`

Teacher password change in this module should be implemented as an admin password reset action, not a raw teacher table update.

---

## API design

## A. Reference data required by Teachers page

The teachers page currently builds its reference data from:
- academic structure tree
- subjects list

### Option 1: reuse existing academics endpoints
Recommended if these already exist.

#### `GET /api/academics/structure-tree?yearId={yearId}&termId={termId}`

Response:
```json
{
  "stages": [
    { "id": "stage-1", "nameAr": "ابتدائي", "nameEn": "Primary" }
  ],
  "grades": [
    { "id": "grade-1", "stageId": "stage-1", "nameAr": "الصف الأول", "nameEn": "Grade 1" }
  ],
  "sections": [
    { "id": "section-1", "gradeId": "grade-1", "nameAr": "شعبة أ", "nameEn": "Section A" }
  ]
}
```

#### `GET /api/academics/subjects?termId={termId}`

Response:
```json
{
  "items": [
    {
      "id": "subj-1",
      "termId": "term-1",
      "nameAr": "الرياضيات",
      "nameEn": "Mathematics",
      "code": "MATH101",
      "isActive": true
    }
  ]
}
```

### Option 2: add a teachers-specific aggregate endpoint
Useful to reduce frontend round-trips.

#### `GET /api/teachers/reference-data?yearId={yearId}&termId={termId}`

Response:
```json
{
  "subjects": [
    { "id": "subj-1", "labelAr": "الرياضيات", "labelEn": "Mathematics" }
  ],
  "stages": [
    { "id": "stage-1", "labelAr": "ابتدائي", "labelEn": "Primary" }
  ],
  "grades": [
    { "id": "grade-1", "stageId": "stage-1", "labelAr": "الصف الأول", "labelEn": "Grade 1" }
  ],
  "sections": [
    { "id": "section-1", "gradeId": "grade-1", "labelAr": "شعبة أ", "labelEn": "Section A" }
  ]
}
```

---

## B. Teachers list

The current UI fetches all teachers and filters client-side.  
Recommended backend contract should still support filters and pagination.

### `GET /api/teachers`

Query params:
- `search`
- `status=ACTIVE|INACTIVE`
- `gender=MALE|FEMALE`
- `subjectId`
- `stageId`
- `gradeId`
- `yearId`
- `termId`
- `page`
- `limit`

### Recommended behavior
- if `yearId` and `termId` are present, return teacher records enriched with assignment arrays for that term
- if omitted, return teacher core profiles only, or use the active/default term if your product requires it

### Response
```json
{
  "items": [
    {
      "id": "teacher-1001",
      "code": "TCH-001",
      "firstNameAr": "أحمد",
      "firstNameEn": "Ahmed",
      "lastNameAr": "خالد",
      "lastNameEn": "Khaled",
      "fullNameAr": "أحمد خالد",
      "fullNameEn": "Ahmed Khaled",
      "email": "ahmed.khaled@school.test",
      "phone": "+201001112233",
      "gender": "MALE",
      "status": "ACTIVE",
      "subjectIds": ["subj-1", "subj-2"],
      "stageIds": ["stage-1"],
      "gradeIds": ["grade-1", "grade-2"],
      "sectionIds": ["section-1", "section-3"],
      "experienceYears": 4,
      "workDayFrom": "SUNDAY",
      "workDayTo": "THURSDAY",
      "workStartTime": "07:30",
      "workEndTime": "14:30",
      "hireDate": "2022-08-18",
      "notesAr": "يركز على تبسيط المفاهيم الأساسية.",
      "notesEn": "Focuses on simplifying foundational concepts.",
      "createdAt": "2026-01-03T08:30:00Z",
      "updatedAt": "2026-03-12T10:15:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

---

## C. Teacher detail

### `GET /api/teachers/:id?yearId={yearId}&termId={termId}`

Return one teacher with assignment arrays resolved for the selected term.

Response:
```json
{
  "id": "teacher-1001",
  "code": "TCH-001",
  "firstNameAr": "أحمد",
  "firstNameEn": "Ahmed",
  "lastNameAr": "خالد",
  "lastNameEn": "Khaled",
  "fullNameAr": "أحمد خالد",
  "fullNameEn": "Ahmed Khaled",
  "email": "ahmed.khaled@school.test",
  "phone": "+201001112233",
  "gender": "MALE",
  "status": "ACTIVE",
  "subjectIds": ["subj-1", "subj-2"],
  "stageIds": ["stage-1"],
  "gradeIds": ["grade-1", "grade-2"],
  "sectionIds": ["section-1", "section-3"],
  "experienceYears": 4,
  "workDayFrom": "SUNDAY",
  "workDayTo": "THURSDAY",
  "workStartTime": "07:30",
  "workEndTime": "14:30",
  "hireDate": "2022-08-18",
  "notesAr": "يركز على تبسيط المفاهيم الأساسية.",
  "notesEn": "Focuses on simplifying foundational concepts.",
  "createdAt": "2026-01-03T08:30:00Z",
  "updatedAt": "2026-03-12T10:15:00Z"
}
```

---

## D. Create teacher

### Recommended contract
Because the current UI operates inside an academic year / term context, backend should accept the selected context during create.

### `POST /api/teachers`

Request:
```json
{
  "yearId": "year-2",
  "termId": "term-2-1",
  "code": "TCH-001",
  "firstNameAr": "أحمد",
  "firstNameEn": "Ahmed",
  "lastNameAr": "خالد",
  "lastNameEn": "Khaled",
  "email": "ahmed.khaled@school.test",
  "phone": "+201001112233",
  "gender": "MALE",
  "status": "ACTIVE",
  "subjectIds": ["subj-1", "subj-2"],
  "stageIds": ["stage-1"],
  "gradeIds": ["grade-1", "grade-2"],
  "sectionIds": ["section-1", "section-3"],
  "experienceYears": 4,
  "workDayFrom": "SUNDAY",
  "workDayTo": "THURSDAY",
  "workStartTime": "07:30",
  "workEndTime": "14:30",
  "hireDate": "2022-08-18",
  "notesAr": "يركز على تبسيط المفاهيم الأساسية.",
  "notesEn": "Focuses on simplifying foundational concepts."
}
```

Response:
```json
{
  "id": "teacher-uuid",
  "code": "TCH-001",
  "firstNameAr": "أحمد",
  "firstNameEn": "Ahmed",
  "lastNameAr": "خالد",
  "lastNameEn": "Khaled",
  "fullNameAr": "أحمد خالد",
  "fullNameEn": "Ahmed Khaled",
  "email": "ahmed.khaled@school.test",
  "phone": "+201001112233",
  "gender": "MALE",
  "status": "ACTIVE",
  "subjectIds": ["subj-1", "subj-2"],
  "stageIds": ["stage-1"],
  "gradeIds": ["grade-1", "grade-2"],
  "sectionIds": ["section-1", "section-3"],
  "experienceYears": 4,
  "workDayFrom": "SUNDAY",
  "workDayTo": "THURSDAY",
  "workStartTime": "07:30",
  "workEndTime": "14:30",
  "hireDate": "2022-08-18",
  "notesAr": "يركز على تبسيط المفاهيم الأساسية.",
  "notesEn": "Focuses on simplifying foundational concepts.",
  "createdAt": "2026-04-12T12:00:00Z",
  "updatedAt": "2026-04-12T12:00:00Z"
}
```

### Backend action
- create global teacher profile
- create or upsert term-scoped assignment record for `(teacherId, termId)`
- attach subjects / stages / grades / sections for that term assignment

---

## E. Update teacher

### `PATCH /api/teachers/:id`

Request:
```json
{
  "yearId": "year-2",
  "termId": "term-2-1",
  "code": "TCH-001",
  "firstNameAr": "أحمد",
  "firstNameEn": "Ahmed",
  "lastNameAr": "خالد",
  "lastNameEn": "Khaled",
  "email": "ahmed.khaled@school.test",
  "phone": "+201001112233",
  "gender": "MALE",
  "status": "ACTIVE",
  "subjectIds": ["subj-1", "subj-2"],
  "stageIds": ["stage-1"],
  "gradeIds": ["grade-1", "grade-2"],
  "sectionIds": ["section-1", "section-3"],
  "experienceYears": 5,
  "workDayFrom": "SUNDAY",
  "workDayTo": "THURSDAY",
  "workStartTime": "07:30",
  "workEndTime": "14:30",
  "hireDate": "2022-08-18",
  "notesAr": "تم تحديث الخبرة.",
  "notesEn": "Experience updated."
}
```

Response:
```json
{
  "id": "teacher-1001",
  "updatedAt": "2026-04-12T12:15:00Z"
}
```

### Backend action
- update global profile fields
- update the term-scoped assignment mapping for the supplied term context

---

## F. Status change

The current UI has a toggle action.  
Backend should expose an explicit status endpoint rather than a toggle-only action.

### `PATCH /api/teachers/:id/status`

Request:
```json
{
  "status": "INACTIVE"
}
```

Response:
```json
{
  "id": "teacher-1001",
  "status": "INACTIVE",
  "updatedAt": "2026-04-12T12:20:00Z"
}
```

---

## G. Delete teacher

### `DELETE /api/teachers/:id`

Recommended behavior:
- hard delete only if product allows it
- otherwise soft delete or mark inactive

Since current UI has an actual delete action, backend must decide:
- **preferred**: soft delete or archive
- **minimum compatible**: delete and return success

Response:
```json
{
  "success": true
}
```

---

## H. Change / reset teacher password

The current UI is an admin-style password reset modal:
- it does not ask for old password
- it validates only `newPassword` and `confirmNewPassword`
- confirm is UI-only and does not need to be stored

### `POST /api/teachers/:id/password/reset`

Request:
```json
{
  "newPassword": "Teacher@1234"
}
```

Response:
```json
{
  "success": true,
  "updatedAt": "2026-04-12T12:25:00Z"
}
```

### Recommended backend behavior
- update teacher's auth credential
- record audit log
- optionally invalidate existing sessions

---

## I. Uniqueness validation endpoints

The form currently checks uniqueness asynchronously for code and email.

### `GET /api/teachers/validate-code?code={code}&excludeId={optionalTeacherId}`

Response:
```json
{
  "isUnique": true
}
```

### `GET /api/teachers/validate-email?email={email}&excludeId={optionalTeacherId}`

Response:
```json
{
  "isUnique": true
}
```

These can also be implemented by returning standard 409 validation errors on create/update only, but the current UI is already set up to benefit from explicit async validation.

---

## Recommended error responses

### Duplicate teacher code
```json
{
  "message": "Teacher code already exists.",
  "field": "code",
  "code": "TEACHER_CODE_NOT_UNIQUE"
}
```

### Duplicate teacher email
```json
{
  "message": "Teacher email already exists.",
  "field": "email",
  "code": "TEACHER_EMAIL_NOT_UNIQUE"
}
```

### Validation error
```json
{
  "message": "Validation failed.",
  "errors": {
    "workEndTime": "Work end time must be later than work start time."
  }
}
```

---

## Suggested API summary

### Reference data
- `GET /api/teachers/reference-data?yearId=&termId=`  
or reuse:
- `GET /api/academics/structure-tree?yearId=&termId=`
- `GET /api/academics/subjects?termId=`

### Teachers
- `GET /api/teachers`
- `GET /api/teachers/:id`
- `POST /api/teachers`
- `PATCH /api/teachers/:id`
- `PATCH /api/teachers/:id/status`
- `DELETE /api/teachers/:id`
- `POST /api/teachers/:id/password/reset`
- `GET /api/teachers/validate-code`
- `GET /api/teachers/validate-email`

---

## Minimum backend contract to unblock frontend

If backend wants the smallest first version that still works with the current UI, implement:

1. `GET /api/teachers`
2. `POST /api/teachers`
3. `PATCH /api/teachers/:id`
4. `PATCH /api/teachers/:id/status`
5. `DELETE /api/teachers/:id`
6. `POST /api/teachers/:id/password/reset`
7. `GET /api/teachers/reference-data?yearId=&termId=`

That is enough to cover:
- list
- filters
- create
- edit
- details
- toggle active/inactive
- delete
- password reset

---

## Backend decisions to lock now

### 1. Global vs term-scoped assignments
**Recommended:** keep teacher profile global, assignments term-scoped.

### 2. Delete semantics
Prefer soft delete / archive unless product really needs hard delete.

### 3. Password behavior
Treat as admin reset endpoint, not teacher self-service change-password.

### 4. Reference data source
Either:
- reuse academics endpoints, or
- add one teachers aggregate endpoint

### 5. Filtering
Current UI can work with full-list fetch + client-side filtering, but backend should still support query filters and pagination.

---

## Final recommendation

For the real product backend, use:

- global `teachers`
- term-scoped teacher assignment mappings
- explicit validation and password reset endpoints
- academic reference data driven by selected `yearId` and `termId`

That model is the safest fit for the current frontend and avoids assignment drift when structure IDs vary by term.
