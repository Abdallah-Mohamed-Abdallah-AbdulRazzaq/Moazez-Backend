# Sprint 21D — App-Facing Academic Calendar Final Closeout Audit

## 1. Status

Sprint 21D status: FINAL CLOSEOUT AUDIT

The App-Facing Academic Calendar feature is complete for the V1 read-only scope. This file is documentation-only and does not introduce runtime, test, schema, seed, package, deployment, dashboard, overview, or schedule/timetable changes.

## 2. Baseline

Current baseline:

```text
b7e0afa test: add app-facing academic calendar e2e security coverage
```

Sprint 21 commit sequence:

```text
ecd69bc docs: add app-facing academic calendar contract audit
22838f6 feat: add app-facing academic calendar read model
b7e0afa test: add app-facing academic calendar e2e security coverage
```

## 3. Scope Closed

Sprint 21 delivered the V1 read-only app-facing Academic Calendar scope:

- Teacher App read-only academic calendar.
- Student App read-only academic calendar.
- Parent App child-specific read-only academic calendar.
- Shared app-facing visibility model over the Academic Calendar source of truth.
- E2E and security coverage for route behavior, tenancy, ownership, response safety, and mutation denial.
- No app-facing calendar mutations.

The School Dashboard / Academics Calendar remains the mutation owner and source of truth for calendar events.

## 4. Sprint 21A Summary

Sprint 21A produced the app-facing calendar contract audit in `docs/sprint-21a-app-facing-academic-calendar-contract-audit.md`.

It defined the canonical read-only route contracts:

- `GET /api/v1/teacher/calendar/events`
- `GET /api/v1/teacher/calendar/events/:eventId`
- `GET /api/v1/student/calendar/events`
- `GET /api/v1/student/calendar/events/:eventId`
- `GET /api/v1/parent/children/:studentId/calendar/events`
- `GET /api/v1/parent/children/:studentId/calendar/events/:eventId`

It also established the ADR interpretation rule: ADRs and handoff files are product and architecture intent references, not literal backend API contracts. Existing shipped backend route style, `/api/v1` prefixing, module conventions, guards, DTOs, presenters, and security rules are authoritative.

Sprint 21A separated the app-facing calendar feature from adjacent surfaces:

- Calendar vs Schedule: calendar events are holidays, exams, activities, and school/stage/grade/section events; schedule/timetable routes remain instructional period routes.
- Calendar vs Dashboard: app-facing calendar routes are not dashboard widgets and do not modify `/api/v1/dashboard/*`.
- Calendar vs Announcements/Notifications: calendar events are structured academic dates; announcements are communication content; notifications are delivery/state workflows.

It documented Teacher, Student, and Parent visibility rules, the response contract, the recommendation to hide `notes`, the app guard and access strategy, and deferred items such as recurrence, ICS, notifications, and combined schedule/calendar feeds.

## 5. Sprint 21B Summary

Sprint 21B implemented the read-only runtime model while keeping the core Academic Calendar source of truth in Academics.

Delivered runtime architecture:

- Shared app-facing calendar read model under `src/modules/academics/calendar/app-facing/**`.
- Shared visibility context with actor kind, school, optional academic year/term, and visible stage/grade/section ids.
- Shared repository filtering for school scope plus visible `SCHOOL`, `STAGE`, `GRADE`, and `SECTION` scope branches.
- Shared DTOs and presenter for app-safe response shaping.
- Teacher App routes and use cases under `src/modules/teacher-app/calendar/**`.
- Student App routes and use cases under `src/modules/student-app/calendar/**`.
- Parent App child routes and use cases under `src/modules/parent-app/calendar/**`.
- App module wiring through `TeacherAppModule`, `StudentAppModule`, and `ParentAppModule`.
- Focused unit tests for presenter, query helpers, repository visibility, visibility service, and app use-case plumbing.

Important Sprint 21B detail-access fix:

- Detail routes now apply actor-bound academic context when present.
- Student and parent detail access cannot read same-section events from a different academic year or term.
- Teacher detail access remains same-school and scope-visible unless future product requirements restrict teacher views by academic year or term.

## 6. Sprint 21C Summary

Sprint 21C added E2E and security coverage for the Sprint 21B read model.

Covered behavior includes:

- Route inventory for all app-facing calendar list/detail routes.
- Confirmation that no app-facing calendar mutation routes are registered.
- Teacher allocation-based visibility.
- Student current-enrollment visibility.
- Parent owned-child visibility.
- Non-owned child denial.
- Cross-school denial.
- Same-section different academic year/term denial for student and parent detail access.
- Query filters over HTTP.
- Invalid query validation.
- Rejection of unsupported `schoolId`, `organizationId`, and `scopeId` query parameters.
- Soft-delete exclusion from list and detail.
- Response leakage checks for tenant, actor, soft-delete, notes, timestamp, and raw Prisma fields.
- App users denied from School Dashboard Calendar CRUD mutations.
- Dashboard, schedule, and School Dashboard Calendar route inventory preserved.

## 7. Final Route Inventory

Final app-facing read routes:

```text
GET /api/v1/teacher/calendar/events
GET /api/v1/teacher/calendar/events/:eventId

GET /api/v1/student/calendar/events
GET /api/v1/student/calendar/events/:eventId

GET /api/v1/parent/children/:studentId/calendar/events
GET /api/v1/parent/children/:studentId/calendar/events/:eventId
```

No app-facing `POST`, `PATCH`, or `DELETE` calendar routes exist for Teacher App, Student App, or Parent App.

## 8. School Dashboard Calendar Boundary

Existing School Dashboard Calendar CRUD remains the mutation owner:

```text
GET    /api/v1/academics/calendar/events
POST   /api/v1/academics/calendar/events
GET    /api/v1/academics/calendar/events/:eventId
PATCH  /api/v1/academics/calendar/events/:eventId
DELETE /api/v1/academics/calendar/events/:eventId
```

The app-facing calendar routes do not replace, weaken, or modify this surface. Calendar create, update, and delete behavior remains in the School Dashboard / Academics Calendar module.

## 9. Schedule / Timetable Boundary

Existing schedule routes remain unchanged:

```text
GET /api/v1/teacher/schedule
GET /api/v1/teacher/schedule/week
GET /api/v1/student/schedule
GET /api/v1/student/schedule/week
GET /api/v1/parent/children/:studentId/schedule/today
GET /api/v1/parent/children/:studentId/schedule/weekly
```

Schedule and timetable routes represent instructional periods and class sessions. Calendar routes represent holidays, exams, activities, and academic events. Sprint 21 did not add a combined schedule plus calendar feed, and schedule routes do not return calendar events.

## 10. Dashboard / Academics Overview Boundary

`/api/v1/dashboard/*` was not modified by Sprint 21.

Academics Overview was not modified by Sprint 21. The app-facing calendar is not a dashboard widget and does not change the school-dashboard academics overview read model.

## 11. Visibility Guarantees

Teacher visibility:

- Teacher must be in the same school.
- Teacher can see school-wide events.
- Teacher can see stage, grade, and section events connected to owned teacher allocations and classrooms.
- Teacher cannot see unrelated same-school stage, grade, or section events.
- Teacher cannot see cross-school events.

Student visibility:

- Student visibility derives from the current student enrollment.
- Student can see school, stage, grade, and section events for the current enrollment context.
- Student visibility is bound to academic year and term where present.
- Student cannot see unrelated same-school stage, grade, or section events.
- Student detail access cannot leak same-section events from a different academic year or term.
- Student cannot see cross-school events.

Parent visibility:

- Active guardian-child ownership is required before child calendar access.
- Parent visibility derives from the owned child's current enrollment context.
- Parent can see school, stage, grade, and section events for the owned child.
- Parent visibility is bound to academic year and term where present.
- Parent cannot access a non-owned child's calendar.
- Parent cannot see cross-school children or cross-school events.

## 12. Query and Pagination Contract

Supported app-facing list query parameters:

- `from`
- `to`
- `type`
- `scopeType`
- `limit`
- `cursor`
- `academicYearId`
- `termId`

Unsupported widening parameters are not accepted:

- `schoolId`
- `organizationId`
- `scopeId`

The query contract uses bounded date windows with a maximum range of 370 days. The default limit is 50, the maximum limit is 100, and cursor pagination is supported. Filters are applied only inside the actor-visible event set and never widen visibility.

## 13. Response Safety Contract

Final app-facing event response fields:

- `id`
- `academicYearId`
- `termId`
- `title`
- `description`
- `type`
- `scope.type`
- `scope.id`
- `allDay`
- `startDate`
- `endDate`

Hidden app-facing fields:

- `schoolId`
- `organizationId`
- `scopeKey`
- `notes`
- `createdByUserId`
- `updatedByUserId`
- `deletedByUserId`
- `deletedAt`
- `createdAt`
- `updatedAt`
- Raw Prisma rows.

`notes` remain dashboard/internal unless a future product decision explicitly approves app-facing visibility.

## 14. Permissions and Guard Strategy

App-facing calendar reads do not require granting `academics.calendar.view` to teacher, student, or parent system roles.

The implemented strategy uses existing authentication, school scope, and app access patterns:

- Teacher App routes use teacher app access and owned allocation context.
- Student App routes use student app access and current enrollment context.
- Parent App routes use parent app access and guardian-child ownership.

No seed changes were required. App users cannot mutate School Dashboard Calendar CRUD because app-facing routes do not register mutations and dashboard calendar mutations remain protected by School Dashboard permissions.

## 15. Tenancy and Ownership Guarantees

School scope remains enforced through scoped Prisma access. No platform bypass was added for the app-facing calendar read model.

Parent ownership is checked before resolving child calendar visibility. Detail access uses the same visibility rules as list access, including actor-bound academic year and term when present. Soft-deleted events are excluded from list and detail responses.

## 16. Test Coverage Summary

Sprint 21B unit coverage includes:

- Presenter enum mapping and hidden-field response shaping.
- Query helper validation for invalid ranges, excessive ranges, and academic context filters.
- Repository visibility filtering for school, stage, grade, and section branches.
- Visibility service derivation for teacher, student, and parent contexts.
- Teacher, Student, and Parent app use-case plumbing.

Sprint 21C E2E coverage includes 7 E2E tests:

- Route inventory.
- Positive Teacher, Student, and Parent actor flows.
- Query filters and pagination.
- Invalid query inputs.
- Soft-delete exclusion.

Sprint 21C security coverage includes 6 security tests:

- Teacher isolation.
- Student isolation.
- Parent ownership.
- Field leakage checks.
- Soft-delete protection.
- Mutation denial on app routes and School Dashboard Calendar CRUD.

## 17. Verification Results

The following are known passing verification results from Sprint 21B and Sprint 21C. They are not newly rerun as part of this Sprint 21D documentation-only closeout.

```text
npx prisma validate: passed
npx prisma generate: passed
npm run build: passed
npm run test -- calendar --runInBand: passed
npm run test -- teacher --runInBand: passed
npm run test -- student --runInBand: passed
npm run test -- parent --runInBand: passed
npm run test -- academics --runInBand: passed
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/app-facing-academic-calendar.e2e-spec.ts: passed
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.app-facing-academic-calendar.spec.ts: passed
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/academics-calendar-events.e2e-spec.ts: passed
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.academics-calendar-events.spec.ts: passed
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/academics-overview.e2e-spec.ts: passed
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.academics-overview.spec.ts: passed
```

## 18. Files Delivered Across Sprint 21

Documentation:

- `docs/sprint-21a-app-facing-academic-calendar-contract-audit.md`
- `docs/sprint-21d-app-facing-academic-calendar-final-closeout-audit.md`

Runtime shared app calendar read model:

- `src/modules/academics/calendar/app-facing/**`

Teacher App calendar:

- `src/modules/teacher-app/calendar/**`
- `src/modules/teacher-app/teacher-app.module.ts`

Student App calendar:

- `src/modules/student-app/calendar/**`
- `src/modules/student-app/student-app.module.ts`

Parent App calendar:

- `src/modules/parent-app/calendar/**`
- `src/modules/parent-app/parent-app.module.ts`

Test helper and HTTP coverage:

- `test/helpers/app-facing-calendar-test-utils.ts`
- `test/e2e/app-facing-academic-calendar.e2e-spec.ts`
- `test/security/tenancy.app-facing-academic-calendar.spec.ts`

## 19. Final Non-Regression Statement

Sprint 21C and Sprint 21D introduced no Prisma schema changes, migrations, seed changes, package changes, Dashboard changes, Academics Overview changes, schedule/timetable changes, generated files, deployment/CORS changes, or `Moazez-Project-Structure.json` changes.

Sprint 21B runtime changes stayed inside the app-facing calendar/read model and app module wiring scope. Sprint 21C was test/helper-only. Sprint 21D is docs-only.

## 20. Deferred / Out of Scope

Deferred items remain:

- App-facing calendar mutations.
- Recurrence.
- ICS import/export.
- Notifications/reminders.
- Combined schedule and calendar feed.
- Dashboard calendar widgets.
- Mobile/offline sync.
- Materialized or cached read model.
- Advanced analytics.

## 21. Risks and Follow-Up Notes

- Teacher visibility currently derives from owned teacher allocations and classrooms.
- Future product requirements may need timetable-backed visibility expansion for teachers.
- Student and parent current enrollment selection should remain aligned with existing app access services.
- Any future combined schedule/calendar feed must be explicitly designed and tested as a separate contract.
- Any future notification or reminder integration should be separate from the read-only app-facing calendar surface.

## 22. Final Acceptance Decision

```text
Sprint 21 — App-Facing Academic Calendar
Final status: COMPLETE for V1 read-only scope.
```

Final acceptance:

- Contract audit complete.
- Runtime implementation complete.
- E2E/security coverage complete.
- Final closeout audit complete.
