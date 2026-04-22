# Subjects Feature - Backend Data

## Main Response

```json
{
  "subjects": [
    {
      "id": "string",
      "name": "string",
      "lessons_count": 0,
      "total_hours": 0,
      "progress": 0.0,
      "icon_key": "string|null"
    }
  ]
}
```

## Needed Fields

- `id`
- `name`
- `lessons_count`
- `total_hours`
- `progress`
- `icon_key`

## Notes

- يمكن للفرونت map `icon_key` وcolors حسب المادة
- نفس `id` يستخدم للدخول إلى `subject_details`
