# Sprint 26I Parent Learning Flow Final Closeout

## 1. Executive Decision

| Item | Decision |
| --- | --- |
| Sprint 26I decision | PASS |
| Runtime summary | Minimal runtime hardening only: Parent profile guardian summaries no longer select or expose `guardianId`; final closeout/security tests now assert broader no-leak and forbidden-learning-mutation coverage. |
| Parent Learning Flow status after this sprint | PARENT_LEARNING_FLOW_BACKEND_READY |
| Recommended next sprint | Sprint 26J — Learning Flow Frontend Contract Handoff |

## 2. Files Changed

### Parent App Runtime

- `src/modules/parent-app/profile/dto/parent-profile.dto.ts`
- `src/modules/parent-app/profile/infrastructure/parent-profile-read.adapter.ts`
- `src/modules/parent-app/profile/presenters/parent-profile.presenter.ts`

### Parent App Tests

- `src/modules/parent-app/profile/tests/get-parent-profile.use-case.spec.ts`
- `src/modules/parent-app/profile/tests/parent-profile-read.adapter.spec.ts`
- `src/modules/parent-app/profile/tests/parent-profile.presenter.spec.ts`

### Security/E2E Tests

- `test/security/tenancy.parent-app.spec.ts`
- `test/e2e/parent-app-final-closeout.e2e-spec.ts`

### Docs

- `docs/sprint-26i-parent-learning-flow-final-closeout.md`

### Core Modules Touched

- None.

## 3. Final Parent Learning Route Inventory

### Home / Profile / Children

- `GET /api/v1/parent/home`
- `GET /api/v1/parent/profile`
- `GET /api/v1/parent/children`
- `GET /api/v1/parent/children/:studentId`

### Schedule / Calendar / Lessons

- `GET /api/v1/parent/children/:studentId/schedule/today`
- `GET /api/v1/parent/children/:studentId/schedule/weekly`
- `GET /api/v1/parent/children/:studentId/calendar/events`
- `GET /api/v1/parent/children/:studentId/calendar/events/:eventId`
- `GET /api/v1/parent/children/:studentId/lessons/today`
- `GET /api/v1/parent/children/:studentId/lessons/week`
- `GET /api/v1/parent/children/:studentId/lessons/:lessonPlanItemId`

### Grades / Homeworks

- `GET /api/v1/parent/children/:studentId/grades`
- `GET /api/v1/parent/children/:studentId/grades/summary`
- `GET /api/v1/parent/children/:studentId/grades/assessments/:assessmentId`
- `GET /api/v1/parent/children/:studentId/homeworks`
- `GET /api/v1/parent/children/:studentId/homeworks/:homeworkId`

### Tasks / Reinforcement

- `GET /api/v1/parent/children/:studentId/tasks`
- `GET /api/v1/parent/children/:studentId/tasks/summary`
- `GET /api/v1/parent/children/:studentId/tasks/:taskId`
- `GET /api/v1/parent/children/:studentId/tasks/:taskId/submissions`
- `GET /api/v1/parent/children/:studentId/tasks/:taskId/submissions/:submissionId`

### Progress / Hero / XP / Rewards

- `GET /api/v1/parent/children/:studentId/progress`
- `GET /api/v1/parent/children/:studentId/progress/academic`
- `GET /api/v1/parent/children/:studentId/progress/behavior`
- `GET /api/v1/parent/children/:studentId/progress/xp`
- `GET /api/v1/parent/children/:studentId/hero`
- `GET /api/v1/parent/children/:studentId/hero/progress`
- `GET /api/v1/parent/children/:studentId/hero/badges`
- `GET /api/v1/parent/children/:studentId/hero/missions`
- `GET /api/v1/parent/children/:studentId/hero/missions/:missionId`
- `GET /api/v1/parent/children/:studentId/rewards`
- `GET /api/v1/parent/children/:studentId/rewards/:rewardId`
- `GET /api/v1/parent/children/:studentId/rewards/redemptions`
- `GET /api/v1/parent/children/:studentId/rewards/redemptions/:redemptionId`

### Behavior / Discipline / Reports

- `GET /api/v1/parent/children/:studentId/behavior`
- `GET /api/v1/parent/children/:studentId/behavior/summary`
- `GET /api/v1/parent/children/:studentId/behavior/:recordId`
- `GET /api/v1/parent/children/:studentId/discipline`
- `GET /api/v1/parent/children/:studentId/discipline/summary`
- `GET /api/v1/parent/children/:studentId/reports`
- `GET /api/v1/parent/children/:studentId/reports/summary`

### Messages / Announcements

- `GET /api/v1/parent/messages/conversations`
- `GET /api/v1/parent/messages/conversations/:conversationId`
- `GET /api/v1/parent/messages/conversations/:conversationId/messages`
- `POST /api/v1/parent/messages/conversations/:conversationId/messages`
- `POST /api/v1/parent/messages/conversations/:conversationId/read`
- `GET /api/v1/parent/announcements`
- `GET /api/v1/parent/announcements/:announcementId`
- `GET /api/v1/parent/announcements/:announcementId/attachments`
- `POST /api/v1/parent/announcements/:announcementId/read`

### Forbidden / Deferred Routes Not Exposed

- No parent task create, submit, stage submit, review, approve, reject, cancel, or complete route.
- No parent homework save/submit route.
- No parent grade, exam, attendance, behavior, discipline, or report mutation route.
- No parent hero start, complete, or objective-complete route.
- No parent reward redeem route.
- No parent XP grant route.
- No parent child add/link route.
- No parent avatar upload route.
- No parent dashboard/global-dashboard route.
- No Student, Teacher, Dashboard/Admin, wallet, finance, marketplace, payment, or fulfillment route added.

## 4. Contract Decisions Verified

| Decision | Result | Evidence |
| --- | --- | --- |
| Parent App is child-scoped | PASS | All child learning routes use `:studentId` and Parent App access validation. |
| Parent can read only linked child | PASS | `tenancy.parent-app` and parent final closeout e2e cover linked-child access only. |
| Same-school unlinked child is hidden | PASS | Security/e2e tests assert 404 for unlinked child learning routes. |
| Cross-school child is hidden | PASS | Security/e2e tests assert 404 for cross-school child learning routes. |
| Non-parent actors are blocked | PASS | Admin, teacher, and student actors receive 403 on Parent routes. |
| Parent actors cannot use Student/Teacher learning routes | PASS | Parent actors are rejected from Student task, hero, and reward mutation routes; prior Teacher route boundaries remain covered. |
| Parent task/reinforcement reads are safe | PASS | Task list/detail/submission presenters exclude assignment, actor, ledger, reward-redemption, and storage internals. |
| Parent hero/XP/reward reads are safe | PASS | Parent Hero/Rewards/XP tests verify linked-child scope, XpLedger-backed XP, and no mutations. |
| Parent grades/homeworks/lessons/progress reads are safe | PASS | Parent module tests and final e2e no-leak checks pass. |
| Behavior/discipline/report separation remains intact | PASS | Behavior remains behavior records/points; discipline remains derived read-only; XP is not behavior points. |
| Parent App unauthorized mutations are absent | PASS | Route inventory and HTTP 404 checks cover task, homework, grade/exam, attendance, behavior, discipline, report, hero, reward, and XP mutations. |
| No internal fields leaked | PASS | `guardianId` was removed from Parent profile responses; no-leak helpers assert forbidden fields. |
| No schema/migration unless explicitly justified | PASS | No schema or migration changes. |
| No wallet/finance/marketplace/payment behavior | PASS | No such routes, fields, models, or side effects were added. |

## 5. No-Leak Final Review

| Field | Status |
| --- | --- |
| `schoolId` | Absent from app-facing Parent learning responses. |
| `organizationId` | Absent. |
| `membershipId` | Absent. |
| `roleId` | Absent. |
| `deletedAt` | Absent. |
| `enrollmentId` | Present only where intentionally app-safe in existing child/profile/home/progress wrapper contracts; not exposed from task/reinforcement internals. |
| `guardianId` | Removed from Parent profile guardian summaries and absent from app-facing responses. |
| `parentId` | Absent. |
| `studentGuardianId` | Absent. |
| `assignmentId` | Absent from Parent task/reinforcement responses. |
| `submittedById` / `reviewedById` | Absent. |
| `approvedById` / `rejectedById` / `awardedById` / `requestedById` / `fulfilledById` / `cancelledById` | Absent. |
| `createdById` / `updatedById` | Absent. |
| `passwordHash` | Absent. |
| `answerKey`, `correctAnswer`, `correctAnswers`, `isCorrect` | Absent. |
| XP ledger internals | Absent. |
| RewardRedemption internals | Absent. |
| BehaviorPointLedger-derived XP | Absent; BehaviorPointLedger is not XP. |
| `eligibilitySnapshot` | Absent. |
| Internal `metadata` | Absent from reinforcement/reward/task Parent response surfaces. |
| `objectKey`, `bucket`, `storageKey`, raw file metadata, `signedUrl`, unsafe storage URL | Absent. |
| Wallet/finance/marketplace/payment fields | Absent. |

Intentionally app-safe ids that remain:

- `studentId`
- `taskId`
- `homeworkId`
- `lessonPlanItemId`
- `assessmentId`
- `submissionId`
- `stageId`
- `rewardId`
- `redemptionId`
- `missionId`
- `badgeId`
- `conversationId`
- `messageId`
- `announcementId`
- `fileId` where exposed as safe file metadata only

## 6. Mutation Boundary Final Review

Allowed existing Parent communication mutations:

- `POST /api/v1/parent/messages/conversations/:conversationId/messages`
- `POST /api/v1/parent/messages/conversations/:conversationId/read`
- `POST /api/v1/parent/announcements/:announcementId/read`

Forbidden learning mutations not exposed:

- Parent child add/link, profile avatar upload, task submit/review/approve/reject/cancel/complete, homework submit, exam answer/submit, grade mutation, attendance mutation, behavior mutation, discipline mutation, hero start/complete/objective-complete, reward redeem, XP grant, report generation, and announcement create/update/publish.

Student/Teacher/Dashboard routes added:

- None.

Write side effects in Parent learning reads:

- None. Read-only learning routes do not write to `XpLedger`, `BehaviorPointLedger`, `RewardRedemption`, Hero Journey progress/badges/events, Reinforcement task/submission/review tables, HomeworkSubmission, or File.

## 7. Parent-Child Ownership Decision

- Relationship model: existing Parent App access service resolves the authenticated parent user, active current-school guardian identities, active linked students, and active enrollments.
- Required active statuses: active parent user, active current-school guardian relationship, active child/student, and active enrollment where route data requires enrollment context.
- Same-school unlinked behavior: hidden with safe not found semantics.
- Cross-school behavior: hidden with safe not found semantics.
- Active school context behavior: all reads are scoped through current membership/school context and scoped Prisma/read adapters.
- Student/enrollment context behavior: route `:studentId` is the child selector; internal enrollment context is resolved server-side and not trusted from request body.

## 8. Deferred Items

- Parent proof download until Parent-authorized file download contract is approved.
- Parent task mutations if ever approved.
- Parent reward redemption mutation if ever approved.
- Parent hero mutation if ever approved.
- Dashboard final handoff.
- Full frontend contract handoff.
- Teacher manual XP bonus route if still deferred.
- Reward fulfillment/admin workflow if not part of Parent App.

## 9. Tests Run

| Command | Result |
| --- | --- |
| `npx prisma validate` | PASS - schema valid. |
| `npx prisma generate` | PASS - Prisma Client generated. |
| `npm run build` | PASS - Nest build completed. |
| `npm test -- --runInBand parent-profile` | PASS - 3 suites, 10 tests. |
| `npm test -- --runInBand parent-app` | PASS - 46 suites, 171 tests. |
| `npm test -- --runInBand parent-tasks` | PASS - 3 suites, 7 tests. |
| `npm test -- --runInBand parent-hero` | PASS - 3 suites, 10 tests. |
| `npm test -- --runInBand parent-rewards` | PASS - 3 suites, 9 tests. |
| `npm test -- --runInBand parent-progress` | PASS - 3 suites, 9 tests. |
| `npm test -- --runInBand parent-homeworks` | PASS - 3 suites, 12 tests. |
| `npm test -- --runInBand parent-grades` | PASS - 3 suites, 11 tests. |
| `npm test -- --runInBand parent-behavior` | PASS - 3 suites, 11 tests. |
| `npm test -- --runInBand parent-discipline` | PASS - 1 suite, 3 tests. |
| `npm test -- --runInBand parent-reports` | PASS - 3 suites, 8 tests. |
| `npm test -- --runInBand parent-messages` | PASS - 3 suites, 8 tests. |
| `npm test -- --runInBand parent-announcements` | PASS - 3 suites, 8 tests. |
| `npm test -- --runInBand student-app` | PASS - 48 suites, 218 tests. |
| `npm test -- --runInBand student-tasks` | PASS - 3 suites, 14 tests. |
| `npm test -- --runInBand student-rewards` | PASS - 3 suites, 11 tests. |
| `npm test -- --runInBand teacher-app` | PASS - 43 suites, 238 tests. |
| `npm test -- --runInBand reinforcement` | PASS - 35 suites, 270 tests. |
| `npm test -- --runInBand hero-journey` | PASS - 12 suites, 81 tests. |
| `npm test -- --runInBand rewards` | PASS - 18 suites, 140 tests. |
| `npm test -- --runInBand xp` | PASS - 6 suites, 37 tests. |
| `npm test -- --runInBand homework` | PASS - 15 suites, 139 tests. |
| `npm test -- --runInBand grades` | PASS - 32 suites, 248 tests. |
| `npm test -- --runInBand behavior` | PASS - 18 suites, 97 tests. |
| `npm test -- --runInBand discipline` | PASS - 4 suites, 11 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` | PASS - 1 suite, 21 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` | PASS - 1 suite, 23 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-final-closeout.e2e-spec.ts` | PASS - 1 suite, 18 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts` | PASS - 1 suite, 17 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/reinforcement-foundation.e2e-spec.ts` | PASS - 1 suite, 1 test. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/hero-journey-foundation.e2e-spec.ts` | PASS - 1 suite, 1 test. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-summary-foundation.e2e-spec.ts` | PASS - closest available suite because `dashboard-foundation.e2e-spec.ts` is absent; 1 suite, 2 tests. |

Notes:

- `test/e2e/learning-flow-final-closeout.e2e-spec.ts` is absent. Closest final-closeout coverage run: Parent and Student final closeout e2e suites.
- `test/e2e/dashboard-foundation.e2e-spec.ts` is absent. Closest suite run: `test/e2e/dashboard-summary-foundation.e2e-spec.ts`.

## 10. Final Verdict

Sprint 26I: PASS if criteria are met.
Next: Sprint 26J — Learning Flow Frontend Contract Handoff.
