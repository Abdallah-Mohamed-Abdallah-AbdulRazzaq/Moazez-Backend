# Production Readiness Phase 0A — Production Decision Register

## Status definitions

Only these statuses are used:

- `LOCKED_FROM_APPROVED_CONTEXT`: directly required by approved governance or
  an explicit owner instruction.
- `OWNER_DECISION_REQUIRED`: material scope, cost, contract, security, or
  operational authority is missing.
- `PROPOSED_RECOMMENDATION`: an engineering default that is not owner-approved.
- `DEFERRED_WITH_CONSTRAINT`: deliberately postponed with a binding limit.
- `REJECTED`: considered and not permitted.

No recommendation is represented as owner approval. Evidence IDs resolve to
`00-evidence-baseline.md`.

## Dependency-ordered summary

| ID | Topic | Status | Depends on | Recommended/default direction |
|---|---|---|---|---|
| PRD0-D001 | Preserve modular monolith | LOCKED_FROM_APPROVED_CONTEXT | — | One codebase and domain ownership model |
| PRD0-D002 | Preserve public API/adapter contracts | LOCKED_FROM_APPROVED_CONTEXT | D001 | `/api/v1`; additive change first |
| PRD0-D003 | Immutable governed migrations | LOCKED_FROM_APPROVED_CONTEXT | D001 | migrations only; drift/failure hard stop |
| PRD0-D004 | Multi-runtime deployment from one repository | LOCKED_FROM_APPROVED_CONTEXT | D001 | approved separate API/Core Worker/Media Worker/Migration Job/Maintenance Scheduler roles from one repository through Q001 |
| PRD0-D005 | API/Core/Media/Migration boundaries | LOCKED_FROM_APPROVED_CONTEXT | D004 | approved responsibility mapping through Q002; implementation remains gated |
| PRD0-D006 | BullMQ consumers prohibited in target API | LOCKED_FROM_APPROVED_CONTEXT | D005 | approved zero-consumer target API through Q010 |
| PRD0-D007 | Repeatable/scheduled ownership | LOCKED_FROM_APPROVED_CONTEXT | D005 | approved singular Maintenance Scheduler invocation and assigned consumers through Q011 |
| PRD0-D008 | Learning Media completion transition | OWNER_DECISION_REQUIRED | D002, D005 | keep synchronous through Phase 5A/5B; approve Learning Media-only submit/status transition in Phase 6 |
| PRD0-D009 | GCS production and MinIO local/test | OWNER_DECISION_REQUIRED | D004 | GCS in production; MinIO retained locally/CI |
| PRD0-D010 | Storage abstraction boundary | PROPOSED_RECOMMENDATION | D009 | incremental `ObjectStoragePort` with MinIO/GCS adapters and normalized errors/types; no giant catalog rewrite prerequisite |
| PRD0-D011 | Cloud SQL region and HA | OWNER_DECISION_REQUIRED | D004 | regional HA in same region as runtimes |
| PRD0-D012 | Cloud SQL role pool budgets | OWNER_DECISION_REQUIRED | D005, D011 | explicit per-role caps within failover budget |
| PRD0-D013 | Redis shared versus separated workloads | OWNER_DECISION_REQUIRED | D005 | separate queue and realtime production instances |
| PRD0-D014 | Redis production fallback | OWNER_DECISION_REQUIRED | D013 | fail readiness/realtime, never silent in-memory multi-instance mode |
| PRD0-D015 | Critical job recovery/reconciliation | OWNER_DECISION_REQUIRED | D005–D007, D013 | DB-backed outcome/reconcile contract per critical queue |
| PRD0-D016 | Worker capacity/autoscaling | OWNER_DECISION_REQUIRED | D012–D015 | fixed bounded minimum first; external scale only from measured lag |
| PRD0-D017 | GCP project/environment separation | OWNER_DECISION_REQUIRED | D004 | separate prod and non-prod projects |
| PRD0-D018 | Service-account boundaries | OWNER_DECISION_REQUIRED | D005, D017 | identity per runtime/job role |
| PRD0-D019 | GCS signed-URL identity | OWNER_DECISION_REQUIRED | D009, D018 | dedicated signing identity with bucket-limited access |
| PRD0-D020 | Secret Manager pinning/rotation | OWNER_DECISION_REQUIRED | D017, D018 | explicit versions for release, staged rotation |
| PRD0-D021 | Encryption key separation/key-ID envelope | OWNER_DECISION_REQUIRED | D020 | separate key families and key ID with multi-key decrypt |
| PRD0-D022 | Frontend origins and production CORS | LOCKED_FROM_APPROVED_CONTEXT | D002, D009, D017 | approved exact production/staging HTTPS origins and credential/WebSocket/direct-storage requirements through Q022 |
| PRD0-D023 | Ingress/domain/LB/Cloud Armor | OWNER_DECISION_REQUIRED | D017, D022 | authenticated/private where possible; edge controls by threat model |
| PRD0-D024 | Liveness/startup/readiness semantics | LOCKED_FROM_APPROVED_CONTEXT | D005, D013 | approved protected role-specific probes and minimum dependency semantics through Q024 |
| PRD0-D025 | Logs, metrics, SLOs, alerts | OWNER_DECISION_REQUIRED | D005, D024 | structured/redacted telemetry and service/queue/media SLOs |
| PRD0-D026 | Migration job and deploy ordering | OWNER_DECISION_REQUIRED | D003, D005, D011, D018 | migration job before compatible runtime promotion |
| PRD0-D027 | Backward-compatible rollback constraints | LOCKED_FROM_APPROVED_CONTEXT | D003, D026 | immutable migrations and compatible rollback are locked; expand/contract is the recommended technique, not a separately locked mandate |
| PRD0-D028 | Backups, PITR, RTO, RPO | OWNER_DECISION_REQUIRED | D011 | PITR plus restore drills against approved objectives |
| PRD0-D029 | Production data migration/clean start | OWNER_DECISION_REQUIRED | D009, D011, D028 | persisted PostgreSQL/object data migrate only if required; Redis queues drain/reconcile/re-enqueue from persisted truth and ephemeral realtime state is rebuilt |
| PRD0-D030 | Initial max instances/concurrency | OWNER_DECISION_REQUIRED | D012–D016 | conservative caps proven by load/failure tests |
| PRD0-D031 | Workload/file-size assumptions | OWNER_DECISION_REQUIRED | D008, D016, D030 | owner supplies launch and growth envelopes |
| PRD0-D032 | Staging equivalence/release promotion | OWNER_DECISION_REQUIRED | D017–D031 | same artifact/config shape, immutable digest promotion |
| PRD0-D033 | Node runtime version | LOCKED_FROM_APPROVED_CONTEXT | D032 | approved Node 22 LTS policy and locked Firebase Admin 14.x line through Q028 |
| PRD0-D034 | Production Swagger exposure | LOCKED_FROM_APPROVED_CONTEXT | D022, D023 | approved disabled production Swagger with no audience/risk acceptor through Q029 |
| PRD0-D035 | Public root/health diagnostics | LOCKED_FROM_APPROVED_CONTEXT | D023–D025 | approved minimal root and public health fields with one-release-cycle compatibility through Q030 |
| PRD0-D036 | Parent messaging upload contract | OWNER_DECISION_REQUIRED | D002 | bounded Parent endpoint, narrowly scoped shared permission, text-only/no-new-upload, or explicit alternative |
| PRD0-D037 | Reinforcement proof-type MIME policy | LOCKED_FROM_APPROVED_CONTEXT | D002 | approved narrow declared/detected IMAGE/VIDEO/DOCUMENT matrix and compatibility controls through Q032 |
| PRD0-D038 | Generic File detected-content validation | OWNER_DECISION_REQUIRED | D002 | purpose-aware declared/detected mismatch and rejection policy |
| PRD0-D039 | Malware scanning and failure policy | OWNER_DECISION_REQUIRED | D038 | provider, synchronous/asynchronous placement, fail-open/closed, quarantine, retention |
| PRD0-D040 | File-purpose classification | OWNER_DECISION_REQUIRED | D038 | derive purpose where safe or store approved typed classification; no schema field is pre-approved |
| PRD0-D041 | Retention policy ownership | OWNER_DECISION_REQUIRED | D040 | decide whether retention belongs to `File`, business relation, or policy service |
| PRD0-D042 | Feature retention periods | OWNER_DECISION_REQUIRED | D041 | explicit periods/classes for each reference family and operational source |
| PRD0-D043 | Admissions/audit/legal hold | OWNER_DECISION_REQUIRED | D041–D042 | superseded evidence retention and hold precedence |
| PRD0-D044 | Physical deletion approval/enablement | OWNER_DECISION_REQUIRED | D041–D043 | report-only first; destructive production deletion separately enabled |
| PRD0-D045 | Orphan-candidate reconciliation ownership | OWNER_DECISION_REQUIRED | D041 | named owner, review cadence, false-positive disposition |
| PRD0-D046 | Grade MEDIA URL policy | OWNER_DECISION_REQUIRED | D002, D029, D038 | managed `fileId`, approved external HTTPS, compatibility window, or block new provider URLs |
| PRD0-D047 | Legacy branding URL treatment | OWNER_DECISION_REQUIRED | D029, D038 | classify managed/external/provider/unsafe/null without removing safe fallback prematurely |
| PRD0-D048 | Multipart edge limits and upload concurrency | OWNER_DECISION_REQUIRED | D030–D031, D038 | route/edge caps, instance memory/concurrency, rate limits, large-file direct PUT |
| PRD0-D049 | Object-preservation branch | OWNER_DECISION_REQUIRED | D029 | apply D029 clean-start `N/A_WITH_EVIDENCE` or migration inventory/copy/reconcile branch |
| PRD0-D050 | Source MinIO read-only rollback window | OWNER_DECISION_REQUIRED | D049 | duration, freeze/delta policy, cutback authority, deletion prohibition |
| PRD0-D051 | Missing-checksum verification | OWNER_DECISION_REQUIRED | D049 | full or sampled hashing and mismatch disposition for legacy objects |
| PRD0-D052 | Storage bucket/privacy topology | OWNER_DECISION_REQUIRED | D009, D017–D019 | staging/final/private/public buckets, region, IAM, CORS, signer limits |
| PRD0-D053 | GCS versioning/lifecycle/deletion protection | OWNER_DECISION_REQUIRED | D042, D044, D052 | versioning, lifecycle rules, retention locks, deletion protection, recovery cost |

Status totals: 14 `LOCKED_FROM_APPROVED_CONTEXT`, 38
`OWNER_DECISION_REQUIRED`, 1 `PROPOSED_RECOMMENDATION`, 0
`DEFERRED_WITH_CONSTRAINT`, and 0 `REJECTED`.

## Detailed decision records

### PRD0-D001 — Preserve the modular monolith

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-061 and the task
  explicitly preserve the modular monolith.
- **Options considered / recommendation:** one modular monolith; distributed
  microservices. Keep one modular monolith.
- **Reasoning / rejected or deferred:** runtime isolation does not require
  distributing domain ownership. Microservice decomposition is rejected for
  this program unless separately approved.
- **Impacts:** no API, database/migration, tenancy, permission, or business
  contract change. Operationally, one repository may still build several role
  commands/images.
- **Security / rollback:** current central guards and domain boundaries remain
  authoritative; rollback is artifact/role rollback, not service reassembly.
- **Phase / approval / reopen:** all phases; approved governance exists. Reopen
  only through a superseding architecture decision outside this program.

### PRD0-D002 — Preserve public and adapter-backed contracts

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-060 and approved
  API rules require `/api/v1` and stable adapter-backed paths/methods.
- **Options / recommendation:** silent breaking changes, additive evolution, or
  new version. Use additive evolution; version only when compatibility cannot
  be retained.
- **Reasoning / alternatives:** silent path/method/shape changes are rejected.
  Coordinated breaking work is deferred until owner/client approval.
- **Impacts:** no current DB change; future additive status data may require an
  additive migration. Auth/tenancy checks cannot weaken.
- **Operations / rollback:** support overlapping client/runtime versions and
  prove prior-client compatibility; roll back only while both data/contract
  versions remain readable.
- **Phase / approval / reopen:** phases 1–9; approved context exists. Reopen a
  specific endpoint only with explicit owner approval and client migration plan.

### PRD0-D003 — Preserve migration governance

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-004, EVD-030,
  EVD-062.
- **Options / recommendation:** immutable migrations through `migrate deploy`;
  schema push/direct SQL/editing committed migration. Use the governed path.
- **Reasoning / alternatives:** push, manual production edits, reset, or
  bypassing drift/P3009 are rejected.
- **Impacts:** every schema change is a new migration; seeds remain separate.
  Security requires a restricted migration identity and audit trail.
- **Operations / rollback:** stop on drift/checksum/failure; use compatible
  forward fixes and restore only through an approved recovery plan.
- **Phase / approval / reopen:** Phase 3 and Phase 8; approved governance. Only a
  superseding migration-governance approval can reopen.

### PRD0-D004 — Deploy multiple runtime roles from one repository

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-011–EVD-026 show
  current coupling; D001 constrains the form.
- **Approval authority:** owning question PRD0-Q001; approved by Abdallah on
  2026-07-27 in product, architecture, operations, and release capacities;
  owning ADR ADR-0004.
- **Approved decision:** separate API, Core Worker, Media Worker, Migration Job,
  and Maintenance Scheduler roles from one repository. This is an approved
  architecture constraint, not implemented behavior.
- **Reasoning / alternatives:** one service couples scaling and failure domains;
  microservices violate D001.
- **Impacts:** no intended API/schema/data change; build and dependency
  injection/composition change. IAM becomes role-specific.
- **Operations / rollback:** independent scaling/drain improves containment;
  rollback to the coupled image is unsafe after role-specific schedules unless
  duplicate-consumer proof exists.
- **Phase / approval / reopen:** Phase 2 implementation remains gated. Reopen
  if the platform cannot run non-HTTP workers or cost evidence rejects
  separation.

### PRD0-D005 — Define API/Core Worker/Media Worker/Migration Job boundaries

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-012,
  EVD-017–EVD-025,
  EVD-030.
- **Approval authority:** owning question PRD0-Q002; approved by Abdallah on
  2026-07-27 in product, architecture, security, operations, and release
  capacities; owning ADR ADR-0004.
- **Approved decision:** API owns HTTP/WebSocket, auth, realtime, producers, and
  synchronous Learning Media completion until Phase 6 approval. Core owns the
  approved communication, push, email, import, dismissal, and branding
  consumers. Media owns Learning Media cleanup and may own asynchronous
  verification only after Phase 6 approval. Migration runs governed
  `prisma migrate deploy`; Maintenance singularly invokes approved schedules.
  These boundaries are not yet implemented.
- **Reasoning / alternatives:** domain microservice splits are rejected.
  Dismissal/branding repeat registration may move to a scheduler while consumers
  remain Core.
- **Impacts:** preserve contracts. Phase 2 implements API/Core separation only:
  Learning Media verification remains synchronous in the HTTP completion path
  and current cleanup ownership is preserved. Phase 6 may add media state after
  separate approval. No data migration unless later media/storage strategy
  requires it. Separate least-privilege identities.
- **Operations / rollback:** queue payload compatibility is mandatory; rollback
  role by role without two schedulers.
- **Phase / approval / reopen:** Phase 2 implementation remains gated. Reopen
  based on measured resource isolation or provider execution limits.

### PRD0-D006 — Prohibit BullMQ consumers in the target API

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; seven consumers currently
  initialize in the API graph (EVD-017–EVD-025).
- **Approval authority:** owning question PRD0-Q010; approved by Abdallah on
  2026-07-27 in architecture, security, operations, and release capacities;
  owning ADR ADR-0004.
- **Approved decision:** the target role-specific API graph has no BullMQ
  consumers and no exceptions. Producers remain. The current coupled graph is
  an implementation gap.
- **Reasoning / alternatives:** toggles in the full graph are weaker than
  construction-time exclusion; consumers-everywhere creates uncontrolled
  scaling and shutdown risk.
- **Impacts:** no API/schema change; producer dependencies remain. API identity
  should not receive provider/delete permissions needed only by workers.
- **Operations / rollback:** deploy workers healthy before disabling API
  consumers; rollback must avoid double processing/scheduling.
- **Phase / approval / reopen:** Phase 2 implementation remains gated. Reopen
  only if a queue is proven to require request-local consumption through a
  superseding ADR.

### PRD0-D007 — Own repeatable and scheduled jobs explicitly

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-023–EVD-026.
- **Approval authority:** owning question PRD0-Q011; approved by Abdallah on
  2026-07-27 in architecture, security, operations, and release capacities;
  owning ADR ADR-0004.
- **Approved decision:** the Maintenance Scheduler singularly invokes
  idempotent dismissal expiry for Core consumption, Learning Media discovery
  for Media cleanup consumption, and branding reconciliation for Core cleanup
  consumption. This ownership is not yet implemented and does not authorize
  destructive cleanup.
- **Reasoning / alternatives:** implicit every-instance registration obscures
  failure and delete ownership. Presence refresh remains per WebSocket process.
- **Impacts:** no public/schema impact unless an execution ledger is added.
  Maintenance identity needs only necessary DB/storage permissions.
- **Operations / rollback:** deterministic schedule IDs, distributed exclusion,
  missed-run alerts, and manual replay; disable old owner before enabling new.
- **Phase / approval / reopen:** Phase 2 implementation remains gated. Reopen
  after scheduler cost/reliability evidence or a material responsibility
  change.

### PRD0-D008 — Transition media completion safely

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; current complete request
  verifies and finalizes synchronously, with no status GET (EVD-040–EVD-043).
- **Options / recommendation:** keep synchronous; replace with 202/poll; add
  async submit/status alongside old behavior; new `/api/v2`. Prefer additive
  submit/status, dual-run compatibility, then separately approve retirement.
- **Reasoning / alternatives:** immediate semantic replacement risks existing
  clients; indefinite synchronous processing retains timeout/disk coupling.
- **Impacts:** coordinated contract risk; likely additive state/lease migration,
  no destructive data migration. Authorization on status/result must match
  current school/permission scope.
- **Operations / rollback:** idempotent submission and worker recovery; keep old
  readable state and route during rollback.
- **Phase / approval / reopen:** Phase 6; owner/client approval missing. Reopen
  after client capability and workload envelope are known.

### PRD0-D009 — Use GCS in production and retain MinIO locally/in CI

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; current MinIO concrete
  binding/static keys and GCS blast radius are EVD-036–EVD-039.
- **Options / recommendation:** MinIO everywhere; GCS everywhere; GCS production
  plus MinIO local/test. Recommend the hybrid.
- **Reasoning / alternatives:** local GCS-only raises test friction; operating
  production MinIO adds an avoidable stateful service.
- **Impacts:** no intended HTTP/schema change; object migration/verification may
  be required. Replace static keys with service identity.
- **Operations / rollback:** when PRD0-Q004 requires migration, use
  inventory/copy/checksum/cutback and retain source objects through the recovery
  window. A verified clean start uses `N/A_WITH_EVIDENCE`. Both branches still
  require real-GCS IAM/signed URL/CORS/Range/provider-error tests.
- **Phase / approval / reopen:** Phase 5A; owner approval missing. Reopen if
  regulatory, cost, portability, or real provider evidence changes.

### PRD0-D010 — Introduce a provider-neutral storage boundary

- **Status / evidence:** `PROPOSED_RECOMMENDATION`; EVD-036–EVD-038 show
  MinIO-derived capability types in `StorageService` and provider error-code
  interpretation outside the adapter. X-Amz expiry parsing is correctly
  contained in the concrete `MinioAdapter`.
- **Options / recommendation:** branch in callers; replace concrete adapter
  only; define provider-neutral port/types/errors and adapters. Recommend the
  last.
- **Reasoning / alternatives:** caller branching is rejected; a shallow adapter
  swap does not normalize leaked capability types or out-of-adapter error
  semantics. Each concrete adapter may retain its own URL parsing.
- **Impacts:** no public/schema/data impact by itself; security centralizes
  signed capability policy.
- **Operations / rollback:** contract tests run against both adapters; select
  prior adapter/config without caller changes.
- **Phase / approval / reopen:** Phase 5A; engineering proposal, not owner
  approval. Reopen if existing port can be proven provider-neutral by tests.

### PRD0-D011 — Select Cloud SQL region and HA topology

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; no target region/HA decision
  exists (EVD-027, LIM-003).
- **Options / recommendation:** zonal; regional HA; cross-region design.
  Recommend regional HA co-located with runtimes; cross-region DR separately.
- **Reasoning / alternatives:** zonal has larger outage exposure; cross-region
  synchronous complexity is not justified without RTO/RPO.
- **Impacts:** no API/schema; data placement/migration and residency matter.
  Private connectivity and encrypted transport required.
- **Operations / rollback:** restore/cutback plan and DNS/connector controls;
  topology rollback is data-bearing and cannot be treated as image rollback.
- **Phase / approval / reopen:** phase 3; region, residency, budget approval
  missing. Reopen on user geography/compliance/RTO evidence.

### PRD0-D012 — Set Cloud SQL connection budgets per role

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; no explicit pool budgets,
  every role creates a Prisma client (EVD-015, EVD-027–EVD-029).
- **Options / recommendation:** defaults; one global cap; role-specific pool and
  instance caps. Recommend role-specific budgets with failover headroom.
- **Reasoning / alternatives:** unbounded/default autoscaling can exhaust Cloud
  SQL; one cap ignores media/worker transaction profiles.
- **Impacts:** no contract/schema; connection URLs/config differ. DB credentials
  and roles should be separated.
- **Operations / rollback:** alert on utilization/wait; lower concurrency before
  scaling DB; retain emergency headroom for migration/operations.
- **Phase / approval / reopen:** phase 3; instance size and workload missing.
  Reopen after load/failover evidence.

### PRD0-D013 — Separate or share Redis queue/realtime workloads

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; four client purposes share
  one URL (EVD-031–EVD-035).
- **Options / recommendation:** one instance/database; logical separation;
  separate queue and realtime instances. Recommend separate production
  instances.
- **Reasoning / alternatives:** one outage/latency domain affects jobs,
  schedules, fan-out, presence, and locks. Logical DBs do not isolate capacity.
- **Impacts:** no API/schema; queued jobs must be drained/migrated rather than
  copied blindly. Network/IAM paths multiply.
- **Operations / rollback:** never let two queue clusters process the same
  logical job set; controlled drain/cutover and dual telemetry.
- **Phase / approval / reopen:** Phase 3; cost/SLO approval missing. Reopen if
  measured launch workload and acceptable shared blast radius support one.

### PRD0-D014 — Define Redis production fallback

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; realtime silently falls back
  to unsafe per-process memory (EVD-032–EVD-034).
- **Options / recommendation:** silent fallback; single-instance pinning;
  fail readiness/realtime while HTTP degrades explicitly. Recommend fail-closed
  realtime and observable API policy; no silent multi-instance memory.
- **Reasoning / alternatives:** silent fallback produces divergent truth.
  Single-instance pinning sacrifices availability and does not fix recovery.
- **Impacts:** WebSocket availability semantics may be additive operational
  change; no schema/data. Avoid leaking topology details publicly.
- **Operations / rollback:** circuit-break/reconnect, alerts, client retry, and
  tested degraded-mode runbook.
- **Phase / approval / reopen:** Phase 3; product tolerance missing. Reopen only
  if a sticky, single-instance non-production mode is explicitly scoped.

### PRD0-D015 — Recover and reconcile critical jobs

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; generation enqueue gap,
  single-attempt imports, partial dismissal success, and cleanup claims exist
  (EVD-019–EVD-025).
- **Options / recommendation:** retries only; generic dead-letter; domain
  persisted outcome plus queue retry/reconciler. Recommend the last for
  notification, email, import, dismissal, media, and destructive cleanup.
- **Reasoning / alternatives:** Redis job retention alone is not durable
  business truth.
- **Impacts:** additive status/outbox/execution-ledger migrations may be needed;
  no existing response may claim completion before its current contract point.
  Replay must enforce tenant context.
- **Operations / rollback:** idempotency keys, terminal dashboards, replay
  authorization, poison isolation, and immutable audit.
- **Phase / approval / reopen:** Phase 3; criticality/retry windows need owner
  approval. Reopen per job based on side-effect semantics.

### PRD0-D016 — Choose worker capacity model

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; all workers use default
  concurrency one and current consumers scale with API (EVD-018–EVD-025).
- **Options / recommendation:** fixed worker capacity; Cloud Run worker pool;
  external lag autoscaling. Start with fixed bounded capacity/minimums, then
  enable external scaling only from validated lag metrics.
- **Reasoning / alternatives:** blind autoscaling can exhaust DB/Redis/provider
  quotas; fixed forever may miss SLOs.
- **Impacts:** no contract/schema; IAM for scaler/metrics if used.
- **Operations / rollback:** cap instances/concurrency; scale down only after
  drain; preserve retry and heartbeat evidence.
- **Phase / approval / reopen:** Phase 3 capacity, then Phase 8 proof; cost, latency SLO, and workload
  missing. Reopen after load tests.

### PRD0-D017 — Separate GCP projects/environments

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; no GCP configuration/IaC is
  present (EVD-059).
- **Options / recommendation:** one project; folders with shared project;
  separate prod and non-prod projects. Recommend separate projects and billing/
  policy boundaries.
- **Reasoning / alternatives:** one project increases accidental mutation and
  IAM/quota blast radius.
- **Impacts:** no API/schema; data promotion is prohibited—promote artifacts and
  migrations, not production data. Separate identities/secrets.
- **Operations / rollback:** environment-specific IaC state and immutable
  artifact digest; project rollback is resource-level, not config copying.
- **Phase / approval / reopen:** Phase 4; organization, billing, region, naming
  approval missing. Reopen for organization policy constraints.

### PRD0-D018 — Bound service accounts by runtime

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; current static credentials
  and coupled graph cannot express least privilege (EVD-012, EVD-051–EVD-055).
- **Options / recommendation:** one runtime identity; identity per environment;
  identity per API/Core/Media/Migration/Maintenance/deployer role. Recommend the
  last.
- **Reasoning / alternatives:** a shared identity inherits DDL, provider,
  signing, and deletion blast radius.
- **Impacts:** no contract/schema; credential-free workload identity preferred.
- **Operations / rollback:** version IAM with IaC, test denied actions, and keep
  rollback identity permissions compatible with prior artifact only.
- **Phase / approval / reopen:** Phase 4; missing owner/security approval.
  Reopen only if platform limits identity count, retaining least privilege.

### PRD0-D019 — Choose signed-URL identity

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; current signing uses static
  MinIO keys and AWS query parsing (EVD-036–EVD-037).
- **Options / recommendation:** API broad storage identity; dedicated signer;
  signing service. Recommend dedicated signing-capable service account used by
  API/authorized worker with bucket/object-prefix limits.
- **Reasoning / alternatives:** broad object-admin API rights are rejected.
  Separate signing service is deferred unless scale/policy justifies it.
- **Impacts:** preserve signed upload/download/playback contracts; no schema.
  Capability TTL/content headers and audit are security-sensitive.
- **Operations / rollback:** rotate signer while accepting old URLs until TTL
  expires; prior signer retained only for bounded rollback.
- **Phase / approval / reopen:** Phase 4 identity and Phase 5A storage; missing IAM choice. Reopen if
  GCS signing mechanism/platform constraints require delegation.

### PRD0-D020 — Pin and rotate Secret Manager versions

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; secrets are env-driven and
  rotation policy is absent (EVD-051–EVD-055).
- **Options / recommendation:** `latest`; immutable version per release; dynamic
  refresh. Recommend release-pinned versions, staged overlap, then promotion;
  dynamic refresh only where tested.
- **Reasoning / alternatives:** `latest` can mutate a running/restarted release
  without artifact change. Permanent unrotated secrets are rejected.
- **Impacts:** no API/schema except encryption-key migration in D021. Secret
  access audit and least privilege required.
- **Operations / rollback:** retain prior version through rollback window and
  test both before disabling old.
- **Phase / approval / reopen:** Phase 4; rotation cadence/owners missing. Reopen
  per secret based on provider capabilities.

### PRD0-D021 — Separate encryption keys and add key IDs

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; device tokens and SMTP
  passwords use one `v1` format and one key without key ID (EVD-054–EVD-055).
- **Options / recommendation:** retain shared key; separate keys only; separate
  keys plus key-ID envelope/multi-key decrypt and staged re-encryption. Recommend
  the last.
- **Reasoning / alternatives:** shared key couples compromise and rotation;
  format version alone cannot select an old key.
- **Impacts:** additive envelope/data migration with dual read and write-new;
  no public API change. Keys must not enter logs/jobs.
- **Operations / rollback:** keep old decrypt key until completeness audit;
  never roll back writer after retiring its key.
- **Phase / approval / reopen:** Phase 4; security owner approval missing.
  Reopen if Cloud KMS envelope encryption is selected.

### PRD0-D022 — Approve frontend origins and CORS

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; production HTTP/WebSocket
  CORS is `false`; storage CORS is externally configured (EVD-011, EVD-014,
  EVD-051).
- **Approval authority:** owning question PRD0-Q022; approved by Abdallah on
  2026-07-27 in product, architecture, security, operations, and release
  capacities; owning ADR ADR-0006.
- **Approved decision:** production origins are
  `https://schools.moazez.cloud` and `https://admin.moazez.cloud`; staging
  origins are `https://staging-schools.moazez.cloud` and
  `https://staging-admin.moazez.cloud`. Credentials, WebSockets, and future
  approved direct-storage access are required. Wildcards are prohibited and
  paths/trailing slashes are not origins. Application and storage
  configuration remain implementation gaps; this does not approve GCS, IAM,
  buckets, signing, or provisioning.
- **Reasoning / alternatives:** wildcard with credentials is rejected; disabled
  production browser access is not a viable launch policy if web clients exist.
- **Impacts:** no route/schema change; browser behavior changes operationally.
  Include preflight, signed PUT headers, GET/Range, and WebSocket tests.
- **Operations / rollback:** version allowlists; emergency remove an origin
  without broad wildcard.
- **Phase / approval / reopen:** Phase 1 minimum boundary, Phase 5A storage, and
  Phase 7 full controls remain gated. Reopen when approved clients or domains
  change.

### PRD0-D023 — Select ingress, domain, load balancer, and Cloud Armor

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; no deployment/IaC or threat
  model choice exists (EVD-059).
- **Options / recommendation:** direct public Cloud Run; external HTTPS LB with
  custom domain/managed TLS/Armor; private ingress. Recommend private services
  where possible and LB/Armor for public API after threat/cost approval.
- **Reasoning / alternatives:** direct public ingress is simpler but has fewer
  centralized edge controls; unnecessary LB complexity may be deferred.
- **Impacts:** preserve API paths/headers/WebSocket upgrades; no schema. Define
  trusted proxy/request-ID and rate-limit policy.
- **Operations / rollback:** traffic split and prior backend; DNS TTL/certificate
  rollback plan.
- **Phase / approval / reopen:** Phase 7/8; domain, threat model, budget missing.
  Reopen on client/network requirements.

### PRD0-D024 — Separate liveness, startup, and readiness

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; public health returns 200 and
  incomplete aggregate details (EVD-046–EVD-047).
- **Approval authority:** owning question PRD0-Q024; approved by Abdallah on
  2026-07-27 in product, architecture, security, operations, and release
  capacities; owning ADR ADR-0010.
- **Approved decision:** add protected role-specific startup, liveness, and
  readiness probes. API requires validated configuration, HTTP startup,
  Prisma, queue-producer Redis, object storage for enabled file contracts, and
  realtime Redis when enabled. Core requires validated configuration, Prisma,
  queue Redis, and assigned consumers. Media requires validated configuration,
  Prisma, queue Redis, object storage, temporary disk, and verified `ffprobe`.
  Public health is limited to status, version, and timestamp. Current code does
  not yet implement this contract.
- **Reasoning / alternatives:** liveness must not depend on every external
  service; readiness must fail routing when critical dependencies/role startup
  fail. In-place semantic break is deferred.
- **Impacts:** additive routes/status semantics; no schema. Limit public
  diagnostic data.
- **Operations / rollback:** probe thresholds avoid restart storms; previous
  endpoint remains during rollout.
- **Phase / approval / reopen:** Phase 1 minimum probes and Phase 7 full
  semantics remain gated. Reopen if the platform requires different probe
  mechanics or the approved dependency contract changes.

### PRD0-D025 — Define logs, metrics, SLOs, and alerts

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; only text logging exists;
  metrics/tracing/heartbeats/lag are absent (EVD-048–EVD-050).
- **Options / recommendation:** logs only; managed logging+metrics; full
  structured logs, custom metrics, traces, SLOs/alerts. Recommend staged full
  coverage with redaction and cost limits.
- **Reasoning / alternatives:** tests do not detect production saturation or
  stuck work. Unlimited high-cardinality telemetry is rejected.
- **Impacts:** no public/schema change; correlation fields may be additive.
  PII/secrets must be excluded and retention/access approved.
- **Operations / rollback:** telemetry failure must not crash business paths;
  minimum error/readiness alerts survive instrumentation rollback.
- **Phase / approval / reopen:** Phase 7; SLO targets, retention, paging owner,
  and budget missing. Reopen quarterly from incident/cost evidence.

### PRD0-D026 — Order migration job and deployment

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; governed deploy command
  exists but no deployment pipeline/job (EVD-030, EVD-059).
- **Options / recommendation:** app-startup migration; manual console; explicit
  Migration Cloud Run Job gate. Recommend the job: preflight/backup gate,
  `migrate deploy`, status, then compatible runtime promotion.
- **Reasoning / alternatives:** app-startup race and manual untracked commands
  are rejected.
- **Impacts:** migration policy governs schema; seeds excluded. Job identity has
  DDL privilege unavailable to runtimes.
- **Operations / rollback:** failure blocks rollout; immutable logs/checksum;
  forward fix or approved restore, never automatic down migration.
- **Phase / approval / reopen:** Phase 8; orchestration approval missing.
  Reopen only for provider pipeline constraints.

### PRD0-D027 — Preserve backward-compatible rollback constraints

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; immutable migrations
  and compatibility rules are approved (EVD-062).
- **Locked rule versus recommendation:** committed migrations remain immutable
  and runtime rollback must remain schema/data compatible. Expand/contract is
  the recommended implementation technique; this draft does not elevate that
  exact technique to an additional governance lock.
- **Reasoning / alternatives:** editing/down-reverting committed migrations is
  rejected.
- **Impacts:** temporary additive schema/read-old-write-new may be required; no
  silent API break. Security constraints must remain enforced during overlap.
- **Operations / rollback:** prior runtime may roll back only while it remains
  schema/data compatible; destructive contract phase waits past rollback window.
- **Phase / approval / reopen:** Phase 3, Phase 8, and Phase 9; approved constraint. Reopen only
  through superseding migration governance.

### PRD0-D028 — Approve backups, PITR, RTO, and RPO

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; no production objectives or
  restore evidence exists (LIM-003, LIM-004).
- **Options / recommendation:** provider defaults; PITR plus scheduled backups;
  cross-region copy. Enable PITR and retention sufficient for approved RPO/RTO,
  then prove restores; cross-region based on D011.
- **Reasoning / alternatives:** backup configuration without restore drills is
  insufficient evidence.
- **Impacts:** no API/schema; contains all production data and privacy/retention
  obligations.
- **Operations / rollback:** restore into isolated environment, validate
  migrations/checksums/tenancy, document cutover.
- **Phase / approval / reopen:** Phase 8 and Phase 9; RTO/RPO/retention/residency
  missing. Reopen after drills/business impact review.

### PRD0-D029 — Decide clean start versus production data migration

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; target production data
  source/volume is unknown (LIM-003).
- **Options / recommendation:** clean start; migrate persisted PostgreSQL only;
  or migrate persisted PostgreSQL plus required objects. Owner must state
  authoritative sources. Redis queue state is not a normal copy source:
  consumers/producers drain, persisted outcomes reconcile, required work is
  re-enqueued from persisted truth, and ephemeral realtime state is rebuilt.
- **Reasoning / alternatives:** assuming clean start can lose required data;
  copying Redis queues blindly can duplicate effects.
- **Impacts:** potentially all normalized data and `File` objects; no contract
  change. Encryption/key availability and tenant isolation must be validated.
- **Operations / rollback:** reconciliation counts/checksums, freeze/delta plan,
  source retention, and tested abort point.
- **Phase / approval / reopen:** Phase 0B decision; Phase 3 data behavior,
  Phase 5A objects, Phase 4 crypto, and Phase 8 rehearsals branch on it. Reopen
  if scope/data changes.

### PRD0-D030 — Set initial instances and concurrency

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; current worker concurrency is
  one and no production load/pool budget exists (EVD-018, EVD-027, LIM-003).
- **Options / recommendation:** provider defaults; high autoscaling; conservative
  explicit min/max/concurrency per role. Recommend conservative caps derived
  from D012/D013 and load tests.
- **Reasoning / alternatives:** defaults can exceed DB/provider capacity;
  over-conservative caps can miss SLOs.
- **Impacts:** no contract/schema; impacts queue delay/media timeout. Limit
  concurrent destructive/provider work.
- **Operations / rollback:** config rollback and emergency cap; observe
  saturation/lag before increase.
- **Phase / approval / reopen:** provisional Phase 3, then Phase 6/7/8 evidence; workload/cost missing. Reopen
  after measured staging/prod.

### PRD0-D031 — Approve workload and file-size assumptions

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; code limits exist but launch
  volume/concurrency/growth do not (EVD-041–EVD-043, LIM-003).
- **Options / recommendation:** design to code maxima only; owner launch P50/P95/
  peak and growth envelope; unlimited. Require explicit tenants/users/RPS,
  realtime connections, jobs, email/push, media mix, and upload-rate envelope.
- **Reasoning / alternatives:** unlimited is rejected; file byte limits alone
  do not size CPU/temp disk/network.
- **Impacts:** no contract unless approved limits change; data retention/storage
  cost and abuse controls depend on answer.
- **Operations / rollback:** admission control and quotas must fail predictably;
  capacity changes are reversible within service limits.
- **Phase / approval / reopen:** capacity batch before final Phase 3 pool and
  Redis budgets, Phase 6 media concurrency, Phase 7 SLO/cost acceptance, and
  Phase 8 load approval. It is not required to approve the logical API/Core/
  Media role boundary or write composition roots. Reopen on growth or new
  product scope.

### PRD0-D032 — Require staging equivalence and artifact promotion

- **Status / evidence:** `OWNER_DECISION_REQUIRED`; functional CI exists but no
  deployment/promotion system (EVD-056–EVD-059).
- **Options / recommendation:** rebuild per environment; shared environment;
  separate equivalent staging promoting the same immutable digest. Recommend
  the last.
- **Reasoning / alternatives:** rebuilding introduces artifact drift; exact data
  parity is neither needed nor safe.
- **Impacts:** no API/schema; same migrations/config schema, sanitized fixtures,
  equivalent role topology/IAM classes.
- **Operations / rollback:** promote digest, record config/secret versions, use
  traffic/canary and prior digest rollback.
- **Phase / approval / reopen:** Phase 8 and Phase 9; cost/environment approval missing.
  Reopen only for documented non-equivalence with compensating tests.

### PRD0-D033 — Align Node runtime support

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; Docker/CI use Node 20 while
  locked Firebase Admin 14 requires Node 22+ (EVD-056).
- **Approval authority:** owning question PRD0-Q028; approved by Abdallah on
  2026-07-27 in architecture, security, operations, and release capacities;
  owning ADR ADR-0011.
- **Approved decision:** use Node 22 LTS with the latest approved security patch
  selected at the Phase 1 implementation baseline and an immutable image
  digest in Docker and CI. Keep Firebase Admin on the package-lock-controlled
  14.x line and verify startup and push-provider smoke tests. The exact patch
  and digest are evidence-time selections; current Docker/CI remain an
  implementation gap.
- **Reasoning / alternatives:** ignoring declared engine is rejected for
  production.
- **Impacts:** no intended API/schema; native dependencies/runtime behavior need
  regression/security verification.
- **Operations / rollback:** retain prior artifact only if dependency/runtime
  pair is supported; promote by digest.
- **Phase / approval / reopen:** Phase 1 implementation and evidence remain
  release-blocking. Reopen on upstream support or security-policy change.

### PRD0-D034 — Control production Swagger exposure

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; Swagger is always public at
  `/api/v1/docs` (EVD-011).
- **Approval authority:** owning question PRD0-Q029; approved by Abdallah on
  2026-07-27 in architecture, security, operations, and release capacities;
  owning ADR ADR-0011.
- **Approved decision:** production Swagger is disabled; approved audience is
  none and risk acceptor is none. Non-production exposure remains explicitly
  configurable. Current always-mounted behavior is an implementation gap.
- **Reasoning / alternatives:** public schema increases reconnaissance surface;
  disabling may hinder integrators without another access path.
- **Impacts:** DTO/runtime APIs unchanged; documentation availability changes.
  No DB impact.
- **Operations / rollback:** configuration-only exposure with audit; never
  expose secrets/examples.
- **Phase / approval / reopen:** Phase 1 boundary and Phase 8 external exposure
  evidence remain gated. Reopen for an explicitly approved production
  developer-portal or restricted-audience requirement.

### PRD0-D035 — Limit public root and health diagnostics

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; root says “Hello World” and
  health returns queue/email/push details publicly (EVD-046–EVD-047, EVD-060).
- **Approval authority:** owning question PRD0-Q030; approved by Abdallah on
  2026-07-27 in product, architecture, security, operations, and release
  capacities; owning ADR ADR-0010.
- **Approved decision:** public root becomes a minimal service identity and
  version response with no development greeting or internal topology. Public
  health exposes only status, version, and timestamp; protected operational
  probes carry role-specific detail. Compatibility window is one release
  cycle. Current responses remain an implementation gap.
- **Reasoning / alternatives:** sensitive topology detail is unnecessary
  publicly; abrupt route removal is deferred under D002.
- **Impacts:** additive protected endpoint; possible coordinated response
  reduction; no schema. Apply rate limit and no credential/error leakage.
- **Operations / rollback:** keep monitor compatibility and version dashboards/
  probes before response changes.
- **Phase / approval / reopen:** Phase 1 minimum boundary and Phase 7 full
  diagnostics remain gated. Reopen after monitor inventory or an approved
  public-contract change.

## R1 storage and lifecycle decision records

### PRD0-D037 — Enforce Reinforcement proof-type MIME policy

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-078 proves the
  current ownership/private checks and the missing proof-type/content match.
- **Approval authority:** owning question PRD0-Q032; approved by Abdallah on
  2026-07-27 in product, architecture, and security capacities; owning ADR ADR-0013.
- **Approved decision:** IMAGE allows `image/jpeg` and `image/png`; VIDEO allows
  `video/mp4` and `video/webm`; DOCUMENT allows `application/pdf`. Declared MIME
  and detected content must both match the selected proof type. Missing,
  ambiguous, malformed, or cross-type content is rejected before submission,
  with no silent remapping.
- **Compatibility and security:** preserve the current non-`NONE`
  `proofFileId` requirement and organization, school, student-uploader,
  private-visibility, authorization, and download controls. Negative
  cross-type tests are mandatory.
- **Implementation distinction:** the policy is approved but not implemented;
  PRD1-G06 and PRD5B-G03 remain `NOT_STARTED`.
- **Phase / reopen:** earliest safe Phase 1 focused gate, with Phase 5B
  regression ownership. Reopen for a new proof type, supported MIME, detector
  policy, or approved client-compatibility change.

All other records in the following table remain
`OWNER_DECISION_REQUIRED`. The recommendation column in the summary is advice
only; silence selects nothing.

| Decisions | Evidence and decision boundary | Required by / reopen condition |
|---|---|---|
| PRD0-D036 Parent messaging upload | EVD-079 proves send permission without default upload permission or Parent multipart. Choose Q031 A/B/C/D; preserve current API unless explicitly changed. | Phase 1 safety/compatibility review and Phase 5B policy implementation; reopen on Parent contract change |
| PRD0-D038 Generic detected validation | EVD-068 proves declared-only current upload. Decide purpose-aware detection, mismatch, active-content, and rejection behavior. | Phase 5B; reopen for new type/purpose |
| PRD0-D039 Malware scanning | No universal scanner exists. Name provider, placement, quarantine, timeouts, availability failure policy, privacy/residency, and cost owner. | Phase 5B or defer with binding launch constraint; reopen on provider/threat change |
| PRD0-D040 File-purpose classification | Purpose may be derived or explicitly represented. A file may serve multiple relations. No `originPurpose` schema field is approved here. | Phase 5B design; reopen if schema/backfill becomes necessary |
| PRD0-D041–PRD0-D043 Retention and holds | Decide policy authority, feature periods, superseded admissions evidence, legal/audit hold precedence, and deletion eligibility. | before any destructive cleanup; reopen on law/product policy |
| PRD0-D044 Physical deletion | Report-only first. Decide approval roles, enable flag, retry/audit/recovery, and whether cleanup remains deferred under a cost constraint. | destructive cleanup remains separately blocked after Phase 5B foundation |
| PRD0-D045 Reconciliation ownership | Name producer/reviewer, cadence, inventory retention, false-positive disposition, and escalation. | Phase 5B report-only gate; reopen on reference graph change |
| PRD0-D046 Grade MEDIA URLs | Choose managed File, approved external HTTPS, compatibility window, or disable new direct provider URLs while retaining approved legacy reads. | Phase 5B; row remediation conditional on PRD0-Q004 |
| PRD0-D047 Branding legacy URLs | Classify managed File, approved HTTPS, legacy provider, invalid/unsafe, and null; retain current safe fallback until migration/retirement approval. | Phase 5A inventory / Phase 5B policy |
| PRD0-D048 Multipart controls | Approve edge/app route limits, memory, Cloud Run concurrency, simultaneous upload budget, rates, and large-file direct PUT threshold. | provisional capacity input; close with Phase 5B load evidence |
| PRD0-D049–PRD0-D051 Object migration | PRD0-D029 owns clean-start versus migration. These records define object proof, read-only source window, and checksum-absence handling without redefining D029. | Phase 5A; reopen on source inventory/cutover change |
| PRD0-D052 Bucket topology | Decide staging/final/private/public topology, region, CORS, signer/IAM boundaries, and IaC ownership. Runtime request paths may not create production buckets. | Phase 5A before provisioning |
| PRD0-D053 Versioning/lifecycle/protection | Decide GCS versioning, lifecycle rules, deletion protection/retention lock, recovery, and cost. This does not authorize business-object deletion. | Phase 5A infrastructure / Phase 5B retention alignment |

## Canonical delivery-phase ownership

This table replaces earlier coarse phase groupings; it does not mark any phase
complete.

| Phase | Scope | Decision deadline |
|---|---|---|
| Phase 0B — Owner Decisions, ADR Lock, and Phase 0 Closeout | approve Phase 1 answers/ADRs; reconcile all registers; review/merge documentation; reverify and reconcile moved baseline | all Phase 1 blockers |
| Phase 1 — Supported Runtime and Bootstrap Hardening | Node support, shutdown/SIGTERM, request/trace IDs, fatal logging, Swagger/CORS boundaries, minimum probes, email job-ID proof, Reinforcement focused safety | PRD0-D033–PRD0-D035, PRD0-D037 and relevant Q001/Q002/Q010/Q011/Q028 |
| Phase 2 — API / Core Worker Runtime Separation | logical composition roots and API/Core ownership; Learning Media completion remains synchronous | PRD0-D004–PRD0-D007 |
| Phase 3 — Cloud SQL and Redis Runtime Behavior | topology, pool/failover, Redis isolation/fallback, queue recovery/capacity | PRD0-D011–PRD0-D016, capacity inputs |
| Phase 4 — Service Identities, Secret Manager, and Crypto Foundation | identities, secret versions, key envelopes, conditional re-encryption proof | PRD0-D017–PRD0-D021 and PRD0-D029 |
| Phase 5A — Provider-Neutral Storage and GCS | provider port/parity, real GCS, IaC buckets, conditional object/coordinate migration; no lifecycle or media HTTP change | PRD0-D009–PRD0-D010, PRD0-D019, PRD0-D022, PRD0-D029, PRD0-D049–PRD0-D053 |
| Phase 5B — File Security, Policy, and Lifecycle Foundation | upload/security policies, direct URLs, retention/reference graph, report-only reconciliation, multipart controls; no destructive cleanup authorization | PRD0-D036–PRD0-D048, PRD0-D053 |
| Phase 6 — Async Media Processing and Media Worker | Learning Media-only HTTP 202/status/queue/worker/recovery/client transition | PRD0-D008 plus capacity/contract decisions |
| Phase 7 — Health, Observability, and Rate Limiting | full metrics, dashboards, SLOs, alerts, logs, rate controls | PRD0-D023–PRD0-D025, PRD0-D030–PRD0-D031, PRD0-D035 |
| Phase 8 — Terraform, CI/CD, and Production-Equivalent Staging | IaC, artifact, deploy order, staging, release-candidate full gate | PRD0-D026–PRD0-D032 |
| Phase 9 — Failure Drills, Progressive Launch, and Final Closeout | failure/migration drills, launch, rollback/forward-fix, final evidence | approved objectives and all prior blocking gates |

## ADR ownership sequence

The Phase 0A ownership map remains authoritative. Phase 0B creates only the
ADRs required to record approved answers; missing numbers stay reserved for
their pending decision groups. An ADR that contains approved and pending
decisions uses decision-level status and does not accept a pending decision.

| Number | Title | Decisions covered | Phase 0B disposition |
|---|---|---|---|
| ADR-0004 | Production Runtime Roles in the Modular Monolith | owns D004–D007 | created and accepted through Q001, Q002, Q010, and Q011; Q003 is not a logical-boundary prerequisite |
| ADR-0005 | Learning Media Asynchronous Completion Compatibility | owns D008 | reserved; Q009 remains pending |
| ADR-0006 | Production Data Source, Object Storage, and Signed Capability Boundary | owns D009–D010, D019, D022, D029, D049–D053 | created; accepts D022/Q022 only; all other owned decisions remain pending or proposed |
| ADR-0007 | Cloud SQL Topology, Connection Budgets, and Migration Job | owns D011–D012, D026–D027 | reserved; region and migration answers remain pending |
| ADR-0008 | Redis Workload Isolation and Failure Policy | owns D013–D015 | reserved; Redis/fallback/recovery answers remain pending |
| ADR-0009 | GCP Environment, Workload Identity, Secrets, and Crypto | owns D017–D021, D023 | reserved; project/IAM/secret/key answers remain pending |
| ADR-0010 | Production Health and Observability Contract | owns D024–D025, D035 | created; accepts D024/Q024 and D035/Q030; D025/Q025 remains pending |
| ADR-0011 | Artifact, Runtime Version, Staging, and Promotion | owns D032–D034 | created; accepts D033/Q028 and D034/Q029; D032/Q027 remains pending |
| ADR-0012 | Capacity, Backup, RTO/RPO, and Recovery Objectives | owns D016, D028, D030–D031 | reserved; capacity and backup/RTO/RPO answers remain pending |
| ADR-0013 | File Security, Retention, and Reference-Aware Lifecycle | owns D036–D048 | created; accepts D037/Q032 only; all other owned decisions remain pending |

Each listed major decision has exactly one owning ADR. Other ADRs may cite the
owning record but must not redefine it, especially for capacity and
backup/RTO/RPO policy.

## Decision closure rule

This register records the ten approved decision changes above while all
`OWNER_DECISION_REQUIRED` entries remain open until the owner supplies the
exact questionnaire answers, impacts are reconciled, and their owning ADRs are
approved. Absence of an answer does not select the recommended default or
authorize implementation.
