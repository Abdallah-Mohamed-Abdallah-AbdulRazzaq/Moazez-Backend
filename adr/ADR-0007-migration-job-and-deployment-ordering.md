# ADR-0007: Migration Job and Deployment Ordering

## Status

Accepted

## Approval authority

- Owner: Abdallah
- ApprovedAt: `2026-08-07T00:22:00+03:00`
- Timezone: Africa/Cairo
- Approval capacities: migration, rollback, architecture, operations, release
- Accepted owner question: PRD0-Q026 option A
- Owned decisions: PRD0-D026 and PRD0-D027
- Implementation gate: PRD3-G04

## Context

The production runtime roles share one repository and one immutable application
image contract. API, Core Worker, and Media Worker use restricted database
identities; the Maintenance Scheduler is database-free. Schema mutation must
therefore run as a separate, auditable gate before any runtime candidate is
promoted, without placing migration authority in application startup or a
runtime identity.

ADR-0007 was reserved for the Migration Job and deployment-ordering decision.
It owns PRD0-D026, PRD0-D027, PRD0-Q026, and PRD3-G04. ADR-0010 remains solely
the Production Health and Observability Contract.

## Owner decision

```text
PRD0-Q026: option=A

approver:
Abdallah

migration_approver:
Abdallah

rollback_authority:
Abdallah

approval_timestamp:
2026-08-07T00:22:00+03:00
```

## Decision

### Migration runtime

One standalone Migration Job runs as a Cloud Run Job or an approved equivalent
implemented later. It uses the same immutable final application image digest
as the runtime candidate and overrides the image command with:

```text
node scripts/migrations/run-governed-migration-job.cjs
```

The runner validates the required `sha256` digest format but does not discover
its registry digest. The release orchestrator supplies the actual immutable
image digest and, in Phase 8, binds that digest to every runtime promotion. The
local G04 harness separately proves that the exact same built image ID runs the
Migration Job and provides the default runtime command.

The job uses only `moazez_migration`, with connection allowance 2, one task,
parallelism 1, zero automatic retries, and a 20-minute execution timeout.
Its database URL must select exactly one `schema=public` and cannot supply
`options` or `search_path` overrides. Seeds and Nest application bootstrap are
prohibited.

The only schema-mutating command is:

```text
prisma migrate deploy
```

Read-only validation is limited to `prisma validate`, `prisma migrate status`,
and a post-deploy `prisma migrate diff --exit-code` from the configured
datasource to `prisma/schema.prisma`. The runner uses the locally installed
Prisma 6 CLI directly. It accepts no caller-supplied Prisma arguments.

Before manifest verification, Prisma, or database access, the runner validates
its execution, environment, artifact, approval, backup, data-authority,
database-identity, and connection-limit contract. It then verifies the
embedded deterministic migration manifest. Migration SQL, schema, Prisma
config, or chain hash mismatch is a hard stop.

The runner enforces that approval, backup, and data-authority references are
bound to the current execution ID. Global uniqueness of execution IDs and
issuance of a genuinely new manual approval are deployment-orchestrator
responsibilities wired in Phase 8.

### Release order

The approved blocking sequence is:

1. Lock the immutable candidate image digest and committed migration checksums.
2. Pass the backup/PITR or signed disposable-environment N/A checkpoint.
3. Run one Migration Job as `moazez_migration` using the same image.
4. Execute `prisma migrate deploy`.
5. Verify migration status and zero post-deploy drift.
6. Promote Core Worker.
7. Promote Media Worker.
8. Promote API while production traffic remains unpromoted.
9. Promote Maintenance Scheduler after consumers are ready.
10. Run protected readiness and smoke checks.
11. Promote traffic only under the later PRD0-Q027/Phase 8 policy.

The platform-neutral release gate records start, success, or failure for each
stage and invokes operations serially. API promotion does not imply traffic
promotion.

### Failure and recovery

Any preflight, manifest, migration, status, drift, readiness, or smoke failure
blocks every later stage and traffic promotion. Drift, migration-history
divergence, checksum mismatch, failed migration history, and P3009 are hard
stops. There is no automatic retry, automatic schema rollback, down migration,
`migrate resolve`, reset, schema push, direct-SQL bypass, or seed execution.
A failed execution requires a new execution ID and a new manual approval
reference issued by the release orchestrator.

Recovery is a compatible forward-fix migration or an approved isolated restore
procedure. Artifact rollback is allowed only while the old artifact remains
compatible with the current schema and data.

## Consequences

- Runtime identities retain DML-only application privileges and cannot inspect
  `_prisma_migrations` or execute schema DDL.
- Migration authority is short-lived, separately approved, bounded to one job,
  and absent from all application bootstrap paths.
- The runner hashes governance references for structured output and maintains
  no persistent approval history.
- Release time increases because migration and verification are serial gates.
- A failed partial migration is preserved for investigation and forward-fix or
  approved restore; automation does not conceal or bypass it.

## Verification

PRD3-G04 requires focused contract/unit tests plus disposable PostgreSQL 16 and
same-final-image Docker evidence for fresh replay, second no-op, drift,
P3009/failed history, history divergence, manifest tampering, runtime DDL
denials, migration connection allowance, signal/timeout handling, structured
redaction, release failure injection, and exact cleanup. Evidence is recorded
in `docs/production-readiness/phase-3/07-governed-migration-job-evidence.md`.

## Compatibility and non-authorization

This decision changes no Prisma model, enum, schema, migration, public API,
DTO, queue, consumer, schedule, runtime ownership, dependency, lockfile,
database business table, production data, or cloud resource. It does not
provision a Cloud Run Job, Terraform, IAM, Secret Manager, service account,
staging database, production database, or deployment pipeline. Phase 8 wires
the contract to approved IaC and CI/CD after PRD0-Q027; Phase 4 owns cloud
identity and secret controls; PRD3-G05 must approve the data branch before
production data-bearing execution.
