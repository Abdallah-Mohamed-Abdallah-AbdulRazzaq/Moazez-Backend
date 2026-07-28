# Phase 1B — Graceful Shutdown and Bounded Termination Closeout

## Document control

| Field                              | Value                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Task ID                            | `PRODUCTION-READINESS-1B-R3`                                                                                             |
| Repository                         | `Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend`                                                                   |
| Branch                             | `feat/production-readiness-1b-shutdown-lifecycle`                                                                        |
| Starting baseline / unchanged HEAD | `107545829bf24146110579b8293f23f80cee91ea`                                                                               |
| Date                               | 2026-07-28                                                                                                               |
| Timezone                           | Africa/Cairo                                                                                                             |
| Scope                              | Graceful application shutdown, bounded termination, intake stop, active-work drain, resource cleanup, and recoverability |
| Gate                               | `PRD1-G02`                                                                                                               |
| Status                             | `PHASE_1B_R3_CORRECTIONS_READY_FOR_FINAL_ARCHITECTURE_REVIEW`                                                            |

This package implements PRD1-G02 only. It does not implement readiness,
liveness, startup probes, runtime-role separation, or any product workflow
change. PRD1-G04 through PRD1-G07 remain `NOT_STARTED`; Phase 1 remains
incomplete.

## Authority

| Authority                      | Constraint applied                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| ADR-0004 / PRD0-D004–PRD0-D007 | the current modular monolith must shut down safely without introducing Phase 2 composition roots |
| ADR-0010 / PRD0-D024           | role-specific health semantics remain future work; this task adds no probe or route              |
| `PRD1-G02`                     | stop intake and prove bounded Nest lifecycle, drain, cleanup, and recovery                       |
| RSK-003                        | prevent request loss, duplicate work, and abandoned work during termination                      |

Accepted architecture constrains this implementation. It does not prove that
Phase 2 role separation, Cloud Run rollout, or later production controls exist.

## Initial lifecycle inventory

| Resource                                    | Owner / creation point                                          | Baseline close mechanism                                                        | Baseline idempotence / active-work behavior                                      | Phase 1B treatment and proof                                                                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node HTTP server                            | `src/main.ts`; Nest Express adapter                             | no application signal coordinator                                               | no stopped-intake or bounded-drain proof                                         | `server.close()` starts immediately; CORS-aware drain middleware rejects all post-drain adapter traffic, while the first global Nest guard admits controller work before authentication and a global interceptor/filter settle its neutral lease exactly once |
| Swagger raw Express routes                  | `SwaggerModule.setup` in `src/bootstrap/swagger.ts`             | Express-owned UI, JSON, and static-asset handlers outside the Nest interceptor   | the R1 middleware-created lease had no Nest interceptor owner for successful raw routes | middleware now performs drain rejection only; raw routes acquire no Nest lease, complete with active work at zero, and are blocked after drain |
| Route-scoped multipart filters              | Branding logo upload and generic Files upload methods           | method-scoped catch-all filters precede the global filter                        | a guard/pipe failure after admission but before interceptor entry could be rethrown without settling the lease | both filters release through the neutral request contract before preserving their existing handled or rethrow behavior; real decorated-route tests prove exact-once settlement |
| Public branding response stream             | `PublicSchoolBrandingController.getLogo`                        | manual `@Res()` and source stream piping                                         | the controller promise could settle before destination completion; abort propagation to the storage iterator was incomplete | awaited stream pipeline keeps the Nest lease through destination settlement; abort destroys the source and returns the iterator; fixed redacted stream-failure logging and the public response contract remain unchanged |
| Socket.IO namespace                         | `RealtimeGateway.afterInit`                                     | framework close plus gateway Redis hook                                         | no drain state; commands could start during teardown                             | shared lifecycle state rejects handshakes, connections, and commands; admitted commands finish before sockets disconnect                                                                      |
| Realtime Redis adapter publisher/subscriber | `RealtimeGateway.configureRedisAdapter`                         | gateway `OnModuleDestroy` calls quit/disconnect                                 | close operation was not single-flight                                            | gateway destroy and socket-disconnect operations are cached; production-image shutdown proves no surviving process/reconnect loop                                                             |
| Realtime state Redis                        | `RealtimeStateStoreService.connectRedisClient`                  | `OnModuleDestroy` calls quit/disconnect                                         | close operation was not single-flight; retry strategy already disabled           | destruction is cached and remains owned by the state store                                                                                                                                    |
| Realtime presence refresh                   | `RealtimePresenceService` constructor                           | unref 30-second interval cleared on destroy                                     | timer cleanup existed; active socket presence cleanup was not coordinated        | sockets disconnect after command drain; presence cleanup promises are awaited; Nest clears the interval                                                                                       |
| Prisma Client                               | `PrismaService`                                                 | `$disconnect()` in `OnModuleDestroy`                                            | no single-flight guard                                                           | disconnect is cached; real PostgreSQL proof completes an admitted query before exactly one disconnect                                                                                         |
| BullMQ shared Redis connection              | `BullmqService` constructor                                     | centralized quit/disconnect in cached shutdown                                  | final close was idempotent, but worker intake was not independently stoppable    | worker close/drain begins at shutdown start while queues/shared Redis remain available to admitted producers; final Nest close owns queue/shared connection cleanup                           |
| BullMQ queues and blocking connections      | `BullmqService.getQueue` / `createWorker`                       | worker close, queue close, connection settlement, late stalled-timer protection | centralized close awaited active jobs and suppressed only recognized close noise | existing authoritative cleanup is retained; new early worker-drain phase is single-flight                                                                                                     |
| Communication generation worker             | `communication-notification-generation.worker.ts`               | central BullMQ service                                                          | active processor awaited only when module destroy began                          | covered by central early worker-drain contract                                                                                                                                                |
| Communication push worker                   | `communication-notification-push.worker.ts`                     | central BullMQ service                                                          | same                                                                             | covered by central early worker-drain contract                                                                                                                                                |
| School email worker                         | `school-email-delivery.worker.ts`                               | central BullMQ service                                                          | same                                                                             | covered without changing queue/job IDs, retries, or processor behavior                                                                                                                        |
| Import validation worker                    | `import-validation.worker.ts`                                   | central BullMQ service                                                          | same                                                                             | covered without changing import behavior                                                                                                                                                      |
| Dismissal expiry worker                     | `dismissal-request-expiry.worker.ts`                            | central BullMQ service                                                          | same; repeat metadata is Redis-persisted                                         | worker intake stops; unstarted work remains in Redis                                                                                                                                          |
| Branding cleanup worker                     | `branding-logo-cleanup.worker.ts`                               | central BullMQ service                                                          | same; repeat metadata is Redis-persisted                                         | lifecycle only; no cleanup policy or destructive behavior changes                                                                                                                             |
| Learning Media cleanup worker               | `learning-media-cleanup.service.ts`                             | central BullMQ service                                                          | same; repeat metadata is Redis-persisted                                         | lifecycle only; synchronous Learning Media completion remains unchanged                                                                                                                       |
| MinIO client                                | `MinioAdapter`                                                  | no application-level close API exposed by the current client use                | no local scheduler; operation sockets are request/worker scoped                  | admitted HTTP/WebSocket/worker work is awaited; no storage behavior changed                                                                                                                   |
| Firebase Admin                              | `FirebaseAdminService` lazy initialization                      | no local recurring timer observed in disabled/dry-run mode                      | provider calls are worker-scoped                                                 | active worker drain covers calls; package and provider behavior are unchanged                                                                                                                 |
| Nodemailer transport                        | `NodemailerEmailTransport.sendEmail`                            | per-send, non-pooled transport                                                  | not a shared application resource                                                | the owning BullMQ job is awaited; email behavior is unchanged                                                                                                                                 |
| ffprobe/media verification                  | request-scoped child process and bounded verifier               | per-operation timeout and process settlement                                    | no persistent loop                                                               | admitted work is awaited; media behavior and contract are unchanged                                                                                                                           |
| Other bounded timers                        | realtime connect timeouts, health timeout, branding URL timeout | cleared in existing `finally` paths or request scoped                           | no application scheduler ownership                                               | no change; originating admitted work is bounded by the global shutdown deadline                                                                                                               |

The three repeat registrations are persisted BullMQ schedules, not independent
in-process interval owners. The only recurring local timer found is the
unref'ed realtime presence refresh interval.

## Shutdown architecture and exact order

1. Exactly one listener is installed for each of `SIGTERM` and `SIGINT` after
   the application has started listening.
2. The first supported signal starts one coordinator operation and records the
   configured bound.
3. The shared lifecycle state enters draining. One immediately constructed
   `Promise.all()` graph observes Node HTTP-listener closure, BullMQ worker
   close/drain, and admitted-work drain in the same synchronous turn. An
   immediate rejection from either parallel intake operation therefore
   reaches the coordinator even while an HTTP or WebSocket lease remains
   active; no potentially rejected promise is stored for later observation.
4. The existing shared CORS middleware runs before shutdown admission.
   HTTP drain middleware then rejects all adapter routes with a minimal `503`,
   `Connection: close`, and canonical `x-request-id`. The first global Nest
   guard alone admits controller requests before authentication and other
   resource-using guards. Node 22 also stops accepting new TCP connections and
   closes idle keep-alive connections.
5. Socket.IO rejects new handshakes/connections and all new commands through
   the same lifecycle state.
6. The guard attaches a request-local lease through
   `common/lifecycle/http-request-lifecycle.ts`. Admitted HTTP work remains
   counted until the Nest interceptor Observable finalizes on success or
   failure. The global exception filter uses the same neutral contract to
   release pre-interceptor failures such as rejected guards. The two
   method-scoped catch-all multipart filters have route precedence, so each now
   obtains the Express request and invokes that same idempotent neutral release
   before either producing its stable `413` envelope or rethrowing an
   unrecognized exception. Transport `finish` and `close` events do not
   release application work. Swagger's raw Express UI, JSON, and asset routes
   do not acquire a Nest lease. Admitted WebSocket commands are also awaited.
   Prisma, queue producer, storage, and realtime resources remain available
   during this interval.
7. Existing sockets are disconnected, and their bounded presence cleanup is
   awaited.
8. The coordinator awaits the already-observed HTTP close, worker drain, and
   application-idle graph. Any early operation failure takes the sanitized
   non-zero failure path immediately; otherwise queued but unstarted jobs
   remain persisted.
9. `app.close()` runs once. Nest remains the authoritative owner of module
   destruction: BullMQ queues/shared Redis, realtime Redis clients and timer,
   and Prisma disconnect through their existing providers.
10. A clean sequence emits `lifecycle.shutdown.completed`, removes both signal
    listeners, leaves exit status `0`, and permits natural process exit.

No new health/readiness route or dependency semantic was introduced.

## Signal, timeout, and exit contract

| Condition                              | Result                                              |
| -------------------------------------- | --------------------------------------------------- |
| first `SIGTERM`                        | one graceful sequence; clean result exits `0`       |
| first `SIGINT`                         | one graceful sequence; clean result exits `0`       |
| coordinator installed repeatedly       | no duplicate listeners                              |
| signal after a completed shutdown      | no second sequence                                  |
| second supported signal while draining | sanitized `force_exit` event and immediate exit `1` |
| lifecycle failure                      | sanitized `failed` event and exit `1`               |
| `APP_SHUTDOWN_TIMEOUT_MS` expires      | sanitized `timed_out` event and exit `1`            |

`APP_SHUTDOWN_TIMEOUT_MS` defaults to `15000`, accepts integer milliseconds
from `1000` through `60000`, and rejects malformed, fractional, zero, negative,
below-minimum, and above-maximum values.

The coordinator's one deadline timer remains referenced until graceful
completion, lifecycle failure, or expiry. Successful and failed settlement
clear it; failure and timeout clear it before invoking the non-zero exit path.
No interval, socket, server, child process, or auxiliary keepalive is needed to
enforce the hard deadline.

Node 22 child-process tests keep an HTTP lease active while either worker drain
or HTTP close rejects immediately. Both variants emit one bounded
`lifecycle.shutdown.failed` event, invoke exit `1`, emit no `completed` event,
and record zero `unhandledRejection` and zero `uncaughtException` events. The
injected raw error contains a credential-shaped value; neither that value, its
message, nor its stack appears in output.

Lifecycle events contain only fixed event/stage/resource values, supported
signal names, elapsed/configured milliseconds, and bounded counts. Raw error
objects, messages, stacks, headers, bodies, credentials, connection strings,
tokens, job payloads, file contents, and actor/student identifiers are not
serialized. The Phase 1A bootstrap-failure event is unchanged.

## HTTP and WebSocket evidence

- The real Nest HTTP fixture proves a slow admitted request completes, the
  listener reports non-listening immediately after drain begins, new network
  intake fails, Nest destroy waits for the admitted response, and the clean
  path exits `0`.
- A real client-abort fixture destroys the response transport while controlled
  controller work continues. Shutdown, `app.close()`, and the test Prisma
  resource remain blocked until that work settles; the lease then releases
  exactly once and shutdown exits `0`.
- Its bounded never-settling variant retains the lease after client abort,
  reaches the real hard deadline, emits only `timed_out`, exits non-zero, and
  does not report Nest or Prisma cleanup before timeout.
- A real Node keep-alive agent proves the post-drain request uses the exact
  pre-drain socket, receives the minimal `503`, and does not increment the
  business-handler side effect count.
- Allowed shutdown requests retain the shared Phase 1A origin and credential
  CORS headers. Disallowed origins receive no authorization header. Both retain
  canonical request IDs, the minimal `503`, and zero business-handler entry.
- Unit coverage proves transport `close` and `finish` alone do not release a
  lease; interceptor success, Observable failure, synchronous failure, and
  exception-filter paths release exactly once.
- With Swagger explicitly enabled in the test environment, the UI,
  `/api/v1/docs-json`, and `/api/v1/docs/swagger-ui.css` all complete with
  `activeWork` returning to zero. A following signal completes normally, and
  post-drain Swagger traffic cannot enter. Controller success, guard failure,
  404, and normal CORS behavior use their correct independent ownership paths.
- The production raw-route inventory found only `SwaggerModule.setup(...)` and
  the public branding controller's manual `@Res()` stream. No other production
  `@Res()`, `StreamableFile`, `pipe(response)`, SSE, or event-stream route was
  found.
- The exception-filter inventory found exactly three implementations:
  `GlobalExceptionFilter` plus method-scoped
  `BrandingLogoMultipartExceptionFilter` and
  `FilesUploadMulterExceptionFilter`. The only `@UseFilters(...)` bindings are
  those two multipart methods; no controller-scoped or additional
  route-scoped filter exists.
- Real Nest tests use the actual decorated
  `POST /api/v1/settings/branding/logo` and `POST /api/v1/files` routes. The
  lifecycle guard admits exactly once, a downstream authentication guard
  rejects before the completion interceptor enters, the method filter settles
  exactly once, active work returns to zero, and a following `SIGTERM`
  completes with exit code `0`.
- Actual Multer over-limit requests preserve the existing Branding
  `settings.branding.logo.size_exceeded` and Files
  `files.upload.size_exceeded` `413` status, message, details, and canonical
  trace ID. Unrecognized route failures preserve the existing
  `500 internal_error` behavior. Handler failures where the interceptor has
  already finalized also produce only one lease release, proving the neutral
  operation remains idempotent.
- The branding controller now awaits `node:stream/promises` `pipeline()`.
  Successful delivery releases its Nest lease only after source and response
  settlement. A real slow-stream fixture proves shutdown waits. A real client
  abort destroys the source, returns/cancels its async iterator, releases the
  lease after controller settlement, and leaves no detected handle.
  Source/storage failures retain only
  `branding.logo.public.stream_failed` /
  `branding.logo.public.storage_unavailable`; raw errors, object coordinates,
  URLs, and credentials are not logged, and a partially written response is
  not passed into the JSON exception envelope. Status, MIME, length, cache, and
  `nosniff` contracts remain unchanged.
- Socket.IO namespace middleware rejects post-drain handshakes.
- `handleConnection` rejects a connection if draining won the admission race.
- Every subscribed command uses the shared admission lease. Tests prove a
  post-drain command is rejected while an already-admitted command completes.
- Socket disconnection is single-flight and waits for presence cleanup.
- Namespace, event names, rooms, authentication, tenancy, permissions, and
  correlation-ID behavior are unchanged.

## BullMQ, Prisma, and Redis evidence

- Unit tests prove worker intake/drain starts once before queue/shared Redis
  teardown and that final provider destruction reuses the same worker drain.
- A real disposable Redis test proves an active job completes exactly once
  inside the grace period, the next queued job remains waiting, and a
  replacement worker processes it after restart.
- A forced child-worker termination with test-only one-second lock and
  half-second stalled checks proves the abandoned job is reclaimed and
  completed by a replacement worker.
- Existing BullMQ tests continue to prove worker, queue, blocking connection,
  shared connection, stream settlement, late stalled-timer cleanup, expected
  close-noise suppression, and observability of genuine failures.
- A real disposable PostgreSQL test proves an admitted `pg_sleep` query
  completes before one cached `$disconnect()` call and that a new query request
  is not admitted.
- Realtime publisher/subscriber and state-store clients retain no retry loop
  (`retryStrategy: () => null`) and close through cached provider hooks after
  socket/presence drain.

The stalled-job timings exist only in the integration test. Production queue
names, job names, IDs, retry/deduplication settings, stalled settings, and
processor behavior did not change.

## CI and production-image evidence

`Learning Media Integrity` remains the canonical runtime-image workflow. It now:

- passes explicit `APP_SHUTDOWN_TIMEOUT_MS=15000`;
- keeps the existing production `NODE_ENV`, approved production application
  origins, disabled Swagger, and all existing synthetic runtime inputs;
- health-checks the canonical image;
- sends real `SIGTERM`;
- waits until `lifecycle.shutdown.intake_stopped` is visible before attempting
  a post-signal health request and fails on any post-stop `2xx`;
- requires exit code `0` within 20 seconds;
- requires started, intake-stopped, and completed lifecycle events;
- retains logs for early exit and timeout;
- runs a canonical-image never-resolving `app.close()` fixture with an
  immediately closed HTTP fixture and resolved queue/realtime fixtures; the
  coordinator deadline is its only referenced handle;
- requires exact exit code `1`, internal deadline elapsed time from 1,000 to
  1,500 ms, bounded container elapsed time, `timed_out`, and no `completed`;
- generates Prisma Client inside the canonical Node 22 `media-test` image and
  runs the eleven lifecycle/state, coordinator/process, HTTP/raw-route,
  global/local exception-filter, multipart-route, and branding suites with
  `--detectOpenHandles`;
- runs the real Redis BullMQ drain/recovery and PostgreSQL ordering tests; and
- retains all existing Node, Firebase, Prisma, non-root, ffprobe, media,
  migration, storage, playback, tenancy, and cleanup assertions.

The workflow's final unconditional cleanup remains responsible for the runtime
and MinIO containers. No duplicate production-image build was added.

## Validation evidence

| Command / evidence                                                    | Outcome                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| hard Git preflight                                                    | PASS — exact branch/baseline/origin, zero staged paths/commits, exact 34-path R2 input package    |
| runtime policy validator and drift tests                              | PASS — 10 tests                                                                                  |
| two filter units plus real decorated-route precedence                 | PASS — 3 suites, 17 tests with open-handle detection                                             |
| retained lifecycle/HTTP/Swagger/branding/filter regression            | PASS — 14 suites, 113 tests with open-handle detection                                           |
| canonical Node 22 R3 lifecycle/open-handle group                       | PASS — 11 suites, 77 tests; Prisma Client generated inside the disposable image                  |
| direct Nest build and exact canonical-image `npm run build`           | PASS                                                                                             |
| full unit suite with repository contract inputs                       | PASS — 533 suites, 3,803 tests                                                                   |
| real disposable Redis BullMQ drain/recovery                           | PASS — 2 tests with open-handle detection                                                        |
| real disposable PostgreSQL query/disconnect ordering                  | PASS — 1 test with the production completion interceptor and open-handle detection               |
| fresh disposable PostgreSQL migration replay                          | PASS — all 7 committed migrations                                                                |
| migration governance / Prisma validation                              | PASS — immutable baseline and 7 active migrations; schema valid                                  |
| exact security suite (`npm run test:security`)                        | PASS — 89 suites, 1,154 tests                                                                    |
| real-`AppModule` root E2E                                             | PASS — 1 suite, 2 tests; `/api/v1` exact identity and `/` non-identity                           |
| canonical final-image build / runtime smokes                          | PASS — Node `22.23.1`, Firebase, Prisma, non-root UID 1000, ffprobe/media contract               |
| production final-image `SIGTERM`                                      | PASS — healthy first; waited for intake event; post-stop connection failed; exit `0` in 518 ms   |
| no-extra-handle canonical-image forced-timeout fixture                | PASS — exit `1`; internal elapsed 1,006 ms; container elapsed 1,741 ms; no `completed`           |
| workflow YAML structural validation                                   | PASS — parsed through `js-yaml`; R3 tests, shutdown proofs, logs, and cleanup present             |
| `git diff --check` / scope / changed-file secret scan                 | PASS — informational line-ending warnings; 39 authorized paths; no secret match                  |

The first combined Redis/PostgreSQL test invocation correctly reported the
PostgreSQL test as failed because the `media-test` dev-dependency overlay had
not regenerated Prisma Client. BullMQ passed in that invocation. The isolated
rerun generated Prisma Client inside the disposable container and passed; CI
already generates Prisma Client before running these tests. No failed or
partial invocation is relabeled as a pass.

During R1 validation, the first combined real Redis/PostgreSQL invocation
passed BullMQ but correctly left Prisma undisconnected because the isolated
Prisma fixture had not registered the newly required completion interceptor.
The fixture alone was corrected; its isolated rerun and the final exact
combined rerun passed. Preliminary final-image scripts also had Windows
redirection/quoting or reporting-only failures, and preliminary timeout
wall-clock checks included slow Docker removal/startup overhead. They are not
passes. The final detached no-extra-handle proof measures both the coordinator
event and bounded container execution and passed.

The first exact security invocation reported two failed contract suites because
the disposable image invocation omitted their read-only documentation inputs;
all executed test assertions otherwise passed. The final exact
`npm run test:security` invocation mounted `docs` and `ERROR_CATALOG.md`
read-only and passed all 89 suites and 1,154 tests. The root E2E had two
non-passing setup attempts (a non-root Prisma generation permission error,
then a stale generated-client import); the final isolated invocation generated
Prisma Client as the disposable test container's root user and passed the exact
real-`AppModule` command. These setup attempts are not represented as passes.

R2 preliminary outcomes remain explicit. Three host `npm ci` attempts stalled
inside Windows reification and were terminated; they are `NOT_RUN_TO_COMPLETION`,
not passes. The canonical Linux dependency stages nevertheless completed exact
`npm ci` and `npm ci --omit=dev`. The first disposable security run lacked
MinIO, and an earlier seed run lacked a generated Prisma overlay; neither is a
pass. After provisioning only isolated tmpfs PostgreSQL, Redis, and MinIO and
generating the disposable client, the exact security command passed. The first
canonical Node 22 R2 group also exposed its missing Prisma generation (7 of 8
suites passed); the workflow was corrected to generate the client and the
exact rerun passed all 8 suites and 60 tests.

A final branding-only rerun exposed a five-second fixture timeout caused by the
completed client socket remaining open and a cascading expected `ECONNRESET`
in the next abort test. The fixture now explicitly closes that exact socket
after it has asserted full body completion. The isolated abort case, the full
two-suite branding rerun (31 tests), and the production build passed. This
changes test transport cleanup only; the production stream lifecycle remains
the already-accepted awaited pipeline.

The first final YAML assertion script looked for a different but equivalent
Bash numeric comparison and failed its own string check; YAML parsing had
succeeded. The corrected structural validator checks the actual `2xx` regular
expression and passed all 39 workflow steps. That preliminary validator result
is not labeled a workflow pass.

R3 preliminary outcomes are also retained. Exact host `npm run build` could not
find the `nest` shim left absent by the previously interrupted Windows install;
the direct installed Nest CLI and the clean canonical Docker build both
passed, and the Docker build executed the exact npm script. The first
Redis/PostgreSQL lifecycle command used the unit Jest root and reported no
tests; the corrected E2E-config rerun passed both suites and three tests. A
combined runtime-smoke wrapper had only a Windows quoting failure in its final
non-root/media clause; the preceding Node/Firebase/Prisma assertions and the
isolated non-root/media rerun passed. The first forced-timeout reporting
wrapper treated Docker's expected stderr lifecycle event as a PowerShell
error, and the next selected the earlier `started` elapsed field. The final
fixture selected the `timed_out` event explicitly and passed exact exit,
internal deadline, total elapsed, and no-completion assertions. None of these
preliminary wrapper outcomes is labeled a pass.

## Changed-file inventory

Exactly these lifecycle-adjacent paths comprise the package:

1. `.env.example`
2. `.github/workflows/learning-media-integrity.yml`
3. `docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md`
4. `docs/production-readiness/phase-1/02-shutdown-lifecycle-closeout.md`
5. `src/app.module.ts`
6. `src/bootstrap/application-lifecycle.module.ts`
7. `src/bootstrap/application-lifecycle.state.spec.ts`
8. `src/bootstrap/application-lifecycle.state.ts`
9. `src/bootstrap/graceful-shutdown.process.spec.ts`
10. `src/bootstrap/graceful-shutdown.spec.ts`
11. `src/bootstrap/graceful-shutdown.ts`
12. `src/bootstrap/http-application.ts`
13. `src/bootstrap/http-drain.middleware.spec.ts`
14. `src/bootstrap/http-drain.middleware.ts`
15. `src/bootstrap/route-scoped-filter-lifecycle.integration.spec.ts`
16. `src/bootstrap/shutdown-http.integration.spec.ts`
17. `src/common/exceptions/global-exception.filter.spec.ts`
18. `src/common/exceptions/global-exception.filter.ts`
19. `src/common/lifecycle/http-request-lifecycle.ts`
20. `src/config/env.validation.spec.ts`
21. `src/config/env.validation.ts`
22. `src/infrastructure/database/prisma.service.spec.ts`
23. `src/infrastructure/database/prisma.service.ts`
24. `src/infrastructure/queue/bullmq.service.spec.ts`
25. `src/infrastructure/queue/bullmq.service.ts`
26. `src/infrastructure/realtime/realtime-state-store.service.ts`
27. `src/infrastructure/realtime/realtime.gateway.ts`
28. `src/infrastructure/realtime/tests/realtime.gateway.spec.ts`
29. `src/main.ts`
30. `src/modules/files/uploads/filters/files-upload-multer-exception.filter.ts`
31. `src/modules/files/uploads/tests/files-upload-multer-exception.filter.spec.ts`
32. `src/modules/settings/branding/application/get-public-school-branding-logo.use-case.ts`
33. `src/modules/settings/branding/controller/branding.controller.ts`
34. `src/modules/settings/branding/controller/public-school-branding.controller.ts`
35. `src/modules/settings/branding/tests/branding-logo-multipart-exception.filter.spec.ts`
36. `src/modules/settings/branding/tests/public-school-branding-lifecycle.integration.spec.ts`
37. `src/modules/settings/branding/tests/public-school-branding-logo.spec.ts`
38. `test/integration/bullmq-shutdown-lifecycle.integration.spec.ts`
39. `test/integration/prisma-shutdown-lifecycle.integration.spec.ts`

## Compatibility, rollback, and limitations

Normal HTTP, WebSocket, queue, health, storage, media, email, import,
communication, branding, and reinforcement contracts are unchanged. The only
new runtime configuration has a backward-compatible default.

Rollback is a focused reversion of the 39-path package to baseline
`107545829bf24146110579b8293f23f80cee91ea`. Operational rollback must restore
the prior image, then reconcile BullMQ active/waiting jobs from persisted
truth. No schema or data rollback is required.

Residual boundaries:

- Phase 2 still owns separate API/Core/Media/Migration/Maintenance roots.
- PRD1-G04 still owns startup/liveness/readiness semantics.
- PRD1-G05, PRD1-G06, and the universal PRD1-G07 closeout remain open.
- Forced process exit can abandon active work by design; BullMQ recovery is
  proven, while non-queue external side effects still depend on their existing
  transaction/idempotency contracts.
- The host Node executable is `22.21.1`; supported-runtime and final behavior
  are therefore proven in the canonical Node `22.23.1` image.
- Host `npm ci` stalled during Windows package extraction. Both Docker
  dependency stages performed clean `npm ci` / `npm ci --omit=dev`, and the
  canonical build and test evidence use those clean Linux dependency trees.

## Safety attestation

No branch, stage, commit, push, tag, pull request, merge, deployment, or cloud
action occurred. No source behavior outside lifecycle adjacency changed. No
schema, migration, seed, product queue contract, storage contract, Learning
Media contract, Reinforcement contract, or health route changed.

Only uniquely named disposable PostgreSQL, Redis, and MinIO containers on
isolated Docker networks with tmpfs data and synthetic credentials were used.
They were removed after validation. No real secret value was printed, captured,
or added to the package; no shared service, persistent volume, staging
resource, or production resource was read or mutated.

One safety limitation prevents an absolute no-read attestation for the
workspace `.env`: a local `prisma generate` validation command loaded
`prisma.config.ts`, which explicitly imports `dotenv/config`. Prisma reported
that config-based environment loading was skipped and emitted no value, but
because the file exists, the subprocess may have read it. No value was
displayed or retained, and no further local Prisma/config command was run;
subsequent Prisma evidence ran inside Docker, where `.dockerignore` excludes
`.env` files.
