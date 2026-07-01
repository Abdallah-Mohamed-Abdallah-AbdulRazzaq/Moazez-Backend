# STU-PERM-0A - Student App Permission Coverage Audit

Documentation-only audit / decision lock.

## 1. Executive Summary

**Current finding**

The Student App backend has broad authentication, scope, user-type, active student, active enrollment, and ownership coverage, but the Student App controllers do not declare route-level `@RequiredPermissions()` decorators. The global `PermissionsGuard` is installed and working, but it intentionally allows a route when no required permissions are declared.

**Risk level**

High. The current Student role has only:

```ts
[
  'attendance.sessions.view',
  'grades.assessments.view',
  'reinforcement.tasks.view',
  'students.records.view',
]
```

That list is smaller than the real Student App surface. The app performs writes such as homework draft/save/submit, exam start/save/submit, task stage submission, reward redemption, hero mission progress actions, chat sending/read receipts, announcement reads, notification read/archive/preferences, device token registration, avatar upload/delete, and profile correction requests.

**Why this is not only a seed problem**

Adding permissions to `STUDENT_PERMISSIONS` alone will not protect the routes. `src/common/guards/permissions.guard.ts` returns `true` when a route has no `@RequiredPermissions()` metadata, and `src/common/decorators/required-permissions.decorator.ts` documents that omission means the handler only requires authentication and an active scope. The follow-up work must add both catalog/role coverage and route decorators.

**Why ownership checks are necessary but not enough**

Student App ownership checks prevent a student from seeing another student's rows or cross-school guessed IDs. They do not answer whether the student's active role is allowed to perform a capability at all. RBAC should gate the capability; ownership/visibility should then constrain the resource.

**Recommended implementation sequence**

1. `STU-PERM-1A` - add missing permission catalog entries and expand `STUDENT_PERMISSIONS`.
2. `STU-PERM-1B` - add read-only Student App decorators.
3. `STU-PERM-1C` - add homework and exam action decorators.
4. `STU-PERM-1D` - add reinforcement, rewards, and hero action decorators.
5. `STU-PERM-1E` - add communication, notifications, profile, device token, and file-flow decorators.
6. `STU-PERM-1F` - run security closeout and regression audit.

## 2. Current RBAC Mechanics

**Repo baseline**

Start commands confirmed:

```text
git status --short --untracked-files=all
<clean>

git log --oneline -10
bf7ad926 fix: make communication notification job ids bullmq safe
9865e56a docs: close student profile self-service
0f6caf79 feat: add student profile correction requests
a753cb2f docs: lock student profile correction requests
9d859484 docs: close student avatar foundation
f5dec700 feat: add student avatar upload foundation
6ab74f42 docs: lock student profile avatar decisions
358c5eda docs: audit student profile self-service
7606307e docs: close admissions document import track
55ad3ff9 feat: import admissions documents to student records
```

The current `HEAD` matches the expected stable baseline `bf7ad926`.

**Where permission catalog is seeded**

`prisma/seeds/01-permissions.seed.ts` defines `PERMISSIONS`, upserts each `Permission` by `code`, and exports `PERMISSION_CODES`.

**Where system roles are seeded**

`prisma/seeds/02-system-roles.seed.ts` imports `PERMISSION_CODES`, defines role permission arrays, and recreates `RolePermission` rows for the system roles.

**Current `STUDENT_PERMISSIONS`**

```ts
const STUDENT_PERMISSIONS = [
  'attendance.sessions.view',
  'grades.assessments.view',
  'reinforcement.tasks.view',
  'students.records.view',
];
```

**How `@RequiredPermissions()` works**

`src/common/decorators/required-permissions.decorator.ts` stores permission metadata under `moazez:required_permissions`. It accepts one or more string permission codes and can be applied at handler or class level.

**How `PermissionsGuard` behaves when no required permissions are declared**

`src/common/guards/permissions.guard.ts` reads the metadata. If `required` is missing or empty, it returns `true`. If metadata exists, it reads permissions from `RequestContext.activeMembership.permissions` or `RequestContext.platformPermissions` and throws `ScopeMissingException` when any required code is missing. That exception maps to `auth.scope.missing`.

**How `/auth/me` returns `activeMembership.permissions`**

`src/modules/iam/auth/application/me.use-case.ts` reloads the current user through `AuthRepository.findUserById()` and calls `pickActiveMembership()`.

`src/modules/iam/auth/infrastructure/auth.repository.ts` includes active memberships and nested `role.rolePermissions.permission`.

`src/modules/iam/auth/application/membership.mapper.ts` maps `membership.role.rolePermissions.map((rp) => rp.permission.code)` into `activeMembership.permissions`.

## 3. Student App Access / Ownership Mechanics

**How `StudentAppAccessService` resolves the current student**

`src/modules/student-app/access/student-app-access.service.ts` builds a base context from `RequestContext`, finds the linked student by actor user id, finds the active enrollment, and returns `StudentAppContext` with `studentId`, `enrollmentId`, `classroomId`, `academicYearId`, and `termId`.

**How `student-app-domain` enforces `UserType.STUDENT`**

`src/modules/student-app/shared/student-app-domain.ts` checks `context.actor.userType === UserType.STUDENT`. Missing actor, non-student actor, and missing membership throw `student_app.actor.required_student`.

**How active membership is required**

`ScopeResolverGuard` requires active membership for non-platform, non-applicant actors. Student App then requires `activeMembership` again when building the base context.

**How active enrollment is required**

`assertStudentAppActiveEnrollment()` requires an enrollment for the linked student with `StudentEnrollmentStatus.ACTIVE`, matching school, not deleted, and matching requested academic year or term when provided.

**How own student/enrollment/classroom checks work**

`StudentAppAccessService.assertStudentOwnsStudent()`, `assertStudentOwnsEnrollment()`, and `assertStudentOwnsClassroom()` delegate to read adapter lookups and then assert the returned row matches the current `StudentAppContext`. Mismatches throw safe Student App not-found errors.

**Why these checks must remain after RBAC decorators are added**

RBAC answers "may this actor perform this capability". These checks answer "is this specific student/enrollment/classroom visible to this actor". Both are required by `SECURITY_MODEL.md`.

## 4. Full Student App Route Permission Matrix

Every route below is under the framework-level `/api/v1` prefix.

| Area | Controller file | HTTP method | Route | Controller method | Use case | Read or Write | Persistent data touched? | Current `@RequiredPermissions` | Recommended permission | Permission exists in catalog? | Add to `STUDENT_PERMISSIONS`? | Needs new catalog entry? | Security expectation if missing permission | Ownership / visibility check still required? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Home | `src/modules/student-app/home/controller/student-home.controller.ts` | GET | `/api/v1/student/home` | `getHome` | `GetStudentHomeUseCase` | Read | Yes - app aggregate reads | none | `student.home.view` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Aggregates multiple Student App read models. |
| Profile | `src/modules/student-app/profile/controller/student-profile.controller.ts` | GET | `/api/v1/student/profile` | `getProfile` | `GetStudentProfileUseCase` | Read | Yes - student/profile reads | none | `student.profile.view` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Do not use `students.records.manage`. |
| Profile | `src/modules/student-app/profile/controller/student-profile.controller.ts` | POST | `/api/v1/student/profile/avatar` | `uploadAvatar` | `UploadStudentAvatarUseCase` | Write | Yes - object storage, file metadata, student avatar, audit | none | `student.profile.avatar.manage` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Shared file permission is still needed for generic `/files` uploads; this route also performs an upload internally. |
| Profile | `src/modules/student-app/profile/controller/student-profile.controller.ts` | DELETE | `/api/v1/student/profile/avatar` | `deleteAvatar` | `DeleteStudentAvatarUseCase` | Write | Yes - student avatar and audit | none | `student.profile.avatar.manage` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Self-service avatar clear only. |
| Profile | `src/modules/student-app/profile/controller/student-profile.controller.ts` | POST | `/api/v1/student/profile/correction-requests` | `submitCorrectionRequest` | `SubmitStudentProfileCorrectionRequestUseCase` | Write | Yes - correction request and audit | none | `student.profile.correction_requests.create` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Creates a pending request, not a direct profile mutation. |
| Profile | `src/modules/student-app/profile/controller/student-profile.controller.ts` | GET | `/api/v1/student/profile/correction-requests` | `listCorrectionRequests` | `ListStudentProfileCorrectionRequestsUseCase` | Read | Yes - correction request reads | none | `student.profile.correction_requests.view` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Own requests only. |
| Profile | `src/modules/student-app/profile/controller/student-profile.controller.ts` | GET | `/api/v1/student/profile/correction-requests/:requestId` | `getCorrectionRequest` | `GetStudentProfileCorrectionRequestUseCase` | Read | Yes - correction request read | none | `student.profile.correction_requests.view` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Safe not-found for guessed request IDs. |
| Profile | `src/modules/student-app/profile/controller/student-profile.controller.ts` | POST | `/api/v1/student/profile/correction-requests/:requestId/cancel` | `cancelCorrectionRequest` | `CancelStudentProfileCorrectionRequestUseCase` | Write | Yes - correction request and audit | none | `student.profile.correction_requests.cancel` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Own pending request only. |
| Subjects | `src/modules/student-app/subjects/controller/student-subjects.controller.ts` | GET | `/api/v1/student/subjects` | `listSubjects` | `ListStudentSubjectsUseCase` | Read | Yes - subject/allocation reads | none | `academics.subjects.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Current enrollment/classroom filtered. |
| Subjects | `src/modules/student-app/subjects/controller/student-subjects.controller.ts` | GET | `/api/v1/student/subjects/:subjectId` | `getSubject` | `GetStudentSubjectUseCase` | Read | Yes - subject detail reads | none | `academics.subjects.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Subject must be visible to current classroom. |
| Grades | `src/modules/student-app/grades/controller/student-grades.controller.ts` | GET | `/api/v1/student/grades` | `listGrades` | `ListStudentGradesUseCase` | Read | Yes - grade snapshot/items reads | none | `grades.snapshots.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Prefer snapshots for own grade result reads. |
| Grades | `src/modules/student-app/grades/controller/student-grades.controller.ts` | GET | `/api/v1/student/grades/summary` | `getSummary` | `GetStudentGradesSummaryUseCase` | Read | Yes - grade summary reads | none | `grades.snapshots.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Own summary only. |
| Grades | `src/modules/student-app/grades/controller/student-grades.controller.ts` | GET | `/api/v1/student/grades/assessments/:assessmentId` | `getAssessmentGrade` | `GetStudentAssessmentGradeUseCase` | Read | Yes - assessment grade detail reads | none | `grades.assessments.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Assessment must be visible to current enrollment. |
| Exams | `src/modules/student-app/exams/controller/student-exams.controller.ts` | GET | `/api/v1/student/exams` | `listExams` | `ListStudentExamsUseCase` | Read | Yes - assessment reads | none | `grades.assessments.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Exam types are filtered by app read adapter. |
| Exams | `src/modules/student-app/exams/controller/student-exams.controller.ts` | GET | `/api/v1/student/exams/:assessmentId` | `getExam` | `GetStudentExamUseCase` | Read | Yes - assessment/question reads | none | `grades.assessments.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Published/approved visible exams only. |
| Exams | `src/modules/student-app/exams/controller/student-exams.controller.ts` | GET | `/api/v1/student/exams/:assessmentId/submission` | `getExamSubmission` | `GetStudentExamSubmissionUseCase` | Read | Yes - submission reads | none | `grades.submissions.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Does not create missing submission. |
| Exams | `src/modules/student-app/exams/controller/student-exams.controller.ts` | POST | `/api/v1/student/exams/:assessmentId/start` | `startExamSubmission` | `StartStudentExamSubmissionUseCase` | Write | Yes - creates submission when absent and audits | none | `grades.submissions.start` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Existing `grades.submissions.submit` is not precise enough for start. |
| Exams | `src/modules/student-app/exams/controller/student-exams.controller.ts` | PUT | `/api/v1/student/exams/:assessmentId/submission/answers` | `bulkSaveExamAnswers` | `BulkSaveStudentExamAnswersUseCase` | Write | Yes - answer upserts and audit | none | `grades.submissions.save` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Draft answer save, not final submit. |
| Exams | `src/modules/student-app/exams/controller/student-exams.controller.ts` | PATCH | `/api/v1/student/exams/:assessmentId/submission/answers/:questionId` | `saveExamAnswer` | `SaveStudentExamAnswerUseCase` | Write | Yes - answer upsert and audit | none | `grades.submissions.save` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Single answer save. |
| Exams | `src/modules/student-app/exams/controller/student-exams.controller.ts` | POST | `/api/v1/student/exams/:assessmentId/submission/submit` | `submitExamSubmission` | `SubmitStudentExamSubmissionUseCase` | Write | Yes - submission status and audit | none | `grades.submissions.submit` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Existing catalog entry matches final submit. |
| Behavior | `src/modules/student-app/behavior/controller/student-behavior.controller.ts` | GET | `/api/v1/student/behavior` | `listBehaviorRecords` | `ListStudentBehaviorRecordsUseCase` | Read | Yes - behavior record reads | none | `behavior.records.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Own approved/visible behavior only. |
| Behavior | `src/modules/student-app/behavior/controller/student-behavior.controller.ts` | GET | `/api/v1/student/behavior/summary` | `getBehaviorSummary` | `GetStudentBehaviorSummaryUseCase` | Read | Yes - behavior/points reads | none | `behavior.points.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Summary includes point ledger style data. |
| Behavior | `src/modules/student-app/behavior/controller/student-behavior.controller.ts` | GET | `/api/v1/student/behavior/:recordId` | `getBehaviorRecord` | `GetStudentBehaviorRecordUseCase` | Read | Yes - behavior record read | none | `behavior.records.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Safe not-found for hidden records. |
| Discipline | `src/modules/student-app/discipline/controller/student-discipline.controller.ts` | GET | `/api/v1/student/discipline` | `listDiscipline` | `ListStudentDisciplineUseCase` | Read | Yes - derived discipline timeline reads | none | `discipline.timeline.view` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | There is a discipline module but no catalog entry today. |
| Discipline | `src/modules/student-app/discipline/controller/student-discipline.controller.ts` | GET | `/api/v1/student/discipline/summary` | `getDisciplineSummary` | `GetStudentDisciplineSummaryUseCase` | Read | Yes - derived discipline summary reads | none | `discipline.timeline.view` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Same derived read service as list route. |
| Progress | `src/modules/student-app/progress/controller/student-progress.controller.ts` | GET | `/api/v1/student/progress` | `getProgress` | `GetStudentProgressUseCase` | Read | Yes - progress aggregate reads | none | `student.progress.view` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | App-facing aggregate permission. |
| Progress | `src/modules/student-app/progress/controller/student-progress.controller.ts` | GET | `/api/v1/student/progress/academic` | `getAcademicProgress` | `GetStudentAcademicProgressUseCase` | Read | Yes - academic/grade progress reads | none | `grades.snapshots.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Own academic progress only. |
| Progress | `src/modules/student-app/progress/controller/student-progress.controller.ts` | GET | `/api/v1/student/progress/behavior` | `getBehaviorProgress` | `GetStudentBehaviorProgressUseCase` | Read | Yes - behavior progress reads | none | `behavior.points.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Behavior point progress. |
| Progress | `src/modules/student-app/progress/controller/student-progress.controller.ts` | GET | `/api/v1/student/progress/xp` | `getXpProgress` | `GetStudentXpProgressUseCase` | Read | Yes - XP ledger/progress reads | none | `reinforcement.xp.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Existing read permission is safe with own-student filters. |
| Hero | `src/modules/student-app/hero/controller/student-hero.controller.ts` | GET | `/api/v1/student/hero` | `getHeroOverview` | `GetStudentHeroOverviewUseCase` | Read | Yes - hero overview reads | none | `reinforcement.hero.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Read-only hero overview. |
| Hero | `src/modules/student-app/hero/controller/student-hero.controller.ts` | GET | `/api/v1/student/hero/progress` | `getHeroProgress` | `GetStudentHeroProgressUseCase` | Read | Yes - hero progress reads | none | `reinforcement.hero.progress.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Do not use manage. |
| Hero | `src/modules/student-app/hero/controller/student-hero.controller.ts` | GET | `/api/v1/student/hero/badges` | `listBadges` | `ListStudentHeroBadgesUseCase` | Read | Yes - badge catalog/progress reads | none | `reinforcement.hero.badges.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | App-safe badge presenter. |
| Hero | `src/modules/student-app/hero/controller/student-hero.controller.ts` | GET | `/api/v1/student/hero/missions` | `listMissions` | `ListStudentHeroMissionsUseCase` | Read | Yes - mission/progress reads | none | `reinforcement.hero.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Visible missions only. |
| Hero | `src/modules/student-app/hero/controller/student-hero.controller.ts` | GET | `/api/v1/student/hero/missions/:missionId` | `getMission` | `GetStudentHeroMissionUseCase` | Read | Yes - mission detail reads | none | `reinforcement.hero.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Safe not-found for hidden missions. |
| Hero | `src/modules/student-app/hero/controller/student-hero.controller.ts` | POST | `/api/v1/student/hero/missions/:missionId/start` | `startMission` | `StartStudentHeroMissionUseCase` | Write | Yes - hero progress mutation | none | `reinforcement.hero.missions.start` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Narrower than `reinforcement.hero.progress.manage`. |
| Hero | `src/modules/student-app/hero/controller/student-hero.controller.ts` | POST | `/api/v1/student/hero/missions/:missionId/complete` | `completeMission` | `CompleteStudentHeroMissionUseCase` | Write | Yes - hero progress mutation | none | `reinforcement.hero.missions.complete` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Student action, not admin progress management. |
| Hero | `src/modules/student-app/hero/controller/student-hero.controller.ts` | POST | `/api/v1/student/hero/missions/:missionId/objectives/:objectiveId/complete` | `completeObjective` | `CompleteStudentHeroObjectiveUseCase` | Write | Yes - hero objective progress mutation | none | `reinforcement.hero.objectives.complete` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Objective must belong to visible mission. |
| Schedule | `src/modules/student-app/schedule/controller/student-schedule.controller.ts` | GET | `/api/v1/student/schedule` | `getDailySchedule` | `GetStudentDailyScheduleUseCase` | Read | Yes - timetable reads | none | `academics.timetable.view` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Chosen schedule naming is `academics.timetable.view`. |
| Schedule | `src/modules/student-app/schedule/controller/student-schedule.controller.ts` | GET | `/api/v1/student/schedule/week` | `getWeeklySchedule` | `GetStudentWeeklyScheduleUseCase` | Read | Yes - timetable reads | none | `academics.timetable.view` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Uses timetable domain terminology. |
| Tasks | `src/modules/student-app/tasks/controller/student-tasks.controller.ts` | GET | `/api/v1/student/tasks` | `listTasks` | `ListStudentTasksUseCase` | Read | Yes - task assignment reads | none | `reinforcement.tasks.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Current catalog entry exists. |
| Tasks | `src/modules/student-app/tasks/controller/student-tasks.controller.ts` | GET | `/api/v1/student/tasks/summary` | `getSummary` | `GetStudentTasksSummaryUseCase` | Read | Yes - task summary reads | none | `reinforcement.tasks.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Own assignment summary. |
| Tasks | `src/modules/student-app/tasks/controller/student-tasks.controller.ts` | GET | `/api/v1/student/tasks/:taskId` | `getTask` | `GetStudentTaskUseCase` | Read | Yes - task detail reads | none | `reinforcement.tasks.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Hidden cancelled tasks return not found. |
| Tasks | `src/modules/student-app/tasks/controller/student-tasks.controller.ts` | GET | `/api/v1/student/tasks/:taskId/submissions` | `listSubmissions` | `ListStudentTaskSubmissionsUseCase` | Read | Yes - submission reads | none | `reinforcement.submissions.view` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Catalog has reviews, not student submissions. |
| Tasks | `src/modules/student-app/tasks/controller/student-tasks.controller.ts` | GET | `/api/v1/student/tasks/:taskId/submissions/:submissionId` | `getSubmission` | `GetStudentTaskSubmissionUseCase` | Read | Yes - submission detail reads | none | `reinforcement.submissions.view` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Own submission only. |
| Tasks | `src/modules/student-app/tasks/controller/student-tasks.controller.ts` | POST | `/api/v1/student/tasks/:taskId/stages/:stageId/submit` | `submitStage` | `SubmitStudentTaskStageUseCase` | Write | Yes - reinforcement stage submission | none | `reinforcement.submissions.submit` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Proof file must be owned by current student uploader. |
| Messages | `src/modules/student-app/messages/controller/student-messages.controller.ts` | GET | `/api/v1/student/messages/contacts` | `listContacts` | `ListStudentMessageContactsUseCase` | Read | Yes - allowed contact reads | none | `communication.contacts.view` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Contact discovery needs its own narrow permission. |
| Messages | `src/modules/student-app/messages/controller/student-messages.controller.ts` | GET | `/api/v1/student/messages/conversations` | `listConversations` | `ListStudentMessageConversationsUseCase` | Read | Yes - conversation reads | none | `communication.conversations.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Participant conversations only. |
| Messages | `src/modules/student-app/messages/controller/student-messages.controller.ts` | GET | `/api/v1/student/messages/conversations/:conversationId` | `getConversation` | `GetStudentMessageConversationUseCase` | Read | Yes - conversation read | none | `communication.conversations.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Must remain participant-visible. |
| Messages | `src/modules/student-app/messages/controller/student-messages.controller.ts` | GET | `/api/v1/student/messages/conversations/:conversationId/search` | `searchMessages` | `SearchStudentConversationMessagesUseCase` | Read | Yes - message search reads | none | `communication.messages.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Conversation visibility checked first. |
| Messages | `src/modules/student-app/messages/controller/student-messages.controller.ts` | GET | `/api/v1/student/messages/conversations/:conversationId/messages` | `listMessages` | `ListStudentConversationMessagesUseCase` | Read | Yes - message reads | none | `communication.messages.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Participant messages only. |
| Messages | `src/modules/student-app/messages/controller/student-messages.controller.ts` | GET | `/api/v1/student/messages/conversations/:conversationId/messages/:messageId/readers` | `getMessageReaders` | `GetStudentMessageReadersUseCase` | Read | Yes - receipt/read info reads | none | `communication.messages.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | No moderation permission. |
| Messages | `src/modules/student-app/messages/controller/student-messages.controller.ts` | GET | `/api/v1/student/messages/conversations/:conversationId/messages/:messageId/info` | `getMessageInfo` | `GetStudentMessageInfoUseCase` | Read | Yes - message metadata reads | none | `communication.messages.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Safe presenter required. |
| Messages | `src/modules/student-app/messages/controller/student-messages.controller.ts` | GET | `/api/v1/student/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download` | `downloadAttachment` | `GetStudentMessageAttachmentDownloadUrlUseCase` | Read | Yes - attachment/file reads; signed redirect | none | `files.downloads.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Also relies on conversation/message visibility. |
| Messages | `src/modules/student-app/messages/controller/student-messages.controller.ts` | GET | `/api/v1/student/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview` | `previewAttachment` | `GetStudentMessageAttachmentDownloadUrlUseCase` | Read | Yes - attachment/file reads; signed redirect | none | `files.downloads.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Authorized redirect is acceptable; do not expose storage internals. |
| Messages | `src/modules/student-app/messages/controller/student-messages.controller.ts` | POST | `/api/v1/student/messages/conversations` | `createConversation` | `CreateStudentMessageConversationUseCase` | Write | Yes - direct conversation create/reuse | none | `communication.conversations.create` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Contact must be visible. |
| Messages | `src/modules/student-app/messages/controller/student-messages.controller.ts` | POST | `/api/v1/student/messages/conversations/:conversationId/messages` | `sendMessage` | `SendStudentConversationMessageUseCase` | Write | Yes - message and attachment link writes | none | `communication.messages.send` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Grant `communication.messages.attachments.manage` and `files.uploads.manage` for media-capable flows. |
| Messages | `src/modules/student-app/messages/controller/student-messages.controller.ts` | POST | `/api/v1/student/messages/conversations/:conversationId/read` | `markRead` | `MarkStudentConversationReadUseCase` | Write | Yes - message receipt/read marker | none | `communication.conversations.read` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | New self read-receipt permission. |
| Notifications | `src/modules/student-app/notifications/controller/student-notifications.controller.ts` | GET | `/api/v1/student/notifications` | `listNotifications` | `ListStudentNotificationsUseCase` | Read | Yes - notification reads | none | `communication.notifications.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Actor-local notification center. |
| Notifications | `src/modules/student-app/notifications/controller/student-notifications.controller.ts` | GET | `/api/v1/student/notifications/summary` | `getSummary` | `GetStudentNotificationsSummaryUseCase` | Read | Yes - notification summary reads | none | `communication.notifications.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Actor-local summary. |
| Notifications | `src/modules/student-app/notifications/controller/student-notifications.controller.ts` | POST | `/api/v1/student/notifications/read-all` | `markAllRead` | `MarkAllStudentNotificationsReadUseCase` | Write | Yes - notification read markers | none | `communication.notifications.read` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Do not use `communication.notifications.manage`. |
| Notifications | `src/modules/student-app/notifications/controller/student-notifications.controller.ts` | GET | `/api/v1/student/notifications/preferences` | `getPreferences` | `GetStudentNotificationPreferencesUseCase` | Read | Yes - preferences reads | none | `communication.notifications.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Own preferences only. |
| Notifications | `src/modules/student-app/notifications/controller/student-notifications.controller.ts` | PATCH | `/api/v1/student/notifications/preferences` | `updatePreferences` | `UpdateStudentNotificationPreferencesUseCase` | Write | Yes - preferences writes | none | `communication.notifications.preferences.manage` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Narrow self preference permission. |
| Notifications | `src/modules/student-app/notifications/controller/student-notifications.controller.ts` | POST | `/api/v1/student/notifications/device-tokens` | `registerDeviceToken` | `RegisterStudentDeviceTokenUseCase` | Write | Yes - app device token upsert | none | `app.device_tokens.manage` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Surface is `AppDeviceTokenSurface.STUDENT`. |
| Notifications | `src/modules/student-app/notifications/controller/student-notifications.controller.ts` | DELETE | `/api/v1/student/notifications/device-tokens/current` | `unregisterCurrentDeviceToken` | `UnregisterStudentDeviceTokenUseCase` | Write | Yes - app device token revoke/update | none | `app.device_tokens.manage` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Idempotent actor-local unregister. |
| Notifications | `src/modules/student-app/notifications/controller/student-notifications.controller.ts` | GET | `/api/v1/student/notifications/:notificationId` | `getNotification` | `GetStudentNotificationUseCase` | Read | Yes - notification read | none | `communication.notifications.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Own notification only. |
| Notifications | `src/modules/student-app/notifications/controller/student-notifications.controller.ts` | POST | `/api/v1/student/notifications/:notificationId/read` | `markRead` | `MarkStudentNotificationReadUseCase` | Write | Yes - notification read marker | none | `communication.notifications.read` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Actor-local mark read. |
| Notifications | `src/modules/student-app/notifications/controller/student-notifications.controller.ts` | POST | `/api/v1/student/notifications/:notificationId/archive` | `archive` | `ArchiveStudentNotificationUseCase` | Write | Yes - notification archive marker | none | `communication.notifications.archive` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Actor-local archive. |
| Announcements | `src/modules/student-app/announcements/controller/student-announcements.controller.ts` | GET | `/api/v1/student/announcements` | `listAnnouncements` | `ListStudentAnnouncementsUseCase` | Read | Yes - announcement reads | none | `communication.announcements.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Audience matched only. |
| Announcements | `src/modules/student-app/announcements/controller/student-announcements.controller.ts` | GET | `/api/v1/student/announcements/:announcementId` | `getAnnouncement` | `GetStudentAnnouncementUseCase` | Read | Yes - announcement read | none | `communication.announcements.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Audience matched only. |
| Announcements | `src/modules/student-app/announcements/controller/student-announcements.controller.ts` | POST | `/api/v1/student/announcements/:announcementId/read` | `markRead` | `MarkStudentAnnouncementReadUseCase` | Write | Yes - announcement read marker | none | `communication.announcements.read` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | New self read marker permission. |
| Announcements | `src/modules/student-app/announcements/controller/student-announcements.controller.ts` | GET | `/api/v1/student/announcements/:announcementId/attachments` | `listAttachments` | `ListStudentAnnouncementAttachmentsUseCase` | Read | Yes - attachment metadata reads | none | `communication.announcements.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Do not expose storage internals. |
| Calendar | `src/modules/student-app/calendar/controller/student-calendar.controller.ts` | GET | `/api/v1/student/calendar/events` | `listEvents` | `ListStudentCalendarEventsUseCase` | Read | Yes - calendar event reads | none | `academics.calendar.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | App-facing calendar read model. |
| Calendar | `src/modules/student-app/calendar/controller/student-calendar.controller.ts` | GET | `/api/v1/student/calendar/events/:eventId` | `getEvent` | `GetStudentCalendarEventUseCase` | Read | Yes - calendar event read | none | `academics.calendar.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Event must be visible to student scope. |
| Lessons | `src/modules/student-app/lessons/controller/student-lessons.controller.ts` | GET | `/api/v1/student/lessons/today` | `getToday` | `GetStudentLessonsTodayUseCase` | Read | Yes - lesson plan/content reads | none | `academics.lesson_plans.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Visible current-classroom lessons only. |
| Lessons | `src/modules/student-app/lessons/controller/student-lessons.controller.ts` | GET | `/api/v1/student/lessons/week` | `getWeek` | `GetStudentLessonsWeekUseCase` | Read | Yes - lesson plan/content reads | none | `academics.lesson_plans.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | No teacher-only fields. |
| Lessons | `src/modules/student-app/lessons/controller/student-lessons.controller.ts` | GET | `/api/v1/student/lessons/:lessonPlanItemId` | `getDetail` | `GetStudentLessonDetailUseCase` | Read | Yes - lesson detail/content reads | none | `academics.lesson_plans.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Existing tests assert no tenant/storage/teacher-only fields. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | GET | `/api/v1/student/homeworks` | `listHomeworks` | `ListStudentHomeworksUseCase` | Read | Yes - homework assignment reads | none | `homework.assignments.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Assigned to current student only. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | GET | `/api/v1/student/homeworks/:homeworkId` | `getHomework` | `GetStudentHomeworkUseCase` | Read | Yes - homework detail reads | none | `homework.assignments.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Assigned homework only. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | GET | `/api/v1/student/homeworks/:homeworkId/submission` | `getSubmission` | `GetStudentHomeworkSubmissionUseCase` | Read | Yes - homework submission reads | none | `homework.submissions.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Own submission only. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | PUT | `/api/v1/student/homeworks/:homeworkId/submission` | `saveSubmissionDraft` | `SaveStudentHomeworkSubmissionUseCase` | Write | Yes - homework submission draft | none | `homework.submissions.save` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Draft save, not final submit. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | POST | `/api/v1/student/homeworks/:homeworkId/submission/draft` | `saveSubmissionDraftAlias` | `SaveStudentHomeworkSubmissionUseCase` | Write | Yes - homework submission draft | none | `homework.submissions.save` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Alias should match PUT permission. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | GET | `/api/v1/student/homeworks/:homeworkId/submission/answers` | `listSubmissionAnswers` | `ListStudentHomeworkSubmissionAnswersUseCase` | Read | Yes - homework answer reads | none | `homework.submissions.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Own answers only. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | PUT | `/api/v1/student/homeworks/:homeworkId/submission/answers` | `saveSubmissionAnswers` | `SaveStudentHomeworkSubmissionAnswersUseCase` | Write | Yes - homework answer draft writes | none | `homework.answers.manage` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Student self answers only. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | PATCH | `/api/v1/student/homeworks/:homeworkId/submission/answers/:questionId` | `saveSubmissionAnswer` | `SaveStudentHomeworkSubmissionAnswerUseCase` | Write | Yes - one homework answer write | none | `homework.answers.manage` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Single answer save. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | GET | `/api/v1/student/homeworks/:homeworkId/submission/attachments` | `listSubmissionAttachments` | `ListStudentHomeworkSubmissionAttachmentsUseCase` | Read | Yes - submission attachment reads | none | `homework.submissions.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Own attachments only. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | POST | `/api/v1/student/homeworks/:homeworkId/submission/attachments` | `createSubmissionAttachment` | `CreateStudentHomeworkSubmissionAttachmentUseCase` | Write | Yes - submission attachment link | none | `homework.submission_attachments.manage` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Requires separately uploaded file id. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | PATCH | `/api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId` | `updateSubmissionAttachment` | `UpdateStudentHomeworkSubmissionAttachmentUseCase` | Write | Yes - attachment metadata | none | `homework.submission_attachments.manage` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Own submission attachment only. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | PATCH | `/api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId/reorder` | `reorderSubmissionAttachment` | `ReorderStudentHomeworkSubmissionAttachmentUseCase` | Write | Yes - attachment ordering | none | `homework.submission_attachments.manage` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Own submission attachment only. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | DELETE | `/api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId` | `deleteSubmissionAttachment` | `DeleteStudentHomeworkSubmissionAttachmentUseCase` | Write | Yes - soft delete attachment | none | `homework.submission_attachments.manage` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Own submission attachment only. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | POST | `/api/v1/student/homeworks/:homeworkId/submit` | `submitHomework` | `SubmitStudentHomeworkSubmissionUseCase` | Write | Yes - homework submission final state | none | `homework.submissions.submit` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Alias pair should share permission. |
| Homeworks | `src/modules/student-app/homeworks/controller/student-homeworks.controller.ts` | POST | `/api/v1/student/homeworks/:homeworkId/submission/submit` | `submitHomeworkAlias` | `SubmitStudentHomeworkSubmissionUseCase` | Write | Yes - homework submission final state | none | `homework.submissions.submit` | no | yes | yes | 403 `auth.scope.missing` after decorator | yes | Alias pair should share permission. |
| Rewards | `src/modules/student-app/rewards/controller/student-rewards.controller.ts` | GET | `/api/v1/student/rewards` | `listRewards` | `ListStudentRewardsUseCase` | Read | Yes - reward catalog reads | none | `reinforcement.rewards.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Published/app-safe rewards only. |
| Rewards | `src/modules/student-app/rewards/controller/student-rewards.controller.ts` | GET | `/api/v1/student/rewards/redemptions` | `listRedemptions` | `ListStudentRewardRedemptionsUseCase` | Read | Yes - redemption reads | none | `reinforcement.rewards.redemptions.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Own redemptions only. |
| Rewards | `src/modules/student-app/rewards/controller/student-rewards.controller.ts` | GET | `/api/v1/student/rewards/redemptions/:redemptionId` | `getRedemption` | `GetStudentRewardRedemptionUseCase` | Read | Yes - redemption read | none | `reinforcement.rewards.redemptions.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Own redemption only. |
| Rewards | `src/modules/student-app/rewards/controller/student-rewards.controller.ts` | GET | `/api/v1/student/rewards/:rewardId` | `getReward` | `GetStudentRewardUseCase` | Read | Yes - reward read | none | `reinforcement.rewards.view` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Published/app-safe rewards only. |
| Rewards | `src/modules/student-app/rewards/controller/student-rewards.controller.ts` | POST | `/api/v1/student/rewards/:rewardId/redeem` | `redeemReward` | `RedeemStudentRewardUseCase` | Write | Yes - reward redemption request | none | `reinforcement.rewards.redemptions.request` | yes | yes | no | 403 `auth.scope.missing` after decorator | yes | Existing request permission matches self-service redemption. |
| Files | `src/modules/files/uploads/controller/uploads.controller.ts` | POST | `/api/v1/files` | `uploadFile` | `UploadFileUseCase` | Write | Yes - object storage and file metadata | `files.uploads.manage` | `files.uploads.manage` | yes | yes | no | Already 403 `auth.scope.missing` when missing | yes | Needed by Student App attachments/proof flows. |
| Files | `src/modules/files/uploads/controller/uploads.controller.ts` | GET | `/api/v1/files/:id/download` | `downloadFile` | `GetFileDownloadUrlUseCase` | Read | Yes - scoped file read; signed redirect | `files.downloads.view` | `files.downloads.view` | yes | yes | no | Already 403 `auth.scope.missing` when missing | yes | Scoped file lookup must remain. |

## 5. Proposed Permission Naming Decisions

Schedule decision: use `academics.timetable.view`. The codebase and glossary use `Timetable` for scheduled classroom/subject/teacher/room periods. `academics.schedule.view` would introduce a second name for the same core domain. No existing `academics.timetable.view` catalog code exists, so it should be added.

Profile decision: do not use `students.records.manage` for profile, avatar, or correction request routes. Use narrow `student.profile.*` permissions.

Notification decision: do not use `communication.notifications.manage` for Student App read/archive/preferences/device-token flows. Use self-action permissions.

Hero decision: do not use `reinforcement.hero.progress.manage` for student mission start/complete actions. Use narrow student action permissions.

| Permission code | Module | Resource | Action | Reason | Existing or new | Should student get it? | Should teacher get it? | Should parent get it? | App-facing self-service or dashboard/admin? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `student.home.view` | student | home | view | Student home aggregate screen. | new | yes | no | no | app-facing self-service |
| `student.profile.view` | student | profile | view | Student profile screen. | new | yes | no | no | app-facing self-service |
| `student.profile.avatar.manage` | student | profile.avatar | manage | Upload/delete own avatar. | new | yes | no | no | app-facing self-service |
| `student.profile.correction_requests.view` | student | profile.correction_requests | view | View own correction requests. | new | yes | no | no | app-facing self-service |
| `student.profile.correction_requests.create` | student | profile.correction_requests | create | Submit own correction request. | new | yes | no | no | app-facing self-service |
| `student.profile.correction_requests.cancel` | student | profile.correction_requests | cancel | Cancel own pending request. | new | yes | no | no | app-facing self-service |
| `student.progress.view` | student | progress | view | Aggregate Student App progress screen. | new | yes | no | no | app-facing self-service |
| `academics.subjects.view` | academics | subjects | view | Student subject list/detail. | existing | yes | no in this sprint | parent later if needed | app-facing read |
| `academics.calendar.view` | academics | calendar | view | Student calendar events. | existing | yes | no in this sprint | parent later if needed | app-facing read |
| `academics.lesson_plans.view` | academics | lesson_plans | view | Student visible lesson plans/content. | existing | yes | no in this sprint | parent later if needed | app-facing read |
| `academics.timetable.view` | academics | timetable | view | Student daily/weekly schedule from timetable. | new | yes | no in this sprint | parent later if needed | app-facing read |
| `grades.assessments.view` | grades | assessments | view | Exam list/detail and assessment grade detail. | existing | yes | already teacher | already parent | app-facing read |
| `grades.snapshots.view` | grades | snapshots | view | Student grades/progress snapshots. | existing | yes | already teacher | parent later if needed | app-facing read |
| `grades.submissions.view` | grades | submissions | view | Own exam submission state. | existing | yes | already teacher | no | app-facing read |
| `grades.submissions.start` | grades | submissions | start | Start own question-based assessment submission. | new | yes | no | no | app-facing self-service |
| `grades.submissions.save` | grades | submissions | save | Save own draft answers. | new | yes | no | no | app-facing self-service |
| `grades.submissions.submit` | grades | submissions | submit | Submit own final answers. | existing | yes | no | no | app-facing self-service |
| `homework.assignments.view` | homework | assignments | view | Assigned homework list/detail. | existing | yes | no in this sprint | parent later if needed | app-facing read |
| `homework.submissions.view` | homework | submissions | view | Own homework submission/answers/attachments reads. | existing | yes | no in this sprint | parent later if needed | app-facing read |
| `homework.submissions.save` | homework | submissions | save | Save own homework draft. | new | yes | no | no | app-facing self-service |
| `homework.submissions.submit` | homework | submissions | submit | Submit own homework. | new | yes | no | no | app-facing self-service |
| `homework.answers.manage` | homework | answers | manage | Create/update own homework answers. | new | yes | no | no | app-facing self-service |
| `homework.submission_attachments.manage` | homework | submission_attachments | manage | Attach/update/reorder/delete own homework submission files. | new | yes | no | no | app-facing self-service |
| `behavior.records.view` | behavior | records | view | Own behavior record list/detail. | existing | yes | already teacher | parent later if needed | app-facing read |
| `behavior.points.view` | behavior | points | view | Own behavior point summaries/progress. | existing | yes | already teacher | parent later if needed | app-facing read |
| `discipline.timeline.view` | discipline | timeline | view | Derived discipline list/summary. | new | yes | no in this sprint | parent later if needed | app-facing read |
| `reinforcement.tasks.view` | reinforcement | tasks | view | Own task assignments. | existing | yes | already teacher | already parent | app-facing read |
| `reinforcement.submissions.view` | reinforcement | submissions | view | Own task stage submissions. | new | yes | no | parent later if needed | app-facing read |
| `reinforcement.submissions.submit` | reinforcement | submissions | submit | Submit own task stage proof. | new | yes | no | no | app-facing self-service |
| `reinforcement.rewards.view` | reinforcement | rewards | view | Student reward catalog. | existing | yes | already teacher | parent later if needed | app-facing read |
| `reinforcement.rewards.redemptions.view` | reinforcement | reward_redemptions | view | Own redemptions. | existing | yes | already teacher | parent later if needed | app-facing read |
| `reinforcement.rewards.redemptions.request` | reinforcement | reward_redemptions | request | Request own redemption. | existing | yes | already teacher today; should be reviewed separately | no | app-facing self-service |
| `reinforcement.hero.view` | reinforcement | hero | view | Hero overview/missions. | existing | yes | already teacher | parent later if needed | app-facing read |
| `reinforcement.hero.progress.view` | reinforcement | hero_progress | view | Own hero progress. | existing | yes | already teacher | parent later if needed | app-facing read |
| `reinforcement.hero.badges.view` | reinforcement | hero_badges | view | Badge catalog/progress. | existing | yes | no in this sprint | parent later if needed | app-facing read |
| `reinforcement.hero.missions.start` | reinforcement | hero_missions | start | Start own mission. | new | yes | no | no | app-facing self-service |
| `reinforcement.hero.missions.complete` | reinforcement | hero_missions | complete | Complete own mission. | new | yes | no | no | app-facing self-service |
| `reinforcement.hero.objectives.complete` | reinforcement | hero_objectives | complete | Complete own objective. | new | yes | no | no | app-facing self-service |
| `reinforcement.xp.view` | reinforcement | xp | view | Own XP progress. | existing | yes | already teacher | parent later if needed | app-facing read |
| `communication.contacts.view` | communication | contacts | view | App contact discovery. | new | yes | teacher/parent equivalent later | teacher/parent equivalent later | app-facing read |
| `communication.conversations.view` | communication | conversations | view | Conversation list/detail. | existing | yes | already teacher | parent later if needed | app-facing read |
| `communication.conversations.create` | communication | conversations | create | Create/reuse direct conversation. | existing | yes | already teacher | parent later if needed | app-facing self-service |
| `communication.conversations.read` | communication | conversations | read | Mark conversation read. | new | yes | teacher/parent equivalent later | teacher/parent equivalent later | app-facing self-service |
| `communication.messages.view` | communication | messages | view | Messages/search/readers/info. | existing | yes | already teacher | parent later if needed | app-facing read |
| `communication.messages.send` | communication | messages | send | Send own chat messages. | existing | yes | already teacher | parent later if needed | app-facing self-service |
| `communication.messages.attachments.manage` | communication | messages.attachments | manage | Send/link chat attachments. | existing | yes | no in this sprint | parent later if needed | app-facing self-service |
| `communication.announcements.view` | communication | announcements | view | Audience-matched announcements and attachments. | existing | yes | no in this sprint | parent later if needed | app-facing read |
| `communication.announcements.read` | communication | announcements | read | Mark own announcement read. | new | yes | teacher/parent equivalent later | teacher/parent equivalent later | app-facing self-service |
| `communication.notifications.view` | communication | notifications | view | Own notification center and preferences read. | existing | yes | no in this sprint | parent later if needed | app-facing read |
| `communication.notifications.read` | communication | notifications | read | Mark own notification(s) read. | new | yes | teacher/parent equivalent later | teacher/parent equivalent later | app-facing self-service |
| `communication.notifications.archive` | communication | notifications | archive | Archive own notification. | new | yes | teacher/parent equivalent later | teacher/parent equivalent later | app-facing self-service |
| `communication.notifications.preferences.manage` | communication | notification_preferences | manage | Manage own notification preferences. | new | yes | teacher/parent equivalent later | teacher/parent equivalent later | app-facing self-service |
| `app.device_tokens.manage` | app | device_tokens | manage | Register/unregister current app device token. | new | yes | teacher/parent equivalent later | teacher/parent equivalent later | app-facing self-service |
| `files.uploads.manage` | files | uploads | manage | Shared file upload endpoint for attachments/proofs. | existing | yes | already teacher | parent later if needed | app-facing self-service |
| `files.downloads.view` | files | downloads | view | Shared secure file download endpoint and signed redirect flows. | existing | yes | no in this sprint | parent later if needed | app-facing read |
| `students.records.view` | students | records | view | Existing Student role permission; keep for backward compatibility but do not use for profile writes. | existing | yes | already teacher | already parent | app-facing read with ownership |
| `attendance.sessions.view` | attendance | sessions | view | Existing Student role permission; retained for compatibility and progress/home aggregates if needed. | existing | yes | already teacher | already parent | app-facing read |

## 6. Current Student Role Gap

**Current Student role permissions**

```ts
[
  'attendance.sessions.view',
  'grades.assessments.view',
  'reinforcement.tasks.view',
  'students.records.view',
]
```

**Recommended final `STUDENT_PERMISSIONS` list**

```ts
[
  'app.device_tokens.manage',
  'academics.calendar.view',
  'academics.lesson_plans.view',
  'academics.subjects.view',
  'academics.timetable.view',
  'attendance.sessions.view',
  'behavior.points.view',
  'behavior.records.view',
  'communication.announcements.read',
  'communication.announcements.view',
  'communication.contacts.view',
  'communication.conversations.create',
  'communication.conversations.read',
  'communication.conversations.view',
  'communication.messages.attachments.manage',
  'communication.messages.send',
  'communication.messages.view',
  'communication.notifications.archive',
  'communication.notifications.preferences.manage',
  'communication.notifications.read',
  'communication.notifications.view',
  'discipline.timeline.view',
  'files.downloads.view',
  'files.uploads.manage',
  'grades.assessments.view',
  'grades.snapshots.view',
  'grades.submissions.save',
  'grades.submissions.start',
  'grades.submissions.submit',
  'grades.submissions.view',
  'homework.answers.manage',
  'homework.assignments.view',
  'homework.submission_attachments.manage',
  'homework.submissions.save',
  'homework.submissions.submit',
  'homework.submissions.view',
  'reinforcement.hero.badges.view',
  'reinforcement.hero.missions.complete',
  'reinforcement.hero.missions.start',
  'reinforcement.hero.objectives.complete',
  'reinforcement.hero.progress.view',
  'reinforcement.hero.view',
  'reinforcement.rewards.redemptions.request',
  'reinforcement.rewards.redemptions.view',
  'reinforcement.rewards.view',
  'reinforcement.submissions.submit',
  'reinforcement.submissions.view',
  'reinforcement.tasks.view',
  'reinforcement.xp.view',
  'student.home.view',
  'student.profile.avatar.manage',
  'student.profile.correction_requests.cancel',
  'student.profile.correction_requests.create',
  'student.profile.correction_requests.view',
  'student.profile.view',
  'student.progress.view',
  'students.records.view',
]
```

**Permissions already in catalog**

```text
academics.calendar.view
academics.lesson_plans.view
academics.subjects.view
attendance.sessions.view
behavior.points.view
behavior.records.view
communication.announcements.view
communication.conversations.create
communication.conversations.view
communication.messages.attachments.manage
communication.messages.send
communication.messages.view
communication.notifications.view
files.downloads.view
files.uploads.manage
grades.assessments.view
grades.snapshots.view
grades.submissions.submit
grades.submissions.view
homework.assignments.view
homework.submissions.view
reinforcement.hero.badges.view
reinforcement.hero.progress.view
reinforcement.hero.view
reinforcement.rewards.redemptions.request
reinforcement.rewards.redemptions.view
reinforcement.rewards.view
reinforcement.tasks.view
reinforcement.xp.view
students.records.view
```

**Permissions missing from catalog**

```text
app.device_tokens.manage
academics.timetable.view
communication.announcements.read
communication.contacts.view
communication.conversations.read
communication.notifications.archive
communication.notifications.preferences.manage
communication.notifications.read
discipline.timeline.view
grades.submissions.save
grades.submissions.start
homework.answers.manage
homework.submission_attachments.manage
homework.submissions.save
homework.submissions.submit
reinforcement.hero.missions.complete
reinforcement.hero.missions.start
reinforcement.hero.objectives.complete
reinforcement.submissions.submit
reinforcement.submissions.view
student.home.view
student.profile.avatar.manage
student.profile.correction_requests.cancel
student.profile.correction_requests.create
student.profile.correction_requests.view
student.profile.view
student.progress.view
```

**Permissions that must never be granted to student unless a future dedicated security decision says otherwise**

```text
students.records.manage
students.documents.manage
students.medical.manage
communication.notifications.manage
communication.conversations.manage
communication.messages.edit
communication.messages.delete
communication.messages.moderate
communication.admin.view
communication.admin.manage
reinforcement.hero.progress.manage
reinforcement.tasks.manage
reinforcement.rewards.manage
settings.*
platform.*
```

Also avoid granting broad dashboard/admin permissions just to make Student App routes pass. If a route needs a student self-service action, add a narrow permission.

## 7. Required Implementation Plan After Audit

### STU-PERM-1A - Permission Catalog + Student Role Seed

Goal: Add missing permission catalog entries and expand the Student system role.

Files likely changed:

```text
prisma/seeds/01-permissions.seed.ts
prisma/seeds/02-system-roles.seed.ts
```

Routes covered: no route decorators yet; this sprint prepares catalog/role data.

Permissions involved: all missing catalog entries and final `STUDENT_PERMISSIONS` list from section 6.

Tests required:

```text
/auth/me returns expanded activeMembership.permissions for student
seed validation proves every STUDENT_PERMISSIONS code exists in catalog
student role does not include forbidden admin/manage permissions
```

Main risks:

```text
Accidentally granting admin manage permissions
Adding route decorators before permissions exist
Breaking existing seeded role assumptions
```

Explicitly out of scope:

```text
No controller decorators
No source behavior changes
No response contract changes
No migrations unless maintainers require data-migration tracking for permission catalog entries
```

### STU-PERM-1B - Read-only Student App Route Decorators

Goal: Add `@RequiredPermissions()` to read-only Student App routes.

Files likely changed:

```text
src/modules/student-app/**/controller/*.controller.ts
test/security/tenancy.student-app.spec.ts
test/e2e/student-app-final-closeout.e2e-spec.ts
test/e2e/student-app-lessons.e2e-spec.ts
test/security/tenancy.student-app-lessons.spec.ts
```

Routes covered: home, profile GET, subjects, grades reads, exams reads, behavior reads, discipline reads, progress reads, hero reads, schedule, tasks reads, messages reads, notifications reads, announcements reads, calendar, lessons, rewards reads.

Permissions involved: read/view permissions from section 6.

Tests required:

```text
student with permission succeeds
student missing permission receives 403 auth.scope.missing
ownership tests still return safe 404 for guessed IDs
```

Main risks:

```text
Using dashboard/admin permissions for app reads
Forgetting alias or detail routes
Breaking existing route registration expectations
```

Explicitly out of scope:

```text
No write/action decorators
No response changes
No ownership/access service changes
```

### STU-PERM-1C - Homework + Exams Action Permissions

Goal: Add action decorators for homework and exam self-service mutations.

Files likely changed:

```text
src/modules/student-app/homeworks/controller/student-homeworks.controller.ts
src/modules/student-app/exams/controller/student-exams.controller.ts
test/security/tenancy.student-app.spec.ts
test/e2e/student-app-final-closeout.e2e-spec.ts
```

Routes covered: homework draft/save/answers/attachments/submit and exam start/save/submit.

Permissions involved:

```text
homework.submissions.save
homework.submissions.submit
homework.answers.manage
homework.submission_attachments.manage
grades.submissions.start
grades.submissions.save
grades.submissions.submit
```

Tests required:

```text
missing each action permission returns 403 auth.scope.missing
permission does not bypass own homework/exam visibility
cross-school homework/exam IDs remain 404
```

Main risks:

```text
Confusing save and submit permissions
Missing alias routes
Breaking attachment flows that depend on prior file upload
```

Explicitly out of scope:

```text
No grading/review/admin permissions
No homework core behavior changes
No exam submission behavior changes
```

### STU-PERM-1D - Reinforcement / Rewards / Hero Action Permissions

Goal: Add decorators for task submissions, reward redemption, and Hero Journey actions.

Files likely changed:

```text
src/modules/student-app/tasks/controller/student-tasks.controller.ts
src/modules/student-app/rewards/controller/student-rewards.controller.ts
src/modules/student-app/hero/controller/student-hero.controller.ts
test/security/tenancy.student-app.spec.ts
test/e2e/student-app-final-closeout.e2e-spec.ts
```

Routes covered: task stage submit, reward redeem, hero mission start/complete/objective complete.

Permissions involved:

```text
reinforcement.submissions.submit
reinforcement.rewards.redemptions.request
reinforcement.hero.missions.start
reinforcement.hero.missions.complete
reinforcement.hero.objectives.complete
```

Tests required:

```text
missing action permission returns 403 auth.scope.missing
student with permission still cannot act on hidden/cross-school task, reward, or mission IDs
do not require reinforcement.tasks.manage, reinforcement.rewards.manage, or reinforcement.hero.progress.manage
```

Main risks:

```text
Using admin manage permissions
Missing proof file ownership behavior for task submissions
```

Explicitly out of scope:

```text
No teacher review permissions
No reward fulfillment permissions
No hero authoring permissions
```

### STU-PERM-1E - Communication / Notifications / Profile Action Permissions

Goal: Add decorators for chat writes, read receipts, notifications, device tokens, announcements reads, avatar, and correction requests.

Files likely changed:

```text
src/modules/student-app/messages/controller/student-messages.controller.ts
src/modules/student-app/notifications/controller/student-notifications.controller.ts
src/modules/student-app/announcements/controller/student-announcements.controller.ts
src/modules/student-app/profile/controller/student-profile.controller.ts
src/modules/files/uploads/controller/uploads.controller.ts
test/security/tenancy.student-app.spec.ts
test/e2e/student-app-final-closeout.e2e-spec.ts
test/e2e/files-upload-download.e2e-spec.ts
test/security/tenancy.files.spec.ts
```

Routes covered: conversation create/read, message send, attachment redirects, notification read/archive/preferences/device-token, announcement mark read, profile avatar/correction requests, shared file upload/download.

Permissions involved:

```text
communication.contacts.view
communication.conversations.create
communication.conversations.read
communication.messages.send
communication.messages.attachments.manage
communication.announcements.read
communication.notifications.read
communication.notifications.archive
communication.notifications.preferences.manage
app.device_tokens.manage
student.profile.avatar.manage
student.profile.correction_requests.create
student.profile.correction_requests.cancel
files.uploads.manage
files.downloads.view
```

Tests required:

```text
missing permission returns 403 auth.scope.missing
student can upload/download files only with files permissions
message and announcement attachment redirects do not expose storage internals
notification/device-token responses do not leak token material
```

Main risks:

```text
Accidentally requiring communication.notifications.manage
Accidentally granting communication messages edit/delete/moderate
Treating avatar upload as student record management
```

Explicitly out of scope:

```text
No message edit/delete/moderation
No communication admin permissions
No response DTO changes
```

### STU-PERM-1F - Final Security Closeout + Regression Audit

Goal: Prove every Student App route has RBAC coverage and still has ownership/visibility protection.

Files likely changed:

```text
test/security/tenancy.student-app.spec.ts
test/security/tenancy.student-app-lessons.spec.ts
test/e2e/student-app-final-closeout.e2e-spec.ts
test/e2e/student-app-lessons.e2e-spec.ts
additional Student App module-local specs if needed
docs/* closeout document
```

Routes covered: all Student App routes plus shared file upload/download.

Permissions involved: final `STUDENT_PERMISSIONS` list.

Tests required:

```text
route inventory test proving no undecorated Student App handler remains
missing permission 403 auth.scope.missing for representative routes in every area
cross-school and same-school other-student guessed IDs remain 404
no forbidden student permissions are seeded
```

Main risks:

```text
False confidence from ownership tests while permission tests are missing
Route aliases left undecorated
No-leak response regressions
```

Explicitly out of scope:

```text
No feature expansion
No API contract changes
No broad admin permission grants
```

## 8. Required Test Plan For Later Sprints

Later implementation tests must prove:

```text
/auth/me returns expanded activeMembership.permissions for student
Student with required permission can call the route
Student missing required permission receives 403 auth.scope.missing
Student with permission still cannot access another student's resources
Cross-school guessed IDs remain hidden with existing safe not-found behavior
No no-leak fields are added to app-facing responses
File upload/download still requires files.uploads.manage/files.downloads.view
No dashboard/admin permissions are required for Student App self-service routes
```

Existing files likely to expand:

```text
test/security/tenancy.student-app.spec.ts
test/e2e/student-app-final-closeout.e2e-spec.ts
test/security/tenancy.student-app-lessons.spec.ts
test/e2e/student-app-lessons.e2e-spec.ts
test/e2e/files-upload-download.e2e-spec.ts
test/security/tenancy.files.spec.ts
src/modules/student-app/shared/tests/student-app-domain.spec.ts
src/modules/student-app/access/tests/student-app-access.service.spec.ts
src/modules/student-app/homeworks/tests/student-homeworks.use-case.spec.ts
src/modules/student-app/exams/tests/student-exams-submission.use-case.spec.ts
src/modules/student-app/messages/tests/student-messages.use-case.spec.ts
src/modules/student-app/notifications/tests/student-notifications.use-case.spec.ts
src/modules/student-app/profile/tests/student-avatar.use-case.spec.ts
src/modules/student-app/profile/tests/student-profile-correction-requests.use-case.spec.ts
```

The existing Student App security/e2e tests already cover user type rejection, unlinked student rejection, inactive/no active enrollment rejection, same-school/cross-school safe not-found behavior, route absence checks, and several no-leak response expectations. They do not currently prove route-level Student App permission denial because the controllers have no `@RequiredPermissions()` metadata.

## 9. No-Leak / Security Notes

This audit does not recommend response changes exposing:

```text
schoolId
organizationId
membershipId
roleId
deletedAt
passwordHash
Student.userId
Guardian.userId
Student.applicationId
internal actor IDs
storage bucket
storage objectKey
raw signed URLs in JSON responses
audit internals
```

Authorized redirects/download flows may continue through existing secure endpoints and communication attachment redirect routes. Do not expose storage bucket, object key, or raw signed URL fields in normal JSON DTOs. Redirect responses are acceptable only after authorization and visibility checks.

## 10. Final Recommendation

**Is this ready for implementation?**

Yes. The audit identifies the real route surface, the current RBAC mechanics, the missing decorators, the current Student role gap, and the permission naming decisions needed for follow-up implementation.

**Recommended next sprint**

`STU-PERM-1A - Permission Catalog + Student Role Seed`

**Open naming decisions, if any**

None. This audit recommends:

```text
academics.timetable.view
student.profile.* for profile/avatar/correction
communication.notifications.read/archive/preferences.manage for notification self-actions
reinforcement.hero.missions.start/complete and reinforcement.hero.objectives.complete for Hero self-actions
```

**Final verdict**

READY FOR STU-PERM-1A
