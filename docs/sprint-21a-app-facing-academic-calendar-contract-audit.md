# Sprint 21A — App-Facing Academic Calendar Contract Audit

## 1. Status

Sprint 21A status: CONTRACT AUDIT ONLY

This sprint does not implement runtime code. It prepares the full app-facing Academic Calendar contract for future implementation across the Teacher App, Student App, and Parent App.

No controller, service, repository, Prisma schema, migration, seed, test, package, deployment, generated, README, or project-structure JSON changes are included in this sprint.

## 2. Baseline

Current baseline: e0192a6 docs: finalize sprint 20a academic calendar overview

Sprint 20A delivered the current backend Academic Calendar foundation:

- `AcademicCalendarEvent`
- School Dashboard academic calendar CRUD
- Academics Overview support for upcoming academic calendar events
- E2E and security coverage for the school-dashboard calendar and overview surfaces
- Final closeout audit for the Sprint 20A implementation

## 3. Purpose and Non-Goals

Purpose:

- Define the future app-facing calendar API contracts for the Teacher App.
- Define the future app-facing calendar API contracts for the Student App.
- Define the future app-facing calendar API contracts for the Parent App.
- Preserve the existing distinction between academic calendar events and schedule/timetable periods.
- Define visibility, tenancy, ownership, route, presenter, guard, error, testing, and phasing expectations before runtime implementation.

Non-goals:

- No runtime implementation.
- No Prisma schema changes.
- No migration.
- No seed changes.
- No test changes.
- No dashboard replacement.
- No schedule route rewrite.
- No recurrence.
- No ICS import or export.
- No notification workflows.
- No advanced analytics.
- No mobile-specific push behavior.

## 4. Sources Reviewed

Governance and architecture documents:

- `PROJECT_OVERVIEW.md`
- `V1_SCOPE.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `API_CONTRACT_RULES.md`
- `TESTING_STRATEGY.md`
- `ENGINEERING_RULES.md`
- `PRISMA_CONVENTIONS.md`
- `OBSERVABILITY.md`
- `MODULES.md`
- `ERROR_CATALOG.md`
- `DOMAIN_GLOSSARY.md`
- `USER_TYPES.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `DIRECTORY_STRUCTURE.md` was required by the repository instructions but is not present in this checkout; `DIRECTORY_STRUCTURE_VISUAL.md` was reviewed instead.

Sprint 20A documents:

- `docs/sprint-20a-academic-calendar-overview-contract-audit.md`
- `docs/sprint-20a-academic-calendar-overview-final-closeout-audit.md`

ADR and handoff files:

- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`
- `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md`
- `adr/School-Dashboard/sis_dashboard-school-dashboard-api-handoff.md`
- `adr/School-Dashboard/sis_dashboard-attendance_backend_handoff_spec.md`
- `adr/School-Dashboard/sis_dashboard-students_guardians_backend_handoff_spec_v2.md`
- `adr/School-Dashboard/sis_dashboard-settings_backend_handoff_spec_v2.md`
- `adr/Teacher-App/teacher_SCHEDULE_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_HOME_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_MY_CLASSES_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_CLASSROOM_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_HOMEWORKS_BACKEND_MODELS.md`
- `adr/Student-App/student_SCHEDULE_BACKEND_MODEL.md`
- `adr/Student-App/student_HOME_BACKEND_MODEL.md`
- `adr/Student-App/student_ANNOUNCEMENTS_BACKEND_MODEL.md`
- `adr/Student-App/student_HOMEWORKS_BACKEND_MODEL.md`
- `adr/Student-App/student_EXAMS_BACKEND_MODEL.md`
- `adr/Student-App/student_SUBJECTS_BACKEND_MODEL.md`
- `adr/Student-App/student_SUBJECT_DETAILS_BACKEND_MODEL.md`
- `adr/Student-App/student_PROGRESS_BACKEND_MODEL.md`
- `adr/Student-App/student_MESSAGES_BACKEND_MODEL.md`
- `adr/Student-App/student_TASKS_BACKEND_MODEL.md`
- `adr/Parent-App/parent_schedule.md`
- `adr/Parent-App/parent_home.md`
- `adr/Parent-App/parent_children.md`
- `adr/Parent-App/parent_homeworks.md`
- `adr/Parent-App/parent_progress.md`
- `adr/Parent-App/parent_messages.md`
- `adr/Parent-App/parent_reports.md`
- `adr/Parent-App/parent_tasks.md`
- `adr/Parent-App/parent_behavior.md`
- `adr/Parent-App/parent_profile.md`
- All files under `adr/**` were searched for calendar, academic calendar, schedule, timetable, Teacher App, Student App, Parent App, School Dashboard, academics overview, lesson plan, curriculum, homework, attendance, announcements, and notifications.

Academic calendar, overview, schedule, and domain implementation files:

- `src/modules/academics/calendar/**`
- `src/modules/academics/overview/**`
- `src/modules/academics/timetable/**`
- `src/modules/academics/lesson-plans/**`
- `src/modules/academics/curriculum/**`
- `src/modules/academics/teacher-allocation/**`
- `src/modules/academics/structure/**`
- `src/modules/academics/subjects/**`
- `src/modules/teacher-app/**`
- `src/modules/student-app/**`
- `src/modules/parent-app/**`
- `src/modules/dashboard/**`
- `src/modules/communication/**`, only for notification and announcement boundary references.
- `src/modules/homework/**`, only for homework due-date and app-surface overlap.
- `src/modules/attendance/**`, only for school-day and future calendar-overlap references.
- `src/app.module.ts`
- `src/main.ts`
- `src/common/guards/**`
- `src/common/context/request-context.ts`
- `src/common/exceptions/domain-exception.ts`
- `src/common/filters/global-exception.filter.ts`
- `prisma/schema.prisma`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `src/infrastructure/database/school-scope.extension.ts`

Route searches were also performed under the Teacher App, Student App, and Parent App modules for existing schedule and calendar routes.

## 5. ADR Interpretation and Backend Contract Rule

ADRs and handoff files are architecture and product intent references. They are not literal backend API contracts when they conflict with current backend route conventions, guards, scopes, DTOs, presenters, or security rules.

Current shipped backend routes and module conventions are authoritative for this audit. All backend routes must remain under `/api/v1`; product or ADR examples that omit `/api/v1` must be interpreted through the mandatory global prefix.

App modules are read and composition layers. They must not become owners of school-dashboard domain truth. School Dashboard and the Academics core remain the source of truth for academic calendar events.

App-facing calendar endpoints should safely consume and compose existing core academic calendar data. If an ADR conflicts with current shipped backend behavior, the future implementation should preserve the current backend contract unless a new ADR explicitly changes that behavior.

## 6. Current Calendar Foundation from Sprint 20A

The current academic calendar foundation is the `AcademicCalendarEvent` model. It is school-scoped, soft-deletable, and included in the school-scope Prisma extension.

Supported event scopes:

- `SCHOOL`
- `STAGE`
- `GRADE`
- `SECTION`

Supported event types:

- `HOLIDAY`
- `EXAM`
- `ACTIVITY`
- `OTHER`

Current School Dashboard routes:

```text
GET    /api/v1/academics/calendar/events
POST   /api/v1/academics/calendar/events
GET    /api/v1/academics/calendar/events/:eventId
PATCH  /api/v1/academics/calendar/events/:eventId
DELETE /api/v1/academics/calendar/events/:eventId
```

The dashboard calendar implementation:

- Excludes soft-deleted events.
- Uses school-scoped repository access.
- Validates date ranges, event scope, academic year, and term context.
- Audits create, update, and delete mutations.
- Presents dashboard-safe event shapes instead of exposing raw Prisma rows.
- Supports upcoming event data in Academics Overview.

The current dashboard presenter includes `notes` for internal school-dashboard usage. App-facing calendar responses should hide `notes` unless product explicitly decides those notes are intended for teachers, students, or parents.

App-facing calendar routes were intentionally deferred in Sprint 20A.

## 7. Current Schedule / Timetable App-Facing State

No app-facing calendar controllers currently exist under `src/modules/teacher-app/**`, `src/modules/student-app/**`, or `src/modules/parent-app/**`. Existing app-facing schedule routes are timetable-based and must remain separate from calendar routes.

| Method and Path | Location | High-Level Purpose | Actor Visibility Model | Data Read |
| --- | --- | --- | --- | --- |
| `GET /api/v1/teacher/schedule` | `src/modules/teacher-app/schedule/controller/teacher-schedule.controller.ts` | Teacher daily schedule for a requested calendar date. | Actor must be a teacher in the current school. Results are limited through teacher app access and owned teacher allocations or matching timetable ownership. | Published active `TimetableEntry` records with subject, classroom, room, term, and timetable config data. |
| `GET /api/v1/teacher/schedule/week` | `src/modules/teacher-app/schedule/controller/teacher-schedule.controller.ts` | Teacher weekly schedule for the week containing the requested date. | Same teacher ownership model as the daily route. | Published active `TimetableEntry` records. |
| `GET /api/v1/student/schedule` | `src/modules/student-app/schedule/controller/student-schedule.controller.ts` | Student daily schedule for a requested calendar date. | Actor must be a student with current active enrollment in the current school context. | Published active `TimetableEntry` records for the student's current classroom, academic year, and term. |
| `GET /api/v1/student/schedule/week` | `src/modules/student-app/schedule/controller/student-schedule.controller.ts` | Student weekly schedule for the week containing the requested date. | Same student current-enrollment model as the daily route. | Published active `TimetableEntry` records. |
| `GET /api/v1/parent/children/:studentId/schedule/today` | `src/modules/parent-app/schedule/controller/parent-schedule.controller.ts` | Parent view of an owned child's schedule for today. | Actor must be a parent with an active guardian relationship to the requested child in the current school. | Published active `TimetableEntry` records for the child's active enrollment classroom. |
| `GET /api/v1/parent/children/:studentId/schedule/weekly` | `src/modules/parent-app/schedule/controller/parent-schedule.controller.ts` | Parent view of an owned child's weekly schedule. | Same parent guardian-child ownership model as the daily route. | Published active `TimetableEntry` records for the child's active enrollment classroom. |

Schedule and timetable routes represent instructional class periods. They answer questions such as "which lesson is happening on this day and time?"

Academic calendar routes represent academic events such as holidays, exams, activities, and school, stage, grade, or section events. They answer questions such as "which academic dates or events matter to this actor?"

Future app-facing calendar work must not replace, rename, or duplicate the existing timetable-backed schedule routes.

## 8. Teacher App Calendar Requirements

Teachers should see:

- `SCHOOL` events for their active school membership.
- `STAGE` events only when the teacher is assigned to affected classrooms, grades, sections, or timetable entries under the resolved ownership rules.
- `GRADE` events only when the teacher is assigned to affected grades or classrooms under the resolved ownership rules.
- `SECTION` events for sections or classrooms the teacher teaches.
- Events matching optional academic year and term filters after those filters are validated within the teacher's current school context.

Teacher visibility can be derived from existing teacher allocation and timetable foundations:

- `TeacherSubjectAllocation` links the teacher user to subjects, classrooms, and terms.
- Classrooms link to sections, grades, and stages through the academic structure.
- Published active timetable entries can confirm instructional ownership when the implementation chooses timetable-backed visibility.

Teachers must not see:

- Events for unrelated sections, grades, or stages unless the event is school-wide.
- Raw `schoolId` or `organizationId`.
- Raw `scopeKey`.
- Internal actor IDs such as `createdByUserId`, `updatedByUserId`, or `deletedByUserId`.
- Soft-deleted events.

Recommendation: Teacher App calendar routes should be read-only in V1. Calendar mutations must remain in School Dashboard Calendar CRUD.

## 9. Student App Calendar Requirements

Students should see:

- `SCHOOL` events for the student's current school.
- `STAGE` events for the student's current stage.
- `GRADE` events for the student's current grade.
- `SECTION` events for the student's current section or classroom.
- Only events relevant to the student's current enrollment and academic context.

Student visibility should be derived from the existing Student App access flow:

- Resolve the authenticated actor as a student.
- Resolve the linked active `Student`.
- Resolve the current active enrollment.
- Resolve the enrollment classroom and its section, grade, and stage.

Students must not see:

- Events for unrelated grades, sections, or stages.
- Teacher, admin, or internal fields.
- Raw tenant fields.
- Soft-deleted events.

Recommendation: Student App calendar routes should be read-only in V1.

## 10. Parent App Calendar Requirements

Parents should see:

- A child-specific view by `studentId`.
- `SCHOOL` events for the child's school.
- `STAGE` events for that child's current stage.
- `GRADE` events for that child's current grade.
- `SECTION` events for that child's current section or classroom.
- Only events relevant to that child's current active enrollment and academic context.

If a parent has multiple children, the parent should use the child-specific calendar route for each child. Parent app responses should not merge children into a single feed unless a future combined route is explicitly designed.

Parent access must prove ownership through the existing guardian-child relationship:

- Resolve the authenticated actor as a parent.
- Resolve the active guardian record.
- Verify the requested child is linked to the parent through an active guardian relationship in the current school.
- Resolve the child's current enrollment and academic structure context.

Parents must not see:

- Calendar events for students they do not own or guard.
- Events for unrelated sections, grades, or stages.
- Raw tenant fields.
- Soft-deleted events.

Recommendation: Parent App calendar routes should be read-only in V1.

## 11. Actor Visibility Matrix

| Event Scope | Teacher | Student | Parent |
| --- | --- | --- | --- |
| `SCHOOL` | Visible if same school and active teacher membership. | Visible if same school and current enrollment. | Visible for an owned child in the same school. |
| `STAGE` | Visible if the teacher is assigned to a classroom, grade, section, or timetable entry under that stage. This resolver is recommended but not currently implemented for app-facing calendar routes. | Visible if the student's current stage matches. | Visible if the owned child's current stage matches. |
| `GRADE` | Visible if the teacher is assigned to a classroom, section, or timetable entry under that grade. This resolver is recommended but not currently implemented for app-facing calendar routes. | Visible if the student's current grade matches. | Visible if the owned child's current grade matches. |
| `SECTION` | Visible if the teacher teaches the section or classroom. This should use allocation and/or timetable ownership rules. | Visible if the student's current section or classroom matches. | Visible if the owned child's current section or classroom matches. |

This matrix defines the recommended future visibility contract. It is not currently implemented as app-facing calendar runtime behavior.

## 12. Calendar Scope Resolution Rules

Future app-facing calendar implementation should follow these backend resolution rules:

- Never accept `schoolId` from app-facing calendar query parameters.
- Never accept `organizationId` from app-facing calendar query parameters.
- Derive the school from actor membership, student enrollment, or parent-child ownership.
- Derive student stage, grade, and section from current enrollment and academic structure joins.
- Derive teacher visibility from teacher allocation, timetable ownership, or classroom ownership rules.
- Require parent guardian-child ownership before resolving child calendar context.
- Treat cross-school IDs as safe not-found or forbidden responses according to existing app conventions.
- Exclude soft-deleted calendar events.
- Apply detail visibility checks with the same rules as list visibility.
- Keep event date range filters bounded.
- Validate academic year and term filters inside the actor's current school context before filtering results.
- Apply `scopeType` filters only within the actor's already-visible event set.

## 13. Calendar vs Schedule Boundary

Schedule and timetable routes show class sessions, periods, lessons, rooms, and teaching times. They are backed by timetable configuration and timetable entries.

Calendar routes should show structured academic events: holidays, exams, activities, and other school, stage, grade, or section events.

Calendar routes should not duplicate timetable entries. Schedule routes should not start returning calendar events unless a future combined endpoint is explicitly designed.

A future app home screen may compose both schedule data and calendar data, but this sprint does not redefine existing schedule APIs.

## 14. Calendar vs Dashboard Boundary

The School Dashboard remains the school-admin summary, alert, and activity-feed surface.

Academics Overview remains the school-dashboard academics readiness summary. It can continue to include upcoming academic calendar events for administrators.

App-facing calendar routes are not dashboard widgets. They should be implemented under the Teacher App, Student App, and Parent App namespaces rather than under `/api/v1/dashboard/*`.

Future implementation must not modify `/api/v1/dashboard/*` for this app-facing calendar work.

## 15. Calendar vs Announcements / Notifications Boundary

Calendar events are structured academic dates and events.

Announcements are communication content. They are authored, published, and consumed through the Communication module.

Notifications are delivery and state workflows. They track notification creation, delivery, read/archive state, and future delivery channels.

Sprint 21 app calendar work should not create notification jobs. If future product requirements need reminders or announcements triggered by calendar events, that integration should listen to School Dashboard calendar mutations or use an explicit workflow designed in a later sprint.

## 16. Proposed App-Facing API Contracts

Recommended canonical Teacher App routes:

```text
GET /api/v1/teacher/calendar/events
GET /api/v1/teacher/calendar/events/:eventId
```

Recommended canonical Student App routes:

```text
GET /api/v1/student/calendar/events
GET /api/v1/student/calendar/events/:eventId
```

Recommended canonical Parent App routes:

```text
GET /api/v1/parent/children/:studentId/calendar/events
GET /api/v1/parent/children/:studentId/calendar/events/:eventId
```

These route shapes match existing app namespaces:

- Teacher App routes already live under `/api/v1/teacher/*`.
- Student App routes already live under `/api/v1/student/*`.
- Parent App child-specific routes already live under `/api/v1/parent/children/:studentId/*`.

The parent route should remain child-specific because the existing Parent App schedule and child data access model is ownership-first and child-scoped.

Alternative route candidates such as `/api/v1/calendar/events` or parent routes with `studentId` query parameters are not recommended because they blur app boundaries and weaken the existing child-specific Parent App convention.

Each list route should support:

- `from`
- `to`
- `type`
- `scopeType`
- `limit`
- `cursor`
- Optional `academicYearId`
- Optional `termId`

App-facing calendar routes must not accept:

- `schoolId`
- `organizationId`

## 17. Response Contracts

Recommended list response:

```ts
{
  items: Array<{
    id: string;
    academicYearId: string;
    termId: string;
    title: string;
    description: string | null;
    type: 'holiday' | 'exam' | 'activity' | 'other';
    scope: {
      type: 'school' | 'stage' | 'grade' | 'section';
      id: string | null;
    };
    allDay: boolean;
    startDate: string;
    endDate: string;
  }>;
  nextCursor: string | null;
}
```

Recommended detail response: the same event object used in `items`.

App-facing responses must not expose:

- `schoolId`
- `organizationId`
- `scopeKey`
- `createdByUserId`
- `updatedByUserId`
- `deletedByUserId`
- `deletedAt`
- Raw Prisma rows

Recommendation on `notes`: hide `notes` from app-facing calendar responses unless product explicitly confirms that dashboard/internal notes are intended for teachers, students, and parents.

## 18. Query Parameters and Filtering Rules

Recommended filtering rules:

- If `from` and `to` are omitted, default to the current calendar foundation behavior: a bounded upcoming window starting from today and extending 90 days.
- If only `to` is provided, derive a bounded `from` according to the existing calendar list behavior.
- The maximum range should be 370 days or smaller if app product requirements need stricter mobile windows.
- Default `limit` should remain 50.
- Maximum `limit` should remain 100.
- Use cursor pagination.
- `type` filtering should support `holiday`, `exam`, `activity`, and `other`.
- `scopeType` filtering should support `school`, `stage`, `grade`, and `section`.
- Scope filtering must only filter within already visible events. It must never widen visibility.
- Invalid UUID filters should return validation errors.
- Invalid date formats should return validation errors.
- Invalid or excessive date ranges should return validation errors.
- Cross-school academic year or term filters should return safe invalid-context, not-found, or forbidden behavior according to existing conventions.

App-facing routes should not accept `scopeId` in V1 unless product explicitly needs it. A `scopeType` filter is sufficient for most app usage and avoids implying that app clients can probe arbitrary stage, grade, or section IDs.

## 19. Permissions and Guard Strategy

Because the proposed endpoints are app-facing and read-only, they should not automatically reuse the school-dashboard `academics.calendar.view` permission.

Recommended strategy:

- Teacher App routes should use the existing auth, scope, and teacher app access pattern, then apply teacher membership and class ownership visibility.
- Student App routes should use the existing auth, scope, and student app access pattern, then apply current enrollment ownership visibility.
- Parent App routes should use the existing auth, scope, and parent app access pattern, then apply guardian-child ownership visibility.
- No new mutation permissions should be granted to app users.
- Do not grant `academics.calendar.view` to teacher, student, or parent system roles just to enable app-facing reads unless project conventions explicitly change.

Existing app modules generally rely on global authentication and scope resolution plus app-specific access services rather than granular `@RequiredPermissions` decorators on every read route.

If explicit app permissions become necessary, propose the following minimal read permissions:

- `teacher.calendar.view`
- `student.calendar.view`
- `parent.calendar.view`

That decision should be made during implementation only if the project adopts app-specific granular read permissions for these namespaces.

## 20. Tenancy and Ownership Guarantees

Future implementation must guarantee:

- A teacher is in the same school and assigned or linked to the affected academic context.
- A student is in the same school and currently enrolled in the affected academic context.
- A parent owns or guards the requested child through an active guardian relationship.
- Cross-school event ID detail access returns safe not-found or forbidden behavior.
- Platform-level behavior must not bypass app ownership checks for app-facing routes.
- Scoped Prisma access remains required even when controllers and services have already resolved actor scope.
- Raw tenant fields are not returned in app-facing responses.
- Detail endpoints apply the same visibility rules as list endpoints.

## 21. Error Contract

Future implementation should reuse the existing error envelope and catalog style:

- Missing or invalid authentication should use existing authentication errors.
- Missing app actor context should use existing app errors such as `teacher_app.actor.required_teacher`, `student_app.actor.required_student`, or `parent_app.actor.required_parent`.
- Missing guardian-child ownership should use existing Parent App ownership errors such as `parent_app.child.not_found` where applicable.
- Missing student enrollment should use existing Student App or Parent App enrollment errors where applicable.
- Invalid dates, invalid UUIDs, invalid limits, and invalid filters should return validation errors.
- Invalid date ranges should align with existing calendar range error behavior.
- Event detail requests for events that are not visible to the actor should return safe not-found behavior.
- Invalid academic context should return safe validation, invalid-context, or not-found behavior without leaking cross-school existence.

Do not invent excessive new errors. If implementation needs a shared app-calendar error, keep it minimal and mark it as an implementation decision, for example `app_calendar.invalid_context`.

## 22. Audit Logging and Observability

Because the proposed app-facing endpoints are read-only, audit logs are not required for reads unless the project later adopts read-audit requirements for these app modules.

Observability expectations:

- Do not log PII, secrets, raw tokens, or sensitive student data.
- Do not log raw guardian relationships beyond what is necessary for structured operational diagnostics.
- Preserve trace IDs and existing error envelope behavior.
- Calendar create, update, and delete mutations remain in School Dashboard and are already the correct place for audit logging.

## 23. Testing Strategy for Future Implementation

Future E2E coverage should include:

- Teacher calendar route inventory, list, and detail.
- Student calendar route inventory, list, and detail.
- Parent child calendar list and detail.
- Default date window behavior.
- Type filters.
- Scope filters.
- Cursor pagination.
- Safe response shape.
- `notes` hidden from app-facing responses if this recommendation is approved.

Future security coverage should include:

- Teacher cannot see unrelated section events.
- Teacher cannot see unrelated grade or stage events unless school-wide.
- Student cannot see other section, grade, or stage events.
- Parent cannot see a non-owned child's calendar.
- Cross-school event detail access is denied or safely not found.
- Teacher, student, and parent cannot mutate calendar events.
- Soft-deleted events are excluded.
- Raw tenant and internal fields are not leaked.
- No School Dashboard route regression.
- No schedule route regression.

Future unit coverage should include:

- Teacher visibility resolver tests.
- Student visibility resolver tests.
- Parent visibility resolver tests.
- App-facing calendar presenter tests.
- Query validation tests.

## 24. Implementation Phasing Recommendation

Recommended future phases:

- Phase 21B: Build a shared app-facing calendar visibility resolver, read repository, presenter, DTOs, and read-only Teacher App, Student App, and Parent App list/detail routes.
- Phase 21C: Add E2E and security coverage for all app-facing calendar routes.
- Phase 21D: Produce the final closeout audit.

If implementation needs a safer split, use this order:

- Teacher App Calendar first, because teacher visibility is the most complex resolver.
- Student App Calendar second, because enrollment-derived visibility is more direct.
- Parent App Calendar third, because it composes student enrollment visibility with guardian-child ownership.
- Shared security coverage final, across all actors.

## 25. Deferred / Out-of-Scope Items

Deferred and out of scope:

- App-facing calendar mutations.
- Recurrence.
- ICS integration.
- Import and export.
- Notification delivery.
- Advanced reminders.
- Dashboard widgets.
- Combined schedule and calendar feed unless separately designed.
- Offline or mobile sync.
- Caching or materialized read models.
- Advanced analytics.
- Platform billing, finance, HR, wallet, marketplace, or advanced smart pickup features.

## 26. Risks and Open Questions

Risks and open questions:

- Teacher visibility requires careful interpretation of teacher allocations versus published timetable entries.
- Student current enrollment source must be confirmed for schools with multiple enrollment records.
- Parent ownership source must remain the active guardian-child relationship and should not permit cross-school aggregation in V1.
- `notes` visibility must be explicitly approved if product wants app users to see it.
- Date windows and timezone behavior must align with the existing calendar module and app expectations.
- If multiple active enrollments exist, the route must define current or primary enrollment selection.
- App-facing permissions versus app guard convention must be confirmed during implementation.
- Stage, grade, and section visibility should be derived from normalized academic structure joins rather than trusting client-provided IDs.
- Detail routes must avoid existence leaks for events outside the actor's visible set.

## 27. Final Recommendation

Proceed to implementation only after approving this contract audit.

Preferred next sprint: Sprint 21B — App-Facing Academic Calendar Read Model

Recommended implementation posture:

- Keep app-facing calendar routes read-only.
- Do not alter School Dashboard Calendar CRUD.
- Do not alter existing schedule or timetable app routes.
- Implement app-facing visibility through backend-derived actor, enrollment, guardian, allocation, timetable, and academic structure context.
- Keep the Academics calendar module as the source of truth and app modules as safe composition layers.
