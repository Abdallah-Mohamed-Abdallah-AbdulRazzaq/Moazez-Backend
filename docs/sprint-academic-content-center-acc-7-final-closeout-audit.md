# Academic Content Center ACC-7 — final closeout audit candidate

## Authority and decision boundary

Authoritative fetched `origin/main` and clean starting HEAD: `ed1ab3d0ef1c1c70d49984dceeb80519b4cb243a`, trusted repository `Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend`. Primary worktree was clean; task branch, remote branch, active PR and target worktree collisions were absent. Task directory is `E:\Work and Projects\Moazez\Back-end\Backend-ACC-7F`, branch `agent/acc-7f-security-scale-regression-closeout`. Before editing, ahead/behind=0/0, tracked/untracked=0/0, WORKTREE_CLEAN=YES. Historical worktrees are preserved.

This document was created before production source changes. Classifications below describe the starting source and remain unchanged after remediation. Candidate verification results are recorded separately. ACC-7A through ACC-7E remain CLOSED/PASS. ACC-7F is ACTIVE, ACC-8 is NOT_STARTED. Merge and deployment are not authorized.

| Slice | PR | Authoritative merge |
| --- | --- | --- |
| ACC-7A persistence | #165 | `49c859ee7c002063c6d1df00df914754f035e644` |
| ACC-7B intent and freeze | #166 | `2ed8b7f3d93bf66f1047bd646381f88d924d7382` |
| ACC-7C audience and snapshot | #167 | `d89cc72f9c0dd2e2098fa0ec67fd0b4eb8d6370b` |
| ACC-7D runtime and recovery | #168 | `93de30e36531710eb459299a6390a5155fb3cefd` |
| ACC-7E HTTP and security | #169 | `ed1ab3d0ef1c1c70d49984dceeb80519b4cb243a` |
| ACC-7F final candidate | Pending Draft PR | Pending governed merge |

## Source-first acceptance matrix

Each gate is classified once. Evidence keys resolve under `src/modules/academics/academic-content/` unless specified:

- **P**: publication policy/repository/use cases; publication-foundation and publication-intent integration, publication policy/use-case units.
- **S**: revision audience resolver/shared matcher/snapshot repository; revision audience and snapshot repository units, publication-snapshot integration.
- **R**: lifecycle/runtime repositories, worker, queue/reconciliation services; publication-runtime unit/integration and PRD3-G03 recovery.
- **H**: controller/DTO/presenters and `test/security/tenancy.academic-content-management-http.spec.ts` (43 exact routes).
- **T**: explicit management scope, parent-first locked publication writes, composite FKs; foundation/intent/snapshot/runtime integration and targeting security.
- **G**: migration manifest/governance, PRD3-G01/G02/G03 scripts, runtime context/role/probe/BullMQ suites.
- **A**: ACC-1 through ACC-6 source families, existing ACC unit/security/integration suites; canonical universal regression and exact-head CI.

| Gate | Initial source and committed evidence | Classification | Candidate verification |
| --- | --- | --- | --- |
| PUBLICATION_MODEL | P: tenant-bearing Publication and recipient/attribution tables, custom SQL constraints | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| PUBLICATION_STATUS | P/R: SCHEDULED/PUBLISHED/EXPIRED/CANCELLED vocabulary and lifecycle tests | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| PUBLICATION_IDEMPOTENCY | P: School/client key and logical timing fingerprint, same/different request and cross-content races | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| REVISION_FREEZE | P/S: exact approved or newly captured Revision V2, frozen targets and metadata | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| PUBLICATION_READINESS | P/H: separate publication readiness and external type/audience/term/assets checks | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| AUDIENCE_PREVIEW | P/H: aggregate current ACC-2 resolver, no historical recipient dependency | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| SCHEDULE_NOW | P/H: persisted SCHEDULED intent, post-commit queue ensure | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| SCHEDULE_FUTURE | P/R: due-time authority and deterministic delayed jobs | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| UNSCHEDULE | P: locks Content then Publication, restores frozen source status and retains history | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| PUBLISH_WORKER | S/R: worker delegates to atomic snapshot primitive and ensures expiry after commit | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| PUBLICATION_RECOVERY | R: bounded persisted discovery, deterministic ensure, terminal no-resurrection | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| VISIBLE_FROM | P/R: lower bound visibility helper and runtime tests | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| VISIBLE_UNTIL | P/R: upper bound, nullable end and missed-window behavior | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| AUTO_EXPIRY | R: exact scoped expiry transaction, counts/history preserved | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| PUBLISHED_CANCEL | R/H: scoped idempotent cancellation, frozen snapshot retained | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| AUDIENCE_SNAPSHOT | S: one RepeatableRead transaction, all-or-nothing recipients and audit | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| REVISION_TARGET_BASED_RESOLUTION | S: exact V2 scoped frozen targets, mutable target poison tests | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| STUDENT_SNAPSHOT | S: Enrollment identity, nullable recipient account | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| GUARDIAN_SNAPSHOT | S: Guardian+Student+Enrollment identity and nullable preferences | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| MULTI_CHILD_CONTEXT | S: shared guardian retains distinct child contexts | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| OVERLAP_DEDUPE | S: one recipient identity and sorted union of exact target IDs | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| RECIPIENT_TARGET_ATTRIBUTION | S/T: tenant-bearing exact revision target joins, affected-count guards | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| ZERO_RECIPIENT_PUBLICATION | S: coherent PUBLISHED state with zero rows/counts and one audit | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| LATE_ENROLLMENT_SNAPSHOT_IMMUTABLE | S: publish-time eligibility and post-commit immutable history | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| CURRENT_ACCESS_SEPARATE_FROM_SNAPSHOT | S/A: separate source contracts exist; simultaneous current-vs-historical mutation proof is absent | MISSING_VERIFICATION | PASS |
| TENANCY | T: wrong School/pair/key and poisoned payload rejection without writes | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| EXPLICIT_FINAL_WRITE_SCHOOL_IDENTITY | T: all publication final writes include explicit School identity; inventory below | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| RBAC | H: view/publish separation, manage does not publish, SchoolManagementOnly | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| RUNTIME_TOPOLOGY | R/G: Core 8, Media 1, Maintenance 9, API 0 consumers/0 schedules | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| QUEUE_RECOVERY | R/G: missing/finished/active deterministic jobs, Redis loss and reconciliation | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| MIGRATION_GOVERNANCE | G: immutable 22-migration manifest and frozen hashes | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| FRESH_DB_REPLAY | G: canonical replay/status/no-op/parity gates exist | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| PRISMA_VALIDATE | G: static schema validation gate | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| PRISMA_GENERATE | G: generated client gate | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| TYPECHECK | G: production no-emit/non-incremental compiler gate | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| BUILD | G: Nest build and bootstrap postbuild contract | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| NEW_LINT_ERRORS | G: changed-file ESLint and diff checks | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| UNIT_TESTS | A: canonical Academic Content source suites | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| SECURITY_TESTS | H/T/A: canonical management and targeting suites | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| INTEGRATION_TESTS | P/S/R/A: canonical PostgreSQL suites | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| ACC_1_TO_6_REGRESSION | A: core/files/authoring/Library/revisions/workflow/review/templates suites | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| FOREIGN_DOMAIN_REGRESSION | A/G: repository-standard universal regression plus CI parity | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS; broad source units/security, exact-head CI required |
| PUBLICATION_AUDIENCE_SCALE | S: unbounded Enrollment and Guardian reads, whole-audience context/recipient/join arrays despite chunked writes | REAL_DEFECT | PASS |
| DUPLICATE_PUBLISH_WORKER | S/R: parent lock and serialization retry exist; two concurrent workers with observed contention not directly proven | MISSING_VERIFICATION | PASS |
| LARGE_POSTGRESQL_AUDIENCE | S: 1003-context unit write test exists; actual page-boundary DB/query-count proof is absent | MISSING_VERIFICATION | PASS |
| SNAPSHOT_PRIVACY | S/R/H: aggregate audit/log allowlists, no recipient arrays or capability/storage fields | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| TRANSACTION_GOVERNANCE | S/G: DB and pure matching only, no external I/O or async fanout in snapshot transaction | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| TERMINAL_SHORT_CIRCUITS | S: ALREADY_PUBLISHED, terminal, not-due and missed-window branches precede audience resolution | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| SERIALIZATION_RETRY | S: fresh RepeatableRead callback, maximum three attempts | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |
| HTTP_TRANSPORT_FREEZE | H: strict UUID/ISO/body/query, omitted-vs-null preservation, safe response, no-store | COVERED_BY_EXISTING_SOURCE_AND_TESTS | PASS |

Initial totals: **50 gates: 46 COVERED_BY_EXISTING_SOURCE_AND_TESTS, 3 MISSING_VERIFICATION, 1 REAL_DEFECT**. No unexpected additional production defect identified in the initial audit. Stream-order, cursor/batch limits and retry restart verification belong to the scale-defect remediation; they do not change its initial classification.

## Exhaustive publication production-write inventory

A prior scoped read does not make a later unscoped write safe. There are **0 ID-only final writes** in the four audited repositories.

| Repository / operation | Final write identity and guard |
| --- | --- |
| publication.repository / schedule create | data schoolId/contentId/exact captured revisionId; School/clientRequestId uniqueness; locked source readiness |
| publication.repository / schedule Content update | composite id_schoolId; canonical locked Content, source eligibility and active Publication uniqueness |
| publication.repository / unschedule Publication updateMany | publicationId/schoolId/contentId/SCHEDULED; count=1; locked exact immutable revision |
| publication.repository / restore Content updateMany | contentId/schoolId/deletedAt=null/SCHEDULED; count=1 |
| publication.repository / schedule and unschedule audit helper | authoritative schoolId/organizationId/actorId/publicationId; bounded transition metadata in same transaction |
| snapshot.repository / recipient createMany | generated schoolId/publicationId/revisionId; authoritative job + locked Publication; count equals input |
| snapshot.repository / attribution createMany | generated schoolId/recipientId/revisionId/revisionTargetId; same transaction; count equals input |
| snapshot.repository / Publication updateMany | publicationId/schoolId/contentId/revisionId/SCHEDULED; count=1 |
| snapshot.repository / Content updateMany | contentId/schoolId/deletedAt=null/SCHEDULED; count=1 |
| snapshot.repository / publish audit create | authoritative schoolId/organizationId/publicationId; service actor; aggregate metadata only |
| lifecycle.repository / expire Publication updateMany | publicationId/schoolId/contentId/revisionId/exact prior status; count=1 |
| lifecycle.repository / expire Content updateMany | contentId/schoolId/deletedAt=null/exact prior status; count=1 |
| lifecycle.repository / expire audit create | authoritative schoolId/organizationId/publicationId; aggregate bounded transition data |
| lifecycle.repository / cancel Publication updateMany | publicationId/schoolId/contentId/revisionId/PUBLISHED; count=1 |
| lifecycle.repository / cancel Content updateMany | contentId/schoolId/deletedAt=null/PUBLISHED; count=1 |
| lifecycle.repository / cancel audit create | authoritative schoolId/organizationId/actorId/publicationId; aggregate transition data |
| runtime.repository | Read-only; exact job triple and bounded due discovery, no write sites |

Shared revision-capture writes remain governed by existing ACC-5/6/7B transaction and tenant tests. No lifecycle lock or final-write change is justified by this scale finding.

## Remediation and verification plan

Use a server-owned 500-row page bound and stable ascending primary-key cursors for publication-only Enrollment/Guardian reads. Preserve current unpaged ACC-2 preview methods. Load exact scoped Revision V2 once per transaction attempt, match each Enrollment page using set-wise subject qualification, and yield at most 500 contexts. Expand Guardian links incrementally without relying on a maximum number of guardians or enrollments. Snapshot persistence consumes each batch before requesting another, inserts recipients and flushes target attribution at at most 500 rows, retaining only bounded buffers and numeric counters. Preserve one RepeatableRead transaction and fresh cursor state on serialization retry.

Add a real bulk PostgreSQL audience crossing 500 enrollments and 500 Guardian links, instrumentation proving page-sized query growth and bounded writes; duplicate publish contention across two connections; and an explicit current ACC-2 versus unchanged historical snapshot comparison. Run all ACC and surrounding-domain regression, runtime/transaction governance, fresh migration replay/status/second-deploy/parity/custom-object checks, static gates and exact-head CI. Verification was pending when this source-first plan was recorded; completed local receipts are below.

## Implemented remediation

Production changes are limited to the three audience/snapshot infrastructure files. `ACADEMIC_CONTENT_PUBLICATION_AUDIENCE_PAGE_SIZE=500` is a server constant. Publication-only Enrollment and Guardian-link queries use ascending unique primary-key cursors, `skip=1` after the cursor, and `take=500`; the existing unpaged ACC-2 methods are unchanged. Only the bounded Guardian projection adds its infrastructure cursor ID.

`resolveBatches` loads the exact scoped Revision V2 and frozen targets once per transaction attempt. Each Enrollment page uses the shared matcher and set-wise subject qualification. Guardian links are paginated for that page's matched Students, then expanded one link at a time against at most 500 Enrollment contexts. Yielded Student plus Guardian contexts never exceed 500. Student identity remains Enrollment; Guardian identity remains Guardian+Student+Enrollment, with exact nullable accounts/preferences and sorted target unions.

Snapshot persistence consumes one batch, writes recipients, and flushes target joins before advancing the iterator. Recipient and target buffers are at most 500, inserts retain affected-count guards without `skipDuplicates`, and only numeric aggregate counts survive between batches. All reads/writes use the supplied TransactionClient in one RepeatableRead transaction. Each serialization retry starts a new callback, reloads the revision, and restarts cursors; maximum attempts remain three. Terminal/AlreadyPublished/future/missed-window branches precede audience discovery. No lifecycle, queue, permission, route, schema or migration change was made.

## Candidate verification receipts

| Gate | Observed candidate evidence |
| --- | --- |
| ACC unit regression | PASS: 32 suites, 387 tests, zero failures/skips |
| Focused resolver/snapshot units | PASS: 38 tests; exact cursors/projections, Guardian expansion into 500/500/2 contexts, mode/subject/overlap parity, stream-before-next-batch, bounded 1003 recipients/2006 joins, retry restart and cheap terminal branches |
| Prisma validate/generate | PASS, Prisma 6.19.3; production no-emit/non-incremental typecheck PASS |
| Changed TypeScript lint / whitespace | PASS, zero lint errors; `git diff --check` PASS |
| Migration governance | PASS: 22 active, zero new; 39 governance tests PASS; frozen schema and ACC-7A/7D checksums unchanged |
| Fresh disposable replay | PASS: all 22 applied; status current; second deployment reports no pending migrations; schema diff empty; seven validated custom checks and three required custom indexes present |
| PRD3-G02 real Redis recovery | PASS: run `9b9f4d9838394b06aa71`; observed Queue steady/recovered=40/40, governed steady/reserve/max=40/4/44, final Queue/Realtime application connections=0/0; cleanup containers/networks/processes/temp files=0/0/0/0 |
| Normal build | PASS: `npm run build` with task-local 6144 MB Node heap, including `REFERENCE_DATA_BOOTSTRAP_BUILD_CONTRACT=PASS`; no compiler errors or heap failure |
| G01/G02/G03 governance contracts | Initial combined run: 403/405 PASS, two missing-build failures; after the completed build, all 64 database-recovery tests PASS. All other governance suites passed, including transaction-pressure inventory validation with zero unknown/unresolved calls |
| Complete source unit regression | PASS: canonical `npm run test:regression` unit stage, 647 suites / 5523 tests; runtime context/role, database invariants, operational probes and BullMQ recovery/shutdown units included |
| PRD3-G03 real critical queue recovery | PASS: run `67d09cc96e6542a0acc3`, four suites / 26 tests; nine production recovery models/reconcilers/worker dispatches and nine Maintenance schedule registrations, missing/stale/active jobs, Redis loss/restart/reconciliation, poisoned jobs, terminal no-resurrection, upload lifecycle and bounded shutdown. Containers/networks/processes/temp files=0/0/0/0 |
| Full ACC PostgreSQL/security | 18 unchanged suites PASS plus the corrected snapshot suite's 41 tests PASS; all 19 canonical ACC suites / 484 cases covered. The final snapshot rerun passed all 41 tests, including the exact set of all 1010 Guardian+Student+Enrollment identities |
| Foreign-domain regression | PASS: full source units (647 suites / 5523 tests) plus ten canonical security batches (30 suites / 391 tests, zero failures). The local canonical full-run attempt was closed after its fixed build heap failed; complete security/E2E/integration coverage requires exact-head canonical CI |

A new race test's first run used the wrong argument shape for its deterministic expiry-job lookup; the test now uses the complete School/Content/Publication identity. Its next real PostgreSQL/Redis run passed the duplicate worker business and queue assertions. A subsequent full database run passed 443 tests but its 41-test snapshot suite could not initialize the local PostgreSQL connection during host memory pressure. The task database and Redis were removed; fresh verification was subsequently completed. The task build was stopped to reduce memory pressure; two database-recovery governance tests consequently lacked compiled policy. All other 403 governance tests, including the transaction-pressure source inventory, passed. These are verification execution issues; initial production-defect classifications above remain unchanged.

The next fresh full ACC run reached 483/484 PASS: one pre-existing parity assertion depended on globally sorted Guardian output. Infrastructure cursor order is not a public snapshot contract; the test-only collector now sorts Guardian business identities for exact context equality without changing or removing fields or recipients. The subsequent snapshot suite passed all 41 tests. Local fixture clients now use explicit IPv4 loopback. The normal build and all 64 database-recovery governance tests subsequently passed.

The broad regression launcher copies the current read-only working tree into each test container; tests do not run from the older source files inside its dependency image. Its fixed 2048 MB build subprocess emitted a heap-limit error even though the existing Nest launcher reported exit zero. This local runner diagnostic is recorded rather than treated as a clean build receipt; the independent normal build above passed with the larger task-local heap. No unrelated runner or runtime-policy source was modified.

## Quantitative publication proof

- Bulk fixture: 505 eligible Enrollments, 505 Student recipients, 1010 Guardian child contexts, 1515 unique identity fingerprints, and 1515 exact frozen-target joins. One publish audit; Content/Publication both PUBLISHED.
- Enrollment query results: `[500, 5]`; Guardian-link query results: `[500, 500, 0, 10]` (four queries, three nonempty pages, one exhaustion sentinel). Six total audience page queries for 1515 recipients. No subject query is required for the SCHOOL target. Subject qualification on successive pages is separately proven by units.
- Recipient and attribution insert sizes: `[500, 500, 500, 5, 10]`. Maximum yielded contexts, recipient write rows and target write rows=500. The first Enrollment page's 1500 contexts are persisted before the second page is requested. No per-Student or per-recipient database operation.
- Duplicate actual publish workers use two PostgreSQL connections and one real BullMQ queue. `pg_stat_activity` and `pg_blocking_pids` observe the contender waiting on Content; recorded SQL preserves Content→Publication ordering. Exactly one Publication transition and one Content transition occur, one publish audit, four recipients/four joins, preserved publishedAt/counts on AlreadyPublished, and one logical deterministic expiry job after both post-commit ensures. No deadlock or partial snapshot.
- Current-vs-historical test publishes two Students/two Guardian contexts, then changes Enrollment eligibility and Guardian links/accounts/preferences in a separate committed transaction. Current ACC-2 resolution becomes zero Students/zero Guardians while all four historical recipient rows and their business fields remain unchanged. Cheap AlreadyPublished retry performs no Enrollment/Guardian discovery.
- Privacy checks prohibit recipient/Student/Guardian/Enrollment/account arrays and identities/fingerprints/storage/join capabilities in publish audits; worker log source emits bounded authoritative IDs and aggregate counts only.

## Frozen database, HTTP and runtime authority

Migration count=22, new migrations=0; schema unchanged. ACC-7A migration `20261002162000_academic_content_publication_foundation`, SHA256 `1a92eb757c3f0db5f88be874f25d757568dfad62a2ea35b770369cf9ae671d99`. ACC-7D migration `20261003045105_academic_content_publication_runtime_indexes`, SHA256 `7166010cd4d80776081544a3c70f5d1bf0fd6672ca93f2071b8bd1f075e0d2b4`. Aggregate chain SHA256 `c001189d53b431c6a227e43a79112a6e0511edf81f3f5d7ee3145662236c92f3`.

HTTP routes=43; Core consumers=8; Media consumers=1; Maintenance repeats=9; API consumers/schedules=0/0. Queue Redis steady/reserve/governed maximum=40/4/44. All remain frozen.

## Scope protection and remaining handoffs

NOTIFICATIONS, SIGNIFICANT_UPDATE_NOTIFICATIONS, SESSION_REMINDERS, APP_CONSUMPTION, TEACHER_APP, STUDENT_APP, PARENT_APP, ENGAGEMENT, ACKNOWLEDGEMENT, ANALYTICS and POST_PUBLICATION_EDITING remain NOT_STARTED; EXISTING_WORKFLOW_REPLACEMENT=NO. Permission catalog, queue topology, Terraform, IAM, environment, deployment workflows and schema are unchanged. PRODUCTION_MUTATION=NO. Only task-owned disposable fixtures may be created and cleaned.

DEVOPS_HANDOFF_REQUIRED=YES, PENDING_BEFORE_DEPLOYMENT: before deployment verify actual Queue Redis provider/service capacity for the Owner-approved application ceiling of 44 plus provider/system requirements. This deployment handoff does not block source work.

ACC_7F=PASS/READY_FOR_INDEPENDENT_REVIEW (local candidate; exact-head CI remains required before final candidate evidence). ACC_7=IN_PROGRESS/PENDING_ACC_7F_MERGE_AND_EXACT_MAIN_CI. ACC_8_ENTRY_READY=PENDING_FINAL_ACC_7F_MERGE_AND_EXACT_MAIN_CI. Draft PR is a candidate; final ACC-7 closure requires governed ACC-7F merge and successful exact-main CI.

## Cleanup and final candidate CI boundary

Native disposable database and task Redis remaining=0/0. PRD3-G02 and G03 each report containers/networks/processes/temporary files=0/0/0/0. The local canonical attempt used suffix `mus9x8vx-nqg-cedd22`; after recording its actual unit/security receipts, its runner, child processes, PostgreSQL/Redis/MinIO containers, network, temporary image and output directory were removed. Inspection reports containers/networks/children/output files=0/0/0/0. Unrelated developer resources and historical worktrees are preserved. Task CLI logs/helper files are removed after their receipts are captured.

The local canonical attempt is not claimed as a complete local full-repository PASS: its fixed 2048 MB build heap failed, and the normal build was independently verified at 6144 MB. No unrelated regression-runner source was changed. Final candidate evidence must bind the pushed branch HEAD to completed successful canonical CI, every required job/check-run PASS, execution parity PASS with missing/duplicate/unexpected=0/0/0, and cleanup PASS. Those exact-head receipts belong in the Draft PR and final response after CI completes. ACC-7 final closure still requires governed merge and exact-main CI.
