# Staging Artifact Registry container foundation

```text
STAGE_10B_SOURCE_ONLY=YES
```

Stage 10B is repository Terraform source preparation only. It models exactly
one Staging Artifact Registry Docker repository and performs no Google Cloud
mutation.

Authoritative Stage 10A read-only discovery found zero Artifact Registry
repositories, zero Docker repositories, and zero images in
`moazez-nonprod-91001421934`, including `me-central2`. No import or legacy
repository reuse is currently required. This is historical Stage 10A evidence,
not a permanent assertion about the live project's future inventory.

## Locked Staging design

| Component | Approved value |
| --- | --- |
| Project | `moazez-nonprod-91001421934` |
| Environment | `staging` |
| Location | `me-central2` |
| Repository ID | `moazez-staging-containers` |
| Format | `DOCKER` |
| Mode | `STANDARD_REPOSITORY` |
| Provider deletion policy | `PREVENT` |
| Terraform lifecycle `prevent_destroy` | `true` |
| Production resources | none |

The repository is the container for the final Moazez application-image
contract. API, Core Worker, Media Worker, Migration Job, and Maintenance
Scheduler are roles or commands built from the same backend application
artifact. In particular, the governed Migration Job must use the same immutable
final application image digest as the runtime candidate. This stack creates no
package and pushes no image.

Future packages in this repository may include `moazez-backend`,
`school-dashboard`, and `platform-admin`, but package naming and publication are
owned by later deployment stages.

## Exact ownership boundary

This Terraform domain owns exactly one managed resource and no data sources:

```text
module.artifact_registry_environment.google_artifact_registry_repository.this
```

The stack does not push application images, configure Docker authentication,
own IAM, own Workload Identity Federation, own service accounts, enable the
Artifact Registry API, implement artifact promotion, implement cleanup policy,
implement signing/provenance/SBOM policy, or create Production infrastructure.
It also owns no API-enablement, Artifact Analysis, Container Scanning, KMS,
Cloud Build, Cloud Run, Cloud Run Job, GCS, Secret Manager, Cloud SQL, Redis,
networking, Pub/Sub, or Docker-image resource.

Artifact Registry API enablement is an external prerequisite and was already
present during Stage 10A discovery. Runtime IAM is owned by Stage 11. GitHub
WIF and deployer authorization are owned by Stage 12. Artifact build, push, and
deployment are owned by later deployment stages.

Production Artifact Registry is not part of this root and must not be created
during Stage 10. PRD0-D032 remains the owner decision for the later promotion,
staging-equivalence, and registry-policy contract. Accordingly, this source
does not configure cleanup policies, immutable tags, vulnerability-scanning
configuration, release or promotion tags, canary or soak behavior, or
same-digest promotion automation. Future deployments must consume released
artifacts by immutable digest, but that workflow is outside Stage 10B.

## Remote-state governance

```text
REMOTE_STATE_MODEL=GCS
REMOTE_STATE_BUCKET=moazez-nonprod-91001421934-tfstate
REMOTE_STATE_PREFIX=artifact-registry/staging
REMOTE_STATE_BUCKET_MANAGED_BY_THIS_STACK=NO
```

The state bucket is external to this stack. This domain does not create or
manage the bucket, bucket IAM, or any state infrastructure. Stage 10B local
validation must use `terraform init -backend=false`; the new root must not
initialize or access the real GCS backend or run a cloud-backed plan or apply.

## Deletion governance

The repository uses both supported Terraform safeguards:

```text
deletion_policy=PREVENT
lifecycle.prevent_destroy=true
```

Intentional future deletion requires a separately reviewed source change and
explicitly authorized Terraform mutation. This domain provides no destroy
helper or cleanup script.
