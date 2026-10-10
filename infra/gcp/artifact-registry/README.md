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

The historical Stage 10B Staging root owns exactly one managed resource and no
data sources:

```text
module.artifact_registry_environment.google_artifact_registry_repository.this
```

The Stage 10B stack does not push application images, configure Docker authentication,
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

Production Artifact Registry is not part of the Staging root and must not be created
during Stage 10. PRD0-D032 remains the owner decision for the later promotion,
staging-equivalence, and registry-policy contract. Accordingly, this source
Stage 10B does not configure cleanup policies, immutable tags, vulnerability-scanning
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

Stage 26C added a separate Production source root without changing the
historical Staging root. That baseline modeled exactly one standard Docker
repository and did not push an image or package, configure authentication, add cleanup/tag
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

## NR11-T3A isolated immutable Teacher Web repository

This source-only addition declares
`google_artifact_registry_repository.teacher_web` directly in the Production
root. It preserves the existing
`module.artifact_registry_environment.google_artifact_registry_repository.this`,
its shared `moazez-production-containers` configuration, labels, IAM, package
paths, and state address. The shared repository's observed `immutableTags=false`
is supplied task context, not a live check performed here. Its module receives
no `docker_config` change; Teacher's immutable-tag publication guard must remain
strict. The Staging root and shared module are unchanged.

| Component | Teacher source value |
| --- | --- |
| Project | `moazez-production` |
| Location | `me-central2` |
| Repository ID | `moazez-production-teacher-web` |
| Format / mode | `DOCKER` / `STANDARD_REPOSITORY` |
| `docker_config.immutable_tags` | `true` |
| Provider deletion policy | `PREVENT` |
| Terraform lifecycle `prevent_destroy` | `true` |
| Future image package | `me-central2-docker.pkg.dev/moazez-production/moazez-production-teacher-web/moazez-teacher-web` |

Immutable tags are enforced by the repository. The deletion policy and lifecycle
protect Terraform repository deletion; they do not establish publisher isolation
or a general artifact-retention policy. No package, image, cleanup policy, or
reader IAM grant is created by this source.

### Expected future deployment scope and order

These are source-derived expectations, **not evidence of a real Terraform Plan**.
No remote-state initialization, plan, apply, import, GCP mutation, image push, or
workflow dispatch is authorized or performed by NR11-T3A.

| Production state prefix | Expected additions | Expected existing resource changes |
| --- | --- | --- |
| `artifact-registry/production` | 1 repository: `google_artifact_registry_repository.teacher_web` | 0 |
| `frontend-artifact-identity/production` | 1 repository IAM membership: `google_artifact_registry_repository_iam_member.teacher_web_artifact_writer` | 0 |

The eventual separately authorized saved-plan stage must independently inspect
actual state and live resources, confirm ownership and the exact additions,
and reject existing-resource updates, replacements, or deletions. A collision
or drift requires review; this task supplies no import or repair authorization.
The state bucket and both state prefixes remain unchanged.

1. Review and authorize the Artifact Registry saved plan separately. Apply only
   that approved plan, then verify the new repository's project, location, ID,
   format, mode, immutable tags, and protection settings while confirming the
   shared repository is unchanged.
2. Only after repository creation and verification, review and authorize the
   Frontend Artifact Identity saved plan separately. Apply only that approved
   plan, then verify the existing builder's repository-scoped writer membership
   and preservation of all existing providers, accounts, and IAM memberships.
3. Update the Teacher App publication destination in a separate reviewed task
   after infrastructure review and required deployment verification. This task
   changes no Teacher App source or publication guard.

Never apply either stack automatically. The separate states have no Terraform
dependency edge; the operator must enforce this order. See the
[shared-builder trust boundary and later Cloud Run reader prerequisites](../frontend-artifact-identity/README.md#nr11-t3a-shared-builder-trust-boundary).

### Local source validation

Validate each Production root independently with its own fresh external
`TF_DATA_DIR`, outside all Git worktrees. Run `terraform fmt -check`, followed by
`terraform init -backend=false -input=false -no-color -lockfile=readonly` and
`terraform validate -no-color` for each root. Keep the committed provider lock
files unchanged. These checks validate source and provider schemas without
accessing remote Terraform State and cannot prove the future deployment scope.
