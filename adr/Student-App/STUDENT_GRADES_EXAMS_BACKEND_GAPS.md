# Student Grades / Exams Backend Gaps

## Verification Notes

Checked the available backend docs/API test files for alternative naming or route families:

- `lib/features/03_STUDENT_APP/sprint_9b_student_app_grades/moazez_sprint_9b_docs`
- `lib/features/homeworks/docs`
- existing app endpoint mappings in `lib/core/api/api_endpoints.dart`

Strict re-check of `lib/features/homeworks/docs` found no original Student App exam route family. The only `/student/exams` entries inside that folder are in this gap file. Student App exam read routes come from the Student App sprint docs, not from the Homework / Grades docs.

The only documented Student App exam routes found are:

```http
GET /api/v1/student/exams
GET /api/v1/student/exams/:assessmentId
GET /api/v1/student/exams/:assessmentId/submission
```

There is a generic question-based assessment submission route family:

```http
POST /api/v1/grades/assessments/:assessmentId/submissions/resolve
PUT  /api/v1/grades/submissions/:submissionId/answers/:questionId
PUT  /api/v1/grades/submissions/:submissionId/answers
POST /api/v1/grades/submissions/:submissionId/submit
```

However, these routes are documented under School Dashboard Grades / Assessments, not under the Student App route matrix. They should not be used from the Student App unless the backend confirms they are authenticated-student scoped and safe for student clients.

## Exams

### Missing student exam answer workflow

The Student App can currently read exams, exam detail, and submission state:

```http
GET /api/v1/student/exams
GET /api/v1/student/exams/:assessmentId
GET /api/v1/student/exams/:assessmentId/submission
```

To support real exam solving/submission, the app needs documented student-safe write endpoints:

```http
POST /api/v1/student/exams/:assessmentId/start
PUT  /api/v1/student/exams/:assessmentId/submission/answers
PATCH /api/v1/student/exams/:assessmentId/submission/answers/:questionId
POST /api/v1/student/exams/:assessmentId/submission/submit
```

Expected behavior:

- Resolve/create the authenticated student's own submission.
- Save single and bulk answers.
- Submit final answers.
- Reject hidden, unpublished, invalid, or cross-student submissions.
- Hide answer keys, correct answers, and review-only fields from the student response.

### Required exam detail shape

`GET /api/v1/student/exams/:assessmentId` should return stages with actual questions/options:

```json
{
  "stages": [
    {
      "id": "string",
      "title": "string",
      "subtitle": "string",
      "type": "multiple_choice",
      "question_count": 3,
      "questions": [
        {
          "id": "string",
          "type": "multiple_choice",
          "title": "string",
          "body": "string",
          "points": 1,
          "options": [
            { "id": "string", "text": "string" }
          ]
        }
      ]
    }
  ]
}
```

## Grades

### Assessment detail fields to confirm

The Student App is wired to:

```http
GET /api/v1/student/grades/assessments/:assessmentId
```

Please confirm the response can include these student-safe fields when available:

```json
{
  "assessment": {
    "assessmentId": "string",
    "title": "string",
    "subjectName": "string",
    "type": "quiz",
    "earnedMarks": 8,
    "totalMarks": 10,
    "gradedAt": "2026-06-18T10:00:00Z"
  },
  "gradeItem": {
    "earnedMarks": 8,
    "totalMarks": 10,
    "feedback": "string"
  },
  "submission": {
    "status": "reviewed",
    "score": 8,
    "answers": [
      {
        "questionId": "string",
        "answer": "string"
      }
    ]
  },
  "questions": [
    {
      "id": "string",
      "title": "string",
      "body": "string",
      "points": 1
    }
  ]
}
```

Do not expose:

- `isCorrect`
- answer keys
- correct answers
- storage internals
- tenant/internal IDs
