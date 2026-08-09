# ADR-0006: Production Data Source, Object Storage, and Signed Capability Boundary

## Status

Accepted for PRD0-D009, PRD0-D019, PRD0-D022, PRD0-D029, and
PRD0-D049 through PRD0-D053. PRD0-D010 remains a proposed recommendation.

## Approval authority

- Owner: Abdallah
- Timezone: Africa/Cairo
- Approval capacities: product, architecture, security, data, operations, release
- PRD0-Q022 approved: 2026-07-27
- PRD0-Q004 approved: `2026-08-07T04:46:00+03:00`
- PRD0-Q008, PRD0-Q019, and PRD0-Q044–PRD0-Q048 approved: `2026-08-09T15:20:43+03:00`

## Context

Moazez centralizes managed file operations but the production implementation
still binds MinIO-specific behavior and static credentials. The application
must preserve every existing file consumer, `File.id`, authorization boundary,
signed-capability contract, Range behavior, and the synchronous Learning Media
HTTP 200 completion contract while adopting managed storage for production.

The owner has attested that the initial production launch is a clean start:
there is no authoritative PostgreSQL source, object source, or provider-URL
population that must be migrated. That attestation is factual and must reopen
if later discovery contradicts it.

## Decision

### Provider mapping

- Production object storage is Google Cloud Storage in `me-central2`.
- Local development, automated tests, and CI retain MinIO.
- Production MinIO is not an approved fallback.
- Provider replacement changes no public API, DTO, Prisma schema, migration,
  `File.id`, business lifecycle, or Learning Media completion behavior.

PRD0-D010 remains a proposed engineering design. Q008 approves the provider
mapping and the need for contract parity; it does not silently accept the exact
`ObjectStoragePort` surface. Caller branching remains rejected, and any
implementation must preserve provider-neutral behavior, but the exact port
decision requires its own explicit architecture lock.

### Project and bucket topology

| Purpose | Bucket | Project | Region | Exposure |
| --- | --- | --- | --- | --- |
| Production private | `moazez-production-91001421934-private` | `moazez-production` | `me-central2` | private |
| Production published | `moazez-production-91001421934-published` | `moazez-production` | `me-central2` | private |
| Staging private | `moazez-nonprod-91001421934-private` | `moazez-nonprod-91001421934` | `me-central2` | private |
| Staging published | `moazez-nonprod-91001421934-published` | `moazez-nonprod-91001421934` | `me-central2` | private |

The `published` name describes business intent, not anonymous exposure. All
four buckets enforce Uniform Bucket-Level Access, Public Access Prevention,
and no anonymous access. Runtime request paths cannot create buckets or change
bucket IAM. Buckets and policies are owned by reviewed IaC.

Learning Media staging and final objects remain separate prefixes inside the
project-local private bucket. No third Learning Media bucket is approved.

### Browser CORS and signed capabilities

Bucket CORS uses only the exact approved Q022 HTTPS origins:

- production: `https://schools.moazez.cloud`, `https://admin.moazez.cloud`
- staging: `https://staging-schools.moazez.cloud`, `https://staging-admin.moazez.cloud`

Production signing uses
`moazez-gcs-signer@moazez-production.iam.gserviceaccount.com`; staging uses
`moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com`.
The approved combined bucket list is partitioned by project: each signer may
sign only for its own private and published buckets. Cross-project signing is
not authorized.

Signing is keyless through workload identity/ADC and the IAM Credentials
`signBlob` capability. Downloaded JSON private keys are not an approved
runtime mechanism. Signed capabilities remain purpose-bound, header-bound
where applicable, auditable, and subject to existing actor, tenant, school,
ownership, and visibility authorization. One hour is the absolute maximum
TTL; existing shorter TTLs remain unless a separately approved contract
changes them.

### Clean-start object branch

```text
PRD0-Q044=APPROVED_OPTION_A
source_buckets=NONE
source_object_count=0
provider_url_count=0

PRD0-Q045=N/A_WITH_EVIDENCE
PRD0-Q046=N/A_WITH_EVIDENCE
```

Phase 5A must still publish signed zero-source evidence. It must not claim that
absence was inferred from local code or one cloud account. Discovery of any
object source or provider URL requiring preservation reopens PRD0-D029 and
PRD0-D049 through PRD0-D051 before cutover. This decision authorizes no source
deletion.

### Versioning, lifecycle, and recovery

Every approved bucket uses:

- object versioning enabled;
- GCS Soft Delete with a seven-day recovery window;
- Terraform `prevent_destroy`;
- Bucket Lock disabled;
- no automatic storage-class transition rule in Phase 5A;
- no automatic lifecycle deletion rule in Phase 5A.

The seven-day setting governs GCS Soft Delete only. With versioning enabled
and no noncurrent-version deletion rule, prior versions can remain longer and
continue to incur storage cost. Pending PRD0-D041 through PRD0-D044 still own
business retention, holds, physical deletion, and destructive cleanup. This
ADR cannot be used to enable production orphan deletion.

## Owned production decisions

| Decision | Owner question | Decision-level status |
| --- | --- | --- |
| PRD0-D009 | PRD0-Q008 | Accepted |
| PRD0-D010 | no independent approved owner question | Proposed recommendation |
| PRD0-D019 | PRD0-Q019 | Accepted |
| PRD0-D022 | PRD0-Q022 | Accepted |
| PRD0-D029 | PRD0-Q004 | Accepted; `CLEAN_START` |
| PRD0-D049 | PRD0-Q044 | Accepted; zero-object branch |
| PRD0-D050 | PRD0-Q045 | Accepted; `N/A_WITH_EVIDENCE` |
| PRD0-D051 | PRD0-Q046 | Accepted; `N/A_WITH_EVIDENCE` |
| PRD0-D052 | PRD0-Q047 | Accepted |
| PRD0-D053 | PRD0-Q048 | Accepted with no automatic deletion |

This ADR is the sole authoritative owner of these decisions. Acceptance does
not extend to PRD0-D010.

## Implementation status

These are approved governance inputs, not implementation evidence. At the
approved base SHA, no GCS adapter, production bucket IaC, GCS signer binding,
object inventory closeout, or real-provider parity proof exists. Current
MinIO behavior remains until Phase 5A implementation passes focused tests,
real isolated GCS evidence, all-consumer regression, exact-candidate CI,
review, and merge.

## Security and tenancy implications

- Origin allowlisting is not authentication or authorization.
- Every signed upload, download, and playback capability retains current
  organization, school, actor, ownership, purpose, and visibility checks.
- A runtime receives no bucket-create, IAM-admin, or public-access authority.
- Error normalization must not expose credentials, bucket/object coordinates,
  foreign-tenant identifiers, provider internals, or raw probe output.
- Production data and identities cannot be reused in the non-production project.

## Compatibility requirements

- Preserve `/api/v1` routes, methods, response shapes, status codes, file IDs,
  content disposition, byte Range behavior, and signed-capability semantics.
- Preserve synchronous Learning Media completion through Phase 5A/5B.
- Preserve MinIO behavior for local/test/CI through the same accepted contract.
- The `published` bucket remains private and is accessed through authorized signed capabilities.

## Operational constraints and verification

Before release, real isolated GCS evidence must prove signed PUT/GET, object
metadata, generation behavior, CORS, Range, pagination, delete/not-found
normalization, IAM denial, no anonymous access, and recovery configuration.
The application cannot create buckets during request handling. IaC must verify
the exact project, region, UBLA, PAP, versioning, Soft Delete, and
`prevent_destroy` state.

## Rollback and reopen conditions

Rollback may select a previously compatible MinIO configuration in an
isolated non-production or approved cutback environment only while preserving
the clean-start/source evidence and contract parity. Production writes cannot
silently split across GCS and MinIO.

Reopen this ADR when a source object/provider URL is discovered, bucket names
or regions change, public exposure is proposed, signer mechanism or maximum
TTL changes, recovery/lifecycle policy changes, or real-provider evidence
invalidates an approved semantic.

## Explicit non-authorization

This governance decision does not provision projects, buckets, service
accounts, IAM, CORS, Terraform state, or any cloud resource. It does not
change source, schemas, migrations, dependencies, API contracts, Learning
Media behavior, business retention, physical deletion, or production launch.
