# Academic Content Phase 1 file-policy and upload reliability audit

## Authority and scope

Stage: `ACC_PHASE1_FILE_POLICY_UPLOAD_FIX`. Comparison authority is accepted
`main` commit `f43a385f7a07c92e84d4ebcc4b65756b930bb66e` (ACC-11E, PR #199).
Implementation is isolated on `agent/acc-postcloseout-file-policy-upload-fixes`.
The manager checkout and School Dashboard repository are reference-only.
The owner brief and complete local evidence are retained under
`coverage/acc-phase1/`; that directory is ignored and is not part of this patch.

Current repository governance and accepted ACC-10/ACC-11 audits were reviewed.
There is no dedicated ACC-3 audit file on this required base; the accepted file
foundation, verifier, lifecycle code and their tests provide the earlier upload
contract. This report does not invent an absent audit or replace its authority.

The patch changes six production TypeScript files, adds two test files and this
audit. Existing paths, DTO fields, permission catalog, Prisma schema, all 28
historical migrations, migration manifest, storage adapters, provider configuration,
CI routing and workflows remain unchanged. No other file types are authorized.

## A. Partial file-policy PATCH

The configured Nest global ValidationPipe transforms request JSON into
`UpdateAcademicContentFilePolicyDto`. Under the repository's ES2023 target,
optional class fields become own properties whose absent values are `undefined`.
The original use case spread those properties into its flags object and required
every value to be boolean. Consequently valid partial requests, including the
reported two-flag request, failed with `validation.failed`.

The use case now removes only flag entries whose value is `undefined` before
validation and persistence. Explicit `false` is retained. Explicit nulls and
non-boolean values are rejected; unknown keys are rejected before filtering.
Maximum size retains its original decimal-string, positive-value and 10 GiB
checks. An absent maximum size produces no size change.

The existing scoped repository merges supplied changes with the current effective
policy. Its Serializable transaction, effective no-op detection, retry behavior
and atomic before/after audit are unchanged. Permission and School/Organization
resolution still precede persistence.

The new HTTP suite uses `configureHttpApplication`, its real global ValidationPipe,
production controllers, PermissionsGuard and exception filter. It proves actual
class transformation, single and multiple flags, explicit false, omitted-value
preservation, empty/repeated PATCH, minimum/maximum size, malformed/null/unknown
input and permission rejection. The HTTP fixture supplies a synthetic authenticated
context and mocked persistence; it is not a claim of real JWT authentication or
database transactions. Existing PostgreSQL management tests separately prove
atomic audit, rollback and effective no-op behavior.

## B. HTTP Origin to GCS

Both existing upload controllers obtain `Origin` with Nest's request-header
binding. School Management passes it to the core command. Teacher passes it as a
separate argument through the existing Teacher application bridge. Neither DTO
has gained an origin field; JSON `origin` and `trustedOrigin` are rejected by the
existing strict validation.

Before creating an upload intent or storage capability, the core upload use case
validates a supplied Origin against both:

- the application allowlist using the unchanged application CORS parser, including
  its exact staging/production origin contracts; and
- `STORAGE_CORS_ORIGINS`, accepting its existing validated array representation
  or raw comma-separated representation.

Approval requires exact membership in their intersection. Malformed URLs,
noncanonical origin strings, paths, credentials, queries, fragments, opaque
`null`, wildcard, empty and multiple origins are denied. No supplied Origin remains
undefined for existing non-browser use cases. The resolver emits a fixed safe
validation error and does not log request data or capabilities.

The allowlist is an additional capability boundary. Existing actor, tenant,
content status, Teacher ownership/allocation, idempotency and file-policy checks
remain in the existing core pipeline. No new client or storage service is added.
ConfigService is supplied by the existing global Nest configuration module; the
constructor's default preserves existing direct use-case construction in tests.

The path is:

`HTTP Origin → controller → Teacher bridge where applicable → core origin resolver
→ existing StorageService → existing GcsAdapter → SDK createResumableUpload`.

The new real HTTP tests traverse both paths through the actual StorageService
and GcsAdapter to a fake SDK client. They assert the exact SDK argument,
including `origin`, metadata and `ifGenerationMatch: 0`. Absent-Origin requests
omit the SDK option. Denied origins and JSON authority overrides create neither
an intent nor a capability. These are provider contract tests, not real GCS writes.

The task-local locked SDK is `@google-cloud/storage` **7.21.0**. Its actual
`file.js` documents the option as an Origin header, passes `options.origin` into
the resumable uploader, and `resumable-upload.js` assigns it to
`reqOpts.headers.Origin` when initiating the session. Source hashes and precise
lines are retained in `gcs-sdk-contract.json`. The adapter's conservative
one-week capability-expiry handling is unchanged.

For cross-origin browser uploads, Google requires the browser origin at session
initiation so later responses carry the appropriate CORS headers. A session URI
is a bearer capability and must remain private. See Google's
[resumable upload documentation](https://docs.cloud.google.com/storage/docs/resumable-uploads).

## C. MinIO classification and later operator prerequisites

The MinioAdapter's `resumableUpload: false` is preserved. Academic Content still
fails closed with HTTP 409 and
`academic_content.file.storage_resumable_upload_unavailable`, before intent or
capability creation. No invented session, non-resumable fallback, verification
bypass or storage redesign is introduced.

For a later explicitly approved real-provider browser test, the operator/DevOps
owner must approve an isolated nonproduction GCP project, private bucket, test
identity, exact browser origin, object prefix and cleanup plan. They must provide:

1. The existing `STORAGE_PROVIDER=gcs`, `GCP_PROJECT_ID`, `STORAGE_BUCKET` and
   `STORAGE_PUBLIC_BUCKET` configuration pointing only to that isolated project,
   with the private upload bucket kept private.
2. ADC through an approved identity with the existing runtime's scoped object
   create/read/delete permissions. Signed asset-access testing additionally
   requires the existing `GCS_SIGNING_SERVICE_ACCOUNT` and approved keyless signing
   authority. Credentials stay outside source, logs and reports.
3. The exact test origin in both application and storage allowlists. Staging's
   fixed application origin contract cannot be expanded for a local test; use an
   approved development/test environment with its existing CORS contract.
4. Operator verification of the actual session initiation, PUT and status-probe
   CORS responses, including Content-Type/Content-Range requests and readable Range
   acknowledgements. The SDK uses the JSON resumable endpoint; Google documents
   default JSON API CORS behavior independently of bucket CORS settings. For XML
   endpoints, including the separately tested signed asset-access path, the owner
   must approve and verify the bucket CORS policy for the exact test origin and
   methods/headers. Any bucket CORS/IAM change requires separate authorization.
   See Google's [API-specific CORS documentation](https://docs.cloud.google.com/storage/docs/cross-origin).
5. Approved backend/browser test accounts, current School/Teacher allocations,
   seeded disposable content, allowed file types and cleanup after capability
   expiry. Confirm exact private object identity, completion and cancellation.

No GCS credentials were read, no real GCS write was attempted, and no cloud,
staging, production, bucket CORS/IAM or Terraform configuration was changed.
Actual-provider and production-browser proofs remain outstanding and require
separate environment and execution authorization.

## D. Frontend and upload-flow continuity

The accepted School Dashboard remote `main` source is
`96232adca4dbcb7e4549c089a80f312c63abc59f`. Five relevant Git blobs were fetched
read-only and verified against their source blob IDs and SHA-256 hashes. The stale
local checkout was not used as source authority or modified.

The accepted uploader uses 8 MiB chunks, direct XHR PUT with Content-Type and
Content-Range, provider 308 Range acknowledgements, empty status probes and
bounded resume offsets/retries. It completes only after provider success and
requires explicit restart for an expired session. These contracts are unchanged.
Google documents 256 KiB chunk multiples except for the last chunk, with at least
8 MiB recommended, and provider Range as resume authority. See Google's
[resumable protocol guide](https://docs.cloud.google.com/storage/docs/performing-resumable-uploads).

The accepted frontend upload test and implementation were copied byte-for-byte
into the ignored evidence directory and executed with the already-installed
Vitest 2.1.9 runtime. This is an XHR/API simulation with no provider network or
frontend repository mutation; it does not establish real-browser CORS behavior.
The simulated tests cover chunk boundaries, interrupted upload/status probe,
cancellation, expiration and MIME/extension mismatch. Retained source identities
and raw results distinguish this from actual-provider verification.

| Requirement                                                 | Existing regression authority                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| Filename/extension/MIME and category/size policy            | File registry/policy/upload unit suites; Teacher files integration         |
| School/actor scope and Teacher allocation                   | Management bridge, Teacher files and tenancy security suites               |
| Idempotency/fingerprints and exact private identity         | Upload unit suite; management bridge; Teacher files integration            |
| Capability creation/expiry and failure before issuance      | GCS/MinIO adapter contracts; upload lifecycle; new HTTP suite              |
| Concurrent upload/completion/cancel and transaction fencing | Teacher files, upload lifecycle and file lifetime PostgreSQL suites        |
| Missing/partial/size/signature/invalid-media verification   | File verifier/unit suites; upload lifecycle; Teacher files; media runtime  |
| File+Asset atomic creation, retry and cleanup               | Teacher files; file lifetime; management bridge; cleanup worker suites     |
| Student/Parent published asset boundaries                   | Recipient asset-access integration and unit suites; app/security closeouts |
| 8 MiB resume/status/expiry protocol                         | Accepted frontend source and isolated XHR test simulation                  |

### OTHER category finding and safe handoff

`otherFilesEnabled` is a persisted effective-policy flag and the resolver has an
`OTHER` category branch. The authoritative registry contains **zero approved
OTHER entries**; all 23 extension/MIME entries belong to DOCUMENT, IMAGE, VIDEO,
AUDIO or ARCHIVE. Therefore enabling the flag authorizes no additional extension
or MIME. Unlisted formats remain rejected before capability issuance.

The accepted frontend likewise has no OTHER file-type entries. Frontend/product
should describe the flag as having no currently supported formats, or propose a
separately governed explicit registry/signature/preview contract. This patch adds
no formats and does not weaken signature or media verification.

## E. Evidence, gates and delivery

Evidence authority is `coverage/acc-phase1/` in the task worktree:

- `authorization.txt`, `start.json`, `frozen-source.json` and frontend identities;
- retained initial and corrected base HTTP reproduction reports: the corrected
  44-test base run had 20 failures attributable to the two defects and 24 passes;
- final boundary reports: 69 tests, two suites, zero skips;
- focused PostgreSQL evidence: 214 tests, five suites, PASS and cleanup PASS;
- `static-gates.json`, complete changed-file lint JSON and typecheck logs;
- canonical local plan and all shard evidence, including raw retained failures;
- installed SDK and Windows Docker plugin-discovery evidence;
- final scope/source/evidence manifests and, after delivery, canonical CI artifacts.

All eight changed TypeScript files have zero lint errors and warnings. No inherited
lint exception is requested or applied. Historical lint debt outside the changed
files is preserved, and this is not a claim that repository-wide lint is clean.
Production and expanded changed-test typechecks and changed-file formatting pass.

The first canonical media-storage attempt failed before tests because the safe
host environment omitted Windows variables used to discover installed buildx.
The unchanged `docker buildx version` fails with that environment and passes when
ProgramFiles, ProgramW6432 and ProgramData are retained. The ignored local runner
retains these standard discovery variables; no repository CI, configuration,
Docker installation or test assertion was changed. The original failed evidence
and cleanup PASS are preserved. This is an execution-environment correction,
not a gate waiver.

The second attempt reached the media verifier tests: 244 source-runtime cases
passed, then 18 verifier cases failed at MinIO bucket access before verification.
The canonical runner classified that attempt as `SOURCE_TEST_FAILURE`; the raw
classification and reports are retained. An explicit read-only connectivity probe
using the same container-side endpoint returned `ECONNREFUSED` with Docker
Desktop's host network, while the owned fixture bridge returned HTTP 200.
The ignored local runner consequently connects those same media test containers
to the owned fixture bridge and substitutes internal fixture addresses/ports for
their disposable PostgreSQL, Redis and MinIO connections. It preserves the test
selection, image contract, application source, assertions and services. The entire
media profile is re-executed with that transport correction. The connectivity
proof is `desktop-network-connectivity.json`; no Docker Desktop settings or
repository CI source are changed.

On the third attempt all 262 media runtime/verifier tests passed. The six health
scripts then failed to launch: Windows PATH resolved `bash` to the WSL launcher,
whose `/bin/bash` was unavailable. Those original
`GOVERNANCE_INVARIANT_FAILURE` records are retained. The local runner selects the
already-installed Git Bash executable for the unchanged scripts; the before/after
discovery evidence is `windows-bash-discovery.json`. No shell installation,
global PATH change or health-script edit is performed.

### Final local results

The unchanged canonical preflight and all 26 mandatory shard profiles pass, with
cleanup PASS and no failure classification in every successful receipt.
`local-verification.json` verifies all 982 active files from the 992-file inventory
were executed exactly once: zero missing, duplicate or unexpected files. The ten
existing historical classifications are unchanged. The receipts report 9,781 Jest
cases; profiles using other runners do not report a Jest count and are not included
in that number.

| Gate                                                               | Result                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| New configured HTTP/origin boundaries                              | PASS: 69 cases, zero skips                                       |
| Focused real PostgreSQL file/lifecycle/recipient regressions       | PASS: 214 cases, cleanup PASS                                    |
| Accepted frontend XHR protocol simulation                          | PASS: five cases                                                 |
| Canonical security profiles                                        | PASS: 1,425 cases across 96 suites                               |
| Canonical configured HTTP/root profiles                            | PASS: 572 cases across 106 suites                                |
| General integration profiles                                       | PASS: 1,399 cases                                                |
| Media/storage profile                                              | PASS: 369 cases and all six health scenarios                     |
| Teacher closeout, PRD3 G01–G05, reinforcement/storage, email/Redis | PASS                                                             |
| Four unit profiles                                                 | PASS: 5,942 cases                                                |
| Runtime governance and CI orchestrator contracts                   | PASS                                                             |
| Production and changed-test typecheck; build                       | PASS                                                             |
| Changed-file ESLint and formatting                                 | PASS: eight TypeScript files, zero errors/warnings               |
| Migration governance, replay and second-deploy no-op               | PASS: 28 applied migrations before and after, final status clean |

The local plan predates the feature commit and therefore records the accepted
base in its candidate field. It proves execution against the uncommitted source,
with separate source-hash receipts; it is not presented as exact-head CI.
The ignored Windows launcher uses the existing canonical plan and shard runner,
reuses the completed task-local clean dependency installation and generated
Prisma client after lockfile/schema verification, and invokes the existing CLIs
through Node. Its environment corrections are described above. Repository CI,
test selection, test assertions and application configuration are unchanged.

All 108 generated health-probe evidence files were retained byte-for-byte under
`coverage/acc-phase1/health-probes/`; the relocation receipt records source paths,
destination paths and SHA-256 parity. The final scope verifier checks exactly nine
patch files, all 389 frozen source/configuration files, the unchanged schema and
28 migrations, identical route/permission metadata, and `git diff --check`.

### Delivery boundary

All mandatory local gates pass. The exact authoritative remote main, source hashes
and final scope are reverified before the one normal feature commit and normal
push. The Draft PR's actual head, CI run, mandatory checks and digest-verified
canonical aggregate will be recorded in the external evidence and PR description
after delivery, avoiding a circular commit identity in this audit. Exact-head CI
is pending at the feature-commit boundary and must pass before the task is reported
complete. The Draft PR is for independent Backend review; Ready, merge, deployment
and main mutation are not authorized.
