# Sprint 7A Teacher App Contract Audit

## Current Backend Checkpoint

Sprint 6C Realtime, Announcements, and Notifications is complete at commit `b577b66 docs: update project structure after sprint 6c`. This audit is documentation-only and does not introduce runtime Teacher App APIs, schema changes, migrations, seeds, tests, package changes, README changes, or app-facing routes.

The backend is a NestJS, Prisma, PostgreSQL modular monolith. Core modules remain the source of truth; app-facing modules must compose existing core use-cases, services, repositories, and presenters. All routes are globally prefixed with `/api/v1`; Teacher App contract paths such as `/teacher/home` therefore mean `/api/v1/teacher/home` at runtime.

The current module set includes core domains for academics, students, attendance, grades, reinforcement, behavior, communication, files, settings, and IAM. There is no `src/modules/teacher-app/` runtime module yet. `DIRECTORY_STRUCTURE.md` was not present in this working tree; this audit used `DIRECTORY_STRUCTURE_VISUAL.md`, `MODULES.md`, `Moazez-Project-Structure.json`, and source layout inspection for directory conventions.

## Sources Reviewed

Governance and architecture sources reviewed:

- `AGENT_CONTEXT_PRIMER.md`
- `CLAUDE.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `ENGINEERING_RULES.md`
- `SECURITY_MODEL.md`
- `API_CONTRACT_RULES.md`
- `TESTING_STRATEGY.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `DOMAIN_GLOSSARY.md`
- `PRISMA_CONVENTIONS.md`
- `README.md`
- `Moazez-Project-Structure.json`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`

Teacher App handoff sources reviewed:

- `adr/Teacher-App/teacher_HOME_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_SCHEDULE_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_MY_CLASSES_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_CLASSROOM_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_HOMEWORKS_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_MESSAGES_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_PROFILE_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_SETTINGS_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_TASKS_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_XP_BACKEND_MODELS.md`

Backend implementation areas inspected:

- `prisma/schema.prisma`
- `src/modules/academics/**`
- `src/modules/students/**`
- `src/modules/attendance/**`
- `src/modules/grades/**`
- `src/modules/reinforcement/**`
- `src/modules/behavior/**`
- `src/modules/communication/**`
- `src/modules/files/**`
- `src/modules/settings/**`
- `src/modules/iam/**`
- `src/infrastructure/database/school-scope.extension.ts`
- `src/common/guards/**`
- `src/common/decorators/**`
- `test/security/**`
- `test/e2e/**`
- `package.json`

## Backend State Relevant To Teacher App

### Tenancy And Authorization Foundation

The global security stack already uses JWT authentication, scope resolution, permissions, and Prisma school scoping. `ScopeResolverGuard` resolves an active membership and writes `organizationId`, `schoolId`, `membershipId`, `roleId`, and permissions into `RequestContext`. `school-scope.extension.ts` applies school filters to major school-owned models, including students, enrollments, academics, attendance, grades, reinforcement, behavior, communication, files, and settings.

There is no dedicated Teacher App actor guard yet. The future Teacher App module should add app-layer enforcement that the current user is an active `TEACHER` in the resolved school. It must not rely on `schoolId` alone, because same-school teachers must still be isolated to their own allocations, classrooms, students, and conversations.

### IAM And Profile Data

Current data supports a basic self profile:

- `User`: name, email, phone, `userType`, status, last login.
- `Membership`: organization, school, role, `userType`, status, start/end dates.
- `SchoolProfile`: school display name, logo metadata, address, timezone, locale.
- Roles and permissions through IAM.

Current data does not support a full teacher employment profile:

- No teacher employee profile model.
- No employee ID, specialization, department, employment type, direct manager, office hours, work days, responsibilities, teacher avatar, or app preferences.
- No dedicated teacher privacy/settings model.

### Academics

Current academics data supports allocation-based class ownership:

- Academic years and terms.
- Stages, grades, sections, classrooms, subjects, rooms.
- `TeacherSubjectAllocation` linking `teacherUserId`, subject, classroom, and term.

This is enough for Teacher App class ownership and basic class cards. It is not enough for a true schedule contract because there are no timetable, period, schedule occurrence, cycle calendar, or lesson preparation models in the current schema/source tree. The handoff `scheduleId` cannot be safely mapped to an existing durable backend identifier yet.

### Students

Current students data supports class roster composition through `Enrollment` and `Student`.

Gaps for Teacher App presentation include student photo URL and seat number. Student number is sometimes presented by existing code as nullable, but the schema does not provide the richer app profile fields expected by the handoff.

### Attendance

Attendance is mature enough for classroom roll-call once the app has a safe classroom/date/period identity:

- Policies.
- Sessions.
- Entries.
- Roll-call roster.
- Save/submit/unsubmit/correction flows.
- Session resolution by classroom, date, mode, and optional period fields.

The blocker is not attendance core; it is resolving the Teacher App `scheduleId` into an owned classroom, term, date, and period without a timetable core.

### Grades And Assignment Foundation

Grades supports assessments, questions, submissions, answers, review, sync to gradebook items, and analytics. `GradeAssessmentType.ASSIGNMENT` and question-based delivery can provide part of the homework/assignment experience.

The current model is not a full homework core:

- No explicit `Homework` aggregate.
- No first-class due datetime.
- No homework-specific status lifecycle.
- No custom target subset model for individual or selected students.
- No publish-now/randomization semantics matching the handoff.
- No app-specific homework dashboard read model.

Teacher App assignment operations can be implemented only if product accepts that "homework" is backed by grade assessments in V1, or after a core homework model decision.

### Reinforcement, Tasks, And XP

Reinforcement task core is the strongest match for Teacher Tasks:

- Tasks, targets, assignments, stages, submissions, reviews, proof type, reward type, and status.
- Teacher source is represented by `ReinforcementTaskSource.TEACHER`.
- Status mapping is straightforward: app `pending`, `inProgress`, `completed`, and `underReview` map to existing task status values.

XP core supports policy, ledger, summaries, and manual grants with caps, cooldowns, dedupe keys, and audit logging. Teacher XP read views are feasible. Teacher bonus grants require an explicit authorization decision because the default teacher role currently has `reinforcement.xp.view` but not `reinforcement.xp.manage`.

### Behavior

Behavior core supports categories, records, review, dashboard-style reads, and role-scoped permissions. Teacher role can create and submit behavior records and view categories/records/overview. This can support classroom follow-up counts and student behavior context without making Teacher App the source of behavior truth.

### Communication

Communication core is ready for most message flows:

- Conversation list/detail.
- Participants.
- Messages.
- Reactions.
- Attachments.
- Read/delivery receipts.
- Policies controlling teacher-parent, teacher-student, attachments, voice messages, and group creation.
- Announcements and notifications from Sprint 6C.

Teacher App messages can compose conversation contacts, threads, send text messages, and mark-read flows. Audio and attachments depend on communication policy and files permissions. Announcements and notifications exist, but teacher access requires a role/permission decision because teacher defaults do not currently include announcement or notification view permissions.

### Files

Files are stored externally and exposed through file metadata plus controlled download routes. Teacher App presenters must not return raw S3 object keys or direct bucket URLs. Handoff fields such as `attachmentUrl`, `proofUrl`, and `audioUrl` should become backend file download routes or signed access handled by the Files module.

## Teacher App Contract Summary

| Area | Required capabilities | Filters | Mutations | Core dependencies | Current readiness |
| --- | --- | --- | --- | --- | --- |
| Home | Teacher identity, daily stats, weekly schedule preview, action summaries | Implicit active school/teacher/current date | No | IAM, SchoolProfile, Academics, Attendance, Grades, Reinforcement, Behavior, Communication | Partially ready; schedule and teacher points are gaps |
| Schedule | Daily and weekly schedule items | `date`, week date; client-side cycle/grade/section/search | No | Academics timetable, allocations, rooms, enrollments, attendance, homework | Missing timetable/schedule core |
| My Classes | Assigned class cards and class detail | Search/cycle/grade/status client-side; active term | No | Academics, Students, Attendance, Grades, Reinforcement, Behavior | Basic ready; schedule-derived metrics missing |
| Classroom | Classroom detail, roster, attendance, assignments, submissions, review | `scheduleId`, assignment/student identifiers | Yes | Attendance, Grades, Students, Behavior, Files, Academics | Core flows ready after schedule identity and homework decision |
| Homeworks | Dashboard and class assignment lists | `classId`, date/status/category style filters | Mostly no in handoff docs; creation belongs Classroom | Grades or future Homework core, Files | Partially possible through grade assignments; full homework core missing |
| Tasks | Dashboard, create task, detail, approve stage | Status/period/class/student implied | Yes | Reinforcement tasks, students, files, XP/rewards | Ready with adapter and ownership checks |
| XP Center | Dashboard, student XP history, bonus grants | Student/class/time implied | Bonus grant yes | Reinforcement XP, policies, ledger, students | Read ready; bonus permission/policy gap |
| Messages | Contacts, conversation, send, mark read | Conversation/contact search and paging | Yes | Communication, Files, IAM | Basic ready; audio/attachments/notifications need permission and policy decisions |
| Profile | Basic profile and employment profile | Self only | No | IAM, SchoolProfile, Academics, Reinforcement | Basic ready; employment profile fields missing |
| Settings | Settings, privacy, legal/help/contact/about, rating, support ticket | Self only | Yes | Settings/IAM, future support/CMS/preferences | Mostly missing core; defer mutations |

## Requirement Mapping To Core Modules

### Home

| Contract item | Existing core source | Classification | Notes |
| --- | --- | --- | --- |
| Teacher identity | IAM `User`, `Membership`, `Role` | Ready to compose now | Must require active teacher membership. |
| School display | `SchoolProfile` | Ready to compose now | Logo must use Files-safe access pattern if exposed. |
| Assigned classes count | Academics `TeacherSubjectAllocation` | Ready to compose now | Count allocations owned by `teacherUserId`. |
| Student counts | Students `Enrollment` | Requires small adapter/use-case only | Count active enrollments in owned classrooms. |
| Attendance pending/today summary | Attendance sessions/entries | Requires small adapter/use-case only | Needs owned classrooms and current date. |
| Assignments pending/review counts | Grades assessments/submissions | Requires small adapter/use-case only | Only grade-backed assignments are available. |
| Tasks and XP summary | Reinforcement tasks/ledger | Requires small adapter/use-case only | XP bonus writes are separate. |
| Weekly schedule preview | Academics timetable | Requires missing core model/API | No timetable or schedule occurrence model exists. |
| Teacher points/rank | Reinforcement or future profile metric | Requires missing core model/API | Student XP exists; teacher points do not. |

### Schedule

| Contract item | Existing core source | Classification | Notes |
| --- | --- | --- | --- |
| Daily and weekly schedule list | None complete | Requires missing core model/API | Allocations lack date/time/period/day recurrence. |
| Subject/class/stage/grade/section/room | Academics allocation graph | Requires small adapter/use-case only | Can be attached after schedule rows exist. |
| Student count | Students enrollments | Requires small adapter/use-case only | Count owned classroom enrollments. |
| Needs attendance | Attendance sessions/entries | Requires small adapter/use-case only | Requires schedule occurrence period/date mapping. |
| Has homework | Grades assessments or future Homework | Requires small adapter/use-case only | Depends on homework decision. |
| Lesson title/preparation/notes | None complete | Requires missing core model/API | Lesson plan/preparation core is absent. |

Schedule should not ship as a fabricated read model over allocations unless product explicitly approves a limited placeholder contract. A real Teacher App schedule needs an Academics timetable foundation first.

### My Classes

| Contract item | Existing core source | Classification | Notes |
| --- | --- | --- | --- |
| Class list and detail | `TeacherSubjectAllocation`, classroom, subject, term | Ready to compose now | Use allocation ID as Teacher App `classId` to preserve subject ownership. |
| Stage/grade/section/room | Academics structure | Requires small adapter/use-case only | Ensure core read provider includes needed joins. |
| Roster count | Students enrollments | Requires small adapter/use-case only | Count active/current enrollments in owned classroom. |
| Pending attendance | Attendance | Requires small adapter/use-case only | Current-date aggregation by owned classrooms. |
| Active assignments and pending review | Grades | Requires small adapter/use-case only | Grade-backed assignments only. |
| Follow-up items | Behavior/Reinforcement | Requires small adapter/use-case only | Aggregated counts only; core keeps truth. |
| Weekly periods/today periods/next session/weekly days | Timetable | Requires missing core model/API | Cannot be accurate from current allocations. |
| Needs preparation/focus item | Lesson plan/task policy | Requires missing core model/API | Defer or derive only after product decision. |

### Classroom

| Contract item | Existing core source | Classification | Notes |
| --- | --- | --- | --- |
| Classroom detail by `scheduleId` | None complete | Requires missing core model/API | Must resolve to owned schedule occurrence. |
| Roster | Students enrollments | Ready to compose now after owned classroom resolved | Student photo/seat number missing. |
| Attendance save | Attendance roll-call/session/entries | Ready to compose now after schedule resolved | Must constrain classroom, date, period, and teacher ownership. |
| Assignment list/create/detail | Grades assessments/questions | Requires small adapter/use-case only | Full homework fields remain a gap. |
| Submission list/detail/review | Grades submissions/answers/review | Ready to compose now for grade-backed assessments | Must constrain assessment to owned classroom and subject. |
| Behavior/follow-up context | Behavior records/categories | Requires small adapter/use-case only | App presenter should aggregate; Behavior remains source of truth. |
| Attachments/media | Files | Requires small adapter/use-case only | Return file metadata/download route, not raw storage URL. |

### Homeworks

| Contract item | Existing core source | Classification | Notes |
| --- | --- | --- | --- |
| Homework dashboard | Grades assessments and submissions | Requires small adapter/use-case only | Can support grade-backed assignment counts. |
| Class assignment list | Grades assessments | Requires small adapter/use-case only | Use `GradeAssessmentType.ASSIGNMENT` if approved. |
| Due date/time and homework status | None complete | Requires missing core model/API | `GradeAssessment.date` is not a full due datetime. |
| Targeted students/groups | None complete | Requires missing core model/API | Current grade assessment targets a classroom/subject. |
| Homework-specific creation flow | Grades partial or future Homework core | Requires missing core model/API | Needs product decision before implementation. |

### Tasks

| Contract item | Existing core source | Classification | Notes |
| --- | --- | --- | --- |
| Dashboard | Reinforcement tasks/assignments/stages | Ready to compose now | Presenter maps core statuses to app labels. |
| Create task | Reinforcement task creation | Ready to compose now | Must validate all targets are owned students/classes. |
| Task detail | Reinforcement task read models | Ready to compose now | Include stages, proof metadata, reward data. |
| Approve stage | Reinforcement reviews/stages | Ready to compose now | Must validate teacher owns target student via classroom allocation. |
| Proof files | Files | Requires small adapter/use-case only | Use file IDs/download route. |

### XP Center

| Contract item | Existing core source | Classification | Notes |
| --- | --- | --- | --- |
| XP dashboard | Reinforcement XP ledger/summary/policies | Requires small adapter/use-case only | Read-only views are feasible. |
| Student XP history | XP ledger and student enrollment | Ready to compose now | Must validate student is in owned classroom. |
| Rank/tier progress | XP/hero/reward models | Requires small adapter/use-case only | Exact app rank model should be confirmed. |
| Bonus XP grant | Manual XP grant use-case | Requires missing authorization/policy decision | Teacher role lacks `reinforcement.xp.manage`; ownership and budget rules need approval. |

### Messages

| Contract item | Existing core source | Classification | Notes |
| --- | --- | --- | --- |
| Contacts | Communication participants plus IAM users | Requires small adapter/use-case only | Derive from existing conversations or allowed policy peers. |
| Conversation detail | Communication messages | Ready to compose now | Participant membership enforces conversation access. |
| Send text message | Communication send use-case | Ready to compose now | Must honor communication policy. |
| Mark read | Communication read receipt flow | Ready to compose now | Current core supports receipts. |
| Audio messages | Communication policy and Files | Requires small adapter/use-case only | Default policy disables voice; permission and upload flow must be explicit. |
| Announcements/notifications | Communication announcements/notifications | Requires authorization decision | Teacher default role lacks view permissions. |

### Profile

| Contract item | Existing core source | Classification | Notes |
| --- | --- | --- | --- |
| Basic self profile | IAM user/membership/role/school | Ready to compose now | Self-only; no arbitrary user ID route. |
| Class/subject summary | Academics allocations | Requires small adapter/use-case only | Owned allocations only. |
| Workload metrics | Attendance/Grades/Reinforcement | Requires small adapter/use-case only | Should be aggregate/presenter-only. |
| Employment profile | None complete | Requires missing core model/API | Employee metadata is absent. |
| Teacher avatar | None complete | Requires missing core model/API | User has no avatar file relation. |

### Settings

| Contract item | Existing core source | Classification | Notes |
| --- | --- | --- | --- |
| App settings | None complete | Requires missing core model/API | No user app preference model. |
| Privacy settings | None complete | Requires missing core model/API | No privacy preference model. |
| Legal/help center | None complete | Should be deferred | Needs CMS/static content decision. |
| Contact/about | `SchoolProfile`, package metadata, config | Requires small adapter/use-case only | Can be read-only if approved. |
| Rating | None complete | Should be deferred | Needs feedback/rating core. |
| Support ticket | None complete | Should be deferred | Needs support module or external integration. |

## Ready Endpoints, Deferred Endpoints, And Gaps

### Ready To Build After Audit Review

These can be implemented as Teacher App adapters over existing core modules, provided ownership checks are added:

- `GET /teacher/classes`
- `GET /teacher/classes/{classId}` where `classId` is a `TeacherSubjectAllocation.id`
- Basic `GET /teacher/home` without true timetable-derived weekly schedule
- `GET /teacher/tasks/dashboard`
- `POST /teacher/tasks`
- `GET /teacher/tasks/{taskId}`
- `POST /teacher/tasks/{taskId}/stages/{stageId}/approve`
- `GET /teacher/messages/contacts`
- `GET /teacher/messages/conversations/{conversationId}`
- `POST /teacher/messages/conversations/{conversationId}/messages`
- `POST /teacher/messages/conversations/{conversationId}/read`
- Basic `GET /teacher/profile`
- Basic `GET /teacher/profile/employment` with unsupported fields omitted or returned as `null` only if the response DTO explicitly documents them
- `GET /teacher/xp/students/{studentId}` read-only

### Requires Small Adapter Or Use-Case Only

These are feasible without changing core business truth, but need careful presenter and ownership work:

- Home stats and action summaries across Attendance, Grades, Reinforcement, Behavior, and Communication.
- My Classes aggregate counts: pending attendance, active assignments, pending review, behavior follow-ups.
- Classroom roster and attendance save once route identity resolves to an owned classroom/date/period.
- Grade-backed assignment and submission review surfaces using `GradeAssessmentType.ASSIGNMENT`.
- Task status and proof presentation.
- XP read dashboard and rank-style summaries if mapped to existing XP/hero data.
- Message contact projection from conversations and participants.
- Read-only settings `about` or `contact` if product accepts static/config-backed values.

### Missing Core Gaps

These should not be faked in the Teacher App module:

- Academics timetable, period, recurring schedule, and schedule occurrence model.
- Lesson plan/preparation model for `isPrepared`, lesson title, notes, and focus item.
- Durable `scheduleId` contract for Classroom and Schedule.
- Full Homework core if product requires due datetime, targeted students, homework-specific statuses, publish rules, randomization, and class dashboards beyond grade assignments.
- Teacher employment profile.
- Teacher app preferences and privacy settings.
- Support ticket, app rating, legal/help center content source.
- Teacher avatar/user profile media relation.
- Seat number and student photo if required by classroom roster UI.
- Teacher XP budget/bonus permission policy.
- Teacher announcement/notification consumption permission decision.

### Deferred Areas

The following should be explicitly deferred until core/authorization decisions are reviewed:

- Full Schedule daily/weekly implementation.
- Classroom routes that use `scheduleId` before a schedule occurrence source exists.
- Full Homeworks contract beyond grade-backed assignment read models.
- Teacher XP bonus grants.
- Settings mutations, privacy mutations, rating, support ticket, legal/help center.
- Announcement and notification Teacher App consumption unless teacher permissions are approved.
- Student App and Parent App APIs.

## Proposed Teacher App Module Boundary

Recommended location:

```text
src/modules/teacher-app/
  teacher-app.module.ts
  shared/
  home/
  schedule/
  my-classes/
  classroom/
  homeworks/
  tasks/
  xp-center/
  messages/
  profile/
  settings/
```

Boundary rules:

- `teacher-app` is app-facing composition only.
- It should not own Prisma repositories.
- It should not redefine core entities or duplicate business rules.
- It should import core modules and consume exported core services/use-cases/read models.
- If a query cannot be served safely by existing core providers, extend the owning core module first.
- It may contain DTOs, controllers, application coordinators, presenters, and a small shared teacher actor/ownership helper.
- It must keep response shaping in presenters and keep request/response contracts typed.
- It must not bypass `RequestContext`, `schoolScope`, global guards, or permission checks.

This aligns with the existing governance direction in `MODULES.md`, which already names Teacher App as an app-facing module with Home, Schedule, My Classes, Classroom, Homework, Messages, Profile, Settings, Tasks, and XP Center submodules.

## Proposed Authorization And Tenancy Model

All Teacher App routes should require:

- Authenticated user.
- Active `RequestContext` with `organizationId`, `schoolId`, `membershipId`, and `roleId`.
- Current user has `UserType.TEACHER`.
- Current membership has `MembershipStatus.ACTIVE`.
- Current user status is active.
- All data access goes through school-scoped Prisma providers or core services that already use them.

Teacher ownership must be enforced in the Teacher App application layer before calling mutation-capable core use-cases:

- A Teacher App `classId` should be the `TeacherSubjectAllocation.id`, not only `classroomId`.
- The allocation must have `teacherUserId = currentUser.id`, current `schoolId`, and the requested/current term.
- Student access must be limited to active enrollments in classrooms owned through the teacher's allocations.
- Subject operations must match the owned allocation subject.
- Attendance operations must target sessions for an owned classroom, date, mode, and period.
- Grade assignment/submission operations must target assessments belonging to the owned classroom and subject.
- Reinforcement task and XP operations must validate every student target through an owned classroom enrollment.
- Message operations must rely on `CommunicationParticipant` membership and communication policy; teachers must not search arbitrary users unless a scoped contact policy is approved.
- Announcements and notifications must be scoped to the current actor and require explicit permission decisions before app exposure.

Recommended permission mapping:

| Area | Existing permissions likely needed |
| --- | --- |
| Home/My Classes/Profile read | Teacher actor + allocation ownership; optionally `students.records.view` for student counts |
| Attendance classroom operations | `attendance.sessions.manage`, `attendance.entries.manage`, and `attendance.sessions.submit` if submission is exposed |
| Assignments/homework via Grades | `grades.assessments.manage`, `grades.questions.manage`, `grades.submissions.view`, `grades.submissions.review`, `grades.items.manage` |
| Tasks | `reinforcement.tasks.view`, `reinforcement.tasks.manage`, `reinforcement.reviews.view`, `reinforcement.reviews.manage` |
| XP read | `reinforcement.xp.view` |
| XP bonus | Requires approved teacher permission; current `reinforcement.xp.manage` is not in the teacher role |
| Messages | `communication.conversations.view`, `communication.messages.view`, `communication.messages.send` |
| Files | Upload/download permissions must be checked before returning or accepting attachment file IDs |

If new Teacher App-specific permission codes are desired, they require a future migration/seed task and must not be added as part of Sprint 7A.

## Proposed Sprint 7 Implementation Breakdown

### Sprint 7A: Teacher App Contract Audit

Objective:

- Produce this audit from actual backend state and Teacher App handoff documents.

In scope:

- Contract review.
- Core module mapping.
- Gap analysis.
- Teacher App module boundary proposal.
- Authorization and tenancy proposal.
- Sprint 7B/7C/7D plan.

Out of scope:

- Runtime Teacher App APIs.
- Schema, migration, seed, package, README, test, and source code changes.

Testing requirements:

- Existing build, unit, security, and Sprint 6C verification must remain green.

Verification commands:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- `npm run verify:sprint6c`

Risks:

- Audit may identify core gaps that delay app route implementation. This is intentional; app-facing modules must not fake core truth.

### Sprint 7B: Teacher Home, My Classes, And Schedule Decision

Objective:

- Implement the first read-only Teacher App shell around authenticated teacher identity, owned allocations, class summaries, and safe home metrics.
- Resolve the schedule strategy before exposing schedule-dependent routes.

In scope:

- `TeacherAppModule` scaffold.
- Shared teacher actor and allocation ownership helper.
- `GET /teacher/home` with available metrics only.
- `GET /teacher/classes`.
- `GET /teacher/classes/{classId}`.
- Explicit schedule decision: either implement/approve an Academics timetable core first, or defer `GET /teacher/schedule` and `GET /teacher/schedule/week`.

Out of scope:

- Attendance mutations.
- Classroom assignment creation/review.
- Message APIs.
- Settings/profile employment persistence.
- Student App and Parent App APIs.
- Timetable placeholders unless explicitly approved.

Expected files to inspect:

- `src/modules/academics/teacher-allocation/**`
- `src/modules/academics/structure/**`
- `src/modules/students/**`
- `src/modules/attendance/**`
- `src/modules/grades/**`
- `src/modules/reinforcement/**`
- `src/modules/behavior/**`
- `src/modules/iam/**`
- `src/modules/settings/**`
- `src/common/guards/**`
- `src/common/decorators/**`

Expected files to modify:

- `src/modules/teacher-app/**`
- `src/app.module.ts` to import `TeacherAppModule`
- Core module export files only where an existing core provider must be consumed by Teacher App
- Focused unit/e2e/security tests for Teacher App read surfaces
- Project structure documentation only after implementation is complete and verified

Testing requirements:

- Unit tests for presenters and ownership helper.
- E2E tests for teacher home/classes.
- Security tests proving teachers cannot read another teacher's allocation, classroom, or student list, including same-school and cross-school cases.

Verification commands:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- Add a sprint-specific verification command only when the sprint implementation is complete and approved.

Risks:

- No timetable model means schedule cannot be fully implemented.
- Teacher role may not have all read permissions desired by app routes.
- Current core modules may need provider exports for composition.
- `classId` ambiguity can expose too much data if it is treated as classroom ID instead of allocation ID.

### Sprint 7C: Teacher Classroom Operations

Objective:

- Implement Teacher App classroom operations backed by Attendance and Grades without moving business logic into app-facing modules.

In scope:

- Classroom detail only after `scheduleId` resolution is defined.
- Roster projection for owned classroom allocation.
- Attendance save/submit flow backed by Attendance.
- Assignment list/detail/create backed by Grades if grade-backed homework is approved.
- Submission list/detail/review backed by Grades.
- File-safe attachment/proof presentation.

Out of scope:

- Full homework core if the product requires fields not present in Grades.
- New grade or attendance business behavior outside approved core use-case extensions.
- Student App and Parent App APIs.

Expected files to inspect:

- `src/modules/attendance/**`
- `src/modules/grades/**`
- `src/modules/students/**`
- `src/modules/files/**`
- `src/modules/behavior/**`
- `src/modules/academics/**`
- Existing e2e and security tests for attendance and grades

Expected files to modify:

- `src/modules/teacher-app/classroom/**`
- `src/modules/teacher-app/homeworks/**` if grade-backed homework read models are included
- Core exports or narrow core read use-cases only when needed
- Focused tests for classroom ownership and mutation boundaries

Testing requirements:

- E2E tests for owned classroom roster, attendance save, assignment read/create, and submission review where supported.
- Security tests proving same-school teachers cannot mutate or read another teacher's classroom data.
- Tests proving school scoping and file access rules are preserved.

Verification commands:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- Sprint-specific verification command after approved implementation.

Risks:

- `scheduleId` is not backed by current schema.
- Homework contract may exceed GradeAssessment capabilities.
- Existing core use-cases may be school-scoped but not teacher-owned; Teacher App must add ownership checks.
- Attachment URLs must not leak storage internals.

### Sprint 7D: Teacher Messages, Profile, Settings, And Closeout

Objective:

- Complete Teacher App surfaces that can be safely composed from Communication, IAM, Settings, Files, and existing read models, then close documentation and verification.

In scope:

- Message contacts derived from scoped conversations/participants.
- Conversation detail, send message, and mark-read.
- Basic profile and employment projection from existing user, membership, school, role, and allocation data.
- Read-only settings/about/contact only where backed by existing data or approved static config.
- Closeout docs and project structure update after runtime work is complete.

Out of scope:

- Settings persistence and privacy preferences without a core model.
- Support tickets and app rating without a support/feedback module.
- Legal/help center without a content source.
- Audio messages unless communication policy, upload, and file permissions are approved.
- Announcement/notification Teacher App consumption unless permissions are approved.

Expected files to inspect:

- `src/modules/communication/**`
- `src/modules/files/**`
- `src/modules/iam/**`
- `src/modules/settings/**`
- `src/modules/teacher-app/**`
- Existing communication e2e/security tests

Expected files to modify:

- `src/modules/teacher-app/messages/**`
- `src/modules/teacher-app/profile/**`
- `src/modules/teacher-app/settings/**`
- Core module exports only as needed
- Focused tests and closeout documentation

Testing requirements:

- E2E tests for contact list, conversation detail, send, and mark-read.
- Security tests proving teachers cannot read conversations they do not participate in.
- Profile self-only tests.
- Settings tests only for approved read-only fields.
- Existing Sprint 6C communication verification must remain green.

Verification commands:

- `npm run build`
- `npm run test -- --runInBand`
- `npm run test:security -- --runInBand`
- Existing Sprint 6C verification
- New Sprint 7 verification only after Sprint 7D closeout is approved

Risks:

- Teacher role lacks announcement/notification and some file/message attachment permissions.
- Voice messages are policy-gated and disabled by default.
- Employment and settings responses may be sparse until core models exist.
- Contact search must not become a cross-school or all-user directory.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| App routes duplicate core truth | Keep Teacher App as composition/presenter layer only; add missing business queries to owning core modules. |
| Teachers see other teachers' classes | Use allocation ID as app class identifier and enforce `teacherUserId = currentUser.id`. |
| Same-school leakage through school-scoped services | Add Teacher App ownership checks before reads and mutations; do not rely only on `schoolScope`. |
| Schedule contract cannot be fulfilled | Add Academics timetable core first or explicitly defer schedule endpoints. |
| Homework contract exceeds Grades | Decide whether V1 homework is grade-backed assignments or requires a new Homework core. |
| XP bonus grants are over-permissive | Do not expose bonus grants until teacher permission, policy budget, and ownership rules are approved. |
| Files expose storage internals | Return file IDs and backend download routes; never raw S3 keys or direct bucket URLs. |
| Communication contacts become a user directory | Derive contacts from existing conversations or approved policy-scoped peers. |
| Settings endpoints imply persistence that does not exist | Defer settings/privacy/rating/support mutations until core models exist. |
| Permissions missing from teacher role | Treat as a future migration/seed decision, not an app-layer bypass. |

## Recommended Next Task

Proceed with Sprint 7B only after reviewing this audit and making one product/architecture decision:

- Either approve an Academics timetable/schedule core foundation before Teacher Schedule and Classroom `scheduleId` routes, or explicitly defer schedule-dependent endpoints while building read-only Home and My Classes over teacher allocations.

Recommended immediate implementation scope after review:

- Scaffold `src/modules/teacher-app/`.
- Add teacher actor and allocation ownership enforcement.
- Implement `GET /teacher/home`, `GET /teacher/classes`, and `GET /teacher/classes/{classId}` using existing core modules.
- Keep Schedule, Classroom `scheduleId`, full Homeworks, XP bonus, and Settings mutations deferred until their core gaps are resolved.
