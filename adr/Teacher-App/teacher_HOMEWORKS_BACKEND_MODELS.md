# Homeworks Backend Models

## 1. Homeworks Dashboard Response

```json
{
  "classes": []
}
```

## 2. Homework Dashboard Class

```json
{
  "id": "string",
  "cycleId": "string",
  "cycleName": "string",
  "gradeId": "string",
  "gradeName": "string",
  "sectionId": "string",
  "sectionName": "string",
  "subjectId": "string",
  "subjectName": "string",
  "roomName": "string",
  "studentsCount": 24,
  "weeklyDays": ["الأحد", "الثلاثاء"],
  "nextSessionLabel": "string",
  "needsAttention": true,
  "focusItem": {
    "scheduleId": "string",
    "lessonTitle": "string",
    "startTime": "2026-04-01T07:00:00Z",
    "endTime": "2026-04-01T07:45:00Z"
  },
  "assignments": []
}
```

## 3. Homework Assignment Summary

```json
{
  "id": "string",
  "title": "string",
  "status": "draft | active | closed | waiting_review",
  "statusLabel": "string",
  "mode": "homework | quiz | worksheet | writing_task",
  "modeLabel": "string",
  "targetLabel": "string",
  "dueAt": "2026-04-02T19:00:00Z",
  "dueLabel": "string",
  "totalMarks": 20,
  "estimatedMinutes": 20,
  "publishNow": true,
  "totalCount": 24,
  "submittedCount": 18,
  "reviewedCount": 12,
  "missingSubmissionCount": 6,
  "pendingReviewCount": 4
}
```

## 4. Dashboard Summary Needed

```json
{
  "classesCount": 4,
  "assignmentsCount": 12,
  "draftsCount": 2,
  "pendingReviewCount": 7,
  "missingSubmissionCount": 10,
  "reviewedSubmissionsCount": 30
}
```

## 5. Preferred Endpoints

```text
GET /teacher/homeworks/dashboard
GET /teacher/homeworks/classes/{classId}/assignments
```

## 6. Notes

- هذا التاب يحتاج بيانات Dashboard مجمعة أكثر من حاجته لتفاصيل السؤال والإجابة.
- تفاصيل التصحيح والتسليم الكامل موجودة في Feature `classroom`.
