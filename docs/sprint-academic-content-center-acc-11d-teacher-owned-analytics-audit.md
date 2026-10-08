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

## ACC-11D-R1 — mandatory Security 1/3 sentinel remediation

### Authority, preflight and retained failed CI

R1 continues the existing worktree and branch `agent/acc-11d-teacher-owned-analytics`, with authoritative base `c75bb21d114a6a01f17f90c72e0be706911d9ced`, original feature HEAD `6acb35c309fccb6ee37d8e271c43f048947502ec` and existing [Draft PR #198](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/198). Preflight confirmed a clean worktree, exact matching local/remote feature HEAD, unchanged remote main, and an open, unmerged Draft PR. The original implementation commit is preserved. R1 has no commit or push at this stopped state.

The completed original [CI run 37849490322, attempt 1](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/actions/runs/37849490322) remains **FAIL**. `CI / Security 1/3` failed at `test/security/tenancy.dismissal-iam.spec.ts:222`: expected Teacher permission length 57, received 58. Its 32 suites had 31 passing suites and one failing suite; 462 tests passed and one failed. The other 25 regression shards succeeded. The required aggregate and dependent compatibility jobs failed as a consequence. These historical results are retained, with no CI waiver or reclassification.

The approved permission `academics.academic_content.analytics.own.view` increases the canonical Teacher role to 58. The stale test constant at line 73 is corrected from `TEACHER_PERMISSIONS: 57` to `TEACHER_PERMISSIONS: 58`. Parent remains 47 and Student remains 58. Exact byte comparison against the original feature HEAD proves this is the sole change to the test. All Dismissal assertions, Dismissal Staff grants and production permission/role catalogs are preserved.

Retained historical canonical artifacts:

| Artifact                                                                                                                                              | GitHub ID     | Verified SHA-256                                                   | Actual status                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| [Security 1/3 evidence](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/actions/runs/37849490322/artifacts/11581203055)       | `11581203055` | `4930f0934ec1f2b27884b772b116218588b7cacf2fb4582a830bb71b08515ecf` | FAIL / SOURCE_TEST_FAILURE / cleanup PASS |
| [Required aggregate evidence](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/actions/runs/37849490322/artifacts/11582590052) | `11582590052` | `bbd97da45cff492e71e6beb538cbee2c918fb0e088bd01d34a422350be8f8711` | FAIL / execution parity BLOCKED           |

The required summary records 979 expected files, 947 reported executed files, 32 missing files from the failed Security 1/3 shard, and zero duplicate or unexpected files. This is the historical aggregate result, not successful candidate execution parity. Artifact archives, raw summaries and digest verification are retained under `coverage/acc11d/ci-artifacts` and `coverage/acc11d/r1/old-required-artifact`.

### Focused local candidate verification

The exact previously failing test passed **11 tests / one suite / zero skips**, including the original role-count and `dismissal.*` exclusion assertion, the exact safe Dismissal Staff grant list, and `/auth/me` permission mapping. The unchanged canonical shard runner and Jest configuration use this worktree's locked dependencies, schema-matching generated client, fresh owned disposable PostgreSQL/Redis/MinIO, all 28 migrations, seed, and a second no-op migration deployment. Cleanup independently passed.

This focused run began before the inherited lint stop was established; only that already-running verification was completed. Its runner fields use the original feature SHA as the local checkout identifier. The tested source is the uncommitted one-line R1 candidate, identified by the source hashes below. It is **local candidate evidence, not Exact-Head CI or a rerun of unchanged old code**. Raw Jest assertions, stage outcomes, setup and cleanup are retained in `coverage/acc11d/r1/acc11d-dismissal-jest.json`, `dismissal-attempt-1-evidence.json` and `dismissal-attempt-1.log`.

| R1 gate                                                                               | Current actual result                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Exact Dismissal IAM test and preserved permission boundaries                          | PASS: 11 tests, zero failures/skips; cleanup PASS                                    |
| Test source identity and sole 57 → 58 correction                                      | PASS                                                                                 |
| Migration replay and second no-op deployment in the focused disposable setup          | PASS                                                                                 |
| Frozen migration/schema/manifest/config bytes                                         | PASS: all 47 retained frozen artifacts unchanged, including 28 SQL migrations        |
| Original production implementation bytes                                              | PASS: unchanged from original feature HEAD                                           |
| Full canonical Security 1/3 and remaining IAM/reference-data/Teacher regressions      | NOT RUN: Section 5 owner decision required                                           |
| Fresh complete canonical validation, analytics/engagement/acknowledgement regressions | NOT RUN: Section 5 owner decision required                                           |
| Fresh standalone migration governance, Prisma validation, typecheck and build         | NOT RUN: Section 5 owner decision required                                           |
| R1 audit formatting and final `git diff --check`                                      | Recorded in `coverage/acc11d/r1/stopped-state-manifest.json` after this audit update |
| New remediation commit, normal push and Exact-Head CI                                 | NOT PERFORMED: Section 5 owner decision required                                     |

The earlier ACC-11D validation results above remain historical evidence for the original implementation. They are not substituted for the fresh R1 gates still required before delivery.

### New Dismissal test lint stop — fresh owner decision required

R1 Section 5 explicitly limits the existing inherited lint exception to the two Teacher test files and requires a fresh owner decision if the newly modified Dismissal IAM test has inherited diagnostics. ESLint for `test/security/tenancy.dismissal-iam.spec.ts` exits 1 with **11 errors / zero warnings**. The exact original feature HEAD has the same **11 errors / zero warnings**: four `prettier/prettier`, six `@typescript-eslint/no-unsafe-member-access`, and one `@typescript-eslint/no-unsafe-call`.

The comparison uses an archive of `6acb35c309fccb6ee37d8e271c43f048947502ec`, verified against exact Git bytes, with the same locked dependencies and unchanged ESLint/Prettier/TypeScript configuration. All 11 diagnostic identities match rule, severity, exact message, node type, starting/ending lines and columns, and SHA-256 of the unchanged source span. No diagnostic intersects changed line 73. Aggregate counts alone are not the proof. Complete raw reports, every diagnostic identity, configuration/source identities, comparison code and logs are retained under `coverage/acc11d/r1`.

```ini
COMPARISON_BASELINE=6acb35c309fccb6ee37d8e271c43f048947502ec
COMPARISON_CANDIDATE=UNCOMMITTED_R1_ONE_LINE_TEST_CORRECTION
DISMISSAL_IAM_BASELINE_LINT_ERRORS=11
DISMISSAL_IAM_CANDIDATE_LINT_ERRORS=11
DISMISSAL_IAM_BASELINE_LINT_WARNINGS=0
DISMISSAL_IAM_CANDIDATE_LINT_WARNINGS=0
DIAGNOSTIC_IDENTITY_PARITY=YES
INTRODUCED_LINT_ERRORS=0
INTRODUCED_LINT_WARNINGS=0
REMOVED_LINT_DIAGNOSTICS=0
DIAGNOSTICS_INTERSECTING_CHANGED_CODE=0
DISMISSAL_IAM_LINT_CLEAN_PASS=NO
DISMISSAL_IAM_LINT_STATUS=STOP_FRESH_OWNER_DECISION_REQUIRED
DISMISSAL_IAM_BASELINE_EXCEPTION=NOT_YET_AUTHORIZED
BASELINE_LINT_DEBT_FIXED=NO
```

Source and raw evidence checksums:

```ini
BASELINE_TEST_SHA256=cf7456d51e007ebf4c0ef9402181077cf260fe7b1072bcb243d70058d265e822
CANDIDATE_TEST_SHA256=af677643bc60bff1af7188e4b95fef2a85a406d6018326c67c599203dc83f90c
BASELINE_ESLINT_RAW_SHA256=fa84c71e1bd4b26c327a6ec536acd976e9eea267f0287800db51adb987fb7287
CANDIDATE_ESLINT_RAW_SHA256=06f45cea9a670b85806811682b23a047bf962259890e7beea9cd946785b33d6b
```

`coverage/acc11d/r1/lint-identity-comparison.json` contains the full 11-identity comparison. No lint suppression, rule/configuration change, assertion weakening, mass formatting or unrelated debt fix was made. The existing Teacher exception does not authorize this Dismissal exception, and the individual file is not reported as clean PASS or an approved exception.

### R1 stopped-state scope and delivery

The R1 changed-file inventory is exactly:

1. `test/security/tenancy.dismissal-iam.spec.ts`: one permission-count constant, 57 → 58.
2. `docs/sprint-academic-content-center-acc-11d-teacher-owned-analytics-audit.md`: this R1 evidence and stop record.

The frozen artifacts, original source identities, changed-file inventory, final diff, audit formatting and raw evidence checksums are sealed in `coverage/acc11d/r1/stopped-state-manifest.json`. Production source, catalogs, assertions, migration SQL/schema/manifest, dependencies, CI runner/routing/classification/workflows and queue topology have no R1 changes. No new branch or PR is created. Feature HEAD and Draft PR #198 remain at the original feature SHA; no remediation commit, push or new Exact-Head CI exists at this stop.

R1 is **BLOCKED pending the fresh Section 5 owner lint decision**. If that narrow exception is authorized, the remaining fresh local gates must pass before exactly one additional normal remediation commit, normal push to the existing branch and actual new Exact-Head CI on PR #198. Any mandatory failing CI gate remains blocking. Ready for review, merge, main mutation, production/staging deployment, ACC-11E and ACC-12 remain unperformed.

## ACC-11D-R1 — final owner authorization and continuous delivery

The owner's final authorization supersedes the initial lint stop recorded above. It explicitly approves the unchanged 11 Dismissal IAM errors, preserves the two existing Teacher exceptions, and authorizes completion of the remaining local gates, exactly one additional normal remediation commit, a normal push to the existing branch and fresh Exact-Head CI on Draft PR #198. It authorizes no suppression, source-scope expansion, weakened assertion, CI waiver, Ready action, merge or deployment. The complete decision is retained in `coverage/acc11d/r1/final-owner-authorization.md`.

Fresh remote preflight again confirms main at `c75bb21d114a6a01f17f90c72e0be706911d9ced`, feature HEAD at `6acb35c309fccb6ee37d8e271c43f048947502ec`, and open, unmerged Draft PR #198 with its single original normal implementation commit. The existing R1 candidate remains the exact one-line 57 → 58 test correction plus this audit.

The fresh combined diagnostic comparison passes all **277 diagnostic identities**, including exact rule/severity/message/node type, mapped locations and unchanged source-span identity. There are **267 inherited errors / 10 inherited warnings**, zero introduced diagnostics, zero removed diagnostics and zero diagnostics on modified code. Teacher comparison authority remains the accepted base; the Dismissal baseline is byte-identical at both the accepted base and original feature HEAD, and the latter remains its explicit R1 comparison authority. The other 19 changed TypeScript files are lint-clean: 17 in the clean-file report and the two existing integration tests separately compared as clean at base and candidate.

| Exact approved exception scope                    | Baseline errors / warnings | Candidate errors / warnings | Diagnostic identity parity |
| ------------------------------------------------- | -------------------------- | --------------------------- | -------------------------- |
| `test/e2e/teacher-app-final-closeout.e2e-spec.ts` | 71 / 4                     | 71 / 4                      | 75 / 75                    |
| `test/security/tenancy.teacher-app.spec.ts`       | 185 / 6                    | 185 / 6                     | 191 / 191                  |
| `test/security/tenancy.dismissal-iam.spec.ts`     | 11 / 0                     | 11 / 0                      | 11 / 11                    |
| Total                                             | 267 / 10                   | 267 / 10                    | 277 / 277                  |

```ini
OWNER_LINT_AUTHORIZATION=APPROVED
DISMISSAL_IAM_LINT_EXCEPTION=APPROVED
DISMISSAL_IAM_LINT_CLEAN_PASS=NO
DISMISSAL_IAM_LINT_STATUS=PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION
OVERALL_LINT_CLEAN_PASS=NO
OVERALL_LINT_STATUS=PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION
TOTAL_INHERITED_ERRORS=267
TOTAL_INHERITED_WARNINGS=10
TOTAL_INTRODUCED_DIAGNOSTICS=0
TOTAL_REMOVED_DIAGNOSTICS=0
DIAGNOSTIC_IDENTITY_PARITY=277_OF_277
BASELINE_LINT_DEBT_FIXED=NO
```

Fresh full raw reports, source identities, diff mappings, all diagnostic records and the authorization checksum are retained in `coverage/acc11d/r1/all-lint-identity-comparison.json`, `existing-eslint-baseline-raw.json`, `existing-eslint-candidate-raw.json`, `other-changed-eslint-raw.json` and `existing-*-diff.patch`. The earlier isolated Dismissal comparison and stopped-state evidence are preserved separately. No matching-count shortcut, configuration exclusion or diagnostic filtering is used.

Whole-file Prettier results are also retained: the Dismissal test has its four unchanged inherited `prettier/prettier` errors covered by the approved 11-error exception. The other 23 changed source/audit files are formatting-clean, and the sole changed Dismissal count line is correctly formatted and outside every diagnostic span. Whole-file formatting is not misreported as clean. `formatting-whole-files-raw.log` preserves the nonzero inherited result; `formatting-clean-files.log` and `formatting-verification.json` document the clean files and the authorized changed-code gate. An initial ignored evidence helper assumed all three lint-exception files had formatting warnings; the actual raw output identified only Dismissal. Its assertion was corrected to that exact file without modifying source or changing the formatting gate, and the initial helper output is retained.

The remaining fresh canonical local regression, static and delivery results are recorded below after actual execution. Original CI run `37849490322` and both historical canonical artifacts permanently remain FAIL; they are not acceptance evidence for the corrected candidate.

### Fresh R1 gate results and new mandatory regression stop

The canonical Security 1/3 shard uses its exact retained 32-file inventory and metadata (service category, security profile, index 1 of 3), unchanged runner/Jest configuration, fresh owned disposable services, migration replay and seed. It passed **32 suites / 463 tests / zero skips**, with exact local 32-file execution parity, no failure classification and cleanup PASS. The Dismissal IAM suite within that fresh shard passed all 11 assertions; the original failed count expectation is resolved, and Dismissal Staff grants and Parent/Teacher/Student exclusions remain active.

| Fresh R1 gate                                                                     | Actual result                                                                                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full canonical Security 1/3                                                       | PASS: 32 suites, 463 tests, zero skips, cleanup PASS                                                                                                |
| Academic Content, reference-data and App contract units                           | PASS: 57 suites, 927 tests, zero skips, cleanup PASS                                                                                                |
| ACC-11D analytics correctness, HTTP and real PostgreSQL concurrency               | PASS: three suites, 59 tests, zero skips, cleanup PASS                                                                                              |
| Remaining IAM security and Dismissal Staff role HTTP regressions                  | PASS: two suites, 10 tests, zero skips, cleanup PASS                                                                                                |
| ACC-11A/B/C engagement and acknowledgement                                        | **FAIL: six suites passed, one failed; 151 tests passed, one failed, zero skips; SOURCE_TEST_FAILURE; cleanup PASS**                                |
| Production TypeScript                                                             | PASS: fresh `--noEmit --incremental false` using canonical CI 4GiB cap                                                                              |
| New analytics source/tests and changed Dismissal test TypeScript                  | PASS: fresh scoped project plus transitive imports, no suppressions                                                                                 |
| Canonical CI orchestration tests                                                  | PASS: 69 TAP tests, zero failures/skips                                                                                                             |
| Updated three-file lint identity comparison                                       | PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION: 277/277 identities, zero introduced/removed; not clean PASS                                                |
| Formatting of authorized changed code and audit                                   | PASS with the approved unchanged Dismissal Prettier diagnostics retained in full raw output; other 23 files clean                                   |
| Frozen migration/schema/manifest/config and source integrity                      | PASS: all 28 historical SQL migrations and 47 frozen artifacts unchanged; only the authorized test line and audit differ from original feature HEAD |
| Fresh 28-migration replay and second no-op deployment                             | PASS in each completed disposable database phase, including the failed test phase                                                                   |
| Remaining Teacher/scale/recipient/full Dashboard regressions                      | NOT RUN: sequence stopped at the mandatory acknowledgement failure                                                                                  |
| Fresh standalone migration governance, G05 and complete canonical preflight/build | NOT RUN: sequence stopped at the mandatory acknowledgement failure                                                                                  |
| Final R1 diff and audit formatting                                                | PASS; sealed after this audit update                                                                                                                |

The different blocking failure is:

```text
FAILED_PHASE=engagement-attempt-1
FAILED_SUITE=test/integration/academic-content-acknowledgement.integration.spec.ts
FAILED_TEST=creates a new obligation for the canonical successor and preserves predecessor history
FAILED_ASSERTION_LINE=240
ACTUAL_EXCEPTION=DomainException: Academic content not found
FAILURE_PATH=AcademicContentAcknowledgementRepository.lockAuthority
FAILURE_SOURCE=academic-content-recipient-authority.ts:124
FAILURE_CLASSIFICATION=SOURCE_TEST_FAILURE
CLEANUP=PASS
```

The test creates a successor Publication and expects its first acknowledgement read to return PENDING. The canonical recipient selection instead returns no identity, producing the 404 at line 240. The precise underlying cause is not established. The failing test, acknowledgement fixture, service/repository and recipient authority source are byte-identical to both the accepted base and original feature HEAD. This observation is separate from the corrected Dismissal permission-count sentinel and the approved lint debt. No production or unrelated test change is included in R1.

The failed phase remains FAIL. Its complete raw Jest assertions/stack, runner classification, setup/replay and cleanup are retained in `coverage/acc11d/r1/engagement-attempt-1.log`, `engagement-attempt-1-evidence.json` and `acc11d-engagement-jest.json`. Passing parallel gates that had already started were collected to completion. The remaining regression sequence did not start after this failure.

### Final delivery boundary at the regression stop

The final owner lint authorization remains APPROVED. The new blocker is the mandatory acknowledgement regression, with any correction outside the sole authorized code line requiring separate scope authority. No remediation commit or push has been performed. Draft PR #198 remains open with its original implementation commit and original feature HEAD; there is no new Exact-Head CI or new acceptance artifact.

The actual completed gates, failed test source identities, authorization/diagnostic evidence, final two-file scope, unchanged artifacts and raw evidence hashes are retained in `coverage/acc11d/r1/final-local-evidence.json`. The original stopped-state manifest and original failed CI artifacts remain historical records. The final report identifies all unrun gates explicitly rather than substituting earlier implementation results.

```ini
CURRENT_R1_BLOCKER=MANDATORY_ACC_11C_SUCCESSOR_ACKNOWLEDGEMENT_REGRESSION_FAILURE
OWNER_LINT_AUTHORIZATION=APPROVED
R1_CHANGED_FILES=2
R1_CHANGED_CODE_LINES=1
R1_PRODUCTION_FILE_COUNT=0
REMEDIATION_COMMIT=NOT_CREATED
NORMAL_PUSH=NOT_PERFORMED
NEW_EXACT_HEAD_CI=NOT_STARTED
READY_FOR_REVIEW=NO
MERGE=NO
MAIN_MUTATION=NO
PRODUCTION_MUTATION=NO
ACC_11E_STARTED=NO
ACC_12_STARTED=NO
RESULT=BLOCKED
```

## Final recovery on the existing Draft PR #198

### Authority and preserved history

The final recovery authorization continues the same branch and worktree from original feature commit `6acb35c309fccb6ee37d8e271c43f048947502ec`, based on `c75bb21d114a6a01f17f90c72e0be706911d9ced`. It authorizes evidence-backed fixture and expectation corrections without introducing a new remediation stage. The earlier lint stop, owner approvals, mandatory acknowledgement failure, failed logs and stopped-state manifests above remain historical records. Their stopped delivery status is superseded by this recovery only after the final mandatory gates pass.

Original Exact-Head CI run `37849490322`, attempt 1, remains **FAIL**. Its actual source failure was the Dismissal IAM assertion expecting 57 Teacher permissions rather than 58. Its failed Security artifact and Required aggregate retain their original digests and failure classifications. They are not acceptance evidence for the corrected candidate.

### Successor timing diagnosis and correction

The original successor test assigns `new Date()` from Node.js to `publishAt`, `publishedAt` and `visibleFrom`, whereas normal fixture publications are backdated five seconds. Production canonical selection requires both publication timestamps to be no later than PostgreSQL `clock_timestamp()`. A future successor therefore has no current canonical identity and is correctly denied after the Content SHARE lock and before publication/live-ACL/Guardian locks, immutable snapshot checks and final write predicates.

The exact assertion was executed through the unchanged canonical runner with owned disposable PostgreSQL. The natural original-source probe passed all 16 tests. Its Node before/after query times were `2026-10-08T23:18:02.314Z` / `.319Z`, and PostgreSQL was `.318Z`, giving a measured delta interval of **[-4, +1] milliseconds**. No clock sample exists for the earlier stopped failure instant. This audit does not claim persistent machine drift or a measured historical failure offset.

A controlled before-fix probe advanced only Node's `Date` clock by 60 seconds while keeping timers, I/O and PostgreSQL real. It reproduced the same mandatory assertion failure: **15 tests passed, one failed, no skips, cleanup PASS**. The read-only parameterized diagnostics reuse the actual production canonical query and predicates:

| Diagnostic                                                    | Observed controlled before-fix result                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Node UTC / PostgreSQL UTC                                     | `2026-10-08T23:20:57.116Z` / `2026-10-08T23:19:57.174Z`                              |
| Node minus database clock                                     | **59,942 ms**                                                                        |
| Predecessor                                                   | EXPIRED; its acknowledgement remains historical                                      |
| Successor                                                     | PUBLISHED; `publishedAt` and `visibleFrom` both `23:20:57.116Z`; `visibleUntil` null |
| Successor time predicates                                     | `publishedAtEligible=false`, `visibleFromEligible=false`                             |
| Live actor, membership and view grant                         | Valid                                                                                |
| Guardian and current enrollment                               | Valid; year, term and classroom match                                                |
| Revision targets and immutable V2 snapshot                    | Valid                                                                                |
| Current canonical publication                                 | Null                                                                                 |
| Read-only counterfactual using database time plus two minutes | Selects the exact successor publication                                              |
| Failed authorization stage                                    | `CANONICAL_PUBLICATION_RESOLUTION`, before later locking/authorization stages        |

This proves the fixture's cross-clock assumption is unsafe and reproduces the original failure path. It does not prove that production denied a currently visible, authorized successor. Production visibility, version fencing and authorization checks are preserved.

The smallest fixture correction obtains an already-visible timestamp using Prisma's tagged query, `SELECT clock_timestamp() - interval '5 seconds' AS "visibleAt"`, and uses it consistently for all three successor publication fields. The same test now executes at Node clock offsets zero and +60,000 ms. It preserves every original assertion: expired predecessor denied with 404, successor initially PENDING, a different acknowledgement identity and exactly two obligations/history records. Dedicated future-publication denial tests remain active. Fake Date state is restored after each case; scheduler/I/O timers are never faked.

Three fresh independent canonical PostgreSQL contexts then passed **17 tests each, zero skips, cleanup PASS**, including both successor cases. This is a before-fix failure followed by explicit stability proof, with every failed probe preserved rather than a retry that hides failure.

The complete historical failure, natural and controlled probes, synthetic publication IDs, actor/enrollment/target/snapshot evidence, exact instrumented patches, full Jest assertion records, raw database diagnostics, source identities and SHA-256 evidence manifests remain under `coverage/acc11d/r1/root-cause/`. `root-cause-verification.json` records the measured clock samples and their limits.

### Source-wide contract audit and narrow correction scope

The executable source audit found one additional stale contract inventory: the Teacher security test enumerated 149 controllers/handlers and omitted the two own-analytics routes. Its inventory now includes `TeacherAcademicContentAnalyticsController`, verifies both handler permission arrays (`academics.academic_content.view` and `academics.academic_content.analytics.own.view`) and requires exactly **151** discovered and documented handlers. No metadata assertion is removed or weakened.

Expanded typechecking of that inventory found two direct prototype-to-record casts rejected by TypeScript. Both inventory traversals now explicitly cross `unknown` before indexing the discovered method name; function and route/permission metadata checks remain identical. The general helper and all unrelated test assertions are unchanged. Production and expanded changed-test typechecks pass without suppressions or configuration changes; the initial expanded-test diagnostic log is retained under the final evidence directory.

The existing Dismissal correction remains the single `TEACHER_PERMISSIONS: 57` to `58` expectation change. Parent permissions remain 47, Student permissions 58, and Dismissal Staff grants/exclusions remain unchanged. The accepted canonical totals are 243 permissions, seven system roles and 874 system role grants. Teacher route totals are 151 including 39 Academic Content routes; Student and Parent totals remain 106 and 80.

Remaining `242` values in `reference-data-bootstrap.spec.ts` are synthetic mocked CLI report data and its matching serialization assertion, not canonical permission-catalog checks. Unrelated timestamp and deployment-capacity numeric matches are preserved. Search logs are retained as `static-contract-search.log` and `static-contract-search-final.log`; no mechanical numeric replacement is used.

The recovery changes three existing test files and this existing audit only:

- `test/security/tenancy.dismissal-iam.spec.ts`: the authorized Teacher count sentinel.
- `test/integration/academic-content-acknowledgement.integration.spec.ts`: PostgreSQL-derived successor timestamps and an explicit controlled clock-skew case.
- `test/security/tenancy.teacher-app.spec.ts`: complete analytics route inventory/permission expectations and the two necessary typed traversal casts.
- This audit: retained historical evidence and actual final recovery results.

No production source, business/security contract, schema, migration, manifest, system role catalog, dependency lockfile, CI runner/router/classifier/workflow or deployment configuration is modified by the recovery. The original feature implementation is preserved.

### Final inherited lint identity gate

After the route inventory and typed traversal corrections, the complete raw baseline/candidate comparison was rerun against accepted base `c75bb21d114a6a01f17f90c72e0be706911d9ced`. All **277 diagnostic identities** retain the same rule, severity, exact message, node type, mapped location and unchanged source span. No diagnostic intersects any modified code; none was introduced or removed. The original feature HEAD acknowledgement-test source is byte-identical to that accepted baseline and has **zero** lint diagnostics before and after this recovery, so it requires no additional exception.

| Approved inherited scope                          | Baseline errors / warnings | Final candidate errors / warnings | Identity parity |
| ------------------------------------------------- | -------------------------- | --------------------------------- | --------------- |
| `test/security/tenancy.dismissal-iam.spec.ts`     | 11 / 0                     | 11 / 0                            | 11 / 11         |
| `test/e2e/teacher-app-final-closeout.e2e-spec.ts` | 71 / 4                     | 71 / 4                            | 75 / 75         |
| `test/security/tenancy.teacher-app.spec.ts`       | 185 / 6                    | 185 / 6                           | 191 / 191       |
| Total                                             | 267 / 10                   | 267 / 10                          | 277 / 277       |

All **20 other changed TypeScript files** are lint-clean. No lint configuration, exclusion, severity, suppression comment or CI gate changed. The initial comparison before the two typed-cast corrections is retained separately; the final comparison and complete raw reports include all source hashes and diff mappings.

`existing-eslint-baseline-raw.json` SHA-256: `24712f8dee8b2a664834d77b8463ffd607bf9bec9cb205cb739510b88f71d81a`.

`existing-eslint-candidate-raw.json` SHA-256: `4b734ced6e2fb23146e501415a8bd1b87abe4e5bd1d8e550d31c123954332eef`.

`recovery-lint-identity-comparison.json` SHA-256: `014077f2bd854a2a1bb9c87a5749b6ad2831838d78db230ae2165f2d1f84c8f3`.

`LINT_CLEAN_PASS=NO`; `LINT_STATUS=PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION`; `INTRODUCED_LINT_DIAGNOSTICS=0`; `REMOVED_LINT_DIAGNOSTICS=0`; `BASELINE_LINT_DEBT_FIXED=NO`. The four unchanged Dismissal `prettier/prettier` errors remain included in its approved 11-error baseline. Whole-file formatting debt is retained in the raw output; the authorized changed count line and all other changed files must pass formatting before delivery.

### Consolidated final local validation

The final bounded canonical pass uses unchanged repository `run-ci-shard.cjs`, Jest/fixture profiles and migration governance, owned disposable services, exact relevant source/environment identities and the task's fresh locked dependency installation. Platform command adapters are ignored local evidence helpers; no CI source, discovery or gate changes. The four recovery-file diff and complete final source hashes supplement the local plan's original feature SHA anchor. These precommit working-tree records are explicitly local evidence, not a newly committed Exact-Head CI result.

| Final local gate                                | Actual result                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| engagement                                      | PASS: 7 suites / 153 tests / zero skips; cleanup PASS                                                                                                        |
| unit                                            | PASS: 57 suites / 927 tests / zero skips; cleanup PASS                                                                                                       |
| analytics                                       | PASS: 3 suites / 59 tests / zero skips; cleanup PASS                                                                                                         |
| teacher                                         | PASS: 7 suites / 302 tests / zero skips; cleanup PASS                                                                                                        |
| scale                                           | PASS: 3 suites / 43 tests / zero skips; cleanup PASS                                                                                                         |
| recipients                                      | PASS: 7 suites / 290 tests / zero skips; cleanup PASS                                                                                                        |
| dashboard                                       | PASS: 3 suites / 179 tests / zero skips; cleanup PASS                                                                                                        |
| migration                                       | PASS: 39 TAP tests passed, zero skips; cleanup PASS                                                                                                          |
| g05                                             | PASS: 14 current CI TAP tests passed; eight unchanged historical cases skipped by canonical --current-ci; cleanup PASS                                       |
| iam                                             | PASS: 2 suites / 10 tests / zero skips; cleanup PASS                                                                                                         |
| security1                                       | PASS: 32 suites / 463 tests / zero skips; cleanup PASS                                                                                                       |
| teacherinventory                                | PASS: 1 suites / 55 tests / zero skips; cleanup PASS                                                                                                         |
| Canonical preflight                             | PASS: candidate-diff-check, npm-ci, current-governance, migration-governance, prisma-validate, prisma-generate, runtime-policy, fixture-contract, nest-build |
| Production TypeScript                           | PASS: noEmit, incremental disabled, canonical 4 GiB cap                                                                                                      |
| Expanded new/changed source and test TypeScript | PASS, including acknowledgement and Teacher inventory; no suppressions                                                                                       |
| CI orchestration                                | PASS: 69 TAP tests, zero failures/skips                                                                                                                      |
| Canonical permissions / roles / grants          | PASS: 243 / 7 / 874; Teacher 58, Parent 47, Student 58, Dismissal Staff 10                                                                                   |
| Route inventory                                 | PASS: Teacher 151 / Academic Content 39; Student 106; Parent 80                                                                                              |

The 11 main phases passed **121 Jest suite executions / 2,426 assertion executions** (including deliberate overlap between relevant local phases), plus 39 migration-governance TAP tests and 14 current G05 TAP tests. The final typed Teacher inventory additionally passed 55 assertions in an independent fresh context after its source was finalized. All mandatory selected tests executed; no new skips, removed assertions or retries conceal a failure. The eight historical G05 skips are the unchanged canonical `--current-ci` selection, separately visible in full raw logs, and are not waived current gates.

Every disposable database phase replays all 28 historical migrations and verifies a second deployment is a no-op. The fresh migration profile also verifies database/schema parity. All cleanup records are PASS. The final integrity receipt must verify the 28 SQL files, schema, manifest and all 47 frozen artifacts byte-for-byte; production/configuration remain unchanged by recovery. Final formatting and working-tree `git diff --check` are sealed with the audit and actual final source bytes before the normal commit. The full raw phase records, failed expanded-typecheck attempt, corrected static checks and hashes are retained in `coverage/acc11d/r1/final/`; `final-local-evidence.json` seals the final candidate.

### Delivery and independent review boundary

The normal remediation commit containing this section preserves original feature commit `6acb35c309fccb6ee37d8e271c43f048947502ec`. It is pushed normally to the existing branch and Draft PR #198 only after the final local seal passes. No Ready transition, merge, main mutation, deployment, force push, amendment or history rewrite is authorized.

The new remote feature SHA, actual Exact-Head run/attempt, every job/check result, all downloaded artifact IDs/digests, shard cleanup and exact execution parity are recorded after delivery in `coverage/acc11d/r1/final/delivery-evidence.json` and the same PR's final recovery section. `ci-<new-run-id>/verification.json` contains independently checked published artifact digests and a byte-equivalent canonical aggregate reproduction using the unchanged aggregator and the artifact's recorded generation time. Final acceptance requires every mandatory job/check and shard PASS, missing/duplicate/unexpected files zero, cleanup PASS and the canonical artifact verified/reproduced. The precommit audit does not invent a future commit SHA or CI outcome; the postdelivery receipt and final owner report state those actual results. Original run `37849490322` remains FAIL permanently.

`READY_FOR_REVIEW=NO`; `MERGE=NO`; `MAIN_MUTATION=NO`; `PRODUCTION_MUTATION=NO`; `ACC_11E_STARTED=NO`; `ACC_12_STARTED=NO`. Stop for independent Backend review after actual Exact-Head verification.
