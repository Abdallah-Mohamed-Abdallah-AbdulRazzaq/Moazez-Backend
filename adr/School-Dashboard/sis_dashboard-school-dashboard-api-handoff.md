# School Dashboard API Handoff

> This document is based on the **school dashboard** module under `src/features/dashboard` in the current repo.
> It does **not** cover the separate admissions dashboard module.

## 1) What exists today in the repo

### Confirmed current behavior

The current **school dashboard** is not backend-driven yet.

- `SchoolDashboardContainer` builds the main dashboard data locally by calling `buildDashboardSnapshot(...)` with:
  - `mockStudents`
  - selected academic year
  - selected term
- The only async dependency currently loaded separately is `getReinforcementSummaryCard()`.
- The view consumes:
  - `dashboardSnapshot`
  - `reinforcementSummary`
- Dashboard export is currently **client-side only** using local export utilities (`CSV / Excel / JSON / PDF`) from the browser.
- I did **not** find a dedicated `/api/dashboard/*` route for the school dashboard in the repo.

## 2) Confirmed UI data contract

## 2.1 Main dashboard contract actually required by the view

The page needs the following top-level data:

```ts
interface SchoolDashboardViewProps {
  dashboardSnapshot: DashboardSnapshot;
  reinforcementSummary: {
    inProgress: number;
    notCompleted: number;
    completionRate: number;
  } | null;
}
```

## 2.2 DashboardSnapshot shape required by the UI

```ts
interface DashboardSnapshot {
  kpis: {
    totalStudents: number;
    activeStudents: number;
    avgAttendance: number;
    atRiskStudents: number;
    lowAttendance: number;
  };

  deliveredClasses: number;
  violations: number;
  lowAttendanceStudents: number;
  nedaaEfficiencyMinutes: number;

  chartData: {
    students: Array<{ label: string; value: number }>;
    attendance: Array<{ label: string; value: number }>;
    classes: Array<{ label: string; value: number }>;
    violations: Array<{ label: string; value: number }>;
    lowAttendance: Array<{ label: string; value: number }>;
    nedaa: Array<{ label: string; value: number }>;
  };

  attendanceBreakdown: {
    present: number;
    absent: number;
  };

  activities: Array<{
    id: string;
    studentName: string;
    reason: string;
    xp: number;
  }>;

  academicPerformance: {
    positiveRate: number;
    negativeRate: number;
    trends: {
      today: number[];
      this_week: number[];
      this_term: number[];
    };
  };

  attendanceTrend: {
    days_30: {
      days: number[];
      attendanceData: number[];
      average: number;
      belowDays: number;
    };
    week: {
      days: number[];
      attendanceData: number[];
      average: number;
      belowDays: number;
    };
    term: {
      days: number[];
      attendanceData: number[];
      average: number;
      belowDays: number;
    };
    academic_year: {
      days: number[];
      attendanceData: number[];
      average: number;
      belowDays: number;
    };
  };

  studentsPerGrade: {
    grades: string[];
    newStudents: number[];
    existingStudents: number[];
  };

  absenceReasons: {
    medical: number;
    permission: number;
    noExcuse: number;
  };

  alerts: Array<{
    id: string;
    titleKey: string;
    descriptionKey: string;
    priority: "high" | "medium" | "low";
    actionKey: string;
  }>;

  monitoring: {
    classes: Array<{
      time: string;
      title: string;
      subtitle: string;
      status: "ongoing" | "upcoming" | "completed";
    }>;
    exams: Array<{
      time: string;
      title: string;
      subtitle: string;
      status: "ongoing" | "upcoming" | "completed";
    }>;
  };

  exportData: {
    summary: {
      date: string;
      academicYear: string;
      term: string;
      totalStudents: number;
      attendanceRate: string;
      deliveredClasses: number;
      violations: number;
      lowAttendanceStudents: number;
      nedaaEfficiency: string;
    };
    attendance: Array<{
      grade: string;
      totalStudents: number;
      present: number;
      absent: number;
      late: number;
      attendanceRate: string;
    }>;
    incidents: Array<{
      studentName: string;
      reason: string;
      xp: number;
      priority: "high" | "medium" | "low";
    }>;
  };
}
```

## 2.3 Reinforcement summary shape required by the widget

```ts
interface DashboardReinforcementSummary {
  inProgress: number;
  notCompleted: number;
  completionRate: number;
}
```

---

## 3) Confirmed filters visible in the school dashboard UI

## 3.1 Context filters already implied by the page

These are effectively required because the container depends on academic year / term context:

- `academicYearId`
- `termId`

## 3.2 Attendance KPI period filter

The attendance KPI shows these period options in the UI:

```ts
"today" | "this_week" | "this_term" | "this_year"
```

> Important: in the current code this period selector is shown on the attendance KPI card only.
> It is not yet wired to a real backend request.

## 3.3 Export filters visible in the current modal

### Export format

```ts
"csv" | "excel" | "json" | "pdf"
```

### Export dataset

```ts
"summary" | "attendance" | "incidents" | "all"
```

## 3.4 Reinforcement filters

The dashboard widget itself does **not** expose filters.

However, the reinforcement service in the repo already supports these filters for the detailed task list flow:

- `search`
- `assignmentScope`
- `targetId`
- `student`
- `className`
- `source`
- `status`
- `rewardType`
- `dueDate`

These are **not required by the current dashboard widget**, but may be useful later if the widget expands into drill-down APIs.

---

## 4) Recommended APIs needed for the school dashboard

Because the current page consumes **one large snapshot** plus **one reinforcement summary**, the cleanest backend contract is:

1. `GET /api/dashboard/overview`
2. `GET /api/dashboard/reinforcement-summary`
3. `POST /api/dashboard/export` (optional, only if export should move server-side)

---

## 5) Proposed API 1 — GET `/api/dashboard/overview`

### Purpose

Return the full data needed to render the school dashboard in one request.

### Suggested query params

| Param | Type | Required | Notes |
|---|---|---:|---|
| `academicYearId` | string | Yes | main page context |
| `termId` | string | Yes | main page context |
| `attendancePeriod` | `today \| this_week \| this_term \| this_year` | No | for KPI period behavior |
| `locale` | string | No | for translated labels if backend returns localized text |

### Example request

```http
GET /api/dashboard/overview?academicYearId=year-2&termId=term-2-2&attendancePeriod=today
```

### Suggested response

```json
{
  "kpis": {
    "totalStudents": 1240,
    "activeStudents": 1218,
    "avgAttendance": 93.4,
    "atRiskStudents": 56,
    "lowAttendance": 41
  },
  "deliveredClasses": 37,
  "violations": 9,
  "lowAttendanceStudents": 41,
  "nedaaEfficiencyMinutes": 4.2,
  "chartData": {
    "students": [
      { "label": "Sep", "value": 1180 },
      { "label": "Oct", "value": 1196 },
      { "label": "Nov", "value": 1210 }
    ],
    "attendance": [
      { "label": "Mon", "value": 93.1 },
      { "label": "Tue", "value": 94.0 }
    ],
    "classes": [
      { "label": "Mon", "value": 34 },
      { "label": "Tue", "value": 36 }
    ],
    "violations": [
      { "label": "Mon", "value": 4 },
      { "label": "Tue", "value": 6 }
    ],
    "lowAttendance": [
      { "label": "W1", "value": 48 },
      { "label": "W2", "value": 45 }
    ],
    "nedaa": [
      { "label": "Mon", "value": 4.4 },
      { "label": "Tue", "value": 4.1 }
    ]
  },
  "attendanceBreakdown": {
    "present": 93,
    "absent": 7
  },
  "activities": [
    {
      "id": "STD-1001",
      "studentName": "Ahmed Hassan",
      "reason": "Academic improvement",
      "xp": 50
    }
  ],
  "academicPerformance": {
    "positiveRate": 93,
    "negativeRate": 7,
    "trends": {
      "today": [91.2, 92.4, 93.0],
      "this_week": [90.1, 91.5, 92.0],
      "this_term": [89.0, 89.8, 90.4]
    }
  },
  "attendanceTrend": {
    "days_30": {
      "days": [1, 2, 3],
      "attendanceData": [92.1, 93.5, 94.0],
      "average": 93.4,
      "belowDays": 4
    },
    "week": {
      "days": [1, 2, 3, 4, 5, 6, 7],
      "attendanceData": [92.5, 93.0, 93.8, 94.1, 92.9, 91.7, 93.3],
      "average": 93.4,
      "belowDays": 1
    },
    "term": {
      "days": [1, 2, 3],
      "attendanceData": [92.0, 92.8, 93.3],
      "average": 93.4,
      "belowDays": 2
    },
    "academic_year": {
      "days": [1, 2, 3],
      "attendanceData": [91.9, 92.6, 93.4],
      "average": 93.4,
      "belowDays": 3
    }
  },
  "studentsPerGrade": {
    "grades": ["KG1", "KG2", "Grade 1", "Grade 2"],
    "newStudents": [32, 28, 16, 14],
    "existingStudents": [88, 91, 102, 110]
  },
  "absenceReasons": {
    "medical": 31,
    "permission": 28,
    "noExcuse": 41
  },
  "alerts": [
    {
      "id": "alerts-low-attendance",
      "titleKey": "alerts.low_attendance.title",
      "descriptionKey": "alerts.low_attendance.description",
      "priority": "high",
      "actionKey": "alerts.low_attendance.action"
    }
  ],
  "monitoring": {
    "classes": [
      {
        "time": "08:00",
        "title": "Mathematics · Term 2",
        "subtitle": "Room 201",
        "status": "completed"
      }
    ],
    "exams": [
      {
        "time": "10:00",
        "title": "Term 2 checkpoint",
        "subtitle": "Academic Year 2025/2026",
        "status": "ongoing"
      }
    ]
  },
  "exportData": {
    "summary": {
      "date": "2026-04-20",
      "academicYear": "2025/2026",
      "term": "Term 2",
      "totalStudents": 1240,
      "attendanceRate": "93.4%",
      "deliveredClasses": 37,
      "violations": 9,
      "lowAttendanceStudents": 41,
      "nedaaEfficiency": "4.2 min"
    },
    "attendance": [
      {
        "grade": "Grade 6",
        "totalStudents": 180,
        "present": 169,
        "absent": 11,
        "late": 4,
        "attendanceRate": "93.9%"
      }
    ],
    "incidents": [
      {
        "studentName": "Ahmed Hassan",
        "reason": "Attendance follow-up",
        "xp": -25,
        "priority": "high"
      }
    ]
  }
}
```

### Error response

```json
{
  "error": "dashboard_overview_failed",
  "message": "Unable to load dashboard overview"
}
```

---

## 6) Proposed API 2 — GET `/api/dashboard/reinforcement-summary`

### Purpose

Return the exact data needed by the reinforcement widget on the dashboard.

### Suggested query params

| Param | Type | Required | Notes |
|---|---|---:|---|
| `academicYearId` | string | No | optional if summary is scoped by year |
| `termId` | string | No | optional if summary is scoped by term |

### Example request

```http
GET /api/dashboard/reinforcement-summary?academicYearId=year-2&termId=term-2-2
```

### Suggested response

```json
{
  "inProgress": 12,
  "notCompleted": 8,
  "completionRate": 74.3
}
```

### Error response

```json
{
  "error": "reinforcement_summary_failed",
  "message": "Unable to load reinforcement summary"
}
```

---

## 7) Proposed API 3 — POST `/api/dashboard/export`

> This endpoint is only needed if you want export generation to happen on the server.
> Right now, school dashboard export is handled locally in the browser.

### Purpose

Generate exported dashboard files based on selected format and selected dataset.

### Suggested request body

```json
{
  "academicYearId": "year-2",
  "termId": "term-2-2",
  "attendancePeriod": "today",
  "format": "csv",
  "dataset": "attendance",
  "locale": "en"
}
```

### Request DTO

```ts
interface DashboardExportRequest {
  academicYearId: string;
  termId: string;
  attendancePeriod?: "today" | "this_week" | "this_term" | "this_year";
  format: "csv" | "excel" | "json" | "pdf";
  dataset: "summary" | "attendance" | "incidents" | "all";
  locale?: string;
}
```

### Success response options

#### Option A — file response

Return a file stream with headers such as:

```http
Content-Type: text/csv
Content-Disposition: attachment; filename="dashboard-attendance-2026-04-20.csv"
```

#### Option B — signed URL response

```json
{
  "downloadUrl": "https://files.example.com/exports/dashboard-attendance-2026-04-20.csv",
  "fileName": "dashboard-attendance-2026-04-20.csv",
  "contentType": "text/csv"
}
```

### Validation notes

- `excel` and `csv` work best when `dataset` is tabular:
  - `summary`
  - `attendance`
  - `incidents`
- `json` can support all datasets including `all`
- `pdf` may require a dedicated report template if exported server-side

---

## 8) Optional alternative design

If the team prefers smaller endpoints instead of one aggregated overview endpoint, the snapshot can be split into:

- `GET /api/dashboard/kpis`
- `GET /api/dashboard/chart-data`
- `GET /api/dashboard/activities`
- `GET /api/dashboard/alerts`
- `GET /api/dashboard/monitoring`
- `GET /api/dashboard/export-data`

### Recommendation

For the **current frontend shape**, I strongly recommend keeping:

- one aggregated `GET /api/dashboard/overview`
- one `GET /api/dashboard/reinforcement-summary`

This matches the way the page is currently structured and keeps the frontend simple.

---

## 9) Backend implementation notes

## 9.1 Confirmed page dependencies

The backend logic should be able to scope results by:

- academic year
- term
- attendance period

## 9.2 Important current frontend assumption

The current frontend expects ready-to-render values, not raw source tables only.

Examples:

- KPI values are already aggregated
- chart arrays are already shaped for direct rendering
- attendance breakdown is already percentage-based
- alerts already include `priority` and translation keys
- monitoring items already include display-ready `time`, `title`, `subtitle`, `status`
- export payload is already prepared in dashboard-friendly shape

## 9.3 Migration suggestion

When moving from mock/local calculations to backend:

1. keep the response field names identical to the current `DashboardSnapshot`
2. replace `buildDashboardSnapshot(...)` with a fetch call to `/api/dashboard/overview`
3. keep `getReinforcementSummaryCard()` behavior but switch implementation to call `/api/dashboard/reinforcement-summary`
4. optionally move export generation to `POST /api/dashboard/export`

---

## 10) Final recommendation

### Minimum API set needed now

```http
GET /api/dashboard/overview
GET /api/dashboard/reinforcement-summary
```

### Optional API for export

```http
POST /api/dashboard/export
```

This is the smallest and cleanest backend contract that matches the current school dashboard implementation.
