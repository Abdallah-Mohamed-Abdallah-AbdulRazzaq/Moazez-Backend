# Sprint 13A Homework Core Contract Audit

Status: planning audit only  
Date: 2026-05-24

Sprint 13A is a documentation-only contract audit for the future Homework Core. It does not introduce runtime code, routes, controllers, DTOs, presenters, use-cases, repositories, Prisma schema changes, migrations, seeds, tests, package scripts, README edits, ADR edits, Swagger changes, or project structure edits.

## 1. Sources Reviewed

Governance and architecture sources reviewed:

- `AGENT_CONTEXT_PRIMER.md`
- `CLAUDE.md`
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
- `ERROR_CATALOG.md`
- `TESTING_STRATEGY.md`
- `README.md`
- `docs/sprint-7a-teacher-app-contract-audit.md`
- `docs/sprint-8a-student-app-contract-audit.md`
- `docs/sprint-9a-parent-app-contract-audit.md`
- `docs/sprint-12a-schedule-timetable-core-contract-audit.md`

Homework handoff sources reviewed:

- `adr/Teacher-App/teacher_HOMEWORKS_BACKEND_MODELS.md`
- `adr/Student-App/student_HOMEWORKS_BACKEND_MODEL.md`
- `adr/Parent-App/parent_homeworks.md`

Adjacent schedule and app handoff sources reviewed:

- `adr/Teacher-App/teacher_SCHEDULE_BACKEND_MODELS.md`
- `adr/Student-App/student_SCHEDULE_BACKEND_MODEL.md`
- `adr/Parent-App/parent_schedule.md`
- `test/e2e/schedule-timetable-final-closeout.e2e-spec.ts`

Implementation areas reviewed:

- `prisma/schema.prisma`
- `src/modules/academics/**`
- `src/modules/academics/timetable/**`
- `src/modules/teacher-app/**`
- `src/modules/student-app/**`
- `src/modules/parent-app/**`
- `src/modules/grades/**`
- `src/modules/files/**`
- `src/modules/communication/**`
- `src/modules/settings/**`
- `src/modules/iam/**`
- `src/infrastructure/database/school-scope.extension.ts`
- Relevant security and E2E suites for teacher, student, parent, grades, files, and timetable closeout.

Repository note: `DIRECTORY_STRUCTURE.md` is not present in the current checkout. Existing audits and the current source tree were used for structure context.

## 2. Current Backend State After Schedule/Timetable Closeout

### 2.1 Schedule/Timetable Is Now Ready As A Dependency

Sprint 12 closed the missing timetable foundation. The backend now has an Academics-owned timetable core with:

- Timetable config.
- Periods.
- Entries.
- Preview readiness.
- Conflicts.
- Publication workflow.
- Post-publish locking.
- Teacher schedule reads.
- Student schedule reads.
- Parent child schedule reads.

Important rules already established by Sprint 12:

- Academics Timetable Core owns timetable state.
- Teacher, Student, and Parent schedules are read-only app composition layers.
- App schedule `scheduleId` is a computed V1 read identity: `timetable-entry:<entryId>:<YYYY-MM-DD>`.
- There is still no persisted `ScheduleOccurrence` model.
- Attendance remains its own source of truth.

This means Homework can safely link to a timetable entry/date pair in V1 if product wants lesson-context homework, but Homework must not require a persisted ScheduleOccurrence yet.

### 2.2 Grades Can Support Assignment-Like Work, But Not Full Homework

Grades Core currently supports:

- Assessments.
- Assessment types including `ASSIGNMENT`.
- Question-based assessments.
- Questions.
- Submissions.
- Answers.
- Review.
- Grade item sync.
- Gradebook and analytics projection.

Teacher App already has classroom assignment read and review composition over Grades. This is useful but does not equal full Homework Core.

Current gaps if Homework is represented only by `GradeAssessmentType.ASSIGNMENT`:

- No homework-specific aggregate.
- No homework-specific publish/due/close lifecycle.
- No homework target materialization model.
- No class-vs-selected-students target semantics for homework.
- No homework dashboard summary model.
- No parent/student homework-specific status semantics.
- No ungraded homework model.
- No homework attachment/proof policy.
- No clean way to represent worksheet/writing-task/file-upload homework independently from graded assessments.
- No safe app contract for parent submission; parent submit is present in the ADR but should not be implemented without an explicit product decision.

Grades should remain the gradebook/assessment source of truth. Homework should optionally bridge to Grades when a homework is graded, but Homework should own assignment/due/target/submission status for app workflows.

### 2.3 Files Core Is Ready As A Dependency

Files are stored outside PostgreSQL and only metadata is stored in the database. Homework attachments and student submission files must reuse Files Core patterns and must not expose raw bucket names, object keys, or direct storage URLs in app responses.

Recommended use:

- Teacher attaches resources to HomeworkAssignment through file metadata/attachment links.
- Student attaches proof/files to HomeworkSubmission through authorized backend file links.
- Parent reads child homework attachments only through child ownership and resource authorization.

### 2.4 Communication/Email/Notifications Are Adjacent, Not Core For 13B

Sprint 11 added school email configuration, templates, delivery, and campaigns. Communication announcements and notifications exist in core areas, but app Notification Center remains deferred.

Homework should expose domain events later, but Sprint 13B should not implement notification center behavior. Avoid sending homework notifications until a clear event and recipient policy is approved.

### 2.5 Teacher/Student/Parent App Foundations Are Ready

Teacher App:

- Uses `TeacherSubjectAllocation.id` as `classId`.
- Enforces teacher ownership through Teacher App access services.
- Schedule reads already return published timetable entries only.
- Classroom assignment reads currently compose Grades data.

Student App:

- Resolves the authenticated student through `Student.userId` and active enrollment.
- Can read own schedule for active enrollment classroom.
- Must never expose other students, guardian private data, or tenant IDs.

Parent App:

- Resolves ownership through Guardian -> StudentGuardian -> active enrollment.
- Current-school only; no cross-school parent aggregation.
- Can read owned child schedule.
- Same-school unlinked and cross-school children must return safe 404.

## 3. Contract Summary From ADRs

### 3.1 Teacher Homework ADR

Teacher Homework ADR expects:

- Homework dashboard.
- Class cards with cycle/grade/section/subject/room/student count.
- Weekly days and next session label.
- Focus item with `scheduleId`, lesson title, start time, and end time.
- Assignment summaries with:
  - title.
  - status: `draft | active | closed | waiting_review`.
  - mode: `homework | quiz | worksheet | writing_task`.
  - target label.
  - due time.
  - total marks.
  - estimated minutes.
  - publish-now behavior.
  - total/submitted/reviewed/missing/pending-review counts.
- Preferred endpoints:
  - `GET /teacher/homeworks/dashboard`
  - `GET /teacher/homeworks/classes/{classId}/assignments`

The ADR notes that this tab needs aggregated dashboard data more than full question/answer correction details; full correction and delivery details are related to classroom flows.

### 3.2 Student Homework ADR

Student Homework ADR expects:

- Homework list with:
  - subject name.
  - homework name.
  - grade text.
  - status: `completed | waiting | not_completed`.
  - question count.
  - students count.
  - student avatars.
  - due time.
- Homework details with:
  - subject name.
  - homework name.
  - grade text.
  - due time.
  - questions.
- Question types include:
  - `mcq`.
  - `true_false`.
  - `matching`.
  - `ordering`.
  - `fill_blanks`.
  - `essay`.
  - `file_upload`.

### 3.3 Parent Homework ADR

Parent Homework ADR expects:

- Child homework list.
- Homework detail.
- Parent submit endpoint in the handoff:
  - `POST /homeworks/{homework_id}/submit`

This parent submit behavior is a product-sensitive item. In V1 it should not be implemented unless product explicitly confirms that parents can submit homework on behalf of students. The safer default is Parent read-only homework visibility.

## 4. Gap Analysis

### 4.1 What Is Now Ready

The following dependencies are ready:

- School/organization scoping.
- Teacher, Student, and Parent app ownership foundations.
- Academics hierarchy: academic year, term, stage, grade, section, classroom, subject, room.
- TeacherSubjectAllocation for teacher/classroom/subject/term ownership.
- Schedule/Timetable for period/day/date context.
- Files Core for attachment metadata and controlled access.
- Grades Core for optional graded homework bridge.
- Email/Communication infrastructure for future notification/delivery work.

### 4.2 What Is Missing

The backend still lacks a first-class Homework Core:

- No `src/modules/homework` or equivalent core module.
- No Prisma `HomeworkAssignment` model.
- No Homework target/materialized assignment model.
- No Homework submission model.
- No Homework answer/content/proof model.
- No Homework attachment link model.
- No Homework status lifecycle.
- No Homework review lifecycle.
- No Homework-specific app read model.
- No Homework-specific route guardrails beyond absent-route checks.

### 4.3 What Must Not Be Done

Do not:

- Implement Homework inside Teacher App only.
- Implement Homework inside Student App only.
- Implement Homework inside Parent App only.
- Treat every `GradeAssessmentType.ASSIGNMENT` as Homework without a product-approved bridge.
- Backdoor Homework through Reinforcement Tasks.
- Backdoor Homework through Timetable entries.
- Use schedule reads to create homework automatically.
- Use Attendance sessions as homework schedule identity.
- Expose raw file storage data.
- Expose `schoolId` or `organizationId` in app-facing responses.
- Implement Parent homework submission without an explicit policy decision.
- Implement Notification Center as part of Homework Core foundation.

## 5. Recommended Domain Boundary

### 5.1 Recommended Module

Create a new core module:

```text
src/modules/homework/
```

Rationale:

- Homework is not only Grades: some homework can be ungraded.
- Homework is not only Academics: it has submissions, attachments, review, and app-facing state.
- Homework is not only Timetable: schedule provides context, not assignment workflow.
- Homework is not Reinforcement Tasks: tasks are gamified/reinforcement workflows, while homework is academic work.
- Teacher/Student/Parent apps must compose Homework Core, not own it.

Recommended substructure:

```text
src/modules/homework/
  assignments/
  targets/
  submissions/
  attachments/
  read-models/
  homework.module.ts
```

A flatter first sprint is also acceptable if it matches project conventions:

```text
src/modules/homework/application
src/modules/homework/controller
src/modules/homework/domain
src/modules/homework/dto
src/modules/homework/infrastructure
src/modules/homework/presenters
src/modules/homework/tests
```

### 5.2 Source Of Truth Rules

- Homework Core owns assignment, target, due, submission, and review state.
- Academics owns timetable, classroom, subject, teacher allocation, and room state.
- Grades owns gradebook and graded assessment state.
- Files owns file metadata and secure download behavior.
- Teacher/Student/Parent apps own only app-specific composition/presentation.

## 6. Recommended V1 Domain Model

### 6.1 HomeworkAssignment

Purpose:

- The core aggregate for a homework/work assignment.
- Created by a teacher or dashboard actor for a classroom/subject/term context.
- May optionally link to a timetable entry and date.
- May optionally bridge to Grades if graded.

Recommended fields:

- `id`
- `schoolId`
- `academicYearId`
- `termId`
- `classroomId`
- `subjectId`
- `teacherUserId`
- `teacherSubjectAllocationId`
- Optional `timetableEntryId`
- Optional `scheduleDate` as date-only value for V1 occurrence context
- `title`
- `description`
- `mode`: `HOMEWORK | WORKSHEET | WRITING_TASK | QUIZ | READING | PROJECT`
- `status`: `DRAFT | PUBLISHED | CLOSED | CANCELLED | ARCHIVED`
- `targetMode`: `CLASSROOM | SELECTED_STUDENTS`
- `publishAt`
- `publishedAt`
- `dueAt`
- `closedAt`
- `estimatedMinutes`
- `totalMarks`
- `isGraded`
- Optional `gradeAssessmentId`
- `createdByUserId`
- `publishedByUserId`
- `createdAt`
- `updatedAt`
- Optional `deletedAt` if soft deletion is needed.

Required invariants:

- `teacherSubjectAllocationId` must belong to the same school, term, classroom, subject, and teacher.
- If `timetableEntryId` is provided, it must belong to the same school, term, classroom, subject, teacher allocation, and be active/published enough for homework linkage.
- If `scheduleDate` is provided, it must be inside the term date range.
- `dueAt` must be after `publishAt` or `publishedAt` where applicable.
- Published homework cannot be freely edited in ways that invalidate existing student submissions.
- Teacher App creation must require ownership of the class/allocation.

### 6.2 HomeworkTarget

Purpose:

- Materializes who receives the homework.
- Enables selected-student assignment, submission tracking, and parent/student read filtering.

Recommended fields:

- `id`
- `schoolId`
- `homeworkAssignmentId`
- `studentId`
- `enrollmentId`
- `status`: `ASSIGNED | VIEWED | SUBMITTED | LATE | MISSING | REVIEWED | EXCUSED`
- `assignedAt`
- `viewedAt`
- `submittedAt`
- `reviewedAt`
- `createdAt`
- `updatedAt`

Required invariants:

- Target student enrollment must belong to the homework classroom, academic year, and term.
- Unique target per `schoolId + homeworkAssignmentId + studentId`.
- Parent and Student read APIs must only read through target rows after ownership checks.

### 6.3 HomeworkContent / HomeworkQuestion

Purpose:

- Represents homework content/questions only if product requires in-app homework solving.

Recommended staged decision:

- Sprint 13B can create a simple assignment/content/attachment foundation without full question engine.
- Question engine parity can be added after content rules are approved.

If question engine is included, recommended fields:

- `id`
- `schoolId`
- `homeworkAssignmentId`
- `type`: `MCQ | TRUE_FALSE | MATCHING | ORDERING | FILL_BLANKS | ESSAY | FILE_UPLOAD | TEXT`
- `title`
- `body`
- `options` JSON
- `pairs` JSON
- `blanks` JSON
- `points`
- `sortOrder`
- `required`
- `createdAt`
- `updatedAt`

Open decision:

- Reuse Grades questions only when `gradeAssessmentId` exists, or build HomeworkQuestion as independent core. Default recommendation: independent HomeworkQuestion for ungraded homework, optional Grade bridge for graded work.

### 6.4 HomeworkSubmission

Purpose:

- Student attempt/submission for one target.

Recommended fields:

- `id`
- `schoolId`
- `homeworkAssignmentId`
- `homeworkTargetId`
- `studentId`
- `status`: `DRAFT | SUBMITTED | LATE | RETURNED | REVIEWED | CANCELLED`
- `submittedAt`
- `reviewedAt`
- `reviewedByUserId`
- `score`
- `feedback`
- `createdAt`
- `updatedAt`

Required invariants:

- Only the owning student can submit unless an explicitly approved parent-submit policy exists.
- Late submission behavior must be explicit.
- Once reviewed, mutation should be restricted unless a reopen/review policy exists.

### 6.5 HomeworkSubmissionAnswer

Purpose:

- Captures per-question answer when question engine exists.

Recommended fields:

- `id`
- `schoolId`
- `homeworkSubmissionId`
- `homeworkQuestionId`
- `answer` JSON
- `score`
- `feedback`
- `reviewedAt`
- `createdAt`
- `updatedAt`

### 6.6 HomeworkAttachment

Purpose:

- Links files to homework assignment or submission.

Recommended fields:

- `id`
- `schoolId`
- `homeworkAssignmentId` nullable
- `homeworkSubmissionId` nullable
- `fileId`
- `kind`: `TEACHER_RESOURCE | STUDENT_PROOF | REVIEW_ATTACHMENT`
- `createdByUserId`
- `createdAt`

Required invariants:

- Exactly one owner context should be set: assignment or submission.
- File must belong to current school.
- App-facing responses must expose safe file metadata/download endpoints only.

### 6.7 Optional Grade Bridge

Recommended model:

- `HomeworkAssignment.gradeAssessmentId` optional unique/nullable relation.

Rules:

- Homework can exist without grades.
- Graded homework can create or link a `GradeAssessment`.
- Grade sync should be explicit and audited.
- Do not make Homework depend on Grades for all cases.

## 7. Recommended API Surface

### 7.1 Dashboard / Core APIs

Recommended future dashboard/core routes:

```text
GET    /api/v1/homework/assignments
POST   /api/v1/homework/assignments
GET    /api/v1/homework/assignments/:homeworkId
PATCH  /api/v1/homework/assignments/:homeworkId
POST   /api/v1/homework/assignments/:homeworkId/publish
POST   /api/v1/homework/assignments/:homeworkId/close
POST   /api/v1/homework/assignments/:homeworkId/cancel
GET    /api/v1/homework/assignments/:homeworkId/targets
POST   /api/v1/homework/assignments/:homeworkId/targets/resolve
GET    /api/v1/homework/assignments/:homeworkId/submissions
GET    /api/v1/homework/submissions/:submissionId
POST   /api/v1/homework/submissions/:submissionId/review
```

These routes should be dashboard/core routes requiring explicit permissions, not app routes.

### 7.2 Teacher App APIs

Recommended Teacher App routes after core foundation:

```text
GET  /api/v1/teacher/homeworks/dashboard
GET  /api/v1/teacher/homeworks/classes/:classId/assignments
POST /api/v1/teacher/homeworks/classes/:classId/assignments
GET  /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId
PATCH /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId
POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/publish
GET  /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions
GET  /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId
POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/review
```

Alternative: keep creation under Teacher Classroom routes if product wants classroom detail to own assignment creation. Teacher Homework dashboard can remain read-only and aggregate.

Rules:

- `classId` remains `TeacherSubjectAllocation.id`.
- Teacher can only create/read/review homework for owned allocations.
- If linked to timetable, schedule entry must be owned by teacher and match class/allocation.

### 7.3 Student App APIs

Recommended Student App routes:

```text
GET  /api/v1/student/homeworks
GET  /api/v1/student/homeworks/:homeworkId
POST /api/v1/student/homeworks/:homeworkId/submission/resolve
PUT  /api/v1/student/homeworks/:homeworkId/submission/answers/:questionId
PUT  /api/v1/student/homeworks/:homeworkId/submission/answers
POST /api/v1/student/homeworks/:homeworkId/submission/submit
```

Rules:

- Student reads only homework targets for own active enrollment/student id.
- Student cannot read classmate answers.
- Student cannot submit outside target/submission policy.
- File uploads must go through Files Core and resource ownership authorization.

### 7.4 Parent App APIs

Recommended Parent App routes:

```text
GET /api/v1/parent/children/:studentId/homeworks
GET /api/v1/parent/children/:studentId/homeworks/:homeworkId
```

Default recommendation: Parent App homework is read-only in V1.

Parent submit from the ADR should remain deferred unless product explicitly approves parent-on-behalf-of-student submission. If approved later, it requires audit logging, explicit actor attribution, and probably a separate submission source enum.

Rules:

- Parent must own child through ParentAppAccessService.
- Parent reads only current-school child homework.
- Same-school unlinked and cross-school guessed child ids must return safe 404.
- No cross-school aggregation.

## 8. Status Mapping

### 8.1 Core Assignment Status

Recommended core status:

- `DRAFT`: editable, not visible to students/parents.
- `PUBLISHED`: visible and assignable.
- `CLOSED`: no new student submissions unless reopened/late policy allows.
- `CANCELLED`: hidden or shown as cancelled depending on app policy.
- `ARCHIVED`: admin retention state.

### 8.2 Teacher Status Labels

Teacher handoff statuses:

- `draft`: core `DRAFT`.
- `active`: core `PUBLISHED` and due date not passed, or still accepting submissions.
- `closed`: core `CLOSED` or published but not accepting submissions.
- `waiting_review`: published homework with submitted targets not fully reviewed.

### 8.3 Student/Parent Status Labels

Student/Parent handoff statuses:

- `completed`: target/submission reviewed or submitted depending product label.
- `waiting`: assigned and not yet submitted before due date.
- `not_completed`: missing or due date passed without submission.

Recommended internal target status should be richer than the app label to avoid losing workflow fidelity.

## 9. Ownership And Security Rules

### 9.1 School Scope

All Homework Core models must include `schoolId` and be registered in school-scope extension.

Recommended school-scoped models:

- `HomeworkAssignment`
- `HomeworkTarget`
- `HomeworkQuestion`
- `HomeworkSubmission`
- `HomeworkSubmissionAnswer`
- `HomeworkAttachment`

### 9.2 Teacher Ownership

Teacher App must prove:

- Authenticated actor is `UserType.TEACHER`.
- `classId` is an owned `TeacherSubjectAllocation.id`.
- Homework assignment belongs to that allocation/classroom/subject/term.
- Review action belongs to a submission from a target of that homework.

### 9.3 Student Ownership

Student App must prove:

- Authenticated actor is `UserType.STUDENT`.
- Current student record is linked through `Student.userId`.
- Student has an active enrollment in current school.
- Homework target belongs to this student/enrollment.

### 9.4 Parent Ownership

Parent App must prove:

- Authenticated actor is `UserType.PARENT`.
- Parent has current-school Guardian profile linked to the child.
- Child has active current-school enrollment.
- Homework target belongs to the requested owned child.

### 9.5 File Access

File access must be authorized through homework ownership first. Do not grant app users broad Files module access directly just to download homework files.

## 10. Relationship To Schedule/Timetable

Homework should optionally reference timetable context, but must not depend on a persisted ScheduleOccurrence yet.

Recommended V1 identity strategy:

- Optional `timetableEntryId`.
- Optional `scheduleDate` date-only.
- App-facing schedule card can use computed `scheduleId = timetable-entry:<entryId>:<YYYY-MM-DD>`.
- Homework validates that `scheduleDate` is inside term date range.
- Homework validates that `timetableEntryId` is active/published and matches teacher allocation/classroom/subject/term.

Do not:

- Create ScheduleOccurrence in Homework sprint.
- Mutate timetable from Homework.
- Generate homework automatically from every schedule entry.

## 11. Relationship To Grades

Recommended V1 decision:

- Homework Core is independent.
- `HomeworkAssignment.gradeAssessmentId` is optional.
- If `isGraded = true`, Homework may link/create a GradeAssessment.
- Grade sync should be explicit and audited.
- Homework dashboards may include marks only when `totalMarks` or grade bridge exists.

Avoid:

- Reusing GradeAssessment as the only homework persistence.
- Making all homework graded.
- Letting Student App submit Grade submissions directly without Homework target ownership if the route is branded as homework.

## 12. Relationship To Notifications

Homework should define future events, but not deliver notifications in 13B.

Potential future events:

- `homework.published`
- `homework.due_soon`
- `homework.submitted`
- `homework.reviewed`
- `homework.closed`

Delivery to Student App, Parent App, Email, or Notification Center should wait for a notification policy sprint.

## 13. Recommended Implementation Plan

### Sprint 13B — Homework Core Foundation

Scope:

- Add Prisma models and migration for HomeworkAssignment and HomeworkTarget.
- Add basic Homework Core module.
- Add dashboard/core assignment create/list/detail/publish/close/cancel.
- Add target materialization for classroom and selected students.
- Register school scope.
- Add permissions and security tests.

Non-goals:

- Student submission answers.
- Parent submit.
- Notification delivery.
- Grade sync.
- Full question engine.

### Sprint 13C — Teacher Homework APIs

Scope:

- Teacher homework dashboard.
- Teacher class assignment list/detail.
- Teacher create/update/publish homework for owned class.
- Teacher sees target/submission counters.
- Optional schedule linkage using timetable entry/date.

Non-goals:

- Full review workflow unless submissions exist.
- XP/rewards.
- Notification center.

### Sprint 13D — Student Homework Read + Submission

Scope:

- Student homework list/detail.
- Resolve submission.
- Save simple answer/proof.
- Submit homework.
- File upload proof using Files Core.

Requires:

- Final decision on HomeworkQuestion/Answer model or limited text/file proof model.

### Sprint 13E — Parent Child Homework Reads

Scope:

- Parent child homework list/detail.
- Parent read-only status and result summary.
- Ownership through ParentAppAccessService.

Non-goals:

- Parent submit unless explicitly approved.
- Cross-school aggregation.

### Sprint 13F — Homework Review / Grade Bridge

Scope:

- Teacher reviews submissions.
- Optional score/feedback.
- Optional sync to GradeAssessment/GradeItem.

### Sprint 13G — Homework Closeout + README + verify script

Scope:

- Final E2E closeout.
- README runbook.
- `verify:sprint13g` or final sprint verifier.

### Sprint 13H — Homework Docs + Postman

Scope:

- Markdown docs.
- Postman collection.
- API usage guide.

## 14. Open Product Decisions

Before Sprint 13B implementation, confirm or defer:

1. Is Homework always academic, or can it include ungraded reading/practice tasks?
2. Should homework be independent from Grades by default? Recommended: yes.
3. Should graded homework create/link a GradeAssessment? Recommended: optional bridge.
4. Are parents allowed to submit homework on behalf of students? Recommended: no for V1.
5. Are homework questions required in the first implementation, or can V1 begin with title/description/attachments/proof?
6. Which question types are required first: MCQ, true/false, essay, file upload, etc.?
7. Are late submissions allowed after due date?
8. Can teachers reopen reviewed submissions?
9. Should selected-student targeting be in 13B or deferred after classroom targeting?
10. Should schedule linkage be required or optional? Recommended: optional.
11. Should Homework send email/app notifications in V1? Recommended: not in foundation sprint.
12. Should student avatars/counts in ADR be real or omitted until profile/avatar policy exists?

## 15. Recommended 13B Minimal Scope

Recommended Sprint 13B should be conservative and foundational:

Implement:

- `HomeworkAssignment`.
- `HomeworkTarget`.
- classroom and selected-student targeting.
- assignment create/list/detail/update while draft.
- publish/close/cancel lifecycle.
- target materialization and counters.
- optional schedule linkage to `TimetableEntry + scheduleDate`.
- school-scope registration.
- dashboard/core APIs only.
- tests and security guardrails.

Do not implement in 13B:

- Student submission routes.
- Parent routes.
- Teacher app routes.
- Full question engine.
- File proof upload.
- Grade sync.
- Notifications.
- Rewards/XP.

This keeps Homework Core safe, normalized, and aligned with project structure before app-facing work begins.

## 16. Final Recommendation

Proceed with:

```text
Sprint 13B — Homework Core Foundation
```

Implementation should create a first-class `src/modules/homework` core module. Teacher/Student/Parent apps should only consume it in later sprints. Grades should be bridged optionally, not used as the only Homework source of truth. Schedule/Timetable can provide optional lesson/date context through `timetableEntryId + scheduleDate` without introducing ScheduleOccurrence persistence.
