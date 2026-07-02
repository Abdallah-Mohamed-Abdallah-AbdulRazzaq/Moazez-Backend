# PARENT-PERM-0A - Parent App Permission Coverage Audit

## 1. Executive Summary

**Current finding:** the Parent App has 68 authenticated controller handlers under `src/modules/parent-app/**/controller/*.ts`, and none declare `@RequiredPermissions()`. The global `PermissionsGuard` only enforces permissions when metadata exists, so Parent App access is currently protected by JWT, active scope, `UserType.PARENT`, Guardian/StudentGuardian/enrollment ownership, and route-specific visibility checks, but not by RBAC coverage.

**Risk level:** high for authorization consistency, medium for immediate data leakage. The ownership layer is strong and prevents cross-parent/cross-school access, but a parent role with too few permissions means `/auth/me` under-reports what the app does and missing-permission denial cannot be tested for Parent App routes.

**Why this is not only a seed problem:** expanding `PARENT_PERMISSIONS` alone changes `/auth/me` and role composition, but routes without `@RequiredPermissions()` still do not enforce missing-permission denial. The fix needs both catalog/role seed changes and controller decorators.

**Why ownership checks are necessary but not enough:** ownership answers "is this exact child/resource visible to this parent?" RBAC answers "is this actor allowed to perform this route action at all?" Parent App needs both. The current `ParentAppAccessService` must remain in use cases after decorators are added.

**Recommended implementation sequence:**

1. `PARENT-PERM-1A` - add missing parent app-facing catalog entries and expand the parent system role.
2. `PARENT-PERM-1B` - add decorators to read-only Parent App routes.
3. `PARENT-PERM-1C` - add decorators to Parent App self-service write routes.
4. `PARENT-PERM-1D` - add static route inventory and regression coverage.

Baseline check: expected `2ede3f66 test: close student app permission coverage`; actual `HEAD` is the same. Initial `git status --short --untracked-files=all` was clean.

## 2. Current RBAC Mechanics

| Mechanic | Current evidence |
| --- | --- |
| Permission catalog seed | `prisma/seeds/01-permissions.seed.ts` defines `PERMISSIONS` and exports `PERMISSION_CODES`. |
| System role seed | `prisma/seeds/02-system-roles.seed.ts` defines `PARENT_PERMISSIONS`, `STUDENT_PERMISSIONS`, and the `parent` system role. |
| Current `PARENT_PERMISSIONS` | `attendance.sessions.view`, `grades.assessments.view`, `reinforcement.tasks.view`, `students.records.view`. |
| Current `STUDENT_PERMISSIONS` comparison | Student role now includes app/device, academics, attendance, behavior, communication, discipline, files, grades, homework, reinforcement, `student.*`, and `students.records.view` permissions. Parent role is much smaller than the current Parent App route surface. |
| `@RequiredPermissions()` behavior | `src/common/decorators/required-permissions.decorator.ts` stores permission codes in `moazez:required_permissions`. Omitting the decorator means auth + active scope only. |
| `PermissionsGuard` behavior | `src/common/guards/permissions.guard.ts` returns `true` when `required` is missing or empty; otherwise it compares required codes to `ctx.activeMembership.permissions` or `ctx.platformPermissions` and throws `auth.scope.missing` through `ScopeMissingException`. |
| Guard order | `src/app.module.ts` registers global guards as `JwtAuthGuard`, then `ScopeResolverGuard`, then `PermissionsGuard`. |
| Active membership permissions | `src/common/guards/scope-resolver.guard.ts` loads the first active membership, maps `membership.role.rolePermissions[].permission.code`, and stores the codes in `RequestContext.activeMembership.permissions`. |
| `/auth/me` permissions | `src/modules/iam/auth/application/me.use-case.ts` returns `pickActiveMembership(user)`. `src/modules/iam/auth/application/membership.mapper.ts` maps `role.rolePermissions[].permission.code` into `activeMembership.permissions`. `src/modules/iam/auth/infrastructure/auth.repository.ts` includes active memberships and role permissions in `USER_WITH_ACTIVE_MEMBERSHIP`. |

## 3. Parent App Access / Ownership Mechanics

`src/modules/parent-app/access/parent-app-access.service.ts` builds a Parent App context from `RequestContext`, current-school Guardian records, StudentGuardian links, and active enrollments.

`src/modules/parent-app/shared/parent-app-domain.ts` enforces:

- `actor` must exist.
- `actor.userType` must be `UserType.PARENT`.
- `activeMembership` must exist.
- `schoolId`, `organizationId`, `membershipId`, and `roleId` must be present.
- current-school Guardian rows must match the parent user, school, organization, active user status, and no soft delete.
- linked students must be active, current-school, current-organization students.
- children must have active current-school enrollments.
- child, enrollment, and classroom assertions fail with safe not-found style exceptions.

`src/modules/parent-app/access/parent-app-guardian-read.adapter.ts` uses `prisma.scoped`, so the active `RequestContext.activeMembership.schoolId` remains the query boundary. It resolves current-school Guardian records by parent `userId`, linked students through `StudentGuardian`, active enrollments, owned student enrollment, owned enrollment id, and owned classroom enrollment.

These checks must remain after RBAC decorators are added because they enforce per-resource visibility. A permission such as `grades.assessments.view` must not let a parent view another parent's child, a same-school unlinked child, or a cross-school guessed id.

## 4. Full Parent App Route Permission Matrix

All listed routes are under the framework-level `/api/v1` prefix. Current `@RequiredPermissions` is `none` for every Parent App handler.

| Area | Controller file | HTTP method | Route | Controller method | Use case | Read or Write | Persistent data touched? | Current `@RequiredPermissions` | Recommended permission | Permission exists in catalog? yes/no | Add to `PARENT_PERMISSIONS`? yes/no | Needs new catalog entry? yes/no | Security expectation if missing permission | Ownership / visibility check still required? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Home | `src/modules/parent-app/home/controller/parent-home.controller.ts` | GET | `/parent/home` | `getHome` | `GetParentHomeUseCase` | Read | yes | none | `parent.home.view` | no | yes | yes | 403 `auth.scope.missing` | yes | Parent aggregate over own identity, school display, children, and pending reinforcement task counts. |
| Children | `src/modules/parent-app/children/controller/parent-children.controller.ts` | GET | `/parent/children` | `listChildren` | `ListParentChildrenUseCase` | Read | yes | none | `parent.children.view`, `students.records.view`, `students.enrollments.view` | mixed | yes | yes for `parent.children.view` | 403 `auth.scope.missing` | yes | Returns owned active children and enrollment/classroom hierarchy. |
| Children | `src/modules/parent-app/children/controller/parent-children.controller.ts` | GET | `/parent/children/:studentId` | `getChild` | `GetParentChildUseCase` | Read | yes | none | `parent.children.view`, `students.records.view`, `students.enrollments.view` | mixed | yes | yes for `parent.children.view` | 403 `auth.scope.missing` | yes | Does not expose documents, medical data, Guardian records, or application ids. |
| Profile | `src/modules/parent-app/profile/controller/parent-profile.controller.ts` | GET | `/parent/profile` | `getProfile` | `GetParentProfileUseCase` | Read | yes | none | `parent.profile.view` | no | yes | yes | 403 `auth.scope.missing` | yes | Self profile route. Guardian relation/isPrimary is current-parent profile data, not a broad guardian directory. |
| Grades | `src/modules/parent-app/grades/controller/parent-grades.controller.ts` | GET | `/parent/children/:studentId/grades` | `listGrades` | `ListParentChildGradesUseCase` | Read | yes | none | `grades.assessments.view`, `grades.gradebook.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads visible published/approved assessments and owned grade items. |
| Grades | `src/modules/parent-app/grades/controller/parent-grades.controller.ts` | GET | `/parent/children/:studentId/grades/summary` | `getSummary` | `GetParentChildGradesSummaryUseCase` | Read | yes | none | `grades.assessments.view`, `grades.gradebook.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Summary derives from the same visible assessment and grade item data. |
| Grades | `src/modules/parent-app/grades/controller/parent-grades.controller.ts` | GET | `/parent/children/:studentId/grades/assessments/:assessmentId` | `getAssessmentGrade` | `GetParentChildAssessmentGradeUseCase` | Read | yes | none | `grades.assessments.view`, `grades.gradebook.view`, `grades.submissions.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Detail may include grade submission status; no student submit permission. |
| Homeworks | `src/modules/parent-app/homeworks/controller/parent-homeworks.controller.ts` | GET | `/parent/children/:studentId/homeworks` | `listHomeworks` | `ListParentChildHomeworksUseCase` | Read | yes | none | `homework.assignments.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Lists visible published/closed assignments for owned child. |
| Homeworks | `src/modules/parent-app/homeworks/controller/parent-homeworks.controller.ts` | GET | `/parent/children/:studentId/homeworks/:homeworkId` | `getHomework` | `GetParentChildHomeworkUseCase` | Read | yes | none | `homework.assignments.view`, `homework.submissions.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Detail includes existing submission/answers/attachments as read-only monitoring data. |
| Behavior | `src/modules/parent-app/behavior/controller/parent-behavior.controller.ts` | GET | `/parent/children/:studentId/behavior` | `listBehavior` | `ListParentChildBehaviorUseCase` | Read | yes | none | `behavior.records.view`, `behavior.points.view`, `attendance.sessions.view`, `attendance.absences.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads approved behavior records plus attendance counts. |
| Behavior | `src/modules/parent-app/behavior/controller/parent-behavior.controller.ts` | GET | `/parent/children/:studentId/behavior/summary` | `getSummary` | `GetParentChildBehaviorSummaryUseCase` | Read | yes | none | `behavior.records.view`, `behavior.points.view`, `attendance.sessions.view`, `attendance.absences.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Summary uses behavior records, behavior point ledger, and attendance entries. |
| Behavior | `src/modules/parent-app/behavior/controller/parent-behavior.controller.ts` | GET | `/parent/children/:studentId/behavior/:recordId` | `getRecord` | `GetParentChildBehaviorRecordUseCase` | Read | yes | none | `behavior.records.view`, `behavior.points.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads one approved owned-child behavior record. |
| Discipline | `src/modules/parent-app/discipline/controller/parent-discipline.controller.ts` | GET | `/parent/children/:studentId/discipline` | `listDiscipline` | `ListParentChildDisciplineUseCase` | Read | yes | none | `discipline.timeline.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Derived timeline over attendance incidents and approved behavior. |
| Discipline | `src/modules/parent-app/discipline/controller/parent-discipline.controller.ts` | GET | `/parent/children/:studentId/discipline/summary` | `getDisciplineSummary` | `GetParentChildDisciplineSummaryUseCase` | Read | yes | none | `discipline.timeline.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Uses the same derived discipline read model. |
| Progress | `src/modules/parent-app/progress/controller/parent-progress.controller.ts` | GET | `/parent/children/:studentId/progress` | `getProgress` | `GetParentChildProgressUseCase` | Read | yes | none | `parent.progress.view` | no | yes | yes | 403 `auth.scope.missing` | yes | Aggregate app-facing progress screen over academic, behavior, and XP. |
| Progress | `src/modules/parent-app/progress/controller/parent-progress.controller.ts` | GET | `/parent/children/:studentId/progress/academic` | `getAcademicProgress` | `GetParentChildAcademicProgressUseCase` | Read | yes | none | `parent.progress.view`, `grades.assessments.view`, `grades.gradebook.view`, `academics.subjects.view` | mixed | yes | yes for `parent.progress.view` | 403 `auth.scope.missing` | yes | Subject-level academic progress from assessments and grade items. |
| Progress | `src/modules/parent-app/progress/controller/parent-progress.controller.ts` | GET | `/parent/children/:studentId/progress/behavior` | `getBehaviorProgress` | `GetParentChildBehaviorProgressUseCase` | Read | yes | none | `parent.progress.view`, `behavior.records.view`, `behavior.points.view`, `attendance.sessions.view`, `attendance.absences.view` | mixed | yes | yes for `parent.progress.view` | 403 `auth.scope.missing` | yes | Behavior progress includes attendance counts. |
| Progress | `src/modules/parent-app/progress/controller/parent-progress.controller.ts` | GET | `/parent/children/:studentId/progress/xp` | `getXpProgress` | `GetParentChildXpProgressUseCase` | Read | yes | none | `parent.progress.view`, `reinforcement.xp.view` | mixed | yes | yes for `parent.progress.view` | 403 `auth.scope.missing` | yes | Reads owned-child XP ledger summary. |
| Reports | `src/modules/parent-app/reports/controller/parent-reports.controller.ts` | GET | `/parent/children/:studentId/reports` | `listReports` | `ListParentChildReportsUseCase` | Read | yes | none | `parent.reports.view` | no | yes | yes | 403 `auth.scope.missing` | yes | Aggregate current-term report card from progress and discipline sources. |
| Reports | `src/modules/parent-app/reports/controller/parent-reports.controller.ts` | GET | `/parent/children/:studentId/reports/summary` | `getSummary` | `GetParentChildReportsSummaryUseCase` | Read | yes | none | `parent.reports.view` | no | yes | yes | 403 `auth.scope.missing` | yes | Same report source, summary shape. |
| Schedule | `src/modules/parent-app/schedule/controller/parent-schedule.controller.ts` | GET | `/parent/children/:studentId/schedule/today` | `getTodaySchedule` | `GetParentChildTodayScheduleUseCase` | Read | yes | none | `academics.timetable.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads published active timetable entries for owned child's classroom. |
| Schedule | `src/modules/parent-app/schedule/controller/parent-schedule.controller.ts` | GET | `/parent/children/:studentId/schedule/weekly` | `getWeeklySchedule` | `GetParentChildWeeklyScheduleUseCase` | Read | yes | none | `academics.timetable.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Weekly published timetable. |
| Calendar | `src/modules/parent-app/calendar/controller/parent-calendar.controller.ts` | GET | `/parent/children/:studentId/calendar/events` | `listEvents` | `ListParentCalendarEventsUseCase` | Read | yes | none | `academics.calendar.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Builds parent visibility from owned child classroom scope. |
| Calendar | `src/modules/parent-app/calendar/controller/parent-calendar.controller.ts` | GET | `/parent/children/:studentId/calendar/events/:eventId` | `getEvent` | `GetParentCalendarEventUseCase` | Read | yes | none | `academics.calendar.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Single visible calendar event. |
| Lessons | `src/modules/parent-app/lessons/controller/parent-child-lessons.controller.ts` | GET | `/parent/children/:studentId/lessons/today` | `getToday` | `GetParentChildLessonsTodayUseCase` | Read | yes | none | `academics.lesson_plans.view`, `academics.curriculum.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Returns active lesson plan items plus curriculum/unit/lesson/content metadata. |
| Lessons | `src/modules/parent-app/lessons/controller/parent-child-lessons.controller.ts` | GET | `/parent/children/:studentId/lessons/week` | `getWeek` | `GetParentChildLessonsWeekUseCase` | Read | yes | none | `academics.lesson_plans.view`, `academics.curriculum.view`, `academics.timetable.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Uses schedule settings and lesson plan item content. |
| Lessons | `src/modules/parent-app/lessons/controller/parent-child-lessons.controller.ts` | GET | `/parent/children/:studentId/lessons/:lessonPlanItemId` | `getDetail` | `GetParentChildLessonDetailUseCase` | Read | yes | none | `academics.lesson_plans.view`, `academics.curriculum.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Detail exposes curriculum title, unit title, lesson objectives, content items, and safe file metadata. |
| Tasks | `src/modules/parent-app/tasks/controller/parent-tasks.controller.ts` | GET | `/parent/children/:studentId/tasks` | `listTasks` | `ListParentChildTasksUseCase` | Read | yes | none | `reinforcement.tasks.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Lists assigned reinforcement tasks for owned child. |
| Tasks | `src/modules/parent-app/tasks/controller/parent-tasks.controller.ts` | GET | `/parent/children/:studentId/tasks/summary` | `getSummary` | `GetParentChildTasksSummaryUseCase` | Read | yes | none | `reinforcement.tasks.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Task assignment status summary. |
| Tasks | `src/modules/parent-app/tasks/controller/parent-tasks.controller.ts` | GET | `/parent/children/:studentId/tasks/:taskId` | `getTask` | `GetParentChildTaskUseCase` | Read | yes | none | `reinforcement.tasks.view`, `reinforcement.submissions.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Detail includes stages and existing submissions as read-only. |
| Tasks | `src/modules/parent-app/tasks/controller/parent-tasks.controller.ts` | GET | `/parent/children/:studentId/tasks/:taskId/submissions` | `listSubmissions` | `ListParentChildTaskSubmissionsUseCase` | Read | yes | none | `reinforcement.submissions.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads owned-child task submissions only. |
| Tasks | `src/modules/parent-app/tasks/controller/parent-tasks.controller.ts` | GET | `/parent/children/:studentId/tasks/:taskId/submissions/:submissionId` | `getSubmission` | `GetParentChildTaskSubmissionUseCase` | Read | yes | none | `reinforcement.submissions.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads one owned-child task submission. |
| Hero | `src/modules/parent-app/hero/controller/parent-hero.controller.ts` | GET | `/parent/children/:studentId/hero` | `getHeroOverview` | `GetParentChildHeroOverviewUseCase` | Read | yes | none | `reinforcement.hero.view`, `reinforcement.hero.progress.view`, `reinforcement.xp.view`, `reinforcement.rewards.redemptions.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Read-only overview across Hero, XP, badges, and redemption summary. |
| Hero | `src/modules/parent-app/hero/controller/parent-hero.controller.ts` | GET | `/parent/children/:studentId/hero/progress` | `getHeroProgress` | `GetParentChildHeroProgressUseCase` | Read | yes | none | `reinforcement.hero.progress.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads mission progress; no start/complete permissions. |
| Hero | `src/modules/parent-app/hero/controller/parent-hero.controller.ts` | GET | `/parent/children/:studentId/hero/badges` | `listBadges` | `ListParentChildHeroBadgesUseCase` | Read | yes | none | `reinforcement.hero.badges.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads earned Hero badges. |
| Hero | `src/modules/parent-app/hero/controller/parent-hero.controller.ts` | GET | `/parent/children/:studentId/hero/missions` | `listMissions` | `ListParentChildHeroMissionsUseCase` | Read | yes | none | `reinforcement.hero.view`, `reinforcement.hero.progress.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads published missions with progress overlay. |
| Hero | `src/modules/parent-app/hero/controller/parent-hero.controller.ts` | GET | `/parent/children/:studentId/hero/missions/:missionId` | `getMission` | `GetParentChildHeroMissionUseCase` | Read | yes | none | `reinforcement.hero.view`, `reinforcement.hero.progress.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads mission detail and objective progress; no mutation. |
| Rewards | `src/modules/parent-app/rewards/controller/parent-rewards.controller.ts` | GET | `/parent/children/:studentId/rewards` | `listRewards` | `ListParentChildRewardsUseCase` | Read | yes | none | `reinforcement.rewards.view`, `reinforcement.xp.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads published rewards and child's total earned XP. |
| Rewards | `src/modules/parent-app/rewards/controller/parent-rewards.controller.ts` | GET | `/parent/children/:studentId/rewards/redemptions` | `listRedemptions` | `ListParentChildRewardRedemptionsUseCase` | Read | yes | none | `reinforcement.rewards.redemptions.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads existing owned-child redemption requests. |
| Rewards | `src/modules/parent-app/rewards/controller/parent-rewards.controller.ts` | GET | `/parent/children/:studentId/rewards/redemptions/:redemptionId` | `getRedemption` | `GetParentChildRewardRedemptionUseCase` | Read | yes | none | `reinforcement.rewards.redemptions.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads one owned-child redemption. |
| Rewards | `src/modules/parent-app/rewards/controller/parent-rewards.controller.ts` | GET | `/parent/children/:studentId/rewards/:rewardId` | `getReward` | `GetParentChildRewardUseCase` | Read | yes | none | `reinforcement.rewards.view`, `reinforcement.xp.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads published reward detail and XP eligibility. |
| Messages | `src/modules/parent-app/messages/controller/parent-messages.controller.ts` | GET | `/parent/messages/contacts` | `listContacts` | `ListParentMessageContactsUseCase` | Read | yes | none | `communication.contacts.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Contacts are teacher contacts for owned child classrooms. |
| Messages | `src/modules/parent-app/messages/controller/parent-messages.controller.ts` | GET | `/parent/messages/conversations` | `listConversations` | `ListParentMessageConversationsUseCase` | Read | yes | none | `communication.conversations.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Lists conversations where parent is active participant. |
| Messages | `src/modules/parent-app/messages/controller/parent-messages.controller.ts` | GET | `/parent/messages/conversations/:conversationId` | `getConversation` | `GetParentMessageConversationUseCase` | Read | yes | none | `communication.conversations.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Requires parent participant visibility. |
| Messages | `src/modules/parent-app/messages/controller/parent-messages.controller.ts` | GET | `/parent/messages/conversations/:conversationId/search` | `searchMessages` | `SearchParentConversationMessagesUseCase` | Read | yes | none | `communication.messages.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Searches visible messages in parent-visible conversation. |
| Messages | `src/modules/parent-app/messages/controller/parent-messages.controller.ts` | GET | `/parent/messages/conversations/:conversationId/messages` | `listMessages` | `ListParentConversationMessagesUseCase` | Read | yes | none | `communication.messages.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Lists visible messages and safe attachment metadata. |
| Messages | `src/modules/parent-app/messages/controller/parent-messages.controller.ts` | GET | `/parent/messages/conversations/:conversationId/messages/:messageId/readers` | `getMessageReaders` | `GetParentMessageReadersUseCase` | Read | yes | none | `communication.messages.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Parent must be able to view conversation and message. |
| Messages | `src/modules/parent-app/messages/controller/parent-messages.controller.ts` | GET | `/parent/messages/conversations/:conversationId/messages/:messageId/info` | `getMessageInfo` | `GetParentMessageInfoUseCase` | Read | yes | none | `communication.messages.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Message info plus read state. |
| Messages | `src/modules/parent-app/messages/controller/parent-messages.controller.ts` | GET | `/parent/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download` | `downloadAttachment` | `GetParentMessageAttachmentDownloadUrlUseCase` | Read | yes + storage redirect | none | `communication.messages.view`, `files.downloads.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Redirects to signed URL after conversation/message/attachment visibility checks. |
| Messages | `src/modules/parent-app/messages/controller/parent-messages.controller.ts` | GET | `/parent/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview` | `previewAttachment` | `GetParentMessageAttachmentDownloadUrlUseCase` | Read | yes + storage redirect | none | `communication.messages.view`, `files.downloads.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Preview uses same signed download URL path. |
| Messages | `src/modules/parent-app/messages/controller/parent-messages.controller.ts` | POST | `/parent/messages/conversations` | `createConversation` | `CreateParentMessageConversationUseCase` | Write | yes | none | `communication.conversations.create` | yes | yes | no | 403 `auth.scope.missing` | yes | Creates/reuses direct conversation only with visible parent contact. |
| Messages | `src/modules/parent-app/messages/controller/parent-messages.controller.ts` | POST | `/parent/messages/conversations/:conversationId/messages` | `sendMessage` | `SendParentConversationMessageUseCase` | Write | yes | none | `communication.messages.send` | yes | yes | no | 403 `auth.scope.missing` | yes | Route-level permission should be send. Do not require `communication.messages.attachments.manage` unless a future attachment-management route is added. |
| Messages | `src/modules/parent-app/messages/controller/parent-messages.controller.ts` | POST | `/parent/messages/conversations/:conversationId/read` | `markRead` | `MarkParentConversationReadUseCase` | Write | yes | none | `communication.conversations.read` | yes | yes | no | 403 `auth.scope.missing` | yes | Marks visible conversation read for current parent. |
| Notifications | `src/modules/parent-app/notifications/controller/parent-notifications.controller.ts` | GET | `/parent/notifications` | `listNotifications` | `ListParentNotificationsUseCase` | Read | yes | none | `communication.notifications.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Lists notification center rows for parent user. |
| Notifications | `src/modules/parent-app/notifications/controller/parent-notifications.controller.ts` | GET | `/parent/notifications/summary` | `getSummary` | `GetParentNotificationsSummaryUseCase` | Read | yes | none | `communication.notifications.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Unread summary for parent user. |
| Notifications | `src/modules/parent-app/notifications/controller/parent-notifications.controller.ts` | POST | `/parent/notifications/read-all` | `markAllRead` | `MarkAllParentNotificationsReadUseCase` | Write | yes | none | `communication.notifications.read` | yes | yes | no | 403 `auth.scope.missing` | yes | Marks current parent's notifications read. |
| Notifications | `src/modules/parent-app/notifications/controller/parent-notifications.controller.ts` | GET | `/parent/notifications/preferences` | `getPreferences` | `GetParentNotificationPreferencesUseCase` | Read | yes | none | `communication.notifications.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads current actor notification preferences. |
| Notifications | `src/modules/parent-app/notifications/controller/parent-notifications.controller.ts` | PATCH | `/parent/notifications/preferences` | `updatePreferences` | `UpdateParentNotificationPreferencesUseCase` | Write | yes | none | `communication.notifications.preferences.manage` | yes | yes | no | 403 `auth.scope.missing` | yes | Updates current actor preferences only. |
| Notifications | `src/modules/parent-app/notifications/controller/parent-notifications.controller.ts` | POST | `/parent/notifications/device-tokens` | `registerDeviceToken` | `RegisterParentDeviceTokenUseCase` | Write | yes | none | `app.device_tokens.manage` | yes | yes | no | 403 `auth.scope.missing` | yes | Registers current parent device token for Parent surface. |
| Notifications | `src/modules/parent-app/notifications/controller/parent-notifications.controller.ts` | DELETE | `/parent/notifications/device-tokens/current` | `unregisterCurrentDeviceToken` | `UnregisterParentDeviceTokenUseCase` | Write | yes | none | `app.device_tokens.manage` | yes | yes | no | 403 `auth.scope.missing` | yes | Unregisters current parent device token. |
| Notifications | `src/modules/parent-app/notifications/controller/parent-notifications.controller.ts` | GET | `/parent/notifications/:notificationId` | `getNotification` | `GetParentNotificationUseCase` | Read | yes | none | `communication.notifications.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads one current-parent notification. |
| Notifications | `src/modules/parent-app/notifications/controller/parent-notifications.controller.ts` | POST | `/parent/notifications/:notificationId/read` | `markRead` | `MarkParentNotificationReadUseCase` | Write | yes | none | `communication.notifications.read` | yes | yes | no | 403 `auth.scope.missing` | yes | Marks one current-parent notification read. |
| Notifications | `src/modules/parent-app/notifications/controller/parent-notifications.controller.ts` | POST | `/parent/notifications/:notificationId/archive` | `archive` | `ArchiveParentNotificationUseCase` | Write | yes | none | `communication.notifications.archive` | yes | yes | no | 403 `auth.scope.missing` | yes | Archives one current-parent notification. |
| Announcements | `src/modules/parent-app/announcements/controller/parent-announcements.controller.ts` | GET | `/parent/announcements` | `listAnnouncements` | `ListParentAnnouncementsUseCase` | Read | yes | none | `communication.announcements.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Audience visibility from parent user, guardians, students, classrooms, sections, grades, stages, or school. |
| Announcements | `src/modules/parent-app/announcements/controller/parent-announcements.controller.ts` | GET | `/parent/announcements/:announcementId` | `getAnnouncement` | `GetParentAnnouncementUseCase` | Read | yes | none | `communication.announcements.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Reads one visible published announcement. |
| Announcements | `src/modules/parent-app/announcements/controller/parent-announcements.controller.ts` | POST | `/parent/announcements/:announcementId/read` | `markRead` | `MarkParentAnnouncementReadUseCase` | Write | yes | none | `communication.announcements.read` | yes | yes | no | 403 `auth.scope.missing` | yes | Creates/updates current-parent announcement read row. |
| Announcements | `src/modules/parent-app/announcements/controller/parent-announcements.controller.ts` | GET | `/parent/announcements/:announcementId/attachments` | `listAttachments` | `ListParentAnnouncementAttachmentsUseCase` | Read | yes | none | `communication.announcements.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Lists safe attachment file metadata for a visible announcement. |
| Files | `src/modules/parent-app/files/controller/parent-files.controller.ts` | GET | `/parent/children/:studentId/files/:fileId/download` | `downloadChildFile` | `GetParentChildFileDownloadUrlUseCase` | Read | yes + storage redirect | none | `files.downloads.view`, `reinforcement.submissions.view` | yes | yes | no | 403 `auth.scope.missing` | yes | Download is currently for owned-child reinforcement task proof files only. |

Shared file access inspected:

- `src/modules/files/uploads/controller/uploads.controller.ts` uses `@RequiredPermissions('files.uploads.manage')` on `POST /files`.
- `src/modules/files/uploads/controller/uploads.controller.ts` uses `@RequiredPermissions('files.downloads.view')` on `GET /files/:id/download`.
- Parent message sending accepts attachment `fileId` values, so Parent role should receive `files.uploads.manage` only if the current Parent App message attachment flow is intended to let parents upload files before sending messages. The current DTO/use case supports that flow.

## 5. Proposed Permission Naming Decisions

| Permission code | Module | Resource | Action | Reason | Existing or new | Should parent get it? | Should student get it? | Should teacher get it? | App-facing self-service / monitoring / dashboard-admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `parent.home.view` | parent | home | view | Parent home aggregate is not a core domain resource. | new | yes | no | no | parent app-facing monitoring |
| `parent.children.view` | parent | children | view | Own-child list/detail is a Parent App aggregate/visibility surface. | new | yes | no | no | parent app-facing monitoring |
| `parent.profile.view` | parent | profile | view | Current parent self profile route. | new | yes | no | no | parent self-service |
| `parent.progress.view` | parent | progress | view | Aggregate progress screens compose grades, behavior, attendance, and XP. | new | yes | no | no | parent app-facing monitoring |
| `parent.reports.view` | parent | reports | view | Parent reports are app-facing derived summaries, not dashboard report management. | new | yes | no | no | parent app-facing monitoring |
| `students.records.view` | students | records | view | Owned child identity/display data. | existing | yes | yes | maybe | domain monitoring |
| `students.enrollments.view` | students | enrollments | view | Child list/detail expose owned enrollment id, academic year/term, classroom hierarchy. | existing | yes | no | maybe | domain monitoring; verify dashboard routes do not rely on permission alone |
| `students.guardians.view` | students | guardians | view | Parent profile reads current Guardian relation/isPrimary internally. | existing | no for route-level Parent App coverage | no | maybe | dashboard/domain read; avoid granting unless a future parent-facing Guardian detail route exists |
| `students.documents.view` | students | documents | view | Child detail does not expose documents. | existing | no | no | maybe | dashboard/domain read |
| `students.medical.view` | students | medical | view | Child detail does not expose medical data. | existing | no | no | maybe | dashboard/domain read |
| `academics.timetable.view` | academics | timetable | view | Parent schedule and lesson week read published timetable settings/entries. | existing | yes | yes | yes | monitoring |
| `academics.calendar.view` | academics | calendar | view | Parent calendar uses app-facing calendar visibility. | existing | yes | yes | yes | monitoring |
| `academics.subjects.view` | academics | subjects | view | Subject names/codes appear in grades, progress, homeworks, schedule, tasks, lessons. | existing | yes | yes | yes | monitoring |
| `academics.lesson_plans.view` | academics | lesson_plans | view | Parent lessons are based on active lesson plan items. | existing | yes | yes | yes | monitoring |
| `academics.curriculum.view` | academics | curriculum | view | Lesson detail/today/week expose curriculum title, unit title, lesson title/objectives, content body/url/file metadata. | existing | yes | consider for Student lesson routes separately | yes | monitoring, but broad domain read risk must be tested |
| `attendance.sessions.view` | attendance | sessions | view | Attendance entries are reached through submitted sessions for summaries. | existing | yes | yes | yes | monitoring |
| `attendance.absences.view` | attendance | absences | view | Parent behavior/progress/discipline expose absence/lateness/attendance incident counts. | existing | yes | no | maybe | monitoring |
| `grades.assessments.view` | grades | assessments | view | Parent grades expose visible published/approved assessments. | existing | yes | yes | yes | monitoring |
| `grades.gradebook.view` | grades | gradebook | view | Parent grades read owned grade item data. | existing | yes | no | yes | monitoring |
| `grades.snapshots.view` | grades | snapshots | view | Not used by current Parent App code. | existing | no | yes | yes | monitoring if future route uses snapshots |
| `grades.submissions.view` | grades | submissions | view | Assessment grade detail can include grade submission status/score. | existing | yes | yes | yes | monitoring |
| `homework.assignments.view` | homework | assignments | view | Parent homework list/detail read visible assignments. | existing | yes | yes | yes | monitoring |
| `homework.submissions.view` | homework | submissions | view | Parent homework detail reads existing submissions/answers/attachments. | existing | yes | yes | yes | monitoring |
| `behavior.records.view` | behavior | records | view | Parent behavior/progress/discipline read approved behavior records. | existing | yes | yes | yes | monitoring |
| `behavior.points.view` | behavior | points | view | Parent behavior/progress read behavior point ledger summaries. | existing | yes | yes | yes | monitoring |
| `discipline.timeline.view` | discipline | timeline | view | Parent discipline route is explicitly a derived timeline/summary. | existing | yes | yes | yes | monitoring |
| `reinforcement.tasks.view` | reinforcement | tasks | view | Parent task/home aggregate read assigned reinforcement tasks. | existing | yes | yes | yes | monitoring |
| `reinforcement.submissions.view` | reinforcement | submissions | view | Parent task detail/submission/file download read existing task submissions/proofs. | existing | yes | yes | yes | monitoring |
| `reinforcement.xp.view` | reinforcement | xp | view | Parent progress, hero, and rewards read XP summary. | existing | yes | yes | yes | monitoring |
| `reinforcement.hero.view` | reinforcement | hero | view | Parent reads published Hero missions/overview. | existing | yes | yes | yes | monitoring |
| `reinforcement.hero.progress.view` | reinforcement | hero_progress | view | Parent reads child's Hero progress only. | existing | yes | yes | yes | monitoring |
| `reinforcement.hero.badges.view` | reinforcement | hero_badges | view | Parent reads earned badges. | existing | yes | yes | yes | monitoring |
| `reinforcement.rewards.view` | reinforcement | rewards | view | Parent reads published rewards catalog and eligibility. | existing | yes | yes | yes | monitoring |
| `reinforcement.rewards.redemptions.view` | reinforcement | reward_redemptions | view | Parent reads existing child redemptions; no request action. | existing | yes | yes | yes | monitoring |
| `communication.contacts.view` | communication | contacts | view | Parent contacts are teacher contacts for owned child classrooms. | existing | yes | yes | yes | app communication |
| `communication.conversations.view` | communication | conversations | view | Parent lists/opens conversations where current parent participates. | existing | yes | yes | yes | app communication |
| `communication.conversations.create` | communication | conversations | create | Parent creates/reuses direct conversations with visible teacher contacts. | existing | yes | yes | yes | app self-service |
| `communication.conversations.read` | communication | conversations | read | Parent marks own conversations read. | existing | yes | yes | yes | app self-service |
| `communication.messages.view` | communication | messages | view | Parent reads/searches visible messages and metadata. | existing | yes | yes | yes | app communication |
| `communication.messages.send` | communication | messages | send | Parent sends messages in visible conversations. | existing | yes | yes | yes | app self-service |
| `communication.messages.attachments.manage` | communication | messages.attachments | manage | Current Parent App has no standalone attachment-management route. | existing | no | yes | no unless teacher flow needs it | app self-service, but not route-level for parent send |
| `communication.announcements.view` | communication | announcements | view | Parent lists/opens visible announcements and attachments metadata. | existing | yes | yes | yes | app communication |
| `communication.announcements.read` | communication | announcements | read | Parent marks own announcement read state. | existing | yes | yes | yes | app self-service |
| `communication.notifications.view` | communication | notifications | view | Parent notification center reads current user's notifications. | existing | yes | yes | yes | app communication |
| `communication.notifications.read` | communication | notifications | read | Parent marks own notifications read. | existing | yes | yes | yes | app self-service |
| `communication.notifications.archive` | communication | notifications | archive | Parent archives own notifications. | existing | yes | yes | yes | app self-service |
| `communication.notifications.preferences.manage` | communication | notification_preferences | manage | Parent updates own notification preferences. | existing | yes | yes | yes | app self-service |
| `app.device_tokens.manage` | app | device_tokens | manage | Parent registers/unregisters own app device tokens. | existing | yes | yes | yes | app self-service |
| `files.downloads.view` | files | downloads | view | Parent secure downloads for message attachments and task proof files. | existing | yes | yes | maybe | app file access |
| `files.uploads.manage` | files | uploads | manage | Needed only for parent message attachment upload flow through shared `/files`. | existing | yes, if attachment upload is supported | yes | yes | app file upload |

Resolved route-specific decisions:

- Parent child detail should require `parent.children.view`, `students.records.view`, and `students.enrollments.view`. It should not require `students.guardians.view`, `students.documents.view`, or `students.medical.view`.
- Parent child detail does not expose documents or medical data; do not grant `students.documents.view` or `students.medical.view`.
- Parent lesson routes expose curriculum content and should require `academics.curriculum.view` in addition to `academics.lesson_plans.view`.
- Parent message send should require `communication.messages.send`; do not require `communication.messages.attachments.manage` on the send route.
- Parent file upload should use `files.uploads.manage` only through shared `/files` if parent message attachments are supported.
- Parent aggregate progress/reports should use `parent.progress.view` / `parent.reports.view`; specific detailed domain routes should use domain read permissions.

## 6. Current Parent Role Gap

Current Parent role permissions in `prisma/seeds/02-system-roles.seed.ts`:

```text
attendance.sessions.view
grades.assessments.view
reinforcement.tasks.view
students.records.view
```

Recommended final `PARENT_PERMISSIONS` list:

```text
app.device_tokens.manage
academics.calendar.view
academics.curriculum.view
academics.lesson_plans.view
academics.subjects.view
academics.timetable.view
attendance.absences.view
attendance.sessions.view
behavior.points.view
behavior.records.view
communication.announcements.read
communication.announcements.view
communication.contacts.view
communication.conversations.create
communication.conversations.read
communication.conversations.view
communication.messages.send
communication.messages.view
communication.notifications.archive
communication.notifications.preferences.manage
communication.notifications.read
communication.notifications.view
discipline.timeline.view
files.downloads.view
files.uploads.manage
grades.assessments.view
grades.gradebook.view
grades.submissions.view
homework.assignments.view
homework.submissions.view
parent.children.view
parent.home.view
parent.profile.view
parent.progress.view
parent.reports.view
reinforcement.hero.badges.view
reinforcement.hero.progress.view
reinforcement.hero.view
reinforcement.rewards.redemptions.view
reinforcement.rewards.view
reinforcement.submissions.view
reinforcement.tasks.view
reinforcement.xp.view
students.enrollments.view
students.records.view
```

Permissions already in catalog:

```text
app.device_tokens.manage
academics.calendar.view
academics.curriculum.view
academics.lesson_plans.view
academics.subjects.view
academics.timetable.view
attendance.absences.view
attendance.sessions.view
behavior.points.view
behavior.records.view
communication.announcements.read
communication.announcements.view
communication.contacts.view
communication.conversations.create
communication.conversations.read
communication.conversations.view
communication.messages.send
communication.messages.view
communication.notifications.archive
communication.notifications.preferences.manage
communication.notifications.read
communication.notifications.view
discipline.timeline.view
files.downloads.view
files.uploads.manage
grades.assessments.view
grades.gradebook.view
grades.submissions.view
homework.assignments.view
homework.submissions.view
reinforcement.hero.badges.view
reinforcement.hero.progress.view
reinforcement.hero.view
reinforcement.rewards.redemptions.view
reinforcement.rewards.view
reinforcement.submissions.view
reinforcement.tasks.view
reinforcement.xp.view
students.enrollments.view
students.records.view
```

Permissions missing from catalog:

```text
parent.children.view
parent.home.view
parent.profile.view
parent.progress.view
parent.reports.view
```

Permissions that must never be granted to parent unless a future dedicated security decision says otherwise:

```text
students.records.manage
students.guardians.manage
students.enrollments.manage
students.documents.manage
students.medical.manage

grades.items.manage
grades.assessments.manage
grades.assessments.publish
grades.assessments.approve
grades.assessments.lock
grades.submissions.submit
grades.submissions.review

homework.submissions.save
homework.submissions.submit
homework.answers.manage
homework.submission_attachments.manage

reinforcement.submissions.submit
reinforcement.rewards.redemptions.request
reinforcement.hero.missions.start
reinforcement.hero.missions.complete
reinforcement.hero.objectives.complete

communication.conversations.manage
communication.participants.manage
communication.messages.edit
communication.messages.delete
communication.messages.moderate
communication.notifications.manage
communication.announcements.manage
communication.admin.view
communication.admin.manage

settings.*
platform.*
```

Parent App is not allowed to act as a student for homework, exams, reinforcement tasks, reward redemption, or Hero progress actions.

## 7. Required Implementation Plan After Audit

### PARENT-PERM-1A - Permission Catalog + Parent Role Seed

**Goal:** add missing parent app-facing permission catalog entries and expand `PARENT_PERMISSIONS`.

**Files likely changed:**

```text
prisma/seeds/01-permissions.seed.ts
prisma/seeds/02-system-roles.seed.ts
```

**Routes covered:** no controller behavior changes.

**Permissions involved:** all recommended final Parent role permissions, with new `parent.*` catalog entries.

**Tests required:**

- Seed-level or E2E assertion that `/auth/me` returns expanded `activeMembership.permissions` for parent.
- Regression that current Student permissions remain unchanged.

**Main risks:**

- Reusing broad existing domain read permissions can expose non-Parent App routes if those routes rely only on permission and do not enforce user type/resource visibility. Audit high-risk dashboard routes before merging if this concern is not already covered by tests.
- `files.uploads.manage` is justified only by current message attachment upload flow; remove it if product decides parents cannot send attachments.

**Explicitly out of scope:** decorators, controller behavior, tests for missing-permission denial, migrations.

### PARENT-PERM-1B - Read-only Parent App Route Decorators

**Goal:** add `@RequiredPermissions()` to read-only Parent App routes.

**Files likely changed:**

```text
src/modules/parent-app/**/controller/*.ts
test/security/tenancy.parent-app.spec.ts
test/e2e/parent-app-final-closeout.e2e-spec.ts
test/e2e/parent-app-child-lessons.e2e-spec.ts
test/security/tenancy.parent-app-child-lessons.spec.ts
```

**Routes covered:** home, children, profile, grades, homeworks, behavior, discipline, progress, reports, schedule, calendar, lessons, tasks, hero, rewards, message reads, notification reads, announcement reads, files download.

**Permissions involved:** read permissions in the route matrix.

**Tests required:**

- Parent with required permission can call each representative route.
- Parent missing permission receives 403 `auth.scope.missing`.
- Parent with permission still cannot access another parent's child.
- Cross-school and same-school unlinked children remain hidden.
- No response shape changes.

**Main risks:** multi-permission decorators can over-deny if the parent role seed misses one required code.

**Explicitly out of scope:** action/write decorators, seed changes beyond 1A.

### PARENT-PERM-1C - Communication / Notifications Parent Action Permissions

**Goal:** add decorators to Parent App self-service write routes.

**Files likely changed:**

```text
src/modules/parent-app/messages/controller/parent-messages.controller.ts
src/modules/parent-app/notifications/controller/parent-notifications.controller.ts
src/modules/parent-app/announcements/controller/parent-announcements.controller.ts
test/security/tenancy.parent-app.spec.ts
test/e2e/parent-app-final-closeout.e2e-spec.ts
```

**Routes covered:**

```text
POST /parent/messages/conversations
POST /parent/messages/conversations/:conversationId/messages
POST /parent/messages/conversations/:conversationId/read
POST /parent/announcements/:announcementId/read
POST /parent/notifications/read-all
POST /parent/notifications/:notificationId/read
POST /parent/notifications/:notificationId/archive
PATCH /parent/notifications/preferences
POST /parent/notifications/device-tokens
DELETE /parent/notifications/device-tokens/current
```

**Permissions involved:** `communication.conversations.create`, `communication.messages.send`, `communication.conversations.read`, `communication.announcements.read`, `communication.notifications.read`, `communication.notifications.archive`, `communication.notifications.preferences.manage`, `app.device_tokens.manage`.

**Tests required:**

- Parent with action permission can perform current-parent action.
- Parent missing action permission receives 403 `auth.scope.missing`.
- Parent with action permission cannot target hidden conversation/announcement/notification/device token.
- Parent cannot use student-only or admin communication permissions as a substitute.

**Main risks:** message attachments require the shared `/files` upload permission if parent uploads are supported.

**Explicitly out of scope:** message edit/delete/moderation, announcement management, notification admin management.

### PARENT-PERM-1D - Final Parent Permission Closeout + Regression Audit

**Goal:** close static inventory and end-to-end regression coverage.

**Files likely changed:**

```text
test/security/tenancy.parent-app.spec.ts
test/e2e/parent-app-final-closeout.e2e-spec.ts
test/security/tenancy.files.spec.ts
test/e2e/files-upload-download.e2e-spec.ts
optional static route inventory test file
```

**Routes covered:** all 68 Parent App handlers plus shared `/files` upload/download flows when used by Parent App.

**Permissions involved:** entire final Parent role set.

**Tests required:**

- Static route inventory catches missing/wrong decorators.
- Missing-permission denial for each permission family.
- Ownership/no-leak regressions.
- Shared file flow with `files.uploads.manage` and `files.downloads.view`.

**Main risks:** future Parent App routes can silently omit decorators unless static inventory is enforced.

**Explicitly out of scope:** new features, response DTO changes, permission grants outside Parent App needs.

## 8. Required Test Plan For Later Sprints

Later sprints must prove:

- `/auth/me` returns expanded `activeMembership.permissions` for parent.
- Parent with required permission can call the route.
- Parent missing required permission receives 403 `auth.scope.missing`.
- Parent with permission still cannot access another parent's child resources.
- Cross-school guessed child IDs remain hidden with existing safe not-found behavior.
- Same-school but unlinked children remain hidden.
- Non-parent actors are rejected.
- Parent without Guardian record is rejected.
- Parent without active linked child enrollment is rejected.
- No no-leak fields are added to app-facing responses.
- File upload/download still requires `files.uploads.manage` / `files.downloads.view` where applicable.
- No dashboard/admin permissions are required for Parent App self-service routes.
- Parent cannot perform student-only actions such as homework submit, exam submit, task submit, reward redeem, or Hero mission start/complete.

Existing tests likely to expand:

```text
test/security/tenancy.parent-app.spec.ts
test/e2e/parent-app-final-closeout.e2e-spec.ts
test/security/tenancy.files.spec.ts
test/e2e/files-upload-download.e2e-spec.ts
test/e2e/parent-app-child-lessons.e2e-spec.ts
test/security/tenancy.parent-app-child-lessons.spec.ts
src/modules/parent-app/**/tests/*.spec.ts
```

Recommended final static route inventory test:

```text
Discover Parent App controller HTTP handlers via Nest route metadata.
Compare discovered handlers to an explicit expected permission inventory.
Fail if a Parent App route handler has no @RequiredPermissions().
Fail if a Parent App route handler has the wrong permission list.
Fail if a new Parent App handler exists but is not included in the inventory.
```

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
notification routing internals
message moderation/admin internals
reward review/admin internals
Hero progress internals
```

Authorized redirects/download flows may still return temporary redirect targets through existing secure endpoints, but JSON response DTOs should not expose storage internals.

Observed no-leak notes from current code:

- Child detail does not expose documents, medical records, Guardian user ids, `Student.userId`, or `Student.applicationId`.
- Lesson content exposes safe file metadata only, not bucket/object key.
- Message attachment presenters expose app download paths and authorized parent paths, not signed URLs.
- Parent task proof download and message attachment preview/download produce redirect URLs after use-case access checks.

## 10. Final Recommendation

**Is this ready for implementation?** yes, as a staged implementation.

**Recommended next sprint:** `PARENT-PERM-1A - Permission Catalog + Parent Role Seed`.

**Open naming decisions:** none blocking. The audit resolves the requested decisions as:

- use new `parent.*.view` permissions for Parent App aggregate surfaces;
- use domain read permissions only for route-specific domain reads;
- do not grant parent student-action/admin/manage permissions;
- do not grant `students.documents.view`, `students.medical.view`, `students.guardians.view`, `communication.messages.attachments.manage`, or reward/Hero action permissions for current Parent App behavior.

**Final verdict:** READY FOR PARENT-PERM-1A
