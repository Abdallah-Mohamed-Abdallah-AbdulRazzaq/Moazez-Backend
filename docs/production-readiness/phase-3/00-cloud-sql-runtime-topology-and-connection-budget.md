# Phase 3 — Cloud SQL Runtime Topology and Connection Budget

## Document control

| Field | Value |
| --- | --- |
| Phase | `PHASE_3` |
| Gate | `PRD3-G01` |
| Subtask | `PRD3-G01-A` through `PRD3-G01-D-FUNCTIONAL` |
| Owner/approver | Abdallah |
| Approval date | 2026-08-04 |
| Timezone | Africa/Cairo |
| Status | `PRD3-G01=FUNCTIONALLY_COMPLETE`; `PRD3-G01-PROVIDER-CLEANUP=DEFERRED` |
| Architecture authority | ADR-0005 |
| Scope | Runtime policy, local evidence, and accepted real-provider R3 functional evidence; this closeout performs no cloud provisioning |

PRD3-G01 is functionally complete. This document retains the conservative
runtime baseline and records the accepted R3 real-provider proof alongside the
completed B1, B2-R1, B3, C, and C1 evidence. All R3 active and billable
resources were removed. Cleanup of the provider-retained R2 network path is
separately deferred and must be retried before PRD3-G06; it does not require
another Cloud SQL instance or failover.

## Approved Saudi production direction

The provisional initial database direction is:

- Saudi launch in `me-central2` (Dammam);
- PostgreSQL 16 on Cloud SQL Enterprise Plus;
- provisional `db-perf-optimized-N-2`, 2 vCPU, 16 GB machine;
- regional HA;
- private IP only with public database IP disabled;
- Direct VPC egress as the deployment direction;
- explicit encrypted transport for staging and production;
- no cross-region DR until separate residency approval.

Initial production data and primary managed services remain in Saudi Arabia.
Exact production sizing remains provisional beyond the bounded pool and
single-provider failover proof until production-shaped load evidence exists.
No Terraform, GCP resource, IAM, network, database, or other infrastructure is
created or changed by this documentation closeout.

## Runtime database boundary

API, Core Worker, and Media Worker use Prisma and each deployment receives a
different PostgreSQL user and URL value through the same `DATABASE_URL`
environment contract. No role-specific URL variable names are introduced.
Maintenance Scheduler remains database-free and rejects database fields.

| Deployment | Exact runtime role | Application name | Database configuration |
| --- | --- | --- | --- |
| API | `api` | `moazez-api` | required |
| Core Worker | `core-worker` | `moazez-core-worker` | required |
| Media Worker | `media-worker` | `moazez-media-worker` | required |
| Maintenance Scheduler | none | none | prohibited |

Migration Job remains separately governed and receives only the allowance in
the connection budget. PRD3-G01-C fixes its PostgreSQL login as
`moazez_migration` and proves that it can deploy and inspect the governed
Prisma chain without PostgreSQL administration privilege. It does not change
migrations, Migration Job deployment behavior, schema, or deployment ordering.

The exact PostgreSQL identities and grants are:

| Deployment | PostgreSQL login | Effective database authority |
| --- | --- | --- |
| API | `moazez_api` | application DML only |
| Core Worker | `moazez_core_worker` | application DML only |
| Media Worker | `moazez_media_worker` | application DML only |
| Migration Job | `moazez_migration` | target-database/application-schema governed DDL |

Runtime DML is database `CONNECT`, schema `USAGE`, table `SELECT, INSERT,
UPDATE, DELETE`, and sequence `USAGE, SELECT`. Runtime identities have no DDL,
ownership, grant option, administration, cross-role membership or
impersonation, or `_prisma_migrations` access. Migration-owned default
privileges retain that exact runtime set for future tables and sequences. The
migration identity's target-database `CREATE` ACL is distinct from the forbidden
PostgreSQL `CREATEDB` role attribute and is required by the committed baseline's
schema statement.
Maintenance Scheduler remains database-free.

The existing immutable, data-free Learning Media original-name normalizer is a
reviewed exception: its table CHECK constraint requires the default PUBLIC
execution path for application DML. Runtime identities have no direct function
ACL, and migration-owned future functions default to no PUBLIC/runtime execute
authority pending explicit privilege review.

## Immutable runtime policy

| Role | Max instances | Default/max connections | Default/max pool timeout (s) | Default/max connect timeout (s) |
| --- | ---: | ---: | ---: | ---: |
| API | 4 | 5 | 5 | 5 |
| Core Worker | 2 | 6 | 10 | 5 |
| Media Worker | 2 | 3 | 10 | 5 |

Maximum instances are service aggregates, not per-revision allowances:

```text
APPROVED_MAX_INSTANCES_SCOPE=
aggregate concurrent instances per runtime service across all active revisions

sum(instances across every active revision of one runtime)
<= approved max instances for that runtime
```

Immutable policy metadata uses
`instanceLimitScope=service-aggregate-across-active-revisions` and
`fullCapRevisionOverlapAllowed=false`. The aggregate caps are API 4, Core
Worker 2, and Media Worker 2 across every simultaneously active revision. A
canary, rollback, traffic split, or prior revision consumes part of that same
cap and does not receive an independent full allowance.

Future deployment configuration should prefer a service-level maximum across
active revisions. If a platform or IaC uses revision-level limits, the sum of
all active revision limits must remain within the approved service aggregate.
Two revisions may not both use the full approved maximum. Increasing rollout
overlap requires a recalculated owner-approved connection budget and
saturation evidence. This is a future deployment requirement only; no
Terraform or Cloud Run configuration is implemented here.

The non-secret controls are:

```text
DATABASE_RUNTIME_ROLE
DATABASE_CONNECTION_LIMIT
DATABASE_POOL_TIMEOUT_SECONDS
DATABASE_CONNECT_TIMEOUT_SECONDS
```

Each numeric override must be an integer between 1 and its role's default,
inclusive. Overrides can lower a default but cannot exceed the approved role
maximum. Zero, negative values, decimals, unbounded timeouts, and incorrect
runtime roles are rejected.

The raw datasource URL must use `postgresql:` or `postgres:` and contain a
non-empty username, password, hostname, and database pathname. Local and test
URLs may omit TLS configuration. Prisma ORM 6.19.3 supports PostgreSQL
`sslmode=prefer`, `sslmode=disable`, and `sslmode=require`; any supplied mode
must be one of those values and must occur only once. Staging and production
require exactly one `sslmode=require`.

Runtime construction preserves unrelated URL components and approved
Prisma-supported parameters including `schema`, `sslcert`, `sslrootcert`,
`sslidentity`, `sslpassword`, and `sslaccept`, then adds exactly:

```text
connection_limit
pool_timeout
connect_timeout
application_name
```

If the raw URL already includes any application-managed parameter, validation
fails rather than accepting two sources of truth. Error messages name only the
invalid field or policy violation and must not expose URLs, credentials,
usernames, passwords, hostnames, database names, certificate paths, or query
strings. The constructed URL is not logged. R3 proved `ENCRYPTED_ONLY` Cloud
SQL transport and active TLS; it did not separately claim client-side CA or
hostname verification beyond that accepted provider evidence.

The current health startup scenario deliberately uses a disposable non-TLS
PostgreSQL fixture with `NODE_ENV=test`. The API also sets
`MEDIA_RUNTIME_ENFORCE_IN_TEST=true`, preventing test-mode bypass of ffprobe
startup verification. This scenario proves runtime wiring and readiness, not
production TLS behavior.

## Connection-budget proof

| Allocation | Calculation | Connections |
| --- | --- | ---: |
| API | `4 × 5` | 20 |
| Core Worker | `2 × 6` | 12 |
| Media Worker | `2 × 3` | 6 |
| Migration | `1 × 2` | 2 |
| Operations reserve | fixed | 10 |
| Application and operations allocation | sum | 50 |
| Failover/emergency reserve | fixed | 50 |
| Governed total | `50 + 50` | 100 |

Static policy code and focused tests assert:

```text
(4 × 5) + (2 × 6) + (2 × 3) + 2 + 10 = 50
50 allocated + 50 reserve = 100
```

The failover/emergency reserve is not normal application or rollout capacity.
An increase in aggregate active-revision instances, connection limits,
concurrency, or rollout overlap requires measured pool wait,
transaction-duration, provider-failover, and recovery evidence.

## Accepted real-provider R3 evidence

R3 completed the functional Cloud SQL proof with this classification:

```text
PRD3-G01-D-R3=FUNCTIONAL_PASS_CLEANUP_DEFERRED
FUNCTIONAL_PROOF_COMPLETE=YES
ACTIVE_RESOURCE_CLEANUP_COMPLETE=YES
NETWORK_CLEANUP_COMPLETE=NO
CLEANUP_STATE=DEFERRED_BY_PROVIDER_RETENTION
```

The functional Cloud SQL proof passed, active/billable cleanup passed, and only
provider network cleanup is deferred.

The disposable real-provider instance proved PostgreSQL 16, Enterprise Plus,
`db-perf-optimized-N-2`, `me-central2`, `REGIONAL` availability with
provider-managed zones, 10 GB SSD, private IP only, public IP disabled,
`ENCRYPTED_ONLY`, `max_connections=100`, and deletion protection disabled.

The primary changed from `me-central2-b` to `me-central2-a`. The maximum
observed database outage and readiness outage were each 10.847 seconds. This is
one measured provider-test result, not a guaranteed SLO. The original probe
process identifiers remained unchanged, process-local liveness remained
healthy, readiness failed and recovered, and the same processes reconnected.
The committed marker survived, the deliberately uncommitted marker was absent,
and post-recovery read/write passed. TLS and private connectivity were retained.

The maximum observed application connection count was 4 against the governed
application limit of 50. The 50-connection emergency reserve was not consumed
as steady-state capacity. Maintenance Scheduler database sessions remained
zero.

All R3 Cloud SQL instances, VMs, disks, firewalls, external IPs, containers,
processes, candidate archives, credential files, and temporary scripts were
removed. Cloud SQL deletion completed at `2026-08-06T00:53:00.0836906Z`.
Producer retention still holds one task-owned R2 VPC, subnet, PSA allocation,
and Service Networking connection. They have zero attached VMs, firewalls,
routers, or forwarding rules and retain zero billable compute. A cleanup-only
retry after provider release is required before PRD3-G06; provider release time
is not guaranteed.

## Owner-delegated pilot assumptions

### PRD0-Q003 — option B

| Input | Approved value |
| --- | ---: |
| Tenants | 10 |
| Users | 25,000 |
| Peak RPS | 200 |
| WebSockets | 5,000 |
| Media concurrency | 4 |
| Upload p95 | 25 MiB |
| Upload maximum | 200 MiB |
| 12-month growth | 3x |

| Queue | Jobs/minute |
| --- | ---: |
| `communication-notifications` | 60 |
| `communication-notification-push` | 1,000 |
| `school-email-delivery` | 300 |
| `files-imports` | 10 |
| `dismissal-request-expiry` | 5 |
| `learning-media-cleanup` | 50 |
| `settings-branding-logo-cleanup` | 10 |

### PRD0-Q006 — option A

- Primary region: `me-central2`.
- DR region: `NONE`.
- Residency constraint: Initial production data and primary managed services
  remain in Saudi Arabia; cross-region DR requires separate residency approval.

### PRD0-Q014

- API pool 5; Core Worker pool 6; Media Worker pool 3.
- Migration pool 2; operations reserve 10; maximum total 100.

### PRD0-Q015

- API: min 1, max 4, concurrency 40.
- Core Worker: min 1, max 2, concurrency 1 per assigned consumer.
- Media Worker: min 1, max 2, concurrency 1.

Abdallah approved Q003, Q006, Q014, and Q015 during Phase 3 on 2026-08-04
(Africa/Cairo). These values are provisional pilot assumptions, not final
load-tested capacity. Q012, Q013, and Redis decisions are unchanged and belong
to PRD3-G02.

## Prisma construction behavior

`PrismaModule` owns a required dependency-injection provider for bounded
Prisma client options. Its factory reads already validated `ConfigService`
values, builds the role-aware datasource URL, and supplies only
`datasourceUrl`. `PrismaService` injects those options and passes them to the
Prisma constructor. It does not read environment state or log the URL.

A safe empty default exists solely for direct lifecycle-test construction with
`new PrismaService()`. Production dependency injection remains required; it is
not marked optional.

## Pool-pressure inventory after PRD3-G01-B1-FINAL

PRD3-G01-B1-FINAL completed three fail-closed live rehearsals and two
independent disposable PostgreSQL 16 runs for raw
Prisma pool saturation, exact P2024 timing, same-client recovery, aggregate
20/12/6/38 sessions, disconnect cleanup, and new-client pool reduction. The
measured evidence is in
`01-prisma-pool-saturation-and-budget-evidence.md`.
The corrected harness pins a verified local Docker endpoint, disables implicit
image pulls, executes the pre-inspected fixture image by immutable ID, creates
an internal disposable network, uses hard child-process escalation, and
requires fail-closed exact-name plus current-run-label Docker inspection. Its
schema-v5 summaries are published atomically only after bounded two-phase
Prisma disconnect, process-tree termination, exact-name and label cleanup,
image verification, and zero scratch-file checks. The owned internal network
is not an internal-only fixture: its owned PostgreSQL container is temporarily
multi-homed to the verified local built-in bridge to activate Docker Desktop
loopback publishing. These final runs supersede all B1, B1-R1, and B1-R2 draft
candidates.

PRD3-G01-B3 local transaction-pressure evidence is complete for:

- Learning Media transaction: 15-second timeout.
- Teacher Lifecycle transaction: 30-second Serializable timeout.
- Lesson Content transaction: 30-second timeout.
- Lesson Content Playback uses two bounded 15-second authorization/snapshot
  transactions with signed capability creation between them and exposes the
  capability only after an unchanged final snapshot.

The corrected 174-site inventory, actual production entry-class scenarios,
full 5/2/1 readiness matrix, live failure rehearsals, and two canonical formal
runs are in
`03-business-transaction-pressure-and-cutback-evidence.md`.
The R4 closeout fails closed on unknown/known-business Serializable errors,
sequential Teacher execution, contradictory cross-field summaries, catalog-
copied or non-recomputable fault receipts, untracked bounded operations,
unmeasured final audits, cleanup residue before driver publication, and abort
during PostgreSQL/container/loopback polling.

## Rollback and cutback constraints

The runtime configuration can cut back to a previously compatible artifact
and lower instance/concurrency/pool caps after draining in-flight work and
connections. Pool reduction must retain the Migration allowance and operations
reserve.

Cloud SQL topology cutback is data-bearing and requires a declared single
writer or write freeze, connection drain, integrity/reconciliation proof,
approved recovery ownership, and a tested abort point. Public-IP fallback,
uncoordinated dual writers, destructive schema rollback, or routine use of the
failover reserve is prohibited.

## Gate evidence and deferred closeout

PRD3-G01-A supplies the immutable runtime policy, environment validation,
bounded Prisma construction, scheduler-negative ownership tests, static budget
proof, ADR-0005, and governance amendments.

PRD3-G01-B1-FINAL supplies deterministic local evidence from the actual Prisma
6.19.3 pools against disposable PostgreSQL 16. Two complete runs observed exact
default maxima 5/6/3, aggregate maxima 20/12/6/38, exact P2024 codes, bounded
waits, recovery, lower new-client pools, and zero residual owned resources
after successful fail-closed inspection and label-verified cleanup.
It does not supply Cloud Run or Cloud SQL provider evidence.

PRD3-G01-B2-R1 supplies one canonical final-suite execution containing three
failure rehearsals and two independent canonical-runtime runs against fresh
disposable PostgreSQL 16 fixtures. It proves readiness 503 with bounded callers
during two stalls, startup/liveness/public-health continuity, unchanged runtime
identity, same-process recovery, forced established-session replacement, exact
application names, no per-runtime pool overshoot, unavailable-at-start
fail-closed behavior, successful fresh startup after recovery, bounded
unavailable/recovered logging, signal rehearsals, and verified zero-session and
zero-resource cleanup. The archived baseline commit/tree, runtime manifest,
host/runtime Prisma 6.19.3 identities, two-phase tracked observer teardown,
interruption-safe atomic publication, exact two-cycle schema, and executable
29/29 proof coverage are recorded with the corrected formal summary hashes.
The pre-review B2 candidate is superseded. Exact measurements are in
`02-database-outage-readiness-and-reconnect-evidence.md`. It does not supply
Cloud Run, Cloud SQL, production transport, privilege, SLO, or
business-transaction evidence.

PRD3-G01-C and C1 supply the exact four PostgreSQL identities, idempotent
bootstrap/current/default grant policies, migration-owned object proof,
positive API/Core/Media Prisma DML and rollback evidence, the complete runtime
DDL/administration denial matrix, `_prisma_migrations` denial, all cross-role
membership and `SET ROLE` denials, and zero-resource cleanup against one fresh
disposable PostgreSQL 16 fixture. C1 additionally proves the fail-closed,
password-only bootstrap through a managed-administrator-like non-superuser.
The evidence is in
`04-database-identities-and-least-privilege-evidence.md`.

PRD3-G01-D R3 supplies the accepted real-provider functional proof. The
corrected bootstrap and password rotation passed twice, Prisma deploy/status/
no-op deploy passed as `moazez_migration`, the three runtime roles passed their
positive DML transactions and 57/57 administration/DDL denials, and the
regional failover proved same-process recovery and transaction durability.

Still deferred is one cleanup-only retry for the provider-retained R2 VPC,
subnet, PSA allocation, and Service Networking connection. It must complete
before PRD3-G06 and requires neither another Cloud SQL instance nor another
failover.

Accordingly, PRD3-G01 is `FUNCTIONALLY_COMPLETE`, its provider cleanup is
`DEFERRED`, Phase 3 remains active, and the next implementation gate is
PRD3-G02.

## Contract attestation

PRD3-G01-A changes no API route, method, DTO, status, response, authorization,
tenancy, guard, school scope, queue/job name, ID, retry, worker concurrency,
Redis configuration, storage behavior, Learning Media synchronous HTTP 200
completion, runtime consumer/scheduler ownership, Maintenance Scheduler
database ownership, transaction/business logic, Prisma schema, migration,
dependency, lockfile, Docker runtime policy, workflow, or cloud resource.
