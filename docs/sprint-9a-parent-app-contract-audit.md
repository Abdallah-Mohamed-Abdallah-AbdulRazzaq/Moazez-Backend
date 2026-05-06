# Sprint 9A Parent App Contract Audit

Status: planning audit only
Date: 2026-05-06

This audit maps the Parent App handoff contracts against the backend state after the Student App closeout. It does not introduce runtime Parent App APIs, controllers, DTOs, presenters, use-cases, routes, schema changes, migrations, seeds, package scripts, tests, ADR edits, README edits, or project structure edits.

## Source Review

Reviewed governance and closeout context:

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
- `docs/sprint-8a-student-app-contract-audit.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`

Reviewed Parent App handoff docs:

- `adr/Parent-App/parent_onboarding.md`
- `adr/Parent-App/parent_auth.md`
- `adr/Parent-App/parent_home.md`
- `adr/Parent-App/parent_children.md`
- `adr/Parent-App/parent_grades.md`
- `adr/Parent-App/parent_behavior.md`
- `adr/Parent-App/parent_progress.md`
- `adr/Parent-App/parent_schedule.md`
- `adr/Parent-App/parent_homeworks.md`
- `adr/Parent-App/parent_reports.md`
- `adr/Parent-App/parent_messages.md`
- `adr/Parent-App/parent_profile.md`
- `adr/Parent-App/parent_smart_pickup.md`
- `adr/Parent-App/parent_tasks.md`
- `adr/Parent-App/parent_applicant_portal.md`
- `adr/Parent-App/parent_parent_ADD_CHILD_MODEL.md`

Reviewed implementation state across Prisma, IAM, settings, students, admissions, academics, attendance, grades, reinforcement, behavior, communication, files, Teacher App, Student App, and relevant security/e2e tests.

Note: the required reading list names `DIRECTORY_STRUCTURE.md`; that file is not present in the repository. The available structure sources are `Moazez-Project-Structure.json` and related documentation.

## Current Backend State After Student App Closeout

### IAM And Parent Actor Identity

- `UserType.PARENT` exists.
- Generic IAM login/logout infrastructure exists.
- There is no Parent App actor/access foundation yet.
- There is no Parent App module, route scaffold, parent-specific guard, parent app presenter, or parent route policy.
- Current auth response shape is backend/IAM oriented, not the Parent App handoff response shape.
- Forgot-password and applicant temporary account flows from the handoff are not present as Parent App runtime APIs.

### Guardian Model And `Guardian.userId`

- `Guardian.userId` exists and relates `Guardian` to `User`.
- A user can have multiple guardian profiles through `User.guardianProfiles`.
- The students module guardian creation path currently creates guardians with `userId: null`; linking guardians to parent users will need an operational flow, backfill, invitation, admin action, or onboarding decision.
- Guardian records include private contact fields. Parent App responses must avoid leaking unrelated guardians or internal-only guardian metadata.

### StudentGuardian Links

- `StudentGuardian` exists as the normalized link between `Student` and `Guardian`.
- The link is school-scoped and supports multiple guardians per student and multiple students per guardian.
- This is the correct source for parent child ownership, after resolving `Guardian.userId = actor.id`.

### Students And Active Enrollments

- `Student.userId` now exists for Student App ownership, but Parent App ownership must use Guardian links, not `Student.userId`.
- `Enrollment` stores the current academic hierarchy through academic year, term, classroom, grade, section, stage, and school.
- Parent child access must resolve active enrollments for each linked student before returning school-scoped child data.

### Multi-Child Access

- The schema supports one parent user linked to more than one guardian profile and more than one child.
- Parent App must never assume a single child. Home, children, tasks, messages, reports, and notifications must be multi-child aware.
- Child-scoped routes must require a `child_id` or equivalent child identifier and validate ownership on every request.

### Cross-School And Multi-School Parent Risk

- Governance allows parents to have children across schools.
- `RequestContext` and `ScopeResolverGuard` currently resolve one active membership and one `schoolId`.
- `ScopeResolverGuard` chooses the first active membership returned by IAM. This is safe for dashboard users but insufficient as the only mechanism for a parent with linked children in multiple schools.
- Parent App implementation needs an approved multi-school strategy before runtime APIs are added.

### Academics, Classrooms, And Enrollment Hierarchy

- Academics core has academic years, terms, stages, grades, sections, classrooms, subjects, teacher allocations, and rooms.
- Existing Student App adapters already compose profile, subjects, grades, and progress from this hierarchy.
- There is no timetable, period, schedule occurrence, lesson schedule, or durable schedule identifier model.

### Attendance

- Attendance sessions and entries exist.
- App-safe attendance should read submitted/finalized attendance data and avoid exposing correction or administrative workflow internals.
- Parent reports and behavior summaries can derive basic attendance indicators from existing attendance entries after child ownership is enforced.

### Grades, Assessments, And Submissions

- Grades core has assessments, grade items, question-based assessment structure, submissions, answers, rules, approval, and locking.
- `GradeAssessmentType.ASSIGNMENT` exists, but it is not a full Homework Core.
- Student App grade/exam APIs already prove app-facing read composition over existing grades core.
- Parent grade reads are feasible after parent ownership foundation.

### Behavior

- Behavior core has behavior records and behavior point ledger.
- ADR-0002 keeps Behavior as its own core boundary.
- Behavior points must not be treated as XP. XP belongs to reinforcement `XpLedger`.
- Parent behavior reads can be built from approved/submitted behavior records and safe ledger summaries after ownership checks.

### Progress, XP, And Hero Journey

- Reinforcement core has `XpLedger`, hero journey, badges, missions, rewards, tasks, assignments, stages, submissions, and reviews.
- Student App progress already composes academic, behavior, and XP views from core data.
- Parent progress/report views can be derived, but formulas and narrative labels are product decisions unless kept as simple summaries.

### Reinforcement Tasks

- Reinforcement tasks, targets, assignments, stages, submissions, and reviews exist.
- `ReinforcementSource.PARENT` exists in the schema, but Parent App create/update/approve-stage behavior is not approved or implemented.
- Parent task reads for linked children are plausible now. Parent-created tasks and stage approvals need product and route policy decisions.

### Communication Conversations And Messages

- Communication core has conversations, participants, messages, reads, attachments, announcements, notifications, and policies.
- Student App supports existing participant conversations, text send, and read marking.
- Contact discovery, new conversation creation, message attachments, and audio are deferred for Student/Teacher and should not be backdoored through Parent App.
- Parent messages can be built only over conversations where the authenticated parent user is already an active participant.

### Announcements

- Announcements, audiences, attachments, and read receipts exist.
- Student App already implements audience-aware announcement reads.
- Parent App announcements require a parent audience resolver that considers linked children, guardian targets, user targets, and school hierarchy without leaking other audiences.

### Notifications

- Communication notifications and deliveries exist.
- There is no Student App notification center and no Parent App notification policy.
- Parent notification center should remain deferred until recipient policy, permissions, and response contracts are approved.

### Admissions And Applicant Portal

- Admissions core has leads, applications, documents, placement tests, interviews, and decisions.
- There is no applicant portal runtime module.
- There is no secure applicant user/account identity link in `Application` or `Lead` that directly proves the current parent owns an application.
- `Lead.ownerUserId` is a dashboard ownership field, not a safe applicant identity model.

### Files

- Files core stores bucket/object keys and can issue signed download URLs.
- Direct file download permission is broad and school-scoped; Parent App must authorize access through the owning resource before returning a signed URL.
- App responses must never expose raw bucket names, object keys, or internal storage metadata.

### Pickup And Smart Pickup

- No pickup, smart pickup, pickup gate, pickup request, geofence, call queue, delegate, or recent-call core model was found.
- Smart Pickup must remain deferred.

## Parent App Contract Mapping

| Handoff area | Backend readiness | Existing core source of truth | Required ownership model | Required child selection behavior | Required response composition | Missing fields or capabilities | Unsafe fields or overreach | New core logic needed | Can build now without schema changes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Onboarding | Missing/deferred | None | Parent actor not required for static content, but onboarding that links a parent requires Guardian ownership | Not child-scoped unless onboarding includes child claim | Static pages or CMS-backed onboarding | Onboarding content model, OTP/invitation policy, verified guardian onboarding | Fabricating onboarding status or linking guardians without proof | Product/auth decision, possibly onboarding core | No, except hardcoded static content if explicitly approved |
| Auth | Partially ready | IAM users, sessions, roles | Authenticated user must be `UserType.PARENT` for Parent App routes | Not child-scoped | Parent-specific login/profile response adapter | Forgot password runtime, temporary applicant account, parent onboarding token/invite flow | Returning dashboard permissions as app capability; accepting non-parent actors | Parent app auth policy and possibly onboarding flow | Generic login exists, but Parent App contract needs adapter/decisions |
| Home | Partially ready | Students, enrollments, attendance, grades, behavior, reinforcement, communication | Resolve parent user -> guardian profiles -> linked students -> active enrollments | Must support all linked active children and per-child summaries | Multi-child dashboard with safe counts, latest school/child state, optional existing message/task/announcement counts | Smart pickup, full homework, notification center, some parent summary labels | Exposing school/org IDs, unrelated children, raw latest records, fabricated pickup/homework | No new core for basic dashboard, but needs parent access foundation | Yes for basic home after ownership foundation |
| Children | Partially ready | Students, StudentGuardian, Enrollment, academics, attendance, grades, behavior, reinforcement | Guardian ownership through `StudentGuardian` | List all owned active children; detail validates `child_id` | Child cards and profile from student, active enrollment, classroom, school, safe aggregates | Weekly schedule, avatar/image policy, ranking, some achievement labels | Medical/internal notes/documents, other guardians, private guardian data | No for basic list/detail; schedule/achievement policy decisions for full | Yes for basic children after ownership foundation |
| Grades | Ready after ownership foundation | Grades core, academics, enrollments | Parent must own selected child through guardian link | `child_id` required and owned | Summary, subject grades, assessment summaries from published/approved grade data | Product rating labels, icon/color mapping if not stored | Draft/unapproved assessments, other students' submissions | No new core for read APIs | Yes |
| Behavior | Ready after ownership foundation | Behavior core, attendance core | Parent must own selected child | `child_id` required and owned | Summary and record feed from approved/submitted behavior records and safe attendance indicators | Exact app copy/rating formulas may be product decisions | Draft/rejected/internal behavior notes; treating behavior points as XP | No new core for read APIs | Yes |
| Progress | Partially ready | Grades, attendance, behavior, reinforcement XP/hero | Parent must own selected child | `child_id` required and owned | Academic, behavior, attendance, XP, and hero journey summaries | Month-over-month deltas, narrative labels, rankings, level formulas if not already defined | Treating `BehaviorPointLedger` as XP; exposing reward/admin internals | No new core for basic derived read views; product formulas may be needed | Yes for basic progress after ownership foundation |
| Schedule | Missing/deferred | Academics has structure only; attendance has labels, not timetable | Parent must own selected child | `child_id` required and owned | Today/weekly schedule cannot be truthfully composed | Timetable, period, lesson occurrence, durable `scheduleId` | Fabricating schedule from attendance sessions or teacher allocations | New Schedule/Timetable core | No |
| Homeworks | Partially ready/deferred | Grades assessments of type `ASSIGNMENT`, submissions | Parent must own selected child | `child_id` required for list; homework detail must belong to owned child context | Limited assignment read could use grades core | Full Homework aggregate, due workflow, attachments/proof policy, ordering/file upload question types, homework-specific submit contract | Calling all assignments "homework"; enabling submit without assessment policy | Product decision; likely Homework Core for full contract | Limited read only if approved; full contract no |
| Reports | Partially ready | Grades, attendance, behavior, reinforcement XP | Parent must own selected child | `child_id` required and owned | Derived performance report from existing summaries | Published report artifact, teacher narrative, stars/levels, export/PDF | Leaking internal comments, private medical/admin fields | No new core for basic derived report; report artifact core if product requires | Yes for basic derived report after ownership foundation |
| Messages | Partially ready | Communication conversations, participants, messages, reads | Parent user must be active participant and, where child context matters, own linked child | Conversation access by participant; child filter only if conversation is child-linked | Existing conversations, message history, text send, mark-read | Contact discovery, new conversation creation, attachments/audio | Listing all teachers/parents, bypassing communication policy, exposing non-participant conversations | No new core for existing participant flows; decisions for discovery/attachments/audio | Yes for existing participant text flows after policy review |
| Profile | Partially ready | User, Guardian, StudentGuardian, SchoolProfile | Parent actor `UserType.PARENT`; guardian rows by `userId` | Include child summaries across owned active children | Basic account, guardian display name/contact, children, school summaries | Preferences, language/theme mutations, account actions content, support/legal CMS, avatar, city, parent code | Exposing other guardians, national IDs, internal notes, school/org IDs | No new core for basic read; decisions for preferences/CMS/mutations | Yes for basic read after ownership foundation |
| Smart Pickup | Missing/deferred | None found | Parent ownership would be required for pickup child/delegate | Child selection required | Cannot compose safely | Pickup request model, gate/geofence, delegate authorization, recent calls, staff workflow | Fabricating pickup availability from school profile coordinates | New Pickup/Smart Pickup core | No |
| Tasks | Partially ready | Reinforcement tasks, targets, assignments, stages, submissions, reviews | Parent must own selected child for child assignments; parent-created actions need actor policy | Reads can list linked children; child-specific detail must validate owned assignment | Task dashboard and assignment detail from reinforcement core | Parent create/update semantics, approve-stage policy, proof/file access rules | Allowing parents to mutate teacher/school tasks; accidental XP grants | Reads no; create/update/approve needs product/core policy | Read-only yes after ownership foundation; mutations no |
| Applicant Portal | Missing/partially ready | Admissions leads, applications, documents, tests, interviews, decisions | Needs secure applicant/parent identity link; Guardian link is not enough for applicant records | Child may not exist yet; applicant child identity differs from enrolled student | Portal home/requests/profile need applicant-owned records | Applicant account, temporary account, application owner link, safe document access | Using `Lead.ownerUserId` as applicant ownership; exposing other applicants | Product/auth decision and likely schema change | No safe runtime contract now |
| Add Child | Missing/deferred | Admissions core can create leads/applications for dashboard flows | Existing parent must be securely linked to new applicant/child claim | New child may not exist; claim or application workflow required | School search, required documents, application submission, applicant portal | Public school search policy, required documents model, temporary account, claim/admin approval model | Add-child abuse, claiming another child, public data leakage | Product decision; applicant/claim core likely needed | No |

## Ready-To-Build Parent App Areas

The following can likely be implemented after an explicit Parent App ownership foundation is approved. They should be adapter-backed composition over core modules and should not redefine business truth.

1. Parent ownership/access foundation using `UserType.PARENT`, `Guardian.userId`, `StudentGuardian`, and active `Enrollment`.
2. Parent Home basic multi-child dashboard from existing children, grades, attendance, behavior, reinforcement, announcements, and message summaries, excluding Smart Pickup, notification center, and full Homework Core.
3. Children list and child profile basic, excluding weekly timetable and unsafe medical/internal/document fields.
4. Child grades read APIs using grades core and Student App grade composition patterns.
5. Child behavior read APIs using behavior core and safe attendance indicators.
6. Child progress read APIs using grades, attendance, behavior, reinforcement XP, and hero journey summaries.
7. Child reports basic derived from grades, attendance, behavior, and XP, if product accepts derived reports instead of published report artifacts.
8. Parent profile basic read from `User`, linked guardian rows, linked children, and safe school profile fields.
9. Parent tasks read-only dashboard/detail for reinforcement assignments linked to owned children.
10. Parent messages over existing participant conversations only, with text send and read marking if communication policy allows.
11. Parent announcements read if a parent-safe audience resolver is implemented for linked children, guardian targets, and user targets.
12. File downloads only when authorized through the owning resource first, never by raw file lookup alone.

## Areas Requiring Core Decisions Or New Core Logic

### Multi-School Parent Context

What is missing: the current `RequestContext` and `ScopeResolverGuard` resolve one active `schoolId` from memberships. Parent access may need to span multiple schools through linked children.

Safest path: require a Sprint 9B architecture decision before runtime features. Implement a Parent App resolver that derives school scope from an owned child/enrollment for child-scoped routes and has a safe strategy for cross-school child lists. Avoid `platformBypass`.

### Schedule

What is missing: timetable, periods, schedule occurrences, and durable schedule identifiers.

Safest path: defer and create a Schedule/Timetable core later. Do not synthesize schedules from teacher allocations or attendance labels.

### Full Homeworks

What is missing: a Homework aggregate, homework-specific lifecycle, homework attachments/proof policy, and some question/answer shapes expected by the handoff.

Safest path: either implement a limited read adapter over `GradeAssessmentType.ASSIGNMENT` with clear contract limits, or defer full contract until Homework Core is approved.

### Smart Pickup

What is missing: pickup request, pickup delegate, gates, geofence, call queue, and recent call models.

Safest path: defer and create a Pickup/Smart Pickup core later.

### Parent Onboarding And Add Child

What is missing: verified invitation, OTP, claim code, admin approval, temporary account, and parent-to-guardian linking flow.

Safest path: require product/security decision. Do not allow add-child by free-form student identifiers.

### Notification Center

What is missing: Parent App recipient policy, permission model, read/unread contract, and cross-school behavior.

Safest path: defer until notification policy is approved.

### Contact Discovery And New Conversations

What is missing: parent contact discovery policy and new conversation permission rules.

Safest path: keep deferred. Allow only existing participant conversation reads/sends if approved.

### Message Attachments And Audio

What is missing: app-facing upload/download authorization and voice message policy. Communication policy currently defaults voice messages off.

Safest path: keep deferred with Teacher/Student scope.

### Applicant Portal

What is missing: secure applicant account identity and an application owner link distinct from dashboard owner assignment.

Safest path: defer unless a schema/product decision creates a safe applicant ownership model.

### Profile Preferences, Legal, Support, CMS, Avatar

What is missing: preference storage, legal/help center content, support ticket/rating core, avatar upload policy, parent code/city fields if required.

Safest path: basic profile read now; defer mutations and CMS-backed areas.

## Parent Actor / Guardian / Child Ownership Model

Parent App authorization should use the following model:

1. The authenticated actor must be `UserType.PARENT`.
2. Resolve guardian profiles where `Guardian.userId = actor.id`.
3. Resolve linked students through `StudentGuardian`.
4. Resolve active enrollments for each linked student.
5. A parent may access only child-owned data for linked students.
6. Child-scoped routes must require `child_id` or `studentId` and validate ownership before reading child data.
7. Same-school unowned child IDs must return safe 404.
8. Cross-school guessed child IDs must return safe 404.
9. Multi-child routes must return all owned active children unless a child filter is explicitly supplied and validated.
10. Multi-school behavior must be explicitly designed before runtime implementation. Current one-school `RequestContext` is not enough by itself.
11. Parent responses must not leak unrelated guardian data, medical records, internal notes, internal documents, school IDs, organization IDs, or raw storage identifiers unless explicitly approved.
12. Use `RequestContext`, guards, and scoped Prisma queries. Avoid `platformBypass`.
13. Controllers must not contain business logic or direct Prisma calls. Parent App modules should use services/use-cases/adapters and presenters.

Recommended multi-school strategy for Sprint 9B:

- For child-scoped routes, validate parent ownership first and derive the scoped school from the child's active enrollment.
- For multi-child list routes, collect owned child links in a narrowly bounded parent resolver and then run school-scoped reads per child school context or through an approved scoped repository pattern.
- If the current membership-based resolver cannot represent parent cross-school ownership safely, add a Parent App specific scope resolver instead of weakening dashboard scope rules.
- Do not expose `schoolId` as an app contract field unless the frontend has an approved school context selector.

## Permissions And Role Readiness

Seeded parent role coverage is currently narrow:

- `attendance.sessions.view`
- `grades.assessments.view`
- `reinforcement.tasks.view`
- `students.records.view`

Observations:

- Parent App routes should rely primarily on parent actor type plus child ownership, not broad dashboard permissions.
- Parent behavior reads need a route policy decision because parent role does not currently include behavior permissions.
- Parent communication, announcements, notifications, and file downloads need explicit route policy decisions.
- File access must be authorized through the parent-owned resource, not merely by possession of a file ID.
- Parent announcement and notification reads must prove the parent user, guardian, or linked child is an intended recipient.
- If permissions are added later, they should be app-specific or route-specific enough to avoid granting dashboard-wide capabilities.

## Teacher App And Student App Deferred Scope Carry-Forward

The following deferred Teacher App and Student App decisions remain postponed until after Phase 5 or an explicit approval:

- Teacher/Student Schedule APIs.
- Timetable, period, schedule occurrence, and durable `scheduleId`.
- Full Homework Core.
- XP bonus grants.
- Task stage submit if not approved.
- Contact discovery and new conversation creation.
- Message attachments and audio routes.
- Profile/settings mutations.
- Support, rating, legal, privacy, preferences, and CMS-backed app settings.
- Student Notification Center and Parent Notification Center.
- Pickup and Smart Pickup.
- Advanced rewards, redemptions, and mission mutations.

Parent App work must not backdoor these areas. If a handoff contract asks for one of these capabilities, the Parent App implementation should defer it, return an approved unavailable state, or wait for the relevant core/product decision.

## Recommended Parent App Sprint Breakdown

### Sprint 9B: Parent App Ownership Foundation And Scaffold

- Approve multi-school parent context strategy.
- Add Parent App module scaffold, access service, parent guard/policy, and safe 404 behavior.
- Resolve `UserType.PARENT` -> `Guardian.userId` -> `StudentGuardian` -> active `Enrollment`.
- Add security tests for same-school and cross-school child ID guessing.

### Sprint 9C: Parent Home, Children, And Profile Basic

- Implement multi-child home summary without deferred Smart Pickup, notification center, or full homework.
- Implement children list/detail basic.
- Implement parent profile read.

### Sprint 9D: Parent Grades, Behavior, Progress, And Reports

- Implement child grades summary/subjects.
- Implement child behavior summary/records.
- Implement child progress.
- Implement basic derived performance reports.

### Sprint 9E: Parent Tasks, Messages, And Announcements

- Implement parent tasks read-only views over existing child assignments.
- Implement existing participant conversations, text send, and mark-read if approved.
- Implement parent-safe announcement reads and read receipts.

### Sprint 9F: Applicant Portal Decision Sprint

- Implement only if secure applicant identity ownership is approved.
- Otherwise document applicant portal and add-child as deferred.

### Sprint 9G: Parent App Closeout

- Final route contract pass, security pass, e2e closeout, and documentation update.

### Future Core Decision Sprint

- Schedule/Timetable.
- Full Homework Core.
- Smart Pickup.
- Notification Center.
- Add Child and applicant identity.
- Onboarding/OTP/invitation.
- Message discovery/attachments/audio.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Parent-to-guardian identity ambiguity because existing guardians may have `userId: null` | Require approved linking/onboarding/backfill before Parent App access is enabled for those guardians |
| Multi-child leakage | Validate ownership per child route and design list routes as explicitly multi-child |
| Multi-school context leakage | Resolve school context from owned child enrollment or approved parent resolver; safe 404 for guessed IDs |
| Exposing unrelated children | Never query child data by school alone; always intersect with owned linked student IDs |
| Exposing guardian private data | Return only the authenticated parent's own safe guardian profile fields |
| Exposing medical, internal notes, or documents | Exclude by default until explicit product/legal approval |
| Fabricating schedule, homework, or pickup data | Defer missing cores instead of synthesizing false truth |
| Treating `BehaviorPointLedger` as XP | Use `XpLedger` for XP and behavior ledger only for behavior points |
| Exposing raw file keys | Return signed URLs only through resource-authorized download flows |
| Announcement audience leaks | Implement explicit parent audience resolver and test guardian/user/child hierarchy cases |
| Notification recipient leaks | Defer notification center until parent recipient policy is approved |
| Message contact discovery overreach | Limit messages to existing participant conversations |
| Applicant portal identity confusion | Do not expose admissions records until applicant ownership is modeled |
| Add-child abuse | Require secure claim code, invite, or admin approval model before runtime |
| Reintroducing Teacher/Student deferred scope | Carry forward deferred scope and block Parent App shortcuts |

## Recommended Immediate Next Runtime Task

Sprint 9B should start with the Parent App ownership/access foundation:

Implement and test a parent access layer that authenticates `UserType.PARENT`, resolves `Guardian.userId = actor.id`, resolves linked students through `StudentGuardian`, resolves active enrollments, validates child-scoped ownership, returns safe 404 for same-school and cross-school guessed children, and documents the approved multi-school scope strategy before adding feature APIs.

No Parent App feature route should be implemented before this foundation is green.
