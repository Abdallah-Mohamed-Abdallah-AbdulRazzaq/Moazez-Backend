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
  "timestamp": "2026-04-16T14:22:00.000Z",
  "version": "0.1.0",
  "checks": {
    "database": { "status": "ok", "durationMs": 3 },
    "redis":    { "status": "ok", "durationMs": 1 },
    "storage":  { "status": "ok", "durationMs": 12 }
  }
}
```

- Any failing check → overall status `degraded` (still 200 OK).
- Any failing critical check (database) → 503 Service Unavailable.

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
