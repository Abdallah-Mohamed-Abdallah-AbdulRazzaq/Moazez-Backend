# Sprint 15A Academics, Curriculum, and Homework Completion Audit

## 1. Purpose and scope

Sprint 15A is an audit and design sprint only. Its purpose is to document the backend-native completion plan for Academics, Curriculum, Educational Content, Lesson Plans, and the Homework learning flow before any runtime implementation work begins.

This document does not introduce runtime behavior. No controllers, services, repositories, presenters, DTOs, Prisma schema, migrations, tests, package scripts, README files, or project structure documentation were changed as part of this sprint. The only intended repository change is this audit document:

- `docs/sprint-15a-academics-curriculum-homework-completion-audit.md`

The audit is grounded in the current backend implementation, existing architecture rules, and frontend/product ADR intent. It is not an implementation patch.

## 2. ADR interpretation policy

The files under `adr/` describe older frontend product and design expectations for the School Dashboard, Teacher App, Student App, and Parent App. They should be treated as product intent references, not literal backend API contracts.

Backend implementation must use ADR files to understand:

- The learning behavior expected by users.
- Which business capabilities are missing.
- How teachers, students, parents, and school admins expect curriculum, lesson content, lesson plans, and homework to interact.
- Where future app-facing presenters may need richer read models.

Backend implementation must not use ADR files to:

- Rename existing shipped backend routes.
- Reshape existing backend payloads just to match older frontend examples.
- Copy frontend route paths into backend modules when backend-native routes already exist.
- Collapse normalized backend storage into frontend-specific response shapes.

The backend-native approach should preserve the current architecture: core domain modules own source-of-truth data and rules, app-facing modules compose read models, presenters shape responses, repositories own Prisma access, use cases own application logic, guards enforce scope and permissions, and app-facing payloads avoid leaking `schoolId` or `organizationId` unless an existing admin contract explicitly requires it.

## 3. Current implemented backend state

### Academics

Academics is currently implemented as a core module with school structure, subjects, rooms, teacher allocation, and timetable support.

Evidence:

- `src/modules/academics/academics.module.ts`
- `src/modules/academics/structure/**`
- `src/modules/academics/subjects/**`
- `src/modules/academics/rooms/**`
- `src/modules/academics/teacher-allocation/**`
- `src/modules/academics/timetable/**`
- `prisma/migrations/20260419162438_0003_academic_structure/migration.sql`
- `prisma/migrations/20260522120000_0022_schedule_timetable_core_foundation/migration.sql`
- `test/security/tenancy.academics.spec.ts`

Implemented capabilities:

- Structure:
  - Academic years and terms.
  - Stages, grades, sections, and classrooms.
  - Structure tree reads and scoped school admin management.
- Years and terms:
  - Runtime support exists through the structure module and academic structure schema.
  - Terms are used by timetable and homework as part of academic scoping.
- Stages, grades, sections, and classrooms:
  - Runtime CRUD and reorder support exists in `src/modules/academics/structure/controller/structure.controller.ts`.
  - Data is stored through normalized academic structure tables in Prisma.
- Subjects:
  - Runtime list/create/update/delete support exists in `src/modules/academics/subjects/controller/subjects.controller.ts`.
- Rooms:
  - Runtime list/create/update/delete support exists in `src/modules/academics/rooms/controller/rooms.controller.ts`.
- Teacher allocations:
  - Runtime list/create/delete support exists in `src/modules/academics/teacher-allocation/controller/teacher-allocation.controller.ts`.
  - Allocation records connect teachers, subjects, academic year, term, grade, section, and optional classroom.
- Timetable:
  - Runtime timetable config, periods, entries, conflict preview, publication, and publish support exists in `src/modules/academics/timetable/controller/timetable.controller.ts`.

Not currently implemented in Academics runtime:

- Academic overview module.
- Academic calendar module.
- Subject allocation matrix.
- Curriculum module.
- Curriculum units and lessons.
- Lesson educational content and resources.
- Lesson plans.

### Homework

Homework Core already has the assignment, target, student text submission, and teacher review foundation.

Evidence:

- `src/modules/homework/homework.module.ts`
- `src/modules/homework/controller/homework-assignments.controller.ts`
- `src/modules/homework/application/homework-assignments.use-cases.ts`
- `src/modules/homework/application/homework-submissions.use-cases.ts`
- `src/modules/homework/infrastructure/homework.repository.ts`
- `src/modules/homework/dto/homework-assignment.dto.ts`
- `src/modules/homework/dto/homework-assignment-response.dto.ts`
- `src/modules/teacher-app/homeworks/**`
- `src/modules/student-app/homeworks/**`
- `src/modules/parent-app/homeworks/**`
- `prisma/migrations/20260524120000_0023_homework_core_foundation/migration.sql`
- `prisma/migrations/20260525120000_0024_homework_student_submission_foundation/migration.sql`
- `prisma/migrations/20260525130000_0025_homework_teacher_submission_review_foundation/migration.sql`
- `test/security/tenancy.homework.spec.ts`
- `test/e2e/homework-final-closeout.e2e-spec.ts`
- `test/e2e/homework-submissions-final-closeout.e2e-spec.ts`

Implemented capabilities:

- Assignments:
  - Core create, list, get, update, publish, close, and cancel flows exist under `homework/assignments`.
  - Assignment validation checks academic scope, teacher allocation, optional timetable entry, due date rules, and lifecycle state.
- Targets:
  - Assignment targets are resolved from active student enrollments.
  - Teacher and core routes can list and resolve targets.
- Teacher app workflow:
  - `src/modules/teacher-app/homeworks/controller/teacher-homeworks.controller.ts` composes Homework Core for dashboard, class assignments, assignment lifecycle, target resolution, submissions, and teacher review.
  - Ownership is enforced through `TeacherHomeworkOwnershipService`.
- Student app homework read and text submission:
  - `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` supports list, detail, submission read, draft save, and submit.
  - Current submissions are text based through `bodyText`.
- Parent app homework visibility:
  - `src/modules/parent-app/homeworks/controller/parent-homeworks.controller.ts` supports read-only parent list/detail for a child.
  - Parent access is scoped through student ownership.
- Teacher review:
  - Teacher review supports `reviewNote` and optional `awardedMarks`.
  - Review lifecycle is handled by Homework Core submission use cases.

Not currently implemented in Homework runtime:

- Homework questions.
- Homework options.
- Homework assignment attachments.
- Question-specific student answers.
- Submission attachments and proof uploads.
- Parent submit.
- Full parent/student answer and correct-answer visibility.
- Homework-driven grade sync, notifications, or XP/reward side effects.

### Reusable foundations

Several existing modules provide foundations that future learning-flow work can reuse without mixing domains prematurely.

- Files:
  - `src/modules/files/files.module.ts`
  - `src/modules/files/uploads/**`
  - `src/modules/files/attachments/**`
  - `src/modules/files/attachments/validators/attachment-target.validator.ts`
  - `prisma/schema.prisma`
  - Current attachment target validation does not yet include homework or lesson resources.
- Grades:
  - `src/modules/grades/**`
  - `GradeAssessment`, `GradeItem`, `GradeAssessmentQuestion`, `GradeAssessmentQuestionOption`, `GradeSubmission`, and answer models exist in `prisma/schema.prisma`.
  - `HomeworkAssignment` has an optional `gradeAssessmentId`, but Homework Core does not currently sync grades.
- Communication:
  - `src/modules/communication/**`
  - Notification foundations exist, but source/type enums do not currently model homework-specific events.
- Reinforcement:
  - `src/modules/reinforcement/**`
  - XP, rewards, tasks, templates, review, and hero journey foundations exist.
  - XP source types do not currently include homework or lesson completion.

## 4. Missing or incomplete backend capabilities

| Capability | Current status | Existing source evidence | Recommended backend-native implementation direction | Schema likely required later | Domain |
| --- | --- | --- | --- | --- | --- |
| Academics overview | Absent | `src/modules/academics/academics.module.ts`; no `src/modules/academics/overview`; `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md` | Add a read-only Academics overview adapter/presenter that composes counts and setup status from Academics Core. Avoid new source-of-truth tables unless cached summaries are later approved. | No for initial read model | Academics |
| Academic calendar | Absent | `src/modules/academics/academics.module.ts`; no academic calendar module or calendar event model; `adr/School-Dashboard/sis_dashboard-academics_backend_handoff_spec.md` | Add an Academics calendar submodule for term-scoped school, stage, grade, section, and classroom events. Use it as an input to lesson-plan scheduling and holiday exclusion. | Yes | Academics |
| Subject allocation matrix | Absent | `src/modules/academics/subjects/**`; `src/modules/academics/teacher-allocation/**`; no subject weekly-hours allocation model; ADR handoff references matrix behavior | Add a normalized subject allocation module that records term, grade, subject, and weekly hours before teacher allocation and timetable use it for validation. | Yes | Academics |
| Teacher allocation validation/load/carry-over | Partial | `src/modules/academics/teacher-allocation/controller/teacher-allocation.controller.ts` supports list/create/delete only; `prisma/migrations/20260419162438_0003_academic_structure/migration.sql` creates allocation table | Keep current allocation model as source of truth, then add use cases for validation, load analysis, and controlled carry-over between terms/years. Do not put validation logic in controllers. | Maybe, if validation snapshots or carry-over batches are persisted | Academics |
| Curriculum | Absent | No `src/modules/academics/curriculum`; no `Curriculum` model in `prisma/schema.prisma`; ADR handoff describes curriculum product intent | Add a Curriculum submodule under Academics for term, grade, subject, and school-scoped curriculum documents. Keep it separate from Homework and app read models. | Yes | Curriculum |
| Units | Absent | No `CurriculumUnit` model or module; ADR handoff describes units under curriculum | Add curriculum units as ordered children of a curriculum, with stable sort order and tenant-safe relations. | Yes | Curriculum |
| Lessons | Absent | No `CurriculumLesson` model; only `linkedLessonRef` strings appear in reinforcement hero journey areas; ADRs expect lesson concepts | Add lessons as ordered children of curriculum units. Use them as stable anchors for content, plans, homework links, and optional reinforcement integration. | Yes | Curriculum |
| Lesson educational content | Absent | No lesson content module or schema; student subject/detail ADRs describe lesson resources | Add an Educational Content boundary for text, file, video, and external-link content items attached to curriculum lessons. Use presenters for app-specific detail shapes. | Yes | Educational Content |
| Lesson files | Absent | `src/modules/files/attachments/validators/attachment-target.validator.ts` currently allows only existing resource types such as admissions and attendance targets; no lesson target | Reuse Files upload/storage foundations, but add explicit lesson content resource authorization before allowing lesson files. | Yes or maybe via existing `Attachment` plus new allowed resource type | Educational Content |
| Lesson video links | Absent | No video-link model or lesson content schema; ADR handoff describes videos | Model video links as lesson content items with URL metadata and publication state, not as raw app payload fields. | Yes | Educational Content |
| Lesson external links | Absent | No external-link lesson resource model; ADRs describe external resources | Model external links as lesson content items with URL, label, provider metadata, and visibility state. | Yes | Educational Content |
| Lesson plans | Absent | No `src/modules/academics/lesson-plans`; no `LessonPlan` model; timetable exists in `src/modules/academics/timetable/**` | Add lesson plans as a planning domain that links teacher allocation, term, classroom/section, timetable entries, curriculum lessons, and academic calendar. | Yes | Lesson Plans |
| Homework questions | Absent | No `HomeworkQuestion` model; `test/security/tenancy.homework.spec.ts` and closeout E2E tests assert question routes are not registered; student/parent DTOs contain empty question placeholder classes | Add Homework Questions as a Homework subdomain. Keep authoring, validation, ordering, scoring metadata, and safe presentation separate from assignment lifecycle. | Yes | Homework |
| Homework options | Absent | No `HomeworkQuestionOption` model; grade question options exist only under Grades schema, not Homework | Add options under Homework Questions for MCQ and similar types, with correctness hidden by presenters until visibility rules allow it. | Yes | Homework |
| Homework assignment attachments | Absent | No homework attachment model; attachment validator has no homework target; E2E tests assert homework attachment routes are absent | Add a Homework Attachments subdomain using Files foundations and explicit resource authorization for assignment-level materials. | Yes or maybe via existing `Attachment` plus homework-specific metadata | Homework |
| Homework student answers | Partial | `HomeworkSubmission` supports text `bodyText`; no question-specific answer models; `src/modules/student-app/homeworks/presenters/student-homeworks.presenter.ts` returns empty questions | Preserve text submission compatibility, then add question-specific answers linked to submissions and homework questions. | Yes | Homework Submissions |
| Homework submission attachments / proof uploads | Intentionally deferred | Files foundation exists; homework closeout tests assert file and attachment side effects are zero and routes are absent | Add submission attachment upload authorization after answers exist. Treat proof uploads as submission-owned files, not assignment files. | Yes or maybe via existing `Attachment` plus submission-specific metadata | Homework Submissions |
| Parent full result visibility | Partial | `src/modules/parent-app/homeworks/presenters/parent-homeworks.presenter.ts` exposes submission summary but empty questions/attachments; parent E2E covers read-only visibility | Extend parent read models after question, answer, attachment, and correctness visibility rules are implemented. Keep parent payloads sanitized. | No if underlying models already exist | Homework / Parent App |
| Parent submit decision | Intentionally deferred | `src/modules/parent-app/homeworks/controller/parent-homeworks.controller.ts` has GET routes only; tests assert parent submit routes are absent | Make an explicit product/security decision before implementation. Default should remain read-only parent visibility until approved. | Maybe | Homework / Parent App |
| Grade sync | Intentionally deferred | `HomeworkAssignment.gradeAssessmentId` exists in `prisma/schema.prisma`; `src/modules/grades/**` has grade sync foundations; homework E2E asserts grade side effects are zero | Implement as an explicit cross-domain adapter after Homework answers and teacher review are stable. Decide manual vs automatic sync first. | Maybe, depending on sync audit and mapping needs | Cross-domain integration |
| Notifications | Intentionally deferred | `src/modules/communication/**` exists; notification source/type enums do not include homework events; homework E2E asserts communication side effects are zero | Add event-driven notification integration after assignment publish, due reminders, submission review, and parent visibility rules are decided. | Maybe, for templates/event types | Cross-domain integration |
| XP/rewards | Intentionally deferred | `src/modules/reinforcement/**` exists; XP source types lack homework/lesson completion; teacher XP ADR expects homework/lesson sources; homework E2E asserts XP/reward side effects are zero | Add XP/reward integration as a separate policy sprint after grade/review semantics are stable. Enforce idempotency and policy ownership in Reinforcement. | Maybe, for source enum or policy mapping | Cross-domain integration |

## 5. Proposed backend domain boundaries

### Academics Core

Academics Core should remain the source of truth for academic structure, years, terms, stages, grades, sections, classrooms, subjects, rooms, teacher allocations, timetable, and future academic calendar. It owns school-scoped academic configuration and scheduling primitives.

It should not own lesson content bodies, homework answers, student submission state, XP policy, or app-specific response shapes.

### Curriculum

Curriculum should be a distinct Academics subdomain. It should own the planned instructional spine: curriculum, units, and lessons for a school, academic year, term, grade, and subject.

Curriculum should not be mixed directly into Homework Core because curriculum describes what should be taught, while homework describes assigned work, target students, submission state, and review lifecycle. Homework may link to curriculum lessons, but curriculum must remain reusable by lesson plans, student subject views, teacher schedule views, educational content, and optional reinforcement features.

### Educational Content

Educational Content should own lesson resources attached to curriculum lessons, including text content, files, video links, and external links. It should use Files foundations for object storage and attachment authorization, but the learning-specific resource rules should live in the educational content boundary.

This keeps lesson resources reusable by student subjects, teacher lesson flows, lesson plans, and future parent visibility without tying them to homework assignment lifecycle.

### Lesson Plans

Lesson Plans should own planned teaching execution. A lesson plan links teacher allocation, term, timetable/classroom context, calendar constraints, and curriculum lessons. It should answer questions such as what lesson is planned for a given week, class, teacher, and subject.

Lesson Plans should not become a homework authoring module. They can link to homework assignments later, but should remain the planning layer between curriculum and classroom execution.

### Homework

Homework should continue to own assignment lifecycle, target resolution, due dates, publication, cancellation, closing, and assignment-level policies. It can optionally link an assignment to a curriculum lesson or grade assessment, but those links should be explicit integrations.

Homework should not become the owner of curriculum units, lessons, lesson resources, gradebook policy, notification templates, or XP reward policy.

### Homework Submissions

Homework Submissions should own student submission state, question-specific answers, submission attachments, teacher review data, and late/reviewed status. It should preserve the existing text submission foundation while extending it for structured answers.

Homework questions and answers should be a Homework subdomain unless the product intentionally decides that all question-based homework is a Grades assessment. The safer default is Homework-owned questions with an optional Grades bridge, because not all homework is graded and not all graded assessments should behave like homework.

### Grades integration

Grades should remain the source of truth for gradebook items, grade assessments, grade submissions, and grade aggregation. Homework should only sync to Grades through explicit use cases or integration adapters after the sync policy is approved.

### Communication and notification integration

Communication should own notification delivery, templates, recipient resolution, and notification audit. Homework and Curriculum should emit explicit events or call integration use cases; they should not directly own notification storage details.

### Reinforcement and XP integration

Reinforcement should own XP policies, rewards, hero journey behavior, and idempotent XP ledger entries. Homework and lesson completion should integrate through explicit, policy-controlled events after business rules are approved.

## 6. Proposed future module structure

The following structure is proposed only. It should not be created in Sprint 15A.

Recommended future Academics modules:

- `src/modules/academics/overview`
- `src/modules/academics/calendar`
- `src/modules/academics/subject-allocation`
- `src/modules/academics/curriculum`
- `src/modules/academics/lesson-content`
- `src/modules/academics/lesson-plans`

Recommended future Homework modules:

- `src/modules/homework/questions`
- `src/modules/homework/attachments`
- `src/modules/homework/answers`

Possible supporting app-facing modules or adapters:

- `src/modules/student-app/subjects`
- `src/modules/student-app/lesson-content`
- `src/modules/parent-app/learning`
- `src/modules/teacher-app/lesson-plans`

Implementation guidance:

- Keep core modules as source-of-truth modules.
- Keep app-facing modules as composition/read-model layers.
- Add repositories inside domain modules for Prisma access.
- Add presenters/adapters for app-specific payloads.
- Do not expose database-normalized shapes directly to mobile or dashboard clients.
- Do not leak tenant identifiers in app-facing payloads unless the existing admin contract explicitly requires them.

## 7. Proposed future data model plan

This section is proposed design only. It is not implemented schema, and no Prisma schema or migration changes were made in Sprint 15A.

### Curriculum

Proposed purpose:

- Source-of-truth curriculum document for one school, academic year, term, grade, and subject.

Likely fields:

- `id`
- `schoolId`
- `academicYearId`
- `termId`
- `gradeId`
- `subjectId`
- `title`
- `description`
- `status`
- `createdByUserId`
- `updatedByUserId`
- `createdAt`
- `updatedAt`
- `deletedAt`

Likely constraints and indexes:

- Unique active curriculum per `schoolId`, `termId`, `gradeId`, and `subjectId`.
- Indexes on `schoolId`, `academicYearId`, `termId`, `gradeId`, `subjectId`, `status`, and `deletedAt`.
- Tenant-safe foreign keys should include `schoolId` where supported by existing conventions.

### CurriculumUnit

Proposed purpose:

- Ordered unit inside a curriculum.

Likely fields:

- `id`
- `schoolId`
- `curriculumId`
- `title`
- `description`
- `sortOrder`
- `status`
- `createdAt`
- `updatedAt`
- `deletedAt`

Likely constraints and indexes:

- Unique active `sortOrder` within `schoolId` and `curriculumId`.
- Indexes on `schoolId`, `curriculumId`, `status`, and `deletedAt`.

### CurriculumLesson

Proposed purpose:

- Ordered lesson inside a curriculum unit.

Likely fields:

- `id`
- `schoolId`
- `curriculumId`
- `unitId`
- `title`
- `description`
- `objectives`
- `estimatedMinutes`
- `sortOrder`
- `status`
- `createdAt`
- `updatedAt`
- `deletedAt`

Likely constraints and indexes:

- Unique active `sortOrder` within `schoolId` and `unitId`.
- Indexes on `schoolId`, `curriculumId`, `unitId`, `status`, and `deletedAt`.
- Optional future index for lesson lookup by subject/grade should go through Curriculum rather than duplicating denormalized fields unless query performance requires it.

### LessonContentItem

Proposed purpose:

- Published or draft educational resource attached to a curriculum lesson.

Likely fields:

- `id`
- `schoolId`
- `lessonId`
- `type`
- `title`
- `bodyText`
- `fileId`
- `url`
- `provider`
- `metadata`
- `sortOrder`
- `status`
- `publishedAt`
- `createdByUserId`
- `updatedByUserId`
- `createdAt`
- `updatedAt`
- `deletedAt`

Likely constraints and indexes:

- Indexes on `schoolId`, `lessonId`, `type`, `status`, `publishedAt`, and `deletedAt`.
- If file-backed, use a tenant-safe relation to the existing `File` model.
- For external links and videos, validate URLs at the DTO/use-case layer and store only normalized metadata needed by backend behavior.

### LessonPlan

Proposed purpose:

- Teacher-facing or school-admin-facing plan for executing curriculum lessons over time.

Likely fields:

- `id`
- `schoolId`
- `academicYearId`
- `termId`
- `teacherSubjectAllocationId`
- `gradeId`
- `sectionId`
- `classroomId`
- `subjectId`
- `weekStartDate`
- `weekEndDate`
- `status`
- `createdByUserId`
- `updatedByUserId`
- `createdAt`
- `updatedAt`
- `deletedAt`

Likely constraints and indexes:

- Indexes on `schoolId`, `termId`, `teacherSubjectAllocationId`, `sectionId`, `classroomId`, `subjectId`, `weekStartDate`, and `status`.
- A uniqueness rule may be needed for active plans per teacher allocation and week, but should account for classroom-specific plans.

### LessonPlanItem

Proposed purpose:

- One planned lesson execution item within a lesson plan.

Likely fields:

- `id`
- `schoolId`
- `lessonPlanId`
- `curriculumLessonId`
- `timetableEntryId`
- `plannedDate`
- `periodNumber`
- `notes`
- `status`
- `sortOrder`
- `createdAt`
- `updatedAt`
- `deletedAt`

Likely constraints and indexes:

- Indexes on `schoolId`, `lessonPlanId`, `curriculumLessonId`, `timetableEntryId`, `plannedDate`, and `status`.
- Use nullable links carefully so unscheduled draft items can exist without pretending to be timetable-backed.

### HomeworkQuestion

Proposed purpose:

- Ordered question authored for a homework assignment.

Likely fields:

- `id`
- `schoolId`
- `homeworkAssignmentId`
- `type`
- `prompt`
- `instructions`
- `points`
- `required`
- `answerKey`
- `rubric`
- `sortOrder`
- `createdAt`
- `updatedAt`
- `deletedAt`

Likely constraints and indexes:

- Indexes on `schoolId`, `homeworkAssignmentId`, `type`, `sortOrder`, and `deletedAt`.
- Correct-answer fields must be protected by presenters and visibility rules.

### HomeworkQuestionOption

Proposed purpose:

- Option choices for MCQ, true/false, matching, ordering, and similar question types.

Likely fields:

- `id`
- `schoolId`
- `homeworkQuestionId`
- `label`
- `value`
- `isCorrect`
- `sortOrder`
- `createdAt`
- `updatedAt`
- `deletedAt`

Likely constraints and indexes:

- Indexes on `schoolId`, `homeworkQuestionId`, `sortOrder`, and `deletedAt`.
- `isCorrect` must not be returned to students or parents before approved visibility conditions.

### HomeworkAssignmentAttachment

Proposed purpose:

- Assignment-level material attached by a teacher or school admin.

Likely fields:

- `id`
- `schoolId`
- `homeworkAssignmentId`
- `fileId`
- `title`
- `description`
- `sortOrder`
- `createdByUserId`
- `createdAt`
- `deletedAt`

Likely constraints and indexes:

- Indexes on `schoolId`, `homeworkAssignmentId`, `fileId`, and `deletedAt`.
- This can be a dedicated model or an explicit resource type in the existing generic `Attachment` model if authorization and audit needs remain clear.

### HomeworkSubmissionAnswer

Proposed purpose:

- Student answer to a specific homework question within a submission.

Likely fields:

- `id`
- `schoolId`
- `homeworkSubmissionId`
- `homeworkQuestionId`
- `answerText`
- `answerJson`
- `selectedOptionId`
- `awardedPoints`
- `reviewNote`
- `reviewedByUserId`
- `reviewedAt`
- `createdAt`
- `updatedAt`

Likely constraints and indexes:

- Unique answer per `schoolId`, `homeworkSubmissionId`, and `homeworkQuestionId` unless multi-answer question types require a child option table.
- Indexes on `schoolId`, `homeworkSubmissionId`, `homeworkQuestionId`, and `reviewedAt`.
- Consider a `HomeworkSubmissionAnswerOption` child model if selected options need multi-select, ordering, matching, or immutable option snapshots.

### HomeworkSubmissionAttachment

Proposed purpose:

- Student-uploaded proof or file answer attached to a homework submission or a specific submission answer.

Likely fields:

- `id`
- `schoolId`
- `homeworkSubmissionId`
- `homeworkSubmissionAnswerId`
- `fileId`
- `title`
- `description`
- `createdByUserId`
- `createdAt`
- `deletedAt`

Likely constraints and indexes:

- Indexes on `schoolId`, `homeworkSubmissionId`, `homeworkSubmissionAnswerId`, `fileId`, and `deletedAt`.
- Upload authorization must verify that the student owns the homework target and submission.

### Tenant-safe relation strategy

Future models should follow the existing school-scoped pattern:

- Include `schoolId` on school-owned records.
- Use request scope and repository-level Prisma access through scoped clients.
- Prefer composite foreign keys that include `schoolId` when linking school-owned records.
- Prefer composite unique constraints such as `(id, schoolId)` on target tables when they are needed for tenant-safe relations.
- Validate that academic year, term, grade, subject, teacher allocation, timetable entry, curriculum, homework assignment, file, and submission all belong to the same school before writing links.

### Soft delete expectations

Curriculum, units, lessons, lesson content, lesson plans, homework questions, options, and attachments should generally support soft delete through `deletedAt` because they may be referenced by plans, submissions, audits, or app history.

Submitted answers and reviewed submissions should be treated as audit-sensitive records. If deletion is ever supported, it should be policy-driven and audited. In many cases, answer correction or resubmission should create/update controlled state rather than erase historical review evidence.

### Audit implications

Audit logging should be added for sensitive actions:

- Curriculum publish/unpublish and major edits.
- Lesson content publish/unpublish and file attachment changes.
- Lesson plan generation, publication, and changes after publication.
- Homework question edits after publication.
- Assignment attachment changes after publication.
- Student submission and resubmission.
- Submission attachment upload/delete.
- Teacher answer review and mark changes.
- Grade sync, notification dispatch, and XP/reward grants.

## 8. Execution roadmap

### Sprint 15B - Curriculum foundation

Goal:

- Implement the backend source of truth for curriculum, units, and lessons.
- Support school-admin curriculum management scoped by school, academic year, term, grade, and subject.

Expected files/modules touched:

- `src/modules/academics/curriculum/**`
- `src/modules/academics/academics.module.ts`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- New DTOs, repository, use cases, presenters, and module-local tests.

Schema/migration expected:

- Yes. Add `Curriculum`, `CurriculumUnit`, and `CurriculumLesson`.

Key tests to add:

- Unit tests for curriculum create/update/reorder rules.
- Repository/use-case tests for term, grade, and subject validation.
- E2E tests for admin CRUD and safe response shapes.
- Security tests for cross-school isolation and same-school unauthorized access.

Security/tenant risks:

- Linking curriculum to a term, grade, or subject from another school.
- Returning school or organization identifiers in app-facing read models.
- Allowing deleted or inactive structure records to receive new curriculum.

Non-goals:

- Lesson files, videos, external links, lesson plans, homework questions, grade sync, notifications, and XP.

### Sprint 15C - Educational lesson content/resources

Goal:

- Add lesson educational content and resource management for curriculum lessons.
- Support text resources, file-backed resources, video links, and external links.

Expected files/modules touched:

- `src/modules/academics/lesson-content/**`
- `src/modules/files/uploads/**`
- `src/modules/files/attachments/**`
- `src/modules/files/attachments/validators/attachment-target.validator.ts`
- `prisma/schema.prisma`
- `prisma/migrations/**`

Schema/migration expected:

- Yes. Add `LessonContentItem` or equivalent, and any required relation to existing file records.

Key tests to add:

- Unit tests for content type validation.
- Presenter tests for student-safe and teacher/admin-safe visibility.
- Upload authorization tests for lesson file uploads.
- E2E tests for content CRUD, publish/unpublish, and resource reads.
- Cross-school file and lesson isolation tests.

Security/tenant risks:

- Attaching files from another school.
- Exposing draft/unpublished lesson content to students or parents.
- Returning raw storage keys instead of authorized file URLs.

Non-goals:

- Lesson plan generation, homework question authoring, student answers, grade sync, notifications, and XP.

### Sprint 15D - Lesson plans

Goal:

- Implement lesson planning as a planning layer over curriculum, teacher allocation, timetable, and academic calendar constraints.

Expected files/modules touched:

- `src/modules/academics/lesson-plans/**`
- `src/modules/academics/calendar/**` if calendar is not delivered earlier.
- `src/modules/academics/timetable/**` for read-only integration.
- `src/modules/academics/teacher-allocation/**` for validation integration.
- `prisma/schema.prisma`
- `prisma/migrations/**`

Schema/migration expected:

- Yes. Add `LessonPlan` and `LessonPlanItem`.
- If not already implemented, add academic calendar event storage needed for holiday-aware planning.

Key tests to add:

- Unit tests for week generation and ordering.
- Repository/use-case tests for allocation, timetable, and curriculum link validation.
- E2E tests for plan create/update/publish/read flows.
- Security tests for cross-school timetable and lesson references.

Security/tenant risks:

- Linking a plan item to a curriculum lesson, timetable entry, or teacher allocation from another school.
- Allowing teachers to edit plans they do not own.
- Publishing plans against inactive terms or invalid calendar ranges.

Non-goals:

- Homework question authoring, submission answers, grade sync, notifications, and XP.

### Sprint 15E - Homework questions and assignment attachments

Goal:

- Add structured homework question authoring and assignment-level attachments while preserving existing assignment lifecycle behavior.

Expected files/modules touched:

- `src/modules/homework/questions/**`
- `src/modules/homework/attachments/**`
- `src/modules/homework/homework.module.ts`
- `src/modules/teacher-app/homeworks/**`
- `src/modules/files/attachments/**`
- `prisma/schema.prisma`
- `prisma/migrations/**`

Schema/migration expected:

- Yes. Add `HomeworkQuestion`, `HomeworkQuestionOption`, and `HomeworkAssignmentAttachment` or equivalent attachment mapping.

Key tests to add:

- Unit tests for question type validation, ordering, required flags, and points.
- Presenter tests to ensure correct answers are hidden from student/parent payloads until allowed.
- Upload authorization tests for assignment attachments.
- E2E tests for teacher authoring, publishing, and read shapes.

Security/tenant risks:

- Editing questions after publication without clear policy.
- Exposing answer keys before review.
- Attaching files not owned by the school or actor.

Non-goals:

- Student question answers, proof uploads, parent submit, grade sync, notifications, and XP.

### Sprint 15F - Student answers and submission attachments

Goal:

- Extend Homework Submissions from text-only submissions to structured question answers and submission/proof attachments.

Expected files/modules touched:

- `src/modules/homework/answers/**`
- `src/modules/homework/attachments/**`
- `src/modules/homework/application/homework-submissions.use-cases.ts`
- `src/modules/student-app/homeworks/**`
- `src/modules/files/uploads/**`
- `src/modules/files/attachments/**`
- `prisma/schema.prisma`
- `prisma/migrations/**`

Schema/migration expected:

- Yes. Add `HomeworkSubmissionAnswer`, `HomeworkSubmissionAttachment`, and optional answer-option join models if needed.

Key tests to add:

- Unit tests for answer validation by question type.
- Repository/use-case tests for submission ownership and answer persistence.
- E2E tests for save draft, submit, resubmit policy, and proof upload.
- Upload authorization tests.
- Cross-school isolation and same-school unowned access tests.

Security/tenant risks:

- A student uploading files to another student's submission.
- A student answering a homework target they do not own.
- Accepting answers for questions outside the assignment.
- Allowing updates after close/review without policy.

Non-goals:

- Parent submit, grade sync, notifications, and XP.

### Sprint 15G - Teacher review completion

Goal:

- Complete teacher review for structured homework answers, including answer-level feedback and marks.

Expected files/modules touched:

- `src/modules/homework/application/homework-submissions.use-cases.ts`
- `src/modules/homework/answers/**`
- `src/modules/teacher-app/homeworks/**`
- `src/modules/homework/dto/**`
- `prisma/schema.prisma` if answer-level review fields were not already added.

Schema/migration expected:

- Maybe. If Sprint 15F does not add answer-level review fields, this sprint should add them.

Key tests to add:

- Unit tests for mark totals, awarded points, and review state transitions.
- Presenter tests for teacher, student, and parent visibility differences.
- E2E tests for review, re-review policy, and closed assignment behavior.
- Audit tests for sensitive mark changes.

Security/tenant risks:

- Teacher reviewing a submission outside their allocation.
- Awarded marks exceeding question or assignment limits.
- Review changes not being audited.

Non-goals:

- Automatic grade sync, notifications, XP, and parent submit.

### Sprint 15H - Student/Parent full visibility

Goal:

- Expose full student and parent homework result visibility through app-facing read models after questions, answers, attachments, and review semantics are stable.

Expected files/modules touched:

- `src/modules/student-app/homeworks/**`
- `src/modules/parent-app/homeworks/**`
- `src/modules/homework/presenters/**` if shared presenters are introduced.
- `src/modules/files/**` for authorized file URL presentation.

Schema/migration expected:

- Usually no, assuming required models are delivered in earlier sprints.

Key tests to add:

- Presenter tests for student and parent detail payloads.
- E2E tests for reviewed and unreviewed visibility.
- Tests that correct answers are hidden or shown according to policy.
- Parent ownership tests for child access.
- Tests that no `schoolId` or `organizationId` leaks in app-facing payloads.

Security/tenant risks:

- Parent accessing another child in the same school.
- Student accessing a classmate's submission.
- Correct answers visible before the approved point in the workflow.
- Raw file storage details leaking through app payloads.

Non-goals:

- Parent submit unless explicitly approved.
- Grade sync, notifications, and XP.

### Sprint 15I - Optional grade/notification/XP integrations

Goal:

- Add optional cross-domain integrations after the core learning flow is stable and policy decisions are made.

Expected files/modules touched:

- `src/modules/homework/**`
- `src/modules/grades/**`
- `src/modules/communication/**`
- `src/modules/reinforcement/**`
- Queue/event modules if asynchronous dispatch is used.
- `prisma/schema.prisma`
- `prisma/migrations/**` if enums, templates, mapping tables, or audit tables are required.

Schema/migration expected:

- Maybe. Expected if new notification types, XP source types, grade sync audit records, or mapping tables are needed.

Key tests to add:

- Unit tests for integration policy decisions.
- E2E tests for manual or automatic grade sync.
- Notification recipient tests for teacher, student, and parent events.
- XP idempotency tests.
- Tests proving disabled integrations create no side effects.

Security/tenant risks:

- Duplicate grade sync or duplicate XP grants.
- Sending notifications to the wrong parent, student, or school.
- Cross-school grade item or XP policy linkage.
- Background jobs running without tenant context.

Non-goals:

- Reshaping core Homework APIs.
- Adding advanced analytics builder, wallet, marketplace, or finance behavior.

### Sprint 15J - Final closeout, tests, docs, and project structure update

Goal:

- Close the Academics/Curriculum/Homework learning flow with route inventory, tests, docs, and project structure updates.

Expected files/modules touched:

- Module-local docs for new Academics and Homework subdomains.
- `MODULES.md`
- Project structure documentation.
- E2E and security test inventories.
- Any final presenter or adapter polish needed for shipped contracts.

Schema/migration expected:

- No, unless closeout reveals a small missing index or audit field. Prefer no schema changes in the final closeout sprint.

Key tests to add:

- Full E2E happy paths for curriculum to lesson content to homework to submission to review.
- Route registration and deferred-route inventory tests.
- Security and tenancy regression tests.
- App-facing payload sanitization tests.
- Upload authorization regression tests.

Security/tenant risks:

- Documentation drifting from implemented behavior.
- Route inventory missing deferred or intentionally absent routes.
- Newly added app payloads accidentally leaking tenant identifiers.

Non-goals:

- New product scope beyond closing the approved learning flow.
- Advanced analytics builder, finance, HR, wallet, marketplace, or advanced smart pickup.

## 9. Testing strategy

Future implementation should add tests in layers, matching the risk of each domain.

Unit tests:

- Curriculum ordering, status transitions, and validation rules.
- Lesson content type validation and publication rules.
- Lesson plan week/item generation.
- Homework question type validation, option validation, scoring limits, and required-question behavior.
- Submission answer validation by question type.
- Teacher review mark and state transition rules.

Presenter tests:

- Student homework detail payloads with questions, answers, attachments, review feedback, and correct-answer visibility rules.
- Parent homework detail payloads with read-only visibility and ownership restrictions.
- Teacher homework review payloads with answer-level detail.
- Admin curriculum and lesson content payloads.
- Explicit checks that app-facing payloads do not leak `schoolId` or `organizationId`.

Repository/use-case tests:

- Tenant-safe creation and lookup for curriculum, units, lessons, lesson content, lesson plans, homework questions, answers, and attachments.
- Validation that linked academic records belong to the same school.
- Validation that file records belong to the same school before attachment.
- Homework submission ownership and target resolution behavior.
- Idempotent integration behavior for grade sync, notifications, and XP if implemented.

E2E tests:

- School admin curriculum creation, unit/lesson ordering, and publication.
- Lesson content file/link/video management.
- Lesson plan creation from curriculum and timetable context.
- Teacher homework question authoring and assignment attachment management.
- Student draft, submit, structured answer, and proof upload flows.
- Teacher answer-level review.
- Student and parent full result visibility after review.

Security and tenancy tests:

- Cross-school isolation for every new route.
- Same-school unowned access checks, especially for teachers, students, and parents.
- School admin role restrictions for setup and management routes.
- Teacher ownership restrictions through allocation and classroom context.
- Student access restricted to owned homework targets.
- Parent access restricted to owned children.

Upload authorization tests:

- Teacher can attach assignment files only for owned or permitted assignments.
- Student can upload submission attachments only for owned submissions.
- Lesson content files can only be attached by authorized admin/teacher roles.
- File downloads use authorized access and do not expose raw storage keys.

Role restriction tests:

- School admin can manage curriculum and academic setup within scope.
- Teacher can manage only permitted homework, lesson plans, or lesson content according to approved policy.
- Student can read and submit only assigned homework.
- Parent can read only owned child homework, and cannot submit unless parent submit is explicitly approved.

## 10. Risks and decisions needed

The following decisions should be made before runtime implementation begins:

- Should parent submit be supported?
  - Current backend is read-only for parent homework visibility, and tests assert parent submit is absent. Supporting parent submit would add ownership, audit, and actor attribution complexity.
- Should homework questions be Homework-owned or Grades-backed?
  - The safer default is Homework-owned questions with optional Grades sync. Grades-backed questions may be useful for graded assessments, but not every homework assignment is a gradebook assessment.
- Should lesson assignments and homework assignments be unified or linked?
  - The safer default is linking. Curriculum and lesson plans should not depend on Homework Core lifecycle, and Homework should not become a curriculum content owner.
- Should educational content be published/unpublished?
  - A publication state is recommended so draft resources do not leak to students or parents.
- Should correct answers be visible to parents/students before review?
  - Default should be no. Correct answers should become visible only after submission, review, close, or an explicitly approved policy condition.
- Should grade sync happen automatically or manually?
  - Manual sync is safer for the first integration because it reduces accidental gradebook side effects. Automatic sync can follow after idempotency and audit behavior are proven.
- Should notifications and XP be in the same sprint or separate integration sprints?
  - They should be separate from the core Homework/Curriculum implementation unless product explicitly approves a combined integration sprint. Notification and XP side effects create recipient, idempotency, and policy risks.

## 11. Final recommendation

The first implementation sprint after this audit should be Sprint 15B: Curriculum foundation.

Curriculum is the missing source-of-truth spine for the rest of the learning flow. Educational content, lesson plans, student subject views, teacher schedule enrichment, homework lesson linkage, and optional XP lesson completion all need stable curriculum/unit/lesson records before they can be implemented cleanly.

Starting with Curriculum also keeps scope disciplined. It avoids prematurely reshaping Homework Core, avoids grade/notification/XP side effects before policy decisions are made, and gives future sprints a normalized backend foundation that can support app-specific presenters without copying frontend ADR contracts into runtime APIs.
