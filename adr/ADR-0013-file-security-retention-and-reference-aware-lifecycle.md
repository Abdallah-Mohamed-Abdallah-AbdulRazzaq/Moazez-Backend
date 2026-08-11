# ADR-0013: File Security, Retention, and Reference-Aware Lifecycle

## Status

Accepted for PRD0-D037, PRD0-D046, and PRD0-D047 — amended 2026-08-11

## Approval authority

- Owner: Abdallah
- Approval date: 2026-07-27
- Timezone: Africa/Cairo
- Approval capacities for the accepted decision: product, architecture,
  security
- Accepted owner questions: PRD0-Q032, PRD0-Q041, PRD0-Q042
- Storage-policy amendment approver: Abdallah
- Storage-policy amendment date: 2026-08-11
- Storage-policy amendment timezone: Africa/Cairo
- Pending owner questions: PRD0-Q031, PRD0-Q033–PRD0-Q040, PRD0-Q043

## Context

At the 2026-07-27 Phase 0B closeout, Moazez centralized substantial object
operations and most managed file metadata, but upload, verification,
authorization, replacement, retention, and physical lifecycle policies were
feature-specific. Reinforcement required a private student-owned file for
non-`NONE` proof types but did not enforce the selected proof type against
declared and detected content.

The owner approved the Reinforcement proof-type MIME policy and, on 2026-08-11,
the exact Grade MEDIA and branding URL policies below. Generic file security,
Parent uploads, malware handling, purpose classification, retention, legal
holds, deletion, reconciliation ownership, and multipart production controls
remain pending.

## Decision

The Reinforcement proof MIME matrix is:

- **IMAGE**
  - `image/jpeg`
  - `image/png`
- **VIDEO**
  - `video/mp4`
  - `video/webm`
- **DOCUMENT**
  - `application/pdf`

For a non-`NONE` proof, both the declared MIME and detected content must match
the selected proof type. Missing, malformed, ambiguous, or cross-type content
is rejected before submission. The application performs no silent remapping
between proof types.

The current non-`NONE` `proofFileId` requirement remains. Existing
organization, school, student-uploader, private-visibility, authorization, and
download controls remain mandatory. Negative cross-type tests and existing
client compatibility evidence are required.

Grade MEDIA new writes use option D: `mediaUrl` may be absent/null where the
existing contract allows it or may be an ordinary external HTTPS URL. Direct
GCS/Google Cloud Storage/MinIO/S3-compatible provider URLs, provider schemes,
HTTP, and malformed/unsafe URLs are rejected. The compatibility window is
`NONE`; historical reads are not rewritten or silently migrated.

Branding new writes remain managed `File`-backed only. Reads prefer an eligible
managed File, allow an already-persisted safe ordinary external HTTPS value as
read-only compatibility, allow null, and fail closed on provider or
unsafe/malformed legacy values. A discovered provider URL is a cutover blocker
requiring explicit inventory/review. No current write path may create a legacy
raw `logoUrl`.

## Owned production decisions

| Decision | Owning question | Decision-level status |
| --- | --- | --- |
| PRD0-D036 | PRD0-Q031 | Pending |
| PRD0-D037 | PRD0-Q032 | Accepted |
| PRD0-D038 | PRD0-Q033 | Pending |
| PRD0-D039 | PRD0-Q034 | Pending |
| PRD0-D040 | PRD0-Q035 | Pending |
| PRD0-D041 | PRD0-Q036 | Pending |
| PRD0-D042 | PRD0-Q037 | Pending |
| PRD0-D043 | PRD0-Q038 | Pending |
| PRD0-D044 | PRD0-Q039 | Pending |
| PRD0-D045 | PRD0-Q040 | Pending |
| PRD0-D046 | PRD0-Q041 | Accepted |
| PRD0-D047 | PRD0-Q042 | Accepted |
| PRD0-D048 | PRD0-Q043 | Pending |

This ADR is the sole authoritative owner of PRD0-D036 through PRD0-D048.
Acceptance applies to PRD0-D037, PRD0-D046, and PRD0-D047 only.

## Implementation status

At the 2026-07-27 Phase 0B closeout, Reinforcement flows did not enforce the
approved MIME matrix against both declared and detected content. Phase 1
PRD1-G06 subsequently implemented and closed that focused policy, including
organization, school, uploader, private visibility, negative cross-type
coverage, failure atomicity, and compatible rejection behavior.

The wider file platform still lacks a universal detected-content policy,
universal malware scanning, approved retention/reference graph, and approved
generalized destructive lifecycle.

Batch 3 implements D046/D047 at the application/source boundary with one
provider-URL classifier, centralized Grade create/update normalization,
managed-only branding writes, fail-closed legacy branding reads, narrow guards
on other discovered persistence surfaces, and a read-only pre-real-data audit.
This source implementation does not itself prove production row counts or
authorize real data.

## Consequences

### Positive

- IMAGE, VIDEO, and DOCUMENT proofs have narrow, reviewable content contracts.
- Existing tenant and ownership controls are preserved.
- Cross-type content is rejected before it can be represented as another proof
  type.

### Costs and constraints

- Detection must be bounded and tested against malformed, ambiguous, and
  adversarial inputs.
- Existing clients must receive stable rejection behavior without silent MIME
  remapping.
- The decision cannot be generalized into a universal file policy.

## Security and tenancy implications

- MIME enforcement supplements rather than replaces organization, school,
  uploader, private-visibility, permission, and download authorization.
- Error details must not expose storage coordinates, foreign-tenant IDs, probe
  output, or file contents.
- Missing prevention/detection control is a risk finding; this ADR does not
  claim that malicious content is present.

## Compatibility requirements

- The existing non-`NONE` proof-file requirement and current proof-type values
  remain.
- Existing organization, school, uploader, visibility, authorization, and
  download behavior remain.
- Negative tests cover IMAGE-as-VIDEO, IMAGE-as-DOCUMENT,
  VIDEO-as-IMAGE, VIDEO-as-DOCUMENT, DOCUMENT-as-IMAGE,
  DOCUMENT-as-VIDEO, declared/detected mismatch, missing detection,
  ambiguous detection, and malformed content.

## Operational constraints

- Implement the focused PRD1-G06 safety gate before broader runtime
  separation is accepted.
- Detection must have bounded resource use and deterministic rejection.
- Every affected unit, integration, security/tenancy, and compatibility test
  must pass.
- Learning Media remains its own specialized deep-verification workflow; this
  decision does not change its contract.

## Rollback and reopen conditions

A focused compatibility rollback may restore a prior accepted behavior only if
it does not silently broaden unapproved content risk and retains tenancy and
ownership controls. Reopen PRD0-D037 when a proof type or supported MIME is
added, detection semantics materially change, or client compatibility evidence
requires a reviewed alternative.

Each pending owned decision reopens and closes independently through its
owning question.

## Deferred owned decisions

PRD0-D036, PRD0-D038 through PRD0-D045, and PRD0-D048 remain pending. This ADR does not
approve:

- a Parent messaging upload contract;
- a generic `File` detected-content policy;
- a malware provider, quarantine, or outage policy;
- stored file-purpose schema fields;
- retention authority or periods;
- admissions, audit, or legal holds;
- physical deletion or orphan cleanup;
- multipart production limits;
- any generalized file lifecycle.

## Explicit non-authorization

This ADR does not implement the MIME policy, authorize destructive cleanup,
enable physical deletion, approve a schema or migration, approve cloud
storage, generalize `FileUploadSession`, change Learning Media behavior, or
mark Phase 1 or Phase 5B complete.
