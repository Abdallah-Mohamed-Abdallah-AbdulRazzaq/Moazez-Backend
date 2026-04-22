# Home Backend Models

## 1. Home Response

```json
{
  "userInfo": {},
  "stats": [],
  "weeklySchedule": [],
  "actionSummaries": []
}
```

## 2. User Info

```json
{
  "id": "string",
  "name": "string",
  "dateLabel": "string",
  "points": 1240,
  "avatarUrl": "string"
}
```

## 3. Stat Item

```json
{
  "title": "string",
  "value": "string",
  "subValue": "string | null",
  "type": "points | remainingClasses | currentClass"
}
```

## 4. Weekly Schedule Day

```json
{
  "dayName": "string",
  "items": [
    {
      "id": "string",
      "subject": "string",
      "className": "string",
      "time": "string",
      "isCurrent": true,
      "periodIndex": 1
    }
  ]
}
```

## 5. Action Summary

```json
{
  "title": "string",
  "subTitle": "string",
  "count": 4,
  "tag": "string | null",
  "progress": 0.65
}
```

## 6. Preferred Endpoint

```text
GET /teacher/home
```

## 7. Notes

- `points` هنا خاصة المعلم داخل الهوم.
- `weeklySchedule` مختصر، وليس بديلًا عن تفاصيل Feature الجدول.
- `actionSummaries` تستخدم لبطاقات المتابعة السريعة في الهوم.
