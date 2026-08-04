# Prisma Pool Saturation and Aggregate Budget Evidence

## Evidence status

| Field | Value |
| --- | --- |
| Gate | `PRD3-G01-B1` |
| Final evidence revision | `B1-FINAL` |
| Baseline commit | `74bc2ffe3a4e5344d93192458d127ba9cce3b6ca` |
| Date | 2026-08-04 |
| Timezone | Africa/Cairo |
| Node | 22.23.1 |
| Prisma Client | 6.19.3 |
| PostgreSQL fixture | 16, disposable local container, tmpfs data |
| PostgreSQL `max_connections` | 80 |
| Result | Completed local evidence; `PRD3-G01` remains `BASELINE_ONLY` |

`B1-FINAL` supersedes every pre-review B1, B1-R1, and B1-R2 draft candidate.
The earlier measurements were useful review inputs, but only the final runs
below use the complete fail-closed state machine, atomic schema-v5 summary,
bounded Prisma lifecycle, process-tree cleanup, bridge verification, and live
failure rehearsals.

No migration or seed was applied. The fixture executed only the required
`SHOW`, `SELECT 1`, `SELECT pg_sleep(...)`, and `pg_stat_activity` observation
statements. It did not access an existing or external database.

## Final harness design

The orchestrator uses one explicit state object with monotonic phases:

```text
PREFLIGHT -> READY -> RUNNING -> INTERRUPTED -> FINALIZING -> FINALIZED
                                                    \------> FAILED
```

The state owns the interruption latch, first signal, requested exit code,
abort controller, single finalization promise, irreversible summary
eligibility, summary and scratch paths, Prisma-client registry, child-process
registry, owned-resource registry, and sanitized failure categories.

The first SIGINT or SIGTERM synchronously latches interruption, its exact exit
code (130 or 143), abort, and permanent PASS ineligibility before starting or
joining finalization. A later signal cannot overwrite it. The same latch is
used by OS signal handlers and the exact opt-in rehearsal control channel.

The single idempotent finalizer performs:

1. failure/interruption latching and abort;
2. concurrent per-client bounded Prisma disconnect phase 1;
3. bounded child-process-tree termination;
4. exact-label-owned Docker cleanup;
5. exact-name absence inspection;
6. current-run gate-plus-run label sweeps;
7. immutable image identity and full image-inventory comparison;
8. bounded Prisma disconnect retry for unresolved clients;
9. zero-client, zero-child, and zero-owned-resource verification;
10. scratch-file cleanup;
11. terminal eligibility decision;
12. atomic summary publication only when every invariant passes;
13. signal-handler removal.

Failures are collected so a disconnect or child failure cannot skip Docker
cleanup, and a Docker failure cannot skip the disconnect retry or file cleanup.
An unresolved Prisma client, child, inspection, owned resource, or scratch file
forbids PASS.

## Bounded operations and process cleanup

Every Prisma connect, observer query, sampler query, sleep group, P2024 query,
recovery query, and disconnect has a monotonic deadline. Sampler loops, sampler
stop, scenario-local teardown, session drain polling, readiness polling, and
child commands are bounded and abort-aware.

Disconnect phase 1 gives every tracked client 5 seconds. Only a confirmed
successful disconnect removes the client from tracking. Rejected or timed-out
clients remain registered while child and Docker cleanup continues. Phase 2
then retries each unresolved client once for 5 seconds. PASS requires zero
remaining clients and zero disconnect failures.

Child commands use `shell=false`, capped and redacted output, and a bounded
graceful-then-force lifecycle. POSIX commands run in their own process group and
receive group SIGTERM followed by group SIGKILL. Windows uses bounded
`taskkill.exe /PID <pid> /T` followed by `/F`; the final test executed a real
parent-plus-grandchild tree and proved both PIDs absent. No `process.exit()` or
`--forceExit` is used.

## Local Docker and fixture boundary

The harness validates Docker selection before mutation. It accepts only a
local `npipe` or absolute local `unix` endpoint, rejects remote or contradictory
selectors, removes unverified Docker/TLS/SSH/auth variables, and pins all later
commands to the verified endpoint. Summaries record only:

```text
dockerEndpointTransport=npipe
```

The pre-existing fixture image was inspected as:

```text
sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777
```

The immutable ID, not the mutable tag, was passed to `docker run` with
`--pull=never`. Pre-run and post-cleanup image inventories were identical. The
harness did not pull, build, tag, remove, or alter an image.

The owned network is created with `--internal` and both immutable evidence
labels. The built-in `bridge` is inspected before use and must have exact name
`bridge`, driver `bridge`, scope `local`, and `Internal=false`. Container
ownership is re-verified before attachment.

The owned disposable network is internal, but the PostgreSQL container is
temporarily multi-homed to the verified local built-in bridge to activate
Docker Desktop loopback publishing. This is not production network-isolation
or egress-policy evidence.

Cleanup may remove only an exact resource whose exact name, gate label, and run
label all match this execution. Final proof independently checks exact names
and a current-run two-label sweep, so renaming an owned resource cannot evade
the audit. Inspection failures are not treated as absence.

## Live failure rehearsals

The exact opt-in variable accepts only three rehearsal values; unknown values
are rejected and ordinary runs use `NONE`.

| Rehearsal | Injection | Expected/observed exit | PASS summary | Cleanup result |
| --- | --- | ---: | --- | --- |
| A | sanitized failure immediately after PostgreSQL readiness | 1 | forbidden and absent | zero clients, children, exact-name resources, labeled resources, and scratch files |
| B | SIGINT latch during active Scenario A pool work | 130 | forbidden and absent | zero clients, children, exact-name resources, labeled resources, and scratch files |
| C | ordinary failure, then SIGTERM while the finalizer is active | 143 | forbidden and absent | first signal retained; zero clients, children, exact-name resources, labeled resources, and scratch files |

On Windows, the rehearsal parent delivers the exact signal intent over a
test-only IPC channel after the fixed non-sensitive stage marker; the child
routes it through the same synchronous latch used by the OS SIGINT/SIGTERM
handlers. This avoids Windows Node's unconditional `child.kill()` signal
termination while still exercising the live fixture and production cleanup
path.

## Final normal measurements

Both commands used independent run IDs, containers, networks, and fresh tmpfs
PostgreSQL data.

| Run | Summary path | SHA-256 |
| --- | --- | --- |
| 1 | `C:\Users\Abdal\AppData\Local\Temp\moazez-prd3-g01-b1-mseh9byq-j28-e6fa67366d-summary.json` | `88b3187354bc140735de0ecf907c9c452c73049001de5750bea931f7075f8bd7` |
| 2 | `C:\Users\Abdal\AppData\Local\Temp\moazez-prd3-g01-b1-msehhrk7-j2g-715badfefa-summary.json` | `adde5a8f3603f188387247febe706037ddc2704e06ca6bbc3369947215937557` |

### Scenario A — one exact role pool

| Run | Role | Configured limit | Observed maximum | Pool timeout | P2024 elapsed | Recovery | Sessions after disconnect |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | API | 5 | 5 | 5 s | 5058 ms | PASS | 0 |
| 1 | Core Worker | 6 | 6 | 10 s | 10012 ms | PASS | 0 |
| 1 | Media Worker | 3 | 3 | 10 s | 10012 ms | PASS | 0 |
| 2 | API | 5 | 5 | 5 s | 5038 ms | PASS | 0 |
| 2 | Core Worker | 6 | 6 | 10 s | 10007 ms | PASS | 0 |
| 2 | Media Worker | 3 | 3 | 10 s | 10008 ms | PASS | 0 |

Every queued query returned exact Prisma code `P2024` inside its approved
tolerant window. Each same client executed `SELECT 1` after pressure released.

### Scenario B — aggregate maximum-instance envelope

| Run | API | Core Worker | Media Worker | Runtime total | Sampled overshoot | Sessions after disconnect |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 20 | 12 | 6 | 38 | false | 0/0/0 |
| 2 | 20 | 12 | 6 | 38 | false | 0/0/0 |

All clients/revisions sharing one application name were aggregated. The
observer was excluded. This measures only the 38 runtime connections and does
not consume or prove migration, operations, or failover reserves.

### Scenario C — new-client cutback

| Run | Role | Limit | Observed maximum | Pool timeout | P2024 elapsed | Recovery | Sessions after disconnect |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | API | 1 | 1 | 1 s | 1007 ms | PASS | 0 |
| 1 | Core Worker | 1 | 1 | 1 s | 1006 ms | PASS | 0 |
| 1 | Media Worker | 1 | 1 | 1 s | 1006 ms | PASS | 0 |
| 2 | API | 1 | 1 | 1 s | 1008 ms | PASS | 0 |
| 2 | Core Worker | 1 | 1 | 1 s | 1008 ms | PASS | 0 |
| 2 | Media Worker | 1 | 1 | 1 s | 1008 ms | PASS | 0 |

This proves a newly created client honors a lower pool setting. It does not
claim that a running Prisma Client can resize its existing pool.

## Schema-v5 evidence integrity

The sanitized summary is built in memory, strictly validated, checked for
sensitive keys and values, and written to a unique scratch path opened with
exclusive creation. The scratch handle is written, fsynced, and closed; state
eligibility is rechecked; then it is atomically renamed. The retained bytes are
read back and hashed only after another interruption check. Any validation,
write, rename, read, hash, or interruption failure removes scratch and retained
output and prevents PASS. Signal handlers remain installed through the final
synchronous eligibility check and result emission; a signal latched after
finalization but before output removes retained evidence and emits no PASS
result.

Each normal summary records zero tracked clients, disconnect failures,
children, exact-name resources, current-run-labeled resources, and scratch
files, plus exactly one intentionally retained sanitized summary. Failure and
interrupted runs retain no summary.

## Fault-injection matrix

Every row forbids a PASS summary. Cleanup expectation is the unified finalizer:
bounded clients/children, exact owned-resource cleanup and inspections, and no
scratch output. Exit is nonzero except the two signal-specific codes.

| ID | Injection method | Classification | Cleanup / exit | Test or rehearsal |
| --- | --- | --- | --- | --- |
| F01 | remote explicit Docker host | preflight rejection | no mutation; exit 1 | `remote DOCKER_HOST is rejected before any command` |
| F02 | context inspection returns remote transport | pre-daemon rejection | no mutation; exit 1 | `remote Docker context is rejected before daemon verification or mutation` |
| F03 | host and context selectors both present | selector contradiction | no commands; exit 1 | `conflicting Docker selectors are rejected without commands` |
| F04 | image inspect returns nonzero | fixture blocked | no network; exit 1 | `missing image blocks before network mutation` |
| F05 | malformed image ID/list | image identity failure | no mutation; exit 1 | `accepts only exact lowercase immutable image IDs and inventories` |
| F06 | network create throws | creation reconciliation | remove only if exactly owned; exit 1 | `cleanup is registered only after successful creation` |
| F07 | same-name network has mismatched labels | ownership denial | resource retained; run fails | `failed network or container creation cannot delete an unowned same-name object` |
| F08 | container create throws | creation reconciliation | remove only if exactly owned; exit 1 | `cleanup is registered only after successful creation` |
| F09 | same-name container has mismatched labels | ownership denial | resource retained; run fails | `failed network or container creation cannot delete an unowned same-name object` |
| F10 | bridge name/driver/scope/internal mismatch | compatibility rejection | owned fixture cleaned; exit 1 | `built-in bridge metadata is verified before owned-container attachment` |
| F11 | never-resolving discovery operation | bounded timeout | finalizer; exit 1 | `published-port discovery has a deterministic bounded timeout` |
| F12 | readiness predicate never succeeds | bounded poll timeout | finalizer; exit 1 | poll deadline plus Rehearsal A boundary |
| F13 | never-resolving Prisma connect | bounded Prisma timeout | client retained for finalizer; exit 1 | bounded observer query and disconnect tests |
| F14 | observer query never resolves | bounded Prisma timeout | finalizer; exit 1 | `observer and recovery query failures are bounded and sanitized` |
| F15 | sampler query/stop never resolves | bounded sampler failure | finalizer; exit 1 | `never-resolving sampler query and sampler stop are bounded` |
| F16 | sleeper rejects | scenario failure | finalizer; exit 1 | `rejected and never-resolving sleepers fail within bounded teardown` |
| F17 | sleeper never resolves | bounded teardown timeout | finalizer; exit 1 | same sleeper test |
| F18 | non-P2024 or plain Error | exact-code failure | finalizer; exit 1 | `exact P2024 classifier rejects other Prisma and plain errors` |
| F19 | sampled role count exceeds cap | budget violation | overshoot latched; exit 1 | `sampler records sampled overshoot before failing closed` |
| F20 | recovery query rejects | recovery failure | finalizer; exit 1 | `observer and recovery query failures are bounded and sanitized` |
| F21 | scenario disconnect rejects | client remains tracked | final retry; exit 1 if unresolved | `rejected and timed-out disconnects leave clients tracked` |
| F22 | scenario disconnect never resolves | timed-out client remains tracked | final retry; exit 1 if unresolved | same disconnect test |
| F23 | final disconnect rejects | final cleanup failure | later phases continue; exit 1 | `final disconnect rejection and timeout deny PASS while cleanup continues` |
| F24 | final disconnect never resolves | two bounded timeouts | later phases continue; exit 1 | same final-disconnect test |
| F25 | phase 1 times out, phase 2 succeeds | resolved retry | zero clients; eligible if all else passes | `two-phase finalizer retries and resolves a client after Docker cleanup` |
| F26 | child ignores graceful termination | force-tree kill | bounded reap; exit 1 for timed command | `SIGTERM-resistant child is force-killed within a bounded timeout` |
| F27 | child spawns persistent grandchild | process-tree termination | both PIDs absent | `process-tree termination removes a child and grandchild` |
| F28 | Docker list nonzero/timeout/malformed | `INSPECTION_FAILED` | PASS denied; exit 1 | `Docker name inspection is exact and fail-closed` |
| F29 | Docker cleanup action throws | aggregate cleanup failure | remaining inspections/retry continue; exit 1 | `a cleanup failure does not skip disconnect retry or later inspections` |
| F30 | exact names absent but labeled object remains | label-sweep failure | PASS denied; exit 1 | `exact-name absence is insufficient when a renamed labeled resource remains` |
| F31 | signal after active-measurement marker | interrupted | full cleanup; exit 130 | live Rehearsal B and prior-continuation race test |
| F32 | signal after finalization-active marker | interrupted finalizer | same promise completes cleanup; exit 143 | live Rehearsal C and finalization race test |
| F33 | signal immediately before summary call | ineligible evidence | no scratch/summary; 130 | `signal immediately before summary creation forbids scratch and retained evidence` |
| F34 | signal hook after scratch write | interrupted publication | scratch removed; 143 | `signal during scratch write removes partial and retained evidence` |
| F35 | invalid schema-v5 object | validation failure | no file; exit 1 | `summary validation, rename, and hash failures retain no evidence` |
| F36 | atomic rename throws | publication failure | scratch removed; exit 1 | same summary-failure test |
| F37 | retained read/hash hook throws | integrity failure | retained file removed; exit 1 | same summary-failure test |
| F38 | either required normal result is false/missing | two-run failure | overall blocked | `both independent normal runs are required` |

The pure/adversarial suite passed 60 tests. Both final-candidate normal commands
executed that exact 60-test suite. No required test was skipped or marked todo.

## Command record and intermediate corrections

| Command | Result |
| --- | --- |
| initial post-refactor pure suite | externally stopped at 124 s; obsolete R2 finalizer tests left a verified test-owned Node tree, which was force-removed before continuing |
| corrected pure/adversarial suite | PASS, 58/58 before final POSIX-plan assertion |
| first rehearsal command | manually stopped after rehearsals completed because an uncancelled parent watchdog timer retained the process; zero owned resources were present |
| corrected `npm run verify:prd3-g01-b1-failures` | PASS, A/B/C |
| `npm run verify:prd3-g01-b1` run 1 | PASS; summary hash above |
| `npm run verify:prd3-g01-b1` run 2 | PASS; summary hash above |
| final `npm run verify:prd3-g01-a` | PASS; governance 74 gates, 7 health/governance tests, 10 runtime-policy tests |
| final pure/adversarial Node suite | PASS; 60/60, failed/skipped/todo all zero |
| final failure rehearsals | PASS; A/B/C |
| final `npx prisma validate` | PASS |
| final `npx prisma generate` | PASS; Prisma Client 6.19.3 |
| final `npm run build` | PASS |
| independent local Docker/image/process audit | PASS; npipe, zero gate-labeled resources, image unchanged, zero test-owned Node processes |

The obsolete-test hang and rehearsal-parent timer were harness/test defects,
not pool-measurement or cleanup failures. Both were corrected and followed by
clean bounded executions.

## Limitations and deferred evidence

This evidence does not prove Cloud Run scaling, Cloud SQL machine capacity,
regional HA, provider failover, production TLS, database privileges, migration
identity, business transaction performance, SLO compliance, production
network isolation, or production launch capacity.

It also does not prove the 10-connection operations reserve, 2-connection
migration allowance, 50-connection failover/emergency reserve, or Cloud SQL
`max_connections`. Those remain static governance or later provider evidence.

Deferred work remains:

- PRD3-G01-B2: runtime outage, readiness, and reconnect behavior;
- PRD3-G01-B3: registered business-transaction pressure and cutback;
- PRD3-G01-C: database identities, privileges, and negative DDL/cross-role proof;
- PRD3-G01-D: real Cloud SQL regional failover and gate closeout.

Therefore `PRD3-G01` remains `BASELINE_ONLY`.
