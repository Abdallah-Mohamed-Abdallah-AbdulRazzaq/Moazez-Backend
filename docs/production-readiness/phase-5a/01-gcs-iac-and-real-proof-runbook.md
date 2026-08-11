# GCS IaC and real-provider proof runbook

## Status and boundary

```text
BATCH_1=CLOSED
BATCH_2=CLOSED
PRD5A-G02=COMPLETE
PRD5A-G03=COMPLETE

NONPROD_GCS_OBJECT_CONTRACT_PROOF=PASS
PRODUCTION_GCS_PROVISIONING=PASS
PRODUCTION_GCS_READONLY_PROOF=PASS
REAL_OBJECT_PROOF_ENVIRONMENT=NONPROD_ONLY

PRODUCTION_PRIVATE_LIVE=0
PRODUCTION_PRIVATE_NONCURRENT=0
PRODUCTION_PRIVATE_SOFT_DELETED=0
PRODUCTION_PUBLISHED_LIVE=0
PRODUCTION_PUBLISHED_NONCURRENT=0
PRODUCTION_PUBLISHED_SOFT_DELETED=0
PRODUCTION_OBJECT_WRITES_DURING_BATCH2=0

PHASE_4=NOT_COMPLETE
PHASE_5A=NOT_COMPLETE
PHASE_5B=NOT_STARTED
REAL_DATA_ALLOWED=NO
PRODUCTION_DATA_ALLOWED=NO
PRODUCTION_UPLOADS_ALLOWED=NO
PRODUCTION_TRAFFIC_ALLOWED=NO
```

Batch 2 is accepted closed as of the 2026-08-11 Owner amendment. Sections A–J
are retained as the historical operator procedure and may be rerun only under
separate Owner change control. This Batch 3 source work does not execute any
command in this document, contact Google Cloud, or change cloud state.

The four application buckets are not Terraform-state buckets. Both Terraform
roots temporarily use local state. State and plan files are ignored and must
be protected as operator-local artifacts until a separately approved remote
state design exists.

Never write a proof object to either production bucket. Object Versioning and
seven-day Soft Delete mean that replacing or deleting synthetic production
objects would still contaminate clean-start evidence.

## A. Read-only project preflight

### A1. Read-only project preflight

From the repository root, run:

```powershell
powershell -NoProfile -File scripts/storage/gcs-batch2-preflight.ps1
```

The script uses read-only `gcloud` descriptions and listings. It reports the
active account; project visibility, state, billing, and project number; the
Service Usage bootstrap API; the four Terraform-managed APIs; current buckets;
the five relevant service accounts; and approved-target collision state. It
never prints an access token. Permission denied, explicit not-found, and an
ambiguous CLI failure have distinct classifications.

### A2. Confirm Service Usage API bootstrap prerequisite

Terraform does not self-bootstrap Service Usage. The preflight must report:

```text
BOOTSTRAP_REQUIRED_API.name=serviceusage.googleapis.com
BOOTSTRAP_REQUIRED_API.enabled=true
SERVICE_USAGE_API_ENABLED=required before Terraform can manage remaining APIs
```

If Service Usage is disabled, `READY_FOR_NONPROD_TERRAFORM_PLAN=NO`. The Owner
must separately review and perform that bootstrap write; this module does not
grant or execute it. Storage, IAM, IAM Credentials, and Cloud Resource Manager
may still be disabled because Terraform manages those four APIs. Their disabled
state is not itself a readiness predicate; however, if it prevents the
read-only target-collision inventory from resolving, that unresolved inventory
still fails closed under A4.

### A3. Stop on ambiguous nonprod access

The combined Google error saying the caller lacks permission “or the project
may not exist” is `UNRESOLVED`, not proof of access denial or nonexistence.
Stop on `UNRESOLVED`, `ACCESS_DENIED`, or `NOT_FOUND`; only
`NONPROD_PROJECT_ACCESS=RESOLVED_VISIBLE` can proceed.

### A4. Stop on approved target-resource collision

For the two approved buckets, five storage-critical service accounts, and—when
IAM is enabled—the custom readiness role, inspect `targetResources`. Stop when:

```text
EXISTING_TARGET_RESOURCES=REVIEW_REQUIRED
EXISTING_TARGET_RESOURCES=UNRESOLVED
```

Only `EXISTING_TARGET_RESOURCES=NONE` can proceed. Unrelated project resources
are not collisions. Never delete, recreate, or automatically import a target;
the Owner must review and reconcile it separately.

Stop unless all of the following are true:

```text
NONPROD_PROJECT_ACCESS=RESOLVED_VISIBLE
READY_FOR_NONPROD_TERRAFORM_PLAN=YES
nonprod.lifecycleState=ACTIVE
nonprod.billingEnabled=true
BOOTSTRAP_REQUIRED_API.enabled=true
EXISTING_TARGET_RESOURCES=NONE
```

The script exits non-zero while nonprod cannot be planned safely. It never
creates the missing project or changes billing/APIs/IAM/buckets.

### A5. Terraform format, initialization, and validation

After A1–A4 pass, validate the nonprod root locally before any plan:

```powershell
Set-Location infra/gcp/storage/environments/nonprod
terraform fmt -check -recursive ../..
terraform init
terraform validate
```

At the Batch 2A source-preparation checkpoint these commands had not yet run.
They were subsequently covered by the independently accepted Batch 2 evidence;
this paragraph is retained only to preserve the historical operator sequence.

## B. Nonprod Terraform plan

### A6. Nonprod Terraform plan

Only after A1–A5 pass:

```powershell
terraform plan -out=nonprod.tfplan
terraform show nonprod.tfplan
```

Review the plan for exactly:

- two `ME-CENTRAL2` `STANDARD` private buckets;
- UBLA, enforced PAP, versioning, and `604800`-second Soft Delete;
- no retention policy or lifecycle rule;
- five service accounts and no keys;
- private-bucket `roles/storage.objectUser` for API/Core/Media;
- project custom role containing only `storage.buckets.get` for those runtimes;
- signer Viewer+Creator on private and Viewer on published;
- API-only Token Creator on the same-project signer;
- no role grant to the IaC deployer;
- exactly Storage, IAM, IAM Credentials, and Cloud Resource Manager API
  services, with disable-on-destroy and disable-dependent-services false.

Do not proceed if the plan contains a project resource, fifth bucket, public
principal, authoritative IAM policy, broad administrator role, deletion rule,
retention lock, key resource, or cross-project principal.

## C. Owner-reviewed nonprod apply

The authenticated Owner/operator is the bootstrap executor. The
`moazez-iac-deployer` identity exists as a future boundary but receives no role
in this Batch.

After independent plan approval, the Owner/operator may apply the exact saved
nonprod plan:

```powershell
terraform apply nonprod.tfplan
```

This approval and execution were outside Codex Batch 2A. Preserve the local
state securely; do not place it in an application bucket or commit it. Rerun
only under separate Owner change control.

## D. Nonprod real GCS proof

### D0. Verify operator impersonation prerequisites

Before establishing runtime ADC, use source operator ADC and run the IAM proof:

```powershell
$env:GCP_PROJECT_ID = 'moazez-nonprod-91001421934'
node scripts/storage/gcs-batch2-iam-proof.cjs --environment nonprod
```

Its first phase uses `testIamPermissions` to require
`iam.serviceAccounts.getAccessToken` on API, Core Worker, Media Worker, and the
signer. If any result is `FAIL`, it records
`operator_impersonation_permission_missing` and creates no impersonated client.
The module does not grant the operator Token Creator; the Owner must explicitly
resolve temporary proof authority.

### D1. Establish ADC for one runtime identity

Use synthetic bytes only. The proof harness loads the actual committed Batch 1
`GcsAdapter`; it does not implement a parallel storage client. Run each role
with ADC impersonating that exact nonprod runtime identity. A keyless local ADC
impersonation setup may be established by the Owner using Google-supported
service-account impersonation. Do not download or create a service-account
key, and do not place any ADC file in this repository.

The bootstrap operator must already be authorized to impersonate each runtime
identity. That temporary operator authority is not granted by this storage
module. Before each role proof, establish user ADC outside the repository for
that exact role. `gcloud auth application-default login
--impersonate-service-account` requires prior Token Creator/getAccessToken
permission on its target. For API mode, for example:

```powershell
$runtimeIdentity = 'moazez-api-runtime@moazez-nonprod-91001421934.iam.gserviceaccount.com'
gcloud auth application-default login --impersonate-service-account=$runtimeIdentity
```

Set the public configuration for each shell:

```powershell
$env:STORAGE_PROVIDER = 'gcs'
$env:GCP_PROJECT_ID = 'moazez-nonprod-91001421934'
$env:STORAGE_BUCKET = 'moazez-nonprod-91001421934-private'
$env:STORAGE_PUBLIC_BUCKET = 'moazez-nonprod-91001421934-published'
```

### D2. Harness verifies runtime ADC identity

The object harness independently resolves official Google ADC credentials and
requires `credentials.client_email` to equal the exact selected runtime service
account. Missing or mismatched identity fails before `GcsAdapter`, a Storage
client, readiness, or any object request. The production guard executes even
earlier and skips ADC resolution entirely.

### D3. Execute nonprod object proof

For API proof only:

```powershell
$env:GCS_SIGNING_SERVICE_ACCOUNT = 'moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com'
node scripts/storage/gcs-batch2-proof.cjs --environment nonprod --runtime-role api
```

Run the same harness with ADC representing Core Worker and Media Worker:

```powershell
Remove-Item Env:GCS_SIGNING_SERVICE_ACCOUNT -ErrorAction SilentlyContinue
$runtimeIdentity = 'moazez-core-worker@moazez-nonprod-91001421934.iam.gserviceaccount.com'
gcloud auth application-default login --impersonate-service-account=$runtimeIdentity
node scripts/storage/gcs-batch2-proof.cjs --environment nonprod --runtime-role core-worker
$runtimeIdentity = 'moazez-media-worker@moazez-nonprod-91001421934.iam.gserviceaccount.com'
gcloud auth application-default login --impersonate-service-account=$runtimeIdentity
node scripts/storage/gcs-batch2-proof.cjs --environment nonprod --runtime-role media-worker
```

Each invocation uses a unique `__phase5a-proof/<run-id>/` private-bucket prefix.
It proves readiness, Buffer/Readable writes, normalized stat and metadata,
generation, stream integrity, existence, two-page opaque-cursor listing,
overwrite generation change, deletion, post-delete absence, and normalized
not-found behavior. API mode additionally proves the dedicated signer, signed
PUT, signed GET, Range, CORS, and denial of an unsigned object read.

## E. Nonprod IAM negative proof

The D0 command also completes the read-only positive/negative IAM matrix after
all four operator impersonation prerequisites pass. Review that evidence here;
rerun the same command only if the operator credential or IAM state changed.
With operator ADC permitted to impersonate the storage-critical identities:

```powershell
$env:GCP_PROJECT_ID = 'moazez-nonprod-91001421934'
node scripts/storage/gcs-batch2-iam-proof.cjs --environment nonprod
```

The script uses official read-only `testIamPermissions` calls under each
impersonated identity. It proves the positive object/readiness matrix and the
absence of bucket administration, project bucket creation, project IAM
administration, Core/Media signer permission, and signer object deletion.
API must have both `iam.serviceAccounts.getAccessToken` and `signBlob` on the
signer; Core and Media must have neither. It performs no destructive denial
probe.

## F. Nonprod cleanup of live proof objects

The object harness attempts live-object cleanup in `finally` and records every
coordinate result. Confirm all evidence records show `liveObjectRemoved=true`.

Noncurrent and soft-deleted proof history can remain for the approved
protection window. Do not weaken versioning or seven-day Soft Delete to remove
that history. This retained nonprod history is expected and is why production
object proof is prohibited.

The API-mode proof checks both approved staging origins for PUT and GET/Range,
then checks `https://invalid.example` does not receive an allowed-origin
result. It records status/header conclusions, never the signed URLs.

## G. Production Terraform plan

Production planning is prohibited until nonprod apply, object/CORS proof, IAM
positive/negative proof, and live cleanup are independently accepted.

After that acceptance only:

```powershell
Set-Location infra/gcp/storage/environments/production
terraform init -backend=false
terraform validate
terraform plan -out=production.tfplan
terraform show production.tfplan
```

Review against the same contract, with only the production project, production
bucket names, and production origins. Do not add an object smoke test.

## H. Owner-reviewed production apply

After independent production-plan approval, the Owner/operator may apply the
exact saved production plan:

```powershell
terraform apply production.tfplan
```

This was outside Codex Batch 2A and does not authorize application deployment,
traffic, uploads, or real data.

## I. Production read-only configuration and IAM proof

Run only after the approved production apply:

```powershell
powershell -NoProfile -File scripts/storage/gcs-batch2-readonly-proof.ps1 -Environment production
$env:GCP_PROJECT_ID = 'moazez-production'
node scripts/storage/gcs-batch2-iam-proof.cjs --environment production
```

The PowerShell proof reads bucket configuration, additive IAM policies,
service-account existence, anonymous-member absence, and exact role boundaries.
It also performs a non-blocking bucket-metadata smoke request with the temporary
`CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE=https://storage.me-central2.rep.googleapis.com/`
child environment. The Batch 1 client is not changed to force that endpoint.

IAM proof is read-only in production. The object harness rejects
`--environment production` before loading `GcsAdapter` or creating a client.

## J. Production zero-object proof

The production read-only script checks each bucket separately using three
supported listing views:

```text
normal listing             -> LIVE_OBJECTS
--all-versions             -> live plus NONCURRENT_OBJECTS
--soft-deleted --exhaustive -> SOFT_DELETED_OBJECTS
```

It requires all six per-bucket counts to be zero and fails closed otherwise.
The exhaustive soft-delete scan avoids accepting an intermediate empty page as
proof of zero. Normal live listing alone is never accepted as clean-start
proof.

Historical Q044 remains the source/legacy branch statement:

```text
SOURCE_BUCKETS=NONE
TARGET_GCS_BUCKETS=4
```

These facts are distinct and non-contradictory.

## Evidence and redaction

Generated machine-readable evidence is written only below:

```text
artifacts/production-readiness/phase-5a/
```

The directory is ignored by Git. Evidence contains identifiers, operations,
configuration flags, HTTP statuses, generations, test prefixes, and PASS/FAIL
outcomes. It contains no object payloads, access tokens, credentials, ADC
material, private keys, complete signed URLs, or signed query strings. Proof
failures emit stable codes rather than provider error text.

The reviewed Batch 2 operator provisioning and real-provider evidence completed
PRD5A-G03. Phase 5A as a whole remains incomplete, production launch is not
authorized, and real production data remains prohibited pending the later
source-candidate, audit, deployment, and smoke gates.
