# Sprint 26A - Reinforcement Completion Decision & Contract Lock

## 1. Executive Decision

Decision: **PASS**.

Target final family status: **V1_READY_FULL_APP_CONTRACT**.

Current status: **PARTIAL_NEEDS_TARGETED_CLOSEOUT**.

Runtime changes: **none in this sprint**.

Sprint 26A is a documentation-only architecture and product-contract lock sprint for the Reinforcement family. It does not change backend behavior, routes, DTOs, presenters, repositories, Prisma schema, migrations, seed data, package metadata, deployment configuration, `main.ts`, realtime gateway behavior, tests, or ADR files.

The Reinforcement family is approved to proceed through targeted runtime closeout sprints until core Reinforcement, Teacher App, Student App, Parent App, Rewards, XP, and Hero Journey reach **V1_READY_FULL_APP_CONTRACT**.

## 2. Sources Reviewed

Governance and architecture:

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

Reinforcement-facing handoff and audit context:

- `adr/Teacher-App/teacher_TASKS_BACKEND_MODELS.md`
- `adr/Teacher-App/teacher_XP_BACKEND_MODELS.md`
- `adr/Student-App/student_TASKS_BACKEND_MODEL.md`
- `adr/Student-App/student_HERO_JOURNEY_BACKEND_MODEL.md`
- `adr/Student-App/student_PROGRESS_BACKEND_MODEL.md`
- `adr/Parent-App/parent_tasks.md`
- `adr/Parent-App/parent_progress.md`
- `adr/School-Dashboard/sis_dashboard-reinforcement_backend_handoff_spec.md`
- `adr/School-Dashboard/sis_dashboard-hero_journey_backend_handoff_spec.md`
- `docs/sprint-7d-teacher-tasks-xp-audit.md`
- `docs/sprint-8a-student-app-contract-audit.md`
- `docs/sprint-9a-parent-app-contract-audit.md`
- `docs/phase-5-final-closeout-audit.md`

Note: `DIRECTORY_STRUCTURE.md` is listed in the project reading order but is not present in this checkout. The available directory reference is `DIRECTORY_STRUCTURE_VISUAL.md`, which was reviewed as the repository's current directory guide.

## 3. Source-of-Truth Decisions

The following source-of-truth boundaries are locked for the Reinforcement family:

| Area | Source of truth | Decision |
| --- | --- | --- |
| Reinforcement tasks | Reinforcement core | Reinforcement core remains the source of truth for tasks, targets, assignments, stages, submissions, reviews, and templates. |
| XP | `XpLedger` | `XpLedger` is the only source of truth for XP. XP totals, history, ranks, and eligibility must derive from XP ledger data and approved presenter policy. |
| Behavior points | Behavior core | `BehaviorPointLedger` must not be treated as XP. Behavior points stay separate from XP, Rewards, Reinforcement Tasks, and Hero Journey. |
| Hero Journey | Hero Journey core | Hero Journey core remains the source of truth for missions, objectives, progress, and badges. |
| Rewards | Rewards core | Rewards core remains the source of truth for reward catalog items, redemption requests, redemption review, and fulfillment workflow. |
| App modules | App-facing adapters | Teacher App, Student App, Parent App, and Dashboard read models may compose/adapt data, but must not redefine domain truth or duplicate core state machines. |

App modules may shape frontend-specific responses through use-cases and presenters. They must not add independent repositories or storage ownership for Reinforcement, XP, Rewards, Hero Journey, Behavior, Students, Academics, or Files.

## 4. ADR Handling Rule

ADR and frontend handoff files are used to understand frontend screens, user flows, route intent, and data needs. They do not override backend source-of-truth ownership, tenancy, permission, ownership, audit, or file safety rules.

Backend may rename, reshape, or adapt fields when backend logic requires it. Backend must preserve safety, ownership, and source-of-truth even if frontend names differ.

Examples:

- If an ADR expects `name` but backend has `displayName`, `fullName`, `nameEn`, or `nameAr`, the backend-safe field is used and the presenter documents or maps the frontend-facing name.
- If an ADR expects a proof URL field such as `proofPath` or `proof_url`, the backend must return only safe file metadata or an authorized file access route, not object storage internals.
- If an ADR uses `taskId + stageId` for review approval, backend may require `submissionId` because a class task can create multiple submissions for the same task and stage.
- If an ADR route example omits `/api/v1`, the actual backend route remains under the global `/api/v1` prefix.

Frontend/backend differences must be classified as one of:

- **backend-correct drift**: backend naming or shape differs to preserve domain truth, safety, or existing stable contract.
- **frontend contract gap**: frontend needs a field or adapter mapping not yet represented by a backend-safe presenter.
- **runtime missing feature**: the backend has an approved decision but no implemented route/use-case yet.
- **approved product decision**: the difference is intentional and should not be implemented in V1 unless reopened.
- **unsafe expectation**: the frontend expectation would violate ownership, tenancy, source-of-truth, or file/storage safety and must be rejected or redesigned.

A difference from ADR is not automatically a backend bug.

## 5. Product and Implementation Decisions to Lock

### Teacher App

- Teacher Tasks routes remain under `/api/v1/teacher/tasks`.
- Teacher Review Queue remains `submissionId`-based, not `taskId + stageId`-based, because class tasks can have multiple submissions.
- `classId` in Teacher App remains `TeacherSubjectAllocation.id`.
- Teacher task create may target owned classes and owned students only.
- Teacher task create must derive `academicYearId`, `termId`, `subjectId`, classroom, and hierarchy from owned allocations.
- `subjectName` is display-only and must not be trusted for persistence.
- Teacher approval must not duplicate Reinforcement review state. It must delegate to core review use-cases.
- If XP reward is enabled, XP grant must be idempotent and delegated to the core XP grant use-case.
- Teacher manual XP bonus grant may be implemented only with owned-student validation, explicit permission policy, caps, cooldowns, and audit.

Teacher reward types are locked as:

| Teacher reward type | V1 decision |
| --- | --- |
| `moral` | Display reward. |
| `financial` | Display-only reward; not finance, wallet, or marketplace behavior. |
| `points` | Maps to moral/display points unless otherwise approved. |
| `xp` | Allowed only through the core XP grant flow. |
| `none` | No reward. |

### Student App

- Student Tasks read routes remain.
- Student task submission will be implemented as current-student-only.
- Student can submit `proofText` and/or `proofFileId` only for the student's own task assignment.
- Student cannot submit another student's assignment.
- Student Hero read routes remain.
- Student Hero start and complete actions will be implemented through core Hero Journey use-cases.
- Student Rewards catalog and redemption routes will be app-facing adapters over Rewards core.
- Student rewards must not become wallet, finance, or marketplace behavior.

### Parent App

- Parent child task reads remain.
- Parent can see child XP, Hero, and Rewards only after child ownership validation.
- Parent-created tasks are allowed only for an owned child and `source=PARENT`.
- Parent must not mutate teacher, school, or system tasks.
- Parent task approval/rejection, if implemented, must be `submissionId`-based and only for parent-created tasks.
- Parent-created tasks do not auto-grant XP in V1 unless a separate explicit decision changes this.
- Parent App must never assume a single child.

### Dashboard/Admin

- Core `/api/v1/reinforcement/*` routes remain the dashboard/admin source of truth.
- Dashboard/Admin can manage templates, tasks, reviews, XP, rewards, and Hero Journey according to permissions.
- App-specific routes must not replace dashboard/admin routes.
- Dashboard/Admin may expose broader management views than app-facing adapters, but must remain permission-gated and school-scoped.

### Files and Proofs

- Proof responses expose safe file metadata only.
- Responses must not expose buckets, `objectKey`, storage metadata, direct raw storage URLs, or unsafe signed URLs.
- File download/access must be authorized through the owning task, submission, reward, Hero resource, or file resource first.
- App-facing proof fields may expose file ids, display names, mime/type summaries, size, timestamps, and authorized download route references when the actor owns the resource.
- Signed URL issuance must remain behind authorized `/api/v1/files/:id/download`-style access, not embedded as raw storage internals in Reinforcement presenters.

### XP

- XP Center totals mean XP for owned students in the teacher-owned classroom context.
- XP Center totals are not subject-specific unless a future schema/source metadata decision adds subject scoping.
- Behavior points are not XP.
- Manual bonus grants require explicit permission and audit.
- Manual bonus grants require caps and cooldown enforcement.
- Reinforcement review XP grants must be idempotent.
- XP reward grants must use core XP grant use-cases and duplicate-source protection.

### Rewards

- Reward catalog and redemptions are school reward workflow only.
- No wallet.
- No finance.
- No marketplace.
- No XP deduction in V1 unless explicitly approved later.
- Reward redemption ownership must be validated for student and parent-facing adapters.
- Reward catalog management, redemption review, and fulfillment remain core/dashboard permissioned workflows unless an app-specific permission decision is approved.

### Hero Journey

- Basic start, progress, objective, and complete flows are allowed through core Hero Journey use-cases.
- Rank, tier, level, and streak fields may be presenter-derived only if the derivation policy is documented.
- If no rank/tier/level/streak policy exists, the field must be returned as unavailable/null or omitted according to the route contract rather than guessed.
- Hero mission XP grants must be idempotent and delegated to core XP grant behavior where XP is awarded.

## 6. Sprint Roadmap

The approved roadmap to reach **V1_READY_FULL_APP_CONTRACT** is:

| Sprint | Name | Purpose |
| --- | --- | --- |
| 26B | Reinforcement Core Policy Hardening | Lock core ownership, permission, audit, XP idempotency, file safety, and source-of-truth policy gaps. |
| 26C | Teacher Tasks / Reviews / XP Completion | Complete Teacher App task creation, review queue, XP Center reads, and controlled manual XP bonus policy where approved. |
| 26D | Student Task Submission | Add current-student-only task submission with proof text/file validation and safe proof responses. |
| 26E | Student Hero Actions | Add Student Hero start/progress/objective/complete mutations through core Hero Journey use-cases. |
| 26F | Student Rewards / Redemptions | Add Student Rewards catalog and redemption adapters over Rewards core without wallet/finance/marketplace behavior. |
| 26G | Parent Hero / XP / Rewards Read Models | Add Parent child-owned Hero, XP, and Rewards read models with strict child ownership validation. |
| 26H | Parent Reinforcement Task Mutations | Add parent-created task mutations only for owned children and `source=PARENT`; prevent mutation of teacher/school/system tasks. |
| 26I | Dashboard/Admin Closeout | Complete dashboard/admin route and presenter closeout for templates, tasks, reviews, XP, rewards, and Hero Journey. |
| 26J | Reinforcement Security / Tenancy Closeout | Add and verify cross-school, same-school non-owner, file proof, reward ownership, XP idempotency, and audit coverage. |
| 26K | Frontend Contract Handoff | Produce final app/frontend contract handoff with drift classifications, route inventory, and adapter mapping notes. |
| 26L | Final Closeout | Final status audit and decision for **V1_READY_FULL_APP_CONTRACT**. |

## 7. Explicit Non-Goals

- Do not create wallet, finance, or marketplace behavior.
- Do not convert Behavior points into XP.
- Do not expose raw file storage internals.
- Do not add route aliases just because ADR used another path.
- Do not bypass ownership with `platformBypass`.
- Do not make Parent App mutate teacher, school, or system tasks.
- Do not make Student App access another student.
- Do not make Teacher XP subject-specific without source metadata.
- Do not add platform billing engine, HR, advanced smart pickup, advanced analytics builder, or advanced gamified economy behavior under Reinforcement closeout.
- Do not make app-facing modules own Reinforcement, Rewards, Hero Journey, XP, Behavior, Students, Academics, or Files persistence.

## 8. Security Checklist for Future Runtime Sprints

Future runtime sprints must verify:

- Teacher-owned allocation validation for every Teacher App task, review, student, class, XP, and proof access path.
- Student own-assignment validation for Student App task reads and submissions.
- Parent child ownership validation for every Parent App child task, XP, Hero, Reward, redemption, and proof access path.
- Same-school safety: actors must not access same-school resources outside their ownership or permission scope.
- Cross-school safety: guessed ids from another school must return not found or forbidden according to existing route conventions.
- No internal field leaks, including `schoolId`, `organizationId`, membership ids, raw Prisma model fields, bucket names, object keys, and storage metadata.
- File proof safety: proof reads and downloads must authorize through the owning task/submission/resource first.
- XP idempotency: review grants, Hero grants, manual bonus grants, and reward-related XP behavior must prevent duplicate ledger entries for the same source.
- Reward redemption ownership: students and parents can request/read only their own or owned-child redemptions.
- Audit logs for sensitive mutations, including task create/cancel, submission review approve/reject, XP grant, manual XP bonus, reward redemption review/fulfillment, Hero mission mutations, and any permission-sensitive dashboard/admin action.
- Permission policy coverage for dashboard/admin routes and any app-facing mutation that goes beyond actor-owned reads.
- No `platformBypass` usage for app-facing ownership shortcuts.
- Presenter-only derivation for rank/tier/level/streak fields unless a core policy exists.
- Response DTOs and presenters must preserve `/api/v1` route contracts without exposing normalized storage implementation details.

## 9. Final Decision

- Sprint 26A Decision: PASS
- Reinforcement implementation plan: APPROVED
- Next sprint: Sprint 26B — Reinforcement Core Policy Hardening
