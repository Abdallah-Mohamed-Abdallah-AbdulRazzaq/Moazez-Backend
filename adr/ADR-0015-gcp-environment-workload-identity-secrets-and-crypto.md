# ADR-0015: GCP Environment, Workload Identity, Secrets, and Crypto

## Status

Accepted for PRD0-D017 and PRD0-D018 only. PRD0-D020, PRD0-D021, and
PRD0-D023 remain pending.

## Approval authority

- Owner: Abdallah
- Approved at: `2026-08-09T15:20:43+03:00`
- Timezone: Africa/Cairo
- Approval capacities: billing, organization policy, architecture, security, operations, release
- Accepted owner questions: PRD0-Q005 option A and PRD0-Q018 option A
- Pending owner questions: PRD0-Q020, PRD0-Q021, PRD0-Q023

## Context

Moazez requires production isolation before real school data is introduced.
The modular-monolith deployment already defines API, Core Worker, Media
Worker, Migration Job, and Maintenance Scheduler roles, but an approved base
SHA contains no production GCP project/IAM implementation. Sharing one project
or one broad runtime identity would combine production and test mutation, DDL,
object, signing, scheduler, secret, and deploy blast radii.

This ADR locks project and identity boundaries only. Secret versioning,
application encryption-key envelopes, ingress/domain policy, and production
resource provisioning remain separately gated.

## Decision

### Environment projects

| Environment | Approved boundary |
| --- | --- |
| Production | `moazez-production` |
| Staging | `moazez-nonprod-91001421934` |
| Isolated cloud test | `moazez-nonprod-91001421934` |
| Development | `LOCAL_ONLY` |
| CI object storage | `LOCAL_MINIO` |
| Disaster recovery | `NONE` |

`moazez-production` is production-only. Staging and isolated real-provider
tests use the non-production project and separate resources. Production school
data, secrets, identities, and mutable state cannot be copied into or reused by
non-production. Artifact promotion is allowed only through later approved
release policy; environment data promotion is not.

The approved non-production project name is a target boundary, not evidence
that the project has been created, billed, policy-configured, or validated.
No DR project or cross-region recovery environment is approved.

### Per-project service accounts

Each cloud project uses separate instances of these exact service-account names:

| Function | Account name |
| --- | --- |
| API runtime | `moazez-api-runtime` |
| Core Worker | `moazez-core-worker` |
| Media Worker | `moazez-media-worker` |
| Migration Job | `moazez-migration-job` |
| Maintenance Scheduler | `moazez-maintenance-scheduler` |
| IaC deployer | `moazez-iac-deployer` |
| Signed-URL capability | `moazez-gcs-signer` |

No account is shared across production and non-production. Runtime and job
accounts receive only permissions required by their accepted responsibility
maps. The IaC deployer is distinct from every runtime. Bucket creation, IAM
administration, public-access mutation, secret administration, DDL, provider
delivery, and object deletion are not granted merely because an account name
is approved.

Workload identity/ADC is the deployment mechanism. Long-lived downloaded JSON
service-account keys are not approved. The dedicated signed-URL mechanism and
bucket limits are owned by ADR-0006/PRD0-D019.

## Owned production decisions

| Decision | Owner question | Decision-level status |
| --- | --- | --- |
| PRD0-D017 | PRD0-Q005 | Accepted |
| PRD0-D018 | PRD0-Q018 | Accepted |
| PRD0-D020 | PRD0-Q020 | Pending |
| PRD0-D021 | PRD0-Q021 | Pending |
| PRD0-D023 | PRD0-Q023 | Pending |

This ADR is the sole authoritative owner of PRD0-D017 through PRD0-D021 and
PRD0-D023. Acceptance applies only to PRD0-D017 and PRD0-D018.

## Consequences

### Positive

- Production mutation and data are isolated from staging/cloud tests.
- API, workers, migration, scheduler, deployer, and signer can be proven with
  independent allow/deny IAM tests.
- Static key distribution is removed from the target runtime model.

### Costs and constraints

- Two projects require separate billing visibility, policies, quotas, IaC
  state, buckets, identities, logs, and provider test resources.
- Cross-project access is denied by default and must not be added for convenience.
- The project and account names do not authorize permissions beyond the exact
  later-reviewed IAM matrix.

## Security and compatibility

- No API route, DTO, database schema, migration, queue, WebSocket, file, or
  Learning Media contract changes.
- Production and non-production credentials, data, and buckets remain disjoint.
- IAM errors and logs disclose no credential, token, key material, secret
  version, bucket/object coordinate, or foreign-project data.
- Negative tests must prove runtime identities cannot create buckets, change
  IAM, make objects public, impersonate unrelated accounts, or perform
  deployment administration.

## Implementation status

This ADR records authority only. The production project/billing/API preflight
has external evidence, but no non-production project, service account, IAM
grant, Terraform state, workload binding, or cloud resource is claimed here.
PRD4-G01 moves from owner-blocked to not started; implementation and real
allow/deny evidence remain mandatory.

## Deferred owned decisions

- PRD0-D020/PRD0-Q020: Secret Manager pinning, rotation, overlap, emergency
  access, and rollback.
- PRD0-D021/PRD0-Q021: encryption-key families, key IDs, multi-key decrypt,
  and re-encryption.
- PRD0-D023/PRD0-Q023: domains, ingress, trusted proxies, load balancer, and
  Cloud Armor.

## Rollback and reopen conditions

IAM may roll back to a previously reviewed least-privilege policy only while
the deployed artifact remains compatible. Do not collapse projects or
identities as a rollback shortcut. Reopen for organization-policy constraints,
a project-name change, approved DR, cross-project artifact access, a platform
identity limitation, or a material responsibility change.

## Explicit non-authorization

This ADR does not create a GCP project, service account, IAM binding, secret,
key, network, bucket, database, Redis instance, Terraform state, deployment,
or production launch. Pending decisions remain unapproved.
