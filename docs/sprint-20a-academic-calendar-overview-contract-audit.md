# Sprint 20A Academic Calendar + Academics Overview Contract Audit

## 1. Purpose and scope

Sprint 20A-0 is a documentation-only contract and architecture audit for the Academic Calendar and Academics Overview foundation.

This audit does not implement runtime behavior. It does not authorize changes to `src/**`, `prisma/**`, `test/**`, `package.json`, package scripts, generated files, README, project structure artifacts, deployment/server/CORS files, or environment files.

The Sprint 20A runtime target, if approved later, is:

- Academic Calendar event foundation under Academics.
- Academics Overview read-only aggregation under Academics.
- Permission, test, verification, and final closeout coverage for those surfaces.

All future runtime routes must be served under the framework-level `/api/v1/` prefix.

## 2. Current baseline

Expected baseline:

- `037236b docs: finalize sprint 19a applicant document review`

Verified local baseline for this audit:

- Current HEAD: `037236b`
- Working tree before authoring this document: clean.

Current Academics modules in `src/modules/academics/**`:

- `structure`
- `subjects`
- `rooms`
- `teacher-allocation`
- `curriculum`
- `lesson-plans`
- `timetable`

There is currently no `src/modules/academics/calendar/**` module and no `src/modules/academics/overview/**` module.

Current Structure routes are backend-native and live under `academics/structure`, not the older ADR route examples:

- `GET /api/v1/academics/structure/years`
- `POST /api/v1/academics/structure/years`
- `PATCH /api/v1/academics/structure/years/:id`
- `GET /api/v1/academics/structure/terms`
- `POST /api/v1/academics/structure/terms`
- `PATCH /api/v1/academics/structure/terms/:id`
- `GET /api/v1/academics/structure/tree`
- stage, grade, section, and classroom CRUD/reorder routes under `/api/v1/academics/structure/...`

Current Dashboard foundation routes:

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/alerts`
- `GET /api/v1/dashboard/activity-feed`

Dashboard Summary already aggregates some Academics card counts, including academic years, terms, stages, grades, sections, classrooms, subjects, rooms, teacher allocations, active curricula, active lesson plans, active timetable entries, and published timetable publications. That does not replace a dedicated Academics Overview surface because Dashboard is a broad school operations read model and Academics Overview should be an Academics-specific setup/readiness surface.

Sprint 15I explicitly left these V1 gaps after learning-flow closeout:

- Academic Calendar.
- Academics Overview.
- Student, Teacher, and Parent lesson-content browsing/preparation routes.

The current schema includes Timetable foundation models (`TimetableConfig`, `TimetablePeriod`, `TimetableEntry`, `TimetablePublication`, `TimetableConflict`) and app-facing schedule routes now exist. Sprint 20A should not rewrite or rename that timetable/schedule work.

## 3. ADR interpretation policy

ADR and handoff files are product, architecture, and frontend-intent references. They are not automatically literal backend API contracts.

For Sprint 20A:

- Existing backend controllers, DTOs, presenters, use-cases, repository patterns, API contract rules, and shipped `/api/v1` routes remain authoritative.
- ADR route examples such as `/api/academics/...` must be read as `/api/v1/academics/...` for backend V1.
- ADR examples such as `/api/academics/events` do not require copying that exact route when a backend-native route better matches current module boundaries.
- Do not rename shipped routes.
- Do not copy frontend-only response shapes verbatim into the backend.
- Do not denormalize storage just to mirror UI cards.
- Do not break adapter-backed paths, methods, or route naming already shipped.

The recommended backend-native direction is to keep new Sprint 20A runtime under Academics:

- `/api/v1/academics/calendar/events`
- `/api/v1/academics/overview`

## 4. Related ADR/source review

School Dashboard Academics handoff:

- Describes Academics overview, Academic Calendar, structure, subjects/allocation, teacher allocation, timetable, curriculum, and lesson plans.
- Treats year and term context as foundational.
- Defines calendar concepts around `AcademicEvent`, `HOLIDAY | EXAM | ACTIVITY | OTHER`, and `SCHOOL | STAGE | GRADE | SECTION`.
- Notes that calendar holidays can later affect lesson-plan instructional week calculations.
- Says the overview is not raw CRUD; it computes readiness, checklist, alerts, teacher-load, lesson-plan completion, and setup metrics.
- Uses `/api/academics/...` examples, which must be interpreted as `/api/v1/academics/...` and adapted to current backend route conventions.

Dashboard closeout:

- Closed Dashboard Summary, Alerts, and Activity Feed as read-only dashboard surfaces.
- Explicitly identified Academic Calendar / Academics Overview as a remaining V1 gap.
- Established a useful aggregation pattern but did not make Dashboard the source of truth for Academics.

Schedule/Timetable audit and current implementation:

- Sprint 12A warned not to fake schedules from teacher allocations and not to expose app schedule surfaces before timetable core existed.
- The current baseline now includes timetable core and app-facing schedule routes.
- Existing timetable work should remain stable and should not be rewritten by Sprint 20A.
- Calendar may later inform timetable or lesson-plan decisions, but Sprint 20A should not add an advanced conflict engine or schedule occurrence redesign.

Teacher/Student/Parent app boundaries:

- App-facing modules are composition layers, not sources of truth.
- Existing schedule routes are timetable-backed read models and should remain stable.
- Sprint 20A should not add Teacher App, Student App, or Parent App calendar routes.
- Lesson-content browsing/preparation remains a separate deferred app-facing learning-flow concern.

## 5. Proposed Sprint 20A runtime scope

If runtime implementation proceeds after this audit, Sprint 20A should include:

- Academic Calendar event foundation in `src/modules/academics/calendar/**`.
- Academics Overview read-only aggregation in `src/modules/academics/overview/**`.
- Calendar permissions:
  - `academics.calendar.view`
  - `academics.calendar.manage`
- Overview permission:
  - `academics.overview.view`
- Unit/use-case/presenter tests for calendar and overview.
- E2E tests for calendar CRUD and overview aggregation.
- Security tests for cross-school isolation, permission denial, and response leakage.
- Package verification scripts for the future runtime sprint, such as `test:e2e:sprint20a` and `verify:sprint20a`.
- A final closeout audit after runtime work is complete.

## 6. Proposed non-goals

Sprint 20A should not include:

- Teacher App calendar routes.
- Student App calendar routes.
- Parent App calendar routes.
- Notifications, email, SMS, or push delivery.
- Recurrence.
- iCal import/export.
- Attachments or files on calendar events.
- Advanced conflict engine.
- Timetable rewrite.
- Lesson-content browsing/preparation.
- Dashboard alert lifecycle.
- Advanced analytics builder.
- Dashboard custom widgets.
- Platform-level calendar.

## 7. Academic Calendar contract

Current schema inspection found no `AcademicCalendarEvent`, `AcademicEvent`, or equivalent Academic Calendar event model. The only `events` matches in `prisma/schema.prisma` are unrelated Hero Journey models.

Therefore, a schema and migration are likely required for the future runtime implementation.

Do not finalize the schema blindly in this audit. The runtime sprint should make the final lifecycle decision after checking migrations, Prisma scope extension registration, seed implications, and exact presenter needs.

Recommended minimal model direction:

- Model name: `AcademicCalendarEvent`
- Table: `academic_calendar_events`
- Required tenancy/context:
  - `id`
  - `schoolId`
  - `academicYearId`
  - `termId`
- Content:
  - `title`
  - optional `description`
  - optional `notes`
- Type:
  - `AcademicCalendarEventType`
  - values: `HOLIDAY`, `EXAM`, `ACTIVITY`, `OTHER`
- Scope:
  - `AcademicCalendarEventScopeType`
  - values: `SCHOOL`, `STAGE`, `GRADE`, `SECTION`
  - API request/response field: `scopeId`
  - storage should strongly consider the project pattern used by timetable and attendance: `scopeType`, `scopeKey`, plus nullable `stageId`, `gradeId`, and `sectionId` foreign keys for normalized referential integrity.
  - For `SCHOOL`, `scopeId` should be null.
  - For `STAGE`, `GRADE`, or `SECTION`, the relevant scope id is required and must belong to the same school.
- Dates:
  - `allDay`
  - `startDate`
  - `endDate`
  - Implementation should decide whether these are `DateTime` or date-only plus optional times. A minimal V1 can use `DateTime` values while presenters render all-day events as date-only.
- Audit/actor fields:
  - `createdByUserId`
  - `updatedByUserId`
  - optional `deletedByUserId` if consistent with final delete policy
- Lifecycle:
  - `deletedAt` is recommended because this is a business domain record.
  - `createdAt`
  - `updatedAt`

Recommended indexes/constraints:

- `@@unique([id, schoolId])`
- `@@index([schoolId])`
- `@@index([schoolId, academicYearId])`
- `@@index([schoolId, termId])`
- `@@index([schoolId, termId, startDate])`
- `@@index([schoolId, termId, type])`
- `@@index([schoolId, termId, scopeType, scopeKey])` if using scopeKey.
- `@@index([deletedAt])` if soft delete is used.

Recommended relations:

- `School`
- `AcademicYear`
- `Term`
- optional `Stage`
- optional `Grade`
- optional `Section`
- `User` for creator/updater.

The future migration must also register the model in `SCHOOL_SCOPED_MODELS` and, if soft deleted, `SOFT_DELETE_MODELS`.

## 8. Calendar route proposal

Proposed backend-native routes:

- `GET /api/v1/academics/calendar/events`
- `POST /api/v1/academics/calendar/events`
- `GET /api/v1/academics/calendar/events/:eventId`
- `PATCH /api/v1/academics/calendar/events/:eventId`
- `DELETE /api/v1/academics/calendar/events/:eventId`

Query filters for list:

- `academicYearId`
- `termId`
- `from`
- `to`
- `type`
- `scopeType`
- `scopeId`

Validation requirements:

- `startDate <= endDate`.
- Date range must be bounded. A future DTO should cap maximum span for list queries to avoid unbounded calendar scans.
- `academicYearId` must belong to the active school context.
- `termId` must belong to the same school and academic year.
- Event dates should be inside the selected academic year and preferably inside the selected term for V1.
- `scopeType = SCHOOL` requires `scopeId = null`.
- `scopeType = STAGE` requires a same-school stage id.
- `scopeType = GRADE` requires a same-school grade id and compatibility with the target stage/year/term where applicable.
- `scopeType = SECTION` requires a same-school section id and compatible grade/stage.
- Cross-school scope ids must return safe 404 or a validation error according to existing project conventions.
- Mutations should reject closed/read-only terms if a richer term status exists; if the current `Term.isActive` remains the only lifecycle field, the runtime sprint must document the chosen write policy explicitly.

Response direction:

- Return shaped DTOs, not raw Prisma rows.
- Do not expose `schoolId`, `organizationId`, raw membership details, raw tenant internals, or unrelated PII.
- Use ISO date strings.
- Include only safe actor summaries if the product requires creator/updater display.

## 9. Calendar permissions

Proposed permissions:

- `academics.calendar.view`
- `academics.calendar.manage`

Seed implications:

- Add both permissions to `prisma/seeds/01-permissions.seed.ts` during the runtime sprint.
- `platform_super_admin` receives them through `ALL`.
- `organization_admin` and `school_admin` receive them through `NON_PLATFORM` / `SCHOOL_LEVEL`.
- Teacher, parent, and student system role permission arrays should not receive these school-dashboard calendar permissions unless an explicit role-policy decision grants them.
- Security tests should assert teacher, parent, and student role seed arrays do not accidentally include school-dashboard calendar management permissions.

## 10. Academics Overview contract

Proposed route:

- `GET /api/v1/academics/overview?academicYearId=&termId=`

Academics Overview should be a read-only aggregation over existing source-of-truth data. It should not create an overview table in V1 unless a later performance decision explicitly approves cached summaries.

Proposed response sections:

- `generatedAt`
- `academicContext`
  - academic year id/name/start/end/status
  - term id/name/start/end/status
- `structure`
  - counts for stages, grades, sections, classrooms
  - setup indicators such as missing sections or missing classrooms if cheaply derivable
- `subjects`
  - subject count
  - active/inactive count
- `rooms`
  - room count
  - active/inactive count
- `teacherAllocation`
  - total allocations
  - teachers with allocations
  - classrooms with allocations
  - missing/overload markers only if derivable from existing allocation/timetable data without adding advanced analytics
- `curriculum`
  - curricula by status
  - active curricula count
  - draft/archive counts
- `lessonPlans`
  - lesson plans by status
  - lesson plan item status counts
  - completion percentage where meaningful
- `timetable`
  - config count
  - active/draft config count
  - active entry count
  - published publication count
  - open blocking conflict count
- `calendar`
  - total events in selected range/context
  - upcoming events count
  - events by type
  - next holiday date
  - next exam date
- `upcomingEvents`
  - small preview list of upcoming calendar events
- `setupIndicators`
  - compact readiness/completion indicators for structure, subjects, allocations, curriculum, lesson plans, timetable, and calendar
- `deferred`
  - markers for intentionally out-of-scope app-facing lesson browsing/preparation if needed

Response safety:

- Do not expose `schoolId`.
- Do not expose `organizationId`.
- Do not return raw Prisma rows.
- Do not expose raw tenant internals, raw storage fields, credentials, session data, or unrelated PII.
- Do not expose teacher, student, or parent private details beyond aggregated counts and safe labels required by the overview.

## 11. Overview permission

Proposed permission:

- `academics.overview.view`

Seed implications:

- Add to `prisma/seeds/01-permissions.seed.ts` during runtime implementation.
- School/admin-like roles inherit through existing seed grouping.
- Teacher, parent, and student system role arrays should remain excluded unless explicitly approved.
- Security tests should assert overview is permission-gated and app roles are denied by default.

## 12. Dashboard relationship

Sprint 20A must not replace Dashboard Summary.

Do not break:

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/alerts`
- `GET /api/v1/dashboard/activity-feed`

Academics Overview should be an Academics-specific read model with more detail about setup, readiness, curriculum, lesson plans, timetable, and calendar than the general Dashboard Summary card can provide.

Dashboard may continue using its own summary cards and alert preview logic. Any future Dashboard integration with Academic Calendar should be limited to safe counts/previews unless explicitly scoped. Dashboard alert lifecycle remains future work.

## 13. Teacher/Student/Parent relationship

Sprint 20A should not add app-facing calendar routes under Teacher App, Student App, or Parent App.

Existing schedule routes are timetable-backed read surfaces and should remain stable:

- `GET /api/v1/teacher/schedule`
- `GET /api/v1/teacher/schedule/week`
- `GET /api/v1/student/schedule`
- `GET /api/v1/student/schedule/week`
- `GET /api/v1/parent/children/:studentId/schedule/today`
- `GET /api/v1/parent/children/:studentId/schedule/weekly`

App-facing calendar surfaces are future sprints. They should consume Academics Calendar as source data through composition layers when approved.

Teacher App, Student App, and Parent App modules must not own calendar truth. They should not duplicate calendar storage, bypass Academics permissions, or infer calendar events from schedule rows.

Existing app contracts and route inventory should remain stable.

## 14. Security and tenancy requirements

Required security behavior for future runtime:

- School A cannot see or mutate School B calendar events.
- Calendar list, detail, update, and delete must be school-scoped through `RequestContext`, repository access, and `SCHOOL_SCOPED_MODELS`.
- Invalid cross-school event ids should return safe 404.
- Invalid cross-school scope ids should return safe 404 or validation errors according to existing conventions.
- Missing `academics.calendar.view`, `academics.calendar.manage`, or `academics.overview.view` must return forbidden.
- Parent, student, and teacher actors are denied school-dashboard calendar/overview unless role policy explicitly grants permission.
- Overview must always be school-scoped.
- No platform bypass for ordinary calendar or overview reads/writes.
- No global guard weakening.
- No Prisma access in controllers.
- No business logic in controllers.
- Presenters must remove `schoolId`, `organizationId`, raw tenant fields, storage internals, and unrelated PII.
- Calendar mutation DTOs must validate dates, type, scope, and academic context.
- Overview query DTO must validate UUID filters and should avoid unbounded expensive ranges.

## 15. Audit logging plan

Calendar mutations should be explicitly audited at service/use-case level:

- create event
- update event
- delete event

Proposed audit actions:

- `academics.calendar_event.create`
- `academics.calendar_event.update`
- `academics.calendar_event.delete`

Recommended audit metadata:

- event id
- academicYearId
- termId
- type
- scopeType
- scope id/key
- startDate
- endDate
- allDay
- status/deletedAt for deletes

Do not log excessive free text or PII. Avoid logging full descriptions/notes unless there is a specific compliance reason. Prefer id, status, type, date, and scope summaries.

## 16. Testing plan

Future module-local tests:

- `src/modules/academics/calendar/tests/...`
- `src/modules/academics/overview/tests/...`

Future E2E/security tests:

- `test/e2e/academics-calendar-overview-foundation.e2e-spec.ts`
- `test/security/tenancy.academics-calendar-overview.spec.ts`

Future package scripts:

- `test:e2e:sprint20a`
- `verify:sprint20a`

Unit/use-case/presenter coverage:

- Calendar date validation.
- Calendar scope validation.
- Calendar presenter hides tenant fields.
- Calendar audit payload summarization.
- Overview aggregation by academic year and term.
- Overview presenter hides tenant/raw fields.
- Overview setup indicators for empty and partially configured schools.

E2E coverage:

- Create calendar event.
- List calendar events by academicYearId, termId, date range, type, scopeType, and scopeId.
- Read calendar event detail.
- Update calendar event.
- Delete calendar event.
- Overview aggregation includes structure, subjects/rooms, teacher allocation, curriculum, lesson plans, timetable, calendar summary, upcoming events, and setup indicators.
- Calendar/overview routes are under `/api/v1`.
- Dashboard Summary still works and is not renamed or replaced.

Security coverage:

- Cross-school list/detail/update/delete isolation.
- Cross-school scope id rejection.
- Permission denial for missing view/manage/overview permissions.
- Teacher/parent/student denied by default for school-dashboard calendar/overview.
- No raw `schoolId`, `organizationId`, storage internals, credentials, session fields, or unrelated PII in responses.
- Route inventory keeps app-facing calendar routes absent.
- Existing app-facing schedule routes remain stable.
- Calendar mutations create audit logs with safe metadata.

## 17. Proposed implementation phases after this audit

1. Schema/domain lifecycle decision
   - Finalize event model name, scope storage pattern, date/time representation, and term write policy.
   - Decide whether `Term.isActive` is sufficient for V1 write enforcement or whether a richer term status needs a separate approved schema change.

2. Calendar model + CRUD
   - Add Prisma enums/model/migration.
   - Register school scope and soft delete.
   - Add repository, DTOs, presenters, use-cases, controller, and audit logging.

3. Overview read model
   - Add repository/use-case/presenter/DTO/controller.
   - Aggregate from existing Academics source models plus Calendar after it exists.
   - Keep it read-only.

4. Permissions/seeds/roles
   - Add `academics.calendar.view`.
   - Add `academics.calendar.manage`.
   - Add `academics.overview.view`.
   - Preserve app-role exclusions unless approved.

5. Security/E2E stabilization
   - Add cross-school isolation and permission tests.
   - Add route inventory tests for deferred app calendar routes.
   - Add payload leakage assertions.

6. Verification scripts + final closeout
   - Add targeted package scripts.
   - Add final closeout audit only after implementation and verification complete.

## 18. Risks and revisit triggers

Revisit Sprint 20A boundaries if any of these become required:

- Recurrence.
- Notifications.
- Email/SMS/push delivery.
- iCal import/export.
- App-facing Teacher calendar.
- App-facing Student calendar.
- App-facing Parent calendar.
- Lesson plan instructional week integration.
- Timetable conflict integration.
- Term closed/read-only enforcement if the current `Term` model lacks enough explicit status semantics.
- Dashboard analytics integration.
- Dashboard alert lifecycle.
- Calendar attachments.
- Calendar event participation/RSVP.
- Year-wide events that cannot fit a required `termId`.
- Performance pressure requiring cached overview tables.

## 19. Final recommendation

Sprint 20A should proceed, after this docs-only audit, as:

- Calendar schema + CRUD under Academics.
- Academics Overview read model under Academics.
- No app-facing calendar routes yet.

The most likely runtime architecture is:

- Add a school-scoped `AcademicCalendarEvent` model with explicit academic year, term, type, scope, date range, actor, and soft-delete metadata.
- Add calendar CRUD routes under `/api/v1/academics/calendar/events`.
- Add read-only overview route at `/api/v1/academics/overview`.
- Add `academics.calendar.view`, `academics.calendar.manage`, and `academics.overview.view`.
- Preserve Dashboard Summary and existing Teacher/Student/Parent schedule contracts.
