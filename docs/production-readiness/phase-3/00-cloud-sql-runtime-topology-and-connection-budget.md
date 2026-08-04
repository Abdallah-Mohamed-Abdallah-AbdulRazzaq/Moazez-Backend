# Phase 3 — Cloud SQL Runtime Topology and Connection Budget

## Document control

| Field | Value |
| --- | --- |
| Phase | `PHASE_3` |
| Gate | `PRD3-G01` |
| Subtask | `PRD3-G01-A` |
| Owner/approver | Abdallah |
| Approval date | 2026-08-04 |
| Timezone | Africa/Cairo |
| Status | `BASELINE_ONLY` |
| Architecture authority | ADR-0005 |
| Scope | Local runtime policy, tests, and governance only; no cloud provisioning |

PRD3-G01 is not complete. This document locks a conservative implementation
baseline while saturation/recovery, database privileges, real Cloud SQL
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
the connection budget. This subtask does not change migrations, Migration Job
behavior, DDL policy, schema, or deployment ordering.

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

## Pool-pressure inventory for PRD3-G01-B

No transaction or business logic is changed here. Saturation testing must
include:

- Learning Media transaction: 15-second timeout.
- Teacher Lifecycle transaction: 30-second Serializable timeout.
- Lesson Content transaction: 30-second timeout.
- Lesson Content Playback may await signed storage capability creation inside
  a 15-second database transaction.

These are explicit saturation/load-test inputs, not defects silently fixed by
the runtime-policy baseline.

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

Still deferred:

- **PRD3-G01-B:** connection saturation, transaction pressure, termination,
  recovery, pool reduction, and cutback evidence.
- **PRD3-G01-C:** separate PostgreSQL users, least-privilege grants, negative
  DDL/cross-role access proof, and migration/runtime separation evidence.
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
