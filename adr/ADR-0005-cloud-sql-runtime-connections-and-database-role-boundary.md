# ADR-0005: Cloud SQL Runtime Connections and Database Role Boundary

## Status

Accepted as a provisional Phase 3 baseline — 2026-08-04

## Approval authority

- Owner: Abdallah
- Approval date: 2026-08-04
- Timezone: Africa/Cairo
- Approval capacities: product, architecture, security, operations, release
- Accepted owner questions: PRD0-Q003, PRD0-Q006, PRD0-Q014, PRD0-Q015

## Context

API, Core Worker, and Media Worker are database-backed production roles. The
Maintenance Scheduler has no database ownership, and the separately governed
Migration Job needs a small connection allowance without sharing runtime DDL
authority. Prisma defaults combined with instance scaling could otherwise
consume the database connection ceiling during normal operation or failover.

The approved capacity values are a conservative Saudi launch pilot envelope.
They establish bounded inputs for implementation and testing but are not final
load-tested capacity. Saturation, recovery, least-privilege, and real provider
failover evidence remain mandatory.

## Decision

### Cloud SQL topology baseline

The initial production database is PostgreSQL 16 on Cloud SQL Enterprise Plus
in Saudi Arabia, region `me-central2` (Dammam), with regional HA. The
provisional initial machine is `db-perf-optimized-N-2` with 2 vCPU and 16 GB.
Sizing may change only through measured evidence and governance review.

Connectivity is private IP only. Public database IP is disabled. Direct VPC
egress is the deployment direction, and staging/production connections require
an explicit encrypted PostgreSQL transport policy. Initial production data and
primary managed services remain in Saudi Arabia. The DR region is `NONE`;
cross-region DR requires separate residency approval.

This ADR does not provision Cloud SQL, VPC, IAM, Secret Manager, Terraform, or
any other cloud resource.

### Database role boundary

Every database-backed deployment uses the same environment-variable name,
`DATABASE_URL`. Deployment environments supply a different URL value and a
different PostgreSQL user for API, Core Worker, Media Worker, and the
separately governed Migration Job. Role-specific URL variable names are not
introduced.

The validated runtime roles and application names are exact:

| Deployment | Runtime role | Application name | Database access |
| --- | --- | --- | --- |
| API | `api` | `moazez-api` | Yes |
| Core Worker | `core-worker` | `moazez-core-worker` | Yes |
| Media Worker | `media-worker` | `moazez-media-worker` | Yes |
| Maintenance Scheduler | none | none | No |

Maintenance Scheduler neither accepts nor returns database configuration.
Migration Job behavior, DDL authority, and deployment ordering remain governed
separately; this ADR grants only its connection-budget allowance.

### Runtime connection policy

One immutable policy owns role defaults, maximums, application names, and
budget metadata:

| Role | Max instances | Connection limit | Pool timeout (s) | Connect timeout (s) |
| --- | ---: | ---: | ---: | ---: |
| API | 4 | 5 | 5 | 5 |
| Core Worker | 2 | 6 | 10 | 5 |
| Media Worker | 2 | 3 | 10 | 5 |

The maximum-instance scope is explicit:

```text
APPROVED_MAX_INSTANCES_SCOPE=
aggregate concurrent instances per runtime service across all active revisions
```

Policy metadata records
`instanceLimitScope=service-aggregate-across-active-revisions` and
`fullCapRevisionOverlapAllowed=false`. For each runtime, the invariant is:

```text
sum(instances across every active revision of one runtime)
<= approved max instances for that runtime
```

API is therefore capped at 4 aggregate concurrent instances across revisions,
Core Worker at 2, and Media Worker at 2. A canary, rollback, traffic split, or
prior revision consumes part of the same service aggregate; it does not gain a
second independent cap.

Future deployment configuration should prefer a service-level maximum that
applies across active revisions. If the platform or IaC exposes only
revision-level limits, the sum of every active revision limit must remain
within the approved runtime maximum. Two revisions may not both use the full
approved maximum. Increasing rollout overlap requires a recalculated,
owner-approved connection budget and saturation evidence. The 50-connection
failover/emergency reserve is not rollout capacity.

The non-secret runtime controls are `DATABASE_RUNTIME_ROLE`,
`DATABASE_CONNECTION_LIMIT`, `DATABASE_POOL_TIMEOUT_SECONDS`, and
`DATABASE_CONNECT_TIMEOUT_SECONDS`. Each is a positive integer where
applicable. A runtime override may only lower its role's default connection
limit or timeout, with a safe minimum of 1 and a maximum equal to that role's
approved default. Zero, negative, decimal, unbounded, incorrect-role, and
above-maximum values are rejected.

The application builds the Prisma PostgreSQL datasource URL after validation.
It accepts only `postgresql:` or `postgres:` and requires non-empty username,
password, hostname, and database pathname components. It preserves unrelated
components and approved parameters such as `schema`, `sslcert`, `sslrootcert`,
`sslidentity`, `sslpassword`, and `sslaccept`, and sets exactly
`connection_limit`, `pool_timeout`, `connect_timeout`, and `application_name`.
A raw URL containing any of those four application-managed parameters is
rejected so that configuration has one source of truth.

Prisma ORM 6.19.3 supports PostgreSQL `sslmode` values `prefer`, `disable`, and
`require`. Local/test database URLs may omit `sslmode`; if supplied, it must be
one of those Prisma-supported values and may occur only once. Staging and
production require exactly one `sslmode=require`. The certificate-related URL
parameters are preserved as configuration, but this baseline does not claim
that CA or hostname verification has been proven. Errors and logs must never
reveal a URL, credential, username, password, hostname, database name,
certificate path, or query string.

The health-probe startup scenario uses a disposable non-TLS PostgreSQL fixture
under `NODE_ENV=test`. The API explicitly sets
`MEDIA_RUNTIME_ENFORCE_IN_TEST=true` so ffprobe startup verification still
executes. That fixture is runtime-wiring evidence only; real Cloud SQL
certificate and transport behavior remains PRD3-G01-D evidence.

### Governed connection budget

| Allocation | Calculation | Connections |
| --- | --- | ---: |
| API | `4 × 5` | 20 |
| Core Worker | `2 × 6` | 12 |
| Media Worker | `2 × 3` | 6 |
| Migration allowance | `1 × 2` | 2 |
| Operations reserve | fixed | 10 |
| Application and operations allocation | sum | 50 |
| Failover/emergency reserve | fixed | 50 |
| Governed total | `50 + 50` | 100 |

The static assertion is therefore
`(4 × 5) + (2 × 6) + (2 × 3) + 2 + 10 = 50`, with 50 allocated plus 50
failover/emergency reserve equal to 100. The reserve is neither steady-state
nor rollout capacity.

### Owner-delegated launch pilot envelope

PRD0-Q003 option B approves 10 tenants, 25,000 users, 200 peak RPS, 5,000
WebSockets, media concurrency 4, upload p95 25 MiB, upload maximum 200 MiB,
and 3x growth over 12 months. Approved queue jobs per minute are:

| Queue | Jobs/minute |
| --- | ---: |
| `communication-notifications` | 60 |
| `communication-notification-push` | 1,000 |
| `school-email-delivery` | 300 |
| `files-imports` | 10 |
| `dismissal-request-expiry` | 5 |
| `learning-media-cleanup` | 50 |
| `settings-branding-logo-cleanup` | 10 |

PRD0-Q015 approves API min 1/max 4/concurrency 40; Core Worker min 1/max
2/concurrency 1 per assigned consumer; and Media Worker min 1/max 2/
concurrency 1. These are deployment pilot assumptions, not authorization to
change application queue concurrency in this subtask.

## Owned production decisions

| Decision | Owning question | Decision-level status |
| --- | --- | --- |
| PRD0-D011 | PRD0-Q006 | Accepted, provisional sizing |
| PRD0-D012 | PRD0-Q014 | Accepted; local Prisma pool proof complete, provider evidence pending |
| PRD0-D030 | PRD0-Q015 | Accepted, pilot envelope |
| PRD0-D031 | PRD0-Q003 | Accepted, pilot envelope |

This ADR is the sole authoritative owner of PRD0-D011, PRD0-D012, PRD0-D030,
and PRD0-D031. Q012, Q013, and Redis decisions are unchanged and remain owned
elsewhere.

## Transaction saturation inputs

PRD3-G01-B1-FINAL proves the exact raw Prisma pool limits, P2024 wait behavior,
recovery, aggregate 38-runtime-connection envelope, disconnect cleanup, and
new-client pool reduction in
`docs/production-readiness/phase-3/01-prisma-pool-saturation-and-budget-evidence.md`.
PRD3-G01-B3 exercised these business-transaction pressure inputs:

- Learning Media transaction: 15-second timeout.
- Teacher Lifecycle transaction: 30-second Serializable timeout.
- Lesson Content transaction: 30-second timeout.
- Lesson Content Playback signs between two bounded authorization/snapshot
  transactions and revalidates before capability exposure.

The transaction timeouts remain explicit load-test inputs. The playback
transaction-lifetime correction is the only B3 production-source change.

## Security and compatibility consequences

- Separate database users make later least-privilege proof possible without
  changing the single `DATABASE_URL` deployment contract.
- Existing API routes, DTOs, responses, authorization, tenancy, queue names,
  worker ownership, storage behavior, Redis configuration, Prisma schema, and
  migrations remain unchanged.
- Prisma client construction receives only the bounded datasource URL and does
  not log or re-read environment state.
- Failover reserve and operations connections remain available when runtime
  instances reach their approved maxima.

## Rollback and cutback constraints

Runtime policy changes can be rolled back to a previously compatible artifact
and lower deployment caps after draining connections and in-flight work. A
Cloud SQL topology cutback is data-bearing: it requires a declared write
freeze or single-writer authority, connection drain, integrity and
reconciliation evidence, an approved cutback point, and recovery ownership.
Public-IP fallback, concurrent unsynchronized writers, schema rollback, and
consumption of the emergency reserve as normal capacity are not authorized.

## Remaining evidence and reopen conditions

PRD3-G01 remains `BASELINE_ONLY`, not complete. Reopen or revise the policy if
saturation evidence rejects the pool/instance envelope, failover consumes the
reserve, provider limits differ, workload/growth changes materially, or Saudi
residency requirements change.

PRD3-G01-B1-FINAL local disposable evidence is complete: three live fail-closed
rehearsals plus two independent runs observed exact role maxima 5/6/3, exact
aggregate 20/12/6/38,
bounded P2024 waits, same-client recovery, lower new-client pool settings, no
sampled session overshoot, and zero owned Docker resources after label-verified
cleanup and fail-closed exact-name and current-run-label Docker inspection. The
harness pins a verified local Docker endpoint, executes the pre-existing
PostgreSQL image by immutable ID with pulls disabled, and creates its disposable
network with `--internal`. The owned container is temporarily attached to the
verified local built-in bridge only to activate Docker Desktop loopback
publishing.
Schema-v5 evidence is atomically published only after bounded two-phase Prisma
disconnect, process-tree termination, exact cleanup inspection, and immutable
image verification succeed. The final evidence supersedes all pre-review B1,
B1-R1, and B1-R2 draft candidates. This does not close the gate or prove
provider behavior.

PRD3-G01-B2-R1 local disposable evidence is complete and recorded in
`docs/production-readiness/phase-3/02-database-outage-readiness-and-reconnect-evidence.md`.
One canonical final-suite command rebuilt the runtime from the archived
baseline commit/tree, verified its package-lock/runtime manifest and Node/Prisma
identity, executed all 29 exact failure proofs, and retained two independent
formal summaries. Those canonical-runtime runs proved bounded readiness 503
during two database stalls, startup/liveness/public-health continuity,
same-process recovery, destruction and replacement of established PostgreSQL sessions,
exact application names, no per-runtime pool overshoot, unavailable-at-start
fail-closed behavior, two-phase tracked observer cleanup, and clean signal/fault
recovery. The pre-review B2 summaries are superseded. This is local
PostgreSQL/Docker evidence; it does not prove Cloud SQL, Cloud Run, production
TLS, IAM, or provider failover behavior.

PRD3-G01-B3 local business-transaction pressure evidence is complete and
recorded in
`docs/production-readiness/phase-3/03-business-transaction-pressure-and-cutback-evidence.md`.
It exercises actual production entry classes, the full 5/2/1 readiness matrix,
two independent formal runs, and live signal/false-state/disconnect rehearsals.
Its R4 authenticity correction additionally requires two already-started
Teacher production operations with measured backend overlap, a truthful
Serializable-contention F24 model, evidence-derived SHA-256 fault receipts,
automatic tracking of every bounded normal operation, measured driver and
supervisor final audits, cross-field summary pairing, finalization before
result publication, and abort-aware normal-work polling. It does not prove
managed-service or production behavior.

Required closeout evidence remains:

- PRD3-G01-C database-user privileges and negative DDL/access proof;
- PRD3-G01-D real Cloud SQL regional failover and final closeout;
- exact-candidate CI, including `npm run verify:prd3-g01-a`, review, merge, and
  post-merge verification.

## Explicit non-authorization

This ADR does not authorize Terraform or cloud provisioning, cross-region DR,
public database IP, database mutation, migration or schema changes, production
credentials in tests, package/dependency changes, Redis decisions, queue or
worker concurrency changes, storage changes, a Learning Media HTTP-contract
change, or production launch.
