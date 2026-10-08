# ACC-11D — Teacher-Owned Academic Content Analytics

## Delivery state and source authority

Implementation is complete in the isolated branch `agent/acc-11d-teacher-owned-analytics`, based on `c75bb21d114a6a01f17f90c72e0be706911d9ced`. PR #197 is merged at exactly this commit. Remote `main` was reverified at the same SHA during final validation. The manager checkout was not used for development.

Local evidence is retained under `coverage/acc11d` in the task worktree. This directory is ignored and is not a GitHub CI artifact. Local plans identify the accepted base while testing the uncommitted candidate. They must not be represented as Exact-Head CI. The owner approved the fresh ACC-11D inherited lint exception on 2026-10-09, exclusively for the two existing Teacher tests identified below. Commit, normal push, one Draft PR and actual Exact-Head CI are authorized after final verification. Their actual identities and outcomes will be recorded in the delivery evidence after this single feature commit; this precommit audit does not invent future CI results.

The sources reconciled include the accepted ACC-10 closeout, ACC-11A/R1 persistence, ACC-11B engagement and ACC-11C acknowledgement audits; Prisma persistence; canonical permission/role catalogs and reference-data application; Teacher access/context/allocation adapters; existing Teacher ownership/read/authoring/workflow policies; Core engagement, acknowledgement, publication and immutable revision repositories. Current project governance and ADRs were read before implementation.

## IAM and governed reference-data activation

Exactly one canonical permission is added: `academics.academic_content.analytics.own.view`. Academic Content permission definitions increase from six to seven. Teacher Academic Content grants are view, manage, publish and own analytics. `academics.academic_content.analytics.view` remains the separate management permission and is not granted to Teachers. Parent and Student still receive Academic Content view only. Dismissal Staff receives neither analytics grant. Existing management derivation is preserved.

The total canonical catalog changes from 242 to 243 permissions. Teacher grants change from 57 to 58. Total system-role grants change from 870 to 874: Teacher plus the three management roles whose canonical derivation already includes the catalog. Seven system roles remain. Related catalog, bootstrap and Teacher route sentinels are updated to these exact expectations. The G05 clean-start verifier changes only its two canonical seed counts, preserving its security, migration and clean-start assertions. CI routing, classification and workflows are unchanged.

`SECURITY_MODEL.md` has an older general statement that a new permission requires a migration. The current authoritative migration governance, AGENTS migration rules and Prisma seeding conventions separate schema DDL from reference-data seeds. ADR-0007's migration job executes neither seed nor runtime bootstrap. The accepted live reference-data workflow already versions these catalogs and applies them through the shared canonical authorization reference-data application. ACC-11D follows that workflow; there is no schema change and no permission DML migration.

DevOps must apply the canonical reference-data release through the existing approved reference-data bootstrap before activating analytics. The existing CLI entry is `npm run bootstrap:reference-data -- --execute --environment=staging` (with the production environment only under separate production authority). Existing runtime identity/environment/connection validation, transaction and user-mutation prohibitions remain intact. No staging or production bootstrap was executed. Local tests use only owned disposable databases. An installation without the new live grant fails closed; possession of the School analytics grant cannot substitute for own analytics.

## HTTP contract and route inventory

Exactly two GET routes are introduced:

| Route                                                                               | Required grants                              |
| ----------------------------------------------------------------------------------- | -------------------------------------------- |
| `/api/v1/teacher/academic-content/:contentId/analytics`                             | Academic Content view AND own analytics view |
| `/api/v1/teacher/academic-content/:contentId/publications/:publicationId/analytics` | Academic Content view AND own analytics view |

Both use `@RequiredPermissions` and independently enforce the Teacher actor in the application and database. No `SchoolManagementOnly` bypass is used. Real HTTP tests use JWT/session guards, scope resolution, permission guard and RequestContext. The existing exception filter is reused so failures and successful responses receive `Cache-Control: no-store, private, max-age=0`.

Strict UUID pipes validate both path IDs. The query DTO permits only `range=7d|30d|90d`, defaulting to `30d`; global whitelist/forbid behavior is exercised, and direct application calls also reject unknown keys or invalid range. Client School, Organization, Teacher, actor, Student, Guardian, Enrollment, recipient, permission, date and grouping filters are rejected. Repeated/array selectors are rejected. Each handler has its own unambiguous path and no catch-all route collision was introduced.

Teacher route inventory increases from 149 to 151, with Academic Content routes increasing from 37 to 39. All prior routes remain. Student remains 106 and Parent remains 80. The existing ACC-9 exported route/catalog sentinel is updated only for the new analytics controller/routes/grant. No School analytics, Student or Parent route is introduced.

## Ownership and final database authorization

`TeacherAppAccessService.assertCurrentTeacher()` resolves the server-owned Teacher identity, School, Organization, membership and current grant context. The aggregate never trusts scope from the request.

The existing `hasTeacherAcademicContentMutableOwnership` policy establishes the identity rule: exact creator plus at least one bound target, with every bound allocation belonging to that Teacher in the same School. Ordinary Teacher read access accepts one matching allocation and therefore cannot authorize analytics. Analytics faithfully translates the mutable identity rule into SQL and applies a conservative read-specific refinement: **all targets** must be bound CLASSROOM targets with exact allocation, Classroom and Subject attribution. Unbound, School-wide or partially foreign target sets deny current Content access. This avoids fetching target/event rows into the app and avoids a Core dependency on Teacher App domain code; it does not create an alternative creator or Teacher identity rule.

The single final parameterized statement checks:

- Nondeleted active Teacher User; nondeleted active School and Organization.
- Exact current active, nondeleted and nonended Teacher membership in the server-resolved School/Organization; nondeleted compatible role and both live permission grants.
- Nondeleted Content with exact Teacher creator and a nonempty fully owned current target set.
- Current TeacherSubjectAllocation identity, School, Classroom, Subject, Term and Academic Year; valid nondeleted School-consistent Classroom/Section/Grade/Stage and Subject relations; a positive nondeleted subject allocation for that Grade/Year/Term.
- Each included Publication has actually been published, references the exact same School/Content immutable Revision V2, and has a nonempty fully owned immutable target set with the same live relationship checks.
- Every event/acknowledgement joins the exact included Publication, Revision, Content and School.

The Content endpoint excludes a Publication with any unauthorized immutable target. If all Publications are excluded it returns authorized Content with zero included Publications and zero metrics. The exact Publication endpoint returns non-disclosing 404 for an unauthorized/unknown Publication; it never substitutes a successor. Invalid current Content ownership denies both endpoints. Historical audience snapshots and recipient context counts never authorize either endpoint.

The SQL applies creator, all-target and grant fences inside the aggregate statement, rather than relying on an earlier GET. Tests cover foreign creators, reassigned allocations, partial ownership, invalid relations, removed grants, inactive account/membership, suspended School/Organization and cross-School/Organization attribution.

## Measurement and response contract

The response contains authorized Content/Publication/Revision attribution, decimal-string included Publication count, effective UTC window, six metrics and fixed measurement definitions. Content-level `publicationId`/`revisionId` are null; the exact Publication response returns its immutable Revision ID. No individual recipient identity or timeline is returned.

All count fields use nonnegative decimal strings, including the ten event bins. A unit test verifies values beyond JavaScript's safe integer range are preserved without numeric conversion. Bins are ordered by the five accepted event types and Student then Parent, with explicit zeros.

| Metric                                  | Exact SQL unit                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `totalEventReports`                     | Number of durable event rows in the authorized complete Publication set and window, including repeat reports |
| `eventCountsByTypeAndActorKind`         | Independent `GROUP BY event_type, actor_kind`; exactly five types × two actors                               |
| `distinctStudentActorsEngaged`          | `COUNT(DISTINCT student_id)` over Student event rows across the entire included set                          |
| `distinctParentChildPairsEngaged`       | `COUNT(DISTINCT (actor_user_id, student_id))` over Parent event rows across the entire included set          |
| `acknowledgementRecords`                | Number of durable acknowledgement rows; per-Publication successor obligations remain separate                |
| `distinctAcknowledgingParentChildPairs` | `COUNT(DISTINCT (actor_user_id, student_id))` across the entire included set                                 |

Student identity is the persisted server-owned Student identity. Parent identity is the persisted actor-account/Student pair. Guardian and Enrollment are not distinct keys. Independent Parents count independently; one Parent across children counts multiple pairs. Per-Publication distinct counts are never summed to claim global distinct people. Events and acknowledgements are separate CTEs, so neither multiplies the other. Target ownership uses existence checks rather than multiplicative event joins. No Guardian, Enrollment or audience table is joined into the measurement population.

One materialized database `statement_timestamp() AT TIME ZONE 'UTC'` defines `toExclusive`; `from` subtracts the fixed number of days. Every metric uses `[from, toExclusive)`. Events use database `createdAt`; acknowledgements use database `acknowledgedAt`. Fixed UTC boundary tests bind a test-only literal clock into the actual production SQL template while preserving all authorization/predicate bindings; the production query and API accept no clock override. Normal fixtures use database default timestamps to avoid host/container clock skew.

`CONTENT_VIEWED` is reported viewing, not comprehension; `FILE_PREVIEWED` is reported preview, not full consumption; `FILE_DOWNLOADED` is a reported interaction, not completed transfer; `LINK_CLICKED` is a reported click, not destination consumption; `JOIN_LINK_CLICKED` is a reported click, not attendance. Acknowledgement is separate durable explicit Parent action. Analytics does not create facts from GETs, notifications, `readAt`, signing, redirect or audience rows. Absolute counts only: no fabricated response denominator, percentages, score or behavioral classification.

## Historical integrity and privacy

Actually published cancelled, expired and superseded Publications remain historical analytic sources while their complete target set is currently owned. No historical event, acknowledgement, Publication, Revision, Student, Guardian or Enrollment write/delete/backfill is introduced. Recipient relationship/account changes do not relabel persisted historical actors. Historical facts can remain stored while an allocation reassignment removes their eligibility for this Teacher. Lifecycle mutations in tests are disposable fixture preparation, not endpoint behavior.

Projection excludes Student/Parent identities, Guardian/Enrollment IDs, raw event IDs, request fingerprints, individual acknowledgement times, links, signed URLs, storage metadata and private note bodies. The response has a fixed ten-bin aggregate shape with three fixed windows. Small groups can still reveal activity through absolute aggregates; this limitation is expressly returned in measurement definitions. Arbitrary slicing, identity timelines and fine-grained filters are unavailable. Production retention, Legal Hold and small-group privacy policy decisions remain later readiness dependencies; no retention or legal authority is inferred here.

## SQL resource controls and concurrency semantics

The dedicated Core repository uses the existing singleton Prisma pool. It runs one aggregate statement in a bounded read-only READ COMMITTED transaction, with a 3,000ms PostgreSQL statement timeout, 1,000ms acquisition maximum and 5,000ms transaction maximum. It sets no global database configuration and holds no transaction over network/Redis/storage operations. Returned data is one bounded row with ten bins, rather than raw events or one query per Publication. No client, pool, queue, worker, consumer, repeat schedule or Redis client is introduced.

The authorization point is the final statement's PostgreSQL snapshot. A read whose statement began before a competing revocation committed may observe the previous authorized state. A statement beginning after committed revocation is denied. No lock-based linearization or cancellation of an already-started read is claimed.

Eight real independent-connection tests cover allocation reassignment, live role-grant revocation, current Content target reassignment and School suspension. Each mutation is tested against an uncommitted competing read and against application admission followed by commit before the actual repository statement. Backend PIDs are independently verified; a second repository object in an admission-barrier test shares the same PrismaService and runs the actual query, not mocked SQL. Retained fact counts remain unchanged.

## PostgreSQL correctness and representative plans

Correctness and HTTP/security/concurrency: 59 tests in three suites passed with no skips. Coverage includes all five event types and both actor kinds; zero facts; repeated reports; multiple children/Parents/Guardian records; independent acknowledgement semantics; successor obligations and global distinct sets; exact UTC boundaries for three ranges; all-target ownership; foreign immutable exclusions; exact-ID denial; current relation/identity/grant revocation; token failures, whitelist and private-cache behavior. GET tests confirm no fact writes.

| Security boundary                                                               | Actual evidence                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Missing, malformed, expired and revoked session tokens                          | Real HTTP guard: 401 and private no-store header                                     |
| Wrong actor carrying both grants                                                | Real HTTP guard/application: 403                                                     |
| Missing view or own grant; School analytics substitution                        | Real HTTP: independent 403; final SQL also rejects revoked live grants               |
| Inactive Teacher or missing active membership                                   | Real HTTP: 403; repository independently checks live identity/membership             |
| Cross-School/Organization, foreign creator or unknown IDs                       | PostgreSQL scope checks and HTTP non-disclosing 404                                  |
| Current reassignment, unbound/School-wide/partial targets or invalid relations  | PostgreSQL denial; real HTTP partial-ownership 404                                   |
| Foreign immutable Revision target                                               | Content aggregate excludes; exact Publication returns 404 without successor fallback |
| Client scope/filter, malformed UUID or invalid/repeated range                   | Real HTTP validation: 400 with private no-store header                               |
| Committed allocation/grant/target/School revocation after application admission | Eight independent-connection tests prove final statement denial and retained facts   |
| GET analytics read-only behavior                                                | Persisted event/acknowledgement counts unchanged                                     |

The representative fixture has two Schools, the owned Teacher's two allocations, foreign targets, 24 additional Teachers, 192 unrelated Publications and 192,000 unrelated event rows. Two included historical Publications contribute 25,000 reports each; a foreign successor contributes one excluded report. Separate note/successor Publications contribute three acknowledgement records for two Parent/child pairs. Multiple Guardian rows remain independent of counting joins.

| Case                        | Independent expectation                                                                  | Actual      |
| --------------------------- | ---------------------------------------------------------------------------------------- | ----------- |
| Content / 30d               | 50,000 events; two Student identities; two Parent/child pairs; two included Publications | Exact match |
| Historical Publication / 7d | 25,000 events; one exact Publication and immutable Revision                              | Exact match |
| Note obligations / 90d      | Three acknowledgements; two distinct Parent/child pairs; zero events                     | Exact match |

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` captures the exact exported production query factory and identical parameter bindings. Full SQL, bindings, resulting counts, plans and all node observations are retained under `coverage/acc11d/plans`.

| Plan                        | Planning ms | Execution ms | Temporary read/write blocks |
| --------------------------- | ----------: | -----------: | --------------------------- |
| `content-30d.json`          |      52.948 |       88.689 | 0 / 0                       |
| `publication-7d.json`       |      54.273 |       47.152 | 0 / 0                       |
| `acknowledgements-90d.json` |      51.375 |        2.321 | 0 / 0                       |

Observed event access uses the existing `acc_engagement_publication_idx` for populated histories and `acc_engagement_content_publication_time_idx` for the empty note event set. Content event heap access returns 25,000 rows on each of two loops. Exact Publication access returns 25,000 on one loop. The tiny three-row acknowledgement table uses a sequential scan, including a two-loop scan for the note's two Publications; records are joined to one exact Publication each and remain three total. Sorts use in-memory quicksort; the largest observed sort is 3,710KiB for Content and 1,940KiB for exact Publication. Full nodes retain estimates, actual rows/loops, filters, index use, buffers and sort space. No universal production latency guarantee is claimed. These observations do not demonstrate a need for new schema/index migration.

Scale/bootstrap/ACC-10E query-plan regression: 43 tests in three suites passed with no skips. Existing recipient query-plan fixtures continue to pass using their actual production queries.

## Validation and regression evidence

Local disposable phases reuse only this worktree's fresh `npm ci` dependencies and schema-matching generated client. They invoke the unchanged canonical shard runner with task-local plans, fresh owned PostgreSQL/Redis/MinIO resources, 28-migration replay, seed and a verified second no-op deployment. No `.env`, shared database or production service is reused. Cleanup must pass independently. Earlier fixture or stale expectation failures are retained and are not reported as passes; final successful attempts supersede only the resolved defect.

| Gate                                                                         | Evidence and actual result                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Academic Content/IAM/App unit contracts                                      | `unit-attempt-2-evidence.json`: 57 suites / 927 tests / zero skips / PASS / cleanup PASS                                                                                                                                                                             |
| ACC-11A/B/C engagement and acknowledgement regressions                       | `engagement-attempt-1-evidence.json`: seven suites / 152 tests / zero skips / PASS / cleanup PASS                                                                                                                                                                    |
| New analytics correctness, HTTP and concurrency                              | `analytics-attempt-5-evidence.json`: three suites / 59 tests / zero skips / PASS / cleanup PASS                                                                                                                                                                      |
| Scale, bootstrap and ACC-10E plans                                           | `scale-attempt-3-evidence.json`: three suites / 43 tests / zero skips / PASS / cleanup PASS                                                                                                                                                                          |
| Teacher read/authoring/files/workflow/security/inventory and ACC-9 contracts | `teacher-attempt-3-evidence.json`: seven suites / 302 tests / zero skips / PASS / cleanup PASS                                                                                                                                                                       |
| ACC-10 recipient access and route inventories                                | `recipients-attempt-1-evidence.json`: seven suites / 290 tests / zero skips / PASS / cleanup PASS                                                                                                                                                                    |
| Existing Dashboard analytics and School management boundaries                | `dashboard-attempt-1-evidence.json`: three suites / 179 tests / zero skips / PASS / cleanup PASS                                                                                                                                                                     |
| Migration governance                                                         | `migration-attempt-1-evidence.json`: PASS, second deployment unchanged, schema current, cleanup PASS                                                                                                                                                                 |
| Canonical CI orchestration                                                   | `ci-orchestration-final.log`: 69 TAP tests / 69 PASS / zero skips                                                                                                                                                                                                    |
| PRD3-G05 clean-start reference seed counts                                   | `g05-attempt-1-evidence.json`: PASS / cleanup PASS; actual governed migration count 28, drift ZERO, permissions 243, roles 7, grants 874, no business rows; 14 focused TAP passes and the existing eight historical-candidate skips in canonical `--current-ci` mode |
| Prisma validation                                                            | `prisma-validation.log`: schema valid                                                                                                                                                                                                                                |
| Production TypeScript                                                        | `typecheck-production-ci-cap.log`: PASS using existing canonical CI 4GiB cap                                                                                                                                                                                         |
| New source/tests plus transitive imports TypeScript                          | `typecheck-new-tests-final.log`: PASS; no suppression or config change                                                                                                                                                                                               |
| Build and compiled bootstrap entry                                           | `build.log`: PASS including `REFERENCE_DATA_BOOTSTRAP_BUILD_CONTRACT=PASS`                                                                                                                                                                                           |
| Changed/new source formatting                                                | `formatting-final.log`: all matched files use Prettier style                                                                                                                                                                                                         |
| Changed TypeScript lint                                                      | PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION; owner approval limited to the two existing Teacher tests, exact identity parity and zero introduced/removed diagnostics; not clean PASS                                                                                     |
| Final bytes and scope                                                        | `final-integrity.json`: all 28 SQL files/schema/config/lock/manifest and dependencies/static config byte-identical to the base; final check refreshed after this audit                                                                                               |

The seven final Jest phases total 1,952 passing tests across 87 suites with zero skips. The initial default 2GiB production typecheck exhausted Node heap; it is retained and superseded by a successful run under the repository's existing canonical CI 4GiB cap. Initial new-test fixture typing was corrected normally. Neither dependency/config nor test assertions were weakened to manufacture a pass. An initial direct TAP invocation omitted the canonical ts-node preload and failed TypeScript seed imports; the fresh canonical preload invocation passed all 69 tests. Initial Teacher failures identified exact canonical grant/count sentinels and the accepted ACC-9 route inventory; only those related expectations were updated for the added permission/routes.

## Exact inherited lint identity comparison — owner approved with conditions

Comparison authority is the exact accepted base `c75bb21d114a6a01f17f90c72e0be706911d9ced` versus these uncommitted candidate files. The baseline is a Git archive of that commit, verified against `git show` bytes, and uses this task's dependency installation with unchanged lock/config/schema. No historical ACC-11B/C approval is reused.

| Affected existing file                            | Base errors / warnings | Candidate errors / warnings | Introduced / removed |
| ------------------------------------------------- | ---------------------- | --------------------------- | -------------------- |
| `test/e2e/teacher-app-final-closeout.e2e-spec.ts` | 71 / 4                 | 71 / 4                      | 0 / 0                |
| `test/security/tenancy.teacher-app.spec.ts`       | 185 / 6                | 185 / 6                     | 0 / 0                |
| Total                                             | 256 / 10               | 256 / 10                    | 0 / 0                |

All 266 inherited diagnostic identities match rule, severity, exact message, node type, columns, mapped starting/ending lines and unchanged source-span SHA-256. Every covered source line maps outside changed hunks. Complete raw baseline/candidate reports, source/environment identities, diff mappings and diagnostic identities are retained in `existing-eslint-baseline-raw.json`, `existing-eslint-candidate-raw.json`, `baseline-environment.json`, `existing-*-diff.patch` and `lint-identity-comparison.json`. Checksums are recorded in the final evidence manifest. Aggregate counts alone are not the proof.

The two additional compared existing tests (`reference-data-bootstrap.integration.spec.ts` and `academic-content-acc9-final-closeout.integration.spec.ts`) are lint-clean at base and candidate. The other 17 changed/new TypeScript files are lint-clean. The final ACC-9 sentinel edit has its own fresh zero-diagnostic report. No diagnostic intersects introduced/modified code. No lint rule/config/severity/exclusion/suppression, typecheck suppression, CI workflow or security assertion is changed.

```ini
LINT_CLEAN_PASS=NO
LINT_STATUS=PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION
ACC_11D_LINT_EXCEPTION=APPROVED_WITH_CONDITIONS
EXCEPTION_SCOPE=TWO_EXISTING_TEACHER_TEST_FILES_ONLY
BASELINE_LINT_ERRORS=256
CANDIDATE_LINT_ERRORS=256
BASELINE_LINT_WARNINGS=10
CANDIDATE_LINT_WARNINGS=10
DIAGNOSTIC_IDENTITY_PARITY=YES
INTRODUCED_LINT_DIAGNOSTICS=0
REMOVED_LINT_DIAGNOSTICS=0
BASELINE_LINT_DEBT_FIXED=NO
COMMIT_PUSH_DRAFT_PR=AUTHORIZED_AFTER_FINAL_GATES_PASS
```

The owner's 2026-10-09 decision authorizes retention of unchanged debt exclusively in the two listed Teacher tests, conditional on exact identity parity, no diagnostic on changed code, clean lint in the other 19 TypeScript files, unchanged functionality/security assertions and all remaining gates passing. Complete authorization is retained in `coverage/acc11d/owner-decision.md`. The comparison is rerun immediately before commit, and fresh scope, frozen artifact bytes, formatting and `git diff --check` are verified after the final audit/evidence edits. No mandatory CI failure is waived. No unrelated lint debt is fixed and no previous ACC-11B/C exception is reused.

Fresh precommit evidence checksums (SHA-256):

```ini
BASELINE_RAW_REPORT_SHA256=cade7b5acb3b77ff9bd38d3477baeac3bc17f5748e24bfb4def6c5df0e531af8
CANDIDATE_RAW_REPORT_SHA256=2e74f9b62899a0f539efaa8b01f941364723bd1bbd02058a79cab411fe3bc7ca
OWNER_DECISION_SHA256=5b22b0811cb7251d6357182527d667e8359933f78d08a5f7757de09671c6d4b9
DIAGNOSTIC_IDENTITY_PARITY=REVERIFIED_BEFORE_COMMIT
```

## Frozen integrity, scope and deferred stages

All 28 committed migrations, Prisma schema/config, migration lock and artifact manifest remain byte-for-byte unchanged. Dependency manifests/lock, ESLint, Prettier and TypeScript configuration remain unchanged. No index migration, `db push`, reset, migration resolution or direct migration SQL execution was used. Disposable fixture SQL does not mutate historical source artifacts.

School-wide Academic Content Analytics APIs remain deferred. ACC-11E and ACC-12 are not started. No assessment, attendance, scoring, retention policy, Legal Hold implementation, notification generation or new engagement write is introduced. This stage delivers Teacher-owned aggregate reads only. Main, Ready for review, merge and production mutation remain unauthorized.
