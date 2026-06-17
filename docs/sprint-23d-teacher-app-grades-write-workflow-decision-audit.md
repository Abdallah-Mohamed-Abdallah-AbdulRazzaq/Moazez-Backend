# Sprint 23D — Teacher App Grades Write Workflow Decision Audit

## Status
- Result: PASS
- Baseline: `a03849e feat: enrich student parent grades summaries`
- Audit date: 2026-06-17
- Audit type: Documentation-only product/backend boundary decision audit
- Runtime changes: None
- Test changes: None
- Schema changes: None
- Migration changes: None
- Package changes: None
- Generated/deployment/project-structure changes: None

## Executive Summary

Teacher App direct grade writes should not be implemented in V1.

The current backend already gives Teacher App the V1-safe grade experience:

- Teachers can read classroom grade assessments, assessment details, and classroom gradebook data for owned classroom/subject/term allocations.
- Teachers can create, review, and grade-sync homework through Teacher App homework workflows.
- Teachers can review question-based assignment submissions and sync reviewed submissions to grade items through the existing classroom submission review path.
- School Dashboard Grades remains the direct grade-entry surface for assessment CRUD, score-only GradeItem entry, bulk entry, workflow control, rules, analytics, gradebook, and administrative review.

Adding direct Teacher App score-only grade entry now would create a second grade-entry surface without a clear V1 product requirement. It would also add risk around teacher allocation boundaries, locked or approved assessments, closed terms, audit logging, parent/student visibility timing, and conflict with Dashboard-owned administrative workflows.

Recommendation: `NO_23E_NEEDED`.

Proceed next to `Sprint 23F — Homework Grades Assessments Security Closeout`.

## Decision Question

Should Teacher App support direct grade entry/review workflows in V1, or should direct grade writing remain School Dashboard-only while Teacher App continues to support homework creation/review, homework grade sync, classroom grade reads, and question-based submission review/sync where already implemented?

Decision:

`Recommendation: NO_23E_NEEDED`

Direct Teacher App score-only grade entry is not needed for V1. Teacher-driven graded work is already covered through homework review/sync and question-based submission review/sync. School Dashboard Grades should remain the official administrative grade write surface for V1.

## Current Implemented Teacher App Grades Capabilities

| Capability | Current classification | Current backend reality |
| --- | --- | --- |
| Classroom grade assessments list | READ_ONLY | Implemented under `GET /api/v1/teacher/classroom/:classId/grades/assessments`. It is scoped to the authenticated teacher's owned classroom/subject/term allocation. |
| Classroom grade assessment detail | READ_ONLY | Implemented under `GET /api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId`. It returns safe assessment detail for an owned allocation. |
| Classroom gradebook | READ_ONLY | Implemented under `GET /api/v1/teacher/classroom/:classId/grades/gradebook`. It presents classroom students and grade results for the owned allocation. |
| Assignment-like assessment list/detail | READ_ONLY | Implemented through Teacher App classroom assignment read models backed by GradeAssessment/homework-related data. |
| Assignment submissions list/detail | READ_ONLY | Implemented for owned classroom assignments. Detail responses are safe projections and do not expose answer keys or internal tenant fields. |
| Question-based answer review | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Implemented for owned assignment submissions through classroom submission review routes that delegate to core Grades review use cases. |
| Bulk answer review | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Implemented for owned assignment submissions through the classroom submission review boundary. |
| Finalize reviewed submission | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Implemented for owned assignment submissions after required answer review conditions are satisfied. |
| Sync reviewed submission to grade item | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Implemented through `POST /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/sync-grade-item`, with core Grades protections. |
| Direct score-only GradeItem entry | DASHBOARD_ONLY | Implemented in School Dashboard Grades, not Teacher App. Current Teacher App has no direct GradeItem score entry route. |
| Direct bulk GradeItem entry | DASHBOARD_ONLY | Implemented in School Dashboard Grades, not Teacher App. |
| Assessment CRUD | DASHBOARD_ONLY | Implemented in School Dashboard Grades. Teacher App does not author grade assessments directly. |
| Publish/approve/lock assessment workflow | DASHBOARD_ONLY | Implemented in School Dashboard Grades. Teacher App does not control administrative assessment workflow. |
| Grades rules/effective rules management | DASHBOARD_ONLY | Implemented in School Dashboard Grades. Teacher App does not manage rules. |
| Teacher App full assessment authoring | MISSING_IF_PRODUCT_APPROVES | Not implemented and not recommended for V1. |
| Parent/student notifications from Teacher grade writes | NON_GOAL | Not part of this feature family for V1. |
| XP/rewards from Teacher grade writes | NON_GOAL | Not part of this feature family for V1. |

The Teacher App classroom grades boundary is intentionally allocation-based. The access layer checks that the authenticated teacher owns the classroom/subject/term allocation before reads or review/sync writes proceed.

## Current Teacher App Homework / Submission Review Grade Write Paths

Teacher App currently has write-capable workflows where the teacher is operating on teacher-owned homework or owned assignment submissions:

| Write path | Current classification | Current backend reality |
| --- | --- | --- |
| Teacher homework creation | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Implemented under Teacher App homeworks routes for owned classes. |
| Teacher homework lifecycle | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Teacher App supports update, publish, close, and cancel flows through Homework core use cases. |
| Homework questions/options/attachments | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Teacher App exposes homework composition flows through Homework core. |
| Homework answer review | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Teacher App exposes answer-level and bulk answer review for homework submissions. |
| Homework submission review | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Teacher App exposes submission review/finalization paths. |
| Homework grade sync status | READ_ONLY | Teacher App can read grade sync status for homework. |
| Sync homework assignment to grades | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Teacher App exposes assignment-level grade sync when Homework/Grades compatibility checks pass. |
| Sync one homework submission to grades | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Teacher App exposes single submission grade sync when review and compatibility checks pass. |
| Link homework to grade assessment | DASHBOARD_ONLY | Core Homework/Grades supports linking, but Teacher App does not expose this administrative linkage route. |
| Classroom assignment submission answer review | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Implemented through Teacher App classroom submission review routes and core Grades review use cases. |
| Classroom assignment submission grade sync | WRITE_VIA_HOMEWORK_OR_SUBMISSION_REVIEW | Implemented through Teacher App classroom `sync-grade-item`, delegating to core Grades sync rules. |

These write paths are not the same as direct score-only grade entry. They are constrained by existing Homework or question-based submission state and by core Grades rules:

- The teacher must own the classroom/subject allocation.
- The submission or homework target must belong to the owned class/student boundary.
- Question-based review must satisfy required answer correction rules before finalization/sync.
- Grade sync uses core Grades protections for delivery mode, assessment workflow state, locked assessments, writable terms, active enrollments, score bounds, and audit logging.

## Current School Dashboard Grades Write Capabilities

School Dashboard Grades is the current direct administrative grade write surface:

| Capability | Current classification | Current backend reality |
| --- | --- | --- |
| Assessment CRUD | COMPLETE | Implemented in core Grades assessment routes. |
| Score-only assessment creation | COMPLETE | Implemented in core Grades. |
| Question-based assessment creation | COMPLETE | Implemented in core Grades under backend-native route naming. |
| Assessment questions/options | COMPLETE | Implemented for question-based assessments. |
| Publish assessment | COMPLETE | Implemented in core Grades workflow routes. |
| Approve assessment | COMPLETE | Implemented in core Grades workflow routes. |
| Lock assessment | COMPLETE | Implemented in core Grades workflow routes. |
| Single GradeItem entry | COMPLETE | Implemented through `PUT /api/v1/grades/assessments/:assessmentId/items/:studentId`. |
| Bulk GradeItem entry | COMPLETE | Implemented through `PUT /api/v1/grades/assessments/:assessmentId/items`. |
| Gradebook | COMPLETE | Implemented in core Grades read models. |
| Analytics | COMPLETE | Implemented in core Grades analytics/read models, including Sprint 23B overview composition. |
| Rules/effective rules | COMPLETE | Implemented in core Grades. |
| Submission answer review | COMPLETE | Implemented in core Grades submission review routes. |
| Reviewed submission grade item sync | COMPLETE | Implemented in core Grades. |

The existing direct grade write use cases already enforce core domain protections:

- Score-only GradeItem entry is allowed only for score-style assessments that accept grade items.
- Question-based submissions are reviewed/corrected and then synced, rather than edited as arbitrary score-only entries.
- Closed or inactive terms block writes.
- Locked assessments block writes.
- Workflow state is checked before grade item writes or submission sync.
- Assessment scope and student enrollment membership are validated.
- Mutations are audited.

## Boundary Analysis: Dashboard vs Teacher App

The safest V1 boundary is:

- School Dashboard Grades owns direct assessment and grade administration.
- Teacher App owns teacher workflow composition for assigned classes: homework, review, classroom read models, and sync of teacher-reviewed work.
- Core Grades remains the source of truth for grade rules, assessment workflow, GradeItems, submissions, and gradebook state.

This boundary matches the modular architecture rules:

- Core domain modules own truth.
- App-facing modules compose safe read models and narrowly approved workflows.
- Backend-native routes and payloads are acceptable; route convenience is not a reason to duplicate write surfaces.

Direct Teacher App grade entry should not be decided based on frontend route convenience. It should be decided based on ownership, permissions, teacher allocation constraints, auditability, and the risk of conflicting grade-entry surfaces.

Key boundary findings:

- Teacher ownership is allocation-specific, not school-wide. Direct grade entry would need strict class, subject, term, assessment scope, and student enrollment checks on every write.
- Dashboard grade writes already support score-only and bulk entry with administrative permissions.
- Teacher App write paths already cover teacher-created/reviewed work through Homework and question-based submission review/sync.
- Direct Teacher App GradeItem editing could conflict with Dashboard-created, approved, or locked assessment workflows.
- V1 Teacher App scope does not clearly require direct score-only grade entry.

## Option A — No Teacher App Direct Grade Writes in V1

Teacher App remains:

- Homework write/review/sync capable.
- Classroom grades read-only.
- Question-based assignment submission review/sync capable where already implemented.
- Not a direct score-only GradeItem entry surface.

Dashboard remains the direct grade-entry surface.

Benefits:

- Preserves a single administrative direct grade-entry surface for V1.
- Avoids duplicate score entry flows between Dashboard and Teacher App.
- Keeps teacher grade writes tied to reviewed homework/submission workflows.
- Avoids new permission names, route contracts, schema changes, and mobile bulk-entry complexity.
- Reduces risk around approved, locked, or closed-term records.
- Allows Sprint 23F to focus on final security, tenancy, and no-leak closeout.

Risks:

- If frontend/product expects mobile score-only grade entry in V1, Teacher App will not provide it.
- Teachers who want ad hoc score entry from the app must use Dashboard or supported homework/submission review flows.

Required backend changes:

- None.

Required tests:

- No new tests for 23D. Sprint 23F should continue final security coverage for existing read/review/sync paths.

Required permissions:

- None beyond existing Teacher App access and core Grades/Homework permissions.

Schema impact:

- None.

Frontend impact:

- Teacher App should present classroom grades as read-only except for homework/submission review and sync actions already supported.
- Direct score-only entry controls should not be enabled in V1 Teacher App.

Compatibility with existing Dashboard Grades:

- Fully compatible. Dashboard remains the source of direct assessment and GradeItem administration.

Should proceed to Sprint 23E:

- No.

## Option B — Limited Teacher App Score-Only Grade Entry

Teacher App would allow teachers to enter or edit score-only GradeItems for existing assessments, limited to teacher-owned classroom/subject allocations.

Minimum safe constraints if product later approves this option:

- Existing assessments only.
- Score-only delivery mode only.
- Teacher must own the classroom/subject/term allocation.
- Student must belong to the owned classroom enrollment.
- Assessment scope must include the owned classroom/student.
- Term must be open and writable.
- Assessment must not be locked.
- Assessment workflow state must permit grade item writes.
- No assessment creation, publish, approve, lock, rules changes, exports, notifications, or XP.
- All writes must use core Grades use cases and audit logging.

Potential routes for a later sprint only:

- `PUT /api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/items/:studentId`
- `PUT /api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/items`

Benefits:

- Gives teachers a mobile/app path for score-only classroom grade entry.
- Could reduce Dashboard dependency for day-to-day teacher scoring.
- Can reuse core Grades GradeItem write use cases if wrapped with strict Teacher App ownership checks.

Risks:

- Creates a second direct GradeItem write surface.
- Increases conflict risk with Dashboard-entered or admin-reviewed grades.
- Requires very careful handling of approved, locked, and closed-term states.
- Requires teacher allocation checks beyond route-level class ownership.
- Bulk mobile entry has usability and partial-failure complexity.
- May require new app-specific permissions or a clear mapping to existing Grades item management permissions.
- Could create expectations around parent/student visibility, notifications, or audit trails that are not in V1 scope.

Required backend changes if approved:

- Teacher App grade item write use cases that first assert teacher allocation ownership, then delegate to core Grades item write use cases.
- DTOs/presenters for Teacher App grade entry responses.
- Controller routes under existing Teacher App classroom grades namespace.
- Focused audit logging and safe error mapping if not already inherited from core use cases.

Required tests if approved:

- Teacher can write only for owned classroom/subject/term.
- Teacher cannot write for same-school unowned classroom, subject, term, assessment, or student.
- Teacher cannot write cross-school data.
- Locked assessments block writes.
- Closed terms block writes.
- Question-based assessments reject direct score-only item entry.
- Bulk writes reject out-of-bound students and invalid scores.
- No tenant/internal fields leak in responses or errors.

Required permissions if approved:

- Product/security must decide whether Teacher App uses existing Grades item manage permission, a Teacher App-specific capability, or an allocation-only guard without adding new permission names.

Schema impact:

- None expected.

Frontend impact:

- Teacher App would need direct score entry UI, validation, conflict handling, and clear disabled states for locked/closed/out-of-scope assessments.

Compatibility with existing Dashboard Grades:

- Compatible only if Teacher App is a thin ownership wrapper over core Grades write use cases and respects Dashboard workflow protections.

Should proceed to Sprint 23E:

- No, not under current V1 evidence. This option requires explicit future product approval.

## Option C — Teacher App Question-Based Review Only

Teacher App can review/correct question-based submissions and sync reviewed submissions to GradeItems, but cannot directly edit score-only GradeItems.

Current status:

- This is already implemented where Teacher App classroom assignments/submissions expose review and sync routes.
- Homework review and grade sync also provide a teacher-driven grade write path for homework-linked work.

Benefits:

- Keeps grade writes tied to evidence: submitted answers, review state, awarded points, and finalized submission state.
- Preserves consistency between question review and synced GradeItems.
- Avoids arbitrary score edits from Teacher App.
- Reuses core Grades review/sync protections.

Risks:

- Does not support ad hoc score-only classroom grade entry.
- Requires frontend to distinguish read-only score-only assessments from reviewable question-based or homework-linked work.

Required backend changes:

- None for V1, beyond any security closeout findings in Sprint 23F.

Required tests:

- Existing and Sprint 23F security tests should continue to cover teacher ownership, submission ownership, answer review no-leak behavior, locked/closed protections, and sync behavior.

Required permissions:

- Existing Teacher App access checks and core Grades submission review protections.

Schema impact:

- None.

Frontend impact:

- Teacher App should show review/sync actions only for supported question-based or homework-linked work.

Compatibility with existing Dashboard Grades:

- Compatible. Dashboard still owns direct grade administration.

Should proceed to Sprint 23E:

- No. The capability already exists in the accepted V1 shape.

## Option D — Teacher App Full Assessment Authoring and Grade Entry

Teacher App would support assessment creation, question management, publish/approve/lock workflow, direct score entry, submission review, and possibly rules or gradebook administration.

Benefits:

- Gives teachers a complete mobile assessment authoring and grading surface.
- Could support a future teacher-led assessment workflow if product wants that.

Risks:

- Large expansion of V1 scope.
- Duplicates Dashboard Grades capabilities.
- Requires new product policy around teacher-created assessments, approval authority, locked grade governance, notifications, parent/student visibility, and audit trails.
- Substantially increases testing and permission complexity.
- Risks breaking the current distinction between administrative Dashboard workflows and Teacher App composition workflows.

Required backend changes:

- Significant new Teacher App controller/use-case/presenter surface.
- Product-approved permission model.
- Extensive workflow/audit/security tests.

Required tests:

- Full assessment CRUD security.
- Teacher allocation and subject ownership.
- Workflow authorization for publish/approve/lock.
- Closed-term and locked assessment mutation protection.
- Question/option no-leak behavior.
- Submission review/sync.
- Gradebook and visibility side effects.
- Same-school and cross-school denial coverage.

Required permissions:

- New or explicitly mapped Teacher App permissions would be required.

Schema impact:

- None expected for basic wrapping, but product requirements could trigger future schema work.

Frontend impact:

- Major Teacher App feature set and UX design effort.

Compatibility with existing Dashboard Grades:

- High risk unless Dashboard and Teacher App ownership policies are defined in detail.

Should proceed to Sprint 23E:

- No. This is future scope unless product explicitly reopens V1 scope.

## Risk Matrix

| Risk | Applies to | Impact | Control / decision |
| --- | --- | --- | --- |
| Duplicate direct grade-entry surfaces | Options B and D | High | Keep direct score-only GradeItem entry Dashboard-only for V1. |
| Teacher edits admin-approved grades | Options B and D | High | Do not add Teacher App direct writes now; future writes must enforce workflow state. |
| Locked assessment mutation | Options B and D | High | Existing core Grades blocks locked writes; future Teacher App writes must delegate to core use cases. |
| Closed-term mutation | Options B and D | High | Existing core Grades blocks closed/inactive term writes; future Teacher App writes must preserve this. |
| Teacher writes outside allocation | Options B and D | High | Current read/review/sync paths assert teacher ownership; direct writes would need the same plus assessment/student scope checks. |
| Teacher writes school-wide or stage-wide assessments outside ownership | Options B and D | High | Future writes must define whether broad-scope assessments are teacher-editable at all. |
| Score-only and question-based inconsistency | Options B and D | Medium | Keep question-based grades flowing through review/sync, not direct item editing. |
| Homework grade sync conflicts | Options B and D | Medium | Avoid direct Teacher App GradeItem editing that competes with homework sync for the same assessment/student. |
| Audit log gaps | Options B and D | High | No new writes now; future writes must audit every mutation. |
| Parent/student visibility timing | Options B and D | Medium | No notifications or visibility side effects in this sprint; future policy needed before direct writes. |
| Mobile bulk-entry complexity | Option B | Medium | Avoid in V1. |
| Permission model complexity | Options B and D | High | No new Teacher App grade write permission now. |
| Unsafe error or internal field leakage | Options B and D | High | Existing no-leak sweep continues in Sprint 23F; future write routes would require focused security tests. |

## Security / Tenancy Requirements If 23E Proceeds

This audit does not recommend proceeding to 23E. If product later explicitly approves limited Teacher App grade writes, the minimum security and tenancy requirements are:

- The authenticated actor must be a teacher in the active school context.
- The teacher must own the classroom/subject/term allocation for the route class.
- The assessment must belong to the same school.
- The assessment subject and term must match the owned teacher allocation.
- The assessment scope must include the owned classroom/student.
- The student must be actively enrolled in the owned classroom.
- Cross-school students, assessments, terms, and classrooms must be safely denied.
- Same-school but unowned classes, subjects, terms, assessments, or students must be safely denied.
- Closed/inactive terms must block writes.
- Locked assessments must block writes.
- Question-based assessments must not accept direct score-only GradeItem editing.
- Score bounds, status transitions, and comments must be validated by core Grades domain logic.
- Every mutation must be audited.
- Responses and errors must not leak `schoolId`, `organizationId`, `membershipId`, `roleId`, user IDs, answer keys, correct answers, `isCorrect`, raw answer content beyond approved review presentation, storage internals, or soft-delete metadata.

## Product Questions

These questions are not blockers for V1 if the recommendation is accepted. They must be answered only if product wants to reopen Teacher App direct grade writes later:

- Should teachers enter score-only grades from Teacher App?
- Should teachers edit Dashboard-created assessments?
- Should teachers create assessments from Teacher App?
- Should teachers grade only their assigned classroom/subject?
- Should broad school/stage/grade/section assessments be editable by a teacher from Teacher App?
- Should approved grades be editable from Teacher App?
- Should locked grades ever be editable from Teacher App?
- Should closed-term grades ever be editable from Teacher App?
- Should grades entered from Teacher App trigger student or parent notifications?
- Should homework grade sync remain the only Teacher App write path for homework-linked grade items?
- Should Teacher App direct writes use existing Dashboard Grades permissions or a separate Teacher App permission policy?

## Recommendation

`Recommendation: NO_23E_NEEDED`

Teacher App direct grade writes should not be implemented now.

Reasons:

- Dashboard Grades already owns direct assessment CRUD, workflow, score-only GradeItem entry, bulk entry, gradebook, analytics, rules, submission review, and grade item sync.
- Teacher App already supports the teacher-driven V1 grade write paths that are backed by actual classroom work: homework review/sync and question-based submission review/sync.
- Teacher App classroom grades read models are sufficient for V1 classroom visibility.
- Direct Teacher App score-only GradeItem entry would create a second write surface without a confirmed V1 product requirement.
- The incremental risk is higher than the V1 value unless product explicitly asks for mobile score-only grade entry.

The next sprint should be:

`Sprint 23F — Homework Grades Assessments Security Closeout`

## If Proceeding to 23E: Exact Safe Scope

Not applicable. This audit recommends no Sprint 23E implementation.

If product later overrides this decision, the only safe candidate for a future limited implementation would be:

- Teacher App direct score-only GradeItem entry only.
- Existing assessments only.
- Teacher-owned classroom/subject/term allocations only.
- No assessment creation.
- No assessment publish/approve/lock.
- No rules changes.
- No schema/migrations expected.
- No parent/student visibility change.
- No notifications, XP, exports, or advanced analytics.
- Mandatory delegation to core Grades GradeItem use cases after Teacher App ownership checks.
- Mandatory e2e/security coverage for same-school unowned access, cross-school access, closed terms, locked assessments, question-based assessment rejection, and no-leak response/error behavior.

Potential future routes, only if explicitly approved later:

- `PUT /api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/items/:studentId`
- `PUT /api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/items`

## If Not Proceeding to 23E: Next Sprint

Proceed to:

`Sprint 23F — Homework Grades Assessments Security Closeout`

Recommended Sprint 23F scope:

- Final security and tenancy sweep for Homework, Grades, Assessments, Teacher App, Student App, and Parent App grade/homework paths.
- Cross-school denial coverage.
- Same-school unowned teacher/student/parent denial coverage.
- Closed-term mutation protection.
- Locked/approved assessment mutation protection.
- Answer key, correct answer, `isCorrect`, internal tenant ID, role/membership ID, and file storage metadata no-leak verification.
- Safe error shape verification.
- Regression checks for Dashboard Grades bootstrap/overview and Student/Parent summary enrichment.

## Findings

### Critical Blockers

None.

### Security Blockers

None introduced by this docs-only sprint.

Sprint 23F remains required before final closeout because this feature family spans direct grade writes, homework sync, question review, app-facing read models, role boundaries, and tenant boundaries.

### Contract Blockers

None.

No route rename, alias, DTO reshaping, or contract-breaking change is recommended.

### Product Decision Blockers

None for V1 under this recommendation.

If product wants Teacher App direct score-only grade entry, product must explicitly approve that future scope before any implementation sprint.

### Non-blocking Observations

- Teacher App ADRs describe classroom, homework, assignment, submission, and review workflows, but they do not establish a clear V1 requirement for direct score-only GradeItem entry.
- School Dashboard Grades ADRs clearly describe administrative grade management, including score-only GradeItem entry and bulk entry.
- Existing backend route/name differences are not blockers. Backend-native route names should be preserved.
- Existing Teacher App review/sync write paths should not be rebuilt as separate direct grade-entry flows.

## Final Decision

PASS.

`Recommendation: NO_23E_NEEDED`

Do not implement Teacher App direct grade writes in V1. Keep direct grade administration in School Dashboard Grades. Keep Teacher App write behavior limited to homework workflows and question-based submission review/sync where already implemented. Proceed to `Sprint 23F — Homework Grades Assessments Security Closeout`.
