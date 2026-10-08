# ACC-11A — Engagement and acknowledgement domain foundation

## Authority and source audit

Exact base: `0439dea9dbcf774887f57710fcf78453bbe15053`.
Fetched `origin/main` and the clean manager worktree matched that authority.
Replacement branch: `agent/acc-11a-governed-ci-recovery`.
The new task worktree started clean at that exact base with zero divergence.
Owner changes and previous worktrees/evidence were preserved.

The accepted ACC-8, ACC-9 and ACC-10 final audits were read as historical
closeout evidence; the current source and this explicit ACC-11A authorization
govern this candidate. ACC-11B through ACC-11E are not implemented here.

| Baseline observation | Exact-source finding |
| --- | --- |
| ACC engagement/acknowledgement persistence | Both missing in base `prisma/schema.prisma` |
| RevisionLink identity | UUID `AcademicContentRevisionLink.id` exists; recipient SQL/types/presenters omit it |
| Guardian acknowledgement requirement | Immutable Revision V2 `typeSpecificSnapshot.state.requiresAcknowledgement`, decoded by `academic-content-revision-snapshot.ts`; mutable authoring detail also exists |
| School analytics permission | `academics.academic_content.analytics.view` exists in IAM permission catalog |
| Teacher own analytics permission | `academics.academic_content.analytics.own.view` absent; candidate contract only, catalog/grants/enforcement deferred to ACC-11D |
| Migration baseline | Manifest and active chain contain 26 directories; latest `20261006155322_file_live_reference_integrity` |

No expected baseline observation was contradicted.

## Ownership and existing access contracts

| Authority | Current implementation and boundary |
| --- | --- |
| Content authoring, Revision, Publication | Academic Content Core and its repositories; immutable published Revision V2 is recipient payload truth |
| Canonical visible publication | `academic-content-recipient-read.repository.ts`: current relationship and immutable target match; order `visible_from DESC, id DESC`; one active publication invariant; final detail repeats exact publication/revision and all live predicates |
| Visibility | Active live School/Organization/User/Student and enrollment context; live content not deleted; PUBLISHED, publishedAt <= now, visibleFrom <= now, now < visibleUntil when finite |
| Student identity | `StudentAppAccessService` resolves authenticated linked Student and active owned Enrollment; Core recipient SQL repeats current account and enrollment predicates |
| Parent identity | `ParentAppAccessService` resolves current School Guardians owned by authenticated Parent account, current StudentGuardian links and active child enrollments; Core repeats those predicates |
| Immutable targeting | RevisionTarget scope and current positive SubjectAllocation matching the same target/year/term/grade/subject; mutable authoring targets do not grant access |
| Historical audience | Publication-time notification/history context only; never current access authority |
| Files | Exact current RevisionAsset membership; live PRIVATE positive-size same-School File, recipient file policy, supported preview and bounded signer |
| Notifications | Communication owns readAt, delivery, preference and push state; notification read is not an ACC view or acknowledgement |
| Tenant isolation | RequestContext, guards, repository constraints and Prisma `.scoped` schoolScope extension; raw SQL must explicitly constrain School |

`Student.userId` is a mutable optional global User link. Guardian has a mutable
optional global `userId`, with no uniqueness constraint requiring one Guardian
per Parent account. StudentGuardian is the current School/child/Guardian link.
Enrollment captures the child and academic placement. None of those mutable
relationships is a historical action identity or immutable audience ACL.

The ACC-10F default fresh-clock correction is unchanged: Student and Parent
default detail reads sample time again at the final sensitive read. Explicit
as-of clocks remain fixed. Routes, permissions, signers and notification
composition are unchanged.

### Publication and concurrency precedent

Existing publication intent uses a School/client-request unique key and a
canonical request fingerprint. The repository locks Content then exact
Publication, checks persisted fingerprint and handles a uniqueness loser by
reading authoritative persisted truth. Queue/provider effects occur after
commit. ACC-11A adopts the identity/fingerprint distinction without introducing
an operational writer or claiming final live authorization/concurrency is
implemented for engagement or acknowledgement.

### Rate and abuse controls observed in source

Historical `SECURITY_MODEL.md` mentions Redis per-route limiting. A current
source/dependency search found no implemented Redis request limiter or Nest
throttler wiring. The exception filter can format HTTP 429; this is not a rate
limiter. Login validates credentials/account status and logs failures; it does
not implement request throttling or lockout. Existing bounded query limits,
page sizes, file limits and unique request identities constrain specific work
but are not frequency controls. Future engagement mutation slices must assess
abuse controls explicitly; ACC-11A introduces no endpoint, limiter or Redis
capacity/configuration change.

## Frozen measurement contract

| Event | Meaning and exact reference |
| --- | --- |
| CONTENT_VIEWED | Explicit authenticated client-reported viewing action against the exact authorized current publication/revision; no File/RevisionLink reference |
| FILE_PREVIEWED | Explicit client-reported preview interaction with exact `(schoolId, revisionId, fileId)` RevisionAsset membership; no link reference |
| FILE_DOWNLOADED | Explicit client-reported download interaction with that exact RevisionAsset; no link reference; does not prove byte transfer completion |
| LINK_CLICKED | Explicit client-reported click identified by the exact immutable RevisionLink ID and its School/revision; client URL is not identity |
| JOIN_LINK_CLICKED | Explicit client-reported join-link click for an eligible immutable Online Session revision; no File/RevisionLink reference; does not prove attendance |

Acknowledgement is separate authenticated business truth, never an
`ACKNOWLEDGED` engagement event. GET feed/detail is not automatically recorded
as a view. Issuing a signed capability is neither a completed download nor a
preview observation. Join clicks do not count as attendance. There is no
retroactive inferred event, mass pending acknowledgement row, client timestamp
authority or notification-read substitution.

## Identity, idempotency and Parent policy

School, actor User/kind, child Student, Enrollment, resolved Guardian, canonical
Publication, Revision and content chain must come from server authorization.
The client may propose only event type, request UUID and relevant File/link ID.
Those resource IDs must match server-resolved exact revision membership.
`academic-content-engagement.policy.ts` rejects extra command properties and
invalid/contradictory reference shapes. Facts inputs are internal server facts,
not request DTOs and not proof that a live query or transaction has occurred.

Engagement logical identity is `(schoolId, actorUserId, clientRequestId)`,
enforced by a PostgreSQL unique constraint. The versioned SHA-256 fingerprint
normalizes UUIDs and explicitly includes content/publication/revision, actor,
child/enrollment/Guardian and event/File/link identities. It excludes request
UUID and execution time, and treats omitted/null optional references equally.
Identical retries compare identical scope/key/fingerprint; contradictory reuse
returns CONFLICT. A Parent reusing a request UUID for another child conflicts;
independent child actions require independent request UUIDs.

Acknowledgement natural identity is
`(schoolId, publicationId, studentId, actorUserId)`. The authenticated Parent
account is the actor identity, not the Guardian record. A different Guardian
record or changed enrollment cannot manufacture a second confirmation by the
same Parent for the same child/publication. Different Parent accounts and
different children remain independent. Every successor publication requires
its own acknowledgement. The selected live Guardian ID and Enrollment are
retained as action context. Future resolution must choose a deterministic
currently owned Guardian when multiple current records qualify.

Historical actor/context foreign keys intentionally do not bind User to the
mutable Student.userId or Guardian.userId, or reference the removable
StudentGuardian link. Relationship removal/account unlinking must not erase
history. Current ownership, actual UserType and eligibility must be verified
again in the future operational transaction; stored history grants no ACL.

## Persistence and relationship rationale

Both new models use UUIDs, mapped plural tables, tenant School identity and
restrictive foreign keys. Engagement `createdAt` and acknowledgement
`acknowledgedAt`/`createdAt` default to database time. Future business writers
must not accept client overrides. They follow existing immutable Revision/
Audience history conventions: no soft-delete flag, status, TTL or cleanup job.

| Integrity / index | Rationale |
| --- | --- |
| Publication `(id, schoolId, revisionId)` FK | Reuses existing unique key, rejects foreign tenant and publication/revision contradiction |
| Revision `(id, schoolId, academicContentId)` FK | Reuses existing unique key, ties that exact publication revision to exact content |
| Enrollment `(id, schoolId, studentId)` FK | New supporting unique key adds exact child integrity beyond existing Enrollment tenant key |
| Student and Guardian tenant FKs | Same-School identity; actor User FK retains global authenticated account identity |
| Event RevisionAsset `(schoolId, revisionId, fileId)` FK | Reuses existing unique membership; rejects arbitrary, foreign and predecessor-only files without adding a new physical File FK |
| Event RevisionLink `(id, schoolId, revisionId)` FK | New supporting unique key proves exact immutable link membership |
| Logical unique keys | Database arbitration of event retries and Parent/child/publication confirmation identity |
| School/content/publication indexes | Bounded future history selection; no speculative analytics materialization |
| FK indexes | Cover publication, revision, actor, Student, Enrollment, Guardian and optional asset/link relations for joins and restrictive lifecycle checks |

The existing 22 physical File FKs / 21 retention consumers remain unchanged.
RevisionAsset already retains File and has the live-File trigger. An event
retains that RevisionAsset through a restrictive FK, preserving the accepted
transitive File lifetime without changing the Files-owned inventory/helper or
adding redundant File references. Real PostgreSQL tests verify retained File
truth and rejection of deletion of the referenced RevisionAsset.

Custom CHECK constraints enforce event-type reference combinations, Parent
versus Student Guardian shape and lowercase 64-hex request fingerprints.
Prisma cannot represent these row predicates; their migration and direct
database tests are recorded in the custom SQL inventory. Cross-row eligibility
is pure policy plus future live authorization, not an unimplemented database
trigger claim. Both tenant models are registered in SCHOOL_SCOPED_MODELS;
neither is excluded nor soft-deleted.

All new action relations use RESTRICT for deletion and identity updates.
They do not authorize cascading acknowledgement deletion, mutable account
history rewriting, automatic retention or anonymization. Before later
production readiness, the owner must approve retention/deletion/privacy/hold
policy and its effects on User, Guardian, Student, Enrollment, Publication,
Revision, asset and File lifetime. This is a deferred readiness dependency;
there is no unresolved decision required to build this non-operational
foundation.

## Additive immutable link projection

Only authorized recipient detail SQL adds `revisionLinkId: link.id`, selected
from the exact currently published Revision in the same final authorization
statement. Core query types, both App DTOs and both whitelist presenters include
the field. Label, URL, sortOrder, routes and other payload fields retain their
existing semantics. Feed responses remain unchanged. Mutable authoring link
identity and arbitrary client URL cannot substitute for the immutable ID;
successor links have distinct IDs even when label and URL are identical.

## Migration and ACC-11A-R1 recovery evidence

### Original candidate retained

Original PR #194 is BLOCKED/SUPERSEDED_CANDIDATE for this recovery, still Draft
and unmerged. Original head: `97cc2ed231b92021369fa835a6d3a8b2c917f22c`. Exact-head CI run
`37736391983`, attempt 1, failed at mandatory `candidate-diff-check` with
`migration.sql:169: new blank line at EOF`. Its canonical preflight evidence
contains only that failed stage, exit 2. The required aggregate blocked all 26
regression shards; 968 test files were discovered and none executed.

The prior local whitespace exception did not waive CI. The original SQL had
already been applied to disposable PostgreSQL, so editing its EOF would violate
migration immutability. The owner explicitly authorized a separate clean
replacement from the exact main, without importing that migration or rewriting
Git history. PR #194, its source branch and applied SQL remain unchanged and
are not automatically closed. Original migration SHA-256 remains
`17b4453c08dabb2e7a22d7fce38964ccdca47f0e948172654c34ba42f605788f`.

### Replacement identity and source parity

All 20 approved non-migration/non-manifest files were transferred from the
original head by exact Git blob identity. The 18 source/schema/test files remain
identical. Only this audit and the custom SQL inventory need recovery evidence
and new migration references. No domain design, contract, source or test
implementation was repeated or broadened.

New migration: `20261008064934_academic_content_engagement_acknowledgement_foundation`. Prisma generated the incremental SQL with
`migrate diff --from-schema-datamodel <exact-base-schema> --to-schema-datamodel prisma/schema.prisma --script`,
the governed equivalent command supported by MIGRATION_GOVERNANCE.md. The
non-interactive create-only limitation was already established on the original
candidate; this recovery did not rerun it or manually apply SQL. All generated
statements plus the three approved PostgreSQL CHECK predicates have identical
SQL tokens to the reviewed original. EOF formatting was completed before any
application, using one final newline and no trailing blank line.

Manifest contains 27 migrations; entries/checksums 1-26 are unchanged.

- New migration SHA-256: `bca21aa56272e03fd69965e8595962bfd690777d14a3eb870482ddb7aab6e094`.
- Schema SHA-256: `6aca9529df146f77659be565efd01b7e37c2339d86d3fdbaa62f8c5e60ebdc47`.
- Aggregate chain SHA-256: `23393516d29c480f649d73c0c38cc34042636da5e64999d54781baea8dbbe8f9`.
- Manifest file SHA-256: `bf63667d6e0d4899bc03f64634a73f29c48de3dac4ffcbbe5de46a443aeaadd8`.

### Required pre-application review

All 22 intended files must be staged and the unmodified staged whitespace gate
must genuinely pass before any replay. Generated SQL, custom CHECKs, 16
restrictive FKs and supporting unique indexes are reviewed before first
application. The new migration is newly created and has never been applied.
The replay uses a uniquely named, newly created owned PostgreSQL container with
an empty public schema, not a prior candidate database. Historical migrations
are compared byte-for-byte against exact main. The staged index and SQL hash
are sealed before the first replay; no SQL edit is allowed afterward.

### Replacement verification

All replacement local gates below genuinely passed. Required staged whitespace
validation passed before the first application; no diagnostic and no exception.
All 22 intended files were staged, the 26 historical migration files were
byte-for-byte identical to exact main, and SQL token parity with the reviewed
original passed. No CI gate, Git attribute or whitespace rule was changed.

The first replacement replay began at `2026-10-08T06:50:50.124Z` in newly allocated
owned database `ci_136d1e28903e2f`, container `moazez-ci-pg-migration-governan-1-136d1e28903e2f`. Its
public table count was verified as 0 immediately before deploy. It is distinct
from the original candidate's disposable database and never applied that SQL.
The full 27-migration chain deployed successfully; seed and final status passed.
The second deploy was a no-op with unchanged migration-row count. Read-only
Prisma database-to-schema diff returned exit 0, No difference detected.
The SQL checksum still matches the pre-application seal; no post-application
edit occurred.

| Replacement gate | Actual local outcome |
| --- | --- |
| unit | PASS: 118 suites / 1342 cases / 0 skips; owned cleanup PASS |
| focus | PASS: 1 suites / 21 cases / 0 skips; owned cleanup PASS |
| integration | PASS: 6 suites / 289 cases / 0 skips; owned cleanup PASS |
| dbregression | PASS: 4 suites / 174 cases / 0 skips; owned cleanup PASS |
| security | PASS: 6 suites / 144 cases / 0 skips; owned cleanup PASS |
| scale | PASS: 3 suites / 49 cases / 0 skips; owned cleanup PASS |
| Migration governance TAP | PASS: 39 cases / 0 skips; owned cleanup PASS |
| Runtime governance TAP | PASS: 11 cases / 0 skips |
| Manifest verification / migration governance | PASS: 27 migrations, historical 26 unchanged, rebaseline off |
| Prisma format / validate / generate | PASS; final formatted schema identical to approved original |
| Production TypeScript / build | PASS: build-config noEmit compile, npm build and bootstrap build contract |
| Changed TypeScript lint | Clean PASS: all 17 files; baseline 0 errors/0 warnings, candidate 0/0, new 0/0 |
| Changed tests/transitive type diagnostics | Clean PASS: baseline 0, candidate 0, new 0, removed 0 |
| Student/Parent/Teacher route inventory | PASS: exact base/candidate route arrays identical |
| Approved original source parity | PASS: all 18 source/schema/test Git blobs identical; only migration/manifest, inventory and audit evidence differ |

Total local Jest: 138 suites / 2,019 cases / 0 skips. Node TAP: 50 cases /
0 skips. Raw logs, plans, stage results, fresh-database identity, the
pre-application seal and final source hashes are retained under ignored
`coverage/acc11ar1`. Local runner commit headers identify the exact base while
executing the uncommitted replacement tree; these are not GitHub exact-head
reports. `precommit-final-audit.json` binds the reviewed files/index to their
SHA-256/Git blob identities and actual gate evidence before the single commit.
No original report substitutes for replacement execution. Exact-head GitHub
CI/run attempt and canonical artifacts are collected after push and reported
separately; no exact-head PASS is predicted in this source document.

`STAGED_DIFF_CHECK=PASS`; `CI_EXCEPTION_OR_BYPASS=NO`;
`ORIGINAL_MIGRATION_UNCHANGED=YES`; `PRODUCTION_MUTATION=NO`.

The pure unit and real PostgreSQL matrix remains the approved ACC-11A matrix:
event shapes and eligibility, actor request/retry uniqueness, Parent-child and
Parent-account acknowledgement independence, compound tenant/revision/file/link
integrity, validated CHECK/FK/index catalogs, tenant extension fencing,
successor history, current immutable link projection, no automatic GET events,
Student/Parent security, File lifetime, ACC-10F fresh-clock, publication/runtime,
query plans and notification regressions. No engagement/acknowledgement mutation
endpoint exists, so no HTTP authorization claim is made for those future APIs.

## Frozen scope and deferred operational work

New API routes=0; permissions/grants=0; queues=0; workers=0; consumers=0;
maintenance repeats=0. Existing runtime remains Core consumers=8, Media=1,
maintenance repeats=9, API consumers/repeats=0/0; Redis governance=40/4/44.
Student routes=105 (72 GET/33 non-GET), Parent=77 (65/12), Teacher=149 (79/70).
Migration artifact manifest is the sole authorized deployment-related change.

ACC-11B/11C own final live Student/Parent authorization, capability policy,
race-safe transactional event/acknowledgement writes, retry response handling,
mutation routes and abuse controls. ACC-11D owns Teacher own analytics catalog,
grant/enforcement and analytics endpoints. School analytics APIs and final
ACC-11 security/scale closeout remain later slices. Notifications, push,
frontend, workers, repeats, cloud resources, runtime deployment and ACC-12
are outside this candidate.

The handoff is exactly one normal feature commit and one Draft PR to main.
Exact-head CI/run attempt and canonical artifact outcomes are collected after
push and reported separately; no CI run identity is predicted in this source
document. Ready, merge, deployment and production mutation are not performed.
