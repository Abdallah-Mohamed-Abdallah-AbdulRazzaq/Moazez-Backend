# PRD1-G07 Phase 1 Universal Regression Gate Closeout Candidate

## Gate status

`IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE`

This branch implements the reusable Phase 1 universal regression gate. It is
not a Phase 1 completion claim: the complete local inventory passes, but the
gate remains a candidate until the pull request is reviewed and merged, and
post-merge CI evidence exists.

Phase 2 remains `NOT_STARTED`. This work does not create API or Worker
composition roots and does not authorize Phase 2.

## Frozen baseline and scope

- Frozen baseline: `d9cb589a49dfc920e2118feb618b2b9edac732b9`.
- Implementation branch:
  `chore/production-readiness-g07-universal-regression`.
- Canonical command: `npm run test:g07`.
- Compatibility alias: `npm run test:regression` delegates to the canonical
  command without an `&&` chain.
- Product-source changes: none.
- Schema, migration, dependency, lockfile, and Dockerfile changes: none.
- The Communication change imports `HttpLifecycleAdmissionGuard` and updates
  only the stale test expectation to the accepted production order. Production
  guards and their order are unchanged.
- The dashboard analytics E2E fixture now creates and restores its required
  `Africa/Cairo` SchoolProfile timezone explicitly. This is a test-fixture
  correction for a clean database, not a product-contract change.

The baseline dry run found harness defects only. It did not establish an
independent product regression.

## Root causes addressed

1. Security files shared one long Jest lifecycle. Earlier suites could close
   Redis/BullMQ resources still referenced by later suites, producing
   `Connection is closed` even though every affected file passed alone.
2. The 103-file E2E inventory shared one memory-unbounded Jest process and was
   OOM-killed with exit `137`; five-file processes completed the inventory.
3. The Communication contract encoded the pre-lifecycle-admission global guard
   list instead of the accepted current order.
4. G05, G06, and Teacher closeout tests have explicit fixture contracts that a
   generic database/Redis/storage environment cannot satisfy.
5. The former `test:regression` `&&` chain stopped at the first failure and had
   no trustworthy aggregate result.
6. Reusing one seeded database across inventories allowed destructive test
   cleanup to remove Demo school/system-role seed data. Each batch now receives
   a fresh migrated and demo-seeded database that is force-dropped afterward.
7. The dashboard analytics E2E test relied on SchoolProfile state leaked from
   another suite. Its fixture now owns and restores the timezone it asserts.
8. Four `src/**/*.integration.spec.ts` files were inventoried but filtered by
   the E2E Jest project. They now run in a dedicated default-Jest stage; this
   closes a detected `274/291` false-green.

## Orchestrator design

`scripts/prd1-g07-universal-regression.cjs` discovers and sorts files, creates
deterministic batches, routes special fixtures, starts each batch in a new
bounded Docker process, records each exit code, and continues independent
gates after failures. A dependent gate is recorded as `BLOCKED` when a required
predecessor did not pass.

Defaults are Security `3`, E2E `5`, Integration `5`, Node heap `1536 MiB`, and
container memory `2304 MiB`. Values and timeouts are configurable through the
documented `G07_*` variables used by the workflow. Jest runs use `--runInBand`,
never `--forceExit`; the orchestrator fails a batch if Jest emits the
"did not exit" lifecycle warning or reports any skipped test.

Every batch logs its deterministic file list. The final console table is
human-readable and the JSON summary is machine-readable. Required `FAIL` or
`BLOCKED` results produce a non-zero aggregate exit; zero is possible only
when every required result, including cleanup, is `PASS`.

`scripts/prd1-g07-container-entry.cjs` copies a synthetic in-container
workspace from the read-only repository mount and intentionally excludes `.env`,
local env variants, `.git`, `node_modules`, build output, and coverage. It links
the lockfile-installed dependencies from the pinned test image. Thus tests use
only declared CI fixture values; the gate does not load the local `.env`.

## Disposable fixture topology

The gate builds the existing Dockerfile `media-test` target, which pins Node
`22.23.1`, then provisions:

| Component | Image / contract | Topology |
| --- | --- | --- |
| PostgreSQL | `postgres:16-alpine` | one tmpfs server; general, `g06_*`, and `moazez_1b7_closeout_*` databases |
| Redis | `redis:7-alpine` | one tmpfs server; general DB 0 and G05-dedicated DB 15 |
| MinIO | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | tmpfs data; private/public buckets; G06-compatible `g06-*-minio` alias |
| Network | Docker internal bridge | unique suffix; zero published host ports |

PostgreSQL migrations and seeds run separately for all three database
contracts. Every Jest process gets a uniquely named database, runs migration
deploy and demo seed, and force-drops that database after the process. G06 MIME
Security and its repository/persistence integrations use a `g06_*` database.
The three Teacher closeout/constraint files use a
`moazez_1b7_closeout_*` database.
G05 sets `RUN_PRD1_G05_REDIS_INTEGRATION=1` and its dedicated
`PRD1_G05_REDIS_URL`. General tests use only the general database.

Redis is flushed before every Jest batch. Cleanup is signal-aware and
idempotent. It removes exact batch containers, PostgreSQL/Redis/MinIO
containers, the internal network, tmpfs data, the temporary test-image tag,
and intermediate JSON files. Cleanup removal is verified with Docker inspect;
cleanup failure is itself a blocking gate failure.

## Required inventory

The canonical aggregate covers:

- migration governance check and tests;
- Prisma validate, fresh deploys, status, generate, seed, and second-deploy
  no-op proof;
- exact Node/Firebase runtime identity, runtime policy, Nest build, and media
  runtime verification;
- the complete unit inventory;
- every `test/security` file in small isolated processes, with G06 separate;
- every `test/e2e` file in five-file default batches;
- `test/app.e2e-spec.ts` alone;
- all Integration files under `test/integration` and `src`, including G05,
  G06, and Teacher special fixtures;
- `git diff --check`, frozen-baseline ancestry, allowed-scope, worktree, and
  tracked-env checks.

## Orchestrator regression evidence

The permanent Node test is
`scripts/tests/prd1-g07-universal-regression.test.cjs`. It proves:

- child failure yields a final non-zero exit;
- all-pass yields zero;
- a failure cannot be recorded as success;
- deterministic sorting and batching;
- G05/G06/Teacher routing contracts;
- cleanup on success and failure, once only;
- credential and URL redaction;
- continuation of independent evidence after failure;
- explicit dependent `BLOCKED` status;
- no required `FAIL`/`BLOCKED` false-green;
- exclusion of local env files from the test workspace;
- explicit execution of the four Integration specs under `src` with the
  default Jest project.

Final implementation result: `12/12` tests passed, exit `0`.

## CI contract

`.github/workflows/phase-1-universal-regression.yml` runs the single canonical
aggregate on pull requests, `main` pushes, and manual dispatch. The one
blocking job has a 240-minute bound, uses Node `22.23.1`, installs only the
committed lockfile, runs `npm run test:g07`, and publishes the JSON summary even
when the aggregate fails. There is no deployment, promotion, Phase 2, or
composition-root work in this workflow.

## Complete local gate evidence

The final canonical run was `npm run test:g07` on 2026-08-02, against frozen
baseline/working-tree `HEAD` `d9cb589a49dfc920e2118feb618b2b9edac732b9`.
Because no commit was requested, the implementation remains an uncommitted
candidate diff and does not yet have a pull-request candidate SHA.

- Aggregate: `PASS`, exit `0`, `85 PASS / 0 FAIL / 0 BLOCKED`, duration
  `8,088,420 ms`.
- Unit: `545/545` suites and `3978/3978` tests.
- Security: `90/90` suites and `1172/1172` tests across 31 processes; G06 MIME
  is `18/18` tests.
- E2E: `103/103` files/suites and `543/543` tests across 21 processes; root
  AppModule is a separate `1/1` suite and `2/2` tests.
- Integration: `27/27` files/suites and `291/291` tests across 8 processes:
  16 general files/219 tests, 4 `src` files/17 tests, 3 G06 files/31 tests,
  3 Teacher closeout files/23 tests, and G05 Redis `1/1`.
- Skipped tests: `0` in Unit, Security, E2E, root, and Integration inventories.
- Migration governance check/tests, Prisma validate/generate, three fresh
  migration deploys (`7/7` committed migrations), status, second-deploy no-op,
  three seeds, build, runtime identity/policy/tests, media runtime, scope, and
  `git diff --check`: all `PASS`, each exit `0`.
- Cleanup: `PASS`, exit `0`, duration `18,761 ms`; an independent Docker query
  found `0` matching containers, `0` networks, and `0` temporary image tags.
- Machine summary:
  `%TEMP%/moazez-g07-msbd6hwu-hz8-a45ecb-NoQ8Br/summary.json`.

The local evidence is complete. Pull-request review, a committed candidate SHA,
CI artifact/run, merge commit, and post-merge workflow evidence remain pending.
Until those values exist, PRD1-G07 must not be recorded as `COMPLETE`.

## Explicit boundaries

- Phase 2 has not started and remains `NOT_STARTED`.
- No local `.env` is read by the gate and no secret is copied into scripts,
  workflows, summaries, or documentation.
- All committed fixture credentials are clearly CI-only and non-production.
- No accepted Phase 1 product contract is changed.
- No product behavior is changed because the baseline produced no independent
  product-regression evidence.
- No branch push, pull request, merge, deployment, or production action is part
  of this implementation task.
