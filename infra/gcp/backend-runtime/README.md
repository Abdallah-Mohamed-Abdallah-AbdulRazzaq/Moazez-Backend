# Staging backend runtime source

Stage 13B is source preparation only. This directory models the Staging
backend runtime boundary; it does not claim that a Cloud Run service, worker
pool, job, Terraform backend, or any other Google Cloud resource has been
created, changed, imported, or deployed.

## Independent Terraform roots

The Migration Job and long-running runtime are deliberately separate
Terraform roots with no Terraform dependency or remote-state lookup between
them.

| Root | Remote state prefix | Managed resources |
| --- | --- | --- |
| `environments/nonprod/migration` | `backend-runtime/staging/migration` | 1 `google_cloud_run_v2_job` |
| `environments/nonprod/runtime` | `backend-runtime/staging/runtime` | 1 `google_cloud_run_v2_service` and 3 `google_cloud_run_v2_worker_pool` resources |

Both roots configure the externally owned state bucket
`moazez-nonprod-91001421934-tfstate`. Neither Stage 13B root creates or
manages the bucket as a Terraform managed resource, and neither declares a
Google data source for it. Real backend initialization is a separately
governed DevOps operation and will access the bucket when backend access is
enabled. Development validation uses backend-disabled initialization and
therefore does not access the real remote backend. Each root locks
`hashicorp/google` to the committed 7.44.0 provider selection and configures
only the normal `google` provider.

The complete five-resource ownership boundary is:

| Role | Terraform type | Name |
| --- | --- | --- |
| API | `google_cloud_run_v2_service` | `moazez-staging-api` |
| Core Worker | `google_cloud_run_v2_worker_pool` | `moazez-staging-core-worker` |
| Media Worker | `google_cloud_run_v2_worker_pool` | `moazez-staging-media-worker` |
| Maintenance Scheduler | `google_cloud_run_v2_worker_pool` | `moazez-staging-maintenance-scheduler` |
| Migration | `google_cloud_run_v2_job` | `moazez-staging-migration` |

No root owns IAM, service accounts, secrets, secret versions, Redis, Cloud
SQL, storage, Artifact Registry, API enablement, networking, load balancing,
DNS, Cloud Armor, or Production resources. No Google data source is used.

The API uses top-level service scaling with a minimum of 1, maximum of 4,
and request concurrency 40 so the maximum applies across active revisions.
Each worker pool uses `MANUAL` scaling with exactly one instance; no worker
autoscaler or HTTP worker service is modeled.

## Immutable image contract

All five roles use one immutable image. The only accepted image input is a
digest reference with this exact package shape:

```text
me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:<64-lowercase-hex>
```

Mutable tags are rejected by input validation. The migration and runtime
roots receive the digest independently so that each saved plan can be
reviewed and applied as its own release gate.

## External placement and identity dependencies

Every resource references the locked names of the externally owned
`moazez-staging-vpc` network and `moazez-staging-runtime-me-central2`
subnetwork through Direct VPC with `PRIVATE_RANGES_ONLY` egress. Stage 13B
does not create or manage either dependency and declares no Google data
source for them.

The five existing service accounts are referenced only:

- `moazez-api-runtime@moazez-nonprod-91001421934.iam.gserviceaccount.com`
- `moazez-core-worker@moazez-nonprod-91001421934.iam.gserviceaccount.com`
- `moazez-media-worker@moazez-nonprod-91001421934.iam.gserviceaccount.com`
- `moazez-maintenance-scheduler@moazez-nonprod-91001421934.iam.gserviceaccount.com`
- `moazez-migration-job@moazez-nonprod-91001421934.iam.gserviceaccount.com`

Secret Manager environment references use explicit numeric version `1`.
Mutable version aliases are forbidden, and no secret payload is read by
Terraform source processing.

## Redis deployment inputs

The runtime root accepts Queue and Realtime Redis host, integer port, and CA
PEM inputs separately. It constructs `rediss://<host>:<port>` inside
Terraform; Redis URLs are not accepted as inputs.

The Queue and Realtime CA PEM bundles are sensitive, ephemeral DevOps inputs.
They are injected as ordinary container environment values because they are
live infrastructure trust material, not Secret Manager references. Actual CA
contents must never be placed in source, committed variable files, saved-plan
artifacts intended for broad access, logs, or Terraform outputs. Media Worker
and Maintenance Scheduler receive Queue Redis only; API and Core Worker
receive both independent Redis families.

## Governed release order

Terraform defines the Migration Job but never starts or executes it. The
future human-governed release sequence is:

1. Build and push the immutable image.
2. Review the Migration Job saved plan.
3. Apply only the Migration Job definition.
4. Execute the governed Migration Job through the separate execution gate.
5. Prove migration success and zero drift.
6. Review the runtime saved plan.
7. Apply the API service and three worker pools separately.

The roots contain definition-only managed resources and no Terraform-embedded
release execution mechanism.

## Ingress and probes

Stage 17B sets the API to `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` and sets
`https://staging-api.moazez.cloud` as the canonical staging API origin used by
the API and Core Worker `APP_URL` values. The provider-assigned `run.app` URI
remains the underlying Cloud Run service URI and is still exposed by the
`api_service_uri` output; direct public access through that hostname is not the
approved staging ingress path.

This root still creates no public invoker IAM, load balancer, Cloud Armor,
certificate, or DNS resource. Management probes use port 9090 while the API
serves on port 3000. Worker pools use provider-supported startup and liveness
probes; the committed Google 7.44.0 worker-pool schema does not expose a
readiness probe field, so application-level worker readiness remains internal.

## Source-preparation record

The Codex source-generation step itself performed no Terraform initialization,
validation, plan, apply, import, real backend access, image push, Migration
Job execution, Cloud Run deployment, or cloud mutation. The subsequent
human-owned Development validation gate is authorized to run local
backend-disabled initialization with
`terraform init -backend=false -lockfile=readonly` and `terraform validate`
for both roots. That local validation does not authorize or perform real
backend access, Terraform plan, apply, import, image push, Migration Job
execution, Cloud Run deployment, or cloud mutation.
