# Sprint TEACH-PERM-0A - Teacher App Permission Coverage Audit

## 1. Header

**Sprint:** TEACH-PERM-0A - Teacher App Permission Coverage Audit

**Date:** 2026-07-02

**Repo HEAD:** `6cd34c19 test: close parent app permission coverage`

**Scope:** Documentation-only audit of Teacher App route-level permission coverage, Teacher role seed permissions, permission catalog gaps, ownership boundaries, and recommended follow-up work.

**Files changed:** `docs/sprint-teach-perm-0a-teacher-app-permission-coverage-audit.md`

**Files intentionally not changed:** source files, tests, Prisma schema, migrations, seed files, package files, lock files, and environment files.

**Final recommendation:** `NEEDS HUMAN DECISION`

The audit found a strong Teacher App ownership layer, but no current Teacher App controller route has `@RequiredPermissions(...)`. Several Teacher App surfaces also need catalog additions before route-level RBAC can be closed cleanly. The largest unresolved product/security decision is whether Teacher App announcement management should use a broad existing school communication permission or a new Teacher-App-specific permission.

## 2. Inputs Read

### Governance and architecture documents

- `AGENTS.md`
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
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`

### Required reading exception

`AGENTS.md` requires `DIRECTORY_STRUCTURE.md`, but that file is not present in this workspace. `DIRECTORY_STRUCTURE_VISUAL.md` exists, but it is not the same required file. This audit therefore treats `DIRECTORY_STRUCTURE.md` as unavailable and does not infer undocumented rules from the visual file.

### Prior permission-track documents

- `docs/sprint-stu-perm-0a-student-app-permission-coverage-audit.md`
- `docs/sprint-parent-perm-0a-parent-app-permission-coverage-audit.md`
- `docs/sprint-parent-perm-1a-permission-catalog-parent-role-seed-closeout.md`
- `docs/sprint-parent-perm-1b-read-only-parent-app-route-decorators-closeout.md`
- `docs/sprint-parent-perm-1c-communication-notifications-action-permissions-closeout.md`
- `docs/sprint-parent-perm-1d-final-parent-permission-closeout-regression-audit.md`

### RBAC and IAM files inspected

- `src/app.module.ts`
- `src/common/decorators/required-permissions.decorator.ts`
- `src/common/guards/permissions.guard.ts`
- `src/common/guards/scope-resolver.guard.ts`
- `src/modules/iam/auth/infrastructure/auth.repository.ts`
- `src/modules/iam/auth/application/membership.mapper.ts`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`

### Teacher App files inspected

- `src/modules/teacher-app/teacher-app.module.ts`
- `src/modules/teacher-app/access/teacher-app-access.domain.ts`
- `src/modules/teacher-app/access/teacher-app-access.service.ts`
- `src/modules/teacher-app/access/teacher-app-allocation-read.adapter.ts`
- `src/modules/teacher-app/shared/teacher-app.context.ts`
- `src/modules/teacher-app/shared/teacher-app.errors.ts`
- `src/modules/teacher-app/shared/teacher-app.types.ts`
- Teacher App controllers and their use cases/adapters across home, classes, classroom, attendance, grades, homeworks, tasks, review queue, XP, messages, notifications, announcements, profile, settings, schedule, calendar, and lesson preparation.

### Files boundary files inspected

- `src/modules/files/uploads/controller/uploads.controller.ts`
- `src/modules/files/uploads/application/get-file-download-url.use-case.ts`
- `src/modules/files/uploads/infrastructure/files.repository.ts`
- `src/modules/files/uploads/files-scope.ts`

### Tests inspected

- `test/security/tenancy.teacher-app.spec.ts`
- `test/e2e/teacher-app-final-closeout.e2e-spec.ts`

### Expected tests not found

- `test/security/tenancy.teacher-app-child-lessons.spec.ts`
- `test/e2e/teacher-app-child-lessons.e2e-spec.ts`

## 3. Current Permission Enforcement Mechanics Review

### Guard chain

`src/app.module.ts` registers the global guards in this order:

1. `JwtAuthGuard`
2. `ScopeResolverGuard`
3. `PermissionsGuard`

This order is correct for permission enforcement because authentication runs before active membership/scope resolution, and permission checks run after the active scope has been attached to the request context.

### Permission decorator behavior

`@RequiredPermissions(...)` writes metadata using `REQUIRED_PERMISSIONS_KEY = 'moazez:required_permissions'`.

`PermissionsGuard` reads that metadata. If the route has no required permission metadata, or if the metadata is an empty array, the guard allows the request after authentication and active scope resolution. In other words:

- A route without `@RequiredPermissions(...)` is protected by auth and scope only.
- A route with `@RequiredPermissions('some.permission')` requires that permission in `ctx.activeMembership.permissions` or platform permissions.
- Missing required permissions produce `auth.scope.missing`.

### Active membership permissions

`/auth/me` includes active memberships and role permissions. The mapper exposes `activeMembership.permissions` by mapping `role.rolePermissions[].permission.code`.

This means the Teacher role seed is the source of effective school-scope permissions for Teacher App users.

### Teacher App implication

The current Teacher App route surface has **111 handlers** across the inspected Teacher App controllers. The current route-level `@RequiredPermissions(...)` coverage count is **0**.

Until decorators are added, Teacher App permission gaps in the role seed are not enforced by route-level RBAC. Ownership and user-type checks still run inside Teacher App use cases, but role permission coverage cannot be verified by the API layer because no Teacher App handler currently asks `PermissionsGuard` to check a Teacher App permission.

## 4. Current Teacher Role Inventory

`TEACHER_PERMISSIONS` in `prisma/seeds/02-system-roles.seed.ts` currently contains **42** permissions:

```ts
[
  'attendance.sessions.view',
  'attendance.sessions.manage',
  'attendance.sessions.submit',
  'attendance.entries.manage',
  'grades.assessments.view',
  'grades.assessments.manage',
  'grades.questions.view',
  'grades.questions.manage',
  'grades.submissions.view',
  'grades.submissions.review',
  'grades.items.view',
  'grades.items.manage',
  'grades.gradebook.view',
  'grades.analytics.view',
  'grades.snapshots.view',
  'reinforcement.tasks.view',
  'reinforcement.tasks.manage',
  'reinforcement.templates.view',
  'reinforcement.reviews.view',
  'reinforcement.reviews.manage',
  'reinforcement.xp.view',
  'reinforcement.hero.view',
  'reinforcement.hero.progress.view',
  'reinforcement.rewards.view',
  'reinforcement.rewards.redemptions.view',
  'reinforcement.rewards.redemptions.request',
  'behavior.overview.view',
  'behavior.categories.view',
  'behavior.records.view',
  'behavior.records.create',
  'behavior.points.view',
  'communication.conversations.view',
  'communication.conversations.create',
  'communication.conversations.manage',
  'communication.participants.manage',
  'communication.messages.view',
  'communication.messages.send',
  'communication.messages.edit',
  'communication.messages.delete',
  'communication.messages.report',
  'students.records.view',
  'files.uploads.manage',
]
```

### Permissions clearly used by current Teacher App routes

- `attendance.sessions.view`
- `attendance.sessions.manage`
- `attendance.sessions.submit`
- `attendance.entries.manage`
- `grades.assessments.view`
- `grades.questions.view`
- `grades.submissions.view`
- `grades.submissions.review`
- `grades.items.view`
- `grades.items.manage`
- `grades.gradebook.view`
- `reinforcement.tasks.view`
- `reinforcement.tasks.manage`
- `reinforcement.reviews.view`
- `reinforcement.reviews.manage`
- `reinforcement.xp.view`
- `communication.conversations.view`
- `communication.conversations.create`
- `communication.messages.view`
- `communication.messages.send`
- `students.records.view`
- `files.uploads.manage`

### Permissions currently missing for expected Teacher App surfaces

Existing catalog permissions missing from the Teacher role:

- `app.device_tokens.manage`
- `academics.calendar.view`
- `academics.curriculum.view`
- `academics.lesson_plans.view`
- `academics.timetable.view`
- `communication.contacts.view`
- `communication.conversations.read`
- `communication.announcements.view`
- `communication.notifications.view`
- `communication.notifications.read`
- `communication.notifications.archive`
- `communication.notifications.preferences.manage`
- `homework.assignments.view`
- `homework.assignments.manage`
- `homework.targets.view`
- `homework.targets.manage`
- `homework.submissions.view`

New catalog entries needed before enforcement:

- `teacher.home.view`
- `teacher.classes.view`
- `teacher.classroom.view`
- `teacher.profile.view`
- `teacher.settings.view`
- `teacher.lesson_preparation.view`
- `teacher.lesson_preparation.status.manage`
- `homework.questions.view`
- `homework.questions.manage`
- `homework.attachments.view`
- `homework.attachments.manage`
- `homework.submissions.review`
- `homework.grade_sync.view`
- `homework.grade_sync.manage`

Human-decision catalog option:

- Prefer a new `teacher.announcements.manage` permission for Teacher App announcement authoring if teachers should manage only their own Teacher-App announcements.
- Do not grant broad `communication.announcements.manage` to default Teacher without explicit product/security approval and core-route constraints.

### Permissions that look over-granted for current Teacher App routes

These permissions are present in the Teacher role but are not required by the current Teacher App route surface:

- `communication.conversations.manage`
- `communication.participants.manage`
- `communication.messages.edit`
- `communication.messages.delete`
- `communication.messages.report`
- `reinforcement.rewards.redemptions.request`
- `reinforcement.hero.view`
- `reinforcement.hero.progress.view`
- `reinforcement.rewards.view`
- `reinforcement.rewards.redemptions.view`
- `reinforcement.templates.view`
- `grades.assessments.manage`
- `grades.questions.manage`
- `grades.analytics.view`
- `grades.snapshots.view`
- `behavior.overview.view`
- `behavior.categories.view`
- `behavior.records.view`
- `behavior.records.create`
- `behavior.points.view`

Some of these may be valid for non-Teacher-App backend surfaces or future Teacher App phases. They should not be silently retained as Teacher App route requirements unless those surfaces are explicitly in scope.

## 5. Permission Catalog Inventory

### Existing catalog permissions that can support Teacher App enforcement

- App/device: `app.device_tokens.manage`
- Academics: `academics.calendar.view`, `academics.curriculum.view`, `academics.lesson_plans.view`, `academics.timetable.view`
- Attendance: `attendance.sessions.view`, `attendance.sessions.manage`, `attendance.sessions.submit`, `attendance.entries.manage`
- Grades: `grades.assessments.view`, `grades.questions.view`, `grades.submissions.view`, `grades.submissions.review`, `grades.items.view`, `grades.items.manage`, `grades.gradebook.view`
- Homework: `homework.assignments.view`, `homework.assignments.manage`, `homework.targets.view`, `homework.targets.manage`, `homework.submissions.view`
- Reinforcement: `reinforcement.tasks.view`, `reinforcement.tasks.manage`, `reinforcement.reviews.view`, `reinforcement.reviews.manage`, `reinforcement.xp.view`
- Communication: `communication.contacts.view`, `communication.conversations.view`, `communication.conversations.create`, `communication.conversations.read`, `communication.messages.view`, `communication.messages.send`, `communication.announcements.view`, `communication.notifications.view`, `communication.notifications.read`, `communication.notifications.archive`, `communication.notifications.preferences.manage`
- Students: `students.records.view`
- Files: `files.uploads.manage`

### Existing catalog permissions that should not be automatically granted to default Teacher

- Platform/admin/settings/dashboard permissions.
- Admissions administration permissions.
- Student self-service permissions such as `homework.submissions.save`, `homework.submissions.submit`, `homework.answers.manage`, and `homework.submission_attachments.manage`.
- Broad communication administration or moderation permissions.
- Broad communication management permissions unless product scope explicitly requires them.
- `files.downloads.view` until generic file download authorization is ownership-aware for Teacher App use cases.

### Missing catalog entries

The current catalog lacks Teacher-App-specific read permissions for aggregate Teacher surfaces and lacks granular Teacher homework authoring/review permissions:

```ts
[
  'teacher.home.view',
  'teacher.classes.view',
  'teacher.classroom.view',
  'teacher.profile.view',
  'teacher.settings.view',
  'teacher.lesson_preparation.view',
  'teacher.lesson_preparation.status.manage',
  'homework.questions.view',
  'homework.questions.manage',
  'homework.attachments.view',
  'homework.attachments.manage',
  'homework.submissions.review',
  'homework.grade_sync.view',
  'homework.grade_sync.manage',
]
```

Optional, pending human decision:

```ts
[
  'teacher.announcements.manage',
]
```

## 6. Teacher App Ownership and Visibility Audit

### Core Teacher App access model

Teacher App access is built around `TeacherSubjectAllocation.id`.

`src/modules/teacher-app/access/teacher-app-access.domain.ts` defines:

- `TEACHER_APP_CLASS_ID_BACKING_MODEL = 'TeacherSubjectAllocation.id'`
- Teacher App context requires `actor.userType === UserType.TEACHER`.
- Teacher App context requires active membership, `teacherUserId`, `schoolId`, `organizationId`, `membershipId`, `roleId`, and permissions.

`TeacherAppAccessService` provides:

- `assertCurrentTeacher()`
- `assertTeacherOwnsAllocation(classId)`
- `findOwnedTeacherAllocation(classId)`
- `listOwnedTeacherAllocationIds()`
- `listOwnedTeacherAllocations()`

`TeacherAppAllocationReadAdapter` uses scoped Prisma and filters owned allocations by current `teacherUserId`, active Teacher user type, and non-deleted academic hierarchy records.

### Area findings

Home:

- Uses `assertCurrentTeacher`.
- Reads identity, school summary, owned allocations, task/review/XP/message summaries.
- Counts and summaries are constrained by current teacher, owned allocations, or participant visibility.

My Classes:

- List uses `assertCurrentTeacher` and owned allocations.
- Detail uses `assertTeacherOwnsAllocation(classId)`.

Classroom and roster:

- Classroom detail and roster use owned allocation checks.
- Roster exposes classroom/student summary fields, not guardian, medical, document, bucket, or storage internals.

Attendance:

- Every class route resolves an owned allocation first.
- Session reads/writes validate the session belongs to the allocation classroom, term, and academic year.
- Entry updates validate target students belong to the session roster.

Grades and classroom assignment review:

- Assessment and gradebook reads are constrained to owned allocation term, subject, classroom, and academic year.
- Submission and answer review routes assert owned assignment/submission/answer visibility before delegating to core grades use cases.

Homeworks:

- `TeacherHomeworkOwnershipService` resolves the current teacher and owned allocation before class, homework, question, target, attachment, submission, review, and grade-sync actions.
- Homework ownership requires `teacherUserId`, `teacherSubjectAllocationId`, and scoped school context.

Tasks, review queue, and XP:

- Task visibility requires Teacher source plus assigned/created current teacher and owned class/student constraints.
- Review queue visibility requires a Teacher-created/assigned task, owned allocation, and eligible enrollment.
- XP routes only show owned class/student ledger data.

Messages:

- Contacts come from active students and guardians linked to owned classrooms.
- Conversation visibility requires current teacher active participant.
- Message and attachment reads are constrained by visible conversation and message membership.
- Teacher App message attachment download/preview routes are safer than generic file download because they run conversation/message/attachment visibility before issuing a signed URL.

Notifications and device tokens:

- Notification reads and actions are scoped to `recipientUserId = teacherUserId`.
- Preferences are scoped to current school and current teacher.
- Device tokens are registered under `AppDeviceTokenSurface.TEACHER`.

Announcements:

- Teacher announcements are filtered to `createdById = teacherUserId`, metadata source `teacher_app`, and owned allocation/classroom metadata.
- Create/update routes resolve targets through owned allocations.
- Management is still high-risk at the permission layer because the existing `communication.announcements.manage` is a broad core communication permission.

Profile and settings:

- Use current Teacher context and scoped reads.
- These are self/school-facing read models, not general user administration routes.

Schedule, calendar, and lesson preparation:

- Schedule reads use current Teacher context and owned allocations.
- Calendar reads use the app calendar read model with school context and owned allocation/classroom visibility.
- Lesson preparation detail/status routes are tied to teacher-owned allocation and lesson plan item visibility.
- Status update should not use broad `academics.lesson_plans.manage`; a narrow Teacher status permission is safer.

### Generic files boundary decision

The generic files module exposes:

- `POST /api/v1/files` guarded by `files.uploads.manage`
- `GET /api/v1/files/:id/download` guarded by `files.downloads.view`

`GetFileDownloadUrlUseCase` checks actor scope and uses scoped Prisma to find a file by ID, but it does not enforce Teacher App ownership, conversation membership, assignment visibility, or attachment ownership. Scoped school visibility alone is not enough for default Teacher access.

Decision:

- Keep `files.uploads.manage` as a cautious Teacher role permission where Teacher upload flows require it.
- Do not add `files.downloads.view` to the default Teacher role in this sprint.
- Prefer Teacher-owned redirect routes for message/homework/lesson files, where the app route checks ownership before requesting a signed URL.

## 7. Full Teacher App Route Matrix

Legend:

- `Current @RequiredPermissions`: all rows are `none`.
- `Missing-permission expectation`: should be `403 auth.scope.missing` after decorators are added and the Teacher role lacks the required permission.
- `Ownership failure expectation`: should be `404` for invisible cross-scope resources unless the current behavior intentionally uses a domain-specific forbidden error.
- `No-leak notes`: shorthand means no cross-school data, no unrelated class data, no guardian/medical/document overexposure, and no bucket/object-key leakage.

| # | Area | Controller file | HTTP method | Route | Controller method | Use case | Read/Write/Action | Persistent data touched? | Current @RequiredPermissions | Recommended permission(s) | Permission exists in catalog? | Add to TEACHER_PERMISSIONS? | Needs new catalog entry? | Existing ownership/visibility check | Missing-permission expectation after enforcement | Ownership failure expectation | No-leak notes | Security decision/notes |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Home | `home/teacher-home.controller.ts` | GET | `/api/v1/teacher/home` | `getHome` | `GetTeacherHomeUseCase` | Read | yes | none | `teacher.home.view` | no | yes | yes | `403 auth.scope.missing` | `403 teacher_app.forbidden` | Safe dashboard aggregates | Add narrow app aggregate permission. |
| 2 | My Classes | `my-classes/teacher-my-classes.controller.ts` | GET | `/api/v1/teacher/my-classes` | `listMyClasses` | `ListTeacherClassesUseCase` | Read | yes | none | `teacher.classes.view` | no | yes | yes | `403 auth.scope.missing` | empty owned list | Allocation list only | Add narrow app aggregate permission. |
| 3 | My Classes | `my-classes/teacher-my-classes.controller.ts` | GET | `/api/v1/teacher/my-classes/:classId` | `getMyClassDetail` | `GetTeacherClassDetailUseCase` | Read | yes | none | `teacher.classes.view` | no | yes | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Owned allocation only | `classId` is `TeacherSubjectAllocation.id`. |
| 4 | Classroom | `classroom/teacher-classroom.controller.ts` | GET | `/api/v1/teacher/classroom/:classId` | `getClassroom` | `GetTeacherClassroomUseCase` | Read | yes | none | `teacher.classroom.view` | no | yes | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Owned class summary | Add narrow classroom read permission. |
| 5 | Classroom | `classroom/teacher-classroom.controller.ts` | GET | `/api/v1/teacher/classroom/:classId/roster` | `listRoster` | `ListTeacherClassroomRosterUseCase` | Read | yes | none | `teacher.classroom.view`, `students.records.view` | mixed | yes | yes | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Student roster only | Keep roster response limited. |
| 6 | Attendance | `attendance/teacher-classroom-attendance.controller.ts` | GET | `/api/v1/teacher/classroom/:classId/attendance/roster` | `getRoster` | `GetTeacherClassroomAttendanceRosterUseCase` | Read | yes | none | `attendance.sessions.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Attendance roster only | Current permission exists and is seeded. |
| 7 | Attendance | `attendance/teacher-classroom-attendance.controller.ts` | GET | `/api/v1/teacher/classroom/:classId/attendance/today` | `getToday` | `GetTeacherClassroomAttendanceTodayUseCase` | Read | yes | none | `attendance.sessions.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Owned session summary | Current permission exists and is seeded. |
| 8 | Attendance | `attendance/teacher-classroom-attendance.controller.ts` | POST | `/api/v1/teacher/classroom/:classId/attendance/session/resolve` | `resolveSession` | `ResolveTeacherClassroomAttendanceSessionUseCase` | Action | yes | none | `attendance.sessions.manage` | yes | yes | no | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Owned class session only | Current permission exists and is seeded. |
| 9 | Attendance | `attendance/teacher-classroom-attendance.controller.ts` | GET | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId` | `getSession` | `GetTeacherClassroomAttendanceSessionUseCase` | Read | yes | none | `attendance.sessions.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 attendance.session.not_found` | Owned session only | Session must match allocation. |
| 10 | Attendance | `attendance/teacher-classroom-attendance.controller.ts` | PUT | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/entries` | `updateEntries` | `UpdateTeacherClassroomAttendanceEntriesUseCase` | Write | yes | none | `attendance.entries.manage` | yes | yes | no | yes | `403 auth.scope.missing` | `404 attendance.session.not_found` | Roster-bound entries | Student IDs must belong to roster. |
| 11 | Attendance | `attendance/teacher-classroom-attendance.controller.ts` | POST | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/submit` | `submitSession` | `SubmitTeacherClassroomAttendanceSessionUseCase` | Action | yes | none | `attendance.sessions.submit` | yes | yes | no | yes | `403 auth.scope.missing` | `404 attendance.session.not_found` | Owned session only | Current permission exists and is seeded. |
| 12 | Grades | `grades/teacher-classroom-grades.controller.ts` | GET | `/api/v1/teacher/classroom/:classId/grades/assessments` | `listAssessments` | `ListTeacherClassroomAssessmentsUseCase` | Read | yes | none | `grades.assessments.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Owned subject/class only | Current permission exists and is seeded. |
| 13 | Grades | `grades/teacher-classroom-grades.controller.ts` | GET | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId` | `getAssessment` | `GetTeacherClassroomAssessmentUseCase` | Read | yes | none | `grades.assessments.view`, `grades.questions.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 grades.assessment.not_found` | Owned assessment only | Current permissions exist and are seeded. |
| 14 | Grades | `grades/teacher-classroom-grades.controller.ts` | GET | `/api/v1/teacher/classroom/:classId/grades/gradebook` | `getGradebook` | `GetTeacherClassroomGradebookUseCase` | Read | yes | none | `grades.gradebook.view`, `grades.items.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Owned class gradebook | Current permissions exist and are seeded. |
| 15 | Classroom Assignments | `assignments/teacher-classroom-assignments.controller.ts` | GET | `/api/v1/teacher/classroom/:classId/assignments` | `listAssignments` | `ListTeacherClassroomAssignmentsUseCase` | Read | yes | none | `grades.assessments.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Owned subject/class only | Current permission exists and is seeded. |
| 16 | Classroom Assignments | `assignments/teacher-classroom-assignments.controller.ts` | GET | `/api/v1/teacher/classroom/:classId/assignments/:assignmentId` | `getAssignment` | `GetTeacherClassroomAssignmentUseCase` | Read | yes | none | `grades.assessments.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 grades.assessment.not_found` | Owned assignment only | Current permission exists and is seeded. |
| 17 | Classroom Assignments | `assignments/teacher-classroom-assignments.controller.ts` | GET | `/api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions` | `listAssignmentSubmissions` | `ListTeacherClassroomAssignmentSubmissionsUseCase` | Read | yes | none | `grades.submissions.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 grades.assessment.not_found` | Owned submission list | Current permission exists and is seeded. |
| 18 | Classroom Assignments | `assignments/teacher-classroom-assignments.controller.ts` | GET | `/api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId` | `getAssignmentSubmission` | `GetTeacherClassroomAssignmentSubmissionUseCase` | Read | yes | none | `grades.submissions.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 grades.submission.not_found` | Owned submission only | Current permission exists and is seeded. |
| 19 | Classroom Submission Review | `assignments/teacher-classroom-submission-review.controller.ts` | PATCH | `/api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/answers/:answerId/review` | `reviewAnswer` | `ReviewTeacherClassroomSubmissionAnswerUseCase` | Write | yes | none | `grades.submissions.review` | yes | yes | no | yes | `403 auth.scope.missing` | `404 grades.answer.not_found` | Owned answer only | Current permission exists and is seeded. |
| 20 | Classroom Submission Review | `assignments/teacher-classroom-submission-review.controller.ts` | PUT | `/api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/answers/review` | `bulkReviewAnswers` | `BulkReviewTeacherClassroomSubmissionAnswersUseCase` | Write | yes | none | `grades.submissions.review` | yes | yes | no | yes | `403 auth.scope.missing` | `404 grades.submission.not_found` | Owned answers only | Current permission exists and is seeded. |
| 21 | Classroom Submission Review | `assignments/teacher-classroom-submission-review.controller.ts` | POST | `/api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/review/finalize` | `finalizeReview` | `FinalizeTeacherClassroomSubmissionReviewUseCase` | Action | yes | none | `grades.submissions.review` | yes | yes | no | yes | `403 auth.scope.missing` | `404 grades.submission.not_found` | Owned submission only | Current permission exists and is seeded. |
| 22 | Classroom Submission Review | `assignments/teacher-classroom-submission-review.controller.ts` | POST | `/api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/sync-grade-item` | `syncGradeItem` | `SyncTeacherClassroomSubmissionGradeItemUseCase` | Action | yes | none | `grades.items.manage` | yes | yes | no | yes | `403 auth.scope.missing` | `404 grades.submission.not_found` | Owned grade item sync | Current permission exists and is seeded. |
| 23 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | GET | `/api/v1/teacher/homeworks/dashboard` | `getDashboard` | `GetTeacherHomeworksDashboardUseCase` | Read | yes | none | `homework.assignments.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty owned list | Owned homework aggregates | Add existing permission to Teacher role. |
| 24 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | GET | `/api/v1/teacher/homeworks/classes/:classId/assignments` | `listAssignments` | `ListTeacherHomeworkAssignmentsUseCase` | Read | yes | none | `homework.assignments.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Owned homework list | Add existing permission to Teacher role. |
| 25 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | POST | `/api/v1/teacher/homeworks/classes/:classId/assignments` | `createAssignment` | `CreateTeacherHomeworkAssignmentUseCase` | Write | yes | none | `homework.assignments.manage` | yes | yes | no | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Owned class authoring | Add existing permission to Teacher role. |
| 26 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | GET | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId` | `getAssignment` | `GetTeacherHomeworkAssignmentUseCase` | Read | yes | none | `homework.assignments.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | Owned homework only | Add existing permission to Teacher role. |
| 27 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | PATCH | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId` | `updateAssignment` | `UpdateTeacherHomeworkAssignmentUseCase` | Write | yes | none | `homework.assignments.manage` | yes | yes | no | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | Owned homework only | Add existing permission to Teacher role. |
| 28 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | POST | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/publish` | `publishAssignment` | `PublishTeacherHomeworkAssignmentUseCase` | Action | yes | none | `homework.assignments.manage` | yes | yes | no | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | Owned homework only | Add existing permission to Teacher role. |
| 29 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | POST | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/close` | `closeAssignment` | `CloseTeacherHomeworkAssignmentUseCase` | Action | yes | none | `homework.assignments.manage` | yes | yes | no | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | Owned homework only | Add existing permission to Teacher role. |
| 30 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | POST | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/cancel` | `cancelAssignment` | `CancelTeacherHomeworkAssignmentUseCase` | Action | yes | none | `homework.assignments.manage` | yes | yes | no | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | Owned homework only | Add existing permission to Teacher role. |
| 31 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | GET | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/targets` | `listTargets` | `ListTeacherHomeworkTargetsUseCase` | Read | yes | none | `homework.targets.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | Owned targets only | Add existing permission to Teacher role. |
| 32 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | POST | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/targets/resolve` | `resolveTargets` | `ResolveTeacherHomeworkTargetsUseCase` | Action | yes | none | `homework.targets.manage` | yes | yes | no | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | Owned targets only | Add existing permission to Teacher role. |
| 33 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | GET | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/grade-sync` | `getGradeSyncStatus` | `GetTeacherHomeworkGradeSyncStatusUseCase` | Read | yes | none | `homework.grade_sync.view` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | Owned sync status | Add granular homework permission. |
| 34 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | POST | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/grade-sync` | `syncAssignmentToGrades` | `SyncTeacherHomeworkAssignmentToGradesUseCase` | Action | yes | none | `homework.grade_sync.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | Owned grade sync | Add granular homework permission. |
| 35 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | GET | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions` | `listQuestions` | `ListTeacherHomeworkQuestionsUseCase` | Read | yes | none | `homework.questions.view` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | Owned questions only | Add granular homework permission. |
| 36 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | POST | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions` | `createQuestion` | `CreateTeacherHomeworkQuestionUseCase` | Write | yes | none | `homework.questions.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | Owned questions only | Add granular homework permission. |
| 37 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | GET | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId` | `getQuestion` | `GetTeacherHomeworkQuestionUseCase` | Read | yes | none | `homework.questions.view` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.question.not_found` | Owned question only | Add granular homework permission. |
| 38 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | PATCH | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId` | `updateQuestion` | `UpdateTeacherHomeworkQuestionUseCase` | Write | yes | none | `homework.questions.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.question.not_found` | Owned question only | Add granular homework permission. |
| 39 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | PATCH | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/reorder` | `reorderQuestion` | `ReorderTeacherHomeworkQuestionUseCase` | Action | yes | none | `homework.questions.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.question.not_found` | Owned question only | Add granular homework permission. |
| 40 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | DELETE | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId` | `deleteQuestion` | `DeleteTeacherHomeworkQuestionUseCase` | Write | yes | none | `homework.questions.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.question.not_found` | Owned question only | Add granular homework permission. |
| 41 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | POST | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/options` | `createOption` | `CreateTeacherHomeworkQuestionOptionUseCase` | Write | yes | none | `homework.questions.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.question.not_found` | Owned option parent only | Add granular homework permission. |
| 42 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | PATCH | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/options/:optionId` | `updateOption` | `UpdateTeacherHomeworkQuestionOptionUseCase` | Write | yes | none | `homework.questions.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.option.not_found` | Owned option only | Add granular homework permission. |
| 43 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | PATCH | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/options/:optionId/reorder` | `reorderOption` | `ReorderTeacherHomeworkQuestionOptionUseCase` | Action | yes | none | `homework.questions.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.option.not_found` | Owned option only | Add granular homework permission. |
| 44 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | DELETE | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/options/:optionId` | `deleteOption` | `DeleteTeacherHomeworkQuestionOptionUseCase` | Write | yes | none | `homework.questions.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.option.not_found` | Owned option only | Add granular homework permission. |
| 45 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | GET | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments` | `listAttachments` | `ListTeacherHomeworkAttachmentsUseCase` | Read | yes | none | `homework.attachments.view` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | No storage internals | Add granular homework permission. |
| 46 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | POST | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments` | `createAttachment` | `CreateTeacherHomeworkAttachmentUseCase` | Write | yes | none | `homework.attachments.manage`, `files.uploads.manage` | mixed | yes | yes | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | File ID only | Keep upload separate from attachment manage. |
| 47 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | PATCH | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments/:attachmentId` | `updateAttachment` | `UpdateTeacherHomeworkAttachmentUseCase` | Write | yes | none | `homework.attachments.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.attachment.not_found` | No storage internals | Add granular homework permission. |
| 48 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | PATCH | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments/:attachmentId/reorder` | `reorderAttachment` | `ReorderTeacherHomeworkAttachmentUseCase` | Action | yes | none | `homework.attachments.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.attachment.not_found` | No storage internals | Add granular homework permission. |
| 49 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | DELETE | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments/:attachmentId` | `deleteAttachment` | `DeleteTeacherHomeworkAttachmentUseCase` | Write | yes | none | `homework.attachments.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.attachment.not_found` | No storage internals | Add granular homework permission. |
| 50 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | GET | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions` | `listSubmissions` | `ListTeacherHomeworkSubmissionsUseCase` | Read | yes | none | `homework.submissions.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 homework.assignment.not_found` | Owned submissions only | Add existing permission to Teacher role. |
| 51 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | GET | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId` | `getSubmission` | `GetTeacherHomeworkSubmissionUseCase` | Read | yes | none | `homework.submissions.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 homework.submission.not_found` | Owned submission only | Add existing permission to Teacher role. |
| 52 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | GET | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers` | `listSubmissionAnswers` | `ListTeacherHomeworkSubmissionAnswersUseCase` | Read | yes | none | `homework.submissions.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 homework.submission.not_found` | Owned answers only | Add existing permission to Teacher role. |
| 53 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | PATCH | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers/:answerId/review` | `reviewSubmissionAnswer` | `ReviewTeacherHomeworkSubmissionAnswerUseCase` | Write | yes | none | `homework.submissions.review` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.answer.not_found` | Owned answer only | Add granular homework permission. |
| 54 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | PUT | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers/review` | `bulkReviewSubmissionAnswers` | `BulkReviewTeacherHomeworkSubmissionAnswersUseCase` | Write | yes | none | `homework.submissions.review` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.submission.not_found` | Owned answers only | Add granular homework permission. |
| 55 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | GET | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/attachments` | `listSubmissionAttachments` | `ListTeacherHomeworkSubmissionAttachmentsUseCase` | Read | yes | none | `homework.submissions.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 homework.submission.not_found` | No storage internals | Add existing permission to Teacher role. |
| 56 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | POST | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/review` | `reviewSubmission` | `ReviewTeacherHomeworkSubmissionUseCase` | Write | yes | none | `homework.submissions.review` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.submission.not_found` | Owned submission only | Add granular homework permission. |
| 57 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | PATCH | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/review` | `patchReviewSubmission` | `ReviewTeacherHomeworkSubmissionUseCase` | Write | yes | none | `homework.submissions.review` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.submission.not_found` | Owned submission only | Same as POST review. |
| 58 | Homeworks | `homeworks/teacher-homeworks.controller.ts` | POST | `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/grade-sync` | `syncSubmissionToGrades` | `SyncTeacherHomeworkSubmissionToGradesUseCase` | Action | yes | none | `homework.grade_sync.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 homework.submission.not_found` | Owned grade sync | Add granular homework permission. |
| 59 | Tasks | `tasks/teacher-tasks.controller.ts` | GET | `/api/v1/teacher/tasks/dashboard` | `getDashboard` | `GetTeacherTasksDashboardUseCase` | Read | yes | none | `reinforcement.tasks.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty owned list | Owned task aggregates | Current permission exists and is seeded. |
| 60 | Tasks | `tasks/teacher-tasks.controller.ts` | GET | `/api/v1/teacher/tasks` | `listTasks` | `ListTeacherTasksUseCase` | Read | yes | none | `reinforcement.tasks.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty owned list | Owned task list | Current permission exists and is seeded. |
| 61 | Tasks | `tasks/teacher-tasks.controller.ts` | GET | `/api/v1/teacher/tasks/selectors` | `getSelectors` | `GetTeacherTaskSelectorsUseCase` | Read | yes | none | `reinforcement.tasks.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty owned list | Owned selector values | Do not require broad template permission unless templates are exposed. |
| 62 | Tasks | `tasks/teacher-tasks.controller.ts` | POST | `/api/v1/teacher/tasks` | `createTask` | `CreateTeacherTaskUseCase` | Write | yes | none | `reinforcement.tasks.manage` | yes | yes | no | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Owned students only | Current permission exists and is seeded. |
| 63 | Tasks | `tasks/teacher-tasks.controller.ts` | GET | `/api/v1/teacher/tasks/:taskId` | `getTask` | `GetTeacherTaskUseCase` | Read | yes | none | `reinforcement.tasks.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 reinforcement.task.not_found` | Owned task only | Current permission exists and is seeded. |
| 64 | Task Review Queue | `tasks/teacher-task-review-queue.controller.ts` | GET | `/api/v1/teacher/tasks/review-queue` | `listReviewQueue` | `ListTeacherTaskReviewQueueUseCase` | Read | yes | none | `reinforcement.reviews.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty owned list | Owned review queue | Current permission exists and is seeded. |
| 65 | Task Review Queue | `tasks/teacher-task-review-queue.controller.ts` | GET | `/api/v1/teacher/tasks/review-queue/:submissionId` | `getReviewSubmission` | `GetTeacherTaskReviewSubmissionUseCase` | Read | yes | none | `reinforcement.reviews.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 reinforcement.review.not_found` | Owned submission only | Current permission exists and is seeded. |
| 66 | Task Review Queue | `tasks/teacher-task-review-queue.controller.ts` | POST | `/api/v1/teacher/tasks/review-queue/:submissionId/approve` | `approveReviewSubmission` | `ApproveTeacherTaskReviewSubmissionUseCase` | Action | yes | none | `reinforcement.reviews.manage` | yes | yes | no | yes | `403 auth.scope.missing` | `404 reinforcement.review.not_found` | Owned submission only | Current permission exists and is seeded. |
| 67 | Task Review Queue | `tasks/teacher-task-review-queue.controller.ts` | POST | `/api/v1/teacher/tasks/review-queue/:submissionId/reject` | `rejectReviewSubmission` | `RejectTeacherTaskReviewSubmissionUseCase` | Action | yes | none | `reinforcement.reviews.manage` | yes | yes | no | yes | `403 auth.scope.missing` | `404 reinforcement.review.not_found` | Owned submission only | Current permission exists and is seeded. |
| 68 | XP | `xp/teacher-xp.controller.ts` | GET | `/api/v1/teacher/xp/dashboard` | `getDashboard` | `GetTeacherXpDashboardUseCase` | Read | yes | none | `reinforcement.xp.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty owned list | Owned XP aggregates | Current permission exists and is seeded. |
| 69 | XP | `xp/teacher-xp.controller.ts` | GET | `/api/v1/teacher/xp/classes/:classId` | `getClassXp` | `GetTeacherClassXpUseCase` | Read | yes | none | `reinforcement.xp.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Owned class XP | Current permission exists and is seeded. |
| 70 | XP | `xp/teacher-xp.controller.ts` | GET | `/api/v1/teacher/xp/students/:studentId` | `getStudentXp` | `GetTeacherStudentXpUseCase` | Read | yes | none | `reinforcement.xp.view`, `students.records.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 student.not_found` | Owned student XP | Current permissions exist and are seeded. |
| 71 | XP | `xp/teacher-xp.controller.ts` | GET | `/api/v1/teacher/xp/students/:studentId/history` | `listStudentXpHistory` | `ListTeacherStudentXpHistoryUseCase` | Read | yes | none | `reinforcement.xp.view`, `students.records.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 student.not_found` | Owned student XP history | Current permissions exist and are seeded. |
| 72 | Messages | `messages/teacher-messages.controller.ts` | GET | `/api/v1/teacher/messages/contacts` | `listContacts` | `ListTeacherMessageContactsUseCase` | Read | yes | none | `communication.contacts.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty contact list | Owned class contacts only | Add existing permission to Teacher role. |
| 73 | Messages | `messages/teacher-messages.controller.ts` | GET | `/api/v1/teacher/messages/conversations` | `listConversations` | `ListTeacherMessageConversationsUseCase` | Read | yes | none | `communication.conversations.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty conversation list | Teacher participant only | Current permission exists and is seeded. |
| 74 | Messages | `messages/teacher-messages.controller.ts` | GET | `/api/v1/teacher/messages/conversations/:conversationId` | `getConversation` | `GetTeacherMessageConversationUseCase` | Read | yes | none | `communication.conversations.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.conversation.not_found` | Teacher participant only | Current permission exists and is seeded. |
| 75 | Messages | `messages/teacher-messages.controller.ts` | GET | `/api/v1/teacher/messages/conversations/:conversationId/search` | `searchMessages` | `SearchTeacherConversationMessagesUseCase` | Read | yes | none | `communication.messages.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.conversation.not_found` | Hidden/deleted filtered | Current permission exists and is seeded. |
| 76 | Messages | `messages/teacher-messages.controller.ts` | GET | `/api/v1/teacher/messages/conversations/:conversationId/messages` | `listMessages` | `ListTeacherConversationMessagesUseCase` | Read | yes | none | `communication.messages.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.conversation.not_found` | Teacher participant only | Current permission exists and is seeded. |
| 77 | Messages | `messages/teacher-messages.controller.ts` | GET | `/api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/readers` | `getMessageReaders` | `GetTeacherMessageReadersUseCase` | Read | yes | none | `communication.messages.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.message.not_found` | Participant reader info only | Current permission exists and is seeded. |
| 78 | Messages | `messages/teacher-messages.controller.ts` | GET | `/api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/info` | `getMessageInfo` | `GetTeacherMessageInfoUseCase` | Read | yes | none | `communication.messages.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.message.not_found` | Message metadata only | Current permission exists and is seeded. |
| 79 | Messages | `messages/teacher-messages.controller.ts` | GET | `/api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download` | `downloadAttachment` | `GetTeacherMessageAttachmentDownloadUrlUseCase` | Read | yes | none | `communication.messages.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.attachment.not_found` | Signed URL after ownership | Do not require generic `files.downloads.view`. |
| 80 | Messages | `messages/teacher-messages.controller.ts` | GET | `/api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview` | `previewAttachment` | `GetTeacherMessageAttachmentDownloadUrlUseCase` | Read | yes | none | `communication.messages.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.attachment.not_found` | Signed URL after ownership | Do not require generic `files.downloads.view`. |
| 81 | Messages | `messages/teacher-messages.controller.ts` | POST | `/api/v1/teacher/messages/conversations` | `createConversation` | `CreateTeacherMessageConversationUseCase` | Write | yes | none | `communication.conversations.create` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.contact.not_found` | Owned contacts only | Current permission exists and is seeded. |
| 82 | Messages | `messages/teacher-messages.controller.ts` | POST | `/api/v1/teacher/messages/conversations/:conversationId/messages` | `sendMessage` | `SendTeacherConversationMessageUseCase` | Write | yes | none | `communication.messages.send` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.conversation.not_found` | Teacher participant only | Current permission exists and is seeded. |
| 83 | Messages | `messages/teacher-messages.controller.ts` | POST | `/api/v1/teacher/messages/conversations/:conversationId/read` | `markRead` | `MarkTeacherConversationReadUseCase` | Action | yes | none | `communication.conversations.read` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.conversation.not_found` | Teacher participant only | Add existing permission to Teacher role. |
| 84 | Notifications | `notifications/teacher-notifications.controller.ts` | GET | `/api/v1/teacher/notifications` | `listNotifications` | `ListTeacherNotificationsUseCase` | Read | yes | none | `communication.notifications.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty recipient list | Current teacher only | Add existing permission to Teacher role. |
| 85 | Notifications | `notifications/teacher-notifications.controller.ts` | GET | `/api/v1/teacher/notifications/summary` | `getSummary` | `GetTeacherNotificationsSummaryUseCase` | Read | yes | none | `communication.notifications.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty summary | Current teacher only | Add existing permission to Teacher role. |
| 86 | Notifications | `notifications/teacher-notifications.controller.ts` | POST | `/api/v1/teacher/notifications/read-all` | `markAllRead` | `MarkAllTeacherNotificationsReadUseCase` | Action | yes | none | `communication.notifications.read` | yes | yes | no | yes | `403 auth.scope.missing` | no-op outside recipient | Current teacher only | Add existing permission to Teacher role. |
| 87 | Notifications | `notifications/teacher-notifications.controller.ts` | GET | `/api/v1/teacher/notifications/preferences` | `getPreferences` | `GetTeacherNotificationPreferencesUseCase` | Read | yes | none | `communication.notifications.preferences.manage` | yes | yes | no | yes | `403 auth.scope.missing` | current teacher preferences only | Current teacher only | Existing catalog has manage, no read-only preference permission. |
| 88 | Notifications | `notifications/teacher-notifications.controller.ts` | PATCH | `/api/v1/teacher/notifications/preferences` | `updatePreferences` | `UpdateTeacherNotificationPreferencesUseCase` | Write | yes | none | `communication.notifications.preferences.manage` | yes | yes | no | yes | `403 auth.scope.missing` | current teacher preferences only | Current teacher only | Add existing permission to Teacher role. |
| 89 | Notifications | `notifications/teacher-notifications.controller.ts` | POST | `/api/v1/teacher/notifications/device-tokens` | `registerDeviceToken` | `RegisterTeacherDeviceTokenUseCase` | Write | yes | none | `app.device_tokens.manage` | yes | yes | no | yes | `403 auth.scope.missing` | current teacher token only | No token cross-user access | Add existing permission to Teacher role. |
| 90 | Notifications | `notifications/teacher-notifications.controller.ts` | DELETE | `/api/v1/teacher/notifications/device-tokens/current` | `unregisterCurrentDeviceToken` | `UnregisterTeacherDeviceTokenUseCase` | Write | yes | none | `app.device_tokens.manage` | yes | yes | no | yes | `403 auth.scope.missing` | current teacher token only | No token cross-user access | Add existing permission to Teacher role. |
| 91 | Notifications | `notifications/teacher-notifications.controller.ts` | GET | `/api/v1/teacher/notifications/:notificationId` | `getNotification` | `GetTeacherNotificationUseCase` | Read | yes | none | `communication.notifications.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.notification.not_found` | Current recipient only | Add existing permission to Teacher role. |
| 92 | Notifications | `notifications/teacher-notifications.controller.ts` | POST | `/api/v1/teacher/notifications/:notificationId/read` | `markRead` | `MarkTeacherNotificationReadUseCase` | Action | yes | none | `communication.notifications.read` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.notification.not_found` | Current recipient only | Add existing permission to Teacher role. |
| 93 | Notifications | `notifications/teacher-notifications.controller.ts` | POST | `/api/v1/teacher/notifications/:notificationId/archive` | `archive` | `ArchiveTeacherNotificationUseCase` | Action | yes | none | `communication.notifications.archive` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.notification.not_found` | Current recipient only | Add existing permission to Teacher role. |
| 94 | Announcements | `announcements/teacher-announcements.controller.ts` | GET | `/api/v1/teacher/announcements` | `listAnnouncements` | `ListTeacherAnnouncementsUseCase` | Read | yes | none | `communication.announcements.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty owned list | Teacher-owned announcements | Add existing read permission if core routes remain safe. |
| 95 | Announcements | `announcements/teacher-announcements.controller.ts` | GET | `/api/v1/teacher/announcements/:announcementId` | `getAnnouncement` | `GetTeacherAnnouncementUseCase` | Read | yes | none | `communication.announcements.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 communication.announcement.not_found` | Teacher-owned announcement | Add existing read permission if core routes remain safe. |
| 96 | Announcements | `announcements/teacher-announcements.controller.ts` | POST | `/api/v1/teacher/announcements` | `createAnnouncement` | `CreateTeacherAnnouncementUseCase` | Write | yes | none | `teacher.announcements.manage` preferred | no | human decision | yes | `403 auth.scope.missing` | `404 teacher_app.allocation.not_found` | Owned target audience | Human decision: avoid broad manage by default. |
| 97 | Announcements | `announcements/teacher-announcements.controller.ts` | PATCH | `/api/v1/teacher/announcements/:announcementId` | `updateAnnouncement` | `UpdateTeacherAnnouncementUseCase` | Write | yes | none | `teacher.announcements.manage` preferred | no | human decision | yes | `403 auth.scope.missing` | `404 communication.announcement.not_found` | Teacher-owned announcement | Human decision: avoid broad manage by default. |
| 98 | Announcements | `announcements/teacher-announcements.controller.ts` | POST | `/api/v1/teacher/announcements/:announcementId/publish` | `publishAnnouncement` | `PublishTeacherAnnouncementUseCase` | Action | yes | none | `teacher.announcements.manage` preferred | no | human decision | yes | `403 auth.scope.missing` | `404 communication.announcement.not_found` | Teacher-owned announcement | Human decision: avoid broad manage by default. |
| 99 | Announcements | `announcements/teacher-announcements.controller.ts` | POST | `/api/v1/teacher/announcements/:announcementId/archive` | `archiveAnnouncement` | `ArchiveTeacherAnnouncementUseCase` | Action | yes | none | `teacher.announcements.manage` preferred | no | human decision | yes | `403 auth.scope.missing` | `404 communication.announcement.not_found` | Teacher-owned announcement | Human decision: avoid broad manage by default. |
| 100 | Profile | `profile/teacher-profile.controller.ts` | GET | `/api/v1/teacher/profile` | `getProfile` | `GetTeacherProfileUseCase` | Read | yes | none | `teacher.profile.view` | no | yes | yes | `403 auth.scope.missing` | `403 teacher_app.forbidden` | Self profile only | Add narrow app aggregate permission. |
| 101 | Profile | `profile/teacher-profile.controller.ts` | GET | `/api/v1/teacher/profile/employment` | `getEmploymentProfile` | `GetTeacherEmploymentProfileUseCase` | Read | yes | none | `teacher.profile.view` | no | yes | yes | `403 auth.scope.missing` | `403 teacher_app.forbidden` | Self employment summary | Add narrow app aggregate permission. |
| 102 | Settings | `settings/teacher-settings.controller.ts` | GET | `/api/v1/teacher/settings/about` | `getAbout` | `GetTeacherSettingsAboutUseCase` | Read | yes | none | `teacher.settings.view` | no | yes | yes | `403 auth.scope.missing` | `403 teacher_app.forbidden` | App/school about only | Add narrow app aggregate permission. |
| 103 | Settings | `settings/teacher-settings.controller.ts` | GET | `/api/v1/teacher/settings/contact` | `getContact` | `GetTeacherSettingsContactUseCase` | Read | yes | none | `teacher.settings.view` | no | yes | yes | `403 auth.scope.missing` | `403 teacher_app.forbidden` | School contact only | Add narrow app aggregate permission. |
| 104 | Schedule | `schedule/teacher-schedule.controller.ts` | GET | `/api/v1/teacher/schedule` | `getDailySchedule` | `GetTeacherDailyScheduleUseCase` | Read | yes | none | `academics.timetable.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty owned schedule | Owned teacher timetable | Add existing permission to Teacher role. |
| 105 | Schedule | `schedule/teacher-schedule.controller.ts` | GET | `/api/v1/teacher/schedule/week` | `getWeeklySchedule` | `GetTeacherWeeklyScheduleUseCase` | Read | yes | none | `academics.timetable.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty owned schedule | Owned teacher timetable | Add existing permission to Teacher role. |
| 106 | Calendar | `calendar/teacher-calendar.controller.ts` | GET | `/api/v1/teacher/calendar/events` | `listEvents` | `ListTeacherCalendarEventsUseCase` | Read | yes | none | `academics.calendar.view` | yes | yes | no | yes | `403 auth.scope.missing` | empty visible events | Owned/school-visible events | Add existing permission to Teacher role. |
| 107 | Calendar | `calendar/teacher-calendar.controller.ts` | GET | `/api/v1/teacher/calendar/events/:eventId` | `getEvent` | `GetTeacherCalendarEventUseCase` | Read | yes | none | `academics.calendar.view` | yes | yes | no | yes | `403 auth.scope.missing` | `404 calendar.event.not_found` | Owned/school-visible event | Add existing permission to Teacher role. |
| 108 | Lesson Preparation | `lesson-preparation/teacher-lesson-preparation.controller.ts` | GET | `/api/v1/teacher/lesson-preparation/today` | `getToday` | `GetTeacherLessonPreparationTodayUseCase` | Read | yes | none | `teacher.lesson_preparation.view`, `academics.lesson_plans.view` | mixed | yes | yes | yes | `403 auth.scope.missing` | empty owned lessons | Owned lesson plan items | Add narrow app permission plus existing lesson view. |
| 109 | Lesson Preparation | `lesson-preparation/teacher-lesson-preparation.controller.ts` | GET | `/api/v1/teacher/lesson-preparation/week` | `getWeek` | `GetTeacherLessonPreparationWeekUseCase` | Read | yes | none | `teacher.lesson_preparation.view`, `academics.lesson_plans.view` | mixed | yes | yes | yes | `403 auth.scope.missing` | empty owned lessons | Owned lesson plan items | Add narrow app permission plus existing lesson view. |
| 110 | Lesson Preparation | `lesson-preparation/teacher-lesson-preparation.controller.ts` | GET | `/api/v1/teacher/lesson-preparation/:lessonPlanItemId` | `getDetail` | `GetTeacherLessonPreparationDetailUseCase` | Read | yes | none | `teacher.lesson_preparation.view`, `academics.lesson_plans.view`, `academics.curriculum.view` | mixed | yes | yes | yes | `403 auth.scope.missing` | `404 teacher_app.lesson_preparation.not_found` | Safe file metadata only | Add narrow app permission plus existing content views. |
| 111 | Lesson Preparation | `lesson-preparation/teacher-lesson-preparation.controller.ts` | PATCH | `/api/v1/teacher/lesson-preparation/:lessonPlanItemId/status` | `updateStatus` | `UpdateTeacherLessonPreparationStatusUseCase` | Action | yes | none | `teacher.lesson_preparation.status.manage` | no | yes | yes | yes | `403 auth.scope.missing` | `404 teacher_app.lesson_preparation.not_found` | Status only | Do not use broad `academics.lesson_plans.manage`. |

Route matrix count: **111 handlers**.

Current `@RequiredPermissions(...)` coverage count: **0 handlers**.

## 8. Permission Naming and Design Decisions

### Teacher aggregate routes

Use `teacher.*` permissions for Teacher-App-specific aggregate routes whose data is composed from several domains:

- `teacher.home.view`
- `teacher.classes.view`
- `teacher.classroom.view`
- `teacher.profile.view`
- `teacher.settings.view`
- `teacher.lesson_preparation.view`
- `teacher.lesson_preparation.status.manage`

Reasoning:

- These routes are app-facing read models and compositions.
- They should not force broad domain permissions just because the presenter joins several domain fragments.
- Narrow `teacher.*` permissions make the Teacher role easier to reason about and keep school-admin domain permissions separate.

### Homework permissions

Use existing homework permissions where they already map cleanly:

- `homework.assignments.view`
- `homework.assignments.manage`
- `homework.targets.view`
- `homework.targets.manage`
- `homework.submissions.view`

Add new granular permissions for missing Teacher authoring/review capabilities:

- `homework.questions.view`
- `homework.questions.manage`
- `homework.attachments.view`
- `homework.attachments.manage`
- `homework.submissions.review`
- `homework.grade_sync.view`
- `homework.grade_sync.manage`

Do not reuse student self-service permissions for Teacher actions:

- Do not use `homework.submissions.save`.
- Do not use `homework.submissions.submit`.
- Do not use `homework.answers.manage`.
- Do not use `homework.submission_attachments.manage`.

### Lesson preparation permissions

Use:

- `teacher.lesson_preparation.view` for Teacher App lesson preparation read routes.
- `teacher.lesson_preparation.status.manage` for Teacher App status transitions.
- `academics.lesson_plans.view` and `academics.curriculum.view` where lesson/curriculum content is exposed.

Do not use `academics.lesson_plans.manage` for status updates. That permission is broader than the Teacher App status workflow.

### Communication permissions

Use:

- `communication.contacts.view`
- `communication.conversations.view`
- `communication.conversations.create`
- `communication.conversations.read`
- `communication.messages.view`
- `communication.messages.send`

Defer or remove from default Teacher:

- `communication.conversations.manage`
- `communication.participants.manage`
- `communication.messages.edit`
- `communication.messages.delete`
- `communication.messages.report`

Teacher App currently has no edit/delete/report/participant-management routes. Keeping those in the default Teacher role grants access to broader core communication operations if such core routes are mounted for school users.

### Announcement permissions

Read routes can use `communication.announcements.view` if generic communication announcement read routes are safe under existing school/role constraints.

Management routes should not use `communication.announcements.manage` by default. A safer design is:

- Add `teacher.announcements.manage`.
- Decorate only Teacher App announcement create/update/publish/archive routes with that narrow permission.
- Keep ownership checks in Teacher App use cases.

This requires human product/security approval because it decides whether a default Teacher can author announcements to students/parents in owned classes.

### File permissions

Keep:

- `files.uploads.manage` for upload creation flows.

Do not add:

- `files.downloads.view`

Reasoning:

`files.downloads.view` unlocks the generic file download endpoint for any scoped file visible at school scope. Teacher App downloads should pass through app-owned redirect routes that verify assignment/conversation/lesson visibility before a signed URL is issued.

## 9. Over-Grant Analysis

### Major over-grant candidates

`communication.conversations.manage`

- Current Teacher App need: none.
- Risk: can enable broad core conversation mutation such as update/archive/close/reopen.
- Recommendation: remove from default Teacher or defer until a Teacher App route explicitly needs it and has ownership checks.

`communication.participants.manage`

- Current Teacher App need: none.
- Risk: can enable participant add/remove/invite flows outside the Teacher App contact boundary.
- Recommendation: remove from default Teacher or defer.

`communication.messages.edit`

- Current Teacher App need: none.
- Risk: can enable generic message editing where mounted.
- Recommendation: remove from default Teacher or defer.

`communication.messages.delete`

- Current Teacher App need: none.
- Risk: can enable generic message deletion where mounted.
- Recommendation: remove from default Teacher or defer.

`communication.messages.report`

- Current Teacher App need: none.
- Risk: not a management escalation, but still not represented by current Teacher App routes.
- Recommendation: defer unless a Teacher App message-report route is added.

`reinforcement.rewards.redemptions.request`

- Current Teacher App need: none.
- Risk: appears to be a student self-service reward action, not a Teacher App action.
- Recommendation: remove from default Teacher unless another approved Teacher workflow requires it.

### Secondary over-grant candidates for current Teacher App coverage

These may belong to future Teacher features or non-Teacher-App surfaces, but they are not required by the 111 current Teacher App routes:

- `reinforcement.hero.view`
- `reinforcement.hero.progress.view`
- `reinforcement.rewards.view`
- `reinforcement.rewards.redemptions.view`
- `reinforcement.templates.view`
- `grades.assessments.manage`
- `grades.questions.manage`
- `grades.analytics.view`
- `grades.snapshots.view`
- `behavior.overview.view`
- `behavior.categories.view`
- `behavior.records.view`
- `behavior.records.create`
- `behavior.points.view`

Recommendation:

- Do not classify these as required for Teacher App route coverage.
- Review them separately as default Teacher role policy for non-Teacher-App or future-phase capabilities.

## 10. Forbidden or High-Risk Permissions for Default Teacher

Default Teacher should not receive these categories without explicit product/security approval:

- Platform administration permissions.
- Tenant/system settings permissions.
- Dashboard/admin analytics permissions not tied to Teacher App.
- Admissions administration permissions.
- Student management/admin permissions such as create/update/delete/import.
- Student document or medical access such as `students.documents.view` or `students.medical.view` unless a custom school role explicitly requires it.
- Grade approval, grade lock, transcript, or school-admin grading controls.
- Finance, billing, wallet, marketplace, HR, or advanced analytics permissions, which are outside V1 scope.
- Broad communication admin/moderation permissions.
- `communication.notifications.manage`, which is broader than self notification read/archive/preferences.
- Student homework self-service permissions: `homework.submissions.save`, `homework.submissions.submit`, `homework.answers.manage`, `homework.submission_attachments.manage`.
- Student reinforcement self-service actions such as reward redemption requests and hero mission actions.
- `files.downloads.view` until the generic file endpoint enforces ownership beyond school scope.

High-risk human-decision items:

- `communication.announcements.manage`: broad existing permission. Prefer a new `teacher.announcements.manage` if Teacher announcement management is approved.
- Generic message attachment management: do not grant `communication.messages.attachments.manage` for default Teacher unless Teacher App gets explicit attachment management routes and ownership tests.
- Communication edit/delete/manage actions: do not grant by default without mounted-route and ownership review.

## 11. Recommended Final `TEACHER_PERMISSIONS` Draft

This is a proposed TEACH-PERM-1A target, not an implemented change.

It assumes:

- Teacher announcement read is approved via `communication.announcements.view`.
- Teacher announcement management remains a human decision.
- Generic `files.downloads.view` remains excluded.
- Broad communication manage/edit/delete permissions are removed or deferred.
- Current behavior/hero/reward/admin-like extras are reviewed separately and not counted as required for current Teacher App route coverage.

### Draft permissions

```ts
[
  'app.device_tokens.manage',
  'academics.calendar.view',
  'academics.curriculum.view',
  'academics.lesson_plans.view',
  'academics.timetable.view',
  'attendance.entries.manage',
  'attendance.sessions.manage',
  'attendance.sessions.submit',
  'attendance.sessions.view',
  'communication.announcements.view',
  'communication.contacts.view',
  'communication.conversations.create',
  'communication.conversations.read',
  'communication.conversations.view',
  'communication.messages.send',
  'communication.messages.view',
  'communication.notifications.archive',
  'communication.notifications.preferences.manage',
  'communication.notifications.read',
  'communication.notifications.view',
  'files.uploads.manage',
  'grades.assessments.view',
  'grades.gradebook.view',
  'grades.items.manage',
  'grades.items.view',
  'grades.questions.view',
  'grades.submissions.review',
  'grades.submissions.view',
  'homework.assignments.manage',
  'homework.assignments.view',
  'homework.attachments.manage',
  'homework.attachments.view',
  'homework.grade_sync.manage',
  'homework.grade_sync.view',
  'homework.questions.manage',
  'homework.questions.view',
  'homework.submissions.review',
  'homework.submissions.view',
  'homework.targets.manage',
  'homework.targets.view',
  'reinforcement.reviews.manage',
  'reinforcement.reviews.view',
  'reinforcement.tasks.manage',
  'reinforcement.tasks.view',
  'reinforcement.xp.view',
  'students.records.view',
  'teacher.classroom.view',
  'teacher.classes.view',
  'teacher.home.view',
  'teacher.lesson_preparation.status.manage',
  'teacher.lesson_preparation.view',
  'teacher.profile.view',
  'teacher.settings.view',
]
```

Draft count without announcement management: **53**.

If Teacher announcement management is approved, add one narrow permission:

```ts
'teacher.announcements.manage'
```

Draft count with narrow announcement management: **54**.

Do not use `communication.announcements.manage` for default Teacher unless humans explicitly accept the broader core-route implications and tests are added for every mounted route that permission unlocks.

## 12. Follow-Up Sprint Plan

### TEACH-PERM-1A - Catalog and Teacher role seed

Scope:

- Add missing catalog permissions.
- Update `TEACHER_PERMISSIONS`.
- Remove or defer confirmed over-grants.
- Keep seed changes only; no controller decorators yet unless explicitly bundled.

Files likely touched:

- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- Seed tests if present.

Forbidden:

- Do not add `files.downloads.view`.
- Do not add `communication.announcements.manage` unless approved.
- Do not add student self-service homework permissions.

Gates:

- Seed role count test.
- Permission catalog uniqueness test.

### TEACH-PERM-1B - Read-only Teacher App decorators

Scope:

- Add `@RequiredPermissions(...)` to read-only Teacher App routes.
- Focus on home, classes, classroom, profile, settings, schedule, calendar, lesson prep reads, grade reads, homework reads, task reads, XP reads, notifications reads, announcement reads, and message reads.

Forbidden:

- Do not change ownership logic.
- Do not expand response DTOs.

Gates:

- Missing-permission tests return `403 auth.scope.missing`.
- Ownership tests still return `404`/no-leak for cross-school and non-owned resources.

### TEACH-PERM-1C - Teacher App action decorators

Scope:

- Add `@RequiredPermissions(...)` to write/action routes for attendance submit, homework create/update/review/sync, task create/review, notifications actions, device tokens, messages send/read, and lesson status update.

Forbidden:

- Do not add broad communication manage/edit/delete permissions.
- Do not use student self-service homework permissions for Teacher actions.

Gates:

- Negative permission matrix for every action family.
- Existing ownership/security specs remain green.

### TEACH-PERM-1D - Announcement management decision implementation

Scope:

- Implement the human decision about Teacher announcement management.
- Preferred path: add `teacher.announcements.manage` and decorate only Teacher App announcement management routes.

Forbidden:

- Do not grant `communication.announcements.manage` by default without explicit approval.

Gates:

- Teacher can manage own Teacher-App announcements only.
- Teacher cannot manage school-wide/admin announcements.
- Cross-class/cross-school targets remain hidden.

### TEACH-PERM-1E - Generic file boundary hardening

Scope:

- Decide whether generic file download should be ownership-aware or remain excluded from default Teacher.
- Add Teacher-owned download redirect routes where needed for homework/lesson files.

Forbidden:

- Do not add `files.downloads.view` to default Teacher before ownership hardening.

Gates:

- Teacher cannot download arbitrary school-scoped files by ID.
- Teacher can download only authorized Teacher App attachments through app-owned routes.

### TEACH-PERM-1F - Final regression audit

Scope:

- Re-run route extraction.
- Verify every Teacher App handler has the intended `@RequiredPermissions(...)`.
- Verify Teacher role has every required permission and no confirmed over-grants.
- Update stale final closeout route count.

Gates:

- Route count matches current mounted Teacher App surface.
- Missing permission tests cover reads and actions.
- Ownership and no-leak tests pass.

## 13. Future Test Plan

### Unit or static tests

- Assert every Teacher App controller handler has `@RequiredPermissions(...)`.
- Assert no Teacher App handler uses forbidden permissions.
- Assert all recommended permissions exist in the catalog.
- Assert `TEACHER_PERMISSIONS` contains every permission required by Teacher App decorators.
- Assert default Teacher does not include `files.downloads.view`.
- Assert default Teacher does not include broad communication manage/edit/delete/participant permissions unless approved.

### Security tests

For every route family:

- Teacher with correct role permission succeeds for owned resources.
- Teacher missing the route permission receives `403 auth.scope.missing`.
- Teacher with permission but non-owned class/allocation/resource receives `404` or the established domain no-leak error.
- Cross-school resources remain invisible.
- Non-Teacher users cannot access Teacher App routes even if they have similar permissions.

### E2E tests

Update `test/e2e/teacher-app-final-closeout.e2e-spec.ts` because its static expected route list is stale. It currently reflects an older **87-route** surface and marks several routes absent that now exist. The current audited route surface is **111 handlers**.

Add or restore expected child lesson tests if that feature remains in scope:

- `test/security/tenancy.teacher-app-child-lessons.spec.ts`
- `test/e2e/teacher-app-child-lessons.e2e-spec.ts`

### File tests

- Teacher cannot use `GET /api/v1/files/:id/download` without `files.downloads.view`.
- Default Teacher role does not get `files.downloads.view`.
- Teacher-owned message attachment download/preview routes succeed only for conversations where the teacher is a participant.
- Homework and lesson file flows, if exposed, must go through Teacher-owned ownership checks before signed URLs are returned.

### Announcement tests

If Teacher announcement management is approved:

- Teacher can create/update/publish/archive only Teacher-App announcements targeted to owned classes.
- Teacher cannot manage school-wide announcements.
- Teacher cannot target non-owned classes.
- Teacher cannot edit announcements created by another teacher unless product explicitly approves co-owner semantics.

## 14. No-Leak Requirements

Future implementation and tests must preserve these no-leak requirements:

- No cross-school data.
- No non-owned class data.
- No non-owned student details.
- No hidden guardian or parent details beyond allowed contact presenters.
- No student medical or document data for default Teacher.
- No deleted, hidden, or archived records unless the route explicitly models them.
- No storage bucket names.
- No storage object keys.
- No internal file provider paths.
- No membership IDs, role IDs, or tenant internals unless explicitly part of a safe internal contract.
- No raw Prisma model shapes in app-facing responses.
- No route without `/api/v1/` prefix in tests.
- No broad generic file download permission for default Teacher.

## 15. Final Recommendation

`NEEDS HUMAN DECISION`

The Teacher App has a mature ownership model, but it does not yet have route-level permission enforcement. The next sprint should not jump directly to decorators without first adding the missing catalog permissions and deciding announcement management.

Recommended next sprint:

`TEACH-PERM-1A - Catalog and Teacher role seed`

Human decisions required before final closure:

1. Should default Teacher be allowed to create/update/publish/archive Teacher-App announcements?
2. If yes, should that use a new narrow `teacher.announcements.manage` permission instead of broad `communication.announcements.manage`? This audit recommends the narrow permission.
3. Should generic `files.downloads.view` remain excluded from default Teacher until ownership-aware generic file downloads exist? This audit recommends exclusion.
4. Should current broad communication permissions (`communication.conversations.manage`, `communication.participants.manage`, `communication.messages.edit`, `communication.messages.delete`) be removed from default Teacher now, or retained for approved non-Teacher-App surfaces?
5. Should behavior, hero, reward, and grades analytics/snapshot permissions remain in default Teacher for approved future/non-Teacher-App surfaces, or be deferred until routes exist?

Final verdict:

`NEEDS HUMAN DECISION`
