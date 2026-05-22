# Sprint 12A Schedule/Timetable Core Contract Audit

Status: planning audit only
Date: 2026-05-22

Sprint 12A is a documentation-only contract audit for the future
Schedule/Timetable Core. It does not introduce runtime code, routes,
controllers, DTOs, presenters, use-cases, repositories, Prisma schema changes,
migrations, seeds, tests, package scripts, README edits, ADR edits, Swagger
changes, or project structure edits.

Repository note: the governance reading list still names
`DIRECTORY_STRUCTURE.md`, but that file is not present in the current checkout.
`DIRECTORY_STRUCTURE_VISUAL.md`, the live repository tree, and prior audit notes
were used for structure context.

Sources reviewed for this audit:

- Governance: `AGENT_CONTEXT_PRIMER.md`, `CLAUDE.md`,
  `PROJECT_OVERVIEW.md`, `ARCHITECTURE_DECISION.md`, `SECURITY_MODEL.md`,
  `DOMAIN_GLOSSARY.md`, `DIRECTORY_STRUCTURE_VISUAL.md`, `MODULES.md`,
  `USER_TYPES.md`, `V1_SCOPE.md`, `PRISMA_CONVENTIONS.md`,
  `ENGINEERING_RULES.md`, `API_CONTRACT_RULES.md`, `ERROR_CATALOG.md`,
  `TESTING_STRATEGY.md`, `README.md`,
  `docs/phase-5-final-closeout-audit.md`,
  `SPRINT_11_IDENTITY_CREDENTIALS_PLAN.md`, `adr/ADR-0001-*`, and
  `adr/ADR-0002-*`.
- Schedule handoffs: `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md`,
  `adr/Teacher-App/teacher_SCHEDULE_BACKEND_MODELS.md`,
  `adr/Student-App/student_SCHEDULE_BACKEND_MODEL.md`, and
  `adr/Parent-App/parent_schedule.md`.
- Deferred adjacent handoffs:
  `adr/Teacher-App/teacher_HOMEWORKS_BACKEND_MODELS.md`,
  `adr/Student-App/student_HOMEWORKS_BACKEND_MODEL.md`,
  `adr/Parent-App/parent_homeworks.md`,
  `adr/Student-App/student_PICKUP_BACKEND_MODEL.md`, and
  `adr/Parent-App/parent_smart_pickup.md`.
- Current implementation: `prisma/schema.prisma`,
  `src/infrastructure/database/school-scope.extension.ts`,
  `src/modules/academics/**`, `src/modules/attendance/**`,
  `src/modules/teacher-app/**`, `src/modules/student-app/**`,
  `src/modules/parent-app/**`, and the requested E2E/security closeout suites.

## 1. Current State Summary

The backend already has several core building blocks that Schedule/Timetable
should reuse, but none of them is a durable timetable model by itself.

### Academics Core Reusable State

- `AcademicYear` exists as a school-scoped, soft-deletable model with
  start/end dates and active-state support.
- `Term` exists as a school-scoped, soft-deletable model related to
  `AcademicYear`. Current runtime uses `isActive`; the dashboard handoff also
  expects term open/closed behavior, so implementation should align "closed
  term" behavior before timetable writes are enabled.
- `Stage`, `Grade`, `Section`, and `Classroom` exist as normalized school-scoped
  structure models. `Classroom` belongs to `Section`, `Section` to `Grade`, and
  `Grade` to `Stage`.
- `Classroom` can optionally reference `Room`, which is useful for current room
  display but is not enough to model per-period room assignments.
- `Subject` exists as a school-scoped model with display names, optional code,
  optional color, and active status.
- `Room` exists as a school-scoped model with display names, capacity, floor,
  building, and active status.
- `TeacherSubjectAllocation` exists as the current allocation source of truth:
  `teacherUserId + subjectId + classroomId + termId`, unique per school context.
  This is the safest existing bridge between teacher, subject, classroom, and
  term.

Current `src/modules/academics` includes:

- `structure`: years, terms, stages, grades, sections, classrooms.
- `subjects`: subject CRUD.
- `rooms`: room CRUD.
- `teacher-allocation`: allocation list/create/delete.

There is no `academics/timetable` runtime module yet.

### Attendance Reusable State

Attendance Core already has session identity, but it is not schedule identity.

- `AttendanceSession` is school-scoped and stores `academicYearId`, `termId`,
  `date`, `scopeType`, `scopeKey`, optional placement ids, `mode`, `periodId`,
  `periodKey`, labels, policy, status, submission metadata, and soft delete.
- Its uniqueness key is:
  `schoolId + academicYearId + termId + date + scopeType + scopeKey + mode + periodKey`.
- `normalizeAttendancePeriodKey` maps daily attendance to `daily` and requires a
  `periodKey` for period attendance.
- Teacher App attendance currently resolves a classroom daily session from
  `TeacherSubjectAllocation.id` plus date, then calls Attendance Core with
  `scopeType = CLASSROOM` and `mode = DAILY`.
- Attendance sessions can later improve by linking to a timetable entry or
  occurrence key, but current attendance behavior must not be broken.

### App-Facing Current State

Teacher App:

- Teacher App is a composition layer over core modules.
- Current `classId` is explicitly `TeacherSubjectAllocation.id`.
- Teacher ownership is enforced through `TeacherAppAccessService` and
  `TeacherAppAllocationReadAdapter`.
- Home and classroom presenters intentionally return schedule placeholders:
  `{ available: false, reason: 'timetable_not_available' }`.
- Tests assert that Teacher Schedule routes are not registered and that
  `scheduleId` is not leaked.

Student App:

- Student App is a composition layer over core modules.
- `StudentAppAccessService` resolves the current linked `Student.userId` and one
  active enrollment.
- Current classroom, academic year, and term are derived from active enrollment.
- Student subjects are currently read from `TeacherSubjectAllocation` rows for
  the student's classroom and term.
- Home intentionally returns a timetable unavailable marker.
- Tests assert that Student Schedule/Timetable routes are absent and that
  `scheduleId` is not leaked.

Parent App:

- Parent App is a composition layer over core modules.
- `ParentAppAccessService` resolves parent ownership through current-school
  `Guardian.userId`, `StudentGuardian`, and active enrollments.
- Parent App is current-school only and does not aggregate across schools.
- Home and child detail intentionally mark schedule, homework, and pickup as
  unavailable/unsupported.
- Tests assert that Parent Schedule routes are absent and that same-school
  unlinked and cross-school guessed child ids return safe 404.

### Files And Attachments

Files Core exists with external object storage metadata (`File`) and generic
school-scoped `Attachment` links. Attendance excuses and communication surfaces
already use attachment patterns. Schedule itself does not require file storage
for V1 timetable entries, but future lesson preparation, lesson plans, or
homework attachments must use existing Files Core, not timetable rows.

### Existing Closeout Deferrals

Teacher App, Student App, Parent App, Phase 5 closeout, and Sprint 11 closeout
all intentionally defer:

- Schedule / Timetable / Period / durable `scheduleId`.
- Full Homework Core.
- Pickup / Smart Pickup.
- App-facing Notification Center policy.

Those deferrals are enforced by E2E and security tests that verify route absence
and response sanitization.

## 2. Contract Sources

### School Dashboard Academics Handoff

The dashboard academics handoff expects timetable to live under Academics as a
core operational workflow.

Expected dashboard concepts:

- Timetable config by scope: `TERM`, `GRADE`, `SECTION`, `CLASSROOM`.
- Active days and periods with index, display labels, start time, and end time.
- Timetable entries for `term + section + optional classroom + day + period`.
- Teacher, subject, room, and classroom/section scope on entries.
- Publish state, effectively `DRAFT` and `PUBLISHED`.
- Conflict tracking for `TEACHER` and `ROOM`.
- Validation and preview endpoints for completeness, subject hours, missing
  teacher/room values, and conflicts.
- Closed terms are read-only for timetable config and entry mutations.
- Classroom-specific rows must be preserved; a section cannot be flattened into
  one classroom.

The handoff uses `/api/academics/...` paths, which the backend must read as
`/api/v1/academics/...` because the framework global prefix is mandatory.

### Teacher Schedule ADR

The Teacher Schedule ADR expects:

- Daily schedule response: `{ date, items }`.
- Weekly schedule endpoint.
- Schedule item identity.
- Subject, class, stage/cycle, grade, section.
- Lesson title, room, notes.
- `startTime`, `endTime`, display labels, `periodLabel`, and `periodIndex`.
- `studentsCount`.
- `needsAttendance`.
- `isPrepared`.
- `hasHomework`.
- `completed | current | upcoming` status.
- `iconKey`.

The ADR's preferred paths are:

- `GET /teacher/schedule?date=YYYY-MM-DD`
- `GET /teacher/schedule/week?date=YYYY-MM-DD`

In backend V1 these become `/api/v1/teacher/...` when implemented.

### Student Schedule ADR

The Student Schedule ADR expects:

- `periods`: index, label, time range, start time, end time.
- `lessons`: day name, period index, subject, teacher name, room name.
- The frontend can compute current day and current period from time.
- Subject color can be tied to frontend subject styling.

The ADR implies a weekly/class timetable shape more than a per-item action
shape. It still depends on durable periods and timetable entries from core.

### Parent Schedule ADR

The Parent Schedule ADR expects:

- Child-scoped today schedule.
- Child-scoped weekly schedule.
- Today item fields: subject, time range, teacher, note, icon.
- Weekly fields: days, periods, lessons with day name, period index, subject,
  teacher name, room name, and color.
- Parent ownership must be child based.

Recommended final app paths are:

- `GET /api/v1/parent/children/:studentId/schedule/today`
- `GET /api/v1/parent/children/:studentId/schedule/weekly`

## 3. Gap Analysis

### Missing Today

- No durable Schedule/Timetable core model.
- No normalized period model.
- No timetable entry model.
- No timetable configuration model.
- No timetable publication workflow.
- No timetable conflict persistence or conflict read model.
- No schedule occurrence identity.
- No app-facing Teacher/Student/Parent schedule endpoints.
- No shared schedule presenter or app adapter.
- No link between schedule occurrences and Attendance sessions.
- No true Homework Core dependency integration.
- No Pickup or Smart Pickup timing dependency integration.
- No route, DTO, repository, or service under `src/modules/academics/timetable`.
- No `Timetable*` or `Schedule*` models in `prisma/schema.prisma`.

### Existing Data That Must Not Be Overstretched

- `TeacherSubjectAllocation` proves a teacher teaches a subject to a classroom
  in a term. It does not prove day, period, time, room, publication state, or
  occurrence identity.
- `AttendanceSession.periodKey` can store period-like values but is attendance
  specific. It is not a global timetable period.
- `Classroom.roomId` can express a default room, not a per-period room booking.
- App placeholders prove route absence, not schedule readiness.

### Must Not Be Done

- Do not fake schedule from teacher allocations only.
- Do not expose `scheduleId` until a durable schedule occurrence strategy
  exists.
- Do not backdoor app schedule routes inside Teacher App, Student App, or Parent
  App without Schedule/Timetable Core.
- Do not implement Homework Core inside Schedule sprint.
- Do not implement Pickup or Smart Pickup workflows inside Schedule sprint.
- Do not use Attendance sessions as the source of truth for timetable.
- Do not denormalize timetable solely to match app response cards.
- Do not expose `schoolId` or `organizationId` in app-facing schedule responses.

## 4. Recommended Domain Model

The recommended V1 model is a normalized Academics Timetable Core under
`src/modules/academics/timetable` with school-scoped Prisma models registered
in `SCHOOL_SCOPED_MODELS`.

### TimetableConfig

Purpose:

- Defines timetable settings for a term and scope.
- Owns active teaching days and the period set for that scope.
- Supports scope inheritance/resolution from term to grade to section to
  classroom.

Required fields:

- `id`
- `schoolId`
- `academicYearId`
- `termId`
- `scopeType`: `TERM | GRADE | SECTION | CLASSROOM`
- `scopeKey`: stable key such as `term:<termId>`, `grade:<gradeId>`,
  `section:<sectionId>`, `classroom:<classroomId>`
- Nullable scope ids: `gradeId`, `sectionId`, `classroomId`
- `weekStartsOn` or equivalent if product needs non-default week behavior
- `activeDays`: preferably a normalized child table later, but acceptable as a
  constrained JSON/enum array only if DTO validation is strict
- `status`: `DRAFT | PUBLISHED | ARCHIVED`, or keep status in
  `TimetablePublication`
- `createdAt`, `updatedAt`, optional `deletedAt`

School scope:

- Required `schoolId`.
- Must use scoped Prisma through repositories.
- Must be added to the school scope extension.

Relationship to academic year/term:

- Required relation to `AcademicYear` and `Term`.
- Term must belong to the same school and academic year.
- Mutations must reject closed/non-writable terms.

Relationship to grade/section/classroom:

- Scope ids must match `scopeType`.
- A classroom config must validate that classroom belongs to section and grade.
- A section config must validate that section belongs to grade.

Relationship to subject/teacher allocation:

- None directly. Config describes time shape, not teaching assignments.

Relationship to room:

- None directly.

Mutable after publication:

- Direct edits to published config should be blocked.
- Safer strategy: create a new draft revision and publish it when valid.

Uniqueness constraints:

- Unique active config per `schoolId + termId + scopeType + scopeKey`.
- If revisioning is added, unique
  `schoolId + termId + scopeType + scopeKey + revision`.

Indexes:

- `schoolId`
- `academicYearId`
- `termId`
- `schoolId + termId`
- `schoolId + termId + scopeType + scopeKey`
- `deletedAt` if soft delete is used

### TimetablePeriod

Purpose:

- Defines a time slot in a timetable config.
- Provides the canonical period index/label/time range used by entries and app
  presenters.

Required fields:

- `id`
- `schoolId`
- `configId`
- `academicYearId`
- `termId`
- `periodIndex`
- `periodKey`
- `labelAr`
- `labelEn`
- `startMinute`
- `endMinute`
- `kind`: `INSTRUCTION | BREAK | ASSEMBLY` if product needs non-teaching slots;
  otherwise `isTeachingPeriod Boolean`
- `isActive`
- `sortOrder`
- `createdAt`, `updatedAt`, optional `deletedAt`

Time representation:

- Prefer integer minutes from midnight for validation and overlap checks.
- Presenters can render `HH:mm` and ISO datetimes for app responses.

School scope:

- Required `schoolId`.
- Must be registered in school scope.

Relationship to academic year/term:

- Required through `configId`, with denormalized `academicYearId` and `termId`
  acceptable for query/index performance if kept consistent by use-cases.

Relationship to grade/section/classroom:

- Inherited through `TimetableConfig`.

Relationship to subject/teacher allocation:

- None.

Relationship to room:

- None.

Mutable after publication:

- Draft periods are mutable.
- Published periods are locked if entries or published occurrences depend on
  them. Use new revision for changes.

Uniqueness constraints:

- Unique `schoolId + configId + periodIndex`.
- Unique `schoolId + configId + periodKey`.
- No overlapping teaching periods within the same `configId`.

Indexes:

- `schoolId`
- `configId`
- `termId`
- `schoolId + configId + periodIndex`
- `deletedAt` if soft delete is used

### TimetableEntry

Purpose:

- Represents the weekly timetable template slot:
  classroom + day + period + teacher allocation + room.
- It is not by itself a daily occurrence.

Required fields:

- `id`
- `schoolId`
- `academicYearId`
- `termId`
- `configId`
- `periodId`
- `dayOfWeek`: stable enum or integer, using one canonical school-local week
  convention
- `classroomId`
- `sectionId`
- `gradeId`
- `teacherSubjectAllocationId`
- `roomId` nullable
- `notesAr` nullable
- `notesEn` nullable
- `status`: `DRAFT | PUBLISHED | ARCHIVED`, or status through publication
- `createdAt`, `updatedAt`, optional `deletedAt`

School scope:

- Required `schoolId`.
- Must be registered in school scope.

Relationship to academic year/term:

- Required `academicYearId` and `termId`.
- Must match the referenced allocation term and config term.

Relationship to grade/section/classroom:

- Required `classroomId`.
- `sectionId` and `gradeId` can be denormalized for indexes/read speed, but
  must be validated from `Classroom -> Section -> Grade`.

Relationship to subject/teacher allocation:

- Required `teacherSubjectAllocationId`.
- This keeps teacher, subject, classroom, and term consistent.
- App presenters can derive teacher and subject from the allocation.

Relationship to room:

- Optional `roomId`.
- If null, presenter may fall back to `Classroom.roomId` only as display
  fallback, not as a booking conflict.

Mutable after publication:

- Draft entries are mutable.
- Published entries should not be edited in place; use revision strategy or
  explicit unpublish with audit.

Uniqueness constraints:

- Unique classroom slot:
  `schoolId + termId + classroomId + dayOfWeek + periodId`.
- Unique entry per allocation/slot may also be enforced:
  `schoolId + termId + teacherSubjectAllocationId + dayOfWeek + periodId`.
- Room conflict should be detected by validation and optionally a partial unique
  index for non-null `roomId` if product wants hard enforcement.

Indexes:

- `schoolId`
- `academicYearId`
- `termId`
- `configId`
- `periodId`
- `classroomId`
- `teacherSubjectAllocationId`
- `roomId`
- `schoolId + termId + classroomId + dayOfWeek`
- `schoolId + termId + teacherSubjectAllocationId + dayOfWeek`
- `schoolId + termId + roomId + dayOfWeek`
- `deletedAt` if soft delete is used

### TimetablePublication

Purpose:

- Captures publish state and revision history for timetable scope.
- Prevents silent mutation of live schedules.
- Provides a stable revision to use in app schedule occurrence keys.

Required fields:

- `id`
- `schoolId`
- `academicYearId`
- `termId`
- `configId`
- `scopeType`
- `scopeKey`
- `revision`
- `status`: `DRAFT | PUBLISHED | UNPUBLISHED | ARCHIVED`
- `publishedAt`
- `publishedById`
- `unpublishedAt`
- `unpublishedById`
- `createdAt`, `updatedAt`

School scope:

- Required `schoolId`.
- Must be registered in school scope.

Relationship to academic year/term:

- Required.

Relationship to grade/section/classroom:

- Through scope ids/config.

Relationship to subject/teacher allocation:

- Through published `TimetableEntry` rows.

Relationship to room:

- Through published `TimetableEntry` rows.

Mutable after publication:

- Published rows are append-only except controlled unpublish/archive state
  transitions.
- Changes should produce a new draft revision.

Uniqueness constraints:

- Unique `schoolId + termId + scopeType + scopeKey + revision`.
- Only one published publication per `schoolId + termId + scopeType + scopeKey`
  through a partial unique index.

Indexes:

- `schoolId`
- `termId`
- `configId`
- `schoolId + termId + status`
- `schoolId + termId + scopeType + scopeKey`
- `publishedAt`

### TimetableConflict

Purpose:

- Persist conflict validation results so dashboard can list, review, and block
  publish until conflicts are resolved.

Required fields:

- `id`
- `schoolId`
- `academicYearId`
- `termId`
- `configId`
- `publicationId` nullable for draft validation
- `entryId`
- `relatedEntryId` nullable
- `conflictType`: `TEACHER | ROOM | CLASSROOM_SLOT | PERIOD_OVERLAP`
- `severity`: `BLOCKING | WARNING`
- `dayOfWeek`
- `periodId`
- `teacherUserId` nullable
- `roomId` nullable
- `status`: `OPEN | RESOLVED | IGNORED`
- `messageEn`
- `messageAr` nullable
- `fingerprint`
- `detectedAt`
- `resolvedAt` nullable

School scope:

- Required `schoolId`.
- Must be registered in school scope.

Relationship to academic year/term:

- Required.

Relationship to grade/section/classroom:

- Through `entryId` and optional denormalized fields if needed for filters.

Relationship to subject/teacher allocation:

- Through `entryId`.

Relationship to room:

- Through `roomId` or entry room.

Mutable after publication:

- Recomputed by validation.
- User mutation should be limited to explicit ignore/resolve if product approves.

Uniqueness constraints:

- Unique `schoolId + configId + fingerprint`.

Indexes:

- `schoolId`
- `termId`
- `configId`
- `publicationId`
- `entryId`
- `relatedEntryId`
- `schoolId + termId + status`
- `schoolId + termId + conflictType`

### ScheduleOccurrence Strategy

Purpose:

- Represents a daily occurrence of a published timetable entry.
- Provides the app-facing identity behind `scheduleId`.

Recommended V1 approach:

- Do not materialize every occurrence by default in Sprint 12B.
- Define a deterministic occurrence key from:
  `publicationId + timetableEntryId + localDate`.
- Resolve that key through Schedule Core at read/action time.
- Materialize a `ScheduleOccurrence` table only when product needs cancelled
  individual lessons, substitutions, occurrence notes, immutable historical
  schedule ids, or direct foreign keys from Attendance/Homework/Lesson Plans.

If materialized, required fields:

- `id`
- `schoolId`
- `academicYearId`
- `termId`
- `publicationId`
- `timetableEntryId`
- `occurrenceDate`
- `occurrenceKey`
- `status`: `SCHEDULED | CANCELLED | COMPLETED`
- Optional `actualStartMinute`, `actualEndMinute`
- Optional `notesAr`, `notesEn`
- `createdAt`, `updatedAt`

Uniqueness constraints:

- Unique `schoolId + publicationId + timetableEntryId + occurrenceDate`.
- Unique `schoolId + occurrenceKey`.

Indexes:

- `schoolId`
- `termId`
- `occurrenceDate`
- `timetableEntryId`
- `publicationId`
- `schoolId + termId + occurrenceDate`

## 5. Schedule Identity Strategy

### What Is `scheduleId`?

`scheduleId` should identify a daily schedule occurrence, not the reusable
weekly timetable template.

Recommended definition:

- `TimetableEntry.id` is the dashboard/core weekly template id.
- `scheduleId` in app-facing APIs is a schedule occurrence identity for one
  date, one published timetable entry, and one publication revision.

### Should App-Facing `scheduleId` Be `TimetableEntry.id`?

No. `TimetableEntry.id` repeats every week and cannot distinguish:

- Sunday period 1 this week from Sunday period 1 next week.
- An attendance session for one date from another date.
- A future occurrence affected by a new publication revision.
- A cancelled or substituted occurrence if those are introduced later.

### Recommended App-Facing Identity

Use a durable occurrence identity after core exists:

- Short-term V1 read strategy:
  `scheduleId = deterministic occurrence key`, generated from
  `publicationId + timetableEntryId + YYYY-MM-DD`.
- Long-term strategy:
  materialized `ScheduleOccurrence.id` if the product needs per-occurrence
  mutation, substitutions, cancellation, or immutable historical references.

Until one of those strategies is implemented and validated, app responses should
continue to omit `scheduleId`.

### Daily Occurrence Representation

Daily schedule reads should:

1. Resolve active academic year and term from `RequestContext` or date.
2. Resolve the actor's schedule scope:
   - Teacher: owned published entries where allocation teacher is the actor.
   - Student: active enrollment classroom.
   - Parent: owned current-school child active enrollment classroom.
3. Determine local day of week from `date`.
4. Load published timetable entries for that day.
5. Join periods for start/end minutes.
6. Compute `startTime` and `endTime` as school-local datetimes rendered in ISO.
7. Compute `completed | current | upcoming` at presenter level.

### Date + DayOfWeek + PeriodIndex Mapping

- `date` maps to `dayOfWeek` in school timezone.
- `periodIndex` resolves to `TimetablePeriod` within the effective config.
- `TimetableEntry` should reference `periodId`, not only `periodIndex`, to
  survive label/time changes between revisions.
- Presenters may include `periodIndex`, `periodLabel`, `startTimeLabel`, and
  `endTimeLabel`.

### Attendance Session Relationship

Current Attendance can resolve sessions from classroom/date/allocation-derived
scope without a schedule occurrence. Later Schedule can improve identity by
passing:

- `timetableEntryId`
- `scheduleOccurrenceKey`
- `periodId`
- `periodKey`
- period labels

Do not require old attendance sessions to have schedule fields. Add nullable
links later and keep fallback resolution.

### What To Expose To Apps

Teacher App:

- `scheduleId` only after occurrence strategy exists.
- `classId` remains `TeacherSubjectAllocation.id`.
- Include subject, class, grade, section, teacher-owned room/time fields,
  `needsAttendance`, `isPrepared`, `hasHomework`, and status.

Student App:

- Expose class timetable for current active enrollment classroom.
- Include periods and lessons with teacher/room/subject fields.
- Avoid internal allocation ids unless a frontend action requires them.

Parent App:

- Expose child schedule only after parent ownership is resolved.
- Return child-specific today/weekly views.
- No `schoolId`, `organizationId`, guardian internals, or cross-school child
  aggregation.

## 6. Dashboard APIs Recommended Contract

These endpoints are recommendations only. They are not implemented in Sprint
12A.

Recommended permissions:

- Read: `academics.timetable.view`
- Manage draft config/periods/entries: `academics.timetable.manage`
- Publish/unpublish: `academics.timetable.publish`
- Conflict reads: `academics.timetable.view`

If Sprint 12B decides not to add granular permissions immediately, it may map
temporarily to existing `academics.structure.view/manage`, but the safer target
is timetable-specific permissions.

### Config

Endpoints:

- `GET /api/v1/academics/timetable/config`
- `PUT /api/v1/academics/timetable/config`

Behavior:

- Resolve by `termId`, `scopeType`, and scope id.
- Return effective config, optionally including inheritance metadata.
- `PUT` creates or updates a draft config.
- Reject writes for closed terms or published locked revisions.
- Validate scope ids against current school and academic hierarchy.
- Validate active days and ensure at least one active teaching day if entries
  exist.

### Periods

Endpoints:

- `GET /api/v1/academics/timetable/periods`
- `POST /api/v1/academics/timetable/periods`
- `PATCH /api/v1/academics/timetable/periods/:periodId`
- `DELETE /api/v1/academics/timetable/periods/:periodId`

Behavior:

- List periods for a config/effective scope.
- Create/update/delete only in draft config or draft revision.
- Reject invalid time ranges.
- Reject period overlaps inside the same config.
- Reject deletion when a draft/published entry still references the period
  unless the request explicitly removes dependent draft entries.
- Published period changes require a new revision.

### Entries

Endpoints:

- `GET /api/v1/academics/timetable/entries`
- `POST /api/v1/academics/timetable/entries`
- `PATCH /api/v1/academics/timetable/entries/:entryId`
- `DELETE /api/v1/academics/timetable/entries/:entryId`
- `POST /api/v1/academics/timetable/entries/bulk`

Behavior:

- List entries by `termId`, `scopeType`, `scopeId`, `classroomId`, `teacherId`,
  `subjectId`, `roomId`, `dayOfWeek`, and publication status where needed.
- Create/update entries only against draft revisions.
- Validate the teacher allocation belongs to the same school, term, subject,
  and classroom.
- Validate period belongs to the effective config.
- Validate room belongs to the same school and is active if provided.
- Enforce one classroom slot per day/period.
- Detect teacher and room conflicts before save or as a conflict response,
  depending on final UX.
- Bulk endpoint should be transactional and return created/updated/deleted
  counts plus conflicts.

### Publish / Unpublish / Revision

Endpoints:

- `POST /api/v1/academics/timetable/publish`
- `POST /api/v1/academics/timetable/unpublish`

Safer alternative:

- Use revision endpoints instead of direct unpublish:
  `POST /api/v1/academics/timetable/revisions`
  and `POST /api/v1/academics/timetable/revisions/:revisionId/publish`.

Behavior:

- Publish validates periods, required slots, teacher allocation consistency,
  teacher conflicts, room conflicts, and closed-term rules.
- Publish records `publishedById` and `publishedAt`.
- Published timetables are locked from direct mutation.
- Unpublish should be restricted and audited. If attendance sessions already
  reference occurrences, unpublish should be blocked or produce a new revision
  instead.

### Conflicts

Endpoints:

- `GET /api/v1/academics/timetable/conflicts`

Behavior:

- Return current draft or published conflict read model.
- Support filters by term, config, scope, type, severity, status, teacher, room,
  day, and period.
- Never leak cross-school teacher/room/classroom ids.
- Blocking conflicts should prevent publish.

### Preview

Endpoint:

- `GET /api/v1/academics/timetable/preview`

Behavior:

- Return the effective timetable grid for a term/scope without publishing.
- Include periods, days, entries, completeness metrics, and conflicts.
- Useful for dashboard review and app-read simulation.
- Read-only and safe for closed terms.

## 7. App-Facing Schedule Contracts

These endpoints are recommendations only. They are not implemented in Sprint
12A.

### Teacher

Endpoints:

- `GET /api/v1/teacher/schedule?date=YYYY-MM-DD`
- `GET /api/v1/teacher/schedule/week?date=YYYY-MM-DD`

Ownership:

- Actor must be `teacher`.
- Teacher sees only published schedule entries for allocations where
  `TeacherSubjectAllocation.teacherUserId = actor.id`.
- Same-school other-teacher entries and cross-school guessed ids must return
  safe 404 where an id is supplied.

Response direction:

- Daily response should include `date` and `items`.
- Weekly response should include days, periods, and items grouped by day.
- Each item should include occurrence `scheduleId` only after occurrence identity
  exists, plus `classId` as `TeacherSubjectAllocation.id`.
- `needsAttendance` can be derived by checking whether a matching Attendance
  session is missing/draft/submitted for that occurrence/date.
- `isPrepared` should remain false/null/unsupported until Lesson Plan or
  preparation source exists.
- `hasHomework` should remain false/null/unsupported until Homework Core exists.

### Student

Endpoints:

- `GET /api/v1/student/schedule?date=YYYY-MM-DD`
- `GET /api/v1/student/schedule/week?date=YYYY-MM-DD`

Ownership:

- Actor must be `student`.
- Student must resolve through `Student.userId` and active enrollment.
- Student sees only published schedule entries for the active enrollment
  classroom in the current school.
- Same-school other-classroom and cross-school guessed ids must return safe 404.

Response direction:

- Daily response can include `date`, `periods`, and `items`.
- Weekly response should match the ADR's `periods` plus `lessons` shape, with
  backend-friendly camelCase accepted if DTOs define it consistently.
- No `schoolId` or `organizationId`.

### Parent

Endpoints:

- `GET /api/v1/parent/children/:studentId/schedule/today`
- `GET /api/v1/parent/children/:studentId/schedule/weekly`

Ownership:

- Actor must be `parent`.
- Parent must resolve through current-school `Guardian.userId`,
  `StudentGuardian`, and active enrollment.
- Parent sees only owned current-school child schedules.
- Same-school unlinked child ids and cross-school child ids must return safe
  404.
- No cross-school parent aggregation in V1.

Response direction:

- Today response includes child id, day name, items, and optional parent note.
- Weekly response includes days, periods, and lessons.
- No `schoolId`, `organizationId`, guardian ids, or internal storage fields.

## 8. Attendance Relationship

Current Attendance behavior is valid and should continue:

- A teacher can resolve a classroom daily roll-call session from an owned
  allocation plus date.
- Core Attendance resolves uniqueness from date, scope, mode, and period key.
- Existing attendance sessions and reports should remain readable and
  actionable without schedule fields.

Future Schedule can improve Attendance by adding optional links:

- `AttendanceSession.timetableEntryId` nullable.
- `AttendanceSession.scheduleOccurrenceKey` nullable, or
  `AttendanceSession.scheduleOccurrenceId` if a materialized occurrence table
  exists.
- Existing `periodId`, `periodKey`, and labels can be filled from
  `TimetablePeriod`.

Migration-safe strategy:

1. Implement Timetable Core without changing Attendance behavior.
2. Add nullable attendance references only after Schedule Core is published.
3. On schedule-based session resolution, validate occurrence ownership and
   derive the existing Attendance key.
4. Keep fallback by `classroom/date/mode/periodKey` for old sessions.
5. Backfill only where unambiguous.
6. Never make schedule references required until legacy sessions are safely
   handled.

Recommended future behavior:

- Daily classroom attendance may continue using `periodKey = daily`.
- Period attendance should use timetable period key/id.
- If product wants attendance per scheduled lesson, the Attendance session should
  reference the occurrence identity or store `scheduleOccurrenceKey`.

## 9. Homework And Pickup Relationship

Homework Core remains deferred.

- `hasHomework` should not be implemented by guessing from Grade assignments or
  Reinforcement tasks.
- Until Homework Core exists, Schedule responses should use a stable
  false/null/unsupported marker. The safest app contract is `hasHomework: null`
  or `homework: { available: false, reason: 'homework_core_not_available' }`
  if frontend accepts it.
- Full homework routes and submissions must remain outside Schedule sprint.

Pickup and Smart Pickup remain deferred.

- Schedule may later provide dismissal time or day timing windows to Pickup
  Core.
- Schedule must not create pickup requests, geofence checks, pickup queues,
  parent location tracking, delegate pickup, or gate workflow.
- Pickup timing integration should be a future dependency from Pickup Core to
  published timetable/calendar data, not a Schedule implementation side effect.

## 10. Security And Tenancy

### School Scope Models

Every new tenant-scoped model must include `schoolId` and be registered in
`SCHOOL_SCOPED_MODELS`:

- `TimetableConfig`
- `TimetablePeriod`
- `TimetableEntry`
- `TimetablePublication`
- `TimetableConflict`
- `ScheduleOccurrence` if materialized

### RequestContext Requirements

Every schedule/timetable request must resolve:

- actor
- user type
- active membership
- school and organization context
- permissions
- academic year and term context where relevant

Dashboard endpoints require school admin/academic permissions. App endpoints
require actor-specific ownership.

### Platform Bypass

No platform bypass should be used for regular timetable reads or writes.
Platform bypass is acceptable only for explicit platform/admin diagnostics or
setup flows with `@PlatformScope()` and a documented reason.

### Controller And Repository Rules

- No business logic in controllers.
- No direct Prisma in controllers.
- Controllers delegate to use-cases.
- Repositories/adapters own Prisma access.
- Presenters shape frontend contracts.
- DTOs validate request and response contracts.

### Ownership And Safe 404

- Teacher schedule id/class id access outside owned allocations returns safe
  404.
- Student access outside active enrollment classroom returns safe 404.
- Parent access for same-school unlinked or cross-school child ids returns safe
  404.
- Cross-school teacher, room, classroom, entry, config, publication, and
  conflict ids return safe 404.

### Response Sanitization

App-facing responses must not include:

- `schoolId`
- `organizationId`
- raw storage keys
- password/session/token fields
- internal `publicationId` if not part of the contract
- raw conflict internals
- teacher/user metadata beyond required display fields

### Permission Strategy

Recommended dashboard permissions:

- `academics.timetable.view`
- `academics.timetable.manage`
- `academics.timetable.publish`

Recommended app permissions:

- App routes should primarily rely on user type and ownership, with existing
  app read permissions if already seeded for the role. They should not expose
  dashboard timetable management operations.

## 11. Error Codes

Recommended future additions to `ERROR_CATALOG.md`:

| Code | HTTP | Use |
| --- | --- | --- |
| `academics.timetable.config_not_found` | 404 | Config is missing or outside scope. |
| `academics.timetable.period_not_found` | 404 | Period is missing or outside scope. |
| `academics.timetable.entry_not_found` | 404 | Entry is missing or outside scope. |
| `academics.timetable.entry_conflict` | 409 | Entry violates classroom slot or other saved constraint. |
| `academics.timetable.closed_term` | 409 | Term is closed for timetable writes. |
| `academics.timetable.published_locked` | 409 | Published revision cannot be edited directly. |
| `academics.timetable.invalid_time_range` | 422 | Period start/end range is invalid. |
| `academics.timetable.period_overlap` | 409 | Period overlaps another period in the same config. |
| `academics.timetable.teacher_conflict` | 409 | Teacher is booked in another slot at the same time. |
| `academics.timetable.room_conflict` | 409 | Room is booked in another slot at the same time. |
| `academics.timetable.not_published` | 404 or 409 | App read or publish-dependent action has no published timetable. |
| `academics.timetable.publication_not_found` | 404 | Publication/revision is missing or outside scope. |
| `academics.timetable.conflict_not_found` | 404 | Conflict row is missing or outside scope. |
| `schedule.occurrence_not_found` | 404 | App-facing occurrence is missing, unpublished, or outside ownership. |
| `schedule.invalid_date` | 422 | Date cannot map to an academic term/day. |

Status choices:

- Use 404 for missing/out-of-scope resources to preserve safe boundaries.
- Use 409 for state conflicts and locked published revisions.
- Use 422 for semantic validation such as invalid time range or invalid date.

## 12. Testing Strategy

Recommended tests for implementation sprints:

- Unit tests for period validation: start before end, minute bounds, no overlap,
  unique period index/key, label normalization.
- Unit tests for config scope validation: term, grade, section, classroom scope
  consistency.
- Unit tests for entry validation: allocation term/classroom consistency,
  room active state, period belongs to config, closed term rejection.
- Conflict detection tests for teacher conflicts, room conflicts, classroom slot
  conflicts, and non-teaching period rejection.
- Use-case tests for config CRUD, period CRUD, entry CRUD, bulk entry save,
  publish, unpublish/revision, preview, and conflict read behavior.
- Repository/schoolScope tests for every new school-scoped model.
- Security tenancy tests for dashboard timetable config/period/entry/publication
  CRUD and conflict reads.
- E2E dashboard timetable flow from config to periods to entries to conflict
  detection to publish.
- E2E Teacher App daily/weekly schedule flow after published timetable exists.
- E2E Student App daily/weekly schedule flow from active enrollment.
- E2E Parent App child today/weekly schedule flow with same-school unlinked and
  cross-school child 404 checks.
- Regression tests confirming Teacher/Student/Parent apps still do not expose
  Homework, Pickup, or Notification Center routes.
- Regression tests confirming `scheduleId` is absent until occurrence identity
  exists, then present only as occurrence identity.
- Attendance compatibility tests proving existing classroom/date daily session
  resolution still works after timetable links are added.

## 13. Recommended Sprint Breakdown

### Sprint 12B - Schedule/Timetable Schema And Dashboard Foundation

- Add Prisma enums/models/migration for config, periods, entries,
  publications, and conflicts.
- Register models in `SCHOOL_SCOPED_MODELS`.
- Add module skeleton under `src/modules/academics/timetable`.
- Add permissions and seed updates if approved.
- Add repositories, DTOs, presenters, and domain validators.
- Do not add app-facing schedule endpoints yet.

### Sprint 12C - Period/Entry CRUD And Conflict Detection

- Implement dashboard config/period/entry CRUD.
- Implement bulk entry save.
- Implement conflict detection for classroom, teacher, room, and period issues.
- Persist conflict read model.
- Add unit/use-case/security tests.

### Sprint 12D - Publish/Preview And Attendance Compatibility

- Implement preview.
- Implement publish and safer unpublish/revision behavior.
- Lock published revisions.
- Add optional Attendance compatibility hooks, without requiring schedule links
  for existing sessions.
- Add dashboard E2E flow.

### Sprint 12E - Teacher/Student/Parent Schedule Read APIs

- Implement read-only app schedule endpoints over published timetable.
- Implement occurrence identity strategy before exposing `scheduleId`.
- Enforce Teacher, Student, and Parent ownership rules.
- Keep Homework/Pickup unsupported markers.
- Add app E2E and tenancy tests.

### Sprint 12F - Closeout, README, Swagger, And Project Structure

- Add final closeout E2E.
- Add `verify:sprint12f` or successor verification chain.
- Update README runbook.
- Update Swagger/OpenAPI docs.
- Update project structure artifact after review.
- Confirm no Homework/Pickup/Notification Center backdoor.

This sequence keeps core truth ahead of app composition and prevents repeating
placeholder app routes without a durable timetable foundation.

## 14. Final Recommendation

Schedule/Timetable is ready for implementation after product approval of the
identity and publication decisions below. It is not ready to expose app-facing
routes until the core timetable and occurrence identity exist.

First runtime task to start:

- Sprint 12B: add the Academics Timetable Core schema/migration and dashboard
  foundation for timetable config, periods, entries, publications, and conflict
  tracking.

Open decisions requiring approval:

- Whether published timetable changes use direct unpublish or a required
  revision workflow.
- Whether V1 app `scheduleId` uses deterministic occurrence keys or a
  materialized `ScheduleOccurrence` table.
- Whether timetable config active days are normalized child rows or constrained
  JSON/enum arrays.
- Whether timetable-specific permissions are introduced immediately or mapped
  temporarily to existing academics structure permissions.
- Whether closed term state remains `Term.isActive` for now or is upgraded to a
  richer term status before timetable writes.

Explicit deferred scope preserved:

- Full Homework Core remains deferred.
- Pickup / Smart Pickup remains deferred.
- App-facing Notification Center remains deferred.
- Schedule sprint must not implement homework submissions, pickup requests,
  geofence workflows, notification center behavior, or new app mutation surfaces
  outside approved timetable/schedule reads.

Sprint 12A creates exactly one new file:

- `docs/sprint-12a-schedule-timetable-core-contract-audit.md`
