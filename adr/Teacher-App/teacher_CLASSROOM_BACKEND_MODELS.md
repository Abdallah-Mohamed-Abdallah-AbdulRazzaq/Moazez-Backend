# Classroom Backend Models

## 1. Classroom Details

```json
{
  "classroomId": "string",
  "scheduleId": "string",
  "subjectId": "string",
  "subjectName": "string",
  "teacherId": "string",
  "teacherName": "string",
  "cycleId": "string",
  "cycleName": "string",
  "gradeId": "string",
  "gradeName": "string",
  "sectionId": "string",
  "sectionName": "string",
  "className": "string",
  "lessonTitle": "string",
  "roomName": "string",
  "periodIndex": 1,
  "startTime": "2026-04-01T07:00:00Z",
  "endTime": "2026-04-01T07:45:00Z",
  "studentsCount": 24,
  "needsAttendance": true,
  "hasHomework": true,
  "requiresAttention": false
}
```

## 2. Student

```json
{
  "id": "string",
  "name": "string",
  "seatNumber": "string",
  "attendanceMark": "unmarked | present | absent | late | excused",
  "needsFollowUp": true,
  "homeworkSubmitted": false,
  "note": "string"
}
```

## 3. Attendance Summary

```json
{
  "unmarkedCount": 3,
  "presentCount": 18,
  "absentCount": 1,
  "lateCount": 1,
  "excusedCount": 1,
  "resolvedCount": 21,
  "totalCount": 24,
  "lastUpdatedLabel": "string"
}
```

## 4. Assignment

```json
{
  "id": "string",
  "title": "string",
  "dueAt": "2026-04-02T19:00:00Z",
  "dueLabel": "string",
  "status": "draft | active | closed | classroom_activity | waiting_review",
  "statusLabel": "string",
  "totalCount": 24,
  "targetType": "all_section | follow_up_students | enrichment_group | custom_students",
  "targetLabel": "string",
  "mode": "homework | quiz | worksheet | writing_task",
  "modeLabel": "string",
  "instructions": "string",
  "totalMarks": 20,
  "estimatedMinutes": 20,
  "publishNow": true,
  "randomizeQuestions": false,
  "submittedCount": 20,
  "reviewedCount": 12
}
```

## 5. Assignment Question

```json
{
  "id": "string",
  "type": "multipleChoice | trueFalse | shortAnswer | essay | fillInBlank | matching | media",
  "title": "string",
  "points": 5,
  "expectedAnswer": "string",
  "explanation": "string",
  "attachmentUrl": "string | null",
  "attachmentName": "string | null",
  "options": [
    {
      "id": "string",
      "text": "string",
      "isCorrect": true
    }
  ]
}
```

## 6. Assignment Submission

```json
{
  "studentId": "string",
  "studentName": "string",
  "submittedAt": "2026-04-01T10:30:00Z | null",
  "submittedAtLabel": "string",
  "status": "notSubmitted | submitted | reviewed | late",
  "score": 17,
  "maxScore": 20,
  "feedback": "string",
  "answers": [
    {
      "questionId": "string",
      "studentAnswer": "string",
      "correctAnswer": "string",
      "isCorrect": true,
      "score": 2,
      "maxScore": 2
    }
  ]
}
```

## 7. Submission Answer

```json
{
  "questionId": "string",
  "studentAnswer": "string",
  "correctAnswer": "string",
  "isCorrect": true,
  "score": 2,
  "maxScore": 2
}
```

## 8. Screen Response

```json
{
  "classroom": {},
  "attendanceSummary": {},
  "students": [],
  "assignments": []
}
```

## 9. Create Assignment Request

```json
{
  "scheduleId": "string",
  "title": "string",
  "instructions": "string",
  "mode": "homework | quiz | worksheet | writing_task",
  "targetType": "all_section | follow_up_students | enrichment_group | custom_students",
  "targetStudentIds": ["string"],
  "dueAt": "2026-04-02T19:00:00Z",
  "totalMarks": 20,
  "estimatedMinutes": 20,
  "publishNow": true,
  "randomizeQuestions": false,
  "questions": [
    {
      "type": "multipleChoice | trueFalse | shortAnswer | essay | fillInBlank | matching | media",
      "title": "string",
      "points": 2,
      "expectedAnswer": "string",
      "attachmentUrl": "string | null",
      "attachmentName": "string | null",
      "options": [
        {
          "text": "string",
          "isCorrect": true
        }
      ]
    }
  ]
}
```

## 10. Save Attendance Request

```json
{
  "scheduleId": "string",
  "students": [
    {
      "studentId": "string",
      "attendanceMark": "present | absent | late | excused"
    }
  ]
}
```

## 11. Review Submission Request

```json
{
  "assignmentId": "string",
  "studentId": "string",
  "feedback": "string",
  "answers": [
    {
      "questionId": "string",
      "score": 4,
      "isCorrect": true
    }
  ]
}
```

## 12. Preferred Endpoints

```text
GET    /teacher/classrooms/{scheduleId}
POST   /teacher/classrooms/{scheduleId}/attendance
GET    /teacher/classrooms/{scheduleId}/assignments
POST   /teacher/classrooms/{scheduleId}/assignments
GET    /teacher/assignments/{assignmentId}
GET    /teacher/assignments/{assignmentId}/submissions
GET    /teacher/assignments/{assignmentId}/submissions/{studentId}
POST   /teacher/assignments/{assignmentId}/submissions/{studentId}/review
```

## 13. Notes

- `submittedAt` يفضل يكون datetime حقيقي، و`submittedAtLabel` optional من الباك اند أو يتعمل في الفرونت.
- `dueAt` مهم، و`dueLabel` optional للعرض فقط.
- `statusLabel`, `modeLabel`, `targetLabel`, `lastUpdatedLabel` يفضل الفرونت يبنيهم من القيم الأساسية، لكن يمكن إرسالهم جاهزين لو أردتم.
- لو في media question أو attachment: المطلوب `attachmentUrl` جاهز للعرض أو التحميل.
