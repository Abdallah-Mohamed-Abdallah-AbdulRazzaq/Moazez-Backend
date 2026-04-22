# Exams Feature - Backend Data

## Subjects With Exams

```json
{
  "subjects": [
    {
      "subject_id": "string",
      "subject_name": "string",
      "exams_count": 0,
      "exams": [
        {
          "id": "string",
          "exam_name": "string",
          "description": "string",
          "skill_tag": "string",
          "status": "not_started|in_progress|completed",
          "total_xp": 0,
          "duration_minutes": 0,
          "question_count": 0
        }
      ]
    }
  ]
}
```

## Exam Details

```json
{
  "id": "string",
  "subject_name": "string",
  "exam_name": "string",
  "description": "string",
  "skill_tag": "string",
  "status": "not_started|in_progress|completed",
  "total_xp": 0,
  "duration_minutes": 0,
  "question_count": 0,
  "stages": [
    {
      "id": "string",
      "title": "string",
      "subtitle": "string",
      "type": "multiple_choice|true_false|fill_blanks|essay|matching|ordering",
      "question_count": 0,
      "questions": []
    }
  ]
}
```

## Question Base

```json
{
  "id": "string",
  "type": "multiple_choice|true_false|fill_blanks|essay|matching|ordering",
  "title": "string",
  "body": "string",
  "options": [],
  "answer": null
}
```

## Notes

- الشاشة الرئيسية grouped by subject
- كل اختبار يحتوي `stages`
- يمكن إعادة نفس schema الأسئلة المستخدم في `homeworks` بدون `file_upload`
