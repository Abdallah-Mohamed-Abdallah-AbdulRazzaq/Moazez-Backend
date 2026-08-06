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
`2026-08-06T10:30:34+03:00` for PRD3-G03. The Phase 0B
document-control values above remain the historical 2026-07-27 closeout
record.

## Authority statement

Abdallah approved the ten Batch A answers recorded below in the named product,
architecture, security, operations, and release capacities. Those answers are
architectural and product constraints for later gated implementation; they are
not evidence of current implementation.

At that closeout every other owner question was explicitly pending. On
2026-08-04 Abdallah additionally approved Q003, Q006, Q014, and Q015 for the
provisional Phase 3 database baseline. On 2026-08-06 Abdallah approved Q012 and
Q013 for the split Redis topology and outage policy and Q017 option A for the
critical-queue persisted-truth recovery policy. Every question not named
in the current approved set below remains pending. A pending disposition does
not select its recommended default, cannot unblock its dependent phase, and
authorizes no implementation or cloud provisioning through silence.

## Post-merge closeout note

PR #46 merged the ten approved answers, and those answers remain binding. The
other 38 answers were pending at that historical closeout. The seven Phase 3
approvals reduce the current pending set to 31 without changing the PR #46
evidence. Silence selects no recommendation. Authoritative Phase 0B post-merge
evidence remains in `07-phase-0b-post-merge-closeout.md`.

## All-question disposition register

Each row is the sole disposition entry for that question.

| Question | Status | Approved answer or pending disposition |
| --- | --- | --- |
| PRD0-Q001 | APPROVED | `PRD0-Q001: option=B; roles=API,Core Worker,Media Worker,Migration Job,Maintenance Scheduler; approver=Abdallah` |
| PRD0-Q002 | APPROVED | `PRD0-Q002: option=A; api=HTTP and WebSocket entrypoints, controllers, authentication, authorization, realtime connections, queue producers, and synchronous Learning Media completion until the separately approved Phase 6 transition; core=communication notification generation, communication push delivery, school email delivery, import validation, dismissal-expiry consumption, and branding-cleanup consumption; media=Learning Media cleanup consumption and future asynchronous verification only after Phase 6 approval; migration=governed prisma migrate deploy only with no runtime DDL; maintenance=singular registration or invocation of dismissal expiry, Learning Media discovery, branding reconciliation, and future schedules; approver=Abdallah` |
| PRD0-Q003 | APPROVED | `PRD0-Q003: option=B; tenants=10; users=25000; peak_rps=200; websockets=5000; queue_jobs_per_min={communication-notifications:60,communication-notification-push:1000,school-email-delivery:300,files-imports:10,dismissal-request-expiry:5,learning-media-cleanup:50,settings-branding-logo-cleanup:10}; media_concurrency=4; upload_p95_mib=25; upload_max_mib=200; growth_12m=3x; approver=Abdallah` |
| PRD0-Q004 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 3/4/5A design closeout,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q005 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 4/5A/8 provisioning,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q006 | APPROVED | `PRD0-Q006: option=A; primary_region=me-central2; dr_region=NONE; residency_constraint=Initial production data and primary managed services remain in Saudi Arabia; cross-region DR requires separate residency approval; approver=Abdallah` |
| PRD0-Q007 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 3 implementation,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q008 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5A,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q009 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 6,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q010 | APPROVED | `PRD0-Q010: option=A; exceptions=NONE; approver=Abdallah` |
| PRD0-Q011 | APPROVED | `PRD0-Q011: option=A; dismissal_owner=Maintenance Scheduler invokes idempotent command and Core Worker consumes; media_owner=Maintenance Scheduler invokes discovery and Media Worker consumes cleanup; branding_owner=Maintenance Scheduler invokes reconciliation and Core Worker consumes cleanup; approver=Abdallah` |
| PRD0-Q012 | APPROVED | `PRD0-Q012: queue_redis=independent instance for BullMQ queues, producers, consumers, repeat registrations, locks, delayed and stalled state; realtime_redis=independent instance for Socket.IO publisher/subscriber, worker emitter, presence, typing, and ephemeral coordination; logical database indices on one endpoint are not isolation; queue_connection_budget=40; realtime_connection_budget=30; approver=Abdallah; approved_at=2026-08-06T05:56:00+03:00` |
| PRD0-Q013 | APPROVED | `PRD0-Q013: staging_and_production_local_realtime_fallback=NONE; outage_policy=liveness healthy, dependency readiness failed, new realtime sockets rejected, queue producers fail within bounded time, existing processes remain and recover in place; approver=Abdallah; approved_at=2026-08-06T05:56:00+03:00` |
| PRD0-Q014 | APPROVED | `PRD0-Q014: api_pool=5; core_pool=6; media_pool=3; migration_pool=2; ops_reserve=10; max_total=100; approver=Abdallah` |
| PRD0-Q015 | APPROVED | `PRD0-Q015: api=min:1,max:4,concurrency:40; core=min:1,max:2,concurrency:1 per assigned consumer; media=min:1,max:2,concurrency:1; approver=Abdallah` |
| PRD0-Q016 | PENDING | `PENDING(owner=Abdallah,deadline=before final Phase 3 and Phase 6 capacity acceptance,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q017 | APPROVED | `PRD0-Q017: option=A; critical_queues=communication-notifications,communication-notification-push,school-email-delivery,files-imports,dismissal-request-expiry,learning-media-cleanup,settings-branding-logo-cleanup; source_of_truth=PostgreSQL domain rows,object-storage existence or absence,approved deterministic job builders,current application policy; redis_copy=NONE; manual_replay=requires Abdallah as Operations and Release Owner plus audit and tenant/source scope and exclusion of known-success side effects; push_replay=non-SENT attempts only; email_outcome_unknown=never automatic; approver=Abdallah; approval_capacities=Operations Owner,Release Owner,Architecture Owner; approved_at=2026-08-06T10:30:34+03:00`                              |
| PRD0-Q018 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 4,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q019 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 4/5A,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q020 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 4,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q021 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 4,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q022 | APPROVED | `PRD0-Q022: prod_origins=https://schools.moazez.cloud,https://admin.moazez.cloud; staging_origins=https://staging-schools.moazez.cloud,https://staging-admin.moazez.cloud; credentials=YES; websocket=YES; storage_direct=YES; approver=Abdallah` |
| PRD0-Q023 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 7/8,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q024 | APPROVED | `PRD0-Q024: option=A; api_required=validated configuration, HTTP startup, Prisma, queue-producer Redis, object storage for enabled file contracts, and realtime Redis when realtime is enabled; core_required=validated configuration, Prisma, queue Redis, and all assigned consumers; media_required=validated configuration, Prisma, queue Redis, object storage, temporary-disk capability, and verified ffprobe runtime; public_health=minimal status, version, and timestamp only, with protected role-specific startup, liveness, and readiness endpoints; approver=Abdallah` |
| PRD0-Q025 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 7,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q026 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 8,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
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
| PRD0-Q041 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5B direct-URL remediation,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q042 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5A inventory and Phase 5B remediation,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q043 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5B load acceptance,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q044 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5A object-migration branch selection,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q045 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5A object migration or clean-start evidence closeout,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q046 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5A object-migration verification,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q047 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5A provisioning,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q048 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5A infrastructure and Phase 5B retention alignment,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |

## Disposition totals

| Disposition | Count |
| --- | ---: |
| Total | 48 |
| APPROVED | 17 |
| PENDING | 31 |
| Omitted | 0 |
| Duplicated | 0 |

The current approved IDs are exactly PRD0-Q001, PRD0-Q002, PRD0-Q003,
PRD0-Q006, PRD0-Q010, PRD0-Q011, PRD0-Q012, PRD0-Q013, PRD0-Q014,
PRD0-Q015, PRD0-Q017, PRD0-Q022,
PRD0-Q024, PRD0-Q028, PRD0-Q029, PRD0-Q030, and PRD0-Q032. The Phase 0B
snapshot was exactly 10 approved and 38 pending; the Phase 3 amendments add
Q003, Q006, Q012, Q013, Q014, Q015, and Q017. All other PRD0-Q001 through
PRD0-Q048 entries are explicitly pending as shown.

## Scope and non-authorization

This register records owner authority and pending constraints only. It does not
claim that accepted behavior is implemented, that a pending recommendation was
selected, that Phase 0B is complete, or that Phase 1 may start. It authorizes
no source, schema, migration, dependency, Docker, CI, database, Redis, object
storage, or cloud change.
