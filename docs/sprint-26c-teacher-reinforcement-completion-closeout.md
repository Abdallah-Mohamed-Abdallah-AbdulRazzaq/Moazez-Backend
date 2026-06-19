# Sprint 26C Teacher Reinforcement Completion Closeout

## 1. Executive Decision

| Item | Decision |
| --- | --- |
| Sprint 26C decision | PASS |
| Runtime summary | Completed the Teacher Tasks reward selector contract so Teacher App advertises every approved task reward option: `none`, `moral`, `financial`, `points`, and `xp`. Added focused tests proving `subjectName` is display-only, reward mappings remain task metadata only, no storage/internal fields leak, and selectors expose the approved reward set. Existing Teacher Review Queue and Teacher XP read flows were verified as ownership-safe, submissionId-based, and core/ledger-backed. |
| Teacher Reinforcement status after this sprint | TEACHER_REINFORCEMENT_READY_WITH_DEFERRED_BONUS_GRANT |
| Recommended next sprint | Sprint 26D - Student Task Submission |

No Student App or Parent App feature routes were added. No schema, migration, deployment, `package.json`, `src/main.ts`, realtime gateway, or ADR files were changed. No commit was made.

## 2. Files Changed

### Teacher Tasks

- `src/modules/teacher-app/tasks/presenters/teacher-tasks.presenter.ts`

### Teacher Review Queue

- No runtime changes. Existing routes remain `submissionId`-based and delegate to Reinforcement core review use-cases after Teacher App visibility checks.

### Teacher XP

- No runtime changes. Existing XP routes remain read-only, owned-student scoped, and `XpLedger` backed.

### Reinforcement core if touched

- No Reinforcement core files were changed.

### Permissions/seeds

- No permission or seed files were changed.

### Tests

- `src/modules/teacher-app/tasks/tests/create-teacher-task.use-case.spec.ts`
- `src/modules/teacher-app/tasks/tests/teacher-tasks.presenter.spec.ts`
- `src/modules/teacher-app/tasks/tests/teacher-tasks.use-case.spec.ts`

### Docs

- `docs/sprint-26c-teacher-reinforcement-completion-closeout.md`

## 3. Route Inventory

Final Teacher Reinforcement routes:

- `GET /api/v1/teacher/tasks/dashboard`
- `GET /api/v1/teacher/tasks`
- `GET /api/v1/teacher/tasks/selectors`
- `POST /api/v1/teacher/tasks`
- `GET /api/v1/teacher/tasks/:taskId`
- `GET /api/v1/teacher/tasks/review-queue`
- `GET /api/v1/teacher/tasks/review-queue/:submissionId`
- `POST /api/v1/teacher/tasks/review-queue/:submissionId/approve`
- `POST /api/v1/teacher/tasks/review-queue/:submissionId/reject`
- `GET /api/v1/teacher/xp/dashboard`
- `GET /api/v1/teacher/xp/classes/:classId`
- `GET /api/v1/teacher/xp/students/:studentId`
- `GET /api/v1/teacher/xp/students/:studentId/history`

Manual XP bonus route is not implemented in Sprint 26C.

## 4. Contract Decisions Verified

| Decision | Result | Evidence |
| --- | --- | --- |
| `classId` = `TeacherSubjectAllocation.id` | PASS | Teacher Tasks selectors, task presenters, review presenters, and XP class route use allocation ids as app-facing class ids. Tests assert `allocation-1` in task selector/detail/class XP responses. |
| Review queue is `submissionId`-based | PASS | Final routes use `:submissionId` for detail, approve, and reject. No `taskId + stageId` review action was added. |
| Teacher Tasks delegate to Reinforcement core | PASS | `CreateTeacherTaskUseCase` validates Teacher ownership and then calls `CreateReinforcementTaskUseCase`; no Teacher App task repository or state machine was introduced. |
| Teacher review delegates to Reinforcement core | PASS | Approve/reject use-cases assert visible submission first, then call core `ApproveReinforcementSubmissionUseCase` / `RejectReinforcementSubmissionUseCase`. |
| XP Center uses `XpLedger` | PASS | Teacher XP read adapter queries `xpLedger` only for XP entries; tests assert no XP mutations and no Behavior point reads. |
| XP Center is owned-student/classroom-context, not subject-specific | PASS | XP reads validate owned allocations/enrollments and do not filter by subject, because `XpLedger` has no subject scope. |
| Behavior points are not XP | PASS | Teacher XP and task/review tests assert `behaviorPointLedger` is not read or used. |
| Financial reward is display-only | PASS | Teacher task reward mapping sends `FINANCIAL` as Reinforcement task metadata only; no finance, wallet, marketplace, redemption, or XP ledger behavior is created. |
| XP reward does not create wallet/finance/marketplace | PASS | Teacher task create maps `xp` to task reward metadata only. XP ledger grant remains explicit through core XP flows and is not invoked by task creation or approval. |
| Proof files are safe metadata only | PASS | Task and review presenters expose file id, original name, mime type, size, visibility, createdAt, and a backend download route reference only. |
| No internal fields leaked | PASS | Presenter tests assert no `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, `bucket`, `objectKey`, `signedUrl`, raw metadata, or behavior-derived XP leaks. |

## 5. Manual XP Bonus Grant Decision

| Item | Decision |
| --- | --- |
| Implemented or deferred | Deferred |
| Route if implemented | Not implemented; preferred future route remains `POST /api/v1/teacher/xp/students/:studentId/grants/manual` only after permission policy approval. |
| Permission model | Deferred because Teacher App routes currently rely on teacher actor plus ownership checks, the seeded Teacher role has `reinforcement.xp.view` but not `reinforcement.xp.manage`, and there is no existing Teacher App-specific XP grant permission pattern to reuse. |
| Idempotency model | Future implementation must pass a stable `dedupeKey`/`sourceId` to core `GrantManualXpUseCase`, which Sprint 26B hardened to require idempotency keys. |
| Ownership model | Future implementation must validate the student is active and owned through `TeacherSubjectAllocation` plus active enrollment before delegating to core. |
| Tests | Not applicable in Sprint 26C because the route is deferred. Existing core XP tests cover manual grant idempotency, caps, cooldowns, allowed reasons, and audit behavior. |
| Exact reason and next step | Deferred to avoid silently granting broad dashboard XP manage powers to teachers. Next step is an explicit Teacher App XP bonus permission/product decision, then a narrow adapter over core `GrantManualXpUseCase`. |

## 6. Security / No-Leak Review

| Forbidden field | Status |
| --- | --- |
| `schoolId` | Absent from Teacher Tasks, Review Queue, and XP presenter response tests. |
| `organizationId` | Absent from changed Teacher Tasks presenter response tests. |
| `membershipId` | Absent from changed Teacher Tasks presenter response tests. |
| `roleId` | Absent from changed Teacher Tasks presenter response tests. |
| `deletedAt` | Absent from changed Teacher Tasks presenter response tests. |
| `objectKey` | Absent from Teacher Tasks and Review Queue proof responses. |
| `bucket` | Absent from Teacher Tasks and Review Queue proof responses. |
| raw metadata | Absent from Teacher Tasks, Review Queue, and XP response tests. |
| `signedUrl` | Absent from changed Teacher Tasks presenter response tests. |
| unsafe storage URL | Absent; proof download references are backend route references, not raw object storage URLs. |
| `reviewedById` | Absent from Teacher Review Queue presenter responses. |
| `submittedById` | Absent from Teacher Review Queue and Teacher Tasks presenter responses. |
| BehaviorPointLedger-derived XP | Absent; Teacher XP uses `XpLedger` only. |

## 7. Tests Run

| Command | Result |
| --- | --- |
| `npm test -- --runInBand create-teacher-task.use-case.spec.ts teacher-tasks.presenter.spec.ts teacher-tasks.use-case.spec.ts` | PASS - 3 suites, 21 tests. |
| `npm test -- --runInBand teacher-app` | PASS - 43 suites, 238 tests. |
| `npm test -- --runInBand teacher-tasks` | PASS - 3 suites, 17 tests. |
| `npm test -- --runInBand teacher-xp` | PASS - 3 suites, 10 tests. |
| `npm test -- --runInBand xp` | PASS - 6 suites, 37 tests. |
| `npm test -- --runInBand reinforcement` | PASS - 35 suites, 270 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.teacher-app.spec.ts` | PASS - 1 suite, 41 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/reinforcement-foundation.e2e-spec.ts` | PASS - 1 suite, 1 test. |
| `npx prisma validate` | PASS - Prisma schema is valid. |
| `npx prisma generate` | PASS - Prisma Client v6.19.3 generated successfully. |
| `npm run build` | PASS - Nest build completed. |
| `git status --short --untracked-files=all` | PASS - expected Sprint 26C code/test changes plus the untracked closeout doc. Git emitted the pre-existing user config ignore permission warning. |
| `git diff --name-only` | PASS - tracked Sprint 26C runtime/test files only; the untracked closeout doc appears in `git status` until staged. |
| `git diff --stat` | PASS - tracked runtime/test diff only; the untracked closeout doc is not included by `git diff` until staged. |
| `git diff --check` | PASS - no whitespace errors in tracked diffs. |

## 8. Deferred Items

Only items outside completed Teacher Reinforcement scope remain:

- Student task submission
- Student Hero actions
- Student rewards/redemptions
- Parent Hero/XP/Rewards reads
- Parent task mutations
- Dashboard final handoff
- Full frontend contract handoff
- Teacher manual XP bonus route, pending explicit Teacher App permission/product policy approval

## 9. Final Verdict

Sprint 26C: PASS if criteria are met.
Next: Sprint 26D — Student Task Submission.
