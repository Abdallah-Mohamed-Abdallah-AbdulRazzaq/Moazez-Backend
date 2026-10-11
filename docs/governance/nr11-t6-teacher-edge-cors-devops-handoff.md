# NR11-T6 Production Teacher Web source handoff

Source base: `833ecc2eee91164048b469f2ae0d5223aa7542a8`.
Branch: `codex/nr11-t6-teacher-edge-cors`.
This is source-only work: no cloud, DNS, state, database, image publication,
deployment, Production plan, or Terraform apply operation is authorized here.

## Contracts and future plan expectations

Teacher uses `teacher.moazez.cloud`, Cloud Run service
`moazez-production-teacher-web`, project `moazez-production`, and region
`me-central2`. Completed frontend runtime source and the approved Teacher
image remain unchanged:

```text
me-central2-docker.pkg.dev/moazez-production/moazez-production-teacher-web/moazez-teacher-web@sha256:cb15553977c1195ee15f7a0967487eb47f74ad763b66595e573b5a05a1a026da
```

Expected future Edge change: **4 creates**, the Teacher NEG, backend, managed
certificate and certificate-map entry; **1 in-place URL map update**, adding
only the Teacher host and default path matcher; **0 destroys/replacements**.
The existing IP, Armor policy, certificate map, HTTPS proxy and forwarding
rule are reused. API/Admin/Schools/Student routes, Candidate behavior, shared
certificate and Student certificate are preserved.

The exact Production application, API runtime `APP_CORS_ORIGINS` and
`STORAGE_CORS_ORIGINS`, and GCS CORS origins are:

```text
https://schools.moazez.cloud
https://admin.moazez.cloud
https://student.moazez.cloud
https://teacher.moazez.cloud
```

HTTP and Socket.IO retain the same credentialed origin delegate. Uploads
still require the intersection of application and storage allowlists.
Staging retains exactly Schools/Admin and has no Teacher edge resources.
Storage expects only in-place CORS updates to the existing Production private
and published buckets. Methods, headers, cache settings, IAM and bucket safety
are unchanged. Other runtime services, images, identities, traffic, capacity,
network, Redis, secrets and database configuration are unchanged.

**Deployment dependency:** publish a **new immutable Backend API image**
containing the four-origin application policy. Deploy that image and the
expanded runtime environment **together** through one separately reviewed,
governed Production runtime saved plan. The **old Backend image** accepts only
three origins and will reject the four-origin startup environment. This task
does not build, publish or deploy that replacement image.

These are source expectations, **not live plan verification**. Confirm actual
state and reject any extra change, replacement or destruction before future
approval and execution.

## Local validation

Validation uses Terraform 1.15.8 and the existing Google provider 7.44.0.
All initialization disables the backend; each root uses a dedicated external
`TF_DATA_DIR`. Existing backend declarations and committed locks are unchanged.
Storage roots have no committed backend or lock: validate exact source copies
outside the checkout with the existing provider binary. Do not introduce a
storage backend or another runtime state.

Native `terraform test` uses the file's `mock_provider "google"` and in-memory
test state only. Its `command = plan` runs evaluate configuration against
mocked provider values; they do not connect to Production, remote state or GCP.

Focused checks from the task worktree:

```powershell
& {
  $env:CI_BASE_SHA = '833ecc2eee91164048b469f2ae0d5223aa7542a8'
  $env:CI_CANDIDATE_SHA = (git rev-parse HEAD)
  node --test scripts/tests/stage-26c-production-foundation-source.test.cjs scripts/tests/stage-29a-production-runtime-source.test.cjs scripts/tests/stage-30c1-production-frontend-edge-source.test.cjs scripts/storage/tests/gcs-batch2-terraform-policy.test.cjs
  node --test --test-reporter=dot scripts/tests/plan-ci.test.cjs
  node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/bootstrap/application-cors.policy.spec.ts src/bootstrap/http-application.spec.ts src/config/env.validation.spec.ts src/infrastructure/realtime/tests/realtime.gateway.spec.ts src/modules/academics/academic-content/files/tests/academic-content-upload-origin.spec.ts
  terraform fmt -check -recursive infra/gcp/edge
  terraform fmt -check -recursive infra/gcp/backend-runtime
  terraform fmt -check -recursive infra/gcp/storage
  git diff --check
}
```

Results: source governance **95/95 PASS**, CI planner **14/14 PASS**, application
Jest **5 suites / 213 tests PASS**, all three recursive Terraform formatting
checks **PASS**, and diff whitespace **PASS**. The initial cold application run
timed out on one existing HTTP bootstrap test; the same five-suite command
passed on repeat with the original 15-second timeout unchanged.

The local Terraform initialization and validation commands were:

```powershell
& {
  $tfTaskRoot = Join-Path $env:LOCALAPPDATA 'Moazez\tfdata\Moazez-Backend\nr11-t6-teacher-edge-cors'
  $tfPluginDir = Join-Path $env:LOCALAPPDATA 'Moazez\tfdata\Moazez-Backend\nr11-t5a-teacher-cloud-run\frontend-runtime-production\providers'
  $validationStorage = Join-Path $tfTaskRoot 'storage-source'
  # First-time validation copies only tracked storage .tf source outside Git.
  foreach ($file in @(git ls-files -- infra/gcp/storage)) {
    if ($file -notmatch '\.tf$') { continue }
    $relative = $file.Substring('infra/gcp/storage/'.Length)
    $destination = Join-Path $validationStorage $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $file -Destination $destination
  }
  $roots = [ordered]@{
    'edge-production' = (Join-Path (Get-Location) 'infra\gcp\edge\environments\production')
    'edge-staging' = (Join-Path (Get-Location) 'infra\gcp\edge\environments\nonprod')
    'runtime-production' = (Join-Path (Get-Location) 'infra\gcp\backend-runtime\environments\production\runtime')
    'runtime-staging' = (Join-Path (Get-Location) 'infra\gcp\backend-runtime\environments\nonprod\runtime')
    'storage-production' = (Join-Path $validationStorage 'environments\production')
    'storage-staging' = (Join-Path $validationStorage 'environments\nonprod')
  }
  foreach ($root in $roots.GetEnumerator()) {
    $env:TF_DATA_DIR = Join-Path $tfTaskRoot $root.Key
    $rootPath = $root.Value
    $initArgs = @("-chdir=$rootPath", 'init', '-backend=false', '-input=false', '-no-color', "-plugin-dir=$tfPluginDir")
    if ($root.Key -notlike 'storage-*') { $initArgs += '-lockfile=readonly' }
    terraform @initArgs
    if ($LASTEXITCODE -ne 0) { throw "Initialization failed: $($root.Key)" }
    terraform "-chdir=$rootPath" validate -no-color
    if ($LASTEXITCODE -ne 0) { throw "Validation failed: $($root.Key)" }
  }
  $env:TF_DATA_DIR = Join-Path $tfTaskRoot 'edge-staging'
  terraform -chdir=infra/gcp/edge/environments/nonprod test -no-color
  $env:TF_DATA_DIR = Join-Path $tfTaskRoot 'runtime-staging'
  terraform -chdir=infra/gcp/backend-runtime/environments/nonprod/runtime test -no-color
}
```

Results: **6/6 backend-disabled initialization and validation PASS**; mocked
Edge tests **28/28 PASS**; existing mocked runtime tests **24/24 PASS**. The
mock fixtures supply the exact Student and Teacher inputs now required in
Production and retain all prior Candidate assertions. Provider-generated
storage locks exist only in external validation copies and are not committed.

Prettier checks passed for changed TypeScript/CJS files and this handoff. The
existing edge README tables are preserved without unrelated reformatting.

Supplemental type-aware ESLint is not clean on the authorized base: the HTTP
bootstrap spec has 3 errors and the realtime gateway spec has 44 errors. A
comparison using `ESLint.lintText` for base and candidate, matching each error's
rule, message and source-line context, confirmed **47 existing errors and zero
new errors**. The other four changed TypeScript files have zero lint errors.
No lint rule or suppression was changed. The comparison used Node's supported
`--max-old-space-size=4096` setting after the initial 2 GiB process ran out of
memory. This supplemental limitation does not change the passing focused test
results and must not be described as a clean ESLint run.

## Future DevOps order — not executed by this task

1. Review and merge the exact PR after all required CI passes.
2. Verify live Backend, Edge and Storage state, identities and absence of drift
   before planning. Confirm the existing reserved Edge IP; supplied evidence
   identifies it as `136.110.222.132` and has not been rechecked by this task.
3. Publish a new immutable Backend API image through the existing approved
   workflow and obtain its exact approved digest.
4. Deploy that image and the expanded four-origin runtime environment together
   using one governed runtime saved plan; preserve the release/traffic gates
   and other worker and scheduler inputs.
5. Apply the separately reviewed GCS CORS saved plan, limited to in-place CORS
   updates on the two existing Production buckets.
6. Apply the separately reviewed Teacher Edge saved plan with the expected
   four creates and URL map update only.
7. After reconfirming the reserved Edge IPv4, configure only the exact Teacher
   DNS A record `teacher.moazez.cloud` to that address.
8. Verify the dedicated Teacher certificate is `ACTIVE`, HTTPS serves Teacher,
   credentialed HTTP and Socket.IO CORS allow Teacher and deny unauthorized
   origins, and supported GCS uploads/downloads succeed through their existing
   application authority checks. Recheck the four existing routes.
