# ADR-0010: Production Health and Observability Contract

## Status

Accepted for PRD0-D024 and PRD0-D035 only — 2026-07-27

## Approval authority

- Owner: Abdallah
- Approval date: 2026-07-27
- Timezone: Africa/Cairo
- Approval capacities: product, architecture, security, operations, release
- Accepted owner questions: PRD0-Q024, PRD0-Q030
- Pending owner question: PRD0-Q025

## Context

At the 2026-07-27 Phase 0B closeout, the public health endpoint returned a
detailed aggregate report and normally used HTTP 200 even when degraded. It
did not provide separate startup, liveness, and readiness semantics, and the
public root was a development greeting. Full telemetry, SLOs, paging,
retention, and cost still have no owner approval.

Production orchestration needs a minimum role-specific contract before routing
or restarting processes, while detailed observability remains a later Phase 7
scope.

## Decision

Add protected role-specific startup, liveness, and readiness endpoints. They
are additive; they do not silently repurpose the public health route.

The minimum required dependency semantics are:

- **API:** validated configuration, HTTP startup, Prisma, queue-producer Redis,
  object storage for enabled file contracts, and realtime Redis when realtime
  is enabled.
- **Core Worker:** validated configuration, Prisma, queue Redis, and all
  assigned consumers.
- **Media Worker:** validated configuration, Prisma, queue Redis, object
  storage, temporary-disk capability, and verified `ffprobe` runtime.

Liveness must not restart a process merely because an external dependency is
unavailable. Readiness must prevent routing or work assignment when a
role-required dependency is unavailable. Startup must remain false until
configuration and role initialization complete.

Public health is limited to `status`, `version`, and `timestamp`. The public
root becomes a minimal service identity and version response with no
development greeting or internal topology. Public responses expose no queue,
email, push, storage, database, Redis, exception, or topology detail.

The compatibility window for the public root and health reduction is one
release cycle.

## Owned production decisions

| Decision | Owning question | Decision-level status |
| --- | --- | --- |
| PRD0-D024 | PRD0-Q024 | Accepted |
| PRD0-D025 | PRD0-Q025 | Pending |
| PRD0-D035 | PRD0-Q030 | Accepted |

This ADR is the sole authoritative owner of PRD0-D024, PRD0-D025, and
PRD0-D035. Acceptance does not extend to PRD0-D025.

## Implementation status

At the 2026-07-27 Phase 0B closeout, the baseline exposed one detailed public
health route, no protected role-specific probe set, and a development root
greeting. Phase 1 subsequently implemented and closed the minimum public
identity/health and role-specific startup, liveness, and readiness contracts;
Phase 2 implemented the production runtime composition roots. Structured
telemetry, complete metrics, worker heartbeats, dashboards, SLOs, alerts,
traces, paging, and approved retention/budget remain Phase 7 work because
PRD0-D025 is still pending.

## Consequences

### Positive

- Liveness avoids external-dependency restart loops.
- Readiness stops unsafe routing and work assignment.
- Startup captures configuration and runtime capability failures.
- Public diagnostic exposure is bounded.

### Costs and constraints

- Every runtime role needs dependency-specific probe tests and protected
  operational access.
- Current monitors and clients need a one-release-cycle transition.
- Full dependency and telemetry coverage remains later work.

## Security and tenancy implications

- Operational endpoints must be protected by approved identity/network policy.
- Public endpoints must not expose credentials, tenant identifiers, exception
  details, provider state, queue counts, or internal topology.
- Probe implementations must not bypass tenant boundaries or perform
  destructive checks.

## Compatibility requirements

- Public `/api/v1/health` remains available during the one-release-cycle
  compatibility window with only the approved minimal fields at the agreed
  transition point.
- Root and health consumers must be inventoried before reducing the response.
- Probe additions do not change business API paths, DTOs, or Learning Media
  behavior.

## Operational constraints

- Probe thresholds and timeouts must avoid restart storms.
- A dependency outage can make readiness fail without making liveness fail.
- Role startup manifests and dependency-failure tests are required.
- Minimum safe probe semantics close in Phase 1; the full dependency matrix,
  dashboards, metrics, SLOs, alerts, logging, and rate controls close in
  Phase 7.

## Rollback and reopen conditions

Probe paths and thresholds may roll back to a previously safe configuration
only while preserving a reliable routing signal. Public response rollback must
respect the compatibility window and must not restore sensitive detail.

Reopen PRD0-D024 or PRD0-D035 if the hosting platform requires different probe
mechanics, monitor inventory shows an incompatible contract, or the approved
public field set changes. PRD0-D025 reopens and closes independently through
PRD0-Q025.

## Deferred owned decisions

PRD0-D025 remains pending. Availability/latency/error objectives, queue/media
SLOs, alert thresholds, paging hours and owners, telemetry retention, metrics,
traces, dashboards, and telemetry budget are not accepted by this ADR.

## Explicit non-authorization

This ADR authorizes documentation and later gated implementation only. It does
not mark any Phase 1 or Phase 7 gate complete, select SLOs or alert policy,
authorize public operational detail, provision cloud monitoring, or approve
production launch.
