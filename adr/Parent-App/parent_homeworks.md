# homeworks

## Endpoints
- `GET /children/{child_id}/homeworks`
- `GET /homeworks/{homework_id}`
- `POST /homeworks/{homework_id}/submit`

## Homework List Response
```json
[
  {
    "id": "string",
    "subject_name": "string",
    "homework_name": "string",
    "grade": "string",
    "status": "completed|waiting|not_completed",
    "color_hex": "#000000",
    "icon": "string",
    "students_count": 0,
    "student_avatars": ["string"]
  }
]
```

## Homework Details Response
```json
{
  "id": "string",
  "subject_name": "string",
  "homework_name": "string",
  "grade": "string",
  "status": "completed|waiting|not_completed",
  "result_summary": {
    "label": "string",
    "description": "string"
  },
  "questions": [
    {
      "id": "string",
      "type": "mcq|true_false|matching|ordering|fill_blanks|essay|file_upload",
      "title": "string",
      "options": ["string"],
      "correct_answer": "any",
      "student_answer": "any",
      "pairs": [
        { "left": "string", "right": "string" }
      ],
      "blanks": ["string"],
      "attachments": ["string"]
    }
  ]
}
```
