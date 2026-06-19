# Sprint 27A Preparation — Learning Flow Backlog Decision Lock

## 1. Executive Decision

| Item | Decision |
| --- | --- |
| Decision status | BACKLOG_LOCKED_FOR_SPRINT_27A |
| Current baseline | `4c8a166 docs: add learning flow frontend handoff` |
| Sprint 26K status | DEFERRED_TO_END_OF_PROJECT |
| Next runtime sprint | Sprint 27A — Parent-authorized File Download Contract |

This document is planning-only. It makes no runtime changes, does not change API behavior, does not change DTOs, does not change controllers, does not change tests, does not change Prisma schema or migrations, does not change package metadata, and does not modify OpenAPI/Swagger.

## 2. Closed Learning Flow Backend Status

The Learning Flow / Reinforcement backend family is closed for the currently accepted baseline, with deferred items explicitly carried forward instead of expanded inside the closed work.

Closed items:

- Student task submission.
- Student Hero actions.
- Student rewards/redemptions.
- Parent Hero/XP/Rewards reads.
- Parent Task/Reinforcement reads.
- Parent Learning Flow backend closeout.
- Learning Flow frontend handoff.

Parent Learning Flow backend is ready with deferred items. Parent-facing learning routes remain linked-child scoped, read-mostly, and safe from internal tenancy, actor, ledger, reward-redemption, and storage metadata leaks. The only actionable backend gap selected for the next runtime sprint is parent-authorized access to safe child-owned proof/file downloads.

## 3. Remaining Items Classification

| Item | Classification | Decision | Reason | Next action |
| --- | --- | --- | --- | --- |
| Parent-authorized proof/file download | ACTIONABLE_NEXT | Execute in Sprint 27A | Parent can see safe proof metadata but cannot download proof files yet. | Implement safe parent-authorized backend download/access contract. |
| Sprint 26K OpenAPI / Swagger alignment | DEFERRED_TO_END_OF_PROJECT | Do not run now. | User wants to complete backend feature families first. | Return near final project phase. |
| Teacher manual XP bonus route | DEFERRED_PRODUCT_DECISION | Do not implement now. | Requires explicit permission/contract decision such as `reinforcement.xp.manage`. | Future decision sprint. |
| Parent task/homework mutations | DEFERRED_PRODUCT_DECISION | Do not implement now. | Parent learning remains read-mostly and must not perform Student actions. | Product decision only. |
| Parent reward redemption | DEFERRED_PRODUCT_DECISION | Do not implement now. | Parent can read child rewards/redemptions only. | Product decision only. |
| Parent Hero actions | DEFERRED_PRODUCT_DECISION | Do not implement now. | Hero actions are student-owned. | Product decision only. |
| Parent XP grant | DEFERRED_PRODUCT_DECISION | Do not implement now. | XP grants must remain core-controlled and permissioned. | Product decision only. |
| Reward fulfillment/admin workflow | FUTURE_FEATURE_FAMILY | Not part of Sprint 27A. | Student redemption is request/status only; fulfillment/admin workflow requires separate actor/permission design. | Future sprint if prioritized. |
| Dashboard/Admin learning handoff | FUTURE_HANDOFF | Not part of Sprint 27A. | App learning flow is closed; dashboard/admin surfaces remain separate. | Future dashboard/admin planning. |
| Wallet/finance/marketplace/payment behavior | OUT_OF_SCOPE | Do not implement. | Current reward system has no wallet/payment/marketplace semantics. | Requires explicit product scope if ever needed. |

## 4. Sprint 27A Scope Lock

Sprint 27A is defined as: **Sprint 27A — Parent-authorized File Download Contract**.

Goal:

Allow a linked parent to access/download only safe files that belong to their own linked child and are exposed through approved learning surfaces, without leaking storage internals.

Allowed scope:

- Inspect existing Files module/download routes.
- Reuse existing backend file authorization patterns if available.
- Add a parent-authorized access path only if needed.
- Ensure parent-child ownership.
- Ensure file belongs to child-owned/child-visible learning context.
- Ensure same-school unlinked child is hidden.
- Ensure cross-school child is hidden.
- Ensure no `signedUrl`, `objectKey`, `bucket`, `storageKey`, or raw metadata leaks in app responses.
- Add tests for parent authorized vs unauthorized file access.
- Add Sprint 27A closeout doc during the actual Sprint 27A implementation.

Forbidden scope:

- No parent upload.
- No parent task submission.
- No parent homework submission.
- No parent review/approve/reject/cancel/complete.
- No parent reward redemption.
- No parent Hero mutation.
- No parent XP grant.
- No wallet/finance/marketplace/payment.
- No schema/migration unless absolutely unavoidable.
- No OpenAPI/Swagger alignment.
- No generated client work.
- No unrelated feature family.

## 5. Phase Plan

| Phase | Status |
| --- | --- |
| Phase 0 — Backlog Lock / Remaining Decisions | This document. |
| Phase 1 — Sprint 27A Parent-authorized File Download Contract | Next runtime sprint. |
| Phase 2 — Learning Flow Remaining Deferred Decision Doc | After Sprint 27A; likely docs-only final decision closeout. |
| Phase 3 — Start next real backend feature family | After Phase 2; feature family to be selected after Learning Flow leftovers are locked. |

## 6. Verification

Expected docs-only verification:

| Command | Expected result |
| --- | --- |
| `git status --short --untracked-files=all` | Shows only `?? docs/sprint-27a-learning-flow-backlog-decision-lock.md`. |
| `git diff --name-only` | No tracked files changed. |
| `git diff --stat` | No tracked diff. |
| `git diff --check` | No whitespace errors. |

Because this is docs-only planning work, no build or test run is required unless repository policy demands it. No build/test command is expected for this phase.

## 7. Final Verdict

Phase 0: PASS if this backlog decision lock is accurate.
Next: Sprint 27A — Parent-authorized File Download Contract.
