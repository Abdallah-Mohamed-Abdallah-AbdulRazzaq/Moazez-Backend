# Announcements Feature - Backend Data

## Main Response

```json
{
  "announcements": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "sender": "string",
      "date_label": "string",
      "category": "school|classroom|services|action_required",
      "is_pinned": true,
      "is_new": true,
      "action_label": "string|null",
      "image": "string|null"
    }
  ]
}
```

## Needed Fields

- `id`
- `title`
- `description`
- `sender`
- `date_label`
- `category`
- `is_pinned`
- `is_new`
- `action_label`
- `image`

## Notes

- `category` يستخدم في الفلاتر
- `action_label` يظهر فقط لو الإعلان يحتاج تفاعل
- الألوان والأيقونات يتم تحديدها في الفرونت حسب `category`
