# Phase 3 — Cloud SQL Runtime Topology and Connection Budget

## Document control

| Field | Value |
| --- | --- |
| Phase | `PHASE_3` |
| Gate | `PRD3-G01` |
| Subtask | `PRD3-G01-A` through `PRD3-G01-C` |
| Owner/approver | Abdallah |
| Approval date | 2026-08-04 |
| Timezone | Africa/Cairo |
| Status | `BASELINE_ONLY` |
| Architecture authority | ADR-0005 |
| Scope | Local runtime policy, tests, and governance only; no cloud provisioning |

PRD3-G01 is not complete. This document locks a conservative implementation
baseline. Corrected local raw Prisma pool saturation/recovery evidence is
recorded in PRD3-G01-B1-FINAL. PRD3-G01-B2-R1 local runtime outage/reconnect,
PRD3-G01-B3 local business-transaction pressure/cutback, and PRD3-G01-C local
database-identity/least-privilege evidence are complete. Real Cloud SQL
failover, exact-candidate CI, merge, and post-merge closeout remain pending.

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
Exact machine sizing is provisional until pool saturation and provider
failover evidence is complete. No Terraform, GCP resource, IAM, network,
database, or other infrastructure is created or changed by PRD3-G01-A.

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
strings. The constructed URL is not logged. Preserving certificate-related
parameters does not prove CA or hostname verification; real Cloud SQL
certificate and transport behavior remains PRD3-G01-D evidence.

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

PRD3-G01-C supplies the exact four PostgreSQL identities, idempotent
bootstrap/current/default grant policies, migration-owned object proof,
positive API/Core/Media Prisma DML and rollback evidence, the complete runtime
DDL/administration denial matrix, `_prisma_migrations` denial, all cross-role
membership and `SET ROLE` denials, and zero-resource cleanup against one fresh
disposable PostgreSQL 16 fixture. The evidence is in
`04-database-identities-and-least-privilege-evidence.md`. It does not provision
Cloud SQL users, IAM, secrets, Terraform, or Migration Job infrastructure.

Still deferred:

- **PRD3-G01-D:** real Cloud SQL regional failover, reconnect behavior,
  failover-budget measurement, exact-candidate CI including
  `npm run verify:prd3-g01-a`, review, merge, and post-merge closeout.

No PRD3-G01 completion claim is made until those evidence sets pass.

## Contract attestation

PRD3-G01-A changes no API route, method, DTO, status, response, authorization,
tenancy, guard, school scope, queue/job name, ID, retry, worker concurrency,
Redis configuration, storage behavior, Learning Media synchronous HTTP 200
completion, runtime consumer/scheduler ownership, Maintenance Scheduler
database ownership, transaction/business logic, Prisma schema, migration,
dependency, lockfile, Docker runtime policy, workflow, or cloud resource.
