# ADR-0008: Redis Topology and Recovery

## Status

Accepted

## Approval authority

- Owner: Abdallah
- Approved at: `2026-08-06T05:56:00+03:00`
- Timezone: Africa/Cairo
- Accepted owner questions: PRD0-Q012 and PRD0-Q013

## Context

The API, Core Worker, Media Worker, and Maintenance Scheduler share queue
coordination, while the API and Core Worker also participate in realtime
coordination. A single Redis endpoint couples BullMQ availability to
Socket.IO, presence, and typing, and process-local fallback cannot provide
globally correct state across production instances.

The Phase 2 runtime ownership graph is already accepted and must not move. This
decision separates dependency failure domains without changing queue names,
jobs, payloads, retries, ownership, Socket.IO contracts, HTTP contracts, or
database and storage behavior.

## Decision

### Physical topology

Staging and production use two independent Redis instances:

- `QUEUE_REDIS_URL` owns BullMQ queues, producers, consumers, repeat
  registrations, locks, delayed jobs, and stalled-job coordination.
- `REALTIME_REDIS_URL` owns Socket.IO adapter publishers/subscribers, the
  worker-safe Socket.IO emitter, presence, typing, and ephemeral realtime
  coordination.

Different logical database indices, credentials, URL paths, or query strings
on one hostname and effective port do not provide isolation. API and Core
Worker require both variables. Media Worker and Maintenance Scheduler require
only `QUEUE_REDIS_URL` and construct no realtime Redis client. Development and
test retain explicit variables and may use one disposable local endpoint.
Legacy `REDIS_URL` is not a fallback or second source of truth.

Validation failures name only the configuration field or dependency class.
They do not disclose URLs, credentials, hostnames, ports, paths, query
strings, or provider details.

### Queue command and Worker recovery

All Queue command and producer connections are bounded: offline queuing and
automatic replay are disabled, request retry is zero, and connection and
command timeouts are finite. An unavailable command returns the stable internal
error `queue_redis_unavailable` in every runtime role. Queue objects skip
BullMQ's unbounded readiness wait; the service initiates only the first lazy
command connection and does not create an operation while that client is
connecting or reconnecting.

Only Worker-owned connections and blocking duplicates retain Worker-compatible
reconnect semantics with `maxRetriesPerRequest=null`. One Worker base connection
is created lazily per BullMQ service and shared by all Workers in that service;
each Worker receives its required blocking duplicate. Readiness uses a separate
finite client. This prevents producer commands from waiting indefinitely
without applying producer retry policy to blocking Workers.

The same service instances reconnect after Queue Redis returns. Failed bounded
producer commands are not queued for later replay.

### Realtime outage policy

Staging and production have no authoritative in-memory presence, typing, or
fan-out fallback. During Realtime Redis outage:

- liveness remains healthy;
- realtime dependency readiness fails;
- new sockets are rejected;
- shared presence and typing operations fail with
  `realtime_state_redis_unavailable`;
- Queue Redis behavior is unchanged.

Local presence maps may retain sockets owned by the current process only so
live ownership can be reconciled after Redis recovery. They are not returned
as shared truth during outage. Strict environments do not retain local typing
as authoritative state, so expired or divergent typing is not merged after
recovery. Development and test may use the bounded local fallback for focused
compatibility tests.

Socket.IO publisher/subscriber clients are replaced as a pair after failure.
Existing local sockets are disconnected before adapter replacement and must
reauthenticate and rejoin rooms. The Core Worker emitter reconnects in the same
process. Recovery rebuilds realtime ephemeral state from live local socket
ownership only.

### Runtime ownership

| Runtime               | Queue Redis ownership                                             | Realtime Redis ownership                         |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| API                   | producer command plus readiness; zero consumers and repeats       | Socket.IO publisher/subscriber plus state client |
| Core Worker           | bounded command, readiness, Worker base, and six blocking Workers | one worker-safe emitter                          |
| Media Worker          | bounded command, readiness, Worker base, and one blocking Worker  | none                                             |
| Maintenance Scheduler | bounded command plus readiness and three repeats                  | none                                             |

### Governed connection budgets

Queue Redis:

| Allocation                      | Calculation | Connections |
| ------------------------------- | ----------: | ----------: |
| API                             |     `4 x 2` |           8 |
| Core Worker                     |     `2 x 9` |          18 |
| Media Worker                    |     `2 x 4` |           8 |
| Maintenance Scheduler           |     `1 x 2` |           2 |
| Expected steady maximum         |         sum |          36 |
| Recovery and operations reserve |       fixed |           4 |
| Governed maximum                |    `36 + 4` |          40 |

Realtime Redis:

| Allocation                  |   Calculation | Connections |
| --------------------------- | ------------: | ----------: |
| API                         |       `4 x 3` |          12 |
| Core Worker emitter         |       `2 x 1` |           2 |
| Expected steady maximum     |           sum |          14 |
| Temporary reconnect overlap |         fixed |          14 |
| Operations reserve          |         fixed |           2 |
| Governed maximum            | `14 + 14 + 2` |          30 |

The reserves are ceilings, not deployment or rollout capacity. Budget changes
require a new owner decision and evidence.

## Consequences

- A Queue Redis outage fails queue readiness and producer operations but does
  not disable realtime delivery or shared state.
- A Realtime Redis outage fails realtime readiness and admission but does not
  stop queue production or consumption.
- Liveness does not cause process replacement for dependency-only outages.
- Recovery is more explicit: clients are either reconnecting according to
  their role or replaced through a bounded readiness flight.
- Staging and production require two physical endpoints and incur the cost and
  operations burden of two Redis instances.

## Verification

PRD3-G02 uses two fresh Redis containers resolved from one already-present
immutable image ID. The production-shaped direct service topology contains
four API instances, two Core Workers with six consumers each, two Media
Workers with one consumer each, and one Maintenance Scheduler. It proves
independent stop/start recovery, two-API fan-out, shared presence and typing,
strict fallback rejection, no failed-producer replay, exact connection maxima,
zero final clients, and exact labeled cleanup.

The evidence is recorded in
`docs/production-readiness/phase-3/05-redis-topology-and-recovery-evidence.md`.
This ADR does not claim managed Redis, Terraform, Cloud SQL, or any cloud
resource exists.

## Compatibility

This decision changes no route, method, DTO, response status, authorization,
tenant or school boundary, Socket.IO namespace, room, event, payload, queue,
job, job ID, retry/backoff policy, Worker or scheduler ownership, Prisma
schema, migration, storage behavior, dependency, lockfile, or Learning Media
synchronous HTTP 200 completion.
