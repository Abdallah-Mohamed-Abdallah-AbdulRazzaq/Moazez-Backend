# Sprint 23A — Homework, Grades, Assessments Reality Audit

## Status
- Result: CONDITIONAL PASS
- Baseline: `7911f67 docs: finalize academics v1 closeout audit`
- Audit date: 2026-06-17
- Audit type: Documentation-only backend reality audit
- Runtime changes: None
- Test changes: None
- Schema changes: None
- Migration changes: None
- Package changes: None
- Generated/deployment/project-structure changes: None

## Executive Summary

The Homework, Grades, and Assessments backend is substantially implemented in backend-native module boundaries. The core Grades module includes assessment CRUD, score-only and question-based assessments, question/options authoring, publish/approve/lock workflow, grade item entry, bulk grade item entry, gradebook, analytics, rules/effective rules, student snapshots, submissions, answer review, and GradeItem sync. The core Homework module includes assignments, classroom and selected-student targets, target materialization, questions/options, assignment attachments, student submissions, answers, submission attachments, teacher review, answer-level/bulk review, and homework-to-grades sync.

The app-facing modules are mostly composition/read-model layers over those core capabilities. Teacher App implements the homework workflow and classroom grade reads, plus question-based submission review/sync. Student App implements homework list/detail, draft save, answers, attachments, submit, grades list, grades summary, and assessment detail. Parent App implements child homework list/detail and child grades list/summary/detail as read-only surfaces.

The main true gap is a dedicated School Dashboard Grades workspace bootstrap/filter/overview read model. Underlying academic and grades data exists, but there is no dedicated `/grades/filters`, `/grades/workspace-bootstrap`, or consolidated `/grades/overview` backend capability. Route/name differences from ADR examples are not blockers when the backend capability exists under a stable backend-native route.

## ADR Interpretation Policy

- ADR files are product/frontend intent references.
- ADR files are useful for expected workflows, frontend data needs, and feature relationships across School Dashboard, Teacher App, Student App, and Parent App.
- Backend-native routes and payloads are acceptable.
- Different route names, path names, and response shapes are not blockers by themselves.
- Existing working backend contracts must not be broken to match old ADR examples.
- Existing capabilities must not be duplicated only because an ADR used a different route name.
- Only genuinely missing backend capabilities become implementation work.
- If a capability exists under a different route or response shape, this audit classifies it as `IMPLEMENTED_WITH_DIFFERENT_ROUTE_OR_SHAPE`, not `MISSING`.

## Sources Reviewed

- Governance: `PROJECT_OVERVIEW.md`, `ARCHITECTURE_DECISION.md`, `V1_SCOPE.md`, `SECURITY_MODEL.md`, `ENGINEERING_RULES.md`, `API_CONTRACT_RULES.md`, `TESTING_STRATEGY.md`, `ERROR_CATALOG.md`, `OBSERVABILITY.md`, `MODULES.md`, `DOMAIN_GLOSSARY.md`, `USER_TYPES.md`, `PRISMA_CONVENTIONS.md`
- Structure reference: `DIRECTORY_STRUCTURE_VISUAL.md`; `DIRECTORY_STRUCTURE.md` was not present in the working tree.
- ADRs: `adr/ADR-0001-multi-tenancy-enforcement.md`, `adr/ADR-0002-behavior-core-module-boundary.md`, `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`
- Prior audits: `docs/sprint-22l-full-academics-final-closeout-audit.md`, `docs/sprint-13a-homework-core-contract-audit.md`, `docs/sprint-14a-homework-submissions-contract-audit.md`, `docs/sprint-15a-academics-curriculum-homework-completion-audit.md`, `docs/sprint-15i-learning-flow-final-closeout-audit.md`, and related grades/homework references in `docs/`
- School Dashboard intent: `adr/School-Dashboard/sis_dashboard-grades_backend_handoff_spec.md` and related academics/grades references
- Teacher App intent: `adr/Teacher-App/teacher_HOMEWORKS_BACKEND_MODELS.md`, `adr/Teacher-App/teacher_CLASSROOM_BACKEND_MODELS.md`
- Student App intent: `adr/Student-App/student_HOMEWORKS_BACKEND_MODEL.md`, `adr/Student-App/student_GRADES_BACKEND_MODEL.md`, `adr/Student-App/student_SUBJECTS_BACKEND_MODEL.md`, `adr/Student-App/student_PROGRESS_BACKEND_MODEL.md`
- Parent App intent: `adr/Parent-App/parent_homeworks.md`, `adr/Parent-App/parent_grades.md`, `adr/Parent-App/parent_progress.md`
- Backend source: `src/modules/grades/**`, `src/modules/homework/**`, `src/modules/teacher-app/homeworks/**`, `src/modules/teacher-app/classroom/grades/**`, `src/modules/student-app/homeworks/**`, `src/modules/student-app/grades/**`, `src/modules/parent-app/homeworks/**`, `src/modules/parent-app/grades/**`
- Dependency context: `src/modules/academics/**`, `src/modules/files/**`, `src/modules/communication/**`, `src/modules/reinforcement/**`, `src/common/decorators/**`, `src/common/guards/**`, `src/infrastructure/database/**`, `prisma/schema.prisma`
- Test evidence: relevant `test/e2e/**`, `test/security/**`, and unit tests under the audited modules

## Current Backend Reality Snapshot

- Routes are globally prefixed with `/api/v1`.
- Grades is registered as a core domain module through `GradesModule`, which composes `AssessmentsModule`, `RulesModule`, `GradebookModule`, and `AnalyticsModule`.
- Grades stores normalized assessments, questions, options, submissions, answers, grade items, and grade rules.
- Homework is registered as a core domain module and exports assignment, target, question, attachment, submission, answer review, submission attachment, and grade sync services.
- Homework stores normalized assignments, targets, questions, options, submissions, answers, assignment attachments, and submission attachments.
- Teacher, Student, and Parent app modules use app-facing routes and presenters instead of changing core storage models.
- `schoolScope` includes the audited Grade and Homework models, and security tests cover cross-school, role, ownership, closed-term, locked/approved, and no-leak scenarios.
- Files are referenced through file metadata and presenters; raw storage keys/buckets are treated as internal.
- Notifications and XP/reward side effects are not part of the accepted Homework/Grades V1 backend behavior unless explicitly approved later.

## School Dashboard Grades / Assessments Reality Matrix

| Capability | Classification | Backend reality | Audit decision |
| --- | --- | --- | --- |
| Grades module registration | COMPLETE | `GradesModule` registers assessments, rules, gradebook, and analytics modules. | Do not rebuild. |
| Grade filters / workspace bootstrap | MISSING | Academic reference data exists elsewhere, but no dedicated Grades workspace bootstrap/filter endpoint was found. | Build only as a non-breaking read model if Dashboard needs it. |
| Grades overview aggregation | PARTIAL | Gradebook, analytics, rules, and snapshots exist, but there is no single consolidated `/grades/overview` read model. | Add a presenter/read model only if the Dashboard needs one response. |
| Assessment CRUD | COMPLETE | `/grades/assessments` supports list, detail, create, update, and delete with permissions. | Do not rebuild. |
| Score-only assessments | COMPLETE | `GradeAssessmentDeliveryMode.SCORE_ONLY` and item entry routes are implemented. | Do not rebuild. |
| Question-based assessments | IMPLEMENTED_WITH_DIFFERENT_ROUTE_OR_SHAPE | Backend uses `/grades/assessments/question-based`; ADR examples use `/grades/assessments/with-questions`. | Route name difference is not a bug. |
| Assessment questions | COMPLETE | `/grades/assessments/:assessmentId/questions` supports list, create, reorder, bulk points, update, and delete. | Do not rebuild. |
| Question options | COMPLETE | Options are normalized through `GradeAssessmentQuestionOption` and handled by question create/update flows. | Do not rebuild. |
| Draft workflow | COMPLETE | Assessments default to draft and enforce draft-only mutations where appropriate. | Do not rebuild. |
| Publish workflow | COMPLETE | `/grades/assessments/:assessmentId/publish` exists and validates readiness. | Do not rebuild. |
| Approve workflow | COMPLETE | `/grades/assessments/:assessmentId/approve` exists and audits approval. | Do not rebuild. |
| Lock workflow | COMPLETE | `/grades/assessments/:assessmentId/lock` exists; lock state is represented by `lockedAt`/`lockedById`. | Do not rename to a separate status enum. |
| Grade item single entry | COMPLETE | `PUT /grades/assessments/:assessmentId/items/:studentId` exists. | Do not rebuild. |
| Bulk grade item entry | COMPLETE | `PUT /grades/assessments/:assessmentId/items` exists. | Do not rebuild. |
| Gradebook read model | COMPLETE | `GET /grades/gradebook` exists. | Do not rebuild. |
| Analytics | IMPLEMENTED_WITH_DIFFERENT_ROUTE_OR_SHAPE | Backend exposes `/grades/analytics/summary` and `/grades/analytics/distribution`; ADR examples mention `/grades/analytics`. | Treat as implemented unless a merged response is explicitly needed. |
| Grading rules | COMPLETE | `/grades/rules` supports list, create, and update. | Do not rebuild. |
| Effective grading rules | COMPLETE | `/grades/rules/effective` exists. | Do not rebuild. |
| Student grade snapshot | COMPLETE | `GET /grades/students/:studentId/snapshot` exists. | Do not rebuild. |
| Submissions | COMPLETE | `/grades/assessments/:assessmentId/submissions`, resolve, detail, submit, and answer routes exist. | Do not rebuild. |
| Answers | COMPLETE | Submission answer save/retrieve routes exist. | Do not rebuild. |
| Answer review/correction | COMPLETE | `/grades/submissions/:submissionId/answers/:answerId/review` and bulk review exist. | Do not rebuild. |
| Grade item sync from reviewed submissions | COMPLETE | `/grades/submissions/:submissionId/sync-grade-item` exists. | Do not rebuild. |
| Closed-term handling | COMPLETE | Security tests reject grade mutations/reviews when related academic terms are closed or inactive. | Keep in final sweep. |
| Locked/approved protections | COMPLETE | Security tests cover mutation lockouts after publish/approve/lock and after submissions exist. | Keep in final sweep. |
| Dashboard permissions | COMPLETE | Routes use `RequiredPermissions` for assessment, item, question, submission, gradebook, analytics, snapshot, and rule capabilities. | Do not weaken. |
| Tenant scoping | NEEDS_SECURITY_SWEEP | `schoolScope` covers Grade models and tests cover cross-school denial; final family closeout still needs a consolidated sweep. | Sweep later before final closeout. |
| Safe errors / no unsafe details | NEEDS_SECURITY_SWEEP | Tests cover many safe 404/403 and no-leak cases; this sprint did not execute a full final security closeout. | Sweep later before final closeout. |

## Homework Core Reality Matrix

| Capability | Classification | Backend reality | Audit decision |
| --- | --- | --- | --- |
| Core assignments | COMPLETE | `/homework/assignments` supports list, create, detail, and update. | Do not rebuild. |
| Classroom targeting | COMPLETE | Assignment create/update supports classroom allocation context. | Do not rebuild. |
| Selected-student targeting | COMPLETE | Assignment target mode and student target lists are implemented. | Do not rebuild. |
| Target materialization | COMPLETE | `/homework/assignments/:homeworkId/targets/resolve` exists. | Do not rebuild. |
| Draft lifecycle | COMPLETE | Draft assignments are supported. | Do not rebuild. |
| Publish lifecycle | COMPLETE | `/homework/assignments/:homeworkId/publish` exists. | Do not rebuild. |
| Close lifecycle | COMPLETE | `/homework/assignments/:homeworkId/close` exists. | Do not rebuild. |
| Cancel lifecycle | COMPLETE | `/homework/assignments/:homeworkId/cancel` exists. | Do not rebuild. |
| Archive lifecycle | PARTIAL | Schema/status handling includes `ARCHIVED`, and readers hide archived homework, but no explicit core archive route was found. | Only add if product wants user-facing archive. |
| Homework questions | COMPLETE | `/homework/assignments/:homeworkId/questions` supports list, create, detail, update, reorder, and delete. | Do not rebuild. |
| Question options | COMPLETE | Option create, update, reorder, and delete routes exist under homework questions. | Do not rebuild. |
| Extended ADR-only question types | PRODUCT_DECISION_REQUIRED | Backend supports short/long/single/multiple/true-false; file upload is handled through attachments, not as a question type. | Expand only if product requires exact type parity. |
| Assignment attachments | COMPLETE | `/homework/assignments/:homeworkId/attachments` supports list, create, update, reorder, and delete. | Do not rebuild. |
| Student submission | COMPLETE | Student App save draft and submit routes are implemented over homework submissions. | Do not rebuild. |
| Student answers | COMPLETE | Student answer list, bulk save, and single-answer update routes exist. | Do not rebuild. |
| Student submission attachments | COMPLETE | Student App submission attachment list/create/update/reorder/delete routes exist. | Do not rebuild. |
| Teacher review | COMPLETE | Core and Teacher App submission review routes exist. | Do not rebuild. |
| Answer-level review | COMPLETE | Single-answer review route exists. | Do not rebuild. |
| Bulk answer review | COMPLETE | Bulk answer review route exists. | Do not rebuild. |
| Homework grade sync status | COMPLETE | `GET /homework/assignments/:homeworkId/grade-sync` exists. | Do not rebuild. |
| Link homework to grade assessment | COMPLETE | `/homework/assignments/:homeworkId/grade-sync/link` exists. | Do not rebuild. |
| Sync homework assignment to grades | COMPLETE | `/homework/assignments/:homeworkId/grade-sync` exists. | Do not rebuild. |
| Sync one submission to grades | COMPLETE | `/homework/assignments/:homeworkId/submissions/:submissionId/grade-sync` exists. | Do not rebuild. |
| Permissions | COMPLETE | Core homework routes use homework and grades permissions as appropriate. | Do not weaken. |
| Tenant scoping | NEEDS_SECURITY_SWEEP | `schoolScope` includes Homework models and security tests cover cross-school access. | Sweep later before final closeout. |
| Teacher ownership | COMPLETE | Teacher App homework routes enforce owned allocation/homework access. | Do not rebuild. |
| Student ownership | COMPLETE | Student App routes scope to the current student and assigned visible homework. | Do not rebuild. |
| Parent read-only visibility | COMPLETE | Parent App homeworks are child-scoped read-only views. | Do not add parent mutations without approval. |
| Parent submit | PRODUCT_DECISION_REQUIRED | Parent submit routes are intentionally absent and tested as absent. | Do not implement unless product approves. |
| Safe file metadata / no storage internals | NEEDS_SECURITY_SWEEP | Presenters/tests avoid `objectKey`, bucket, and tenant fields in app-facing payloads. | Sweep later before final closeout. |

## Teacher App Homework and Grades Reality Matrix

| Capability | Classification | Backend reality | Audit decision |
| --- | --- | --- | --- |
| Teacher homework dashboard | COMPLETE | `GET /teacher/homeworks/dashboard` exists. | Do not rebuild. |
| Teacher class homework assignments | COMPLETE | `/teacher/homeworks/classes/:classId/assignments` supports list/create. | Do not rebuild. |
| Teacher assignment detail/update | COMPLETE | Detail and patch routes exist under class assignments. | Do not rebuild. |
| Teacher assignment lifecycle | COMPLETE | Publish, close, and cancel routes exist. | Do not rebuild. |
| Teacher target resolution | COMPLETE | Targets list and resolve routes exist. | Do not rebuild. |
| Teacher homework questions/options | COMPLETE | Teacher App exposes question and option authoring routes. | Do not rebuild. |
| Teacher homework attachments | COMPLETE | Teacher App exposes assignment attachment routes. | Do not rebuild. |
| Teacher homework submissions | COMPLETE | Submission list/detail routes exist. | Do not rebuild. |
| Teacher answer review | COMPLETE | Single and bulk answer review routes exist. | Do not rebuild. |
| Teacher submission review | COMPLETE | Submission review/finalization routes exist. | Do not rebuild. |
| Teacher homework grade sync | COMPLETE | Grade sync status, assignment sync, and submission sync routes exist. | Do not rebuild. |
| Classroom grade assessments list | COMPLETE | `GET /teacher/classroom/:classId/grades/assessments` exists. | Do not rebuild. |
| Classroom grade assessment detail | COMPLETE | `GET /teacher/classroom/:classId/grades/assessments/:assessmentId` exists. | Do not rebuild. |
| Classroom gradebook | COMPLETE | `GET /teacher/classroom/:classId/grades/gradebook` exists. | Do not rebuild. |
| Teacher grade review via submissions | IMPLEMENTED_WITH_DIFFERENT_ROUTE_OR_SHAPE | Teacher classroom assignment submission review routes support question-based review/sync by `submissionId`. | Route shape difference is not missing functionality. |
| Teacher direct score-only grade entry | PRODUCT_DECISION_REQUIRED | School Dashboard Grades already owns grade item write routes; Teacher App does not expose direct score-only item entry. | Decide product surface before implementing. |

## Student App Homework and Grades Reality Matrix

| Capability | Classification | Backend reality | Audit decision |
| --- | --- | --- | --- |
| Student homework list | COMPLETE | `GET /student/homeworks` exists. | Do not rebuild. |
| Student homework detail | COMPLETE | `GET /student/homeworks/:homeworkId` exists. | Do not rebuild. |
| Student homework draft save | COMPLETE | `PUT /student/homeworks/:homeworkId/submission` and draft alias exist. | Do not rebuild. |
| Student homework answers | COMPLETE | Answer list, bulk save, and single update routes exist. | Do not rebuild. |
| Student homework submission attachments | COMPLETE | Submission attachment CRUD/reorder routes exist. | Do not rebuild. |
| Student homework submit | COMPLETE | Submit route and alias exist. | Do not rebuild. |
| Student grades list | COMPLETE | `GET /student/grades` exists. | Do not rebuild. |
| Student grades summary | COMPLETE | `GET /student/grades/summary` exists with totals, subject breakdowns, academic years, and terms. | Do not rebuild unless product asks for more fields. |
| Student assessment grade detail | COMPLETE | `GET /student/grades/assessments/:assessmentId` exists. | Do not rebuild. |
| Current student / active enrollment scoping | COMPLETE | Read adapter scopes to current student enrollment and visible assessment scopes. | Do not weaken. |
| No answer key leakage | NEEDS_SECURITY_SWEEP | Presenters do not expose answer keys; final family sweep should verify all edge cases. | Sweep later before final closeout. |
| No tenant/internal leakage | NEEDS_SECURITY_SWEEP | App-facing DTOs avoid tenant/internal fields; final family sweep should verify all grade/detail paths. | Sweep later before final closeout. |

## Parent App Homework and Grades Reality Matrix

| Capability | Classification | Backend reality | Audit decision |
| --- | --- | --- | --- |
| Parent child homework list | COMPLETE | `GET /parent/children/:studentId/homeworks` exists. | Do not rebuild. |
| Parent child homework detail | COMPLETE | `GET /parent/children/:studentId/homeworks/:homeworkId` exists. | Do not rebuild. |
| Parent child grades list | COMPLETE | `GET /parent/children/:studentId/grades` exists. | Do not rebuild. |
| Parent child grades summary | COMPLETE | `GET /parent/children/:studentId/grades/summary` exists with totals, subjects, ratings, and motivational message. | Do not rebuild unless product asks for more fields. |
| Parent child assessment grade detail | COMPLETE | `GET /parent/children/:studentId/grades/assessments/:assessmentId` exists. | Do not rebuild. |
| Linked-child ownership scoping | COMPLETE | Parent App access service and tests enforce linked-child boundaries. | Do not weaken. |
| Read-only parent homework boundary | COMPLETE | Parent homework routes are read-only. | Preserve boundary. |
| Parent submit | PRODUCT_DECISION_REQUIRED | Parent submit routes are absent and tested as absent. | Do not implement unless product explicitly approves. |
| No tenant/internal leakage | NEEDS_SECURITY_SWEEP | Presenters/tests avoid tenant IDs, raw storage, and teacher-only fields; final sweep should re-check all paths. | Sweep later before final closeout. |

## Route and Naming Alignment Notes

Route/name differences are frontend integration notes, not backend blockers, when the capability is already implemented.

- ADR `/grades/assessments/with-questions` maps to backend `/grades/assessments/question-based`.
- ADR `/grades/analytics` maps to backend `/grades/analytics/summary` plus `/grades/analytics/distribution`.
- ADR roster/detail examples map to backend `/grades/assessments/:assessmentId/items` and gradebook/snapshot read models.
- ADR submission review by `assessmentId + studentId` maps to backend review by `submissionId`.
- ADR parent grade subject paths map to backend `/parent/children/:studentId/grades`, `/summary`, and `/assessments/:assessmentId`.
- Student homework submit has both `/student/homeworks/:homeworkId/submit` and `/student/homeworks/:homeworkId/submission/submit` shapes.

None of the above requires route renames, breaking payload changes, or route aliases by default.

## Implemented Capabilities That Should Not Be Rebuilt

- Core Grades assessment CRUD, workflow, lock/protection, questions/options, submissions, answer review, GradeItem sync, grade item entry, gradebook, analytics, rules, effective rules, and snapshots.
- Core Homework assignments, targets, materialization, questions/options, assignment attachments, submissions, answers, submission attachments, teacher review, answer review, and grade sync.
- Teacher App homework dashboard, assignment lifecycle, question/option/attachment management, submissions/review, homework grade sync, classroom assessment reads, and classroom gradebook.
- Student App homework list/detail/draft/answer/attachment/submit workflows and grades list/summary/detail.
- Parent App child homework and grade read models with a read-only homework boundary.
- Backend-native route names and response DTOs that already satisfy the business capability.

## Functional Gaps That Are Actually Missing

- Dedicated School Dashboard Grades workspace bootstrap/filter read model. The backend has the underlying academics and grades data, but no dedicated Grades bootstrap/filter capability.
- Dedicated School Dashboard Grades overview response, if the Dashboard requires a single aggregated response instead of consuming gradebook, analytics, rules, and snapshot routes separately.

## Partial Capabilities That Need Follow-up

- Grades overview is functionally split across existing routes. Follow up only if the Dashboard needs one consolidated backend read model.
- Homework archive has schema/status support and read-side hiding behavior, but no explicit user-facing archive route was found. Follow up only if archive is an accepted product action.
- Extended homework question type parity is not complete against every ADR example. Current backend-native support covers common text and choice question types, while file work is attachment-based.
- Final Homework/Grades/Assessments security evidence is strong but distributed across multiple tests; a consolidated closeout sweep is still needed.

## Product Decision Required Items

- Whether Teacher App should support direct score-only grade item entry, or whether School Dashboard Grades remains the write surface for direct grades.
- Whether Teacher App should support broader grade authoring beyond question-based submission review/sync.
- Whether parents may ever submit homework on behalf of a child.
- Whether exact ADR homework question type parity is required.
- Whether route aliases should be added for frontend convenience. This should be treated as product/integration work, not a missing backend capability.
- Whether notification or XP/reward side effects should be attached to homework submission/review/grade sync.

## Accepted Non-Goals

- Renaming existing working routes only to match ADR examples.
- Breaking existing payloads only to match older frontend examples.
- Duplicating implemented capabilities under alternate names without product approval.
- Parent homework submission.
- Notifications for homework/grades events, unless explicitly approved.
- XP/reward side effects for homework/grades events, unless explicitly approved.
- Advanced analytics builder/export workflows.
- Platform billing, finance, HR, wallet, marketplace, and advanced smart pickup.

## Security / Tenancy / No-Leak Risk Areas To Sweep Later

- Cross-school reads and mutations for Grades, Homework, Teacher App, Student App, and Parent App.
- Same-school wrong-role access and missing-permission access.
- Teacher ownership through teacher subject allocations.
- Student ownership through current active enrollment.
- Parent ownership through linked-child access.
- Closed-term mutation denial for assessments, grade items, submissions, reviews, homework sync, and related workflows.
- Draft/unpublished/locked/approved assessment visibility and mutation boundaries.
- Draft/cancelled/archived homework visibility and mutation boundaries.
- Answer key, `isCorrect`, `correctAnswer`, awarded points, and teacher-comment exposure rules by actor.
- File metadata exposure: no `objectKey`, bucket, raw storage path, or internal upload metadata in app-facing payloads.
- Error safety: cross-school or unowned resources should return safe 404/403 responses without leaking IDs or details.
- Audit logs for sensitive grade and homework review/sync actions.

## Suggested Sprint Breakdown After 23A

1. Sprint 23B - Grades Dashboard Bootstrap / Overview Read Models
   - Implement only confirmed missing Dashboard bootstrap/filter/overview read models.
   - Do not rename existing routes.
   - Prefer presenter/read-model composition.
   - Likely no schema change.

2. Sprint 23C - Student and Parent Grades Summary Enrichment
   - Run only if product identifies missing summary/breakdown fields.
   - Current Student and Parent summaries already include totals, subjects, academic years, and terms.
   - Prefer app-facing presenters over schema changes.

3. Sprint 23D - Teacher App Grades Write Workflow Decision Audit
   - Product decision first.
   - Decide whether Teacher App direct grade entry belongs in V1.
   - Do not implement direct teacher grade writes until approved.

4. Sprint 23E - Teacher App Grade Entry and Review Workflows
   - Run only if Sprint 23D approves Teacher App writes.
   - Reuse existing Grades item entry and review services.
   - Preserve Dashboard Grades contracts.

5. Sprint 23F - Homework, Grades, Assessments Security Closeout
   - E2E/security sweep for cross-school, role, ownership, closed-term, locked assessment, answer key leakage, and file metadata leakage.
   - Include app-facing Teacher, Student, and Parent routes.

6. Sprint 23G - Homework, Grades, Assessments Final Closeout Audit
   - Documentation-only closeout after fixes and security sweeps.
   - Confirm no remaining true functional gaps.

## Recommended Next Sprint

Sprint 23B - Grades Dashboard Bootstrap / Overview Read Models.

This is the safest next sprint because it targets the clearest true backend gap without breaking existing contracts. If product accepts the existing split between gradebook, analytics, rules, and snapshots, Sprint 23B can be reduced to a small adapter/read-model decision and the team can move directly to the security closeout or Teacher App grades decision audit.

## Findings

### Critical Blockers

None for this documentation-only audit.

### Security Blockers

No new security blocker was found during source inspection. A final consolidated security/tenancy/no-leak sweep remains required before final closeout.

### Contract Blockers

No route/name mismatch should be treated as a contract blocker by itself. Existing backend-native routes should remain stable.

### Non-blocking Observations

- `DIRECTORY_STRUCTURE.md` was listed in governance reading instructions but was not present; `DIRECTORY_STRUCTURE_VISUAL.md` was used as the available repository structure reference.
- No `docs/sprint-22k*` final sweep files were present in the current `docs/` directory.
- Several ADR paths differ from backend-native routes, but the underlying capabilities are implemented.
- Homework archive exists as a stored status/read-side state, but not as an explicit action route.

## Final Decision

Sprint 23A is a CONDITIONAL PASS.

The backend already implements most Homework, Grades, and Assessments capabilities in stable backend-native contracts. The next implementation work should be limited to true missing or partial capabilities: primarily a non-breaking School Dashboard Grades bootstrap/filter/overview read model, plus later product decisions for Teacher App direct grade entry and parent submit. Do not rename or duplicate existing routes only to match ADR examples.
