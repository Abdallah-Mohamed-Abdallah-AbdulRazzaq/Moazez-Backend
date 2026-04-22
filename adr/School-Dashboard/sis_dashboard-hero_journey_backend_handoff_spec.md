# Hero-Journey Backend Handoff Spec

## Scope

This handoff is based on the current **hero-journey** module in `sis_dashboard`.

Confirmed routes and product surfaces:
- `/hero-journey` → overview
- `/hero-journey/missions`
- `/hero-journey/students-progress`

The current module supports:
- overview KPIs and charts
- mission listing with filters
- mission detail panel / modal
- mission publish toggle
- student progress listing with filters
- student progress detail panel / modal
- badge catalog rendering for missions and students

The current module does **not** show a real create/edit mission form yet.
The missions page has an edit placeholder action, but the only live mutation currently wired in code is **mission publish toggle**.

The current service is also still **mock-backed**:
- it imports mock missions
- mock badges
- mock student progress
- mock XP trend

So this backend contract should be treated as the first real backend surface for the module rather than a strict match to an existing API adapter.

---

## High-level backend rules

1. **Hero-journey currently has three real surfaces**
   - overview
   - missions
   - students progress

2. **Badges are shared reference data**
   Both missions and students-progress pages depend on the badge catalog for rendering reward and earned badges.

3. **Missions are stage-scoped**
   The current mission records include:
   - stage
   - linked lesson
   - linked quiz
   - required level
   - reward XP
   - optional badge reward
   - status
   - started/completed counts

4. **Student progress is grade/section scoped**
   The students-progress page filters by:
   - search
   - grade
   - section
   - progress status

5. **The only real write currently wired is publish-state toggle**
   The frontend can toggle missions between `draft` and `published`.
   It does not currently expose full mission CRUD.

6. **Student progress is read-only in the current module**
   The current UI shows detail, objectives, recent badges, and coach note, but no mutation actions.

---

## 1) Shared enums

### Mission status
```json
{
  "HeroJourneyMissionStatus": ["draft", "published", "scheduled", "archived"]
}
```

### Student progress status
```json
{
  "HeroJourneyProgressStatus": ["on_track", "at_risk", "inactive"]
}
```

### Summary widget tone
```json
{
  "HeroJourneySummaryTone": ["teal", "sky", "amber"]
}
```

---

## 2) Core entities

## `hero_journey_badges`
```json
{
  "id": "badge-1",
  "slug": "speed-runner",
  "nameEn": "Speed Runner",
  "nameAr": "عدّاء سريع",
  "descriptionEn": "Complete a mission quickly",
  "descriptionAr": "أكمل مهمة بسرعة",
  "assetPath": "/assets/hero-journey/badges/speed-runner.svg"
}
```

## `hero_journey_missions`
```json
{
  "id": "mission-1",
  "titleEn": "Complete Fractions Quest",
  "titleAr": "أكمل مهمة الكسور",
  "stageNameEn": "Primary",
  "stageNameAr": "الابتدائي",
  "requiredLevel": 3,
  "linkedLessonId": "lesson-123",
  "linkedLessonTitleEn": "Fractions Basics",
  "linkedLessonTitleAr": "أساسيات الكسور",
  "linkedQuizId": "quiz-456",
  "linkedQuizTitleEn": "Fractions Quiz",
  "linkedQuizTitleAr": "اختبار الكسور",
  "status": "published",
  "rewardXp": 120,
  "badgeRewardSlug": "speed-runner",
  "studentsStarted": 45,
  "studentsCompleted": 31,
  "updatedAt": "2026-04-08T14:20:00.000Z"
}
```

## `hero_journey_student_progress`
```json
{
  "id": "student-progress-1",
  "studentId": "student-uuid",
  "studentName": "Ahmed Hassan",
  "stageNameEn": "Primary",
  "stageNameAr": "الابتدائي",
  "gradeNameEn": "Grade 5",
  "gradeNameAr": "الصف الخامس",
  "sectionNameEn": "A",
  "sectionNameAr": "أ",
  "currentLevel": 4,
  "currentMissionId": "mission-1",
  "currentMissionTitleEn": "Complete Fractions Quest",
  "currentMissionTitleAr": "أكمل مهمة الكسور",
  "xpCurrent": 420,
  "xpTarget": 500,
  "rankTitleEn": "Explorer",
  "rankTitleAr": "مستكشف",
  "badgeSlugs": ["speed-runner", "quiz-master"],
  "recentBadgeSlugs": ["quiz-master"],
  "streakDays": 6,
  "lastActivityAt": "2026-04-06T10:00:00.000Z",
  "progressStatus": "on_track",
  "progressPercent": 84,
  "completedMissionsCount": 7,
  "coachNoteEn": "Strong consistency this week.",
  "coachNoteAr": "أداء ثابت هذا الأسبوع."
}
```

## `hero_journey_student_objectives`
```json
{
  "id": "objective-1",
  "studentProgressId": "student-progress-1",
  "titleEn": "Finish lesson",
  "titleAr": "أكمل الدرس",
  "isCompleted": true
}
```

## Optional normalized earned badges table
```json
{
  "studentId": "student-uuid",
  "badgeSlug": "quiz-master",
  "earnedAt": "2026-04-02T09:00:00.000Z"
}
```

---

## 3) Shared reference endpoint

### `GET /api/hero-journey/badges`
The missions page and students-progress page both load the badge catalog first.

Response:
```json
{
  "items": [
    {
      "id": "badge-1",
      "slug": "speed-runner",
      "nameEn": "Speed Runner",
      "nameAr": "عدّاء سريع",
      "descriptionEn": "Complete a mission quickly",
      "descriptionAr": "أكمل مهمة بسرعة",
      "assetPath": "/assets/hero-journey/badges/speed-runner.svg"
    }
  ]
}
```

---

## 4) Overview backend contract

The overview page currently loads one aggregate payload and renders:
- KPI cards
- mission status breakdown
- XP trend
- completion by stage
- streak distribution
- mission drop-off list
- summary widgets

### `GET /api/hero-journey/overview`
Response:
```json
{
  "enrolledStudents": 320,
  "activeStudentsThisWeek": 248,
  "missionCompletionRate": 68.9,
  "totalXpEarned": 92450,
  "averageStreakDays": 5.8,
  "badgesEarnedThisMonth": 62,
  "stuckStudentsCount": 18,
  "averageProgressPercent": 71.4,
  "missionStatusBreakdown": [
    {
      "id": "published",
      "labelEn": "Published",
      "labelAr": "منشورة",
      "value": 14,
      "color": "#10b981"
    }
  ],
  "xpTrend": [
    {
      "label": "Week 1",
      "value": 1200,
      "ts": "2026-03-15T00:00:00.000Z"
    }
  ],
  "completionByStage": [
    {
      "id": "stage-1",
      "stageNameEn": "Primary",
      "stageNameAr": "الابتدائي",
      "completionRate": 74.3,
      "activeStudents": 120
    }
  ],
  "streakDistribution": [
    {
      "id": "streak-3-6",
      "labelEn": "3-6 days",
      "labelAr": "3-6 أيام",
      "value": 82,
      "color": "#38bdf8"
    }
  ],
  "topMissionDropOff": [
    {
      "missionId": "mission-1",
      "titleEn": "Complete Fractions Quest",
      "titleAr": "أكمل مهمة الكسور",
      "started": 45,
      "completed": 31,
      "dropOffRate": 31.1
    }
  ],
  "summaryWidgets": [
    {
      "id": "near-level-up",
      "titleEn": "Near Level-Up",
      "titleAr": "قريبون من المستوى التالي",
      "value": "14",
      "descriptionEn": "Students already above 85% progress and ready for the next push.",
      "descriptionAr": "طلاب تجاوزوا 85% من التقدم وجاهزون للدفعة التالية.",
      "tone": "teal"
    }
  ]
}
```

### Backend notes
- this is the main overview contract
- the current UI does not need separate chart endpoints
- one aggregate response is enough

---

## 5) Missions backend contract

The missions page currently needs:
- badge catalog
- mission list with filters
- selected mission detail from the list payload
- publish toggle mutation

### Current frontend filters
- `search`
- `status`
- `stage`

### `GET /api/hero-journey/missions`
Query params:
- `search`
- `status` = `draft | published | scheduled | archived | all`
- `stage` = `Primary | Middle | Secondary | all`

Response:
```json
{
  "items": [
    {
      "id": "mission-1",
      "titleEn": "Complete Fractions Quest",
      "titleAr": "أكمل مهمة الكسور",
      "stageNameEn": "Primary",
      "stageNameAr": "الابتدائي",
      "requiredLevel": 3,
      "linkedLessonId": "lesson-123",
      "linkedLessonTitleEn": "Fractions Basics",
      "linkedLessonTitleAr": "أساسيات الكسور",
      "linkedQuizId": "quiz-456",
      "linkedQuizTitleEn": "Fractions Quiz",
      "linkedQuizTitleAr": "اختبار الكسور",
      "status": "published",
      "rewardXp": 120,
      "badgeRewardSlug": "speed-runner",
      "studentsStarted": 45,
      "studentsCompleted": 31,
      "updatedAt": "2026-04-08T14:20:00.000Z"
    }
  ]
}
```

### `GET /api/hero-journey/missions/:missionId`
Recommended single-item endpoint for future use, even though the current UI can work from the list payload.

### Publish-state mutation
The current frontend only toggles publish state when:
- current status is `draft` or `published`
- `scheduled` and `archived` should not be toggleable

Best backend shape:

### `POST /api/hero-journey/missions/:missionId/toggle-publish`
Response:
```json
{
  "id": "mission-1",
  "status": "draft",
  "updatedAt": "2026-04-08T14:20:00.000Z"
}
```

Alternative acceptable shape:
### `PATCH /api/hero-journey/missions/:missionId`
```json
{
  "status": "published"
}
```

### Toggle rules backend should enforce
- mission must exist
- `archived` cannot be toggled
- `scheduled` should not be toggled through the current UI action
- `draft -> published`
- `published -> draft`

### Important note about create/edit
The missions page shows an edit icon, but it is currently a placeholder only.
So do **not** treat mission create/edit as required product backend yet unless product explicitly asks for it.

---

## 6) Students-progress backend contract

The students-progress page currently needs:
- badge catalog
- student progress list with filters
- student detail content from the same record shape

### Current frontend filters
- `search`
- `grade`
- `section`
- `status`

### `GET /api/hero-journey/students-progress`
Query params:
- `search`
- `grade`
- `section`
- `status` = `on_track | at_risk | inactive | all`

Response:
```json
{
  "items": [
    {
      "id": "student-progress-1",
      "studentId": "student-uuid",
      "studentName": "Ahmed Hassan",
      "stageNameEn": "Primary",
      "stageNameAr": "الابتدائي",
      "gradeNameEn": "Grade 5",
      "gradeNameAr": "الصف الخامس",
      "sectionNameEn": "A",
      "sectionNameAr": "أ",
      "currentLevel": 4,
      "currentMissionId": "mission-1",
      "currentMissionTitleEn": "Complete Fractions Quest",
      "currentMissionTitleAr": "أكمل مهمة الكسور",
      "xpCurrent": 420,
      "xpTarget": 500,
      "rankTitleEn": "Explorer",
      "rankTitleAr": "مستكشف",
      "badgeSlugs": ["speed-runner", "quiz-master"],
      "recentBadgeSlugs": ["quiz-master"],
      "streakDays": 6,
      "lastActivityAt": "2026-04-06T10:00:00.000Z",
      "progressStatus": "on_track",
      "progressPercent": 84,
      "completedMissionsCount": 7,
      "currentObjectives": [
        {
          "id": "objective-1",
          "titleEn": "Finish lesson",
          "titleAr": "أكمل الدرس",
          "isCompleted": true
        }
      ],
      "coachNoteEn": "Strong consistency this week.",
      "coachNoteAr": "أداء ثابت هذا الأسبوع."
    }
  ]
}
```

### `GET /api/hero-journey/students-progress/:id`
Recommended single-item endpoint for future deep linking or modal hydration.

### Backend notes
- current page is read-only
- no mutation endpoints are required for this screen today
- coach note is displayed, but not editable from the current UI
- objectives are displayed, but not editable from the current UI

---

## 7) Recommended validation rules

## Missions
- `id` unique
- bilingual title should exist for authoring flows if product enables them later
- `requiredLevel >= 0`
- `rewardXp >= 0`
- `studentsCompleted <= studentsStarted`
- `status` must be valid enum
- publish toggle only allowed for `draft` and `published`

## Student progress
- `xpCurrent >= 0`
- `xpTarget > 0`
- `progressPercent` should be derived or validated against XP fields
- `completedMissionsCount >= 0`
- `streakDays >= 0`
- `progressStatus` should remain one of the three current enums

## Badges
- `slug` unique
- `assetPath` optional but preferred for UI rendering

---

## 8) Known frontend/backend alignment notes

1. **Hero-journey is currently mock-service only**
   The inspected service imports mock data directly. I did not find an existing real API adapter in the files I checked, so this backend contract is effectively the first real API shape for the module.

2. **Only one real write is wired**
   The missions page only performs publish toggle. Edit remains placeholder UI.

3. **Overview is aggregate-first**
   The overview page expects one full object rather than many separate analytics calls.

4. **Mission detail and student detail are list-derived**
   The current UI can render details from the list payload itself, so separate detail endpoints are recommended but not strictly required to unblock the current screens.

5. **Badge catalog is cross-cutting**
   Badge data is needed in both missions and student progress surfaces, so it should remain a separate reusable endpoint.

6. **Stage/grade/section values are still presentation-oriented**
   The current service filters by display names like `Primary`, `Grade 5`, and `A`. A real backend may want to normalize these to ids later, but the current frontend contract is name-based.

---

## 9) Minimum backend contract to unblock the current frontend

Recommended delivery order:

1. badge catalog
2. overview aggregate endpoint
3. missions list endpoint
4. mission publish toggle endpoint
5. students-progress list endpoint
6. optional mission and student detail endpoints

That matches the actual current UI:
- overview is read-only
- missions is read plus publish toggle
- students-progress is read-only