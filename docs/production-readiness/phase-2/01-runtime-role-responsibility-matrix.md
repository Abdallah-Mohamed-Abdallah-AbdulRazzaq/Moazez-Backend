# Production Readiness Phase 2 — Runtime Role Reality Inventory and Responsibility Matrix

Gate: `PRD2-G01`

Baseline: `f91cfe0a014289753dbb5a0fb78b5a940b78944c`

Branch: `docs/production-readiness-2a-runtime-role-responsibility`

## 1. Verified current runtime reality

The baseline has one `src/main.ts` entrypoint and one `AppModule` graph. That
graph currently constructs HTTP, WebSocket/realtime, all seven BullMQ
consumers, all three BullMQ repeat registrations, and both realtime
in-process intervals in the same process.

### Consumers and queue names

| # | Exact queue name | Consumer | Current provider module | Target owner |
|---:|---|---|---|---|
| 1 | `communication-notifications` | `CommunicationNotificationGenerationWorker` | `CommunicationModule` | Core Worker |
| 2 | `communication-notification-push` | `CommunicationNotificationPushWorker` | `CommunicationModule` | Core Worker |
| 3 | `school-email-delivery` | `SchoolEmailDeliveryWorker` | `EmailModule` | Core Worker |
| 4 | `files-imports` | `ImportValidationWorker` | `ImportsModule` | Core Worker |
| 5 | `dismissal-request-expiry` | `DismissalRequestExpiryWorker` | `DismissalModule` | Core Worker |
| 6 | `settings-branding-logo-cleanup` | `BrandingLogoCleanupWorker` | `BrandingModule` | Core Worker |
| 7 | `learning-media-cleanup` | `LearningMediaCleanupService` worker | `UploadsModule` | Media Worker |

Evidence is the seven non-test `BullmqService.createWorker(...)` call sites in:

- `src/modules/communication/infrastructure/communication-notification-generation.worker.ts`
- `src/modules/communication/infrastructure/communication-notification-push.worker.ts`
- `src/modules/settings/email/delivery/infrastructure/school-email-delivery.worker.ts`
- `src/modules/files/imports/infrastructure/import-validation.worker.ts`
- `src/modules/dismissal/requests/worker/dismissal-request-expiry.worker.ts`
- `src/modules/settings/branding/infrastructure/branding-logo-cleanup.worker.ts`
- `src/modules/files/uploads/application/learning-media-cleanup.service.ts`

The queue-name constants are defined in the same worker/domain families. No
other non-test worker factory or direct `new Worker(...)` consumer exists.

### BullMQ schedules

| # | Queue / scheduled job | Current registration | Cadence | Target owner |
|---:|---|---|---|---|
| 1 | `dismissal-request-expiry` / `expire-stale-dismissal-requests` | `dismissal-request-expiry.worker.ts` | cron `* * * * *` | Maintenance Scheduler |
| 2 | `learning-media-cleanup` / `discover` | `learning-media-cleanup.service.ts` | every 15 minutes | Maintenance Scheduler |
| 3 | `settings-branding-logo-cleanup` / `reconcile` | `branding-logo-cleanup-queue.service.ts` | every 15 minutes | Maintenance Scheduler |

These are the only three non-test `repeat: {...}` registrations.

### In-process realtime intervals

| # | Interval | File | Cadence | Target owner |
|---:|---|---|---|---|
| 1 | connected-socket presence refresh | `src/infrastructure/realtime/realtime-presence.service.ts` | 30 seconds; presence TTL 90 seconds | API, once per API process |
| 2 | local typing fallback expiry sweep | `src/infrastructure/realtime/realtime-state-store.service.ts` | 4 seconds | API, once per API process |

### Baseline inventory correction

Phase 0 counted one in-process interval. Direct inspection of the current
baseline proves two:

- 30-second connected-socket presence refresh.
- 4-second local typing fallback expiry sweep.

This is an inventory correction only. Both behaviors remain API-local and do
not move to the Maintenance Scheduler.

## 2. Target responsibility matrix

| Role | Consumers | BullMQ schedules | Producer ownership | Required runtime dependencies | Forbidden capabilities |
|---|---:|---:|---|---|---|
| API | **0** | **0** | User/request-triggered queue production; HTTP/WebSocket and realtime; synchronous Learning Media completion | validated config, Prisma/PostgreSQL, producer Redis, object storage/signing, realtime Redis, and the ffprobe/temp capability required by synchronous Learning Media completion | consumer construction; repeat registration; SMTP sending; Firebase delivery; bulk/orphan cleanup; DDL; migration execution |
| Core Worker | **6** | **0** | downstream communication push production and branding cleanup jobs produced during reconciliation/retry | validated config, Prisma/PostgreSQL, queue Redis, object storage, SMTP, Firebase, token/secret decryption, and cross-process realtime emitter Redis capability | public business HTTP/WebSocket listener; any repeat registration; Learning Media cleanup/verification; migration DDL |
| Media Worker | **1** | **0** | cleanup jobs emitted from the scheduled discovery command | validated config, Prisma/PostgreSQL, queue Redis, and object storage | public business listener; Core consumers; repeat registration; SMTP/Firebase; asynchronous Learning Media verification before Phase 6 approval; DDL |
| Maintenance Scheduler | **0** | **3** | only the three idempotent scheduled commands: dismissal expiry, Learning Media discovery, branding reconciliation | validated config and producer-only queue Redis | consumer construction; public business listener; direct domain mutation; direct object deletion/enumeration; SMTP/Firebase; DDL |
| Migration Job | **0** | **0** | none | governed Prisma CLI/artifact, migration files, and the migration PostgreSQL identity | HTTP/WebSocket; queue producers/consumers; schedules; Redis; object storage; seed; application runtime DML; any DDL command other than governed `prisma migrate deploy` |

Exact ownership totals:

- Core Worker consumers: **6**.
- Media Worker consumers: **1**.
- API consumers: **0**.
- Maintenance Scheduler consumers: **0**.
- Migration Job consumers: **0**.
- Maintenance Scheduler schedules: **3**.
- API, Core Worker, Media Worker, and Migration Job schedules: **0** each.

The Phase 2 Media Worker consumes `learning-media-cleanup` only. Current
cleanup uses neither ffprobe nor temporary disk. API retains ffprobe and the
temporary-media capability because Learning Media completion remains
synchronous; Media Worker receives neither capability before Phase 6 approval.

Request-scoped storage compensation that is required to keep the current
synchronous Learning Media contract atomic is not generalized cleanup
authority. Destructive discovery, orphan reconciliation, and worker-owned
cleanup remain forbidden to API.

## 3. Queue producer ownership

| Queue | Authorized target producer role(s) | Production trigger |
|---|---|---|
| `communication-notifications` | API | published announcement fan-out request |
| `communication-notification-push` | API and Core Worker | API-originated dismissal push; downstream push jobs created by communication generation |
| `school-email-delivery` | API | persisted campaign or credential-delivery recipients |
| `files-imports` | API | persisted import validation request |
| `dismissal-request-expiry` | Maintenance Scheduler | singular expiry command |
| `learning-media-cleanup` | Maintenance Scheduler and Media Worker | singular discovery command; discovered cleanup candidates |
| `settings-branding-logo-cleanup` | API, Core Worker, and Maintenance Scheduler | request-triggered deferred delete; reconciliation-produced cleanup; singular reconcile command |

Producer permission does not confer consumer or scheduler permission. Queue
payloads, job names, deterministic IDs, persisted statuses, tenancy context,
and retry semantics must stay compatible across the split.

### Cross-process realtime publication lock

The `communication-notifications` consumer creates notification records and
then publishes notification-created realtime events. The current
`RealtimePublisherService` depends on a Socket.IO Server bound locally inside
the API process; moving the consumer to Core Worker without a cross-process
emitter would silently lose the realtime event.

G02/G03 must provide a worker-safe Redis emitter, or an equivalently proven
cross-process mechanism, that publishes into the Socket.IO Redis adapter owned
by API processes. Existing namespace, room names, event names, and payloads
must remain compatible. API remains the sole owner of the Socket.IO Gateway
and client connections. Core Worker constructs no Gateway and opens no public
listener. Realtime emission failure must not change persisted notification
truth, but it must be observable and reconcilable under the current contract.

## 4. Rollout and rollback exclusivity

### Rollout

1. Deploy role artifacts with new consumers and schedules disabled; prove
   configuration and dependency readiness without claiming queue ownership.
2. Per queue, stop intake to the old consumer, drain its active job, and prove
   the old worker is closed before enabling the target consumer. A durable
   queued gap is allowed; old/new consumer overlap is not.
3. Disable and remove each old repeat owner before enabling the corresponding
   Maintenance Scheduler registration. Verify Redis repeat/job-scheduler
   identity and active execution before and after the handoff.
4. Enable the producer-only API only after its graph proves zero
   `createWorker` calls and zero repeat registrations.
5. Complete the handoff only when the live ownership totals are exactly
   Core `6`, Media `1`, Scheduler `3`, API `0/0`, with no duplicate owner.

### Rollback

1. Stop new schedule production first, then stop/pause affected producers as
   needed to bound the queue.
2. Drain and close the target consumer for each queue; prove zero active jobs
   under that process identity.
3. Start only a queue-payload-compatible prior consumer. Never start the old
   graph while the target consumer is still active.
4. Restore a prior schedule owner only after the Maintenance Scheduler repeat
   has been disabled/removed and exclusivity has been verified.
5. Resume producers last. Rollback must not create simultaneous consumers,
   simultaneous schedule owners, duplicate schedule fires, or incompatible
   job processing.

## 5. Learning Media compatibility lock

`POST /api/v1/academics/learning-media/uploads/:uploadId/complete` remains on
the API role and remains synchronous. The controller currently declares
`HttpStatus.OK`; `CompleteLearningMediaUploadUseCase` awaits
`MediaVerifierService.verifyAndStoreFinal(...)`, finalizes the ready record,
and only then returns the completion DTO.

For G02 and G03:

- HTTP completion remains synchronous.
- No HTTP `202 Accepted` response is permitted.
- No asynchronous verification job, polling/status transition, or Media
  Worker verification ownership is permitted.
- The controller path/method, `200` response contract, lifecycle statuses,
  error catalog behavior, and persisted completion semantics remain unchanged.

## 6. Expected exact G02/G03 production source scope

This is a production-source modification manifest, not authorization in G01
and not a complete Implementation PR file list. The Implementation PR will
also require:

- focused runtime-role tests;
- a reusable current regression mode;
- preservation of the historical `npm run test:g07` mode;
- execution of the current aggregate through `npm run test:regression`;
- derivation of the current comparison base from the GitHub event or an
  explicit validated base;
- no application of the historical G07 allowlist to Phase 2 files.

No schema, migration, or Acceptance Matrix changes are expected. A limited
dependency and lockfile change may be required solely to add a direct,
supported cross-process Socket.IO Redis emitter. The implementation must not
rely on an undeclared transitive dependency. Any new dependency must remain
bounded to this contract and have focused tests.

The Implementation PR's additional realtime scope, without locking uncertain
filenames, includes:

- `RealtimePublisherService`, or an alternative abstraction, that separates
  local API publishing from worker cross-process publishing;
- the required realtime module/provider registration;
- focused contract tests proving Core Worker publishes through Redis without
  constructing the Gateway;
- a test proving API remains the sole Gateway owner;
- a test proving namespace, room, event, and payload compatibility.

### G02 — producer-only API composition

Expected existing files/modules:

- `src/main.ts`
- `src/app.module.ts`
- `src/modules/communication/communication.module.ts`
- `src/modules/settings/email/email.module.ts`
- `src/modules/files/imports/imports.module.ts`
- `src/modules/dismissal/dismissal.module.ts`
- `src/modules/files/uploads/uploads.module.ts`
- `src/modules/settings/branding/branding.module.ts`
- `src/modules/health/operational-probe.manifests.ts`

Expected new composition files/modules:

- `src/runtime/runtime-role.ts`
- `src/runtime/api/api-runtime.module.ts`
- `src/runtime/api/api-runtime.bootstrap.ts`

G02 must remove consumer and repeat-provider reachability from the API graph,
while retaining the current controllers, realtime providers, authorized queue
producers, and synchronous Learning Media completion providers.

### G03 — worker and scheduler composition

Expected existing files/modules:

- all seven consumer files listed in section 1
- `src/modules/settings/branding/application/branding-logo-cleanup-queue.service.ts`
- the six owning module files listed in G02
- `src/modules/health/operational-probe.manifests.ts`

Expected new composition and split-registration files/modules:

- `src/core-worker.ts`
- `src/media-worker.ts`
- `src/maintenance-scheduler.ts`
- `src/runtime/core-worker/core-worker-runtime.module.ts`
- `src/runtime/core-worker/core-worker-runtime.bootstrap.ts`
- `src/runtime/media-worker/media-worker-runtime.module.ts`
- `src/runtime/media-worker/media-worker-runtime.bootstrap.ts`
- `src/runtime/maintenance-scheduler/maintenance-scheduler-runtime.module.ts`
- `src/runtime/maintenance-scheduler/maintenance-scheduler-runtime.bootstrap.ts`
- `src/runtime/maintenance-scheduler/dismissal-expiry.schedule.ts`
- `src/runtime/maintenance-scheduler/learning-media-cleanup.schedule.ts`
- `src/runtime/maintenance-scheduler/branding-logo-reconciliation.schedule.ts`

G03 must separate the three schedule registrations from their current
consumer/producer classes. The Core and Media application contexts must expose
no public business listener. Migration Job remains the existing governed
`prisma migrate deploy` command and does not require a Nest composition root.

The Learning Media contract files
`src/modules/academics/curriculum/controller/learning-media.controller.ts` and
`src/modules/files/uploads/application/learning-media-upload.use-cases.ts` are
compatibility locks, not expected behavior-change files in G02/G03.

## 7. Gate status

`PRD2-G01_CANDIDATE_FOR_REVIEW`
