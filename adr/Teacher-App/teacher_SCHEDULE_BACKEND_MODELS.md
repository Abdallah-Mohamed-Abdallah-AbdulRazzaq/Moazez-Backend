# Schedule Backend Models

## 1. Schedule Response

```json
{
  "date": "2026-04-01",
  "items": []
}
```

## 2. Schedule Item

```json
{
  "id": "string",
  "subjectId": "string",
  "subjectName": "string",
  "classId": "string",
  "className": "string",
  "cycleId": "string",
  "cycleName": "string",
  "gradeId": "string",
  "gradeName": "string",
  "sectionId": "string",
  "sectionName": "string",
  "lessonTitle": "string",
  "roomName": "string | null",
  "notes": "string | null",
  "startTime": "2026-04-01T07:00:00Z",
  "endTime": "2026-04-01T07:45:00Z",
  "startTimeLabel": "07:00",
  "endTimeLabel": "07:45",
  "periodLabel": "الحصة الأولى",
  "periodIndex": 1,
  "studentsCount": 24,
  "needsAttendance": true,
  "isPrepared": true,
  "hasHomework": false,
  "status": "completed | current | upcoming",
  "iconKey": "calculator | science | book | school"
}
```

## 3. Preferred Endpoints

```text
GET /teacher/schedule?date=2026-04-01
GET /teacher/schedule/week?date=2026-04-01
```

## 4. Notes

- الفلاتر في الفرونت تعتمد على `cycleName`, `gradeName`, `sectionName`.
- `status` مهم جدًا لتحديد الحصة الحالية أو القادمة أو المنتهية.
- `needsAttendance` و`isPrepared` هما أساس حالة المتابعة داخل الكروت.
