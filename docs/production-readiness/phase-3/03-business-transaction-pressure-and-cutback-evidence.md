# PRD3-G01-B3 Business-Transaction Pressure and Cutback Evidence

| Field | Value |
| --- | --- |
| Phase / gate / subgate | `PHASE_3` / `PRD3-G01` / `PRD3-G01-B3` |
| Baseline commit | `5dba92b120c8d36ad0d5738a522910575138b284` |
| Baseline tree | `f46b4dccd5d31a09cf1374c647c0bbc6f3d4078c` |
| Local B3 evidence | `PASS` |
| Parent gate | `BASELINE_ONLY` |
| Canonical command | `npm run verify:prd3-g01-b3-final` |
| Canonical duration | 862.8 seconds |
| Summary schema | `moazez.prd3-g01-b3.transaction-pressure.v4` |

## Scope and conclusion

PRD3-G01-B3 passes its local evidence gate. The canonical final suite exercised
compiled production entry classes from immutable baseline and candidate images
against two fresh disposable PostgreSQL 16 databases. It used no demo seed,
delay SQL, external database, cloud resource, persistent volume, Redis, or
object storage. Only the approved Learning Media verifier/storage boundaries
and the playback signed-capability provider were controlled.

This result does not close PRD3-G01. Database-role privilege proof, real Cloud
SQL regional failover, production transport/IAM, exact-candidate CI, review,
merge, and post-merge evidence remain deferred to PRD3-G01-C and PRD3-G01-D.
The parent gate therefore remains `BASELINE_ONLY`.

## Superseded R1 evidence

All prior B3 R1 summaries are `NON_QUALIFYING_PRE_REVIEW_EVIDENCE`, were removed
before the final run, and are not used by this conclusion. R1 was superseded
because:

- signal handlers did not immediately route through authoritative finalization;
- embedded executable code used `process.exit()`;
- generic Learning Media `VERIFYING` interruption was not proven recoverable;
- Prisma disconnect could block later cleanup;
- inventory missed returned Promises and generic callbacks;
- runtime ownership was not fully fail-closed;
- playback callers were not source-derived;
- the strict summary accepted incomplete `PASS` candidates; and
- the disconnect rehearsal bypassed the actual finalizer.

The final suite first recorded bounded executable reproductions of those R1
defects, then used the corrected implementation and permanent regressions.

## R3 evidence-integrity correction

Before correction, bounded fixtures independently reproduced four remaining
integrity defects: an ordinary unknown error became `TRANSACTION_TIMEOUT` and
was accepted as a serialization abort; seven contradictory summaries were
accepted; `B3_DRIVER=PASS` could be exposed before a failed/never-settling
disconnect completed; and abort did not immediately stop PostgreSQL readiness,
container-marker, container-exit, or loopback TCP polling.

The corrected classifier returns only `P2024`, `P2028`, `P2034`,
`KNOWN_BUSINESS_REJECTION`, or `UNKNOWN_ERROR`, based on positive error-chain
evidence. Only exact `P2034` may satisfy a one-abort outcome. The strict summary
now cross-checks classification inventory, exact business-entry/manifest
pairing, unique paired lock evidence, exact fault-catalog receipts,
Serializable counts/codes, and cutback occupancy. All seven R3 mutations are
permanent negative tests.

The embedded driver stores its candidate result, runs bounded two-phase
disconnect and active-operation settlement, removes signal listeners, audits
zero clients/operations/timers/listeners, and only then emits `B3_DRIVER=`.
Cleanup failure emits only the sanitized finalization marker and a nonzero exit.
All normal-work polling and child calls use the shared abort signal; only
authoritative cleanup inspections explicitly ignore it.

## R4 evidence-authenticity correction

Six bounded pre-correction regressions recorded the remaining defects: the
second Teacher operation was admitted only after the first completed; empty
formal evidence and thrown positive assertions became receipts; unrelated
negative-injection errors were catalog-classified; the ordered-commit outcome
contradicted the old `B3-F24=P2034` receipt; `bounded()` could lose an
unsettled operation from `activeOperations`; and the summary builder replaced
a measured nonzero database audit with static zeroes.

R4 selects the truthful B3-F24 Model B. The catalog classification is
`SERIALIZABLE_CONTENTION_VALID_OUTCOME`; its proof requires two already-started
`ChangeTeacherEmploymentStatusUseCase.execute` promises, distinct observed
Prisma backend sessions, both promises pending before release, a measured
blocking relationship, a valid ordered-commit or exact-P2034 outcome, and all
Teacher invariants. It no longer claims `P2034` for ordered commits.

Negative fault injection and positive evidence proof now use separate APIs.
Negative receipts require an actually observed expected rejection, error
class, and stage. Positive assertion failures propagate and create no receipt.
Every receipt contains its proof type and observed outcome plus SHA-256 of a
canonical measured-evidence subset. The execution receipt is SHA-256 over the
fault ID, hook, proof ID, observed classification, and evidence digest. Strict
validation recomputes formal/live evidence from the summary and recomputes all
F01-F35 digests before accepting one-to-one coverage.

The embedded `bounded()` helper automatically tracks the underlying normal-work
Promise until actual settlement, including after caller timeout or abort.
Cleanup work has a separate bounded path. Result publication additionally
requires zero tracked clients, active operations, driver timers, and abort
listeners. The driver supplies live session/transaction/lock and business-
invariant final-audit measurements; the supervisor supplies measured client,
child, container, network, image, scratch, and inspection results. No missing
measurement is replaced with a zero fallback.

## Corrected transaction and runtime inventory

The final inventory uses a TypeScript program and type checker. Transaction
identity is derived from normalized source path, owning class/function,
transaction ordinal within that owner, and normalized callback SHA-256. The
analyzer recognizes explicit awaits, directly returned Promises, returned
helpers, `Promise.all` forms, conditional returns, nested helpers, and generic
callback returns. Lock classification is limited to the exact transaction
callback/helper subtree.

| Measure | Final value |
| --- | ---: |
| Total | 174 |
| Interactive | 166 |
| Batch | 8 |
| `SHORT_DB_ONLY` | 159 |
| `LOCK_CONTENTION_SENSITIVE` | 13 |
| `SERIALIZABLE_CONFLICT_SENSITIVE` | 2 |
| `EXTERNAL_WAIT_SENSITIVE` | 0 |
| External waits inside transactions | 0 |
| External waits outside transactions | 46 |
| Reviewed manual call classifications | 57 |
| Unknown classifications | 0 |
| Unresolved call chains | 0 |
| Unresolved runtime roles | 0 |
| Unwired transactions | 0 |
| Duplicate transaction IDs | 0 |
| Corrected file-level classification differences | 4 |
| Inventory digest | `daab3ced480c46026ba49c6b7499e5289f2ad77bb4b4a11091aa7288deee5349` |

The 57 reviewed classifications comprise the prior 52 synchronous/projection,
request-context, transaction-local loader, and transaction-client notification
helpers plus five fail-closed unit-of-work reviews: three generic callbacks and
two synchronous transaction-context factories. Every override records stable
transaction ID, source path, owner, unresolved expression, resolved callers,
classification, runtime role (with the row's structurally expanded ownership),
reason, source digest, and review evidence.

Runtime ownership is derived from the `main`, `core-worker`, `media-worker`,
and `maintenance-scheduler` entrypoint graphs. Single-role rows use the exact
allowed role. Shared rows carry an exact structurally expanded set of allowed
owners; the bare value `shared` is never accepted without that set. The final
inventory contains no unknown, unresolved, or unwired ownership.

## Source-derived playback caller inventory

The repository scan discovered exactly six production call sites and compared
their source path, owning class/function, callee, call-site digest, callback
expression, classification, and resolved side effects with the reviewed
catalog.

| Consumer | Callback classification |
| --- | --- |
| `LessonContentPlaybackCoordinator.execute` | `EXTERNAL_READ_ONLY_PROVIDER` |
| `TeacherLessonPreparationReadAdapter.getLessonContentPlayback` | `EXTERNAL_READ_ONLY_PROVIDER` |
| `ParentChildLessonsReadAdapter.getLessonContentPlayback` | `EXTERNAL_READ_ONLY_PROVIDER` |
| `StudentLessonsReadAdapter.getLessonContentPlayback` | `EXTERNAL_READ_ONLY_PROVIDER` |
| `StudentLessonsReadAdapter.withPlayableLessonContent` | `PURE_CAPABILITY_GENERATION` |
| `StudentLessonsReadAdapter.findPlayableLessonContent` | `PURE_CAPABILITY_GENERATION` |

Totals are two pure, four external read-only, zero database/persistent side
effects, and zero unknowns. Caller digest:
`7e7881a5b895b280979750f5bd93046b1050423e3cbacbb77da1ec22da3a6bc7`.
A permanent negative fixture proves a newly introduced database-writing caller
is discovered and rejected without catalog assistance.

## Production entry classes and invariant manifests

The formal scenarios invoke these production entries rather than raw Prisma,
direct unit-of-work callbacks, mocked transactions, or generic held
connections:

| Business path | Production entry | Transaction boundary | Core invariant proof |
| --- | --- | --- | --- |
| Learning Media | `CompleteLearningMediaUploadUseCase.execute` | `PrismaLearningMediaUnitOfWork` / `LearningMediaRepository` | exact claim/finalization/file/audit writes; no false `READY`; retry and duplicate constraints |
| Lesson Content | `UpdateLessonContentUseCase.execute` | `PrismaLessonContentUnitOfWork` / `LessonContentRepository` | only target draft changes; hierarchy, publication, unrelated content, and audit cardinality preserved |
| Teacher Lifecycle | `ChangeTeacherEmploymentStatusUseCase.execute` | `PrismaTeacherLifecycleUnitOfWork` / production operations | user/membership/profile/session transition; identity/allocation preservation; exact audits |

Each manifest records pre-state queries, expected and forbidden writes, audit
expectations, rollback expectations, idempotency, duplicate constraints, and
post-state queries. Both formal runs passed every baseline, lock, timeout,
rollback, retry, audit, and partial-write assertion.

## Playback correction and limitation

The coordinator now captures an authorized playable snapshot in one bounded
transaction, creates the signed capability outside any transaction, then
repeats authorization, locks, and snapshot capture in a second bounded
transaction. It exposes the result only when the final candidate is unchanged.

The archived baseline dynamically reproduced an open transaction during
signing. Both candidate runs observed zero open transactions and zero playback
locks while the signer was pending. Authorization, publication, upload-session,
media presence, and candidate-identity changes all prevented exposure; signing
rejection propagated; final revalidation rejection returned `null`; the
callback ran exactly once; TTL remained 300 seconds.

The Learning Media provider-pending scenario likewise observed zero open
transactions/locks and completed exactly once. Verifier rejection produced
`FAILED`, zero files, and one failure audit. A fact mismatch produced sanitized
`size_mismatch`. A finalization collision released to `UPLOADING`, invoked
cleanup once, and a retry produced exactly one `READY`, file, and success audit.

B3 does **not** prove recovery of an arbitrary persistent generic `VERIFYING`
claim after abrupt process death because the current design has no governed
verification lease or stale-claim recovery protocol. This truthful limitation
does not block B3: the SIGTERM rehearsal uses the playback signer wait, which
creates no persistent claim.

## Lock, timeout, and Serializable results

| Observation | Run 1 | Run 2 |
| --- | ---: | ---: |
| Learning Media baseline | 29 ms | 30 ms |
| Lesson Content baseline | 51 ms | 65 ms |
| Teacher Lifecycle baseline | 77 ms | 106 ms |
| Learning Media lock commit | 784 ms | 783 ms |
| Lesson Content lock commit | 883 ms | 880 ms |
| Teacher Lifecycle lock commit | 903 ms | 885 ms |
| Learning Media timeout (`15000`, `P2028`) | 16,272 ms | 16,268 ms |
| Lesson Content timeout (`30000`, `P2028`) | 31,395 ms | 31,294 ms |
| Teacher Lifecycle timeout (`30000`, `P2028`) | 31,368 ms | 31,397 ms |
| Pool-5 sixth operation (`P2024`) | 2,003 ms | 2,002 ms |

Every lock case observed `Lock` / `transactionid`, one blocking PID, and one
ungranted lock, then committed after release. Every timeout began the production
transaction, fully rolled back, emitted no false success audit, and succeeded
on a fresh retry.

Both Serializable runs constructed two separate production-entry instances on
separately named Prisma sessions. Both `execute` Promises started before either
completed. A tracked PostgreSQL row blocker held the common Teacher target while
the first production transaction waited; two bounded transactions occupied the
second production entry's pool so its already-started transaction request was
pending. The observer measured distinct backend identities, both production
Promises pending, three concurrent database transactions, and a real blocking
relationship before the blocker was released. The bounded pool gates settled
without consulting the first Promise, so the second production transaction read
the committed `INACTIVE` state and performed the real `INACTIVE` to `ACTIVE`
transition.

Each run therefore produced the truthful outcome
`SERIALIZED_ORDERED_COMMITS`, `committed=2`, `aborted=0`, `errorCode=null`,
`overlapObserved=true`, `bothPendingBeforeRelease=true`, and
`distinctBackendSessions=true`. Final invariants were one identity, one
membership, one active membership, one allocation, a revoked prior session,
and five exact committed audit rows. Sequential execution cannot qualify, and
no timeout, business rejection, unknown error, or non-P2034 abort is accepted
as a serialization conflict.

Run 1 started the two operations at `1785931477333` and `1785931477334`,
completed them at `1785931477476` and `1785931480374`, and observed maximum
concurrency 3. Run 2 started both at `1785931605877`, completed them at
`1785931606014` and `1785931608900`, and independently observed maximum
concurrency 3. The recomputed B3-F24 evidence/receipt digests were respectively
`c63b3e2e1465096430f179d30eb24b64760686b2aea3725165d3307270d6f1ea` /
`965fec111a88bc27f9a2888466ab8caecbf0207402acb26eab01964d8fdd08e8`
and `0bdbc5c436bd803ab5a8f799129d35dbf8eaac1e13cbc04040b28d6a6ec6f962` /
`db1b3ee7333ee35b12641cc18774b6d612514315e2abb1675378d1dfa0df432a`.

## Actual pool pressure and 5/2/1 cutback

At limit 5, five blocked `CompleteLearningMediaUploadUseCase` operations
occupied the same API `PrismaService` used by `OperationalProbeService`.
Observed connections were exactly five with no sampled overshoot. A sixth
production operation received `P2024`; readiness on the same pool returned 503;
after blocker release readiness returned 200, a later business operation
succeeded, and disconnect left zero sessions and locks.

| Limit | Zero occupied | One occupied | Full occupancy | Recovery | Measurement-derived classification |
| ---: | --- | --- | --- | --- | --- |
| 5 | readiness 200; business pass; 1 connection | readiness 200; extra business pass; max 2 | 503/503/503; next `P2024`; backend/max 5; no overshoot | readiness 200; later business pass; 0 sessions/locks | `NORMAL` |
| 2 | readiness 200; business pass; 1 connection | readiness 200; extra business pass; max 2 | 503/503/503; next `P2024`; backend/max 2; no overshoot | readiness 200; later business pass; 0 sessions/locks | `EMERGENCY_DEGRADED` |
| 1 | readiness 200; business pass; 1 connection | readiness 503; extra business `P2024`; max 1 | 503/503/503; next `P2024`; backend/max 1; no overshoot | readiness 200; later business pass; 0 sessions/locks | `LAST_RESORT_UNREADY_WHILE_BUSY` |

There is no reserved readiness connection. Limit 1 is last-resort only because
one occupied transaction makes readiness unavailable and blocks another
business operation.

## Failure rehearsals and evidence safety

- SIGINT during an actual Learning Media lock wait latched the first signal,
  immediately started the one authoritative finalizer, exited 130, published no
  summary, wrote no partial state or false success audit, and left zero residue.
- SIGTERM during an actual playback signer wait observed zero transactions and
  locks, created no persistent claim, returned/logged no capability, exited 143,
  invoked the finalizer once, and left zero residue.
- The false-state observer detected a deliberately false zero-transaction claim,
  emitted `B3_FALSE_STATE_OBSERVER`, exited 1, and published no summary.
- The actual finalizer retained a phase-one Prisma disconnect failure, terminated
  a tracked child, removed and inspected an owned container/network/image,
  retried disconnect successfully, and removed the client only after success.
  A never-settling phase-two client was bounded, left tracked, made the finalizer
  terminal `FAILED`, and did not skip non-Prisma cleanup.
- Normal driver finalization completed before result publication with phase-one
  and phase-two result arrays empty (all clients had already disconnected),
  tracked clients 0, active operations 0, pending timers 0, and pending abort
  listeners 0 in both formal runs. Controlled
  fixtures separately proved phase-one failure/phase-two success, phase-two
  rejection, phase-two timeout, never-settling Prisma and business operations,
  late settlement after caller timeout, settlement during finalization grace,
  unresolved-operation terminal failure, and result-marker suppression.
- Abort-aware seams proved immediate termination with no second Docker command
  during PostgreSQL readiness, container-marker, and container-exit polling;
  abort during loopback verification destroyed the pending socket immediately.

All 35 fault IDs produced evidence-derived execution receipts only after their
negative rejection or positive measured assertion was observed:
`covered=35`, `missing=0`, `duplicate=0`, `unknown=0`. Empty evidence, an
assertion exception, an unrelated injection exception, catalog-copied metadata,
a one-character receipt, and every digest mismatch are rejected. The strict
schema also rejects the prior incomplete/contradictory mutations, all seven R3
mutations, non-overlap, wrong exact Teacher cardinalities, impossible timeout or
lock timings, nonzero measured final audits, and cross-run provenance/proof
version mismatches. Atomic publication is tested at seven interruption points
plus successful finalizer-owned publication after the work signal is aborted.
Interrupted/ineligible paths retain no PASS.

## Disposable topology and provenance

The fixture used immutable PostgreSQL image
`sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`,
PostgreSQL 16, `max_connections=80`, `--pull=never`, loopback-only publication,
tmpfs data, no volume, synthetic credentials, and exact owned labels/names.
`prisma migrate deploy` and `prisma migrate status` both passed in named,
pull-disabled one-shot containers.

| Provenance item | Baseline | Candidate |
| --- | --- | --- |
| Image ID | `sha256:8f1049d8beac74dcbdd260a35856407e9c15484f9cb48830c0187cf782e507b3` | `sha256:76a5c9ce29de84ecc03066c713952069c475e626ca0f59eec70fad21772fd35c` |
| Runtime manifest SHA-256 | `b34fd90970a09716729e715e3f72cb25dfbf206f4fa2c8ed4f9f4418ba77cfeb` | `90be960ea5f38ead53dbfb5e6ee3b980c27995d3b6226169aaaf3cc47e8761cc` |
| Manifest entries | 5,869 | 5,869 |
| Node / Prisma / package | `v22.23.1` / `6.19.3` / `0.0.1` | `v22.23.1` / `6.19.3` / `0.0.1` |

Package-lock SHA-256:
`d4e8100d02554c36d0fef569bed31ddfbcb8e2af76994c67e46f5b843fef5dd4`.
Playback-only production patch SHA-256:
`f08b5a009d4d57d2db6f0f7948333a454be729c5314b7b30df87d7316bad11b0`.

## Two retained final summaries and cleanup

| Run | Strict summary path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `b3-msg1ffd0-1-a055f4` | `C:\Users\Abdal\AppData\Local\Temp\moazez-prd3-g01-b3-summaries\prd3-g01-b3-final-b3-msg1ffd0-1-a055f4.json` | 38,141 | `954d5629d76e160919a6149583098f764195ea71abe8adf7b04dba6ff3960e22` |
| `b3-msg1i4ns-2-02ab54` | `C:\Users\Abdal\AppData\Local\Temp\moazez-prd3-g01-b3-summaries\prd3-g01-b3-final-b3-msg1i4ns-2-02ab54.json` | 38,140 | `6311de1b6bd4bf3d691553c57ae2884518820b6871cc8fb92bdfc8507e33874d` |

Cross-run comparison passed: distinct run IDs, identical package/candidate/
runtime/inventory provenance, and independently strict-valid business evidence.
The authoritative finalizer ran once. Retained bytes were reread, revalidated,
and rehashed after publication.

Final inspected counts were open transactions 0, idle transactions 0,
unresolved lock waits 0, application sessions 0, Prisma clients 0, child
processes 0, containers 0, networks 0, images 0, scratch files 0, partial writes
0, and false success audits 0. Final preflight, `git diff --check`, and the
executable prohibited-pattern scan passed. Exactly the two summaries above were
retained.

## Validation totals

Node TAP totals are reported separately from fault receipts:

| Validation | Result |
| --- | ---: |
| B1 Node tests | 60/60 |
| B2 Node tests | 64/64 |
| B3 Node tests | 145/145 |
| B3 fault execution receipts | 35/35 |
| B3 combined Node-plus-receipt checks | 180 |
| Focused business/playback Jest tests | 129/129 |

The 129 focused tests comprise playback and its teacher/parent/student
consumers 22, Learning Media 39, Lesson Content 32, and Teacher Lifecycle 36.
`verify:prd3-g01-a`, Prisma validation/generation, the TypeScript build, and
`git diff --check` also passed. No combined value above is described as a Node
test total.

## Limitations and deferred work

This is local Docker/PostgreSQL evidence. It does not prove Cloud SQL, Cloud
Run, production TLS/IAM, provider regional failover, production traffic, or
least-privilege database roles. It does not prove generic `VERIFYING` stale-
claim recovery. PRD3-G01-C and PRD3-G01-D remain deferred, and PRD3-G01 remains
`BASELINE_ONLY`.
