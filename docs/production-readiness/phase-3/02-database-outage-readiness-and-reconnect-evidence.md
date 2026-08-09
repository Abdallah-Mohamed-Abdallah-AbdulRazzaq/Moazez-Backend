# PRD3-G01-B2 Database Outage, Readiness, and Reconnect Evidence

## Evidence identity and status

| Field | Value |
| --- | --- |
| Phase / gate / subgate | `PHASE_3` / `PRD3-G01` / `PRD3-G01-B2` |
| Baseline commit | `e50bba85c2a24c91f11cb26f909b3e1c8b47cc2b` |
| Baseline tree | `6d20e77c7a260153f27ca15794a1696dfc331098` |
| Evidence date and timezone | 2026-08-04, Africa/Cairo |
| Parent gate status | `BASELINE_ONLY` |
| Node | 22.23.1 |
| Host observer / runtime Prisma Client | 6.19.3 / 6.19.3 |
| Package version | `0.0.1` |
| Runtime image ID | `sha256:a215767bab756f6f52c3fe1053f39dd8767078164c4e4a227b634ec7d1443c8d` |
| Runtime manifest SHA-256 | `2df4b563cf44246d24d6c1a2f619df41f4e211cddd0cf74c85031d8cd4405a5f` |
| `package-lock.json` SHA-256 | `d4e8100d02554c36d0fef569bed31ddfbcb8e2af76994c67e46f5b843fef5dd4` |
| PostgreSQL fixture | PostgreSQL 16, `max_connections=80`, image `sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777` |
| Docker endpoint classification | verified local `npipe` transport; complete endpoint omitted |

PRD3-G01-B2-R1 is complete as local disposable runtime evidence. PRD3-G01 is
not complete and remains `BASELINE_ONLY`. This evidence exercises the canonical API, Core Worker, and
Media Worker artifact, their actual management-probe listeners, the real
`OperationalProbeService`, and the committed Prisma runtime configuration.
It changes no production TypeScript source.

The pre-review B2 report and its two earlier summary hashes are
`SUPERSEDED_PRE_REVIEW_CANDIDATE` evidence. B2-R1 is the first candidate whose
one canonical command reproduces provenance, adversarial tests, live failure
rehearsals, two formal runs, cross-run comparison, and final cleanup audit.

The mandated pre-edit reproduction did not fail 39/40: it actually reported
40/40 PASS. That result exposed the causal defect rather than disproving it:
the old regex searched launcher source and could accept the parameterized
`DATABASE_CONNECTION_LIMIT=$connection_limit` text without proving the value
passed for any role. B2-R1 replaces it with execution of the real launcher
against an argv-capturing fake Docker binary. The tests prove each exact
5/6/3 and 5/10/10 tuple, connect timeout 5, immutable image ID,
`--pull=never`, B2 ownership labels, and role entrypoint; malformed, decimal,
lower/wrong, and role-mismatched tuples fail before Docker invocation. The
launcher verifies those values through the compiled committed database policy,
so the shell does not become a second policy authority.

## Canonical runtime provenance

`npm run verify:prd3-g01-b2-final` first confirms the exact branch, HEAD,
clean index, nine authorized dirty paths, and absence of production-runtime
source differences from the baseline. It resolves the baseline tree and
creates its build context outside the repository with the semantic sequence:

```text
git archive --format=tar e50bba85c2a24c91f11cb26f909b3e1c8b47cc2b
docker build --pull=false --file <archive-context>/Dockerfile <archive-context>
```

The canonical Dockerfile's digest-pinned Node 22.23.1 base was required to be
present locally before build. No implicit pull or alternate runtime was
permitted. Both the probe and final builds used the canonical archived
Dockerfile. The final image carried and was inspected for:

- `org.opencontainers.image.revision=e50bba85c2a24c91f11cb26f909b3e1c8b47cc2b`;
- `com.moazez.source.commit=e50bba85c2a24c91f11cb26f909b3e1c8b47cc2b`;
- `com.moazez.source.tree=6d20e77c7a260153f27ca15794a1696dfc331098`;
- the exact package-lock and runtime-manifest SHA-256 values above;
- the exact B2 gate and canonical-suite run labels.

A bounded `--network=none`, `--pull=never` in-image verifier used an explicit
Node entrypoint and hashed every file under `dist`, `package.json`, the
canonical `package-lock.json`, installed and generated Prisma Client package
identities, and the API/Core/Media entrypoints. It independently proved Node
22.23.1, Prisma Client 6.19.3, package version 0.0.1, and all three entrypoints.
The final image was executed only by immutable image ID and was label-verified
and removed after the complete suite; its exact gate/run label sweep returned
zero.

The fixture used a fresh owned internal Docker network,
tmpfs-only PostgreSQL storage, a random loopback-only published port,
synthetic credentials held in memory, no persistent volume, no migration, and
no seed. Disposable Redis and MinIO fixtures existed only to satisfy the
unchanged canonical runtime startup dependencies; no real job or application
data was created.

## Exercised role policy

| Runtime | Role | Application name | Connection limit | Pool timeout | Connect timeout |
| --- | --- | --- | ---: | ---: | ---: |
| API | `api` | `moazez-api` | 5 | 5 s | 5 s |
| Core Worker | `core-worker` | `moazez-core-worker` | 6 | 10 s | 5 s |
| Media Worker | `media-worker` | `moazez-media-worker` | 3 | 10 s | 5 s |

Each run first required startup, liveness, and readiness 200 for all three
runtimes plus public API health 200. PostgreSQL was then paused and unpaused
twice without replacing any runtime. During each outage, readiness was 503,
startup and liveness stayed 200, the API public compatibility endpoint stayed
200, and all response bodies retained only `status`, `version`, and
`timestamp`. Ten concurrent readiness requests per role all failed closed
within the bounded caller deadline.

## Two-run measurements

### Run 1

| Runtime | Detection latency, cycles 1 / 2 | Burst count / maximum | Maximum observed DB sessions | Unavailable / recovered events |
| --- | --- | --- | ---: | ---: |
| API | 1322 ms / 1344 ms | 10 / 816 ms | 1 | 3 / 3 |
| Core Worker | 1317 ms / 1340 ms | 10 / 824 ms | 1 | 3 / 3 |
| Media Worker | 1332 ms / 1357 ms | 10 / 813 ms | 1 | 3 / 3 |

- Summary: `C:\Users\Abdal\AppData\Local\Temp\moazez-prd3-g01-b2-mserb451-io0-390ab9b1bfba-summary.json`
- SHA-256: `d53e99181d504c0fad3a14f2d18c0a69e25f82a8a5008103ad46c6c0b0fd9582`

### Run 2

| Runtime | Detection latency, cycles 1 / 2 | Burst count / maximum | Maximum observed DB sessions | Unavailable / recovered events |
| --- | --- | --- | ---: | ---: |
| API | 1402 ms / 1311 ms | 10 / 826 ms | 1 | 3 / 3 |
| Core Worker | 1415 ms / 1319 ms | 10 / 828 ms | 1 | 3 / 3 |
| Media Worker | 1403 ms / 1307 ms | 10 / 826 ms | 1 | 3 / 3 |

- Summary: `C:\Users\Abdal\AppData\Local\Temp\moazez-prd3-g01-b2-msercn9e-czs-4381f23984bd-summary.json`
- SHA-256: `cb6234fa822b4c3478ecc368fe936014829cd3183ed5c63f10822abb3f38dac2`

In both runs, the runtime container ID, `StartedAt`, restart count, and host
process identity remained unchanged through both stall/recovery cycles. No
liveness-induced restart occurred and readiness was not permanently cached.
The paired state-transition count is three rather than two because the forced
session-reset scenario may independently produce one additional bounded
unavailable/recovered fingerprint. Ten simultaneous callers did not produce
ten identical events.

## Forced-session and startup evidence

A constant allowlisted observer statement terminated three established
backends, one for each exact application name. Both runs observed:

- `forcedSessionsTerminated=3`;
- `oldBackendSessionsRemaining=0`;
- a new backend identity for `moazez-api`, `moazez-core-worker`, and
  `moazez-media-worker`;
- readiness 200 from the same runtime processes after reconnection;
- recovered per-runtime maxima of 1, below the committed limits 5/6/3;
- zero role sessions after bounded runtime shutdown and Prisma disconnect.

For the independent unavailable-at-start scenario, a fresh PostgreSQL fixture
was paused before each runtime launch. API, Core Worker, and Media Worker each
exited during failed Prisma module initialization and never advertised startup
or readiness 200 (`FAIL_CLOSED_EXITED`). After the same fixture was unpaused,
fresh launches of all three roles returned startup, liveness, and readiness
200; the API public health route returned 200; and all exact application names
appeared in `pg_stat_activity`.

## Failure rehearsals and cleanup

The canonical `npm run verify:prd3-g01-b2-final` command passed all three live
rehearsals before the formal runs:

- SIGINT during the paused-database state exited 130, emitted no PASS summary,
  unpaused the owned fixture before removal, and left no child or resource.
- SIGTERM during recovery polling exited 143, emitted no PASS summary, aborted
  polling, and completed the same cleanup contract.
- The exact opt-in false-ready injection failed closed, emitted no PASS
  summary, and completed cleanup.

For SIGINT/SIGTERM the parent waits for an exact child stage marker, then sends
an authenticated test-only IPC message that invokes the already-installed
signal handler. The handler latches the real 130/143 signal exit semantics and
joins the same idempotent finalization promise. This is a deterministic local
handler-path rehearsal; it is not an operating-system or platform kill proof.

Every resource carried both
`com.moazez.evidence.gate=PRD3-G01-B2` and a unique current-run label. PASS
summary publication occurred only after bounded runtime shutdown, role-session
drain, phase-one Prisma observer disconnect, child-tree reaping, owned resource
cleanup, exact-name absence checks, current-run
label sweeps, unchanged fixture-image inventory, zero role sessions, and zero
scratch files. A rejected or timed-out disconnect remains tracked and receives
one bounded phase-two retry after Docker inspection; unresolved clients make
PASS impossible. Every observer connect, SHOW, activity, termination,
disconnect, and final observation is explicitly bounded. The observer is
tracked before its first connect attempt and the state, context, and finalizer
share the same Prisma/client/child/resource sets.

One monotonic state (`PREFLIGHT`, `READY`, `RUNNING`, `INTERRUPTED`,
`FINALIZING`, `FINALIZED`, `FAILED`) owns one idempotent finalization promise.
The first signal wins and PASS eligibility cannot be restored. Signal/message
handlers stay installed through summary validation, scratch write/fsync/close,
atomic rename, retained-byte verification, hashing, final accounting, and the
terminal transition. Adversarial tests injected interruption at seven
publication boundaries; every path retained neither PASS summary nor scratch.

Each final summary records zero tracked Prisma clients, disconnect failures,
tracked children, exact-name
containers, exact-name networks, current-run-labeled containers,
current-run-labeled networks, role sessions, and scratch files, with
`inspectionVerified=true`.

## Fault-injection matrix

Every injected failure latches the monotonic failed state. Except where the
failure occurs before mutation, finalization still attempts every bounded
child, client, exact-name, label-sweep, scratch-file, and inspection phase. A
cleanup error is accumulated rather than allowing a later PASS.

| ID | Injection method | Expected classification | Expected cleanup | PASS summary eligible | Proof |
| --- | --- | --- | --- | --- | --- |
| B2-F01 | Supply a remote/malformed Docker selector | Endpoint-policy failure before daemon use | No resources created | No | endpoint-policy tests |
| B2-F02 | Make exact PostgreSQL image inspection report absent | Image-gate blocker | No resources created | No | image-gate test |
| B2-F03 | Make PostgreSQL creation fail | Creation failure | Reconcile only an exact label-owned result; never remove an unowned collision | No | creation-registration test |
| B2-F04 | Keep `pg_isready` unavailable until deadline | PostgreSQL readiness timeout | Full owned cleanup | No | polling-deadline test |
| B2-F05 | Make exact runtime image inspection fail | Runtime-image blocker before runtime launch | Remove any already-created owned fixture | No | runtime-image parser test |
| B2-F06 | Report API container stopped | Unexpected runtime exit | Full owned cleanup | No | runtime-state classifier |
| B2-F07 | Report Core Worker container stopped | Unexpected runtime exit | Full owned cleanup | No | runtime-state classifier |
| B2-F08 | Report Media Worker container stopped | Unexpected runtime exit | Full owned cleanup | No | runtime-state classifier |
| B2-F09 | Make the exact owned-container pause command fail | Outage-transition failure | Full owned cleanup | No | Docker-result test |
| B2-F10 | Make the exact owned-container unpause command fail | Recovery-transition failure | Retry owned unpause during full cleanup | No | Docker-result test |
| B2-F11 | Exact opt-in mode changes one outage readiness observation to 200 | False-ready safety failure | Full owned cleanup | No | live rehearsal |
| B2-F12 | Supply non-200 liveness during a steady-state outage | Health-contract failure | Full owned cleanup | No | outage validator |
| B2-F13 | Supply non-200 API public health while API remains alive | Compatibility failure | Full owned cleanup | No | public-health validator |
| B2-F14 | Hold a readiness child past its hard deadline | Bounded child timeout | Terminate/reap the tree, then full owned cleanup | No | hard-deadline test |
| B2-F15 | Supply a burst with a missing, late, or ready result | Single-flight/burst evidence failure | Full owned cleanup | No | burst validator and live burst |
| B2-F16 | Keep readiness non-200 through the recovery deadline | Recovery timeout | Full owned cleanup | No | polling-deadline test |
| B2-F17 | Retain a recorded old backend identity after termination | Session-reconnect failure | Full owned cleanup and zero-session verification | No | session validator |
| B2-F18 | Omit a required new exact-role backend identity | Session-reconnect failure | Full owned cleanup and zero-session verification | No | session validator |
| B2-F19 | Return an unapproved `application_name` | Observation/allowlist failure | Full owned cleanup | No | exact allowlist parser |
| B2-F20 | Sample a role count above 5/6/3 | Pool-overshoot failure | Full owned cleanup and zero-session verification | No | pool validator |
| B2-F21 | Change container ID, `StartedAt`, restart count, or host PID | Runtime-identity failure | Full owned cleanup | No | identity validator |
| B2-F22 | Fail or time out the bounded observer query | Observer failure | Disconnect/retry as bounded, then full owned cleanup | No | observer-deadline test |
| B2-F23 | Supply startup/readiness 200 while the fresh fixture is paused | Startup fail-closed failure | Full owned cleanup | No | startup classifier and live scenario |
| B2-F24 | Inject SIGINT after the database is paused | Interrupted, exit 130 | Abort, unpause owned fixture, reap children, full owned cleanup | No | live rehearsal |
| B2-F25 | Inject SIGTERM during recovery polling | Interrupted, exit 143 | Abort polling, reap children, full owned cleanup | No | live rehearsal |
| B2-F26 | Make final exact-name/label inspection fail | Cleanup verification failure | Continue every remaining cleanup phase | No | fail-closed inspection test |
| B2-F27 | Return an exact-name or current-run-labeled residual | Owned-resource cleanup failure | Continue bounded reconciliation and report failure | No | cleanup validator |
| B2-F28 | Fail atomic write, rename, retained-file validation, or hash | Publication failure | Remove scratch and incomplete evidence; retain no new summary | No | atomic-publication test |
| B2-F29 | Supply a passing first-run result and failing second-run result | Overall B2 blocked | Each run independently completes its cleanup | No overall B2 PASS; an already valid first-run summary may remain | two-run validator |

All 29 modes have an exact proof ID and executable pure, integration,
structural, live-rehearsal, or two-run proof. The final suite assembled the
covered-ID set from executed results and required `missing=0`, `duplicate=0`,
and `unknown=0`. The corrected B2 pure/adversarial suite passed 64 tests and
the B1 compatibility suite passed 60 tests, both with zero failures, skips, or
todos.

The strict schema records both recovery cycles independently and rejects
missing, null, string, non-integer, negative, out-of-range, or wrong-length
required evidence. Startup classification accepts only
`FAIL_CLOSED_EXITED` or `FAIL_CLOSED_UNAVAILABLE`; probe evidence must match
the exact requested role, kind, status, bound, and in-image package version.
An incomplete or interrupted summary cannot receive PASS.

## Limitations and deferred evidence

This is deterministic local failure/recovery evidence, not production capacity
or provider evidence. It does not prove Cloud SQL regional failover, Cloud SQL
maintenance behavior, Cloud Run instance replacement or scaling, production
VPC behavior, production TLS, database privileges, IAM authentication, long
business-transaction behavior, production SLO compliance, or production
launch capacity.

Still required before PRD3-G01 can close:

- PRD3-G01-B3 business-transaction pressure and operational cutback evidence;
- PRD3-G01-C database identities, least privilege, and negative access proof;
- PRD3-G01-D real Cloud SQL failover, exact-candidate CI, review, merge, and
  post-merge closeout.
