# Sprint 8A Student App Contract Audit

## Purpose And Scope

Sprint 8A is a documentation-only planning audit for Student App runtime work after Teacher App closeout. It maps the Student App handoff contracts against the current backend state and defines a safe implementation path without adding runtime Student App APIs.

No routes, controllers, use-cases, DTOs, presenters, Prisma schema changes, migrations, seeds, package scripts, README edits, ADR edits, tests, or project-structure edits are introduced by this audit.

All future Student App routes must rely on the framework-level `/api/v1` prefix and must not hardcode unprefixed routes in tests.

## Sources Reviewed

Governance and architecture:

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
- `ERROR_CATALOG.md`
- `README.md`
- `Moazez-Project-Structure.json`
- `docs/sprint-7a-teacher-app-contract-audit.md`
- `docs/sprint-7d-teacher-tasks-xp-audit.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`

Repository note: `DIRECTORY_STRUCTURE.md` is not present in the current checkout. `DIRECTORY_STRUCTURE_VISUAL.md`, `Moazez-Project-Structure.json`, and the live source tree were used to verify directory structure expectations.

Teacher App closeout context:

- `test/e2e/teacher-app-final-closeout.e2e-spec.ts`
- `src/modules/teacher-app/**`
- `package.json`
- `README.md`

Student App handoff docs:

- `adr/Student-App/student_HOME_BACKEND_MODEL.md`
- `adr/Student-App/student_SCHEDULE_BACKEND_MODEL.md`
- `adr/Student-App/student_SUBJECTS_BACKEND_MODEL.md`
- `adr/Student-App/student_SUBJECT_DETAILS_BACKEND_MODEL.md`
- `adr/Student-App/student_ATTACHMENTS_BACKEND_MODEL.md`
- `adr/Student-App/student_HOMEWORKS_BACKEND_MODEL.md`
- `adr/Student-App/student_EXAMS_BACKEND_MODEL.md`
- `adr/Student-App/student_GRADES_BACKEND_MODEL.md`
- `adr/Student-App/student_BEHAVIOR_BACKEND_MODEL.md`
- `adr/Student-App/student_PROGRESS_BACKEND_MODEL.md`
- `adr/Student-App/student_HERO_JOURNEY_BACKEND_MODEL.md`
- `adr/Student-App/student_PROFILE_BACKEND_MODEL.md`
- `adr/Student-App/student_TASKS_BACKEND_MODEL.md`
- `adr/Student-App/student_MESSAGES_BACKEND_MODEL.md`
- `adr/Student-App/student_ANNOUNCEMENTS_BACKEND_MODEL.md`
- `adr/Student-App/student_PICKUP_BACKEND_MODEL.md`

Core and verification surface:

- `src/modules/iam/**`
- `src/modules/settings/**`
- `src/modules/academics/**`
- `src/modules/students/**`
- `src/modules/attendance/**`
- `src/modules/grades/**`
- `src/modules/reinforcement/**`
- `src/modules/behavior/**`
- `src/modules/communication/**`
- `src/modules/files/**`
- `prisma/schema.prisma`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `src/infrastructure/database/school-scope.extension.ts`
- listed security and e2e suites for students, attendance, grades, reinforcement, hero journey, rewards, behavior, communication, and Teacher App.

## Readiness Legend

- `Ready`: existing core can safely back the contract once Student App ownership is resolved.
- `Partially ready`: existing core can back a limited adapter, but fields, policy, or contract behavior are missing.
- `Missing`: no current core source of truth or persistence was found.
- `Deferred`: implementation would backdoor scope that is explicitly postponed until after Phase 5 or a future product/architecture decision.

Important audit finding: no Student App runtime route that returns student-owned domain data is fully safe until the student actor can be resolved from the authenticated `User`. The current Prisma `Student` model has no direct `userId` relation and no dedicated join model linking a student account to a student record. The ready-to-build sections below therefore mean "ready after the Student actor and ownership foundation is resolved", not "ship this route today without an identity decision".

## Current Backend State After Teacher App Closeout

### Runtime Module State

- Teacher App runtime exists under `src/modules/teacher-app/**` and is imported by `AppModule`.
- No `src/modules/student-app` runtime module exists.
- Teacher App final closeout tests explicitly protect the deferred Teacher App routes and behaviors.
- Core modules remain the source of truth. App-facing modules must compose from them and must not redefine business truth.

### IAM And Student Actor Identity

- Authentication establishes an actor from JWT/session data.
- `ScopeResolverGuard` resolves active membership, organization, school, role, permissions, and academic context into `RequestContext`.
- `UserType.STUDENT` exists, and the seeded student role exists.
- The `Student` model is not linked to `User`; `Guardian` has optional `userId`, but `Student` does not.
- There is no current Student App access service that resolves "current authenticated student" to an active `Student` and `Enrollment`.
- This is the main blocker for safe Student App runtime implementation.

### Student, Enrollment, And Guardians

- `students` core supports student records, guardians, student-guardian relationships, documents, medical info, notes, enrollment operations, lifecycle flows, and current enrollment queries.
- `Enrollment` links student to academic year, optional term, and classroom.
- Student App must not expose guardian private data, medical records, internal notes, admissions data, school IDs, organization IDs, or dashboard-only fields.
- No seat number, avatar URL, app preferences, or direct student account binding was found in the student/enrollment schema.

### Academics, Subjects, And Allocations

- Academics core supports stages, grades, sections, classrooms, rooms, subjects, and teacher subject allocations.
- A basic subject list can be derived from the current enrollment classroom and `TeacherSubjectAllocation` records.
- There is no current timetable, period, durable schedule occurrence, lesson/curriculum, or lesson-progress core module in the live source tree.
- `Subject` has core fields such as name, code, and color, but no `icon_key`, `lessons_count`, `total_hours`, or student progress field.

### Attendance

- Attendance core supports sessions and entries, including daily and period-like session metadata.
- Student attendance/absence/lateness read models can be composed for the authenticated student's own entries once ownership is resolved.
- Attendance session `periodId`/`periodKey` fields are not a timetable source of truth and must not be used to fabricate schedule APIs.

### Grades, Assessments, And Submissions

- Grades core supports assessments, assessment questions, submissions, answers, grade items, snapshots, gradebook, analytics, and rules.
- `GradeAssessmentType` includes quizzes, exams, assignments, practical work, and term/final exam types.
- Question-based assessments can support exams and limited assignment-style work.
- Full homework behavior is not present as a dedicated Homework aggregate.
- Student App grade/exam reads can be built as adapters over grades core after ownership is resolved.

### Files

- Files core stores metadata and object storage references.
- API responses must not expose raw buckets, object keys, storage metadata, or direct S3 URLs.
- Safe Student App file access should use authorized backend download routes or short-lived signed URLs after own-record/resource authorization.
- Student seeded permissions do not currently include file download permissions.

### Reinforcement Tasks, Rewards, And XP

- Reinforcement core supports tasks, targets, assignments, stages, stage submissions, reviews, templates, rewards, XP policies, XP ledger, and XP summary.
- Student tasks read models can be derived from task assignments for the current student.
- Student task submission may be possible at the core level, but route policy, proof upload policy, and student permissions need a decision.
- XP bonus grants remain explicitly deferred for Teacher App and must not be introduced through Student App work.
- Behavior points and XP are separate ledgers; `BehaviorPointLedger` must not be treated as XP.

### Behavior

- Behavior core supports categories, records, review flows, dashboards, and point ledgers.
- Student Behavior read models can be composed from behavior records and attendance entries after ownership is resolved.
- Behavior core remains separate from reinforcement, XP, rewards, and Hero Journey per ADR-0002.

### Hero Journey

- Hero Journey core exists inside reinforcement and supports missions, mission objectives, progress, badges, student badges, events, and rewards.
- Basic Hero Journey read models can be built from existing core.
- Contract fields such as hero name, rank title, rank image, level thresholds, and streak days require policy/derivation or additional product decisions.

### Communication Conversations And Messages

- Communication core supports conversations, participants, messages, reactions, read state, attachments, policies, moderation, and realtime gateway plumbing.
- Student Messages can safely use existing conversations only if the authenticated user is an active participant.
- Contact discovery and new conversation creation remain deferred and must not be added through Student App.
- Message attachment/audio routes remain deferred for Teacher App and should not be backdoored through Student App.

### Announcements

- Communication announcements core exists with audience rows for school, stage, grade, section, classroom, custom student, custom guardian, and custom user targets.
- The current school announcement list path is not sufficient as a Student App audience resolver because Student App must filter by the authenticated student's actual enrollment and user/student targeting.
- Announcement reads need a dedicated safe app composition layer before runtime exposure.

### Notifications

- Communication notifications core stores recipient user notifications and read/archive state.
- Student user notifications can be addressed by `recipientUserId`, but seeded student permissions do not currently include notification view/manage permissions.
- Student App notification center behavior needs a permission and recipient policy decision.

### Pickup And Smart Pickup

- No pickup/smart-pickup module, Prisma model, route, or test surface was found.
- Student Pickup handoff fields cannot be backed safely from current persistence.
- Pickup should be treated as missing and deferred until a core module/product decision exists.

## Student App Contract Mapping

| Area | Backend readiness | Existing core source of truth | Required ownership and composition | Missing or unsafe fields | New core logic needed? | Can build now without schema changes? |
| --- | --- | --- | --- | --- | --- | --- |
| Home | Partially ready | Students, enrollments, settings school profile, reinforcement XP, Hero Journey, tasks, notifications | Resolve current `UserType.STUDENT` to one active student/enrollment, then compose profile summary, XP, badges, task preview, and notification count | Avatar URL, stable app level/rank policy, schedule lesson/meeting data, full homework required-today data; avoid `schoolId` and raw file fields | No new domain core for a basic version, but identity foundation is required | No, because current schema lacks a safe `User` to `Student` link |
| Schedule | Missing / deferred | No timetable/period/schedule occurrence core found | Would require current enrollment classroom and durable schedule occurrences | Day lessons, period index, teacher name per occurrence, room label, durable `scheduleId` | Yes, timetable/schedule core and schema | No |
| Subjects | Partially ready | Academics subjects, classrooms, teacher allocations, enrollments | Use current enrollment classroom to derive allocated subjects | `lessons_count`, `total_hours`, progress, `icon_key` | No new core for a basic subject list; lesson/progress metrics need future core | No until identity foundation is resolved |
| Subject Details | Partially ready | Academics, grades assessments, files attachments where linked | Compose subject header from allocated subject; attach exams/assignments/files only when resource ownership is proven | Lessons, duration, type label, watch XP, complete subject progress; raw `file_url` unsafe | Lesson/curriculum core needed for full contract | No until identity foundation is resolved |
| Attachments | Partially ready | Files, generic attachments, grade/communication/reinforcement resource links | Authorize through the owning resource first, then expose safe file download metadata | Lesson grouping, `is_downloaded`, uploader display, safe signed URL policy; raw bucket/object key unsafe | No new core for limited authorized file reads; curriculum attachment grouping needs future core | No until identity and file permission policy are resolved |
| Homeworks | Partially ready / deferred | Grades `GradeAssessment` with `ASSIGNMENT`, assessment questions, submissions, grade items | Limited adapter can expose assignment-style assessments for current student | Dedicated homework aggregate, due datetime/status semantics, student avatars/counts, file upload question type, full workflow | Yes for Full Homework Core | No for full contract; limited adapter only after identity and product limitation approval |
| Exams | Partially ready | Grades assessments, questions, submissions, grade items | Use own student's approved/published assessment data and submission state | `skill_tag`, XP per exam, stage model, some app question types such as ordering/file upload | No new core for basic read; stage/XP/question parity require decisions | No until identity foundation is resolved |
| Grades | Partially ready | Grades items, snapshots, assessments, terms, academic years | Own student only; compose year/term/subject totals and breakdowns | App-specific total/max presentation and term selection policy | No new core for read adapter | No until identity foundation is resolved |
| Behavior | Ready for read after identity | Behavior records, behavior points, attendance entries | Own student only; compose attendance/absence/lateness and positive/negative behavior records | App display labels/date text; avoid treating behavior points as XP | No | No until identity foundation is resolved |
| Progress | Ready for read after identity | Grades summaries, behavior summaries, attendance entries, possibly XP | Compose read model from existing grades and behavior adapters | Contract is a container; exact progress scoring policy may need product definition | No new core for basic container | No until identity foundation is resolved |
| Hero Journey | Partially ready | Hero missions, objectives, progress, badges, XP ledger | Own student only; compose journey map, badge state, mission progress, rewards | Hero name, rank title, rank image, level threshold policy, streak days, exact coordinate source | No new core for basic read; product policy needed for ranks/levels | No until identity foundation is resolved |
| Profile | Partially ready | Students, enrollments, school profile, XP ledger, badges, rewards/leaderboard | Own student only; expose student-safe profile and achievement data | Student code, avatar, app settings, rank image, exact leaderboard/rank season rules | No new core for basic profile; identity schema/policy needed | No until identity foundation is resolved |
| Tasks | Partially ready | Reinforcement tasks, assignments, stages, submissions, reviews, files | Own task assignments only; proof files require file ownership/resource checks | Proof URL safety, student proof submission policy, `DOCUMENT` proof type mapping, source display policy | No new core for read; submission route/permission policy needed | No until identity foundation is resolved |
| Messages | Partially ready | Communication conversations, participants, messages, reads, realtime | Authenticated user must be an active conversation participant; prefer also requiring resolved student actor | Contact discovery and new conversation creation are deferred; audio/attachment routes unsafe/deferred; online status may be partial | No new core for existing conversation reads | Technically possible by user participant, but should wait for unified Student actor foundation |
| Announcements | Partially ready | Communication announcements, audiences, reads, files | Resolve current student/enrollment and filter school/stage/grade/section/classroom/custom student/custom user targets | Current generic list is not an app audience resolver; image file safety; new/read labels | No new domain core, but app audience resolver is required | No until identity and audience policy are resolved |
| Pickup | Missing / deferred | None found | Would require current student and pickup history ownership | Receiver, gate, time, pickup history, pickup permissions, delegate rules | Yes, pickup core/schema/product decisions | No |

## Ready-To-Build Student App Areas

These areas can be implemented without inventing new business truth once the Student actor and ownership foundation is approved and available. They should be built as app-facing composition/read-model modules over existing core modules.

- Student App access foundation: require `UserType.STUDENT`, active membership, resolved student record, current active enrollment, and safe 404 behavior for guessed cross-school or cross-student IDs.
- Student Home basic: student summary, XP summary, Hero Journey preview, task preview, notification count if notification policy is approved. Exclude schedule and full homework claims until those cores exist.
- Student Profile basic: student name, enrollment grade/classroom, school name, XP totals, badges, and leaderboard-style summaries where already backed by reinforcement core.
- Student Subjects basic: subjects allocated to the student's current classroom through academics and teacher allocations.
- Student Subject Details limited: subject header plus available grade assessments/exams/assignments and authorized resource attachments. Exclude lessons until lesson/curriculum core exists.
- Student Grades read: own grade items/snapshots/assessment breakdowns by year/term/subject.
- Student Exams read: approved question-based grade assessments and own submission/status data.
- Student Behavior read: own attendance/absence/lateness and behavior records.
- Student Progress read: compose from grades and behavior summaries.
- Student Hero Journey read: own missions, progress, badges, XP, and rewards, with explicit product decisions for rank/level labels.
- Student Tasks read: own reinforcement task assignments, stages, progress, and review state.
- Student Messages read/send over existing conversations only: require current user to be a conversation participant; do not add contact discovery or new conversation creation.
- Student Announcements read: only after implementing an app-specific audience resolver over the current student's school/stage/grade/section/classroom/custom user/custom student targeting.
- Student Attachments safe reads: only through authorized owning resources and safe file download/signing behavior.

Strict runtime caveat: because `Student` is not currently linked to `User`, the first runtime sprint should not ship broad Student App reads until that actor mapping is resolved.

## Areas Requiring Core Decisions Or New Core Logic

### Student Identity Link

What is missing: a durable way to resolve the authenticated `UserType.STUDENT` account to exactly one active `Student` and current `Enrollment`.

Safest path: make an architecture/product decision before runtime APIs. Preferred direction is a schema-backed identity relation, such as a nullable unique `Student.userId` or dedicated `StudentUserIdentity` join model with tenant constraints, backfilled during student account provisioning. Do not infer identity from names, email, phone, student code, or guardian records.

### Schedule

What is missing: timetable, periods, schedule occurrences, durable occurrence IDs, and schedule ownership.

Safest path: defer. Create a timetable/schedule core module later instead of deriving schedules from attendance sessions or teacher allocations.

### Full Homework

What is missing: dedicated Homework aggregate, homework due/status semantics, assigned student counts/avatars, full question type parity, and file-upload homework questions.

Safest path: implement only a clearly labeled grade-assessment assignment adapter if product accepts the limitation. Full Homework Core remains deferred.

### Pickup

What is missing: pickup core, pickup history persistence, receiver/delegate/gate rules, pickup authorization, and tests.

Safest path: defer until a pickup core/product decision exists.

### Lessons, Curriculum Progress, And Subject Metrics

What is missing: lesson records, lesson duration/type, lesson attachments, watch XP, subject progress, lesson count, total hours, and icon keys.

Safest path: keep subjects basic now; add curriculum/lesson core later if these app fields become V1 requirements.

### Profile Preferences, Avatar, Rank, And Student Code

What is missing: avatar storage relation, app preferences/settings model, rank images, exact level thresholds, exact streak policy, and a visible student code source in the current contract shape.

Safest path: keep profile read-only and basic. Defer profile/settings mutations and preference CMS.

### Conversations, Attachments, Audio, And Contact Discovery

What is missing: approved Student App contact discovery, new conversation creation policy, app-safe audio route behavior, and app-safe message attachment behavior.

Safest path: support existing conversations only. Do not add contact discovery, new conversation creation, message attachments, or audio routes in Student App until the deferred communication decisions are revisited.

### Announcements And Notifications

What is missing: Student App announcement audience resolver, student announcement read policy, notification permission model, and recipient leak tests for student users.

Safest path: build explicit audience and recipient ownership logic before exposing these surfaces. Do not reuse broad school-dashboard announcement lists for the Student App.

### Files

What is missing: Student App file download permission policy and resource-specific file authorization.

Safest path: authorize files through the owning resource and return backend-mediated download URLs or signed URLs only after access checks. Never expose raw storage keys or buckets.

## Student Actor And Ownership Model

Student App authorization should use this model:

- Require an authenticated actor with `userType === UserType.STUDENT`.
- Require an active membership in the current school/organization context.
- Resolve the authenticated user to exactly one active student record.
- Resolve the student's current active enrollment for the current school and academic context.
- Only return data owned by that student/enrollment.
- Return safe 404 for guessed IDs, cross-school IDs, cross-child IDs, or records outside the resolved student's ownership.
- Do not expose guardian private data, medical data, internal notes, admin-only fields, `schoolId`, `organizationId`, raw file buckets, raw file object keys, session IDs, password hashes, or internal metadata in app responses unless a future contract explicitly requires a safe field.
- Use `RequestContext` and the Prisma `schoolScope` extension for tenant scoping, but do not rely on school scoping alone for student ownership.
- Avoid `platformBypass` for Student App runtime.
- Keep controllers thin; no direct Prisma in controllers.
- Use services/use-cases for ownership checks and presenters for app response shaping.

Current schema gap: `Student` has no direct relation to `User`. Until this is resolved, Student App routes cannot safely know which student owns the authenticated account. The first implementation step should create or approve the identity strategy, then build a reusable Student App actor resolver around it.

## Permissions And Role Readiness

Seeded student role permissions currently include:

- `attendance.sessions.view`
- `grades.assessments.view`
- `reinforcement.tasks.view`
- `students.records.view`

Important implications:

- Student App routes should primarily rely on student actor plus own-record ownership, not broad school-dashboard permissions.
- Current student permissions are insufficient for several expected Student App reads if app routes use existing dashboard permission decorators directly.
- Areas likely needing permission seed or route-policy decisions include grade snapshots/submissions, behavior records/points, XP ledger/summary, Hero Journey progress, rewards, files downloads, communication conversations/messages, announcements, and notifications.
- Announcement and notification consumption need explicit recipient/audience decisions before runtime exposure.
- `students.records.view` is too broad to use by itself for self-service Student App reads; ownership must narrow it to the authenticated student.

## Teacher App Deferred Scope Carry-Forward

The following Teacher App deferred items remain postponed until after Phase 5 is complete:

- Teacher Schedule APIs
- Timetable / period / schedule occurrence / durable `scheduleId`
- Full Homework Core
- XP bonus grants
- Contact discovery / new conversation creation
- Message attachment/audio routes
- Profile/settings mutations
- Support/rating/legal/privacy/preferences CMS

Student App runtime work must not backdoor these decisions. In practice:

- Do not implement Student Schedule by inventing timetable data.
- Do not implement full Student Homeworks by stretching `GradeAssessment` beyond an explicitly limited adapter.
- Do not introduce XP bonus grants through Student rewards/profile/home.
- Do not add contact discovery or new conversation creation for Student Messages.
- Do not add message audio/attachment routes through Student App while Teacher App equivalents remain deferred.
- Do not add app preference/CMS/profile mutation surfaces under Student App to work around Teacher App deferrals.

## Recommended Student App Sprint Breakdown

### Sprint 8B - Ownership Foundation, Scaffold, Home/Profile Basic

- Approve and implement the Student-to-User identity strategy.
- Add Student App module scaffold only after identity is decided.
- Add reusable Student App actor/current enrollment resolver.
- Add security tests for own-record, guessed ID, cross-school, and missing-enrollment behavior.
- Implement basic Home and Profile read models only after ownership is proven.

### Sprint 8C - Subjects, Grades, And Exams Read Adapters

- Implement Subjects basic from current enrollment classroom allocations.
- Implement Subject Details limited read model without lesson fabrication.
- Implement Grades read by year/term/subject.
- Implement Exams read over approved grade assessments/questions/submissions.

### Sprint 8D - Behavior, Progress, And Hero Journey Read Adapters

- Implement Behavior read from behavior and attendance core.
- Implement Progress composition from grades and behavior summaries.
- Implement Hero Journey read from missions, progress, badges, rewards, and XP ledger.
- Keep behavior points separate from XP.

### Sprint 8E - Tasks, Existing Messages, Announcements

- Implement Tasks read over own reinforcement assignments.
- Decide whether Student task proof submission belongs in V1; if yes, add explicit file/proof authorization.
- Implement Messages over existing conversations only.
- Implement Announcements read only with a Student App audience resolver.
- Defer notifications unless recipient and permission policy is approved.

### Sprint 8F - Student App Closeout

- Add final e2e/security coverage for all shipped Student App routes.
- Verify payload safety: no school IDs, raw storage keys, guardian private data, medical/admin fields, or deferred Teacher App fields.
- Update closeout documentation after runtime implementation is complete.

### Future Core Decision Sprint

- Schedule/timetable/period/schedule occurrence core.
- Full Homework Core.
- Pickup core.
- Curriculum/lessons/progress metrics.
- Student notification center and app preferences.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Student-to-user identity ambiguity | Do not ship broad Student App routes until a schema-backed identity relation or approved join model exists. |
| Cross-child or cross-school data leakage | Resolve current student/enrollment first; return safe 404 for records outside ownership even if school scoped. |
| Exposing guardian, private, medical, or admin fields | Use dedicated Student App presenters with explicit selects and response DTOs. |
| Fabricating schedule or homework data | Defer Schedule and Full Homework Core; use limited adapters only when explicitly accepted. |
| Treating behavior points as XP | Keep `BehaviorPointLedger` separate from `XpLedger`; compose only from XP core for XP fields. |
| Exposing raw file keys or buckets | Authorize through owning resource and return backend-mediated downloads or signed URLs only. |
| Announcement audience leaks | Build a student-aware audience resolver; do not reuse broad current-school list behavior. |
| Notification recipient leaks | Filter strictly by authenticated recipient user and approved student notification policy. |
| Message contact discovery overreach | Support existing conversations only; no new conversation/contact discovery in Student App. |
| Reintroducing Teacher App deferred work | Keep all Teacher deferred scope blocked until after Phase 5 and explicit approval. |
| Permission mismatch | Prefer student actor plus ownership policy for app routes; add narrow permissions only when required. |

## Recommended Immediate Next Runtime Task

Sprint 8B should start with the Student App ownership foundation: approve and implement a durable `UserType.STUDENT` to `Student` identity strategy, then add a reusable current-student/current-enrollment resolver with security tests for own-record, cross-school, guessed-ID, missing-student, and missing-enrollment cases.

Only after that foundation is green should the backend implement basic Student Home and Student Profile read routes.

## Verification Results

Verification was run on 2026-05-06 after creating this audit:

- `npm run build` - passed.
- `npm run test -- teacher-app --runInBand` - passed: 36 suites, 187 tests.
- `npm run test -- --runInBand` - passed: 224 suites, 1157 tests.
- `npm run test:security -- --runInBand` - passed: 14 suites, 510 tests.
- `npm run verify:sprint7d` - passed. Preflight, migration deploy, seed, build, core tests, security tests, historical sprint e2e suites, and Teacher App final closeout e2e all completed successfully.
