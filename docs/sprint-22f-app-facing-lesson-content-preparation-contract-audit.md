# Sprint 22F — App-Facing Lesson Content / Lesson Preparation Contract Audit

## 1. Baseline

- Current commit expected: `32f53c0 feat: complete lesson plan planning workflows`.
- Audit date: 2026-06-16.
- This sprint is audit-only. No runtime behavior, API routes, source code, Prisma schema, migrations, seeds, tests, package scripts, generated files, deployment files, README files, or project-structure files are intended to change.
- Expected output for this sprint is this document only: `docs/sprint-22f-app-facing-lesson-content-preparation-contract-audit.md`.

## 2. Scope

In scope:

- Teacher App lesson preparation/read model surfaces.
- Teacher App lesson-plan item status/preparation updates where they can safely build on current `LessonPlanItem` semantics.
- Student App lesson content/read model surfaces for the current enrollment/classroom.
- Parent App child-scoped lesson content/read model surfaces.
- Relationship between app-facing lessons and current `Curriculum`, `CurriculumUnit`, `CurriculumLesson`, `LessonContentItem`, `LessonPlan`, `LessonPlanItem`, `TimetableEntry`, `TeacherSubjectAllocation`, and `AcademicCalendarEvent` data.
- Security, tenancy, ownership, visibility, and testing requirements for the future app-facing implementation sprint.

Out of scope:

- School Dashboard curriculum, lesson content, and lesson-plan management routes already delivered by Sprint 15 and Sprint 22E.
- Timetable bulk/grid workflows, conflict validation, publication, or schedule routing changes.
- Teacher allocation validation/load/bulk workflows.
- Subject allocation weekly-hours matrix changes.
- Homework submission, homework grading, gradebook, attendance, behavior, reinforcement, messages, or file upload/download runtime changes except as dependencies.
- New schema or migration unless a later implementation sprint explicitly decides a product rule cannot be represented safely with current models.
- Teacher/Student/Parent app route implementation in this sprint.

## 3. Product Intent From ADR / Prior Audits

### Explicitly documented requirement

- `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md` defines dashboard Academics capabilities for curriculum, lessons, lesson content/resources, and lesson plans. It expects lesson resources with text/file/video/external-link support, lesson-plan item lifecycle, week context, summaries, and holiday-aware planning.
- `docs/sprint-15i-learning-flow-final-closeout-audit.md` records dashboard curriculum, lesson content, and lesson-plan foundation completion while explicitly deferring Teacher/Student/Parent app-facing lesson preparation and browsing.
- `docs/sprint-22a-academics-remaining-gaps-contract-audit.md` identifies app-facing teacher lesson preparation, student lesson content browsing, and parent child-scoped lesson content visibility as remaining Academics gaps after dashboard/core work.
- Existing E2E route inventory asserts app-facing lesson-preparation/content routes are absent:
  - `test/e2e/academics-lesson-plans-foundation.e2e-spec.ts`
  - `test/e2e/academics-lesson-plan-workflows.e2e-spec.ts`
  - `test/e2e/academics-lesson-content-foundation.e2e-spec.ts`
  - `test/e2e/academics-curriculum-foundation.e2e-spec.ts`

### Inferred requirement

- Teacher App should use `TeacherSubjectAllocation.id` as the teacher-owned class/allocation boundary, then join to lesson-plan items and curriculum content only for owned allocations. This follows `src/modules/teacher-app/access/teacher-app-access.service.ts` and `src/modules/teacher-app/access/teacher-app-access.domain.ts`.
- Student App lessons should be scoped by the active student enrollment, current classroom, academic year, and term. This follows `src/modules/student-app/access/student-app-access.service.ts` and `src/modules/student-app/shared/student-app-domain.ts`.
- Parent App lessons should be scoped by active guardian-child relation and the child's active enrollment. This follows `src/modules/parent-app/access/parent-app-access.service.ts` and `src/modules/parent-app/shared/parent-app-domain.ts`.
- Today/week lesson views should reuse the same date/week shape as app schedule routes because the current schedule modules already expose published timetable entries for Teacher/Student/Parent apps.

### Unknown / needs product decision

- Student and parent visibility rule: whether content is visible when a curriculum is `ACTIVE`, when a lesson plan is `ACTIVE`, when a timetable entry is published, when planned date arrives, when a teacher marks an item `IN_PROGRESS`/`DONE`, or some combination.
- Whether "prepared" is a distinct Teacher App state. Current `LessonPlanItemStatus` has `PLANNED`, `IN_PROGRESS`, `DONE`, `SKIPPED`, `RESCHEDULED`, and `CANCELLED`; it does not have `PREPARED`.
- Whether `LessonPlanItem.notes` may be used as teacher preparation notes or whether teacher-private preparation notes require a future field/model.
- Whether file content should return only file metadata or also signed download URLs in app-facing lesson content responses.

## 4. Current Backend Inventory

### 4.1 School Dashboard lesson-plan routes

All routes are under the global `/api/v1` prefix. Controller source: `src/modules/academics/lesson-plans/controller/lesson-plans.controller.ts`.

| Method | Path | Controller | Permission | Purpose | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/academics/lesson-plans` | `LessonPlansController.listLessonPlans` | `academics.lesson_plans.view` | Dashboard list of lesson plans. | existing / dashboard complete |
| POST | `/api/v1/academics/lesson-plans` | `LessonPlansController.createLessonPlan` | `academics.lesson_plans.manage` | Dashboard lesson-plan creation. | existing / dashboard complete |
| GET | `/api/v1/academics/lesson-plans/weeks` | `LessonPlansController.listLessonPlanWeeks` | `academics.lesson_plans.view` | Week buckets, holiday-aware counts. | existing / dashboard complete |
| GET | `/api/v1/academics/lesson-plans/summary` | `LessonPlansController.getLessonPlanSummary` | `academics.lesson_plans.view` | Dashboard planning summary. | existing / dashboard complete |
| POST | `/api/v1/academics/lesson-plans/auto-plan` | `LessonPlansController.autoPlanLessonPlan` | `academics.lesson_plans.manage` | Auto-plan from curriculum and timetable slots. | existing / dashboard complete |
| PATCH | `/api/v1/academics/lesson-plans/items/:itemId/move` | `LessonPlansController.moveLessonPlanItem` | `academics.lesson_plans.manage` | Move/reschedule lesson-plan item. | existing / dashboard complete |
| GET | `/api/v1/academics/lesson-plans/validation` | `LessonPlansController.validateLessonPlans` | `academics.lesson_plans.view` | Dashboard lesson-plan readiness/completion validation. | existing / dashboard complete |
| GET | `/api/v1/academics/lesson-plans/:lessonPlanId` | `LessonPlansController.getLessonPlan` | `academics.lesson_plans.view` | Dashboard detail. | existing / dashboard complete |
| PATCH | `/api/v1/academics/lesson-plans/:lessonPlanId` | `LessonPlansController.updateLessonPlan` | `academics.lesson_plans.manage` | Dashboard metadata update. | existing / dashboard complete |
| POST | `/api/v1/academics/lesson-plans/:lessonPlanId/activate` | `LessonPlansController.activateLessonPlan` | `academics.lesson_plans.manage` | Activate dashboard plan. | existing / dashboard complete |
| POST | `/api/v1/academics/lesson-plans/:lessonPlanId/archive` | `LessonPlansController.archiveLessonPlan` | `academics.lesson_plans.manage` | Archive dashboard plan. | existing / dashboard complete |
| DELETE | `/api/v1/academics/lesson-plans/:lessonPlanId` | `LessonPlansController.deleteLessonPlan` | `academics.lesson_plans.manage` | Soft-delete plan and items. | existing / dashboard complete |
| POST | `/api/v1/academics/lesson-plans/:lessonPlanId/items` | `LessonPlansController.createLessonPlanItem` | `academics.lesson_plans.manage` | Create item. | existing / dashboard complete |
| PATCH | `/api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId` | `LessonPlansController.updateLessonPlanItem` | `academics.lesson_plans.manage` | Update item. | existing / dashboard complete |
| PATCH | `/api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId/reorder` | `LessonPlansController.reorderLessonPlanItem` | `academics.lesson_plans.manage` | Reorder item. | existing / dashboard complete |
| POST | `/api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId/start` | `LessonPlansController.startLessonPlanItem` | `academics.lesson_plans.manage` | Move item to `IN_PROGRESS`. | existing / dashboard complete |
| POST | `/api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId/complete` | `LessonPlansController.completeLessonPlanItem` | `academics.lesson_plans.manage` | Move item to `DONE`. | existing / dashboard complete |
| POST | `/api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId/skip` | `LessonPlansController.skipLessonPlanItem` | `academics.lesson_plans.manage` | Skip item with note. | existing / dashboard complete |
| POST | `/api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId/cancel` | `LessonPlansController.cancelLessonPlanItem` | `academics.lesson_plans.manage` | Cancel item with note. | existing / dashboard complete |
| DELETE | `/api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId` | `LessonPlansController.deleteLessonPlanItem` | `academics.lesson_plans.manage` | Soft-delete item. | existing / dashboard complete |

Important boundary: these are School Dashboard routes. They use dashboard permissions and are not Teacher/Student/Parent app contracts.

### 4.2 Teacher App routes related to schedule, lessons, curriculum, preparation

Teacher app module source: `src/modules/teacher-app/teacher-app.module.ts`.

| Method | Path | Controller | Auth model / role boundary | Data source | Purpose | Status |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/teacher/schedule?date=` | `TeacherScheduleController.getDailySchedule` | `UserType.TEACHER` through `TeacherAppAccessService`; owned allocations only. | `TeacherScheduleReadAdapter` -> published `TimetableEntry`. | Daily teacher schedule. | existing / complete for schedule / no lesson content |
| GET | `/api/v1/teacher/schedule/week?date=` | `TeacherScheduleController.getWeeklySchedule` | Teacher user + owned allocation ids. | `TeacherScheduleReadAdapter` -> published `TimetableEntry`. | Weekly teacher schedule. | existing / complete for schedule / no lesson content |
| GET | `/api/v1/teacher/calendar/events` | `TeacherCalendarController.listEvents` | Teacher user + allocation-derived visible stage/grade/section. | `AppCalendarEventsRepository`. | App calendar events. | existing / unrelated to lesson content |
| GET | `/api/v1/teacher/calendar/events/:eventId` | `TeacherCalendarController.getEvent` | Teacher calendar visibility. | `AppCalendarEventsRepository`. | Calendar event detail. | existing / unrelated to lesson content |
| GET | `/api/v1/teacher/my-classes` | `TeacherMyClassesController.listTeacherClasses` | Teacher user + owned allocations. | `TeacherAppAllocationReadAdapter`, `TeacherAppCompositionReadAdapter`. | Owned class/allocation list. | existing / partial prep placeholder |
| GET | `/api/v1/teacher/my-classes/:classId` | `TeacherMyClassesController.getTeacherClassDetail` | `classId` is `TeacherSubjectAllocation.id`; ownership asserted. | Teacher allocation + class metrics. | Owned class detail. | existing / partial prep placeholder |
| GET | `/api/v1/teacher/classroom/:classId` | `TeacherClassroomController.getClassroom` | Teacher owns allocation. | `TeacherClassroomReadAdapter`. | Classroom summary. | existing / unrelated to lesson content |
| GET | `/api/v1/teacher/classroom/:classId/roster` | `TeacherClassroomController.listRoster` | Teacher owns allocation. | `TeacherClassroomReadAdapter`. | Roster. | existing / unrelated |
| GET/POST/PATCH/etc. | `/api/v1/teacher/homeworks/...` | `TeacherHomeworksController` | Teacher owns class/allocation. | Homework models. | Homework assignment and review workflows. | existing / separate dependency |
| GET/PATCH/PUT/POST | `/api/v1/teacher/classroom/:classId/grades...` | classroom grade controllers | Teacher owns class/allocation. | Grade/homework submission models. | Gradebook/review. | existing / separate dependency |
| n/a | `/api/v1/teacher/lesson-preparation...` | none | none | none | Lesson preparation. | absent |
| n/a | `/api/v1/teacher/curriculum...` | none | none | none | Teacher-owned curriculum/content browsing. | absent |

Evidence:

- `src/modules/teacher-app/schedule/infrastructure/teacher-schedule-read.adapter.ts` reads only active published timetable entries for current teacher and owned allocations.
- `src/modules/teacher-app/schedule/presenters/teacher-schedule.presenter.ts` returns `isPrepared: null` and `hasHomework: null`.
- `src/modules/teacher-app/my-classes/presenters/teacher-class.presenter.ts` returns `needsPreparation: null`.
- `src/modules/teacher-app/home/presenters/teacher-home.presenter.ts` still returns `schedule.available: false` with reason `timetable_not_available`; this is a home composition gap, not a lesson-preparation implementation.
- There is no `lesson-preparation` directory/controller under `src/modules/teacher-app`.

### 4.3 Student App routes related to schedule, lessons, curriculum, content

Student app module source: `src/modules/student-app/student-app.module.ts`.

| Method | Path | Controller | Auth model / role boundary | Data source | Purpose | Status |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/student/schedule?date=` | `StudentScheduleController.getDailySchedule` | `UserType.STUDENT` + linked active student + active enrollment. | `StudentScheduleReadAdapter` -> published `TimetableEntry`. | Daily schedule. | existing / complete for schedule / no lesson content |
| GET | `/api/v1/student/schedule/week?date=` | `StudentScheduleController.getWeeklySchedule` | Current student active enrollment. | `StudentScheduleReadAdapter` -> published `TimetableEntry`. | Weekly schedule. | existing / complete for schedule / no lesson content |
| GET | `/api/v1/student/subjects` | `StudentSubjectsController.listSubjects` | Current student active enrollment. | `StudentSubjectsReadAdapter` -> `TeacherSubjectAllocation`, grades. | Current subjects and stats. | existing / partial placeholders |
| GET | `/api/v1/student/subjects/:subjectId` | `StudentSubjectsController.getSubject` | Subject must be allocated to student's classroom/term. | `StudentSubjectsReadAdapter`. | Subject detail. | existing / explicitly unsupported lessons/content |
| GET | `/api/v1/student/calendar/events` | `StudentCalendarController.listEvents` | Current student classroom scope. | App calendar read model. | Calendar events. | existing / unrelated to lesson content |
| GET | `/api/v1/student/calendar/events/:eventId` | `StudentCalendarController.getEvent` | Current student visibility. | App calendar read model. | Calendar event detail. | existing / unrelated |
| GET/PUT/POST/PATCH/DELETE | `/api/v1/student/homeworks...` | `StudentHomeworksController` | Current student + homework target ownership. | Homework models. | Homework consumption/submission. | existing / separate dependency |
| GET | `/api/v1/student/grades...`, `/api/v1/student/exams...`, `/api/v1/student/progress...` | Student grade/exam/progress controllers | Current student. | Grades/progress models. | Assessment views. | existing / separate dependency |
| n/a | `/api/v1/student/lessons...` | none | none | none | Planned lessons and content. | absent |
| n/a | `/api/v1/student/curriculum...` | none | none | none | Curriculum browsing. | absent |

Evidence:

- `src/modules/student-app/subjects/presenters/student-subjects.presenter.ts` returns `lessons: []`, `assignments: []`, `attachments: []`, `lessonsCount: null`, and unsupported reason `curriculum_lesson_resources_not_available`.
- `src/modules/student-app/subjects/dto/student-subjects.dto.ts` has lesson/resource placeholders, but no runtime data source fills them.
- `src/modules/student-app/schedule/infrastructure/student-schedule-read.adapter.ts` filters active published timetable entries by active enrollment classroom/academic year/term.
- There is no `lessons`, `lesson-content`, or `curriculum` app module under `src/modules/student-app`.

### 4.4 Parent App routes related to children schedule, lessons, curriculum, content

Parent app module source: `src/modules/parent-app/parent-app.module.ts`.

| Method | Path | Controller | Auth model / role boundary | Data source | Purpose | Status |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/parent/children` | `ParentChildrenController.listChildren` | `UserType.PARENT` + active guardian-child links. | `ParentChildrenReadAdapter`. | Accessible children list. | existing / ownership foundation |
| GET | `/api/v1/parent/children/:studentId` | `ParentChildrenController.getChild` | Parent owns child active enrollment. | `ParentChildrenReadAdapter`. | Child detail. | existing / no lesson content |
| GET | `/api/v1/parent/children/:studentId/schedule/today` | `ParentScheduleController.getTodaySchedule` | Parent owns child. | `ParentScheduleReadAdapter` -> published `TimetableEntry`. | Child today's schedule. | existing / complete for schedule / no lesson content |
| GET | `/api/v1/parent/children/:studentId/schedule/weekly` | `ParentScheduleController.getWeeklySchedule` | Parent owns child. | `ParentScheduleReadAdapter` -> published `TimetableEntry`. | Child weekly schedule. | existing / complete for schedule / no lesson content |
| GET | `/api/v1/parent/children/:studentId/calendar/events` | `ParentCalendarController.listEvents` | Parent owns child. | App calendar read model. | Child-visible calendar events. | existing / unrelated to lesson content |
| GET | `/api/v1/parent/children/:studentId/calendar/events/:eventId` | `ParentCalendarController.getEvent` | Parent owns child. | App calendar read model. | Child-visible event detail. | existing / unrelated |
| GET | `/api/v1/parent/children/:studentId/homeworks...` | `ParentHomeworksController` | Parent owns child. | Homework models. | Child homework visibility. | existing / separate dependency |
| GET | `/api/v1/parent/children/:studentId/grades...`, `/progress...`, `/reports...` | Parent grade/progress/report controllers | Parent owns child. | Grades/progress/report models. | Child academic views. | existing / separate dependency |
| n/a | `/api/v1/parent/children/:studentId/lessons...` | none | none | none | Child planned lessons/content. | absent |
| n/a | `/api/v1/parent/children/:studentId/curriculum...` | none | none | none | Child curriculum browsing. | absent |

Evidence:

- `src/modules/parent-app/access/parent-app-access.service.ts` and `src/modules/parent-app/shared/parent-app-domain.ts` provide the required child-ownership boundary.
- `src/modules/parent-app/schedule/infrastructure/parent-schedule-read.adapter.ts` filters active published timetable entries by owned child's classroom/academic year/term.
- `src/modules/parent-app/children/presenters/parent-children.presenter.ts` has child-detail unsupported slices and no lesson/content fields.
- There is no `lessons`, `lesson-content`, or `curriculum` app module under `src/modules/parent-app`.

### 4.5 Existing tests

Unit tests that currently cover adjacent app-facing foundations:

- Teacher schedule and ownership: `src/modules/teacher-app/schedule/tests/teacher-schedule.use-case.spec.ts`, `src/modules/teacher-app/access/tests/*`, `src/modules/teacher-app/my-classes/tests/*`.
- Student schedule/subjects/access: `src/modules/student-app/schedule/tests/student-schedule.use-case.spec.ts`, `src/modules/student-app/subjects/tests/*`, `src/modules/student-app/access/tests/*`.
- Parent schedule/children/access: `src/modules/parent-app/schedule/tests/parent-schedule.use-case.spec.ts`, `src/modules/parent-app/children/tests/*`, `src/modules/parent-app/access/tests/*`, `src/modules/parent-app/shared/tests/parent-app-domain.spec.ts`.
- Dashboard curriculum/content/plans: `src/modules/academics/curriculum/tests/curriculum.use-case.spec.ts`, `src/modules/academics/curriculum/tests/lesson-content.use-case.spec.ts`, `src/modules/academics/lesson-plans/tests/lesson-plans.use-case.spec.ts`.
- App-facing calendar visibility: `src/modules/academics/calendar/app-facing/tests/*`.

E2E tests that currently prove dashboard/app-adjacent surfaces:

- `test/e2e/academics-curriculum-foundation.e2e-spec.ts`
- `test/e2e/academics-lesson-content-foundation.e2e-spec.ts`
- `test/e2e/academics-lesson-plans-foundation.e2e-spec.ts`
- `test/e2e/academics-lesson-plan-workflows.e2e-spec.ts`
- `test/e2e/schedule-timetable-final-closeout.e2e-spec.ts`
- `test/e2e/teacher-app-home-my-classes.e2e-spec.ts`
- `test/e2e/teacher-app-classroom-operations.e2e-spec.ts`
- `test/e2e/teacher-app-final-closeout.e2e-spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/e2e/parent-app-final-closeout.e2e-spec.ts`
- `test/e2e/app-facing-academic-calendar.e2e-spec.ts`

Security tests that currently cover adjacent boundaries:

- Dashboard lesson content/plans: `test/security/tenancy.academics-lesson-content.spec.ts`, `test/security/tenancy.academics-lesson-plans.spec.ts`, `test/security/tenancy.academics-lesson-plan-workflows.spec.ts`.
- App role/ownership shells: `test/security/tenancy.teacher-app.spec.ts`, `test/security/tenancy.student-app.spec.ts`, `test/security/tenancy.parent-app.spec.ts`.
- App-facing academic calendar: `test/security/tenancy.app-facing-academic-calendar.spec.ts`.

Missing tests:

- No dedicated Teacher App lesson preparation unit/E2E/security tests.
- No dedicated Student App lesson-content unit/E2E/security tests.
- No dedicated Parent App child lesson-content unit/E2E/security tests.
- Existing route-inventory tests assert the app-facing lesson routes are absent; those must be updated in the implementation sprint that adds routes.

## 5. Data Model Readiness

| Model | Can support teacher lesson preparation? | Can support student lesson content? | Can support parent child-scoped lesson content? | Missing fields / risks | Schema recommendation |
| --- | --- | --- | --- | --- | --- |
| `Curriculum` | yes, as source of curriculum scope by year/term/grade/subject | partial, if visibility can be based on `status: ACTIVE` and classroom grade/subject | partial, same as student through child enrollment | No app-facing release rule; `DRAFT` vs `ACTIVE` vs `ARCHIVED` may be dashboard lifecycle, not student release. | no change required for 22G teacher read/status; product decision for student/parent visibility |
| `CurriculumUnit` | yes, ordered unit grouping | yes, for display | yes, for child display | No explicit app visibility flag. | no change now |
| `CurriculumLesson` | yes, linked from `LessonPlanItem.lessonId` | yes, for lesson title/objectives/content anchor | yes, for child content anchor | Objectives are `Json`; no student progress/read markers. | no change for read-only; optional later progress model |
| `LessonContentItem` | yes, supports text, file, video link, external link | partial, content exists but no app visibility/audience rule | partial, same as student | `fileId` gives metadata only; app file download must use Files ownership/signed URL rules. No release/visibility status per item. | no change for metadata read; signed download contract may need Files integration, not schema |
| `LessonPlan` | yes, links teacher allocation, term, week, classroom, subject, curriculum | partial, can join classroom/subject/week but lifecycle may be dashboard-oriented | partial, child enrollment can constrain classroom | `status` has no explicit student publication; active dashboard plan may not mean student-visible. | no change for teacher 22G; product decision for student/parent |
| `LessonPlanItem` | yes, has planned date, timetable entry, period, status, notes | partial, can identify planned lesson and curriculum lesson | partial, same through child classroom | No `PREPARED` status, no separate teacher-private notes, no student release date, no viewed/progress fields. | no change for 22G if current statuses/notes are accepted; schema only if product requires distinct prep/visibility semantics |
| `TimetableEntry` | yes, teacher-owned schedule spine through allocation | yes, active published student schedule spine | yes, active published child schedule spine | App schedule uses published timetables; lesson plans currently do not require publication for dashboard planning. | no change |
| `TeacherSubjectAllocation` | yes, teacher ownership and class/subject/term boundary | yes, subject list source for student's classroom | yes, child class/subject visibility via enrollment | No soft delete; hard delete conflicts must remain protected elsewhere. | no change |
| `AcademicCalendarEvent` | yes, holidays used by dashboard lesson-plan workflows | partial, app calendar exposes events separately | partial, app calendar exposes child-visible events separately | Holiday logic is planning-oriented; app lesson read models need consistent date filtering but no new fields. | no change |
| `HomeworkAssignment` and related homework models | separate dependency; homework can link to timetable/allocation | separate existing student homework surface | separate existing parent child homework surface | Homework is not lesson content. Do not overload it for lesson resources. | no change |
| `File` | yes for lesson content file metadata | partial, if app routes expose safe metadata/download authorization | partial, same as student | App-facing signed URL/download boundary must avoid leaking private files. | no schema change; may need Files service integration later |
| `Student`, `Guardian`, `StudentGuardian`, `Enrollment` | n/a for teacher | yes, active enrollment gives classroom/year/term | yes, active guardian-child relation and enrollment give ownership | Parent links have no deletedAt on `StudentGuardian`; active child is enforced via guardian/student/enrollment records. | no change |

Current school-scope support is ready for the core models. `src/infrastructure/database/school-scope.extension.ts` includes `TeacherSubjectAllocation`, `Curriculum`, `CurriculumUnit`, `CurriculumLesson`, `LessonContentItem`, `LessonPlan`, `LessonPlanItem`, and `TimetableEntry` in `SCHOOL_SCOPED_MODELS`; `Curriculum`, `CurriculumUnit`, `CurriculumLesson`, `LessonContentItem`, `LessonPlan`, and `LessonPlanItem` are also in `SOFT_DELETE_MODELS`.

## 6. Teacher App Lesson Preparation Audit

| Capability | Current status | Evidence | Gap / decision |
| --- | --- | --- | --- |
| Teacher can see timetable entries | complete | `src/modules/teacher-app/schedule/controller/teacher-schedule.controller.ts`, `src/modules/teacher-app/schedule/infrastructure/teacher-schedule-read.adapter.ts` | No lesson-plan/content join. |
| Teacher can see upcoming lessons by day/week | partial | Schedule returns timetable entries; `TeacherSchedulePresenter` returns `isPrepared: null`. | Need lesson-preparation read model joining schedule date, `LessonPlanItem`, `CurriculumLesson`, and `LessonContentItem`. |
| Teacher can see today’s lessons | partial | `GET /teacher/schedule?date=` exists. | Need `GET /teacher/lesson-preparation/today` or equivalent. |
| Teacher can see lesson-plan items for own allocations | missing | No teacher app lesson-plan controller; dashboard routes require `academics.lesson_plans.*`. | Add teacher-owned read adapter/use-cases. |
| Teacher can see curriculum lesson content linked to a lesson-plan item | missing | Dashboard content route exists in `CurriculumController`; no `teacher/curriculum` route. | Add app presenter with safe content metadata. |
| Teacher can mark a lesson `IN_PROGRESS`, `DONE`, `SKIPPED`, etc. | partial | Dashboard item status routes exist; `LessonPlanItemStatus` supports lifecycle. | Need Teacher App write route restricted to owned allocation. Product decision if `PREPARED` is required. |
| Teacher can add preparation notes | partial | `LessonPlanItem.notes` exists and dashboard item note DTOs exist. | Need decision whether this field is teacher-private prep notes. No app route today. |
| Teacher my-classes prep signal | partial placeholder | `TeacherClassPresenter.presentClass` returns `needsPreparation: null`. | Future app/home composition can populate from lesson-plan readiness. Not required for first 22G route set. |
| Teacher Home lesson/prep composition | missing/stale placeholder | `TeacherHomePresenter` returns `schedule.available: false`. | Separate app-home composition work; do not block 22G if lesson-prep routes are direct. |

Missing routes:

- `GET /api/v1/teacher/lesson-preparation/today`
- `GET /api/v1/teacher/lesson-preparation/week`
- `GET /api/v1/teacher/lesson-preparation/:lessonPlanItemId`
- `PATCH /api/v1/teacher/lesson-preparation/:lessonPlanItemId/status`

Required read model:

- Start from `TeacherAppAccessService` to assert `UserType.TEACHER`.
- Use owned `TeacherSubjectAllocation` ids from `TeacherAppAllocationReadAdapter`.
- Join `LessonPlan`/`LessonPlanItem` by owned allocation, term/date range, and optional timetable entry.
- Join `CurriculumLesson`, `CurriculumUnit`, and `LessonContentItem` for the lesson content payload.
- Optionally join published `TimetableEntry` for schedule slot metadata; do not mutate timetable.

Required security:

- Teacher must own `LessonPlan.teacherSubjectAllocationId`.
- Item must belong to same school and same owned allocation.
- Status writes must reject closed/inactive term if preserving current closed-term policy for lesson-plan mutations.
- Do not require dashboard `academics.lesson_plans.*` permissions for Teacher App routes; the boundary should be user type + ownership.
- Do not expose `schoolId`, `organizationId`, membership ids, role ids, email/password fields, `deletedAt`, raw Prisma rows, or dashboard audit metadata.

## 7. Student App Lesson Content Audit

| Capability | Current status | Evidence | Gap / decision |
| --- | --- | --- | --- |
| Student can see schedule | complete | `StudentScheduleController`, `StudentScheduleReadAdapter`, `student-schedule.use-case.spec.ts`. | No lesson content joined. |
| Student can see current subjects | partial | `StudentSubjectsController`, `StudentSubjectsReadAdapter`. | Subject detail placeholders do not load lessons. |
| Student can see planned lesson content for classroom | missing | No `student/lessons` or `student/curriculum` module. | Add read-only lesson-content routes in a later sprint. |
| Student sees only published/active/available lesson content | product decision needed | Current model has `Curriculum.status`, `LessonPlan.status`, timetable publication, and item status but no single release rule. | Must decide before 22H. |
| Student can browse curriculum lessons independent of lesson plans | missing / product decision | Dashboard curriculum exists; Student subject detail explicitly marks lessons/resources unsupported. | Decide whether V1 uses only planned lessons or full active curriculum. |
| Student attachments/files supported | partial | `LessonContentItem.fileId` and `File` metadata exist; `LessonContentPresenter` returns safe metadata. | App download URL/file access needs Files boundary decision. |
| Academic home composition includes lessons | missing | `StudentHomePresenter.required_today` and `today_tasks` are empty; schedule availability still placeholder in home. | Keep for app-home composition sprint, not 22G. |

Student security rules:

- Student actor must be `UserType.STUDENT`.
- Student must have active linked `Student` record and active enrollment in current school.
- Lesson content must match the student's current classroom/grade/term through `Enrollment.classroomId`, `TeacherSubjectAllocation.classroomId`, and `LessonPlan.classroomId`.
- Cross-school term/classroom/lesson/curriculum/timetable ids must resolve as not found/forbidden safely.
- Draft dashboard-only plans/content must not leak unless product explicitly says active curriculum is student-visible.

## 8. Parent App Child-Scoped Lesson Content Audit

| Capability | Current status | Evidence | Gap / decision |
| --- | --- | --- | --- |
| Parent can see linked children | complete | `ParentChildrenController`, `ParentAppAccessService`, `ParentAppGuardianReadAdapter`. | No lesson fields. |
| Parent can see child schedule | complete | `ParentScheduleController`, `ParentScheduleReadAdapter`, `parent-schedule.use-case.spec.ts`. | No lesson content joined. |
| Parent can see child planned lesson content | missing | No `parent/children/:studentId/lessons` module/controller. | Add child-scoped read-only routes in a later sprint. |
| Parent can access only linked children | complete foundation | `assertParentOwnsStudent`, `assertParentOwnsClassroom`, active enrollment checks. | New routes must reuse the same service. |
| Parent can see homework/grades/progress | complete adjacent surfaces | `parent/homeworks`, `parent/grades`, `parent/progress`, `parent/reports` controllers. | Separate from lesson content. |
| Parent child academic-home lesson composition | missing | `ParentHomePresenter.schedule.available: false`; no lessons summary. | App-home composition sprint, not 22G. |

Parent security rules:

- Parent actor must be `UserType.PARENT`.
- Parent must have current-school `Guardian` record linked through `StudentGuardian`.
- Child must have an active enrollment in current school.
- Lesson content must be scoped to the owned child's active enrollment classroom/year/term.
- Parent routes must never allow arbitrary `studentId`, classroom, curriculum, lesson-plan, or timetable ids outside owned children.

## 9. Access Control / Security / Tenancy

Required rules for future implementation:

- Teacher App:
  - Require `UserType.TEACHER` via `TeacherAppAccessService`.
  - Allow reads/writes only for `LessonPlan.teacherSubjectAllocationId` owned by the current teacher.
  - Validate lesson-plan item, timetable entry, classroom, subject, curriculum, unit, and lesson all belong to the same school/allocation context.
  - Reject or hide soft-deleted/archived curriculum, lesson content, lesson plans, and lesson-plan items.
  - Status/preparation writes must reject closed terms (`Term.isActive === false`) if they mutate `LessonPlanItem`.
- Student App:
  - Require `UserType.STUDENT` via `StudentAppAccessService`.
  - Use the current active enrollment and classroom as the only classroom boundary.
  - Return only content tied to the active school/year/term/classroom.
  - Hide dashboard draft/internal content unless product decides otherwise.
- Parent App:
  - Require `UserType.PARENT` via `ParentAppAccessService`.
  - First assert parent owns `studentId`, then use that child's active enrollment/classroom.
  - Do not accept child/classroom/content ids without ownership validation.
- Shared:
  - Use scoped Prisma and existing app access services; no unscoped direct Prisma in controllers.
  - Do not expose `schoolId`, `organizationId`, membership ids, role ids, password hashes, `deletedAt`, internal actor ids, audit metadata, or raw Prisma rows.
  - File content must expose safe metadata only unless the Files module grants a signed app-facing URL through resource ownership.
  - Cross-school ids should be rejected or hidden consistently with app-facing not-found/forbidden patterns.

Existing security coverage:

- `test/security/tenancy.teacher-app.spec.ts`, `test/security/tenancy.student-app.spec.ts`, and `test/security/tenancy.parent-app.spec.ts` cover broad app ownership/no-leak rules.
- `test/security/tenancy.academics-lesson-content.spec.ts` and `test/security/tenancy.academics-lesson-plan-workflows.spec.ts` cover dashboard lesson content/planning tenancy.
- `test/security/tenancy.app-facing-academic-calendar.spec.ts` covers app-facing calendar visibility by teacher/student/parent context.

Missing security coverage:

- Teacher cannot read another teacher's lesson-plan item.
- Teacher cannot mutate lesson-plan item in closed term.
- Teacher cannot access cross-school curriculum/content through an owned-looking item id.
- Student cannot read another classroom's lesson item or content.
- Student cannot read draft/archived/deleted lesson content.
- Parent cannot read an unlinked child's lesson item or content.
- App responses do not leak internal ids/fields for lesson content.
- Teacher/student/parent system roles are denied from dashboard lesson-plan/content routes unless they have dashboard permissions.

## 10. Proposed App-Facing Contract

Route names below follow existing app route conventions: `teacher/...`, `student/...`, and `parent/children/:studentId/...`. They are proposals only; no routes are implemented in this sprint.

### 10.1 Teacher App

#### GET `/api/v1/teacher/lesson-preparation/today?date=YYYY-MM-DD`

- Purpose: return current teacher's planned lessons for a specific date, joined with schedule slot and safe lesson content.
- Query/path/body: `date` required, same date style as `GET /teacher/schedule`.
- Data source: `TeacherAppAccessService`, `TeacherAppAllocationReadAdapter`, `LessonPlan`, `LessonPlanItem`, `CurriculumLesson`, `LessonContentItem`, optional `TimetableEntry`.
- Response shape:

```json
{
  "date": "2026-09-14",
  "items": [
    {
      "lessonPlanItemId": "uuid",
      "lessonPlanId": "uuid",
      "teacherSubjectAllocationId": "uuid",
      "timetableEntryId": "uuid",
      "plannedDate": "2026-09-14",
      "status": "planned",
      "title": "Lesson title",
      "notes": null,
      "subject": { "id": "uuid", "name": "Math", "code": "MATH" },
      "classroom": { "id": "uuid", "name": "Grade 1 A" },
      "period": { "id": "uuid", "label": "P1", "startTime": "08:00", "endTime": "08:45" },
      "content": [
        {
          "contentItemId": "uuid",
          "type": "text",
          "title": "Warmup",
          "bodyText": "...",
          "url": null,
          "file": null
        }
      ]
    }
  ]
}
```

- Permission/role model: no dashboard permission; require teacher actor and owned allocation.
- Security checks: owned allocation, same school, non-deleted plan/item/content, closed-term write not applicable for read.
- Tests: unit read use-case/presenter, E2E route inventory/read, security ownership/no-leak/cross-school.
- Schema changes: none if using current `LessonPlanItem` and `LessonContentItem`.

#### GET `/api/v1/teacher/lesson-preparation/week?date=YYYY-MM-DD`

- Purpose: return teacher's week of lesson preparation items.
- Query/path/body: `date` required; week should follow timetable week-start logic where useful, or term week buckets if schedule settings unavailable.
- Response: `{ weekStartDate, weekEndDate, days: [{ date, items: [...] }] }`.
- Data source/security/tests/schema: same as today route.

#### GET `/api/v1/teacher/lesson-preparation/:lessonPlanItemId`

- Purpose: return one owned lesson-plan item with curriculum lesson and content.
- Query/path/body: `lessonPlanItemId` UUID.
- Security: item must belong to an owned `TeacherSubjectAllocation`.
- Schema changes: none.

#### PATCH `/api/v1/teacher/lesson-preparation/:lessonPlanItemId/status`

- Purpose: allow teacher to move an owned item through allowed app status transitions and optionally update notes.
- Body proposal:

```json
{
  "status": "in_progress",
  "notes": "Prepared lab materials."
}
```

- Allowed statuses if using current enum: `planned`, `in_progress`, `done`, `skipped`. Avoid app route support for `cancelled` unless product wants teachers to cancel dashboard plans.
- Data source: update `LessonPlanItem.status`, timestamps, `notes`, `updatedByUserId`.
- Security: owned allocation, term writable/open for mutations, archived/deleted plan blocked.
- Tests: transition validation, closed-term denial, cross-school denial, no raw field leakage.
- Schema changes: none if product accepts current status/notes semantics. Schema/product decision needed if true `prepared` status or teacher-private notes are required.

### 10.2 Student App

#### GET `/api/v1/student/lessons/today?date=YYYY-MM-DD`

- Purpose: return lesson content visible to the current student for a date.
- Query/path/body: `date` required, same style as `GET /student/schedule`.
- Data source: `StudentAppAccessService`, active enrollment classroom/year/term, `LessonPlanItem` by classroom/date, curriculum lesson/content.
- Response: similar to Teacher App but without teacher-private notes and without dashboard lifecycle internals.
- Permission/role model: student actor + active enrollment; no dashboard permissions.
- Security checks: current classroom only, active/non-deleted content only, visibility rule enforced.
- Tests: active enrollment, wrong classroom denied/hidden, draft content hidden, no school/internal leaks.
- Schema changes: no if product accepts `LessonPlan.status`/`Curriculum.status`/planned date as visibility signals; product decision needed before implementation.

#### GET `/api/v1/student/lessons/week?date=YYYY-MM-DD`

- Purpose: return visible student lessons for the week.
- Query/path/body: `date` required.
- Response: `{ weekStartDate, weekEndDate, days: [{ date, items: [...] }] }`.
- Security/tests/schema: same as today route.

#### GET `/api/v1/student/lessons/:lessonPlanItemId`

- Purpose: return detail for one visible lesson item.
- Security: item must belong to student's active enrollment classroom/year/term and pass visibility rule.
- Schema changes: no if visibility rule is current-model compatible.

### 10.3 Parent App

#### GET `/api/v1/parent/children/:studentId/lessons/today?date=YYYY-MM-DD`

- Purpose: return child-visible lesson content for an owned child on a date.
- Query/path/body: `studentId` path UUID, `date` required.
- Data source: `ParentAppAccessService.assertParentOwnsStudent`, child's active enrollment, `LessonPlanItem`, curriculum lesson/content.
- Permission/role model: parent actor + child ownership; no dashboard permissions.
- Security checks: linked child only, child classroom only, visibility rule same as Student App.
- Tests: unlinked child denied, cross-school child denied, response no internal fields.
- Schema changes: same decision as Student App.

#### GET `/api/v1/parent/children/:studentId/lessons/week?date=YYYY-MM-DD`

- Purpose: weekly child-visible lessons.
- Response/tests/security: same as today route.

#### GET `/api/v1/parent/children/:studentId/lessons/:lessonPlanItemId`

- Purpose: detail for one child-visible lesson item.
- Security: parent owns child; item belongs to child's active enrollment classroom/year/term and passes visibility rule.
- Schema changes: same decision as Student App.

## 11. Implementation Split Recommendation

### Sprint 22G — Teacher App Lesson Preparation Read/Status Workflows

- Goal: implement teacher-owned lesson preparation reads and status updates using existing lesson-plan/content models.
- Strict scope:
  - Add `src/modules/teacher-app/lesson-preparation/**`.
  - Add teacher today/week/detail/status routes.
  - Reuse existing teacher access service.
  - Use `LessonPlanItem` and `LessonContentItem` as read sources.
  - Do not add student/parent routes.
  - Do not add schema unless product explicitly requires distinct `PREPARED` semantics.
- Routes:
  - `GET /api/v1/teacher/lesson-preparation/today`
  - `GET /api/v1/teacher/lesson-preparation/week`
  - `GET /api/v1/teacher/lesson-preparation/:lessonPlanItemId`
  - `PATCH /api/v1/teacher/lesson-preparation/:lessonPlanItemId/status`
- Source modules likely to change:
  - `src/modules/teacher-app/teacher-app.module.ts`
  - new `src/modules/teacher-app/lesson-preparation/**`
  - possibly `ERROR_CATALOG.md` for app-specific lesson-prep errors
  - route-inventory tests that currently assert teacher lesson-preparation routes absent
- Tests required:
  - Unit: use-cases, read adapter, presenter, status transition validation.
  - E2E: route inventory, today/week/detail/status.
  - Security: ownership, cross-school ids, closed-term mutation denial, no field leaks, non-teacher denied.
- Known risks:
  - `PREPARED` status product ambiguity.
  - Teacher Home still has schedule placeholder; do not fold home composition into 22G.
- Schema changes needed: no, if current `LessonPlanItemStatus`/`notes` are accepted.

### Sprint 22H — Student App Lesson Content Read Workflows

- Goal: implement student current-enrollment lesson-content reads.
- Strict scope:
  - Add `src/modules/student-app/lessons/**`.
  - Populate lesson-content routes, not subject placeholders unless small and backward-compatible.
  - No teacher writes, no parent routes, no dashboard rewrites.
- Routes:
  - `GET /api/v1/student/lessons/today`
  - `GET /api/v1/student/lessons/week`
  - `GET /api/v1/student/lessons/:lessonPlanItemId`
- Source modules likely to change:
  - `src/modules/student-app/student-app.module.ts`
  - new `src/modules/student-app/lessons/**`
  - possibly `src/modules/student-app/subjects/**` if subject detail starts linking lesson summaries
  - route-inventory tests that currently assert student lesson/curriculum routes absent
- Tests required:
  - Unit/E2E/security for active enrollment, classroom scoping, visibility, soft-delete, no leaks.
- Known risks:
  - Visibility rule must be decided before implementation.
  - File download behavior may require Files service integration.
- Schema changes needed: no if visibility is based on current statuses/dates; product decision if release flags/progress tracking are required.

### Sprint 22I — Parent App Child Lesson Content Read Workflows

- Goal: implement parent child-scoped lesson-content reads using same visibility rule as Student App.
- Strict scope:
  - Add `src/modules/parent-app/lessons/**` or `src/modules/parent-app/children/lessons/**` consistent with module style.
  - No teacher status writes, no dashboard changes.
- Routes:
  - `GET /api/v1/parent/children/:studentId/lessons/today`
  - `GET /api/v1/parent/children/:studentId/lessons/week`
  - `GET /api/v1/parent/children/:studentId/lessons/:lessonPlanItemId`
- Source modules likely to change:
  - `src/modules/parent-app/parent-app.module.ts`
  - new parent lessons module/files
  - route-inventory tests that currently assert parent lesson routes absent
- Tests required:
  - Unit/E2E/security for linked child ownership, cross-school children, visibility, no leaks.
- Known risks:
  - Parent and Student App visibility must match.
  - Multi-child route ownership must be checked before any lesson query.
- Schema changes needed: no if Student App visibility decision is current-model compatible.

### Sprint 22J — App-Facing Lesson Content Final Closeout Audit

- Goal: audit all app-facing lesson-content/preparation routes after 22G-22I.
- Strict scope:
  - Docs-only closeout audit.
  - Verify route inventories, tests, security coverage, and product decisions.
- Tests required: none for docs-only except diff checks.
- Schema changes needed: no.

## 12. Risk Register

| Risk | Severity | Impact | Mitigation | Blocks next sprint? |
| --- | --- | --- | --- | --- |
| Content visibility rules unclear for Student/Parent | high | Could leak draft planning data or hide expected content. | Keep 22G teacher-only; get product decision before 22H. | no for 22G, yes for 22H/22I |
| `LessonPlanItemStatus` lacks `PREPARED` | medium | Teacher preparation may need a state separate from teaching progress. | In 22G use `PLANNED`/`IN_PROGRESS`/`DONE` only if accepted; otherwise request schema/product decision. | no if current statuses accepted |
| `LessonPlanItem.notes` may be dashboard-visible, not teacher-private | medium | Teacher prep notes could expose internal notes to dashboard/student/parent unexpectedly. | Treat notes as safe only for teacher/dashboard until product confirms student/parent visibility. | no for read/status without public notes |
| Teacher Home and Student/Parent Home still have schedule placeholders | medium | Users may not see lesson-prep summaries on home even after route implementation. | Keep home overview composition for later app-home sprint; do not block direct lesson routes. | no |
| File lesson content download boundary ambiguous | medium | Exposing file ids or signed URLs incorrectly could leak private files. | In first app reads return metadata only or use existing Files authorization; add security tests. | no for metadata-only |
| App-facing route inventory tests currently assert routes absent | low | New implementation tests will fail until updated. | Update only in implementation sprint with new route expectations. | no |
| Parent-child link safety | high | Parent could access another child's lesson content if ownership check is skipped. | Reuse `ParentAppAccessService.assertParentOwnsStudent` before querying lesson content. | no if enforced |
| Timetable publication vs lesson-plan activation ambiguity | high | Student/Parent content may not align with schedule publication. | Product decision: require published timetable and active plan, or active plan only. | no for 22G, yes for 22H/22I |
| Soft-deleted/archived curriculum or lesson-plan data leaks | high | App users could see stale/internal content. | Use scoped Prisma and explicit filters for non-deleted and non-archived records. | no |
| Dashboard permission bleed into app routes | medium | Teacher app users may be denied because they lack dashboard permissions, or dashboard permission holders may bypass ownership. | App routes should use user type + app ownership, not `RequiredPermissions`. | no |

## 13. Final Recommendation

Can 22G be implemented without schema changes?

- Yes, if 22G is limited to Teacher App lesson preparation reads plus status updates using existing `LessonPlan`, `LessonPlanItem`, `CurriculumLesson`, `LessonContentItem`, `TimetableEntry`, and `TeacherSubjectAllocation`.
- No schema change is needed for teacher-owned today/week/detail reads.
- No schema change is needed for status updates if product accepts current `LessonPlanItemStatus` values and `LessonPlanItem.notes`.
- A product/schema decision is needed only if "prepared" must be distinct from `PLANNED`/`IN_PROGRESS`/`DONE`, or if preparation notes must be teacher-private.

Safest next sprint:

- Sprint 22G — Teacher App Lesson Preparation Read/Status Workflows.

Codex prompt outline for 22G:

- Read this audit, Sprint 22A, Sprint 15I, current `teacher-app`, `academics/lesson-plans`, `academics/curriculum`, schedule, access services, Prisma schema, and related tests.
- Implement `src/modules/teacher-app/lesson-preparation/**` only.
- Add routes:
  - `GET /api/v1/teacher/lesson-preparation/today?date=`
  - `GET /api/v1/teacher/lesson-preparation/week?date=`
  - `GET /api/v1/teacher/lesson-preparation/:lessonPlanItemId`
  - `PATCH /api/v1/teacher/lesson-preparation/:lessonPlanItemId/status`
- Use teacher ownership through `TeacherAppAccessService` and `TeacherSubjectAllocation`.
- Read `LessonPlanItem`/`CurriculumLesson`/`LessonContentItem`; do not add Student/Parent routes.
- Enforce closed-term protection for status writes.
- Return safe presenter-shaped responses with no school/org/internal fields.
- Add unit, E2E, and security tests for ownership, cross-school denial, closed-term denial, no field leaks, route inventory, and absence of Student/Parent runtime changes.

Product decisions needed before Student/Parent implementation:

- Student/parent content visibility rule.
- Whether active curriculum is browsable independent of lesson plans.
- Whether file content returns metadata only or app-facing signed download URLs.
- Whether teacher preparation status/notes should be visible to students/parents, dashboard only, or teacher only.
