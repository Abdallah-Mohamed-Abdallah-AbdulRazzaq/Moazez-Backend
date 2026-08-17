# ADR-0015: GCP Environment, Workload Identity, Secrets, and Crypto

## Status

Accepted for PRD0-D017, PRD0-D018, PRD0-D020, PRD0-D021, and the staging-only
sub-disposition of PRD0-D023. PRD0-D023 remains pending for production.

## Approval authority

- Owner: Abdallah
- Approved at: `2026-08-09T15:20:43+03:00`
- Timezone: Africa/Cairo
- Approval capacities: billing, organization policy, architecture, security, operations, release
- Accepted owner questions: PRD0-Q005 option A, PRD0-Q018 option A,
  PRD0-Q020 option A, and PRD0-Q021 option A
- Q020/Q021 amendment approved at: `2026-08-14T06:37:00+03:00`
- Q020/Q021 amendment timezone: Africa/Cairo
- Q020/Q021 security, operations, and release approver: Abdallah
- Q023 staging-only amendment approved at: `2026-08-16T19:00:00+03:00`
- Q023 staging-only amendment timezone: Africa/Cairo
- Q023 staging-only approver: Abdallah
- Accepted scoped owner question: PRD0-Q023-STAGING option A
- Pending owner question: PRD0-Q023-PRODUCTION

## Context

Moazez requires production isolation before real school data is introduced.
The modular-monolith deployment already defines API, Core Worker, Media
Worker, Migration Job, and Maintenance Scheduler roles, but the accepted
baseline contains no production GCP project/IAM implementation. Sharing one
project or one broad runtime identity would combine production and test
mutation, DDL, object, signing, scheduler, secret, and deploy blast radii.

This ADR locks the project and identity boundaries, release-pinned secret
version policy, application encryption-key envelope contract, and the approved
staging-only ingress/domain sub-disposition. Production ingress/domain policy
and all production resource provisioning remain separately gated.

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

### Staging API edge sub-disposition

The exact environment-scoped disposition is:

```text
PRD0-Q023-STAGING=APPROVED(scope=STAGING_ONLY,option=A,api_domain=staging-api.moazez.cloud,ingress=internal-and-cloud-load-balancing,cloud_armor=YES,trusted_proxies=GOOGLE_CLOUD_EXTERNAL_APPLICATION_LOAD_BALANCER_ONLY,direct_public_run_app=NO,approver=Abdallah,approved_at=2026-08-16T19:00:00+03:00); PRD0-Q023-PRODUCTION=PENDING(owner=Abdallah,deadline=before production Phase 7/8,constraint=Production API hostname and edge disposition remain unapproved; silence authorizes no production implementation or cloud provisioning)
```

For staging, option A selects `staging-api.moazez.cloud` as the canonical API
domain, internal-and-Cloud-Load-Balancing ingress for the Cloud Run API, Cloud
Armor at the external Application Load Balancer, and trust only for forwarded
headers supplied by that Google Cloud external Application Load Balancer.
Direct public access through the underlying `run.app` hostname is not the
approved staging public ingress path.

This is architecture and source authority for staging only. It neither creates
nor proves a serverless NEG, load balancer backend, URL map, target proxy,
forwarding rule, external IP, Cloud Armor policy, certificate, DNS record, IAM
grant, or runtime deployment. It does not approve or imply any production API
hostname, ingress, load-balancer, Cloud Armor, trusted-proxy, certificate, DNS,
or direct-`run.app` policy.

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

### Secret Manager version and rotation policy

PRD0-Q020 option A requires each release to select explicit immutable Secret
Manager versions. Runtime configuration must not use a mutable version alias.
The normal rotation cadence is 90 days with an approved staged seven-day
active/previous overlap. The prior version remains available throughout that
overlap and rollback window. The overlap must be tested and rehearsed in the
later cloud/deployment gate; no rotation rehearsal is currently claimed.
Emergency rotation creates and explicitly selects a pinned replacement
version; it does not introduce dynamic runtime refresh.

Abdallah owns both emergency rotation and release selection. This policy is a
deployment contract only: it does not claim a Secret Manager resource, secret
version, access grant, or rotation rehearsal exists.

### Encryption key families and envelope policy

PRD0-Q021 option A approves exactly two independent AES-256-GCM key families:

- `smtp-secret`;
- `app-device-token`.

Every new write uses only the active key for its family and emits exactly
`v2:<keyId>:<iv>:<tag>:<ciphertext>`. The key ID is explicit metadata and
matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. Each family keyring contains its
active key and an optional previous key for controlled multi-key decryption.
Unknown key IDs fail closed, and one family never consults the other family's
keyring.

AES-GCM authenticates the exact context `v2:<family>:<keyId>`, where `family`
is exactly `smtp-secret` or `app-device-token`. Family is implicit in the
domain keyring and is not another persisted envelope field; key ID remains
family-local metadata. Family and key ID are both authenticated through AAD.
Reuse of any v2 SMTP active/previous key material by any app-device-token
active/previous entry is invalid. Active and previous key bytes within one
family are not required to differ. This authenticated protocol contract is
being established before any production v2 ciphertext exists.

Legacy `v1:<iv>:<tag>:<ciphertext>` remains decryptable during the governed
compatibility/migration window. `SETTINGS_SECRET_ENCRYPTION_KEY` is optional,
legacy-v1 decrypt-only material. It is never used for new writes or as a
fallback for an absent family active key. New v1 writes are prohibited. The
rotation cadence is 90 days, and this decision introduces no Cloud KMS,
dynamic secret refresh, or automatic read-time re-encryption.

## Owned production decisions

| Decision | Owner question | Decision-level status |
| --- | --- | --- |
| PRD0-D017 | PRD0-Q005 | Accepted |
| PRD0-D018 | PRD0-Q018 | Accepted |
| PRD0-D020 | PRD0-Q020 | Accepted |
| PRD0-D021 | PRD0-Q021 | Accepted |
| PRD0-D023 | PRD0-Q023 | Pending overall; staging-only sub-disposition accepted, production pending |

This ADR is the sole authoritative owner of PRD0-D017 through PRD0-D021 and
PRD0-D023. Full-decision acceptance applies to PRD0-D017, PRD0-D018,
PRD0-D020, and PRD0-D021. PRD0-D023 acceptance is limited to its staging-only
sub-disposition and does not close the production decision.

## Consequences

### Positive

- Production mutation and data are isolated from staging/cloud tests.
- API, workers, migration, scheduler, deployer, and signer can be proven with
  independent allow/deny IAM tests.
- Static service-account key distribution is removed from the target runtime
  model.
- Release-pinned versions make secret selection reproducible and rollback-
  aware.
- Separate key families limit compromise and rotation blast radius.

### Costs and constraints

- Two projects require separate billing visibility, policies, quotas, IaC
  state, buckets, identities, logs, and provider test resources.
- Cross-project access is denied by default and must not be added for convenience.
- The project and account names do not authorize permissions beyond the exact
  later-reviewed IAM matrix.
- Rotation requires explicit release mapping and overlap/rollback rehearsal.

## Security and compatibility

- No API route, DTO, database schema, migration, queue, WebSocket, file, or
  Learning Media contract changes.
- Production and non-production credentials, data, and buckets remain disjoint.
- IAM errors and logs disclose no credential, token, key material, secret
  version, bucket/object coordinate, or foreign-project data.
- SMTP and app-device-token encrypted values retain AES-256-GCM with 32-byte
  keys and 12-byte random IVs; public API and database contracts do not change.
- Negative tests must prove runtime identities cannot create buckets, change
  IAM, make objects public, impersonate unrelated accounts, or perform
  deployment administration.

## Current operator-supplied preflight context

The Owner supplied the following operator observations. They are context only,
not Codex-generated proof and not acceptance of PRD4-G01 or PRD5A-G03:

- `moazez-production` (`91001421934`) was observed `ACTIVE`, billing-enabled,
  with the Storage and IAM Credentials APIs enabled and zero GCS buckets;
- the active account could not access `moazez-nonprod-91001421934`, or that
  project may not exist; exact cause is unresolved.

```text
NONPROD_PROJECT_ACCESS=UNRESOLVED
REAL_GCS_NONPROD_PROOF=BLOCKED_UNTIL_RESOLVED
```

## Implementation status

This approval provides architectural and repository authority for D020/D021,
and the Stage 9A repository baseline implements the versioned family contract
and focused tests. It does not prove cloud delivery or runtime deployment.
No project, service account, IAM grant, Secret Manager secret/version,
Terraform state, workload binding, rotation rehearsal, deployment, or cloud
resource is claimed here. PRD4-G01 remains not started; PRD4-G02 and PRD4-G03
remain baseline-only pending their later cloud, data, and deployment evidence.
The Q023 staging-only amendment likewise records a source contract rather than
deployed edge infrastructure. Phase 4 is not complete.

## Deferred production portion of owned decision

- PRD0-D023/PRD0-Q023-PRODUCTION: production domain, ingress, trusted proxies,
  load balancer, Cloud Armor, certificate, DNS, and direct-`run.app` policy.

The Owner-directed storage fast path does not approve or complete these
deferred production semantics. It only permits storage work to use the
accepted project/runtime/signer boundary before full Phase 4 closeout.

## Rollback and reopen conditions

IAM may roll back to a previously reviewed least-privilege policy only while
the deployed artifact remains compatible. Do not collapse projects or
identities as a rollback shortcut. Reopen for organization-policy constraints,
a project-name change, approved DR, cross-project artifact access, a platform
identity limitation, or a material responsibility change.

## Explicit non-authorization

This ADR does not create a GCP project, service account, IAM binding, secret,
secret version, key, network, bucket, database, Redis instance, Terraform
state, runtime deployment, or production launch. It does not authorize
production traffic. PRD0-D023 remains unapproved for production, and Phase 4
is not complete.

```text
GCP_SECRET_MANAGER_SECRET_EXISTS=NO
SECRET_MANAGER_VERSIONS_PROVISIONED=NO
IAM_SECRET_ACCESS_CREATED=NO
ROTATION_REHEARSAL_COMPLETE=NO
RUNTIME_DEPLOYMENT_COMPLETE=NO
PRODUCTION_TRAFFIC_AUTHORIZED=NO
PHASE_4=NOT_COMPLETE
```
