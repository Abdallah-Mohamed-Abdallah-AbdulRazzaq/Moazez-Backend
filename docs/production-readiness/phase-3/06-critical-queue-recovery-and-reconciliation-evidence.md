# Phase 3 — Critical Queue Recovery and Reconciliation Evidence

## Document control

| Field              | Value                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Phase              | `PHASE_3`                                                                                              |
| Gate               | `PRD3-G03`                                                                                             |
| Branch             | `chore/production-readiness-3-cloud-sql`                                                               |
| Baseline           | `adcf3a0b679c155ba24e6f09f2b715a1bad03ac7`                                                             |
| Status             | `PRD3-G03=IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE`                                                |
| Owner              | Abdallah                                                                                               |
| Approval timestamp | `2026-08-06T10:30:34+03:00`                                                                            |
| Scope              | Seven existing queues/consumers, persisted-truth recovery, local evidence; no cloud access or mutation |

PRD0-Q017 option A and ADR-0009 are accepted. Queue Redis is disposable
coordination state. No RDB, AOF, Redis key, BullMQ payload, failed-job payload,
or repeat metadata was copied. Processing is at least once. This candidate
claims idempotent persisted effects only where proven and does not claim
exactly-once external delivery.

## Queue policies

### `communication-notifications`

| Policy field                | Decision                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Queue                       | `communication-notifications`                                                                        |
| Primary job                 | `communication.announcement.notifications.generate`                                                  |
| Persisted truth             | eligible `PUBLISHED` announcement plus current notification/delivery rows                            |
| Job ID                      | existing `communication-announcement-notifications-<schoolId>-<announcementId>` builder              |
| Attempts/backoff            | 3; exponential 1,000 ms                                                                              |
| Retryable failures          | queue/dependency failure and bounded create-missing replay while source remains eligible             |
| Terminal failures           | source not published, inactive tenant, announcement expired, or publication older than 24 hours      |
| Idempotency mechanism       | deterministic ID plus existing transactional create-missing uniqueness                               |
| Reconciliation cadence      | 5 minutes                                                                                            |
| Recovery window             | 24 hours or announcement expiry, whichever occurs first                                              |
| Manual replay rule          | approved/audited tenant and announcement scope; only while the same eligibility predicates hold      |
| Scheduler owner             | Maintenance Scheduler                                                                                |
| Consumer owner              | existing Core Worker communication consumer                                                          |
| Redis-loss behavior         | bounded pages reconstruct eligible tenant context and historical actor identity when present; nullable actor fields remain null without fabrication |
| Provider ambiguity behavior | no direct external provider call in generation; delivery rows remain separate truth                  |

### `communication-notification-push`

| Policy field                | Decision                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Queue                       | `communication-notification-push`                                                                                    |
| Primary job                 | `communication.notification.push.send`                                                                               |
| Persisted truth             | notification delivery, per-token push attempts, current active device tokens                                         |
| Job ID                      | existing `communication-push-<deliveryId>` builder                                                                   |
| Attempts/backoff            | 3; exponential 1,000 ms                                                                                              |
| Retryable failures          | documented provider quota, unavailable, internal, and unknown codes; pending/new token attempt                       |
| Terminal failures           | known sent, permanent skipped/failed token, invalid token, recovery-window expiry, or ineligible tenant/source/recipient |
| Idempotency mechanism       | unique delivery/token attempt plus process-only-new/pending/retryable selection                                      |
| Reconciliation cadence      | 5 minutes                                                                                                            |
| Recovery window             | 24 hours                                                                                                             |
| Manual replay rule          | approved/audited tenant and delivery scope; predicate is attempt status not `SENT`; known success is always excluded |
| Scheduler owner             | Maintenance Scheduler                                                                                                |
| Consumer owner              | existing Core Worker push consumer                                                                                   |
| Redis-loss behavior         | eligible delivery IDs are reconstructed with nullable historical actor fields; current token rows create only missing attempts |
| Provider ambiguity behavior | retryable attempt stays pending and throws sanitized retry; successful token is never resent                         |

### `school-email-delivery`

| Policy field                | Decision                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue                       | `school-email-delivery`                                                                                                                                                                           |
| Primary job                 | `send-recipient`                                                                                                                                                                                  |
| Persisted truth             | batch, recipient, metadata, status, and failure reason                                                                                                                                            |
| Job ID                      | existing `school-email-delivery:<batchId>:<recipientId>` builder                                                                                                                                  |
| Attempts/backoff            | 3; exponential 1,000 ms                                                                                                                                                                           |
| Retryable failures          | provable pre-provider connection/config dependency failure                                                                                                                                        |
| Terminal failures           | sent, skipped, cancelled, known rejection, invalid recipient input, expired recovery window, or `outcome_unknown` quarantine                                                                      |
| Idempotency mechanism       | deterministic recipient ID and RFC Message-ID persisted before invocation                                                                                                                         |
| Reconciliation cadence      | 5 minutes                                                                                                                                                                                         |
| Recovery window             | 72 hours                                                                                                                                                                                          |
| Manual replay rule          | approved/audited tenant, batch, and recipient scope; automatic predicates are `QUEUED`, `PENDING`, or retryable `FAILED`; `outcome_unknown` requires explicit Abdallah approval and investigation |
| Scheduler owner             | Maintenance Scheduler                                                                                                                                                                             |
| Consumer owner              | existing Core Worker school-email consumer                                                                                                                                                        |
| Redis-loss behavior         | eligible automatic predicates are reconstructed; ineligible rows are terminalized; only eligible stale `SENDING` becomes `outcome_unknown`                                                        |
| Provider ambiguity behavior | typed pre-provider failures follow retryable/terminal policy, known rejection is terminal, and only ambiguous after-attempt failure becomes `outcome_unknown`                                     |

The stable Message-ID reduces accidental duplicates but cannot guarantee
exactly-once SMTP delivery.

### `files-imports`

| Policy field                | Decision                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Queue                       | `files-imports`                                                                                                           |
| Primary job                 | `validate-import`                                                                                                         |
| Persisted truth             | ImportJob, uploaded File metadata, stored-object existence, and report JSON                                               |
| Job ID                      | `ImportJob.id`                                                                                                            |
| Attempts/backoff            | 3; exponential 1,000 ms                                                                                                   |
| Retryable failures          | enqueue unavailability and transient storage/dependency failure                                                           |
| Terminal failures           | confirmed missing metadata/object, ineligible tenant/source, invalid/unsupported input, or 24-hour expiry                 |
| Idempotency mechanism       | conditional state claim; retryable failed and stale processing may re-enter processing                                    |
| Reconciliation cadence      | 5 minutes                                                                                                                 |
| Recovery window             | 24 hours; processing lease 5 minutes                                                                                      |
| Manual replay rule          | approved/audited tenant and ImportJob scope; predicate is pending, retryable failed, or stale processing and not terminal |
| Scheduler owner             | Maintenance Scheduler                                                                                                     |
| Consumer owner              | existing Core Worker import consumer                                                                                      |
| Redis-loss behavior         | worker reconstructs organization/school/actor context from the persisted ImportJob relation before execution              |
| Provider ambiguity behavior | transient object-store failure is retryable; confirmed absence is terminal                                                |

Recovery classification is stored inside existing report JSON and is not
added to the public response presenter.

### `dismissal-request-expiry`

| Policy field                | Decision                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Queue                       | `dismissal-request-expiry`                                                                      |
| Primary job                 | `expire-stale-dismissal-requests`                                                               |
| Persisted truth             | active request rows, persisted events, audit records, and notifications                         |
| Job ID                      | existing one-minute repeat ID                                                                   |
| Attempts/backoff            | 3; exponential 1,000 ms                                                                         |
| Retryable failures          | one or more transactional candidate mutations fail                                              |
| Terminal failures           | request has left an active status or no longer crosses its current expiry threshold             |
| Idempotency mechanism       | row lock and compare-and-update; event/audit/notification writes share the transaction          |
| Reconciliation cadence      | 1 minute                                                                                        |
| Recovery window             | until request leaves active status                                                              |
| Manual replay rule          | approved/audited tenant/request scope; predicate is active status plus current expiry threshold |
| Scheduler owner             | Maintenance Scheduler                                                                           |
| Consumer owner              | existing Core Worker dismissal consumer                                                         |
| Redis-loss behavior         | the next minute discovers active expired requests directly from PostgreSQL                      |
| Provider ambiguity behavior | realtime publication is separate best effort and never repeats a committed mutation by itself   |

### `learning-media-cleanup`

| Policy field                | Decision                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Queue                       | `learning-media-cleanup`                                                                                          |
| Primary job                 | `cleanup` (with `discover` reconciliation)                                                                        |
| Persisted truth             | upload-session cleanup eligibility, claims, stale claim timestamp, and object absence/existence                   |
| Job ID                      | existing `learning-media-cleanup-<uploadId>-<target>` builder                                                     |
| Attempts/backoff            | 5; exponential 1,000 ms                                                                                           |
| Retryable failures          | storage outage, unfinished deletion confirmation, or stale cleanup claim                                          |
| Terminal failures           | cleanup state terminal, object confirmed absent, or source no longer eligible                                     |
| Idempotency mechanism       | database claim, deterministic ID, finished replacement lock, delete-and-confirm-absent                            |
| Reconciliation cadence      | 15 minutes                                                                                                        |
| Recovery window             | until cleanup reaches terminal domain state                                                                       |
| Manual replay rule          | approved/audited tenant/upload/target scope; current cleanup-eligible predicate and absence confirmation required |
| Scheduler owner             | Maintenance Scheduler                                                                                             |
| Consumer owner              | existing Media Worker cleanup consumer                                                                            |
| Redis-loss behavior         | discovery reconstructs one job per eligible upload/target and reclaims stale claims                               |
| Provider ambiguity behavior | deletion must be confirmed absent before persisted completion                                                     |

### `settings-branding-logo-cleanup`

| Policy field                | Decision                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Queue                       | `settings-branding-logo-cleanup`                                                                                                        |
| Primary job                 | `delete-object` (with `reconcile`)                                                                                                      |
| Persisted truth             | eligible soft-deleted private File, tenant ownership, and current object state                                                          |
| Job ID                      | `branding-logo-cleanup-<fileId>`                                                                                                        |
| Attempts/backoff            | 5; exponential 5,000 ms                                                                                                                 |
| Retryable failures          | storage outage or queue command failure while object remains eligible                                                                   |
| Terminal failures           | object absent or File no longer passes existing eligibility rules                                                                       |
| Idempotency mechanism       | deterministic ID, shared finished replacement lock, not-found success                                                                   |
| Reconciliation cadence      | 15 minutes                                                                                                                              |
| Recovery window             | until object absence or source ineligibility                                                                                            |
| Manual replay rule          | approved/audited tenant/File scope; current path, bucket, MIME, size, ownership, soft-delete, and object-exists predicates all required |
| Scheduler owner             | Maintenance Scheduler                                                                                                                   |
| Consumer owner              | existing Core Worker branding consumer                                                                                                  |
| Redis-loss behavior         | reconciliation rebuilds cleanup from File rows and object state                                                                         |
| Provider ambiguity behavior | object not found is successful terminal behavior; no deletion authorization is broadened                                                |

The pre-existing orphan grace period, path expression, bucket, MIME, tenant,
and size protections remain unchanged.

## Manual replay procedure

There is no public replay endpoint. An operator must:

1. obtain a dated approval from Abdallah in both Operations Owner and Release
   Owner capacities;
2. record tenant ID, source type/ID, queue, reason, before-state, allowed
   predicate, and excluded known-success effects in the audit trail;
3. query current PostgreSQL and object state, never a retained BullMQ payload;
4. verify the exact queue predicate from the tables above;
5. reconstruct the current payload and deterministic ID through the approved
   application builder;
6. for push, select only attempt rows whose status is not `SENT`;
7. for email `outcome_unknown`, stop unless the explicit approval also records
   provider investigation and accepts duplicate-delivery risk;
8. run one scoped replay, record the resulting persisted transition and
   provider-call count, and reconcile before considering another action.

## Verification inventory

The focused suite covers governance, seven queue/consumer ownership, seven
schedule definitions, desired-versus-active readiness, concurrent repeat
restoration, finished-job locking, current-work preservation, fresh payload
use, queue-specific duplicate/outage/window behavior, tenant context, stable
sanitized codes, G02 compatibility, ineligible-source terminalization, the
three School Email transport phases, actorless Push and generation worker
contexts, inactive/deleted/no-actor announcement recovery, actual primary
Communication generation, production worker poison dispatch, and cleanup
controls.

| Measured scenario                                                      | Count/result                           |
| ---------------------------------------------------------------------- | -------------------------------------- |
| Empty replacement Redis before reconstruction                          | `DBSIZE=0`                             |
| Unknown/poison job names rejected by production worker dispatch        | `7/7`; stable sanitized code per queue |
| Open ineligible Push/Email/Import rows after reconciliation            | `0`                                    |
| Ineligible persisted outcomes terminalized                             | Push `2`, Email `1`, Import `2`        |
| Known-success Push token replay                                        | `0`                                    |
| Email `outcome_unknown` automatic replay                               | `0`                                    |
| Recovered announcement with inactive historical publisher              | `1`                                    |
| Actual generated `CommunicationNotification` rows                      | `1`                                    |
| Actual generated IN_APP delivery rows                                  | `1`                                    |
| Actual generated PUSH delivery rows                                    | `1`                                    |
| Duplicate-generation additional notification/IN_APP/PUSH rows          | `0/0/0`                                |
| Post-completion reconciliation additional notification/IN_APP/PUSH rows | `0/0/0`                                |
| Fabricated actor rows                                                   | `0`                                    |
| Actor-bearing contexts for actorless recovered Push job                | `0`                                    |
| Actorless Push tenant/school scope mismatches                           | `0`                                    |
| Real production Prisma source groups exercised                         | `7`                                    |
| Production storage-adapter paths exercised                             | Import, Learning Media, Branding (`3`) |
| Restored current schedule definitions                                  | `7/7`                                  |

The disposable real-infrastructure run uses one PostgreSQL 16 container, one
Redis 7 container, and one S3-compatible object-store container from locally
present immutable inspected images. It uses a unique run ID, exact ownership
labels, random loopback-only ports, tmpfs storage, no Redis persistence,
bounded startup, and exact cleanup. The wrapper applies the repository's seven
already-committed migrations only to the disposable local database. It creates
no test-only domain table. The evidence seeds and reads actual production
Prisma models and invokes the production repositories, reconcilers, services,
storage adapter, and seven production worker dispatch classes. The primary
Communication path constructs the production generation repository,
preference service, realtime-events service with a deterministic no-network
publisher, push queue service, and generation service. It dispatches the
reconstructed generation job through the production Worker for an announcement
whose persisted publisher is inactive; current publisher status is not treated
as permission to discard historical work, and no actor value is invented. The
authoritative generation job contract permits nullable historical actor fields;
actorless generated Push deliveries are enqueued immediately with both actor
fields null. The production workers use that shared contract directly, without
an unsafe cast or fabricated actor.

```text
REAL_EVIDENCE_STATUS=PASS
NO_REDIS_COPY_PERFORMED=true
INITIAL_EMPTY_REDIS_DBSIZE=0
COMMITTED_MIGRATIONS_APPLIED=7
PRODUCTION_MODEL_SOURCE_GROUPS=7
PRODUCTION_RECONCILERS_EXERCISED=6
PRODUCTION_WORKER_DISPATCH_PATHS=7
RECONSTRUCTED_COMMUNICATION_JOBS=1
RECONSTRUCTED_PUSH_JOBS=1
RECONSTRUCTED_EMAIL_JOBS=4
RECONSTRUCTED_IMPORT_JOBS=1
RECONSTRUCTED_DISMISSAL_SCHEDULES=1
RECONSTRUCTED_LEARNING_MEDIA_JOBS=1
RECONSTRUCTED_BRANDING_JOBS=1
ACTUAL_UNIQUE_SCHEDULE_REGISTRATIONS=7
RECOVERED_INACTIVE_PUBLISHER_ANNOUNCEMENTS=1
CREATED_COMMUNICATION_NOTIFICATIONS=1
CREATED_IN_APP_DELIVERIES=1
CREATED_PUSH_DELIVERIES=1
DUPLICATE_GENERATION_ADDITIONAL_ROWS=0/0/0
POST_COMPLETION_RECONCILIATION_ADDITIONAL_ROWS=0/0/0
FABRICATED_ACTOR_ROWS=0
PUSH_ACTORLESS_CONTEXTS=3
PUSH_ACTOR_CONTEXTS=0
PUSH_SCOPE_MISMATCHES=0
PUSH_RECIPIENT_INELIGIBLE_STATUS=SENT
PUSH_TENANT_INELIGIBLE_STATUS=FAILED
EMAIL_TENANT_INELIGIBLE_STATUS=FAILED
IMPORT_TENANT_INELIGIBLE_STATUS=FAILED
IMPORT_SOURCE_INELIGIBLE_STATUS=FAILED
REMAINING_OPEN_INELIGIBLE_ROWS=0
PUSH_FINAL_STATUS=SENT
PUSH_SENT_ATTEMPTS=2
EMAIL_SENT_RECIPIENTS=1
EMAIL_PRE_PROVIDER_RETRYABLE=1
EMAIL_KNOWN_REJECTION_TERMINAL=1
EMAIL_OUTCOME_UNKNOWN=2
IMPORT_COMPLETED=1
DISMISSAL_EXPIRED=1
LEARNING_MEDIA_OBJECT_DELETED=1
PRODUCTION_STORAGE_PATHS=3
POISON_REJECTED_COUNT=7
KNOWN_SUCCESS_PROVIDER_REPLAY_COUNT=0
EMAIL_OUTCOME_UNKNOWN_AUTOMATIC_REPLAY_COUNT=0
REAL_EXTERNAL_PROVIDER_CALL_COUNT=0
GENERIC_WORKER_COUNT=0
SYNTHETIC_DOMAIN_TABLE_COUNT=0
FOCUSED_STATIC_TESTS=12/12
FOCUSED_JEST_TESTS=168/168
REAL_INFRASTRUCTURE_TESTS=1/1
PRODUCTION_BUILD=PASS
DIFF_CHECK=PASS
SECURITY_AND_REDACTION_SCAN=PASS
RESIDUAL_CONTAINERS=0
RESIDUAL_NETWORKS=0
RESIDUAL_PROCESSES=0
RESIDUAL_TEMP_ARTIFACTS=0
```

## Compatibility and limitations

- No public API, queue name, existing primary job name/payload, consumer,
  schema, migration, dependency, lockfile, database role, Redis topology, Redis
  budget, Socket.IO contract, or Learning Media HTTP completion changed.
- Fake deterministic push and email providers prove application behavior; no
  external provider was contacted.
- Local disposable infrastructure proves recovery mechanics, not managed
  provider provisioning or cloud behavior.
- This gate does not complete Phase 3 or run Universal Regression.
