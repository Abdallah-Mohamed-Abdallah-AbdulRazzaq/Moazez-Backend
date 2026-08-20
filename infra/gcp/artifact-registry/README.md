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

## Stage 26C Production source preparation

```text
PRODUCTION_SOURCE_PREPARED=YES
PRODUCTION_TERRAFORM_APPLIED=NO
PRODUCTION_SECRET_VERSIONS_CREATED=NO
PRODUCTION_ARTIFACTS_PUSHED=NO
PRODUCTION_RUNTIME_DEPLOYED=NO
```

Stage 26C adds a separate Production source root without changing the
historical Staging root. It models exactly one standard Docker repository and
does not push an image or package, configure authentication, add cleanup/tag
policies, or implement artifact promotion, signing, provenance, SBOM, canary,
or soak behavior.

| Component | Production source value |
| --- | --- |
| Project | `moazez-production` |
| Project number | `91001421934` |
| Environment | `production` |
| Location | `me-central2` |
| Repository ID | `moazez-production-containers` |
| Description | `Stores Moazez production container artifacts.` |
| Format | `DOCKER` |
| Mode | `STANDARD_REPOSITORY` |
| State bucket | `moazez-production-91001421934-tfstate` |
| State prefix | `artifact-registry/production` |
| Provider deletion policy | `PREVENT` |
| Terraform lifecycle `prevent_destroy` | `true` |

Stage 26A/26B authoritative discovery reported the Production project active,
the Artifact Registry API enabled, zero Production Artifact Registry
repositories, and zero Stage 26 Terraform-state residue. Therefore import and
legacy-resource reuse were not required. These are discovery facts, not a
claim that Terraform was initialized or applied. The module derives the exact
Staging or Production description from its governed environment and accepts no
arbitrary project, location, repository ID, or description input.

```text
PROJECT_ID=moazez-production
PROJECT_NUMBER=91001421934
REGION=me-central2
STATE_BUCKET=moazez-production-91001421934-tfstate
ARTIFACT_REGISTRY_API=ENABLED
PRODUCTION_ARTIFACT_REPOSITORIES=0
STAGE26_TERRAFORM_STATE_RESIDUE=0
IMPORT_REQUIRED=NO
LEGACY_RESOURCE_REUSE_REQUIRED=NO
```
