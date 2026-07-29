# Observability

How the backend reports what it is doing — to developers, to operators, and to the future.

## 1. Three Pillars

- **Logs** — what happened, in order.
- **Metrics** — aggregate measurements over time.
- **Traces** — causal chains across requests and jobs.

In V1 we focus on **logs + basic metrics**. Distributed tracing is deferred to V2 unless a clear pain point emerges.

## 2. Logging

### Library

Structured JSON logs via **pino** (through `nestjs-pino`).

### Log Levels

| Level | Use for                                                    |
| ----- | ---------------------------------------------------------- |
| fatal | Process is about to die                                    |
| error | An unhandled exception or unrecoverable error occurred     |
| warn  | Something unexpected but recoverable (retries, fallbacks)  |
| info  | High-level business events (login, submission, decision)   |
| debug | Detailed flow information, enabled in development only     |
| trace | Very verbose, enabled only during targeted debugging       |

Production baseline: `info`. Development: `debug`.

### Required Fields on Every Log

Every log line (automatically added by the logger middleware) must include:

```json
{
  "timestamp": "2026-04-16T14:22:00.000Z",
  "level": "info",
  "message": "Login successful",
  "requestId": "01HQK...",
  "actorId": "user-uuid-or-anonymous",
  "userType": "school_user",
  "schoolId": "school-uuid-or-null",
  "organizationId": "org-uuid-or-null",
  "module": "iam.auth",
  "action": "login",
  "outcome": "success",
  "durationMs": 87
}
```

### PII in Logs

- Phone, email, national ID: **redacted** (`ph***33`, `a***@example.com`).
- Passwords: **never logged**. Not even hashed.
- JWTs: **never logged**. Log `token.<last-4-chars>` if needed for tracing.
- Names: allowed in logs (needed for operational support).

Redaction is applied via pino's `redact` configuration in `src/infrastructure/logger/pino-logger.service.ts`.

### Log Event Names

Business events use the same `module.action.outcome` pattern as error codes:

- `auth.login.success`
- `auth.login.failure`
- `admissions.application.submitted`
- `attendance.session.submitted`
- `grades.assessment.published`
- `reinforcement.review.approved`

Emit these as `info` level logs on every happy path, and `warn` or `error` on failure paths.

## 3. Metrics

### Library

**prom-client** exposing `/api/v1/metrics` (protected — only accessible from internal network / monitoring scraper).

### V1 Metrics

**HTTP:**
- `http_requests_total{method, route, status}`
- `http_request_duration_seconds{method, route}` (histogram)

**Auth:**
- `auth_login_attempts_total{outcome}`
- `auth_active_sessions` (gauge)

**DB:**
- `prisma_query_duration_seconds{model, operation}` (histogram)
- `prisma_query_errors_total{model, operation}`

**Queue:**
- `bullmq_jobs_total{queue, status}`
- `bullmq_job_duration_seconds{queue}` (histogram)

**Storage:**
- `storage_uploads_total{outcome}`
- `storage_upload_bytes_total`

**Business:**
- `admissions_applications_submitted_total{school_id}` (via counter)
- `attendance_sessions_submitted_total{school_id}`
- `grades_assessments_published_total{school_id}`

These are added incrementally; no need to ship all on Day 1.

## 4. Request Correlation

- Every incoming HTTP request receives a `requestId` (ULID) in middleware.
- The `requestId` is attached to the `RequestContext`.
- Every log emitted during that request carries the `requestId`.
- The `X-Request-Id` response header echoes the `requestId` back to the caller.
- If the caller sends an `X-Request-Id` header, we honor it (for client-initiated correlation).

## 5. Error Tracking

- Unhandled exceptions are caught by the global filter.
- In production, errors are forwarded to **Sentry** (or equivalent) via the logger.
- Sentry DSN is in env: `SENTRY_DSN` (optional).
- Local development: errors print to console with full stack.

## 6. Health Check

`GET /api/v1/health` returns:

```json
{
  "status": "ok",
  "version": "0.0.1",
  "timestamp": "2026-07-28T14:22:00.000Z"
}
```

This is a public compatibility endpoint. It does not query or expose database,
Redis, storage, queue, email, push, provider, tenant, exception, or topology
state.

ADR-0010 requires separate protected role-specific startup, liveness, and
readiness probes. The application serves them from a same-process Node HTTP
management listener on `APP_PROBE_PORT`; the Nest application remains the only
application graph and continues to serve public traffic on `APP_PORT`.

The management listener exposes only these internal route families:

- `/internal/probes/api/{startup|liveness|readiness}`
- `/internal/probes/core-worker/{startup|liveness|readiness}`
- `/internal/probes/media-worker/{startup|liveness|readiness}`

`APP_PROBE_PORT` is bound inside the container so a future Cloud Run v2
container probe can select it explicitly. The application/container contract
keeps it separate from `APP_PORT`, and the canonical Docker proof publishes
only `APP_PORT`. Both the exact management paths and their `/api/v1`-prefixed
forms return `404` through the normal Nest listener. This port boundary
supplies probe protection without a static token, JWT, spoofable header, or
path-obscurity claim.

No live Cloud Run service was configured or validated by Phase 1C. Phase 8
deployment/IaC must configure `APP_PORT` as the sole Cloud Run service ingress
port and explicitly target `APP_PROBE_PORT` from the container startup,
liveness, and readiness probes. It must not expose `APP_PROBE_PORT` as another
service ingress port.

Operational responses contain only `status`, `version`, and `timestamp`.
Startup remains unavailable until validated configuration, Nest
initialization, both listeners, installed signal/shutdown ownership, and
current local role capabilities are ready. Liveness is process-local and
performs no external I/O. Readiness uses bounded, non-destructive role
dependency checks and becomes unavailable while the application is draining.
Each dependency keeps at most one underlying readiness operation registered
until that operation actually settles, even after an individual caller times
out.

API realtime readiness covers both the Socket.IO adapter Redis clients and the
presence/typing state-store Redis client. Process-local presence/typing
fallback remains a product-compatibility behavior, but it is not production
readiness: readiness stays unavailable until the state store reconnects and
reconciles all locally owned presence and unexpired typing state. Adapter and
state-store checks use independent dependency flights, so a timeout or failure
on one cannot release or duplicate an operation owned by the other. Presence
replay preserves every locally connected socket and restores the newest user
timestamp with bounded TTLs. Typing replay preserves original expiry times,
omits expired entries, and orders shared-index TTL updates so the longest
remaining active entry governs the index.

The local typing shadow is bounded by one service-owned, unreferenced sweep
timer. The sweep runs through the state store's serialized mutation lane,
removes expired owners and empty conversation/school containers, cannot
overlap reconciliation, and is cleared and awaited before Redis teardown.

Socket.IO adapter publisher/subscriber clients use fixed connect and command
deadlines. Adapter readiness retains one shared underlying dual-client ping
flight, observes both child commands rather than failing fast, and returns a
fixed unavailable outcome when either child fails or the caller deadline
expires. Graceful client close is bounded; a hung `QUIT` is followed by one
owned forced disconnect.

Socket.IO adapter recovery moves synchronously to a non-admitting state,
disconnects existing sockets, awaits presence cleanup, and only then replaces
the adapter. Handshakes are blocked before authentication and checked again
after authentication through an adapter generation boundary. Clients
reauthenticate and rejoin baseline and conversation rooms after recovery; the
implementation does not silently hot-swap an adapter beneath connected
sockets. Realtime readiness remains unavailable if either reconciliation or
adapter recovery is incomplete or fails.

Core and Media assigned-consumer readiness requires each locked BullMQ worker
to have a running, unpaused processing loop; registration alone is
insufficient. The Core and Media paths remain reusable dependency manifests;
they do not claim that Phase 2 runtime separation already exists.

## 7. Audit Logs vs Application Logs

Do not confuse them:

| Audit Log                                 | Application Log                              |
| ----------------------------------------- | -------------------------------------------- |
| Persisted to `audit_logs` table           | Stdout, then collected by log pipeline       |
| Immutable, compliance-grade               | Rolling, may be dropped at volume            |
| Per sensitive business action             | Per interesting technical event              |
| Queried by admins via UI                  | Queried by developers via log tooling        |
| Defined in `SECURITY_MODEL.md` section 6  | Defined here                                 |

Both co-exist. A password reset emits both:
- An audit log row in `audit_logs` (`iam.user.password_reset`, compliance).
- An application log line (`info`, correlation + debugging).

## 8. Dismissal Push Notifications

Dismissal push delivery uses the existing communication push queue and Firebase/FCM provider abstraction. Push is best-effort; failures must not roll back Dismissal request state changes, notification rows, audit rows, or realtime events.

Allowed log fields for Dismissal push are notification type, recipient/attempt counts, success/failure counts, surface, provider error code/class, and duration. Do not log raw device tokens, pickup codes, pickup-recipient tokens, guardian ids, student-guardian ids, parent coordinates, client request ids, socket rooms, socket ids, raw metadata, token hashes, or token ciphertext.

## 8. Performance Budget

- P95 HTTP response time: **< 500ms** for authenticated API in V1.
- P99 HTTP response time: **< 2000ms** for authenticated API in V1.
- Login endpoint: P95 < 800ms (argon2 is expensive).
- Upload endpoint: untimed (dominated by network).

Breaches trigger investigation — they are a real operational signal, not a goal.

## 9. What We Don't Do in V1

- No distributed tracing (no OpenTelemetry wiring). Single process = not needed yet.
- No APM vendor integration beyond Sentry-style error capture.
- No custom dashboards. Prometheus + Grafana are operational choices, not V1 deliverables.
- No log search UI. Local dev reads stdout; prod uses whatever the host provides.
