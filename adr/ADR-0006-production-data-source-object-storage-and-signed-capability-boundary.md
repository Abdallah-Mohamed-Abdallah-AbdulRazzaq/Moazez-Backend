# ADR-0006: Production Data Source, Object Storage, and Signed Capability Boundary

## Status

Accepted for PRD0-D022 and PRD0-D029 — 2026-08-07

## Approval authority

- Owner: Abdallah
- Approval date: 2026-07-27
- Timezone: Africa/Cairo
- Approval capacities for the accepted decision: product, architecture,
  security, operations, release
- Accepted owner questions: PRD0-Q022 and PRD0-Q004
- PRD0-Q004 approver and data authority: Abdallah
- PRD0-Q004 approval timestamp: `2026-08-07T04:46:00+03:00`

## Context

At the 2026-07-27 Phase 0B closeout, the application had centralized storage
infrastructure with fragmented upload, authorization, verification,
replacement, retention, and physical lifecycle policies. It bound the
concrete MinIO adapter and used environment-specific browser, WebSocket, and
direct-storage origin behavior.
The production provider, GCS identity, bucket topology, and protection
decisions are not yet approved. PRD0-Q004 now closes only the current
production-data-source branch as a clean start through an explicit owner and
data-authority attestation; it does not select a provider or authorize object
lifecycle behavior.

This ADR records the one approved signed-capability boundary input without
silently selecting any of those pending decisions.

## Decision

The approved browser origin allowlists are:

- production: `https://schools.moazez.cloud`,
  `https://admin.moazez.cloud`
- staging: `https://staging-schools.moazez.cloud`,
  `https://staging-admin.moazez.cloud`

The approved origins apply to browser HTTP, WebSocket, and future approved
direct-storage flows. Credentials, WebSocket access, and direct-storage access
are required.

Wildcard origins are prohibited. Production and staging origins remain
separate. An origin is scheme, host, and optional port only; paths and trailing
slashes are not origins.

Direct-storage CORS remains conditional on later provider, IAM, bucket,
signing, and IaC approval. This ADR does not select or provision a production
storage provider.

### PRD0-D029 / PRD0-Q004 clean-start disposition

```text
PRD0-D029=LOCKED_FROM_APPROVED_CONTEXT
PRD0-Q004=APPROVED
branch=CLEAN_START

persisted_postgresql_migration=N/A_WITH_EVIDENCE
object_migration=N/A_WITH_EVIDENCE_FOR_CURRENT_PRODUCTION_SOURCE

redis_migration=PROHIBITED_AS_COPY_SOURCE
redis_recovery=drain/reconcile/re-enqueue from persisted truth; ephemeral realtime state is rebuilt

approver=Abdallah
data_authority=Abdallah
approved_timestamp=2026-08-07T04:46:00+03:00
```

The accepted owner statement is:

> There is currently no real authoritative Production PostgreSQL database,
> Production object source, or Production business/user history that must be
> migrated or preserved before the first real Moazez production launch.

The zero PostgreSQL-source and zero object-source counts are classified as an
`OWNER_DATA_AUTHORITY_ATTESTATION`. G05 local evidence proves the clean target
path; it does not claim to have scanned every external cloud account.

Any later discovery of real pre-production or production data that must be
preserved automatically reopens PRD0-Q004 / PRD0-D029 before cutover. Clean
start is not authorization to delete or disregard a later-discovered source.

## Owned production decisions

| Decision | Owner question | Decision-level status |
| --- | --- | --- |
| PRD0-D009 | PRD0-Q008 | Pending |
| PRD0-D010 | No approved owner question; references PRD0-Q008 | Proposed recommendation, not accepted |
| PRD0-D019 | PRD0-Q019 | Pending |
| PRD0-D022 | PRD0-Q022 | Accepted |
| PRD0-D029 | PRD0-Q004 | Locked from approved context; `CLEAN_START` |
| PRD0-D049 | PRD0-Q044 | Pending |
| PRD0-D050 | PRD0-Q045 | Pending |
| PRD0-D051 | PRD0-Q046 | Pending |
| PRD0-D052 | PRD0-Q047 | Pending |
| PRD0-D053 | PRD0-Q048 | Pending |

This ADR is the sole authoritative owner of PRD0-D009, PRD0-D010, PRD0-D019,
PRD0-D022, PRD0-D029, and PRD0-D049 through PRD0-D053. Acceptance applies only
to PRD0-D022 and PRD0-D029. PRD0-D010 remains a proposal and is not converted
into an approved decision.

## Implementation status

At the 2026-07-27 Phase 0B closeout, production HTTP and WebSocket CORS were
disabled. Phase 1 subsequently implemented and closed the approved application
HTTP/Socket.IO allowlists. Storage CORS remains external to the application.
The concrete MinIO adapter, static credential model,
request-path bucket creation, MinIO-derived capability types, and
provider-specific error interpretation remain current behavior. No GCS
adapter, production bucket IaC, signing identity, object inventory, copy, or
coordinate migration has been implemented. G05 adds only the clean-start
contract, production seed inventory, local fresh-target proof, and evidence;
it adds no production-data migration implementation.

## Consequences

### Positive

- Browser and WebSocket boundaries are explicit and environment-specific.
- Future direct-storage tests have an exact approved origin matrix.
- Credentials are supported without a wildcard origin.

### Costs and constraints

- Allowlist changes require reviewed configuration and browser/WebSocket/CORS
  regression.
- Storage direct access cannot launch until the pending provider and IAM
  decisions close.
- Later-discovered data or provider URLs cannot be assumed disposable and
  reopen PRD0-Q004 / PRD0-D029 before cutover.

## Security and tenancy implications

- Origin allowlisting is not authentication or authorization; all existing
  actor, permission, organization, school, ownership, and signed-capability
  checks remain mandatory.
- Signed upload, download, and playback capabilities must remain short-lived,
  purpose-bound, auditable, and scoped to approved objects.
- No runtime receives bucket-creation authority merely because an origin is
  approved.

## Compatibility requirements

- Existing `/api/v1` HTTP routes, `/api/v1/realtime`, upload/download/playback
  paths, headers, content disposition, TTL, and byte-range behavior remain
  compatible.
- Learning Media completion remains synchronous through Phase 5A and Phase 5B.
- Provider replacement must preserve `File.id` and cannot strand approved
  direct URL values.

## Operational constraints

- Real isolated provider evidence is required for IAM, signed PUT/GET, CORS,
  Range, generation behavior, and provider errors. An emulator alone is not
  production-semantic proof.
- Production buckets must be provisioned through approved IaC, not application
  request paths.
- PRD0-Q004 selects `CLEAN_START` for the current zero-source attestation.
  Persisted PostgreSQL migration is `N/A_WITH_EVIDENCE`; object migration is
  `N/A_WITH_EVIDENCE_FOR_CURRENT_PRODUCTION_SOURCE`. Redis copy is prohibited;
  required work is reconciled and re-enqueued from persisted truth and
  ephemeral realtime state is rebuilt.

## Rollback and reopen conditions

Origin configuration may roll back to a previously approved allowlist while
maintaining credential safety and monitor/client compatibility. Signer
rotation must retain old capabilities only through their bounded TTL.

Reopen the accepted origin decision when production or staging client domains,
credential policy, WebSocket requirements, or direct-storage client topology
changes. Provider, migration, and lifecycle findings reopen only their pending
owned decisions. Any later discovery of real pre-production or production
data requiring preservation automatically reopens PRD0-Q004 / PRD0-D029
before cutover.

## Deferred owned decisions

PRD0-D009, PRD0-D019, and PRD0-D049 through PRD0-D053 remain pending. They
include GCS versus MinIO, signer identity, object preservation mechanics,
source rollback window, missing-checksum policy, bucket/privacy topology,
versioning, lifecycle, and deletion protection. PRD0-D010 remains an
unapproved engineering proposal.

## Explicit non-authorization

Q004 does not approve GCS provider selection, bucket topology, object
lifecycle, signing IAM, source deletion, physical cleanup, or future real-data
destruction. This ADR does not approve MinIO migration, versioning, lifecycle
rules, destructive cleanup, cloud provisioning, or launch.
