# Academics Backend Handoff Spec

## Scope

This spec is based on the current `academics` frontend module in `sis_dashboard`. The module currently spans:

- Academics overview dashboard
- Academic structure tree
- Subjects and subject allocations
- Teacher allocation
- Academic calendar
- Timetable and timetable configuration
- Curriculum
- Lesson plans

The exported academics feature surface currently includes `AcademicCalendarPage`, `AcademicStructurePage`, `CurriculumPage`, `LessonPlansPage`, `SubjectsAllocationPage`, `TeacherAllocationPage`, and `TimetablePage`. It also exposes the overview page and quick links routing users into structure, subjects, curriculum, calendar, timetable, lesson plans, and teacher allocation. fileciteturn34file0 fileciteturn33file1 fileciteturn34file1

---

## Cross-cutting backend rules

### 1) Terms drive write access
Multiple academics pages treat a term with status `closed` as read-only. Backend should enforce that mutating endpoints reject writes for closed terms, not just rely on the frontend banner. This appears in structure, curriculum, lesson plans, and timetable flows. fileciteturn34file2 fileciteturn42file0 fileciteturn44file0 fileciteturn33file14

### 2) Year + term context is foundational
Most academics pages load and filter everything through `academicYearId` and `termId`. Backend should make year and term endpoints available first because nearly every other page depends on them. fileciteturn35file0 fileciteturn34file1 fileciteturn34file2

### 3) Structure, subject allocation, and teacher allocation are dependencies for downstream modules
The overview, teacher load chart, timetable, curriculum, and lesson plans all depend on earlier setup data:
- structure tree
- subjects
- subject allocations
- teacher allocations
- calendar events in some cases fileciteturn34file1 fileciteturn33file0 fileciteturn45file0

### 4) Classroom-aware data is optional in some flows, mandatory in others
Some entities are section-level, some optionally include `classroomId`, and some use classroom-specific rows if classrooms exist for a section. Backend should preserve that pattern instead of flattening everything to section-only. This matters especially for teacher allocation, timetable, and lesson plans. fileciteturn37file0 fileciteturn38file0 fileciteturn47file0

---

## Canonical entities and enums

### Academic structure
From the structure service:
- `Stage`
- `Grade`
- `Section`
- `Classroom`
- `AcademicYear`
- `Term` with status `open | closed` fileciteturn35file0

### Subjects
- `Subject`
- `SubjectAllocation` with `gradeId`, `subjectId`, `weeklyHours` fileciteturn36file0

### Teachers
- `Teacher`
- `TeacherAllocation`
- `TeacherLoad`
- `ValidationIssue`
- `ValidationResult` fileciteturn37file0

### Calendar
- `AcademicEvent`
- `type`: `HOLIDAY | EXAM | ACTIVITY | OTHER`
- `scopeType`: `SCHOOL | STAGE | GRADE | SECTION` fileciteturn46file0

### Timetable
- `TimetableEntry`
- timetable configs at scope `TERM | GRADE | SECTION | CLASSROOM`
- publish state is effectively `DRAFT | PUBLISHED` on entries
- conflicts tracked for `TEACHER | ROOM` fileciteturn38file0 fileciteturn39file0

### Curriculum
- `Curriculum`
- `Unit`
- `Lesson`
- `LessonAttachment`
- `LessonVideo`
- `Assignment`
- `AssignmentAttachment`
- `AssignmentQuestion`
- question types:
  - `MCQ_SINGLE`
  - `MCQ_MULTI`
  - `TRUE_FALSE`
  - `SHORT_ANSWER`
  - `ESSAY`
  - `FILL_IN_BLANK`
  - `MATCHING`
  - `MEDIA` fileciteturn43file0

### Lesson plans
- `LessonPlan`
- `LessonPlanItem`
- `WeekInfo`
- `LessonPlanSummary`
- item status:
  - `PLANNED`
  - `IN_PROGRESS`
  - `DONE`
  - `SKIPPED` fileciteturn47file0

---

## Suggested database tables

## 1) Academic years and terms

### `academic_years`
```json
{
  "id": "year-2025-2026",
  "name": "2025-2026",
  "nameAr": "2025-2026",
  "nameEn": "2025-2026",
  "startDate": "2025-09-01",
  "endDate": "2026-06-30"
}
```

### `academic_terms`
```json
{
  "id": "term-2025-t2",
  "yearId": "year-2025-2026",
  "name": "Term 2",
  "nameAr": "الفصل الثاني",
  "nameEn": "Term 2",
  "status": "open",
  "startDate": "2026-01-01",
  "endDate": "2026-03-31"
}
```
Grounded in the structure service’s year and term models. fileciteturn35file0

## 2) Academic structure

### `academic_stages`
```json
{
  "id": "stage-primary",
  "yearId": "year-2025-2026",
  "termId": "term-2025-t2",
  "name": "Primary",
  "nameAr": "ابتدائي",
  "nameEn": "Primary",
  "description": "Primary education stage"
}
```

### `academic_grades`
```json
{
  "id": "grade-1",
  "yearId": "year-2025-2026",
  "termId": "term-2025-t2",
  "stageId": "stage-primary",
  "name": "Grade 1",
  "nameAr": "الصف الأول",
  "nameEn": "Grade 1",
  "order": 1,
  "notes": ""
}
```

### `academic_sections`
```json
{
  "id": "section-a",
  "yearId": "year-2025-2026",
  "termId": "term-2025-t2",
  "gradeId": "grade-1",
  "name": "Section A",
  "nameAr": "شعبة أ",
  "nameEn": "Section A",
  "capacity": 30,
  "order": 1,
  "notes": ""
}
```

### `academic_classrooms`
```json
{
  "id": "classroom-101",
  "yearId": "year-2025-2026",
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "name": "Classroom 101",
  "nameAr": "فصل 101",
  "nameEn": "Classroom 101",
  "capacity": 30,
  "order": 1,
  "notes": ""
}
```
The structure data is explicitly term-scoped in the current service. Grades, sections, and classrooms all support ordering, and sections/classrooms carry capacity. fileciteturn35file0

## 3) Subjects and allocations

### `academic_subjects`
```json
{
  "id": "subj-math",
  "termId": "term-2025-t2",
  "name": "Mathematics",
  "nameAr": "الرياضيات",
  "nameEn": "Mathematics",
  "code": "MATH101",
  "stage": "Primary",
  "isActive": true
}
```

### `academic_subject_allocations`
```json
{
  "termId": "term-2025-t2",
  "gradeId": "grade-1",
  "subjectId": "subj-math",
  "weeklyHours": 5
}
```
Subjects are term-scoped, while the allocation matrix is effectively `(termId, gradeId, subjectId) -> weeklyHours`. fileciteturn36file0

## 4) Teachers and allocations

### `academic_teachers`
```json
{
  "id": "teacher-1",
  "nameAr": "أحمد محمد",
  "nameEn": "Ahmed Mohamed",
  "email": "ahmed@school.com",
  "maxWeeklyLoad": 24,
  "isActive": true
}
```

### `academic_teacher_subject_qualifications`
```json
{
  "teacherId": "teacher-1",
  "subjectId": "subj-math"
}
```

### `academic_teacher_allocations`
```json
{
  "id": "alloc-1",
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "classroomId": "classroom-101",
  "subjectId": "subj-math",
  "teacherId": "teacher-1"
}
```
Teacher allocations are term-scoped and may be section-level or classroom-level. The validation logic checks missing assignments and overloaded teachers based on subject allocation weekly hours. fileciteturn37file0

## 5) Calendar events

### `academic_events`
```json
{
  "id": "event-1",
  "termId": "term-2025-t2",
  "titleAr": "اختبار الرياضيات",
  "titleEn": "Mathematics Exam",
  "type": "EXAM",
  "allDay": false,
  "startDate": "2026-02-15",
  "endDate": "2026-02-15",
  "scopeType": "GRADE",
  "scopeId": "grade-1",
  "notesAr": "اختبار الوحدة الأولى",
  "notesEn": "Unit 1 exam",
  "notify": true,
  "createdAt": "2026-01-20T10:00:00Z"
}
```
Events are term-scoped and can target school/stage/grade/section. Holidays are also used downstream when calculating instructional weeks in lesson plans. fileciteturn46file0 fileciteturn45file0

## 6) Timetable

### `timetable_configs`
```json
{
  "id": "config-term-term-2025-t2",
  "termId": "term-2025-t2",
  "scopeType": "TERM",
  "scopeId": null,
  "days": [
    { "key": "sun", "index": 0, "nameAr": "الأحد", "nameEn": "Sunday", "isActive": true }
  ],
  "periods": [
    { "id": "p1", "index": 1, "nameAr": "الحصة 1", "nameEn": "Period 1", "startTime": "08:00", "endTime": "08:45" }
  ],
  "updatedAt": "2026-04-12T09:00:00Z"
}
```

### `timetable_entries`
```json
{
  "id": "tt-1",
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "classroomId": "classroom-101",
  "dayKey": "sun",
  "periodIndex": 1,
  "subjectId": "subj-math",
  "teacherId": "teacher-1",
  "roomId": "room-math",
  "status": "DRAFT",
  "updatedAt": "2026-04-12T09:15:00Z"
}
```
Timetable data is stored per term + section + optional classroom. Config inheritance also exists at term/grade/section/classroom level. fileciteturn38file0 fileciteturn39file0

## 7) Curriculum

### `curricula`
```json
{
  "id": "curr-1",
  "termId": "term-2025-t2",
  "gradeId": "grade-1",
  "subjectId": "subj-math",
  "name": "Grade 1 Mathematics - Term 2",
  "createdAt": "2026-01-10T08:00:00Z"
}
```

### `curriculum_units`
```json
{
  "id": "unit-1",
  "curriculumId": "curr-1",
  "title": "Numbers and Operations",
  "titleAr": "الأعداد والعمليات",
  "titleEn": "Numbers and Operations",
  "description": "Introduction to basic numbers",
  "order": 1
}
```

### `curriculum_lessons`
```json
{
  "id": "lesson-1",
  "unitId": "unit-1",
  "title": "Counting 1-10",
  "titleAr": "العد من 1 إلى 10",
  "titleEn": "Counting 1-10",
  "objectives": "Students will count from 1 to 10",
  "resources": "Blocks, cards",
  "durationMinutes": 45,
  "plannedWeek": 1,
  "status": "planned",
  "doneAt": null,
  "order": 1
}
```

### `lesson_attachments`
```json
{
  "id": "attachment-1",
  "lessonId": "lesson-1",
  "type": "FILE",
  "title": "Worksheet 1",
  "url": "https://files.example.com/worksheet-1.pdf",
  "fileName": "worksheet-1.pdf",
  "mimeType": "application/pdf",
  "size": 120334,
  "category": "worksheet",
  "createdAt": "2026-01-12T09:00:00Z"
}
```

### `lesson_videos`
```json
{
  "id": "video-1",
  "lessonId": "lesson-1",
  "titleAr": "شرح الدرس",
  "titleEn": "Lesson Explanation",
  "type": "LINK",
  "url": "https://video.example.com/lesson-1",
  "fileName": null,
  "mimeType": null,
  "size": null,
  "createdAt": "2026-01-12T09:10:00Z"
}
```

### `lesson_assignments`
```json
{
  "id": "assignment-1",
  "lessonId": "lesson-1",
  "titleAr": "واجب العد",
  "titleEn": "Counting Homework",
  "descriptionAr": "أكمل التمرين",
  "descriptionEn": "Complete the exercise",
  "dueDate": "2026-01-20",
  "maxScore": 10,
  "expectedTimeMinutes": 20,
  "isPublished": true,
  "createdAt": "2026-01-12T10:00:00Z"
}
```

### `assignment_attachments`
```json
{
  "id": "attach-1",
  "assignmentId": "assignment-1",
  "type": "LINK",
  "title": "Reference Link",
  "url": "https://example.com/reference",
  "createdAt": "2026-01-12T10:05:00Z"
}
```

### `assignment_questions`
```json
{
  "id": "question-1",
  "assignmentId": "assignment-1",
  "questionTextAr": "كم هو 2 + 2؟",
  "questionTextEn": "What is 2 + 2?",
  "questionType": "MCQ_SINGLE",
  "points": 2,
  "order": 1,
  "options": [
    { "id": "opt-1", "textAr": "4", "textEn": "4", "isCorrect": true, "order": 1 }
  ],
  "createdAt": "2026-01-12T10:10:00Z"
}
```
The curriculum service models curriculum creation by `(termId, gradeId, subjectId)` and then nests units, lessons, lesson attachments/videos, assignments, assignment attachments, and assignment questions under it. fileciteturn43file0

## 8) Lesson plans

### `lesson_plans`
```json
{
  "id": "plan-1",
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "subjectId": "subj-math",
  "classroomId": "classroom-101",
  "teacherId": "teacher-1",
  "weekIndex": 1,
  "updatedAt": "2026-02-01T08:00:00Z"
}
```

### `lesson_plan_items`
```json
{
  "id": "item-1",
  "planId": "plan-1",
  "lessonId": "lesson-1",
  "unitId": "unit-1",
  "status": "PLANNED",
  "order": 1,
  "notesAr": "راجع النشاط العملي",
  "notesEn": "Review activity",
  "resources": [],
  "assignmentIds": ["assignment-1"]
}
```

### `lesson_plan_weeks` (optional materialized table)
This is optional; backend may compute it dynamically from term dates + holidays.
```json
{
  "termId": "term-2025-t2",
  "weekIndex": 1,
  "startDate": "2026-01-01",
  "endDate": "2026-01-07",
  "lostTeachingDays": 1,
  "hasHolidays": true
}
```
The current frontend computes teaching weeks from term dates and holiday events, then stores weekly lesson plan groupings. fileciteturn47file0 fileciteturn45file0

---

## Suggested endpoints

## A. Years and terms

### `GET /api/academics/years`
Response:
```json
{
  "items": [
    {
      "id": "year-2025-2026",
      "name": "2025-2026",
      "nameAr": "2025-2026",
      "nameEn": "2025-2026",
      "startDate": "2025-09-01",
      "endDate": "2026-06-30"
    }
  ]
}
```

### `POST /api/academics/years`
Request:
```json
{
  "name": "2026-2027",
  "nameAr": "2026-2027",
  "nameEn": "2026-2027",
  "startDate": "2026-09-01",
  "endDate": "2027-06-30"
}
```

### `PATCH /api/academics/years/:id`
Request:
```json
{
  "nameEn": "2026-2027"
}
```

### `GET /api/academics/years/:yearId/terms`
Response:
```json
{
  "items": [
    {
      "id": "term-2025-t2",
      "yearId": "year-2025-2026",
      "name": "Term 2",
      "nameAr": "الفصل الثاني",
      "nameEn": "Term 2",
      "status": "open",
      "startDate": "2026-01-01",
      "endDate": "2026-03-31"
    }
  ]
}
```

### `POST /api/academics/terms`
Request:
```json
{
  "yearId": "year-2025-2026",
  "name": "Term 3",
  "nameAr": "الفصل الثالث",
  "nameEn": "Term 3",
  "status": "open",
  "startDate": "2026-04-01",
  "endDate": "2026-06-30"
}
```

### `PATCH /api/academics/terms/:id`
Request:
```json
{
  "status": "closed"
}
```
These operations already exist conceptually in the structure service. fileciteturn35file0

## B. Overview dashboard

### `GET /api/academics/overview?yearId={yearId}&termId={termId}`
Suggested response:
```json
{
  "structure": {
    "totalStages": 3,
    "totalGrades": 8,
    "totalSections": 14,
    "sectionsWithoutCapacity": 1,
    "gradesWithoutSections": 0
  },
  "subjects": {
    "totalSubjects": 10,
    "totalAllocations": 24,
    "expectedAllocations": 30,
    "completionPercentage": 80,
    "missingAllocations": 6
  },
  "teacherAllocation": {
    "totalAllocations": 20,
    "missingAllocations": 4,
    "overloadedTeachers": 1,
    "averageLoad": 18
  },
  "calendar": {
    "upcomingEvents": 5,
    "nextHolidayDate": "2026-02-20",
    "nextExamDate": "2026-02-15"
  },
  "lessonPlans": {
    "totalPlanned": 40,
    "totalDone": 22,
    "completionPercentage": 55,
    "weeklyBreakdown": [
      { "week": "Week 1", "planned": 6, "done": 5 }
    ]
  }
}
```
The overview page builds checklist, alerts, teacher-load charts, and readiness from overview metrics plus structure, subject allocation, and teacher allocation data. fileciteturn34file1

## C. Academic structure

### `GET /api/academics/structure-tree?yearId={yearId}&termId={termId}`
Response:
```json
{
  "stages": [],
  "grades": [],
  "sections": [],
  "classrooms": []
}
```

### `POST /api/academics/stages`
Request:
```json
{
  "yearId": "year-2025-2026",
  "termId": "term-2025-t2",
  "nameAr": "ابتدائي",
  "nameEn": "Primary",
  "description": "Primary education stage"
}
```

### `PATCH /api/academics/stages/:id`
Request:
```json
{
  "yearId": "year-2025-2026",
  "termId": "term-2025-t2",
  "nameAr": "ابتدائي",
  "nameEn": "Primary",
  "description": "Updated"
}
```

### `DELETE /api/academics/stages/:id?yearId={yearId}&termId={termId}`

### `POST /api/academics/grades`
Request:
```json
{
  "yearId": "year-2025-2026",
  "termId": "term-2025-t2",
  "stageId": "stage-primary",
  "nameAr": "الصف الأول",
  "nameEn": "Grade 1",
  "order": 1,
  "notes": ""
}
```

### `PATCH /api/academics/grades/:id`
### `DELETE /api/academics/grades/:id?yearId={yearId}&termId={termId}`

### `POST /api/academics/sections`
Request:
```json
{
  "yearId": "year-2025-2026",
  "termId": "term-2025-t2",
  "gradeId": "grade-1",
  "nameAr": "شعبة أ",
  "nameEn": "Section A",
  "capacity": 30,
  "order": 1,
  "notes": ""
}
```

### `PATCH /api/academics/sections/:id`
### `DELETE /api/academics/sections/:id?yearId={yearId}&termId={termId}`

### `POST /api/academics/classrooms`
Request:
```json
{
  "yearId": "year-2025-2026",
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "nameAr": "فصل 101",
  "nameEn": "Classroom 101",
  "capacity": 30,
  "order": 1,
  "notes": ""
}
```

### `PATCH /api/academics/classrooms/:id`
### `DELETE /api/academics/classrooms/:id?yearId={yearId}&termId={termId}`

### `POST /api/academics/grades/reorder`
Request:
```json
{
  "yearId": "year-2025-2026",
  "termId": "term-2025-t2",
  "stageId": "stage-primary",
  "orderedGradeIds": ["grade-1", "grade-2", "grade-3"]
}
```

### `POST /api/academics/sections/reorder`
Request:
```json
{
  "yearId": "year-2025-2026",
  "termId": "term-2025-t2",
  "gradeId": "grade-1",
  "orderedSectionIds": ["section-a", "section-b"]
}
```

### `POST /api/academics/classrooms/reorder`
Request:
```json
{
  "yearId": "year-2025-2026",
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "orderedClassroomIds": ["classroom-101", "classroom-102"]
}
```

### `POST /api/academics/structure/carry-over`
Request:
```json
{
  "fromYearId": "year-2024-2025",
  "fromTermId": "term-2024-t3",
  "toYearId": "year-2025-2026",
  "toTermId": "term-2025-t1",
  "copyCapacities": true,
  "copyOrdering": true
}
```

Backend notes:
- uniqueness should be enforced within scope:
  - stage name unique within term
  - grade name unique within stage
  - section name unique within grade
  - classroom name unique within section
- deleting parent nodes should cascade to children as the current service does. fileciteturn35file0 fileciteturn34file2

## D. Subjects and allocations

### `GET /api/academics/subjects?termId={termId}`
Response:
```json
{
  "items": [
    {
      "id": "subj-math",
      "termId": "term-2025-t2",
      "name": "Mathematics",
      "nameAr": "الرياضيات",
      "nameEn": "Mathematics",
      "code": "MATH101",
      "stage": "Primary",
      "isActive": true
    }
  ]
}
```

### `POST /api/academics/subjects`
Request:
```json
{
  "termId": "term-2025-t2",
  "nameAr": "الرياضيات",
  "nameEn": "Mathematics",
  "code": "MATH101",
  "stage": "Primary",
  "isActive": true
}
```

### `PATCH /api/academics/subjects/:id`
### `DELETE /api/academics/subjects/:id?termId={termId}`

### `GET /api/academics/subject-allocations?termId={termId}`
Response:
```json
{
  "items": [
    {
      "gradeId": "grade-1",
      "subjectId": "subj-math",
      "weeklyHours": 5
    }
  ]
}
```

### `PUT /api/academics/subject-allocations/bulk`
Request:
```json
{
  "termId": "term-2025-t2",
  "items": [
    {
      "gradeId": "grade-1",
      "subjectId": "subj-math",
      "weeklyHours": 5
    }
  ]
}
```

### `POST /api/academics/subjects/carry-over`
Request:
```json
{
  "fromYearId": "year-2024-2025",
  "fromTermId": "term-2024-t3",
  "toYearId": "year-2025-2026",
  "toTermId": "term-2025-t1",
  "options": {
    "copySubjects": true,
    "copyAllocations": true
  }
}
```
The subjects page is term-scoped, supports subject CRUD, an allocation matrix, and carry over. fileciteturn36file0 fileciteturn49file0

## E. Teachers and teacher allocation

### `GET /api/academics/teachers`
Response:
```json
{
  "items": [
    {
      "id": "teacher-1",
      "nameAr": "أحمد محمد",
      "nameEn": "Ahmed Mohamed",
      "email": "ahmed@school.com",
      "maxWeeklyLoad": 24,
      "subjects": ["subj-math", "subj-science"],
      "isActive": true
    }
  ]
}
```

### `POST /api/academics/teachers`
### `PATCH /api/academics/teachers/:id`
### `DELETE /api/academics/teachers/:id`

### `GET /api/academics/teacher-allocations?termId={termId}`
Response:
```json
{
  "items": [
    {
      "id": "alloc-1",
      "termId": "term-2025-t2",
      "sectionId": "section-a",
      "classroomId": "classroom-101",
      "subjectId": "subj-math",
      "teacherId": "teacher-1"
    }
  ]
}
```

### `PUT /api/academics/teacher-allocations/bulk`
Request:
```json
{
  "termId": "term-2025-t2",
  "items": [
    {
      "sectionId": "section-a",
      "classroomId": "classroom-101",
      "subjectId": "subj-math",
      "teacherId": "teacher-1"
    }
  ]
}
```

### `POST /api/academics/teacher-allocations/apply-to-grade`
Request:
```json
{
  "termId": "term-2025-t2",
  "gradeId": "grade-1",
  "subjectId": "subj-math",
  "teacherId": "teacher-1",
  "sectionIds": ["section-a", "section-b"],
  "classroomIdsBySection": {
    "section-a": ["classroom-101", "classroom-102"],
    "section-b": ["classroom-201"]
  }
}
```

### `POST /api/academics/teacher-allocations/clear-subject`
Request:
```json
{
  "termId": "term-2025-t2",
  "gradeId": "grade-1",
  "subjectId": "subj-math"
}
```

### `POST /api/academics/teacher-allocations/validate`
Request:
```json
{
  "termId": "term-2025-t2",
  "grades": [],
  "sections": [],
  "classrooms": [],
  "subjects": [],
  "subjectAllocations": [],
  "teacherAllocations": []
}
```

Suggested response:
```json
{
  "isValid": false,
  "missingCount": 2,
  "overloadedCount": 1,
  "unqualifiedCount": 0,
  "sectionsWithMissing": 1,
  "missingAllocations": [
    { "sectionId": "section-a", "classroomId": "classroom-101", "subjectId": "subj-math" }
  ],
  "overloadedTeachers": [
    { "teacherId": "teacher-1", "currentLoad": 28, "maxLoad": 24 }
  ],
  "issues": []
}
```

### `GET /api/academics/teacher-loads?termId={termId}`
Suggested response:
```json
{
  "items": [
    {
      "teacherId": "teacher-1",
      "teacherName": "Ahmed Mohamed",
      "teacherNameAr": "أحمد محمد",
      "teacherNameEn": "Ahmed Mohamed",
      "totalWeeklyPeriods": 20,
      "assignments": []
    }
  ]
}
```

### `POST /api/academics/teacher-allocations/carry-over`
Request:
```json
{
  "fromYearId": "year-2024-2025",
  "fromTermId": "term-2024-t3",
  "toYearId": "year-2025-2026",
  "toTermId": "term-2025-t1"
}
```
The teacher allocation page keeps a working copy for unsaved changes, supports validation, teacher load analytics, and carry over. fileciteturn37file0 fileciteturn51file0

## F. Academic calendar

### `GET /api/academics/events?termId={termId}`
### `POST /api/academics/events`
Request:
```json
{
  "termId": "term-2025-t2",
  "titleAr": "اختبار الرياضيات",
  "titleEn": "Mathematics Exam",
  "type": "EXAM",
  "allDay": false,
  "startDate": "2026-02-15",
  "endDate": "2026-02-15",
  "scopeType": "GRADE",
  "scopeId": "grade-1",
  "notesAr": "اختبار الوحدة الأولى",
  "notesEn": "Unit 1 exam",
  "notify": true
}
```

### `PATCH /api/academics/events/:id`
### `DELETE /api/academics/events/:id`

### `POST /api/academics/events/:id/notify`
Use this when the frontend wants to notify affected users for an exam or holiday event. fileciteturn46file0

## G. Timetable

### `GET /api/academics/timetable?termId={termId}&sectionId={sectionId}&classroomId={classroomId}`
Returns entries for one section and optional classroom.

### `GET /api/academics/timetable/all?termId={termId}`
Used for cross-section conflict detection.

### `PUT /api/academics/timetable`
Request:
```json
{
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "classroomId": "classroom-101",
  "entries": [
    {
      "dayKey": "sun",
      "periodIndex": 1,
      "subjectId": "subj-math",
      "teacherId": "teacher-1",
      "roomId": "room-1"
    }
  ]
}
```

### `DELETE /api/academics/timetable/slot`
Request:
```json
{
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "classroomId": "classroom-101",
  "dayKey": "sun",
  "periodIndex": 1
}
```

### `POST /api/academics/timetable/publish`
Request:
```json
{
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "classroomId": "classroom-101"
}
```

### `POST /api/academics/timetable/unpublish`
Request:
```json
{
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "classroomId": "classroom-101"
}
```

### `POST /api/academics/timetable/validate`
Suggested response:
```json
{
  "isValid": true,
  "completeness": {
    "totalSlots": 40,
    "filledSlots": 32,
    "missingTeacher": 2,
    "missingRoom": 5
  },
  "subjectHours": [],
  "conflicts": []
}
```

### `POST /api/academics/timetable/conflicts`
Request body should accept a proposed list of entries plus reference sets for sections, classrooms, teachers, rooms, and subjects, then return teacher/room collisions. fileciteturn38file0

### Timetable configs

### `GET /api/academics/timetable-configs?termId={termId}`
### `GET /api/academics/timetable-configs/resolve?termId={termId}&scopeType={scopeType}&scopeId={scopeId}`
### `PUT /api/academics/timetable-configs`
Request:
```json
{
  "termId": "term-2025-t2",
  "scopeType": "SECTION",
  "scopeId": "section-a",
  "days": [
    { "key": "sun", "index": 0, "nameAr": "الأحد", "nameEn": "Sunday", "isActive": true }
  ],
  "periods": [
    { "id": "p1", "index": 1, "nameAr": "الحصة 1", "nameEn": "Period 1", "startTime": "08:00", "endTime": "08:45" }
  ]
}
```

### `DELETE /api/academics/timetable-configs/:id`
### `POST /api/academics/timetable-configs/reset`
Request:
```json
{
  "termId": "term-2025-t2",
  "scopeType": "SECTION",
  "scopeId": "section-a"
}
```
The timetable view also depends on subjects, subject allocations, teacher allocations, rooms, and room default assignments when editing and auto-generating slots. Backend should keep those contracts compatible. fileciteturn33file0 fileciteturn33file14 fileciteturn39file0

## H. Curriculum

### `GET /api/academics/curriculum?termId={termId}&gradeId={gradeId}&subjectId={subjectId}`
Returns one curriculum or `null`.

### `POST /api/academics/curricula`
Request:
```json
{
  "termId": "term-2025-t2",
  "gradeId": "grade-1",
  "subjectId": "subj-math",
  "name": "Grade 1 Mathematics - Term 2"
}
```

### `PATCH /api/academics/curricula/:id`

### Units
- `GET /api/academics/curricula/:curriculumId/units`
- `POST /api/academics/curricula/:curriculumId/units`
- `PATCH /api/academics/units/:id`
- `DELETE /api/academics/units/:id`
- `POST /api/academics/units/reorder`

### Lessons
- `GET /api/academics/units/:unitId/lessons`
- `GET /api/academics/curricula/:curriculumId/lessons`
- `POST /api/academics/units/:unitId/lessons`
- `PATCH /api/academics/lessons/:id`
- `DELETE /api/academics/lessons/:id`
- `POST /api/academics/lessons/reorder`
- `POST /api/academics/lessons/:id/schedule`
- `POST /api/academics/lessons/:id/mark-done`
- `POST /api/academics/lessons/:id/undo-done`

Example lesson create:
```json
{
  "titleAr": "العد من 1 إلى 10",
  "titleEn": "Counting 1-10",
  "objectives": "Students will count from 1 to 10",
  "resources": "Blocks, cards",
  "durationMinutes": 45,
  "plannedWeek": 1
}
```

### Lesson attachments
- `GET /api/academics/lessons/:lessonId/attachments`
- `POST /api/academics/lessons/:lessonId/attachments/file` as multipart
- `POST /api/academics/lessons/:lessonId/attachments/link`
- `DELETE /api/academics/attachments/:id`

### Lesson video
- `GET /api/academics/lessons/:lessonId/video`
- `PUT /api/academics/lessons/:lessonId/video/link`
- `PUT /api/academics/lessons/:lessonId/video/file` as multipart
- `DELETE /api/academics/lessons/:lessonId/video`

### Assignments
- `GET /api/academics/lessons/:lessonId/assignments`
- `GET /api/academics/lessons/:lessonId/assignments/:assignmentId`
- `POST /api/academics/lessons/:lessonId/assignments`
- `PATCH /api/academics/assignments/:id`
- `DELETE /api/academics/assignments/:id`

### Assignment attachments
- `GET /api/academics/assignments/:assignmentId/attachments`
- `POST /api/academics/assignments/:assignmentId/attachments/file` as multipart
- `POST /api/academics/assignments/:assignmentId/attachments/link`
- `DELETE /api/academics/assignment-attachments/:id`

### Assignment questions
- `GET /api/academics/assignments/:assignmentId/questions`
- `POST /api/academics/assignments/:assignmentId/questions`
- `PATCH /api/academics/questions/:id`
- `DELETE /api/academics/questions/:id`
- `POST /api/academics/assignments/:assignmentId/questions/reorder`
- `PATCH /api/academics/assignments/:assignmentId/questions/points`

### Curriculum carry over
### `POST /api/academics/curricula/carry-over`
Request:
```json
{
  "fromYearId": "year-2024-2025",
  "fromTermId": "term-2024-t3",
  "toYearId": "year-2025-2026",
  "toTermId": "term-2025-t1",
  "gradeId": "grade-1",
  "subjectId": "subj-math",
  "options": {
    "copyOutline": true,
    "copySchedule": true
  }
}
```
The curriculum page is explicitly grade + subject filtered inside a term and exposes curriculum creation, outline editing, lesson planning metadata, carry over, and a nested lesson/assignment/question tree. fileciteturn42file0 fileciteturn43file0

## I. Lesson plans

### `GET /api/academics/lesson-plan-weeks?termId={termId}`
This can be backed by dynamic calculation from term dates + holiday events.

Suggested response:
```json
{
  "items": [
    {
      "weekIndex": 1,
      "startDate": "2026-01-01",
      "endDate": "2026-01-07",
      "lostTeachingDays": 1,
      "hasHolidays": true
    }
  ]
}
```

### `GET /api/academics/lesson-plans?termId={termId}&sectionId={sectionId}&subjectId={subjectId}&classroomId={classroomId}`
Response:
```json
{
  "items": [
    {
      "id": "plan-1",
      "termId": "term-2025-t2",
      "sectionId": "section-a",
      "subjectId": "subj-math",
      "classroomId": "classroom-101",
      "teacherId": "teacher-1",
      "weekIndex": 1,
      "items": [],
      "updatedAt": "2026-02-01T08:00:00Z"
    }
  ]
}
```

### `GET /api/academics/lesson-plans/summary?termId={termId}&sectionId={sectionId}&subjectId={subjectId}&classroomId={classroomId}`
Response:
```json
{
  "totalPlanned": 8,
  "totalInProgress": 2,
  "totalDone": 6,
  "totalSkipped": 1,
  "completionPercentage": 35,
  "weeklyBreakdown": [
    { "weekIndex": 1, "planned": 2, "inProgress": 0, "done": 1, "skipped": 0 }
  ]
}
```

### `PUT /api/academics/lesson-plan-items`
Request:
```json
{
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "subjectId": "subj-math",
  "classroomId": "classroom-101",
  "teacherId": "teacher-1",
  "weekIndex": 1,
  "lessonId": "lesson-1",
  "unitId": "unit-1",
  "status": "PLANNED",
  "order": 1,
  "notesAr": "",
  "notesEn": ""
}
```

### `DELETE /api/academics/lesson-plan-items/:itemId`
Query/body should include `termId`, `sectionId`, `subjectId`, and optional `classroomId`.

### `POST /api/academics/lesson-plan-items/reorder`
Request:
```json
{
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "subjectId": "subj-math",
  "classroomId": "classroom-101",
  "weekIndex": 1,
  "orderedItemIds": ["item-1", "item-2"]
}
```

### `POST /api/academics/lesson-plan-items/move`
Request:
```json
{
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "subjectId": "subj-math",
  "classroomId": "classroom-101",
  "itemId": "item-1",
  "toWeekIndex": 2,
  "toOrder": 1
}
```

### `POST /api/academics/lesson-plan-items/:id/status`
Request:
```json
{
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "subjectId": "subj-math",
  "classroomId": "classroom-101",
  "status": "DONE"
}
```

### `POST /api/academics/lesson-plan-items/:id/notes`
Request:
```json
{
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "subjectId": "subj-math",
  "classroomId": "classroom-101",
  "notesAr": "تم التنفيذ",
  "notesEn": "Completed"
}
```

### `POST /api/academics/lesson-plans/auto-plan`
Request:
```json
{
  "termId": "term-2025-t2",
  "sectionId": "section-a",
  "subjectId": "subj-math",
  "classroomId": "classroom-101",
  "teacherId": "teacher-1",
  "lessonIds": ["lesson-1", "lesson-2", "lesson-3"],
  "weekCount": 12
}
```
Lesson plans depend on structure, curriculum lessons, teacher allocations, and calendar holidays, so backend should keep these endpoints compatible rather than treating lesson plans as a standalone silo. fileciteturn44file0 fileciteturn45file0 fileciteturn47file0

---

## Important implementation notes

### 1) Read-only term enforcement
Reject all writes when `term.status = closed` for:
- structure mutations
- subject CRUD and allocation saves
- teacher allocation saves
- calendar mutations
- timetable changes and config saves
- curriculum writes
- lesson plan writes

### 2) Scope-aware uniqueness
Enforce:
- unique stage names within term
- unique grade names within stage
- unique section names within grade
- unique classroom names within section fileciteturn35file0

### 3) Classroom-specific overrides
Do not assume one section = one classroom in:
- teacher allocations
- timetable
- lesson plans

The frontend explicitly resolves classroom-specific rows when classrooms exist. fileciteturn37file0 fileciteturn45file0 fileciteturn47file0

### 4) Holiday-aware week calculation
Lesson plan week generation should consider holiday ranges and calculate lost teaching days, not just simple week numbers. fileciteturn47file0 fileciteturn46file0

### 5) Overview is an aggregate endpoint, not raw CRUD
The overview page is not just listing rows. It computes readiness, alerts, checklist items, lesson-plan completion, and teacher-load analytics. Treat it as a dedicated summary endpoint. fileciteturn34file1

### 6) Attachments and videos should use multipart where files are uploaded
This applies to:
- lesson attachments
- lesson video uploads
- assignment attachments

Link-based attachments should remain JSON endpoints. fileciteturn43file0

---

## Best backend-first implementation order

1. academic years and terms
2. structure tree CRUD + reorder + carry over
3. subjects CRUD + subject allocations
4. teachers + teacher allocations + validation + loads
5. calendar events
6. timetable configs + timetable entries + publish/validation
7. curriculum + units + lessons
8. lesson attachments, videos, assignments, and questions
9. lesson plans + summary + auto-plan
10. overview summary endpoint

That order matches how downstream modules depend on upstream setup in the current frontend. fileciteturn34file1 fileciteturn33file0 fileciteturn45file0

---

## Minimum viable contract

If backend wants the smallest first release that unblocks most of the academics module, implement this set first:

- `GET /api/academics/years`
- `GET /api/academics/years/:yearId/terms`
- `GET /api/academics/structure-tree`
- structure CRUD + reorder + carry-over
- `GET /api/academics/subjects`
- `GET /api/academics/subject-allocations`
- `PUT /api/academics/subject-allocations/bulk`
- `GET /api/academics/teachers`
- `GET /api/academics/teacher-allocations`
- `PUT /api/academics/teacher-allocations/bulk`
- `POST /api/academics/teacher-allocations/validate`
- `GET /api/academics/events`
- `GET /api/academics/timetable`
- `PUT /api/academics/timetable`
- `GET /api/academics/timetable-configs`
- `PUT /api/academics/timetable-configs`
- `GET /api/academics/curriculum`
- curriculum/unit/lesson CRUD
- `GET /api/academics/lesson-plans`
- `PUT /api/academics/lesson-plan-items`
- `GET /api/academics/lesson-plans/summary`
- `GET /api/academics/overview`

This would unblock the main academics workflows with the least fragmentation across the current UI.
