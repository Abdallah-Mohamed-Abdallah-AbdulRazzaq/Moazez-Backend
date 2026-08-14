# Staging Memorystore for Redis foundation

Stage 7A is repository-source preparation only. This Terraform source models
exactly two physically independent Staging Memorystore for Redis instances. It
does not claim that either instance or any other Google Cloud resource exists,
and it performs no cloud mutation.

## Locked Staging design

| Component | Approved value |
| --- | --- |
| Project | `moazez-nonprod-91001421934` |
| Environment | `staging` |
| Region | `me-central2` |
| Queue instance | `moazez-staging-queue-me-central2` |
| Realtime instance | `moazez-staging-realtime-me-central2` |
| Tier | `BASIC` |
| Memory | 1 GiB each |
| Redis version | `REDIS_7_2` |
| Authorized network | `projects/moazez-nonprod-91001421934/global/networks/moazez-staging-vpc` |
| Connect mode | `PRIVATE_SERVICE_ACCESS` |
| TLS | `SERVER_AUTHENTICATION` |
| AUTH | disabled intentionally in Stage 7A |
| Terraform deletion protection | enabled |
| Terraform lifecycle `prevent_destroy` | enabled |
| Explicit zone | none |
| `reserved_ip_range` | not configured |

The Queue instance owns BullMQ queues, producers, consumers, repeat
registrations, locks, delayed jobs, and stalled-job coordination. The Realtime
instance owns Socket.IO publisher/subscriber traffic, worker-safe emitter
traffic, presence, typing, and ephemeral realtime coordination. Different
logical databases on one endpoint are not isolation.

The approved application connection budgets are governance ceilings, not
Memorystore `redis_configs` values:

```text
QUEUE_REDIS_GOVERNED_MAXIMUM=40
REALTIME_REDIS_GOVERNED_MAXIMUM=30
```

## Exact ownership boundary

This stack owns exactly these two managed resources and no Terraform data
sources:

```text
module.redis_environment.google_redis_instance.queue
module.redis_environment.google_redis_instance.realtime
```

Stage 4 owns the VPC, Private Service Access allocation, and Service Networking
connection. This Redis stack references the approved VPC as an external
prerequisite; it does not own, recreate, import, mutate, or query that network
foundation through Terraform, and it creates no artificial dependency on the
Network stack.

This stack does not manage APIs, IAM, service accounts, Secret Manager, KMS,
network resources, runtime configuration, Prisma, migrations, Cloud Run, or
Production resources.

## Remote-state governance

```text
REMOTE_STATE_MODEL=GCS
REMOTE_STATE_BUCKET=moazez-nonprod-91001421934-tfstate
REMOTE_STATE_PREFIX=redis/staging
REMOTE_STATE_BUCKET_MANAGED_BY_THIS_STACK=NO
```

The state bucket is external to this stack. Application buckets are not
Terraform state stores. No credentials are embedded in source, and
authentication remains an external operator responsibility. Stage 7A did not
initialize the real backend, access or create Terraform state, run a Terraform
plan or apply, create a Redis instance, or mutate any cloud resource. It did
not create or modify any Production resource. No real, user, or production
data is authorized.

## AUTH governance

AUTH remains disabled in Stage 7A. This source task does not generate,
retrieve, persist, or output an AUTH string and creates no Secret Manager
resource. Future AUTH enablement and credential governance require a separate
approved later gate; Stage 7A does not pre-authorize that decision.

## TLS and runtime compatibility

TLS is enabled at instance creation with `SERVER_AUTHENTICATION`. Application
clients must trust the Memorystore instance Certificate Authority before
runtime cutover. Stage 7A does not retrieve, install, distribute, mount, or
configure the CA, and it does not modify Redis client code or current runtime
compatibility source.

Terraform outputs from this stage are infrastructure identity and configuration
only. They must not be treated as application-ready `QUEUE_REDIS_URL` or
`REALTIME_REDIS_URL` values. A later runtime/deployment gate must prove CA
trust and live Redis TLS connectivity before application roles are deployed
against these instances. Stage 7A does not claim that runtime Redis
connectivity has been proven.
