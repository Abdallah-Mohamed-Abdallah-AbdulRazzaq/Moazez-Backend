# Production frontend artifact identity Terraform source

This isolated Terraform domain prepares the Production build identity used by
the Platform Admin and School Dashboard repositories. It is source-only: local
validation must not initialize the real backend, run a plan or apply, mutate
Google Cloud IAM, build a frontend image, or push an artifact.

## Ownership boundary

This stack references the existing `moazez-github-production` Workload
Identity Pool without creating, importing, or claiming it. It does not modify
the existing Backend provider `moazez-backend-main` or allow either frontend
repository to impersonate the Production IaC deployer.

It owns exactly:

- `moazez-platform-admin-main`, restricted to repository ID `1335685284`,
  owner ID `127324203`, and `refs/heads/main`;
- `moazez-school-dashboard-main`, restricted to repository ID `1335686453`,
  owner ID `127324203`, and `refs/heads/main`;
- `moazez-ui-artifact-builder@moazez-production.iam.gserviceaccount.com`;
- two repository-ID-scoped `roles/iam.workloadIdentityUser` memberships on
  that builder;
- one `roles/artifactregistry.writer` membership on only
  `moazez-production-containers` in `me-central2`.

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
