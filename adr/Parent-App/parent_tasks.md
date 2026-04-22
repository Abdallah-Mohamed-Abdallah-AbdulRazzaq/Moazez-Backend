# tasks

## Endpoints
- `GET /parent/tasks/dashboard`
- `POST /parent/tasks`
- `GET /parent/tasks/{task_id}`
- `PATCH /parent/tasks/{task_id}`
- `POST /parent/tasks/{task_id}/approve-stage`

## Dashboard Response
```json
{
  "assigned_classes": [
    {
      "id": "string",
      "cycle_name": "string",
      "grade_name": "string",
      "section_name": "string",
      "subject_name": "string",
      "students_count": 0
    }
  ],
  "students": [
    {
      "id": "string",
      "name": "string",
      "class_id": "string",
      "cycle_name": "string",
      "grade_name": "string",
      "section_name": "string"
    }
  ],
  "tasks": [
    {
      "id": "string",
      "title": "string",
      "description": "string|null",
      "source": "teacher|parent|school",
      "status": "pending|in_progress|completed|under_review",
      "reward_type": "financial|moral",
      "reward_value": "string",
      "progress": 0.0,
      "due_date": "ISO8601",
      "subject_name": "string",
      "class_id": "string",
      "cycle_name": "string",
      "grade_name": "string",
      "section_name": "string",
      "student_id": "string",
      "student_name": "string",
      "stages": [
        {
          "id": "string",
          "title": "string",
          "is_completed": false,
          "is_approved": false,
          "requires_approval": true,
          "proof_type": "image|document|none",
          "proof_path": "string|null",
          "teacher_note": "string|null"
        }
      ]
    }
  ]
}
```

## Create Task Request
```json
{
  "title": "string",
  "description": "string|null",
  "selected_child_ids": ["string"],
  "reward_type": "financial|moral",
  "reward_value": "string",
  "due_date": "ISO8601",
  "stages": [
    {
      "title": "string",
      "proof_type": "image|document|none",
      "requires_approval": true
    }
  ]
}
```
