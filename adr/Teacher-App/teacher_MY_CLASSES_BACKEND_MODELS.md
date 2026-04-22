# My Classes Backend Models

## 1. My Classes Response

```json
{
  "classes": []
}
```

## 2. Teacher Class

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
  "weeklyPeriods": 2,
  "todayPeriods": 0,
  "followUpCount": 5,
  "pendingAttendanceCount": 3,
  "activeAssignmentsCount": 2,
  "pendingReviewCount": 3,
  "needsPreparation": false,
  "nextSessionLabel": "string",
  "note": "string",
  "weeklyDays": ["الأحد", "الثلاثاء"],
  "focusItem": {
    "scheduleId": "string",
    "lessonTitle": "string",
    "startTime": "2026-04-01T07:00:00Z",
    "endTime": "2026-04-01T07:45:00Z"
  }
}
```

## 3. Preferred Endpoints

```text
GET /teacher/classes
GET /teacher/classes/{classId}
```

## 4. Notes

- هذا الـ feature يحتاج counts جاهزة لأن الكروت تعتمد على مؤشرات مباشرة.
- `focusItem` مهم لإظهار أقرب حصة أو الحصة المجدولة التالية.
