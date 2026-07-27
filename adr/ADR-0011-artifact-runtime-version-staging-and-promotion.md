# ADR-0011: Artifact, Runtime Version, Staging, and Promotion

## Status

Accepted for PRD0-D033 and PRD0-D034 only — 2026-07-27

## Approval authority

- Owner: Abdallah
- Approval date: 2026-07-27
- Timezone: Africa/Cairo
- Approval capacities: architecture, security, operations, release
- Accepted owner questions: PRD0-Q028, PRD0-Q029
- Pending owner question: PRD0-Q027

## Context

The baseline Dockerfile and GitHub workflows use Node 20 while the locked
Firebase Admin 14 dependency line declares Node 22 or later. Swagger is always
mounted. No production-equivalent staging or immutable artifact-promotion
policy has owner approval.

Runtime support and production documentation exposure are immediate Phase 1
boundaries. Staging topology, promotion, canary, and soak remain separate
release decisions.

## Decision

Moazez production runtime support aligns on Node 22 LTS. The exact latest
approved Node 22 security patch and immutable image digest are selected and
recorded at the Phase 1 implementation baseline; this ADR does not guess them.
Docker and CI must use a mutually supported runtime line.

Firebase Admin remains on the package-lock-controlled 14.x dependency line
unless a separately reviewed dependency change is required. Clean
install/build, engine validation, runtime startup, and push-provider smoke
tests are mandatory for the supported pair.

Production Swagger is disabled. There is no approved production Swagger
audience and no risk acceptor. Non-production Swagger remains subject to
explicit environment configuration and must never contain secrets.

## Owned production decisions

| Decision | Owning question | Decision-level status |
| --- | --- | --- |
| PRD0-D032 | PRD0-Q027 | Pending |
| PRD0-D033 | PRD0-Q028 | Accepted |
| PRD0-D034 | PRD0-Q029 | Accepted |

This ADR is the sole authoritative owner of PRD0-D032 through PRD0-D034.
Acceptance does not extend to PRD0-D032.

## Current implementation gap

The current Dockerfile and three workflows still use Node 20, the exact Phase 1
Node 22 patch and image digest have not been selected, and the complete
supported-pair regression has not run. Swagger is still mounted in production
code without an environment gate. There is no artifact registry promotion,
SBOM/provenance/signing, production-equivalent staging, canary, or soak
implementation.

## Consequences

### Positive

- Runtime and locked dependency engine policies become mutually supported.
- The implementation baseline records an immutable, reviewable artifact.
- Production API-schema reconnaissance through Swagger is removed.

### Costs and constraints

- Node 22 can change native dependency and runtime behavior, so affected
  functional, security, image, startup, and provider regressions are required.
- Controlled non-production documentation access must be configured
  explicitly.
- Artifact promotion and staging remain blocked pending PRD0-Q027.

## Security and tenancy implications

- Only supported security-patched runtimes may be promoted.
- Swagger examples and non-production access must never expose credentials,
  private tenant data, or internal topology.
- Disabling Swagger does not replace authentication, authorization, tenancy, or
  input-validation controls on business routes.

## Compatibility requirements

- No `/api/v1` path, method, DTO, WebSocket, queue, or data contract changes are
  authorized.
- Firebase push behavior must pass startup and provider smoke tests before
  promotion.
- A previous artifact is a valid rollback candidate only if its Node/Firebase
  pair remains supported and schema/data compatible.

## Operational constraints

- Pin the selected Node 22 patch and runtime image by immutable digest in
  Docker and CI at Phase 1 implementation time.
- Lock dependency resolution through `package-lock.json`.
- Run engine checks, build, affected canonical regression, startup, and
  push-provider smoke tests.
- Production Swagger must remain disabled in all promoted production configs.

## Rollback and reopen conditions

Rollback selects a prior immutable digest only when the runtime/dependency pair
is still supported and compatible. Do not roll back to the unsupported
Node-20/Firebase-14 pairing merely because it is the current baseline.

Reopen runtime support when Node 22 LTS or Firebase Admin support policy
changes, a security advisory requires a new line, or a separately reviewed
dependency downgrade is proposed. Reopen Swagger only for an approved
production developer-portal or restricted-audience contract. PRD0-D032 closes
independently through PRD0-Q027.

## Deferred owned decisions

PRD0-D032 remains pending. Staging topology and approved differences,
same-digest promotion, release-candidate soak, canary steps, registry policy,
and progressive promotion are not accepted by this ADR.

## Explicit non-authorization

This ADR does not select the exact Node patch or digest before Phase 1
evidence, change a dependency, alter Docker or CI, approve staging, authorize
artifact promotion, start implementation, or approve production launch.
