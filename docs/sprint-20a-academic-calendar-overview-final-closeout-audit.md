# Sprint 20A — Academic Calendar + Overview Final Closeout Audit

## 1. Status

Sprint 20A status: COMPLETE

Sprint 20A delivered the V1 school-dashboard foundation for Academic Calendar and Academics Overview:

- Academic Calendar schema foundation.
- Academic Calendar CRUD runtime under Academics.
- Academic Calendar E2E and security coverage.
- Academics Overview read-only aggregation model.
- Academics Overview E2E and security coverage.
- Final closeout audit.

This closeout is documentation-only. It does not authorize or introduce runtime, test, Prisma schema, migration, seed, package, README, generated-file, project-structure, deployment, server, or CORS changes.

## 2. Baseline and Commit Range

Starting baseline before Sprint 20A:

- `037236b docs: finalize sprint 19a applicant document review`

Sprint 20A commit sequence:

- `f954b39 docs: add academic calendar overview contract audit`
- `87fed4d feat: add academic calendar schema foundation`
- `3ef0824 feat: add academic calendar event crud`
- `265804b test: add academic calendar event e2e security coverage`
- `fb301b7 feat: add academics overview read model`
- `604b8ce test: add academics overview e2e security coverage`

Current final baseline:

- `604b8ce test: add academics overview e2e security coverage`

## 3. Scope Delivered

Calendar:

- Added `AcademicCalendarEvent` as the school-scoped calendar event source of truth.
- Added backend-native Calendar CRUD routes under `/api/v1/academics/calendar/events`.
- Added Calendar validation for academic context, scope, date range, list range, and safe list bounds.
- Added Calendar soft-delete behavior and mutation audit logs.

Overview:

- Added `GET /api/v1/academics/overview`.
- Added a read-only aggregation over existing academic structure, subjects, rooms, teacher allocations, curriculum, lesson plans, timetable, and calendar events.
- Added deterministic active-context fallback and safe zero-overview behavior.
- Added setup indicators and explicit deferred markers.

Tests:

- Added Calendar module unit coverage.
- Added Calendar E2E and security coverage.
- Added Overview module unit coverage.
- Added Overview E2E and security coverage.
- Added route inventory assertions for delivered school-dashboard routes and deferred app-facing routes.

Security:

- Added Calendar permissions and permission-gated routes.
- Added Overview permission and permission-gated route.
- Preserved school-scoped Prisma access patterns.
- Covered cross-school isolation, permission denial, app-role denial by default, soft-delete exclusion, and response leakage prevention.

Documentation:

- Added Sprint 20A contract audit.
- Added this final closeout audit.

Sprint 20A did not deliver:

- Teacher App calendar or overview routes.
- Student App calendar or overview routes.
- Parent App calendar or overview routes.
- Advanced analytics.
- Alert lifecycle.
- Dashboard replacement.
- Charts-specific API.
- Notification workflows.

## 4. Calendar Runtime Summary

The implemented Calendar module lives at:

- `src/modules/academics/calendar/**`

Controller path:

- `academics/calendar/events`

The module follows the established Academics architecture:

- Thin controller in `controller/calendar-events.controller.ts`.
- DTO validation in `dto/calendar-event.dto.ts` and `dto/list-calendar-events-query.dto.ts`.
- Application use cases for list, get, create, update, and delete.
- Repository layer in `infrastructure/calendar-events.repository.ts`.
- Presenter layer in `presenters/calendar-event.presenter.ts`.
- No direct Prisma access in the controller.
- No raw Prisma rows returned from the API.
- Safe response mapping that omits tenant, actor, storage, and soft-delete internals.
- Soft-delete lifecycle for delete operations.
- Audit logging for create, update, and delete.

The Calendar module is wired into `src/modules/academics/academics.module.ts` through `CalendarModule`.

## 5. Calendar Schema and Data Model Summary

Model:

- `AcademicCalendarEvent`

Table:

- `academic_calendar_events`

Enums:

- `AcademicCalendarEventType`
  - `HOLIDAY`
  - `EXAM`
  - `ACTIVITY`
  - `OTHER`
- `AcademicCalendarEventScopeType`
  - `SCHOOL`
  - `STAGE`
  - `GRADE`
  - `SECTION`

Core fields:

- `schoolId`
- `academicYearId`
- `termId`
- `title`
- `description`
- `notes`
- `type`
- `scopeType`
- `scopeKey`
- `stageId`
- `gradeId`
- `sectionId`
- `allDay`
- `startDate`
- `endDate`
- `createdByUserId`
- `updatedByUserId`
- `deletedByUserId`
- `createdAt`
- `updatedAt`
- `deletedAt`

Migration:

- `20260613120000_0038_academic_calendar_events`

Database constraints:

- `academic_calendar_events_date_range_check` enforces `start_date <= end_date`.
- `academic_calendar_events_scope_consistency_check` enforces valid combinations for `SCHOOL`, `STAGE`, `GRADE`, and `SECTION` scope storage.

The model is registered in:

- `SCHOOL_SCOPED_MODELS` in `src/infrastructure/database/school-scope.extension.ts`.
- `SOFT_DELETE_MODELS` in `src/infrastructure/database/school-scope.extension.ts`.

## 6. Calendar API Contract

Final Calendar routes:

```text
GET    /api/v1/academics/calendar/events
POST   /api/v1/academics/calendar/events
GET    /api/v1/academics/calendar/events/:eventId
PATCH  /api/v1/academics/calendar/events/:eventId
DELETE /api/v1/academics/calendar/events/:eventId
```

API enum values are lowercase:

- `holiday`
- `exam`
- `activity`
- `other`

Scope response shape:

```json
{ "type": "school", "id": null }
```

Other valid scope types are `stage`, `grade`, and `section`, with `id` set to the selected scope id.

List filters:

- `academicYearId`
- `termId`
- `from`
- `to`
- `type`
- `scopeType`
- `scopeId`
- `limit`
- `cursor`

List behavior:

- Defaults to a safe date window when `from` and `to` are omitted.
- Rejects invalid date windows.
- Enforces a maximum list range of 370 days.
- Uses a bounded limit, defaulting to 50 and capped at 100.
- Returns `items` and `nextCursor`.

Delete behavior:

```json
{ "id": "<eventId>", "deleted": true }
```

Delete is a soft delete. It does not hard-delete calendar events.

## 7. Calendar Permissions and Security Model

Calendar permissions:

- `academics.calendar.view`
- `academics.calendar.manage`

Permission behavior:

- `academics.calendar.view` is required for list and detail.
- `academics.calendar.manage` is required for create, update, and delete.
- Teacher, student, and parent roles are denied by default.
- School-level administrative roles receive Calendar permissions through the existing seed role behavior.
- No platform bypass behavior was added for ordinary Calendar CRUD.
- Cross-school reads and mutations return safe not-found or invalid-scope behavior without leaking tenant existence.

## 8. Calendar Audit Logging

Calendar mutation audit actions:

- `academics.calendar_event.create`
- `academics.calendar_event.update`
- `academics.calendar_event.delete`

Audit metadata is intentionally safe:

- Includes ids, event type, scope type/id, dates, `allDay`, and delete timestamp when relevant.
- Excludes free-text `title`, `description`, and `notes`.
- Excludes PII, secrets, tokens, raw Prisma rows, and storage internals.

## 9. Calendar Test Coverage

Calendar tests:

- Unit: `src/modules/academics/calendar/tests/calendar-events.use-case.spec.ts`
- E2E: `test/e2e/academics-calendar-events.e2e-spec.ts`
- Security: `test/security/tenancy.academics-calendar-events.spec.ts`

Coverage includes:

- Route inventory for Calendar routes.
- Positive assertion that `GET /api/v1/academics/overview` is registered after Sprint 20A-4.
- App-facing Calendar routes remain absent.
- Create, list, detail, update, and delete flows.
- Date validation.
- Scope validation.
- Academic year and term relationship validation.
- Bounded list range and pagination shape.
- Audit metadata safety for mutations.
- Cross-school event isolation.
- Cross-school stage, grade, and section id rejection.
- Permission denial.
- Teacher, student, and parent denied by default.
- Response leakage prevention.
- Soft-delete exclusion from normal reads.

## 10. Academics Overview Runtime Summary

The implemented Overview module lives at:

- `src/modules/academics/overview/**`

Controller path:

- `academics/overview`

Route:

```text
GET /api/v1/academics/overview
```

Runtime behavior:

- Read-only aggregation endpoint.
- No Overview table.
- No Overview schema change or migration.
- No audit logs for this read-only endpoint.
- Repository aggregation uses existing scoped academic data.
- Presenter maps the aggregate into a safe API response.
- No raw Prisma rows are exposed.

The Overview module is wired into `src/modules/academics/academics.module.ts` through `OverviewModule`.

## 11. Academics Overview API Contract

Final Overview route:

```text
GET /api/v1/academics/overview?academicYearId=&termId=
```

Response sections:

- `generatedAt`
- `academicContext`
- `structure`
- `subjects`
- `rooms`
- `teacherAllocation`
- `curriculum`
- `lessonPlans`
- `timetable`
- `calendar`
- `upcomingEvents`
- `setupIndicators`
- `deferred`

Query behavior:

- If both `academicYearId` and `termId` are omitted, the endpoint resolves the active academic year and active term for the current school.
- If only `termId` is provided, the endpoint resolves the academic year from that term.
- If `academicYearId` is provided, it must belong to the current school.
- If `termId` is provided, it must belong to the current school.
- If both are provided, the term must belong to the academic year.
- Invalid, unrelated, or cross-school context returns `academics.overview.invalid_context`.
- If no active academic year exists, the endpoint returns a safe zero overview with null academic context.
- The query does not accept `schoolId` or `organizationId`.

## 12. Academics Overview Permissions and Security Model

Overview permission:

- `academics.overview.view`

Permission behavior:

- Actors without `academics.overview.view` receive `403`.
- Calendar permissions do not grant Overview access.
- Teacher, student, and parent roles are denied by default.
- Cross-school academic year and term ids are isolated.
- No platform bypass behavior was added for ordinary Overview requests.

## 13. Academics Overview Test Coverage

Overview tests:

- Unit: `src/modules/academics/overview/tests/academics-overview.use-case.spec.ts`
- E2E: `test/e2e/academics-overview.e2e-spec.ts`
- Security: `test/security/tenancy.academics-overview.spec.ts`

Coverage includes:

- Route inventory for Overview.
- Calendar route non-regression.
- Dashboard summary route non-regression.
- App-facing Overview routes remain absent.
- Explicit academic year and term success.
- Active context fallback.
- Term-only context.
- Safe zero overview.
- Invalid and cross-school context.
- Response leakage prevention.
- Setup indicators.
- Deferred markers.
- Permission denial.
- Calendar permission does not imply Overview permission.
- Cross-school isolation.
- Teacher, student, and parent denied by default.
- Soft-deleted Calendar events excluded from Overview counts and upcoming events.

## 14. Route Inventory Final State

Final newly delivered school-dashboard routes:

```text
GET    /api/v1/academics/calendar/events
POST   /api/v1/academics/calendar/events
GET    /api/v1/academics/calendar/events/:eventId
PATCH  /api/v1/academics/calendar/events/:eventId
DELETE /api/v1/academics/calendar/events/:eventId
GET    /api/v1/academics/overview
```

Dashboard routes remain unchanged:

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/alerts`
- `GET /api/v1/dashboard/activity-feed`

No app-facing Overview or Calendar routes were added:

- No Teacher App academics overview route.
- No Student App academics overview route.
- No Parent App academics overview route.
- No Teacher App calendar route.
- No Student App calendar route.
- No Parent App calendar route.

Existing Teacher, Student, and Parent schedule routes remain timetable-backed app-facing read surfaces and were not renamed or removed by Sprint 20A.

## 15. Database / Prisma Final State

The only schema change in Sprint 20A was the Calendar model and migration.

Overview did not add schema, migrations, tables, enums, or seed data beyond the already-added permission seed from Sprint 20A-1.

Prisma final state:

- `AcademicCalendarEvent` is included in `prisma/schema.prisma`.
- Calendar enums are included in `prisma/schema.prisma`.
- Migration `20260613120000_0038_academic_calendar_events` creates the database enum types, table, indexes, constraints, and foreign keys.
- `AcademicCalendarEvent` is school-scoped.
- `AcademicCalendarEvent` is soft-deletable.
- Prisma validates successfully.
- Prisma client generation succeeds.
- Generated files should not be committed.

## 16. Seed / Role Final State

Permissions added in `prisma/seeds/01-permissions.seed.ts`:

- `academics.calendar.view`
- `academics.calendar.manage`
- `academics.overview.view`

`prisma/seeds/02-system-roles.seed.ts` was not changed for Sprint 20A.

Role posture:

- School-level administrative roles receive the new permissions through existing `SCHOOL_LEVEL` / `NON_PLATFORM` behavior.
- Teacher, parent, and student explicit permission arrays do not include Calendar or Overview permissions by default.
- Security tests assert app roles are denied by default for the school-dashboard Calendar and Overview surfaces.

## 17. Tenancy and Scope Guarantees

Tenancy guarantees:

- `AcademicCalendarEvent` is registered in `SCHOOL_SCOPED_MODELS`.
- `AcademicCalendarEvent` is registered in `SOFT_DELETE_MODELS`.
- Calendar repositories use scoped Prisma access for tenant-scoped reads and mutations.
- Overview repository aggregation uses scoped Prisma access for school-owned data.
- The public APIs do not accept raw `schoolId` or `organizationId` query parameters.
- Cross-school academic years, terms, events, and scope ids do not leak existence.
- Platform bypass is not used for ordinary Calendar or Overview behavior.

These guarantees follow ADR-0001's application-level tenancy strategy: request context plus Prisma scope extension, with tests covering cross-school access attempts.

## 18. Response Safety and PII / Internal Field Controls

Calendar and Overview responses do not expose:

- `schoolId`
- `organizationId`
- `scopeKey`
- `createdByUserId`
- `updatedByUserId`
- `deletedByUserId`
- `deletedAt`
- Raw Prisma rows

Calendar active responses expose only the API-shaped event contract. Overview upcoming events expose only safe event summary fields.

Response leakage checks are covered by Calendar unit/E2E/security tests and Overview unit/E2E/security tests.

## 19. Dashboard and App-Facing Route Non-Regression

Dashboard remains separate from Academics Overview.

Academics Overview does not replace Dashboard Summary, Dashboard Alerts, or Dashboard Activity Feed. It is an Academics-specific read model for setup and readiness state.

Calendar and Overview are school-dashboard/core Academics routes. Teacher App, Student App, and Parent App versions remain deferred.

Sprint 20A did not modify Dashboard behavior, Teacher App modules, Student App modules, or Parent App modules.

## 20. Verification Commands

Final expected verification command set:

```bash
git status --short
git log --oneline -10
git diff --check
npx prisma validate
npx prisma generate
npm run build
npm run test -- academics --runInBand
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/academics-calendar-events.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.academics-calendar-events.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/academics-overview.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.academics-overview.spec.ts
```

Latest known verification result before closeout:

- Academics unit suite passed: `14 suites / 79 tests`.
- Calendar E2E passed: `8 tests`.
- Calendar security passed: `5 tests`.
- Overview E2E passed: `6 tests`.
- Overview security passed: `6 tests`.
- Prisma validation passed.
- Prisma generation passed.
- Build passed.

## 21. Deferred / Out-of-Scope Items

Deferred items:

- Teacher App calendar routes.
- Student App calendar routes.
- Parent App calendar routes.
- Teacher App overview.
- Student App overview.
- Parent App overview.
- Advanced analytics.
- Alert lifecycle.
- Charts-specific APIs.
- Notifications for calendar events.
- Calendar recurrence.
- Import/export.
- ICS integration.
- Dashboard widget redesign.
- Performance caching or read-model materialization.

## 22. Known Risks / Follow-Up Notes

Known risks and follow-up notes:

- Overview aggregation is read-time and may need caching or materialized summaries later if academic data grows significantly.
- Upcoming events use current time and a limited preview; future app-facing calendar work may need audience-specific scoping rules.
- Calendar recurrence is intentionally not implemented.
- Overview setup indicators are simple readiness booleans, not advanced analytics.
- Teacher, Student, and Parent app experiences remain future work.
- No unresolved Sprint 20A runtime bugs are known at this closeout.

## 23. Final Decision

Final decision: Sprint 20A is complete and accepted for the current V1 backend scope.
