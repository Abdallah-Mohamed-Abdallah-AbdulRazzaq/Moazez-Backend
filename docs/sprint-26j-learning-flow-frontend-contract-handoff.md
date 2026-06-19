# Sprint 26J — Learning Flow Frontend Contract Handoff

## 1. Executive Summary

Handoff status: **LEARNING_FLOW_FRONTEND_CONTRACT_READY_WITH_DEFERRED_ITEMS**

Backend baseline commit: `8ddfaf4 fix: close parent learning flow backend`

This document translates the implemented Moazez backend learning flow into a practical frontend integration contract. It covers Student App learning routes, Parent App learning routes, Teacher App learning/review surfaces where implemented, Reinforcement task/review/XP/Hero/Reward rules exposed through app modules, and the Attendance/Behavior/Discipline read boundaries used by learning dashboards.

This sprint is frontend integration documentation only. It does not add routes, aliases, DTOs, presenters, permissions, schema, migrations, or runtime behavior.

Recommended next sprint: **Sprint 26K — Frontend Integration Readiness / OpenAPI Alignment**

## 2. Global API Rules for Frontend

| Rule | Frontend contract |
| --- | --- |
| Base prefix | Every route is under `/api/v1`. Do not call unprefixed paths. |
| Authentication | Send a Bearer token for the current actor. |
| Role surfaces | Student App routes are under `/student`; Parent App routes are under `/parent`; Teacher App routes are under `/teacher`; Dashboard/Admin routes are separate. |
| Token separation | Do not reuse one role token against another app surface. Parent tokens must not call Student or Teacher routes, Student tokens must not call Parent routes, and so on. |
| 403 / 404 | Expect `403` for wrong actor/role where the backend can safely disclose the role boundary. Expect `404` for hidden child/resource cases where existence must not leak. |
| Resource hiding | Parent same-school unlinked child data and cross-school child data should be treated as not found. Student cross-owned resources are hidden or rejected according to endpoint policy. |
| Pagination | Routes with pagination generally accept `page` and `limit`; `limit` is capped at `100` where DTOs define it. Response shapes may use `pagination` or `meta` depending on the module. |
| Dates | Timestamps and date-time fields are ISO strings. Date-only filters use `YYYY-MM-DD` where DTOs require date strings. |
| Locale/display fields | Some records expose English/Arabic-derived display strings; frontend should display returned labels instead of recomputing names from internal fields. |
| Naming compatibility | Some app-facing responses intentionally include both camelCase and snake_case fields. This is route-specific compatibility, not a global guarantee. |
| Safe app ids | Stable app-safe ids include values such as `studentId`, `taskId`, `stageId`, `submissionId`, `rewardId`, `redemptionId`, `missionId`, `badgeId`, `homeworkId`, `assessmentId`, `lessonPlanItemId`, `conversationId`, `messageId`, `announcementId`, and safe `fileId` where returned. |
| Backend authority | Frontend should use backend status fields and backend errors as source of truth. Do not duplicate task, review, hero, reward, XP, homework, grade, attendance, behavior, or discipline state machines in the client. |

## 3. Forbidden Frontend Assumptions

Frontend must not expect app responses to expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `guardianId`
- `parentId`
- `studentGuardianId`
- `enrollmentId` unless explicitly returned by an existing app-safe route
- `assignmentId` unless explicitly app-safe on the existing route
- `createdById`
- `updatedById`
- `submittedById`
- `reviewedById`
- `approvedById`
- `rejectedById`
- `awardedById`
- `requestedById`
- `fulfilledById`
- `cancelledById`
- `passwordHash`
- `answerKey`
- `correctAnswer`
- `correctAnswers`
- `isCorrect`
- `xpLedgerId`
- `ledgerEntryId`
- `dedupeKey`
- `eligibilitySnapshot`
- raw `metadata`
- `objectKey`
- `bucket`
- `storageKey`
- `signedUrl`
- unsafe storage URL
- wallet, finance, marketplace, or payment fields

Additional frontend restrictions:

- Do not calculate XP from `BehaviorPointLedger` or behavior points.
- Do not treat behavior points as XP.
- Do not treat Discipline as a write surface; it is a read-only derived layer.
- Do not assume Parent can perform Student actions.
- Do not add UI affordances for deferred Parent task, homework, Hero, Reward, or XP mutations.
- Do not build object-storage URLs manually.

## 4. Student App Learning Contract

Student App routes are current-student scoped. The request body must not provide `studentId`, `enrollmentId`, `schoolId`, actor ids, reviewer ids, XP amounts, or status overrides unless a route-specific DTO explicitly accepts a safe display field.

### Student Home / Profile

| Method | Route | Purpose | Key fields and notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/student/home` | Current student home dashboard. | Returns `student`, `school`, `enrollment`, `today`, `summaries`, `student_summary`, `hero_journey_preview`, `required_today`, and `today_tasks`. `summaries.totalXp` is XpLedger-backed. `behaviorPoints` is behavior display only, not XP. |
| `GET` | `/api/v1/student/profile` | Current student profile and learning snapshot. | Returns `student`, `school`, `enrollment`, `student_profile`, `recent_badges`, `top_students`, `leaderboard`, and `unsupported`. Avatar upload, preferences, and seat number are marked unsupported. |

`enrollmentId` is intentionally app-safe in these current-student wrappers. Do not use it to call unrelated role surfaces.

### Student Schedule / Calendar / Lessons / Subjects

| Method | Route | Purpose | UI notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/student/schedule` | Current student daily schedule. | Uses current active enrollment context. |
| `GET` | `/api/v1/student/schedule/week` | Current student weekly schedule. | Use for week views. |
| `GET` | `/api/v1/student/calendar/events` | Student-visible calendar events. | Optional filters depend on controller DTO. |
| `GET` | `/api/v1/student/calendar/events/:eventId` | One visible student calendar event. | Hidden resources may return not found. |
| `GET` | `/api/v1/student/lessons/today` | Today's lessons. | Safe lesson/attachment metadata only. |
| `GET` | `/api/v1/student/lessons/week` | Week lessons. | Use for weekly lesson plans. |
| `GET` | `/api/v1/student/lessons/:lessonPlanItemId` | Lesson detail. | Do not expect raw lesson file storage metadata. |
| `GET` | `/api/v1/student/subjects` | Current student subjects. | App-safe subject cards. |
| `GET` | `/api/v1/student/subjects/:subjectId` | Subject detail. | Subject ids are app-safe. |

### Student Grades / Exams

| Method | Route | Purpose | Key request and response notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/student/grades` | Current student grade list. | App-safe grade summaries only. |
| `GET` | `/api/v1/student/grades/summary` | Grade summary. | Use backend percentage/status fields. |
| `GET` | `/api/v1/student/grades/assessments/:assessmentId` | Assessment grade detail. | Does not expose answer keys or raw grading internals. |
| `GET` | `/api/v1/student/exams` | Student exam list grouped by subject. | Query supports `subjectId`, `type`, `status`, `page`, `limit`. |
| `GET` | `/api/v1/student/exams/:assessmentId` | Exam detail. | Response includes safe stages/questions/options, not answer keys. |
| `GET` | `/api/v1/student/exams/:assessmentId/submission` | Current student's exam submission state. | Own submission only. |
| `POST` | `/api/v1/student/exams/:assessmentId/start` | Start own exam submission. | Backend controls state transition. |
| `PUT` | `/api/v1/student/exams/:assessmentId/submission/answers` | Bulk save exam answers. | Body uses `answers[]` with `questionId`, optional `answerText`, `answerJson`, `selectedOptionIds`. |
| `PATCH` | `/api/v1/student/exams/:assessmentId/submission/answers/:questionId` | Save one answer. | Current student's active submission only. |
| `POST` | `/api/v1/student/exams/:assessmentId/submission/submit` | Submit own exam. | Backend controls final submission state. |

Frontend must not expect `answerKey`, `correctAnswer`, `correctAnswers`, or `isCorrect` in Student responses.

### Student Homeworks

| Method | Route | Purpose | Key request and response notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/student/homeworks` | List assigned homework. | Query supports `status`, `mode`, `dueFrom`, `dueTo`, `search`, `page`, `limit`. |
| `GET` | `/api/v1/student/homeworks/:homeworkId` | Homework detail. | Includes safe questions, attachments, and current submission if present. |
| `GET` | `/api/v1/student/homeworks/:homeworkId/submission` | Current submission. | Own submission only. |
| `PUT` | `/api/v1/student/homeworks/:homeworkId/submission` | Save submission body/answers. | Body supports `bodyText` and optional `answers`. |
| `POST` | `/api/v1/student/homeworks/:homeworkId/submission/draft` | Save draft. | Backend owns draft state. |
| `GET` | `/api/v1/student/homeworks/:homeworkId/submission/answers` | List current answers. | Own submission only. |
| `PUT` | `/api/v1/student/homeworks/:homeworkId/submission/answers` | Bulk save answers. | Uses shared homework answer DTO. |
| `PATCH` | `/api/v1/student/homeworks/:homeworkId/submission/answers/:questionId` | Save one answer. | Own answer only. |
| `GET` | `/api/v1/student/homeworks/:homeworkId/submission/attachments` | List own submission attachments. | Safe file metadata only. |
| `POST` | `/api/v1/student/homeworks/:homeworkId/submission/attachments` | Attach a file to own submission. | File must be safe/authorized by Files module. |
| `PATCH` | `/api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId` | Update own attachment metadata. | No raw storage fields. |
| `PATCH` | `/api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId/reorder` | Reorder own attachment. | Backend validates ownership. |
| `DELETE` | `/api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId` | Remove own attachment. | Only before backend-disallowed terminal states. |
| `POST` | `/api/v1/student/homeworks/:homeworkId/submit` | Submit homework. | Existing compatibility route. |
| `POST` | `/api/v1/student/homeworks/:homeworkId/submission/submit` | Submit homework submission. | Preferred explicit submission route. |

Student homework responses may include `reviewNote`, `awardedMarks`, answer feedback, and reviewed timestamps after review. They must not expose answer keys or teacher/admin internals.

### Student Tasks / Reinforcement

| Method | Route | Purpose | Contract |
| --- | --- | --- | --- |
| `GET` | `/api/v1/student/tasks` | List current student's reinforcement task assignments. | Query supports `status`, `search`, `page`, `limit`. Cancelled tasks are not surfaced as active work. |
| `GET` | `/api/v1/student/tasks/summary` | Task counts. | Returns `total`, `pending`, `inProgress`, `underReview`, `completed`, `overdue` plus snake_case aliases. |
| `GET` | `/api/v1/student/tasks/:taskId` | Task detail. | Includes stages, submissions, reward display, subject display, progress, and safe proof metadata. |
| `GET` | `/api/v1/student/tasks/:taskId/submissions` | Own task submissions. | Uses `taskId`; assignment is resolved server-side. |
| `GET` | `/api/v1/student/tasks/:taskId/submissions/:submissionId` | One own submission. | Hidden if not owned by current student. |
| `POST` | `/api/v1/student/tasks/:taskId/stages/:stageId/submit` | Submit proof for own assigned task stage. | Body supports `proofText?: string` and `proofFileId?: string`. No `studentId`, `assignmentId`, status, XP, reward, or reviewer fields. |

Key response fields include `taskId`, `assignmentId`/`assignment_id` where already app-safe, `title`, `description`, `source`, `status`, `reward`, `progress`, `dueDate`, `subject`, `stages`, `submissions`, and per-submission `submissionId`, `status`, `submittedAt`, `reviewedAt`, `proofText`, `proofFile`.

Student task submission delegates to Reinforcement core. Submission does not grant XP, create behavior points, create reward redemptions, complete Hero missions, or approve/reject itself.

### Student Progress / Behavior / Discipline / XP

| Method | Route | Purpose | Contract |
| --- | --- | --- | --- |
| `GET` | `/api/v1/student/progress` | Overall learning progress snapshot. | Combines academic, behavior, and XP read models. |
| `GET` | `/api/v1/student/progress/academic` | Grade-backed academic progress. | Uses grades/assessment data. |
| `GET` | `/api/v1/student/progress/behavior` | Attendance/behavior display summary. | May include behavior point totals, but these are not XP. |
| `GET` | `/api/v1/student/progress/xp` | XP summary. | XpLedger-backed only; response includes `totalXp`, `entriesCount`, `bySource`, and unsupported rank/tier/level markers where no policy exists. |
| `GET` | `/api/v1/student/behavior` | Approved behavior records. | Behavior core/read model. |
| `GET` | `/api/v1/student/behavior/summary` | Behavior summary. | Behavior points are behavior-domain points only. |
| `GET` | `/api/v1/student/behavior/:recordId` | Behavior detail. | Own visible behavior record only. |
| `GET` | `/api/v1/student/discipline` | Derived discipline timeline. | Read-only derived layer from Attendance + approved Behavior. |
| `GET` | `/api/v1/student/discipline/summary` | Discipline summary. | No discipline mutation route exists. |

### Student Hero

| Method | Route | Purpose | Contract |
| --- | --- | --- | --- |
| `GET` | `/api/v1/student/hero` | Hero overview. | Returns `stats`, `levels`, `progress`, `badges`, `rewardsSummary`, `unsupported`. |
| `GET` | `/api/v1/student/hero/progress` | Mission progress summary. | Current student only. |
| `GET` | `/api/v1/student/hero/badges` | Earned badges. | Safe badge summaries only. |
| `GET` | `/api/v1/student/hero/missions` | Visible missions. | Query supports `subjectId`, `status`, `page`, `limit`; visibility is published/in-scope. |
| `GET` | `/api/v1/student/hero/missions/:missionId` | Mission detail. | Includes objectives, rewards display, progress, unsupported policy fields. |
| `POST` | `/api/v1/student/hero/missions/:missionId/start` | Start own available mission. | Empty body only; backend ignores identity fields because DTO forbids them. |
| `POST` | `/api/v1/student/hero/missions/:missionId/complete` | Complete own started/completable mission. | Empty body only; core state machine controls validity. |
| `POST` | `/api/v1/student/hero/missions/:missionId/objectives/:objectiveId/complete` | Complete own objective. | Empty body only; objective must belong to mission and current student's progress. |

Student Hero actions delegate to Hero Journey core. Student App does not directly grant XP, award badges, create rewards, create RewardRedemption, or touch wallet/finance/marketplace state. If a future core Hero use-case gains XP/badge side effects, those must remain core-owned, audited, XpLedger-backed for XP, and idempotent.

### Student Rewards / Redemptions

| Method | Route | Purpose | Contract |
| --- | --- | --- | --- |
| `GET` | `/api/v1/student/rewards` | List available rewards. | Query supports `type`, `page`, `limit`. Response includes `rewards`, `pagination`, and XpLedger-backed `xp.totalEarnedXp`. |
| `GET` | `/api/v1/student/rewards/:rewardId` | Reward detail. | Visible reward only. |
| `GET` | `/api/v1/student/rewards/redemptions` | List current student's redemptions. | Current student only. |
| `GET` | `/api/v1/student/rewards/redemptions/:redemptionId` | Redemption detail. | Current student's redemption only. |
| `POST` | `/api/v1/student/rewards/:rewardId/redeem` | Request redemption for self. | Body accepts optional `note?: string`; no identity, XP, status, approval, fulfillment, wallet, or payment fields. |

Reward response fields include `rewardId`, `title`, `description`, `type`, `displayType`, `minTotalXp`, `requiredXp`, `isRedeemable`, `insufficientXp`, `isUnlimited`, `stockRemaining`, `availabilityStatus`, optional safe `image`, and redemption `status`, `requestSource`, timestamps, `note`, `nextAction`.

Current V1 redemption model is request/status based. It does not spend or deduct XP. Affordability is calculated from XpLedger positive XP totals, not from Behavior points. Duplicate open redemption is backend-controlled and should be treated as a conflict/safe duplicate response.

### Student Messages / Announcements

| Method | Route | Purpose | Contract |
| --- | --- | --- | --- |
| `GET` | `/api/v1/student/messages/conversations` | List student conversations. | Safe conversation summaries. |
| `GET` | `/api/v1/student/messages/conversations/:conversationId` | Conversation detail. | Current student audience only. |
| `GET` | `/api/v1/student/messages/conversations/:conversationId/messages` | Conversation messages. | Safe attachments only. |
| `POST` | `/api/v1/student/messages/conversations/:conversationId/messages` | Send message where conversation policy permits. | Communication mutation only. |
| `POST` | `/api/v1/student/messages/conversations/:conversationId/read` | Mark conversation read. | Communication read-state mutation. |
| `GET` | `/api/v1/student/announcements` | List visible announcements. | Current student audience only. |
| `GET` | `/api/v1/student/announcements/:announcementId` | Announcement detail. | Visible announcement only. |
| `GET` | `/api/v1/student/announcements/:announcementId/attachments` | Safe announcement attachments. | Safe file metadata only. |
| `POST` | `/api/v1/student/announcements/:announcementId/read` | Mark announcement read. | Read-state mutation only. |

## 5. Parent App Learning Contract

Parent App learning routes are child-scoped and read-only except existing communication state mutations:

- message send
- conversation read
- announcement read

Every child-scoped route uses `:studentId` and validates active parent/guardian relationship, active current-school child, and active enrollment where required. Same-school unlinked children and cross-school children are hidden.

### Home / Profile / Children

| Method | Route | Purpose | Child-scoping and UI notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/parent/home` | Parent home overview. | Returns parent display, school display, linked children, summaries. |
| `GET` | `/api/v1/parent/profile` | Parent profile. | No `guardianId` leak. |
| `GET` | `/api/v1/parent/children` | Linked children list. | Returns only active linked children. |
| `GET` | `/api/v1/parent/children/:studentId` | Linked child detail. | Hidden if child is unlinked/cross-school/inactive. |

`studentId` is intentionally app-safe in Parent child wrappers. `enrollmentId` is intentionally app-safe in existing child/profile/progress wrappers only; do not generalize it to other APIs.

### Schedule / Calendar / Lessons

| Method | Route | Purpose | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/parent/children/:studentId/schedule/today` | Child schedule today. | Linked child only. |
| `GET` | `/api/v1/parent/children/:studentId/schedule/weekly` | Child weekly schedule. | Linked child only. |
| `GET` | `/api/v1/parent/children/:studentId/calendar/events` | Child calendar events. | Linked child only. |
| `GET` | `/api/v1/parent/children/:studentId/calendar/events/:eventId` | Child calendar event detail. | Hidden if not child-visible. |
| `GET` | `/api/v1/parent/children/:studentId/lessons/today` | Child lessons today. | Safe lesson data. |
| `GET` | `/api/v1/parent/children/:studentId/lessons/week` | Child lessons this week. | Safe lesson data. |
| `GET` | `/api/v1/parent/children/:studentId/lessons/:lessonPlanItemId` | Child lesson detail. | Safe attachments only. |

### Grades / Homeworks

| Method | Route | Purpose | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/parent/children/:studentId/grades` | Child grades list. | Read-only. |
| `GET` | `/api/v1/parent/children/:studentId/grades/summary` | Child grade summary. | Read-only. |
| `GET` | `/api/v1/parent/children/:studentId/grades/assessments/:assessmentId` | Child assessment detail. | No answer keys/correct answers. |
| `GET` | `/api/v1/parent/children/:studentId/homeworks` | Child homework list. | Read-only. |
| `GET` | `/api/v1/parent/children/:studentId/homeworks/:homeworkId` | Child homework detail. | Includes safe assignment/submission/review display where allowed. |

No Parent homework save, submit, answer, attachment, or review routes are exposed.

### Tasks / Reinforcement

| Method | Route | Purpose | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/parent/children/:studentId/tasks` | Linked child task list. | Query supports `status`, `search`, `page`, `limit`; no cancelled active work by default. |
| `GET` | `/api/v1/parent/children/:studentId/tasks/summary` | Linked child task summary. | Counts active/completed/pending/under-review/overdue. |
| `GET` | `/api/v1/parent/children/:studentId/tasks/:taskId` | Linked child task detail. | Includes stages, submissions, review display, reward display, safe proof metadata. |
| `GET` | `/api/v1/parent/children/:studentId/tasks/:taskId/submissions` | Linked child task submissions. | Child-scoped only. |
| `GET` | `/api/v1/parent/children/:studentId/tasks/:taskId/submissions/:submissionId` | Linked child task submission detail. | Child-scoped only. |

Parent task response fields include safe child wrapper, `taskId`, `title`, `description`, `source`, `status`, `reward`, `progress`, `progressPercent`, stage counts, `submissionStatus`, `reviewStatus`, due/assigned/latest activity timestamps, subject display, stages, submissions, proof text, and safe proof file metadata.

Parent task proof file metadata includes safe fields such as `fileId`, `filename`/`originalName`, `mimeType`, `size`/`sizeBytes`, `visibility`, and `createdAt`. Parent proof download remains deferred; Parent task proof responses do not expose a proof download path.

### Progress / Hero / XP / Rewards

| Method | Route | Purpose | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/parent/children/:studentId/progress` | Child progress overview. | Combines academic, behavior, and XP summaries. |
| `GET` | `/api/v1/parent/children/:studentId/progress/academic` | Child academic progress. | Grade-backed. |
| `GET` | `/api/v1/parent/children/:studentId/progress/behavior` | Child behavior/attendance summary. | Behavior points are not XP. |
| `GET` | `/api/v1/parent/children/:studentId/progress/xp` | Child XP summary. | XpLedger-backed only. |
| `GET` | `/api/v1/parent/children/:studentId/hero` | Child Hero overview. | Read-only. |
| `GET` | `/api/v1/parent/children/:studentId/hero/progress` | Child Hero progress. | Read-only. |
| `GET` | `/api/v1/parent/children/:studentId/hero/badges` | Child badges. | Safe badge summaries. |
| `GET` | `/api/v1/parent/children/:studentId/hero/missions` | Child Hero missions. | Query supports `status`, `subjectId`, `page`, `limit`. |
| `GET` | `/api/v1/parent/children/:studentId/hero/missions/:missionId` | Child mission detail. | Read-only objective/progress display. |
| `GET` | `/api/v1/parent/children/:studentId/rewards` | Child-visible reward catalog. | XpLedger-backed affordability display. |
| `GET` | `/api/v1/parent/children/:studentId/rewards/:rewardId` | Child-visible reward detail. | Read-only. |
| `GET` | `/api/v1/parent/children/:studentId/rewards/redemptions` | Child redemptions. | Child-scoped only. |
| `GET` | `/api/v1/parent/children/:studentId/rewards/redemptions/:redemptionId` | Child redemption detail. | Child-scoped only. |

Parent can read child Hero/XP/Rewards but cannot start Hero missions, complete objectives, redeem rewards, approve rewards, fulfill rewards, or grant XP.

### Behavior / Discipline / Reports

| Method | Route | Purpose | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/parent/children/:studentId/behavior` | Child approved behavior records. | Behavior core/read model. |
| `GET` | `/api/v1/parent/children/:studentId/behavior/summary` | Child behavior summary. | Behavior points remain behavior-domain points. |
| `GET` | `/api/v1/parent/children/:studentId/behavior/:recordId` | Child behavior detail. | Child-scoped. |
| `GET` | `/api/v1/parent/children/:studentId/discipline` | Child discipline timeline. | Read-only derived from Attendance + approved Behavior. |
| `GET` | `/api/v1/parent/children/:studentId/discipline/summary` | Child discipline summary. | Read-only. |
| `GET` | `/api/v1/parent/children/:studentId/reports` | Child reports list. | Read-only. |
| `GET` | `/api/v1/parent/children/:studentId/reports/summary` | Child reports summary. | Read-only. |

### Messages / Announcements

| Method | Route | Purpose | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/parent/messages/conversations` | Parent conversations. | Parent audience only. |
| `GET` | `/api/v1/parent/messages/conversations/:conversationId` | Conversation detail. | Parent-accessible conversation only. |
| `GET` | `/api/v1/parent/messages/conversations/:conversationId/messages` | Conversation messages. | Safe attachment metadata only. |
| `POST` | `/api/v1/parent/messages/conversations/:conversationId/messages` | Send message where allowed. | Existing approved communication mutation. |
| `POST` | `/api/v1/parent/messages/conversations/:conversationId/read` | Mark conversation read. | Existing approved communication read-state mutation. |
| `GET` | `/api/v1/parent/announcements` | Parent announcements. | Parent audience only. |
| `GET` | `/api/v1/parent/announcements/:announcementId` | Announcement detail. | Visible announcement only. |
| `GET` | `/api/v1/parent/announcements/:announcementId/attachments` | Announcement attachments. | Safe file metadata only. |
| `POST` | `/api/v1/parent/announcements/:announcementId/read` | Mark announcement read. | Existing approved communication read-state mutation. |

### Forbidden Parent Expectations

Frontend must not expect or render controls for:

- Parent task create, submit, stage-submit, review, approve, reject, cancel, or complete.
- Parent homework save or submit.
- Parent grade, exam, attendance, behavior, discipline, or report mutation.
- Parent Hero start, complete, or objective-complete.
- Parent reward redeem.
- Parent XP grant.
- Parent child add/link.
- Parent avatar upload.
- Parent dashboard/global-dashboard route.
- Wallet, finance, marketplace, payment, or fulfillment behavior.

## 6. Teacher App Learning / Review Contract

Teacher App routes are teacher-allocation scoped. In Teacher App task and classroom flows, `classId` means the backend's teacher-owned allocation id where the module uses `TeacherSubjectAllocation.id`; frontend must not send `Classroom.id` unless that specific route's contract says otherwise.

### Teacher Home / Profile / Classes / Schedule

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/teacher/home` | Teacher home dashboard. |
| `GET` | `/api/v1/teacher/profile` | Teacher profile. |
| `GET` | `/api/v1/teacher/profile/employment` | Employment display information. |
| `GET` | `/api/v1/teacher/my-classes` | Owned classes/allocations list. |
| `GET` | `/api/v1/teacher/my-classes/:classId` | Owned class/allocation detail. |
| `GET` | `/api/v1/teacher/schedule` | Teacher daily schedule. |
| `GET` | `/api/v1/teacher/schedule/week` | Teacher weekly schedule. |
| `GET` | `/api/v1/teacher/calendar/events` | Teacher calendar events. |
| `GET` | `/api/v1/teacher/calendar/events/:eventId` | Teacher calendar event detail. |
| `GET` | `/api/v1/teacher/classroom/:classId` | Classroom/allocation learning context. |
| `GET` | `/api/v1/teacher/classroom/:classId/roster` | Owned class roster. |

### Teacher Reinforcement Tasks

| Method | Route | Purpose | Contract notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/teacher/tasks/dashboard` | Teacher task dashboard. | Owned teacher-created/assigned reinforcement task context. |
| `GET` | `/api/v1/teacher/tasks` | List Teacher App reinforcement tasks. | Query supports status/class/student/source/search/page/limit. |
| `GET` | `/api/v1/teacher/tasks/selectors` | Owned class/student selector data. | `classId` values are allocation ids. |
| `POST` | `/api/v1/teacher/tasks` | Create teacher reinforcement task. | `classIds` must be owned allocation ids; `studentIds` must belong to selected owned allocations; context is derived server-side. |
| `GET` | `/api/v1/teacher/tasks/:taskId` | Task detail. | Includes safe assignments, stages, submissions, proof metadata, and reward display. |

Teacher task reward semantics:

- `none` means no reward.
- `moral` is display reward.
- `points` maps to moral/display points.
- `financial` is display-only, not finance/wallet/marketplace.
- `xp` may be stored as task reward metadata, but XP ledger grant happens only through explicit approved core XP grant flow.

Teacher task creation does not create wallet/finance/marketplace records, RewardRedemption rows, or XP ledger entries.

### Teacher Review Queue

| Method | Route | Purpose | Contract notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/teacher/tasks/review-queue` | List visible task submissions. | Query supports `status`, `classId`, `studentId`, `search`, `page`, `limit`. |
| `GET` | `/api/v1/teacher/tasks/review-queue/:submissionId` | Submission review detail. | Review identity is `submissionId`, not `taskId + stageId`. |
| `POST` | `/api/v1/teacher/tasks/review-queue/:submissionId/approve` | Approve owned visible submission. | Delegates to Reinforcement core; safe notes/comment fields only. |
| `POST` | `/api/v1/teacher/tasks/review-queue/:submissionId/reject` | Reject owned visible submission. | Delegates to Reinforcement core; note/reason behavior follows core validation. |

Review queue responses include `submissionId`, `taskId`, task title, stage summary, student summary, class summary, status, proof text/file metadata, review summary, and reward summary. They do not expose reviewer ids or raw storage fields.

### Teacher XP Center

| Method | Route | Purpose | Contract notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/teacher/xp/dashboard` | Teacher-owned XP dashboard. | XpLedger-backed totals for owned students. |
| `GET` | `/api/v1/teacher/xp/classes/:classId` | XP list for owned class/allocation. | `classId` is allocation id. XP is not subject-specific. |
| `GET` | `/api/v1/teacher/xp/students/:studentId` | XP summary for owned student. | Same-school unowned students are hidden/rejected by backend policy. |
| `GET` | `/api/v1/teacher/xp/students/:studentId/history` | Owned student XP history. | Query supports source/search/page/limit. |

Teacher manual XP bonus grant remains deferred. Do not call or render `POST /api/v1/teacher/xp/students/:studentId/grants/manual`; it is not implemented in Teacher App in this baseline.

### Teacher Homework / Classroom Grades

Teacher homework and classroom grade/review routes are implemented and teacher-owned. Key implemented route groups:

- `/api/v1/teacher/homeworks/dashboard`
- `/api/v1/teacher/homeworks/classes/:classId/assignments`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/publish`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/close`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/cancel`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/targets`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/targets/resolve`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/grade-sync`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/reorder`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/options`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/options/:optionId`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/options/:optionId/reorder`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments/:attachmentId`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments/:attachmentId/reorder`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers/:answerId/review`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers/review`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/attachments`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/review`
- `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/grade-sync`

Classroom grade/review routes include:

- `GET /api/v1/teacher/classroom/:classId/assignments`
- `GET /api/v1/teacher/classroom/:classId/assignments/:assignmentId`
- `GET /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions`
- `GET /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId`
- `PATCH /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/answers/:answerId/review`
- `PUT /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/answers/review`
- `POST /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/review/finalize`
- `POST /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/sync-grade-item`
- `GET /api/v1/teacher/classroom/:classId/grades/assessments`
- `GET /api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId`
- `GET /api/v1/teacher/classroom/:classId/grades/gradebook`

Do not invent additional Teacher learning endpoints or Teacher XP grant endpoints beyond the implemented routes above.

## 7. Reinforcement / Hero / Rewards Domain Rules for Frontend

- Reinforcement core owns task, stage, assignment, submission, review, template, reward metadata, and lifecycle state.
- Student, Parent, and Teacher app modules adapt/compose Reinforcement data; they do not redefine state machines.
- XpLedger is the only XP source.
- BehaviorPointLedger is not XP.
- Behavior points may appear in behavior/progress displays, but never use them as XP.
- Reward redemption is a request/status workflow in V1.
- Student can request reward redemption where implemented.
- Parent can only read child rewards/redemptions and cannot redeem.
- Rewards do not imply wallet, finance, marketplace, payment, cash, or external fulfillment behavior.
- Hero Journey core owns missions, objectives, progress, badges, events, and lifecycle.
- Hero actions are student-owned only.
- Parent reads Hero progress only.
- Teacher review/completion policy follows Reinforcement core.
- Duplicate reward redemption, mission actions, and invalid state transitions are backend-controlled.
- Frontend should treat conflict, forbidden, and not-found errors as backend authority, not recompute eligibility locally.

Dashboard/Admin source-of-truth routes remain separate from app routes. Relevant implemented Dashboard/Admin route groups include:

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/alerts`
- `GET /api/v1/dashboard/activity-feed`
- Core Reinforcement routes under `/api/v1/reinforcement/*`
- Core Hero Journey routes under `/api/v1/reinforcement/hero/*`
- Core Rewards routes under `/api/v1/reinforcement/rewards/*`
- Core XP routes under `/api/v1/reinforcement/xp/*`

App frontend should not replace Dashboard/Admin workflows with app routes.

## 8. Response Shape Reference

These are practical field references, not exhaustive generated schemas. Use DTO/OpenAPI alignment in Sprint 26K for exact generated client types.

### Student Dashboard / Home Learning Cards

Recommended endpoints:

- `GET /api/v1/student/home`
- `GET /api/v1/student/progress`
- `GET /api/v1/student/tasks/summary`
- `GET /api/v1/student/hero`
- `GET /api/v1/student/rewards`

Display fields: `student.displayName`, `school.name`, `enrollment` hierarchy names, `summaries.subjectsCount`, `summaries.pendingTasksCount`, `summaries.totalXp`, `behaviorPoints`, `student_summary`, `required_today`, Hero preview fields.

Empty states: show empty cards when arrays are empty; do not infer missing data from unsupported markers.

Fields not to expect: tenant ids, raw enrollment ownership fields beyond returned app-safe `enrollmentId`, XP ledger ids, storage internals.

### Student Task Detail / Submission Screen

Recommended endpoints:

- `GET /api/v1/student/tasks/:taskId`
- `POST /api/v1/student/tasks/:taskId/stages/:stageId/submit`
- `GET /api/v1/student/tasks/:taskId/submissions`

Display fields: `title`, `description`, `status`, `reward`, `progress`, `dueDate`, `subject`, `stages[].proofType`, `stages[].requiresApproval`, `submission.status`, `proofText`, `proofFile`.

State fields: `pending`, `in_progress`, `under_review`, `completed`; per-submission status comes from core.

Loading/error: treat `404` as hidden/not available; treat validation errors as form errors. Do not keep local submitted state if backend rejects the transition.

Fields not to expect: `studentId`, `submittedById`, reviewer ids, XP ledger entries, object storage fields, auto XP result.

### Student Hero Mission Screen

Recommended endpoints:

- `GET /api/v1/student/hero/missions/:missionId`
- `POST /api/v1/student/hero/missions/:missionId/start`
- `POST /api/v1/student/hero/missions/:missionId/objectives/:objectiveId/complete`
- `POST /api/v1/student/hero/missions/:missionId/complete`

Display fields: `title`, `missionBrief`, `status`, `progressStatus`, `progress.progressPercent`, `objectives`, `rewards.xp`, `rewards.badge`, `unsupported`.

Empty states: mission may be locked, not started, in progress, or completed. Use returned status.

Fields not to expect: internal progress ownership ids, XP ledger internals, RewardRedemption ids, badge award actor ids.

### Student Rewards Catalog / Redemption Screen

Recommended endpoints:

- `GET /api/v1/student/rewards`
- `GET /api/v1/student/rewards/:rewardId`
- `POST /api/v1/student/rewards/:rewardId/redeem`
- `GET /api/v1/student/rewards/redemptions`

Display fields: `rewardId`, `title`, `description`, `displayType`, `requiredXp`, `isRedeemable`, `insufficientXp`, `stockRemaining`, `availabilityStatus`, `xp.totalEarnedXp`, redemption `status`, `requestedAt`, `nextAction`.

State fields: reward redeemability is backend-calculated. Redemptions use request/status lifecycle.

Loading/error: `409` means duplicate/conflicting redemption or state conflict; show backend error and refresh redemptions.

Fields not to expect: XP debit ledger ids, wallet balance, payment state, fulfillment actor ids.

### Parent Child Overview

Recommended endpoints:

- `GET /api/v1/parent/home`
- `GET /api/v1/parent/children`
- `GET /api/v1/parent/children/:studentId`
- `GET /api/v1/parent/children/:studentId/progress`

Display fields: child `studentId`, `displayName`, hierarchy display, summaries, progress cards, pending task counts.

Empty states: a parent may have multiple children or no currently accessible children; never assume a single child.

Fields not to expect: `guardianId`, `parentId`, `studentGuardianId`, hidden child data.

### Parent Child Task Detail

Recommended endpoints:

- `GET /api/v1/parent/children/:studentId/tasks`
- `GET /api/v1/parent/children/:studentId/tasks/:taskId`
- `GET /api/v1/parent/children/:studentId/tasks/:taskId/submissions`

Display fields: task title/description/status, stage progress, submission/review status, feedback where safe, reward display, proof text, safe proof file metadata.

No actions: do not render submit, approve, reject, cancel, complete, upload, or XP buttons.

Fields not to expect: assignment internals unless already returned, reviewer ids, teacher-only notes, proof download path, storage internals.

### Parent Child Hero Overview

Recommended endpoints:

- `GET /api/v1/parent/children/:studentId/hero`
- `GET /api/v1/parent/children/:studentId/hero/progress`
- `GET /api/v1/parent/children/:studentId/hero/missions`
- `GET /api/v1/parent/children/:studentId/hero/badges`

Display fields: Hero stats, mission counts, mission progress, badges, unsupported rank/tier/level/streak markers.

No actions: Parent cannot start or complete Hero missions/objectives.

### Parent Child Rewards / Redemptions

Recommended endpoints:

- `GET /api/v1/parent/children/:studentId/rewards`
- `GET /api/v1/parent/children/:studentId/rewards/:rewardId`
- `GET /api/v1/parent/children/:studentId/rewards/redemptions`
- `GET /api/v1/parent/children/:studentId/rewards/redemptions/:redemptionId`

Display fields: reward title/type/cost/availability, `xp.totalEarnedXp`, redemption status/timestamps/nextAction.

No actions: Parent cannot redeem, cancel, approve, reject, or fulfill.

### Parent Child Grades / Homeworks / Progress

Recommended endpoints:

- `GET /api/v1/parent/children/:studentId/grades`
- `GET /api/v1/parent/children/:studentId/grades/summary`
- `GET /api/v1/parent/children/:studentId/homeworks`
- `GET /api/v1/parent/children/:studentId/homeworks/:homeworkId`
- `GET /api/v1/parent/children/:studentId/progress/academic`

Display fields: subject/assessment/homework display fields, due/review timestamps, marks and percentages where returned.

No actions: Parent cannot submit homework, answer exams, change grades, or sync grade items.

### Parent Reports / Discipline / Behavior

Recommended endpoints:

- `GET /api/v1/parent/children/:studentId/behavior`
- `GET /api/v1/parent/children/:studentId/behavior/summary`
- `GET /api/v1/parent/children/:studentId/discipline`
- `GET /api/v1/parent/children/:studentId/discipline/summary`
- `GET /api/v1/parent/children/:studentId/reports`
- `GET /api/v1/parent/children/:studentId/reports/summary`

Display fields: behavior event display, behavior point totals as behavior-only numbers, discipline derived timeline, report summaries.

No actions: Parent cannot mutate behavior, discipline, reports, attendance, or grades.

### Teacher Task / Review Screens

Recommended endpoints:

- `GET /api/v1/teacher/tasks/dashboard`
- `GET /api/v1/teacher/tasks/selectors`
- `POST /api/v1/teacher/tasks`
- `GET /api/v1/teacher/tasks`
- `GET /api/v1/teacher/tasks/:taskId`
- `GET /api/v1/teacher/tasks/review-queue`
- `GET /api/v1/teacher/tasks/review-queue/:submissionId`
- `POST /api/v1/teacher/tasks/review-queue/:submissionId/approve`
- `POST /api/v1/teacher/tasks/review-queue/:submissionId/reject`
- `GET /api/v1/teacher/xp/dashboard`
- `GET /api/v1/teacher/xp/classes/:classId`
- `GET /api/v1/teacher/xp/students/:studentId`
- `GET /api/v1/teacher/xp/students/:studentId/history`

Display fields: task summary counts, class selectors, student selectors, task cards/details, submission proof, review status/history, XP totals/history.

No assumptions: review queue identity is `submissionId`; Teacher `classId` is allocation id for the Teacher App reinforcement/XP surfaces; Teacher manual XP bonus is deferred.

## 9. Error Handling Contract

| Status | Frontend treatment |
| --- | --- |
| `400` | Validation or malformed request. Show field-level form errors where details are present. |
| `401` | Unauthenticated or expired token. Redirect to login/session recovery. |
| `403` | Wrong actor/role or insufficient permission where safe to disclose. Do not retry with another role token silently. |
| `404` | Not found or intentionally hidden. Parent same-school unlinked and cross-school child access should be treated as not found. Do not infer that the resource exists elsewhere. |
| `409` | Conflict or duplicate/invalid state transition, especially duplicate reward redemption, duplicate source, or state-machine conflict. Refresh resource and show backend message. |
| `422` / `400` | Domain validation where project code maps validation-domain errors. Treat as user-fixable unless message says otherwise. |
| `500` | Unexpected server error. Show generic retry/support message and log trace id if available. |

Error envelope convention:

- The project error catalog defines `{ error: { code, message, details, traceId } }`.
- Frontend should key stable behavior off `code` when present, and use `message` for display only after localization policy is agreed.

## 10. File / Attachment Contract

Safe file metadata fields may include:

- `id` or `fileId`
- `originalName` or `filename`
- `mimeType`
- `sizeBytes` or `size`
- `visibility`
- `createdAt`
- `downloadPath` only where the app response explicitly returns a backend route reference

File and attachment rules:

- Parent task proof download remains deferred until a Parent-authorized file download contract is approved.
- App responses must not expose `objectKey`, `bucket`, `storageKey`, raw metadata, signed URLs, or unsafe storage URLs.
- `downloadPath`, when returned, must be treated as an app/backend route such as `/api/v1/files/:id/download`.
- The Files download endpoint redirects to a short-lived signed URL after backend authorization. Frontend should call the backend route, not store or construct the signed target.
- Frontend must not build storage URLs manually.
- Frontend must not rely on object storage details.

## 11. Frontend Implementation Checklist

- Keep role tokens separated by app surface.
- Always include `/api/v1`.
- Keep active school context aligned with the authenticated membership/session.
- For Parent App, require explicit child selection and use route `:studentId`.
- Do not assume Parent has a single child.
- Apply route guards by role and child ownership.
- Handle empty arrays and unsupported markers without local fallbacks that invent missing policies.
- Treat `404` on child/resource routes as hidden/not available.
- Do not calculate XP from behavior points.
- Do not show Parent mutation buttons for deferred actions.
- Use backend status fields rather than local state machines.
- Respect deferred Parent proof download.
- Treat reward redemption as request/status flow.
- Treat Discipline as read-only derived timeline/summary.
- Avoid wallet, cash, finance, payment, marketplace, or fulfillment wording.
- Do not expect internal ids or raw storage fields.
- Do not send identity override fields in bodies.
- Refresh data after mutation routes such as Student task submission, Student Hero actions, Student reward redeem, Student homework submit, Student/Parent/Teacher messages, and announcement read state.

## 12. Deferred / Requires Product Decision

- Parent proof download until Parent-authorized file download contract is approved.
- Parent task mutations.
- Parent homework submit.
- Parent reward redemption.
- Parent Hero actions.
- Parent XP grant.
- Teacher manual XP bonus route.
- Reward fulfillment/admin workflow outside Student/Parent App.
- Wallet, finance, marketplace, payment, or cash behavior.
- Dashboard frontend final handoff if not fully covered by current dashboard docs.
- OpenAPI-generated frontend client alignment.

## 13. Verification

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS. Only `?? docs/sprint-26j-learning-flow-frontend-contract-handoff.md` is present. Local git also warned that `C:\Users\Abdal/.config/git/ignore` could not be accessed. |
| `git diff --name-only` | PASS. No tracked files changed. |
| `git diff --stat` | PASS. No tracked diff. |
| `git diff --check` | PASS. No whitespace errors. |
| `npx prisma validate` | PASS. Prisma schema is valid. |
| `npx prisma generate` | PASS. Prisma Client generated successfully. |
| `npm run build` | PASS on rerun with longer timeout. First run hit the 120s command timeout while `nest build` was still running; rerun completed successfully. |
| `npm test -- --runInBand parent-app` | PASS. 46 suites, 171 tests. |
| `npm test -- --runInBand student-app` | PASS. 48 suites, 218 tests. |
| `npm test -- --runInBand teacher-app` | PASS. 43 suites, 238 tests. |
| `npm test -- --runInBand reinforcement` | PASS. 35 suites, 270 tests. |
| `npm test -- --runInBand hero-journey` | PASS. 12 suites, 81 tests. |
| `npm test -- --runInBand rewards` | PASS. 18 suites, 140 tests. |
| `npm test -- --runInBand xp` | PASS. 6 suites, 37 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` | PASS. 1 suite, 21 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` | PASS. 1 suite, 23 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-final-closeout.e2e-spec.ts` | PASS. 1 suite, 18 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts` | PASS. 1 suite, 17 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/reinforcement-foundation.e2e-spec.ts` | PASS. 1 suite, 1 test. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/hero-journey-foundation.e2e-spec.ts` | PASS. 1 suite, 1 test. |

## 14. Final Verdict

Sprint 26J: PASS if the handoff is accurate and no runtime changes were needed.
Next: Sprint 26K — Frontend Integration Readiness / OpenAPI Alignment.
