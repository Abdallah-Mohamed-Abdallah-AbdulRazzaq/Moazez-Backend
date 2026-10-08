# ACC-11A — Engagement and acknowledgement domain foundation

## Authority and source audit

Exact base: `0439dea9dbcf774887f57710fcf78453bbe15053`.
Fetched `origin/main` and the clean manager worktree matched that authority.
Dedicated branch: `agent/acc-11a-engagement-acknowledgement-foundation`.
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

## Migration and verification evidence

One newly timestamped migration, generated by Prisma from the exact base
schema to the candidate, is `20261008054427_academic_content_engagement_acknowledgement_foundation`.
The preferred create-only command rejected the non-interactive terminal before
creating/applying this migration. The permitted equivalent
`prisma migrate diff --from-schema-datamodel <exact-base-schema> --to-schema-datamodel prisma/schema.prisma --script`
generated its incremental SQL. The three inventoried CHECKs were added and all
SQL reviewed before first application. No drift, checksum mismatch, reset
request, failed migration or P3009 occurred. No migration history was rewritten.

The manifest now contains 27 migrations. All 26 existing entries/checksums are
unchanged. Manifest hashes:

- New migration SHA-256: `17b4453c08dabb2e7a22d7fce38964ccdca47f0e948172654c34ba42f605788f`.
- Schema SHA-256: `6aca9529df146f77659be565efd01b7e37c2339d86d3fdbaa62f8c5e60ebdc47`.
- Aggregate chain SHA-256: `d23ca83644729668b1dde7de657167b4e892217447bc22e638940ce324d3eb41`.

| Gate / evidence group | Actual local result |
| --- | --- |
| Full relevant unit group | PASS: 118 suites / 1,342 cases / 0 skips; all ACC, Student/Parent/Teacher ACC, Communication, IAM ACC permissions, School scope, File inventory and runtime contracts |
| New foundation PostgreSQL group | PASS: 1 suite / 21 cases / 0 skips, final attempt 3 |
| Recipient and notification integration | PASS: 6 suites / 289 cases / 0 skips |
| Publication snapshots/runtime, File lifetime, ACC-10F final regression | PASS: 4 suites / 174 cases / 0 skips |
| Existing Student/Parent/File security and app closeout | PASS: 6 suites / 144 cases / 0 skips |
| Recipient query plans, deep-link navigation and reference-data bootstrap | PASS: 3 suites / 49 cases / 0 skips |
| Migration governance | PASS: 2 Node TAP files / 39 cases / 0 skips |
| Runtime governance | PASS: 1 Node TAP file / 11 cases / 0 skips |
| Fresh empty owned PostgreSQL | PASS: all 27 deployed, seed passed, migration status current |
| Second deploy | PASS: no pending migration and migration-row count unchanged |
| Schema parity | PASS: read-only Prisma database-to-schema diff exit 0, No difference detected |
| Prisma format / validate / generate | PASS, worktree-owned client generated from the final schema |
| Production TypeScript / build | PASS: build-config noEmit compile and npm build |
| Changed TypeScript lint | Clean PASS for all 17 files: exact-base 0 errors/0 warnings; candidate 0/0; introduced 0/0, removed 0 |
| Changed tests and transitive TypeScript diagnostics | Clean PASS: exact-base 0, candidate 0, introduced 0, removed 0 |
| Route identity | PASS: exact base/candidate Student, Parent and Teacher route arrays identical |
| Scope inventory | 22 authorized files, one new migration, no CI router/classifier, signer, access-service, permission/grant or runtime/cloud change |
| Staged diff check | PASS_WITH_DOCUMENTED_OWNER_EXCEPTION: raw check exits 2 solely for migration.sql:169, new blank line at EOF; explicit ACC-11A-only non-blocking exception approved, SQL bytes/checksum preserved |

Total local Jest evidence: 138 suites / 2,019 cases / 0 skips. Separately, three
Node TAP files passed 50 cases / 0 skips. Every selected canonical runner group
reported PASS and owned disposable fixture cleanup PASS. Databases were local
owned PostgreSQL fixtures; no shared, staging or production data was mutated.

### Security and contract matrix

| Required invariant | Evidence |
| --- | --- |
| Five valid/invalid event shapes; client authority rejection | Pure policy unit suite and three migrated CHECK catalog/direct rejection assertions |
| Actor-scoped retry uniqueness and contradictory reuse | Two independent PostgreSQL clients race one key: one insert, one P2002; stored identity and pure fingerprint/retry tests |
| Student versus Parent; same Parent/different children | Pure current-context validation plus independent actor keys, conflicting reused Parent request and separate child requests |
| Parent-account acknowledgement natural identity | Concurrent inserts; alternate Guardian and changed enrollment still collide; other child/account succeed |
| Independent successor confirmation/history | Separate successor row; retained predecessor; current detail uses successor link ID; StudentGuardian removal preserves history |
| Publication/revision/content and tenant integrity | Actual rejection for foreign School, content, publication, revision, Student, Enrollment, child enrollment and Guardian; 16 validated Restrict FKs |
| Exact immutable File/link membership | Existing foreign File/RevisionAsset, predecessor/unrelated revision, foreign/other link and nonexistent reference rejections; retained RevisionAsset deletion rejected |
| Tenant model registration and fencing | Registration tests and real schoolScope read/updateMany/deleteMany with a foreign request School affect zero owned rows |
| Guardian acknowledgement eligibility | Pure policy tests: Parent owned context, current canonical publication, immutable opted-in Guardian Note; wrong actor/child/type, superseded/cancelled/expired/malformed reject |
| Additive detail contract | Both presenters preserve label/url/sortOrder and feed shape; both existing PostgreSQL recipient suites and new exact-current/successor link assertions |
| Existing authorization/file/fresh-clock boundaries | Existing security/recipient/File/ACC-10F regression groups pass; no engagement events created by authorized detail GETs |

No new mutation HTTP endpoint exists; this evidence does not claim HTTP
engagement/acknowledgement authorization or a production transactional writer
has been tested. Final live relationship/target/File checks and race-safe
operational writes remain later slices.

Raw reports, runner plans/stages/logs and source hashes are retained locally
under ignored `coverage/acc11a`. `precommit-final-audit.json` binds the initially reviewed
tree to file SHA-256/Git blob identities, gate results, route identity
and all historical migration checksums. Before the commit, local runner headers
contain the base commit as their checkout identity while executing the changed
worktree; they are local uncommitted-tree evidence, not exact-head GitHub CI.
The earlier working-tree diff check excluded the untracked new migration. The
subsequent authoritative staged check caught its sole EOF blank-line diagnostic.
`staged-diff-stop.json` supersedes the earlier diff PASS implication. Editing
the migration after its first disposable application would violate migration
governance; the SQL and manifest checksum are preserved. The owner explicitly
approved this sole whitespace diagnostic as non-blocking for ACC-11A. This does
not waive migration immutability, database integrity or any mandatory CI gate.
All required local tests, migration replay/no-op/parity, Prisma validation and
generation, clean changed-file lint/typecheck and build gates passed. The
approved workflow proceeds with one normal commit/push and exactly one Draft
PR; any additional diagnostic or checksum discrepancy requires a stop.
Exact-head CI will be a separate post-push verification with canonical artifacts.

```ini
ACC_11A_WHITESPACE_EXCEPTION=APPROVED_WITH_CONDITIONS
DIFF_CHECK=PASS_WITH_DOCUMENTED_OWNER_WHITESPACE_EXCEPTION
RAW_STAGED_DIFF_CHECK_EXIT=2
SOLE_DIAGNOSTIC=migration.sql:169_new_blank_line_at_EOF
MIGRATION_BYTES=UNCHANGED
MIGRATION_CHECKSUM=UNCHANGED
MIGRATION_MANIFEST_BYTES=UNCHANGED
COMMIT_PUSH_DRAFT_PR=AUTHORIZED
MERGE=NOT_AUTHORIZED
```

Initial local attempts are retained: the new integration fixture first had
TypeScript construction errors and the new join fixture used a shortened ISO
string rejected by the frozen decoder. Both were corrected within these new
tests; the full unit rerun and final foundation rerun passed. An initial lint
attempt exhausted Node's default heap; the final unfiltered lint comparison
used a bounded 6 GiB local Node heap and passed. No rule/configuration change,
suppression or inherited lint/type exception was used.

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
