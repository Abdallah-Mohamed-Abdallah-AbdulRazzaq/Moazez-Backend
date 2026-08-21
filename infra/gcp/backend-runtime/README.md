# Backend runtime Terraform source

This directory contains source definitions for the Staging and Production
backend runtimes. Development source preparation and local validation are not
deployment: they do not initialize a real backend, create a saved plan, apply
Terraform, execute the Migration Job, deploy Cloud Run, or mutate Google
Cloud.

## Independent Terraform roots

Migration and long-running runtime resources use independent roots and state
prefixes. There is no remote-state lookup or Terraform dependency between
them.

| Environment | Root | Remote state prefix | Managed resources |
| --- | --- | --- | --- |
| Staging | `environments/nonprod/migration` | `backend-runtime/staging/migration` | 1 `google_cloud_run_v2_job` |
| Staging | `environments/nonprod/runtime` | `backend-runtime/staging/runtime` | 1 `google_cloud_run_v2_service` and 3 `google_cloud_run_v2_worker_pool` resources |
| Production | `environments/production/migration` | `backend-runtime/production/migration` | 1 `google_cloud_run_v2_job` |
| Production | `environments/production/runtime` | `backend-runtime/production/runtime` | 1 `google_cloud_run_v2_service` and 3 `google_cloud_run_v2_worker_pool` resources |

The Staging roots reference the externally owned state bucket
`moazez-nonprod-91001421934-tfstate`. The Production roots reference
`moazez-production-91001421934-tfstate`. No root creates or manages its state
bucket, and local source validation uses backend-disabled initialization.
Every root selects `hashicorp/google` 7.44.0 under the governed
`>= 7.40.0, < 8.0.0` constraint.

Production runtime state is intentionally independent from Production
migration state. Defining or applying one root does not execute or promote the
other.

## Closed runtime environment contract

The shared `modules/runtime-environment` module accepts only the closed
selector values `staging` and `production`. Project, region, network,
subnetwork, Cloud Run names, runtime service accounts, storage buckets, signer
identity, CORS origins, trusted-proxy mode, and Secret Manager IDs are selected
inside the module from the governed environment contracts. Callers cannot
combine Staging and Production infrastructure identities.

The module preserves these four resource addresses in both environments:

- `google_cloud_run_v2_service.api`
- `google_cloud_run_v2_worker_pool.core`
- `google_cloud_run_v2_worker_pool.media`
- `google_cloud_run_v2_worker_pool.maintenance_scheduler`

The Migration Job remains owned by the separate migration module and roots; it
is not recreated by the runtime module.

## Release-time inputs

Runtime roots accept immutable image references in their exact environment
package. Mutable tags are rejected, and the selected environment is bound to
the matching package. The concrete approved image digest is supplied later by
DevOps when producing a saved plan; reusable source does not pin a release
digest.

Queue and Realtime Redis remain separate DevOps runtime inputs. Each family is
provided as host, integer TLS port, and sensitive CA PEM. Terraform constructs
`rediss://<host>:<port>`; callers do not supply complete Redis URLs. CA payloads
are neither committed nor exposed as Terraform outputs. API and Core Worker
receive both Redis families. Media Worker and Maintenance Scheduler receive
Queue Redis only.

The Production runtime additionally requires these non-secret, owner/DevOps
inputs with no defaults:

- canonical HTTPS `api_url`;
- `settings_email_secret_encryption_active_key_id`;
- `app_device_token_encryption_active_key_id`.

No Production hostname or encryption key ID is inferred by this source. The
Staging caller preserves `https://staging-api.moazez.cloud`,
`staging-email-20260815`, and `staging-device-20260815` as its existing fixed
contract.

Secret Manager references use explicit numeric versions. Terraform references
secret containers only and neither reads nor creates secret payloads or secret
versions.

## Runtime placement and role topology

Both environments use Direct VPC with `PRIVATE_RANGES_ONLY` egress. The API
uses port 3000, management probes on port 9090, min instances 1, max instances
4, and concurrency 40. Each worker pool uses `MANUAL` scaling with exactly one
instance and keeps its role-specific command and probe topology.

Storage roles remain asymmetric by design: API, Core Worker, and Media Worker
receive their approved GCS bucket configuration; only API receives
`GCS_SIGNING_SERVICE_ACCOUNT`; Maintenance Scheduler receives no storage
environment.

## Dark Production boundary

During Stage 29 the Production API remains Dark. Its Cloud Run ingress is
restricted to `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`, the provider default
URI is disabled, and no Production external Application Load Balancer, public
DNS, certificate, Cloud Armor, or public edge resource is owned here.
Production uses `APP_TRUSTED_PROXY_MODE=none`.

`invoker_iam_disabled=true` preserves the governed runtime/edge model; it must
not be described as IAM-authenticated protection. The Dark guarantee comes
from restricted ingress, the absence of a Production public edge, and the
disabled provider URI. Stage 30 owns any future Production proxy and edge
transition.

Staging retains `APP_TRUSTED_PROXY_MODE=gcp_external_alb` and its existing
Staging origins. This runtime source creates no public invoker IAM binding,
`allUsers` grant, load balancer, Cloud Armor policy, certificate, or DNS
resource for either environment.

## Governed release order

Terraform source defines resources but does not execute the release. A later
authorized workflow supplies the immutable image and runtime inputs, handles
the independently governed Migration Job, validates its outcome, and only
then promotes the runtime roles. Stage 29 source preparation does not deploy
Production, make a plan ready, or authorize Production traffic.
