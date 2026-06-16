# Sprint 22A - Academics Remaining Gaps Contract Audit

## 1. Status

Status: COMPLETE for audit scope once this document is reviewed.

This sprint is docs-only. It does not implement runtime behavior, schema changes, seeds, migrations, tests, package scripts, README updates, generated files, deployment changes, or environment changes.

Academics is not complete today. The current backend has a solid core for structure, subjects, rooms, calendar, overview, curriculum, lesson content, lesson plans, timetable, schedule read models, homework, and grades. The remaining completion gaps are concentrated in subject allocation weekly hours, teacher allocation bulk/validation/load workflows, timetable dashboard completion workflows, lesson-plan week/auto-plan behavior, and app-facing lesson content/preparation/composition.

## 2. Purpose and Scope

Purpose: identify the exact remaining contract gaps needed to complete Academics across School Dashboard, Teacher App, Student App, and Parent App, then turn those gaps into an execution plan for Sprints 22B through 22J.

In scope:

- Inspect current code, Prisma schema, permissions, route contracts, tests, and sprint closeouts.
- Compare current implementation with the Academics dashboard handoff and related app-facing ADR intent.
- Separate implemented backend behavior from product intent, missing V1 requirements, and future enhancements.
- Produce a precise implementation plan without changing runtime code.

Out of scope:

- Code implementation.
- Prisma schema changes or migrations.
- Seed changes.
- Test changes.
- Route renames or breaking changes to shipped `/api/v1` contracts.
- Platform billing, finance, HR, wallet, marketplace, advanced pickup, advanced analytics builder, or other V1 exclusions.

## 3. Baseline

- Branch: `main`.
- Current HEAD observed: `b6567fb docs: finalize sprint 21 app-facing academic calendar`.
- Working tree before audit creation was clean: `git status --short --branch` returned `## main...origin/main`.
- Global route prefix is `/api/v1`, enforced in `src/main.ts` and covered by route inventory tests.

Evidence:

- `src/main.ts`
- `test/e2e/app-facing-academic-calendar.e2e-spec.ts`
- `test/e2e/academics-overview.e2e-spec.ts`
- `test/security/tenancy.academics-overview.spec.ts`

## 4. Sources Reviewed

Governance and architecture reviewed:

- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `DOMAIN_GLOSSARY.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `TESTING_STRATEGY.md`
- `ERROR_CATALOG.md`
- `OBSERVABILITY.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`

Missing or fallback governance source:

- `DIRECTORY_STRUCTURE.md` was not found in the repository.
- Fallback reviewed: `DIRECTORY_STRUCTURE_VISUAL.md`.

Primary Academics handoff reviewed:

- `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md`

Teacher App ADRs reviewed:

- `adr/Teacher-App/teacher_SCHEDULE_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_HOME_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_CLASSROOM_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_HOMEWORKS_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_MY_CLASSES_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_TASKS_BACKEND_MODELS.md`

Teacher App source note:

- No Teacher App ADR file with a `SUBJECT`, `LEARNING`, `LESSON`, or `CURRICULUM` filename was found. Teacher lesson preparation and lesson content gaps are inferred from schedule/classroom/homework ADRs plus the dashboard Academics handoff.

Student App ADRs reviewed:

- `adr/Student-App/student_SUBJECTS_BACKEND_MODEL.md`
- `adr/Student-App/student_SUBJECT_DETAILS_BACKEND_MODEL.md`
- `adr/Student-App/student_SCHEDULE_BACKEND_MODEL.md`
- `adr/Student-App/student_HOME_BACKEND_MODEL.md`
- `adr/Student-App/student_HOMEWORKS_BACKEND_MODEL.md`
- `adr/Student-App/student_EXAMS_BACKEND_MODEL.md`
- `adr/Student-App/student_GRADES_BACKEND_MODEL.md`
- `adr/Student-App/student_ATTACHMENTS_BACKEND_MODEL.md`

Parent App ADRs reviewed:

- `adr/Parent-App/parent_schedule.md`
- `adr/Parent-App/parent_children.md`
- `adr/Parent-App/parent_homeworks.md`
- `adr/Parent-App/parent_grades.md`
- `adr/Parent-App/parent_progress.md`
- `adr/Parent-App/parent_reports.md`
- `adr/Parent-App/parent_home.md`

Parent App source note:

- No Parent App ADR file with a `SUBJECT`, `LEARNING`, `LESSON`, or `CURRICULUM` filename was found. Parent child curriculum/content visibility gaps are inferred from child schedule/home/progress/homework/report intent plus the dashboard Academics handoff.

Existing sprint audits and closeouts reviewed:

- `docs/sprint-12a-schedule-timetable-core-contract-audit.md`
- `docs/sprint-15a-academics-curriculum-homework-completion-audit.md`
- `docs/sprint-15i-learning-flow-final-closeout-audit.md`
- `docs/sprint-16d-dashboard-foundation-final-closeout-audit.md`
- `docs/sprint-20a-academic-calendar-overview-contract-audit.md`
- `docs/sprint-20a-academic-calendar-overview-final-closeout-audit.md`
- `docs/sprint-21a-app-facing-academic-calendar-contract-audit.md`
- `docs/sprint-21d-app-facing-academic-calendar-final-closeout-audit.md`

Current code and schema reviewed:

- `src/modules/academics/**`
- `src/modules/teacher-app/**`
- `src/modules/student-app/**`
- `src/modules/parent-app/**`
- `src/modules/homework/**`
- `src/modules/grades/**`
- `src/modules/files/**`
- `src/modules/communication/**`
- `src/modules/reinforcement/**`
- `src/modules/dashboard/**`
- `src/app.module.ts`
- `src/common/**`
- `src/infrastructure/database/school-scope.extension.ts`
- `prisma/schema.prisma`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `test/e2e/**`
- `test/security/**`

## 5. ADR Interpretation Policy

ADR and handoff files are product intent references, not literal backend route contracts.

This audit does not recommend renaming or breaking existing shipped `/api/v1` routes. Existing controllers, DTOs, presenters, use cases, repositories, Prisma schema, tests, and closeout docs are treated as the source of truth for current implementation. ADRs are used to identify business capabilities and frontend workflows that still need backend support.

Adapter-backed and app-facing contracts must preserve route path, HTTP method, and base route naming unless a future sprint explicitly approves a compatibility plan.

Evidence:

- `API_CONTRACT_RULES.md`
- `ENGINEERING_RULES.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`
- `docs/sprint-21d-app-facing-academic-calendar-final-closeout-audit.md`

## 6. Current Implemented Academics Inventory

| Area | Status | Current state | Remaining gap or note | Evidence |
| --- | --- | --- | --- | --- |
| Academic structure | IMPLEMENTED DIFFERENTLY FROM ADR | CRUD/reorder exists for years, terms, stages, grades, sections, and classrooms under `academics/structure`. Structure is school-scoped. | Dashboard handoff describes term/year-scoped structure and carry-over. Current normalized structure is reusable across terms, but it cannot represent term-specific structure variations without an additional term configuration layer. | `src/modules/academics/structure/controller/structure.controller.ts`, `src/modules/academics/structure/application/**`, `prisma/schema.prisma`, `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md` |
| Academic years and terms | PARTIAL | Academic year and term CRUD exists. `Term.isActive` is presented as `open` or `closed` in structure/allocation responses. | `isActive` is used as both active/current context and closed/open write signal. Closed-term write protection is implemented for timetable and allocation create, but not consistently across structure, subjects, calendar, curriculum, lesson content, lesson plans, and allocation delete. | `src/modules/academics/structure/**`, `src/modules/academics/teacher-allocation/presenters/teacher-allocation.presenter.ts`, `src/modules/academics/timetable/domain/timetable-policy.ts`, `prisma/schema.prisma` |
| Subjects | IMPLEMENTED DIFFERENTLY FROM ADR | School-scoped subject CRUD exists. Subject DTO accepts `termId`/`stage`, but create/update persist only school-scoped subject fields. Presenter returns `termId: null` and `stage: null`. | ADR product intent expects term-scoped subjects or at least a term/grade allocation matrix. Current implementation should remain for subject catalog, with a separate allocation matrix added. | `src/modules/academics/subjects/controller/subjects.controller.ts`, `src/modules/academics/subjects/dto/subject.dto.ts`, `src/modules/academics/subjects/application/create-subject.use-case.ts`, `src/modules/academics/subjects/presenters/subjects.presenter.ts`, `prisma/schema.prisma` |
| Subject allocation matrix / weekly hours | ABSENT | No `SubjectAllocation` model, no `weeklyHours` field, no `academics/subject-allocations` controller/module/routes. | This is the most important missing foundation for teacher load, timetable validation, readiness, and frontend matrix workflows. | `prisma/schema.prisma`, `src/modules/academics/**`, `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md` |
| Rooms | COMPLETE | School-scoped rooms CRUD exists with active flag, capacity, floor, building, and timetable/classroom relationships. | No major V1 gap found. Permission currently uses `academics.structure.*`. | `src/modules/academics/rooms/controller/rooms.controller.ts`, `src/modules/academics/rooms/**`, `prisma/schema.prisma` |
| Teacher allocations | PARTIAL | List/create/delete exists under `academics/allocations`. Create validates active teacher membership, subject, classroom, term, active term, and uniqueness. | Missing bulk save, apply-to-grade, clear-subject, validation endpoint, teacher load analytics, carry-over, qualification model/logic, and delete closed-term protection. Route naming differs from ADR examples but must not be broken. | `src/modules/academics/teacher-allocation/controller/teacher-allocation.controller.ts`, `src/modules/academics/teacher-allocation/application/create-teacher-allocation.use-case.ts`, `src/modules/academics/teacher-allocation/application/delete-teacher-allocation.use-case.ts`, `src/modules/academics/teacher-allocation/infrastructure/teacher-allocation.repository.ts`, `prisma/schema.prisma` |
| Academic calendar | COMPLETE for CRUD, PARTIAL for workflows | Dashboard CRUD exists under `academics/calendar/events`. App-facing read-only calendar exists for Teacher, Student, and Parent. Events support school/stage/grade/section visibility and hide app-sensitive notes. | Notifications, reminders, recurrence, and calendar-driven messaging were intentionally deferred. Calendar CRUD does not currently enforce closed-term write protection. | `src/modules/academics/calendar/controller/calendar-events.controller.ts`, `src/modules/academics/calendar/app-facing/**`, `src/modules/teacher-app/calendar/**`, `src/modules/student-app/calendar/**`, `src/modules/parent-app/calendar/**`, `docs/sprint-20a-academic-calendar-overview-final-closeout-audit.md`, `docs/sprint-21d-app-facing-academic-calendar-final-closeout-audit.md` |
| Timetable | PARTIAL | Core timetable config, periods, entries, preview, computed conflicts, publication status, and publish flow exist. Writes validate term, scope, active days, allocation/classroom match, period, room, and teacher/classroom/room conflicts. | Missing bulk grid save, unpublish if product requires it, reset/delete/resolve config behavior, persisted conflict lifecycle use, conflict resolution, and subject weekly-hour validation. | `src/modules/academics/timetable/controller/timetable.controller.ts`, `src/modules/academics/timetable/application/**`, `src/modules/academics/timetable/infrastructure/timetable.repository.ts`, `prisma/schema.prisma`, `test/e2e/schedule-timetable-final-closeout.e2e-spec.ts` |
| Curriculum | PARTIAL | Curriculum CRUD/lifecycle, units, lessons, activation, archive, delete, validation, presenters, audits, and security coverage exist. | Carry-over is missing. Closed-term write protection is not implemented. App-facing curriculum browsing is not implemented. | `src/modules/academics/curriculum/controller/curriculum.controller.ts`, `src/modules/academics/curriculum/application/curriculum.use-cases.ts`, `test/e2e/academics-curriculum-foundation.e2e-spec.ts`, `test/security/tenancy.academics-curriculum.spec.ts` |
| Lesson content/resources | COMPLETE for dashboard core, PARTIAL for apps | Lesson content supports text, file, video link, and external link. File content uses `fileId` and presents safe file metadata. | No Teacher/Student/Parent app-facing content browsing or preparation routes. No direct multipart lesson-content upload route; files remain owned by Files and referenced by ID, which is architecturally acceptable. | `src/modules/academics/curriculum/dto/lesson-content.dto.ts`, `src/modules/academics/curriculum/domain/lesson-content-inputs.ts`, `src/modules/academics/curriculum/application/lesson-content.use-cases.ts`, `src/modules/academics/curriculum/presenters/lesson-content.presenter.ts`, `src/modules/files/**` |
| Lesson plans | PARTIAL | Lesson-plan CRUD/lifecycle, items, item reorder, item start/complete/skip/cancel/delete, status fields, timetable linkage, and audit logs exist. | Missing week summary, holiday-aware week generation, move/reschedule route, auto-plan, and closed-term write protection. `LessonPlanItemStatus.RESCHEDULED` and `rescheduledFromItemId` exist in schema but no runtime route completes the workflow. | `src/modules/academics/lesson-plans/controller/lesson-plans.controller.ts`, `src/modules/academics/lesson-plans/application/lesson-plans.use-cases.ts`, `src/modules/academics/lesson-plans/dto/lesson-plans.dto.ts`, `prisma/schema.prisma` |
| Academics overview | COMPLETE for current sources, PARTIAL for final readiness | `GET /api/v1/academics/overview` exists and summarizes active context, structure counts, subjects, rooms, teacher allocations, curriculum, lesson plans, timetable, calendar, setup checklist, and upcoming events. | Overview cannot report subject allocation matrix coverage or teacher load readiness until those sources exist. It is not a teacher/student/parent academics home. | `src/modules/academics/overview/controller/academics-overview.controller.ts`, `src/modules/academics/overview/infrastructure/academics-overview.repository.ts`, `docs/sprint-20a-academic-calendar-overview-final-closeout-audit.md` |
| App-facing Teacher academics surfaces | PARTIAL | Teacher calendar, schedule, home, my classes, classroom, attendance, grades, homework, tasks, messages, and XP surfaces exist. Schedule reads active published timetable entries for owned allocations. | Missing lesson preparation, owned curriculum/content browsing, lesson-plan week/preparation read models, and populated preparation indicators. | `src/modules/teacher-app/**`, `src/modules/teacher-app/schedule/**`, `src/modules/teacher-app/my-classes/presenters/teacher-class.presenter.ts`, `src/modules/teacher-app/access/teacher-app-access.service.ts` |
| App-facing Student academics surfaces | PARTIAL | Student calendar, schedule, home, subjects, homework, exams, grades, progress, behavior, announcements, tasks, messages, and hero surfaces exist. Subjects are allocation-backed and include grade stats. | Student subject detail intentionally returns empty lessons, assignments, and attachments with unsupported reasons. Curriculum units, lessons, lesson content, and academic-home composition are missing. | `src/modules/student-app/**`, `src/modules/student-app/subjects/presenters/student-subjects.presenter.ts`, `src/modules/student-app/subjects/infrastructure/student-subjects-read.adapter.ts`, `src/modules/student-app/access/student-app-access.service.ts` |
| App-facing Parent academics surfaces | PARTIAL | Parent child calendar, schedule, home, children, homework, grades, progress, reports, behavior, tasks, announcements, messages, and profile surfaces exist. | No child curriculum/lesson/content visibility route and no child academic-home composition that includes lesson progress/content. | `src/modules/parent-app/**`, `src/modules/parent-app/access/parent-app-access.service.ts`, `src/modules/parent-app/schedule/**`, `src/modules/parent-app/home/**` |
| Homework/Grades integrations affecting Academics | COMPLETE for current learning flow, PARTIAL for notifications/XP | Homework assignments, questions, answers, attachments, submission review, and grade sync are implemented. Grades assessments, gradebook, submissions, and app-facing grade reads exist. | Homework notifications and XP/reward side effects remain intentionally deferred. Lesson-plan to homework auto-generation is not implemented. | `src/modules/homework/**`, `src/modules/grades/**`, `docs/sprint-15i-learning-flow-final-closeout-audit.md`, `test/e2e/homework-final-closeout.e2e-spec.ts`, `test/e2e/grades-foundation.e2e-spec.ts` |
| Calendar/schedule separation | COMPLETE | Calendar events and timetable schedule are separate runtime surfaces. App-facing calendar uses `calendar/events`; schedule uses `schedule` routes and reads published timetable entries. | Maintain this separation in future composition endpoints. Do not collapse calendar events into timetable entries or vice versa. | `src/modules/academics/calendar/**`, `src/modules/teacher-app/schedule/**`, `src/modules/student-app/schedule/**`, `src/modules/parent-app/schedule/**`, `docs/sprint-21d-app-facing-academic-calendar-final-closeout-audit.md` |

## 7. School Dashboard Gap Analysis

### 7.1 Academic Structure

Current backend:

- Supports years, terms, tree, stages, grades, sections, classrooms, updates, deletes, and reorder.
- Uses school-scoped Stage/Grade/Section/Classroom storage.
- Terms expose `isActive`, presented as `open`/`closed` in some responses.

Gap:

- The dashboard handoff expects academic structure to be contextual to year/term and supports carry-over. Current structure can be used as a shared school catalog, but term-specific changes and carry-over semantics are not represented.

Classification:

- Product gap, not a backend bug.
- V1 must-have only if dashboard requires different structure per term. For the current remaining sprint plan, do not rewrite existing structure; add term-scoped capabilities only where required by subject allocation, teacher allocation, timetable, curriculum, and lesson planning.

Evidence:

- `src/modules/academics/structure/**`
- `prisma/schema.prisma`
- `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md`

### 7.2 Year/Term Context

Current backend:

- Year and term storage exists.
- Overview resolves active academic year and active term by `isActive`.
- Timetable and app schedule read models use academic year/term context.

Gap:

- `Term.isActive` is not a full term status model. It cannot cleanly distinguish current active term, open-for-writing term, closed term, archived term, and future planned term.
- Closed/open write protection is inconsistent:
  - Implemented in timetable via `assertTermWritable`.
  - Implemented in teacher allocation create.
  - Not consistently implemented in teacher allocation delete, calendar CRUD, curriculum CRUD, lesson content, lesson plans, subjects, or structure writes.

Classification:

- Backend consistency gap.
- V1 must-have for sensitive write flows that should respect closed terms.

Evidence:

- `src/modules/academics/timetable/domain/timetable-policy.ts`
- `src/modules/academics/timetable/application/**`
- `src/modules/academics/teacher-allocation/application/create-teacher-allocation.use-case.ts`
- `src/modules/academics/teacher-allocation/application/delete-teacher-allocation.use-case.ts`
- `src/modules/academics/calendar/application/calendar-event-use-case.helpers.ts`
- `src/modules/academics/curriculum/application/curriculum.use-cases.ts`
- `src/modules/academics/lesson-plans/application/lesson-plans.use-cases.ts`
- `prisma/schema.prisma`

### 7.3 Subject Allocation Matrix / Weekly Hours

Current backend:

- School subject catalog exists.
- Teacher allocation links a teacher, subject, classroom, and term.
- Timetable entries link to teacher allocations.

Gap:

- No allocation matrix exists for `(termId, gradeId, subjectId) -> weeklyHours`.
- No route exists for bulk matrix save.
- No weekly hours source exists for teacher load analytics, timetable readiness, or dashboard subject coverage.

Classification:

- Product gap and V1 must-have.
- This is the recommended next sprint.

Evidence:

- `src/modules/academics/subjects/**`
- `src/modules/academics/teacher-allocation/**`
- `src/modules/academics/timetable/**`
- `prisma/schema.prisma`
- `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md`

### 7.4 Teacher Allocation Workflows

Current backend:

- `GET /api/v1/academics/allocations`
- `POST /api/v1/academics/allocations`
- `DELETE /api/v1/academics/allocations/:id`
- Create validates active teacher membership, subject, classroom, term, active term, and duplicate allocation.

Missing dashboard workflows:

- Bulk save.
- Apply-to-grade.
- Clear-subject.
- Validation endpoint.
- Teacher load analytics.
- Carry-over.
- Qualification support.
- Consistent closed-term protection for delete and future bulk mutations.

Classification:

- Product gap and partial backend consistency gap.
- V1 must-have for dashboard completion.

Evidence:

- `src/modules/academics/teacher-allocation/controller/teacher-allocation.controller.ts`
- `src/modules/academics/teacher-allocation/application/**`
- `src/modules/academics/teacher-allocation/infrastructure/teacher-allocation.repository.ts`
- `prisma/schema.prisma`
- `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md`

### 7.5 Academic Calendar

Current backend:

- Calendar event CRUD exists for dashboard.
- Scope supports school, stage, grade, and section.
- App-facing read-only calendar exists for Teacher, Student, and Parent.
- Calendar routes are tested and use `/api/v1`.

Missing dashboard workflows:

- Notifications/reminders.
- Recurrence.
- Optional notify affected users workflow.
- Closed-term write protection, if calendar events in closed terms should be immutable.

Classification:

- CRUD is complete.
- Notification/reminder flows are intentionally deferred.
- Closed-term policy is a consistency gap to settle before final closeout.

Evidence:

- `src/modules/academics/calendar/**`
- `src/modules/academics/calendar/app-facing/**`
- `docs/sprint-20a-academic-calendar-overview-final-closeout-audit.md`
- `docs/sprint-21d-app-facing-academic-calendar-final-closeout-audit.md`
- `test/e2e/academics-calendar-events.e2e-spec.ts`
- `test/e2e/app-facing-academic-calendar.e2e-spec.ts`

### 7.6 Timetable

Current backend supports:

- Config get/upsert.
- Period list/create/update/delete.
- Entry list/detail/create/update/delete.
- Preview.
- Computed conflicts.
- Publication read.
- Publish.
- Conflict checks before entry writes.
- Closed-term protection on timetable writes.
- Active published entries consumed by Teacher, Student, and Parent schedule read models.

Missing dashboard workflows:

- Bulk grid save.
- Unpublish, if product confirms it is required in V1.
- Reset/delete config behavior.
- Resolve config route, if frontend needs inheritance/lookup behavior beyond current `GET config`.
- Persisted conflict generation/use.
- Conflict resolution lifecycle.
- Weekly-hour validation against subject allocation matrix.
- Clear handling for editing a published timetable: draft revision, patch-in-place, or unpublish-first.

Classification:

- Product gap and V1 must-have for dashboard completion.
- Current timetable core should be preserved and extended.

Evidence:

- `src/modules/academics/timetable/controller/timetable.controller.ts`
- `src/modules/academics/timetable/application/timetable-entry-write.helpers.ts`
- `src/modules/academics/timetable/application/timetable-conflicts.ts`
- `src/modules/academics/timetable/application/timetable-publication-readiness.ts`
- `src/modules/academics/timetable/infrastructure/timetable.repository.ts`
- `src/modules/teacher-app/schedule/**`
- `src/modules/student-app/schedule/**`
- `src/modules/parent-app/schedule/**`
- `prisma/schema.prisma`

### 7.7 Curriculum

Current backend supports:

- Curriculum list/create/detail/update.
- Activate/archive/delete.
- Units create/update/reorder/delete.
- Lessons create/update/reorder/delete.
- Validation against academic year, term, grade, and subject.
- Audit logging.

Missing dashboard workflows:

- Carry-over.
- Closed-term write protection.
- Any product-specific publish/unpublish beyond current activate/archive semantics, if needed by frontend.

Classification:

- Core is complete.
- Carry-over and closed-term consistency are remaining V1 gaps if dashboard completion requires them.

Evidence:

- `src/modules/academics/curriculum/controller/curriculum.controller.ts`
- `src/modules/academics/curriculum/application/curriculum.use-cases.ts`
- `src/modules/academics/curriculum/domain/curriculum.exceptions.ts`
- `test/e2e/academics-curriculum-foundation.e2e-spec.ts`
- `test/security/tenancy.academics-curriculum.spec.ts`

### 7.8 Lesson Content / Resources

Current backend supports:

- Text content.
- File content through `fileId`.
- Video link.
- External link.
- Safe file metadata presentation.
- Sort/reorder/delete/detail/list.
- Read-only behavior when parent curriculum is archived.

Missing dashboard workflows:

- Direct multipart upload from lesson content, if product wants it. Current file-by-ID approach is consistent with the architecture rule that Files owns storage.
- App-facing lesson content browsing.
- Closed-term write protection if content changes should be blocked for closed terms.

Classification:

- Dashboard core complete.
- App-facing runtime gap remains.

Evidence:

- `src/modules/academics/curriculum/dto/lesson-content.dto.ts`
- `src/modules/academics/curriculum/domain/lesson-content-inputs.ts`
- `src/modules/academics/curriculum/application/lesson-content.use-cases.ts`
- `src/modules/academics/curriculum/presenters/lesson-content.presenter.ts`
- `src/modules/files/**`

### 7.9 Lesson Plans

Current backend supports:

- Lesson-plan list/create/detail/update.
- Activate/archive/delete.
- Items create/update/reorder/delete.
- Item statuses: planned, in-progress, done, skipped, cancelled.
- Timetable entry validation when attached.
- Curriculum/unit/lesson validation.
- Audit logging.

Missing dashboard workflows:

- Week summary.
- Move/reschedule route.
- Holiday-aware week generation from term dates and calendar holidays.
- Auto-plan.
- Closed-term write protection.
- Stronger weekly readiness integration with subject allocation and timetable.

Classification:

- Product gap and V1 must-have if lesson planning is in Academics completion.

Evidence:

- `src/modules/academics/lesson-plans/controller/lesson-plans.controller.ts`
- `src/modules/academics/lesson-plans/application/lesson-plans.use-cases.ts`
- `src/modules/academics/lesson-plans/dto/lesson-plans.dto.ts`
- `src/modules/academics/calendar/dto/calendar-event.dto.ts`
- `prisma/schema.prisma`

### 7.10 Overview Readiness

Current backend:

- Overview endpoint summarizes implemented sources and readiness checklist.

Gap:

- Subject allocation matrix, weekly hours, teacher load analytics, timetable validation quality, lesson-plan week completion, and app-facing readiness are not available to overview because upstream data/workflows are missing.

Classification:

- Overview route is implemented.
- Final readiness is partial until Sprints 22B through 22I complete.

Evidence:

- `src/modules/academics/overview/controller/academics-overview.controller.ts`
- `src/modules/academics/overview/application/get-academics-overview.use-case.ts`
- `src/modules/academics/overview/infrastructure/academics-overview.repository.ts`
- `docs/sprint-20a-academic-calendar-overview-final-closeout-audit.md`

## 8. Teacher App Gap Analysis

### 8.1 Current Calendar Read Model

Status: COMPLETE.

Teacher App has read-only calendar routes:

- `GET /api/v1/teacher/calendar/events`
- `GET /api/v1/teacher/calendar/events/:eventId`

Events are derived from academic calendar scope visibility. Teacher app calendar mutations are intentionally absent.

Evidence:

- `src/modules/teacher-app/calendar/controller/teacher-calendar.controller.ts`
- `src/modules/academics/calendar/app-facing/**`
- `docs/sprint-21d-app-facing-academic-calendar-final-closeout-audit.md`
- `test/e2e/app-facing-academic-calendar.e2e-spec.ts`

### 8.2 Current Schedule / Timetable Read Status

Status: COMPLETE for published schedule reads, PARTIAL for preparation flags.

Teacher App schedule reads active published timetable entries for allocations owned by the current teacher. Route shape:

- `GET /api/v1/teacher/schedule`
- `GET /api/v1/teacher/schedule/week`

The DTO includes `isPrepared` and `hasHomework`, but current presenters set these as `null`.

Evidence:

- `src/modules/teacher-app/schedule/controller/teacher-schedule.controller.ts`
- `src/modules/teacher-app/schedule/infrastructure/teacher-schedule-read.adapter.ts`
- `src/modules/teacher-app/schedule/presenters/teacher-schedule.presenter.ts`
- `src/modules/teacher-app/schedule/dto/teacher-schedule.dto.ts`
- `test/e2e/schedule-timetable-final-closeout.e2e-spec.ts`

### 8.3 Classroom / Subject / Homework / Grades / Attendance Surfaces

Status: PARTIAL to COMPLETE depending on surface.

Implemented:

- `teacher/home`
- `teacher/my-classes`
- `teacher/classroom/:classId`
- `teacher/classroom/:classId/roster`
- `teacher/classroom/:classId/attendance/**`
- `teacher/classroom/:classId/grades/**`
- `teacher/classroom/:classId/assignments/**`
- `teacher/homeworks/**`
- `teacher/tasks/**`

Teacher App uses `TeacherSubjectAllocation.id` as app-facing `classId`, and ownership is enforced through `TeacherAppAccessService`.

Missing:

- Teacher lesson preparation surface.
- Teacher owned curriculum/unit/lesson/content browsing.
- Teacher lesson-plan week summary/read model.
- Prepared status and homework status composition for schedule/class cards.

Evidence:

- `src/modules/teacher-app/access/teacher-app-access.service.ts`
- `src/modules/teacher-app/access/teacher-app-access.domain.ts`
- `src/modules/teacher-app/my-classes/**`
- `src/modules/teacher-app/classroom/**`
- `src/modules/teacher-app/homeworks/**`
- `src/modules/teacher-app/classroom/grades/**`
- `src/modules/teacher-app/classroom/attendance/**`
- `test/e2e/teacher-app-final-closeout.e2e-spec.ts`

### 8.4 Ownership and Visibility Risks

Risks for future Teacher App Academics work:

- Do not let teachers access curriculum/lesson plans by raw `curriculumId` unless the content is tied to an owned allocation, subject, classroom, grade, and current term.
- Do not leak `schoolId`, `organizationId`, raw user IDs beyond contract-approved display IDs, internal notes, deleted rows, file storage keys, or raw Prisma rows.
- Preserve safe not-found behavior for same-school unowned and cross-school data.
- Teacher lesson preparation writes should be limited to owned allocations and writable terms.

Evidence:

- `src/modules/teacher-app/access/**`
- `SECURITY_MODEL.md`
- `PRISMA_CONVENTIONS.md`
- `test/security/tenancy.teacher-app.spec.ts`

## 9. Student App Gap Analysis

### 9.1 Current Calendar Read Model

Status: COMPLETE.

Student App has read-only calendar routes:

- `GET /api/v1/student/calendar/events`
- `GET /api/v1/student/calendar/events/:eventId`

Evidence:

- `src/modules/student-app/calendar/controller/student-calendar.controller.ts`
- `src/modules/academics/calendar/app-facing/**`
- `docs/sprint-21d-app-facing-academic-calendar-final-closeout-audit.md`
- `test/security/tenancy.app-facing-academic-calendar.spec.ts`

### 9.2 Current Schedule Read Status

Status: COMPLETE for published timetable reads.

Student schedule reads active published timetable entries for the current active enrollment classroom and term.

Routes:

- `GET /api/v1/student/schedule`
- `GET /api/v1/student/schedule/week`

Evidence:

- `src/modules/student-app/schedule/controller/student-schedule.controller.ts`
- `src/modules/student-app/schedule/infrastructure/student-schedule-read.adapter.ts`
- `src/modules/student-app/schedule/presenters/student-schedule.presenter.ts`
- `src/modules/student-app/access/student-app-access.service.ts`
- `test/e2e/schedule-timetable-final-closeout.e2e-spec.ts`

### 9.3 Current Subjects / Grades / Exams / Homework Surfaces

Status: PARTIAL.

Implemented:

- `GET /api/v1/student/subjects`
- `GET /api/v1/student/subjects/:subjectId`
- `GET /api/v1/student/grades`
- `GET /api/v1/student/grades/summary`
- `GET /api/v1/student/grades/assessments/:assessmentId`
- `GET /api/v1/student/exams`
- `GET /api/v1/student/exams/:assessmentId`
- `GET /api/v1/student/homeworks/**`
- `GET /api/v1/student/progress/**`
- `GET /api/v1/student/home`

Student subjects are allocation-backed and current-term/classroom-scoped. Subject stats are grade-derived.

Missing:

- Curriculum units.
- Lessons.
- Lesson content resources.
- Safe attachment/file download composition for lesson content.
- Lesson progress.
- Academic home composition that combines calendar, schedule, homework, grades, lesson content, and upcoming plan.

Important current behavior:

- Student subject detail returns empty `lessons`, `assignments`, and `attachments`.
- It returns unsupported metadata: `curriculum_lesson_resources_not_available` and `safe_subject_resource_links_not_available`.

Evidence:

- `src/modules/student-app/subjects/controller/student-subjects.controller.ts`
- `src/modules/student-app/subjects/infrastructure/student-subjects-read.adapter.ts`
- `src/modules/student-app/subjects/presenters/student-subjects.presenter.ts`
- `src/modules/student-app/home/**`
- `src/modules/student-app/homeworks/**`
- `src/modules/student-app/grades/**`
- `src/modules/student-app/exams/**`
- `src/modules/student-app/progress/**`

### 9.4 Enrollment / Current Context Risks

Risks for future Student App Academics work:

- All lesson/curriculum/content reads must be scoped through the current linked student, active enrollment, current classroom, academic year, and term.
- Content should be visible only for active curriculum and matching grade/subject/current enrollment context.
- Cross-school and same-school non-enrolled content must return safe not-found, not forbidden with existence leakage.
- Lesson content must not expose internal `schoolId`, `organizationId`, storage keys, deleted rows, teacher notes, or draft-only content.

Evidence:

- `src/modules/student-app/access/student-app-access.service.ts`
- `src/modules/student-app/shared/student-app-domain.ts`
- `src/modules/student-app/subjects/infrastructure/student-subjects-read.adapter.ts`
- `test/security/tenancy.student-app.spec.ts`

## 10. Parent App Gap Analysis

### 10.1 Current Child Calendar Status

Status: COMPLETE.

Parent App has read-only child calendar routes:

- `GET /api/v1/parent/children/:studentId/calendar/events`
- `GET /api/v1/parent/children/:studentId/calendar/events/:eventId`

Evidence:

- `src/modules/parent-app/calendar/controller/parent-calendar.controller.ts`
- `src/modules/parent-app/access/parent-app-access.service.ts`
- `src/modules/academics/calendar/app-facing/**`
- `docs/sprint-21d-app-facing-academic-calendar-final-closeout-audit.md`

### 10.2 Current Child Schedule Status

Status: COMPLETE for published timetable reads.

Parent schedule reads the owned child's active enrollment classroom and active published timetable entries.

Routes:

- `GET /api/v1/parent/children/:studentId/schedule/today`
- `GET /api/v1/parent/children/:studentId/schedule/weekly`

Evidence:

- `src/modules/parent-app/schedule/controller/parent-schedule.controller.ts`
- `src/modules/parent-app/schedule/infrastructure/parent-schedule-read.adapter.ts`
- `src/modules/parent-app/access/parent-app-access.service.ts`
- `test/e2e/schedule-timetable-final-closeout.e2e-spec.ts`

### 10.3 Current Child Grades / Reports / Progress / Homework Status

Status: PARTIAL to COMPLETE depending on surface.

Implemented:

- Child list/detail.
- Child homework list/detail.
- Child grades list/summary/detail.
- Child progress academic/behavior/XP.
- Child reports list/summary.
- Parent home.

Missing:

- Child curriculum/units/lessons/content visibility.
- Child academic-home composition that includes lesson plan/content readiness.
- Parent-friendly lesson resources and progress summaries.

Evidence:

- `src/modules/parent-app/children/**`
- `src/modules/parent-app/homeworks/**`
- `src/modules/parent-app/grades/**`
- `src/modules/parent-app/progress/**`
- `src/modules/parent-app/reports/**`
- `src/modules/parent-app/home/**`

### 10.4 Child Ownership and Leakage Risks

Risks for future Parent App Academics work:

- Parent reads must go through active guardian-child relation and active owned enrollment.
- Same-school unlinked child and cross-school child content must resolve to safe not-found.
- Child content must not expose internal guardian IDs, student private notes, school IDs, organization IDs, storage keys, deleted rows, draft teacher content, or unpublished curriculum.
- Parent content visibility may need separate product policy from student visibility.

Evidence:

- `src/modules/parent-app/access/parent-app-access.service.ts`
- `src/modules/parent-app/access/parent-app-guardian-read.adapter.ts`
- `src/modules/parent-app/shared/parent-app-domain.ts`
- `test/security/tenancy.parent-app.spec.ts`

## 11. Data Model Gap Analysis

### 11.1 Existing Academics Models

Existing core Academics models:

- `AcademicYear`
- `Term`
- `Stage`
- `Grade`
- `Section`
- `Classroom`
- `Subject`
- `TeacherSubjectAllocation`
- `Room`
- `AcademicCalendarEvent`
- `Curriculum`
- `CurriculumUnit`
- `CurriculumLesson`
- `LessonContentItem`
- `LessonPlan`
- `LessonPlanItem`
- `TimetableConfig`
- `TimetablePeriod`
- `TimetableEntry`
- `TimetablePublication`
- `TimetableConflict`

Related models used by Academics surfaces:

- `HomeworkAssignment`
- `HomeworkTarget`
- `HomeworkSubmission`
- `GradeAssessment`
- `GradeItem`
- `File`
- `Attachment`
- Communication notification models
- Reinforcement/XP models

Evidence:

- `prisma/schema.prisma`
- `src/infrastructure/database/school-scope.extension.ts`

### 11.2 Missing Models or Fields

Missing or likely-needed data model elements:

| Need | Current state | Likely schema need | Evidence |
| --- | --- | --- | --- |
| Subject allocation matrix / weekly hours | No model and no `weeklyHours` field. | Yes. Add a dedicated model for `(schoolId, academicYearId?, termId, gradeId, subjectId, weeklyHours)` with uniqueness and soft-delete/audit policy decided. | `prisma/schema.prisma`, `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md` |
| Teacher load analytics | Current teacher allocation can count assignments, but cannot calculate expected weekly load without weekly hours. | Maybe. Load can be computed after subject allocation exists. Teacher max load or qualifications may require new fields/models if product needs them. | `src/modules/academics/teacher-allocation/**`, `prisma/schema.prisma` |
| Teacher subject qualifications | ADR references qualifications; schema has no qualification model. | Maybe. Required only if validation must block unqualified teachers instead of warning. | `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md`, `prisma/schema.prisma` |
| Explicit term lifecycle | `Term.isActive` exists only as boolean. | Maybe. Future `TermStatus` may be safer if the product needs `PLANNED`, `OPEN`, `CLOSED`, `ARCHIVED`, and `CURRENT` separately. | `prisma/schema.prisma`, `src/modules/academics/structure/**` |
| Term-scoped structure | Stage/Grade/Section/Classroom are school-scoped. | Maybe. Avoid rewriting current structure. Add only if product must version structure by term/year. | `prisma/schema.prisma`, `src/modules/academics/structure/**` |
| Lesson-plan weeks / auto-plan | `LessonPlan.weekStartDate`, `weekEndDate`, items, `plannedDate`, `dayOfWeek`, `periodId`, and `rescheduledFromItemId` already exist. | Probably no new model for V1; compute weeks from terms + calendar holidays and persist output as existing lesson plans/items. | `prisma/schema.prisma`, `src/modules/academics/lesson-plans/**`, `src/modules/academics/calendar/**` |
| Timetable conflict persistence | `TimetableConflict` model exists, but current conflict listing is computed and persistence is not used as the primary lifecycle. | Probably no new model; implement persistence/resolution with existing model unless resolution metadata proves insufficient. | `prisma/schema.prisma`, `src/modules/academics/timetable/infrastructure/timetable.repository.ts`, `src/modules/academics/timetable/application/list-timetable-conflicts.use-case.ts` |
| Calendar notifications/reminders | Communication notification models exist, but no calendar-specific workflow is implemented. | Maybe. Requires event/template/recipient policy design, possibly queue jobs and templates. | `src/modules/communication/**`, `prisma/schema.prisma`, `docs/sprint-21d-app-facing-academic-calendar-final-closeout-audit.md` |

### 11.3 Term.isActive Assessment

`Term.isActive` is not enough for long-term closed/open behavior. It currently acts as:

- Active/current context for overview and app-facing current term resolution.
- Open/closed write flag in selected modules.

Future explicit status should be considered if the product needs separate concepts:

- Planned term.
- Current active term.
- Open for edits.
- Closed for edits.
- Archived historical term.

Do not change this in Sprint 22A. For Sprints 22B through 22E, use existing `isActive` carefully for closed-term write protection unless an explicit schema-design decision is approved.

Evidence:

- `src/modules/academics/structure/domain/structure-inputs.ts`
- `src/modules/academics/timetable/domain/timetable-policy.ts`
- `src/modules/academics/overview/infrastructure/academics-overview.repository.ts`
- `prisma/schema.prisma`

### 11.4 Structure School Scope Assessment

Current school-scoped structure is normalized and reusable. It avoids duplicating grade/section/classroom rows per term, which aligns with the architecture rule to keep database storage normalized.

Product gap:

- If the frontend requires different sections/classrooms per term or term-specific carry-over snapshots, the current model cannot represent that directly.

Recommendation:

- Do not rewrite structure during 22B.
- Model subject allocation by term/grade first.
- Add term-specific structure snapshot/config only if a later sprint proves it is required.

Evidence:

- `ARCHITECTURE_DECISION.md`
- `PRISMA_CONVENTIONS.md`
- `src/modules/academics/structure/**`
- `prisma/schema.prisma`

## 12. Route Inventory: Existing vs Missing

All routes below are under the global `/api/v1` prefix.

### 12.1 Existing School Dashboard Academics Routes

Academic structure:

- `GET /academics/structure/years`
- `POST /academics/structure/years`
- `PATCH /academics/structure/years/:id`
- `GET /academics/structure/terms`
- `POST /academics/structure/terms`
- `PATCH /academics/structure/terms/:id`
- `GET /academics/structure/tree`
- `POST /academics/structure/stages`
- `PATCH /academics/structure/stages/:id`
- `DELETE /academics/structure/stages/:id`
- `PATCH /academics/structure/stages/:id/reorder`
- `POST /academics/structure/grades`
- `PATCH /academics/structure/grades/:id`
- `DELETE /academics/structure/grades/:id`
- `PATCH /academics/structure/grades/:id/reorder`
- `POST /academics/structure/sections`
- `PATCH /academics/structure/sections/:id`
- `DELETE /academics/structure/sections/:id`
- `PATCH /academics/structure/sections/:id/reorder`
- `POST /academics/structure/classrooms`
- `PATCH /academics/structure/classrooms/:id`
- `DELETE /academics/structure/classrooms/:id`
- `PATCH /academics/structure/classrooms/:id/reorder`

Subjects:

- `GET /academics/subjects`
- `POST /academics/subjects`
- `PATCH /academics/subjects/:id`
- `DELETE /academics/subjects/:id`

Rooms:

- `GET /academics/rooms`
- `POST /academics/rooms`
- `PATCH /academics/rooms/:id`
- `DELETE /academics/rooms/:id`

Teacher allocations:

- `GET /academics/allocations`
- `POST /academics/allocations`
- `DELETE /academics/allocations/:id`

Calendar:

- `GET /academics/calendar/events`
- `POST /academics/calendar/events`
- `GET /academics/calendar/events/:eventId`
- `PATCH /academics/calendar/events/:eventId`
- `DELETE /academics/calendar/events/:eventId`

Overview:

- `GET /academics/overview`

Curriculum and lesson content:

- `GET /academics/curriculum`
- `POST /academics/curriculum`
- `GET /academics/curriculum/:curriculumId`
- `PATCH /academics/curriculum/:curriculumId`
- `POST /academics/curriculum/:curriculumId/activate`
- `POST /academics/curriculum/:curriculumId/archive`
- `DELETE /academics/curriculum/:curriculumId`
- `POST /academics/curriculum/:curriculumId/units`
- `PATCH /academics/curriculum/:curriculumId/units/:unitId`
- `PATCH /academics/curriculum/:curriculumId/units/:unitId/reorder`
- `DELETE /academics/curriculum/:curriculumId/units/:unitId`
- `POST /academics/curriculum/:curriculumId/units/:unitId/lessons`
- `PATCH /academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId`
- `PATCH /academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/reorder`
- `DELETE /academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId`
- `GET /academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content`
- `POST /academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content`
- `GET /academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId`
- `PATCH /academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId`
- `PATCH /academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId/reorder`
- `DELETE /academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId`

Lesson plans:

- `GET /academics/lesson-plans`
- `POST /academics/lesson-plans`
- `GET /academics/lesson-plans/:lessonPlanId`
- `PATCH /academics/lesson-plans/:lessonPlanId`
- `POST /academics/lesson-plans/:lessonPlanId/activate`
- `POST /academics/lesson-plans/:lessonPlanId/archive`
- `DELETE /academics/lesson-plans/:lessonPlanId`
- `POST /academics/lesson-plans/:lessonPlanId/items`
- `PATCH /academics/lesson-plans/:lessonPlanId/items/:itemId`
- `PATCH /academics/lesson-plans/:lessonPlanId/items/:itemId/reorder`
- `POST /academics/lesson-plans/:lessonPlanId/items/:itemId/start`
- `POST /academics/lesson-plans/:lessonPlanId/items/:itemId/complete`
- `POST /academics/lesson-plans/:lessonPlanId/items/:itemId/skip`
- `POST /academics/lesson-plans/:lessonPlanId/items/:itemId/cancel`
- `DELETE /academics/lesson-plans/:lessonPlanId/items/:itemId`

Timetable:

- `GET /academics/timetable/config`
- `PUT /academics/timetable/config`
- `GET /academics/timetable/periods`
- `POST /academics/timetable/periods`
- `PATCH /academics/timetable/periods/:periodId`
- `DELETE /academics/timetable/periods/:periodId`
- `GET /academics/timetable/entries`
- `GET /academics/timetable/entries/:entryId`
- `POST /academics/timetable/entries`
- `PATCH /academics/timetable/entries/:entryId`
- `DELETE /academics/timetable/entries/:entryId`
- `GET /academics/timetable/preview`
- `GET /academics/timetable/conflicts`
- `GET /academics/timetable/publication`
- `POST /academics/timetable/publish`

Evidence:

- `src/modules/academics/**/controller/*.controller.ts`
- `test/e2e/academics-overview.e2e-spec.ts`
- `test/e2e/academics-curriculum-foundation.e2e-spec.ts`
- `test/e2e/academics-lesson-content-foundation.e2e-spec.ts`
- `test/e2e/academics-lesson-plans-foundation.e2e-spec.ts`

### 12.2 Existing App-Facing Academics Routes

Teacher:

- `GET /teacher/calendar/events`
- `GET /teacher/calendar/events/:eventId`
- `GET /teacher/schedule`
- `GET /teacher/schedule/week`
- `GET /teacher/home`
- `GET /teacher/my-classes`
- `GET /teacher/my-classes/:classId`
- `GET /teacher/classroom/:classId`
- `GET /teacher/classroom/:classId/roster`
- `GET/POST/PUT/PATCH /teacher/classroom/:classId/attendance/**`
- `GET/POST/PATCH/PUT /teacher/classroom/:classId/grades/**`
- `GET/POST/PATCH/DELETE /teacher/classroom/:classId/assignments/**`
- `GET/POST/PATCH/DELETE /teacher/homeworks/**`

Student:

- `GET /student/calendar/events`
- `GET /student/calendar/events/:eventId`
- `GET /student/schedule`
- `GET /student/schedule/week`
- `GET /student/home`
- `GET /student/subjects`
- `GET /student/subjects/:subjectId`
- `GET/PUT/POST/PATCH/DELETE /student/homeworks/**`
- `GET /student/exams/**`
- `GET /student/grades/**`
- `GET /student/progress/**`

Parent:

- `GET /parent/children/:studentId/calendar/events`
- `GET /parent/children/:studentId/calendar/events/:eventId`
- `GET /parent/children/:studentId/schedule/today`
- `GET /parent/children/:studentId/schedule/weekly`
- `GET /parent/home`
- `GET /parent/children`
- `GET /parent/children/:studentId`
- `GET /parent/children/:studentId/homeworks/**`
- `GET /parent/children/:studentId/grades/**`
- `GET /parent/children/:studentId/progress/**`
- `GET /parent/children/:studentId/reports/**`

Evidence:

- `src/modules/teacher-app/**/controller/*.controller.ts`
- `src/modules/student-app/**/controller/*.controller.ts`
- `src/modules/parent-app/**/controller/*.controller.ts`
- `test/e2e/app-facing-academic-calendar.e2e-spec.ts`
- `test/e2e/teacher-app-final-closeout.e2e-spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/e2e/parent-app-final-closeout.e2e-spec.ts`

### 12.3 Missing or Incomplete Routes / Workflows

School Dashboard missing:

- Subject allocation matrix list/read/bulk save.
- Subject allocation carry-over, if needed.
- Teacher allocation bulk save.
- Teacher allocation apply-to-grade.
- Teacher allocation clear-subject.
- Teacher allocation validate.
- Teacher load analytics.
- Teacher allocation carry-over.
- Timetable bulk grid save.
- Timetable unpublish, if required.
- Timetable config resolve/reset/delete behavior.
- Timetable persisted conflict refresh/resolve.
- Timetable weekly-hour validation.
- Curriculum carry-over.
- Lesson-plan week summary.
- Lesson-plan generated weeks.
- Lesson-plan move/reschedule.
- Lesson-plan auto-plan.
- Optional calendar notify/reminder workflow.

App-facing missing:

- Teacher lesson preparation read/write surface.
- Teacher owned curriculum/lesson/content browsing.
- Student curriculum units/lessons/content browsing.
- Student lesson progress/content resources.
- Parent child curriculum/lesson/content visibility.
- Teacher/Student/Parent academics home or overview composition.

Evidence:

- `src/modules/academics/**`
- `src/modules/teacher-app/**`
- `src/modules/student-app/**`
- `src/modules/parent-app/**`
- `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md`
- `docs/sprint-15i-learning-flow-final-closeout-audit.md`

## 13. Security / Tenancy / Ownership Requirements

### 13.1 Existing Security Foundation

Current foundation:

- Global guards registered in `src/app.module.ts`: JWT, scope resolver, permissions.
- Request context middleware registered for all routes.
- Prisma school-scope extension includes Academics models and soft-delete filtering for applicable models.
- App-facing access services enforce teacher/student/parent ownership boundaries.

Evidence:

- `src/app.module.ts`
- `src/common/context/**`
- `src/common/guards/**`
- `src/infrastructure/database/school-scope.extension.ts`
- `src/modules/teacher-app/access/**`
- `src/modules/student-app/access/**`
- `src/modules/parent-app/access/**`

### 13.2 Dashboard Permission Requirements

Existing permissions:

- `academics.structure.view`
- `academics.structure.manage`
- `academics.subjects.view`
- `academics.subjects.manage`
- `academics.calendar.view`
- `academics.calendar.manage`
- `academics.overview.view`
- `academics.curriculum.view`
- `academics.curriculum.manage`
- `academics.lesson_plans.view`
- `academics.lesson_plans.manage`

Current timetable, rooms, and teacher allocation use `academics.structure.*`.

Future guidance:

- 22B can use `academics.subjects.*` for subject allocation matrix unless a new permission is approved.
- 22C can continue using `academics.structure.*` for teacher allocation workflows unless a new permission is approved.
- 22D can continue using `academics.structure.*` for timetable unless a new `academics.timetable.*` seed change is explicitly approved in that sprint.
- Any new permissions require seed and role updates with security tests.

Evidence:

- `prisma/seeds/01-permissions.seed.ts`
- `src/modules/academics/**/controller/*.controller.ts`

### 13.3 Required Ownership Rules by Gap

| Gap | Required security rule | Evidence anchor |
| --- | --- | --- |
| Subject allocation matrix | Dashboard-only. Require school scope, subject/grade/term same school, active non-deleted references, permission guard, and closed-term write protection. Do not expose tenant IDs in presenter. | `SECURITY_MODEL.md`, `src/infrastructure/database/school-scope.extension.ts`, `src/modules/academics/subjects/**` |
| Teacher allocation bulk/validation/load | Dashboard-only. Validate teacher active membership in same school, subject/classroom/term same school, term writable for mutations, safe duplicate handling, and no cross-school load leakage. | `src/modules/academics/teacher-allocation/**`, `prisma/schema.prisma` |
| Teacher App lesson preparation | Teacher must own `TeacherSubjectAllocation.id` route context. Content must match allocation subject/classroom/term. Writes only for writable terms and owned allocations. | `src/modules/teacher-app/access/teacher-app-access.service.ts`, `src/modules/teacher-app/access/teacher-app-access.domain.ts` |
| Student App lesson content | Student must be linked to authenticated user, have active enrollment, current classroom, academic year, and term. Content visible only for active curriculum matching current grade/subject. | `src/modules/student-app/access/student-app-access.service.ts`, `src/modules/student-app/subjects/infrastructure/student-subjects-read.adapter.ts` |
| Parent App lesson content | Parent must own child through active guardian-child relation and active enrollment. Content visible only for owned child context. | `src/modules/parent-app/access/parent-app-access.service.ts`, `src/modules/parent-app/access/parent-app-guardian-read.adapter.ts` |
| Timetable bulk/conflicts | Dashboard-only. All entries must belong to same school, term, config, classroom scope, period, allocation, teacher, subject, and room. Conflicts must not reveal cross-school data. | `src/modules/academics/timetable/application/timetable-entry-write.helpers.ts`, `src/modules/academics/timetable/application/timetable-conflicts.ts` |
| Lesson-plan auto-plan | Dashboard-only unless app-facing read models are added. Validate allocation, curriculum, lessons, timetable entries, and calendar holidays are same school/context. | `src/modules/academics/lesson-plans/application/lesson-plans.use-cases.ts`, `src/modules/academics/calendar/**` |

### 13.4 Non-Leakage Rules

Future Academics completion must not leak:

- `schoolId`
- `organizationId`
- Raw internal actor IDs
- Storage keys
- Deleted rows
- Raw Prisma rows
- Calendar/internal notes where app users should not see them
- Teacher-only lesson-plan notes to students/parents unless explicitly approved
- Draft/archived content to app users unless explicitly approved
- Platform bypasses in teacher/student/parent ownership flows

Evidence:

- `SECURITY_MODEL.md`
- `PRISMA_CONVENTIONS.md`
- `src/modules/academics/calendar/app-facing/presenters/app-calendar-event.presenter.ts`
- `src/modules/student-app/subjects/presenters/student-subjects.presenter.ts`
- `src/modules/teacher-app/homeworks/tests/teacher-homeworks.presenter.spec.ts`
- `src/modules/parent-app/homeworks/tests/parent-homeworks.presenter.spec.ts`

### 13.5 Required Future E2E / Security Coverage

Every runtime sprint from 22B through 22I must include:

- Happy-path E2E for new routes.
- Route inventory assertions with `/api/v1`.
- Permission denial tests for dashboard routes.
- Cross-school safe not-found or forbidden behavior as appropriate.
- Same-school unowned app access denial for Teacher/Student/Parent app routes.
- Soft-delete exclusion tests where models are soft-deleted.
- Presenter leakage tests for sensitive fields.
- Closed-term write protection tests where mutations touch term-scoped academics.
- No app-facing mutation tests for read-only app routes.

Evidence:

- `TESTING_STRATEGY.md`
- `test/security/tenancy.academics.spec.ts`
- `test/security/tenancy.academics-curriculum.spec.ts`
- `test/security/tenancy.academics-lesson-content.spec.ts`
- `test/security/tenancy.academics-lesson-plans.spec.ts`
- `test/security/tenancy.app-facing-academic-calendar.spec.ts`
- `test/security/tenancy.teacher-app.spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`

## 14. Remaining Sprint Plan 22B-22J

### 22B - Subject Allocation Matrix + Weekly Hours

Goal:

- Add the missing subject allocation matrix as the source of truth for grade/term subject weekly hours.

Scope:

- Design and implement schema for subject allocations.
- Add migration.
- Add module/use cases/repository/presenter/controller for list/read and bulk save.
- Decide whether route is under existing `/academics/subjects` or a new `/academics/subject-allocations` namespace. Preserve existing routes.
- Validate term, grade, subject, same school, active/non-deleted references, and weekly hour ranges.
- Add closed-term write protection.
- Integrate overview readiness counts lightly if scope allows.

Explicit non-goals:

- Teacher allocation bulk workflows.
- Timetable grid validation.
- App-facing lesson content.
- Notifications.
- Structure model rewrite.

Expected files/modules likely to change:

- `prisma/schema.prisma`
- `prisma/migrations/**`
- `src/modules/academics/academics.module.ts`
- New `src/modules/academics/subject-allocation/**` or equivalent under subjects.
- `src/modules/academics/overview/**` if adding summary counts.
- `prisma/seeds/01-permissions.seed.ts` only if new permission is approved.

Required tests:

- Unit/use-case tests for list/bulk save/validation.
- E2E route inventory and CRUD/bulk behavior.
- Security tenancy tests for cross-school, permission denial, soft-delete, closed-term writes.
- Presenter leakage tests.

Security coverage:

- Permission guard.
- Same-school grade/subject/term validation.
- Safe not-found/invalid-scope behavior.
- No raw Prisma rows or tenant IDs.

Risks:

- Uniqueness decision must handle soft delete vs upsert cleanly.
- If academic year is included in the model in addition to term, consistency must be enforced with `Term.academicYearId`.
- Existing school-scoped subjects must remain compatible.

Dependencies:

- Current subject catalog, structure, and term models.

Definition of Done:

- Matrix can represent weekly hours per term/grade/subject.
- Bulk save is atomic and validated.
- Closed-term writes are blocked.
- Route inventory and security tests pass.
- No existing subject routes break.

Schema/migration likely needed:

- Yes.

### 22C - Teacher Allocation Validation / Load / Bulk Workflows

Goal:

- Complete dashboard teacher allocation workflows using subject allocation weekly hours.

Scope:

- Add bulk save.
- Add apply-to-grade.
- Add clear-subject.
- Add validation.
- Add teacher load analytics.
- Add carry-over if product confirms V1 need.
- Compute load from allocations plus subject allocation weekly hours.
- Enforce term writable for all mutations, including delete.

Explicit non-goals:

- Timetable grid save.
- App-facing lesson content.
- Teacher lesson preparation runtime.
- New HR/teacher profile module.

Expected files/modules likely to change:

- `src/modules/academics/teacher-allocation/**`
- Subject allocation repository/read service from 22B.
- `src/modules/academics/overview/**` if teacher-load readiness is surfaced.
- Tests under `test/e2e/**` and `test/security/**`.
- `prisma/schema.prisma` only if teacher max load or qualification persistence is approved.

Required tests:

- Bulk atomicity and duplicate handling.
- Apply-to-grade across grade classrooms.
- Clear-subject safety.
- Validation warnings/errors.
- Teacher load calculations.
- Closed-term create/delete/bulk/apply/clear denial.
- Cross-school teacher, subject, classroom, and term denial.

Security coverage:

- Dashboard permission guard.
- Active teacher membership same school.
- Same-school references.
- No load analytics leakage across schools.

Risks:

- Teacher max load is not currently modeled; product may need either a default policy or a schema addition.
- Qualification validation may require new schema if blocking validation is expected.

Dependencies:

- 22B subject allocation matrix.

Definition of Done:

- Dashboard can manage teacher allocations in all expected matrix workflows.
- Teacher load analytics are reliable enough for overview/timetable readiness.
- Existing `/academics/allocations` routes remain compatible.

Schema/migration likely needed:

- Maybe. No schema needed for computed load from 22B matrix; schema likely needed for teacher qualifications or max load if product requires persisted settings.

### 22D - Timetable Dashboard Completion Gaps

Goal:

- Complete dashboard timetable workflows around bulk grid operations, validation, publication lifecycle, and conflict persistence.

Scope:

- Add bulk grid save with atomic validation.
- Add validation endpoint or enrich existing preview/conflicts to include subject-hour coverage from 22B.
- Use or complete `TimetableConflict` persistence lifecycle.
- Add conflict resolution behavior if product confirms manual resolution is needed.
- Add reset/delete config behavior.
- Add config resolve behavior only if current `GET config` is not sufficient.
- Decide and implement unpublish/revision behavior if required.

Explicit non-goals:

- Rewriting existing schedule app routes.
- Replacing timetable core.
- Implementing calendar notifications.

Expected files/modules likely to change:

- `src/modules/academics/timetable/**`
- Subject allocation read service from 22B.
- Teacher allocation read/load service from 22C.
- `prisma/schema.prisma` only if existing conflict/publication schema is insufficient.
- E2E/security tests.

Required tests:

- Bulk grid save success/failure atomicity.
- Classroom/teacher/room conflict checks.
- Weekly hours under/over/exact validation.
- Published config mutation policy.
- Persisted conflict refresh/resolution if implemented.
- Cross-school and permission tests.
- App schedule reads remain unchanged.

Security coverage:

- Permission guard.
- Same-school config, period, entry, allocation, teacher, classroom, subject, room, term.
- Closed-term mutation denial.
- No conflict leakage across schools.

Risks:

- Unpublish can disrupt Teacher/Student/Parent schedule read models; product must approve behavior.
- Bulk grid save can create partial-write risk without transaction boundaries.

Dependencies:

- 22B subject allocation matrix.
- 22C teacher allocation validation/load.

Definition of Done:

- Dashboard timetable grid can be saved, validated, published, and inspected without manual single-entry workflows.
- Conflict behavior is deterministic.
- Published schedule app routes still read active entries safely.

Schema/migration likely needed:

- Probably no, because `TimetableConflict` already exists. Maybe if publication/unpublish metadata is insufficient.

### 22E - Lesson Plan Week/Summary/Auto-Plan Completion

Goal:

- Complete dashboard lesson-plan planning workflows around teaching weeks, summary, movement, and auto-plan.

Scope:

- Add week summary endpoint.
- Add holiday-aware week generation from term dates and academic calendar holidays.
- Add move/reschedule behavior for lesson-plan items.
- Add auto-plan workflow from curriculum lessons plus timetable and allocation context.
- Enforce closed-term write protection.
- Preserve existing lesson-plan routes.

Explicit non-goals:

- App-facing teacher/student/parent content runtime.
- Homework auto-generation unless explicitly approved.
- AI generation or advanced analytics.

Expected files/modules likely to change:

- `src/modules/academics/lesson-plans/**`
- `src/modules/academics/calendar/**` read integration for holidays.
- `src/modules/academics/timetable/**` read integration for available slots.
- `src/modules/academics/curriculum/**` read integration for lessons.
- Tests.

Required tests:

- Week generation across term boundaries.
- Holiday exclusion/lost teaching day calculations.
- Auto-plan deterministic ordering.
- Move/reschedule status/metadata.
- Closed-term mutation denial.
- Cross-school validation for curriculum, timetable, allocation, and calendar.

Security coverage:

- Permission guard.
- Same-school references.
- No internal note leakage in summaries.
- Audit logging for sensitive plan mutations.

Risks:

- Holiday-aware behavior can be product-sensitive; define exact date inclusion rules before implementation.
- Auto-plan can overreach; keep first version deterministic and explainable.

Dependencies:

- Existing curriculum, lesson content, timetable, calendar, teacher allocation.
- 22B/22C/22D improves validation quality but core week generation can be built from existing data.

Definition of Done:

- Dashboard can generate teaching weeks, view weekly summary, move/reorder items, and auto-plan from curriculum lessons.
- Existing lesson-plan CRUD remains compatible.

Schema/migration likely needed:

- Probably no. Existing `LessonPlan`, `LessonPlanItem`, `plannedDate`, `dayOfWeek`, `periodId`, `rescheduledFromItemId`, and item status fields are likely enough.

### 22F - App-Facing Lesson Content / Lesson Preparation Contract Audit

Goal:

- Produce a focused contract audit for Teacher, Student, and Parent lesson content/preparation surfaces before runtime implementation.

Scope:

- Inventory required app-facing routes and response DTOs.
- Decide Teacher lesson preparation contract.
- Decide Student subject/unit/lesson/content contract.
- Decide Parent child lesson visibility contract.
- Define file metadata and signed download policy.
- Define visibility rules for active/draft/archived curriculum and teacher notes.
- Define whether app-facing routes are read-only except teacher preparation.

Explicit non-goals:

- Runtime implementation.
- Schema change unless audit proves it is unavoidable.

Expected files/modules likely to change:

- New docs file under `docs/**`.

Required tests:

- None in audit sprint, but specify required E2E/security tests for 22G.

Security coverage:

- Teacher ownership via allocations.
- Student active enrollment.
- Parent active guardian-child ownership.
- No tenant/internal leakage.

Risks:

- Product may not want parents to see all lesson content visible to students.
- Teacher preparation writes may need separate status schema if current lesson-plan status is insufficient.

Dependencies:

- 22E clarifies lesson-plan/preparation behavior.

Definition of Done:

- Runtime prompts for 22G have exact routes, DTOs, ownership rules, and non-goals.

Schema/migration likely needed:

- No for audit.

### 22G - App-Facing Lesson Content / Lesson Preparation Runtime

Goal:

- Implement app-facing lesson content and teacher preparation runtime based on 22F.

Scope:

- Add Teacher App owned curriculum/content/preparation routes.
- Add Student App subject curriculum/unit/lesson/content routes or enrich existing subject detail.
- Add Parent App owned child curriculum/unit/lesson/content routes if approved.
- Integrate file metadata and signed download links through Files policy.
- Populate teacher `isPrepared` and possibly student/parent lesson progress fields where safely available.

Explicit non-goals:

- Dashboard subject allocation or timetable work.
- Notifications.
- AI/advanced generation.
- Replacing existing Student `subjects` route unless 22F approves compatible enrichment.

Expected files/modules likely to change:

- `src/modules/teacher-app/**`
- `src/modules/student-app/**`
- `src/modules/parent-app/**`
- `src/modules/academics/curriculum/**` read services as shared source.
- `src/modules/files/**` only for safe download composition if needed.
- E2E/security tests.

Required tests:

- Teacher owned allocation content read.
- Teacher unowned same-school/cross-school denial.
- Student current enrollment content read.
- Student unowned subject denial.
- Parent owned child content read.
- Parent unowned child denial.
- File metadata/signed URL safety.
- Presenter leakage tests.

Security coverage:

- App ownership services must be the entry point.
- No platform bypass.
- No draft/archived content leakage.
- Safe not-found for unauthorized resources.

Risks:

- Content visibility status is currently tied to curriculum status but not separate lesson content publish status.
- Signed URL behavior must not expose storage keys.

Dependencies:

- 22F contract audit.

Definition of Done:

- Apps can browse the approved lesson content/preparation surfaces safely.
- Existing app routes remain compatible.

Schema/migration likely needed:

- Maybe no. Needed only if 22F decides preparation status cannot be derived from existing lesson plans/items.

### 22H - App-Facing Academics Home / Overview Composition

Goal:

- Compose richer Teacher, Student, and Parent academics home/overview surfaces using completed calendar, schedule, homework, grades, progress, curriculum, and lesson-plan data.

Scope:

- Add or enrich app home composition with academic cards/slices.
- Teacher: upcoming lessons, preparation gaps, homework/grade/attendance follow-ups.
- Student: today schedule, upcoming homework/exams, subject progress, next lessons/content.
- Parent: per-child schedule, homework, grades/progress, next lesson/content visibility.
- Keep app modules as composition/read-model modules.

Explicit non-goals:

- New core domain behavior.
- Dashboard overview rewrite.
- Advanced analytics builder.

Expected files/modules likely to change:

- `src/modules/teacher-app/home/**`
- `src/modules/student-app/home/**`
- `src/modules/parent-app/home/**`
- Maybe app-specific overview modules if new routes are preferred.
- Read adapters in app modules.
- E2E/security tests.

Required tests:

- Composition uses only owned scoped data.
- Missing optional slices degrade safely.
- No raw tenant/internal fields.
- Cross-school leakage tests.
- Route inventory.

Security coverage:

- Teacher allocations.
- Student active enrollment.
- Parent owned children.
- Scoped Prisma only.

Risks:

- Over-composition can make slow endpoints. Use focused read models and limits.
- Avoid duplicating dashboard overview in app modules.

Dependencies:

- 22G lesson content/preparation runtime.

Definition of Done:

- App home surfaces can represent Academics readiness without unsupported placeholders.
- Existing home contracts remain backward compatible.

Schema/migration likely needed:

- No.

### 22I - Final Academics Completion E2E/Security Sweep

Goal:

- Prove Academics completion across dashboard and apps with final test coverage and route inventories.

Scope:

- Add missing E2E coverage across subject allocation, teacher allocation, timetable, lesson plans, app lesson content, and app academics home.
- Add or update security tests for tenancy, ownership, closed terms, soft delete, permission denial, and non-leakage.
- Verify route inventory and absence of intentionally deferred routes.
- Fix runtime bugs discovered by tests.

Explicit non-goals:

- New product features not already planned in 22B-22H.
- Schema churn unless a bug cannot be fixed otherwise.

Expected files/modules likely to change:

- `test/e2e/**`
- `test/security/**`
- Runtime modules only for bug fixes discovered by tests.

Required tests:

- Full route inventory for Academics and app-facing Academics.
- Cross-school dashboard routes.
- Teacher ownership.
- Student enrollment/current context.
- Parent child ownership.
- Closed-term mutation denial.
- Soft-delete exclusion.
- Presenter non-leakage.

Security coverage:

- This sprint is primarily security coverage.

Risks:

- Hidden edge cases may surface late.
- Fixes must remain scoped and avoid new product scope.

Dependencies:

- 22B through 22H runtime completion.

Definition of Done:

- Security and E2E evidence supports declaring Academics complete except documented intentional deferrals.

Schema/migration likely needed:

- Unlikely.

### 22J - Final Academics Closeout Audit

Goal:

- Produce final closeout audit declaring what is complete, what is intentionally deferred, and what evidence supports completion.

Scope:

- Docs-only closeout.
- Compare final implementation against Sprint 22A plan, ADR intent, route inventory, tests, and security coverage.
- Explicitly list intentional deferrals and future enhancements.

Explicit non-goals:

- Runtime implementation.
- Tests.
- Schema changes.

Expected files/modules likely to change:

- New docs file under `docs/**`.

Required tests:

- None in the closeout sprint, but cite tests run in 22I.

Security coverage:

- Document evidence, do not add coverage.

Risks:

- Closeout must not overstate completion.

Dependencies:

- 22I completion.

Definition of Done:

- Academics completion status is clear, evidence-based, and reviewable.

Schema/migration likely needed:

- No.

## 15. Risk Register

| Risk | Type | Severity | Mitigation | Evidence |
| --- | --- | --- | --- | --- |
| Subject allocation matrix absent | Product/backend gap | High | Start 22B with schema/domain design and migration. | `prisma/schema.prisma`, `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md` |
| `Term.isActive` overloaded | Domain model risk | High | Use current flag consistently in near term; consider explicit status model only when approved. | `prisma/schema.prisma`, `src/modules/academics/timetable/domain/timetable-policy.ts` |
| Closed-term write protection inconsistent | Backend consistency/security | High | Add write guards in 22B-22E as touched; test every mutation path. | `src/modules/academics/**`, `test/security/**` |
| Teacher load cannot be computed accurately | Product gap | High | Depend on 22B weekly hours; decide max-load and qualification persistence in 22C. | `src/modules/academics/teacher-allocation/**`, `prisma/schema.prisma` |
| Timetable conflict persistence model exists but is not the primary runtime lifecycle | Backend gap | Medium | Complete persistence/refresh/resolve behavior in 22D or explicitly document computed-only behavior. | `prisma/schema.prisma`, `src/modules/academics/timetable/infrastructure/timetable.repository.ts` |
| App-facing lesson content may leak draft/internal content | Security risk | High | Gate through app access services, active curriculum/content policy, and presenters; add security tests in 22G. | `src/modules/teacher-app/access/**`, `src/modules/student-app/access/**`, `src/modules/parent-app/access/**` |
| Parent visibility policy for lesson content is not explicit | Product ambiguity | Medium | Resolve in 22F audit before implementation. | `adr/Parent-App/**`, `src/modules/parent-app/**` |
| Bulk workflows can partially write data | Runtime risk | High | Use transactions and all-or-nothing validation in 22B-22D. | `ENGINEERING_RULES.md`, `PRISMA_CONVENTIONS.md` |
| Unpublish timetable could break app schedules | Product/runtime risk | Medium | Decide unpublish semantics in 22D; test app schedule fallback/empty state. | `src/modules/teacher-app/schedule/**`, `src/modules/student-app/schedule/**`, `src/modules/parent-app/schedule/**` |
| Overview may overstate readiness | Product risk | Medium | After 22B-22E, update overview to include real matrix/load/timetable/lesson-plan readiness. | `src/modules/academics/overview/**` |
| Notification/reminder workflows expand scope | Scope risk | Medium | Keep intentionally deferred unless explicitly approved. | `V1_SCOPE.md`, `docs/sprint-21d-app-facing-academic-calendar-final-closeout-audit.md` |

## 16. Final Recommendation

Academics cannot be considered complete today.

Before declaring Academics fully complete, the backend must add or finish:

- Subject allocation matrix with weekly hours.
- Teacher allocation validation, load analytics, bulk save, apply-to-grade, clear-subject, and carry-over if approved.
- Consistent closed-term write protection for remaining term-scoped write flows.
- Timetable bulk grid save, validation, conflict persistence/resolution policy, config reset/resolve behavior, and unpublish if required.
- Lesson-plan week summary, holiday-aware week generation, move/reschedule, and auto-plan.
- App-facing lesson content and lesson preparation contracts and runtime.
- App-facing Academics home/overview composition.
- Final E2E/security sweep and closeout audit.

Recommended next sprint: 22B - Subject Allocation Matrix + Weekly Hours.

Yes, 22B should start with schema/domain design for the subject allocation matrix. That model is the prerequisite for weekly-hour validation, teacher load analytics, timetable readiness, and the dashboard allocation matrix. Keep the existing school-scoped `Subject` catalog intact and add the matrix as a separate term/grade/subject source of truth.

Intentional deferrals that should remain out of 22B unless explicitly approved:

- Calendar notifications/reminders.
- Homework notifications/XP/rewards.
- Platform billing, finance, HR, wallet, marketplace, advanced pickup, and advanced analytics builder.
- Rewriting existing shipped `/api/v1` routes.
