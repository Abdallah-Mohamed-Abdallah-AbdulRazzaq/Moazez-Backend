# ADR-0004: Production Runtime Roles in the Modular Monolith

## Status

Accepted — 2026-07-27

## Approval authority

- Owner: Abdallah
- Approval date: 2026-07-27
- Timezone: Africa/Cairo
- Approval capacities: product, architecture, security, operations, release
- Accepted owner questions: PRD0-Q001, PRD0-Q002, PRD0-Q010, PRD0-Q011

## Context

Moazez remains one modular-monolith repository and one domain model, but the
current `AppModule` process starts HTTP, WebSocket, BullMQ consumers, repeat
registrations, and maintenance behavior together. That coupling gives API
autoscaling the permissions and resource profile of every worker and makes
scheduler ownership implicit.

Capacity question PRD0-Q003 is not a prerequisite for approving the logical
role boundary. It remains required before final sizing, pool, concurrency,
load, SLO, and cost acceptance.

## Decision

The one repository supplies five production deployment roles:

1. **API** — HTTP and WebSocket entrypoints, controllers, authentication,
   authorization, realtime connections, queue producers, and synchronous
   Learning Media completion until a separately approved Phase 6 transition.
2. **Core Worker** — communication notification generation, communication push
   delivery, school email delivery, import validation, dismissal-expiry
   consumption, and branding-cleanup consumption.
3. **Media Worker** — Learning Media cleanup consumption. It may own future
   asynchronous Learning Media verification only after separate Phase 6
   approval.
4. **Migration Job** — governed `prisma migrate deploy` only. It performs no
   seed and no runtime DDL outside the governed migration command.
5. **Maintenance Scheduler** — singular registration or invocation of
   dismissal expiry, Learning Media discovery, branding reconciliation, and
   future approved schedules through idempotent commands.

The target API constructs zero BullMQ consumers and zero repeat
registrations. Runtime identities cannot perform DDL. The Maintenance
Scheduler invokes dismissal expiry for Core Worker consumption, Learning Media
discovery for Media Worker cleanup consumption, and branding reconciliation
for Core Worker cleanup consumption.

Scheduler ownership does not authorize destructive cleanup. No domain
microservice decomposition is approved.

## Owned production decisions

| Decision | Owning question | Decision-level status |
| --- | --- | --- |
| PRD0-D004 | PRD0-Q001 | Accepted |
| PRD0-D005 | PRD0-Q002 | Accepted |
| PRD0-D006 | PRD0-Q010 | Accepted |
| PRD0-D007 | PRD0-Q011 | Accepted |

This ADR is the sole authoritative owner of PRD0-D004 through PRD0-D007.
Other ADRs may reference these role boundaries but must not redefine them.

## Current implementation gap

The baseline still has one `NestFactory` entrypoint and one current
`AppModule` graph. Runtime worker providers and repeat registrations initialize
inside that graph, and the API is not yet a producer-only composition root.
Top-level shutdown-hook and role-specific lifecycle proof are also absent.
Learning Media verification remains synchronous in the HTTP completion
request. Acceptance of this ADR is not evidence that runtime separation has
been implemented.

## Consequences

### Positive

- API, worker, migration, and maintenance scaling and failure domains can be
  bounded independently.
- Queue consumers, provider access, object cleanup, and DDL permissions can be
  removed from roles that do not need them.
- Singular scheduler ownership becomes testable.

### Costs and constraints

- Separate composition roots, startup manifests, probes, shutdown/drain
  behavior, and deployment configuration are required.
- Queue payload compatibility and role-by-role rollback must be maintained.
- Worker and scheduler availability becomes an explicit production concern.

## Security and tenancy implications

- Existing authentication, authorization, organization, school, uploader, and
  resource-ownership rules remain authoritative.
- Queue work must reconstruct or derive a bounded tenant context from
  persisted truth; role separation cannot bypass tenancy enforcement.
- API identity receives no worker-only SMTP, push, destructive storage, or DDL
  authority.
- Migration identity is the only runtime role permitted the governed DDL
  command.

## Compatibility requirements

- `/api/v1` routes, WebSocket namespace, queue payloads, persisted statuses,
  and existing response contracts remain compatible.
- Learning Media completion remains synchronous through Phase 5A and Phase 5B.
- Any Phase 6 HTTP 202/status transition requires its own approved contract and
  compatibility plan.

## Operational constraints

- Deploy and prove assigned consumers healthy before removing them from the
  current graph.
- Disable an old repeat owner before enabling a new owner.
- Each role requires startup, liveness, readiness, SIGTERM drain, idempotency,
  replay, and exclusivity evidence appropriate to its responsibilities.
- PRD0-Q003 remains required before final resource settings, not before
  composition-root implementation.

## Rollback and reopen conditions

Rollback may restore a prior compatible graph only after queue drain,
consumer/scheduler exclusivity proof, and confirmation that no two schedule
owners or incompatible consumers will overlap.

Reopen this ADR if the deployment platform cannot support non-HTTP roles, if
measured cost or reliability evidence rejects the boundary, if a queue is
proven to require request-local consumption, or if role responsibility changes
materially. A domain-microservice proposal requires a separate superseding
architecture decision.

## Deferred owned decisions

None. Capacity, cloud topology, Redis, storage provider, asynchronous Learning
Media transition, observability, and release decisions are owned elsewhere and
remain pending where their owner questions are pending.

## Explicit non-authorization

This ADR authorizes documentation and later gated implementation only. It does
not implement or approve Phase 1 or Phase 2 completion, cloud provisioning,
capacity values, GCS, destructive cleanup, a Learning Media HTTP contract
change, deployment, or production launch.
