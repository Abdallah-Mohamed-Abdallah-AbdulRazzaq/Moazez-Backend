# Sprint 26B Reinforcement Core Policy Hardening Closeout

## 1. Executive Decision

| Item | Decision |
| --- | --- |
| Sprint 26B decision | PASS |
| Runtime changes summary | Hardened core reward normalization so explicit `none` maps to no reward, and hardened manual XP bonus grants so every manual grant must use a stable `sourceId` or `dedupeKey` for idempotency. Added focused tests for reward `none`, manual XP idempotency-key enforcement, and proof file no-leak response safety. |
| Core family status after this sprint | CORE_HARDENED |
| Recommended next sprint | Sprint 26C - Teacher Tasks / Reviews / XP Completion |

No Student App, Parent App, or Teacher App feature routes were added. No schema, migration, deployment, `package.json`, `src/main.ts`, realtime gateway, or ADR files were changed.

## 2. Files Changed

### Core tasks/templates/reviews

- `src/modules/reinforcement/tasks/domain/reinforcement-task-domain.ts`

### XP

- `src/modules/reinforcement/xp/application/grant-manual-xp.use-case.ts`
- `src/modules/reinforcement/xp/domain/reinforcement-xp-domain.ts`

### Rewards

- No reward runtime files changed. Existing catalog and redemption semantics were verified as school reward workflow only, with no wallet, finance, marketplace, balance, or XP deduction behavior.

### Hero Journey

- No Hero Journey runtime files changed. Existing hero reward/badge/mission semantics remain core-owned and covered by the requested tests.

### Files/proofs

- No files module runtime files changed. Reinforcement review proof presentation was verified through tests to expose safe proof metadata only.

### Permissions/seeds

- No permission seed changes were needed. Existing core reinforcement permission strings cover view/manage/review/request/fulfill flows.

### Tests

- `src/modules/reinforcement/tasks/tests/reinforcement-task-domain.spec.ts`
- `src/modules/reinforcement/reviews/tests/reinforcement-review.presenter.spec.ts`
- `src/modules/reinforcement/xp/tests/reinforcement-xp.use-case.spec.ts`

### Docs

- `docs/sprint-26b-reinforcement-core-policy-hardening-closeout.md`

## 3. Policy Decisions Verified

| Policy | Result | Evidence |
| --- | --- | --- |
| Behavior points are not XP. | PASS | `src/modules/reinforcement/xp` uses `XpLedger` repository flows only; `BehaviorPointLedger` / `behaviorPointLedger` scan returned no reinforcement references. |
| XP ledger is the only XP source. | PASS | XP list, summary, review grant, and manual grant flows use `ReinforcementXpRepository` ledger methods backed by `xpLedger`. |
| Reward financial remains display-only. | PASS | Reward type normalization preserves `FINANCIAL` as task reward metadata only; wallet/finance/marketplace/deduction scan returned no reinforcement references. |
| XP grants are explicit and idempotent. | PASS | Review XP grants remain behind `GrantXpForReinforcementReviewUseCase`, keyed by `REINFORCEMENT_TASK` + submission id + student. Duplicate tests return the existing ledger entry. |
| Manual grants are explicit and idempotent. | PASS | `GrantManualXpUseCase` now requires `sourceId` or `dedupeKey`; missing stable idempotency key rejects before ledger creation. Duplicate manual grants return the existing ledger entry. |
| Task duplication does not duplicate runtime state. | PASS | Duplicate task flow builds a new task/assignment graph from source task metadata and target/stage definitions only; it does not copy submissions, reviews, XP ledger entries, redemptions, or audit history. |
| Cancelled tasks are excluded by default. | PASS | Task list filter normalization defaults `includeCancelled` to false, and repository list criteria exclude `CANCELLED` unless explicitly requested. |
| Proof file responses are safe. | PASS | Review proof presenter returns file id, original name, mime type, size, visibility, and createdAt only. New presenter test asserts no `schoolId`, `submittedById`, `metadata`, `bucket`, `objectKey`, `signedUrl`, storage field, or raw storage URL leaks. |
| Core mutations are audited. | PASS | Task create/duplicate/cancel, template create, submission submit, review approve/reject, XP policy/grant/manual bonus, reward catalog/redemptions, and Hero Journey mutation flows use existing audit patterns. New manual XP guard preserves audit for successful mutations only. |
| Permissions are correct for view/manage flows. | PASS | Core controllers use `@RequiredPermissions`: reads use view permissions, task/review/template mutations use manage permissions, XP grant routes use `reinforcement.xp.manage`, redemption review/fulfill routes use specific reward permissions. Seeded permission strings already exist. |

## 4. API / Contract Impact

No response shape changed.

Request validation behavior changed intentionally for safety:

- Core reinforcement reward input now accepts explicit `none` as no reward, matching Sprint 26A policy that `null/none` means no reward.
- Manual XP bonus grants now require a stable `sourceId` or `dedupeKey`. The previous random fallback made a manual bonus non-idempotent when callers omitted both fields. This is a backend-correct policy hardening, not a frontend naming accommodation.

Proof file response fields were left as-is because the current presenter already exposes only safe metadata. No storage internals were removed from an accepted response contract.

## 5. Security / No-Leak Review

| Forbidden field | Review result |
| --- | --- |
| `schoolId` | Absent from app-facing reinforcement proof presenter responses tested in this sprint. Repository scope still uses school ownership internally. |
| `organizationId` | Absent from changed response surfaces. |
| `membershipId` | Absent from changed response surfaces. |
| `roleId` | Absent from changed response surfaces. |
| `deletedAt` | Absent from changed response surfaces. |
| `passwordHash` | Absent from reinforcement response surfaces reviewed. |
| `objectKey` | Absent from reinforcement proof responses; files repository keeps it internal for storage operations. |
| `bucket` | Absent from reinforcement proof responses; files repository keeps it internal for storage operations. |
| raw metadata | Absent from reinforcement proof responses tested in this sprint. |
| `signedUrl` | Absent from reinforcement proof responses. |
| unsafe storage URL | Absent from reinforcement proof responses. |
| `reviewedById` unless admin/internal-safe | Present only in core dashboard/admin review history context; no app-facing route was added or changed. |
| `submittedById` unless admin/internal-safe | Absent from reinforcement proof presenter responses tested in this sprint. |

## 6. Tests Run

| Command | Result |
| --- | --- |
| `npm test -- --runInBand reinforcement-task-domain.spec.ts reinforcement-review.presenter.spec.ts reinforcement-xp.use-case.spec.ts` | PASS - 3 suites, 20 tests. Initial sandbox run failed with Jest temp-cache `EPERM`; rerun outside sandbox passed. |
| `npm test -- --runInBand reinforcement` | PASS - 35 suites, 270 tests. |
| `npm test -- --runInBand rewards` | PASS - 12 suites, 120 tests. |
| `npm test -- --runInBand hero-journey` | PASS - 12 suites, 81 tests. |
| `npm test -- --runInBand xp` | PASS - 6 suites, 37 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/reinforcement-foundation.e2e-spec.ts` | PASS - 1 suite, 1 test. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/rewards-foundation.e2e-spec.ts` | PASS - 1 suite, 1 test. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/hero-journey-foundation.e2e-spec.ts` | PASS - 1 suite, 1 test. |
| `npx prisma validate` | PASS - Prisma schema is valid. |
| `npx prisma generate` | PASS - Prisma Client v6.19.3 generated successfully. |
| `npm run build` | PASS - Nest build completed. |
| `git status --short --untracked-files=all` | PASS - expected Sprint 26B code/test changes plus the untracked closeout doc. Git emitted the pre-existing user config ignore permission warning. |
| `git diff --name-only` | PASS - tracked Sprint 26B runtime/test files only; the untracked closeout doc appears in `git status` until staged. |
| `git diff --stat` | PASS - tracked runtime/test diff only; the untracked closeout doc is not included by `git diff` until staged. |
| `git diff --check` | PASS - no whitespace errors in tracked diffs. |

## 7. Deferred Items

The following items remain outside Sprint 26B and belong to later approved runtime/contract sprints:

- Teacher manual XP bonus app route
- Student task submission
- Student Hero actions
- Student rewards/redemptions
- Parent Hero/XP/Rewards reads
- Parent task mutations
- Dashboard final handoff
- Full frontend contract handoff

## 8. Final Verdict

Sprint 26B: PASS if all criteria are met.
Next: Sprint 26C — Teacher Tasks / Reviews / XP Completion.
