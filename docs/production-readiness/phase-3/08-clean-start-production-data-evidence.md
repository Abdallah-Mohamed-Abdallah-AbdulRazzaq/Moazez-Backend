# PRD3-G05 Clean-Start Production Data Evidence

## Candidate identity and approved branch

- Gate: `PRD3-G05`
- Base SHA: `10be00c51eba72bbdfe9591eb0e00399402100ef`
- Branch: `chore/production-readiness-3-cloud-sql`
- Q004 result: `PRD0-Q004=APPROVED`, `OPTION=A`
- Production data branch: `CLEAN_START`
- D029 disposition: `PRD0-D029=LOCKED_FROM_APPROVED_CONTEXT`
- Owning ADR:
  `adr/ADR-0006-production-data-source-object-storage-and-signed-capability-boundary.md`
- Approver: Abdallah
- Data authority: Abdallah
- Approved timestamp: `2026-08-07T04:46:00+03:00`
- Candidate state: `PRD3-G05=IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE`

## Owner/data-authority source attestation

The accepted statement is:

> There is currently no real authoritative Production PostgreSQL database,
> Production object source, or Production business/user history that must be
> migrated or preserved before the first real Moazez production launch.

| Evidence item | Result |
| --- | --- |
| Evidence classification | `OWNER_DATA_AUTHORITY_ATTESTATION` |
| Authoritative PostgreSQL source count | `0` |
| Authoritative object source count | `0` |
| Persisted PostgreSQL migration | `N/A_WITH_EVIDENCE` |
| Object migration | `N/A_WITH_EVIDENCE_FOR_CURRENT_PRODUCTION_SOURCE` |
| Source retention | `N/A_AFTER_ZERO_SOURCE_EVIDENCE` |
| Migration cutback | `N/A_AFTER_ZERO_SOURCE_EVIDENCE` |
| Redis copy allowed | `false` |
| Redis recovery | drain/reconcile/re-enqueue from persisted truth; ephemeral realtime state is rebuilt |
| Reopen on later data discovery | `true` |

The owner/data-authority attestation proves that no current authoritative
source requires preservation. The local G05 evidence proves the clean target
path. It does not claim that Phase 3 scanned every external cloud account.

Any later discovery of real pre-production or production data that must be
preserved automatically reopens PRD0-Q004 / PRD0-D029 before cutover. The
clean-start decision is not permission to delete a later-discovered source.

## Machine-readable contracts

- Production branch contract:
  `config/deployment/production-data-branch.contract.json`
- Production seed inventory:
  `config/deployment/production-seed-inventory.json`
- Contract version / inventory version: `1 / 1`
- Approved Production seed sources: `2`
- Prohibited existing seed sources: `3`
- Prohibited generic Production execution paths: `4`

## Production-safe reference seed inventory

Exactly these existing exported functions are approved for Production
reference bootstrap:

| Source | Export | Classification | Rows it may create |
| --- | --- | --- | --- |
| `prisma/seeds/01-permissions.seed.ts` | `seedPermissions` | deterministic authorization reference data | `Permission` |
| `prisma/seeds/02-system-roles.seed.ts` | `seedSystemRoles` | deterministic RBAC reference data | `Role`, `RolePermission` |

They must not create `User`, `Organization`, `School`, student/business
history, communication history, file/object history, or academic/demo history.

The following existing seed sources are prohibited from Production bootstrap:

| Source | Reason |
| --- | --- |
| `prisma/seeds/03-platform-admin.seed.ts` | creates a development bootstrap user with fixed development credentials and is not production-safe |
| `prisma/seeds/04-demo-org.seed.ts` | demo organization, school, and user data |
| `prisma/seeds/05-demo-academics.seed.ts` | demo academic and business data |

The Production execution paths `npm run seed`, `prisma db seed`,
`prisma/seeds/index.ts`, and `SEED_DEMO_DATA=true` are prohibited. The generic
seed index invokes `seedPlatformAdmin()` even when demo-data mode is disabled.
No credential value is reproduced or hashed in this evidence.

Initial secure Production Platform Admin provisioning is a separate Phase 8
release/bootstrap concern and must not use the current fixed development
credential seed. This follow-up is not a G05 blocker.

## Disposable clean-target proof

One bounded final verifier run uses one newly created disposable local
PostgreSQL 16 container from an already-present immutable image ID. It uses a
unique exact container name, ownership labels, a random loopback-only port,
bounded startup, tmpfs database storage, no persistent volume, and exact
cleanup. No image pull is permitted.

The database is newly created for G05. Before the governed migration runner:

| Clean-target precondition | Result |
| --- | ---: |
| Public application tables | `0` |
| Legacy application rows | `0` |
| Source database copies | `0` |
| SQL dumps imported | `0` |
| Object sources copied | `0` |
| Redis data copied | `0` |

The accepted G01/G04 disposable migration-role bootstrap is reused without
modification. The runner receives database identity `moazez_migration`, URL
`connection_limit=2`, and exactly one `schema=public`.

## Existing G04 governed migration replay

G05 invokes only the existing
`scripts/migrations/run-governed-migration-job.cjs` with a valid disposable
environment contract. It does not duplicate or bypass the G04 implementation.

| Migration proof | Result |
| --- | --- |
| Migration result | `migration_applied` |
| Migration count | `7` |
| `prisma migrate status` | `PASS` |
| Post-deploy drift | `ZERO` |
| Seed executions inside Migration Job | `0` |
| Nest/runtime bootstrap executions | `0` |

## Approved reference bootstrap and row scope

After migration succeeds, the verifier loads the existing TypeScript modules
through the installed local `ts-node` development toolchain and calls only
`seedPermissions` and `seedSystemRoles`. It does not use the generic seed
index, `npm run seed`, or `prisma db seed`, and it does not enable demo mode.

| Post-seed proof | Result |
| --- | ---: |
| Non-zero application tables | `Permission`, `Role`, `RolePermission` |
| Non-zero metadata table | `_prisma_migrations` |
| Permission rows | `236` |
| System Role rows | `7` |
| RolePermission rows | `847` |
| User rows | `0` |
| Organization rows | `0` |
| School rows | `0` |
| All other business-row total | `0` |
| Platform-admin seed executions | `0` |
| Demo-seed executions | `0` |

The verifier discovers every current TypeScript file under `prisma/seeds/` and
requires an exact approved or prohibited classification. It fails for an
unclassified new seed, a missing approved seed, a silently approved prohibited
seed, approval of platform-admin/demo data, or approval of the generic index.

## Tests, protected scope, and cleanup

- Focused Node contract/static tests: `12 passed, 0 failed, 0 skipped`.
- Approved Node: `v22.23.1` from the project-approved toolchain path.
- Host Nest build: `PASS`.
- `git diff --check`: `PASS`.
- Prisma schema changes: `0`.
- Migration-file changes: `0`.
- Seed-source changes: `0`.
- Dependency and lockfile changes: `0`.
- Public API, queue/runtime ownership, workflow, Dockerfile, and cloud/IaC
  changes: `0`.
- Cloud access and cloud mutations: `0`.
- Final owned cleanup: containers `0`, networks `0`, volumes `0`, processes
  `0`, temporary directories `0`.

## Known limitations

- No external production source was scanned because the owner/data authority
  explicitly states that no authoritative production source currently exists.
- No production or staging database was accessed.
- No production object storage was accessed.
- No cloud resources were accessed.
- If real data is discovered later, Q004/D029 reopens before cutover.
- Secure initial Platform Admin provisioning is not performed by the current
  development seed and remains a Phase 8 bootstrap concern.

G05 does not implement PostgreSQL source copy, object copy, Redis copy,
freeze/delta, cutback, production deployment infrastructure, source deletion,
or physical cleanup. Phase 3 remains open because PRD3-G06 is pending.
