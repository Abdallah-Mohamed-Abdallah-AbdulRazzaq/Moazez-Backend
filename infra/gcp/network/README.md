# Network foundation infrastructure

This directory owns governed Terraform source for the Staging and Production
network foundations. Both executable roots reuse
`modules/network-environment`; neither root creates resources outside that
module.

Stage 4A established the Staging source contract. Stage 23A adds the Production
source contract. These source-preparation stages do not by themselves plan,
apply, inspect, or prove the existence of Google Cloud resources.

```text
STAGING ROOT: infra/gcp/network/environments/nonprod
PRODUCTION ROOT: infra/gcp/network/environments/production

PRODUCTION_NETWORK_SOURCE_PREPARED != PRODUCTION_NETWORK_APPLIED
```

## Locked Staging topology

The `environments/nonprod` root models the `staging` environment for the
existing Google Cloud project `moazez-nonprod-91001421934` in `me-central2`
with these immutable coordinates:

| Component | Locked value |
| --- | --- |
| VPC | `moazez-staging-vpc` |
| VPC mode | custom only (`auto_create_subnetworks = false`) |
| Routing mode | `REGIONAL` |
| Runtime subnet | `moazez-staging-runtime-me-central2` |
| Runtime subnet CIDR | `10.70.0.0/24` |
| PSA allocated range | `moazez-staging-psa` |
| PSA CIDR | `10.71.0.0/16` (`10.71.0.0`, prefix length `16`) |
| Service Networking service | `servicenetworking.googleapis.com` |
| Deletion policy | `PREVENT` |

The Staging root exposes only `project_id`, `region`, and `environment` as
variables, with exact-value validation and locked defaults. Resource names,
CIDRs, the PSA prefix, Service Networking service, and deletion policy are root
constants rather than operator-tunable tfvars.

## Locked Production topology

The `environments/production` root models the approved Stage 23 Production
contract with these immutable coordinates:

| Component | Locked value |
| --- | --- |
| Project | `moazez-production` |
| Region | `me-central2` |
| Environment | `production` |
| VPC | `moazez-production-vpc` |
| VPC mode | custom only (`auto_create_subnetworks = false`) |
| Routing mode | `REGIONAL` |
| Runtime subnet | `moazez-production-runtime-me-central2` |
| Runtime subnet CIDR | `10.60.0.0/24` |
| Secondary ranges | none |
| PSA allocated range | `moazez-production-psa` |
| PSA address | `10.61.0.0` |
| PSA prefix length | `16` |
| PSA CIDR | `10.61.0.0/16` |
| Service Networking service | `servicenetworking.googleapis.com` |
| Deletion policy | `PREVENT` |

The Production root likewise exposes only `project_id`, `region`, and
`environment`, all with locked defaults and exact-value validation. Network
names, CIDRs, the PSA allocation, Service Networking service, deletion policy,
backend bucket, and backend prefix remain source-governed constants.

## Exact scope

Each executable root invokes the shared module exactly once and contains no
direct resource or data blocks. For its environment, the module owns exactly:

1. one custom-mode `google_compute_network`;
2. one regional `google_compute_subnetwork` with no secondary ranges;
3. one explicitly addressed `google_compute_global_address` for VPC peering;
4. one `google_service_networking_connection` using that allocated range.

The connection depends on the network and allocated range through direct
Terraform references. This is source ownership, not evidence that any
Production resource exists. `compute.googleapis.com` and
`servicenetworking.googleapis.com` are external prerequisites owned by the
DevOps workflow; this stack does not enable or manage APIs.

The network stack creates or manages no:

- API enablement;
- backend bucket or other remote-state resource;
- default VPC or Shared VPC configuration;
- firewall rule;
- Cloud Router or Cloud NAT;
- Serverless VPC Access connector;
- Cloud SQL;
- Redis or Memorystore;
- Cloud Run;
- Cloud DNS;
- load balancer;
- IAM binding or service account;
- Secret Manager resource;
- Artifact Registry resource;
- application storage bucket;
- Private Service Connect endpoint;
- monitoring resource, logging sink, or budget.

The foundation follows the approved Direct VPC direction for later serverless
runtimes without provisioning those later runtimes or their dependencies.

## State and execution governance

### Staging state

Staging network Terraform state uses the dedicated GCS backend at
`gs://moazez-nonprod-91001421934-tfstate` with the exact backend prefix
`network/staging`. The state bucket was bootstrapped out-of-band by the
approved DevOps workflow. It is deliberately not created or managed by this
network stack, which avoids a backend bootstrap dependency cycle. The GCS
remote backend supports Terraform state locking.

```text
REMOTE_STATE_MODEL=GCS
REMOTE_STATE_BUCKET=moazez-nonprod-91001421934-tfstate
REMOTE_STATE_PREFIX=network/staging
REMOTE_STATE_BUCKET_MANAGED_BY_THIS_STACK=NO
```

The application buckets `moazez-nonprod-91001421934-private` and
`moazez-nonprod-91001421934-published` are forbidden as Terraform state stores.
No credentials are stored in Terraform source. Authentication is operational
and external through the approved execution identity and ADC model. This
approved source configuration does not claim that the real GCS backend has
been initialized, that remote state has been created or migrated, or that the
network has been applied or any network resource created.

### Production state

The Production root declares the approved GCS backend bucket
`gs://moazez-production-91001421934-tfstate` with the exact prefix
`network/production`. The bucket is an external DevOps bootstrap prerequisite.
It is not created or managed by this network stack. Stage 23A does not verify
that the bucket exists, initialize the Production backend, create or migrate
remote state, or inspect Production networking live state.

```text
REMOTE_STATE_MODEL=GCS
REMOTE_STATE_BUCKET=moazez-production-91001421934-tfstate
REMOTE_STATE_PREFIX=network/production
REMOTE_STATE_BUCKET_MANAGED_BY_THIS_STACK=NO
```

No credentials are stored in either Terraform root. Authentication remains an
external DevOps execution concern.

Stage 4A permits formatting and static validation only. It forbids
`terraform plan`, `apply`, `destroy`, `import`, `refresh`, and all Terraform
state commands. The historical Staging operator lifecycle is:

```text
source review
→ static validation
→ Owner review
→ DevOps read-only preflight
→ reviewed terraform plan
→ explicit Owner approval
→ apply
→ post-apply verification
```

Stage 23A is likewise source-only. It permits formatting, backend-disabled
initialization with the governed lockfile, validation, provider inspection, and
static source checks. It performs no Production backend bootstrap, plan, apply,
or GCP mutation. DevOps owns the later Stage 23B backend bootstrap, live
read-only preflight, initialization, validation, and saved-plan review stop;
Stage 23C may apply only the exact reviewed saved plan and then verify it live.

## Deletion and replacement review

The Owner approved the Google provider resource-level `PREVENT` deletion
policy for the Staging VPC, runtime subnet, PSA allocated range, and Service
Networking connection. The executable Staging root locks this value and passes
it explicitly to all four managed resources. No Terraform `prevent_destroy`
lifecycle rule is combined with the provider policy.

```text
NETWORK_DELETION_POLICY=PREVENT
NETWORK_DELETION_POLICY_APPROVED_BY_OWNER=YES
NETWORK_DELETION_POLICY_DECISION_REQUIRED=NO
approver=Abdallah
approval_date=2026-08-12
timezone=Africa/Cairo
exact_approval_time=NOT_RECORDED
```

Changing Staging from `PREVENT` to `DELETE` or `ABANDON` requires a new
explicit Owner and DevOps review before execution. The Staging decision remains
scoped to the Staging network foundation. Stage 23 independently locks
`PREVENT` for Production; neither environment's policy establishes a deletion
policy for unrelated stacks.

Changing the Production policy likewise requires an explicit Owner and DevOps
review before execution. Both roots pass their locked provider resource-level
policy to the VPC, runtime subnet, PSA range, and Service Networking
connection. Neither root combines it with a Terraform `prevent_destroy`
lifecycle rule.

Deleting or replacing the VPC, subnet, PSA allocation, or Service Networking
connection after managed services depend on them can disrupt connectivity,
strand dependencies, or be blocked by provider-side dependencies. Rollback is
not assumed to be trivial.
