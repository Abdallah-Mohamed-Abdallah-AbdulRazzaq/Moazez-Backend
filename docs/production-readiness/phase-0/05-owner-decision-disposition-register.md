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

## Authority statement

Abdallah approved the ten Batch A answers recorded below in the named product,
architecture, security, operations, and release capacities. Those answers are
architectural and product constraints for later gated implementation; they are
not evidence of current implementation.

Every other owner question remains explicitly pending. A pending disposition
does not select its recommended default, cannot unblock its dependent phase,
and authorizes no implementation or cloud provisioning through silence.

## Post-merge closeout note

PR #46 merged the ten approved answers, and those answers remain binding. The
other 38 answers remain pending and block only their dependent later phases.
Silence selects no recommendation. Authoritative post-merge evidence is in
`07-phase-0b-post-merge-closeout.md`.

## All-question disposition register

Each row is the sole disposition entry for that question.

| Question | Status | Approved answer or pending disposition |
| --- | --- | --- |
| PRD0-Q001 | APPROVED | `PRD0-Q001: option=B; roles=API,Core Worker,Media Worker,Migration Job,Maintenance Scheduler; approver=Abdallah` |
| PRD0-Q002 | APPROVED | `PRD0-Q002: option=A; api=HTTP and WebSocket entrypoints, controllers, authentication, authorization, realtime connections, queue producers, and synchronous Learning Media completion until the separately approved Phase 6 transition; core=communication notification generation, communication push delivery, school email delivery, import validation, dismissal-expiry consumption, and branding-cleanup consumption; media=Learning Media cleanup consumption and future asynchronous verification only after Phase 6 approval; migration=governed prisma migrate deploy only with no runtime DDL; maintenance=singular registration or invocation of dismissal expiry, Learning Media discovery, branding reconciliation, and future schedules; approver=Abdallah` |
| PRD0-Q003 | PENDING | `PENDING(owner=Abdallah,deadline=before final Phase 3 sizing and Phase 7/8 load-SLO-cost acceptance,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q004 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 3/4/5A design closeout,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q005 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 4/5A/8 provisioning,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q006 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 3,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q007 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 3 implementation,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q008 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 5A,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q009 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 6,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q010 | APPROVED | `PRD0-Q010: option=A; exceptions=NONE; approver=Abdallah` |
| PRD0-Q011 | APPROVED | `PRD0-Q011: option=A; dismissal_owner=Maintenance Scheduler invokes idempotent command and Core Worker consumes; media_owner=Maintenance Scheduler invokes discovery and Media Worker consumes cleanup; branding_owner=Maintenance Scheduler invokes reconciliation and Core Worker consumes cleanup; approver=Abdallah` |
| PRD0-Q012 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 3,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q013 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 3,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q014 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 3 load work,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q015 | PENDING | `PENDING(owner=Abdallah,deadline=before final Phase 3/6/8 capacity acceptance,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q016 | PENDING | `PENDING(owner=Abdallah,deadline=before final Phase 3 and Phase 6 capacity acceptance,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
| PRD0-Q017 | PENDING | `PENDING(owner=Abdallah,deadline=before Phase 3,constraint=All dependent phases remain blocked; the recommended default is not selected; silence authorizes no implementation or cloud provisioning)` |
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
| APPROVED | 10 |
| PENDING | 38 |
| Omitted | 0 |
| Duplicated | 0 |

The approved IDs are exactly PRD0-Q001, PRD0-Q002, PRD0-Q010, PRD0-Q011,
PRD0-Q022, PRD0-Q024, PRD0-Q028, PRD0-Q029, PRD0-Q030, and PRD0-Q032.
All other PRD0-Q001 through PRD0-Q048 entries are explicitly pending as shown.

## Scope and non-authorization

This register records owner authority and pending constraints only. It does not
claim that accepted behavior is implemented, that a pending recommendation was
selected, that Phase 0B is complete, or that Phase 1 may start. It authorizes
no source, schema, migration, dependency, Docker, CI, database, Redis, object
storage, or cloud change.
