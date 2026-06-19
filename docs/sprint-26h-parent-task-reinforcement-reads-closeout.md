# Sprint 26H - Parent Task / Reinforcement Reads Closeout

## 1. Executive Decision

- Sprint 26H decision: PASS
- Runtime summary: Reused the existing read-only Parent App task/reinforcement routes and hardened their Parent-facing contract. Responses now omit internal enrollment and assignment ids, expose stage/submission progress fields explicitly, and return safe proof-file metadata without storage internals or download URLs.
- Parent Task/Reinforcement status after this sprint: PARENT_TASK_REINFORCEMENT_READS_READY_WITH_DEFERRED_PROOF_DOWNLOAD
- Recommended next sprint: Sprint 26I - Parent Learning Flow Final Closeout

## 2. Files Changed

### Parent Tasks

- `src/modules/parent-app/tasks/dto/parent-tasks.dto.ts`
- `src/modules/parent-app/tasks/infrastructure/parent-tasks-read.adapter.ts`
- `src/modules/parent-app/tasks/presenters/parent-tasks.presenter.ts`

### Parent Reinforcement Reads

- Existing Parent task read adapter/presenter now serves the reinforcement task read model.
- No separate Parent reinforcement module was added.

### Parent App Module / Controller / Presenter

- Existing controller preserved: `src/modules/parent-app/tasks/controller/parent-tasks.controller.ts`
- No module/controller route changes were needed.

### Shared Read Adapters

- None.

### Reinforcement Core

- None.

### Tests

- `src/modules/parent-app/tasks/tests/parent-tasks-read.adapter.spec.ts`
- `src/modules/parent-app/tasks/tests/parent-tasks.presenter.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`
- `test/e2e/parent-app-final-closeout.e2e-spec.ts`

### Docs

- `docs/sprint-26h-parent-task-reinforcement-reads-closeout.md`

## 3. Route Inventory

Final Parent task/reinforcement read routes:

- `GET /api/v1/parent/children/:studentId/tasks`
- `GET /api/v1/parent/children/:studentId/tasks/summary`
- `GET /api/v1/parent/children/:studentId/tasks/:taskId`
- `GET /api/v1/parent/children/:studentId/tasks/:taskId/submissions`
- `GET /api/v1/parent/children/:studentId/tasks/:taskId/submissions/:submissionId`

Routes not added because existing detail/submission reads already expose stages, submission state, proof metadata, and review status safely:

- No `GET /api/v1/parent/children/:studentId/tasks/:taskId/submission`
- No `GET /api/v1/parent/children/:studentId/tasks/:taskId/stages`
- No `GET /api/v1/parent/children/:studentId/tasks/:taskId/stages/:stageId`

Mutation routes not added:

- No `POST /parent/children/:studentId/tasks/:taskId/stages/:stageId/submit`
- No `POST /parent/children/:studentId/tasks/:taskId/review`
- No `POST /parent/children/:studentId/tasks/:taskId/approve`
- No `POST /parent/children/:studentId/tasks/:taskId/reject`
- No `POST /parent/children/:studentId/tasks/:taskId/cancel`
- No `POST /parent/children/:studentId/tasks/:taskId/complete`
- No `POST /parent/children/:studentId/xp/grants/manual`
- No `POST /parent/children/:studentId/rewards/:rewardId/redeem`

## 4. Contract Decisions Verified

| Decision | Result | Evidence |
| --- | --- | --- |
| Parent App is read-only. | PASS | Parent Tasks controller exposes only `@Get` routes; security/e2e route tests assert task mutation routes are absent. |
| Parent can read only linked child. | PASS | Every task use-case calls `ParentAppAccessService.assertParentOwnsStudent(studentId)`. |
| Same-school unlinked child is hidden. | PASS | Parent task security/e2e tests assert same-school unlinked task ids and submissions are hidden or 404. |
| Cross-school child is hidden. | PASS | Parent task security/e2e tests assert cross-school task ids and submissions are hidden or 404. |
| Parent cannot submit tasks. | PASS | No Parent submit route exists; absent-route tests cover task and stage submit paths. |
| Parent cannot review/approve/reject tasks. | PASS | No Parent review/approve/reject routes exist; absent-route tests cover each path. |
| Parent cannot cancel/complete tasks. | PASS | No Parent cancel/complete routes exist; absent-route tests cover both. |
| Parent cannot grant XP. | PASS | No Parent XP grant route exists; task reads do not query or write XP. |
| Parent cannot redeem rewards. | PASS | No Parent task reward redemption route exists; route tests assert absence. |
| Reinforcement core remains source of truth. | PASS | Parent App only reads `ReinforcementAssignment`, `ReinforcementTask`, stages, and submissions through a read adapter; no Parent state machine was added. |
| Task submissions/reviews are child-scoped. | PASS | Submission detail first resolves the owned child task assignment, then filters by assignment, task, student, and enrollment. |
| Proof file metadata is app-safe. | PASS | Select includes only file id, original name, MIME type, size, visibility, and createdAt; tests assert storage internals are absent. |
| Behavior points are not XP. | PASS | Parent task reads do not query `BehaviorPointLedger`; no task XP total is derived from behavior points. |
| No wallet/finance/marketplace/payment behavior. | PASS | No related routes or models are touched; no-leak tests assert these names are absent. |
| No internal fields leaked. | PASS | Presenter removes `enrollmentId`, `assignmentId`, actor ids, ledger ids, metadata, and storage internals from Parent task responses. |
| No Student/Teacher/Dashboard routes added. | PASS | Only Parent task DTO/presenter/adapter tests and Parent security/e2e tests changed. |

## 5. Task / Submission / Review Read Decision

- Existing routes were reused. No route aliases were added for ADR wording differences.
- Task visibility is determined by the existing Parent App ownership chain: authenticated parent user -> active current-school guardian -> active linked child enrollment -> child-scoped reinforcement assignment.
- Assignment/submission ownership is scoped server-side with child `studentId`, active `enrollmentId`, academic year, optional term, assignment id, and task id. The response does not expose the internal assignment or enrollment ids.
- Cancelled assignments and cancelled/deleted tasks are excluded from default reads.
- Stage status is presenter-derived from the child submission for that stage; approved submissions mark a stage completed.
- Review status is presenter-derived as `pending`, `pending_review`, `approved`, or `rejected` from the child submission status.
- Proof text is returned only from the owned child submission.
- Proof file metadata is limited to `fileId`, `filename`, `originalName`, `mimeType`, `size`, `sizeBytes`, `visibility`, and `createdAt`.
- Proof download is deferred; no `downloadPath`, signed URL, bucket, object key, storage key, or raw storage metadata is returned.
- No writes occur from Parent task reads.

## 6. XP / Reward Display Decision

- Parent task reads display task reward metadata only: reward type, label, and value.
- XP is not recalculated in Parent task reads.
- No `XpLedger` write occurs.
- `BehaviorPointLedger` is not used.
- Financial rewards remain display-only task reward metadata; no wallet, finance, marketplace, payment, or redemption behavior is introduced.
- No XP/reward writes occur from Parent task routes.

## 7. Parent-Child Ownership Decision

- Existing relationship model used: current parent user -> active current-school `Guardian` -> `StudentGuardian` link -> active child `Enrollment`.
- Required active statuses are enforced by the existing Parent App access adapter/domain assertions before task reads.
- Same-school unlinked children return safe not-found behavior.
- Cross-school children are hidden under the active school membership context.
- Student/enrollment context is resolved server-side; clients provide only the route `:studentId` selector.

## 8. Security / No-Leak Review

| Forbidden field | Result |
| --- | --- |
| `schoolId` | Absent from Parent task responses. |
| `organizationId` | Absent. |
| `membershipId` | Absent. |
| `roleId` | Absent. |
| `deletedAt` | Absent. |
| `enrollmentId` | Absent from Parent task responses; used only server-side for ownership scoping. |
| `guardianId` | Absent. |
| `parentId` | Absent. |
| `studentGuardianId` | Absent. |
| `assignmentId` unless intentionally app-safe | Absent from Parent task responses. |
| `submittedById` | Absent. |
| `reviewedById` | Absent. |
| `approvedById` | Absent. |
| `rejectedById` | Absent. |
| `createdById` | Absent. |
| `updatedById` | Absent. |
| XP ledger internals | Absent. |
| RewardRedemption internals | Absent. |
| BehaviorPointLedger-derived XP | Absent. |
| `metadata` | Absent. |
| `objectKey` | Absent. |
| `bucket` | Absent. |
| `storageKey` | Absent. |
| raw metadata | Absent. |
| `signedUrl` | Absent. |
| unsafe storage URL | Absent. |
| wallet/finance/marketplace/payment fields | Absent. |

Intentionally app-safe identifiers that remain: route child `studentId`, `taskId`, `stageId`, `submissionId`, and `fileId`.

## 9. Tests Run

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` | PASS - expected modified Parent task runtime/tests, security/e2e tests, and untracked 26H closeout doc; Git also reported a local user ignore permission warning. |
| `git diff --name-only` | PASS - tracked diff lists Parent task DTO/adapter/presenter, Parent task unit tests, and Parent security/e2e tests; the new closeout doc is untracked and listed by `git status`. |
| `git diff --stat` | PASS - tracked diff generated: 7 files changed, 336 insertions, 21 deletions; untracked closeout doc is listed by `git status`. |
| `git diff --check` | PASS - no whitespace errors; Git reported LF-to-CRLF working-copy warnings only. |
| `npm test -- --runInBand parent-app` | PASS - 46 suites, 171 tests. |
| `npm test -- --runInBand parent-tasks` | PASS - 3 suites, 7 tests. |
| `npm test -- --runInBand parent-reinforcement --passWithNoTests` | PASS - no matching dedicated pattern exists; closest Parent App/Parent Tasks suites passed. |
| `npm test -- --runInBand student-app` | PASS - 48 suites, 218 tests. |
| `npm test -- --runInBand student-tasks` | PASS - 3 suites, 14 tests. |
| `npm test -- --runInBand teacher-reinforcement --passWithNoTests` | PASS - no matching dedicated pattern exists; closest `teacher-app` suite passed. |
| `npm test -- --runInBand teacher-app` | PASS - 43 suites, 238 tests. |
| `npm test -- --runInBand reinforcement` | PASS - 35 suites, 270 tests. |
| `npm test -- --runInBand rewards` | PASS - 18 suites, 140 tests. |
| `npm test -- --runInBand xp` | PASS - 6 suites, 37 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` | PASS - 1 suite, 21 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` | PASS - 1 suite, 23 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-final-closeout.e2e-spec.ts` | PASS - 1 suite, 18 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts` | PASS - 1 suite, 17 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/reinforcement-foundation.e2e-spec.ts` | PASS - 1 suite, 1 test. |
| `npx prisma validate` | PASS - schema valid. |
| `npx prisma generate` | PASS - Prisma Client generated. |
| `npm run build` | PASS. |

## 10. Deferred Items

- Parent task mutations if ever approved.
- Parent reward redemption mutation if ever approved.
- Parent hero mutation if ever approved.
- Parent proof upload/download until a Parent-authorized file download contract is approved.
- Dashboard final handoff.
- Full frontend contract handoff.
- Teacher manual XP bonus route if still deferred.
- Reward fulfillment/admin workflow if not part of Parent App.

## 11. Final Verdict

Sprint 26H: PASS if criteria are met.
Next: Sprint 26I — Parent Learning Flow Final Closeout.
