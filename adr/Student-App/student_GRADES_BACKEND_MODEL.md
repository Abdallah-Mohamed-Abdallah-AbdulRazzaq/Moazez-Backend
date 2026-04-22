# Grades Feature - Backend Data

## Main Response

```json
{
  "academic_years": [
    {
      "id": "string",
      "name": "string"
    }
  ],
  "terms": [
    "first_term",
    "second_term",
    "full_year"
  ],
  "summary": {
    "total_earned": 0,
    "total_max": 0
  },
  "subjects": [
    {
      "id": "string",
      "subject_name": "string",
      "total_marks": 0,
      "earned_marks": 0,
      "breakdown": [
        {
          "title": "string",
          "earned": 0,
          "total": 0
        }
      ]
    }
  ]
}
```

## Needed Fields

- `academic_years`
- `terms`
- `summary.total_earned`
- `summary.total_max`
- `subjects`

## Subject Item

- `id`
- `subject_name`
- `total_marks`
- `earned_marks`
- `breakdown`

## Notes

- rating يمكن حسابه في الفرونت من النسبة
- الأيقونة واللون يمكن ربطهما باسم المادة في الفرونت
