# DASHBOARD-COMMAND-CENTER-0A Reality / Contract Audit

## 1. Sprint Status

| Item | Status |
| --- | --- |
| Sprint name | `DASHBOARD-COMMAND-CENTER-0A` |
| Sprint type | Docs-only reality audit, backend contract design, and execution roadmap |
| Expected baseline commit | `36d513df fix: correct dashboard email alert target` |
| Actual baseline commit | `36d513df fix: correct dashboard email alert target` |
| Working tree state before audit | Clean: `git status --short --untracked-files=all` returned no output |
| Baseline Prisma validation | Passed: `npx prisma validate` reported `prisma/schema.prisma` is valid |
| Final status | Docs-only contract created; runtime implementation deferred |

## 2. Purpose and Scope

This sprint is a documentation-only audit and contract sprint for Dashboard Command Center V2. It verifies the current Dashboard backend reality, inventories available source data, corrects the LightModeDropdown backend contract to Moazez API conventions, and defines an execution-ready roadmap for future runtime sprints.

No runtime code was changed. No schema, migrations, seeds, routes, permissions, tests, packages, generated files, or commits are part of this sprint.

Explicit non-goals:

- No runtime code.
- No Prisma schema changes.
- No migrations.
- No seed changes.
- No route implementation.
- No external BI integration.
- No Microsoft Power BI integration.
- No Power BI Embedded.
- No external BI provider, embed tokens, or external BI workspace.

The target is **Internal BI-style Dashboard Analytics**: chart-ready datasets, KPI catalogs, widget contracts, trends, drilldown-safe metadata, and frontend-rendered dashboards.

## 3. Sources Reviewed

### Dashboard backend code

- `src/modules/dashboard/dashboard.module.ts`
- `src/modules/dashboard/controller/dashboard.controller.ts`
- `src/modules/dashboard/dashboard-context.ts`
- `src/modules/dashboard/application/get-dashboard-summary.use-case.ts`
- `src/modules/dashboard/application/list-dashboard-alerts.use-case.ts`
- `src/modules/dashboard/application/list-dashboard-activity-feed.use-case.ts`
- `src/modules/dashboard/infrastructure/dashboard-summary.repository.ts`
- `src/modules/dashboard/infrastructure/dashboard-alerts.repository.ts`
- `src/modules/dashboard/infrastructure/dashboard-activity-feed.repository.ts`
- `src/modules/dashboard/presenters/dashboard-summary.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-alerts.presenter.ts`
- `src/modules/dashboard/presenters/dashboard-activity-feed.presenter.ts`
- `src/modules/dashboard/dto/dashboard-summary.dto.ts`
- `src/modules/dashboard/dto/dashboard-alerts.dto.ts`
- `src/modules/dashboard/dto/dashboard-activity-feed.dto.ts`
- `src/app.module.ts`
- `src/main.ts`
- `src/infrastructure/database/school-scope.extension.ts`

### Dashboard tests

- `test/e2e/dashboard-summary-foundation.e2e-spec.ts`
- `test/e2e/dashboard-alerts-foundation.e2e-spec.ts`
- `test/e2e/dashboard-activity-feed-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard.spec.ts`
- `test/security/tenancy.dashboard-alerts.spec.ts`
- `test/security/tenancy.dashboard-activity-feed.spec.ts`

### Previous dashboard closeouts

- `docs/sprint-16d-dashboard-foundation-final-closeout-audit.md`
- `docs/sprint-dashboard-alerts-email-target-1a-closeout.md`

### Project governance docs

- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `DOMAIN_GLOSSARY.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `ERROR_CATALOG.md`
- `TESTING_STRATEGY.md`
- `OBSERVABILITY.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`

`DIRECTORY_STRUCTURE.md` does not exist in this repository. `DIRECTORY_STRUCTURE_VISUAL.md` was used as the closest current directory structure guide.

### Prisma schema/models

- `prisma/schema.prisma`
- Focus models reviewed: `School`, `SchoolProfile`, `AcademicYear`, `Term`, `Stage`, `Grade`, `Section`, `Classroom`, `Subject`, `SubjectAllocation`, `TeacherSubjectAllocation`, `TimetableEntry`, `TimetablePublication`, `Curriculum`, `LessonPlan`, `AcademicCalendarEvent`, `Application`, `Lead`, `PlacementTest`, `Interview`, `Student`, `Guardian`, `Enrollment`, `AttendanceSession`, `AttendanceEntry`, `AttendanceExcuseRequest`, `GradeAssessment`, `GradeSubmission`, `GradeSubmissionAnswer`, `HomeworkAssignment`, `HomeworkSubmission`, `BehaviorRecord`, `ReinforcementTask`, `ReinforcementSubmission`, `XpLedger`, `RewardRedemption`, `CommunicationAnnouncement`, `CommunicationConversation`, `CommunicationMessage`, `CommunicationMessageReport`, `SchoolLoginSettings`, `SchoolEmailConnection`, `AuditLog`.
- Additional models reviewed for optional/future route decisions: `Organization`, `SchoolEntitlement`, `SchoolFeatureControl`, `DismissalSettings`, `DismissalGate`, `DismissalStaffAssignment`, `DismissalRequest`, `DismissalRequestEvent`, `AppDeviceToken`.

### LightModeDropdown frontend contract

- Supplied sprint request contract for `LightModeDropdown`, including weather header/main card, weather highlights, other cities weather, 10-day forecast, planner calendar, and todo CRUD behavior.

### Related source modules

The following module trees and route/controller surfaces were inspected for dashboard data source suitability:

- `src/modules/admissions/**`
- `src/modules/students/**`
- `src/modules/academics/**`
- `src/modules/attendance/**`
- `src/modules/grades/**`
- `src/modules/homework/**`
- `src/modules/behavior/**`
- `src/modules/reinforcement/**`
- `src/modules/communication/**`
- `src/modules/settings/**`
- `src/modules/dismissal/**`
- `src/modules/platform-admin/**`

## 4. Current Dashboard Backend Reality

### Current routes

The current Dashboard controller exposes only:

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/alerts`
- `GET /api/v1/dashboard/activity-feed`

No command center, widgets, analytics, module dashboard pages, LightModeDropdown, todos, alert lifecycle, or realtime dashboard REST routes exist today.

### Current permissions

- `dashboard.summary.view`
- `dashboard.alerts.view`
- `dashboard.activity_feed.view`

These are seeded in `prisma/seeds/01-permissions.seed.ts`. Tests verify that teacher, parent, and student role seed arrays do not inherit these Dashboard permissions.

### Current module wiring

`DashboardModule` imports `AuthModule`, registers `DashboardController`, and provides:

- `DashboardSummaryRepository`
- `DashboardAlertsRepository`
- `DashboardActivityFeedRepository`
- `GetDashboardSummaryUseCase`
- `ListDashboardAlertsUseCase`
- `ListDashboardActivityFeedUseCase`

`AppModule` imports `DashboardModule` after the core source modules and registers global `JwtAuthGuard`, `ScopeResolverGuard`, and `PermissionsGuard`.

### Current summary shape

`GET /api/v1/dashboard/summary` returns:

- `generatedAt`
- `school`
- `academicContext`
- `cards`
- `alertsPreview`
- `deferred`

Current summary cards include admissions, students, academics, attendance, grades, homework, behavior, reinforcement, and communication. The presenter returns shaped DTOs and excludes `schoolId`, `organizationId`, raw Prisma payloads, and internal tenant fields.

### Current alerts shape

`GET /api/v1/dashboard/alerts` returns:

- `generatedAt`
- `alerts`
- `summary`
- `deferred`

Alert query controls:

- `source`
- `severity`
- `limit`
- `includeZeroCount`

Alert sources are admissions, academics, attendance, grades, homework, behavior, reinforcement, communication, and settings. Alerts are computed at read time from source-domain counts and settings readiness. There is no persisted alert table or alert lifecycle state.

### Current activity feed shape

`GET /api/v1/dashboard/activity-feed` returns:

- `generatedAt`
- `items`
- `pageInfo`
- `filters`
- `deferred`

Activity feed query controls:

- `source`
- `eventType`
- `actorType`
- `dateFrom`
- `dateTo`
- `limit`
- `cursor`

The feed is backed by `AuditLog`, filtered explicitly by current `schoolId` and `AuditOutcome.SUCCESS`, then mapped into safe activity DTOs.

### Current tests

Current dashboard test coverage verifies:

- Exact route inventory.
- Permission denial for actors without the required Dashboard permission.
- Stable contracts for summary, alerts, and activity feed.
- Query validation for alerts and activity feed.
- Minimal-data stable responses.
- Presenter exclusion of tenant fields.
- School A cannot see school B alert/activity data.
- Deferred lifecycle routes remain absent.

### Current security posture

- `requireDashboardScope()` requires authenticated actor and active school membership.
- Source-domain summary and alert reads use `this.prisma.scoped`, so school-scoped models receive automatic `schoolId` injection and soft-delete filtering through the Prisma extension.
- `AuditLog` is intentionally excluded from automatic school scoping, so `DashboardActivityFeedRepository` explicitly filters by `schoolId`.
- Presenters shape safe DTOs and prevent raw Prisma row leakage.
- Dashboard routes do not accept `schoolId` or `organizationId` query/body overrides.

### Current intentional deferrals

- Command center.
- Widgets.
- Internal BI-style analytics/catalogs/charts.
- Module dashboard pages.
- LightModeDropdown.
- Personal dashboard todos.
- Weather provider adapter.
- Planner integration.
- Persisted alert lifecycle.
- Dashboard read/unread state.
- Realtime dashboard refresh signals.
- Analytics builder.
- Dashboard custom layout storage.

## 5. Current Data Source Inventory

| Domain | Current dashboard coverage | Available source models | Available routes/read models | Potential dashboard KPIs | Potential charts | Known limitations | Security/no-leak concerns |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Admissions | Summary card counts and computed alerts for leads, open/submitted/accepted applications, pending tests/interviews, and recent decisions. | `Lead`, `Application`, `PlacementTest`, `Interview`, `AdmissionDecision`, `AdmissionWorkflowPolicy`. | `/api/v1/admissions/leads`, `/api/v1/admissions/applications`, `/api/v1/admissions/tests`, `/api/v1/admissions/interviews`, `/api/v1/admissions/decisions`, `/api/v1/admissions/workflow-policy`. | Funnel counts, lead conversion, open applications, decision backlog, pending test/interview workload. | Funnel, applications over time, status distribution, source mix, decision trend. | Current dashboard has counts, not trend series or conversion cohorts. | Do not expose applicant PII, raw IDs, cross-school application existence, or deleted applications. |
| Students | Summary card counts for active students, active enrollments, guardians, recent enrollments, withdrawals. | `Student`, `Guardian`, `StudentGuardian`, `Enrollment`, student documents/medical/notes/profile correction models. | `/api/v1/students-guardians/students`, `/api/v1/students-guardians/enrollments`, `/api/v1/students-guardians/guardians`, timeline/document/medical endpoints. | Active students, enrollment growth, withdrawals, guardian coverage, missing documents. | Enrollment growth, withdrawal trend, guardian coverage donut, grade/class distribution. | Existing summary is school-wide; no drilldown-safe segmentation yet. | Avoid PII overexposure, raw student/guardian IDs unless contract-approved, and cross-school guessed IDs. |
| Academics | Summary and alerts for active academic year/term, structures, subjects, rooms, teacher allocations, active curricula/lesson plans, timetable entries/publications, draft timetable/lesson plans. | `AcademicYear`, `Term`, `Stage`, `Grade`, `Section`, `Classroom`, `Subject`, `SubjectAllocation`, `TeacherSubjectAllocation`, `TimetableEntry`, `TimetablePublication`, `Curriculum`, `LessonPlan`, `AcademicCalendarEvent`. | `/api/v1/academics/overview`, structure, subjects, subject allocations, teacher allocations, timetable, curriculum, lesson plans, calendar events, rooms. | Structure readiness, allocation coverage, timetable publication readiness, curriculum/lesson plan activation. | Readiness matrix, coverage bars, timetable status, calendar event density. | Current dashboard has count snapshots, not coverage denominators for every readiness metric. | Academic filters must be same-school scoped; IDs in query filters must not leak cross-school existence. |
| Attendance | Summary and alerts for today sessions, submitted/draft sessions, absent/late entries, pending excuses. | `AttendanceSession`, `AttendanceEntry`, `AttendanceExcuseRequest`, policies and excuse attachments/sessions. | `/api/v1/attendance/roll-call`, `/api/v1/attendance/reports/summary`, `/daily-trend`, `/scope-breakdown`, `/derived-daily-absences`, absences, excuse requests, policies. | Attendance rate, absence/late rates, pending sessions, pending excuses, risk classrooms. | Daily attendance trend, stacked present/absent/late bars, absence heatmap, scope breakdown. | Dashboard summary uses same-day counts; report endpoints already expose richer patterns but are not composed into Dashboard V2 yet. | Attendance data is sensitive student operational data; drilldowns must avoid student identity unless authorized. |
| Grades | Summary and alerts for assessments by status, grade items, pending submissions, pending answer reviews. | `GradeAssessment`, `GradeSubmission`, `GradeSubmissionAnswer`, `GradeItem`, grade rules/questions/options. | `/api/v1/grades/bootstrap`, `/overview`, `/analytics/summary`, `/analytics/distribution`, assessments, submissions, review, gradebook, student snapshots. | Assessment status, pending review load, gradebook completion, distribution readiness. | Assessment status donut, score distribution, review backlog trend, completion bars. | Existing dashboard does not aggregate grade distribution or student-level risk. | Avoid exposing individual scores or student IDs in overview analytics without approved drilldown contract. |
| Homework | Summary and alerts for assignment statuses, submissions waiting review, reviewed submissions, grade-sync link status, past-due missing submissions. | `HomeworkAssignment`, `HomeworkTarget`, `HomeworkSubmission`, homework answers/questions/attachments. | `/api/v1/homework/assignments`, submissions, submission content, attachments, questions, grade-sync, targets. | Assignment status, submission review backlog, missing submissions, grade sync readiness. | Status distribution, review trend, overdue/missing trend, grade-sync coverage. | Current dashboard does not expose time-series or teacher/classroom segmentation. | Avoid raw attachments/storage keys and student-level missing submission leaks. |
| Behavior | Summary and alerts for recent records, pending reviews, positive/negative records. | `BehaviorCategory`, `BehaviorRecord`, `BehaviorPointLedger`. | `/api/v1/behavior/overview`, records, review queue, student summary, classroom summary, categories. | Positive vs negative ratio, pending review count, records by category/severity. | Positive/negative trend, category bars, severity distribution, classroom risk table. | Existing summary is high-level only. | Behavior records are sensitive; do not expose student identities or disciplinary details in aggregate views. |
| Reinforcement | Summary and alerts for active tasks, pending reviews, completed assignments, recent XP ledger entries, pending rewards, overdue tasks. | `ReinforcementTask`, `ReinforcementAssignment`, `ReinforcementSubmission`, `XpLedger`, `RewardCatalogItem`, `RewardRedemption`, hero journey models. | `/api/v1/reinforcement/overview`, tasks, reviews, XP summary/ledger, rewards dashboards/catalog/redemptions, hero dashboards. | XP activity, task completion, review backlog, reward redemption status. | XP trend, task completion bars, reward redemption funnel, hero progress cards. | Current dashboard only uses selected counts and does not compose hero journey analytics. | Avoid exposing per-student XP/behavior economy data without approved scope. |
| Communication | Summary and alerts for active announcements, recent messages, active conversations, pending moderation reports, announcements expiring soon. | `CommunicationAnnouncement`, `CommunicationConversation`, `CommunicationMessage`, `CommunicationMessageReport`, notification/delivery models, policy. | `/api/v1/communication/admin/overview`, announcements, conversations, messages, notifications, safety/moderation, policies. | Message volume, active conversations, announcement reach, moderation backlog, notification health. | Messages sent trend, announcement status, moderation queue, delivery health table. | Current dashboard does not aggregate notification delivery health yet. | Do not expose message bodies, private participants, raw moderation content, or device tokens. |
| Settings | Alerts for login identity and email connection readiness. Not currently in summary cards. | `SchoolProfile`, `SchoolLoginSettings`, `SchoolEmailConnection`, security, branding, roles/users/permissions, email templates/deliveries. | `/api/v1/settings/overview`, branding, security, users, roles, permissions, login identity, email connection/templates/deliveries/campaigns. | Login identity readiness, email connection readiness, notification/email delivery readiness, user invitation health. | Readiness checklist, delivery trend, credential setup progress. | Current dashboard has only readiness alerts, no settings module card/page. | Do not expose SMTP secrets, API keys, encrypted secrets, or credential delivery internals. |
| Dismissal / Smart Pickup | No current Dashboard coverage. Current code supports operational dismissal data and routes. | `DismissalSettings`, `DismissalGate`, `DismissalStaffAssignment`, `DismissalRequest`, `DismissalRequestEvent`, `AppDeviceToken`. | `/api/v1/dismissal/profile`, settings, gates, staff assignments, active/history requests, waiting students, notifications. | Pickup request status, waiting count, gate readiness, staff coverage, completion/escalation load. | Request status funnel, average completion time, gate load table, notification health. | Not part of current Dashboard module and advanced smart pickup remains out of V1 scope. Treat as future/optional. | Highly sensitive location/pickup data; never expose parent coordinates, pickup codes, token hashes, device tokens, or delegate internals. |
| Platform Admin | No current school Dashboard coverage. Separate platform-admin surface exists. | `Organization`, `School`, `SchoolEntitlement`, `SchoolFeatureControl`. | `/api/v1/platform-admin/overview`, organizations, schools, entitlements, features. | Organization/school counts, activation status, entitlement/feature readiness. | Platform operational cards, school status distribution, feature adoption. | Platform admin has a different scope and should not be mixed into school Dashboard V2 by default. | Platform routes require platform actor context; school dashboard must not expose cross-school/platform data. |

## 6. Dashboard V2 Product Goal

Target product: **Dashboard Command Center V2**.

The backend should evolve from the current foundation into a professional internal command center that provides:

- Command center overview.
- Professional KPI cards.
- Widget registry and widget detail contracts.
- Charts and graphs through Internal BI-style Dashboard Analytics.
- Module dashboard pages for school operations.
- Weather/time/planner dropdown.
- Personal dashboard todos.
- Future alert lifecycle.
- Future realtime refresh signals.
- Performance, caching, and observability strategy.

Dashboard remains a composition/read-model layer. Source modules remain the source of truth. Dashboard must not mutate source-domain state. Dashboard-owned persistence is allowed only for dashboard-native entities such as personal dashboard todos, widget preferences, saved layouts, or alert lifecycle state if explicitly approved in a future runtime sprint.

## 7. Final Route Map Proposal

### Existing stable routes

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/alerts`
- `GET /api/v1/dashboard/activity-feed`

### Command center

- `GET /api/v1/dashboard/command-center`

### Widgets

- `GET /api/v1/dashboard/widgets`
- `GET /api/v1/dashboard/widgets/:widgetKey`

### Internal BI-style analytics

- `GET /api/v1/dashboard/analytics/catalog`
- `GET /api/v1/dashboard/analytics/charts`
- `GET /api/v1/dashboard/analytics/charts/:chartKey`

### Module dashboard pages

- `GET /api/v1/dashboard/modules/admissions`
- `GET /api/v1/dashboard/modules/students`
- `GET /api/v1/dashboard/modules/academics`
- `GET /api/v1/dashboard/modules/attendance`
- `GET /api/v1/dashboard/modules/grades`
- `GET /api/v1/dashboard/modules/homework`
- `GET /api/v1/dashboard/modules/behavior`
- `GET /api/v1/dashboard/modules/reinforcement`
- `GET /api/v1/dashboard/modules/communication`
- `GET /api/v1/dashboard/modules/settings`

Dismissal should be future/optional, not part of the first Dashboard module pages:

- Future optional: `GET /api/v1/dashboard/modules/dismissal`

Platform admin should remain a separate surface:

- Keep platform operational data under `/api/v1/platform-admin/*`.
- Do not add `GET /api/v1/dashboard/modules/platform-admin` for school Dashboard V2.

### LightModeDropdown

- `GET /api/v1/dashboard/light-mode-dropdown`
- `GET /api/v1/dashboard/light-mode-dropdown/todos`
- `POST /api/v1/dashboard/light-mode-dropdown/todos`
- `PATCH /api/v1/dashboard/light-mode-dropdown/todos/:todoId`
- `DELETE /api/v1/dashboard/light-mode-dropdown/todos/:todoId`

### Future alert lifecycle

Future only:

- `POST /api/v1/dashboard/alerts/:alertKey/acknowledge`
- `POST /api/v1/dashboard/alerts/:alertKey/dismiss`
- `POST /api/v1/dashboard/alerts/:alertKey/snooze`

### Future realtime signals

No REST implementation in 0A. Proposed socket/invalidation event names:

- `dashboard.command_center.updated`
- `dashboard.analytics.updated`
- `dashboard.alerts.updated`
- `dashboard.activity_feed.updated`
- `dashboard.todo.created`
- `dashboard.todo.updated`
- `dashboard.todo.deleted`

## 8. Command Center Contract Proposal

Route:

```text
GET /api/v1/dashboard/command-center
```

Proposed response shape:

```json
{
  "generatedAt": "2026-07-09T12:00:00.000Z",
  "school": {
    "name": "Moazez Academy",
    "timezone": "Africa/Cairo",
    "locale": "en"
  },
  "academicContext": {
    "academicYear": { "id": "contract-approved-year-id", "name": "2026/2027" },
    "term": { "id": "contract-approved-term-id", "name": "Term 1" }
  },
  "operator": {
    "displayName": "School Admin",
    "userType": "school_user"
  },
  "today": {
    "date": "2026-07-09",
    "dayOfWeek": "Thursday",
    "timezone": "Africa/Cairo"
  },
  "quickStats": [],
  "operationalHealth": [],
  "moduleReadiness": [],
  "topRisks": [],
  "topActions": [],
  "alertsPreview": [],
  "activityPreview": [],
  "meta": {
    "source": "dashboard_command_center",
    "version": "v2",
    "dataFreshness": "live"
  }
}
```

Rules:

- No `schoolId`, `organizationId`, `membershipId`, `roleId`, raw actor IDs, raw Prisma rows, or internal tenant fields.
- Academic context IDs may be returned only when contract-approved and needed by frontend filters/actions.
- `operator` should avoid exposing raw user IDs by default.
- `topActions` must use safe action targets, not arbitrary backend routes.
- Empty states must preserve the response shape with empty arrays and clear metadata.

## 9. Widget Registry Contract Proposal

Common widget fields:

- `widgetKey`: stable string key.
- `type`: one of the approved widget types.
- `title`: display label.
- `subtitle`: optional context.
- `iconKey`: semantic icon key mapped by frontend.
- `tone`: `neutral`, `info`, `success`, `warning`, `critical`.
- `data`: type-specific payload.
- `actions`: optional safe action targets.
- `emptyState`: object with title, optional description, and optional action.
- `meta`: generated time, source, and freshness hints.

Safe action target shape:

```json
{
  "label": "Review absences",
  "target": "/attendance/absences",
  "kind": "frontend-route"
}
```

Widget type contracts:

| Type | Required fields | Optional fields | Empty-state behavior |
| --- | --- | --- | --- |
| `stat-card` | `value`, `label` | `delta`, `unit`, `trend`, `comparisonLabel` | Return `value: 0` plus empty-state when source data is absent. |
| `progress-card` | `value`, `max`, `percent` | `segments`, `targetLabel` | Return `percent: 0`; do not omit the card. |
| `risk-card` | `riskLevel`, `count`, `items` | `threshold`, `explanation` | Return zero count and no risk items. |
| `action-card` | `message`, `action` | `secondaryAction`, `dueAt` | Return a completed/empty state when no action is needed. |
| `mini-chart-card` | `chartType`, `series` | `xAxis`, `yAxis`, `legend` | Return empty `series` with `emptyState`. |
| `timeline-card` | `items` | `nextCursor`, `hasMore` | Return `items: []` and stable pagination metadata. |
| `calendar-card` | `date`, `events` | `eventDates`, `range` | Return current date with empty events. |
| `todo-card` | `items` | `summary`, `date` | Return empty todo list and add action if manage permission exists. |
| `weather-card` | `current`, `forecast` | `highlights`, `cities` | Return unavailable state if provider/location is unavailable. |
| `table-card` | `columns`, `rows` | `sort`, `nextCursor`, `totals` | Return empty rows and preserve column definitions. |

Icon strategy:

- Backend returns semantic `iconKey` values only.
- Recommended keys: `sun`, `cloud`, `cloud-rain`, `cloud-snow`, `wind`, `droplets`, `sunrise`, `sunset`, `eye`, `gauge`, `thermometer`.
- Frontend maps `iconKey` to `lucide-react`.

Tone strategy:

- `critical`: immediate operational risk.
- `warning`: backlog or degraded readiness.
- `info`: informational signal.
- `success`: healthy/readiness complete.
- `neutral`: ordinary state.

## 10. Internal BI-style Analytics Contract

Routes:

- `GET /api/v1/dashboard/analytics/catalog`
- `GET /api/v1/dashboard/analytics/charts`
- `GET /api/v1/dashboard/analytics/charts/:chartKey`

Catalog components:

- Chart catalog: available charts, supported filters, chart type, source module, default range, required permissions.
- Metric catalog: stable metric keys, definitions, numerator/denominator rules, freshness, source models.
- KPI catalog: curated KPI cards with metric dependencies and display metadata.

Supported chart types:

- `line`
- `bar`
- `stacked-bar`
- `area`
- `donut`
- `pie`
- `funnel`
- `heatmap`
- `radial-progress`
- `table`
- `timeline`

Proposed query params:

- `range=7d|30d|90d|term|academic_year|custom`
- `granularity=day|week|month`
- `source=admissions|students|academics|attendance|grades|homework|behavior|reinforcement|communication|settings`
- `dateFrom=YYYY-MM-DD`
- `dateTo=YYYY-MM-DD`
- `academicYearId`
- `termId`
- `gradeId`
- `sectionId`
- `classroomId`

Series response shape:

```json
{
  "generatedAt": "2026-07-09T12:00:00.000Z",
  "chart": {
    "chartKey": "attendance.daily_trend",
    "title": "Daily attendance trend",
    "type": "line",
    "source": "attendance"
  },
  "filters": {
    "range": "30d",
    "granularity": "day",
    "dateFrom": "2026-06-10",
    "dateTo": "2026-07-09"
  },
  "series": [
    {
      "key": "present",
      "label": "Present",
      "points": [
        {
          "x": "2026-07-09",
          "y": 120,
          "metadata": {
            "drilldown": {
              "source": "attendance",
              "filters": {
                "date": "2026-07-09"
              }
            }
          }
        }
      ]
    }
  ],
  "summary": {},
  "emptyState": null,
  "meta": {
    "freshness": "live",
    "schoolScoped": true
  }
}
```

Point response rules:

- `x` is ISO date, timestamp, label, or bucket key depending on chart type.
- `y` is numeric for charts that require numeric values.
- `label` and `value` may be used for pie/donut/table shapes.
- `metadata.drilldown` must be safe and contain only approved filter values.

Validation and no-leak rules:

- Query filters must be DTO-validated.
- `dateFrom` and `dateTo` required when `range=custom`.
- `dateFrom <= dateTo`.
- Academic filters must be same-school scoped.
- Invalid or cross-school filter IDs should return 404 where existence leakage is possible.
- No route may leak whether cross-school resources exist.
- Raw Prisma rows must never be returned.

Empty-state behavior:

- Preserve chart metadata and filter echo.
- Return empty `series` or zero-value points as appropriate.
- Include an `emptyState` object with stable machine-readable reason such as `no_data`, `not_configured`, or `filter_out_of_range`.

## 11. Proposed Analytics Packs

### Admissions / Students

- Admissions funnel.
- Applications by status.
- Applications over time.
- Lead conversion rate.
- Accepted/rejected/waitlisted trends.
- Enrollment growth.
- Withdrawal trend.
- Guardian coverage.

### Attendance

- Daily attendance trend.
- Present/absent/late counts.
- Absence rate.
- Late rate.
- Pending sessions.
- Excuses pending/approved/rejected.
- Top risk classrooms.

### Academics

- Academic structure readiness.
- Subject allocation coverage.
- Teacher allocation coverage.
- Timetable publication status.
- Curriculum activation coverage.
- Lesson-plan activation coverage.
- Calendar event density.

### Grades / Homework

- Assessment status distribution.
- Pending submissions.
- Pending answer reviews.
- Gradebook completion indicators.
- Homework status distribution.
- Homework submission review trend.
- Grade sync coverage.

### Behavior / Reinforcement

- Positive vs negative behavior trend.
- Behavior pending review.
- Behavior records by category/type.
- XP activity trend.
- Task completion trend.
- Reward redemption status.

### Communication / Settings

- Active announcements.
- Messages sent trend.
- Active conversations.
- Moderation queue.
- Email connection readiness.
- Login identity readiness.
- Notification readiness.

### Dismissal / Smart Pickup

Current code supports dismissal settings, gates, staff assignments, active/history requests, waiting students, notifications, request events, and push token infrastructure. However, dismissal is not covered by the current Dashboard module, and advanced smart pickup is outside V1 scope.

Recommended handling:

- Mark dismissal analytics as future/optional.
- Do not include dismissal in first Dashboard Analytics packs unless explicitly approved.

Future pack candidates:

- Pickup request status.
- Average completion time.
- Gate readiness.
- Staff assignment coverage.
- Notification delivery health.

## 12. LightModeDropdown Backend Contract Proposal

Correct route:

```text
GET /api/v1/dashboard/light-mode-dropdown?locale=en&timezone=Africa/Cairo&units=metric
```

Rules:

- Do not accept `schoolId`.
- Resolve school from authenticated request context and active school membership.
- Use school profile timezone/location when query timezone is absent.
- Return `iconKey`, not React components.
- Forecast `high` and `low` must be numbers.
- Planner `eventDates` must use ISO `YYYY-MM-DD`.
- Todos must have stable IDs.

Proposed response shape:

```json
{
  "weather": {
    "location": "Cairo, Egypt",
    "timezone": "Africa/Cairo",
    "units": "metric",
    "current": {
      "temperature": 31,
      "feelsLike": 33,
      "condition": "Sunny",
      "iconKey": "sun",
      "observedAt": "2026-07-09T09:00:00.000Z"
    }
  },
  "hints": [
    {
      "key": "hydrate",
      "text": "Warm day expected",
      "iconKey": "thermometer",
      "tone": "info"
    }
  ],
  "highlights": [
    { "key": "wind", "label": "Wind", "value": 10, "unit": "km/h", "iconKey": "wind" },
    { "key": "humidity", "label": "Humidity", "value": 42, "unit": "%", "iconKey": "droplets" },
    { "key": "visibility", "label": "Visibility", "value": 10, "unit": "km", "iconKey": "eye" }
  ],
  "cities": [
    {
      "city": "Alexandria",
      "country": "Egypt",
      "temperature": 28,
      "condition": "Cloudy",
      "iconKey": "cloud"
    }
  ],
  "forecast": [
    {
      "date": "2026-07-09",
      "label": "Today",
      "high": 34,
      "low": 24,
      "condition": "Sunny",
      "iconKey": "sun"
    }
  ],
  "planner": {
    "date": "2026-07-09",
    "timezone": "Africa/Cairo",
    "eventDates": ["2026-07-09"],
    "events": []
  },
  "todos": [
    {
      "id": "stable-todo-id",
      "title": "Review attendance exceptions",
      "description": null,
      "priority": "medium",
      "date": "2026-07-09",
      "timeMinutes": null,
      "completed": false
    }
  ],
  "meta": {
    "generatedAt": "2026-07-09T09:00:00.000Z",
    "weatherStatus": "available",
    "plannerPhase": "todos"
  }
}
```

Error cases:

- `400 invalid query`: invalid locale/timezone/units/date.
- `401 unauthenticated`: no valid actor.
- `403 forbidden`: actor lacks dashboard dropdown permission or active school scope.
- `404 school profile/location unavailable`: location is required and cannot be resolved.
- `502 weather provider failed`: upstream provider error.
- `503 weather temporarily unavailable`: cache/provider unavailable.

## 13. Dashboard Todos Design

Recommended design:

- Todos are personal to the current dashboard user.
- Todos are school-scoped.
- Todos include `organizationId` for tenant hierarchy and reporting consistency.
- Todos are soft-deletable.
- Todos are not shared by default.
- Future shared/school-wide todos can be an explicit extension.

Future Prisma model proposal only:

```prisma
model DashboardTodo {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  schoolId       String    @map("school_id") @db.Uuid
  ownerUserId    String    @map("owner_user_id") @db.Uuid
  title          String
  description    String?
  priority       DashboardTodoPriority @default(MEDIUM)
  date           DateTime  @db.Date
  timeMinutes    Int?      @map("time_minutes")
  completed      Boolean   @default(false)
  completedAt    DateTime? @map("completed_at")
  deletedAt      DateTime? @map("deleted_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@index([schoolId, ownerUserId, date])
  @@index([schoolId, ownerUserId, completed])
  @@index([deletedAt])
  @@map("dashboard_todos")
}

enum DashboardTodoPriority {
  LOW
  MEDIUM
  HIGH
}
```

API routes:

- `GET /api/v1/dashboard/light-mode-dropdown/todos?date=YYYY-MM-DD`
- `POST /api/v1/dashboard/light-mode-dropdown/todos`
- `PATCH /api/v1/dashboard/light-mode-dropdown/todos/:todoId`
- `DELETE /api/v1/dashboard/light-mode-dropdown/todos/:todoId`

Security rules:

- Resolve `organizationId`, `schoolId`, and `ownerUserId` from request context.
- Never accept owner, school, or organization overrides in body/query.
- Filter by `ownerUserId`, `schoolId`, and `deletedAt: null`.
- Return 404 for missing/out-of-scope todos.
- Audit create/update/delete only if product treats todos as sensitive operational actions.

## 14. Weather Provider Design

Provider abstraction:

- Create a future weather adapter interface instead of coupling controllers to a vendor.
- Example interface: `getCurrentWeather(location, options)`, `getForecast(location, options)`, `getCityWeather(cities, options)`.
- Do not choose a provider blindly. No weather provider is currently configured in the reviewed repo, so provider selection is a future human/product decision.

School location resolution:

- Prefer `SchoolProfile.latitude` and `SchoolProfile.longitude`.
- Fall back to `SchoolProfile.city` and `SchoolProfile.country`.
- Use `SchoolProfile.formattedAddress` as display context.
- If no usable location exists, return documented 404 or unavailable empty-state depending on product choice.

Timezone, locale, and units:

- Use query `timezone` if valid.
- Otherwise use `SchoolProfile.timezone`.
- Otherwise fall back to deployment default only if explicitly approved.
- Validate `locale`.
- Support `units=metric|imperial` if provider supports it; default to `metric`.

Cache strategy:

- Cache current weather by `schoolId`, normalized location, units, locale for 10-15 minutes.
- Cache forecast by `schoolId`, normalized location, units, locale for 1-3 hours.
- Cache other city summaries by city list hash, units, locale.

Fallback/error policy:

- Serve fresh cache when available.
- Serve stale cache with metadata if provider fails and stale age is acceptable.
- Return 502 when provider fails and no usable cache exists.
- Return 503 for temporary provider unavailability/rate-limit exhaustion.
- Never expose provider keys, raw provider payloads, or internal error details.

Observability:

- Log provider status, duration, cache hit/miss, normalized error class, and request id.
- Do not log provider credentials or raw full response bodies.
- Track provider call count, latency, failures, cache hit ratio, and rate-limit events.

Rate-limit protection:

- Use Redis cache and per-school throttles.
- Avoid provider calls on every dropdown open.
- Consider background refresh after initial runtime implementation.

## 15. Planner Integration Design

Phase 1:

- Dashboard todos only.
- Planner events are generated from personal `DashboardTodo` rows.

Phase 2:

- Add `AcademicCalendarEvent` dates.
- Use `eventDates` as `YYYY-MM-DD`.
- Scope by current school and active academic context.

Phase 3:

- Cross-module planner items:
  - Attendance sessions.
  - Placement tests/interviews.
  - Homework due dates.
  - Assessments/exams.
  - Lesson-plan milestones.

Event item shape:

```json
{
  "eventId": "calendar:contract-safe-id",
  "source": "academic_calendar",
  "title": "Midterm exam week",
  "date": "2026-07-09",
  "startTime": null,
  "endTime": null,
  "allDay": true,
  "tone": "info",
  "iconKey": "calendar",
  "action": {
    "label": "Open calendar",
    "target": "/academics/calendar",
    "kind": "frontend-route"
  }
}
```

No-leak rules:

- Cross-module planner items must be same-school scoped.
- Do not expose student-specific details in a school-admin dropdown unless explicitly authorized.
- Do not leak hidden/deleted/private records.
- Do not expose raw IDs unless contract-approved for drilldown.

## 16. Alert Lifecycle Future Design

Future lifecycle actions:

- `acknowledge`
- `dismiss`
- `snooze`
- `read/unread`

Principles:

- Lifecycle state is per user.
- Computed alert keys remain stable and derive from source-domain signals.
- Lifecycle state must not mutate source-domain records.
- Dismissed/snoozed alerts should reappear if the computed alert key changes or an optional fingerprint changes.
- Alert lifecycle storage is dashboard-owned metadata and needs an explicit runtime sprint.

Future model proposal only:

```prisma
model DashboardAlertState {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  schoolId       String    @map("school_id") @db.Uuid
  ownerUserId    String    @map("owner_user_id") @db.Uuid
  alertKey       String    @map("alert_key")
  fingerprint    String?
  readAt         DateTime? @map("read_at")
  acknowledgedAt DateTime? @map("acknowledged_at")
  dismissedAt    DateTime? @map("dismissed_at")
  snoozedUntil   DateTime? @map("snoozed_until")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@unique([schoolId, ownerUserId, alertKey, fingerprint])
  @@index([schoolId, ownerUserId])
  @@map("dashboard_alert_states")
}
```

## 17. Realtime Future Design

Proposed socket event names:

- `dashboard.command_center.updated`
- `dashboard.analytics.updated`
- `dashboard.alerts.updated`
- `dashboard.activity_feed.updated`
- `dashboard.todo.created`
- `dashboard.todo.updated`
- `dashboard.todo.deleted`

Rules:

- REST remains the source of truth.
- Realtime events are refresh/invalidation signals only.
- Event payloads should be minimal: event name, school-safe scope, changed resource type, optional keys, generated timestamp.
- Do not send raw Prisma rows over realtime.
- Do not send private provider payloads, storage keys, or tenant internals.

## 18. Permissions Proposal

Current permissions:

- `dashboard.summary.view`
- `dashboard.alerts.view`
- `dashboard.activity_feed.view`

Recommended future permissions:

- `dashboard.command_center.view`
- `dashboard.widgets.view`
- `dashboard.analytics.view`
- `dashboard.todos.view`
- `dashboard.todos.manage`
- `dashboard.alerts.manage`

Be conservative. Do not create one permission per widget/chart unless product needs very granular controls. Future runtime sprints that add permissions will need seed updates for admin-like roles and security tests to ensure teacher/parent/student roles remain excluded unless explicitly approved.

No seed changes are part of 0A.

## 19. Security / Tenancy / No-Leak Rules

Mandatory rules for future Dashboard V2 work:

- Use `requireDashboardScope()` for dashboard school routes.
- Do not accept `schoolId` override from dashboard frontend.
- Use scoped Prisma for school-scoped source modules.
- Explicitly filter `AuditLog` by `schoolId` where needed because `AuditLog` is excluded from automatic school scoping.
- Do not expose `schoolId`, `organizationId`, `membershipId`, or `roleId`.
- Do not expose raw user IDs unless explicitly approved.
- Do not expose deleted rows.
- Do not expose raw Prisma rows.
- Do not expose storage keys.
- Do not leak cross-school existence through errors.
- Dashboard todos must be owner-scoped.
- Weather errors must not expose provider secrets.
- Analytics filters must validate same-school resources.
- Academic filters must return 404 for out-of-scope resources where existence leakage is possible.
- Dismissal data must not expose parent coordinates, pickup codes, token hashes, recipient tokens, device tokens, or raw notification internals.
- Communication analytics must not expose message bodies or private participant identities in aggregate dashboard views.

## 20. Performance / Caching / Observability

Potentially expensive endpoints:

- `GET /api/v1/dashboard/command-center`
- `GET /api/v1/dashboard/widgets`
- `GET /api/v1/dashboard/analytics/charts/:chartKey`
- Module dashboard pages with multiple counts/series.
- LightModeDropdown weather provider calls.

Charts that can likely be computed live first:

- Readiness/status counts.
- Today attendance counts.
- Active announcement/conversation counts.
- Pending review/backlog counts.
- Settings readiness.

Charts that may need cache later:

- Long-range attendance trends.
- Grade distributions.
- Homework review trends.
- Communication message volume.
- Cross-module command center packs.
- Dismissal average completion time if included.

Possible cache keys:

- `dashboard:command-center:{schoolId}:{academicYearId}:{termId}`
- `dashboard:analytics:{schoolId}:{chartKey}:{filterHash}`
- `dashboard:widgets:{schoolId}:{widgetKey}:{filterHash}`
- `dashboard:weather:{schoolId}:{locationHash}:{units}:{locale}`

Observability:

- Log module, action, generatedAt, duration, chart/widget key, source, cache hit/miss, and normalized error class.
- Do not log PII, provider secrets, raw query payloads with sensitive IDs, storage keys, or raw provider responses.
- Track metrics for response duration, DB query count/duration, cache hit ratio, weather provider failures, and validation failures.

No caching or observability runtime changes are part of 0A.

## 21. Testing Strategy for Future Sprints

Future runtime sprints should add:

- Unit tests for presenters/use cases.
- E2E route inventory.
- E2E happy paths.
- Security tenancy tests.
- Permission denial tests.
- Cross-school filter denial.
- No-leak response tests.
- Soft-delete exclusion tests.
- Weather provider failure tests.
- Todo owner isolation tests.
- Analytics query validation tests.
- Minimal-data empty-state tests.
- Alert lifecycle owner isolation tests if lifecycle is added.
- Realtime invalidation event tests if realtime is added.

## 22. Sprint Roadmap

Recommended execution sequence:

1. `DASHBOARD-COMMAND-CENTER-0A` - Reality / Contract Audit.
2. `DASHBOARD-COMMAND-CENTER-1A` - Command Center API Foundation.
3. `DASHBOARD-WIDGETS-1A` - Widgets Registry.
4. `DASHBOARD-ANALYTICS-1A` - Internal BI-style Analytics Contract / Catalog.
5. `DASHBOARD-ANALYTICS-1B` - Admissions / Students Analytics Pack.
6. `DASHBOARD-ANALYTICS-1C` - Attendance Analytics Pack.
7. `DASHBOARD-ANALYTICS-1D` - Academics Analytics Pack.
8. `DASHBOARD-ANALYTICS-1E` - Grades / Homework Analytics Pack.
9. `DASHBOARD-ANALYTICS-1F` - Behavior / Reinforcement / Communication Analytics Pack.
10. `DASHBOARD-MODULE-PAGES-1A` - Module Dashboard Pages.
11. `DASHBOARD-LIGHT-MODE-DROPDOWN-1A` - LightModeDropdown Contract / Read Model.
12. `DASHBOARD-TODOS-1A` - Dashboard Todos Persistence.
13. `DASHBOARD-WEATHER-1A` - Weather Provider Adapter.
14. `DASHBOARD-PLANNER-1A` - Planner Calendar Integration.
15. `DASHBOARD-ALERT-LIFECYCLE-1A` - Alert Lifecycle Audit.
16. `DASHBOARD-ALERT-LIFECYCLE-1B` - Alert Lifecycle Runtime.
17. `DASHBOARD-REALTIME-1A` - Realtime Refresh Signals.
18. `DASHBOARD-PERFORMANCE-1A` - Performance / Cache / Security Sweep.
19. `DASHBOARD-COMMAND-CENTER-FINAL` - Final Closeout.

Audit evidence supports keeping `DASHBOARD-COMMAND-CENTER-1A` as the next runtime sprint. The current foundation has the right summary/alerts/activity primitives, and the command center can compose them without schema changes.

## 23. Open Questions / Human Decisions

| Question | Recommended default |
| --- | --- |
| Which weather provider should be used? | Defer provider selection to a human/product decision; implement an adapter interface first. |
| Should todos be personal only or shareable later? | Personal only for first runtime; shareable school-wide todos can be a later extension. |
| Should dashboard layouts be customizable in V2 or later? | Later. Start with a server-defined widget registry and stable keys. |
| Which chart library will frontend use, if relevant? | Backend should stay chart-library agnostic and return semantic chart-ready data. |
| Which chart filters are required in the first runtime sprint? | Start with range, granularity, source, dateFrom/dateTo, academicYearId, termId, gradeId, sectionId, classroomId. |
| Should dismissal/smart pickup be included in first dashboard analytics packs? | No. Mark as future/optional because it is sensitive and outside current Dashboard coverage. |
| Should platform admin have a separate dashboard surface? | Yes. Keep platform admin under `/api/v1/platform-admin/*`, separate from school Dashboard. |

These questions do not block the audit.

## 24. Final Recommendation

Recommended next runtime sprint:

```text
DASHBOARD-COMMAND-CENTER-1A
```

Reason: the current Dashboard foundation already exposes school-scoped summary, computed alerts, and audit-backed activity feed. The next safest runtime increment is a read-only command center endpoint that composes existing source-of-truth modules and preserves the current architecture rules.
