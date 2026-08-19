# Governed Cloud SQL PostgreSQL foundations

This directory contains separate governed Terraform roots for Staging and
Production Cloud SQL. Both stages are repository-source preparation only. They
do not claim that an instance exists or that any Google Cloud mutation has
occurred.

```text
STAGING_ROOT=infra/gcp/sql/environments/nonprod
PRODUCTION_ROOT=infra/gcp/sql/environments/production
```

## Locked Staging B1 design

Stage 5B prepared the existing Staging source and remains the historical basis
for the `nonprod` executable root.

| Component | Approved value |
| --- | --- |
| Project | `moazez-nonprod-91001421934` |
| Environment | `staging` |
| Region | `me-central2` |
| Instance | `moazez-staging-postgres-me-central2` |
| Engine | `POSTGRES_16` |
| Edition | `ENTERPRISE` |
| Machine series intent | N4 |
| Tier | `db-custom-N4-2-8192` (2 vCPU, 8 GiB) |
| Availability | `ZONAL`, with no explicit preferred zone |
| Disk | `HYPERDISK_BALANCED`, 20 GB initial |
| Disk autoresize | enabled, 100 GB limit |
| Automated backups | enabled |
| Point-in-time recovery | enabled |
| Transaction log retention | 7 days |
| Automated backup retention | 8 backups, `COUNT` |
| Backup location | unset; provider-managed behavior preserved |
| PostgreSQL flag | `max_connections = 100` |
| Public IPv4 | disabled |
| Private network | `projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc` |
| Allocated range | `moazez-staging-psa` |
| SSL mode | `ENCRYPTED_ONLY` |
| Google Cloud services private path | disabled |
| Terraform deletion protection | enabled |
| GCP/API deletion protection | enabled |

The Staging root exposes only `project_id`, `region`, and `environment`, all
with locked defaults and exact-value validation. Every other approved Staging
value remains an explicit root local passed to the shared module. Stage 24A
does not modify the Staging root.

## Locked Production Stage 24 design

Stage 24A prepared the permanent Production source. Stage 24C changes only the
placement dimension of that source by introducing deterministic regional HA
zones after repeated Cloud SQL Create API attempts with automatic placement
reported provider capacity failures. This source remediation does not prove
that capacity is currently available or that a later Cloud SQL create will
succeed. The locked Production contract is:

| Component | Approved value |
| --- | --- |
| Project | `moazez-production` |
| Environment | `production` |
| Region | `me-central2` |
| Instance | `moazez-production-postgres-me-central2` |
| Engine | `POSTGRES_16` |
| Edition | `ENTERPRISE_PLUS` |
| Tier | `db-perf-optimized-N-2` |
| Availability | `REGIONAL` |
| Primary zone | `me-central2-a` |
| Secondary zone | `me-central2-c` |
| Disk | `PD_SSD`, 20 GB initial |
| Disk autoresize | enabled, 100 GB limit |
| Automated backups | enabled |
| Point-in-time recovery | enabled |
| Transaction log retention | 14 days |
| Automated backup retention | 30 backups, `COUNT` |
| Backup location | `me-central2` |
| PostgreSQL flag | `max_connections = 100` |
| Public IPv4 | disabled |
| Private network | `projects/moazez-production/global/networks/moazez-production-vpc` |
| Allocated range | `moazez-production-psa` |
| SSL mode | `ENCRYPTED_ONLY` |
| Google Cloud services private path | disabled |
| Terraform deletion protection | enabled |
| GCP/API deletion protection | enabled |

The Production root exposes only `project_id`, `region`, and `environment`,
all locked to the values above. Every topology and recovery value is an
explicit `production_sql` local rather than an operator-tunable variable.
Production explicitly pins `me-central2-a` as the primary zone and
`me-central2-c` as the secondary zone. Staging continues to omit both optional
module inputs and therefore preserves provider-managed placement. The complete
environment tuple guard prevents either placement model from being mixed into
the other environment.
Production explicitly pins backup location to `me-central2` so the approved
Saudi data-residency boundary does not depend on provider default placement.
No backup start time, cross-region backup copy, replica, or disaster-recovery
region is configured.

The approved recovery policy has a 30-minute RTO objective, a 15-minute RPO
objective, 14-day PITR retention, a target of 30 retained automated backup
objects, and a quarterly restore drill. `retained_backups = 30` with
`retention_unit = COUNT` means 30 backup objects; it does not prove 30 calendar
days of effective live retention.

## Exact ownership boundary

Each executable root invokes the shared module once. The Production root has
no direct resources and no data sources. Its only managed resource is:

```text
module.sql_environment.google_sql_database_instance.postgres
```

The shared module itself contains exactly one
`google_sql_database_instance.postgres` resource. It accepts only the complete
governed Staging tuple or the complete governed Production tuple. Cross-
environment mixtures fail the resource lifecycle precondition.

Stage 4 owns the Staging VPC, Private Services Access allocation, and Service
Networking foundation. Stage 23 owns the equivalent Production prerequisites.
The Production VPC `moazez-production-vpc`, allocated range
`moazez-production-psa`, and their live connectivity are external
prerequisites. The SQL roots do not own, recreate, import, mutate, or query
either network foundation and create no artificial Terraform dependency on
those stacks.

The SQL roots do not manage projects, APIs, IAM, service accounts, Secret
Manager, database users, database roles, passwords, databases, Prisma schema,
Prisma migrations, Redis, Cloud Run, DNS, load balancers, network resources,
application buckets, or Terraform state buckets. Permanent PostgreSQL
passwords and `DATABASE_URL` delivery remain separately governed.

## Remote-state governance

| Environment | External bucket | Prefix |
| --- | --- | --- |
| Staging | `moazez-nonprod-91001421934-tfstate` | `sql/staging` |
| Production | `moazez-production-91001421934-tfstate` | `sql/production` |

Both GCS buckets are externally bootstrapped Terraform-state buckets. Neither
SQL stack owns them. Application buckets are not Terraform state stores.
Credentials in Terraform source are forbidden; authentication remains an
external operator responsibility.

Stage 5B did not initialize the real Staging backend. Stage 24A does not
initialize the real Production backend and does not read or mutate any
Terraform state object.

## Deletion and storage-growth governance

Both Terraform-level deletion protection and the GCP Cloud SQL API deletion
protection setting are enabled for both governed tuples. Reducing or removing
either mechanism requires separate explicit approval.

Initial `disk_size` is 20 GB and autoresize may increase it up to 100 GB. Cloud
SQL storage cannot be shrunk in place. The shared module therefore
intentionally ignores only `settings[0].disk_size` drift after provider-side
automatic growth. No other lifecycle drift is ignored.

## Source preparation is not live evidence

```text
PRODUCTION_SQL_SOURCE_PREPARED != PRODUCTION_SQL_APPLIED
```

Stage 24A source preparation and the Stage 24C deterministic-placement source
remediation do not prove:

- Production backend initialization;
- a saved Terraform plan or apply;
- Cloud SQL existence, capacity in either approved zone, or successful HA placement;
- backup execution or 30 calendar days of effective retention;
- PITR live operation or restore success;
- RTO or RPO achievement;
- real network connectivity, provider failover, or Production readiness.

DevOps owns any later Stage 24C initialization, planning, review, application,
capacity recovery, and operational evidence after independent Backend
Development review and merge. This source work does not authorize Terraform
plan, apply, destroy, import, refresh, state commands, backend migration,
database access, or any GCP mutation.
