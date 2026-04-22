# Tasks Feature - Backend Data

## Main List Item

```json
{
  "id": "string",
  "title": "string",
  "description": "string|null",
  "source": "teacher|parent|system",
  "status": "pending|in_progress|completed|under_review",
  "reinforcer_type": "financial|moral",
  "reinforcer_value": "string",
  "progress": 0.0,
  "due_date": "2026-04-01T12:00:00Z",
  "subject_name": "string|null",
  "stages": []
}
```

## Stages

```json
[
  {
    "id": "string",
    "title": "string",
    "is_completed": true,
    "proof_type": "image|video|none",
    "proof_url": "string|null"
  }
]
```

## Needed In Tasks List

- `id`
- `title`
- `description`
- `source`
- `status`
- `reinforcer_type`
- `reinforcer_value`
- `progress`
- `due_date`
- `subject_name`

## Needed In Task Details

- all task list fields
- `stages`
- for each stage:
  - `id`
  - `title`
  - `is_completed`
  - `proof_type`
  - `proof_url`

## Notes For Backend

- `progress` value from `0.0` to `1.0`
- `subject_name` يظهر فقط لو المهمة مدرسية
- `reinforcer_value` يرسل كنص جاهز للعرض مثل:
  - `200 ريال`
  - `شهادة تقدير`
  - `رحلة إلى الحديقة`
- `proof_url` يكون رابط الملف بعد رفع الإثبات
- لو لا توجد مراحل يمكن إرسال `stages: []`
