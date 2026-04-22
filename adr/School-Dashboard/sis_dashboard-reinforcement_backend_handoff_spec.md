# Reinforcement Backend Handoff Spec

## Scope

This handoff is based on the current **reinforcement** module in `sis_dashboard`.

Confirmed reinforcement routes and product surfaces:
- `/reinforcement` → overview
- `/reinforcement/tasks` → task list + filters + create modal
- `/reinforcement/tasks/[taskId]` → task details

The current module supports:
- overview KPIs and charts
- recent activity feed
- quick actions
- reinforcement task listing with filters
- create reinforcement task
- duplicate task
- cancel task
- task details
- export for overview, task list, and task details

There is **not** currently a visible UI for:
- editing an existing task
- deleting a task
- approving/rejecting stage submissions manually
- submitting stage proof from student-side UI within this module

So the backend handoff below focuses on the **actual current frontend contract** first, with a few optional future-facing notes where useful.

---

## High-level backend rules

1. **Tasks are the core entity**
   The current module revolves around reinforcement tasks with multi-stage execution.

2. **Tasks can target multiple audiences**
   A task can target one or more items from the same scope level:
   - school
   - stage
   - grade
   - section
   - classroom
   - student

3. **Mixed scope types are not allowed**
   The current service rejects mixed target scope types inside one task payload.

4. **Tasks carry staged workflow**
   Each task contains stages, and each stage tracks:
   - completion
   - approval
   - submission timestamp
   - proof URL
   - proof type

5. **The current UI is mostly read + create + duplicate + cancel**
   That is the real backend surface needed today.

6. **Academic year / term are currently contextual, not enforced in task data**
   The reinforcement pages read year and term from the URL for context and export metadata, but the current reinforcement service itself is not actually keyed by year/term. This is an important backend design decision point.

---

## 1) Shared enums

### Task source
```json
{
  "ReinforcementSource": ["teacher", "parent", "system"]
}
```

### Task status
```json
{
  "ReinforcementStatus": ["cancel", "in_progress", "completed", "not_completed"]
}
```

### Proof type
```json
{
  "ReinforcementProofType": ["image", "video", "document", "none"]
}
```

### Reward type
```json
{
  "ReinforcementRewardType": ["moral", "financial", "xp", "badge"]
}
```

### Assignment scope
```json
{
  "ReinforcementAssignmentScope": [
    "school",
    "stage",
    "grade",
    "section",
    "classroom",
    "student"
  ]
}
```

---

## 2) Core entities

## `reinforcement_tasks`
```json
{
  "id": "RT-1001",
  "titleAr": "قيادة ركن القراءة",
  "titleEn": "Lead the Reading Corner",
  "descriptionAr": "تنظيم ركن القراءة.",
  "descriptionEn": "Organize the reading corner.",
  "source": "teacher",
  "status": "in_progress",
  "rewardType": "badge",
  "rewardValue": "Reading Star Badge",
  "dueDate": "2026-03-28",
  "assignedById": "EMP-201",
  "assignedByName": "Ms. Huda",
  "createdAt": "2026-03-18T07:00:00.000Z",
  "updatedAt": "2026-03-25T10:20:00.000Z",
  "primaryTargetType": "student",
  "primaryTargetId": "STD-1005",
  "targetSummaryAr": "ليلى سالم",
  "targetSummaryEn": "Layla Salem",
  "audienceCount": 1
}
```

## `reinforcement_task_targets`
```json
{
  "taskId": "RT-1001",
  "scopeType": "student",
  "scopeId": "STD-1005",
  "nameAr": "Layla Salem",
  "nameEn": "Layla Salem",
  "stageId": "stage-2",
  "stageNameAr": "المرحلة المتوسطة",
  "stageNameEn": "Middle School",
  "gradeId": "grade-5",
  "gradeNameAr": "الصف الخامس",
  "gradeNameEn": "Grade 5",
  "sectionId": "section-8",
  "sectionNameAr": "شعبة ب",
  "sectionNameEn": "Section B",
  "classroomId": "classroom-10",
  "classroomNameAr": "فصل 10",
  "classroomNameEn": "Classroom 10",
  "audienceCount": 1
}
```

## `reinforcement_task_stages`
```json
{
  "id": "RT-1001-ST-1",
  "taskId": "RT-1001",
  "titleAr": "إعداد اللوحة",
  "titleEn": "Prepare board",
  "descriptionAr": "",
  "descriptionEn": "",
  "proofType": "image",
  "isCompleted": true,
  "isApproved": true,
  "submittedAt": "2026-03-19T09:15:00.000Z",
  "proofUrl": "/proofs/reading-board.jpg"
}
```

## Optional normalized actor table
If reinforcement will integrate with real staff/parent/system actors later, store actors separately and keep:
- `assignedById`
- `assignedByType`
- `assignedByName`

Right now the UI only reads `assignedById` and `assignedByName`.

---

## 3) Shared reference and context endpoints

The current UI uses academic year and term in page context and exports, even though the reinforcement task service is not yet actually scoped by them.

### `GET /api/academics/years`
### `GET /api/academics/terms?yearId={yearId}`

### `GET /api/reinforcement/context`
Optional convenience endpoint if backend wants to make reinforcement truly year/term aware.

Suggested response:
```json
{
  "selectedAcademicYear": {
    "id": "year-2",
    "name": "2025-2026"
  },
  "selectedTerm": {
    "id": "term-2-2",
    "name": "Term 2",
    "status": "open"
  }
}
```

### `GET /api/reinforcement/filter-options`
The tasks page and create modal need:
- student list
- class list
- scope target options grouped by assignment scope

Suggested response:
```json
{
  "students": [
    {
      "studentId": "STD-1001",
      "studentName": "Ahmed Hassan"
    }
  ],
  "classes": ["Grade 5 - Section A"],
  "scopeTargets": {
    "school": [
      {
        "value": "school-main",
        "scopeType": "school",
        "nameAr": "المدرسة بالكامل",
        "nameEn": "Whole School",
        "audienceCount": 6
      }
    ],
    "stage": [],
    "grade": [],
    "section": [],
    "classroom": [],
    "student": []
  }
}
```

This is a required endpoint for the create task modal and task filters.

---

## 4) Overview page contract

The overview page currently loads one overview payload and then does all chart/activity filtering client-side.

### `GET /api/reinforcement/overview`
Suggested response:
```json
{
  "kpis": {
    "inProgress": 3,
    "notCompleted": 2,
    "completedThisWeek": 1,
    "rewardedStudents": 4,
    "averageCompletionRate": 71.4,
    "totalRewardsIssued": 5
  },
  "tasksByStatus": [
    { "id": "cancel", "label": "cancel", "value": 1 },
    { "id": "in_progress", "label": "in_progress", "value": 3 },
    { "id": "completed", "label": "completed", "value": 2 },
    { "id": "not_completed", "label": "not_completed", "value": 2 }
  ],
  "tasksBySource": [
    { "id": "teacher", "label": "teacher", "value": 3 },
    { "id": "parent", "label": "parent", "value": 1 },
    { "id": "system", "label": "system", "value": 2 }
  ],
  "rewardsByType": [
    { "id": "moral", "label": "moral", "value": 2 },
    { "id": "financial", "label": "financial", "value": 1 },
    { "id": "xp", "label": "xp", "value": 1 },
    { "id": "badge", "label": "badge", "value": 2 }
  ],
  "topClasses": [
    { "id": "class-1", "name": "Grade 5 - Section A", "value": 4.5 }
  ],
  "topStudents": [
    { "id": "student-1", "name": "Layla Salem", "value": 3.0 }
  ],
  "recentActivity": [
    {
      "id": "ACT-1",
      "titleAr": "تم تحديث مهمة قيد التنفيذ",
      "titleEn": "In-progress task updated",
      "descriptionAr": "ليلى سالم أرسلت دليلا جديدا لمهمة ركن القراءة.",
      "descriptionEn": "Layla Salem submitted fresh evidence for the reading corner task.",
      "timestamp": "2026-03-25T10:20:00.000Z",
      "type": "submission"
    }
  ],
  "quickActions": [
    {
      "id": "tasks",
      "titleAr": "إدارة المهام",
      "titleEn": "Manage tasks",
      "href": "/reinforcement/tasks",
      "descriptionAr": "راجع المهام الحالية وأنشئ مهاما جديدة على مستوى المدرسة أو الصف أو الطالب.",
      "descriptionEn": "Review current reinforcement tasks and create new work for schools, classes, or students."
    }
  ]
}
```

### Important note
The current overview page does **not** call separate chart endpoints. It expects one aggregate object and filters it locally by:
- chart type
- activity type

So a single `GET /overview` endpoint is enough for the current UI.

---

## 5) Task listing and filters

The tasks page loads:
- filter options
- task list
- duplicate action
- cancel action
- create task

### Current filter model
The frontend supports:
- `q`
- `scope`
- `targetId`
- `source`
- `status`
- `rewardType`
- `dueDate`

These map to:
```json
{
  "search": "reading",
  "assignmentScope": "student",
  "targetId": "STD-1005",
  "source": "teacher",
  "status": "in_progress",
  "rewardType": "badge",
  "dueDate": "2026-03-28"
}
```

### `GET /api/reinforcement/tasks`
Query params:
- `q`
- `scope`
- `targetId`
- `source`
- `status`
- `rewardType`
- `dueDate`
- optional future: `yearId`
- optional future: `termId`

Response:
```json
{
  "items": [
    {
      "id": "RT-1001",
      "titleAr": "قيادة ركن القراءة",
      "titleEn": "Lead the Reading Corner",
      "descriptionAr": "تنظيم ركن القراءة.",
      "descriptionEn": "Organize the reading corner.",
      "studentId": "STD-1005",
      "studentName": "Layla Salem",
      "classId": "classroom-10",
      "className": "Grade 5 - Section B",
      "source": "teacher",
      "status": "in_progress",
      "rewardType": "badge",
      "rewardValue": "Reading Star Badge",
      "dueDate": "2026-03-28",
      "assignedById": "EMP-201",
      "assignedByName": "Ms. Huda",
      "createdAt": "2026-03-18T07:00:00.000Z",
      "updatedAt": "2026-03-25T10:20:00.000Z",
      "stages": [],
      "targets": [],
      "primaryTargetType": "student",
      "primaryTargetId": "STD-1005",
      "targetSummaryAr": "ليلى سالم",
      "targetSummaryEn": "Layla Salem",
      "audienceCount": 1
    }
  ]
}
```

### Filtering rules backend should support
- free-text search across:
  - task id
  - titleAr/titleEn
  - assignedByName
  - studentName
  - className
  - target summary
  - target names
- `scope` filters by `primaryTargetType`
- `targetId` matches one of the task targets
- `dueDate` exact date match in current UI
- source/status/rewardType exact enum filters

---

## 6) Create task contract

The create modal is the main write flow in the current UI.

### Current create payload
```json
{
  "titleAr": "قيادة ركن القراءة",
  "titleEn": "Lead the Reading Corner",
  "descriptionAr": "تنظيم ركن القراءة.",
  "descriptionEn": "Organize the reading corner.",
  "targets": [
    {
      "scopeType": "student",
      "scopeId": "STD-1005"
    }
  ],
  "stages": [
    {
      "titleAr": "إعداد اللوحة",
      "titleEn": "Prepare board",
      "descriptionAr": "",
      "descriptionEn": "",
      "proofType": "image"
    }
  ],
  "source": "teacher",
  "rewardType": "badge",
  "rewardValue": "Reading Star Badge",
  "dueDate": "2026-03-28",
  "assignedById": "EMP-NEW",
  "assignedByName": "Reinforcement Team"
}
```

### `POST /api/reinforcement/tasks`
Response:
```json
{
  "id": "RT-1007",
  "titleAr": "قيادة ركن القراءة",
  "titleEn": "Lead the Reading Corner",
  "descriptionAr": "تنظيم ركن القراءة.",
  "descriptionEn": "Organize the reading corner.",
  "targets": [
    {
      "scopeType": "student",
      "scopeId": "STD-1005",
      "nameAr": "Layla Salem",
      "nameEn": "Layla Salem",
      "audienceCount": 1
    }
  ],
  "primaryTargetType": "student",
  "primaryTargetId": "STD-1005",
  "targetSummaryAr": "ليلى سالم",
  "targetSummaryEn": "Layla Salem",
  "audienceCount": 1,
  "source": "teacher",
  "status": "not_completed",
  "rewardType": "badge",
  "rewardValue": "Reading Star Badge",
  "dueDate": "2026-03-28",
  "assignedById": "EMP-NEW",
  "assignedByName": "Reinforcement Team",
  "createdAt": "2026-03-26T09:00:00.000Z",
  "updatedAt": "2026-03-26T09:00:00.000Z",
  "stages": [
    {
      "id": "RT-1007-ST-1",
      "titleAr": "إعداد اللوحة",
      "titleEn": "Prepare board",
      "descriptionAr": "",
      "descriptionEn": "",
      "proofType": "image",
      "isCompleted": false,
      "isApproved": false
    }
  ]
}
```

### Validation rules backend should enforce
- `titleAr` required
- `titleEn` required
- at least one target required
- all targets must share the same `scopeType`
- duplicate targets not allowed
- at least one stage required
- every stage needs `titleAr` and `titleEn`
- every `scopeId` must resolve from known scope targets
- initial status should be `not_completed`

---

## 7) Duplicate and cancel actions

These are real row actions in the current tasks table.

### `POST /api/reinforcement/tasks/:taskId/duplicate`
Suggested response:
```json
{
  "id": "RT-1008",
  "status": "not_completed",
  "createdAt": "2026-03-26T09:00:00.000Z",
  "updatedAt": "2026-03-26T09:00:00.000Z"
}
```

Current behavior implied by the service:
- cloned title/content/targets/reward
- new task id
- status reset to `not_completed`
- createdAt/updatedAt reset to now
- stages duplicated but:
  - `isCompleted = false`
  - `isApproved = false`
  - `submittedAt = null`
  - `proofUrl = null`

### `POST /api/reinforcement/tasks/:taskId/cancel`
Suggested response:
```json
{
  "id": "RT-1001",
  "status": "cancel",
  "updatedAt": "2026-03-26T09:00:00.000Z"
}
```

Current frontend does not ask for a cancel reason, so backend does not need one yet.

---

## 8) Task details page contract

The details page loads one task only and renders:
- summary
- reward block
- target list
- stages
- timeline
- attachments

### `GET /api/reinforcement/tasks/:taskId`
Response:
```json
{
  "id": "RT-1001",
  "titleAr": "قيادة ركن القراءة",
  "titleEn": "Lead the Reading Corner",
  "descriptionAr": "تنظيم ركن القراءة.",
  "descriptionEn": "Organize the reading corner.",
  "studentId": "STD-1005",
  "studentName": "Layla Salem",
  "classId": "classroom-10",
  "className": "Grade 5 - Section B",
  "source": "teacher",
  "status": "in_progress",
  "rewardType": "badge",
  "rewardValue": "Reading Star Badge",
  "dueDate": "2026-03-28",
  "assignedById": "EMP-201",
  "assignedByName": "Ms. Huda",
  "createdAt": "2026-03-18T07:00:00.000Z",
  "updatedAt": "2026-03-25T10:20:00.000Z",
  "targets": [
    {
      "scopeType": "student",
      "scopeId": "STD-1005",
      "nameAr": "Layla Salem",
      "nameEn": "Layla Salem",
      "audienceCount": 1
    }
  ],
  "stages": [
    {
      "id": "RT-1001-ST-1",
      "titleAr": "إعداد اللوحة",
      "titleEn": "Prepare board",
      "descriptionAr": "",
      "descriptionEn": "",
      "proofType": "image",
      "isCompleted": true,
      "isApproved": true,
      "submittedAt": "2026-03-19T09:15:00.000Z",
      "proofUrl": "/proofs/reading-board.jpg"
    }
  ],
  "primaryTargetType": "student",
  "primaryTargetId": "STD-1005",
  "targetSummaryAr": "ليلى سالم",
  "targetSummaryEn": "Layla Salem",
  "audienceCount": 1
}
```

### Detail page note
Timeline is currently derived on the frontend from:
- task `createdAt`
- task `updatedAt`
- stage `submittedAt`

So backend does **not** need a dedicated audit/timeline endpoint for the current UI.

---

## 9) Recommended convenience endpoints

These are not strictly required for the current UI, but they would help if the module evolves.

### `GET /api/reinforcement/tasks/:taskId/timeline`
Not needed now, but useful if timeline becomes audit-based later.

### `GET /api/reinforcement/stats/card`
The service already exposes a small summary-card helper:
- inProgress
- notCompleted
- completionRate

Could be useful if reinforcement summary gets embedded in other dashboards.

### `GET /api/reinforcement/targets/search`
Not necessary today because the modal loads all options upfront, but useful later if the number of students/classes grows too large.

---

## 10) Recommended validation and business rules

## Task creation
- titles required
- at least one stage
- at least one target
- no duplicate targets
- all targets must share one scope type
- default status = `not_completed`

## Task duplication
- keep original task data except:
  - new id
  - status reset
  - timestamps reset
  - stage progress/proof cleared

## Task cancel
- id must exist
- can be cancelled from any non-cancel state
- repeated cancel should be idempotent if preferred

## Scope target resolution
- backend should resolve `scopeId` into rich target metadata:
  - human-readable name
  - stage/grade/section/classroom ancestry when relevant
  - audience count
- frontend expects that rich shape back on task reads

## Detail rendering
- `studentId/studentName/classId/className` are really convenience fields for single-student tasks
- for multi-target tasks, backend can leave those null and rely on:
  - `targets`
  - `targetSummaryAr`
  - `targetSummaryEn`
  - `audienceCount`

---

## 11) Known frontend/backend alignment notes

1. **Year/term context is currently UI-level only**
   The reinforcement pages read academic year and term from the URL via `useReinforcementAcademicContext()`, but the task service does not actually filter or partition tasks by year/term. Backend should decide one of these:

   - keep reinforcement global for now, or
   - make tasks truly scoped by `academicYearId` and `termId`

   If product wants reinforcement aligned with academics and attendance, term scoping is the stronger long-term design.

2. **Task editing is not in the current UI**
   There is no edit existing task flow yet. Do not overbuild it unless product already wants it.

3. **Stage submission/approval is only represented in read data**
   The detail page reads:
   - `isCompleted`
   - `isApproved`
   - `submittedAt`
   - `proofUrl`

   But the current module does not expose the action UI for updating those states. So backend can postpone stage mutation APIs unless another app surface needs them.

4. **Exports are client-side**
   The current module exports overview and tasks using already loaded data. No backend export job is required yet.

5. **Quick actions are data-driven**
   Overview quick actions are returned from the overview payload itself, including localized titles/descriptions and hrefs.

---

## 12) Minimum backend contract to unblock the current frontend

Recommended delivery order:

1. academic years / terms for context
2. reinforcement filter options
3. overview endpoint
4. tasks list endpoint
5. task details endpoint
6. create task endpoint
7. duplicate task endpoint
8. cancel task endpoint

That exactly matches the current reinforcement UI:
- overview is read-only
- task list is read + create + duplicate + cancel
- details page is read-only