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
| PRD0-D005 | API/Core/Media/Migration boundaries | LOCKED_FROM_APPROVED_CONTEXT | D004 | approved responsibility mapping implemented and closed through Phase 2 |
| PRD0-D006 | BullMQ consumers prohibited in target API | LOCKED_FROM_APPROVED_CONTEXT | D005 | approved zero-consumer target API through Q010 |
| PRD0-D007 | Repeatable/scheduled ownership | LOCKED_FROM_APPROVED_CONTEXT | D005 | approved singular Maintenance Scheduler invocation and assigned consumers through Q011 |
| PRD0-D008 | Learning Media completion transition | OWNER_DECISION_REQUIRED | D002, D005 | keep synchronous through Phase 5A/5B; approve Learning Media-only submit/status transition in Phase 6 |
| PRD0-D009 | GCS production and MinIO local/test | LOCKED_FROM_APPROVED_CONTEXT | D004 | Q008 option A: GCS production in `me-central2`; MinIO remains local/test/CI |
| PRD0-D010 | Storage abstraction boundary | LOCKED_FROM_APPROVED_CONTEXT | D009 | Owner-accepted `ObjectStoragePort`; `MinioAdapter`/`GcsAdapter`; exact operation/normalization surface; no API/schema/media-contract change |
| PRD0-D011 | Cloud SQL region and HA | LOCKED_FROM_APPROVED_CONTEXT | D004 | approved Saudi `me-central2` regional-HA baseline; no cross-region DR without separate residency approval |
| PRD0-D012 | Cloud SQL role pool budgets | LOCKED_FROM_APPROVED_CONTEXT | D005, D011 | approved bounded API/Core/Media pools within a 100-connection governed budget |
| PRD0-D013 | Redis shared versus separated workloads | OWNER_DECISION_REQUIRED | D005 | separate queue and realtime production instances |
| PRD0-D014 | Redis production fallback | OWNER_DECISION_REQUIRED | D013 | fail readiness/realtime, never silent in-memory multi-instance mode |
| PRD0-D015 | Critical job recovery/reconciliation | LOCKED_FROM_APPROVED_CONTEXT | D005–D007, D013 | approved persisted-truth recovery for the seven existing queues through Q017 and ADR-0009 |
| PRD0-D016 | Worker capacity/autoscaling | OWNER_DECISION_REQUIRED | D012–D015 | fixed bounded minimum first; external scale only from measured lag |
| PRD0-D017 | GCP project/environment separation | LOCKED_FROM_APPROVED_CONTEXT | D004 | Q005 option A: production-only `moazez-production`; staging/cloud test `moazez-nonprod-91001421934`; local development/CI |
| PRD0-D018 | Service-account boundaries | LOCKED_FROM_APPROVED_CONTEXT | D005, D017 | Q018 option A: separate per-project API/Core/Media/Migration/Maintenance/deployer/signer identities |
| PRD0-D019 | GCS signed-URL identity | LOCKED_FROM_APPROVED_CONTEXT | D009, D018 | Q019 option A: dedicated per-project keyless signer, own-project bucket limits, maximum TTL one hour |
| PRD0-D020 | Secret Manager pinning/rotation | LOCKED_FROM_APPROVED_CONTEXT | D017, D018 | Q020 option A: release-pinned immutable versions, 90-day cadence, seven-day staged overlap |
| PRD0-D021 | Encryption key separation/key-ID envelope | LOCKED_FROM_APPROVED_CONTEXT | D020 | Q021 option A: v2 separate SMTP/device key families, active/optional-previous decrypt, legacy v1 decrypt-only |
| PRD0-D022 | Frontend origins and production CORS | LOCKED_FROM_APPROVED_CONTEXT | D002, D009, D017 | approved exact production/staging HTTPS origins and credential/WebSocket/direct-storage requirements through Q022 |
| PRD0-D023 | Ingress/domain/LB/Cloud Armor | OWNER_DECISION_REQUIRED | D017, D022 | staging option A approved for `staging-api.moazez.cloud`; production hostname and edge disposition remain required |
| PRD0-D024 | Liveness/startup/readiness semantics | LOCKED_FROM_APPROVED_CONTEXT | D005, D013 | approved protected role-specific probes and minimum dependency semantics through Q024 |
| PRD0-D025 | Logs, metrics, SLOs, alerts | OWNER_DECISION_REQUIRED | D005, D024 | structured/redacted telemetry and service/queue/media SLOs |
| PRD0-D026 | Migration job and deploy ordering | LOCKED_FROM_APPROVED_CONTEXT | D003, D005, D011, D018 | Q026 option A; same-image governed Migration Job before compatible runtime promotion |
| PRD0-D027 | Backward-compatible rollback constraints | LOCKED_FROM_APPROVED_CONTEXT | D003, D026 | immutable migrations and compatible rollback are locked; expand/contract is the recommended technique, not a separately locked mandate |
| PRD0-D028 | Backups, PITR, RTO, RPO | LOCKED_FROM_APPROVED_CONTEXT | D011 | PRD0-Q007 approved: RTO 30m, RPO 15m, PITR 14d, backup retention 30d, quarterly restore drill, and no cross-region DR; implementation and evidence remain required |
| PRD0-D029 | Production data migration/clean start | LOCKED_FROM_APPROVED_CONTEXT | D009, D011, D028 | Q004 option A: `CLEAN_START`; PostgreSQL/object migration are N/A for the current owner-attested zero-source state; Redis copy is prohibited and recovery reconciles persisted truth/rebuilds ephemeral realtime state; later data discovery reopens D029 |
| PRD0-D030 | Initial max instances/concurrency | LOCKED_FROM_APPROVED_CONTEXT | D012–D016 | approved conservative pilot caps; saturation and failover evidence still required |
| PRD0-D031 | Workload/file-size assumptions | LOCKED_FROM_APPROVED_CONTEXT | D008, D016, D030 | approved owner-delegated pilot envelope; not final load-tested capacity |
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
| PRD0-D046 | Grade MEDIA URL policy | LOCKED_FROM_APPROVED_CONTEXT | D002, D029, D038 | Q041 option D: ordinary external HTTPS only for new writes; provider/HTTP/malformed blocked; no compatibility window |
| PRD0-D047 | Legacy branding URL treatment | LOCKED_FROM_APPROVED_CONTEXT | D029, D038 | Q042: managed File writes/reads; safe external HTTPS read-only legacy compatibility; provider/unsafe fail closed; null allowed |
| PRD0-D048 | Multipart edge limits and upload concurrency | OWNER_DECISION_REQUIRED | D030–D031, D038 | route/edge caps, instance memory/concurrency, rate limits, large-file direct PUT |
| PRD0-D049 | Object-preservation branch | LOCKED_FROM_APPROVED_CONTEXT | D029 | Q044 option A: clean-start object branch; zero source buckets, objects, and provider URLs |
| PRD0-D050 | Source MinIO read-only rollback window | LOCKED_FROM_APPROVED_CONTEXT | D049 | Q045: `N/A_WITH_EVIDENCE` for the zero-source branch |
| PRD0-D051 | Missing-checksum verification | LOCKED_FROM_APPROVED_CONTEXT | D049 | Q046: `N/A_WITH_EVIDENCE` for the zero-object branch |
| PRD0-D052 | Storage bucket/privacy topology | LOCKED_FROM_APPROVED_CONTEXT | D009, D017–D019 | Q047: four private per-project buckets in `me-central2`; UBLA, PAP, exact Q022 CORS, private Learning Media prefixes |
| PRD0-D053 | GCS versioning/lifecycle/deletion protection | LOCKED_FROM_APPROVED_CONTEXT | D042, D044, D052 | Q048: versioning, seven-day Soft Delete, Terraform `prevent_destroy`, no Bucket Lock or Phase 5A automatic transition/deletion |

Current status totals across all 53 decisions after the 2026-08-16 Q023
staging-only amendment: 36
`LOCKED_FROM_APPROVED_CONTEXT`, 17 `OWNER_DECISION_REQUIRED`, 0
`PROPOSED_RECOMMENDATION`, 0
`DEFERRED_WITH_CONSTRAINT`, and 0 `REJECTED`. The Phase 0B closeout snapshot on
2026-07-27 correctly recorded 14 locked, 38 owner-required, and 1 proposed at
that time. The staging-only approval does not close the production decision,
so these current totals remain unchanged; this is an additive governance
amendment, not a rewrite of that historical evidence.

At the 2026-07-27 Phase 0B closeout, the implementation evidence in this
register described the then-current coupled runtime and pre-Phase-1 baseline.
Current state: Phase 1, Phase 2, and Phase 3 are complete. The authoritative
phase closeout documents supersede present-tense baseline-gap language without
changing historical EVD records, approvals, dates, PR numbers, SHAs, or
validation counts. Phase 4 and Phase 5A are not complete.

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

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-011–EVD-026 record
  the coupled Phase 0 baseline. Phase 2 closeout now proves the separated
  runtime composition; D001 continues to constrain the form.
- **Approval authority:** owning question PRD0-Q001; approved by Abdallah on
  2026-07-27 in product, architecture, operations, and release capacities;
  owning ADR ADR-0004.
- **Approved decision:** separate API, Core Worker, Media Worker, Migration Job,
  and Maintenance Scheduler roles from one repository. Phase 2 implemented
  this architecture through separate composition roots while preserving one
  repository and domain model.
- **Reasoning / alternatives:** one service couples scaling and failure domains;
  microservices violate D001.
- **Impacts:** no intended API/schema/data change; build and dependency
  injection/composition change. IAM becomes role-specific.
- **Operations / rollback:** independent scaling/drain improves containment;
  rollback to the coupled image is unsafe after role-specific schedules unless
  duplicate-consumer proof exists.
- **Phase / approval / reopen:** Phase 2 is complete. Implementation PR #62,
  final candidate `36ec4fd7a2c9f82bacc9a8f5c5260ad7fa03988b`, merge
  `e444cc629ff645a7aa0e688c36c4391275a4d654`, and the successful post-merge
  closeout are authoritative. Reopen if the platform cannot run non-HTTP
  workers or cost evidence rejects separation.

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
  Phase 2 implemented the runtime ownership boundary: API 0 consumers/0
  repeats, Core 6/0, Media 1/0, and Maintenance Scheduler 0/3.
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
- **Phase / approval / reopen:** Phase 2 is complete with the responsibility,
  implementation, CI, merge, and post-merge evidence in the Phase 2 closeout.
  Reopen based on measured resource isolation or provider execution limits.

### PRD0-D006 — Prohibit BullMQ consumers in the target API

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-017–EVD-025 record
  seven consumers in the coupled Phase 0 API graph. Phase 2 module/context
  evidence now proves zero consumers and zero repeats in the API graph.
- **Approval authority:** owning question PRD0-Q010; approved by Abdallah on
  2026-07-27 in architecture, security, operations, and release capacities;
  owning ADR ADR-0004.
- **Approved decision:** the role-specific API graph has no BullMQ consumers
  and no exceptions. Producers remain. Phase 2 implemented and verified the
  producer-only API composition.
- **Reasoning / alternatives:** toggles in the full graph are weaker than
  construction-time exclusion; consumers-everywhere creates uncontrolled
  scaling and shutdown risk.
- **Impacts:** no API/schema change; producer dependencies remain. API identity
  should not receive provider/delete permissions needed only by workers.
- **Operations / rollback:** deploy workers healthy before disabling API
  consumers; rollback must avoid double processing/scheduling.
- **Phase / approval / reopen:** Phase 2 is complete. Reopen only if a queue is
  proven to require request-local consumption through a superseding ADR.

### PRD0-D007 — Own repeatable and scheduled jobs explicitly

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-023–EVD-026.
- **Approval authority:** owning question PRD0-Q011; approved by Abdallah on
  2026-07-27 in architecture, security, operations, and release capacities;
  owning ADR ADR-0004.
- **Approved decision:** the Maintenance Scheduler singularly invokes
  idempotent dismissal expiry for Core consumption, Learning Media discovery
  for Media cleanup consumption, and branding reconciliation for Core cleanup
  consumption. Phase 2 implemented zero Scheduler consumers and exactly three
  repeat registrations. This ownership does not authorize destructive cleanup.
- **Reasoning / alternatives:** implicit every-instance registration obscures
  failure and delete ownership. Presence refresh remains per WebSocket process.
- **Impacts:** no public/schema impact unless an execution ledger is added.
  Maintenance identity needs only necessary DB/storage permissions.
- **Operations / rollback:** deterministic schedule IDs, distributed exclusion,
  missed-run alerts, and manual replay; disable old owner before enabling new.
- **Phase / approval / reopen:** Phase 2 is complete. Reopen after scheduler
  cost/reliability evidence or a material responsibility change.

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

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q008 option A
  was approved by Abdallah at `2026-08-09T15:20:43+03:00`. EVD-036–EVD-039
  remain the implementation baseline and do not prove GCS parity.
- **Approved decision:** production uses GCS in `me-central2`; local
  development, tests, and CI retain MinIO. Production MinIO is not an approved
  fallback.
- **Reasoning / alternatives:** the split avoids operating production MinIO
  while keeping deterministic local/CI coverage.
- **Impacts:** no public API, DTO, Prisma schema, migration, `File.id`, or
  Learning Media completion change is approved. Static MinIO keys are not a
  production GCS credential strategy.
- **Operations / rollback:** the approved clean-start branch uses
  `N/A_WITH_EVIDENCE`; any later source discovery reopens D029/D049–D051. Real
  GCS IAM, signed URL, CORS, Range, generation, and provider-error evidence
  remain mandatory before release.
- **Phase / approval / reopen:** Phase 5A. Reopen for residency, regulatory,
  cost, portability, or provider evidence that invalidates this mapping.

### PRD0-D010 — Introduce a provider-neutral storage boundary

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; the Owner accepted the
  exact architecture boundary on 2026-08-10. The fresh Batch 0 inventory
  replaces the historical consumer count but confirms MinIO-derived types and
  provider error interpretation outside the adapter.
- **Accepted boundary:** `ObjectStoragePort` with `MinioAdapter` and
  `GcsAdapter`.
- **Accepted operations:** save/put, get/stream, stat, delete, exists,
  paginated list, signed PUT, signed GET, and readiness.
- **Accepted normalization:** provider-neutral object metadata/types, signed
  capabilities, not-found behavior, and storage/provider error classification
  where application code depends on it.
- **Compatibility lock:**
  `NO_API_SCHEMA_MIGRATION_OR_LEARNING_MEDIA_CONTRACT_CHANGE`; Learning Media
  remains synchronous HTTP 200 and no new storage lifecycle is authorized.
- **Reasoning / alternatives:** caller branching is rejected; a shallow adapter
  swap would not normalize leaked capability types or out-of-adapter error
  semantics. Concrete adapters may retain internal provider URL parsing.
- **Operations / rollback:** one contract suite runs against both adapters;
  adapter/config selection changes without caller changes.
- **Phase / approval / reopen:** the Owner-directed fast path permits local
  port/adapter implementation before full Phase 4 closeout. Reopen only for a
  proposed change to this exact operation, normalization, or compatibility
  boundary.

### PRD0-D011 — Select Cloud SQL region and HA topology

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; Abdallah approved
  PRD0-Q006 option A during Phase 3 on 2026-08-04 (Africa/Cairo). ADR-0005 owns
  this decision.
- **Approved baseline:** Saudi launch in `me-central2` (Dammam), regional HA,
  PostgreSQL 16, Cloud SQL Enterprise Plus, private IP only, public database IP
  disabled, encrypted transport, and Direct VPC egress as the deployment
  direction. The provisional initial machine is `db-perf-optimized-N-2`
  (2 vCPU, 16 GB).
- **Residency boundary:** initial production data and primary managed services
  remain in Saudi Arabia. The DR region is `NONE`; cross-region DR requires
  separate residency approval.
- **Impacts:** no API/schema change. Each deployment keeps the single
  `DATABASE_URL` contract while API, Core Worker, Media Worker, and the
  separately governed Migration Job receive different values and database
  users. Maintenance Scheduler remains database-free.
- **Operations / rollback:** a data-bearing topology cannot be rolled back like
  an image. Cutback requires a declared write boundary, connection drain,
  integrity/reconciliation evidence, and an approved data authority; public-IP
  fallback is not authorized.
- **Phase / approval / reopen:** Phase 3 baseline only. Exact sizing remains
  provisional until saturation and provider-failover evidence. PRD3-G01 is
  `BASELINE_ONLY`; DB privilege proof, exact-candidate CI, merge, and post-merge
  closeout also remain pending.

### PRD0-D012 — Set Cloud SQL connection budgets per role

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; Abdallah approved
  PRD0-Q014 during Phase 3 on 2026-08-04 (Africa/Cairo). ADR-0005 owns this
  decision.
- **Approved limits:** API pool 5, Core Worker pool 6, Media Worker pool 3,
  Migration allowance 2, operations reserve 10, and governed maximum 100.
  Runtime overrides may only lower a role's approved positive integer limit and
  positive bounded timeouts. Maximum instances are aggregate across every
  active revision of a runtime service; canary, rollback, traffic-split, and
  prior revisions share one cap.
- **Budget proof:** `(4 × 5) + (2 × 6) + (2 × 3) + 2 + 10 = 50`; the remaining
  50 connections are a failover/emergency reserve, so `50 + 50 = 100`.
- **Impacts:** no API/schema change. The application constructs a bounded
  PostgreSQL Prisma URL from validated role settings and rejects duplicate
  application-managed parameters. Credentials and database users differ by
  deployment role even though the environment-variable name remains
  `DATABASE_URL`.
- **Operations / rollback:** reduce instance/concurrency/pool caps before a
  machine-size increase; never consume the failover reserve as steady-state
  capacity. Existing 15- and 30-second transactions are saturation-test inputs.
- **Phase / approval / reopen:** provisional Phase 3 baseline. PRD3-G01-B
  saturation/recovery, PRD3-G01-C database privileges, and PRD3-G01-D real
  Cloud SQL failover/closeout remain pending.

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

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q017 option A was
  approved by Abdallah at `2026-08-06T10:30:34+03:00` in the Operations,
  Release, and Architecture Owner capacities. ADR-0009 is Accepted.
- **Approved decision:** Redis queue state is disposable coordination state and
  is never copied for recovery. The seven existing queues reconstruct current
  work from PostgreSQL domain rows, object existence/absence, deterministic
  job builders, and current policy. The approved windows are 24 hours or
  announcement expiry for announcement generation, 24 hours for push, 72
  hours for email, 24 hours for imports, and domain-terminal boundaries for
  dismissal, Learning Media, and Branding.
- **Reasoning / alternatives:** Redis retention, a generic ledger, or a generic
  dead-letter queue cannot safely represent domain eligibility or ambiguous
  provider outcome. Domain reconcilers preserve tenant/source scope and avoid
  replaying known-success external effects.
- **Impacts:** no schema, migration, public contract, queue, or consumer is
  added. Four reconciliation job names are added to existing queues, and the
  existing Maintenance Scheduler owns seven registrations.
- **Operations / rollback:** processing is at least once with idempotent
  persisted effects where proven. Manual replay requires Abdallah as Operations
  and Release Owner, an audit, tenant/source scope, and exclusion of known
  success. Email `outcome_unknown` is never automatic.
- **Phase / approval / reopen:** Phase 3 through PRD3-G03. Reopen only when a
  queue's persisted truth, recovery window, side-effect contract, or owner
  approval changes.

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

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q005 option A
  was approved by Abdallah at `2026-08-09T15:20:43+03:00`; owning ADR ADR-0015.
- **Approved decision:** `moazez-production` is production-only.
  `moazez-nonprod-91001421934` owns staging and isolated cloud tests.
  Development is `LOCAL_ONLY`, CI storage is `LOCAL_MINIO`, and DR is `NONE`.
- **Reasoning / alternatives:** the project boundary limits accidental
  production mutation, IAM/quota blast radius, and data mixing.
- **Impacts:** artifacts and governed migrations may be promoted; production
  school data must not be copied into non-production. Projects keep separate
  identities, buckets, policies, billing visibility, and IaC state.
- **Operations / rollback:** a project name is an approved target, not proof
  that the project or any resource exists. Provisioning and rollback remain
  reviewed IaC operations.
- **Phase / approval / reopen:** Phase 4/5A/8. Reopen for organization-policy,
  residency, billing, or approved DR changes.

### PRD0-D018 — Bound service accounts by runtime

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q018 option A
  was approved by Abdallah as security approver at
  `2026-08-09T15:20:43+03:00`; owning ADR ADR-0015.
- **Approved decision:** each cloud project has distinct identities named
  `moazez-api-runtime`, `moazez-core-worker`, `moazez-media-worker`,
  `moazez-migration-job`, `moazez-maintenance-scheduler`,
  `moazez-iac-deployer`, and `moazez-gcs-signer`.
- **Reasoning / alternatives:** a shared identity would combine DDL, object,
  signing, provider, schedule, and deploy blast radii.
- **Impacts:** no API/schema change. Runtime permissions must be granted from
  exact role responsibilities and denied by default; identities are not
  cross-project production/non-production credentials.
- **Operations / rollback:** IAM is versioned in IaC and tested with positive
  and negative access cases. Long-lived downloaded service-account keys are
  not an approved deployment mechanism.
- **Phase / approval / reopen:** Phase 4 and Phase 5A. Reopen only if the
  platform cannot support the identity count while retaining least privilege.

### PRD0-D019 — Choose signed-URL identity

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q019 option A
  was approved by Abdallah at `2026-08-09T15:20:43+03:00`; owning ADR ADR-0006.
- **Approved decision:** production uses
  `moazez-gcs-signer@moazez-production.iam.gserviceaccount.com`; staging uses
  `moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com`.
  Each signer is limited to its own project's approved private and published
  buckets. Signed capabilities have an absolute maximum TTL of one hour.
- **Reasoning / alternatives:** dedicated keyless signing separates capability
  creation from broad object administration. A broad API storage-admin
  identity and downloaded private keys are rejected.
- **Impacts:** existing signed upload/download/playback contracts, headers,
  authorization, and shorter TTLs remain. No schema change.
- **Operations / rollback:** use workload identity/ADC plus audited `signBlob`;
  retain an old signer only through existing capability TTL.
- **Phase / approval / reopen:** Phase 4 identity and Phase 5A storage. Reopen
  if platform signing limits or measured quota/latency require another design.

### PRD0-D020 — Pin and rotate Secret Manager versions

- **Status / authority:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q020 option A
  was approved by Abdallah at `2026-08-14T06:37:00+03:00`
  (Africa/Cairo) as emergency and release owner; owning ADR ADR-0015.
- **Approved decision:** releases pin explicit immutable Secret Manager
  versions. The mutable `latest` alias and dynamic runtime refresh are
  prohibited. Normal rotation cadence is 90 days with a seven-day staged
  active/previous overlap. The prior version remains available for the tested
  overlap and rollback window. Emergency rotation creates and explicitly pins
  a replacement version.
- **Reasoning / alternatives:** immutable release selection makes startup and
  rollback reproducible; mutable selection can change a restarted release
  without an artifact or release-policy change.
- **Impacts:** no public API or database schema change. Deployment must map each
  release to explicit versions and retain redacted access/audit evidence.
- **Operations / rollback:** validate active/previous overlap before promotion,
  retain the prior version through rollback, and disable it only after the
  tested window and completeness checks.
- **Phase / approval / reopen:** Phase 4 repository authority is approved.
  Cloud Secret Manager implementation, IAM delivery, version provisioning,
  access logs, and rotation rehearsal remain later acceptance evidence. This
  record does not claim any Secret Manager resource currently exists.

### PRD0-D021 — Separate encryption keys and add key IDs

- **Status / authority:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q021 option A
  was approved by Abdallah at `2026-08-14T06:37:00+03:00`
  (Africa/Cairo) as security approver; owning ADR ADR-0015.
- **Approved decision:** use envelope v2 and exactly two separate key families,
  `smtp-secret` and `app-device-token`, on the existing AES-256-GCM primitive.
  Ciphertext contains an explicit key ID. Each family decrypts with its active
  key plus an optional previous key, while every new write uses only that
  family's active key and emits `v2:<keyId>:<iv>:<tag>:<ciphertext>`.
- **Legacy compatibility:** `v1:<iv>:<tag>:<ciphertext>` remains readable during
  the compatibility/migration window. `SETTINGS_SECRET_ENCRYPTION_KEY` is
  optional legacy v1 decrypt-only material. No new v1 writer is allowed, and
  active v2 keys never substitute for a missing legacy key.
- **Reasoning / alternatives:** family separation limits compromise/rotation
  blast radius, and explicit IDs select only the intended active/previous key.
  Shared keys, arbitrary key iteration, and Cloud KMS are not approved.
- **Impacts:** repository configuration, internal ciphertext, and focused tests
  change; public HTTP/API contracts and the database schema do not. The normal
  family-key rotation cadence is 90 days.
- **Operations / rollback:** retain old decrypt-only material until an
  authoritative zero-row audit or governed re-encryption completeness proof.
  Never automatically rewrite ciphertext during a read.
- **Phase / approval / reopen:** repository implementation is authorized, but
  real key provisioning, deployed key delivery, legacy-row inventory, and live
  compatibility proof remain required. This record does not claim real
  encryption keys have been provisioned.

### PRD0-D022 — Approve frontend origins and CORS

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-011, EVD-014, and
  EVD-051 record the pre-Phase-1 CORS baseline. Phase 1 closeout now proves the
  exact credentialed production/staging HTTP and Socket.IO allowlists;
  storage CORS remains external and subject to Phase 5A evidence.
- **Approval authority:** owning question PRD0-Q022; approved by Abdallah on
  2026-07-27 in product, architecture, security, operations, and release
  capacities; owning ADR ADR-0006.
- **Approved decision:** production origins are
  `https://schools.moazez.cloud` and `https://admin.moazez.cloud`; staging
  origins are `https://staging-schools.moazez.cloud` and
  `https://staging-admin.moazez.cloud`. Credentials, WebSockets, and future
  approved direct-storage access are required. Wildcards are prohibited and
  paths/trailing slashes are not origins. Application HTTP/Socket.IO CORS was
  implemented in Phase 1; storage configuration remains a Phase 5A gap. This
  does not approve GCS, IAM, buckets, signing, or provisioning.
- **Reasoning / alternatives:** wildcard with credentials is rejected; disabled
  production browser access is not a viable launch policy if web clients exist.
- **Impacts:** no route/schema change; browser behavior changes operationally.
  Include preflight, signed PUT headers, GET/Range, and WebSocket tests.
- **Operations / rollback:** version allowlists; emergency remove an origin
  without broad wildcard.
- **Phase / approval / reopen:** the Phase 1 application boundary is complete;
  Phase 5A storage and Phase 7 full controls remain gated. Reopen when approved
  clients or domains change.

### PRD0-D023 — Select ingress, domain, load balancer, and Cloud Armor

- **Status / evidence:** `OWNER_DECISION_REQUIRED` for production. Abdallah
  approved only the staging sub-disposition at
  `2026-08-16T19:00:00+03:00` (Africa/Cairo); no deployment or cloud-resource
  evidence is claimed by that approval.
- **Approved staging sub-disposition:**
  `PRD0-Q023-STAGING=APPROVED(scope=STAGING_ONLY,option=A,api_domain=staging-api.moazez.cloud,ingress=internal-and-cloud-load-balancing,cloud_armor=YES,trusted_proxies=GOOGLE_CLOUD_EXTERNAL_APPLICATION_LOAD_BALANCER_ONLY,direct_public_run_app=NO,approver=Abdallah,approved_at=2026-08-16T19:00:00+03:00)`.
- **Production boundary:**
  `PRD0-Q023-PRODUCTION=PENDING(owner=Abdallah,deadline=before production Phase 7/8,constraint=Production API hostname and edge disposition remain unapproved; silence authorizes no production implementation or cloud provisioning)`.
  No production API hostname, ingress mode, load-balancer, Cloud Armor, trusted-
  proxy, certificate, DNS, or direct-`run.app` policy is selected or implied.
- **Reasoning / alternatives:** staging selects the external HTTPS load-balancer
  path, Cloud Armor, internal-and-load-balancing Cloud Run ingress, and trust
  only for the Google Cloud external Application Load Balancer. Direct public
  `run.app` access is not the approved staging public path.
- **Impacts:** preserve API paths, headers, and WebSocket upgrades; no schema.
  `APP_URL` remains derived from the canonical staging API URL. The application
  trusted-proxy behavior still requires separate source evidence before Stage
  18 deployment readiness can be claimed.
- **Operations / rollback:** this source authority does not create a load
  balancer, Cloud Armor resource, certificate, DNS record, IAM grant, or cloud
  deployment. Later staging rollout needs its governed plan, evidence, and
  rollback controls.
- **Phase / approval / reopen:** staging source work may use the scoped
  disposition. D023 remains open for the production Phase 7/8 hostname, threat
  model, budget, and edge decision. Reopen staging on client/network or threat-
  model changes.

### PRD0-D024 — Separate liveness, startup, and readiness

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-046–EVD-047 record
  the pre-Phase-1 public health baseline. Phase 1 closeout now proves the
  same-process management listener and role-specific startup, liveness, and
  readiness contracts while retaining compatible public health.
- **Approval authority:** owning question PRD0-Q024; approved by Abdallah on
  2026-07-27 in product, architecture, security, operations, and release
  capacities; owning ADR ADR-0010.
- **Approved decision:** add protected role-specific startup, liveness, and
  readiness probes. API requires validated configuration, HTTP startup,
  Prisma, queue-producer Redis, object storage for enabled file contracts, and
  realtime Redis when enabled. Core requires validated configuration, Prisma,
  queue Redis, and assigned consumers. Media requires validated configuration,
  Prisma, queue Redis, object storage, temporary disk, and verified `ffprobe`.
  Public health is limited to status, version, and timestamp. Phase 1
  implemented and closed this minimum probe contract; full telemetry remains
  Phase 7.
- **Reasoning / alternatives:** liveness must not depend on every external
  service; readiness must fail routing when critical dependencies/role startup
  fail. In-place semantic break is deferred.
- **Impacts:** additive routes/status semantics; no schema. Limit public
  diagnostic data.
- **Operations / rollback:** probe thresholds avoid restart storms; previous
  endpoint remains during rollout.
- **Phase / approval / reopen:** Phase 1 minimum probes are complete; Phase 7
  full semantics remain gated. Reopen if the platform requires different probe
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

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q026 option A was
  approved by Abdallah at `2026-08-07T00:22:00+03:00` and is owned by
  `adr/ADR-0007-migration-job-and-deployment-ordering.md`.
- **Approved decision:** one standalone Cloud Run Job or later approved
  equivalent uses `moazez_migration` and the same immutable final application
  image. It runs one task, parallelism 1, connection allowance 2, zero retries,
  and a 20-minute timeout. It executes only manifest verification,
  `prisma validate`, `prisma migrate deploy`, `prisma migrate status`, and the
  read-only post-deploy drift diff. Seeds and application bootstrap are
  prohibited.
- **Release order:** artifact/checksum preflight; backup/PITR or signed
  disposable N/A and data-authority checkpoint; Migration Job; status and zero
  drift; Core Worker; Media Worker; API without traffic; Maintenance Scheduler;
  protected readiness/smoke; traffic only under later Q027/Phase 8 policy.
- **Reasoning / alternatives:** app-startup migration, manual untracked schema
  commands, direct SQL bypass, and runtime DDL are rejected.
- **Operations / rollback:** any failure blocks all later runtime and traffic
  promotion and requires a new manual approval before rerun. Recovery is a
  compatible forward-fix or approved isolated restore; no automatic down
  migration or schema rollback occurs. Artifact rollback requires schema/data
  compatibility.
- **Phase / approval / reopen:** PRD3-G04 implements the platform-neutral job
  and gate contracts; Phase 8 later wires approved IaC and CI/CD. Reopen only
  for a material platform constraint or a new owner decision.

### PRD0-D027 — Preserve backward-compatible rollback constraints

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; immutable migrations
  and compatibility rules are approved (EVD-062) and owned by
  `adr/ADR-0007-migration-job-and-deployment-ordering.md`.
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

- **Status / authority:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q007 was
  approved by Abdallah on 2026-08-12 in Africa/Cairo. The exact approval clock
  time was not recorded. No production configuration or restore evidence exists
  (LIM-003, LIM-004).
- **Approved policy:** RTO 30 minutes; RPO 15 minutes; PITR retention target 14
  days; backup retention target 30 days; restore drill quarterly;
  `cross_region=NO`.
- **Reasoning / alternatives:** backup configuration without restore drills is
  insufficient evidence. Approval of objectives is not proof that backups,
  PITR, restores, RTO, RPO, or failover have been implemented or achieved.
- **Impacts:** no API/schema; contains all production data and privacy/retention
  obligations.
- **Operations / rollback:** restore into isolated environment, validate
  migrations/checksums/tenancy, document cutover, and measure recovery against
  the approved objectives.
- **Phase / approval / reopen:** policy is approved for Phase 8 and Phase 9;
  infrastructure configuration and recovery proof remain required. Reopen after
  drills/business impact review or before any cross-region DR proposal.

### PRD0-D029 — Decide clean start versus production data migration

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; Abdallah approved
  PRD0-Q004 option A as approver and data authority at
  `2026-08-07T04:46:00+03:00`. The selected production-data branch is
  `CLEAN_START`.
- **Owner/data-authority attestation:** there is currently no real
  authoritative Production PostgreSQL database, Production object source, or
  Production business/user history that must be migrated or preserved before
  the first real Moazez production launch. The authoritative PostgreSQL source
  count is `0` and authoritative object source count is `0`. This is an
  `OWNER_DATA_AUTHORITY_ATTESTATION`, not a claim that Phase 3 scanned every
  external cloud account.
- **Approved disposition:** persisted PostgreSQL migration is
  `N/A_WITH_EVIDENCE`; object migration is
  `N/A_WITH_EVIDENCE_FOR_CURRENT_PRODUCTION_SOURCE`. Redis migration is
  `PROHIBITED_AS_COPY_SOURCE`; recovery drains/reconciles/re-enqueues from
  persisted truth and rebuilds ephemeral realtime state.
- **Clean-target and bootstrap evidence:** G05 proves a newly created empty
  PostgreSQL target, the existing governed G04 migration replay, and exactly
  the approved deterministic Permission and system-Role reference seeds. It
  proves that no Production User, Organization, School, or business history is
  fabricated.
- **Non-authorization:** Q004 does not approve GCS provider selection, bucket
  topology, object lifecycle, signing IAM, source deletion, physical cleanup,
  or future real-data destruction. It does not authorize deleting a
  later-discovered source.
- **Phase / approval / reopen:** any later discovery of real pre-production or
  production data that must be preserved automatically reopens PRD0-Q004 /
  PRD0-D029 before cutover. Phase 5A provider/object controls, Phase 4 crypto,
  and Phase 8 release/bootstrap controls remain independently governed.

### PRD0-D030 — Set initial instances and concurrency

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; Abdallah approved
  PRD0-Q015 during Phase 3 on 2026-08-04 (Africa/Cairo). ADR-0005 owns this
  decision.
- **Approved pilot envelope:** API min 1/max 4/concurrency 40; Core Worker min
  1/max 2/concurrency 1 per assigned consumer; Media Worker min 1/max 2/
  concurrency 1. Each maximum is the aggregate across all active revisions,
  not an independent per-revision allowance.
- **Reasoning / alternatives:** explicit conservative caps bound database and
  provider pressure. They are not proof that these values meet SLOs.
- **Impacts:** no application concurrency, queue ownership, or consumer setting
  changes are authorized by this record; this subtask only governs database
  runtime construction and documents the deployment envelope.
- **Operations / rollback:** reduce max instances or concurrency before using
  reserve capacity; observe pool wait, queue lag, transaction duration, and
  provider failure behavior before any increase.
- **Phase / approval / reopen:** provisional Phase 3 baseline. Reopen after
  PRD3-G01-B saturation/recovery and PRD3-G01-D failover evidence.

### PRD0-D031 — Approve workload and file-size assumptions

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; Abdallah approved
  PRD0-Q003 option B during Phase 3 on 2026-08-04 (Africa/Cairo). ADR-0005 owns
  this decision.
- **Approved pilot envelope:** 10 tenants, 25,000 users, 200 peak RPS, 5,000
  WebSockets, media concurrency 4, upload p95 25 MiB, upload maximum 200 MiB,
  and 3x growth over 12 months.
- **Approved queue jobs/minute:** `communication-notifications` 60,
  `communication-notification-push` 1,000, `school-email-delivery` 300,
  `files-imports` 10, `dismissal-request-expiry` 5,
  `learning-media-cleanup` 50, and `settings-branding-logo-cleanup` 10.
- **Reasoning / alternatives:** this bounded owner-delegated envelope enables a
  conservative pilot calculation; it is not final load-tested capacity.
- **Impacts:** no route, upload, queue, Redis, storage, or Learning Media
  completion contract changes are authorized here.
- **Operations / rollback:** admission controls must fail predictably; capacity
  changes remain subject to service limits and measured saturation.
- **Phase / approval / reopen:** provisional Phase 3 baseline. Reopen on growth,
  product-scope change, or contrary saturation/provider-failover evidence.

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

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-056 records the
  unsupported Node 20 baseline. Phase 1 closeout now proves Node `22.23.1`,
  compatible Node types, unchanged Firebase Admin `14.0.0`, exact-version CI,
  and the governed Docker image policy.
- **Approval authority:** owning question PRD0-Q028; approved by Abdallah on
  2026-07-27 in architecture, security, operations, and release capacities;
  owning ADR ADR-0011.
- **Approved decision:** use Node 22 LTS with the latest approved security patch
  selected at the Phase 1 implementation baseline and an immutable image
  digest in Docker and CI. Keep Firebase Admin on the package-lock-controlled
  14.x line and verify startup and push-provider smoke tests. Phase 1 selected
  and verified the exact supported patch and image evidence.
- **Reasoning / alternatives:** ignoring declared engine is rejected for
  production.
- **Impacts:** no intended API/schema; native dependencies/runtime behavior need
  regression/security verification.
- **Operations / rollback:** retain prior artifact only if dependency/runtime
  pair is supported; promote by digest.
- **Phase / approval / reopen:** Phase 1 implementation and evidence are
  complete. Reopen on upstream support or security-policy change.

### PRD0-D034 — Control production Swagger exposure

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-011 records the
  always-public pre-Phase-1 Swagger baseline. Phase 1 closeout now proves an
  explicit production-forbidden Swagger policy with configurable
  non-production exposure.
- **Approval authority:** owning question PRD0-Q029; approved by Abdallah on
  2026-07-27 in architecture, security, operations, and release capacities;
  owning ADR ADR-0011.
- **Approved decision:** production Swagger is disabled; approved audience is
  none and risk acceptor is none. Non-production exposure remains explicitly
  configurable. Phase 1 implemented this boundary.
- **Reasoning / alternatives:** public schema increases reconnaissance surface;
  disabling may hinder integrators without another access path.
- **Impacts:** DTO/runtime APIs unchanged; documentation availability changes.
  No DB impact.
- **Operations / rollback:** configuration-only exposure with audit; never
  expose secrets/examples.
- **Phase / approval / reopen:** the Phase 1 boundary is complete; Phase 8
  external exposure evidence remains gated. Reopen for an explicitly approved production
  developer-portal or restricted-audience requirement.

### PRD0-D035 — Limit public root and health diagnostics

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-046–EVD-047 and
  EVD-060 record the pre-Phase-1 diagnostic baseline. Phase 1 closeout now
  proves the minimal root identity, compatible public health, and protected
  operational probes.
- **Approval authority:** owning question PRD0-Q030; approved by Abdallah on
  2026-07-27 in product, architecture, security, operations, and release
  capacities; owning ADR ADR-0010.
- **Approved decision:** public root becomes a minimal service identity and
  version response with no development greeting or internal topology. Public
  health exposes only status, version, and timestamp; protected operational
  probes carry role-specific detail. Compatibility window is one release
  cycle. Phase 1 implemented and verified the minimum response boundary.
- **Reasoning / alternatives:** sensitive topology detail is unnecessary
  publicly; abrupt route removal is deferred under D002.
- **Impacts:** additive protected endpoint; possible coordinated response
  reduction; no schema. Apply rate limit and no credential/error leakage.
- **Operations / rollback:** keep monitor compatibility and version dashboards/
  probes before response changes.
- **Phase / approval / reopen:** the Phase 1 minimum boundary is complete;
  Phase 7 full diagnostics remain gated. Reopen after monitor inventory or an approved
  public-contract change.

## R1 storage and lifecycle decision records

### PRD0-D037 — Enforce Reinforcement proof-type MIME policy

- **Status / evidence:** `LOCKED_FROM_APPROVED_CONTEXT`; EVD-078 records the
  pre-Phase-1 ownership/private checks and missing proof-type/content match.
  Phase 1 PRD1-G06 closeout proves the approved declared/detected MIME matrix,
  tenant/uploader/private ownership, failure atomicity, and negative coverage.
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
- **Implementation distinction:** the focused Reinforcement policy is
  implemented and PRD1-G06 is complete. PRD5B-G03 remains `NOT_STARTED` for
  broader file-platform validation and policy.
- **Phase / reopen:** Phase 1 focused enforcement is complete, with Phase 5B
  broader regression ownership. Reopen for a new proof type, supported MIME, detector
  policy, or approved client-compatibility change.

### PRD0-D046 — Block provider URLs from Grade MEDIA writes

- **Status / authority:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q041 option D
  approved by Abdallah on 2026-08-11 (Africa/Cairo); owning ADR ADR-0013.
- **Decision:** new `mediaUrl` writes allow only ordinary external HTTPS, plus
  absent/null where already allowed. Direct GCS/Google Cloud Storage/MinIO/
  S3-compatible URLs, `gs://`, `s3://`, HTTP, and malformed/unsafe URLs are
  blocked. `compatibility_window=NONE`.
- **Compatibility / reopen:** preserve DTO and historical read shapes; perform
  no schema migration or silent rewrite. Reopen only through an explicit owner
  amendment to Q041.

### PRD0-D047 — Govern branding logo writes and legacy reads

- **Status / authority:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q042 approved by
  Abdallah on 2026-08-11 (Africa/Cairo); owning ADR ADR-0013.
- **Decision:** new writes remain managed File-backed only. Reads allow an
  eligible managed File, an already-persisted safe ordinary external HTTPS URL
  as read-only compatibility, or null. Provider and unsafe/malformed legacy
  values fail closed; provider discovery blocks cutover pending inventory and
  review.
- **Compatibility / reopen:** no server-side external fetch, raw legacy write,
  schema migration, or signed/provider URL exposure. Reopen only through an
  explicit owner amendment to Q042.

### PRD0-D049 — Lock the zero-object clean-start branch

- **Status / authority:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q044 option A
  approved by Abdallah as data owner and approver at
  `2026-08-09T15:20:43+03:00`; owning ADR ADR-0006.
- **Decision:** source buckets `NONE`, source object count `0`, and provider URL
  count `0`. Phase 5A must publish signed `N/A_WITH_EVIDENCE` rather than claim
  that absence was inferred.
- **Reopen:** any later-discovered object source or provider URL requiring
  preservation reopens D029 and D049–D051 before cutover.

### PRD0-D050 — Mark the source read-only window N/A with evidence

- **Status / authority:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q045 approved
  at `2026-08-09T15:20:43+03:00`; owning ADR ADR-0006.
- **Decision:** read-only duration, delta policy, and cutback authority are
  `N/A` only for the signed zero-source branch. This is not permission to
  delete a later-discovered source.
- **Reopen:** discovery of a source changes this decision to a migration branch
  requiring freeze/delta, retained source, and cutback authority.

### PRD0-D051 — Mark missing-checksum migration handling N/A with evidence

- **Status / authority:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q046 approved
  at `2026-08-09T15:20:43+03:00`; owning ADR ADR-0006.
- **Decision:** checksum sampling and mismatch handling are `N/A` only because
  the approved source-object count is zero. Newly discovered legacy objects
  require an approved full/sampled/other policy before migration.

### PRD0-D052 — Lock the private bucket topology

- **Status / authority:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q047 approved
  at `2026-08-09T15:20:43+03:00`; owning ADR ADR-0006.
- **Decision:** production and non-production each receive a `private` and a
  `published` bucket in `me-central2`. Every bucket remains private with
  Uniform Bucket-Level Access, Public Access Prevention, no anonymous access,
  exact Q022 HTTPS CORS origins, per-project signing, and IaC ownership.
- **Learning Media:** staging and final objects remain prefixes inside the
  private bucket; no third bucket or HTTP contract change is approved.

### PRD0-D053 — Lock the Phase 5A recovery baseline

- **Status / authority:** `LOCKED_FROM_APPROVED_CONTEXT`; PRD0-Q048 approved
  at `2026-08-09T15:20:43+03:00`; owning ADR ADR-0006.
- **Decision:** enable versioning on all four buckets, configure seven-day GCS
  Soft Delete, set Terraform `prevent_destroy`, keep Bucket Lock disabled, and
  add no automatic transition or deletion lifecycle rule in Phase 5A.
- **Boundary:** pending D041–D044 still block business retention, physical
  deletion, and destructive cleanup. Versioning can retain noncurrent versions
  beyond seven days until a later cost/retention policy is approved.

The records in the following table remain `OWNER_DECISION_REQUIRED`. The
recommendation column in the summary is advice only; silence selects nothing.

| Decisions | Evidence and decision boundary | Required by / reopen condition |
|---|---|---|
| PRD0-D036 Parent messaging upload | EVD-079 proves send permission without default upload permission or Parent multipart. Choose Q031 A/B/C/D; preserve current API unless explicitly changed. | Phase 1 safety/compatibility review and Phase 5B policy implementation; reopen on Parent contract change |
| PRD0-D038 Generic detected validation | EVD-068 proves declared-only current upload. Decide purpose-aware detection, mismatch, active-content, and rejection behavior. | Phase 5B; reopen for new type/purpose |
| PRD0-D039 Malware scanning | No universal scanner exists. Name provider, placement, quarantine, timeouts, availability failure policy, privacy/residency, and cost owner. | Phase 5B or defer with binding launch constraint; reopen on provider/threat change |
| PRD0-D040 File-purpose classification | Purpose may be derived or explicitly represented. A file may serve multiple relations. No `originPurpose` schema field is approved here. | Phase 5B design; reopen if schema/backfill becomes necessary |
| PRD0-D041–PRD0-D043 Retention and holds | Decide policy authority, feature periods, superseded admissions evidence, legal/audit hold precedence, and deletion eligibility. | before any destructive cleanup; reopen on law/product policy |
| PRD0-D044 Physical deletion | Report-only first. Decide approval roles, enable flag, retry/audit/recovery, and whether cleanup remains deferred under a cost constraint. | destructive cleanup remains separately blocked after Phase 5B foundation |
| PRD0-D045 Reconciliation ownership | Name producer/reviewer, cadence, inventory retention, false-positive disposition, and escalation. | Phase 5B report-only gate; reopen on reference graph change |
| PRD0-D048 Multipart controls | Approve edge/app route limits, memory, Cloud Run concurrency, simultaneous upload budget, rates, and large-file direct PUT threshold. | provisional capacity input; close with Phase 5B load evidence |

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

### Owner-directed storage fast-path amendment

The 2026-08-10 Owner direction changes ordering only:

1. the Batch 0 storage inventory and D010 boundary proceed from the formally
   closed Phase 3 baseline;
2. provider-neutral port/adapters may be implemented before full Phase 4
   closeout;
3. real GCS provisioning/signing/proof requires only the storage-critical
   accepted D017–D019 project, workload-identity, and signer prerequisites;
4. D020 Secret Manager/JWT/provider-secret rotation, D021 SMTP/device-token
   crypto, and full Phase 4 regression/closeout remain later work;
5. Phase 4 and Phase 5A remain incomplete, Phase 5B is not started, and no
   production traffic or real production data is authorized.

No unrelated future launch or production gate is weakened.

## ADR ownership sequence

The ownership map remains authoritative as amended by the Phase 3 approvals on
2026-08-04. Phase 0B created only the ADRs required by its approved answers;
Phase 3 now uses the explicitly reserved ADR-0005 number for the Cloud SQL
boundary and reserves ADR-0014 for the still-pending Learning Media decision.
Other missing numbers stay reserved for their pending decision groups. An ADR
that contains approved and pending decisions uses decision-level status and
does not accept a pending decision.

| Number | Title | Decisions covered | Current disposition |
|---|---|---|---|
| ADR-0004 | Production Runtime Roles in the Modular Monolith | owns D004–D007 | created and accepted through Q001, Q002, Q010, and Q011; Q003 is not a logical-boundary prerequisite |
| ADR-0005 | Cloud SQL Runtime Connections and Database Role Boundary | owns D011–D012, D030–D031 | created and accepted through the Phase 3 approvals for Q003, Q006, Q014, and Q015; sizing remains provisional pending PRD3-G01-B/C/D evidence |
| ADR-0006 | Production Data Source, Object Storage, and Signed Capability Boundary | owns D009–D010, D019, D022, D029, D049–D053 | accepts D009/Q008, D010/direct Owner architecture acceptance, D019/Q019, D022/Q022, D029/Q004, and D049–D053/Q044–Q048 |
| ADR-0007 | Migration Job and Deployment Ordering | owns D026–D027 | created and accepted through Q026 option A at `2026-08-07T00:22:00+03:00` |
| ADR-0008 | Redis Workload Isolation and Failure Policy                            | owns D013–D014                              | created and accepted through Q012 and Q013                                                                                                    |
| ADR-0009 | Critical Job Recovery and Reconciliation                               | owns D015                                   | created and accepted through Q017; PRD3-G03 implementation evidence recorded                                                                  |
| ADR-0010 | Production Health and Observability Contract | owns D024–D025, D035 | created; accepts D024/Q024 and D035/Q030; D025/Q025 remains pending |
| ADR-0011 | Artifact, Runtime Version, Staging, and Promotion | owns D032–D034 | created; accepts D033/Q028 and D034/Q029; D032/Q027 remains pending |
| ADR-0012 | Capacity, Backup, RTO/RPO, and Recovery Objectives | owns D016, D028 | reserved; D028 is locked through PRD0-Q007 while D016 autoscaling remains pending; no ADR or implementation evidence is created by this amendment |
| ADR-0013 | File Security, Retention, and Reference-Aware Lifecycle | owns D036–D048 | accepts D037/Q032, D046/Q041, and D047/Q042; other owned decisions remain pending |
| ADR-0014 | Learning Media Asynchronous Completion Compatibility | owns D008 | reserved; Q009 remains pending |
| ADR-0015 | GCP Environment, Workload Identity, Secrets, and Crypto | owns D017–D021, D023 | accepts D017/Q005, D018/Q018, D020/Q020, and D021/Q021; accepts only the Q023 staging sub-disposition; D023/Q023 remains pending for production |

Each listed major decision has exactly one owning ADR. Other ADRs may cite the
owning record but must not redefine it, especially for capacity and
backup/RTO/RPO policy.

## Decision closure rule

The Phase 0B closeout recorded ten approved owner-question dispositions on
2026-07-27. Later amendments through 2026-08-07 added Q003, Q004, Q006, Q012,
Q013, Q014, Q015, Q017, and Q026. The 2026-08-09 cloud/storage amendment added
Q005, Q008, Q018, Q019, and Q044–Q048. The 2026-08-11 amendment added Q041
and Q042. The 2026-08-12 amendment added Q007, and the 2026-08-14 amendment
added Q020 and Q021, for 33 approved and 15 pending owner-question
dispositions in the current register. The 2026-08-16 amendment adds one
staging-scoped approval inside pending Q023. It does not change those whole-
question counts because production remains unresolved.

D009, D010, D017–D021, D028, D046–D047, and D049–D053 are now
`LOCKED_FROM_APPROVED_CONTEXT`. D023 remains open for production; D041–D045,
D048, and every other `OWNER_DECISION_REQUIRED` record remain open until exact
owner answers, impact reconciliation, and owning-ADR acceptance are recorded.
Absence of a production answer does not select a recommendation or authorize
production implementation.
