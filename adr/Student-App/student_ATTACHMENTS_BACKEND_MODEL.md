# Attachments Feature - Backend Data

## Main Response

```json
{
  "subjects": [
    {
      "subject_id": "string",
      "subject_name": "string",
      "attachments_count": 0,
      "attachments": [
        {
          "id": "string",
          "title": "string",
          "lesson_name": "string",
          "type": "pdf|doc|image|video|audio|link",
          "size_label": "string",
          "uploaded_at": "string",
          "uploaded_by": "string",
          "is_downloaded": false,
          "file_url": "string"
        }
      ]
    }
  ]
}
```

## Needed Fields

- `subject_id`
- `subject_name`
- `attachments_count`
- `attachments`

## Attachment Item

- `id`
- `title`
- `lesson_name`
- `type`
- `size_label`
- `uploaded_at`
- `uploaded_by`
- `is_downloaded`
- `file_url`

## Notes

- grouping في الشاشة حسب المادة
- `type` يستخدم لتحديد الأيقونة
- `file_url` يستخدم للفتح والتنزيل والمشاركة
