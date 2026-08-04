# ADR-0006: Production Data Source, Object Storage, and Signed Capability Boundary

## Status

Accepted for PRD0-D022 only — 2026-07-27

## Approval authority

- Owner: Abdallah
- Approval date: 2026-07-27
- Timezone: Africa/Cairo
- Approval capacities for the accepted decision: product, architecture,
  security, operations, release
- Accepted owner question: PRD0-Q022

## Context

At the 2026-07-27 Phase 0B closeout, the application had centralized storage
infrastructure with fragmented upload, authorization, verification,
replacement, retention, and physical lifecycle policies. It bound the
concrete MinIO adapter and used environment-specific browser, WebSocket, and
direct-storage origin behavior.
Production data source, production provider, GCS identity, bucket topology,
object migration, and protection decisions are not yet approved.

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

## Owned production decisions

| Decision | Owner question | Decision-level status |
| --- | --- | --- |
| PRD0-D009 | PRD0-Q008 | Pending |
| PRD0-D010 | No approved owner question; references PRD0-Q008 | Proposed recommendation, not accepted |
| PRD0-D019 | PRD0-Q019 | Pending |
| PRD0-D022 | PRD0-Q022 | Accepted |
| PRD0-D029 | PRD0-Q004 | Pending |
| PRD0-D049 | PRD0-Q044 | Pending |
| PRD0-D050 | PRD0-Q045 | Pending |
| PRD0-D051 | PRD0-Q046 | Pending |
| PRD0-D052 | PRD0-Q047 | Pending |
| PRD0-D053 | PRD0-Q048 | Pending |

This ADR is the sole authoritative owner of PRD0-D009, PRD0-D010, PRD0-D019,
PRD0-D022, PRD0-D029, and PRD0-D049 through PRD0-D053. Acceptance applies only
to PRD0-D022. PRD0-D010 remains a proposal and is not converted into an
approved decision.

## Implementation status

At the 2026-07-27 Phase 0B closeout, production HTTP and WebSocket CORS were
disabled. Phase 1 subsequently implemented and closed the approved application
HTTP/Socket.IO allowlists. Storage CORS remains external to the application.
The concrete MinIO adapter, static credential model,
request-path bucket creation, MinIO-derived capability types, and
provider-specific error interpretation remain current behavior. No GCS
adapter, production bucket IaC, signing identity, object inventory, copy, or
coordinate migration has been implemented.

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
- Existing data and provider URLs cannot be assumed absent.

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
- PRD0-Q004 controls whether object/data migration gates execute or become
  `N/A_WITH_EVIDENCE`; silence cannot select clean start.

## Rollback and reopen conditions

Origin configuration may roll back to a previously approved allowlist while
maintaining credential safety and monitor/client compatibility. Signer
rotation must retain old capabilities only through their bounded TTL.

Reopen the accepted origin decision when production or staging client domains,
credential policy, WebSocket requirements, or direct-storage client topology
changes. Provider, migration, and lifecycle findings reopen only their pending
owned decisions.

## Deferred owned decisions

PRD0-D009, PRD0-D019, PRD0-D029, and PRD0-D049 through PRD0-D053 remain
pending. They include GCS versus MinIO, signer identity, authoritative data
source, object preservation, source rollback window, missing-checksum policy,
bucket/privacy topology, versioning, lifecycle, and deletion protection.
PRD0-D010 remains an unapproved engineering proposal.

## Explicit non-authorization

This ADR does not approve GCS, MinIO migration, bucket topology, signing
identity, object migration, source deletion, versioning, lifecycle rules,
physical deletion, destructive cleanup, cloud provisioning, implementation,
or launch.
