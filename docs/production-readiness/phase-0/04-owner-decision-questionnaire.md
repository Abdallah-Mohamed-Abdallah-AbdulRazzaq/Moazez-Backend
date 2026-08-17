# Production Readiness Phase 0A — Owner Decision Questionnaire

## Instructions

Questions are ordered by dependency and blast radius. A recommended default is
not selected by silence. The owner must return the exact answer format for every
question or explicitly mark it deferred with an owner, deadline, and binding
constraint. Answers become inputs to Phase 0B ADRs; they do not authorize
implementation in Phase 0A.

One person may hold multiple approval roles in a solo-owner project, but the
person and the capacity in which they approve (product, architecture,
security, data, operations, or release) must still be named. An unanswered
decision uses
`PENDING(owner=<name>,deadline=<phase/date>,constraint=<text>)`; silence never
selects a recommended default.

## 2026-08-16 Q023 staging-only approval amendment

Abdallah approved only the staging sub-disposition of PRD0-Q023 at
`2026-08-16T19:00:00+03:00` in Africa/Cairo. The approved scope is
`STAGING_ONLY`; it does not select or imply a production API hostname or a
production edge disposition.

```text
PRD0-Q023-STAGING=APPROVED(scope=STAGING_ONLY,option=A,api_domain=staging-api.moazez.cloud,ingress=internal-and-cloud-load-balancing,cloud_armor=YES,trusted_proxies=GOOGLE_CLOUD_EXTERNAL_APPLICATION_LOAD_BALANCER_ONLY,direct_public_run_app=NO,approver=Abdallah,approved_at=2026-08-16T19:00:00+03:00); PRD0-Q023-PRODUCTION=PENDING(owner=Abdallah,deadline=before production Phase 7/8,constraint=Production API hostname and edge disposition remain unapproved; silence authorizes no production implementation or cloud provisioning)
```

The historical Q023 question, options, recommendation, and machine-readable
template below remain unchanged. Because that template does not distinguish
environments, the scoped record above preserves Q023 as pending overall until
the production hostname and edge disposition receive separate approval. This
staging approval is architecture and source authority only; it is not evidence
that a load balancer, Cloud Armor policy, certificate, DNS record, IAM grant,
or runtime deployment exists.

## 2026-08-14 Q020/Q021 approval amendment

Abdallah approved PRD0-Q020 option A and PRD0-Q021 option A at
`2026-08-14T06:37:00+03:00` in Africa/Cairo in the security, operations, and
release capacities. The historical question text, options, recommendations,
and machine-readable templates below remain unchanged.

```text
PRD0-Q020: option=A; cadence=90d; overlap=7d; emergency_owner=Abdallah; release_owner=Abdallah
PRD0-Q021: option=A; envelope_version=v2; key_families=smtp-secret,app-device-token; rotation_cadence=90d; security_approver=Abdallah
```

Q020 selects release-pinned immutable Secret Manager versions, a 90-day
normal cadence, a seven-day staged active/previous overlap, retained rollback
availability, and explicitly pinned emergency replacements without dynamic
runtime refresh. Q021 selects separate `smtp-secret` and `app-device-token`
families, active plus optional previous decryption, active-only v2 writes,
legacy v1 decrypt compatibility, a decrypt-only shared legacy key, and no
Cloud KMS. This approval supplies architecture/repository authority only; it
does not prove cloud resources, keys, IAM delivery, rehearsal, deployment,
Phase 4 completion, or production traffic authorization.

## Dependency batches

The detailed records retain stable numeric IDs; owners should answer them in
this batching order:

| Batch                                                                   | Questions                                                                    | Purpose                                                                                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Batch A — Phase 1/2 implementation lock                                 | Q001, Q002, Q010, Q011, Q022, Q024, Q028, Q029, Q030, Q032                   | runtime roles and all owner decisions required to implement and accept the Phase 1 bootstrap boundaries and Phase 2 composition roots |
| Batch B — cloud topology, data, IAM, storage, file policy, and recovery | Q004–Q009, Q012–Q013, Q017–Q021, Q023, Q026–Q027, Q031, Q033–Q042, Q044–Q048 | production topology, persisted truth, identity, storage, feature file contracts, retention, and recovery                              |
| Batch C — capacity, SLO, cost, and launch controls                      | Q003, then Q014, Q015, Q016, Q025, Q043                                      | workload first, then provisional pool/instance/concurrency values and evidence-based acceptance                                       |

Q003 is not a blocker for approving the logical API/Core/Media boundary or
writing composition roots. It is required before final Cloud SQL/Redis sizing,
pool budgets, min/max/concurrency approval, and load/SLO/cost acceptance.
Q014 and Q015 remain provisional until load and failover evidence closes their
gates.

### PRD0-Q001 — Multi-runtime deployment

- **Decision required:** Approve separate deployment roles from one
  modular-monolith repository.
- **Why / deadline:** Unblocks logical role ownership and later topology,
  IAM, pool, queue, health, and capacity work; approve in Phase 0B before
  Phase 1/2.
- **Options:** `A` current coupled API; `B` API/Core Worker/Media Worker/jobs
  from one repository; `C` another explicitly described role set.
- **Recommended default:** `B`.
- **Trade-offs:** more deployments/configuration; smaller scaling and failure
  domains without microservices.
- **Cost/scaling:** minimum instances may add cost; roles scale independently.
- **Security:** permits least-privilege identities; coupled mode retains broad
  permissions.
- **If unanswered:** Phase 1 command/image safety where applicable and Phase 2
  composition remain blocked; capacity is separately gated by Batch C.
- **Exact answer:** `PRD0-Q001: option=<A|B|C>; roles=<comma-list>; approver=<name>`

### PRD0-Q002 — Runtime responsibility boundaries

- **Decision required:** Assign HTTP/WebSocket, seven consumers, media
  verification/cleanup, migration, and maintenance to exact roles.
- **Why / deadline:** Prevents duplicate/missing workers and unauthorized
  permissions; approve in Phase 0B before Phase 2.
- **Options:** `A` inventory mapping in `01-runtime-and-dependency-inventory.md`;
  `B` owner-supplied mapping.
- **Recommended default:** `A`.
- **Trade-offs:** dedicated Media isolates CPU/disk but needs another deployable;
  a larger Core role is simpler but broader.
- **Cost/scaling:** role count and minimum capacity determine base cost.
- **Security:** each assignment defines DB/storage/provider permissions.
- **If unanswered:** startup graphs, service accounts, and health cannot be
  implemented or accepted.
- **Exact answer:** `PRD0-Q002: option=<A|B>; api=<responsibilities>; core=<responsibilities>; media=<responsibilities>; migration=<responsibilities>; maintenance=<responsibilities>; approver=<name>`

### PRD0-Q004 — Production data source

- **Decision required:** State whether production is a clean start or identify
  every authoritative database/object source and required cutover.
- **Why / deadline:** Changes storage, SQL, encryption, downtime, rollback, and
  rehearsal scope; approve in Phase 0B before Phase 3/4/5A designs close.
- **Options:** `A` verified clean start; `B` DB plus objects migration; `C`
  another enumerated migration.
- **Recommended default:** no default; this is a factual owner assertion.
- **Trade-offs:** clean start is simpler only when no required data exists;
  migration requires freeze/delta/reconciliation.
- **Cost/scaling:** migration environments, transfer, storage overlap, and
  downtime rehearsals add cost.
- **Security:** source access, tenant isolation, encrypted rows, and data
  residency apply.
- **If unanswered:** GCS/Cloud SQL cutover and recovery design remain blocked.
- **Exact answer:** `PRD0-Q004: option=<A|B|C>; sources=<comma-list|NONE>; downtime_budget=<duration>; retain_source=<duration>; data_owner=<name>`

### PRD0-Q005 — GCP project/environment separation

- **Decision required:** Approve project boundaries for development, staging,
  production, shared CI/artifacts, and disaster recovery.
- **Why / deadline:** Precedes IAM, networking, quotas, secrets, IaC state, and
  billing; before Phase 4/5A/8 provisioning.
- **Options:** `A` separate prod/non-prod projects; `B` project per environment;
  `C` shared project with explicit compensating controls.
- **Recommended default:** `A`, with shared artifact project only if policy
  supports controlled cross-project pull.
- **Trade-offs:** more projects improve isolation but add policy/billing/IaC
  administration.
- **Cost/scaling:** duplicated baseline resources and logging may increase cost.
- **Security:** project boundary limits accidental mutation and IAM blast radius.
- **If unanswered:** no production resource or service account should be
  created.
- **Exact answer:** `PRD0-Q005: option=<A|B|C>; projects=<env:name map>; billing_owner=<name>; org_policy_owner=<name>`

### PRD0-Q006 — Primary region and Cloud SQL HA

- **Decision required:** Select GCP region, data residency, regional HA, and any
  cross-region recovery location.
- **Why / deadline:** Governs latency, availability, cost, storage, Redis, and
  backup design; before Phase 3.
- **Options:** `A` regional HA same region as runtimes; `B` zonal; `C` regional
  HA plus cross-region recovery.
- **Recommended default:** `A`; add `C` only when Q007 requires it.
- **Trade-offs:** HA costs more; cross-region improves disaster options but adds
  operational/data-residency complexity.
- **Cost/scaling:** multi-zone and cross-region storage/network incur recurring
  cost.
- **Security:** residency and private network boundaries must be approved.
- **If unanswered:** SQL, Redis, GCS, runtime placement, and RTO proof are
  blocked.
- **Exact answer:** `PRD0-Q006: option=<A|B|C>; primary_region=<region>; dr_region=<region|NONE>; residency_constraint=<text>; approver=<name>`

### PRD0-Q007 — RTO, RPO, backups, and retention

- **Decision required:** Approve RTO, RPO, PITR window, backup retention,
  restore-drill frequency, and cross-region copy need.
- **Why / deadline:** Determines HA/DR and production acceptance; before Phase 3
  implementation.
- **Options:** owner-supplied objectives; provider defaults are not an explicit
  business objective.
- **Recommended default:** PITR enabled, scheduled backups, quarterly restore
  drill; exact durations require owner input.
- **Trade-offs:** lower RPO/RTO and longer retention cost more and require more
  automation.
- **Cost/scaling:** backup storage, cross-region transfer, and rehearsal
  environments.
- **Security:** retention/deletion/residency and restore access must comply with
  policy.
- **If unanswered:** data-loss/downtime risk cannot be accepted.
- **Exact answer:** `PRD0-Q007: rto=<duration>; rpo=<duration>; pitr=<duration>; backup_retention=<duration>; restore_drill=<frequency>; cross_region=<YES|NO>; approver=<name>`

### PRD0-Q008 — Production storage provider

- **Decision required:** Approve GCS production with MinIO retained for
  local/test, or select an alternative.
- **Why / deadline:** Unblocks storage port, signing, object migration, IAM,
  CORS, and tests; before Phase 5A.
- **Options:** `A` GCS prod + MinIO local/test; `B` MinIO all environments; `C`
  other stated mapping.
- **Recommended default:** `A`.
- **Trade-offs:** two adapters require contract parity; production GCS removes
  self-managed MinIO operations.
- **Cost/scaling:** GCS storage/egress/operations versus MinIO infrastructure and
  operations.
- **Security:** workload identity and bucket IAM replace static keys.
- **If unanswered:** storage and media work cannot be safely scoped.
- **Exact answer:** `PRD0-Q008: option=<A|B|C>; prod_provider=<name>; local_provider=<name>; test_provider=<name>; bucket_region=<region>; approver=<name>`

### PRD0-Q009 — Media completion compatibility strategy

- **Decision required:** Choose how synchronous `POST .../:uploadId/complete`
  evolves to background verification.
- **Why / deadline:** It is the largest public contract risk; before Phase 6.
- **Options:** `A` retain sync; `B` additive async submit/status with transition;
  `C` coordinated in-place 202 change; `D` new `/api/v2`.
- **Recommended default:** `B`.
- **Trade-offs:** dual behavior adds temporary complexity; in-place change is
  simpler server-side but breaks existing clients.
- **Cost/scaling:** async workers add queue/runtime cost and allow bounded media
  capacity.
- **Security:** status/result authorization and idempotency must preserve current
  tenancy/permissions.
- **If unanswered:** Media Worker and API DTO/state design remain blocked.
- **Exact answer:** `PRD0-Q009: option=<A|B|C|D>; supported_clients=<list>; transition_window=<duration>; retirement_approval=<name|PENDING>`

### PRD0-Q010 — API consumer prohibition

- **Decision required:** Confirm that target API instances create producers but
  no BullMQ consumers.
- **Why / deadline:** Required for predictable scaling, pools, shutdown, and
  least privilege; approve in Phase 0B before Phase 2.
- **Options:** `A` prohibit all consumers; `B` list explicit exception and
  rationale; `C` keep current coupling.
- **Recommended default:** `A`.
- **Trade-offs:** requires continuously available worker roles; avoids API
  autoscaling starting consumers.
- **Cost/scaling:** separate worker minimums may cost more but scale by backlog.
- **Security:** removes SMTP/push/delete permissions from API.
- **If unanswered:** PRD2-G02 cannot close.
- **Exact answer:** `PRD0-Q010: option=<A|B|C>; exceptions=<queue-list|NONE>; approver=<name>`

### PRD0-Q011 — Repeatable/scheduled job ownership

- **Decision required:** Assign registration/execution of dismissal expiry,
  media discovery, branding reconcile, and future schedules.
- **Why / deadline:** Prevents duplicate/missed/destructive maintenance;
  approve in Phase 0B before Phase 2.
- **Options:** `A` dedicated scheduler invokes idempotent jobs; `B` exactly one
  named worker role registers; `C` other singular mechanism.
- **Recommended default:** `A` for maintenance commands, with consumers in
  assigned workers.
- **Trade-offs:** external scheduling adds a component; worker registration is
  simpler but ownership depends on worker availability.
- **Cost/scaling:** minimal scheduler invocation cost; avoids duplicate work.
- **Security:** destructive branding maintenance needs narrow identity/audit.
- **If unanswered:** schedule separation and worker rollout are unsafe.
- **Exact answer:** `PRD0-Q011: option=<A|B|C>; dismissal_owner=<role>; media_owner=<role>; branding_owner=<role>; approver=<name>`

### PRD0-Q012 — Redis workload topology

- **Decision required:** Choose one or separate production Redis instances for
  BullMQ/locks and realtime adapter/state.
- **Why / deadline:** Defines failure/capacity domain and cutover; before Phase 3.
- **Options:** `A` shared; `B` separate queue and realtime; `C` finer separation.
- **Recommended default:** `B`.
- **Trade-offs:** separation costs more and adds configuration; sharing has one
  large blast radius.
- **Cost/scaling:** at least two managed instances versus one.
- **Security:** separate network/credentials and data access.
- **If unanswered:** Redis IaC, URLs, health, capacity, and outage tests are
  blocked.
- **Exact answer:** `PRD0-Q012: option=<A|B|C>; queue_instance=<class>; realtime_instance=<class|SAME>; region=<region>; approver=<name>`

### PRD0-Q013 — Redis failure/fallback policy

- **Decision required:** Define HTTP/WebSocket behavior when realtime or queue
  Redis is unavailable.
- **Why / deadline:** Current in-memory realtime fallback is unsafe across
  instances; before Phase 3.
- **Options:** `A` fail realtime readiness and reject/retry; `B` approved
  single-instance memory mode; `C` silent fallback.
- **Recommended default:** `A`; `C` is not recommended.
- **Trade-offs:** fail-closed causes visible outage but avoids divergent truth.
- **Cost/scaling:** HA Redis lowers outage probability at added cost.
- **Security:** consistent rooms/presence prevent partial authorization/event
  visibility behavior.
- **If unanswered:** multi-instance realtime cannot be accepted.
- **Exact answer:** `PRD0-Q013: option=<A|B|C>; http_behavior=<text>; websocket_behavior=<text>; reconnect_budget=<duration>; approver=<name>`

### PRD0-Q003 — Launch workload and growth envelope

- **Decision required:** Supply initial and 12-month tenants/users, peak API
  RPS, concurrent WebSockets, jobs/minute by queue, email/push volume,
  concurrent media completions, upload mix/size, and growth factor.
- **Why / deadline:** Unblocks final database/Redis sizing, pools, concurrency,
  ephemeral disk, quotas, SLO tests, and cost. It is a Batch C capacity input,
  not a Phase 1/2 logical composition-root blocker.
- **Options:** `A` measured forecast; `B` conservative bounded launch pilot;
  `C` explicitly funded stress envelope.
- **Recommended default:** `B` if measured forecast is unavailable.
- **Trade-offs:** a smaller pilot lowers cost/risk but constrains onboarding.
- **Cost/scaling:** direct driver of Cloud Run, SQL, Redis, storage, network, and
  provider spend.
- **Security:** informs abuse limits and tenant quotas.
- **If unanswered:** final Cloud SQL/Redis sizing, pool budgets,
  min/max/concurrency, load/SLO/cost acceptance are blocked; logical role
  separation is not. Provider defaults are not an approved answer.
- **Exact answer:** `PRD0-Q003: option=<A|B|C>; tenants=<n>; users=<n>; peak_rps=<n>; websockets=<n>; queue_jobs_per_min=<map>; media_concurrency=<n>; upload_p95_mib=<n>; upload_max_mib=<n>; growth_12m=<factor>; approver=<name>`

### PRD0-Q014 — Database pool budgets

- **Decision required:** Approve per-instance pool and total connection budgets
  for API, Core, Media, Migration, and operations.
- **Why / deadline:** Prevents Cloud SQL exhaustion; before Phase 3 load work.
  The approved number is provisional until load and failover evidence closes
  the corresponding acceptance gate.
- **Options:** `A` role-specific calculated budgets; `B` owner-supplied fixed
  budgets; defaults are not approved.
- **Recommended default:** `A`, reserving failover/migration/incident headroom.
- **Trade-offs:** small pools queue requests; large pools exhaust DB under scale.
- **Cost/scaling:** drives SQL tier and max instance counts.
- **Security:** distinct DB users should match role privileges.
- **If unanswered:** max instances/concurrency and SQL tier cannot be accepted.
- **Exact answer:** `PRD0-Q014: api_pool=<n>; core_pool=<n>; media_pool=<n>; migration_pool=<n>; ops_reserve=<n>; max_total=<n>; approver=<name>`

### PRD0-Q015 — Initial instances and concurrency

- **Decision required:** Set minimum/maximum instances and request/job
  concurrency for each role.
- **Why / deadline:** Bounds cost, SQL/Redis/provider load, queue lag, and disk;
  before final Phase 3/6/8 capacity acceptance. Values are provisional until
  load and failover evidence closes the corresponding acceptance gates.
- **Options:** `A` conservative load-tested caps; `B` owner-specified caps; `C`
  provider defaults.
- **Recommended default:** `A`; do not use `C`.
- **Trade-offs:** lower caps protect dependencies but raise latency/lag.
- **Cost/scaling:** directly controls Cloud Run/worker spend and minimum cost.
- **Security:** caps limit abuse/resource-exhaustion blast radius.
- **If unanswered:** production load and failure gates cannot close.
- **Exact answer:** `PRD0-Q015: api=min:<n>,max:<n>,concurrency:<n>; core=min:<n>,max:<n>,concurrency:<n>; media=min:<n>,max:<n>,concurrency:<n>; approver=<name>`

### PRD0-Q016 — Worker scaling mechanism

- **Decision required:** Choose fixed bounded capacity, Worker Pool, or external
  queue-lag autoscaling.
- **Why / deadline:** Determines deployment, heartbeat, cost, and recovery;
  before final Phase 3 and Phase 6 capacity acceptance.
- **Options:** `A` fixed/minimum bounded capacity; `B` Worker Pool fixed;
  `C` external autoscaling; `D` staged A/B then C.
- **Recommended default:** `D`.
- **Trade-offs:** fixed is predictable but can lag; autoscaling is responsive
  but risks dependency/provider saturation.
- **Cost/scaling:** minimum worker cost versus scaler/monitoring complexity.
- **Security:** scaler needs metric/control permissions; workers remain
  least-privilege.
- **If unanswered:** worker infrastructure and capacity tests remain open.
- **Exact answer:** `PRD0-Q016: option=<A|B|C|D>; lag_target=<duration>; scale_up_limit=<n>; scale_down_drain=<duration>; approver=<name>`

### PRD0-Q017 — Critical job recovery policy

- **Decision required:** Approve recovery objective, maximum retry age,
  reconciliation cadence, and manual replay authority for each queue.
- **Why / deadline:** Current policies are inconsistent; before Phase 3.
- **Options:** `A` DB-backed terminal state/reconciler for all seven; `B`
  owner-defined critical subset; `C` retry-only.
- **Recommended default:** `A`, tailored to side effects.
- **Trade-offs:** persistent ledgers/reconcilers add code/storage but support
  provable recovery.
- **Cost/scaling:** reconciliation reads and retained outcomes consume resources.
- **Security:** replay must be audited and tenant/provider scoped.
- **If unanswered:** job recovery gate remains release-blocking.
- **Exact answer:** `PRD0-Q017: option=<A|B|C>; critical_queues=<list>; retry_max_age=<duration>; reconcile=<frequency>; replay_approvers=<names>`

### PRD0-Q018 — Service-account boundaries

- **Decision required:** Approve identity per API, Core, Media, Migration,
  Maintenance, deployer, and signed-URL function.
- **Why / deadline:** Required for least privilege and Secret Manager/GCS/SQL
  design; before Phase 4.
- **Options:** `A` identity per role; `B` shared runtime identity with listed
  compensating controls.
- **Recommended default:** `A`.
- **Trade-offs:** more IAM/IaC administration; much smaller compromise radius.
- **Cost/scaling:** negligible direct cost; policy maintenance cost.
- **Security:** prevents API DDL, broad deletion, SMTP/push, or deploy rights.
- **If unanswered:** IAM and production provisioning are blocked.
- **Exact answer:** `PRD0-Q018: option=<A|B>; identities=<role:account-name map>; security_approver=<name>`

### PRD0-Q019 — GCS signed-URL identity

- **Decision required:** Select the service account/mechanism that signs direct
  upload, download, and playback capabilities.
- **Why / deadline:** GCS signing needs explicit IAM and rotation; before
  Phase 4/5A.
- **Options:** `A` dedicated signer identity; `B` API identity; `C` separate
  signing service.
- **Recommended default:** `A`.
- **Trade-offs:** dedicated identity balances isolation and simplicity; service
  adds latency/operations.
- **Cost/scaling:** signing quotas/latency and optional service cost.
- **Security:** object-prefix permissions, TTL, headers, audit, and keyless
  signing are required.
- **If unanswered:** GCS presigned contract cannot be implemented.
- **Exact answer:** `PRD0-Q019: option=<A|B|C>; signer=<account>; allowed_buckets=<list>; max_ttl=<duration>; approver=<name>`

### PRD0-Q020 — Secret version and rotation policy

- **Decision required:** Choose Secret Manager version selection, rotation
  cadence, overlap, emergency rotation, and owners.
- **Why / deadline:** Every runtime/provider depends on secrets; before Phase 4.
- **Options:** `A` release-pinned versions with staged overlap; `B` `latest`;
  `C` dynamic refresh with tested semantics.
- **Recommended default:** `A`.
- **Trade-offs:** pinning is reproducible but requires release promotion;
  dynamic/latest is faster but can mutate behavior unexpectedly.
- **Cost/scaling:** Secret Manager access and operational rotation work.
- **Security:** limits credential lifetime and supplies audit.
- **If unanswered:** secret delivery and rollback proof remain blocked.
- **Exact answer:** `PRD0-Q020: option=<A|B|C>; cadence=<duration>; overlap=<duration>; emergency_owner=<name>; release_owner=<name>`

### PRD0-Q021 — Encryption key separation and envelope

- **Decision required:** Approve separate key families for device tokens and
  SMTP secrets and a key-ID/multi-key rotation envelope.
- **Why / deadline:** Current shared `v1` envelope cannot rotate safely; before
  Phase 4.
- **Options:** `A` separate Secret Manager keys + key ID; `B` Cloud KMS envelope;
  `C` retain shared key.
- **Recommended default:** `A` unless security selects `B`.
- **Trade-offs:** KMS has stronger managed key controls and per-call complexity/
  cost; secret keys are simpler.
- **Cost/scaling:** re-encryption job plus possible KMS request cost.
- **Security:** isolates compromise and enables staged rotation.
- **If unanswered:** encryption migration and secret rotation gate remain
  blocked.
- **Exact answer:** `PRD0-Q021: option=<A|B|C>; envelope_version=<name>; key_families=<list>; rotation_cadence=<duration>; security_approver=<name>`

### PRD0-Q022 — Frontend origins

- **Decision required:** Supply exact HTTPS origins for web/admin clients per
  environment and whether credentials/WebSockets/direct storage are required.
- **Why / deadline:** Current production CORS blocks browser traffic; before
  Phase 1 minimum boundaries, Phase 5A storage CORS, and Phase 7 full controls.
- **Options:** exact allowlist only; wildcard is not recommended with
  credentials.
- **Recommended default:** one or more exact environment-specific origins.
- **Trade-offs:** tight allowlists require updates for new domains/previews.
- **Cost/scaling:** negligible; CDN/domain choices can add cost.
- **Security:** prevents cross-origin credential/capability misuse.
- **If unanswered:** browser HTTP, WebSocket, and direct GCS flow cannot launch.
- **Exact answer:** `PRD0-Q022: prod_origins=<comma-list>; staging_origins=<comma-list>; credentials=<YES|NO>; websocket=<YES|NO>; storage_direct=<YES|NO>; approver=<name>`

### PRD0-Q023 — Public ingress and edge controls

- **Decision required:** Choose custom domain, direct Cloud Run versus HTTPS
  load balancer, Cloud Armor, ingress restrictions, and trusted proxy policy.
- **Why / deadline:** Defines exposure, TLS, WebSocket routing, rate controls,
  and cost; before Phase 7/8.
- **Options:** `A` LB/domain/managed TLS/Armor; `B` direct Cloud Run with approved
  controls; `C` private ingress plus separate public gateway.
- **Recommended default:** `A` for public launch, subject to threat/budget review.
- **Trade-offs:** LB/Armor add protection/features and operational cost.
- **Cost/scaling:** edge, rules, certificates, and network charges.
- **Security:** central WAF/rate/IP controls and trusted forwarded headers.
- **If unanswered:** public security architecture cannot close.
- **Exact answer:** `PRD0-Q023: option=<A|B|C>; api_domain=<fqdn>; ingress=<setting>; cloud_armor=<YES|NO>; trusted_proxies=<policy>; approver=<name>`

### PRD0-Q024 — Probe semantics

- **Decision required:** Define critical dependencies and status behavior for
  API/Core/Media startup, liveness, and readiness; decide compatibility for
  current `/health`.
- **Why / deadline:** Current HTTP 200 degraded report cannot safely drive
  orchestration; minimum safe semantics in Phase 1, full matrix in Phase 7.
- **Options:** `A` additive private role probes and retain current health; `B`
  change current health; `C` another versioned plan.
- **Recommended default:** `A`.
- **Trade-offs:** more endpoints/tests; correct restart versus routing behavior.
- **Cost/scaling:** negligible, but poor thresholds cause restart/traffic churn.
- **Security:** private details must not remain publicly exposed.
- **If unanswered:** Cloud Run probe and deployment gates are blocked.
- **Exact answer:** `PRD0-Q024: option=<A|B|C>; api_required=<list>; core_required=<list>; media_required=<list>; public_health=<policy>; approver=<name>`

### PRD0-Q025 — SLO, telemetry, and alert ownership

- **Decision required:** Approve availability/latency/error/queue/media SLOs,
  alert thresholds, paging hours/owners, log retention, and telemetry budget.
- **Why / deadline:** Required for capacity, readiness, release, and incidents;
  before Phase 7.
- **Options:** owner-supplied objectives; recommended starter objectives require
  a separate review, not silent adoption.
- **Recommended default:** managed structured logs/metrics/traces with low-cardinality
  labels, all-seven-queue lag/heartbeat, and business SLOs.
- **Trade-offs:** deeper telemetry improves detection but increases cost/privacy
  handling.
- **Cost/scaling:** ingestion, retention, custom metrics, and on-call staffing.
- **Security:** redact PII/secrets; restrict log/trace access and retention.
- **If unanswered:** release health cannot be judged.
- **Exact answer:** `PRD0-Q025: api_availability=<percent>; api_p95=<duration>; queue_lag=<map>; media_completion=<duration>; paging=<schedule/owner>; log_retention=<duration>; monthly_budget=<amount/currency>; approver=<name>`

### PRD0-Q026 — Migration/deployment ordering

- **Decision required:** Approve the exact preflight, backup, Migration Job,
  runtime rollout, smoke, traffic, and stop/rollback sequence.
- **Why / deadline:** No deployment pipeline exists; before Phase 8.
- **Options:** `A` explicit Migration Job gate before compatible runtime; `B`
  owner-supplied governed sequence; app-startup migration is not recommended.
- **Recommended default:** `A`.
- **Trade-offs:** serial gate increases deployment time but prevents races.
- **Cost/scaling:** small job/runtime cost; reduces incident cost.
- **Security:** DDL identity is separate and audited.
- **If unanswered:** production deployment automation cannot be accepted.
- **Exact answer:** `PRD0-Q026: option=<A|B>; sequence=<ordered-list>; migration_approver=<name>; rollback_authority=<name>`

### PRD0-Q027 — Staging equivalence and promotion

- **Decision required:** Approve staging topology equivalence, allowed
  differences, release-candidate duration, canary, and same-digest promotion.
- **Why / deadline:** Functional CI is not production-equivalent; before
  Phase 8.
- **Options:** `A` separate equivalent staging, same digest; `B` documented
  reduced staging with compensating tests; `C` no staging.
- **Recommended default:** `A`.
- **Trade-offs:** equivalent staging costs more; reduced staging leaves gaps.
- **Cost/scaling:** duplicate managed resources and test traffic.
- **Security:** staging uses separate identities/secrets and sanitized data.
- **If unanswered:** release promotion and failure rehearsal remain blocked.
- **Exact answer:** `PRD0-Q027: option=<A|B|C>; allowed_differences=<list|NONE>; soak=<duration>; canary_steps=<list>; approver=<name>`

### PRD0-Q028 — Supported Node version

- **Decision required:** Resolve Node 20 image/CI versus Firebase Admin 14 Node
  22+ requirement.
- **Why / deadline:** Unsupported engine is an immediate release blocker; Phase
  1.
- **Options:** `A` upgrade image/CI to supported Node 22 line; `B` deliberately
  downgrade Firebase dependency to a Node-20-supported version with tests.
- **Recommended default:** `A`.
- **Trade-offs:** upgrade may expose runtime/native dependency regressions;
  downgrade may forgo fixes/features.
- **Cost/scaling:** engineering/test cost, little direct infrastructure effect.
- **Security:** supported runtimes/dependencies receive security maintenance.
- **If unanswered:** no production image may be accepted.
- **Exact answer:** `PRD0-Q028: option=<A|B>; node_version=<exact policy>; firebase_version=<exact policy>; approver=<name>`

### PRD0-Q029 — Production Swagger

- **Decision required:** Decide whether `/api/v1/docs` is disabled,
  authenticated/restricted, or public in production.
- **Why / deadline:** It is always mounted today; configurable boundary in
  Phase 1 and external exposure proof in Phase 8.
- **Options:** `A` disabled; `B` restricted; `C` public with explicit risk
  acceptance.
- **Recommended default:** `B` if operational consumers require it, otherwise
  `A`.
- **Trade-offs:** restriction reduces reconnaissance but adds access workflow.
- **Cost/scaling:** negligible.
- **Security:** exposes API schema and endpoints; examples must never contain
  secrets.
- **If unanswered:** public exposure remains a release-blocking unowned risk.
- **Exact answer:** `PRD0-Q029: option=<A|B|C>; allowed_audience=<group|NONE>; risk_acceptor=<name|NONE>`

### PRD0-Q030 — Public root and health detail

- **Decision required:** Decide the compatible future behavior of root
  `GET /api/v1` and public `GET /api/v1/health`, including diagnostic detail.
- **Why / deadline:** Current health exposes queue/email/push details and always
  normally returns 200; minimum safe boundary in Phase 1 and full semantics in
  Phase 7.
- **Options:** `A` minimal public status plus protected operational endpoints;
  `B` retain current detail with explicit acceptance; `C` versioned removal.
- **Recommended default:** `A`, with a compatibility window.
- **Trade-offs:** reducing detail improves security but requires monitor/client
  updates.
- **Cost/scaling:** negligible; monitor migration effort.
- **Security:** minimizes topology/configuration disclosure and abuse surface.
- **If unanswered:** health/diagnostic acceptance and probe design remain open.
- **Exact answer:** `PRD0-Q030: option=<A|B|C>; root_policy=<text>; public_health_fields=<list>; compatibility_window=<duration>; approver=<name>`

## R1 file and storage questions

### PRD0-Q031 — Parent messaging upload contract

- **Decision required:** Choose `A` bounded Parent messaging multipart
  endpoint/policy; `B` narrowly scoped attachment-upload permission through a
  shared endpoint; `C` Parent messaging remains text-only/no-new-upload; or
  `D` another explicit contract.
- **Recommended default:** no silent default; product, architecture, and
  security approval are required before Phase 5B.
- **Exact answer:** `PRD0-Q031: option=<A|B|C|D>; endpoint_or_policy=<text>; allowed_types=<list|NONE>; max_bytes=<n|NONE>; approver=<name>`

### PRD0-Q032 — Reinforcement proof-type MIME policy

- **Decision required:** Approve declared and detected MIME matrices for
  `IMAGE`, `VIDEO`, and `DOCUMENT`, mismatch handling, and current-client
  compatibility while retaining org/school/uploader/private checks.
- **Recommended default:** narrow explicit matrices and reject cross-type
  mismatches; exact types need owner approval.
- **Exact answer:** `PRD0-Q032: image=<mime-list>; video=<mime-list>; document=<mime-list>; detected_policy=<text>; compatibility=<text>; approver=<name>`

### PRD0-Q033 — Generic File detected-content validation

- **Decision required:** Choose `A` purpose-aware detection; `B` one shared
  allowlist/detector; `C` declared-only with explicit risk acceptance; or `D`
  another policy. State PDF/image/media/text handling and mismatch response.
- **Recommended default:** `A`; no schema field is implied.
- **Exact answer:** `PRD0-Q033: option=<A|B|C|D>; formats=<policy-map>; mismatch=<reject|quarantine|other>; approver=<name>`

### PRD0-Q034 — Malware scanning and failure policy

- **Decision required:** Name scanner/provider, placement, timeout, quarantine,
  privacy/residency, fail-open/fail-closed behavior, retry, and cost owner.
- **Recommended default:** no provider is selected by this draft.
- **Exact answer:** `PRD0-Q034: provider=<name|NONE>; placement=<sync|async|hybrid>; outage_policy=<text>; quarantine=<text>; retention=<duration>; cost_owner=<name>; security_approver=<name>`

### PRD0-Q035 — File-purpose classification strategy

- **Decision required:** Choose `A` derive from business references; `B` typed
  classification stored only when required; `C` hybrid/multi-purpose; or `D`
  another model, including migration/backfill implications.
- **Recommended default:** derive where reliable and add stored classification
  only after a concrete need; `originPurpose` is not approved here.
- **Exact answer:** `PRD0-Q035: option=<A|B|C|D>; multipurpose=<policy>; backfill=<text|N/A>; approver=<name>`

### PRD0-Q036 — Retention policy owner

- **Decision required:** Choose whether policy authority is `File`, each
  business relation, a policy service, or a documented hybrid; name owner.
- **Recommended default:** relation/policy-aware hybrid; never naive reference
  count alone.
- **Exact answer:** `PRD0-Q036: authority=<FILE|RELATION|POLICY_SERVICE|HYBRID>; rules=<text>; owner=<name>; approver=<name>`

### PRD0-Q037 — Feature retention periods

- **Decision required:** Supply retention/class for generic, communication,
  homework, attendance, reinforcement, applicant/admissions, student document,
  avatar, branding, import, Learning Media, Hero, and direct URL records.
- **Recommended default:** none; legal/product/data owners must supply values.
- **Exact answer:** `PRD0-Q037: periods=<feature:duration_or_class map>; deletion_after_expiry=<policy>; owner=<name>; approver=<name>`

### PRD0-Q038 — Admissions, audit, and legal hold

- **Decision required:** Define superseded admissions evidence retention,
  legal/audit hold creation/release, precedence, access logging, and deletion
  approval.
- **Recommended default:** holds override ordinary expiry.
- **Exact answer:** `PRD0-Q038: admissions_retention=<duration>; hold_authority=<name>; release_authority=<name>; precedence=<text>; approver=<name>`

### PRD0-Q039 — Physical deletion approval and enablement

- **Decision required:** Choose `A` report-only indefinitely; `B` report-only
  then separately enabled deletion; `C` another governed mode. Name approvers,
  canary, retry/audit, recovery, and kill switch.
- **Recommended default:** `B`; this answer alone does not enable deletion.
- **Exact answer:** `PRD0-Q039: option=<A|B|C>; enable_approvers=<names>; canary=<text>; recovery=<text>; kill_switch_owner=<name>`

### PRD0-Q040 — Report-only reconciliation ownership

- **Decision required:** Name report producer/reviewer, cadence, retention,
  missing-object escalation, false-positive review, and candidate disposition.
- **Recommended default:** dual review by storage/data and feature owner.
- **Exact answer:** `PRD0-Q040: producer=<name>; reviewer=<name>; cadence=<duration>; report_retention=<duration>; escalation=<text>; approver=<name>`

### PRD0-Q041 — Grade MEDIA URL policy

- **Decision required:** Choose `A` managed `fileId`; `B` approved external
  HTTPS only; `C` both during compatibility; `D` block new direct provider URLs
  while retaining approved legacy reads.
- **Recommended default:** `C` only if a bounded migration window is needed;
  existing rows branch on Q004 and require inventory.
- **Exact answer:** `PRD0-Q041: option=<A|B|C|D>; allowlist=<policy>; compatibility_window=<duration|NONE>; legacy_owner=<name>; approver=<name>`

### PRD0-Q042 — Legacy branding URL treatment

- **Decision required:** Approve handling for managed File, approved external
  HTTPS, legacy provider, invalid/unsafe, and null values.
- **Recommended default:** keep current safe external fallback until inventory
  and retirement approval; do not assume MinIO.
- **Exact answer:** `PRD0-Q042: managed=<policy>; external_https=<policy>; provider_url=<policy>; unsafe=<policy>; null=<policy>; approver=<name>`

### PRD0-Q043 — Multipart edge limits and Cloud Run upload concurrency

- **Decision required:** Set edge/app limits per six routes, instance memory,
  upload concurrency, simultaneous-load envelope, rate limits, rejection
  behavior, and direct-PUT threshold.
- **Recommended default:** no unbounded generic increase; large files use
  direct object upload. Values remain provisional until load proof.
- **Exact answer:** `PRD0-Q043: route_limits=<map>; edge_max=<n>; instance_memory=<n>; upload_concurrency=<n>; rate_limits=<map>; direct_put_threshold=<n>; approver=<name>`

### PRD0-Q044 — Existing MinIO object branch

- **Decision required:** Under Q004, attest `A` signed clean start with zero
  source objects/provider URLs to preserve; or `B` inventory/copy/update/
  reconcile migration; or `C` another explicit branch.
- **Recommended default:** none; this is factual. Clean start must use
  `N/A_WITH_EVIDENCE`, not assumed absence.
- **Exact answer:** `PRD0-Q044: option=<A|B|C>; source_buckets=<list|NONE>; source_object_count=<n>; provider_url_count=<n>; data_owner=<name>; approver=<name>`

### PRD0-Q045 — Source MinIO read-only rollback window

- **Decision required:** If Q044 is migration, set freeze/delta behavior,
  read-only duration, cutback authority, source deletion prohibition, and exit
  evidence; clean start answers `N/A_WITH_EVIDENCE`.
- **Recommended default:** retain read-only through reconciled cutback window.
- **Exact answer:** `PRD0-Q045: mode=<MIGRATION|N/A_WITH_EVIDENCE>; read_only=<duration|N/A>; delta=<policy|N/A>; cutback_authority=<name|N/A>; approver=<name>`

### PRD0-Q046 — Hash verification when checksum is absent

- **Decision required:** Choose full hashing, statistically justified sample
  plus size/generation, or another approved policy; state mismatch handling.
- **Recommended default:** full hashing for migrated managed objects where
  feasible; no false checksum claim for absent legacy values.
- **Exact answer:** `PRD0-Q046: mode=<FULL|SAMPLED|OTHER|N/A_WITH_EVIDENCE>; sample=<text|N/A>; mismatch=<text|N/A>; approver=<name>`

### PRD0-Q047 — Storage bucket and privacy topology

- **Decision required:** Name production/staging buckets, region, private/public
  policy, Learning Media staging/final separation, CORS, signer, and IaC owner.
- **Recommended default:** private managed buckets and IaC provisioning; no
  request-path bucket creation.
- **Exact answer:** `PRD0-Q047: buckets=<purpose:name map>; region=<region>; public_policy=<text>; cors=<policy>; signer=<identity>; iac_owner=<name>; approver=<name>`

### PRD0-Q048 — GCS versioning, lifecycle, and deletion protection

- **Decision required:** Approve object versioning, lifecycle transitions,
  retention/deletion protection, recovery window, cost, and exceptions.
- **Recommended default:** versioning/protection through migration and initial
  launch; business deletion remains separately governed by Q036–Q039.
- **Exact answer:** `PRD0-Q048: versioning=<policy>; lifecycle=<policy>; deletion_protection=<policy>; recovery_window=<duration>; cost_owner=<name>; approver=<name>`

## Machine-readable answer template

Copy this block, replace every placeholder, and return it as the owner decision
record. Do not omit unanswered lines; use `PENDING(owner=<name>,deadline=<phase/date>,constraint=<text>)`.

```text
PRD0-Q001: option=<A|B|C>; roles=<comma-list>; approver=<name>
PRD0-Q002: option=<A|B>; api=<responsibilities>; core=<responsibilities>; media=<responsibilities>; migration=<responsibilities>; maintenance=<responsibilities>; approver=<name>
PRD0-Q003: option=<A|B|C>; tenants=<n>; users=<n>; peak_rps=<n>; websockets=<n>; queue_jobs_per_min=<map>; media_concurrency=<n>; upload_p95_mib=<n>; upload_max_mib=<n>; growth_12m=<factor>; approver=<name>
PRD0-Q004: option=<A|B|C>; sources=<comma-list|NONE>; downtime_budget=<duration>; retain_source=<duration>; data_owner=<name>
PRD0-Q005: option=<A|B|C>; projects=<env:name map>; billing_owner=<name>; org_policy_owner=<name>
PRD0-Q006: option=<A|B|C>; primary_region=<region>; dr_region=<region|NONE>; residency_constraint=<text>; approver=<name>
PRD0-Q007: rto=<duration>; rpo=<duration>; pitr=<duration>; backup_retention=<duration>; restore_drill=<frequency>; cross_region=<YES|NO>; approver=<name>
PRD0-Q008: option=<A|B|C>; prod_provider=<name>; local_provider=<name>; test_provider=<name>; bucket_region=<region>; approver=<name>
PRD0-Q009: option=<A|B|C|D>; supported_clients=<list>; transition_window=<duration>; retirement_approval=<name|PENDING>
PRD0-Q010: option=<A|B|C>; exceptions=<queue-list|NONE>; approver=<name>
PRD0-Q011: option=<A|B|C>; dismissal_owner=<role>; media_owner=<role>; branding_owner=<role>; approver=<name>
PRD0-Q012: option=<A|B|C>; queue_instance=<class>; realtime_instance=<class|SAME>; region=<region>; approver=<name>
PRD0-Q013: option=<A|B|C>; http_behavior=<text>; websocket_behavior=<text>; reconnect_budget=<duration>; approver=<name>
PRD0-Q014: api_pool=<n>; core_pool=<n>; media_pool=<n>; migration_pool=<n>; ops_reserve=<n>; max_total=<n>; approver=<name>
PRD0-Q015: api=min:<n>,max:<n>,concurrency:<n>; core=min:<n>,max:<n>,concurrency:<n>; media=min:<n>,max:<n>,concurrency:<n>; approver=<name>
PRD0-Q016: option=<A|B|C|D>; lag_target=<duration>; scale_up_limit=<n>; scale_down_drain=<duration>; approver=<name>
PRD0-Q017: option=<A|B|C>; critical_queues=<list>; retry_max_age=<duration>; reconcile=<frequency>; replay_approvers=<names>
PRD0-Q018: option=<A|B>; identities=<role:account-name map>; security_approver=<name>
PRD0-Q019: option=<A|B|C>; signer=<account>; allowed_buckets=<list>; max_ttl=<duration>; approver=<name>
PRD0-Q020: option=<A|B|C>; cadence=<duration>; overlap=<duration>; emergency_owner=<name>; release_owner=<name>
PRD0-Q021: option=<A|B|C>; envelope_version=<name>; key_families=<list>; rotation_cadence=<duration>; security_approver=<name>
PRD0-Q022: prod_origins=<comma-list>; staging_origins=<comma-list>; credentials=<YES|NO>; websocket=<YES|NO>; storage_direct=<YES|NO>; approver=<name>
PRD0-Q023: option=<A|B|C>; api_domain=<fqdn>; ingress=<setting>; cloud_armor=<YES|NO>; trusted_proxies=<policy>; approver=<name>
PRD0-Q024: option=<A|B|C>; api_required=<list>; core_required=<list>; media_required=<list>; public_health=<policy>; approver=<name>
PRD0-Q025: api_availability=<percent>; api_p95=<duration>; queue_lag=<map>; media_completion=<duration>; paging=<schedule/owner>; log_retention=<duration>; monthly_budget=<amount/currency>; approver=<name>
PRD0-Q026: option=<A|B>; sequence=<ordered-list>; migration_approver=<name>; rollback_authority=<name>
PRD0-Q027: option=<A|B|C>; allowed_differences=<list|NONE>; soak=<duration>; canary_steps=<list>; approver=<name>
PRD0-Q028: option=<A|B>; node_version=<exact policy>; firebase_version=<exact policy>; approver=<name>
PRD0-Q029: option=<A|B|C>; allowed_audience=<group|NONE>; risk_acceptor=<name|NONE>
PRD0-Q030: option=<A|B|C>; root_policy=<text>; public_health_fields=<list>; compatibility_window=<duration>; approver=<name>
PRD0-Q031: option=<A|B|C|D>; endpoint_or_policy=<text>; allowed_types=<list|NONE>; max_bytes=<n|NONE>; approver=<name>
PRD0-Q032: image=<mime-list>; video=<mime-list>; document=<mime-list>; detected_policy=<text>; compatibility=<text>; approver=<name>
PRD0-Q033: option=<A|B|C|D>; formats=<policy-map>; mismatch=<reject|quarantine|other>; approver=<name>
PRD0-Q034: provider=<name|NONE>; placement=<sync|async|hybrid>; outage_policy=<text>; quarantine=<text>; retention=<duration>; cost_owner=<name>; security_approver=<name>
PRD0-Q035: option=<A|B|C|D>; multipurpose=<policy>; backfill=<text|N/A>; approver=<name>
PRD0-Q036: authority=<FILE|RELATION|POLICY_SERVICE|HYBRID>; rules=<text>; owner=<name>; approver=<name>
PRD0-Q037: periods=<feature:duration_or_class map>; deletion_after_expiry=<policy>; owner=<name>; approver=<name>
PRD0-Q038: admissions_retention=<duration>; hold_authority=<name>; release_authority=<name>; precedence=<text>; approver=<name>
PRD0-Q039: option=<A|B|C>; enable_approvers=<names>; canary=<text>; recovery=<text>; kill_switch_owner=<name>
PRD0-Q040: producer=<name>; reviewer=<name>; cadence=<duration>; report_retention=<duration>; escalation=<text>; approver=<name>
PRD0-Q041: option=<A|B|C|D>; allowlist=<policy>; compatibility_window=<duration|NONE>; legacy_owner=<name>; approver=<name>
PRD0-Q042: managed=<policy>; external_https=<policy>; provider_url=<policy>; unsafe=<policy>; null=<policy>; approver=<name>
PRD0-Q043: route_limits=<map>; edge_max=<n>; instance_memory=<n>; upload_concurrency=<n>; rate_limits=<map>; direct_put_threshold=<n>; approver=<name>
PRD0-Q044: option=<A|B|C>; source_buckets=<list|NONE>; source_object_count=<n>; provider_url_count=<n>; data_owner=<name>; approver=<name>
PRD0-Q045: mode=<MIGRATION|N/A_WITH_EVIDENCE>; read_only=<duration|N/A>; delta=<policy|N/A>; cutback_authority=<name|N/A>; approver=<name>
PRD0-Q046: mode=<FULL|SAMPLED|OTHER|N/A_WITH_EVIDENCE>; sample=<text|N/A>; mismatch=<text|N/A>; approver=<name>
PRD0-Q047: buckets=<purpose:name map>; region=<region>; public_policy=<text>; cors=<policy>; signer=<identity>; iac_owner=<name>; approver=<name>
PRD0-Q048: versioning=<policy>; lifecycle=<policy>; deletion_protection=<policy>; recovery_window=<duration>; cost_owner=<name>; approver=<name>
```
