# Staging Cloud SQL PostgreSQL foundation

Stage 5B is repository-source preparation only. This Terraform source models
one approved Staging Cloud SQL for PostgreSQL B1 instance. It does not claim
that the instance exists or that any Google Cloud mutation has occurred.

## Locked Staging B1 design

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
| PostgreSQL flag | `max_connections = 100` |
| Public IPv4 | disabled |
| Private network | `projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc` |
| Allocated range | `moazez-staging-psa` |
| SSL mode | `ENCRYPTED_ONLY` |
| Google Cloud services private path | disabled |
| Terraform deletion protection | enabled |
| GCP/API deletion protection | enabled |

The only executable root is `environments/nonprod`. It exposes only
`project_id`, `region`, and `environment`, all with locked defaults and
exact-value validation. Every other approved Staging design value is an
explicit root local passed to the module.

## Exact ownership boundary

This stack owns exactly one managed resource:

```text
module.sql_environment.google_sql_database_instance.postgres
```

Stage 4 owns the VPC, Private Services Access allocation, and Service
Networking foundation. The VPC `moazez-staging-vpc`, allocated range
`moazez-staging-psa`, and their live connectivity are external prerequisites.
This SQL stack does not own, recreate, import, mutate, or query that network
foundation and creates no artificial Terraform dependency on the Stage 4
stack.

This stack does not manage APIs, IAM, service accounts, Secret Manager,
database users, database passwords, database resources, Prisma schema, Prisma
migrations, Redis, Cloud Run, DNS, load balancers, network resources, or
Production. Permanent PostgreSQL passwords and `DATABASE_URL` secret delivery
remain out of scope pending the separately governed credentials and identity
work. Stage 6 owns database-role provisioning and Prisma migration proof.
No real, user, or production data is authorized by Stage 5B.

## Remote-state governance

```text
REMOTE_STATE_MODEL=GCS
REMOTE_STATE_BUCKET=moazez-nonprod-91001421934-tfstate
REMOTE_STATE_PREFIX=sql/staging
REMOTE_STATE_BUCKET_MANAGED_BY_THIS_STACK=NO
```

The GCS bucket is an externally bootstrapped Terraform-state bucket. This SQL
stack does not own it. Application buckets are not Terraform state stores.
Credentials in Terraform source are forbidden; authentication remains an
external operator responsibility.

This source task does not claim that the real SQL GCS backend was initialized.
It does not claim that SQL Terraform state exists. It does not claim that a
Terraform plan or apply occurred.

## Deletion and storage-growth governance

Both Terraform-level deletion protection and the GCP Cloud SQL API deletion
protection setting are enabled. Reducing or removing either mechanism requires
separate explicit approval.

The initial `disk_size` is 20 GB and autoresize may increase it up to 100 GB.
Cloud SQL storage cannot be shrunk in place. Terraform therefore intentionally
ignores only `settings[0].disk_size` drift after provider-side automatic
growth. No other lifecycle drift is ignored.

Stage 5B authorizes source formatting and source/schema validation only. It
does not authorize a real backend initialization, state access or migration,
Terraform planning, application, destruction, import, refresh, or any cloud
operation.
