# Production Readiness Phase 0A — Runtime and Dependency Inventory

## Reading key

- **IMPLEMENTED** means current baseline code or a directly inspected baseline
  CI run supports the statement.
- **RECOMMENDED** means a future production-readiness change is proposed; it is
  not current behavior.
- **UNRESOLVED** means an owner decision is required.
- Evidence IDs resolve to the 85-record index in
  `00-evidence-baseline.md`. Paths are repository-relative.

## Inventory totals

| Item | Baseline count | Counting rule |
|---|---:|---|
| NestFactory entrypoints | 1 | executable `NestFactory.create` sites |
| Root Nest graphs | 1 | `AppModule` |
| Controller files | 167 | non-test files containing `@Controller` |
| WebSocket gateways | 1 | `@WebSocketGateway` declarations |
| Runtime BullMQ worker classes/services | 7 | consumers that call the central worker factory |
| Queue names | 7 | distinct application BullMQ queues |
| Scheduled/repeating processes | 4 | 3 BullMQ repeatables plus 1 in-process interval |
| Redis clients/purposes | 4 | BullMQ, Socket.IO publisher, Socket.IO subscriber, realtime state |
| Direct application `StorageService` consumers | 20 | excludes the storage module/service themselves and tests |
| Explicit `new PrismaClient` files | 183 | 173 test, 9 script, 1 seed |
| Production runtime Prisma clients | 1 per current process | Nest-created `PrismaService extends PrismaClient` |

## A. Runtime entrypoint and Nest graph

| Concern | IMPLEMENTED baseline | Production implication | Evidence |
|---|---|---|---|
| Entrypoint | `src/main.ts::bootstrap` is the only `NestFactory` site and creates `AppModule`. | One executable currently activates HTTP, WebSocket, consumers, and schedulers together. | EVD-011 |
| HTTP | Global prefix `api/v1`; listens on `APP_PORT`, then unvalidated `PORT`, then `3000`. | All routes retain `/api/v1/`; `PORT` is a direct runtime escape from validated config. | EVD-011, EVD-052 |
| Request validation | Global `ValidationPipe` uses whitelist, forbid-non-whitelisted, and transform. | Input boundary is centralized. | EVD-011 |
| HTTP CORS | `origin: false` when `NODE_ENV === 'production'`, otherwise `true`; credentials enabled. | Browser production API access is disabled, not origin-allowlisted. | EVD-011, EVD-052 |
| Swagger | Always mounted at `/api/v1/docs`. | Production exposure is not configurable. | EVD-011, EVD-060 |
| Startup output | Logs application URLs and every registered route. Fatal bootstrap catch logs the raw error object. | Unstructured/high-volume route output and raw startup exception disclosure are possible. | EVD-011, EVD-049 |
| Root graph | `AppModule` imports global config/database/realtime/health plus every domain and app-facing module. It registers global JWT, scope, organization, and permission guards, the exception filter, and request-context middleware. | Domain boundaries are modular, but process lifecycle is not role-selective. | EVD-012, EVD-061 |
| WebSocket | One Socket.IO gateway at namespace `/api/v1/realtime`; production gateway CORS is also `false`. | Namespace is public-contract sensitive; production browser connection needs an approved origin policy. | EVD-014, EVD-060 |

### Root graph imports

`AppModule` imports `PrismaModule`, `RealtimeModule`, `HealthModule`,
`IamModule`, `ApplicantPortalModule`, `PlatformAdminModule`,
`OrganizationAdminModule`, `SettingsModule`, `AcademicsModule`, `FilesModule`,
`AdmissionsModule`, `StudentsModule`, `AttendanceModule`, `GradesModule`,
`HomeworkModule`, `ReinforcementModule`, `BehaviorModule`, `DismissalModule`,
`CommunicationModule`, `SchoolSupportModule`, `DashboardModule`,
`TeacherAppModule`, `TeachersModule`, `StudentAppModule`, and
`ParentAppModule`. This list is IMPLEMENTED, not a recommended target graph
(EVD-012).

### Controllers by runtime concern

Exactly 167 non-test files declare `@Controller`. `AppModule` imports the
current top-level module graph, but an annotation count alone does not prove
that every declaration is runtime-reachable:

| Concern/root | Count | Complete path scope |
|---|---:|---|
| Root | 1 | `src/app.controller.ts` |
| Academics | 11 | `src/modules/academics/**/**.controller.ts` |
| Admissions | 7 | `src/modules/admissions/**/**.controller.ts` |
| Applicant portal | 1 | `src/modules/applicant-portal/**/*.controller.ts` |
| Attendance | 5 | `src/modules/attendance/**/**.controller.ts` |
| Behavior | 4 | `src/modules/behavior/**/**.controller.ts` |
| Communication | 9 | `src/modules/communication/**/**.controller.ts` |
| Dashboard | 2 | `src/modules/dashboard/**/**.controller.ts` |
| Dismissal | 7 | `src/modules/dismissal/**/**.controller.ts` |
| Files | 3 | `src/modules/files/**/**.controller.ts` |
| Grades | 8 | `src/modules/grades/**/**.controller.ts` |
| Health | 1 | `src/modules/health/health.controller.ts` |
| Homework | 6 | `src/modules/homework/**/**.controller.ts` |
| IAM | 1 | `src/modules/iam/**/**.controller.ts` |
| Organization admin | 1 | `src/modules/organization-admin/**/**.controller.ts` |
| Parent app | 20 | `src/modules/parent-app/**/**.controller.ts` |
| Platform admin | 1 | `src/modules/platform-admin/**/**.controller.ts` |
| Reinforcement | 12 | `src/modules/reinforcement/**/**.controller.ts` |
| School support | 2 | `src/modules/school-support/**/**.controller.ts` |
| Settings | 14 | `src/modules/settings/**/**.controller.ts` |
| Student app | 20 | `src/modules/student-app/**/**.controller.ts` |
| Students | 11 | `src/modules/students/**/**.controller.ts` |
| Teacher app | 19 | `src/modules/teacher-app/**/**.controller.ts` |
| Teachers | 1 | `src/modules/teachers/**/**.controller.ts` |

The repository-wide `@Controller` path set is the authoritative declaration
enumerator; tests are excluded. Complete runtime reachability still requires a
module/export/import and route inventory trace. This draft does not claim that
trace has closed for every declaration (EVD-012, EVD-013).

### Startup and lifecycle providers

| Provider | Startup action | Destroy action | Evidence |
|---|---|---|---|
| `PrismaService` | `OnModuleInit` connects | `OnModuleDestroy` disconnects | EVD-015 |
| Communication generation worker | creates and starts worker | central BullMQ close | EVD-019 |
| Communication push worker | creates and starts worker | central BullMQ close | EVD-020 |
| School email worker | creates and starts worker | central BullMQ close | EVD-021 |
| Import validation worker | creates and starts worker | central BullMQ close | EVD-022 |
| Dismissal expiry worker | schedules repeat and starts worker; skips under test | central BullMQ close | EVD-023 |
| Learning media cleanup service | schedules discovery and starts worker | explicit worker close through BullMQ | EVD-024 |
| Branding cleanup queue service | schedules reconcile repeat without awaiting it | queue closed centrally | EVD-025 |
| Branding cleanup worker | starts worker | central BullMQ close | EVD-025 |
| `MediaRuntimeStartupGuard` | verifies exact ffprobe identity when enforced | none needed | EVD-043 |
| Realtime presence | constructor starts a 30-second interval | clears interval | EVD-026 |

No `OnApplicationBootstrap` implementation was found. Individual services have
destroy hooks, but `bootstrap` never calls `app.enableShutdownHooks()`. Signal
delivery therefore does not have code-grounded proof that Nest will invoke
those hooks before Cloud Run termination (EVD-016).

## B. BullMQ and background work

### Central queue behavior

`src/infrastructure/queue/bullmq.service.ts::BullmqService` owns one lazy
IORedis connection, creates queues lazily, creates workers with `autorun:
false`, then calls `run()`. Queue defaults retain 100 completed and 500 failed
jobs. No worker supplies explicit concurrency, so the BullMQ library default of
one job per worker applies. The service closes workers, queues, and its shared
connection on module destroy. Redis has `maxRetriesPerRequest: null`; no
explicit connect timeout, retry strategy, or offline-queue override exists for
this client (EVD-018, EVD-031).

### Worker inventory

| Queue / job | Producer and consumer / registration | Payload and tenancy | Idempotency, retries, terminal behavior | Dependencies | RECOMMENDED role / current risk |
|---|---|---|---|---|---|
| `communication-notifications` / `communication.announcement.notifications.generate` | Producer `communication-notification-queue.service.ts`; consumer `communication-notification-generation.worker.ts`; Communication module graph; worker starts in `OnModuleInit`. | school, organization, announcement, actor user/type; worker reconstructs a `RequestContext` with queue membership/role placeholders. | Deterministic `communication-announcement-notifications-<school>-<announcement>`; 3 attempts, exponential 1s. Repository creates missing notification/delivery rows. Downstream push enqueue failures are logged/caught, so reconciliation is required. | PostgreSQL, Redis, push producer | Core Worker. Current API coupling and generation-to-push outbox gap. EVD-019 |
| `communication-notification-push` / `communication.notification.push.send` | Producer `communication-notification-push-queue.service.ts`; consumer `communication-notification-push.worker.ts`; Communication graph; `OnModuleInit`. | school, organization, notification, delivery, actor user/type; queue context reconstructed. | Deterministic `communication-push-<delivery>`; 3 attempts, exponential 1s. Delivery records persist attempts and SENT/FAILED/SKIPPED outcomes. | PostgreSQL, Redis, Firebase, encrypted device tokens | Core Worker. Current role coupling; Firebase/runtime version and credential decisions unresolved. EVD-020 |
| `school-email-delivery` / `send-recipient` | Producer `school-email-delivery-queue.service.ts`, invoked by campaign and credential-delivery use cases; consumer `school-email-delivery.worker.ts`; Email module; `OnModuleInit`. | batch, recipient, school, organization, actor user/type; queue context reconstructed. | 3 attempts, exponential 1s; status short-circuits SENT/SKIPPED/CANCELLED. Job ID builder uses `school-email-delivery:<batch>:<recipient>`. BullMQ custom-ID compatibility with colons is not proven by baseline tests and must be resolved before production. | PostgreSQL, Redis, SMTP, shared encryption key | Core Worker. **PARTIALLY_VERIFIED** job-ID risk and provider timeout/rate behavior. EVD-021 |
| `files-imports` / `validate-import` | Producer `create-import-job.use-case.ts`; consumer `import-validation.worker.ts`; Imports graph; `OnModuleInit`. | persisted import job ID; no explicit request-context reconstruction in worker. | Job ID is import UUID; no explicit retry/backoff (one attempt). Enqueue failure marks DB job failed; processing records completed/failed and rethrows. | PostgreSQL, Redis, object storage | Core Worker. Single-attempt transient failures and tenant-context proof need production tests. EVD-022 |
| `dismissal-request-expiry` / `expire-stale-dismissal-requests` | Same worker service schedules and consumes; Dismissal module; `OnModuleInit`; skipped only in `NODE_ENV=test`. | no tenant payload; repository discovers scoped candidates. | Repeat ID `dismissal-request-expiry-every-minute`; cron each minute; no explicit attempts. Per-candidate failures are logged and swallowed, allowing the aggregate job to succeed partially. | PostgreSQL, Redis | Maintenance/Scheduler ownership plus Core Worker consumer. Partial-success visibility/reconciliation is missing. EVD-023 |
| `learning-media-cleanup` / `discover`, `cleanup` | `learning-media-cleanup.service.ts` schedules, produces, and consumes; Uploads module; `OnModuleInit`. | discovery has no tenant payload; cleanup carries upload ID and target; repository claims scoped DB state. | Discovery repeat every 15 minutes, one attempt. Cleanup ID `learning-media-cleanup-<upload>-<target>`, 5 attempts exponential 1s. Finished deterministic jobs may be replaced under Redis `SET NX` lock. Claims and absence confirmation support recovery. | PostgreSQL, Redis, object storage | Media Worker; repeat ownership must be singular. Same API graph currently downloads/cleans production media. EVD-024 |
| `settings-branding-logo-cleanup` / `delete-object`, `reconcile` | Queue service produces/schedules; `branding-logo-cleanup.worker.ts` consumes; Branding graph; both initialize at startup. | deletion object identity; reconcile scans persisted soft-deleted files and private bucket prefix. No request context; repository queries encode target scope. | Delete uses random ID; reconcile ID `reconcile`, every 15 minutes. Both 5 attempts, exponential 5s; reconcile keeps failures. Reconciler can enumerate `schools/` and delete unknown branding objects older than one hour. | PostgreSQL, Redis, object storage | Core Worker plus singular maintenance scheduler. Large storage blast radius; dry-run/canary and audit proof required. EVD-025 |

There are exactly seven runtime worker consumers. `BullmqService` is the only
worker factory; repository-wide searches found no separate `new Worker`
consumer (EVD-018–EVD-025).

### Queue producer and synchronous API behavior

| Producer | Trigger | Current response relationship |
|---|---|---|
| Communication generation producer | announcement publish | publish enqueues background fan-out; enqueue failure is surfaced by the publishing path |
| Communication push producer | generated notification delivery | generation can finish even if a downstream enqueue fails |
| School email producer | campaign/credential delivery | API persists batch/recipients then queues recipient work; sending is asynchronous |
| Import producer | import creation | returns persisted pending/failed state; validation is asynchronous |
| Dismissal expiry producer | startup-installed repeat | no public response |
| Media cleanup producer | startup repeat and verification cleanup state | no public response |
| Branding producer | logo lifecycle and startup-installed reconcile | logo request can complete while deletion is deferred |

Queue-backed status values and error shapes are public-contract sensitive even
where the HTTP request does not wait for delivery (EVD-019–EVD-025, EVD-060).

### Repeatable and scheduled inventory

| Schedule | Owner today | Configuration | Multi-instance concern |
|---|---|---|---|
| Dismissal expiry | every application instance initializes the same BullMQ repeat | cron `* * * * *` | repeat identity reduces schedule duplication, but ownership is implicit and consumers remain in every API instance |
| Learning-media discovery | every application instance initializes the same repeat | every 15 minutes | requires one approved scheduler/consumer topology |
| Branding reconcile | every application instance initializes the same repeat, fire-and-forget | every 15 minutes | startup error may not fail readiness; reconciler has high delete blast radius |
| Realtime presence refresh | each process owns local timer | `setInterval` every 30 seconds, presence TTL 90 seconds | expected per API instance, but in-memory fallback makes state divergent |

No other cron decorator, repeating loop, or interval was found. Other timers
are bounded connection/request/health timeouts, not scheduled work
(EVD-023–EVD-026).

## C. Database and Prisma

| Area | IMPLEMENTED | Production implication | Evidence |
|---|---|---|---|
| Runtime client | Global `PrismaService extends PrismaClient`; connects/disconnects in module lifecycle. | Each future process role creates an independent Prisma pool. | EVD-015 |
| Datasource | PostgreSQL URL is supplied implicitly through `DATABASE_URL`. | Credential, connector, SSL, and pool query parameters are deployment-owned. | EVD-027 |
| Pool settings | No constructor datasource override, pool-size budget, timeout budget, or role-specific URL is configured in application code. | Cloud SQL connection limits cannot be proven safe across autoscaled roles. | EVD-027 |
| Creation sites | 173 test files, 9 operational/demo scripts, and `prisma/seeds/index.ts` explicitly call `new PrismaClient`; runtime Nest creates the subclass client. | Only the runtime client belongs in deployed API/worker images; scripts/jobs need separately controlled credentials. | EVD-028 |
| Transactions | Widespread repository/use-case `$transaction`; notable explicit timeouts include 15–30 seconds and Serializable/ReadCommitted isolation. Playback waits for external URL signing inside a 15-second DB transaction. | Pool occupancy and external-I/O-in-transaction require load tests and refactor. | EVD-029, EVD-044 |
| Health | DB check executes `SELECT 1` with a one-second health timeout. | Connectivity is checked, not pool saturation, replica health, migration compatibility, or transaction latency. | EVD-046 |

The nine explicit script sites are:
`scripts/audits/classify-school-branding-logo-values.ts`,
`scripts/backfill-teacher-profiles-1a.cjs`,
`scripts/classify-legacy-learning-media.cjs`,
`scripts/classify-teacher-directory-reality-0a.cjs`,
`scripts/classify-teacher-identity-remediation-1b-0r.cjs`,
`scripts/demo-sprint1c.cjs`, `scripts/demo-sprint2a.cjs`,
`scripts/demo-sprint2b.cjs`, and
`scripts/remediate-orphan-teacher-identities-1b-0r.cjs`. The seed site is
`prisma/seeds/index.ts`. Test client paths are completely enumerated by
`rg -l "new PrismaClient" test` at the baseline (EVD-028).

### Migration inventory

Seven committed migrations exist, in order:

1. `20260710135222_baseline_v1`
2. `20260711162248_dashboard_todos`
3. `20260716120000_school_branding_logo_asset`
4. `20260718115332_teacher_directory_data_foundation`
5. `20260720182221_membership_suspended_open_state`
6. `20260721224852_lesson_content_publication_lifecycle`
7. `20260722160000_learning_media_runtime_upload_foundation`

`package.json` maps production deployment to `prisma migrate deploy`;
creation uses `migrate dev --create-only`; seed is separate. Migration
Integrity run `30066914639` proved fresh replay and second-deploy no-op for this
baseline. No application-startup migration exists. A future Migration Cloud Run
Job needs a separate pool/identity and must preserve immutable committed
migrations and drift/P3009 hard stops (EVD-004, EVD-030, EVD-062).

## D. Redis

| Client/purpose | Constructor/config | Failure/retry/offline behavior | Shutdown/fallback/share | Evidence |
|---|---|---|---|---|
| BullMQ queues/workers | `BullmqService`; `REDIS_URL`; lazy; `maxRetriesPerRequest: null` | ioredis defaults for connect timeout, reconnect, and offline queue; worker/queue operations can wait through outages | explicit close logic; no in-memory queue fallback; shares URL | EVD-031, EVD-035 |
| Socket.IO publisher | `realtime.gateway.ts`; `REDIS_URL`; lazy, 1s connect timeout, retries disabled, offline queue disabled | initial connection failure disconnects; no reconnect path | gateway continues with in-memory adapter; explicit close; shares URL | EVD-032, EVD-034 |
| Socket.IO subscriber | duplicate of publisher with same options | same | same | EVD-032, EVD-034 |
| Realtime presence/typing state | `realtime-state-store.service.ts`; same URL/options | first failure marks Redis unavailable for process lifetime; no reconnect | in-process maps become fallback; explicit close; shares URL | EVD-033–EVD-035 |

No general application cache exists. The only application lock discovered is
the learning-media cleanup replacement lock using the BullMQ queue connection
and Redis `SET NX` (EVD-024, EVD-035). All queues, repeat ownership, Socket.IO,
presence, typing, and that lock share one `REDIS_URL`.

The in-memory fallback is **not safe as a transparent production mode with more
than one API instance**: event fan-out becomes process-local, presence/typing
state diverges, and clients can see partial or stale state depending on routing.
The current health check pings only the BullMQ Redis connection, so realtime
fallback can be active while health reports Redis ready (EVD-034, EVD-047).

## E. Storage and File metadata

### Storage boundary and operations

`StorageModule` provides the concrete `MinioAdapter`, `StorageService`, and
`SignedUrlService`. `StorageService` depends directly on `MinioAdapter` and
exports MinIO-derived presign types. Implemented operations are put/save,
remove, presigned GET, presigned PUT, stat, stream get, exists,
delete-and-confirm, paginated list, bucket selection, and private/public bucket
readiness. There is no copy operation (EVD-036).

`MinioAdapter` parses endpoint/static access key/static secret, implements
S3-compatible methods, and creates a missing bucket before writes or presigned
uploads. Production write traffic can therefore mutate bucket infrastructure.
MinIO-derived capability types leak into `StorageService`. Provider-specific
error codes are interpreted outside the adapter, including branding
not-found handling. AWS `X-Amz-Date` / `X-Amz-Expires` expiry parsing is
provider-specific but is correctly located inside the concrete
`MinioAdapter`; the parser itself is not an out-of-adapter leak. Although
`STORAGE_PROVIDER` accepts `minio` or `s3`, module selection always binds
`MinioAdapter` (EVD-036, EVD-037, EVD-051).

`SignedUrlService` defaults to 15 minutes; application call sites commonly
request five minutes. Lesson playback uses a 300-second inline capability.
Range requests go from the client directly to object storage using that URL;
the backend does not proxy bytes or implement Range semantics (EVD-036,
EVD-044, EVD-045).

### Twenty direct application consumers

| # | Exact path |
|---:|---|
| 1 | `src/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.coordinator.ts` |
| 2 | `src/modules/applicant-portal/application/get-applicant-document-download-url.use-case.ts` |
| 3 | `src/modules/applicant-portal/application/replace-applicant-document.use-case.ts` |
| 4 | `src/modules/applicant-portal/application/upload-applicant-document.use-case.ts` |
| 5 | `src/modules/communication/application/communication-message-attachment-download.use-case.ts` |
| 6 | `src/modules/files/imports/application/create-import-job.use-case.ts` |
| 7 | `src/modules/files/imports/application/process-import-validation.use-case.ts` |
| 8 | `src/modules/files/uploads/application/get-file-download-url.use-case.ts` |
| 9 | `src/modules/files/uploads/application/learning-media-cleanup.service.ts` |
| 10 | `src/modules/files/uploads/application/learning-media-upload.use-cases.ts` |
| 11 | `src/modules/files/uploads/application/media-verifier.service.ts` |
| 12 | `src/modules/files/uploads/application/upload-file.use-case.ts` |
| 13 | `src/modules/health/health.service.ts` |
| 14 | `src/modules/parent-app/files/application/get-parent-child-file-download-url.use-case.ts` |
| 15 | `src/modules/settings/branding/application/branding-logo-cleanup-queue.service.ts` |
| 16 | `src/modules/settings/branding/application/delete-branding-logo.use-case.ts` |
| 17 | `src/modules/settings/branding/application/get-public-school-branding-logo.use-case.ts` |
| 18 | `src/modules/settings/branding/application/process-branding-logo-cleanup.use-case.ts` |
| 19 | `src/modules/settings/branding/application/upload-branding-logo.use-case.ts` |
| 20 | `src/modules/student-app/profile/application/upload-student-avatar.use-case.ts` |

`StorageModule` and `StorageService` are excluded from this consumer count.
Controllers/presenters that reach storage indirectly are represented through
their use cases (EVD-038).

### Metadata persistence consumers

The normalized `File` model is related to Organization, School, uploading User,
SchoolProfile logo, application documents, applicant admission request
documents, lesson content, teacher/student avatars, student documents, homework
assignment/submission attachments, reinforcement proof/catalog/hero assets,
communication conversation/message/announcement assets, upload sessions,
generic attachments, and import jobs. These relations are the metadata/data
migration blast radius even if callers remain behind a stable service
(EVD-039).

### Exact GCS replacement blast radius

**RECOMMENDED, not implemented:** retain current application-facing storage
operations but replace the concrete binding with provider-neutral interfaces
and two adapters: GCS in production, MinIO locally/in tests.

Required future change surface:

- `storage.module.ts`, `storage.service.ts`, `signed-url.service.ts`,
  `minio.adapter.ts`, presign types, URL parser, and storage error normalizer;
- environment validation and identity model (static access keys to ADC/service
  account signing);
- health checks, CORS provisioning, bucket existence/creation ownership;
- all 20 consumers for contract verification, with code changes expected only
  where provider types/errors leaked;
- learning-media finalization because it streams from local temp to a second
  object rather than server-side copy;
- local compose and storage/media CI may retain MinIO; production-semantic
  proof requires real isolated GCS integration for IAM, signed URLs, CORS,
  generation behavior, Range, and provider errors. An emulator is acceptable
  only if explicitly approved and its semantic gaps are documented;
- every `File` relation needs compatibility evidence; data/object migration
  evidence is conditional on PRD0-Q004/PRD0-D029 and becomes
  `N/A_WITH_EVIDENCE` only after signed clean-start proof. Normalized metadata
  need not change if object identity remains stable.

No GCS support, copy, ADC path, or production provider selection exists today.

## F. Media processing

### Current complete flow

1. `POST /api/v1/academics/learning-media/uploads` uses
   `FileUploadPurpose.LESSON_CONTENT`, validates UUID client request ID, name,
   nine MIME types, and size (10 MiB non-video; 200 MiB
   video), verifies media-runtime readiness, persists a two-hour upload session
   and staging/final identities, returns a one-hour direct PUT capability, and
   reuses the persisted session for idempotency (EVD-040, EVD-041).
2. The client uploads directly to the private object store.
3. `POST /api/v1/academics/learning-media/uploads/:uploadId/complete` claims
   verification transactionally and performs completion in the request
   (EVD-040, EVD-042).
4. The verifier stats and streams the staged object into an OS temporary
   directory named under `moazez-media-*`, computes SHA-256 and bounded size,
   validates magic/container plus text/PDF/image forms, and calls the pinned
   `/usr/bin/ffprobe` runtime for audio/video. ffprobe has time/output/protocol
   bounds (EVD-043).
5. The service uploads the verified local file to the final object identity,
   stats final size, then finalizes the database transaction and creates the
   normalized `File` record with READY status. Final object size is checked;
   a checksum read-back is not implemented (EVD-042, EVD-043).
6. Temporary disk is recursively removed in `finally`. Verification failures
   and infrastructure-release failures lead to distinct persisted states;
   cleanup claims and retry jobs handle abandoned staging/final objects
   (EVD-024, EVD-042).

Cancel and legacy verification endpoints are:

- `POST .../uploads/:uploadId/cancel`
- `POST .../uploads/legacy/:uploadId/verify`

All four commands preserve current controller status behavior. Completion is
currently synchronous and returns a finalized DTO containing file/status/media
data. There is no status GET endpoint for a submitted asynchronous completion.
The primary verification operation is not a separate asynchronous worker; it
is invoked by the HTTP completion request. Changing this Learning
Media-specific completion from an HTTP 200 final result to `202 Accepted` plus
pending state is therefore a **coordinated contract change** unless an additive
submit/status contract or a new API version is approved. It must not be
generalized to all files (EVD-040, EVD-060, EVD-074).

Playback contracts are:

- `GET /api/v1/student/lessons/:lessonPlanItemId/content/:contentItemId/playback`
- `GET /api/v1/parent/children/:studentId/lessons/:lessonPlanItemId/content/:contentItemId/playback`
- `GET /api/v1/teacher/lesson-preparation/:lessonPlanItemId/content/:contentItemId/playback`

The coordinator holds a database transaction/read locks while awaiting external
signing. The backend authorizes and signs inline playback; object storage
serves byte-range responses, and NestJS does not proxy the media body.
Provider replacement should require no path change but can affect URL host,
headers, CORS, expiry, and Range behavior (EVD-044, EVD-045, EVD-060, EVD-075).

## G. Health, logging, metrics, and tracing

| Capability | IMPLEMENTED baseline | Gap / implication | Evidence |
|---|---|---|---|
| Health route | Public `GET /api/v1/health`; report is `ok` or `degraded`; controller normally returns HTTP 200. | No separate liveness, startup, or readiness and no non-2xx readiness failure. | EVD-046 |
| Required checks | DB `SELECT 1`, BullMQ Redis ping, both storage buckets, queue counts. | Queue check covers only email, communication generation, and communication push; it omits import, dismissal, media, branding, Socket.IO, and realtime state. | EVD-047 |
| Optional checks | email configuration/decryption readiness and Firebase push mode. | Optional failures also degrade aggregate status; diagnostic detail is public. | EVD-046 |
| Queue visibility | waiting/active/delayed/failed counts for three queues. | No oldest-job age, lag, stalled/paused state, critical terminal failures, or worker heartbeat. | EVD-047, EVD-050 |
| Request ID | accepts inbound `x-request-id` without validation or creates UUID, then echoes it. | Header trust/length policy is absent. | EVD-048 |
| Trace ID | exception filter independently trusts inbound `x-trace-id` or creates UUID. | Trace and request IDs are not unified or propagated to jobs/providers. | EVD-048 |
| Logging | Nest `Logger`, text output, stack on 5xx/worker errors; bootstrap logs raw error and routes. | `LOG_LEVEL` is accepted but unused; no structured/redaction schema or sink contract. | EVD-049, EVD-051 |
| Metrics | No metrics library or endpoint. | No latency/error/saturation/queue/media metrics. | EVD-050 |
| Tracing | No OpenTelemetry dependency or initialization. | No cross-HTTP/DB/Redis/job/provider trace. | EVD-050 |

`OBSERVABILITY.md` is aspirational governance. It is not evidence that
structured logs, metrics, tracing, SLOs, alerts, queue lag, or heartbeats are
implemented (EVD-050).

## H. Environment, secrets, identity, and encryption

### Accepted environment variables

`src/config/env.validation.ts` accepts exactly these 30 names:

`APP_PORT`, `NODE_ENV`, `APP_URL`, `DATABASE_URL`, `REDIS_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`,
`JWT_REFRESH_TTL`, `STORAGE_PROVIDER`, `STORAGE_ENDPOINT`,
`STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET`,
`STORAGE_PUBLIC_BUCKET`, `STORAGE_CORS_ORIGINS`, `FFPROBE_PATH`,
`FFPROBE_TIMEOUT_MS`, `FFPROBE_MAX_OUTPUT_BYTES`,
`MEDIA_VERIFICATION_VERSION`, `MEDIA_RUNTIME_ENFORCE_IN_TEST`,
`SETTINGS_SECRET_ENCRYPTION_KEY`, `FCM_ENABLED`, `FCM_DRY_RUN`,
`GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `SEED_DEMO_DATA`, and
`LOG_LEVEL` (EVD-051).

`PORT` is read directly by `main.ts` but not validated.
`NODE_ENV` is read directly by HTTP/WebSocket CORS, both crypto fallback
resolvers, and dismissal scheduling. `DATABASE_URL` is consumed by Prisma
configuration. `STORAGE_PROVIDER`, `STORAGE_CORS_ORIGINS`, and `LOG_LEVEL`
have no production behavior matching their names in source:
provider selection remains MinIO, CORS belongs to external storage
configuration, and log level is not wired (EVD-051, EVD-052).

Production/staging validation requires storage CORS origins, but the current
application production CORS is unconditionally disabled. Static storage access
and secret keys remain required (EVD-051).

### Identity and secret behavior

| Area | IMPLEMENTED | Production gap | Evidence |
|---|---|---|---|
| Firebase | If a credentials path is supplied, uses `applicationDefault()`; otherwise supports project/client-email/private-key `cert`. Validation requires one complete strategy when send mode is enabled. | Workload Identity/ambient ADC without the path switch is not an explicit strategy; service account and rotation policy unresolved. | EVD-053 |
| Device tokens | Normalizes, SHA-256 hashes for lookup, encrypts with AES-256-GCM. | One shared settings key; no key ID or multi-key decrypt/rotation. | EVD-054 |
| SMTP password | Stored encrypted and decrypted immediately before Nodemailer transport creation. | Same shared key/envelope as other settings secrets; provider timeouts and key rotation not implemented. | EVD-054, EVD-055 |
| Envelope | `v1:<base64url iv>:<base64url tag>:<base64url ciphertext>`; 32-byte key. Missing keys are rejected outside local/test by crypto constructors. | Version identifies format, not key; rotating the single key makes existing ciphertext unreadable without an out-of-band migration. | EVD-054 |
| JWT | Separate access/refresh secrets; refresh token persisted as SHA-256 hash and session ID. | Secret Manager version/rotation and overlap policy are deployment decisions. | EVD-051, EVD-060 |

No real secret values were inspected or recorded.

## I. Docker, compose, and CI

| Surface | IMPLEMENTED | Production implication | Evidence |
|---|---|---|---|
| Image | Multi-stage `Dockerfile`; digest-pinned Node `20.19.4-bookworm-slim`; pinned OpenSSL and ffmpeg Debian package versions; Prisma generated during build; non-root `node`; port 3000; command `node dist/src/main.js`. | One artifact contains the whole graph and has no role selector. Image has no Docker `HEALTHCHECK` (Cloud Run uses configured probes). | EVD-056 |
| Media runtime | `/usr/bin/ffprobe` and exact media verification identity in image; canonical CI checks startup, non-root user, Prisma, ffprobe, and media matrix. | Strong functional runtime evidence, not capacity/ephemeral-disk production evidence. | EVD-006, EVD-056 |
| Node compatibility | `package-lock.json` pins `firebase-admin` `14.0.0`, whose engine is `>=22`; image and all workflows use Node 20; package declares no root `engines`. | Dependency/runtime engine mismatch is a release blocker until aligned and retested. | EVD-056 |
| Compose | PostgreSQL 16, Redis 7, exact-tag MinIO with persistent local volumes and health checks. PostgreSQL/Redis tags are mutable and images are not digest-pinned. | Local/test only; not a production topology. | EVD-057 |
| Build context | `.dockerignore` excludes Git, GitHub, all env files except example, node_modules, dist, coverage, tmp, logs, zip, and all `docs`. | Prevents common secret/history leakage; generated runtime cannot inspect governance docs. | EVD-057 |
| CI | Exactly three workflows: migration, learning content, learning media integrity. PR/push-main/manual triggers; read-only contents; Node 20. | No general regression gate, security scanning/SBOM/signing, deploy/promotion, GCP auth, IaC, rollback, or post-deploy verification pipeline. | EVD-058, EVD-059 |

## J. Public compatibility inventory

| Surface | Classification | Required constraint |
|---|---|---|
| Existing `/api/v1/**` route paths/methods | no contract change expected | Keep framework prefix and adapter-backed routes. |
| Learning-media upload intent/direct PUT | no contract change expected for provider swap | Preserve DTO, expiry semantics, required upload headers, CORS, and error mapping. |
| Learning-media completion | coordinated breaking change risk; new version potentially required | Current `POST .../:uploadId/complete` waits for READY/final file. Async submit/poll needs explicit owner strategy. |
| Generic signed downloads | no contract change expected | Preserve authorization before capability minting, expiry/content disposition, and provider-neutral error catalog. |
| Lesson playback | no path change expected; additive-compatible metadata possible | Preserve three app-facing paths, direct Range behavior, five-minute capability, tenancy checks. |
| Health | additive-compatible change possible | Add private/operational startup/liveness/readiness; do not silently repurpose public `/health` without compatibility plan. |
| WebSocket | no namespace change expected | Preserve `/api/v1/realtime`; origin, auth, Redis failure behavior require operational changes. |
| Swagger | additive operational control possible | Disabling/restricting production docs does not change application DTOs, but operations/developer access needs notice. |
| Announcement/email/import queue-backed operations | no contract change expected | Preserve persisted status/error semantics while separating producers and consumers. |
| Root `GET /api/v1` | no contract change expected or explicitly deprecate | Current public “Hello World” response should not be used as readiness. |

All classifications are planning classifications, not implementation approval
(EVD-060, EVD-061).

## K. Proposed GCP target-role mapping

Every row below is **RECOMMENDED** or **UNRESOLVED**. No target exists yet.

| Current source owner / startup | Proposed target | Future refactor | Contract / schema / data impact | IAM/security and rollback | Phase |
|---|---|---|---|---|---|
| `main.ts`, controllers, gateway; whole `AppModule` | Cloud Run API | role-selective composition; producers only; health/probes; graceful drain | no API path change; no schema/data change | API SA: Cloud SQL/Redis/GCS-signing/secret least privilege; roll back image and traffic | 1, 5, 6 |
| communication, email, import, dismissal and branding workers start in AppModule | Core Worker runtime | worker-only graph; no listener; explicit concurrency/drain/heartbeat; split repeat scheduler ownership | no expected public contract/schema change; queued payload compatibility required | worker SA scoped to queues, DB, secrets/providers; roll back only with compatible jobs | 1, 4, 5 |
| verifier currently runs in HTTP complete; media cleanup starts in AppModule | Media Worker runtime | async contract strategy, media-only worker, ephemeral-disk/concurrency limits, cleanup consumer | completion contract risk; existing schema may need additive state/lease fields; object migration depends on storage choice | media SA with narrow buckets/DB; rollback requires dual-compatible completion states | 2, 4, 5 |
| `prisma migrate deploy` scripts/CI | Migration Cloud Run Job | immutable artifact command, single-run deployment gate, separate DB identity/pool | migration-only; expand/contract and forward-fix; no seed | migration SA has DDL but no runtime ingress; failed deploy stops release | 3, 7 |
| three repeat registrations inside API graph | Maintenance/Scheduler job(s), exact form unresolved | singular scheduler ownership, idempotent commands, locks, audit/dry-run for deletion | no contract expected; possible additive execution ledger | maintenance SA; rollback disables schedule and runs reconciliation | 4 |
| PostgreSQL via one URL | Cloud SQL PostgreSQL HA | connector/private networking, per-role URLs/pools/timeouts, replicas only if justified | no immediate schema; data migration/restore plan required | separate DB roles; rollback requires snapshot/PITR and compatible schema | 3, 8 |
| all Redis uses one URL | Memorystore Redis | decide shared/separate queue and realtime instances; fail-closed realtime policy; TLS/network | no API/schema; live jobs/state migration must be planned | separate identities/network and observability; rollback must not split-brain queues | 4, 5 |
| concrete MinIO adapter/static keys | Google Cloud Storage production; MinIO local/test | provider-neutral port, GCS adapter, ADC/signing, provision buckets outside runtime | no intended API/schema; object copy/verification and metadata reconciliation may be required | signed-URL SA and bucket-scoped roles; rollback requires dual-read/copy integrity | 2, 5 |
| env-injected secrets/shared encryption key | Secret Manager | version policy, mounted/fetched delivery, separated keys, key IDs and re-encryption | no API; encrypted rows need staged migration | per-service secret access; rollback retains old decrypt keys | 5 |
| local/CI image only | Artifact Registry | build once, vulnerability/SBOM/provenance, promote immutable digest | none | CI publisher vs runtime pull identities; rollback selects prior digest | 7 |
| Nest text logs/no metrics/tracing | Cloud Logging/Monitoring/Trace as approved | structured redacted events, metrics, traces, dashboards, SLO alerts | error response IDs remain compatible | log privacy/access/retention; rollback must retain minimum health/alerts | 6 |

Multi-runtime deployment is from this one modular-monolith repository. The
mapping does not distribute domain ownership or authorize microservices.

## L. Shutdown behavior summary

Current providers contain useful destroy logic for Prisma, BullMQ,
Socket.IO/Redis, realtime state, and the presence timer. The missing top-level
shutdown-hook enablement means that proof is incomplete under SIGTERM. No
worker-level “stop accepting, await active job with deadline, persist lease,
then exit” contract or HTTP drain behavior exists. Future Cloud Run API, Core
Worker, and Media Worker roles each need explicit termination budgets and
idempotent recovery tests (EVD-015, EVD-016, EVD-018, EVD-026).

## Complete path-evidence index

The evidence register in `00-evidence-baseline.md` is the complete 85-record
index. The following path families are the reproducible exhaustive searches
behind aggregate claims:

| Aggregate | Complete baseline path/search boundary |
|---|---|
| Controllers | non-test `src/**` files containing `@Controller` |
| Entrypoints/gateways | `src/**` containing `NestFactory` / `@WebSocketGateway` |
| Lifecycle | non-test `src/**` containing `OnModuleInit`, `OnApplicationBootstrap`, `OnModuleDestroy`, `setInterval`, repeat options, or worker construction |
| BullMQ | non-test `src/**` references to `BullmqService`, queue constants, add/createWorker, repeat, attempts, backoff, and job IDs |
| Prisma clients | `src`, `prisma`, `scripts`, and `test` references to `PrismaClient` |
| Transactions | non-test `src/**` references to `$transaction` and transaction options |
| Redis | `src/infrastructure/queue/**`, `src/infrastructure/realtime/**`, `src/modules/health/**`, and all `REDIS_URL` references |
| Storage | `src/infrastructure/storage/**`; all non-test `src/**` references to `StorageService`, `SignedUrlService`, `MinioAdapter`, and storage error/types |
| File metadata | `prisma/schema.prisma::model File` and every relation to `File` |
| Environment | `src/config/env.validation.ts` plus repository-wide non-test `process.env` references |
| Docker/CI | `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `package.json`, `package-lock.json`, `.github/workflows/*.yml` |
| Contracts | `src/main.ts`, public controllers/DTOs/presenters, realtime gateway, health controller/service, and the exact tests run in EVD-004–EVD-006 |

## M. File and storage architecture correction

The verified current-state model is:

> Centralized storage infrastructure with fragmented upload, verification,
> authorization, replacement, and lifecycle policies.

This is neither a collection of independent feature storage systems nor one
universal upload/lifecycle system. Five concerns must remain distinct:

1. object-provider operations;
2. normalized `File` metadata/catalog records;
3. feature-specific upload workflows;
4. feature-specific authorization and validation;
5. replacement, retention, and physical-object lifecycle.

`StorageModule` registers `MinioAdapter` directly; both `StorageService` and
`SignedUrlService` inject it directly. `StorageService` centralizes physical
operations to a substantial degree, while MinIO-derived capability types leak
through it. `MinioAdapter` can create buckets from object-write and signed-PUT
request paths. Production GCS buckets must instead be provisioned by IaC.
Most managed bytes have a normalized `File`, but Grade MEDIA textual URLs and
the safe legacy branding URL fallback are explicit exceptions; no claim is
made that every product byte is represented by `File` or currently resides in
MinIO (EVD-036–EVD-039, EVD-066, EVD-080–EVD-081).

### Exact multipart entry inventory

All six families use Multer's in-memory `Buffer`. A missing Multer byte cap
does not mean unlimited acceptance: several use cases reject after the body is
already buffered. Sizes are therefore both validation limits and per-request
memory inputs.

| Family | Endpoint/controller and delivery | Maximum and accepted declared MIME | Detected-content validation / checksum | `File`, compensation, and feature relation | Replacement / physical deletion | Authorization and production implication |
|---|---|---|---|---|---|---|
| Generic Files | `POST /api/v1/files`; `uploads.controller.ts`; multipart `file`; memory; separate `GET /api/v1/files/:id/download` | 10 MiB; PDF, MP4/MP3/WebM audio, JPEG/PNG, plain text, MP4/WebM video | no magic, decode, media probe, or malware scan; SHA-256 | private `File`; new object deleted if metadata write fails; no feature relation | no replacement contract; soft delete is metadata-only | `files.uploads.manage`, school scope; edge/app/concurrency must budget at least the per-request buffer |
| Imports | `POST /api/v1/files/imports`; `imports.controller.ts`; multipart; memory | 10 MiB in use case; `text/csv`, `application/vnd.ms-excel` | declared MIME initially; later CSV/domain parsing is not an upload magic/malware check; SHA-256 | private `File` + import job; persistence failure removes object and soft-deletes File; enqueue failure retains FAILED job/source File | source intentionally retained on enqueue failure; later lifecycle is feature-owned | `files.imports.manage`; no Multer byte cap before buffering; simultaneous imports amplify memory |
| Student Documents | `POST /api/v1/students-guardians/students/:studentId/documents`; multipart or JSON existing `fileId`; memory for multipart | multipart delegates generic 10 MiB/nine MIME policy | same declared-only generic validation and SHA-256 for new upload | private `File` then `StudentDocument`; no compensation if relation creation fails after generic upload | same-type replacement repoints relation; old File/object retained; relation delete does not prove object deletion | `students.documents.manage` plus scoped student; no Multer byte cap before use-case rejection |
| Applicant Portal | `POST /api/v1/applicant-portal/requests/:requestId/documents` and `.../:documentId/replacements`; delete is not multipart; memory | 10 MiB; generic nine MIME values, narrowed by optional required-document accepted MIME policy | declared MIME/global size/policy only; no general magic-byte or malware scan; SHA-256 | private `File` + applicant document in transaction; new object removed if persistence fails | successful replacement preserves superseded document/File/object history; delete soft-deletes relation only | applicant identity/request/tenant ownership; no Multer byte cap, so edge and concurrency controls are required |
| School Branding | `POST /api/v1/settings/branding/logo`; `branding.controller.ts`; multipart; memory | 5 MiB; JPEG/PNG | signature, declared/detected MIME match, and image structure; SHA-256; no universal malware scanner | private `File` + `SchoolProfile.logoFileId`; new object compensation on failure | successful replacement/delete uses specialized soft-delete and cleanup queue; legacy safe URL fallback remains separate | `settings.branding.manage`; Multer and use-case limits both 5 MiB; specialized cleanup has its own risk controls |
| Student Avatar | `POST /api/v1/student/profile/avatar`; delete is not multipart; memory | 5 MiB; JPEG/PNG/WebP | declared image MIME and size only; no structure decoding/magic/malware; SHA-256 | private `File` + student avatar relation; newly created object/File compensated on failure | successful replacement/delete clears or changes relation but these use cases do not purge the prior object | `student.profile.avatar.manage`, current student scope; no Multer byte cap before use-case rejection |

Learning Media is deliberately excluded from this multipart count. It is a
specialized signed direct-PUT workflow (EVD-067–EVD-075).

### Feature relationship and blast-radius matrix

`YES` under object management means the feature's managed bytes pass through
`StorageService`; it does not mean the feature has its own storage client.
`CONDITIONAL` means a referenced `File` may have been created by another
workflow or a direct textual URL may be used.

| Feature | Bytes via `StorageService` | Uses `File` | Upload mechanism / validation | Ownership and download authorization owner | Replacement / cleanup | Direct textual URL | GCS / async-media / lifecycle blast radius |
|---|---|---|---|---|---|---|---|
| Generic Files | YES | YES | multipart; declared MIME/size only, SHA | permission + school-scoped Files use cases | metadata soft delete only; no universal object purge | NO | GCS high; async none; lifecycle high |
| Communication messages | CONDITIONAL | YES | existing `fileId`; relation checks size, school, deleted state, stored MIME versus message kind; inherits original upload trust | conversation/participant policy; Communication attachment download use case | relation removal is not proven object deletion | NO | GCS high; async none; lifecycle high |
| Communication announcements | CONDITIONAL | YES | existing `fileId`; announcement relation policy | announcement permissions/audience; Communication presenter/download boundary | unlink/archive does not prove physical delete | NO | GCS high; async none; lifecycle high |
| Homework assignment attachments | CONDITIONAL | YES | existing `fileId`; feature relation validation | teacher/school Homework boundary; authorized File routes | relation removal not proven physical delete | NO | GCS high; async none; lifecycle high |
| Homework submission attachments | CONDITIONAL | YES | existing `fileId`; student submission policy | student/target Homework boundary; authorized File routes | relation removal not proven physical delete | NO | GCS high; async none; lifecycle high |
| Attendance excuses | CONDITIONAL | YES | existing `fileId`; scoped File IDs and deduplicated links | excuse/student/school boundary; presenter points to protected File download | link removal not proven physical delete | NO | GCS high; async none; lifecycle high |
| Reinforcement proof files | CONDITIONAL | YES | existing private `fileId`; non-NONE requires file; proof type not matched to MIME | Student wrapper filters org, school, uploader, private visibility; Parent has owned-child download | relation retention follows submission; no universal purge | NO | GCS high; async none; lifecycle high |
| Applicant Portal documents | YES | YES | specialized multipart; declared/policy MIME, size, SHA | applicant request ownership; applicant download use case | superseded history retained; delete soft-deletes relation | NO | GCS high; async none; lifecycle/retention critical |
| Admissions Application documents | CONDITIONAL | YES | existing `fileId`; no upload in Admissions document use case | admissions/school use cases | relation update/review; retention is business-owned | NO | GCS high; async none; lifecycle high |
| Student documents | YES or CONDITIONAL | YES | multipart through generic policy or existing `fileId` | student/school document permissions | replacement/delete retain old physical object absent another policy | NO | GCS high; async none; lifecycle high |
| Student avatar | YES | YES | specialized multipart; declared image MIME/size, SHA | current Student App identity | prior object retained on successful replace/delete | NO | GCS high; async none; lifecycle high |
| School branding logo | YES for managed logo | YES for managed logo | specialized multipart; signature/MIME/structure, SHA | settings permission; public branding service owns safe delivery | specialized cleanup; guarded legacy fallback | CONDITIONAL legacy `logoUrl` | GCS high; async none; lifecycle high |
| Imports | YES | YES | multipart CSV; declared MIME/size, SHA, later parsing | import permissions and job ownership | FAILED enqueue retains operational source | NO | GCS high; async none; lifecycle high |
| Lesson Content / Learning Media | YES | YES | signed direct PUT; expected MIME/size; deep verifier | curriculum permissions and lesson audience; playback coordinator signs inline URL | upload-session claims, staging/final cleanup eligibility | NO | GCS high; async contract high only here; lifecycle high |
| Grade MEDIA questions | NO for textual URL | NO for `mediaUrl` | bounded string in question DTO/metadata; no managed upload/verification | grade assessment permissions; URL consumer owns access implications | metadata replacement only | YES | GCS adapter alone has no effect; async none; lifecycle outside File |
| Hero Journey | CONDITIONAL | YES for badge asset | existing `fileId`; scoped Hero validation; no feature multipart/client | Hero/reinforcement permissions; generic/feature presenters expose file reference | relation replacement; no universal physical cleanup | NO | GCS high for referenced File; async none; lifecycle high |
| Behavior | NO | NO | no File/media upload relation in current model | Behavior permission/tenant boundary | no file lifecycle | NO | no direct storage or async blast; lifecycle none |

App-facing modules consume core read models and `fileId` values; the matrix
does not assign them independent storage clients (EVD-038–EVD-039,
EVD-076–EVD-082).

### Direct textual URL exceptions

- Grade assessment create/update DTOs accept `mediaUrl` as a string of at most
  2,000 characters. `mediaUrl` and related media fields are merged into
  question metadata. A GCS adapter cutover cannot migrate those values.
  Whether any existing rows contain MinIO, private, or other provider URLs is
  **UNVERIFIED** until a data inventory runs.
- Managed branding uses `File`, but logo resolution can fall back to a
  syntactically safe external HTTPS `SchoolProfile.logoUrl`. Existing values
  must be classified as managed internal File, approved external HTTPS,
  legacy provider URL requiring migration, invalid/unsafe, or null. No
  assumption is made that all legacy URLs point to MinIO.

Existing-row remediation for both exceptions branches on PRD0-Q004:
clean-start evidence can make it `N/A_WITH_EVIDENCE`; a real migration requires
inventory, transformation, reconciliation, retention, and cutback proof
(EVD-080–EVD-081).

### Verified lifecycle findings

1. `FilesRepository.softDeleteFile` changes `deletedAt` only.
2. No universal physical-object lifecycle service exists.
3. Generic upload deletes the new object if metadata persistence fails.
4. Import persistence failure compensates object/File; enqueue failure retains
   a FAILED import record and its source File.
5. Branding has stronger validation and specialized cleanup.
6. Avatar upload compensates newly created state on failure, but successful
   replacement/delete does not purge the prior object through those use cases.
7. Applicant replacement preserves superseded document/File history and does
   not delete the prior object on the successful path.
8. Applicant delete soft-deletes its relation and does not physically delete.
9. Student Document replacement has no universal old-object cleanup contract.
10. Communication/Homework relation removal is not automatic object deletion
    unless a separate exact path proves it.

Retained objects are classified as active reference, historical/audit
retention candidate, intentionally retained operational source, unlinked
candidate, or unknown pending reconciliation. “Retained” is not synonymous
with “orphan”; a superseded admissions document may be evidence that policy
requires retaining (EVD-066, EVD-069–EVD-073, EVD-076–EVD-077).

### Security and validation findings

- Generic files trust declared MIME and enforce size; they do not implement
  detected-content or malware validation.
- Applicant documents enforce declared MIME, global size, and optional
  required-document MIME policy, but no general magic-byte/malware validation.
- Student Avatar checks declared image MIME and size, not image decoding.
- Branding checks signature, declared/detected MIME, and structure.
- Learning Media performs purpose-specific deep
  magic/container/codec/duration/dimension verification.
- Reinforcement supports `IMAGE`, `VIDEO`, `DOCUMENT`, `NONE`; non-NONE
  Student submissions require a private, tenant/school/uploader-owned
  `proofFileId`, but proof type is not enforced against allowed/detected MIME.
- Communication checks attachment size, school, deleted state, and stored MIME
  versus kind, but inherits the original File upload's trust level.
- Malware scanning is not a universal current `File` pipeline.
- Direct textual URLs bypass managed `File` verification and lifecycle.

These are missing prevention/detection controls; they are not claims that a
malicious file is present (EVD-068, EVD-071–EVD-074, EVD-076, EVD-078).

### Parent messaging upload gap

The default Parent role includes `communication.messages.send` but not
`files.uploads.manage`. The Parent App accepts attachment `fileId` values and
has authorized attachment download/preview routes, but none of the six
multipart families is Parent-specific. A custom role could theoretically gain
generic upload permission; that is not an approved default Parent media-upload
contract. PRD0-D036 / PRD0-Q031 must choose a bounded Parent upload, a narrowly
scoped shared permission, text-only/no-new-upload, or another explicit
contract. Phase 0A-R1 does not select or implement it (EVD-079).

### Multipart memory and concurrency implication

Every current multipart family receives a memory `Buffer`. Production
acceptance therefore needs edge and application request caps, route-specific
limits, Cloud Run concurrency and instance memory, simultaneous-upload load
evidence, upload rate limits, deterministic rejection behavior, and no
unbounded generic limit increase. Large payloads should use direct-to-object
storage. Current limits are not identical, and missing Multer byte caps on
some routes increase pre-validation memory exposure (EVD-067–EVD-073).

### Incremental target boundary and lifecycle rule

The proposed provider boundary is:

```text
ObjectStoragePort
|- MinioStorageAdapter
`- GcsStorageAdapter
```

Above it, evolve `StorageService` (or a provider-neutral equivalent),
`FilesRepository`, `RegisterFileMetadataUseCase`, feature authorization
adapters, typed upload-policy contracts, and a future reference-aware
reconciliation/lifecycle component. A giant replacement `FileCatalogService`
is not a prerequisite. `FileUploadSession` remains Learning Media-specific
unless another need is separately approved.

A naive single reference count is insufficient. Future lifecycle decisions
must evaluate active and historical references, upload-session state,
retention, legal/audit hold, tenant ownership, replacement state, processing
and cleanup claims, object existence, and deletion attempt/retry state. The
first implementation is report-only/reconciliation-first. Automated
destructive collection cannot close until the reference graph, retention
classes, legal holds, dry-run inventory, false-positive review,
rollback/recovery, and separate production enablement are approved.

`originPurpose`, `verificationLevel`, and `retentionClass` are proposed design
candidates, not approved schema fields. Before any later schema proposal, the
owner must decide derivability, multi-purpose use, whether retention belongs
to `File` or the business relation, backfill, PRD0-Q004 branch, compatibility,
and rollback. Phase 0A-R1 makes no Prisma change.

## Inventory conclusion

The current baseline is a functionally tested modular monolith with strong
migration and learning-media CI evidence. It is not yet a production-separated
runtime: one process builds the current `AppModule` graph, while 167 non-test
files declare controllers (complete declaration-to-route reachability remains
to be traced); the graph also contains one gateway, seven workers, three repeat
schedules, and a presence timer. All Redis purposes share one URL; storage is
concretely MinIO/static-key based; media completion is synchronous; and
health/observability do not provide production orchestration or incident
evidence. Target statements in this document remain recommendations or owner
decisions until Phase 0B.
