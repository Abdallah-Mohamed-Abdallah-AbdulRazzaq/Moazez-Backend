# Production frontend runtime Terraform source

This isolated Terraform domain prepares the Dark, pre-DNS Production runtime
for the Platform Admin, School Dashboard, Student Web, and Teacher Web. Source preparation
and local validation do not initialize the real backend, run a plan or apply, deploy
Cloud Run, build frontend images, resolve future digests, or mutate Google
Cloud.

## Immutable release inputs

The Production root requires exactly four immutable image values with no
defaults:

- `platform_admin_image` for the `moazez-platform-admin` package;
- `school_dashboard_image` for the `moazez-school-dashboard` package;
- `student_web_image` for the `moazez-student-web` package;
- `teacher_web_image` for the `moazez-teacher-web` package in the dedicated
  `moazez-production-teacher-web` Artifact Registry repository.

Each value must use the exact Production registry and package and be pinned by
lowercase `@sha256:<64 hex>` digest. Mutable tags and cross-environment images
are rejected. Browser-facing `NEXT_PUBLIC_*` configuration belongs to the
immutable frontend image build and is never supplied as Cloud Run runtime
environment configuration here.

The Teacher Web input is additionally locked to the approved NR11-T5A image
in both the Production root and shared module:

```text
teacher_web_image=me-central2-docker.pkg.dev/moazez-production/moazez-production-teacher-web/moazez-teacher-web@sha256:cb15553977c1195ee15f7a0967487eb47f74ad763b66595e573b5a05a1a026da
```

A future Teacher image change requires source review of this release pin.
The other three image inputs and their validation remain unchanged.

## Runtime and identity boundary

The stack owns these protected identities and no application/data IAM roles:

- `moazez-platform-admin-runtime`;
- `moazez-school-ui-runtime`;
- `moazez-student-web-runtime`;
- `moazez-teacher-web-runtime`.

The existing Production IaC deployer receives only resource-level
`roles/iam.serviceAccountUser` on those four identities. Each Cloud Run
service explicitly depends on its corresponding `actAs` membership.

The services are `moazez-production-platform-admin`,
`moazez-production-school-dashboard`, `moazez-production-student-web`, and
`moazez-production-teacher-web`, all in `moazez-production`, region
`me-central2`, on port 8080 with maximum instance
count 100. The Dark boundary is restricted load-balancer ingress, disabled
provider default URIs, absence of the Production external Edge, and absence of
public DNS. `invoker_iam_disabled=true` is not described as the security
barrier, and this stack creates no public IAM.

The four protected runtime identities and four Cloud Run services receive no
Secret Manager, database, Redis, storage, or VPC access from this domain.
There is no Student Web or Teacher Web staging runtime or hostname in this release.

```text
REMOTE_STATE_BUCKET=moazez-production-91001421934-tfstate
REMOTE_STATE_PREFIX=frontend-runtime/production
```

The state bucket is externally owned. Local validation uses backend-disabled,
read-only-lock initialization and must not contact the real backend.

## NR11-T5A source delta and local validation

Teacher Web extends this existing state domain with exactly three resource
addresses under `module.frontend_runtime_environment`:

- `google_service_account.teacher_web_runtime`;
- `google_service_account_iam_member.teacher_web_iac_deployer_act_as`;
- `google_cloud_run_v2_service.teacher_web`.

Existing frontend resources and image inputs are preserved. The Teacher service
has `deletion_protection=true` and `lifecycle.prevent_destroy=true`; its runtime
identity has `deletion_policy=PREVENT` and `lifecycle.prevent_destroy=true`.
Outputs expose only the Teacher runtime email, service name, and provider URI;
the disabled default URI is not a public access path.

Validation uses `terraform fmt -check -recursive`,
`terraform init -backend=false -lockfile=readonly`, and `terraform validate`
with a task-specific external `TF_DATA_DIR`. Focused governance tests also
verify the dedicated image repository, exact approved digest, runtime settings,
and preservation of existing resources, inputs, backend, and provider lock.

The intended future Production plan is `3 add, 0 change, 0 destroy`, assuming
the existing state matches the baseline source, existing image inputs are
retained, and the Teacher resources are absent. This is a source-only
expectation, not evidence of a real Terraform plan. A later separately authorized
Production plan must verify it. NR11-T5A runs no plan, apply, Cloud Run deployment,
image build/publish, DNS/Edge change, backend API change, or database mutation.
