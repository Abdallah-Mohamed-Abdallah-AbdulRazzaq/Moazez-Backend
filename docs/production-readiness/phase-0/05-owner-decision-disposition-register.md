# Production Readiness Phase 0B — Owner Decision Disposition Register

## Document control

| Field | Value |
| --- | --- |
| Task ID | `PRODUCTION-READINESS-0B-A` |
| Branch | `docs/production-readiness-0b-decisions` |
| Baseline | `52b27e5025659be162350c6ad846554f74ceec6c` |
| Owner | Abdallah |
| Approval date | 2026-07-27 |
| Timezone | Africa/Cairo |
| Approval capacities | product, architecture, security, operations, release |
| Scope | Owner dispositions and architecture-governance lock only; no implementation or cloud provisioning |
| Current status | `PHASE_0B_OWNER_DISPOSITIONS_RECORDED` |

Current amendments: four Phase 3 owner approvals were added on 2026-08-04
(Africa/Cairo) under PRD3-G01-A. Abdallah additionally approved PRD0-Q012 and
PRD0-Q013 at `2026-08-06T05:56:00+03:00` for PRD3-G02 and PRD0-Q017 at
`2026-08-06T10:30:34+03:00` for PRD3-G03. Abdallah approved PRD0-Q004 option A
as approver and data authority at `2026-08-07T04:46:00+03:00` for PRD3-G05
and PRD0-Q026 option A at `2026-08-07T00:22:00+03:00` for PRD3-G04.
Abdallah approved PRD0-Q005, PRD0-Q008, PRD0-Q018, PRD0-Q019, and
PRD0-Q044–PRD0-Q048 at `2026-08-09T15:20:43+03:00` for the Phase 4/5A cloud
and GCS governance boundary. The Phase 0B document-control values above remain
the historical 2026-07-27 closeout record. On 2026-08-11 (Africa/Cairo),
Abdallah approved PRD0-Q041 and PRD0-Q042 for the final storage application
cutover source candidate. This amendment does not rewrite the historical Phase
0B facts or authorize production data, uploads, traffic, or launch. On
2026-08-12 (Africa/Cairo), Abdallah approved PRD0-Q007 for the production
recovery objectives and policy recorded below. The exact approval clock time
was not recorded. This recovery-policy approval is not implementation or
operational recovery evidence.

## Authority statement

Abdallah approved the ten Batch A answers recorded below in the named product,
architecture, security, operations, and release capacities. Those answers are
architectural and product constraints for later gated implementation; they are
not evidence of current implementation.

At that closeout every other owner question was explicitly pending. On
2026-08-04 Abdallah additionally approved Q003, Q006, Q014, and Q015 for the
provisional Phase 3 database baseline. On 2026-08-06 Abdallah approved Q012 and
Q013 for the split Redis topology and outage policy and Q017 option A for the
critical-queue persisted-truth recovery policy. On 2026-08-07 Abdallah
approved Q004 option A, `CLEAN_START`, on the explicit owner/data-authority
zero-source attestation and mandatory reopen-on-discovery rule, and approved
Q026 option A for the governed Migration Job. On 2026-08-09 Abdallah approved
the separate production/non-production project boundary, GCS production with
MinIO local/test, per-role service accounts, dedicated per-project signers,
the zero-object clean-start branch, private bucket topology, and the seven-day
GCS recovery baseline recorded in Q005, Q008, Q018, Q019, and Q044–Q048.
On 2026-08-11 Abdallah approved Q041 option D and the Q042 managed/read-only
compatibility policy exactly as recorded in the register below.
On 2026-08-12 Abdallah approved Q007 with RTO 30 minutes, RPO 15 minutes,
PITR retention 14 days, backup retention 30 days, quarterly restore drills,
and no cross-region DR authorization. The exact approval time was not recorded.
Every question not named in the current approved set below remains pending.
A pending disposition does not select its recommended default, cannot unblock
its dependent phase, and authorizes no implementation or cloud provisioning
through silence.

## Post-merge closeout note

PR #46 merged the ten approved answers, and those answers remain binding. The
other 38 answers were pending at that historical closeout. The nine
post-Phase-0B approvals through 2026-08-07, the nine 2026-08-09 approvals, and
the two 2026-08-11 storage-policy approvals reduce the current pending set to
18. The one 2026-08-12 recovery-policy approval reduces the current pending
set to 17 without changing the PR #46 evidence.
Silence selects no recommendation.
Authoritative Phase 0B post-merge evidence remains in
`07-phase-0b-post-merge-closeout.md`.

## All-question disposition register

Each row is the sole disposition entry for that question.

| Question | Status | Approved answer or pending disposition |
| --- | --- | --- |
| PRD0-Q001 | APPROVED | `PRD0-Q001: option=B; roles=API,Core Worker,Media Worker,Migration Job,Maintenance Scheduler; approver=Abdallah` |
| PRD0-Q002 | APPROVED | `PRD0-Q002: option=A; api=HTTP and WebSocket entrypoints, controllers, authentication, authorization, realtime connections, queue producers, and synchronous Learning Media completion until the separately approved Phase 6 transition; core=communication notification generation, communication push delivery, school email delivery, import validation, dismissal-expiry consumption, and branding-cleanup consumption; media=Learning Media cleanup consumption and future asynchronous verification only after Phase 6 approval; migration=governed prisma migrate deploy only with no runtime DDL; maintenance=singular registration or invocation of dismissal expiry, Learning Media discovery, branding reconciliation, and future schedules; approver=Abdallah` |
| PRD0-Q003 | APPROVED | `PRD0-Q003: option=B; tenants=10; users=25000; peak_rps=200; websockets=5000; queue_jobs_per_min={communication-notifications:60,communication-notification-push:1000,school-email-delivery:300,files-imports:10,dismissal-request-expiry:5,learning-media-cleanup:50,settings-branding-logo-cleanup:10}; media_concurrency=4; upload_p95_mib=25; upload_max_mib=200; growth_12m=3x; approver=Abdallah` |
| PRD0-Q004 | APPROVED | `PRD0-Q004: option=A; production_data_branch=CLEAN_START; persisted_postgresql_migration=N/A_WITH_EVIDENCE; object_migration=N/A_WITH_EVIDENCE_FOR_CURRENT_PRODUCTION_SOURCE; redis_migration=PROHIBITED_AS_COPY_SOURCE; redis_recovery=drain/reconcile/re-enqueue from persisted truth and rebuild ephemeral realtime state; authoritative_postgresql_source_count=0; authoritative_object_source_count=0; evidence_classification=OWNER_DATA_AUTHORITY_ATTESTATION; reopen_on_data_discovery=YES; approver=Abdallah; data_authority=Abdallah; approved_at=2026-08-07T04:46:00+03:00` |
| PRD0-Q005 | APPROVED | `PRD0-Q005: option=A; projects=production:moazez-production,staging:moazez-nonprod-91001421934,cloud_test:moazez-nonprod-91001421934,development:LOCAL_ONLY,ci:LOCAL_MINIO,dr:NONE; billing_owner=Abdallah; org_policy_owner=Abdallah` |
| PRD0-Q006 | APPROVED | `PRD0-Q006: option=A; primary_region=me-central2; dr_region=NONE; residency_constraint=Initial production data and primary managed services remain in Saudi Arabia; cross-region DR requires separate residency approval; approver=Abdallah` |
| PRD0-Q007 | APPROVED | `PRD0-Q007: rto=30m; rpo=15m; pitr=14d; backup_retention=30d; restore_drill=quarterly; cross_region=NO; approver=Abdallah; approval_date=2026-08-12; timezone=Africa/Cairo` |
| PRD0-Q008 | APPROVED | `PRD0-Q008: option=A; prod_provider=GCS; local_provider=MinIO; test_provider=MinIO; bucket_region=me-central2; approver=Abdallah` |
| PRD0-Q009 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 6,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q010 | APPROVED | `PRD0-Q010: option=A; exceptions=NONE; approver=Abdallah` |
| PRD0-Q011 | APPROVED | `PRD0-Q011: option=A; dismissal_owner=Maintenance Scheduler invokes idempotent command and Core Worker consumes; media_owner=Maintenance Scheduler invokes discovery and Media Worker consumes cleanup; branding_owner=Maintenance Scheduler invokes reconciliation and Core Worker consumes cleanup; approver=Abdallah` |
| PRD0-Q012 | APPROVED | `PRD0-Q012: queue_redis=independent instance for BullMQ queues, producers, consumers, repeat registrations, locks, delayed and stalled state; realtime_redis=independent instance for Socket.IO publisher/subscriber, worker emitter, presence, typing, and ephemeral coordination; logical database indices on one endpoint are not isolation; queue_connection_budget=40; realtime_connection_budget=30; approver=Abdallah; approved_at=2026-08-06T05:56:00+03:00` |
| PRD0-Q013 | APPROVED | `PRD0-Q013: staging_and_production_local_realtime_fallback=NONE; outage_policy=liveness healthy, dependency readiness failed, new realtime sockets rejected, queue producers fail within bounded time, existing processes remain and recover in place; approver=Abdallah; approved_at=2026-08-06T05:56:00+03:00` |
| PRD0-Q014 | APPROVED | `PRD0-Q014: api_pool=5; core_pool=6; media_pool=3; migration_pool=2; ops_reserve=10; max_total=100; approver=Abdallah` |
| PRD0-Q015 | APPROVED | `PRD0-Q015: api=min:1,max:4,concurrency:40; core=min:1,max:2,concurrency:1 per assigned consumer; media=min:1,max:2,concurrency:1; approver=Abdallah` |
| PRD0-Q016 | PENDING | `PENDING(owner=Abdallah,deadline=before final Phase 3 and Phase 6 capacity acceptance,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q017 | APPROVED | `PRD0-Q017: option=A; critical_queues=communication-notifications,communication-notification-push,school-email-delivery,files-imports,dismissal-request-expiry,learning-media-cleanup,settings-branding-logo-cleanup; source_of_truth=PostgreSQL domain rows,object-storage existence or absence,approved deterministic job builders,current application policy; redis_copy=NONE; manual_replay=requires Abdallah as Operations and Release Owner plus audit and tenant/source scope and exclusion of known-success side effects; push_replay=non-SENT attempts only; email_outcome_unknown=never automatic; approver=Abdallah; approval_capacities=Operations Owner,Release Owner,Architecture Owner; approved_at=2026-08-06T10:30:34+03:00`                              |
| PRD0-Q018 | APPROVED | `PRD0-Q018: option=A; identities=api:moazez-api-runtime,core:moazez-core-worker,media:moazez-media-worker,migration:moazez-migration-job,maintenance:moazez-maintenance-scheduler,deployer:moazez-iac-deployer,signed_url:moazez-gcs-signer; security_approver=Abdallah` |
| PRD0-Q019 | APPROVED | `PRD0-Q019: option=A; signer=prod:moazez-gcs-signer@moazez-production.iam.gserviceaccount.com,staging:moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com; allowed_buckets=moazez-production-91001421934-private,moazez-production-91001421934-published,moazez-nonprod-91001421934-private,moazez-nonprod-91001421934-published; max_ttl=1h; approver=Abdallah` |
| PRD0-Q020 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 4,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q021 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 4,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q022 | APPROVED | `PRD0-Q022: prod_origins=https://schools.moazez.cloud,https://admin.moazez.cloud; staging_origins=https://staging-schools.moazez.cloud,https://staging-admin.moazez.cloud; credentials=YES; websocket=YES; storage_direct=YES; approver=Abdallah` |
| PRD0-Q023 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 7/8,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q024 | APPROVED | `PRD0-Q024: option=A; api_required=validated configuration, HTTP startup, Prisma, queue-producer Redis, object storage for enabled file contracts, and realtime Redis when realtime is enabled; core_required=validated configuration, Prisma, queue Redis, and all assigned consumers; media_required=validated configuration, Prisma, queue Redis, object storage, temporary-disk capability, and verified ffprobe runtime; public_health=minimal status, version, and timestamp only, with protected role-specific startup, liveness, and readiness endpoints; approver=Abdallah` |
| PRD0-Q025 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 7,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q026 | APPROVED | `PRD0-Q026: option=A; approver=Abdallah; migration_approver=Abdallah; rollback_authority=Abdallah; approval_timestamp=2026-08-07T00:22:00+03:00` |
| PRD0-Q027 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 8,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q028 | APPROVED | `PRD0-Q028: option=A; node_version=Node 22 LTS with the latest approved security patch at the Phase 1 implementation baseline and an immutable image digest in Docker and CI; firebase_version=Firebase Admin 14.x locked by package-lock and verified through startup and push-provider smoke tests; approver=Abdallah` |
| PRD0-Q029 | APPROVED | `PRD0-Q029: option=A; allowed_audience=NONE; risk_acceptor=NONE` |
| PRD0-Q030 | APPROVED | `PRD0-Q030: option=A; root_policy=minimal service identity and version response with no development greeting or internal topology; public_health_fields=status,version,timestamp; compatibility_window=one release cycle; approver=Abdallah` |
| PRD0-Q031 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5B,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q032 | APPROVED | `PRD0-Q032: image=image/jpeg,image/png; video=video/mp4,video/webm; document=application/pdf; detected_policy=the declared MIME and detected content must both match the selected proof type, with missing, ambiguous, malformed, or cross-type content rejected before submission; compatibility=preserve the existing non-NONE file requirement and organization, school, uploader, private-visibility, authorization, and download controls, with no silent MIME remapping; approver=Abdallah` |
| PRD0-Q033 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5B policy implementation,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q034 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5B implementation or approved constrained deferral,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q035 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5B design,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q036 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5B reference-lifecycle design,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q037 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5B retention design,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q038 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5B retention and hold approval,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q039 | PENDING | `PENDING(owner=Abdallah,deadline=before any Phase 5B destructive-cleanup decision,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q040 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5B report-only reconciliation,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q041 | APPROVED | `PRD0-Q041: option=D; allowlist=HTTPS external URLs only, with all direct GCS/Google Cloud Storage/MinIO/S3-compatible provider URLs forbidden for new writes; compatibility_window=NONE; legacy_owner=Abdallah; approver=Abdallah` |
| PRD0-Q042 | APPROVED | `PRD0-Q042: managed=ALLOW managed File-backed branding for new writes and reads; external_https=READ_ONLY compatibility only where an already-persisted safe HTTPS value exists, with no new legacy URL writes; provider_url=BLOCK_NEW and treat any discovered legacy provider URL as a cutover blocker requiring explicit inventory/review; unsafe=REJECT; null=ALLOW; approver=Abdallah` |
| PRD0-Q043 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5B load acceptance,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q044 | APPROVED | `PRD0-Q044: option=A; source_buckets=NONE; source_object_count=0; provider_url_count=0; data_owner=Abdallah; approver=Abdallah` |
| PRD0-Q045 | APPROVED | `PRD0-Q045: mode=N/A_WITH_EVIDENCE; read_only=N/A; delta=N/A; cutback_authority=N/A; approver=Abdallah` |
| PRD0-Q046 | APPROVED | `PRD0-Q046: mode=N/A_WITH_EVIDENCE; sample=N/A; mismatch=N/A; approver=Abdallah` |
| PRD0-Q047 | APPROVED | `PRD0-Q047: buckets=prod_private:moazez-production-91001421934-private,prod_published:moazez-production-91001421934-published,staging_private:moazez-nonprod-91001421934-private,staging_published:moazez-nonprod-91001421934-published; region=me-central2; public_policy=ALL_BUCKETS_PRIVATE+UBLA_ENABLED+PAP_ENFORCED+NO_ANONYMOUS_ACCESS; cors=Q022_EXACT_HTTPS_ORIGINS_ONLY; signer=moazez-gcs-signer-per-project; iac_owner=Abdallah; approver=Abdallah; learning_media=PRIVATE_BUCKET_PREFIXES(staging,final)` |
| PRD0-Q048 | APPROVED | `PRD0-Q048: versioning=ENABLED_FOR_ALL_BUCKETS; lifecycle=NO_AUTOMATIC_TRANSITION_OR_DELETION_RULES_DURING_PHASE_5A; deletion_protection=SOFT_DELETE_7_DAYS+TERRAFORM_PREVENT_DESTROY+BUCKET_LOCK_DISABLED; recovery_window=7_DAYS_SOFT_DELETE; cost_owner=Abdallah; approver=Abdallah` |

## Disposition totals

| Disposition | Count |
| --- | ---: |
| Total | 48 |
| APPROVED | 31 |
| PENDING | 17 |
| Omitted | 0 |
| Duplicated | 0 |

The current approved IDs are exactly PRD0-Q001, PRD0-Q002, PRD0-Q003,
PRD0-Q004, PRD0-Q005, PRD0-Q006, PRD0-Q007, PRD0-Q008, PRD0-Q010, PRD0-Q011, PRD0-Q012,
PRD0-Q013, PRD0-Q014, PRD0-Q015, PRD0-Q017, PRD0-Q018, PRD0-Q019, PRD0-Q022,
PRD0-Q024, PRD0-Q026, PRD0-Q028, PRD0-Q029, PRD0-Q030, PRD0-Q032, PRD0-Q041,
PRD0-Q042, PRD0-Q044, PRD0-Q045, PRD0-Q046, PRD0-Q047, and PRD0-Q048. The Phase 0B snapshot was
exactly 10 approved and 38 pending; later amendments through 2026-08-07 added
Q003, Q004, Q006, Q012, Q013, Q014, Q015, Q017, and Q026, and the 2026-08-09
amendment added Q005, Q008, Q018, Q019, and Q044–Q048. The 2026-08-11
amendment added Q041 and Q042. The 2026-08-12 amendment added Q007. All other PRD0-Q001
through PRD0-Q048 entries are explicitly pending as shown.

## Scope and non-authorization

This register records owner authority and pending constraints. It does not
claim that accepted behavior is implemented or that a pending recommendation
was selected. The storage approvals unblock only their gated design and
implementation work; every cloud mutation still requires reviewed IaC,
least-privilege IAM, phase evidence, and the applicable release gate. This
documentation amendment performs no source, schema, migration, dependency,
Docker, CI, database, Redis, object-storage, or cloud mutation. Q007 approves
recovery objectives and policy only; it does not prove or complete Cloud SQL,
backups, PITR, restore drills, RTO, RPO, failover, or production launch.
