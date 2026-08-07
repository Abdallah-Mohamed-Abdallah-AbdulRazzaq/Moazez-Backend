# PRD3-G04 Governed Migration Job Evidence

## Candidate identity

- Gate: `PRD3-G04`
- Base SHA: `3c2f6ad6b31001b37aa6b2962767de163474856d`
- Branch: `chore/production-readiness-3-cloud-sql`
- Owner decision: `PRD0-Q026 option A`, approved by Abdallah
- Approval timestamp: `2026-08-07T00:22:00+03:00`
- ADR: `adr/ADR-0007-migration-job-and-deployment-ordering.md`
- Candidate state: `IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE`

## Approved contracts

- Migration Job: `config/deployment/migration-job.contract.json`
- Release order: `config/deployment/release-sequence.contract.json`
- Runtime command override:
  `node scripts/migrations/run-governed-migration-job.cjs`
- Default image command: `node dist/main.js`
- Database identity: `moazez_migration`
- Database schema target: exactly one `schema=public`; `options` and
  `search_path` overrides rejected
- Database connection allowance: `2`
- Tasks / parallelism / retries: `1 / 1 / 0`
- Timeout: `1200` seconds
- Seeds allowed: `false`
- Application bootstrap allowed: `false`
- Manual reruns require a new execution ID and a newly issued approval
  reference; approval, backup, and data-authority references bind the exact
  current execution ID.
- Execution-ID uniqueness and approval issuance authority:
  `release-orchestrator` (Phase 8); the runner maintains no persistent approval
  history.

The runner enforces that approval, backup, and data-authority references are
bound to the current execution ID. Global uniqueness of execution IDs and
issuance of a genuinely new manual approval are deployment-orchestrator
responsibilities wired in Phase 8.

## Deterministic migration artifact

- Prisma version: `6.19.3`
- Migration count: `7`
- Aggregate migration-chain SHA-256:
  `f6ae231cb29a9b2e314a7a4d84f5498702e5eba95c73116444fbd84fbd40a602`
- Manifest has no timestamp, machine path, database URL, or credential.
- Every migration directory is canonical and contains only `migration.sql`.
- Runtime verification recomputes the schema, Prisma config, migration, and
  aggregate hashes before Prisma or database access.

## Measured same-image and PostgreSQL evidence

One bounded final run used local Docker Desktop `29.6.2`, the already-present
immutable PostgreSQL 16 image
`sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`,
an internal uniquely named network, a random loopback-only published port,
tmpfs database storage, and no persistent volume. It built the final
application image exactly once.

### Same immutable final image

- Final image ID:
  `sha256:03e76c4d2775c3c709ff5e1830650e58cb9f1115d4736fa1d0dda030d6425ca1`
- Build count: `1`
- Default image command: `node dist/main.js`
- Migration override command:
  `node scripts/migrations/run-governed-migration-job.cjs`
- Runtime user: `node` (non-root)
- Existing runtime commands present: API, Core Worker, Media Worker, and
  Maintenance Scheduler (`4/4`)
- Embedded migration runner, manifest verifier, generated manifest, and both
  deployment contracts: `PASS`
- `.env` present in image: `false`

The fresh Migration Job and every failure scenario used that exact image ID by
command override. No separate migration target or deployable image was built.
The runner validates only the required digest format and does not independently
discover a registry digest. The local harness proves the same image ID; the
release orchestrator supplies the actual immutable digest and Phase 8 must bind
it to every runtime promotion.

### Fresh deploy and second no-op

| Proof | Result |
| --- | --- |
| Wrong-schema preflight | `migration_environment_contract_invalid`; manifest and database commands `0` |
| Fresh deploy | `migration_applied`, exit `0` |
| Manifest verification | `PASS` before Prisma/database access |
| Applied migration count | `7` |
| `prisma migrate status` | `PASS` |
| Post-deploy drift diff | empty, `PASS` |
| Seed rows | `0` |
| Nest application bootstrap count | `0` |
| Maximum observed `moazez_migration` connections | `1/2` |
| Second deploy | `migration_noop`, exit `0` |
| Applied migration count after second deploy | unchanged |
| Migration checksums after second deploy | unchanged |
| Normalized database schema after second deploy | unchanged |

### Intentional failure matrix

| Scenario | Stable result | Exit | Database commands | Runtime promotions | Traffic promotions |
| --- | --- | ---: | ---: | ---: | ---: |
| Unauthorized database drift | `migration_drift_detected` | 1 | fixed sequence through diff | 0 | 0 |
| Failed migration history | `migration_p3009_detected` | 1 | stopped at deploy | 0 | 0 |
| Migration-history divergence | `migration_history_diverged` | 1 | hard stop | 0 | 0 |
| One-byte migration artifact tamper | `migration_manifest_mismatch` | 1 | 0 | 0 | 0 |
| Production disposable checkpoint/data authority | `migration_environment_contract_invalid` | 1 | 0 | 0 | 0 |

The direct SQL used to construct drift and failed/diverged-history conditions
was disposable test setup only. The Migration Job performed no direct SQL,
repair, resolution, reset, schema push, automatic rollback, or retry.

### Database identity proof

The existing accepted G01 role bootstrap and runtime-grant policies were
reused without modification. `moazez_migration` successfully applied the
governed chain while retaining its two-connection allowance. Each runtime
identity was denied with SQLSTATE `42501` for every representative operation:

| Runtime identity | CREATE TABLE | ALTER TABLE | DROP TABLE | CREATE SCHEMA | CREATE ROLE | GRANT ROLE | Read `_prisma_migrations` | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| `moazez_api` | denied | denied | denied | denied | denied | denied | denied | 7/7 |
| `moazez_core_worker` | denied | denied | denied | denied | denied | denied | denied | 7/7 |
| `moazez_media_worker` | denied | denied | denied | denied | denied | denied | denied | 7/7 |
| Total | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 21/21 |

### Release failure injection

| Failing stage | Callbacks through failure | Later callbacks | Runtime promotions | Traffic promotions |
| --- | ---: | ---: | ---: | ---: |
| Artifact/checksum preflight | 1 | 0 | 0 | 0 |
| Backup/data-authority checkpoint | 2 | 0 | 0 | 0 |
| Migration Job | 3 | 0 | 0 | 0 |
| Migration status/drift verification | 4 | 0 | 0 | 0 |
| Protected readiness/smoke | 9 | 0 | 4 completed earlier | 0 |

Core Worker failure also prevents Media Worker, API, Maintenance Scheduler, and
traffic. API no-traffic promotion never implies traffic promotion. Traffic is
invoked only after protected readiness/smoke succeeds.

## Tests, redaction, scope, and cleanup

- Focused Node contract/unit tests: `46 passed, 0 failed, 0 skipped`.
- Host Nest build with Node `v22.23.1`: `PASS`.
- `git diff --check`: `PASS`.
- Protected scope: Prisma schema, all seven migrations, `package-lock.json`,
  dependencies, `src`, public APIs, queues, runtime consumers/schedules, and
  runtime ownership unchanged.
- Forbidden migration command execution counts: seed `0`, db push `0`, db
  execute `0`, migrate reset `0`, migrate resolve `0`, migrate dev `0`.
- Structured JSON log redaction: `PASS`; serialized runner events emit
  approval, backup, and data-authority references only as deterministic SHA-256
  hashes and expose only the non-sensitive database policy result
  `dedicated-migration-role`. No raw database username, database URL, hostname,
  password, `DATABASE_URL` label, or raw governance reference appeared.
- Final cleanup: containers `0`, networks `0`, images `0`, volumes `0`,
  processes `0`, temporary directories `0`.

## Failure policy

The first failed preflight, checkpoint, migration, verification, runtime,
readiness, smoke, or traffic stage stops the serial sequence. Migration or
verification failure invokes zero runtime promotion callbacks. Smoke failure
invokes zero traffic-promotion callbacks. Automatic retry, automatic schema
rollback, reset, resolution, schema push, direct-SQL bypass, and seed execution
are absent.

## Known limitations

- No actual Cloud Run Job is provisioned in Phase 3.
- No Google Cloud service account or IAM binding is created in Phase 3.
- No production or staging database is accessed.
- No production backup or PITR drill is claimed.
- No real runtime rollout is performed.
- Phase 8 will wire the contract to Terraform and CI/CD.
- Phase 4 will complete cloud service-identity and secret management controls.
- G05 must approve the data branch before production data-bearing execution.

Phase 3 does not implement or claim a full production deployment pipeline.
