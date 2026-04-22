# Profile Backend Models

## 1. Teacher Profile Response

```json
{
  "name": "string",
  "roleLabel": "string",
  "schoolName": "string",
  "avatarUrl": "string",
  "specialization": "string",
  "cycleLabel": "string",
  "employeeId": "string",
  "experienceLabel": "string",
  "phone": "string",
  "email": "string",
  "officeHours": "string",
  "statusLabel": "string",
  "points": 1240,
  "assignedClassesCount": 4,
  "studentsCount": 96,
  "weeklyPeriodsCount": 18,
  "pendingTasksCount": 6,
  "activeAssignmentsCount": 4,
  "reviewedItemsCount": 15,
  "attendanceCommitment": 0.94,
  "assignmentsCompletion": 0.89,
  "highlights": [],
  "accountItems": []
}
```

## 2. Profile Highlight

```json
{
  "title": "string",
  "value": "string",
  "note": "string"
}
```

## 3. Profile Info Item

```json
{
  "label": "string",
  "value": "string"
}
```

## 4. Teacher Employment Response

```json
{
  "employeeId": "string",
  "jobTitle": "string",
  "department": "string",
  "schoolName": "string",
  "employmentType": "string",
  "workStatus": "string",
  "directManager": "string",
  "startDateLabel": "string",
  "experienceLabel": "string",
  "specialization": "string",
  "stageAssignment": "string",
  "subjects": ["string"],
  "assignedClasses": ["string"],
  "studentsCount": 96,
  "weeklyPeriodsCount": 18,
  "officeHoursCount": 35,
  "workDaysLabel": "string",
  "permissions": ["string"],
  "responsibilities": ["string"],
  "organizationalInfo": [],
  "workloadInfo": []
}
```

## 5. Employment Info Item

```json
{
  "label": "string",
  "value": "string"
}
```

## 6. Preferred Endpoints

```text
GET /teacher/profile
GET /teacher/profile/employment
```

## 7. Notes

- `points` هنا خاصة حساب المعلم نفسه.
- `attendanceCommitment` و`assignmentsCompletion` كنسب من 0 إلى 1.
