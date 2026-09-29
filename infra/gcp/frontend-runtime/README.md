# Production frontend runtime Terraform source

This isolated Terraform domain prepares the Dark, pre-DNS Production runtime
for the Platform Admin, School Dashboard, and Student Web. Source preparation
and local validation do not initialize the real backend, run a plan or apply, deploy
Cloud Run, build frontend images, resolve future digests, or mutate Google
Cloud.

## Immutable release inputs

The Production root requires exactly three immutable image values with no
defaults:

- `platform_admin_image` for the `moazez-platform-admin` package;
- `school_dashboard_image` for the `moazez-school-dashboard` package;
- `student_web_image` for the `moazez-student-web` package.

Each value must use the exact Production registry and package and be pinned by
lowercase `@sha256:<64 hex>` digest. Mutable tags and cross-environment images
are rejected. Browser-facing `NEXT_PUBLIC_*` configuration belongs to the
immutable frontend image build and is never supplied as Cloud Run runtime
environment configuration here.

## Runtime and identity boundary

The stack owns these protected identities and no application/data IAM roles:

- `moazez-platform-admin-runtime`;
- `moazez-school-ui-runtime`;
- `moazez-student-web-runtime`.

The existing Production IaC deployer receives only resource-level
`roles/iam.serviceAccountUser` on those three identities. Each Cloud Run
service explicitly depends on its corresponding `actAs` membership.

The services are `moazez-production-platform-admin`,
`moazez-production-school-dashboard`, and
`moazez-production-student-web`, all on port 8080 with maximum instance
count 100. The Dark boundary is restricted load-balancer ingress, disabled
provider default URIs, absence of the Production external Edge, and absence of
public DNS. `invoker_iam_disabled=true` is not described as the security
barrier, and this stack creates no public IAM.

The three protected runtime identities and three Cloud Run services receive no
Secret Manager, database, Redis, storage, or VPC access from this domain.
There is no Student Web staging runtime or hostname in this release.

```text
REMOTE_STATE_BUCKET=moazez-production-91001421934-tfstate
REMOTE_STATE_PREFIX=frontend-runtime/production
```

The state bucket is externally owned. Local validation uses backend-disabled,
read-only-lock initialization and must not contact the real backend.
