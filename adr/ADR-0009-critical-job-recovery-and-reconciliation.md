# ADR-0009: Critical Job Recovery and Reconciliation

## Status

Accepted

## Approval authority

- Owner: Abdallah
- Approved at: `2026-08-06T10:30:34+03:00`
- Timezone: Africa/Cairo
- Approval capacities: Operations Owner, Release Owner, Architecture Owner
- Accepted owner question: PRD0-Q017 option A
- Owned decision: PRD0-D015
- Implementation gate: PRD3-G03

## Context

BullMQ and Queue Redis coordinate at-least-once execution, retries, locks,
delays, and repeat schedules. They are not durable business truth. Copying
Redis keys, old job payloads, repeat metadata, RDB snapshots, or AOF files can
replay stale tenant context and external side effects whose outcome is already
known or ambiguous.

The seven existing application queues already have domain-specific persisted
state in PostgreSQL and, for file cleanup, object storage. They also have seven
assigned consumers. Recovery must preserve that topology and reconstruct only
work still required by current domain policy.

## Decision

### Source of truth and shared restoration

Redis queue state is disposable. Recovery uses PostgreSQL domain rows,
object-storage existence or absence, approved deterministic job-ID builders,
and current application policy. It never copies Redis data or treats failed
BullMQ jobs as business truth.

The shared persisted-truth helper requires a deterministic job ID and a newly
reconstructed payload. Waiting, active, delayed, and prioritized jobs are
preserved. A completed or failed job may be replaced only while persisted
truth still requires work, under a bounded `SET NX PX` lock, a post-lock state
recheck, and an owner-matching lock release.

The Maintenance Scheduler owns seven current repeat definitions in process.
Definitions become active only after successful BullMQ registration. A Queue
Redis reconnect serially restores missing definitions from current code, and
readiness fails until desired and active inventories agree. API, Core Worker,
and Media Worker own zero repeat registrations.

### Queue policies

| Queue                             | Persisted truth                                                 | Recovery window                                      | Retry and idempotency decision                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `communication-notifications`     | eligible published announcement plus notification/delivery rows | 24 hours or announcement expiry, first boundary wins | existing deterministic generation ID, 3 attempts, exponential 1,000 ms; idempotent create-missing transaction                                  |
| `communication-notification-push` | delivery, per-token attempts, current active device tokens      | 24 hours                                             | process only new, pending, or retryable-failed token attempts; never resend known sent or permanent outcomes                                   |
| `school-email-delivery`           | batch, recipient, metadata, failure reason                      | 72 hours                                             | deterministic recipient job and RFC Message-ID; ambiguous post-invocation outcome becomes non-automatic `outcome_unknown`                      |
| `files-imports`                   | ImportJob, File metadata, object existence, report JSON         | 24 hours                                             | deterministic ImportJob ID, 3 attempts, exponential 1,000 ms; report JSON carries retryable/terminal classification and stale-processing lease |
| `dismissal-request-expiry`        | active request status, event, audit, notifications              | until request leaves an active status                | one-minute discovery, 3 attempts, exponential 1,000 ms; transactional compare/update and aggregate mutation failure                            |
| `learning-media-cleanup`          | upload-session cleanup state/claims and object state            | until terminal cleanup state                         | retained deterministic IDs, database claims, stale-claim recovery, 5 attempts, exponential 1,000 ms, delete-and-confirm-absent                 |
| `settings-branding-logo-cleanup`  | eligible soft-deleted private File and object state             | until object absence or source ineligibility         | deterministic `branding-logo-cleanup-<fileId>` and existing protected reconciliation/deletion rules                                            |

The reconciliation cadences are five minutes for communication generation,
push, email, and imports; one minute for dismissal; and fifteen minutes for
Learning Media and Branding.

### External side effects

Processing is at least once. Persisted effects are idempotent where each queue
proves its domain guard. There is no claim of exactly-once external delivery.

Push retries exclude token attempts already `SENT`, permanently `SKIPPED`, or
permanently `FAILED`. Retryable attempts keep the aggregate delivery pending
and make the Worker throw a sanitized retryable failure.

Email uses a deterministic Message-ID persisted before provider invocation.
The internal transport contract distinguishes `PRE_PROVIDER_ATTEMPT`,
`KNOWN_PROVIDER_REJECTION`, and `AMBIGUOUS_AFTER_PROVIDER_ATTEMPT`. Only the
ambiguous phase, including a local failure after possible provider acceptance,
becomes `outcome_unknown`; automatic retry and reconciliation are prohibited
for that state.

Push, School Email, and Import reconciliation separately determine execution
eligibility and terminalization eligibility. Inactive or deleted tenants,
recipients, actors, and required sources cannot hide open persisted work.
Ineligible work is not executed externally; it receives a stable terminal
classification while already-known successful effects remain preserved.
Automatic recovery does not fabricate a user actor foreign key.

### Manual replay

Manual replay is not an endpoint and is never silently triggered. It requires
Abdallah acting as Operations and Release Owner, an immutable audit record,
and tenant/source scope. Known-success side effects are excluded. Push replay
may select only non-SENT attempts. Email `outcome_unknown` requires explicit
approval and investigation before any action.

## Consequences

- Empty Queue Redis can be replaced without copying old Redis material.
- Current application definitions restore repeat schedules after reconnect.
- Finished jobs can be recreated when durable truth still requires work,
  without removing current work or trusting an old payload.
- Recovery logic remains domain-specific; no generic job ledger or dead-letter
  queue is introduced.
- Provider ambiguity is conservative, so some email outcomes require manual
  resolution rather than risking duplicate delivery.

## Verification

PRD3-G03 uses focused unit/contract tests and disposable local PostgreSQL,
Redis, and S3-compatible object storage. The real recovery harness applies the
already-committed migrations to the disposable database, seeds actual
production models, starts from locally present immutable images with
loopback-only random ports, replaces Queue Redis with an empty no-volume
instance, proves `DBSIZE=0` before release, restores seven schedules from
current definitions, invokes production reconcilers and worker dispatch
classes, and verifies exact owned-resource cleanup. It creates no synthetic
domain-truth table and uses no generic evidence Worker.

Evidence is recorded in
`docs/production-readiness/phase-3/06-critical-queue-recovery-and-reconciliation-evidence.md`.

## Compatibility

This decision changes no public route, method, status, DTO, authorization,
tenant boundary, Socket.IO contract, queue name, existing primary job name,
existing primary payload, consumer assignment, Prisma schema, migration,
database role, dependency, lockfile, G02 Redis topology/budget, storage
eligibility rule, or Learning Media synchronous HTTP completion.
