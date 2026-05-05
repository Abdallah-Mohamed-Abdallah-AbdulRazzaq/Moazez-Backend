# Sprint 7D Teacher Tasks + XP Center Audit

## Purpose

This audit maps the Teacher App Tasks and XP Center handoff contracts against the backend state after Sprint 7C. It is a documentation-only planning artifact for Sprint 7D.

No runtime Teacher App APIs, controllers, use-cases, routes, DTOs, presenters, Prisma schema changes, migrations, seed changes, package scripts, README changes, tests, ADR edits, or project structure edits are introduced by this task.

## Sources Reviewed

Governance and architecture:

- `AGENT_CONTEXT_PRIMER.md`
- `CLAUDE.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
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
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`

Teacher App handoff docs:

- `adr/Teacher-App/teacher_TASKS_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_XP_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_CLASSROOM_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_HOME_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_MY_CLASSES_BACKEND_MODELS.md`

Current implementation and verification coverage:

- `src/modules/teacher-app/**`
- `test/security/tenancy.teacher-app.spec.ts`
- `test/e2e/teacher-app-home-my-classes.e2e-spec.ts`
- `test/e2e/teacher-app-classroom-operations.e2e-spec.ts`

Core modules and data model:

- `src/modules/reinforcement/**`
- `src/modules/behavior/**`
- `src/modules/students/**`
- `src/modules/files/**`
- `src/modules/grades/**`
- `prisma/schema.prisma`
- `prisma/seeds/01-permissions.seed.ts`
- `prisma/seeds/02-system-roles.seed.ts`
- `src/infrastructure/database/school-scope.extension.ts`
- `test/e2e/reinforcement-foundation.e2e-spec.ts`
- `test/e2e/rewards-foundation.e2e-spec.ts`
- `test/e2e/hero-journey-foundation.e2e-spec.ts`
- Behavior and Teacher App security/e2e tests relevant to tenancy and XP separation

Note: `DIRECTORY_STRUCTURE.md` is listed by the project instructions but is not present in the repository. The available directory references were `DIRECTORY_STRUCTURE_VISUAL.md`, `Moazez-Project-Structure.json`, and the current source tree.

## Current Backend State

### Teacher App Surface After Sprint 7C

Teacher App currently exposes Home, My Classes, Classroom, Attendance adapter APIs, Grades and Assignments read APIs, Assignment submission reads, and Submission review adapter APIs.

There are no runtime Teacher Tasks routes and no runtime Teacher XP Center routes. Existing Teacher App e2e coverage explicitly confirms that deferred Teacher App areas such as `/api/v1/teacher/tasks` and `/api/v1/teacher/xp` are not registered yet.

Teacher App route access currently relies on:

- A teacher actor requirement.
- Active teacher membership from the request context.
- Owned class validation through `TeacherSubjectAllocation.id`.
- Same-school and ownership checks through `TeacherAppAccessService`.

The app-facing `classId` is `TeacherSubjectAllocation.id`, not `Classroom.id`. That convention must continue for Sprint 7D.

### Reinforcement Tasks

The Reinforcement core has normalized persistence for:

- `ReinforcementTask`
- `ReinforcementTaskTarget`
- `ReinforcementAssignment`
- `ReinforcementTaskStage`
- `ReinforcementSubmission`
- `ReinforcementReview`

The task core supports:

- Sources: `TEACHER`, `PARENT`, `SYSTEM`.
- Statuses: `NOT_COMPLETED`, `IN_PROGRESS`, `UNDER_REVIEW`, `COMPLETED`, `CANCELLED`.
- Target scopes: `SCHOOL`, `STAGE`, `GRADE`, `SECTION`, `CLASSROOM`, `STUDENT`.
- Proof types: `IMAGE`, `VIDEO`, `DOCUMENT`, `NONE`.
- Reward types: `MORAL`, `FINANCIAL`, `XP`, `BADGE`.
- Assignment expansion from selected targets to active student enrollments.
- Per-stage submissions and reviews.
- Audit logging for task creation, stage submission, approval, rejection, and cancellation.

Core task routes already exist under `/api/v1/reinforcement/*`, not under `/api/v1/teacher/*`.

Important implementation readiness note: `TasksModule`, `ReviewsModule`, and `XpModule` currently register their providers internally but do not export their use-cases. Future Teacher App runtime work that delegates to core use-cases may need targeted module exports, following the existing `RollCallModule` and `AssessmentsModule` pattern.

### Reinforcement Templates

`ReinforcementTaskTemplate` and `ReinforcementTaskTemplateStage` exist for reusable task definitions. Templates support stage definitions, reward metadata, source, active status, school scope, and optional academic-year or term scope.

Teacher role coverage currently includes `reinforcement.templates.view` but not `reinforcement.templates.manage`. Teacher App Tasks can read templates only if a future route chooses to expose template choices. Teacher template management should not be added without an explicit runtime scope decision.

### Reinforcement Reviews

The reviews core supports:

- Student stage submission.
- Review queue listing.
- Review item detail.
- Approve submission.
- Reject submission.

Review actions are audited and update submission, assignment, and task state through core domain logic. Teacher App must not duplicate this state machine.

The core review API is submission-centric. The Teacher Tasks handoff proposes a route shaped as `taskId + stageId`, which is not always enough to identify a single submission when a task targets a whole class. A safe Teacher App review adapter must resolve a unique owned assignment or submission before delegating to core approval/rejection.

### Rewards

Rewards core supports:

- Reward catalog items.
- Redemption requests.
- Redemption review and fulfillment workflows.
- Reward dashboard summaries.

Reward redemptions do not deduct XP, and rewards are not a wallet, finance module, or marketplace. Teacher role coverage includes reward viewing and redemption request permissions, but not catalog management, redemption review, or fulfillment.

Teacher Tasks may display reward labels or values already present on a Reinforcement Task. Sprint 7D should not expand the rewards economy or connect financial rewards to finance or wallet behavior.

### XP

The XP core has:

- `XpPolicy`
- `XpLedger`
- Effective policy resolution.
- XP ledger listing.
- XP summary.
- XP grants from approved reinforcement reviews.
- Manual bonus grants.

The XP core enforces:

- Allowed reasons.
- Daily caps.
- Weekly caps.
- Cooldowns.
- Idempotency through source and student uniqueness.
- Audit logging for XP grants.

Teacher role coverage includes `reinforcement.xp.view` but not `reinforcement.xp.manage`.

The manual bonus grant use-case exists, but it is not currently safe as a Teacher App operation without an explicit role and product policy decision. Teacher App would also need to enforce owned-student checks before any grant reaches the core.

### Hero Journey

Hero Journey core has badges, missions, objectives, student progress, events, and reward helpers. Hero missions can grant XP through core flows.

Hero Journey can contribute entries to XP history through `XpLedger`, but it is not a direct source of Teacher XP Center rank/tier persistence. Any rank, tier, level progress, or promotion indicator must be derived in the presenter only after a clear policy is approved, or returned as unavailable.

### Behavior

Behavior core has categories, records, review workflow, and `BehaviorPointLedger`.

Behavior points are separate from XP. ADR-0002 makes this boundary explicit, and current behavior e2e tests protect against accidental XP or rewards coupling. Sprint 7D must not blur Behavior points with XP or Reinforcement Tasks.

Teacher XP Center may display an XP source named `behavior` only if there are actual `XpLedger` entries with source type `BEHAVIOR`. It must not derive XP from `BehaviorPointLedger`.

### Students and Enrollments

Students and enrollments are normalized:

- `Student` owns student identity and school scope.
- `Enrollment` owns active placement in an academic year, term, and classroom.
- `TeacherSubjectAllocation` owns teacher access to a subject/classroom/term combination.

Teacher App must continue to resolve student access through owned allocations and active enrollments. Same-school access is not enough.

Current student data does not provide all app presentation fields. Student photo/avatar, seat number, and student number are not generally available in the core student/enrollment shape inspected for Sprint 7C.

### Files

Files are stored externally and represented by metadata in `File`. The database stores bucket and object key data, but presenters must not expose raw storage keys or direct S3/MinIO URLs.

Private file access is expected to go through the Files module and signed download flow. The core file presenter returns safe metadata. Teacher role coverage includes `files.uploads.manage`; it does not currently include `files.downloads.view`.

Teacher Tasks proof rendering must avoid a raw `proofPath`. It should use a safe file id, safe file metadata, and an approved app download URL shape or Files download route policy.

## Teacher Tasks Contract Mapping

### Dashboard: `assignedClasses`

Contract fields:

- `id`
- `cycleId`, `cycleName`
- `gradeId`, `gradeName`
- `sectionId`, `sectionName`
- `subjectId`, `subjectName`
- `studentsCount`

Backend readiness: ready.

Core sources:

- `TeacherSubjectAllocation.id` for app-facing `id` / `classId`.
- `TeacherSubjectAllocation.subject`.
- `TeacherSubjectAllocation.classroom`.
- `Classroom.section`.
- `Section.grade`.
- `Grade.stage`.
- Active `Enrollment` rows for `studentsCount`.

Rules:

- The app-facing id must remain the allocation id.
- Future runtime code must derive subject, classroom, term, academic year, and hierarchy from the owned allocation instead of trusting request body display names.

### Dashboard: `students`

Contract fields:

- `id`
- `name`
- `classId`
- `cycleName`
- `gradeName`
- `sectionName`

Backend readiness: ready for active owned students.

Core sources:

- `Enrollment.student`.
- `Enrollment.classroom`.
- Owned `TeacherSubjectAllocation` for `classId` and hierarchy.

Missing or limited:

- Rich student profile details are outside this contract and should not be invented.
- A student may appear in more than one owned allocation if the teacher teaches multiple subjects or terms. The adapter must decide whether to return per-allocation rows or deduplicate with a stable class context.

### Task Dashboard and Task List

Contract task fields include:

- `id`, `title`, `description`
- `source`
- `status`
- `rewardType`, `rewardValue`
- `progress`
- `dueDate`
- `subjectName`
- `classId`
- cycle/grade/section labels
- optional `studentId`, `studentName`
- `stages`

Backend readiness: mostly ready.

Core sources:

- `ReinforcementTask` for title, description, source, status, reward fields, due date, subject, and stages.
- `ReinforcementAssignment` for student, enrollment, assignment status, and progress.
- `ReinforcementSubmission` and `ReinforcementReview` for proof/review state.
- Owned `TeacherSubjectAllocation` for app `classId` and subject/classroom ownership.

Safe implementation path:

- Read only teacher-created or teacher-assigned tasks where `source = TEACHER` and the task belongs to the current teacher by `assignedById` or `createdById`.
- Restrict returned assignments to students in owned allocations.
- Map core task status through the app status vocabulary:
  - `NOT_COMPLETED` -> `pending`
  - `IN_PROGRESS` -> `inProgress`
  - `UNDER_REVIEW` -> `underReview`
  - `COMPLETED` -> `completed`
- Exclude or explicitly handle `CANCELLED`, because the handoff contract does not define a cancelled status.
- Convert core integer assignment progress into app 0..1 progress only in the presenter.

Risks:

- The app task row has optional singular `studentId` and `studentName`, but a class-targeted task has many assignments. A future presenter must avoid pretending a class task has one student. Safe options are to return those fields only for student-targeted rows, or shape list rows around assignments.
- `subjectName` in create requests is unsafe as an input. It must be derived from the owned allocation.

### Task Detail

Backend readiness: ready with presenter constraints.

Core sources:

- `ReinforcementTask`.
- `ReinforcementTaskStage`.
- `ReinforcementAssignment`.
- `ReinforcementSubmission`.
- `ReinforcementReview`.
- `File` metadata for proofs.

Safe implementation path:

- Resolve task detail only if the task has at least one assignment in a student enrollment owned by the teacher's allocation, and for teacher-authored tasks require `assignedById` or `createdById` to match the teacher unless product explicitly approves viewing non-teacher-authored reinforcement tasks.
- Return stages from the core task stage table.
- Return per-stage proof/review state from submissions and reviews.
- Do not return school ids, storage keys, bucket names, raw file URLs, schedule ids, or unrelated student data.

Risk:

- Detail views for classroom-targeted tasks need a clear per-student or aggregate representation. The handoff stage shape is not enough to express multiple student submissions per stage unless the route or response includes an assignment/student context.

### Task Create

Contract request fields:

- `classId`
- optional `studentId`
- `title`
- `description`
- `subjectName`
- `rewardType`
- `rewardValue`
- `dueDate`
- `stages`

Backend readiness: ready for a constrained adapter.

Core target:

- Delegate to `CreateReinforcementTaskUseCase`.
- Use `ReinforcementTargetScope.CLASSROOM` for class tasks.
- Use `ReinforcementTargetScope.STUDENT` for student tasks.

Required adapter behavior:

- Interpret `classId` as `TeacherSubjectAllocation.id`.
- Assert the current teacher owns the allocation.
- If `studentId` is provided, assert the student has an active enrollment in the owned allocation's classroom and term context.
- Derive `academicYearId`, `termId`, `subjectId`, classroom id, and hierarchy from the allocation.
- Set `source = TEACHER`.
- Set `assignedById` or `createdById` to the current teacher.
- Ignore or validate `subjectName` as display-only; do not trust it for persistence.
- Map app reward types only to supported core types. The handoff exposes `financial` and `moral`; core also supports `XP` and `BADGE`, but those should not be introduced through the Teacher App contract unless explicitly approved.

Risks:

- Financial reward values are descriptive in Reinforcement Tasks. They must not create finance, wallet, marketplace, or reward-redemption behavior.
- XP reward task creation is possible in core, but Teacher App must not use it to auto-grant XP in this task.

### Target Classes and Students

Backend readiness: ready.

Core sources:

- Owned `TeacherSubjectAllocation` list.
- Active `Enrollment` rows in owned classrooms.
- Student identity from `Student`.

Required rule:

- Same-school membership is insufficient. Ownership must always pass through the teacher allocation and active enrollment.

### Stages

Backend readiness: ready.

Core sources:

- `ReinforcementTaskStage`.

Mappings:

- App `image` -> core `IMAGE`.
- App `document` -> core `DOCUMENT`.
- App `none` -> core `NONE`.

Core supports `VIDEO`, but the app handoff does not. Do not expose video proof through Teacher App Tasks unless the contract is expanded.

### Proof and Attachments

Backend readiness: partial.

Core supports:

- One `proofFileId` per `ReinforcementSubmission`.
- `proofText`.
- Safe `File` metadata through presenters.

Missing or risky:

- The handoff field `proofPath` must not become a raw object key or direct storage URL.
- Teacher role currently lacks `files.downloads.view`.
- There is no multi-attachment list for a task stage submission.

Safe implementation path:

- Return safe file metadata and a controlled download route or file id, not object storage internals.
- Decide whether Teacher App proof viewing uses the Files download permission, a teacher-app-owned download adapter with ownership checks, or a new approved permission policy.

### Approve or Reject Stage

Contract request fields:

- `taskId`
- `stageId`
- `isApproved`
- `teacherNote`

Backend readiness: partial and requires a route-resolution decision.

Core operation:

- Delegate approval to `ApproveReinforcementSubmissionUseCase`.
- Delegate rejection to `RejectReinforcementSubmissionUseCase`.

Main issue:

- Core reviews are submission-centric.
- `taskId + stageId` can match multiple student submissions for a classroom-targeted task.
- The handoff body does not include `studentId`, `assignmentId`, or `submissionId`.

Safe implementation options:

- Prefer a Teacher App action over a resolved submission id, if the frontend can carry it from task detail.
- Or require `studentId` or `assignmentId` in the adapter contract before implementation.
- Or allow the route only when `taskId + stageId` resolves to exactly one submitted owned submission, and otherwise return a conflict-style domain error.

Boundary:

- Approval/rejection must preserve core audit behavior.
- Approval must not automatically grant XP bonus unless a separate approved core XP grant path is invoked in a later task.

### Reward and XP Linkage

Backend readiness: display-ready, grant behavior deferred.

Core state:

- Reinforcement Tasks can store reward type/value.
- XP core can grant XP for approved reinforcement reviews.
- Manual bonus grants exist in XP core.

Sprint 7D boundary:

- Display task reward fields from core.
- Do not auto-grant XP from Teacher App task approval until product and permission rules are approved.
- Do not treat financial rewards as wallet or finance records.
- Do not create reward catalog items or redemptions from Teacher Tasks.

### Teacher Tasks Operations Readiness

Safe to implement now, after this audit:

- Owned task dashboard read.
- Owned task list read.
- Owned task detail read, with careful class-target representation.
- Owned class/student target selectors.
- Teacher task create for owned classroom or owned student targets, delegated to Reinforcement core.

Requires explicit design decision before runtime implementation:

- Stage approve/reject route identity, because `taskId + stageId` is ambiguous for class tasks.
- Proof download policy and required permission.
- Whether Teacher App can display cancelled tasks.
- Whether task creation may expose XP or badge reward types.
- Whether templates are part of the Teacher Tasks create experience.

Deferred:

- Any runtime endpoints in this audit task.
- XP bonus grants.
- Wallet, finance, marketplace, or advanced rewards behavior.
- Behavior-to-XP conversion.

## Teacher XP Center Contract Mapping

### Dashboard Readiness

Contract dashboard areas:

- `seasonLabel`
- `trackedStudentsCount`
- `totalSeasonXp`
- `autoGrantedXp`
- `pendingBoostCandidates`
- `bonusPolicy`
- `assignedClasses`
- `students`
- `sourceBreakdown`
- `recentBonusRecords`

Backend readiness: partial but enough for a read-only foundation.

Ready sources:

- Owned classes from `TeacherSubjectAllocation`.
- Tracked students from active `Enrollment` rows in owned allocations.
- Season label from active `AcademicYear` and `Term`.
- XP totals from `XpLedger`.
- Source breakdown from `XpLedger.sourceType`.
- Recent bonus records from `XpLedger` rows with `sourceType = MANUAL_BONUS`, filtered to owned students and current teacher actor where applicable.
- Effective policy from `XpPolicy`.

Missing or risky:

- `pendingBoostCandidates` has no explicit persistence or policy. It can only be derived heuristically, so it should be omitted, zeroed, or marked unavailable until product defines it.
- `teacherAvailableBudget` is not persisted in `XpPolicy`.
- Policy caps exist as daily and weekly caps, but the exact app shape `weeklyLimitPerStudent`, `weeklyLimitPerClass`, and teacher budget needs mapping approval.
- `XpLedger` does not carry `subjectId`. A teacher who owns one subject in a classroom may see classroom/student XP from other sources unless the adapter intentionally filters by source or by teacher-authored events. This needs an explicit product decision for XP Center semantics.

### Student XP History

Backend readiness: ready for ledger history, partial for app progress metrics.

Ready sources:

- `XpLedger` filtered by owned student.
- Student identity from `Student`.
- Enrollment/classroom hierarchy from `Enrollment`.
- Source labels from `XpSourceType`.

Missing or partial:

- `completedLessons` is not backed by a durable lessons module in V1.
- Full Homework core remains deferred.
- `completedHomeworks` and `completedExams` can only be approximated from Grades/Hero/Reinforcement if product approves a specific definition.
- `rankTier`, `levelProgress`, and `recentlyPromoted` are not persisted.

Safe path:

- Start with ledger-backed XP history and totals.
- Return unsupported progress metrics as null, zero, or unavailable through a documented presenter decision.
- Do not infer XP from Behavior points.

### Class XP Summary

Backend readiness: ready for owned-student totals, partial for subject-specific totals.

Core sources:

- Owned allocation -> classroom.
- Active enrollments -> student ids.
- `XpLedger` totals by student and source.

Risk:

- The Teacher App `classId` is an allocation id, but XP ledger entries are not subject-scoped. A class XP summary can safely mean "XP for students in this owned allocation's classroom", but not necessarily "XP earned in this teacher's subject" unless source metadata is extended or filtered by teacher-authored records.

### Rank and Tier

Backend readiness: partial.

Ready:

- `rankPosition` can be derived by sorting owned students by season XP.

Missing:

- No persisted rank tier model.
- No level threshold table.
- No promotion history.

Safe path:

- Either defer rank/tier fields or compute a documented presenter-only tier from approved thresholds.
- Do not create schema or seed policy in this audit task.

### Bonus Grant

Backend readiness: core exists, Teacher App policy not ready.

Core support:

- `GrantManualXpUseCase`.
- `XpPolicy` daily/weekly caps.
- `allowedReasons`.
- Cooldowns.
- Idempotency.
- Audit logging.

Gaps:

- Teacher role lacks `reinforcement.xp.manage`.
- No approved teacher-specific permission or role policy for app-owned bonus grants.
- No persisted teacher weekly budget.
- No class-level teacher budget.
- Core manual grant does not by itself know Teacher App ownership; a Teacher App adapter must assert owned student access first.

Recommendation:

- Do not implement Teacher XP bonus grants until a runtime task explicitly approves permission and policy changes.
- If approved later, use the core manual grant use-case, add strict owned-student validation before delegation, and preserve core audit behavior.

### Teacher XP Center Operations Readiness

Safe to implement now, after this audit:

- Read-only XP dashboard using owned students and `XpLedger`.
- Student XP history for owned students.
- Class XP summary for owned allocation students, with semantics clearly documented.
- Recent manual bonus records read, if filtered to owned students and current teacher actor.
- Effective policy display, mapped conservatively.

Requires explicit design decision before runtime implementation:

- Whether XP Center totals are all XP for owned students or only teacher-authored/teacher-subject XP.
- Rank/tier thresholds.
- `pendingBoostCandidates` derivation.
- `teacherAvailableBudget`.
- Bonus grant permission and role coverage.
- Whether `behavior` source is shown only from XP ledger entries or hidden when absent.

Deferred:

- Bonus grant runtime endpoint.
- New permission seed changes.
- XP policy schema expansion.
- Behavior point conversion to XP.

## Boundary Rules For Sprint 7D Runtime Work

- Teacher App remains a composition and presenter layer.
- Reinforcement, XP, Behavior, Students, Files, and Grades remain the source of truth for their domains.
- Teacher App must not duplicate Reinforcement task status transitions, review state transitions, XP cap enforcement, cooldown enforcement, or idempotency logic.
- Behavior points remain separate from XP unless a future core decision explicitly links them.
- Teacher access must be enforced through `TeacherSubjectAllocation` ownership and active student enrollment checks, not school scope alone.
- Same-school data is still private unless it belongs to the teacher's owned allocation.
- Files must not expose bucket names, object keys, raw storage URLs, or unsigned direct paths.
- Reads should not be audited unless the core convention requires it.
- Mutations must delegate to core use-cases and preserve core audit behavior.
- All routes remain globally prefixed with `/api/v1`.
- Adapter-backed frontend contracts must preserve path, method, and route naming once implemented.

## Permissions And Role Readiness

### Relevant Seeded Permissions

Reinforcement and XP:

- `reinforcement.overview.view`
- `reinforcement.tasks.view`
- `reinforcement.tasks.manage`
- `reinforcement.templates.view`
- `reinforcement.templates.manage`
- `reinforcement.reviews.view`
- `reinforcement.reviews.manage`
- `reinforcement.xp.view`
- `reinforcement.xp.manage`
- `reinforcement.hero.view`
- `reinforcement.hero.manage`
- `reinforcement.hero.progress.view`
- `reinforcement.hero.progress.manage`
- `reinforcement.hero.badges.view`
- `reinforcement.hero.badges.manage`
- `reinforcement.rewards.view`
- `reinforcement.rewards.manage`
- `reinforcement.rewards.redemptions.view`
- `reinforcement.rewards.redemptions.request`
- `reinforcement.rewards.redemptions.review`
- `reinforcement.rewards.fulfill`

Related modules:

- `students.records.view`
- `files.uploads.manage`
- `files.downloads.view`
- Behavior permissions including `behavior.points.view`, `behavior.records.create`, `behavior.records.manage`, and `behavior.records.review`
- Grades and attendance permissions already used by Teacher App classroom operations

### Teacher Role Coverage

The seeded teacher role currently has:

- `reinforcement.tasks.view`
- `reinforcement.tasks.manage`
- `reinforcement.templates.view`
- `reinforcement.reviews.view`
- `reinforcement.reviews.manage`
- `reinforcement.xp.view`
- `reinforcement.hero.view`
- `reinforcement.hero.progress.view`
- `reinforcement.rewards.view`
- `reinforcement.rewards.redemptions.view`
- `reinforcement.rewards.redemptions.request`
- `behavior.overview.view`
- `behavior.categories.view`
- `behavior.records.view`
- `behavior.records.create`
- `behavior.points.view`
- `students.records.view`
- `files.uploads.manage`
- Attendance and grades permissions required by current Teacher App classroom flows

The seeded teacher role does not currently have:

- `reinforcement.xp.manage`
- `reinforcement.templates.manage`
- `reinforcement.hero.manage`
- `reinforcement.hero.progress.manage`
- `reinforcement.hero.badges.view`
- `reinforcement.hero.badges.manage`
- `reinforcement.rewards.manage`
- `reinforcement.rewards.redemptions.review`
- `reinforcement.rewards.fulfill`
- `files.downloads.view`
- Behavior manage/review permissions

### Teacher App Route Policy

Current Teacher App routes do not use permission decorators. They rely on teacher actor validation and ownership checks. This remains viable for app-owned routes if product keeps Teacher App as a teacher-only owned surface.

If future Teacher Tasks routes add permission decorators, teacher role already has the core task and review permissions required for basic task create/read/review operations.

If future Teacher XP read routes add a permission decorator, teacher role already has `reinforcement.xp.view`.

XP bonus grants are different. Teacher role lacks `reinforcement.xp.manage`, and bonus grants require an explicit role and product policy decision. Seed changes should be avoided until a runtime task explicitly approves and requires them.

## Recommended Sprint 7D Breakdown

### Task 1: Teacher Tasks + XP Center Audit

Status: this document.

Outcome:

- Contract mapping is complete.
- Runtime implementation boundaries are documented.
- Safe sequencing is identified.

### Task 2: Teacher Tasks Read Foundation

Scope:

- Add read-only Teacher Tasks dashboard/list/detail routes.
- Add owned class and student task selectors if needed by the frontend.
- Build app presenters over Reinforcement Task, Assignment, Stage, Submission, Review, Student, Enrollment, and TeacherSubjectAllocation data.
- Preserve `TeacherSubjectAllocation.id` as app `classId`.
- Do not create tasks.
- Do not approve/reject stages.
- Do not grant XP.

Key checks:

- Same-school other-teacher tasks are not visible.
- Cross-school tasks are not visible.
- No raw file storage data is returned.
- Cancelled task behavior is explicitly defined.

### Task 3: Teacher Task Create + Targeting Adapter

Scope:

- Implement teacher-owned task creation by delegating to Reinforcement core.
- Allow owned classroom target and owned student target.
- Derive subject, classroom, term, and academic year from the allocation.
- Ignore or validate display-only `subjectName`.
- Keep app reward types constrained to approved handoff values.

Key checks:

- Cannot target students outside owned allocations.
- Cannot target classes outside owned allocations.
- Task creation keeps core audit behavior.
- No finance, wallet, marketplace, or reward-redemption behavior is introduced.

### Task 4: Teacher Task Stage Review Adapter

Scope:

- Implement approve/reject only after the route identity ambiguity is resolved.
- Delegate to core approve/reject use-cases.
- Preserve core audit behavior.
- Keep XP grant behavior deferred unless separately approved.

Required pre-decision:

- Choose whether review actions identify a submission by `submissionId`, by `assignmentId`, by `studentId`, or by unique `taskId + stageId` resolution.

Key checks:

- Same-school teacher cannot review another teacher's owned student submission.
- Cross-school submissions are inaccessible.
- Rejection and approval follow core state rules.
- No automatic bonus grants occur.

### Task 5: Teacher XP Center Read APIs

Scope:

- Add read-only XP dashboard.
- Add student XP history for owned students.
- Add class XP summary for owned allocation students.
- Use `XpLedger`, `XpPolicy`, active enrollments, and owned allocations.
- Return rank/tier fields only if a presenter-only policy is approved; otherwise mark as unavailable.

Key checks:

- Same-school and cross-school student XP is protected.
- Behavior point ledger is not counted as XP.
- Class XP summary semantics are documented.
- Unsupported metrics are not invented.

### Task 6: XP Bonus Grant Decision

Recommended default: defer.

If product approves implementation:

- Define whether Teacher App uses `reinforcement.xp.manage` or a new approved app-specific permission.
- Update seeds only in that runtime task.
- Define teacher weekly budget semantics.
- Define allowed reasons and caps.
- Delegate to `GrantManualXpUseCase`.
- Enforce owned-student access before delegation.
- Preserve audit behavior.

### Task 7: Sprint 7D Closeout

Scope:

- Run full verification.
- Update project documentation and project structure only as part of an approved closeout task.
- Keep handoff notes clear about deferred Homework, timetable/schedule, Behavior-to-XP, and bonus grant policy areas.

## Risks And Mitigations

### Same-School Teacher Data Leakage

Risk: school-scoped Prisma access can still return another teacher's same-school tasks or student XP.

Mitigation: every Teacher App Tasks and XP query must pass through owned `TeacherSubjectAllocation` and active enrollment filters.

### Targeting Students Or Classes Outside Ownership

Risk: task creation could target a valid same-school classroom or student that the teacher does not own.

Mitigation: treat app `classId` as allocation id and validate every target student against active enrollments in that allocation.

### Mixing Behavior With XP

Risk: XP Center source breakdown includes `behavior`, which may tempt implementations to count `BehaviorPointLedger`.

Mitigation: only count `XpLedger` rows. Behavior points remain separate unless a future core bridge is explicitly approved.

### Over-Granting XP Bonus Powers

Risk: manual XP grants exist in core and could be exposed to every teacher without budget or permission policy.

Mitigation: defer bonus grant endpoint until permission, cap, allowed reason, ownership, and budget policy are approved.

### Raw File URL Exposure

Risk: `proofPath` could leak object keys or direct storage URLs.

Mitigation: expose safe file metadata and an approved download path only. Never return bucket or object key data.

### Duplicated Task State Machines

Risk: Teacher App may try to compute task completion, review, and assignment transitions independently.

Mitigation: delegate mutations to Reinforcement core and use presenters only for app response shaping.

### Accidental Rewards Or Economy Expansion

Risk: financial reward values or reward labels could be interpreted as wallet, billing, or marketplace behavior.

Mitigation: display reward metadata only. Do not create finance records, wallet balances, catalog items, or redemptions from Teacher Tasks.

### Missing Role Permissions

Risk: XP bonus grant or proof downloads may need permissions the teacher role does not currently hold.

Mitigation: avoid seed changes until the relevant runtime task explicitly approves them. Document route policy before implementation.

### Missing Student App Or Parent App Consumers

Risk: Teacher Tasks may depend on student or parent task submission experiences that are not part of Sprint 7D.

Mitigation: implement teacher-owned reads and create/review adapters only against existing core persistence. Do not invent student/parent app APIs in Sprint 7D.

### Stage Review Ambiguity

Risk: `taskId + stageId` is not unique for class-targeted tasks.

Mitigation: resolve a submission-specific review identity before runtime work. Prefer carrying a submission or assignment id from detail to action.

### Subject-Specific XP Ambiguity

Risk: Teacher XP Center may imply subject-specific XP, while `XpLedger` is not subject-scoped.

Mitigation: document whether XP Center shows all XP for owned students in the teacher's classroom context or only teacher-authored events. Do not imply subject precision if the data does not support it.

## Recommended Immediate Next Runtime Task

Sprint 7D Task 2 should be Teacher Tasks Read Foundation.

This is the safest next implementation step because it only reads existing Reinforcement, Student, Enrollment, and TeacherSubjectAllocation state, keeps Teacher App as a composition layer, preserves the allocation-backed `classId`, and avoids the unresolved XP bonus and stage-review identity decisions.

