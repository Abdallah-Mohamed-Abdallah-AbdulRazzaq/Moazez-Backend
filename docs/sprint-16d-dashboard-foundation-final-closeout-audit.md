# Sprint 16D - Dashboard Foundation Final Closeout Audit

## 1. Purpose and Scope

Sprint 16D is a documentation and audit sprint only. It closes out the backend-native Dashboard foundation delivered across Sprint 16A, Sprint 16B, and Sprint 16C.

This audit documents the final implemented state of:

- Dashboard Summary Foundation.
- Dashboard Alerts Foundation.
- Dashboard Activity Feed Foundation.
- Dashboard permissions and system role posture.
- Dashboard read-only aggregation architecture.
- Dashboard security and tenancy behavior.
- Deferred Dashboard lifecycle, analytics, realtime, and notification work.
- Remaining V1 gaps after Dashboard foundation closeout.

No runtime code, Prisma schema, migrations, tests, package scripts, README, generated files, or project structure files are changed by this sprint. The only intended change is this documentation file: `docs/sprint-16d-dashboard-foundation-final-closeout-audit.md`.

## 2. ADR Interpretation Policy

Dashboard ADR and handoff files under `adr/School-Dashboard/` are product and frontend design intent references. They explain the operational experience school administrators need: summary widgets, alerts, recent activity patterns, cross-domain visibility, and dashboard-style aggregation over admissions, students, academics, attendance, grades, homework, behavior, reinforcement, communication, and settings.

They are not literal backend API contracts for this closeout. They should not be used to rename shipped backend routes, copy frontend-only response shapes verbatim, denormalize storage, or bypass the backend module boundaries defined in `ARCHITECTURE_DECISION.md`, `MODULES.md`, `API_CONTRACT_RULES.md`, and `PRISMA_CONVENTIONS.md`.

The authoritative backend state is the implementation in `src/modules/dashboard/**`, the Nest module wiring in `src/app.module.ts`, permission and role seeds in `prisma/seeds/01-permissions.seed.ts` and `prisma/seeds/02-system-roles.seed.ts`, and the Dashboard E2E/security/unit tests. The backend-native routes are authoritative:

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/alerts`
- `GET /api/v1/dashboard/activity-feed`

## 3. Verified Implementation Baseline

Latest known commit after Sprint 16C:

```text
707b84d docs: update project structure after dashboard activity feed foundation
```

The working tree was clean before this Sprint 16D documentation work began. According to the current project execution history supplied for this closeout, `verify:sprint16c` passed after Sprint 16C. This audit does not claim that full runtime verification was re-run during Sprint 16D unless explicitly listed in the command output section of the agent response.

The implementation baseline was verified from:

- `src/modules/dashboard/**`
- `src/app.module.ts`
- `src/infrastructure/database/school-scope.extension.ts`
- `prisma/schema.prisma`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `test/e2e/dashboard-summary-foundation.e2e-spec.ts`
- `test/e2e/dashboard-alerts-foundation.e2e-spec.ts`
- `test/e2e/dashboard-activity-feed-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard.spec.ts`
- `test/security/tenancy.dashboard-alerts.spec.ts`
- `test/security/tenancy.dashboard-activity-feed.spec.ts`
- `package.json`
- Current architecture, security, V1 scope, API contract, testing, observability, and project structure documents.

## 4. Sprint 16A to 16C Implementation Summary

### Sprint 16A - Dashboard Summary Foundation

Goal: establish the first backend-native school dashboard summary surface as a read-only aggregation over existing source-of-truth modules.

Main files and modules affected:

- `src/modules/dashboard/dashboard.module.ts`
- `src/modules/dashboard/controller/dashboard.controller.ts`
- `src/modules/dashboard/application/get-dashboard-summary.use-case.ts`
- `src/modules/dashboard/infrastructure/dashboard-summary.repository.ts`
- `src/modules/dashboard/presenters/dashboard-summary.presenter.ts`
- `src/modules/dashboard/dto/dashboard-summary.dto.ts`
- `src/modules/dashboard/dashboard-context.ts`
- `src/app.module.ts`

Main route added:

- `GET /api/v1/dashboard/summary`

Main permission added:

- `dashboard.summary.view`

Main tests and verification added:

- Module-local summary presenter/use-case tests under `src/modules/dashboard/tests/`.
- `test/e2e/dashboard-summary-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard.spec.ts`
- `test:e2e:sprint16a`
- `verify:sprint16a`

What became complete:

- A school-scoped dashboard summary contract with generated timestamp, school summary, academic context, cards, computed `alertsPreview`, and deferred markers.
- Read-only card aggregation across admissions, students, academics, attendance, grades, homework, behavior, reinforcement, and communication.
- Presenter-level response shaping that avoids leaking `schoolId`, `organizationId`, raw Prisma payloads, or internal tenant data.

### Sprint 16B - Dashboard Alerts Foundation

Goal: add a backend-native operational alerts surface without introducing persisted alert lifecycle state.

Main files and modules affected:

- `src/modules/dashboard/application/list-dashboard-alerts.use-case.ts`
- `src/modules/dashboard/infrastructure/dashboard-alerts.repository.ts`
- `src/modules/dashboard/presenters/dashboard-alerts.presenter.ts`
- `src/modules/dashboard/dto/dashboard-alerts.dto.ts`
- Existing `DashboardController` and `DashboardModule`.

Main route added:

- `GET /api/v1/dashboard/alerts`

Main permission added:

- `dashboard.alerts.view`

Main tests and verification added:

- Module-local alerts presenter/use-case tests under `src/modules/dashboard/tests/`.
- `test/e2e/dashboard-alerts-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-alerts.spec.ts`
- `test:e2e:sprint16b`
- `verify:sprint16b`

What became complete:

- A computed operational alerts surface derived from current source-domain records.
- Query controls for source, severity, limit, and optional zero-count inclusion.
- Summary counts by severity and source.
- Explicit deferral of persistence, acknowledge, dismiss, and activity-feed lifecycle coupling.

### Sprint 16C - Dashboard Activity Feed Foundation

Goal: add a read-only, school-scoped operational activity feed without adding a dashboard-specific event store.

Main files and modules affected:

- `src/modules/dashboard/application/list-dashboard-activity-feed.use-case.ts`
- `src/modules/dashboard/infrastructure/dashboard-activity-feed.repository.ts`
- `src/modules/dashboard/presenters/dashboard-activity-feed.presenter.ts`
- `src/modules/dashboard/dto/dashboard-activity-feed.dto.ts`
- Existing `DashboardController` and `DashboardModule`.

Main route added:

- `GET /api/v1/dashboard/activity-feed`

Main permission added:

- `dashboard.activity_feed.view`

Main tests and verification added:

- Module-local activity feed presenter/use-case tests under `src/modules/dashboard/tests/`.
- `test/e2e/dashboard-activity-feed-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-activity-feed.spec.ts`
- `test:e2e:sprint16c`
- `verify:sprint16c`

What became complete:

- An audit-backed activity feed over existing `AuditLog` records.
- Source, event type, actor type, date range, cursor, and limit controls.
- Deterministic sorting and stable pagination metadata.
- Explicit deferral of read state, pinning, realtime, analytics-builder, comments, and notification side effects.

## 5. Final Current State: Dashboard Module

`src/modules/dashboard/dashboard.module.ts` wires the Dashboard feature as an app-facing read model module. It imports `AuthModule`, registers `DashboardController`, and provides:

- `DashboardSummaryRepository`
- `DashboardAlertsRepository`
- `DashboardActivityFeedRepository`
- `GetDashboardSummaryUseCase`
- `ListDashboardAlertsUseCase`
- `ListDashboardActivityFeedUseCase`

`src/modules/dashboard/controller/dashboard.controller.ts` is intentionally thin. It declares `@Controller('dashboard')`, relies on the global `/api/v1` prefix, and exposes:

- `getSummary()` with `@RequiredPermissions('dashboard.summary.view')`
- `listAlerts()` with `@RequiredPermissions('dashboard.alerts.view')`
- `listActivityFeed()` with `@RequiredPermissions('dashboard.activity_feed.view')`

The controller contains no business logic and no Prisma access. It delegates to use cases.

`src/modules/dashboard/dashboard-context.ts` centralizes dashboard scope resolution through `requireDashboardScope()`. It reads the request context, requires an authenticated actor and active school membership, and returns the actor, user type, organization, school, and role identifiers needed by dashboard use cases and repositories.

`src/app.module.ts` imports `DashboardModule` in the main module list. The app-level guard stack remains global through `APP_GUARD` providers: `JwtAuthGuard`, `ScopeResolverGuard`, and `PermissionsGuard`.

The final Dashboard source layout is:

- `application/` for use cases and aggregation orchestration.
- `controller/` for HTTP routing only.
- `dto/` for request and response contracts.
- `infrastructure/` for Prisma reads.
- `presenters/` for safe response shaping.
- `tests/` for module-local presenter/use-case coverage.

## 6. Final Current State: Dashboard Summary

Route:

- `GET /api/v1/dashboard/summary`

Permission:

- `dashboard.summary.view`

Implementation:

- `GetDashboardSummaryUseCase` in `src/modules/dashboard/application/get-dashboard-summary.use-case.ts`.
- `DashboardSummaryRepository` in `src/modules/dashboard/infrastructure/dashboard-summary.repository.ts`.
- `presentDashboardSummary` in `src/modules/dashboard/presenters/dashboard-summary.presenter.ts`.
- DTOs in `src/modules/dashboard/dto/dashboard-summary.dto.ts`.

The summary is a read-only school operational aggregation for admin-like users. It uses the active school request context and reads existing source-of-truth domain records instead of writing Dashboard-owned data.

Implemented cards and sections:

- Admissions: leads, open/submitted/accepted applications, pending tests, pending interviews, recent decisions.
- Students: active students, active enrollments, guardians, recent enrollments, withdrawals.
- Academics: active academic years, current academic year/term presence, stages, grades, sections, classrooms, subjects, rooms, allocations, curricula, lesson plans, timetable entries, published timetable publications.
- Attendance: today sessions, submitted sessions, draft sessions, absent and late entries, pending excuses.
- Grades: assessments by state, grade items, pending submissions, pending answer reviews.
- Homework: assignments by state, submissions waiting review, reviewed submissions, grade-sync link status.
- Behavior: recent records, pending reviews, positive and negative records.
- Reinforcement: active tasks, pending reviews, completed assignments, recent XP ledger entries, pending rewards.
- Communication: active announcements, recent messages, active conversations, pending moderation reports.

`alertsPreview` is computed in the summary presenter from summary card counts. It surfaces high-signal admissions, attendance, grades, homework, behavior, reinforcement, and communication issues without storing a separate alert record. It excludes zero-count previews, sorts critical items before warnings, and returns a compact preview list.

The response includes deferred markers:

- `activityFeed: "deferred"` in the 16A summary contract.
- `alertsEngine: "deferred"` in the 16A summary contract.
- `analyticsBuilder: "out_of_scope_v1"`.

After Sprint 16B and 16C, alerts and activity feed exist as separate backend-native routes. The summary response keeps its Sprint 16A deferred fields for backward stability and does not become a lifecycle or analytics endpoint.

Empty-state behavior is stable because repository counts naturally return zero and the presenter preserves the response shape. Tenancy-safe shaping is enforced by returning only school display summary, academic context labels, numeric card data, alert preview fields, and deferred flags.

## 7. Final Current State: Dashboard Alerts

Route:

- `GET /api/v1/dashboard/alerts`

Permission:

- `dashboard.alerts.view`

Implementation:

- `ListDashboardAlertsUseCase` in `src/modules/dashboard/application/list-dashboard-alerts.use-case.ts`.
- `DashboardAlertsRepository` in `src/modules/dashboard/infrastructure/dashboard-alerts.repository.ts`.
- `presentDashboardAlerts` in `src/modules/dashboard/presenters/dashboard-alerts.presenter.ts`.
- DTOs in `src/modules/dashboard/dto/dashboard-alerts.dto.ts`.

The alerts model is computed at read time from source-domain signals. It does not persist dashboard alert rows and does not mutate core module state.

Allowed alert sources:

- `admissions`
- `academics`
- `attendance`
- `grades`
- `homework`
- `behavior`
- `reinforcement`
- `communication`
- `settings`

Allowed severities:

- `info`
- `warning`
- `critical`

Implemented query controls:

- `source`
- `severity`
- `limit`
- `includeZeroCount`

The use case builds a date window, loads signal counts from the repository, builds a fixed set of alert definitions, filters by query controls, sorts deterministically by severity/source/key, and applies a normalized limit. The presenter returns:

- `generatedAt`
- `alerts`
- `summary.total`
- `summary.critical`
- `summary.warning`
- `summary.info`
- `summary.bySource`
- `deferred`

The `deferred` object intentionally reports:

- `persistence: "deferred"`
- `acknowledge: "deferred"`
- `dismiss: "deferred"`
- `activityFeed: "deferred"`

No alert read/unread, acknowledge, dismiss, snooze, lifecycle, notification, realtime, or persisted alert storage was implemented in Sprint 16B.

## 8. Final Current State: Dashboard Activity Feed

Route:

- `GET /api/v1/dashboard/activity-feed`

Permission:

- `dashboard.activity_feed.view`

Implementation:

- `ListDashboardActivityFeedUseCase` in `src/modules/dashboard/application/list-dashboard-activity-feed.use-case.ts`.
- `DashboardActivityFeedRepository` in `src/modules/dashboard/infrastructure/dashboard-activity-feed.repository.ts`.
- `presentDashboardActivityFeed` in `src/modules/dashboard/presenters/dashboard-activity-feed.presenter.ts`.
- DTOs in `src/modules/dashboard/dto/dashboard-activity-feed.dto.ts`.

The selected source strategy is existing `AuditLog` as the primary activity source. This matches the architecture rule that Dashboard should aggregate existing source-of-truth domains and audit/history records where available. No event store, dashboard-specific feed table, schema change, or migration was introduced.

`prisma/schema.prisma` defines `AuditLog` with actor, user type, organization, school, module, action, resource type/id, outcome, and `createdAt`, plus indexes including `[schoolId, createdAt(sort: Desc)]`. `src/infrastructure/database/school-scope.extension.ts` explicitly excludes `AuditLog` from automatic school-scope injection because audit logs are append-only and platform-sensitive. For that reason, `DashboardActivityFeedRepository` explicitly filters audit rows by:

- `schoolId: scope.schoolId`
- `outcome: AuditOutcome.SUCCESS`
- dashboard-allowed audit modules
- optional source, event type, actor type, date range, and cursor filters

This explicit `schoolId` filter is a safe exception to automatic school-scope use because the model is intentionally excluded from the extension. It is also covered by activity feed tenancy tests.

Allowed activity sources:

- `admissions`
- `students`
- `academics`
- `attendance`
- `grades`
- `homework`
- `behavior`
- `reinforcement`
- `communication`
- `settings`

Allowed actor types:

- `system`
- `admin`
- `teacher`
- `student`
- `parent`
- `unknown`

Implemented filters and pagination:

- `source`
- `eventType`
- `actorType`
- `dateFrom`
- `dateTo`
- `limit` with default `20` and max `100`
- `cursor`

The activity feed normalizes audit modules/actions into stable dashboard event types. Examples include admissions application events, student enrollment events, academics curriculum and lesson-plan events, attendance session/excuse events, grade assessment/submission events, homework publish/submit/review/sync events, behavior review events, reinforcement review/reward events, communication announcement/moderation events, and settings/auth/IAM events mapped into `settings.*`.

The use case maps each audit record into:

- `activityId`
- `source`
- `eventType`
- `title`
- `description`
- `actor`
- `subject`
- `occurredAt`

It sorts by `occurredAt` descending and then by stable activity id. The presenter returns `generatedAt`, `items`, `pageInfo`, `filters`, and `deferred`.

The activity feed intentionally does not implement:

- read state
- pinning
- comments
- lifecycle actions
- realtime updates
- notification side effects
- analytics builder

The response presenter avoids exposing `schoolId`, `organizationId`, raw audit payloads, storage internals, JWT/session data, and private tenant identifiers.

## 9. Permissions and System Roles

Dashboard permissions are seeded in `prisma/seeds/01-permissions.seed.ts`:

- `dashboard.summary.view`
- `dashboard.alerts.view`
- `dashboard.activity_feed.view`

System role inheritance is handled in `prisma/seeds/02-system-roles.seed.ts`:

- `platform_super_admin` receives `ALL`.
- `organization_admin` receives `NON_PLATFORM`.
- `school_admin` receives `SCHOOL_LEVEL`.
- `teacher`, `parent`, and `student` use explicit smaller permission arrays and do not include Dashboard permissions.

This means school/admin-like roles receive Dashboard access through the same seed pattern used by the rest of the backend, while teacher, student, and parent roles remain excluded from school-admin dashboard surfaces.

Security tests protect this boundary by reading the permission decorators and seed files:

- `test/security/tenancy.dashboard.spec.ts`
- `test/security/tenancy.dashboard-alerts.spec.ts`
- `test/security/tenancy.dashboard-activity-feed.spec.ts`

These tests assert that Dashboard routes require explicit Dashboard permissions and that teacher, student, and parent system role seeds do not include the Dashboard permissions.

## 10. Security and Tenancy

Dashboard respects the project security model in the following ways:

- School scope is required by `requireDashboardScope()` before use cases load data.
- Routes are protected by `@RequiredPermissions(...)` and the global `PermissionsGuard`.
- Source-domain reads in summary and alerts repositories use `this.prisma.scoped`, allowing the `schoolScope` Prisma extension to inject the active school filter on school-scoped models.
- `DashboardActivityFeedRepository` explicitly filters `AuditLog.schoolId` because `AuditLog` is intentionally excluded from automatic school-scope injection.
- Presenters return shaped DTOs instead of raw Prisma records.
- Responses do not expose `schoolId`, `organizationId`, raw Prisma payloads, raw storage keys, JWT/session data, or private tenant identifiers.
- Dashboard does not write to core modules and does not mutate source-domain state.
- E2E and security tests assert route inventory so deferred lifecycle routes remain absent.
- Teacher, student, and parent role seeds are checked for Dashboard permission exclusion.

Route inventory assertions protect against accidentally adding out-of-scope lifecycle endpoints such as:

- `POST /api/v1/dashboard/activity-feed/:activityId/read`
- `POST /api/v1/dashboard/activity-feed/:activityId/dismiss`
- `POST /api/v1/dashboard/activity-feed/:activityId/pin`
- `POST /api/v1/dashboard/activity-feed/:activityId/unpin`
- `POST /api/v1/dashboard/alerts/:alertId/read`
- `POST /api/v1/dashboard/alerts/:alertId/dismiss`
- analytics-builder routes

Cross-school leakage is covered by security tests that create separate schools and assert school A cannot observe school B dashboard data or activity.

## 11. Testing and Verification State

Key Dashboard test categories now present:

- Dashboard unit tests under `src/modules/dashboard/tests/`.
- Summary E2E coverage in `test/e2e/dashboard-summary-foundation.e2e-spec.ts`.
- Alerts E2E coverage in `test/e2e/dashboard-alerts-foundation.e2e-spec.ts`.
- Activity feed E2E coverage in `test/e2e/dashboard-activity-feed-foundation.e2e-spec.ts`.
- Dashboard security and tenancy coverage in:
  - `test/security/tenancy.dashboard.spec.ts`
  - `test/security/tenancy.dashboard-alerts.spec.ts`
  - `test/security/tenancy.dashboard-activity-feed.spec.ts`

Relevant package scripts in `package.json`:

- `test:e2e:sprint16a`
- `test:e2e:sprint16b`
- `test:e2e:sprint16c`
- `verify:sprint16a`
- `verify:sprint16b`
- `verify:sprint16c`

`verify:sprint16c` extends the previous Dashboard foundation checks by running `verify:sprint16b`, Prisma validation and generation, build, dashboard unit tests, Dashboard security tests including activity feed, and the Sprint 16C activity feed E2E suite.

No command output is reproduced in this audit unless it was actually run for Sprint 16D. The known baseline is that `verify:sprint16c` passed according to the project execution history supplied for this closeout.

## 12. Intentional Deferrals After Dashboard Foundation

The following are intentionally deferred after the Dashboard foundation:

- Persisted alert lifecycle.
- Alert read/unread state.
- Alert acknowledge/dismiss/snooze.
- Activity feed read state.
- Activity feed pin/unpin.
- Activity feed comments.
- Realtime dashboard updates.
- Notification side effects.
- Analytics builder.
- Dashboard custom widgets.
- Platform-level dashboard.

These are not missing pieces of Sprint 16A-16C. They are future product capabilities and should be scheduled explicitly if needed.

## 13. Remaining V1 Gaps After Dashboard Closeout

| Gap | Current status | Why it matters | Suggested future sprint | Dependencies | Risk level |
| --- | --- | --- | --- | --- | --- |
| Platform Admin Basic | Not yet completed in this Dashboard closeout. | V1 still requires platform/operator control over organizations, schools, activation, and feature governance. | Sprint 17A - Platform Admin Basic Foundation. | IAM roles/permissions, organization and school records, activation/feature model decisions. | High |
| Academic Calendar / Academics Overview | Academic structure, curriculum, lesson plans, and timetable foundations exist, but a closed-out calendar/overview surface is still a gap. | Academic managers need calendar and overview visibility across terms, schedules, plans, and readiness. | Sprint 17B or later after Platform Admin baseline. | Academics structure, timetable, lesson plans, dashboard aggregation patterns. | Medium |
| Applicant Portal Basic | Not completed by Dashboard foundation. | Admissions V1 needs applicant-facing self-service beyond internal school admin workflows. | Future admissions/applicant sprint after Platform Admin. | Admissions applications/documents, auth/session model for applicants, file upload and email flows. | High |
| Smart Pickup Basic | Not completed by Dashboard foundation. | Parent app V1 includes smart pickup basic and safety-sensitive operational flow. | Future parent/smart-pickup sprint after governance and parent auth flows. | Parent onboarding, student/guardian links, location policy, notification strategy. | High |
| Parent onboarding/auth-specific flows | Parent app modules exist, but onboarding/auth-specific closeout remains separate from Dashboard. | Parents need reliable account activation and child-linked access before monitoring/pickup flows are production-ready. | Future parent onboarding sprint. | IAM, guardianship links, email/invite flows, parent app permissions. | Medium |
| Homework notification/XP optional integration | Homework, reinforcement, and grade-sync foundations exist, but optional notification/XP side effects remain deferred. | These integrations can improve engagement but should not destabilize core homework grading flows. | Future integration sprint after notification policy is settled. | Homework reviews, reinforcement XP policy, communication/notification module. | Medium |
| Dashboard advanced analytics/lifecycle extensions | Explicitly deferred by Dashboard foundation. | Useful for richer operations, but not required for the backend-native V1 foundation. | Future Dashboard extension sprint. | Stable Dashboard read models, audit coverage, notification/realtime decisions, possible dedicated storage ADR. | Medium |

## 14. Recommended Next Step

Recommended next sprint:

```text
Sprint 17A - Platform Admin Basic Foundation
```

Platform Admin should be next because V1 scope still includes platform admin basic, and Dashboard foundation is now closed. Platform Admin provides SaaS/operator governance over organizations, schools, activation, and feature controls. It should precede Applicant Portal or Smart Pickup because those features depend on top-level operational governance, tenant activation, and clear platform-level administration boundaries.

## 15. Closeout Decision

Dashboard foundation is closed for V1 backend-native scope after Sprint 16C, covering summary, computed alerts, and audit-backed activity feed, excluding explicitly deferred lifecycle, realtime, notifications, and analytics-builder extensions.

Future Dashboard work should be scheduled as extensions, not as foundation blockers.
