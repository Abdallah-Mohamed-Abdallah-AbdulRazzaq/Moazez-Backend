# Staging GitHub deployment identity foundation

```text
STAGE_12B_SOURCE_ONLY=YES
```

Stage 12B is development-source preparation only. It defines the staging
GitHub Workload Identity Federation boundary and the IaC deployer's narrowly
scoped deployment authorization. It performs no Google Cloud mutation, does
not access the real Terraform backend, and does not run a live plan, apply, or
import.

## Stage 12A discovery baseline

Authoritative Stage 12A read-only discovery reported:

```text
WIF_POOLS=0
WIF_PROVIDERS=0
MEANINGFUL_EXISTING_IAC_DEPLOYER_AUTHORIZATION=0
```

The existing IaC deployer is
`moazez-iac-deployer@moazez-nonprod-91001421934.iam.gserviceaccount.com`.
It is owned by the Storage stack. This stack does not recreate, import, or
manage the lifecycle of that service account.

## Exact ownership boundary

The Storage stack continues to own existing service accounts and existing
storage/application IAM. The Artifact Registry stack owns the existing
`moazez-staging-containers` repository. The Runtime IAM stack owns
`moazez-migration-job`, `moazez-maintenance-scheduler`, and runtime Secret
Manager memberships.

This Deployment Identity stack owns only:

- one GitHub Workload Identity Pool;
- one GitHub Workload Identity Provider;
- one GitHub WIF to IaC deployer impersonation membership;
- one repository-level Artifact Registry writer membership;
- one Terraform state bucket object-admin membership;
- one project-level Cloud Run Developer membership;
- five service-account-level Service Account User memberships.

The seven static resource blocks expand to exactly 11 managed resource
instances. The stack has zero data sources, no `terraform_remote_state`
dependency, and no imports. It does not absorb or duplicate another stack's
resources.

## Locked GitHub identity boundary

| Coordinate | Approved value |
| --- | --- |
| Owner | `Abdallah-Mohamed-Abdallah-AbdulRazzaq` |
| Immutable owner ID | `127324203` |
| Repository | `Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend` |
| Immutable repository ID | `1217512033` |
| Allowed ref | `refs/heads/main` |

The pool ID is `moazez-github-staging`. The provider ID is
`moazez-backend-main`, and its issuer is
`https://token.actions.githubusercontent.com`.

The provider uses exactly this attribute mapping:

```text
google.subject                = assertion.sub
attribute.repository          = assertion.repository
attribute.repository_id       = assertion.repository_id
attribute.repository_owner    = assertion.repository_owner
attribute.repository_owner_id = assertion.repository_owner_id
attribute.ref                 = assertion.ref
```

The exact fail-closed provider condition is:

```text
assertion.repository_id == "1217512033" && assertion.repository_owner_id == "127324203" && assertion.ref == "refs/heads/main"
```

The IaC deployer receives `roles/iam.workloadIdentityUser` from only this
repository-ID-scoped principal set:

```text
principalSet://iam.googleapis.com/projects/375161231141/locations/global/workloadIdentityPools/moazez-github-staging/attribute.repository_id/1217512033
```

The principal set uses the GCP project number, not the project ID. The
provider condition independently enforces the immutable owner ID and exact
main-branch ref. No wildcard principal is authorized.

## IaC deployer authorization

| Role | Exact resource scope |
| --- | --- |
| `roles/artifactregistry.writer` | repository `projects/moazez-nonprod-91001421934/locations/me-central2/repositories/moazez-staging-containers` only |
| `roles/storage.objectAdmin` | bucket `moazez-nonprod-91001421934-tfstate` only |
| `roles/run.developer` | project `moazez-nonprod-91001421934` only |
| `roles/iam.serviceAccountUser` | each of the five approved runtime service accounts below |

The exact runtime `actAs` targets are:

- `moazez-api-runtime`;
- `moazez-core-worker`;
- `moazez-media-worker`;
- `moazez-migration-job`;
- `moazez-maintenance-scheduler`.

There is no Service Account User grant on the signer, the deployer itself, a
default service account, or any other account. There is no project-wide
Service Account User grant.

This stack grants no Token Creator role, creates no service-account key,
grants no secret access, grants no Owner or Editor role, and grants no
production access. It also creates no service account, repository, bucket,
Cloud Run service, Cloud Run job, API enablement, or application resource.

## Remote-state governance

```text
REMOTE_STATE_MODEL=GCS
REMOTE_STATE_BUCKET=moazez-nonprod-91001421934-tfstate
REMOTE_STATE_PREFIX=deployment-identity/staging
REMOTE_STATE_BUCKET_MANAGED_BY_THIS_STACK=NO
```

The backend block is source metadata. Local validation must use an isolated
`TF_DATA_DIR`, backend-disabled initialization, and the committed provider
lock read-only. The real GCS backend must not be initialized or contacted by
development validation.

API enablement is externally governed. DevOps must verify the required
Workload Identity Federation and resource APIs before any live planning.
Stage 13 owns runtime deployment; this stack does not deploy the backend.

## Manual read-only authentication proof

`.github/workflows/staging-wif-auth-proof.yml` is manual and proof-only. It
must be executed only after DevOps has provisioned the Stage 12 live resources.
It checks the exact candidate SHA and `refs/heads/main` before authentication,
then performs only read/list operations for authentication context, the
staging Artifact Registry repository, the deployment-identity Terraform state
prefix, and staging-region Cloud Run services and jobs.

The workflow does not run Terraform, expose tokens or credential contents,
push artifacts, deploy runtimes, execute jobs, read secrets, or mutate Google
Cloud or GitHub.

## Stage 26C Production GitHub deployment identity source

```text
PRODUCTION_SOURCE_PREPARED=YES
PRODUCTION_TERRAFORM_APPLIED=NO
PRODUCTION_SECRET_VERSIONS_CREATED=NO
PRODUCTION_ARTIFACTS_PUSHED=NO
PRODUCTION_RUNTIME_DEPLOYED=NO
```

Stage 26C adds Production Terraform source only. It performs no Google Cloud
mutation, real-backend initialization, live plan, apply, import, artifact
push, or runtime deployment.

The authoritative Stage 26 discovery inputs are project
`moazez-production` (`91001421934`), region `me-central2`, and externally
managed state bucket `moazez-production-91001421934-tfstate`. IAM, IAM
Credentials, STS, Artifact Registry, Secret Manager, and Cloud Run APIs were
reported enabled. Discovery reported zero Production Workload Identity pools,
zero Production Workload Identity providers, zero Production Artifact
Registry repositories, zero Stage 26 Terraform state residue, zero
user-managed service-account keys, and no import or legacy-resource reuse
requirement. Those are point-in-time discovery facts, not evidence that this
source has been applied.

The existing IaC deployer remains owned outside this stack:
`moazez-iac-deployer@moazez-production.iam.gserviceaccount.com`. This stack
does not create, import, or manage its lifecycle. The immutable GitHub owner,
owner ID, repository, repository ID, and allowed ref remain identical to the
Staging contract.

The Production pool is `moazez-github-production`; the provider is
`moazez-backend-main`. Pool metadata is exactly `MOAZEZ GitHub production
deploy` and `MOAZEZ GitHub Actions production deployment identity pool.` The
provider retains the exact GitHub OIDC issuer, six-entry attribute mapping,
and numeric repository-ID, numeric owner-ID, and `refs/heads/main` condition.
Its repository-ID-scoped principal set is:

```text
principalSet://iam.googleapis.com/projects/91001421934/locations/global/workloadIdentityPools/moazez-github-production/attribute.repository_id/1217512033
```

Production authorization remains limited to one IaC-deployer
`roles/iam.workloadIdentityUser` membership, repository-scoped
`roles/artifactregistry.writer` on `moazez-production-containers`,
bucket-scoped `roles/storage.objectAdmin` on the Production state bucket,
project-scoped `roles/run.developer`, and resource-level
`roles/iam.serviceAccountUser` on exactly API Runtime, Core Worker, Media
Worker, Migration Job, and Maintenance Scheduler. The pool, provider, four
single memberships, and five `actAs` memberships total exactly 11 managed
instances.

There is no project-wide Service Account User grant, no `actAs` grant on the
IaC deployer or GCS signer, no wildcard principal, no Token Creator, Owner,
Editor, or Secret Accessor grant, no service-account key, and no resource
creation outside the established Deployment Identity boundary.

```text
REMOTE_STATE_MODEL=GCS
REMOTE_STATE_BUCKET=moazez-production-91001421934-tfstate
REMOTE_STATE_PREFIX=deployment-identity/production
REMOTE_STATE_BUCKET_MANAGED_BY_THIS_STACK=NO
```
