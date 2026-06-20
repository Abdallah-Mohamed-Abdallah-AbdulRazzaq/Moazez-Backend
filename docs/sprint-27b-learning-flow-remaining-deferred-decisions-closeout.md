# Sprint 27B — Learning Flow Remaining Deferred Decisions Closeout

## 1. Executive Decision

- Decision status: LEARNING_FLOW_DEFERRED_DECISIONS_LOCKED
- Baseline: 5514d07 feat: add parent authorized file downloads
- Phase: Phase 2 — Learning Flow Remaining Deferred Decision Doc
- Runtime changes: None
- Schema/migration: None
- Build/test requirement: Docs-only verification only unless repo policy requires otherwise.
- Next phase: Phase 3 — Start next real backend feature family

The Learning Flow backend is considered operationally closed for the current project stage, with remaining items intentionally classified as deferred, future feature family, out of scope, or end-project handoff.

## 2. Closed Learning Flow Capabilities

Student App:
- Task stage submission is closed.
- Homework save/submit remains available where already implemented.
- Exam start/save/submit remains available where already implemented.
- Hero mission actions are closed.
- Reward redemption request is closed.
- Own XP/progress reads are closed.
- Own task/homework/grades/exams/behavior/discipline reads are closed.
- App-safe file/attachment metadata remains available where implemented.

Parent App:
- Linked child learning reads are closed.
- Linked child tasks/submissions reads are closed.
- Linked child task proof file download from Sprint 27A is closed.
- Linked child Hero/XP/Rewards reads are closed.
- Linked child grades/homeworks/progress/behavior/discipline/reports reads are closed.
- Read-mostly boundary is preserved.
- Existing communication/read-state actions remain available only where already implemented.

Teacher App:
- Task/reinforcement creation/review surfaces are closed where implemented.
- Homework/classroom/grades learning surfaces remain available where implemented.
- XP center/read surfaces remain available where implemented.
- Teacher manual XP bonus route remains deferred unless explicitly decided later.

Core:
- Reinforcement core remains the source of truth.
- Hero Journey core remains the source of truth.
- Rewards/redemptions core remains the source of truth.
- XpLedger remains the XP source.
- BehaviorPointLedger is not XP.
- Discipline remains derived/read-only.

Files:
- Parent task proof file download is now implemented through a Parent-specific route.
- Non-task Parent downloads remain deferred unless future scope explicitly approves them.

## 3. Remaining Items Decision Matrix

| Item | Final classification | Decision | Reason | Future trigger | Allowed next action |
| --- | --- | --- | --- | --- | --- |
| Sprint 26K OpenAPI / Swagger alignment | END_PROJECT_HANDOFF | Deferred until near final project stage. | User explicitly chose to complete backend feature families first. | All major backend feature families are complete. | OpenAPI / Swagger alignment sprint near project end. |
| Frontend SDK / generated client | END_PROJECT_HANDOFF | Deferred. | Depends on OpenAPI readiness and final API surface. | OpenAPI alignment completed. | Frontend SDK/client generation sprint. |
| Parent task/homework submissions | DEFERRED_PRODUCT_DECISION | Do not implement now. | Parent App remains read-mostly and must not perform Student-owned learning actions. | Explicit product decision to allow guardian-submitted work. | Decision sprint only; no runtime without approved contract. |
| Parent reward redemption | DEFERRED_PRODUCT_DECISION | Do not implement now. | Student owns reward redemption requests; Parent can read only. | Explicit product decision for guardian redemption. | Decision sprint with role/approval rules. |
| Parent Hero actions | DEFERRED_PRODUCT_DECISION | Do not implement now. | Hero actions are student-owned. | Explicit product decision to allow guardian-driven Hero actions. | Decision sprint only. |
| Parent XP grant | DEFERRED_PRODUCT_DECISION | Do not implement now. | XP must remain core-controlled and permissioned through XpLedger. | Explicit XP governance policy. | Decision sprint only. |
| Parent upload | DEFERRED_PRODUCT_DECISION | Do not implement now. | Sprint 27A added download only, not upload. | Explicit product decision and file safety policy. | Separate parent upload contract sprint if approved. |
| Parent non-task attachment downloads | FUTURE_SCOPE | Not part of current Learning Flow closeout. | Sprint 27A only approved reinforcement task proof file downloads. | Specific surface needs download support, e.g. homework attachments, lesson files, reports, messages, announcements. | Per-surface file authorization sprint. |
| Teacher manual XP bonus route | DEFERRED_PRODUCT_DECISION | Do not implement now. | Requires explicit permission/contract such as reinforcement.xp.manage and XP governance rules. | Product approves teacher manual XP grants. | Teacher XP bonus decision + runtime sprint. |
| Reward fulfillment/admin workflow | FUTURE_FEATURE_FAMILY | Not part of current Learning Flow App closeout. | Student redemption is request/status workflow; fulfillment needs admin actor, permissions, and status model. | Reward operations/admin workflow prioritized. | Reward fulfillment/admin feature family. |
| Dashboard/Admin learning handoff | FUTURE_HANDOFF | Not part of current Student/Parent/Teacher Learning Flow closeout. | Dashboard/Admin surfaces are separate from app learning flows. | Dashboard/Admin planning resumes. | Dashboard/Admin handoff sprint. |
| Wallet/finance/marketplace/payment/cash behavior | OUT_OF_SCOPE | Do not implement. | Current V1 learning/reward flow has no wallet/payment/marketplace semantics. | Explicit product scope expansion. | Separate finance/marketplace decision only. |
| Open-ended discipline writes | OUT_OF_SCOPE_FOR_LEARNING_FLOW | Do not implement through Learning Flow. | Discipline remains a derived/read-only layer from attendance incidents and approved behavior. | Explicit discipline product decision. | Discipline decision sprint only. |
| BehaviorPointLedger as XP | FORBIDDEN | Do not use. | XP source is XpLedger only. | None unless XP architecture changes. | Do not implement. |
| Storage internals in app JSON | FORBIDDEN | Do not expose. | App responses must not leak objectKey, bucket, storageKey, signedUrl, raw metadata. | None. | Use backend-authorized routes only. |

## 4. Final Learning Flow Boundary Lock

Parent App:
- Read-mostly.
- Can read linked child learning data.
- Can download linked child task proof files through the approved backend route.
- Can use existing communication/read-state actions only.
- Cannot perform Student-owned learning work.
- Cannot mutate Hero/Rewards/XP/Reinforcement.
- Cannot access storage internals.

Student App:
- Owns student actions already implemented.
- Cannot access other students.
- Cannot access answer keys/correct answers/teacher-only data.
- Cannot access storage internals.

Teacher App:
- Teacher allocation-scoped.
- Can use implemented task/review/homework/classroom surfaces.
- Manual XP bonus remains deferred unless permission policy is decided.

Core:
- Reinforcement/Hero/Rewards/XP core remains the business source of truth.

Dashboard/Admin:
- Separate planning/handoff.

## 5. Files / Attachments Decision Lock

Implemented:
- Parent reinforcement task proof download:
  GET /api/v1/parent/children/:studentId/files/:fileId/download

Still forbidden:
- signedUrl in app JSON
- objectKey
- bucket
- storageKey
- raw metadata
- unsafe storage URLs

Deferred:
- Parent upload
- Parent homework attachment download unless separately approved
- Parent lesson/material download unless separately approved
- Parent report attachment download unless separately approved
- Parent message/announcement attachment download expansion unless already implemented and authorized by existing surface

Rule:
Every future file download surface must prove:
- actor authorization
- child/student ownership where applicable
- surface linkage
- no broad generic storage exposure
- safe hidden/not-found behavior

## 6. Final Deferred Backlog for Future Planning

End-project handoff:
- OpenAPI / Swagger alignment
- Frontend SDK / generated client
- Frontend integration readiness audit

Future Product Decisions:
- Parent submit task/homework
- Parent reward redemption
- Parent Hero actions
- Parent XP grant
- Parent upload
- Teacher manual XP bonus

Future Feature Families:
- Reward fulfillment/admin workflow
- Dashboard/Admin learning handoff
- Non-task file download authorization surfaces if prioritized

Out of scope:
- wallet/finance/marketplace/payment/cash
- BehaviorPointLedger as XP
- storage internals in app JSON
- open-ended discipline writes through Learning Flow

## 7. Recommended Phase 3 Entry Criteria

- Working tree clean after Phase 2 commit.
- Learning Flow deferred decisions locked.
- No open runtime blocker from 27A.
- Next feature family selected explicitly.
- New feature family must start with:
  - reality audit
  - scope lock
  - no schema/migration unless justified
  - security/tenancy plan
  - tests plan
  - closeout doc

## 8. Candidate Next Feature Families

- Notifications / In-app notification center
- Messaging final hardening
- Reports finalization
- Dashboard/Admin expansion
- Admissions / Enrollment operations
- Transport
- Fees / Finance, only if explicitly in V1 scope
- Any other V1 module confirmed by project docs

The next feature family must be selected by the project owner before Codex begins runtime work.

## 9. Verification

Required commands:

```bash
git status --short --untracked-files=all
git diff --name-only
git diff --stat
git diff --check
```

Expected docs-only result:
- `git status --short --untracked-files=all` shows only this new document before commit.
- `git diff --name-only` has no tracked runtime, test, schema, package, OpenAPI, or generated client changes.
- `git diff --stat` has no tracked runtime, test, schema, package, OpenAPI, or generated client changes.
- `git diff --check` reports no whitespace errors.

Because this is docs-only, no build/test is required unless repository policy demands it.

## 10. Final Verdict

Phase 2: PASS if this document accurately locks the remaining Learning Flow deferred decisions.
Learning Flow backend status:
LEARNING_FLOW_BACKEND_CLOSED_WITH_DEFERRED_DECISIONS_LOCKED

Next:
Phase 3 — Start next real backend feature family.
