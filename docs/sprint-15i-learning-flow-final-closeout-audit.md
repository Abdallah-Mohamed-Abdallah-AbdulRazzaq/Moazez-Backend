# Sprint 15I Learning Flow Final Closeout Audit

## 1. Purpose And Scope

Sprint 15I is a documentation-only closeout audit for the backend-native learning flow completed through Sprint 15H.

This audit covers the current backend state for:

- Academics and curriculum foundation.
- Lesson content resources.
- Lesson plans.
- Homework assignments, questions, attachments, answers, submissions, review, scoring, and safe feedback.
- Homework to Grades synchronization.
- App-facing Teacher App, Student App, and Parent App read and action surfaces related to the learning flow.
- Security, tenancy, ownership, and verification posture.
- Remaining V1 gaps outside the closed learning-flow scope.

This sprint intentionally does not change runtime behavior. No source code, Prisma schema, migrations, tests, package scripts, README files, generated files, or project structure files are changed by Sprint 15I.

Expected changed file for this sprint:

- `docs/sprint-15i-learning-flow-final-closeout-audit.md`

Explicitly out of scope for Sprint 15I:

- `src/**`
- `prisma/**`
- `test/**`
- `package.json`
- migrations
- generated Prisma client files
- runtime route or DTO changes
- test implementation changes
- README or project structure updates

## 2. ADR Interpretation Policy

ADR files under `adr/` are product intent references. They are not literal backend API contracts.

For this closeout:

- Existing shipped backend routes are preserved.
- ADR frontend examples are not treated as mandatory route names.
- Backend API shape remains governed by implemented controllers, DTOs, presenters, app-facing adapters, and API contract rules.
- App-facing payloads are extended only through backend implementation sprints, not retroactively reshaped in this audit.
- Adapter-backed contracts must preserve path, method, and route naming where already shipped.

This policy keeps Sprint 15I aligned with the project rule that product intent documents guide scope and behavior without overriding existing backend contracts.

## 3. Verified Baseline

Repository baseline inspected for this audit:

- Latest commit: `b98ab25 feat: integrate homework grade sync`
- Working tree before this document was created: clean.
- Sprint 15H verification status: project execution history records `verify:sprint15h` as passed before Sprint 15I.

Important note: Sprint 15I is documentation-only. This audit does not claim that `verify:sprint15h`, E2E suites, build, Prisma generation, or unit tests were rerun during Sprint 15I unless separately shown in command output for this sprint.

## 4. Sprint 15B To 15H Summary

### Sprint 15B - Curriculum Foundation

Goal:

- Add the normalized curriculum foundation for academic learning structure.
- Support curricula, units, and lessons inside the Academics domain.
- Keep Academics as the source of truth.

Primary modules and files:

- `src/modules/academics/curriculum/**`
- `src/modules/academics/academics.module.ts`
- `prisma/schema.prisma`
- migration `0026_*`
- `test/e2e/academics-curriculum-foundation.e2e-spec.ts`
- `test/security/tenancy.academics-curriculum.spec.ts`

Data models:

- `Curriculum`
- `CurriculumUnit`
- `CurriculumLesson`
- `CurriculumStatus`

Tests and verification:

- Module-local curriculum use-case tests.
- Curriculum E2E route and lifecycle coverage.
- Curriculum tenancy/security coverage.
- Package script `test:e2e:sprint15b`.

Completion state:

- Complete for backend-native V1 curriculum CRUD, activation/archive lifecycle, unit ordering, lesson ordering, and school-scoped storage.
- Complete for admin/core Academics surfaces.
- App-facing student/teacher/parent lesson browsing was intentionally not completed in this sprint.

### Sprint 15C - Lesson Content Resources

Goal:

- Add lesson content/resource management under curriculum lessons.
- Support text, file, video link, and external link resource items.
- Preserve external file ownership and safe file metadata patterns.

Primary modules and files:

- `src/modules/academics/curriculum/application/lesson-content*.ts`
- `src/modules/academics/curriculum/presentation/**`
- `src/modules/files/**`
- `prisma/schema.prisma`
- migration `0027_*`
- `test/e2e/academics-lesson-content-foundation.e2e-spec.ts`
- `test/security/tenancy.academics-lesson-content.spec.ts`

Data models:

- `LessonContentItem`
- `LessonContentItemType`
- existing `File`

Tests and verification:

- Lesson content use-case tests.
- E2E coverage for content CRUD, reorder, file-backed resources, and route inventory.
- Security coverage for school isolation and file ownership.
- Package script `test:e2e:sprint15c`.

Completion state:

- Complete for backend-native lesson content storage and management.
- Complete for safe file metadata and school ownership checks.
- Student, teacher preparation, and parent lesson-content browsing routes remain absent by design.

### Sprint 15D - Lesson Plans Foundation

Goal:

- Add teacher lesson plans and lesson plan items.
- Connect plans to teacher subject allocations, classroom/subject/curriculum context, optional timetable entry, and planned dates/periods.
- Preserve teacher allocation ownership rules.

Primary modules and files:

- `src/modules/academics/lesson-plans/**`
- `src/modules/academics/academics.module.ts`
- `prisma/schema.prisma`
- migration `0028_*`
- `test/e2e/academics-lesson-plans-foundation.e2e-spec.ts`
- `test/security/tenancy.academics-lesson-plans.spec.ts`

Data models:

- `LessonPlan`
- `LessonPlanItem`
- `LessonPlanStatus`
- `LessonPlanItemStatus`

Tests and verification:

- Lesson plan use-case tests.
- Lesson plan E2E lifecycle and item workflow coverage.
- Tenancy/security tests for school and teacher ownership.
- Route inventory assertions for deferred student/teacher/parent app-facing lesson-preparation surfaces.
- Package script `test:e2e:sprint15d`.

Completion state:

- Complete for core/backend lesson plan authoring and lifecycle.
- Complete for item start, complete, skip, cancel, reorder, and delete actions.
- App-facing lesson preparation and browsing routes remain absent by design.

### Sprint 15E - Homework Questions And Assignment Attachments

Goal:

- Extend Homework assignments with structured questions, options, and assignment attachments.
- Keep Homework as the source of truth for homework authoring.
- Avoid gradebook synchronization or auto-grading scope.

Primary modules and files:

- `src/modules/homework/**`
- `src/modules/teacher-app/homeworks/**`
- `src/modules/student-app/homeworks/**`
- `src/modules/parent-app/homeworks/**`
- `src/modules/files/**`
- `prisma/schema.prisma`
- migration `0029_*`
- `test/e2e/homework-questions-attachments-foundation.e2e-spec.ts`
- `test/security/tenancy.homework-questions-attachments.spec.ts`

Data models:

- `HomeworkQuestion`
- `HomeworkQuestionOption`
- `HomeworkAssignmentAttachment`
- existing `HomeworkAssignment`
- existing `File`

Tests and verification:

- Homework question and assignment attachment use-case tests.
- E2E coverage for create, update, reorder, delete, publish compatibility, and safe app-facing reads.
- Security tests for school isolation, teacher ownership, file ownership, and payload leakage.
- Package script `test:e2e:sprint15e`.

Completion state:

- Complete for backend-native homework questions and assignment attachments.
- Complete for teacher owned authoring routes.
- Complete for student/parent safe read models that do not expose option correctness or expected answers.
- Auto-grading and grade sync remained deferred.

### Sprint 15F - Homework Student Answers And Submission Attachments

Goal:

- Add student answer persistence and submission attachments.
- Preserve draft versus final submission mutability rules.
- Keep parent surfaces read-only.

Primary modules and files:

- `src/modules/homework/application/homework-submission-content.use-cases.ts`
- `src/modules/homework/application/homework-submissions.use-cases.ts`
- `src/modules/homework/presentation/**`
- `src/modules/teacher-app/homeworks/**`
- `src/modules/student-app/homeworks/**`
- `src/modules/parent-app/homeworks/**`
- `prisma/schema.prisma`
- migration `0030_*`
- `test/e2e/homework-answers-attachments-foundation.e2e-spec.ts`
- `test/security/tenancy.homework-answers-attachments.spec.ts`

Data models:

- `HomeworkSubmissionAnswer`
- `HomeworkSubmissionAttachment`
- existing `HomeworkSubmission`
- existing `HomeworkQuestion`
- existing `File`

Tests and verification:

- Homework answers and submission attachments use-case tests.
- Student app answer save and submit E2E coverage.
- Teacher app submission answer read coverage.
- Parent app read-only coverage.
- Security tests for tenant, enrollment, parent-child, and file ownership.
- Package script `test:e2e:sprint15f`.

Completion state:

- Complete for student answer persistence and submission attachments.
- Complete for student mutation before final submit and no mutation after final submit.
- Complete for parent read-only behavior.
- Answer-level teacher review fields existed in the Sprint 15F data model but the full review/scoring layer was completed later in Sprint 15G.

### Sprint 15G - Homework Answer Review And Scoring

Goal:

- Complete teacher answer-level review and scoring.
- Roll up answer awarded points to submission awarded marks.
- Finalize reviewed submissions safely for Student App and Parent App.

Primary modules and files:

- `src/modules/homework/application/homework-answer-review.use-cases.ts`
- `src/modules/homework/application/homework-submissions.use-cases.ts`
- `src/modules/homework/domain/homework-answer-review*.ts`
- `src/modules/homework/presentation/homework-answer.presenter.ts`
- `src/modules/teacher-app/homeworks/**`
- `src/modules/student-app/homeworks/**`
- `src/modules/parent-app/homeworks/**`
- `test/e2e/homework-answer-review-completion.e2e-spec.ts`
- `test/security/tenancy.homework-answer-review.spec.ts`

Data models:

- existing `HomeworkSubmissionAnswer.teacherComment`
- existing `HomeworkSubmissionAnswer.awardedPoints`
- existing `HomeworkSubmissionAnswer.reviewedAt`
- existing `HomeworkSubmissionAnswer.reviewedByUserId`
- existing `HomeworkSubmission.awardedMarks`
- existing `HomeworkSubmission.reviewNote`
- existing `HomeworkSubmission.reviewedAt`
- existing `HomeworkSubmission.reviewedByUserId`

Tests and verification:

- Unit/use-case coverage for single answer review, negative points rejection, question point cap, cross-submission rejection, draft submission rejection, atomic bulk review, rollup recomputation, finalization, legacy assignment-level review, and presenter visibility.
- Teacher App tests for owned review and same-school unowned rejection.
- Student App and Parent App tests for feedback visibility only after review.
- Security tests for cross-school rejection, role restrictions, and payload field leakage.
- Package script `test:e2e:sprint15g`.

Completion state:

- Complete for answer-level review and scoring.
- Complete for bulk review all-or-nothing semantics.
- Complete for submission score rollup.
- Complete for finalizing submissions and target review status.
- Complete for safe reviewed feedback exposure to student and parent.
- No grade sync, notifications, XP, rewards, parent submit, or final auto-grading behavior was added in Sprint 15G.

### Sprint 15H - Homework Grade Sync Integration

Goal:

- Integrate reviewed Homework results into the existing Grades module.
- Use Grades as the source of truth.
- Avoid creating a parallel gradebook inside Homework.

Primary modules and files:

- `src/modules/homework/application/homework-grade-sync.use-cases.ts`
- `src/modules/homework/domain/homework-grade-sync*.ts`
- `src/modules/homework/presentation/homework-grade-sync*.ts`
- `src/modules/teacher-app/homeworks/**`
- `src/modules/grades/**`
- `prisma/schema.prisma`
- `test/e2e/homework-grade-sync-integration.e2e-spec.ts`
- `test/security/tenancy.homework-grade-sync.spec.ts`

Data model bridge:

- `HomeworkAssignment.gradeAssessmentId`
- existing `GradeAssessment`
- existing `GradeItem`

Tests and verification:

- Unit/use-case coverage for grade assessment compatibility, link validation, idempotent upsert, submission sync, assignment sync, and side-effect boundaries.
- Teacher App coverage for owned sync routes.
- E2E flow from reviewed homework to Grades item upsert.
- Security tests for school isolation, ownership, role restrictions, and route inventory.
- Package script `test:e2e:sprint15h`.
- Package script `verify:sprint15h`.

Completion state:

- Complete for manual/idempotent Homework to Grades sync.
- Complete for core grade-assessment link and sync routes.
- Complete for teacher-owned sync status and sync routes.
- Complete for absence of student/parent grade-sync management routes.
- Complete for absence of grade sync side effects such as notifications, XP, rewards, or parent submit behavior.

## 5. Final Current State - Academics

### Complete For V1 Backend-Native Scope

Academic structure:

- Academic years, terms, stages, grades, sections, and classrooms are modeled in Academics.
- School-scoped structure is managed through domain modules and repositories.
- Controllers do not own Prisma access or business logic.

Subjects:

- Subjects exist as school-scoped academic entities.
- Subjects are linked into teacher allocations, curriculum, lesson plans, timetable, and homework placement workflows.

Rooms:

- Rooms are modeled as school-scoped academic resources.
- Timetable entries can reference rooms.

Teacher allocations:

- `TeacherSubjectAllocation` is the teacher ownership anchor for class/subject work.
- Teacher App homework routes validate `classId` as an allocation id.
- Teacher-owned actions depend on allocation ownership checks instead of trusting classroom ids.

Timetable:

- Timetable config, periods, entries, publications, and conflicts exist in the Academics module.
- Lesson plans can reference timetable entries when appropriate.

Curriculum:

- Curricula are modeled with status lifecycle.
- Curriculum units and curriculum lessons are normalized and ordered.
- Curriculum routes support create, update, delete, activate, archive, unit operations, and lesson operations.

Lesson content/resources:

- Lesson content items support text, file, video link, and external link resource types.
- Lesson content is stored under curriculum lessons.
- File-backed resources rely on the Files module for metadata and ownership.

Lesson plans:

- Lesson plans support draft, active, archived, and deleted lifecycle states.
- Lesson plan items support ordered instructional steps and item-level workflow states.
- Plans are linked to teacher allocation, subject, classroom, curriculum, optional curriculum unit/lesson, optional timetable entry, planned date, and period labels.

### Partial Or Not Yet Implemented Inside V1

Academic calendar:

- The V1 scope references academic calendar functionality, but no completed academic calendar module is part of the verified Sprint 15 learning-flow closure.
- This remains a V1 gap outside the Sprint 15B to 15H learning-flow closeout.

Academics overview:

- The V1 scope references an academics overview surface, but no completed overview/dashboard-style Academics module is part of this closeout.
- This remains a V1 gap outside the closed learning-flow path.

Student/teacher/parent lesson-content browsing or preparation:

- Core lesson content and lesson plans exist.
- App-facing browsing/preparation routes for Student App, Teacher App, and Parent App remain intentionally absent according to route inventory assertions from the lesson content and lesson plan E2E coverage.

## 6. Final Current State - Homework

### Complete For V1 Backend-Native Scope

Assignments:

- Homework assignments exist as school-scoped Homework domain records.
- Assignment lifecycle supports draft, publish, close, and cancel behavior.
- Homework supports target resolution and placement through academic context.

Targets:

- Homework targets track assigned academic recipients.
- Submission review finalization can update the related target status to reviewed.

Lifecycle:

- Draft homework can be authored before publish.
- Published and closed homework can receive and review submissions according to existing rules.
- Canceled homework is not treated as reviewable work.

Questions and options:

- Homework questions support short text, long text, single choice, multiple choice, and true/false.
- Question ordering and option ordering are supported.
- Question point values constrain answer review scoring.
- Correct option flags and expected answers exist in core storage for teacher/admin use, but are not exposed to student/parent safe result payloads.

Assignment attachments:

- Homework assignments can include file-backed attachments.
- Attachments are ordered and use Files module metadata.
- Student/parent reads show safe attachment metadata only.

Submissions:

- Student submissions support draft answer saving and final submit.
- Submitted/late submissions become reviewable by teachers.
- Draft submissions are not reviewable.
- Reviewed submissions become read-only for review mutation according to answer-review rules.

Student answers:

- Student answers are persisted per submission and question.
- Text answers and selected options are modeled.
- Current answer uniqueness is enforced at the submission/question level.

Submission attachments:

- Student submission attachments are supported before final submit according to Sprint 15F policy.
- File ownership and tenant checks are enforced.

Teacher review:

- Teacher review supports answer-level awarded points, teacher comment, reviewed timestamp, and reviewed-by actor.
- Existing assignment-level submission review note and awarded marks behavior remains supported.
- Teacher App delegates to Homework Core and does not duplicate scoring logic.

Finalization:

- Submission review finalization preserves the teacher review lifecycle.
- Required answer reviews must be complete before marking question-backed submissions reviewed.
- Text-only homework without questions remains compatible with assignment-level review behavior.

Score rollup:

- Answer awarded points are summed into `HomeworkSubmission.awardedMarks`.
- Rollup is constrained by question points and assignment total marks where present.
- Teacher review remains authoritative; choice questions are not auto-graded into final gradebook results.

Student/parent safe reviewed feedback:

- Before review, student and parent can see allowed answer/submission content but not scoring feedback.
- After submission status is `REVIEWED`, student and parent can see awarded points, teacher comments, submission awarded marks, review note, reviewed timestamp, and reviewed status.
- Student and parent payloads do not expose `isCorrect`, `expectedAnswer`, tenant fields, or other students' answers.

Grade sync:

- Reviewed homework can be manually synced to Grades after Sprint 15H.
- Homework does not create a parallel gradebook.

### Intentionally Deferred Or Not Implemented

Notifications:

- Homework notifications are not implemented in the Sprint 15 learning-flow closure.

XP/rewards:

- Homework XP or reward side effects are not implemented.

Parent submit:

- Parent homework submit or mutation behavior is absent.

Auto-grading as final gradebook result:

- Auto-grading is not implemented as authoritative final gradebook sync.
- Teacher review remains the source for awarded homework marks.

New upload behavior:

- Sprint 15 did not introduce a new upload mechanism.
- Attachments continue to rely on the existing Files module patterns.

Resubmission policy changes:

- No new resubmission policy is part of this closeout.

## 7. Grades Integration

Grades remains the source of truth for gradebook data.

Homework to Grades integration uses a narrow bridge:

- `HomeworkAssignment.gradeAssessmentId` links homework to an existing grade assessment.
- Homework sync writes to existing Grades concepts such as `GradeAssessment` and `GradeItem`.
- Homework does not own gradebook tables.
- Homework does not generate an independent grade ledger.

Sync behavior:

- Sync is manual and explicit.
- Sync is idempotent through existing Grades upsert use cases.
- A reviewed homework submission can sync into a grade item when validation passes.
- Assignment-level bulk sync can sync eligible reviewed submissions.
- Sync validation requires compatible school, academic year, term, subject, placement scope, assessment type, and review state.
- Scores cannot exceed homework total marks or the linked assessment maximum.

Routes and ownership:

- Core Homework exposes grade-sync status, link, assignment sync, and submission sync routes.
- Teacher App exposes owned grade-sync status, assignment sync, and submission sync routes.
- Teacher App does not expose the grade-assessment link route.
- Student App and Parent App do not expose grade-sync management routes.

Side-effect boundaries:

- Grade sync does not trigger notifications.
- Grade sync does not grant XP/rewards.
- Grade sync does not add parent submit behavior.
- Grade sync does not create gradebook items outside the existing Grades module.

## 8. App-Facing Surfaces

### Teacher App

Homework:

- Teacher dashboard/list surfaces exist for owned homework.
- Teacher can create, update, publish, close, cancel, resolve targets, and read owned assignments through allocation-backed routes.
- Teacher can manage questions, options, and assignment attachments for owned homework.
- Teacher can list and read submissions for owned homework.
- Teacher can read answers and submission attachments.
- Teacher can review one answer, bulk review answers, review/finalize submission, and sync reviewed results to Grades.
- `classId` in Teacher App homework routes remains `TeacherSubjectAllocation.id`.

Curriculum and lesson-plan related:

- Core Academics curriculum and lesson plan modules exist.
- Teacher App lesson-content browsing/preparation routes are not implemented as part of the closed Sprint 15 learning flow.

### Student App

Homework:

- Student can list and read assigned homework.
- Student can read safe questions and assignment attachment metadata.
- Student can save draft answers before final submit.
- Student can manage submission attachments before final submit.
- Student can submit homework.
- Student can see reviewed feedback only after submission status is `REVIEWED`.
- Student cannot see option correctness, expected answers, tenant fields, or other students' answers.

Lesson content and preparation:

- Student lesson-content browsing and lesson-plan preparation routes are not implemented in the Sprint 15 closure.

Grade sync:

- Student does not manage homework grade sync.

### Parent App

Homework:

- Parent can read child homework lists and details through parent-child ownership checks.
- Parent can see child submission and answer feedback only after review.
- Parent cannot mutate homework, answers, attachments, submissions, or grade sync.
- Parent cannot see option correctness, expected answers, tenant fields, or another student's answers.

Lesson content and preparation:

- Parent lesson-content or lesson-plan browsing routes are not implemented in the Sprint 15 closure.

Grade sync:

- Parent does not manage homework grade sync.

## 9. Security And Tenancy

School scope:

- Tenant-scoped learning-flow models include `schoolId`.
- Prisma access is owned by repositories.
- Controllers do not use Prisma directly.
- The school scope extension is the application-level tenant guardrail for Prisma access.

Ownership checks:

- Teacher ownership uses teacher subject allocation ownership for class/subject work.
- Teacher homework review and sync routes check owned assignments.
- Student reads and mutations are constrained by enrollment and assignment targeting.
- Parent reads are constrained by parent-child ownership.
- File-backed lesson content and homework attachments check file ownership and school scope.

Payload leakage:

- App-facing presenters avoid leaking `schoolId` and `organizationId`.
- Student and parent homework presenters do not expose `isCorrect`.
- Student and parent homework presenters do not expose `expectedAnswer`.
- Student and parent homework presenters expose scoring feedback only after reviewed status.

Route inventory assertions:

- Deferred student/teacher/parent lesson-content browsing and lesson-preparation routes are asserted absent by Sprint 15C/15D E2E route inventory coverage.
- Student and parent grade-sync management routes are asserted absent by Sprint 15H E2E/security coverage.
- Homework notifications, homework XP/rewards, and parent submit routes are asserted absent by Sprint 15G/15H coverage.

Audit logging:

- Sensitive learning-flow actions use audit logging where implemented, including homework answer review, bulk answer review, submission review finalization, grade-assessment linking, assignment sync, and submission sync.

## 10. Testing And Verification

Key E2E categories:

- Curriculum foundation flow.
- Lesson content resource flow.
- Lesson plan lifecycle flow.
- Homework question and assignment attachment flow.
- Homework answer and submission attachment flow.
- Homework answer review and scoring completion flow.
- Homework grade sync integration flow.

Key security categories:

- Curriculum tenancy isolation.
- Lesson content school and file ownership.
- Lesson plan teacher allocation ownership.
- Homework assignment tenancy.
- Homework question/attachment tenancy.
- Homework answer/submission attachment tenancy.
- Homework answer review role, tenant, and ownership restrictions.
- Homework grade sync role, tenant, and ownership restrictions.
- Response payload assertions for tenant field leakage and unsafe student/parent fields.

Key unit/use-case categories:

- Curriculum use cases.
- Lesson content use cases.
- Lesson plan use cases.
- Homework assignments and submissions.
- Homework questions and assignment attachments.
- Homework answers and submission attachments.
- Homework answer review and scoring.
- Homework grade sync.
- Grades integration use cases used by sync.
- App-facing presenters for safe student/parent feedback.

Relevant package scripts present through Sprint 15H:

- `test:e2e:sprint15b`
- `test:e2e:sprint15c`
- `test:e2e:sprint15d`
- `test:e2e:sprint15e`
- `test:e2e:sprint15f`
- `test:e2e:sprint15g`
- `test:e2e:sprint15h`
- `verify:sprint15h`

`verify:sprint15h` follows the accumulated verification chain through Sprint 15G and then runs Prisma validation/generation, build, targeted homework/grades/student-app/teacher-app/parent-app tests, targeted homework security tests, and the Sprint 15H E2E suite.

Sprint 15I did not rerun this full verification chain as part of creating this documentation-only audit.

## 11. Deferrals After Sprint 15H

The following remain deferred after the learning-flow closeout:

- Homework notifications.
- Homework XP/reward integration.
- Parent submit.
- Auto-grading as final gradebook result.
- Teacher lesson-content browsing/preparation app-facing routes.
- Student lesson-content browsing/preparation app-facing routes.
- Parent lesson-content browsing/preparation app-facing routes.
- Auto-generation of homework from lesson plans.
- Academic calendar.
- Academics overview.
- Dashboard core.
- Platform Admin.
- Applicant Portal.
- Smart Pickup.

These deferrals are outside the closed Sprint 15B to 15H backend-native learning-flow path.

## 12. Remaining V1 Gap Matrix

| Gap | Current status | Why it matters | Suggested future sprint | Dependencies | Risk level |
| --- | --- | --- | --- | --- | --- |
| Dashboard Core Summary | Not implemented in the verified Sprint 15 closure. | V1 needs a compact operational summary for school users. | Sprint 16A Dashboard Core Summary Foundation. | Stable Academics, Homework, Grades, attendance/communication signals where available. | High |
| Dashboard Alerts | Not implemented in the verified Sprint 15 closure. | Users need prioritized issues and exceptions surfaced without opening each module. | Sprint 16B Dashboard Alerts Foundation. | Dashboard summary contracts, notification/alert source policies. | Medium |
| Dashboard Activity Feed | Not implemented in the verified Sprint 15 closure. | Recent actions across learning and operations help users understand what changed. | Sprint 16C Dashboard Activity Feed Foundation. | Audit/event source normalization, actor summaries. | Medium |
| Platform Admin Basic | Not implemented in the verified Sprint 15 closure. | Tenant and organization-level administration remains necessary for SaaS operation. | Sprint 17A Platform Admin Basic. | Existing platform/organization/school hierarchy, roles and permissions. | High |
| Academic Calendar | Not implemented in the verified Sprint 15 closure. | Calendar boundaries affect terms, teaching days, homework timing, and school operations. | Sprint 16D Academic Calendar Foundation. | Academic years/terms, holiday/event policy, timetable interactions. | Medium |
| Academics Overview | Not implemented in the verified Sprint 15 closure. | Academic managers need an aggregate view over curriculum, timetable, plans, and homework. | Sprint 16E Academics Overview. | Curriculum, lesson plans, timetable, homework, dashboard summary conventions. | Medium |
| Applicant Portal Basic | Not implemented in the verified Sprint 15 closure. | Admissions/applicant intake is in V1 scope and affects onboarding pipelines. | Sprint 17B Applicant Portal Basic. | Identity/onboarding policy, organization/school admission rules. | Medium |
| Smart Pickup Basic | Not implemented in the verified Sprint 15 closure. | V1 includes basic pickup flow distinct from advanced smart pickup. | Sprint 17C Smart Pickup Basic. | Student/parent identity, authorization, operational event logging. | Medium |
| Parent onboarding/auth-specific flows | Not verified as completed by Sprint 15I. | Parent access depends on reliable account linking and auth flows. | Sprint 16F Parent Onboarding/Auth Completion. | Existing auth module, parent-child ownership, invitation policy. | High |
| Homework notification/XP optional integration | Deferred intentionally after Sprint 15H. | Product may later want engagement side effects after review or sync events. | Sprint 18A Homework Engagement Integrations. | Notification policy, rewards policy, event source contracts. | Low |

## 13. Recommended Next Step

Recommended next sprint: Sprint 16A Dashboard Core Summary Foundation.

Reasons:

- The learning-flow backend path now has enough stable source data from Academics, Homework, and Grades to support useful summary cards.
- Dashboard Core is explicitly in V1 scope and remains a visible product gap.
- A summary foundation can be kept read-only and low-risk while establishing cross-module aggregation patterns.
- It avoids reopening closed Homework or Grades behavior while still giving users value from the completed learning-flow work.
- It creates a natural base for later alerts and activity feed work without requiring notifications, XP, or advanced analytics.

Suggested scope boundaries for Sprint 16A:

- Read-only dashboard summary use cases.
- Presenter-shaped app-facing payloads.
- No new cross-domain write behavior.
- No advanced analytics builder.
- No notification engine.
- No grade recalculation.

## 14. Closeout Decision

Academics/Curriculum/Homework/Grades learning flow is closed for V1 backend-native scope after Sprint 15H, excluding explicitly deferred cross-domain/product extensions.

Closed means:

- The normalized backend data model exists for curriculum, lesson resources, lesson plans, homework, submissions, answer review, scoring, and grade sync.
- Teacher-owned homework authoring, review, finalization, and sync are implemented.
- Student answer and submission flows are implemented.
- Parent homework visibility is read-only and safe.
- Grades remains the source of truth for gradebook data.
- Tenant, ownership, and payload safety rules are covered by module, E2E, and security tests through Sprint 15H.

Not closed means:

- Dashboard Core, Academic Calendar, Academics Overview, Platform Admin, Applicant Portal, Smart Pickup, lesson-content app-facing browsing/preparation, homework notifications, homework XP/rewards, parent submit, and auto-grading as final gradebook result remain separate future work.

Sprint 15I records the closeout decision without modifying runtime code.
