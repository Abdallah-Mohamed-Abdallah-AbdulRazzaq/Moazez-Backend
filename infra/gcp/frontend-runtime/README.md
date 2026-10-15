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

The Teacher Web input is additionally locked to the approved FR-07B image
in both the Production root and shared module. Its Teacher source commit is
`52156b1dea0614259ed7485d80e14079ab74596b`:

```text
teacher_web_image=me-central2-docker.pkg.dev/moazez-production/moazez-production-teacher-web/moazez-teacher-web@sha256:0f4538281e940a59dfa2a9bccc89ce3626653bf30392f2073f6a2a247209d04c
```

The [Teacher production publication run](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Teacher-App/actions/runs/38708086837)
completed successfully on attempt 1 and published and verified this image in
Artifact Registry. FR-07B approves that image in Terraform source validation;
it does not rebuild or republish it. Publication, source approval, and the image
actually running in Cloud Run are separate facts. This source-only change does
not update Cloud Run or verify its running image; deployment requires a separate
governed operation.

A future Teacher image change requires source review of this release pin.
The other three image inputs and their validation remain unchanged.
Student Web's new immutable digest is supplied at separately authorized
Terraform planning time; this source update does not pin it.

## Historical T6.9 approved image

The historical T6.9 approved Teacher source commit was
`e13699b5044205bf3854859c6ffa9e10230d826d`, with this immutable image:

```text
teacher_web_image=me-central2-docker.pkg.dev/moazez-production/moazez-production-teacher-web/moazez-teacher-web@sha256:afe190b1ea78fc2697b7bd7d3ec56b2f1ad42f5854c448842e91ac01d6a9fe9f
```

This is historical approval evidence, not the current source-approved image or
a claim about the image currently deployed. The immutable Backend checkpoint
`1225cb0107dbcbadfae5cd51d89747a480cc9d62` preserves that T6.9 source approval
before FR-07B; the T6.9 source baseline remains
`fe6b4b1b99478628c106b60f65370d08c10c3ceb`.

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

## Historical NR11-T5A source delta and local validation

The historical NR11 Teacher image was:

```text
teacher_web_image=me-central2-docker.pkg.dev/moazez-production/moazez-production-teacher-web/moazez-teacher-web@sha256:cb15553977c1195ee15f7a0967487eb47f74ad763b66595e573b5a05a1a026da
```

The following NR11 record is preserved as historical evidence. The T6.9 source
update changes only the approved Teacher image pin and creates no resources.

The resource additions and counts below describe the historical NR11 source
expectation, not current Terraform State or a currently deployed image.
FR-07B changes no resources or resource addresses.

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
