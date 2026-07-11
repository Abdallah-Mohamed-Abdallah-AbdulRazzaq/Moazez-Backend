# Full Project Regression Gate 1A Closeout

## Verdict

**READY FOR REVIEW**

Authoritative verdict: `FULL-PROJECT-REGRESSION-GATE-1A: READY FOR REVIEW`.

The complete configured test inventory passes through the canonical isolated
runner after scoped Gate 1A repairs, Gate 1B runner normalization, Gate 1C
documentation normalization, and the Gate 1D BullMQ lifecycle finalization.
Repository-wide lint/format findings are registered separately as pre-existing
quality debt; the changed-line audit found no new diagnostic. No deployment,
Live access, staging, commit, push, migration, seed, env, or stash operation was
performed.

## Baseline and inventory

- Branch: `fix/full-project-regression-gate`
- HEAD: `37a6fd93da4713b6a89eb5e928e2c059e66b1c5f`
- Initial worktree: clean
- `stash@{0}`: `WIP dashboard-todos-1a paused for migration rebaseline`
- Initial inventory: 436 unit files; 184 configured test files (100 E2E,
  83 security, one root test file).
- No `.only`, `.skip`, `.todo`, or `--forceExit`. The only existing
  `process.exit(1)` is the bootstrap-failure path in `src/main.ts`.

`npm run` was captured before execution. Applicable surfaces were build, unit,
E2E, security, migration governance/checks, Prisma validation, and historical
contract/security scripts. Because `lint` and `format` are write-mode scripts,
diagnostic `eslint` and `prettier --check` commands were used.

## Initial static and database gates

| Command | Result |
| --- | --- |
| `npx prisma validate` | PASS, exit 0, 11.6s |
| `npx prisma migrate status` | PASS, exit 0, 3.8s; one migration; up to date |
| `npm run test:migration-governance` | PASS, 39/39, exit 0, 20s |
| `npm run db:migrations:check` | PASS; active 1, new 0, rebaseline off |
| `npm run build` | PASS, exit 0, 127.2s |
| `npx tsc -p tsconfig.build.json --noEmit` | PASS, exit 0, 50.3s |
| diagnostic ESLint | FAIL; default heap OOM, then thousands of existing diagnostics with 4GB |
| `npx prettier --check "src/**/*.ts" "test/**/*.ts"` | FAIL; 831 files |

Migration integrity remained unchanged: the sole active migration is
`20260710135222_baseline_v1`; no schema, migration, seed, or governance file was
changed.

## Initial full regressions

- Unit: 433/436 suites and 2,529/2,534 tests passed; five failures; natural exit
  in 180.833s.
- Security split: 67/83 suites and 1,049/1,082 tests passed; 33 failures;
  natural exit in 574.04s.
- E2E-only split: 86/100 suites and 449/478 tests passed; 29 failures; natural
  exit in 1,088.463s.
- Broad combined Jest: default heap OOM near 2GB. With a temporary 6GB heap it
  reached the one-hour command limit without a Jest summary and left its owned
  wrapper/Jest processes. Those failed-run processes were terminated only after
  ownership was established. No `--forceExit`, retry, skip, or filter was used.

## Failure register and decisions

| Failure group | Classification | Decision and canonical evidence |
| --- | --- | --- |
| Two Teacher Profile `roleId` assertions | STALE TEST EXPECTATION | Later Teacher no-leak closeout forbids `roleId`; keep role name and assert recursive absence. |
| Admissions missing relation fixture | TEST FIXTURE OR CLEANUP DEFECT | Supply the current relation. |
| Admissions additive response assertions | STALE TEST EXPECTATION | Assert exact accepted source/review/link fields. |
| Parent/Student core Behavior, Hero, Rewards access | SECURITY DEFECT | Add a reusable school-management actor boundary to core controllers. |
| Teacher admitted to core Academics routes | SECURITY DEFECT | Add the school-management actor boundary; Teacher uses app adapters. |
| Teacher core Reinforcement success assertions | STALE TEST EXPECTATION | Assert exact core denial under the later accepted Teacher app contract. |
| App-facing Academics and platform feature fixtures | TEST FIXTURE OR CLEANUP DEFECT | Grant custom roles only the exact accepted app-route permissions. |
| Teacher lesson-preparation denial code | STALE TEST EXPECTATION | Later closeout accepts either safe 403 code. |
| Parent/Teacher routes and permission counts | STALE CONTRACT INVENTORY | Align with later Smart Pickup, Communication, Teacher, and 232-catalog closeouts. |
| Eight Dismissal migration assertions | STALE CONTRACT INVENTORY | Assert exact canonical baseline SQL evidence. |
| Hero summary query | TEST FIXTURE OR CLEANUP DEFECT | Send `studentId` only to DTOs accepting it. |
| Historical monolithic Jest default-heap OOM | TEST RUNNER SCALABILITY / PROCESS MEMORY ACCUMULATION | Replaced as the canonical runner by complete fresh-process family execution. |
| Historical monolithic Jest 6GB non-completion | TEST RUNNER SCALABILITY / PROCESS MEMORY ACCUMULATION | No final Jest summary was printed, so this is not evidence of an open-handle defect. |
| Repository lint/format baseline | PRE-EXISTING REPOSITORY QUALITY DEBT | Registered as `REPOSITORY-QUALITY-BASELINE-1A`; no diff-local finding remains. |
| Root/E2E BullMQ teardown race | ASYNC LIFECYCLE OR OPEN-HANDLE DEFECT | Reproduced with final Jest summaries/open-handle warnings. `BullmqService` now owns single-flight worker, queue, shared Redis, startup-run, initialization, and connector-stream settlement without `waitUntilReady()`. |

No finding required schema, migration, permission seed, role seed, or a new
product/security decision.

## TEACHER-PROFILE-ROLE-CONTRACT-AUDIT-1A

The DTO, presenter, use-case input, read-adapter selection, and HTTP contract
retain `role.name` and do not expose `roleId`. Git history traces the two old
expectations to `7df54f77` (`feat: add teacher profile and settings read APIs`),
before the accepted corrective no-leak closeout.

Profile presenter/use-case/adapter coverage passed 3 suites/10 tests. Teacher
final closeout plus Teacher, Parent, Student, and general tenancy passed 5
suites/133 tests. The exact 184-file inventory and canonical unit, security,
E2E, and root processes pass. Status: **RESOLVED**.

## Repairs, focused results, and repeatability

- Runtime/security: `SchoolManagementOnly` metadata, guard enforcement/tests,
  and markers on Academics, Behavior, and Reinforcement core controllers.
- Stale inventories: Teacher Profile, Teacher/Parent routes/catalog,
  Academics/Reinforcement actor expectations, and canonical Dismissal migration.
- Fixtures: Admissions relation, app-facing Academics permissions, platform
  feature permissions, and Hero query shape.
- Guard/Profile/Admissions units: 5 suites/17 tests passed.
- Dismissal inventory: 8 suites/63 tests passed.
- Hero/Academics security: 6 suites/58 tests passed.
- Repaired E2E inventories: 7 suites/48 tests passed.
- Teacher/Profile/no-leak: 3 suites/10 and 5 suites/133 tests passed.
- Reinforcement security: 52/52 passed twice independently.
- BullMQ lifecycle: 10/10 no-network unit tests passed; the combined BullMQ and
  Communication queue units passed 3 suites/12 tests; Dismissal expiry worker
  security passed 1 suite/4 tests.
- Root lifecycle: five independent final-correction runs passed 1/1 suite and
  1/1 test with natural exits and no open-handle warning.
- No duplicate-row, notification, queue, Redis-key, timer, or cleanup-order
  contamination appeared in repeated focused runs or final splits.

## BullMQ shutdown safety finalization

Duplicate per-worker destruction ownership remains removed from
`CommunicationNotificationGenerationWorker`,
`CommunicationNotificationPushWorker`, and `DismissalRequestExpiryWorker`.
`BullmqService` is the sole worker lifecycle owner.

Production destruction no longer calls or depends on `worker.waitUntilReady()`.
`onModuleDestroy()` is single-flight: concurrent callers receive the same
shutdown promise, and each worker, queue, and shared Redis connection is closed
once. Close failures and non-shutdown worker errors remain observable.

Worker startup is centrally initiated only after the error and teardown hooks
are installed. Graceful close also settles the owned run and RedisConnection
initialization promises. BullMQ/ioredis can publish a stalled-check stopper or
replace a connector stream while initialization is failing; the service tracks
those lifecycle resources, clears only a stale closed-stream reference during
central shutdown, and awaits real stream `close` events. No force close,
readiness wait, sleep, retry, heap increase, or global handle suppression is
used.

The initial Gate 1D root reproduction showed `Connection is closed` errors and
Jest open-handle warnings. The exact timer owner was ioredis connector fallback
cleanup scheduled against already-closed streams. The final root stability
runs, full E2E command, and canonical regression all exit naturally without
that warning. Two processes orphaned when an earlier unsafe diagnostic
prototype was deliberately terminated were identified by their 16:34 creation
time and root-test command line, then removed as failed-diagnostic cleanup. A
post-final-regression process audit returned no owned Node/Jest process.

## Final full results

- Configured inventory: **184/184 files covered**; security 83, E2E 100, root
  1; split-union comparison produced no output.
- Canonical command: `npm run test:regression`, using a fresh Jest process for
  each family with no skipped configured file.
- Unit: **PASS**, 438/438 suites, 2,548/2,548 tests, natural exit, 172.809s.
- Security: **PASS**, 83/83 suites, 1,082/1,082 tests, natural exit, 473.476s.
- E2E directory: **PASS**, 100/100 suites, 478/478 tests, natural exit,
  668.049s.
- Root: **PASS**, 1/1 suite, 1/1 test, natural exit, 13.133s.
- Final Gate 1D canonical wall time: approximately **1,344.2 seconds (22.4
  minutes)**. The accepted Gate 1C reference run was approximately 1,188.6
  seconds (19.8 minutes).
- No open-handle warning and no regression-owned process remained.
- Historical monolithic result remains diagnostic only: default heap OOM; 6GB
  execution did not finish; no final Jest summary; not proven open-handle debt.
- Build and TypeScript passed after runtime repairs.

## REPOSITORY-QUALITY-BASELINE-1A

**Status: OPEN — SEPARATE MAINTENANCE TASK**

The repository-wide ESLint and Prettier failures predate this gate. The Gate 1B
delta audit evaluated 58 changed/new TypeScript files: new-file diagnostics 0,
diff-local diagnostics 0 after scoped correction, and new-file Prettier PASS.
Untouched-line diagnostics remain baseline debt and do not block Gate 1A.

## TEST-RUNNER-PERFORMANCE-1A

**Status: OPEN — SEPARATE NON-BLOCKING OPTIMIZATION TASK**

The canonical runner is functionally complete and release-correctness PASS: it
covers all 184 configured test files, and fresh processes for unit, security,
the E2E directory, and the root test resolve cross-tree memory accumulation.
The accepted Gate 1C reference was approximately 1,188.6 seconds (19.8
minutes), and the final Gate 1D run was approximately 1,344.2 seconds (22.4
minutes). Both exceed the current ten-minute optimization threshold in
`TESTING_STRATEGY.md`.

Future work should evaluate safe CI sharding or parallelization without sharing
mutable database state, Redis state, BullMQ jobs, or test identities. No test
may be removed, skipped, retried, or weakened to improve duration. This
performance debt does not block the current correctness/security gate.

## Scope integrity and remaining debt

The worktree contains only scoped authorization, queue lifecycle, runner,
tests/fixtures/inventories, and gate documentation changes. No prohibited path
changed and nothing is staged. The Dashboard Todos stash remains intact. No
release blocker remains within this gate.

The remaining debts are exactly:

- `REPOSITORY-QUALITY-BASELINE-1A`
- `TEST-RUNNER-PERFORMANCE-1A`
