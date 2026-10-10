# Production frontend artifact identity Terraform source

This isolated Terraform domain prepares the Production build identity used by
the Platform Admin, School Dashboard, Student App, and Teacher App repositories.
It is source-only: local validation must not initialize the real backend, run a plan
or apply, mutate Google Cloud IAM, build a frontend image, or push an artifact.

## Ownership boundary

This stack references the existing `moazez-github-production` Workload
Identity Pool without creating, importing, or claiming it. It does not modify
the existing Backend provider `moazez-backend-main` or allow any frontend
repository to impersonate the Production IaC deployer.

It owns exactly:

- `moazez-platform-admin-main`, restricted to repository ID `1335685284`,
  owner ID `127324203`, and `refs/heads/main`;
- `moazez-school-dashboard-main`, restricted to repository ID `1335686453`,
  owner ID `127324203`, and `refs/heads/main`;
- `moazez-student-app-main`, restricted to repository ID `1391516333`,
  owner ID `127324203`, and `refs/heads/main`;
- `moazez-teacher-app-main`, restricted to repository ID `1412551303`,
  owner ID `127324203`, and `refs/heads/main`, for
  `Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Teacher-App`;
- `moazez-ui-artifact-builder@moazez-production.iam.gserviceaccount.com`;
- four repository-ID-scoped `roles/iam.workloadIdentityUser` memberships on
  that builder;
- two repository-scoped `roles/artifactregistry.writer` memberships in
  `me-central2`: the existing membership on `moazez-production-containers`
  and the NR11-T3A addition on `moazez-production-teacher-web`.

These are four providers, one shared builder, four WIF memberships, and two
Artifact Registry writer memberships. No service-account keys, runtime identity
grants, or secrets are created here. Student Web and Teacher Web have no staging
WIF provider.

Teacher artifact publication reuses the existing builder. Its dedicated
repository writer is additive and requires the new repository to exist first.
Teacher runtime, edge routing, and backend CORS remain separately governed.

The builder receives no Cloud Run, Terraform state, Secret Manager, database,
Redis, storage bucket, project-wide, runtime `actAs`, or service-account key
authority.

## State and validation

```text
REMOTE_STATE_BUCKET=moazez-production-91001421934-tfstate
REMOTE_STATE_PREFIX=frontend-artifact-identity/production
```

The state bucket is externally owned. Local source validation uses
`terraform init -backend=false -input=false -no-color -lockfile=readonly` and
must never contact the real backend.

Use a fresh external `TF_DATA_DIR` dedicated to this Production root, separate
from the Artifact Registry root's validation directory. Run `terraform fmt -check`
and `terraform validate -no-color` as independent source checks. Preserve
the committed provider lock file and do not initialize remote Terraform State.

## NR11-T3A shared-builder trust boundary

The new root resource
`google_artifact_registry_repository_iam_member.teacher_web_artifact_writer`
grants only `roles/artifactregistry.writer` on
`moazez-production-teacher-web` to the existing
`moazez-ui-artifact-builder@moazez-production.iam.gserviceaccount.com` through
the existing module's builder email output. It does not change the module or
any existing WIF provider, Service Account, or IAM membership, including
`moazez-teacher-app-main` and the shared repository writer.

The repository is isolated for immutable-tag policy only. All four already-approved
frontend WIF identities (Platform Admin, School Dashboard, Student App, and Teacher
App) can assume the same shared builder and thereby use its writer access to
both repositories. **This IAM design does not enforce per-repository publisher
isolation.** Provider repository-ID conditions control who can assume the
builder; they do not limit an assumed builder to one Artifact Registry repository.
No new service account, key, broad project permission, or runtime grant is added.

The expected future scope is one new repository IAM membership and zero existing
resource changes in this state. This is not evidence of a real Terraform Plan.
The separately authorized saved-plan stage must verify actual state and live
IAM independently. Create and verify the repository first, then apply and verify
its writer membership; never apply either automatically. The full
[deployment matrix and verification order](../artifact-registry/README.md#expected-future-deployment-scope-and-order)
are owned by the Artifact Registry handoff. No GCP mutation is authorized here.

### Later Teacher Cloud Run Artifact Registry Reader prerequisites

Before a separately approved Teacher runtime deployment, verify effective
`roles/artifactregistry.reader` access on the new repository for the deployment
principal (including the IaC deployer if Terraform deploys Cloud Run). A writer
grant to the frontend builder does not grant reader access to that deployer.
Any missing access must be reviewed separately at repository scope.
[Cloud Run deployment role requirements](https://docs.cloud.google.com/run/docs/deploying#required_roles).

Also verify image-read access for the Production Cloud Run service agent,
`service-91001421934@serverless-robot-prod.iam.gserviceaccount.com`. Same-project
access is normally provided by its `roles/run.serviceAgent` role; confirm that
role and effective access to this new repository before deployment. If a later
approved runtime resides in another project, its own Cloud Run service agent
requires an explicit repository-scoped reader grant in the image project.
The service agent is distinct from the runtime service account; this task adds
neither reader membership nor Cloud Run configuration.
[Cloud Run service agent permissions](https://docs.cloud.google.com/run/docs/reference/iam/roles)
and [Artifact Registry integration with Cloud Run](https://docs.cloud.google.com/artifact-registry/docs/integrate-cloud-run).
