# XP Backend Models

## 1. XP Center Response

```json
{
  "seasonLabel": "الموسم الدراسي 2025 - 2026",
  "trackedStudentsCount": 95,
  "totalSeasonXp": 8540,
  "autoGrantedXp": 7820,
  "pendingBoostCandidates": 7,
  "bonusPolicy": {},
  "assignedClasses": [],
  "students": [],
  "sourceBreakdown": [],
  "recentBonusRecords": []
}
```

## 2. XP Class Filter

```json
{
  "cycleId": "string",
  "cycleName": "string",
  "gradeId": "string",
  "gradeName": "string",
  "sectionId": "string",
  "sectionName": "string",
  "subjectId": "string",
  "subjectName": "string",
  "studentsCount": 24
}
```

## 3. Student XP Progress

```json
{
  "id": "string",
  "studentName": "string",
  "classLabel": "string",
  "cycleName": "string",
  "gradeName": "string",
  "sectionName": "string",
  "subjectName": "string",
  "seasonXp": 2480,
  "weeklyXp": 180,
  "completedLessons": 31,
  "completedHomeworks": 18,
  "completedExams": 5,
  "rankPosition": 1,
  "levelProgress": 0.88,
  "rankTier": "bronze1 | bronze2 | bronze3 | silver1 | silver2 | silver3 | gold1 | gold2 | gold3 | master",
  "needsSupport": false,
  "recentlyPromoted": true
}
```

## 4. Rank Distribution Item

```json
{
  "rankTier": "gold2",
  "studentsCount": 8
}
```

## 5. XP Source Breakdown

```json
{
  "source": "homework | lesson | exam | participation | project | behavior",
  "xpValue": 3360
}
```

## 6. Bonus XP Policy

```json
{
  "weeklyLimitPerStudent": 30,
  "weeklyLimitPerClass": 120,
  "teacherAvailableBudget": 85,
  "allowedReasons": [
    "مشاركة صفية متميزة",
    "تحسن ملحوظ خلال الأسبوع"
  ]
}
```

## 7. Bonus XP Record

```json
{
  "id": "string",
  "studentId": "string",
  "studentName": "string",
  "classLabel": "string",
  "xpValue": 15,
  "reason": "string",
  "grantedAt": "2026-04-01T10:00:00Z"
}
```

## 8. Grant Bonus XP Request

```json
{
  "studentId": "string",
  "xpValue": 10,
  "reason": "string",
  "note": "string | null"
}
```

## 9. Preferred Endpoints

```text
GET  /teacher/xp/dashboard
POST /teacher/xp/bonus
GET  /teacher/xp/students/{studentId}
```

## 10. Notes

- `seasonXp` هو XP الموسمي الكلي.
- `autoGrantedXp` هو XP القادم تلقائيًا من النظام.
- `Bonus XP` من المعلم محدود ويحتاج `allowedReasons` وسياسة واضحة من الباك اند.
