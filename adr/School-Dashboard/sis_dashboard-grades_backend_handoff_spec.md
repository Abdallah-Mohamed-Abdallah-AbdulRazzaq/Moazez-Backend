# Grades Backend Handoff Spec

## Scope

This handoff is based on the current **grades** module in `sis_dashboard`.

Confirmed grades routes and views:

- `/grades` → overview workspace
- `/grades/assessments`
- `/grades/gradebook`
- `/grades/assessments/new`
- `/grades/assessments/[assessmentId]/questions`

The current module is one shared workspace with three main data views:

- **Overview**
- **Assessments**
- **Gradebook**

And two creation/edit flows:

- **Create assessment**
- **Question builder / question management** for question-based assessments

The frontend currently supports:

- year/term scoped grades browsing
- scope-aware filtering by school / stage / grade / section / classroom
- subject filtering
- assessments CRUD
- publish / approve / lock workflow
- score-only grading
- question-based grading and per-question correction
- bulk grade entry
- overview summaries and analytics
- student grade snapshots

---

## High-level backend rules

1. **Grades are scoped by academic year and term**
   Nearly every grades service call uses `academicYearId` and `termId`.

2. **The module is scope-aware**
   Supported scope types:
   - `school`
   - `stage`
   - `grade`
   - `section`
   - `classroom`

3. **Assessments have workflow states**
   Current statuses:
   - `draft`
   - `published`
   - `approved`

4. **Locking is stricter than approval**
   An assessment can be locked only after approval.

5. **There are two delivery modes**
   - `SCORE_ONLY`
   - `QUESTION_BASED`

6. **Question-based assessments cannot be graded through simple grade-item editing**
   Their scores are derived from corrected question answers.

7. **Grade rules are currently school-or-grade level**
   The frontend resolves a rule for narrower scopes by mapping them upward to grade or school.

8. **Closed terms should be treated as read-only**
   The UI disables editing when the selected term is closed. Backend should enforce this consistently.

---

## 1) Shared enums

### Scope types

```json
{
  "ExamScopeType": ["school", "stage", "grade", "section", "classroom"]
}
```

### Assessment type

```json
{
  "AssessmentType": ["QUIZ", "MONTH_EXAM", "MIDTERM", "TERM_EXAM"],
  "LegacyAssessmentType": ["ASSIGNMENT", "FINAL", "PRACTICAL"]
}
```

### Delivery and grading states

```json
{
  "AssessmentDeliveryMode": ["SCORE_ONLY", "QUESTION_BASED"],
  "GradeItemStatus": ["entered", "missing", "absent"],
  "AssessmentApprovalStatus": ["draft", "published", "approved"]
}
```

### Submission and correction states

```json
{
  "AssessmentSubmissionStatus": [
    "not_started",
    "submitted",
    "in_progress",
    "corrected"
  ],
  "AssessmentCorrectionStatus": ["pending", "corrected"]
}
```

### Questions Types

```json
{
  "questionType": [
    "MCQ_SINGLE",
    "MCQ_MULTI",
    "TRUE_FALSE",
    "SHORT_ANSWER",
    "ESSAY",
    "FILL_IN_BLANK",
    "MATCHING",
    "MEDIA"
  ]
}
```

---

## 2) Core entities

## `grade_assessments`

```json
{
  "id": "assessment-uuid",
  "termId": "term-1-1",
  "subjectId": "subject-math",
  "scopeType": "grade",
  "scopeId": "grade-1",
  "sectionId": null,
  "classroomId": null,
  "title": "Quiz 1",
  "titleAr": "اختبار قصير 1",
  "type": "QUIZ",
  "deliveryMode": "SCORE_ONLY",
  "date": "2025-09-10",
  "weight": 10,
  "maxScore": 20,
  "expectedTimeMinutes": null,
  "isLocked": false,
  "approvalStatus": "draft"
}
```

## `grade_items`

```json
{
  "id": "grade-item-uuid",
  "termId": "term-1-1",
  "assessmentId": "assessment-uuid",
  "studentId": "student-uuid",
  "score": 16,
  "comment": "Good work",
  "status": "entered"
}
```

## `grade_rules`

```json
{
  "id": "grade-rule-uuid",
  "scopeType": "grade",
  "scopeId": "grade-1",
  "gradingScale": "percentage",
  "passMark": 50,
  "rounding": "decimal_1"
}
```

## `assessment_questions`

```json
{
  "id": "question-uuid",
  "assessmentId": "assessment-uuid",
  "assignmentId": "assessment-uuid",
  "questionTextAr": "اختر الإجابة الصحيحة",
  "questionTextEn": "Choose the correct answer",
  "questionType": "MCQ_SINGLE",
  "points": 5,
  "order": 1,
  "options": [
    {
      "id": "option-1",
      "textAr": "الخيار أ",
      "textEn": "Option A",
      "isCorrect": true,
      "order": 1
    }
  ],
  "correctAnswer": null,
  "sampleAnswerAr": null,
  "sampleAnswerEn": null,
  "acceptedAnswersAr": null,
  "acceptedAnswersEn": null,
  "matchingPairs": null,
  "mediaMode": null,
  "mediaTitle": null,
  "mediaUrl": null,
  "mediaFileName": null,
  "mediaMimeType": null,
  "mediaSize": null,
  "createdAt": "2025-09-01T10:00:00Z"
}
```

## `assessment_submissions`

```json
{
  "id": "submission-uuid",
  "termId": "term-1-1",
  "assessmentId": "assessment-uuid",
  "studentId": "student-uuid",
  "status": "submitted",
  "submittedAt": "2025-09-12T09:00:00Z",
  "totalScore": null,
  "maxScore": 20
}
```

## `assessment_question_answers`

```json
{
  "id": "answer-uuid",
  "submissionId": "submission-uuid",
  "assessmentId": "assessment-uuid",
  "questionId": "question-uuid",
  "studentId": "student-uuid",
  "selectedOptionIds": ["option-1"],
  "booleanAnswer": null,
  "answerText": null,
  "awardedPoints": 5,
  "correctionStatus": "corrected",
  "teacherComment": "Correct"
}
```

---

## 3) Shared filters / reference endpoints

These are required across overview, assessments, gradebook, and create flows.

### `GET /api/academics/years`

### `GET /api/academics/terms?yearId={yearId}`

### `GET /api/academics/structure-tree?yearId={yearId}&termId={termId}`

### `GET /api/academics/subjects?termId={termId}`

### `GET /api/grades/filters?academicYearId={academicYearId}&termId={termId}`

Suggested response:

```json
{
  "scopeTypes": ["school", "stage", "grade", "section", "classroom"],
  "scopeEntities": {
    "school": [
      {
        "id": "school",
        "name": "Whole School",
        "nameAr": "المدرسة كاملة",
        "nameEn": "Whole School",
        "scopeType": "school"
      }
    ],
    "stage": [],
    "grade": [],
    "section": [],
    "classroom": []
  },
  "stages": [],
  "grades": [],
  "sections": [],
  "classrooms": [],
  "subjects": [
    {
      "id": "subject-math",
      "name": "Math",
      "nameAr": "رياضيات",
      "nameEn": "Math"
    }
  ]
}
```

This endpoint should only return scope entities that are meaningful for the selected academic year and term.

---

## 4) Overview and gradebook data

The overview and gradebook views are both built on the same gradebook response.

### `GET /api/grades/gradebook`

Query:

- `academicYearId`
- `termId`
- `scopeType`
- `scopeId`
- `subjectId`
- optional `includeDrafts`

Response:

```json
{
  "assessments": [
    {
      "id": "assessment-1",
      "termId": "term-1-1",
      "subjectId": "subject-math",
      "scopeType": "grade",
      "scopeId": "grade-1",
      "title": "Quiz 1",
      "titleAr": "اختبار قصير 1",
      "type": "QUIZ",
      "deliveryMode": "SCORE_ONLY",
      "date": "2025-09-10",
      "weight": 10,
      "maxScore": 20,
      "isLocked": false,
      "approvalStatus": "published"
    }
  ],
  "rows": [
    {
      "studentId": "student-1",
      "studentNameEn": "Ahmed Ali",
      "studentNameAr": "أحمد علي",
      "classroomName": "Classroom A",
      "scoresByAssessmentId": {
        "assessment-1": 18
      },
      "statusByAssessmentId": {
        "assessment-1": "entered"
      },
      "average": 90,
      "completedItems": 1,
      "totalItems": 1
    }
  ],
  "summary": {
    "totalStudents": 30,
    "totalAssessments": 1,
    "classAverage": 78.5,
    "highestAverage": 95.0,
    "lowestAverage": 51.0,
    "completionRate": 83.3
  },
  "trend": [
    {
      "assessmentId": "assessment-1",
      "label": "Quiz 1",
      "date": "2025-09-10",
      "average": 78.5,
      "weight": 10,
      "enteredCount": 25,
      "maxScore": 20
    }
  ]
}
```

### `GET /api/grades/analytics`

Query:

- `academicYearId`
- `termId`
- `scopeType`
- `scopeId`
- `subjectId`

Response:

```json
{
  "kpis": {
    "classAverage": 78.5,
    "passRate": 86.7,
    "completionRate": 83.3,
    "failingStudents": 4
  },
  "distribution": [
    { "label": "90-100", "count": 5 },
    { "label": "80-89", "count": 8 },
    { "label": "70-79", "count": 7 },
    { "label": "60-69", "count": 6 },
    { "label": "0-59", "count": 4 }
  ],
  "assessmentPerformance": [
    {
      "assessmentId": "assessment-1",
      "label": "Quiz 1",
      "average": 78.5,
      "enteredCount": 25,
      "maxScore": 20
    }
  ],
  "topStudents": [],
  "lowestStudents": []
}
```

### `GET /api/grades/rules/effective`

Query:

- `academicYearId`
- `termId`
- `scopeType`
- `scopeId`

Current backend behavior should map:

- `section` → parent grade rule
- `classroom` → parent section → parent grade rule
- otherwise fallback to school rule

Response:

```json
{
  "id": "grade-rule-1",
  "scopeType": "grade",
  "scopeId": "grade-1",
  "gradingScale": "percentage",
  "passMark": 50,
  "rounding": "decimal_1"
}
```

---

## 5) Assessments list and workflow

## Frontend needs

- list assessments for scope + subject
- create assessment
- update assessment
- delete assessment
- publish assessment
- approve assessment
- lock assessment
- fetch single assessment by id
- fetch roster for bulk entry
- bulk update grades

### `GET /api/grades/assessments`

Query:

- `academicYearId`
- `termId`
- `scopeType`
- `scopeId`
- `subjectId`
- optional `includeDrafts`

### `GET /api/grades/assessments/:assessmentId`

Response:

```json
{
  "id": "assessment-1",
  "termId": "term-1-1",
  "subjectId": "subject-math",
  "scopeType": "grade",
  "scopeId": "grade-1",
  "sectionId": null,
  "classroomId": null,
  "title": "Quiz 1",
  "titleAr": "اختبار قصير 1",
  "type": "QUIZ",
  "deliveryMode": "SCORE_ONLY",
  "date": "2025-09-10",
  "weight": 10,
  "maxScore": 20,
  "expectedTimeMinutes": null,
  "isLocked": false,
  "approvalStatus": "draft"
}
```

### `POST /api/grades/assessments`

For score-only creation.

Request:

```json
{
  "termId": "term-1-1",
  "subjectId": "subject-math",
  "scopeType": "grade",
  "scopeId": "grade-1",
  "sectionId": null,
  "classroomId": null,
  "title": "Quiz 1",
  "titleAr": "اختبار قصير 1",
  "type": "QUIZ",
  "deliveryMode": "SCORE_ONLY",
  "date": "2025-09-10",
  "weight": 10,
  "maxScore": 20,
  "expectedTimeMinutes": null
}
```

Response:

```json
{
  "id": "assessment-uuid",
  "approvalStatus": "draft",
  "isLocked": false
}
```

### `POST /api/grades/assessments/with-questions`

This matches the current question-based create flow, where the assessment and its questions are persisted together at final save.

Request:

```json
{
  "assessment": {
    "termId": "term-1-1",
    "subjectId": "subject-math",
    "scopeType": "grade",
    "scopeId": "grade-1",
    "title": "Midterm 1",
    "titleAr": "منتصف الفصل 1",
    "type": "MIDTERM",
    "deliveryMode": "QUESTION_BASED",
    "date": "2025-10-10",
    "weight": 30,
    "maxScore": 20,
    "expectedTimeMinutes": 45
  },
  "questions": [
    {
      "questionTextAr": "اختر الإجابة الصحيحة",
      "questionTextEn": "Choose the correct answer",
      "questionType": "MCQ_SINGLE",
      "points": 5,
      "options": [
        {
          "id": "option-1",
          "textAr": "أ",
          "textEn": "A",
          "isCorrect": true,
          "order": 1
        }
      ]
    }
  ]
}
```

### `PATCH /api/grades/assessments/:assessmentId`

Request uses the same payload shape as create.

Important backend rules from current behavior:

- reject if locked
- reject protected metadata changes after approval
- reject if weight budget exceeds 100 for same subject+scope
- if scope changes after grading started, reject

### `DELETE /api/grades/assessments/:assessmentId`

Important rule:

- reject delete if locked

### `POST /api/grades/assessments/:assessmentId/publish`

Important rule:

- reject if locked
- reject if `maxScore <= 0`

### `POST /api/grades/assessments/:assessmentId/approve`

Important rule:

- reject if still `draft`
- reject if `maxScore <= 0`

### `POST /api/grades/assessments/:assessmentId/lock`

Important rule:

- reject unless already `approved`

Response for workflow endpoints:

```json
{
  "id": "assessment-1",
  "approvalStatus": "approved",
  "isLocked": true
}
```

---

## 6) Grade items and bulk grade entry

## Frontend needs

- fetch per-assessment roster for bulk entry
- edit single grade item for score-only assessments
- bulk update grade items for score-only assessments
- fetch grade item detail for optional comment prefill

### `GET /api/grades/assessments/:assessmentId/roster`

Response:

```json
{
  "items": [
    {
      "studentId": "student-1",
      "studentNameEn": "Ahmed Ali",
      "studentNameAr": "أحمد علي",
      "classroomName": "Classroom A",
      "score": 18,
      "status": "entered",
      "comment": "Good work"
    }
  ]
}
```

### `GET /api/grades/grade-items/detail`

Query:

- `academicYearId`
- `termId`
- `assessmentId`
- `studentId`

Response:

```json
{
  "id": "grade-item-1",
  "termId": "term-1-1",
  "assessmentId": "assessment-1",
  "studentId": "student-1",
  "score": 18,
  "comment": "Good work",
  "status": "entered"
}
```

### `PATCH /api/grades/grade-items`

Request:

```json
{
  "assessmentId": "assessment-1",
  "studentId": "student-1",
  "score": 18,
  "status": "entered",
  "comment": "Good work"
}
```

Important rules:

- reject if assessment not found
- reject if assessment is question-based
- reject if locked
- if `status = entered`, score is required and must be `0 <= score <= maxScore`

### `POST /api/grades/assessments/:assessmentId/grade-items/bulk`

Request:

```json
{
  "items": [
    {
      "studentId": "student-1",
      "score": 18,
      "status": "entered",
      "comment": ""
    },
    {
      "studentId": "student-2",
      "score": null,
      "status": "absent",
      "comment": "Absent"
    }
  ]
}
```

Important rules:

- reject empty bulk payload
- reject if assessment is question-based
- reject if locked

---

## 7) Question-based assessments and question management

## Frontend needs

- fetch questions
- create question
- update question
- delete question
- reorder questions
- bulk auto-distribute points
- prevent illegal structure changes after grading starts or lock/approval rules apply

### `GET /api/grades/assessments/:assessmentId/questions`

Response:

```json
{
  "items": [
    {
      "id": "question-1",
      "assessmentId": "assessment-1",
      "assignmentId": "assessment-1",
      "questionTextAr": "اختر الإجابة الصحيحة",
      "questionTextEn": "Choose the correct answer",
      "questionType": "MCQ_SINGLE",
      "points": 5,
      "order": 1,
      "options": [
        {
          "id": "option-1",
          "textAr": "أ",
          "textEn": "A",
          "isCorrect": true,
          "order": 1
        }
      ],
      "createdAt": "2025-09-01T10:00:00Z"
    }
  ]
}
```

### `POST /api/grades/assessments/:assessmentId/questions`

Request:

```json
{
  "questionTextAr": "اختر الإجابة الصحيحة",
  "questionTextEn": "Choose the correct answer",
  "questionType": "MCQ_SINGLE",
  "points": 5,
  "options": [
    {
      "id": "option-1",
      "textAr": "أ",
      "textEn": "A",
      "isCorrect": true,
      "order": 1
    }
  ],
  "correctAnswer": null,
  "sampleAnswerAr": null,
  "sampleAnswerEn": null,
  "acceptedAnswersAr": null,
  "acceptedAnswersEn": null,
  "matchingPairs": null,
  "mediaMode": null,
  "mediaTitle": null,
  "mediaUrl": null,
  "mediaFileName": null,
  "mediaMimeType": null,
  "mediaSize": null
}
```

### `PATCH /api/grades/questions/:questionId`

Supports the same shape as create plus optional `order`.

### `DELETE /api/grades/questions/:questionId`

Important rule:

- reject if it would delete the last remaining question

### `POST /api/grades/assessments/:assessmentId/questions/reorder`

Request:

```json
{
  "questionIds": ["question-2", "question-1", "question-3"]
}
```

### `POST /api/grades/assessments/:assessmentId/questions/points/bulk`

Request:

```json
{
  "updates": [
    { "questionId": "question-1", "points": 5 },
    { "questionId": "question-2", "points": 10 }
  ]
}
```

### Structure edit protection rules

Current behavior protects question structure when:

- assessment is locked
- assessment is approved and protected metadata changes are attempted
- grading has already started

The backend should enforce those, not just the UI.

---

## 8) Submission review and per-question correction

## Frontend needs

- fetch submission review payload for a student/assessment
- save awarded points and teacher comments per answer
- recompute submission total and sync grade item

### `GET /api/grades/assessments/:assessmentId/submissions/:studentId/review`

Response:

```json
{
  "submission": {
    "id": "submission-1",
    "termId": "term-1-1",
    "assessmentId": "assessment-1",
    "studentId": "student-1",
    "status": "submitted",
    "submittedAt": "2025-09-12T09:00:00Z",
    "totalScore": null,
    "maxScore": 20
  },
  "assessment": {
    "id": "assessment-1",
    "deliveryMode": "QUESTION_BASED",
    "maxScore": 20
  },
  "studentNameEn": "Ahmed Ali",
  "studentNameAr": "أحمد علي",
  "questions": [
    {
      "question": {
        "id": "question-1",
        "assessmentId": "assessment-1",
        "questionType": "MCQ_SINGLE",
        "points": 5,
        "order": 1
      },
      "answer": {
        "id": "answer-1",
        "submissionId": "submission-1",
        "assessmentId": "assessment-1",
        "questionId": "question-1",
        "studentId": "student-1",
        "selectedOptionIds": ["option-1"],
        "answerText": null,
        "awardedPoints": null,
        "correctionStatus": "pending",
        "teacherComment": ""
      }
    }
  ]
}
```

### `POST /api/grades/assessments/:assessmentId/submissions/:studentId/corrections`

Request:

```json
{
  "answers": [
    {
      "answerId": "answer-1",
      "awardedPoints": 5,
      "teacherComment": "Correct"
    }
  ]
}
```

Important backend behavior:

- reject if not question-based
- reject if locked
- validate awarded points against question max points
- update submission status:
  - `submitted`
  - `in_progress`
  - `corrected`
- sync grade item score/status from total corrected question points

---

## 9) Student grades snapshot

This is useful beyond the core grades workspace because the shared service already exposes it and it likely powers student-facing or guardian-facing summaries.

### `GET /api/grades/students/:studentId/snapshot`

Query:

- optional `academicYearId`
- optional `termId`

Response:

```json
{
  "studentId": "student-1",
  "academicYearId": "year-1",
  "termId": "term-1-1",
  "subjectRows": [
    {
      "subjectId": "subject-math",
      "subjectName": "Math",
      "subjectNameAr": "رياضيات",
      "average": 84.5,
      "lastAssessmentScore": 18,
      "assessmentsCount": 4,
      "trend": "up"
    }
  ],
  "currentAverage": 82.1,
  "highestAverage": 90.0,
  "lowestAverage": 71.5,
  "totalAssessments": 12,
  "performanceTrend": [
    {
      "label": "Quiz 1",
      "average": 80
    }
  ]
}
```

---

## 10) Suggested convenience endpoints

These are not strictly required, but they map well to the current frontend:

### `GET /api/grades/overview`

Can return:

- summary
- trend
- sample visible assessments
- grade rule

Useful if backend wants a dedicated overview response instead of reusing gradebook + analytics separately.

### `GET /api/grades/workspace-bootstrap`

Can return:

- academic years
- terms
- filters data
- optional initial gradebook data

### `GET /api/grades/export/*`

Not required today because export is client-side, but could be added later for large datasets.

---

## 11) Recommended validation rules

## Assessments

- title and titleAr required
- `weight > 0` and `weight <= 100`
- `maxScore > 0`
- same subject + same scope total assessment weights cannot exceed 100
- scope must be valid for the selected year/term structure
- if assessment is locked, reject edit/delete
- if approved, protect metadata changes that would invalidate grading context
- if grading started, reject scope changes and question-structure changes

## Score-only grade items

- if `status = entered`, score is required
- score must be within `0..maxScore`
- reject editing if assessment is question-based
- reject editing if assessment is locked

## Question-based corrections

- awarded points must be `0..question.points`
- submission must exist
- assessment must be question-based
- reject if locked

## Questions

- at least one question must remain
- question points should sum to assessment max score, or backend should resync the assessment max score if that remains the chosen design
- for MCQ/TRUE_FALSE/etc., validate the correct answer structure
- media fields should be consistent with media mode

---

## 12) Known frontend/backend alignment notes

1. **Question-based create flow is two-step**
   In the current UI:
   - score-only assessment is created immediately
   - question-based assessment is drafted locally first, then persisted together with questions at final save

   Backend should support this explicitly, ideally via:
   - `POST /api/grades/assessments`
   - `POST /api/grades/assessments/with-questions`

2. **Overview, assessments, and gradebook all share one filter model**
   Backend should keep filter semantics consistent across those views.

3. **Grade rules are effectively resolved upward**
   The UI does not currently model separate rules for every scope level. Backend should either preserve the current grade/school rule logic or expand it intentionally with a documented migration path.

4. **Question-based scoring is derived**
   Backend should treat the grade item for a question-based assessment as derived from corrected answers, not as an independently editable score.

5. **Exports are currently client-side**
   The frontend builds exports from already loaded datasets, so there is no backend export contract required yet.

6. **Closed-term write protection should be enforced server-side**
   The UI has read-only behavior, but backend must reject writes too.

---

## 13) Minimum backend contract to unblock the current frontend

Recommended delivery order:

1. years / terms / structure / subjects / grades filters
2. gradebook response + analytics + effective grade rule
3. assessments CRUD
4. publish / approve / lock assessment workflow
5. single grade-item edit + bulk grade entry
6. question CRUD + reorder + bulk points update
7. submission review + correction save
8. student snapshot

That matches the actual dependency chain in the current module:

- filters and reference data bootstrap everything
- overview and gradebook need gradebook + analytics + rules
- assessments management comes next
- grading and corrections sit on top of assessments
