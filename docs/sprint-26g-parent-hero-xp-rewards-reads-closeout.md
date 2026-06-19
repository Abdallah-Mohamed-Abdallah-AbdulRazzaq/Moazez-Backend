# Sprint 26G - Parent Hero / XP / Rewards Reads Closeout

## 1. Executive Decision

- Sprint 26G decision: PASS
- Runtime summary: Added read-only Parent App Hero Journey and Rewards/Redemptions read surfaces for linked children. Existing Parent XP read remains under the established progress route and remains XpLedger-backed.
- Parent Hero/XP/Rewards status after this sprint: PARENT_HERO_XP_REWARDS_READS_READY
- Recommended next sprint: Sprint 26H - Parent Task / Reinforcement Reads

## 2. Files Changed

### Parent Hero

- `src/modules/parent-app/hero/controller/parent-hero.controller.ts`
- `src/modules/parent-app/hero/application/get-parent-child-hero-overview.use-case.ts`
- `src/modules/parent-app/hero/application/get-parent-child-hero-progress.use-case.ts`
- `src/modules/parent-app/hero/application/list-parent-child-hero-missions.use-case.ts`
- `src/modules/parent-app/hero/application/get-parent-child-hero-mission.use-case.ts`
- `src/modules/parent-app/hero/application/list-parent-child-hero-badges.use-case.ts`
- `src/modules/parent-app/hero/dto/parent-hero.dto.ts`
- `src/modules/parent-app/hero/infrastructure/parent-hero-read.adapter.ts`
- `src/modules/parent-app/hero/presenters/parent-hero.presenter.ts`

### Parent XP

- Existing route preserved: `GET /api/v1/parent/children/:studentId/progress/xp`
- No Parent XP runtime changes were needed beyond verification coverage.

### Parent Rewards

- `src/modules/parent-app/rewards/controller/parent-rewards.controller.ts`
- `src/modules/parent-app/rewards/application/list-parent-child-rewards.use-case.ts`
- `src/modules/parent-app/rewards/application/get-parent-child-reward.use-case.ts`
- `src/modules/parent-app/rewards/application/list-parent-child-reward-redemptions.use-case.ts`
- `src/modules/parent-app/rewards/application/get-parent-child-reward-redemption.use-case.ts`
- `src/modules/parent-app/rewards/dto/parent-rewards.dto.ts`
- `src/modules/parent-app/rewards/infrastructure/parent-rewards-read.adapter.ts`
- `src/modules/parent-app/rewards/presenters/parent-rewards.presenter.ts`

### Parent App Module / Controller / Presenter

- `src/modules/parent-app/parent-app.module.ts`

### Shared Read Adapters

- None.

### Reinforcement Core

- None.

### Tests

- `src/modules/parent-app/hero/tests/parent-hero-read.adapter.spec.ts`
- `src/modules/parent-app/hero/tests/parent-hero.presenter.spec.ts`
- `src/modules/parent-app/hero/tests/parent-hero.use-case.spec.ts`
- `src/modules/parent-app/rewards/tests/parent-rewards-read.adapter.spec.ts`
- `src/modules/parent-app/rewards/tests/parent-rewards.presenter.spec.ts`
- `src/modules/parent-app/rewards/tests/parent-rewards.use-case.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`
- `test/e2e/parent-app-final-closeout.e2e-spec.ts`

### Docs

- `docs/sprint-26g-parent-hero-xp-rewards-reads-closeout.md`

## 3. Route Inventory

Final Parent Hero/XP/Rewards read routes:

- `GET /api/v1/parent/children/:studentId/hero`
- `GET /api/v1/parent/children/:studentId/hero/progress`
- `GET /api/v1/parent/children/:studentId/hero/missions`
- `GET /api/v1/parent/children/:studentId/hero/missions/:missionId`
- `GET /api/v1/parent/children/:studentId/hero/badges`
- `GET /api/v1/parent/children/:studentId/progress/xp`
- `GET /api/v1/parent/children/:studentId/rewards`
- `GET /api/v1/parent/children/:studentId/rewards/:rewardId`
- `GET /api/v1/parent/children/:studentId/rewards/redemptions`
- `GET /api/v1/parent/children/:studentId/rewards/redemptions/:redemptionId`

Route drift decision: Parent XP keeps the existing Parent App progress grouping route, `GET /api/v1/parent/children/:studentId/progress/xp`, instead of adding a new alias at `/parent/children/:studentId/xp`.

Routes not added:

- No `POST /parent/.../rewards/:rewardId/redeem`
- No `POST /parent/.../hero/missions/:missionId/start`
- No `POST /parent/.../hero/missions/:missionId/complete`
- No `POST /parent/.../xp/grants/manual`

## 4. Contract Decisions Verified

| Decision | Result | Evidence |
| --- | --- | --- |
| Parent App is read-only. | PASS | New controllers expose only `@Get` routes; route inventory and security tests assert Parent mutation routes are absent. |
| Parent can read only linked child. | PASS | Every use-case calls `ParentAppAccessService.assertParentOwnsStudent(studentId)` before reads. |
| Same-school unlinked child is hidden. | PASS | `test/security/tenancy.parent-app.spec.ts` covers same-school unlinked child 404s for Hero/XP/Rewards routes. |
| Cross-school child is hidden. | PASS | Same security spec covers cross-school child 404s for Hero/XP/Rewards routes. |
| Parent cannot mutate hero. | PASS | No Parent hero mutation routes were added; explicit absent route tests cover start/complete/objective-complete. |
| Parent cannot redeem rewards. | PASS | No Parent reward redemption mutation route was added; route inventory and security tests cover absence. |
| Parent cannot grant XP. | PASS | No Parent XP grant route was added; route inventory and security tests cover absence. |
| XP is XpLedger-backed. | PASS | Parent XP route and Parent Hero/Rewards affordability read from `xpLedger`; tests assert BehaviorPointLedger is not used as XP. |
| Behavior points are not XP. | PASS | Parent Hero/Rewards adapters do not query BehaviorPointLedger; tests assert no BehaviorPointLedger reads/writes for XP. |
| Reward catalog is app-safe. | PASS | Parent Rewards presenter returns display fields and safe file metadata only. |
| Redemptions are child-scoped. | PASS | Parent Rewards adapter filters by linked child `studentId`, `enrollmentId`, academic year, and term. |
| No wallet/finance/marketplace/payment behavior. | PASS | No related routes/models are touched; no-leak tests assert these fields are absent. |
| No internal fields leaked. | PASS | Presenter and security tests check forbidden tenancy, actor, storage, ledger, and metadata fields. |
| No Student/Teacher/Dashboard routes added. | PASS | Only Parent App module/controller/tests were changed. |

## 5. XP / Rewards / Redemptions Read Decision

- XP is calculated from `XpLedger` only.
- `BehaviorPointLedger` is not used for XP totals, affordability, or Hero summaries.
- Parent reward affordability uses the child XpLedger positive earned XP total, matching the Student Rewards affordability read model.
- Parent cannot redeem rewards in V1 for this sprint.
- Redemptions are scoped to the linked child using `studentId`, `enrollmentId`, academic year, and term.
- No XP/reward writes occur from Parent Hero/XP/Rewards reads.

## 6. Parent-Child Ownership Decision

- Existing model used: current parent user -> active current-school `Guardian` -> `StudentGuardian` link -> active child `Enrollment`.
- Required active statuses are enforced by the existing Parent App access adapter and domain assertions.
- Same-school unlinked children return safe not found behavior.
- Cross-school children are hidden under the active school membership context.
- Student/enrollment context is resolved server-side; clients provide only the route child selector.

## 7. Security / No-Leak Review

| Forbidden field | Result |
| --- | --- |
| `schoolId` | Absent from new Parent Hero/Rewards responses. |
| `organizationId` | Absent. |
| `membershipId` | Absent. |
| `roleId` | Absent. |
| `deletedAt` | Absent. |
| `studentId` unless intentionally app-safe | Present only as the intentional app-facing child selector summary. |
| `enrollmentId` | Absent from new Parent Hero/Rewards responses; existing Parent progress XP route preserves its accepted Parent progress child summary. |
| `guardianId` | Absent. |
| `parentId` | Absent. |
| `studentGuardianId` | Absent. |
| `createdById` | Absent. |
| `updatedById` | Absent. |
| `awardedById` | Absent. |
| `requestedById` | Absent. |
| `approvedById` | Absent. |
| `rejectedById` | Absent. |
| `fulfilledById` | Absent. |
| `cancelledById` | Absent. |
| XP ledger internals | Absent. |
| RewardRedemption internals | Absent. |
| `eligibilitySnapshot` | Absent. |
| `metadata` | Absent. |
| BehaviorPointLedger-derived XP | Absent. |
| wallet/finance/marketplace/payment fields | Absent. |
| `objectKey` | Absent. |
| `bucket` | Absent. |
| raw metadata | Absent. |
| `signedUrl` | Absent. |
| unsafe storage URL | Absent. |

## 8. Tests Run

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS - expected modified Parent App module/e2e/security files plus new Parent Hero/Rewards files and closeout doc; Git reported a local user ignore permission warning. |
| `git diff --name-only` | PASS - tracked diff lists `src/modules/parent-app/parent-app.module.ts`, `test/e2e/parent-app-final-closeout.e2e-spec.ts`, and `test/security/tenancy.parent-app.spec.ts`; untracked new files are listed by `git status`. |
| `git diff --stat` | PASS - tracked diff: 3 files changed, 684 insertions, 3 deletions; untracked new files are listed by `git status`. |
| `git diff --check` | PASS - no whitespace errors; Git reported local LF-to-CRLF working-copy warnings only. |
| `npx prisma validate` | PASS - schema valid. |
| `npx prisma generate` | PASS - Prisma Client generated. |
| `npm run build` | PASS. |
| `npm test -- --runInBand parent-app` | PASS - 46 suites, 171 tests. |
| `npm test -- --runInBand parent-hero` | PASS - 3 suites, 10 tests. |
| `npm test -- --runInBand parent-rewards` | PASS - 3 suites, 9 tests. |
| `npm test -- --runInBand student-app` | PASS - 48 suites, 218 tests. |
| `npm test -- --runInBand student-rewards` | PASS - 3 suites, 11 tests. |
| `npm test -- --runInBand hero-journey` | PASS - 12 suites, 81 tests. |
| `npm test -- --runInBand rewards` | PASS - 18 suites, 140 tests. |
| `npm test -- --runInBand xp` | PASS - 6 suites, 37 tests. |
| `npm test -- --runInBand reinforcement` | PASS - 35 suites, 270 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` | PASS - 1 suite, 21 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` | PASS - 1 suite, 23 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-final-closeout.e2e-spec.ts` | PASS - 1 suite, 18 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts` | PASS - 1 suite, 17 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/reinforcement-foundation.e2e-spec.ts` | PASS - 1 suite, 1 test. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/hero-journey-foundation.e2e-spec.ts` | PASS - 1 suite, 1 test. |

## 9. Deferred Items

- Parent task/reinforcement reads.
- Parent task mutations if ever approved.
- Parent reward redemption mutation if ever approved.
- Parent hero mutation if ever approved.
- Dashboard final handoff.
- Full frontend contract handoff.
- Teacher manual XP bonus route if still deferred.
- Reward fulfillment/admin workflow if not part of Parent App.

## 10. Final Verdict

Sprint 26G: PASS if criteria are met.
Next: Sprint 26H — Parent Task / Reinforcement Reads.
