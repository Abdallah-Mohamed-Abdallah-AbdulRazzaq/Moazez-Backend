# Sprint 23H — Homework Grades Assessments Final Closeout Audit

## Status
- Result: PASS
- Recommendation: CLOSED_FOR_V1
- Baseline: `25827c5 test: close homework grades assessments security gaps`
- Audit type: docs-only final closeout audit
- Runtime changes: none
- Test changes: none
- Schema changes: none
- Migration changes: none
- Package changes: none
- Generated/deployment/project-structure changes: none

## Executive Summary

Homework / Grades / Assessments is ready to close for accepted V1 scope.

Sprint 23A identified the real gaps without treating ADR route names as backend mandates. Sprint 23B added the missing School Dashboard Grades bootstrap and overview read models. Sprint 23C enriched Student and Parent app grade summaries without changing routes. Sprint 23D decided that Teacher App direct score-only grade entry is not required in V1, so Sprint 23E was skipped. Sprint 23F completed the security, tenancy, ownership, closed-term, locked-assessment, and no-leak closeout with tests/docs only and found no runtime bug.

No blocker remains for accepted V1. Further work should happen only for optional integrations or new product-approved scope.

## Scope Reviewed

This final audit reviewed the accepted evidence and current backend shape for:

- School Dashboard Grades / Assessments.
- School Dashboard Homework core.
- Teacher App Homework.
- Teacher App Classroom Grades.
- Teacher App question-based submission review and sync paths.
- Student App Homework and Grades.
- Parent App Homework and Grades.
- Sprint 23B Grades Dashboard bootstrap and overview endpoints.
- Sprint 23C Student/Parent grades summary enrichment.
- Sprint 23F security closeout coverage.

Governance references reviewed include project architecture, V1 scope, security model, API contract rules, testing strategy, module boundaries, glossary, user types, error catalog, observability, and Prisma conventions. Sprint evidence reviewed includes Sprint 23A, 23D, 23F, Sprint 23B/23C commit history, the Sprint 22L academics closeout, and earlier homework audits.

## Sprint 23 Sequence Summary

| Sprint | Result | Closeout impact |
| --- | --- | --- |
| Sprint 23A - Reality Audit | CONDITIONAL PASS | Confirmed most backend capabilities were implemented; identified true gaps only: dashboard bootstrap/overview, Student/Parent summary enrichment validation, Teacher App grade-write decision, and final security sweep. |
| Sprint 23B - Grades Dashboard Bootstrap / Overview | PASS | Added `GET /api/v1/grades/bootstrap` and `GET /api/v1/grades/overview` as non-breaking read models. |
| Sprint 23C - Student/Parent Grades Summary Enrichment | PASS | Enriched existing Student and Parent grades summary routes with safe app-facing summary data; no route changes. |
| Sprint 23D - Teacher App Grades Write Decision | PASS | Recommendation: `NO_23E_NEEDED`; direct score-only GradeItem writing remains School Dashboard-only for V1. |
| Sprint 23E - Teacher App Grade Writes | SKIPPED | Skipped by accepted Sprint 23D decision. |
| Sprint 23F - Security Closeout | PASS | Added/extended security evidence; found no runtime bug; confirmed 23H could proceed. |
| Sprint 23G - Optional integrations | DEFERRED | Notifications, XP, rewards, exports, and advanced analytics remain optional future scope. |

## Final V1 Capability Matrix

### School Dashboard Grades / Assessments

| Capability | Final classification | Evidence / decision |
| --- | --- | --- |
| Assessment CRUD | COMPLETE_WITH_SECURITY_CLOSEOUT | Implemented under Dashboard Grades with permission-protected assessment routes. |
| Score-only assessment support | COMPLETE_WITH_SECURITY_CLOSEOUT | Supported through GradeAssessment and GradeItem workflows. |
| Question-based assessment support | COMPLETE_WITH_SECURITY_CLOSEOUT | Supported through question-based assessment creation, questions, options, submissions, answer review, finalization, and sync. |
| Questions/options | COMPLETE_WITH_SECURITY_CLOSEOUT | Dashboard routes and use cases exist; Sprint 23F covered locked/closed and no-leak boundaries. |
| Publish/approve/lock workflow | COMPLETE_WITH_SECURITY_CLOSEOUT | Implemented with dedicated workflow routes and permissions. |
| GradeItem single entry | COMPLETE_WITH_SECURITY_CLOSEOUT | Dashboard-only GradeItem write route remains the V1 direct grade entry surface. |
| GradeItem bulk entry | COMPLETE_WITH_SECURITY_CLOSEOUT | Dashboard-only bulk item entry remains the V1 direct bulk entry surface. |
| Gradebook | COMPLETE_WITH_SECURITY_CLOSEOUT | Implemented and protected by dashboard gradebook permissions. |
| Analytics | COMPLETE_WITH_SECURITY_CLOSEOUT | Existing summary analytics plus Sprint 23B overview composition are accepted. |
| Distribution | COMPLETE_WITH_SECURITY_CLOSEOUT | Existing distribution analytics route is accepted. |
| Rules/effective rules | COMPLETE_WITH_SECURITY_CLOSEOUT | Rules read/manage and effective rule lookup are implemented. |
| Student snapshots | COMPLETE_WITH_SECURITY_CLOSEOUT | Dashboard student snapshot read model is implemented. |
| Submissions list/detail | COMPLETE_WITH_SECURITY_CLOSEOUT | Implemented for question-based assessment workflows. |
| Answer review | COMPLETE_WITH_SECURITY_CLOSEOUT | Implemented with actor-appropriate review exposure. |
| Submission finalization | COMPLETE_WITH_SECURITY_CLOSEOUT | Implemented for reviewed question-based submissions. |
| GradeItem sync | COMPLETE_WITH_SECURITY_CLOSEOUT | Implemented for reviewed submissions with closed/locked protections. |
| Bootstrap filters from Sprint 23B | COMPLETE_WITH_SECURITY_CLOSEOUT | `GET /api/v1/grades/bootstrap` exists and is permission-scoped. |
| Overview aggregation from Sprint 23B | COMPLETE_WITH_SECURITY_CLOSEOUT | `GET /api/v1/grades/overview` exists and is permission-scoped. |

### Homework Core / School Dashboard Homework

| Capability | Final classification | Evidence / decision |
| --- | --- | --- |
| Homework assignment CRUD/lifecycle | COMPLETE_WITH_SECURITY_CLOSEOUT | Assignment create/read/update, publish, close, and cancel are implemented. |
| Targets | COMPLETE_WITH_SECURITY_CLOSEOUT | Assignment targeting and target resolution are implemented. |
| Questions/options | COMPLETE_WITH_SECURITY_CLOSEOUT | Homework question and option management exists, including answer visibility controls by actor. |
| Attachments | COMPLETE_WITH_SECURITY_CLOSEOUT | Assignment attachment routes and safe file metadata presentation are implemented. |
| Student submissions | COMPLETE_WITH_SECURITY_CLOSEOUT | Student-facing submission creation/draft/submit flows are implemented. |
| Answers | COMPLETE_WITH_SECURITY_CLOSEOUT | Student answer save/list/update flows are implemented with ownership controls. |
| Answer attachments | COMPLETE_WITH_SECURITY_CLOSEOUT | Submission attachment flows are implemented with storage metadata protection. |
| Submission review | COMPLETE_WITH_SECURITY_CLOSEOUT | Teacher/dashboard review paths are implemented. |
| Grade sync/link/sync-one | COMPLETE_WITH_SECURITY_CLOSEOUT | Homework-to-Grades link, bulk sync, and single-submission sync are implemented with GradeAssessment protections. |
| Security/tenancy closeout | COMPLETE_WITH_SECURITY_CLOSEOUT | Sprint 23F covered cross-school, ownership, closed-term, locked-assessment, safe-error, and no-leak evidence. |

### Teacher App Homework and Classroom Grades

| Capability | Final classification | Evidence / decision |
| --- | --- | --- |
| Homework creation/lifecycle for owned allocations | COMPLETE_WITH_SECURITY_CLOSEOUT | Teacher App homework routes support owned class assignment workflows. |
| Homework questions/options/attachments | COMPLETE_WITH_SECURITY_CLOSEOUT | Teacher App exposes homework composition paths for owned allocations. |
| Homework submission review | COMPLETE_WITH_SECURITY_CLOSEOUT | Teacher App can review owned homework submissions. |
| Homework grade sync | COMPLETE_WITH_SECURITY_CLOSEOUT | Teacher App can sync homework grades through the approved homework/grade bridge. |
| Classroom grade assessments list/detail | COMPLETE_WITH_SECURITY_CLOSEOUT | Teacher App has read models for owned classroom grade assessments. |
| Classroom gradebook | COMPLETE_WITH_SECURITY_CLOSEOUT | Teacher App has owned-allocation classroom gradebook reads. |
| Question-based submission review/sync | COMPLETE_WITH_SECURITY_CLOSEOUT | Teacher App exposes review/finalize/sync for question-based submissions where implemented. |
| Direct score-only GradeItem entry | DASHBOARD_ONLY_BY_DECISION | Sprint 23D recommended `NO_23E_NEEDED`; Sprint 23F asserted direct Teacher App GradeItem write routes remain absent. |
| Full assessment authoring | SKIPPED_BY_DECISION | Not part of accepted V1 Teacher App scope; Dashboard Grades remains the assessment administration surface. |

### Student App Homework and Grades

| Capability | Final classification | Evidence / decision |
| --- | --- | --- |
| Homework list/detail | COMPLETE_WITH_SECURITY_CLOSEOUT | Student can read assigned visible homework only. |
| Homework submission | COMPLETE_WITH_SECURITY_CLOSEOUT | Student can draft/submit owned homework submissions according to lifecycle rules. |
| Homework answer/attachment mutation | COMPLETE_WITH_SECURITY_CLOSEOUT | Student mutations are scoped to the current student and own submission. |
| Grades list | COMPLETE_WITH_SECURITY_CLOSEOUT | Student Grades list route is implemented and current-student scoped. |
| Grades summary | COMPLETE_WITH_SECURITY_CLOSEOUT | Sprint 23C enriched summary data on the existing route. |
| Grades assessment detail | COMPLETE_WITH_SECURITY_CLOSEOUT | Student assessment grade detail is implemented and no-leak checked. |
| Sprint 23C enrichment | COMPLETE_WITH_SECURITY_CLOSEOUT | Academic year/term context, summary totals, subject breakdowns, rating, and empty-state data are app-facing and safe. |
| No-leak/security closeout | COMPLETE_WITH_SECURITY_CLOSEOUT | Sprint 23F added HTTP security coverage for enriched summaries and detail no-leak behavior. |

### Parent App Homework and Grades

| Capability | Final classification | Evidence / decision |
| --- | --- | --- |
| Linked-child homework list/detail | COMPLETE_WITH_SECURITY_CLOSEOUT | Parent can read linked-child homework through ownership-checked routes. |
| Linked-child homework submission summary/read-only view | APP_READ_ONLY_BY_DECISION | Parent homework visibility remains read-only for V1. |
| Parent submit | SKIPPED_BY_DECISION | Parent submit remains absent and unapproved for V1. |
| Linked-child grades list | COMPLETE_WITH_SECURITY_CLOSEOUT | Parent can read linked-child grades only. |
| Linked-child grades summary | COMPLETE_WITH_SECURITY_CLOSEOUT | Sprint 23C enriched summary data on the existing parent route. |
| Linked-child grades assessment detail | COMPLETE_WITH_SECURITY_CLOSEOUT | Parent assessment detail is linked-child scoped and no-leak checked. |
| Sprint 23C enrichment | COMPLETE_WITH_SECURITY_CLOSEOUT | Parent summary includes safe summary/breakdown, rating, and motivational message behavior. |
| No-leak/security closeout | COMPLETE_WITH_SECURITY_CLOSEOUT | Sprint 23F added HTTP security coverage for enriched parent grade summaries and no-leak behavior. |

### Optional Future Integrations

| Capability | Final classification | Evidence / decision |
| --- | --- | --- |
| Notifications | DEFERRED_OPTIONAL_FUTURE_SCOPE | Not required for accepted V1 closeout. |
| XP | DEFERRED_OPTIONAL_FUTURE_SCOPE | Not required for accepted V1 closeout. |
| Rewards | DEFERRED_OPTIONAL_FUTURE_SCOPE | Not required for accepted V1 closeout. |
| Exports | DEFERRED_OPTIONAL_FUTURE_SCOPE | Not required for accepted V1 closeout. |
| Advanced analytics builder | DEFERRED_OPTIONAL_FUTURE_SCOPE | Explicitly outside accepted V1 scope. |

## Final Route and Contract State

The final route state is accepted as backend-native and stable.

- School Dashboard Grades keeps direct assessment, question, submission, item, gradebook, analytics, rules, snapshot, bootstrap, and overview routes under `/api/v1/grades/...`.
- Sprint 23B added `GET /api/v1/grades/bootstrap` and `GET /api/v1/grades/overview`; no existing Grades route was renamed.
- Homework core remains under `/api/v1/homework/...` for dashboard/homework administration and grade sync.
- Teacher App Homework remains under `/api/v1/teacher/homeworks/...` and is scoped to teacher-owned allocations.
- Teacher App Classroom Grades remains under `/api/v1/teacher/classroom/:classId/grades/...` and related classroom assignment/submission review routes; it does not expose direct score-only GradeItem entry.
- Student App Homework/Grades remain under `/api/v1/student/homeworks` and `/api/v1/student/grades`.
- Parent App Homework/Grades remain under `/api/v1/parent/children/:studentId/homeworks` and `/api/v1/parent/children/:studentId/grades`.

No route renames are required. No ADR-only aliases are required. ADRs remain product/frontend intent references, not literal backend route mandates. Existing backend-native route names and response shapes are accepted when the capability exists and contracts are stable. Sprint 23C Student/Parent grade summary enrichments are non-breaking app-facing additions.

## Final Security and Tenancy State

Sprint 23F closed the feature family security sweep for accepted V1 scope.

Security evidence covers:

- Cross-school isolation for Grades, Homework, Teacher App, Student App, and Parent App surfaces.
- Same-school unowned actor denial.
- Dashboard permission boundaries for Grades and Homework administration.
- Teacher allocation boundaries for Teacher App homework and classroom grade reads/review/sync.
- Student current-user boundaries for homework and grades.
- Parent linked-child boundaries for homework and grades.
- Locked assessment protections.
- Closed/inactive term protections.
- Draft/unpublished visibility boundaries.
- Parent read-only homework behavior and absence of parent submit mutation routes.
- Teacher App direct score-only GradeItem write absence.
- Answer-key, correct-answer, tenant/internal ID, storage metadata, and soft-delete field no-leak checks.
- Safe error behavior for forbidden, unowned, and cross-school resources.

Sprint 23F was tests/docs only and found no runtime bug. No runtime hardening was required during the closeout sweep.

## Accepted Product / Backend Decisions

- Sprint 23E is skipped because Sprint 23D concluded `NO_23E_NEEDED`.
- Sprint 23G is deferred because optional integrations are not required for accepted V1 closeout.
- Direct GradeItem write remains School Dashboard-only for V1.
- Teacher App grade write behavior remains homework/review/sync based, not direct score-only entry.
- Teacher App full assessment authoring is not accepted V1 scope.
- Parent App homework remains read-only.
- Parent submit remains skipped unless explicitly approved in future scope.
- Notifications, XP, rewards, exports, and advanced analytics are future optional integrations.
- Backend-native route naming is accepted; no ADR-only aliases should be added for this feature family.

## Deferred Optional Future Scope

The following items are not blockers and should be opened only through explicit future product scope:

- Teacher App direct score-only grade entry.
- Teacher App full assessment authoring.
- Parent homework submit.
- Homework/Grades notifications.
- Homework/Grades XP and reward side effects.
- Grade exports.
- Advanced analytics builder.
- Any new mobile grade write surface.

## Remaining Risks

No blocking V1 risks remain.

Future risk appears only if product reopens deferred write surfaces or optional integrations. Any such scope should start with a new decision audit and focused security plan covering teacher ownership, parent authority, notifications/visibility side effects, locked/closed protections, audit logging, and no-leak behavior.

## Verification Results

Final Sprint 23H verification completed successfully on 2026-06-17.

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS - only `?? docs/sprint-23h-homework-grades-assessments-final-closeout-audit.md` |
| `git diff --name-only` | PASS - no tracked diff output because the only changed file is untracked |
| `git diff --stat` | PASS - no tracked diff output because the only changed file is untracked |
| `git diff --check` | PASS |
| `npx prisma validate` | PASS - schema is valid |
| `npx prisma generate` | PASS - Prisma Client generated to `node_modules/@prisma/client` |
| `npx prisma migrate status` | PASS - 39 migrations found; database schema is up to date |
| `npm run build` | PASS |
| `npm run test -- grades --runInBand` | PASS - 32 suites, 247 tests |
| `npm run test -- homework --runInBand` | PASS - 15 suites, 139 tests |
| `npm run test -- teacher-app --runInBand` | PASS - 42 suites, 231 tests |
| `npm run test -- student-app --runInBand` | PASS - 42 suites, 173 tests |
| `npm run test -- parent-app --runInBand` | PASS - 39 suites, 148 tests |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.grades.spec.ts` | PASS - 1 suite, 111 tests |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.homework.spec.ts` | PASS - 1 suite, 24 tests |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts test/security/tenancy.student-app.spec.ts test/security/tenancy.parent-app.spec.ts` | PASS - 3 suites, 82 tests |
| Full homework security family | PASS - 5 suites, 46 tests |

## Final Recommendation

Recommendation: CLOSED_FOR_V1

Homework / Grades / Assessments is complete for accepted V1 scope with security closeout evidence. No additional runtime sprint is required before formal V1 closure.

## Final Decision

Homework / Grades / Assessments V1 feature family is CLOSED.

Proceed beyond Sprint 23H only for optional future integrations or new product-approved scope.
