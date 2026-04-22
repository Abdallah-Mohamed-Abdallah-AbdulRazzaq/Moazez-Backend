# Homeworks Feature - Backend Data

## Homework List

```json
{
  "homeworks": [
    {
      "id": "string",
      "subject_name": "string",
      "homework_name": "string",
      "grade": "string",
      "status": "completed|waiting|not_completed",
      "question_count": 0,
      "students_count": 0,
      "student_avatars": [
        "string"
      ],
      "due_at": "2026-04-01T12:00:00Z"
    }
  ]
}
```

## Homework Details

```json
{
  "id": "string",
  "subject_name": "string",
  "homework_name": "string",
  "grade": "string",
  "due_at": "2026-04-01T12:00:00Z",
  "questions": [
    {
      "id": "string",
      "type": "mcq|true_false|matching|ordering|fill_blanks|essay|file_upload",
      "title": "string",
      "body": "string",
      "options": [],
      "answer": null
    }
  ]
}
```

## Notes

- `student_avatars` تستخدم في الكارت فقط
- `grade` ترسل كنص جاهز للعرض
- أنواع الأسئلة تشمل `file_upload`
