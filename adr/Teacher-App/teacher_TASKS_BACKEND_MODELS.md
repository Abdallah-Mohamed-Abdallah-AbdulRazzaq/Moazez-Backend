# Tasks Backend Models

## 1. Tasks Dashboard Response

```json
{
  "assignedClasses": [],
  "students": [],
  "tasks": []
}
```

## 2. Task Class Option

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
  "studentsCount": 24
}
```

## 3. Task Student

```json
{
  "id": "string",
  "name": "string",
  "classId": "string",
  "cycleName": "string",
  "gradeName": "string",
  "sectionName": "string"
}
```

## 4. Task

```json
{
  "id": "string",
  "title": "string",
  "description": "string | null",
  "source": "teacher | parent | system",
  "status": "pending | inProgress | completed | underReview",
  "rewardType": "financial | moral",
  "rewardValue": "100 ريال | شهادة تقدير",
  "progress": 0.65,
  "dueDate": "2026-04-03T00:00:00Z",
  "subjectName": "string",
  "classId": "string",
  "cycleName": "string",
  "gradeName": "string",
  "sectionName": "string",
  "studentId": "string",
  "studentName": "string",
  "stages": []
}
```

## 5. Task Stage

```json
{
  "id": "string",
  "title": "string",
  "isCompleted": true,
  "isApproved": false,
  "requiresApproval": true,
  "proofType": "image | document | none",
  "proofPath": "string | null",
  "teacherNote": "string | null"
}
```

## 6. Create Task Request

```json
{
  "classId": "string",
  "studentId": "string",
  "title": "string",
  "description": "string",
  "subjectName": "string",
  "rewardType": "financial | moral",
  "rewardValue": "string",
  "dueDate": "2026-04-03T00:00:00Z",
  "stages": [
    {
      "title": "string",
      "requiresApproval": true,
      "proofType": "image | document | none"
    }
  ]
}
```

## 7. Approve Stage Request

```json
{
  "taskId": "string",
  "stageId": "string",
  "isApproved": true,
  "teacherNote": "string | null"
}
```

## 8. Preferred Endpoints

```text
GET  /teacher/tasks/dashboard
POST /teacher/tasks
GET  /teacher/tasks/{taskId}
POST /teacher/tasks/{taskId}/stages/{stageId}/approve
```

## 9. Notes

- `progress` من 0 إلى 1.
- `proofPath` يفضل يكون URL أو file path صالح للعرض/التحميل.
- هذه feature خاصة بمهام الطالب متعددة المراحل مع اعتماد المعلم لكل مرحلة.
