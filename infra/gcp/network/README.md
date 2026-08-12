# Staging network foundation infrastructure

This directory owns the Stage 4 staging network foundation source for the
existing Google Cloud project `moazez-nonprod-91001421934` in `me-central2`.
Stage 4A prepares reviewable Terraform source only. It does not plan, apply,
inspect, or claim the existence of any Google Cloud resource.

## Locked staging topology

The only executable root is `environments/nonprod`; it models the `staging`
environment with these immutable coordinates:

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

The root exposes only `project_id`, `region`, and `environment` as variables,
with exact-value validation and locked defaults. Resource names, CIDRs, the PSA
prefix, Service Networking service, and deletion policy are root constants
rather than operator-tunable tfvars.

## Exact scope

This stack creates exactly:

1. one custom-mode `google_compute_network`;
2. one regional `google_compute_subnetwork` with no secondary ranges;
3. one explicitly addressed `google_compute_global_address` for VPC peering;
4. one `google_service_networking_connection` using that allocated range.

The connection depends on the network and allocated range through direct
Terraform references. `compute.googleapis.com` and
`servicenetworking.googleapis.com` are external prerequisites owned by the
DevOps workflow; this stack does not enable or manage APIs.

This foundation follows the approved Direct VPC direction for later serverless
runtimes. It creates no Serverless VPC Access connector and no Cloud Run
resource. It also creates no firewall rule, Cloud Router, Cloud NAT, Cloud DNS,
Cloud SQL, Redis/Memorystore, load balancer, IAM binding, service account,
Secret Manager resource, Private Service Connect endpoint, Shared VPC,
monitoring resource, logging sink, budget, or remote-state resource.

## State and execution governance

Terraform state is local; no remote backend is configured or approved.

```text
REMOTE_STATE_DECISION=PENDING_SEPARATE_OWNER_APPROVAL
```

The application buckets `moazez-nonprod-91001421934-private` and
`moazez-nonprod-91001421934-published` are forbidden as Terraform state
stores. No `terraform.tfvars` file is required, and credentials or
impersonation are not configured in this source.

Stage 4A permits formatting and static validation only. It forbids
`terraform plan`, `apply`, `destroy`, `import`, `refresh`, and all Terraform
state commands. The operator lifecycle is:

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
explicit Owner and DevOps review before execution. This decision applies only
to the current Staging network foundation and does not establish a deletion
policy for future Production networking.

Deleting or replacing the VPC, subnet, PSA allocation, or Service Networking
connection after managed services depend on them can disrupt connectivity,
strand dependencies, or be blocked by provider-side dependencies. Rollback is
not assumed to be trivial.
