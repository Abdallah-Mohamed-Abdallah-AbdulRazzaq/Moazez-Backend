# Phase 3 — Redis Topology and Recovery Evidence

## Document control

| Field              | Value                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| Phase              | `PHASE_3`                                                                     |
| Gate               | `PRD3-G02`                                                                    |
| Branch             | `chore/production-readiness-3-cloud-sql`                                      |
| Baseline           | `40c990b1447dd5747604c5418a561bddccaec08a`                                    |
| Status             | `PRD3-G02=IMPLEMENTATION_COMPLETE_PENDING_PR_AND_MERGE`                       |
| Owner              | Abdallah                                                                      |
| Approval timestamp | `2026-08-06T05:56:00+03:00`                                                   |
| Scope              | Local implementation and two-real-Redis evidence; no cloud access or mutation |

## Owner decisions

PRD0-Q012 approves independent `QUEUE_REDIS_URL` and `REALTIME_REDIS_URL`
instances for staging and production. Logical databases, distinct credentials,
paths, or query strings on one endpoint are not isolation. The governed Queue
Redis connection maximum is 40 and the governed Realtime Redis maximum is 30.

PRD0-Q013 prohibits silent staging/production in-memory realtime fallback.
Dependency outage must preserve liveness, fail dependency readiness, reject
new realtime sockets, bound producer failure, retain the process, and recover
within the same service instances.

The authoritative decision register is
`docs/production-readiness/phase-0/05-owner-decision-disposition-register.md`.
ADR-0008 is Accepted.

## Implemented topology and runtime ownership

| Runtime               | Required variables | Queue Redis                                                                       | Realtime Redis                                        |
| --------------------- | ------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| API                   | Queue and Realtime | bounded producer command plus readiness; 0 consumers; 0 repeats                   | adapter publisher/subscriber plus shared state client |
| Core Worker           | Queue and Realtime | bounded command, readiness, shared Worker base, and 6 blocking Workers; 0 repeats | one worker-safe emitter                               |
| Media Worker          | Queue only         | bounded command, readiness, shared Worker base, and 1 blocking Worker; 0 repeats  | none                                                  |
| Maintenance Scheduler | Queue only         | bounded command plus readiness; 0 consumers; 3 repeats                            | none                                                  |

The environment validators reject a missing required variable. Staging and
production reject equal hostname/effective-port endpoints even when schemes,
credentials, database paths, or query strings differ. Development and test
accept equal explicit endpoints. No executable runtime resolves legacy
`REDIS_URL`.

All Queue command/producer connections have finite connect/command timeouts and
disable the offline queue, automatic replay, and request retries. Only the
lazily owned, per-service Worker connection and its blocking duplicates retain
the BullMQ-required `maxRetriesPerRequest=null` reconnect policy. Queue
readiness uses a separate finite client.

Realtime adapter pairs are replaced safely. Strict state-store operations fail
with `realtime_state_redis_unavailable`; only process-owned socket presence is
retained for recovery reconciliation, and strict local typing is not merged.

## Static connection calculations

Queue Redis:

```text
API:                   4 x 2 = 8
Core Worker:           2 x 9 = 18
Media Worker:          2 x 4 = 8
Maintenance Scheduler: 1 x 2 = 2
EXPECTED_STEADY_QUEUE_REDIS_CONNECTIONS=36
QUEUE_RECOVERY_AND_OPERATIONS_RESERVE=4
QUEUE_REDIS_GOVERNED_CONNECTION_BUDGET=40
```

Realtime Redis:

```text
API:                         4 x 3 = 12
Core Worker emitter:         2 x 1 = 2
EXPECTED_STEADY_REALTIME_REDIS_CONNECTIONS=14
REALTIME_TEMPORARY_RECONNECT_OVERLAP=14
REALTIME_OPERATIONS_RESERVE=2
REALTIME_REDIS_GOVERNED_CONNECTION_BUDGET=30
```

## Disposable evidence topology

The evidence runner used two fresh containers from the already-present image
ID `sha256:8b81dd37ff027bec4e516d41acfbe9fe2460070dc6d4a4570a2ac5b9d59df065`.
It used `--pull never`, unique run-derived exact names, ownership/role labels,
separate networks, tmpfs data, no persistent volumes, and distinct random
ports bound only to `127.0.0.1`.

Docker Desktop reallocates an implicit random published port after stop/start,
so the harness first selects random free loopback ports and binds each
explicitly. This preserves the configured URLs across container restarts and
therefore tests service recovery rather than configuration replacement.

The direct service topology created exactly:

- 4 API producer/readiness services;
- 2 Core Worker services with 6 Workers each;
- 2 Media Worker services with 1 Worker each;
- 1 Maintenance Scheduler service;
- 4 independent Socket.IO servers and Redis adapters;
- 4 independent realtime state stores;
- 2 Core Worker Redis emitters.

Administrative `CLIENT LIST`, key inspection, and readiness connections were
named and excluded from application budgets. Their final-run observed maxima
were 1 on Queue Redis and 1 on Realtime Redis.

## Scenario evidence

### Healthy split topology

- Queue Redis contained BullMQ keys and zero `realtime:*` keys.
- Realtime Redis contained realtime state/adapter keys and zero `bull:*` keys.
- API production, Core consumption, Media consumption, and scheduler repeat
  registration passed.
- Socket.IO fan-out crossed two independent API servers through the Redis
  adapter.
- Presence written through API state-store 1 was read through API state-store 2.
- Typing written through API state-store 1 was read through API state-store 2.

### Queue Redis outage and recovery

- All nine Queue readiness clients failed while Realtime Redis stayed ready.
- Separate API, Core Worker, Media Worker, and Maintenance Scheduler commands
  failed with sanitized `queue_redis_unavailable`, each below the 2,000 ms
  evidence limit.
- Final-run rejection durations were API 29 ms, Core Worker 1 ms, Media Worker
  1 ms, and Maintenance Scheduler repeat registration 1 ms.
- Realtime fan-out, shared presence, and shared typing continued during the
  Queue-only outage.
- The same API, Core Worker, Media Worker, and Scheduler service objects
  recovered after only Queue Redis restarted.
- New commands from the same API, Core Worker, Media Worker, and Scheduler
  services succeeded; the three new jobs were processed exactly once and the
  new repeat registration entered the Scheduler inventory.
- All three failed producer jobs remained absent with aggregate replay count 0;
  the failed repeat registration never entered the Scheduler inventory.

```text
API_PRODUCER_FAILURE_MILLISECONDS=29
CORE_PRODUCER_FAILURE_MILLISECONDS=1
MEDIA_PRODUCER_FAILURE_MILLISECONDS=1
SCHEDULER_REGISTRATION_FAILURE_MILLISECONDS=1
FAILED_PRODUCER_REPLAY_COUNT=0
FAILED_SCHEDULER_REGISTRATION_REPLAYED=false
SAME_SERVICE_RECOVERY=true
SAME_WORKER_RECOVERY=true
```

### Realtime Redis outage and recovery

- All four adapters, four state stores, and two emitters failed realtime
  readiness while Queue Redis remained ready.
- A new socket was rejected.
- Four representative strict shared-state operations produced 0 successful
  local-fallback results.
- Queue production, Core consumption, Media consumption, and Scheduler Queue
  behavior continued during the Realtime-only outage.
- The same four API gateways/state stores and two emitter services recovered
  after only Realtime Redis restarted.
- Cross-instance adapter fan-out and Core Worker emitter delivery resumed.
- Live process-owned socket presence was reconciled into Redis.
- Expired typing and outage-local typing were not resurrected.

No Nest service instance or evidence-process identity was replaced in either
recovery scenario. The process event loop and liveness contract remained
healthy while dependency readiness failed.

## Live connection measurements

```text
MAX_QUEUE_REDIS_CONNECTIONS=36
MAX_REALTIME_REDIS_CONNECTIONS=14
QUEUE_RECOVERY_OVERLAP_MAXIMUM=36
REALTIME_RECOVERY_OVERLAP_MAXIMUM=14
QUEUE_REDIS_GOVERNED_MAXIMUM=40
REALTIME_REDIS_GOVERNED_MAXIMUM=30
FINAL_QUEUE_REDIS_CONNECTIONS=0
FINAL_REALTIME_REDIS_CONNECTIONS=0
```

Both measured maxima equal the static steady models and remain below their
approved governed budgets. Reconnect replacement did not create a measured
application-client overlap above steady state.

## Cleanup

The runner verified exact names and all ownership labels before removal. The
successful run reported:

```text
RESIDUAL_CONTAINERS=0
RESIDUAL_NETWORKS=0
RESIDUAL_PROCESSES=0
RESIDUAL_TEMPORARY_FILES=0
```

Application clients were verified at zero before container removal. The
administrative client was then closed, and an internal `redis-cli CLIENT LIST`
check subtracted only its own inspection connection and confirmed zero other
clients.

## Security and compatibility

Logs and errors expose stable dependency classes and stages only. The evidence
contains the immutable public image ID and synthetic loopback fixture behavior,
not credentials, real Redis URLs, provider endpoints, tokens, private
addresses, or query strings.

The candidate changes no API contract, queue name/job/payload/job ID/retry or
backoff policy, runtime ownership, schema, migration, dependency, lockfile,
storage behavior, or synchronous Learning Media HTTP 200 completion.

## Limitations

- This is local Redis 7 evidence, not proof that permanent managed Redis or
  Terraform exists.
- It does not implement PRD3-G03 queue idempotency, poison-job,
  reconciliation, or persisted-truth replay policy.
- It does not complete Phase 3 and does not close the deferred PRD3-G01
  provider cleanup.
- It performs no Google Cloud access or mutation.
