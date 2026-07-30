# Phase 1C/G04 — Final CI and Redis Recovery Closeout

## Document control

| Field                                            | Value                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Historical task ID                               | `PRD1-G04-IMPLEMENT-PROVEN-BOUNDED-BULLMQ-READINESS-FIX`                |
| Repository                                       | `Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend`                  |
| Branch                                           | `feat/production-readiness-1c-health-probes`                            |
| Origin/main baseline                             | `2f87a155cf27f2186cfd7746026562ef18cb4f71`                              |
| Historical feature HEAD before BullMQ correction | `aca314de829c35d1bfcfad8cdbe149ddbbff5e02`                              |
| Current remote feature HEAD                      | `5e64005e0db750956036495a3b32c85239194b4e`                              |
| Current local technical correction               | 8 paths — 7 tracked modifications plus 1 untracked new integration test |
| Focused F1 documentation correction              | 1 tracked documentation path                                            |
| Current working-tree scope after correction      | 9 paths — 8 tracked modifications plus 1 untracked path                 |
| Final publication candidate                      | 51 paths relative to `origin/main` after explicit staging               |
| Date                                             | `2026-07-30`                                                            |
| Timezone                                         | `Africa/Cairo`                                                          |
| Scope                                            | `PRD1-G04` only                                                         |
| Gate status                                      | `LOCAL_TECHNICAL_GATES_COMPLETE_REMOTE_CI_PENDING`                      |
| Document status                                  | `F1_DOCUMENTATION_CORRECTED_PUBLICATION_REVIEW_PENDING`                 |
| Remote CI                                        | `PENDING`                                                               |

## Outcome

`PRD1-G04` is implemented without a second Nest application, a second
dependency-injection graph, a credential, a JWT requirement, path obscurity,
or a Phase 2 runtime selector.

GitHub Actions run `30500009569`, job `90737376235`, remained at readiness
`503` even though the same Redis container was running, unpaused, and returning
`PONG`. An unchanged local reproduction recovered, so recovery alone was not
accepted as proof. Diagnostic instrumentation established that `queue-redis`
crossed its approximately 750 ms caller deadline while its shared-connection
operation remained active for approximately 3.33 seconds. The deterministic
defect was therefore a provider operation whose lifetime was longer than and
independent of its caller deadline.

Queue readiness now owns a separate finite Redis client and a service-level
single flight. Its complete connect-and-`PING` operation is bounded to 600 ms,
and its graceful close is bounded to 400 ms with exact-once forced disconnect
fallback. Late fulfillment and rejection remain observed but cannot restore
ownership. Queue and Worker instances remain on the original shared BullMQ
connection with `maxRetriesPerRequest: null`; no readiness-only client is ever
passed to either.

The same canonical application process now recovers after the same Redis
container and Redis process are paused and resumed while the configured Redis
endpoint remains stable. A GitHub rerun remains pending until the owner commits
and pushes this unstaged correction; this document does not claim remote
success.

The process now owns two HTTP listeners:

1. the existing Nest application listener on `APP_PORT`; and
2. a small Node HTTP management listener on `APP_PROBE_PORT`.

The application/container contract separates the two ports. The management
port binds to `0.0.0.0` inside the container so a future Cloud Run v2 container
probe can select it explicitly. The canonical Docker proof publishes only
`APP_PORT`; it does not publish `APP_PROBE_PORT`. The public Nest listener does
not register operational probe routes.

The prior R1 conclusion that a new credential or owner decision was necessary
is superseded. Cloud Run v2's container probe contract permits an HTTP probe to
select a container port from 1 through 65535 independently of the one exposed
ingress port. Local canonical-container experiments validated the resulting
port boundary. No live Cloud Run service or cloud resource was created or
changed in this task.

## Authority and phase boundary

- ADR-0010 and PRD0-D024 own the minimum startup, liveness, and readiness
  contract.
- PRD0-Q024 owns the API, Core Worker, and Media Worker dependency semantics.
- PRD0-Q030 limits the public health response to `status`, `version`, and
  `timestamp`.
- PRD0-Q025 keeps metrics, tracing, dashboards, SLOs, alerts, paging,
  retention, and telemetry budget in Phase 7.
- The Core and Media definitions below are reusable dependency manifests.
  They do not create separate processes, disable consumers, move schedulers,
  or claim that Phase 2 composition roots exist.
- Learning Media completion remains synchronous.

## Current architecture

| Surface                     | Implementation                                                 | Behavior                                                                                                             |
| --------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Public application listener | existing Nest application on `APP_PORT`                        | root, API, WebSocket, public health, existing middleware/guards/filters, and all current product behavior            |
| Management listener         | one `node:http` server on `APP_PROBE_PORT` in the same process | operational startup/liveness/readiness only; no Nest routes or second application graph                              |
| Public health               | `GET /api/v1/health`                                           | side-effect-free compatibility response with exactly `status`, `version`, and `timestamp`                            |
| Lifecycle state             | existing `ApplicationLifecycleState`                           | makes startup/readiness unavailable during drain; liveness remains process-local                                     |
| Shutdown coordinator        | existing Phase 1B coordinator                                  | begins public HTTP close, management HTTP close, and BullMQ worker drain in one immediately observed operation graph |
| Role policies               | immutable API/Core/Media manifests                             | reusable target-role requirements over the current single graph                                                      |

`APP_PROBE_PORT` defaults conservatively to `9090`, must be an integer from 1
through 65535, and must differ from `APP_PORT`. It is documented in
`.env.example`. Invalid, fractional, zero, negative, over-range, and
same-as-public values fail environment validation.

## Protection model

The completed application/container contract keeps `APP_PROBE_PORT` distinct
from `APP_PORT`. The canonical Docker experiment publishes only `APP_PORT`;
`APP_PROBE_PORT` has no host port mapping. For all three roles and all three
probe kinds, both the exact `/internal/probes/...` path and its
`/api/v1/internal/probes/...` form receive `404` through `APP_PORT`.

Cloud Run v2 container probes can target the internal listener by setting the
probe's `port` field to `APP_PROBE_PORT`; the
[v2 Container API contract](https://docs.cloud.google.com/run/docs/reference/rest/v2/Container)
defines that field independently for HTTP probes, and the
[Cloud Run health-check guide](https://docs.cloud.google.com/run/docs/configuring/healthchecks)
documents the container-probe behavior. Ordinary service traffic continues to
be routed only to the configured ingress port. The model therefore does not
depend on:

- a static token;
- an application JWT;
- a secret header;
- source-address inference;
- `User-Agent` or `Host` trust;
- a hidden path; or
- a second public route family.

No live Cloud Run service was configured, protected, or validated in this
task. The implementation and canonical Docker experiment prove only the
application/container side of the contract. Phase 8 deployment/IaC must
configure `APP_PORT` as the sole Cloud Run service ingress port and explicitly
point container startup, liveness, and readiness probes at `APP_PROBE_PORT`.

## Internal paths and HTTP contract

The listener exposes:

- `/internal/probes/api/{startup|liveness|readiness}`
- `/internal/probes/core-worker/{startup|liveness|readiness}`
- `/internal/probes/media-worker/{startup|liveness|readiness}`

| Condition                   | HTTP behavior                                                  |
| --------------------------- | -------------------------------------------------------------- |
| healthy/available `GET`     | `200`                                                          |
| unavailable/not ready `GET` | `503`                                                          |
| unknown path                | `404`                                                          |
| method other than `GET`     | `405` with `Allow: GET`                                        |
| every response              | `Content-Type: application/json` and `Cache-Control: no-store` |

Probe responses contain only `status`, the authoritative application
`version`, and a canonical millisecond ISO-8601 `timestamp`. Unknown-path and
method responses use the same bounded shape. No response contains dependency
names, provider modes, queue names or counts, URLs, file paths, credentials,
tenant data, or raw errors.

## State semantics

### Startup

Startup is `503` while initialization is pending, after initialization failure,
and while draining. It becomes `200` only after:

- configuration validation;
- Nest module initialization;
- the management listener;
- the public application listener;
- construction of the dual-listener shutdown coordinator;
- installation of the `SIGTERM` and `SIGINT` handlers; and
- required current local capabilities for the represented role.

`startApplicationRuntime()` enforces that exact order. It marks initialization
complete only after shutdown ownership is installed, and closes both listeners
when either listener startup or shutdown-handler installation fails. Process
tests cover delayed initialization, failed initialization, and deterministic
ordering.

### Liveness

Liveness is a bounded process-local response. It performs no PostgreSQL,
Redis, storage, email, push, provider, ffprobe, or temporary-disk operation.
It remains `200` during dependency outages and while draining so external
dependency loss cannot create a restart loop.

### Readiness

Readiness is `503` until startup is complete and while draining. It executes
bounded non-destructive checks, does not cache a failure forever, and
single-flights concurrent checks. Each dependency operation has a 750 ms
deadline. Timers are cleared, late resolutions/rejections remain observed, and
raw failures are never serialized.

Readiness does not create records, enqueue jobs, create queues, create buckets,
or write objects.

## Role dependency matrix

| Role manifest | Required readiness evidence                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API           | Prisma query; queue-producer Redis ping; storage readiness because current managed file contracts are enabled; Socket.IO adapter Redis readiness; presence/typing state-store Redis readiness                              |
| Core Worker   | Prisma query; queue Redis ping; running and unpaused processing loops for communication notification generation, push delivery, school email delivery, import validation, dismissal expiry, and branding cleanup consumers |
| Media Worker  | Prisma query; queue Redis ping; storage readiness; a running and unpaused Learning Media cleanup processing loop; verified ffprobe runtime; writable temporary directory                                                   |

Storage and realtime requirements are explicit policy inputs rather than
hard-coded public behavior. Tests prove that a disabled optional capability is
not called. The current production policy requires both for API.

## Dependency and cancellation behavior

`BoundedProbeExecutor` supplies dependency-key single flight and a bounded
deadline for every caller. A caller timeout does not remove the underlying
provider flight. Repeated callers reuse that same registered flight until the
provider operation actually resolves or rejects, preventing accumulation of
hung Prisma, Redis, storage, or provider operations. Every caller timer is
cleared. Late resolution and rejection remain observed, and the flight is
removed only after provider settlement so exactly one new operation can prove
recovery.

The temporary-disk check creates and removes a unique probe directory and
zero-length file below the configured operating-system temporary root. Storage
uses the existing non-destructive bucket-existence readiness method. Queue
connectivity readiness uses a dedicated finite Redis client that is never
passed to a Queue or Worker, while assigned-consumer readiness verifies that
every required BullMQ worker has a currently running, unpaused processing
loop. Queue and Worker instances remain on the original shared BullMQ
connection. Unexpected `worker.run()` settlement or rejection makes that
worker unavailable. Readiness does not create a queue or inspect job counts.
Queue backlog/failure-count telemetry remains Phase 7.

## Realtime coverage, recovery, and shutdown compatibility

API readiness now requires both realtime Redis surfaces:

1. the Socket.IO adapter publisher/subscriber clients; and
2. the `RealtimeStateStoreService` client used for shared presence and typing
   state.

They use the independent executor keys `realtime-adapter-redis` and
`realtime-state-store-redis`. A fast failure on one surface cannot release the
other surface's still-pending flight. Caller timeout leaves the underlying
operation registered, repeated callers reuse it, late settlement remains
observed, and exactly one later invocation can prove recovery.

The state store now has explicit `initializing`, `ready`, `fallback`,
`recovering`, `reconciling`, `unavailable`, and `destroying` states. Client
creation and recovery are single-flight; failed clients are detached and
closed; shutdown awaits owned recovery and serialized mutation work. Product
operations retain the existing process-local fallback for compatibility, but
readiness is `503` throughout fallback, recovery, and reconciliation. A
successful connection and `PING` alone cannot make the service ready.

Every state-store Redis client has one close owner recorded in a `WeakMap`.
Graceful `QUIT` is observed immediately and bounded to one second; rejection or
timeout forces exactly one `disconnect()`, while a late `QUIT` rejection
remains handled. Candidate ownership is installed before bounded retirement of
the previous client, but lifecycle state becomes `ready` only after that
retirement settles or reaches its bound, destruction and ownership are
rechecked, candidate status remains `ready`, and a final bounded candidate
`PING` succeeds. Those invariants are rechecked again after the final `PING`
before readiness becomes healthy. A concurrent destroy cannot transition back
to `ready`. A late command failure from a retired client cannot downgrade or
close the recovered client.

Local presence ownership records school, user, socket, latest update time, and
TTL for every connected socket. Reconciliation restores socket membership,
user presence, and school indexes idempotently, including multiple sockets for
one user and a pre-outage key that expired. Multi-socket replay is ordered
oldest-to-newest so Redis retains the latest user timestamp. Local ownership is
removed only by a real disconnect; refresh restores a missing Redis
membership without publishing duplicate online/offline transitions.

Local typing ownership retains its original expiration. Reconciliation drops
expired entries and restores only positive remaining TTLs. Entries sharing a
conversation index replay from the shortest to the longest remaining TTL so
the shared index is not shortened below the longest active typing entry.
Failed reconciliation retains local ownership, keeps readiness at `503`, and
is retried by the next bounded single-flight recovery.

One state-store-owned sweep runs every four seconds, which is bounded relative
to the current eight-second typing TTL. The single timer is unreferenced; each
sweep runs through the same serialized mutation lane as fallback mutation and
reconciliation, removes every owner whose expiry is at or before the current
time, removes empty conversation and school maps, and cannot overlap another
sweep. Destruction clears the timer exactly once and awaits any active sweep
before Redis closure. The first local mutation after Redis failure now
transitions the lifecycle from `unavailable` to `fallback` immediately.

Socket.IO adapter recovery uses an explicit disconnect-and-reconnect policy.
The adapter moves synchronously through `initializing`, `ready`, `recovering`,
`unavailable`, and `destroying`. Namespace middleware rejects admission before
authentication unless state is `ready`; `handleConnection()` repeats the
check after authentication and rejects a generation mismatch before any room
join or presence registration. Before replacing the adapter, the gateway
disconnects every namespace socket and awaits presence cleanup. This applies
to both an existing Redis adapter and startup recovery from the in-memory
adapter. Clients then reconnect, reauthenticate, and rejoin school, user, and
conversation rooms. A real Socket.IO test proves delivery before recovery,
the authentication/recovery race rejection, intentional disconnect, presence
cleanup before replacement, baseline/conversation rejoin, delivery after
reconnect, and clean shutdown. No partial room copy or silent hot-swap is
used.

Before closing owned Redis clients during shutdown, the gateway restores
Socket.IO's in-memory adapter so Nest does not issue unsubscribe commands
through already closed clients. The final outage, recovery, and SIGTERM
sequence exits `0` without a post-close Redis command or unhandled rejection.

Both Redis-adapter clients have fixed one-second connect and command bounds.
Publisher/subscriber readiness uses one shared underlying ping flight and
observes both child settlements; a fast rejection cannot abandon the other
ping, and repeated callers do not create more child commands while that flight
is pending. Client closure is also bounded: a non-settling `QUIT` is observed,
its timer is cleared, and the owned client receives exactly one forced
disconnect. Connection attempts observe both clients and every partial client
is closed on failure.

All added failure logging is fixed and bounded. It records only a fixed event
and stage, never a raw exception, stack, Redis URL, school/user/socket/
conversation identifier, queue name, connection string, or credential.

## Final production-file self-review

The final review covered every changed production file, specifically:

- bootstrap ownership and lifecycle:
  `application-startup.ts`, `management-probe.server.ts`,
  `graceful-shutdown.ts`, and `main.ts`;
- configuration: `env.validation.ts`;
- health policy and public compatibility: `health.controller.ts`,
  `health.service.ts`, `health.module.ts`, `bounded-probe-executor.ts`,
  `operational-probe.manifests.ts`, `operational-probe.service.ts`, and
  `temporary-disk.probe.ts`;
- queue availability: `bullmq.service.ts`;
- realtime ownership: `realtime.gateway.ts`,
  `realtime-state-store.service.ts`, `realtime-presence.service.ts`,
  `realtime-publisher.service.ts`, and `realtime.module.ts`; and
- media local capability exposure: `media-runtime-startup.guard.ts` and
  `uploads.module.ts`.

The review explicitly traced check-then-act races, recovery single-flight,
caller timeout versus underlying operation ownership, authentication crossing
an adapter generation, shutdown/recovery overlap, refresh/reconciliation
serialization, Redis-client creation and exact close ownership, listener and
timer cleanup, promise rejection observation, presence/typing correctness,
worker processing-loop state, startup ordering, drain behavior, response/log
redaction, and phase boundaries.

Three additional in-scope defects were corrected during this review:

1. realtime publish and BullMQ failure logs could include raw errors,
   identifiers, or queue names; they now use fixed event/stage objects and
   regression tests assert absence of those values;
2. typing reconciliation could shorten the shared conversation-users index
   TTL when a shorter-lived entry replayed last; replay now orders active
   entries by ascending remaining TTL; and
3. multi-socket presence reconciliation could leave a stale shared user
   timestamp because it used socket insertion order; replay now orders socket
   owners by update time so the newest timestamp is written last.

R6's final memory and Redis-command review found and corrected three further
scope-local defects:

1. the healthy-process typing shadow had no autonomous expiry owner; one
   unreferenced serialized sweep now bounds that memory and is owned by
   shutdown;
2. an initial fallback mutation could leave the state store labeled
   `unavailable`; local mutation now immediately selects the accurate
   `fallback` lifecycle state; and
3. adapter readiness used fail-fast publisher/subscriber pings and unbounded
   graceful close; both commands now remain jointly observed under one
   retained flight, and client close has a fixed deadline plus exact-once
   forced disconnect.

No remaining reviewed path can report readiness before fallback
reconciliation, admit a socket across recovery, silently retain a non-running
worker as available, or start initialization before shutdown ownership. No
schema, queue payload, object-storage, media, public product, Phase 2, Phase 3,
Phase 7, or Phase 8 implementation was introduced.

## Shutdown order

On the first supported signal:

1. lifecycle draining begins;
2. public HTTP close, management HTTP close, BullMQ worker drain, and admitted
   application-work drain are created with rejection observation in the same
   synchronous turn;
3. new public, management, and WebSocket work cannot be admitted;
4. admitted work drains;
5. realtime sockets disconnect;
6. Nest lifecycle cleanup runs once;
7. the referenced Phase 1B hard deadline remains authoritative.

Management close is exactly-once in tests. An immediate management-close
failure reaches the sanitized non-zero shutdown path with no unhandled
rejection. A successful production SIGTERM closes both listeners and exits
`0`. The no-extra-handle fixture, whose `app.close()` never resolves, remains
alive only through the coordinator's referenced deadline, emits
`lifecycle.shutdown.timed_out`, and exits `1`.

## Public compatibility and restored assertions

The accepted R1 public reduction is preserved:

```json
{
  "status": "ok",
  "version": "0.0.1",
  "timestamp": "<canonical ISO-8601 timestamp>"
}
```

The CI assertion compares a sorted exact key allowlist, validates the
timestamp with both a strict canonical pattern and `toISOString()` equality,
and derives the version from the packaged application metadata.

The R1 rewrite removed four former `HealthService` assertions:

1. required-dependency success with optional provider skipping;
2. queue failed-job degradation;
3. storage-failure sanitization; and
4. encrypted email-secret non-disclosure.

Equivalent operational protections are restored in the new probe suites:

- role dependency success/failure and recovery;
- queue Redis connectivity and exact assigned-consumer processing-loop
  availability;
- separate Socket.IO adapter and presence/typing state-store Redis failure and
  recovery;
- dependency failure sanitization;
- storage credential/URL non-disclosure;
- email-secret-like payload non-disclosure where email is not itself an
  approved role readiness dependency;
- late rejected dependency-promise observation; and
- timeout timer cleanup.

The old failed-job count is intentionally not an operational readiness input;
queue backlog and failure-count telemetry remain Phase 7. No security
non-disclosure assertion was silently dropped.

## Canonical container evidence

The digest-pinned Node `22.23.1` production image was built and run with
production configuration and only `3000/tcp` published to the host.
`9090/tcp` was not published. Every canonical `curl` used a one-second
connection timeout and two-second total timeout; every in-container `fetch`
used a two-second abort signal.

The experiment proved:

- public health had the exact three keys, authoritative version, and canonical
  timestamp;
- all 18 public-port isolation cases returned `404`: the exact and
  `/api/v1`-prefixed paths for all three roles and all three probe kinds;
- in-container calls to all nine API/Core/Media probe paths returned `200`
  after startup with exact JSON/no-store headers and bounded three-field
  bodies;
- an unknown internal path returned `404`, and `POST` to a known path returned
  `405` with `Allow: GET`; both retained the exact safe three-field schema and
  exposed no raw error, dependency, URL, path, secret, credential, queue, or
  topology detail;
- pausing disposable Redis made API, Core, and Media readiness return `503`
  without removing or changing the configured Redis DNS endpoint;
- API, Core, and Media liveness remained `200`;
- resuming the same Redis container and process allowed readiness to recover
  to `200`; focused real-Redis
  proofs independently exercised both the Socket.IO adapter and state-store
  clients, including state-store fallback and same-process recovery;
- the final compiled production image settled its BullMQ provider outage in
  403 ms, below the 750 ms caller deadline, with both the service readiness
  flight and executor flight maps empty before recovery;
- the focused real-Redis TCP-proxy integration measured 529 ms at its slowest
  accepted final-tree run, resumed the stable endpoint, returned healthy on a
  fresh executor call, and used the same worker instance to process jobs before
  and after recovery;
- an additional final-image reconciliation process inspected actual Redis
  keys and proved restoration of two sockets for one user, school/user
  indexes, the exact expected latest `updatedAt`, positive bounded presence
  TTLs, active typing with its remaining TTL, and absence of expired typing
  before it reported success;
- the separate disposable real-Redis integration—not the canonical image
  workflow—proved restoration of a second user and an ACL/EVAL reconciliation
  denial that kept readiness at `503`, followed by permission restoration,
  successful retry, and readiness `200`;
- a real authenticated Socket.IO connection proved school/user baseline and
  conversation-room delivery, intentional disconnect during adapter
  replacement, presence cleanup, reconnect/rejoin, and delivery after
  recovery;
- after `lifecycle.shutdown.intake_stopped`, management readiness was
  unavailable rather than successful;
- post-intake public HTTP could not return `2xx`;
- SIGTERM after realtime Redis recovery exited `0`; its lifecycle completion
  logs contained exactly one started, intake-stopped, and completed event;
- the same application container and process recovered from readiness `503`
  to `200` after the same Redis container and Redis process were paused,
  resumed, and reached `PONG`; application and Redis container identities and
  start times remained unchanged, all three role liveness probes remained
  `200`, and the application did not restart;
- both listeners were closed;
- the final forced-timeout fixture exited `1` after 1,458 ms container wall
  time against a 1,000 ms coordinator deadline; it emitted the bounded
  timed-out event, no completion event, and the fixture contained no
  artificial keepalive handle;
- Node, Firebase Admin app/messaging, Prisma Client, non-root UID 1000, and the
  pinned ffprobe/media runtime contract remained valid; and
- probe bodies exposed no secret or topology details.

## Validation evidence

| Command / evidence                                                                                                                                                                                                                                      | Outcome                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hard Git preflight                                                                                                                                                                                                                                      | PASS — branch `feat/production-readiness-1c-health-probes`; HEAD and remote feature `aca314de829c35d1bfcfad8cdbe149ddbbff5e02`; `origin/main` `2f87a155cf27f2186cfd7746026562ef18cb4f71`; `0/0` against the remote feature; empty index, clean worktree, zero untracked paths before correction; PR #51 open, Draft, 50 paths                                                                        |
| final BullmqService unit suite with `--runInBand --detectOpenHandles`                                                                                                                                                                                   | PASS — 1 suite, 30 tests, 2.112 s, exit `0`; separate options, service single flight, hanging owned/candidate operations, late settlement, stale ownership, recovery, shutdown race, exact-once close, fixed failure/logging, real executor, and worker isolation                                                                                                                                    |
| final bounded-executor and operational-probe focused suites                                                                                                                                                                                             | PASS — 2 executor tests and 22 operational-probe tests; API, Core, and Media retain `queue-redis`, readiness fails closed and recovers, and liveness remains independent                                                                                                                                                                                                                             |
| final real-Redis BullMQ suspend/resume integration                                                                                                                                                                                                      | PASS — 1 suite, 3 tests, zero skips, 3.563 s; bounded case settled in 529 ms, both flight maps were empty, a fresh call recovered, and the same worker processed the post-recovery job                                                                                                                                                                                                               |
| final compiled-production-image BullMQ provider proof                                                                                                                                                                                                   | PASS — suspended stable endpoint returned unhealthy in 403 ms; service and executor flights were empty; the next invocation returned healthy                                                                                                                                                                                                                                                         |
| final production TypeScript/image build                                                                                                                                                                                                                 | PASS — canonical Node `22.23.1` production build and Prisma Client generation completed; final image manifest-list digest `sha256:de7dbc05d6f0d1658a257f2254a3c91b3fe96ac967910c197b8a7305b80163cf`                                                                                                                                                                                                  |
| complete queue and health regression                                                                                                                                                                                                                    | PASS — 6 suites, 68 tests, 6.544 s, exit `0`                                                                                                                                                                                                                                                                                                                                                         |
| final full-unit regression                                                                                                                                                                                                                              | PASS — 543 suites, 3,922 tests, 107.62 s, exit `0`                                                                                                                                                                                                                                                                                                                                                   |
| final exact security regression                                                                                                                                                                                                                         | PASS — 89 suites, 1,154 tests, 424.892 s, exit `0`; unchanged tests and timeouts on fresh synthetic PostgreSQL, Redis, and MinIO                                                                                                                                                                                                                                                                     |
| final real `AppModule` E2E                                                                                                                                                                                                                              | PASS — 1 suite, 2 tests, 46.281 s, `--detectOpenHandles`, exit `0`                                                                                                                                                                                                                                                                                                                                   |
| final runtime policy                                                                                                                                                                                                                                    | PASS — Node `22.23.1`, Firebase Admin `14.0.0`, 10 tests, exit `0`                                                                                                                                                                                                                                                                                                                                   |
| final workflow YAML parse                                                                                                                                                                                                                               | PASS — `js-yaml`, exit `0`; the early lifecycle command includes `bullmq.service.spec.ts`, and the existing BullMQ integration step owns the extended real-Redis file                                                                                                                                                                                                                                |
| final migration governance                                                                                                                                                                                                                              | PASS — base `origin/main` at `2f87a155cf27`, 7 active migrations, 0 new, rebaseline off                                                                                                                                                                                                                                                                                                              |
| final isolated Prisma validation/generation                                                                                                                                                                                                             | PASS — schema valid; Prisma Client `6.19.3` generated with synthetic `DATABASE_URL` and no workspace `.env` access                                                                                                                                                                                                                                                                                   |
| `npm run verify:runtime-policy`                                                                                                                                                                                                                         | PASS — Node `22.23.1`, Firebase Admin `14.0.0`, 10 tests, 0.307 s, exit `0`                                                                                                                                                                                                                                                                                                                          |
| pre-candidate-revalidation state-store close/recovery lifecycle with `--detectOpenHandles`                                                                                                                                                              | PASS — 1 suite, 25 tests, 2.057 s, exit `0`; historical R6 evidence covering hanging/late-rejected `QUIT`, exact-once forced disconnect, destroy overlap, failed-candidate retry, and stale retired-client failure ownership                                                                                                                                                                         |
| pre-candidate-revalidation focused health/lifecycle/realtime command in the isolated media-test image with `--detectOpenHandles`                                                                                                                        | PASS — 15 suites, 111 tests, 15.56 s, exit `0`; this evidence predates the final five candidate-revalidation tests                                                                                                                                                                                                                                                                                   |
| pre-self-review complete realtime unit directory with `--detectOpenHandles`                                                                                                                                                                             | PASS — 10 suites, 93 tests, 3.733 s, exit `0`; the final full-unit run includes the added ownership-race assertion                                                                                                                                                                                                                                                                                   |
| `npx jest --config ./test/jest-e2e.json --runInBand --detectOpenHandles --runTestsByPath test/integration/realtime-state-store-readiness.integration.spec.ts test/integration/realtime-adapter-recovery.integration.spec.ts` with disposable real Redis | PASS — 2 suites, 4 tests, 5.09 s, exit `0`; this is the evidence owner for second-user and ACL/EVAL denial/retry                                                                                                                                                                                                                                                                                     |
| final candidate-revalidation focused regression with `--detectOpenHandles`                                                                                                                                                                              | PASS — state-store, operational-probe, and bounded-executor suites; 54 tests passed, zero open handles, exit `0`; covers candidate failure during retired-client close, final-PING failure, destruction during final validation, successful revalidation, and newer-client ownership protection                                                                                                      |
| final candidate-revalidation real-Redis integration                                                                                                                                                                                                     | PASS — 2 tests passed against disposable real Redis; recovery remained fail-closed until candidate ownership, status, and the final bounded `PING` were validated                                                                                                                                                                                                                                    |
| final production TypeScript build                                                                                                                                                                                                                       | PASS — production build completed using the canonical Node `22.23.1` runtime                                                                                                                                                                                                                                                                                                                         |
| R6 full-unit regression before the final candidate-revalidation delta                                                                                                                                                                                   | PASS — 543 suites, 3,905 tests                                                                                                                                                                                                                                                                                                                                                                       |
| R6 exact-security regression before the final candidate-revalidation delta                                                                                                                                                                              | PASS — 89 suites, 1,154 tests, 481.883 s, exit `0`                                                                                                                                                                                                                                                                                                                                                   |
| R6 canonical final-image and media-test-image builds before the final candidate-revalidation delta                                                                                                                                                      | PASS — final image rebuilt in 16.6 s and media-test target rebuilt in 164.9 s, both exit `0`; recorded R6 local manifest-list digest `sha256:8f0c82f854a76effc4978497bf317ac2e5861fb7282f3bc35fedaddacc9da4ec`                                                                                                                                                                                       |
| `npm run db:migrations:check`                                                                                                                                                                                                                           | PASS — base `origin/main`, 7 active migrations, 0 new, exit `0`                                                                                                                                                                                                                                                                                                                                      |
| isolated `npx prisma validate && npx prisma generate`                                                                                                                                                                                                   | PASS — Prisma `6.19.3`; no host Prisma/config command and no workspace `.env` read                                                                                                                                                                                                                                                                                                                   |
| fresh disposable `npx prisma migrate deploy` and corrected `npm run seed`                                                                                                                                                                               | PASS — all 7 committed migrations plus synthetic seed                                                                                                                                                                                                                                                                                                                                                |
| R6 final-image fallback reconciliation process before the final candidate-revalidation delta                                                                                                                                                            | PASS — actual Redis keys for one user, two-socket membership, indexes, exact expected latest `updatedAt`, bounded TTLs, remaining typing TTL, and expired-entry absence                                                                                                                                                                                                                              |
| final canonical public/internal-port, stable-endpoint outage/recovery, and shutdown proof                                                                                                                                                               | PASS — exact workflow startup script against the final production image; API, Core, and Media readiness each returned `200` → `503` → `200`; all three liveness probes stayed `200`; Redis returned `PONG`; application ID/start time and Redis ID/start time remained identical; no application restart; post-intake public code was non-`2xx`; SIGTERM exit `0` with lifecycle completion in 43 ms |
| no-extra-handle forced-timeout process                                                                                                                                                                                                                  | PASS — exit `1`, 1,458 ms container wall time, bounded timed-out event, no completion event                                                                                                                                                                                                                                                                                                          |
| exact Node/Firebase/Prisma/non-root/media runtime smokes                                                                                                                                                                                                | PASS — Node `v22.23.1`, Firebase app/messaging, Prisma Client, UID `1000`, and ffprobe/media contract                                                                                                                                                                                                                                                                                                |
| `js-yaml` workflow structural parse                                                                                                                                                                                                                     | PASS — 40 steps, exit `0`                                                                                                                                                                                                                                                                                                                                                                            |
| matrix validator                                                                                                                                                                                                                                        | PASS — 74 unique gates, 38 risks, only PRD1-G04 differs, and G05–G07 remain `NOT_STARTED`                                                                                                                                                                                                                                                                                                            |
| final `git diff --check`, exact five-path correction scope, unchanged 50-path PR scope, changed-content secret scan, and disposable cleanup                                                                                                             | PASS                                                                                                                                                                                                                                                                                                                                                                                                 |

### Preliminary failures retained

No failed or interrupted attempt is relabeled as a pass:

- The host BullmqService Jest command found no usable host Jest binary and
  executed zero tests. The first operational-probe container used stale
  generated Prisma artifacts and also executed zero tests. Both were rerun in
  the final media-test image after isolated Prisma generation.
- The first BullmqService container run exposed four fake-timer assertions
  whose rejection expectations were attached too late; the fixtures were
  corrected before the 30-test final-tree pass. The first real-Redis bound
  asserted an unnecessarily high 550 ms lower limit and observed the valid
  400 ms client command timeout at 407 ms; the contract assertion was corrected
  to require bounded settlement below 750 ms, then passed on the final tree.
- A short wrapper discarded the first full-unit container's final summary, so
  it was not accepted. The named rerun passed 543 suites and 3,922 tests.
- The first exact security harness crossed its 15-minute wrapper after fixed
  five-second setup hooks slowed through a host-gateway dependency path. The
  first fresh direct-network run completed 88 of 89 suites but the final large
  discovery setup hook exceeded five seconds and Jest retained teardown
  handles. Neither attempt is accepted. The unchanged exact command was rerun
  with Jest's failure cache prioritizing that suite; all 89 suites and 1,154
  tests passed with unchanged source and timeouts.
- Two workflow-script extraction attempts failed before lifecycle execution,
  first from native quoting and then from an incomplete host dependency
  resolution path. The workflow's parsed literal script was subsequently run
  unchanged against the final production image and passed.

- GitHub Actions run `30497819229` used `docker stop/start` for the
  disposable Redis outage. Stopping the container removed its Docker DNS
  endpoint and produced repeated `ENOTFOUND` failures inside BullMQ, combining
  dependency unavailability with service-discovery/topology churn. That
  behavior belongs to Phase 3 Redis topology/failover validation, not the G04
  stable-endpoint readiness contract. The canonical G04 proof now pauses and
  resumes the same Redis container and process, preserving the configured DNS
  endpoint while proving `200` → `503` → `200` recovery.

- GitHub Actions run `30481344419`, job `90675924537`, passed runtime policy,
  Docker build, Node/Firebase imports, media-test build, graceful-shutdown
  contracts, and ffprobe verification before the application-startup step
  ended with `Readiness did not recover after Redis recovery.` Source tracing
  and the deterministic hanging-`QUIT` fixture confirmed the retired-client
  close ownership defect; the final same-process Docker stop/start proof now
  passes.
- The first combined final lifecycle run used a media-test image with stale
  generated Prisma artifacts; the isolated rerun generated Prisma Client
  before Jest and passed. The first full-unit run then omitted repository
  contract mounts and failed only missing-file assertions; the corrected
  read-only-mounted run passed all suites.
- Initial migration-governance containers either lacked Git or observed
  Windows CRLF-normalized files without the owner checkout's Git normalization
  policy. The accepted read-only rerun supplied ephemeral
  `core.autocrlf=true`, changed no Git configuration, and passed.
- A combined PowerShell Docker lifecycle command was rejected before
  execution, and two log/timeout wrappers treated expected container stderr as
  native-command failures. The same bounded assertions were rerun as separate
  commands and passed; the containers themselves had the expected exit codes.
- A final self-review unit assertion initially inspected the wrong positional
  Redis script argument, then exposed an extra recovery-side call in its first
  fixture shape. The test was corrected to create inverse timestamp/insertion
  ordering before recovery and now proves the production oldest-to-newest
  replay behavior.
- The first R5 exact security run omitted repository contract mounts and later
  exceeded its wrapper; the second likewise encountered slow-environment
  hook timeouts. A third isolated run progressed through security suites but
  Docker killed it with exit `137` when a canonical build was mistakenly run
  concurrently. None of those invocations is accepted as a pass. The final
  exact run uses fresh exclusive disposable services, the required read-only
  contract mounts, in-container Prisma generation, a bounded 4 GiB Node heap,
  and no concurrent Docker workload.
- The first fresh R5 seed attempt used the media-test image's stale generated
  Prisma Client and failed type compilation before seeding. The corrected
  isolated invocation generated Prisma Client in its ephemeral container,
  then seeded the fresh seven-migration database successfully.
- Three host `npm ci` variants exceeded their 10/15-minute bounds while
  extracting/linking dependencies. A partial tree could not load
  `rxjs/operators`, and an incremental attempt exposed an unavailable
  registry target for the lockfile's `ioredis` version. None is a pass. Final
  tests use the existing canonical media-test image's exact locked dependency
  layer with current source mounted read-only and isolated in-container Prisma
  generation.
- The first R6 full-unit container omitted repository contract mounts. It
  passed 540 suites but failed three contract suites because `.github`,
  `scripts`, `Dockerfile`, and `ERROR_CATALOG.md` were absent. The corrected
  command mounted those inputs read-only and passed all 543 suites / 3,897
  tests without changing or skipping an assertion.
- The first R6 exact-security container started without a complete isolated
  database setup and was terminated after missing-table and missing-document
  failures. A second applied migrations but omitted the canonical seed roles;
  a third applied migrations and the seed but omitted `docs/**` and
  `ERROR_CATALOG.md` from the media-test container. None is accepted as a pass.
  The final exact run used fresh disposable services, generated Prisma Client,
  applied all seven migrations, ran the canonical synthetic seed, mounted the
  governance contracts read-only, and passed all 89 suites / 1,154 tests.
- The first PowerShell wrapper around the R6 forced-timeout fixture treated
  the expected stderr lifecycle event as a native-command failure even though
  the fixture itself exited `1` correctly. The wrapper was corrected without
  changing the fixture; the clean rerun passed the wall-time, event-time,
  exit-code, and no-completion assertions.
- The first combined R5 Redis/PostgreSQL integration command omitted
  `TEST_REDIS_URL`; two suites passed but both realtime suites were skipped.
  The partial command is not accepted. The realtime suites and the
  BullMQ/Prisma suites were rerun as separate exact commands with zero skips.
- The first ad-hoc canonical internal-response audit expected the wrong safe
  status labels for `404` and `405`, and a direct `node -e` native-argument
  invocation lost its script at the PowerShell boundary. The stdin-fed audit
  was corrected to the implemented `not_found` and `method_not_allowed`
  contract and passed all nine healthy and two error cases.
- The host YAML parser module was unavailable, and the first in-image
  structural check used the pre-R5 step count. The installed `js-yaml` parser
  then validated the complete 40-step workflow.
- The first final R5 image and media-test builds exceeded the 60-second shell
  wrapper while Docker BuildKit continued. Both build processes completed and
  produced new local image IDs; the resulting images, rather than the timed
  wrapper invocations, were subjected to the final runtime and test evidence.
- The first R4 focused run exposed test doubles that did not model the locked
  BullMQ worker `name`, `emit`, and run-settlement behavior. Corrected
  fixtures then passed the focused worker and probe suites.
- The first R4 real-Redis command used a Jest API (`it.skipIf`) unavailable in
  the locked version. The compatible conditional form was applied. A combined
  rerun then exposed a type-only socket import and an unsafe Redis-adapter
  broadcast disconnect after the old connection failed. Both defects were
  corrected before isolated and combined real-Redis passes.
- The first R4 full-unit image invocation omitted repository contract mounts
  and failed three file-contract suites. A mounted invocation executed all
  542 suites and 3,869 assertions successfully but its PowerShell output
  pipeline returned non-zero; that invocation was not accepted as a pass.
- A direct full-unit diagnostic without an in-container Prisma generation
  failed before assertions because the image's generated client was absent in
  that ephemeral layer. The final accepted rerun generated Prisma Client in
  the same container.
- The first R4 security invocation likewise omitted in-container Prisma
  generation and executed zero tests. The next run reached the suite but used
  an unseeded fresh database and exhausted the default heap. After synthetic
  seeding and the bounded test heap, one contract test still lacked the
  read-only `docs` mount and one realtime teardown was invalidated because a
  concurrent canonical experiment intentionally stopped the same disposable
  Redis. Fresh isolated services and a docs-mounted, non-concurrent rerun were
  required for acceptance.
- The first canonical R4 readiness assertion correctly returned `503` because
  the disposable MinIO buckets had not yet been provisioned. After the
  synthetic buckets were created outside the application, all role probes
  passed. The application did not create a bucket from a probe.
- A combined PowerShell Redis-recovery command was rejected by command policy
  before execution; the start and bounded in-container recovery checks were
  rerun as separate commands.
- The first shutdown-result audit used PowerShell array matching incorrectly
  and reported a harness failure despite container exit `0` and all three
  lifecycle events. A joined-log audit confirmed the result.
- The first runtime-version smoke lost shell quotes before entering the
  container. Separate exact Node, Firebase, Prisma, UID, and media-runtime
  assertions were used instead.
- The first final Git-integrity wrapper compared Git's tab-delimited
  ahead/behind output to a space-delimited string and reported a false
  mismatch. The corrected whitespace-aware validator passed the unchanged
  branch, baseline, zero-stage, zero-commit, and then-current 46-path R4 state.
- A host `npm ci` invocation exceeded its 604-second wrapper and was stopped;
  host Jest was not used for acceptance.
- An initial focused run exposed two test-harness defects, which were fixed
  before the passing focused rerun.
- An initial build exposed a manifest-array type inference error, corrected
  before the passing image build.
- A preliminary PowerShell health poll timed out despite successful `curl` and
  in-container responses; the canonical assertions were rerun with deterministic
  clients.
- The first canonical readiness run exposed the Socket.IO namespace adapter
  defect described above.
- The first post-recovery SIGTERM run then exposed the Redis-adapter close
  ownership defect and exited `1`; the corrected sequence exited `0`.
- The first local timeout-fixture invocation lost JavaScript quotes in the
  PowerShell/native boundary and failed before exercising the coordinator; the
  stdin-fed rerun proved the actual deadline.
- The first isolated security wrapper used the wrong synthetic MinIO access
  key, completed 78 of 89 suites, failed 11 suites, and then exceeded its
  wrapper while failed suites retained handles. A focused rerun confirmed the
  credential mismatch. The corrected exact one-shot suite used the already
  verified disposable-container credentials and passed all 89 suites and
  1,154 tests.
- The first full-unit container invocation omitted repository contract mounts
  and failed 3 suites/4 tests on missing files. The read-only mounted rerun
  passed all 540 suites and 3,856 tests.
- Python/PyYAML and the first Node YAML parser were unavailable. Structural
  validation was rerun successfully with the installed `js-yaml` parser.
- The first R3 ad-hoc multiline HTTP-bound audit over-captured shell text and
  reported a false failure. The line-aware rerun passed all five `curl` and
  four `fetch` call sites.
- A first all-in-one local R3 experiment was rejected by command policy before
  execution; it created no resource and supplied no evidence. The experiment
  was rerun as short, auditable steps.
- The first local R3 timeout invocation omitted Docker interactive stdin, so
  `node -` received no fixture and exited `0` in 609 ms without exercising the
  coordinator. The corrected `--interactive` invocation produced the passing
  result above; the committed workflow uses `node -e` and was unaffected.

## Final publication reconciliation

The remote PR head at
`5e64005e0db750956036495a3b32c85239194b4e` contains 50 tracked paths
relative to `origin/main`. The current technical correction covers eight paths:
seven tracked modifications and one new, currently untracked half-open
integration test. F1-R1 adds one tracked documentation modification, so the
current working tree contains nine paths. After those paths are staged
explicitly, the final publication candidate will contain 51 tracked paths
relative to `origin/main`; this closeout document was already one of the remote
50 paths and therefore does not add a fifty-second candidate path.

The current correction is not BullMQ-only. It includes focused realtime gateway
local-disconnect ownership, adapter-replacement ordering, Redis adapter
recovery, fail-fast and single-flight operational readiness, real Redis adapter
recovery and half-open integration coverage, and workflow outage/recovery and
shutdown coverage. All local technical gates A through E passed. The first F1
implementation and workflow reviews also passed; `F1-MED-001` identified only
the stale documentation and inventory presented as the current publication
state.

Remote CI remains pending. F2 remains blocked until this F1-R1 correction and
manual owner verification pass. This document does not claim remote CI success,
remote closure of `PRD1-G04`, merge readiness, or completion of Stage F2.

- Remote PR head inventory: `50 tracked paths`.
- Local technical correction: `8 paths` (`7 tracked modifications` plus `1 untracked new integration test`).
- Focused F1 documentation correction: `1 tracked documentation path`.
- Current working tree after correction: `9 paths` (`8 tracked modifications` plus `1 untracked path`).
- Final publication candidate: `51 paths` relative to `origin/main`.
- Remote CI: `PENDING`.

The local technical correction inventory is:

<!-- BEGIN LOCAL TECHNICAL CORRECTION INVENTORY -->

1. `.github/workflows/learning-media-integrity.yml`
2. `src/infrastructure/realtime/realtime.gateway.ts`
3. `src/infrastructure/realtime/tests/realtime.gateway-redis-lifecycle.spec.ts`
4. `src/infrastructure/realtime/tests/realtime.gateway.spec.ts`
5. `src/modules/health/operational-probe.service.spec.ts`
6. `src/modules/health/operational-probe.service.ts`
7. `test/integration/realtime-adapter-recovery.integration.spec.ts`
8. `test/integration/realtime-adapter-half-open-readiness.integration.spec.ts`

<!-- END LOCAL TECHNICAL CORRECTION INVENTORY -->

The first seven paths are tracked modifications. The eighth path is the new,
currently untracked half-open integration test.

The complete final publication candidate, derived from the repository's 50
tracked candidate paths plus the new half-open integration test and sorted by
ordinal path ordering, is:

<!-- BEGIN FINAL CANDIDATE INVENTORY -->

1. `.env.example`
2. `.github/workflows/learning-media-integrity.yml`
3. `OBSERVABILITY.md`
4. `docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md`
5. `docs/production-readiness/phase-1/03-minimum-health-probes-closeout.md`
6. `src/bootstrap/application-startup.spec.ts`
7. `src/bootstrap/application-startup.ts`
8. `src/bootstrap/graceful-shutdown.process.spec.ts`
9. `src/bootstrap/graceful-shutdown.spec.ts`
10. `src/bootstrap/graceful-shutdown.ts`
11. `src/bootstrap/management-probe.integration.spec.ts`
12. `src/bootstrap/management-probe.process.spec.ts`
13. `src/bootstrap/management-probe.server.spec.ts`
14. `src/bootstrap/management-probe.server.ts`
15. `src/bootstrap/route-scoped-filter-lifecycle.integration.spec.ts`
16. `src/bootstrap/shutdown-http.integration.spec.ts`
17. `src/config/env.validation.spec.ts`
18. `src/config/env.validation.ts`
19. `src/infrastructure/queue/bullmq.service.spec.ts`
20. `src/infrastructure/queue/bullmq.service.ts`
21. `src/infrastructure/realtime/realtime-presence.service.ts`
22. `src/infrastructure/realtime/realtime-publisher.service.ts`
23. `src/infrastructure/realtime/realtime-state-store.service.ts`
24. `src/infrastructure/realtime/realtime.gateway.ts`
25. `src/infrastructure/realtime/realtime.module.ts`
26. `src/infrastructure/realtime/tests/realtime-presence.service.spec.ts`
27. `src/infrastructure/realtime/tests/realtime-publisher.service.spec.ts`
28. `src/infrastructure/realtime/tests/realtime-state-store.service.spec.ts`
29. `src/infrastructure/realtime/tests/realtime.gateway-redis-lifecycle.spec.ts`
30. `src/infrastructure/realtime/tests/realtime.gateway.spec.ts`
31. `src/main.ts`
32. `src/modules/files/uploads/application/media-runtime-startup.guard.ts`
33. `src/modules/files/uploads/uploads.module.ts`
34. `src/modules/health/bounded-probe-executor.spec.ts`
35. `src/modules/health/bounded-probe-executor.ts`
36. `src/modules/health/health.controller.spec.ts`
37. `src/modules/health/health.controller.ts`
38. `src/modules/health/health.module.ts`
39. `src/modules/health/health.service.spec.ts`
40. `src/modules/health/health.service.ts`
41. `src/modules/health/operational-probe.manifests.spec.ts`
42. `src/modules/health/operational-probe.manifests.ts`
43. `src/modules/health/operational-probe.service.spec.ts`
44. `src/modules/health/operational-probe.service.ts`
45. `src/modules/health/temporary-disk.probe.ts`
46. `src/modules/settings/branding/tests/public-school-branding-lifecycle.integration.spec.ts`
47. `test/integration/bullmq-shutdown-lifecycle.integration.spec.ts`
48. `test/integration/prisma-shutdown-lifecycle.integration.spec.ts`
49. `test/integration/realtime-adapter-half-open-readiness.integration.spec.ts`
50. `test/integration/realtime-adapter-recovery.integration.spec.ts`
51. `test/integration/realtime-state-store-readiness.integration.spec.ts`

<!-- END FINAL CANDIDATE INVENTORY -->

## Compatibility, rollback, and limitations

Public root, CORS, Swagger, request correlation, public health path, Phase 1B
admission/drain behavior, queue contracts, storage contracts, product routes,
and Learning Media completion are unchanged.

Rollback restores the prior health files, removes the management server,
removes `APP_PROBE_PORT`, removes the role manifests and bounded executor,
restores the prior shutdown dependency shape, reverts the focused realtime
adapter/state-store recovery, fallback reconciliation, presence refresh, and
teardown compatibility changes, reverts the current local-only Socket.IO
disconnect ownership, adapter-replacement ordering, Redis adapter recovery, and
fail-fast/single-flight readiness correction, removes the new half-open
integration test, restores the prior BullMQ registration-only helper, restores
the previous bootstrap ordering, and removes the related workflow assertions
and closeout row. No schema, migration, seed, data, dependency, lockfile, queue
payload, storage object, or cloud rollback is required.

Limitations:

- no live Cloud Run deployment or port protection configuration was performed;
- Phase 8 deployment/IaC must configure `APP_PORT` as the sole Cloud Run
  service ingress port and explicitly configure container probes to use
  `APP_PROBE_PORT`;
- the current process still runs the single `AppModule` graph, so Core/Media
  manifests are contract definitions rather than separate runtime claims; and
- realtime state operations retain process-local fallback for compatibility,
  but API readiness fails closed while that fallback is active;
- Socket.IO adapter replacement intentionally disconnects clients, so clients
  must reconnect, reauthenticate, and rejoin rooms; and
- Phase 3 still owns final production Redis topology, failover behavior,
  connection budgets, and capacity;
- full metrics, tracing, dashboards, SLOs, alerting, paging, retention, and
  rate limiting remain Phase 7; and
- Phase 8 still owns the actual Cloud Run/IaC configuration and live
  production-equivalent validation of the sole-ingress/internal-probe port
  model.

## Safety attestation

- `.env` and real secret values were not read.
- Only synthetic credentials and uniquely named disposable local containers,
  tmpfs databases, and networks were used.
- All disposable resources were removed after validation.
- No schema, migration, seed, package, lockfile, queue payload, storage
  contract, Learning Media contract, Reinforcement behavior, or cloud
  configuration changed.
- No shared database, shared Redis, shared storage, persistent volume,
  staging, production, or cloud resource was touched.
- No branch, staging, commit, push, tag, pull request, merge, deployment, or
  provisioning action occurred.
