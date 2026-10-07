# ACC-10E — Scale, Query Plans & Integration Contract

## Authority and scope

Authoritative base: `410177390fb970825d3fb4c50724bd943aa23736`, accepted ACC-10D merge (#191), tree `5dca6cbe9de6c95ff29c13ba970529c1aa1f45a4`. Entry evidence verified clean main and identical local/fetched/remote main before creating `agent/acc-10e-scale-query-plans-integration-contract` from that commit.

This slice adds PostgreSQL evidence tests, a shared bulk fixture, explicit bootstrap assertions and this audit. Production source, recipient semantics, permission catalogs, response contracts, controllers, queues and CI routing/classification remain unchanged. Historical audience recipients retain their notification/history purpose; they provide no current ACL.

## Fixture and correctness

`test/fixtures/academic-content-scale.fixture.ts` creates the small relationship graph through Prisma and the large corpus through PostgreSQL `generate_series` inserts. Each owned School has:

| Entity                           | Target School | Foreign School |
| -------------------------------- | ------------: | -------------: |
| Contents                         |         6,000 |          6,000 |
| Publications                     |         6,060 |          6,060 |
| Revisions                        |         6,060 |          6,060 |
| Immutable revision targets       |         6,060 |          6,060 |
| Immutable revision tags          |         6,060 |          6,060 |
| Successor publications/revisions |            60 |             60 |

Both corpora contain all six content types and all five scopes (School, Stage, Grade, Section, Classroom), valid type/audience combinations, subject-qualified/unqualified targets, applicable and zero-hour subjects, PUBLISHED/SCHEDULED/CANCELLED/EXPIRED publications, future and expired visibility windows, and superseded predecessors. The target graph contains two current Students/enrollments and one Guardian linked to both. Only the first child has publication-time recipient history (two rows: Student and Guardian); the second child has none. IDs are deterministic within the randomly isolated School namespace. Visibility uses a captured clock with day-sized margins; date-filter data uses fixed October 2026 values.

The scale suite independently enumerates the seed distribution to assert exact publication/revision identities, totals and complete pagination. It checks page boundaries, tied `visibleFrom` values ordered by publication UUID descending, empty out-of-range pages retaining total, type/subject/literal search/tag/weekly/Online Session filters, Parent-only Guardian Notes, current successors, foreign-School exclusion and current subject allocation. Withdrawing enrollment or removing the Guardian link denies the feed while historical recipient rows remain unchanged; the late child receives current eligible content without historical membership.

Base visible totals are Student **1,488** and Parent **1,748**; subject-qualified totals are **731** and **888** respectively. Full pagination uses limit 73. Each feed operation performs exactly one call-through database statement; no per-publication application authorization loop is added.

Fixture-owned records are removed in `afterAll`; the canonical disposable harness independently verifies resource cleanup. Tests reject non-disposable database targets. No deployed database or cloud resource is used.

## Exact production query plans

The production recipient repository already constructs one parameterized `Prisma.Sql` statement with `eligible → page → total`. The test spies on `$queryRaw` without replacing its implementation, captures the exact SQL object used for the real feed, then wraps that same object and bindings with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. No approximate query or production refactor is introduced. PostgreSQL `ANALYZE` runs after corpus construction.

The tests assert absence of `academic_content_audience_recipients` in the SQL and plan. All raw JSON, SQL/bindings, per-node rows/loops/filter removals and buffer evidence remain under ignored `coverage/acc10e/plans/`; compact summaries also appear in Jest/CI logs as `ACC10E_QUERY_PLAN`. Timings and exact physical node choices are observations, not CI thresholds.

### Baseline observation

Local disposable PostgreSQL, unchanged 26-migration schema, both 6,060-publication corpora:

| Production feed             | Eligible total | Page rows | Planning ms | Execution ms | Shared hits | Shared reads | Page-sort KiB |
| --------------------------- | -------------: | --------: | ----------: | -----------: | ----------: | -----------: | ------------: |
| Student, first page (20)    |          1,488 |        20 |       9.630 |       18.980 |      15,302 |            0 |            29 |
| Parent, first page (20)     |          1,748 |        20 |       7.843 |       21.139 |      10,610 |            0 |            29 |
| Student, page 7 (73)        |          1,488 |        73 |       9.174 |       20.890 |      15,302 |            0 |           146 |
| Parent, page 7 (73)         |          1,748 |        73 |       7.632 |       19.883 |      10,610 |            0 |           150 |
| Student, applicable subject |            731 |        20 |       8.384 |       17.498 |      15,302 |            0 |            30 |
| Parent, applicable subject  |            888 |        20 |       9.150 |       18.527 |      10,610 |            0 |            29 |

All six plans have **zero temporary reads/writes**. Page selection uses in-memory top-N heapsort; final page ordering uses quicksort (28–39 KiB). Later pages retain 511 candidates for OFFSET 438/LIMIT 73. Measurements are warm-buffer local observations, not production latency guarantees.

### Hot access paths and index decision

- Contents use a School-selective bitmap path through `academic_contents_school_id_status_idx`: 6,000 target rows, one loop, 134 heap buffer hits.
- Revisions use `academic_content_revisions_term_id_school_id_idx`: 6,060 target rows visited once; Student retains 2,858 and removes 3,202 by filter, Parent retains 3,387 and removes 2,673; 214 heap hits. The foreign School's revisions are excluded by the bitmap path.
- Publications use existing `acc_publication_one_active_per_content_idx`, one candidate per content: 2,858 Student loops / 3,387 Parent loops, about one row per loop, no reported filter removals. The planner chooses this path instead of the existing publication runtime scheduling indexes for these recipient predicates.
- Student targets use `academic_content_revision_targets_school_id_revision_id_idx`, 2,178 selective loops, 6,534 hits. The subject case reports zero retained / one removed per loop on average; PostgreSQL rounds per-loop row counters. Multiplying average rows by loops is an estimate, not an exact row census.
- Parent targets use a **single** scan of 12,120 rows for a hashed subplan, 282 hits. The general case retains 6,060/removes 6,060; the subject case retains 2,061/removes 10,059. This scan is not repeated for each publication. At the fixture's 50% School selectivity it is a defensible alternative to thousands of target probes.
- Subject allocations are scanned once (four rows; two retained/two removed, one buffer hit), rather than repeatedly per publication. Current enrollment and Guardian-link relations each have two rows and one scan/loop. Tiny hierarchy/actor tables also use inexpensive single scans.

**Index change required: NO.** The observed plans contain selective content/revision bitmap paths, existing active-publication and Student-target indexes, one hashed Parent-target pass, small memory sorts and no disk spill. They do not establish a material repeated lookup, avoidable expensive sort or publication corpus scan requiring another index. No candidate index is created, so before/after index comparison is not applicable. Future data distributions may justify a fresh measurement; this fixture does not prove all possible production distributions.

`PRISMA_SCHEMA_CHANGE=NO`, `NEW_MIGRATION=NO`, `MIGRATION_COUNT=26`; latest migration remains `20261006155322_file_live_reference_integrity`. Migration 27 is not manufactured. The disposable regression harness replays the existing migrations; new-migration governance and second-deploy gates are not applicable.

## Communication navigation contract

The navigation suite persists Communication notifications and uses the real notification repository, center and presenter, followed by the existing Student/Parent access adapters, access services, current-access service, recipient repository and detail presenters. Request context represents an already authenticated recipient; existing HTTP/security regressions cover the route boundary.

- Student uses `deepLink.academicContentId` with the existing detail use case behind `GET /api/v1/student/academic-content/:contentId`. An old notification publication ID resolves to the current visible successor publication/revision.
- A Parent single-child link uses its `studentId` and durable content ID with the existing child detail use case/route.
- A Parent multi-child link has `studentId=null`; the existing accessible-children resolver returns current authorized children, then each existing child detail returns the successor. The second child is accessible despite having no historical recipient row.
- Removing the first child's Guardian link removes it from the resolver and denies its detail, while the notification metadata and historical recipient remain. Withdrawn Student enrollment similarly denies navigation. Foreign-School content identifiers in owned notification metadata receive a non-disclosing 404.

The historical `publicationId` remains in the Communication contract; it is not an authorization key and does not force obsolete detail. No route or duplicate resolver is added.

## Canonical reference-data bootstrap

The existing PostgreSQL reference-data integration test exercises `BootstrapAuthorizationReferenceDataUseCase` and `AuthorizationReferenceDataRepository`, including the canonical permission/role application paths. After intentionally missing/corrupting canonical reference data, the first bootstrap repairs it; a second run returns the same successful result and identical reference semantic state.

ACC-10E adds explicit persisted checks after **both** runs:

- Student and Parent Academic Content grants: exactly `academics.academic_content.view`.
- Teacher Academic Content grants: exactly view/manage/publish.
- Every management role matches its complete current canonical grant set.
- Permission-code duplicates: zero; persisted role/permission-pair duplicates: zero.

The existing protected-state assertions preserve all sentinel User/credential fields, membership, custom role, School and Organization fields plus global User/membership/School/Organization counts across each operation. Both results report `userMutation=false`. Canonical permission/role catalogs and deployed CLI environment guards remain unchanged. Only the disposable database is bootstrapped.

## Verification and boundaries

Evidence is retained under ignored `coverage/acc10e/`, bound to the reviewed file hashes before commit. Exact-head CI is collected after the single normal commit/push and Draft PR creation; its canonical run summary is reported in the PR and final implementation evidence, rather than predicted here.

| Local gate                                                                        | Result                                                                                  |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Scale + navigation + canonical bootstrap                                          | PASS: 3 suites / 49 tests / 0 skipped; cleanup PASS                                     |
| Recipient, permission, Communication and runtime unit regression                  | PASS: 10 suites / 103 tests / 0 skipped                                                 |
| ACC-10A/B/C/D + publication/app notification integration                          | PASS: 6 suites / 289 tests / 0 skipped; cleanup PASS                                    |
| Student/Parent security, final closeout and generic File boundary                 | PASS: 6 suites / 144 tests / 0 skipped; cleanup PASS                                    |
| Teacher ACC read/authoring/files/workflow, security/closeout and ACC-9 regression | PASS: 7 suites / 302 tests / 0 skipped; cleanup PASS                                    |
| Production typecheck (`tsconfig.build.json`, no emit)                             | PASS                                                                                    |
| Production build                                                                  | PASS                                                                                    |
| Prisma validate / generate                                                        | PASS                                                                                    |
| Migration governance tests / frozen migration check                               | PASS: 39 tests; 26 active / 0 new migrations                                            |
| Changed TypeScript ESLint                                                         | clean PASS: base 0 errors / 0 warnings; candidate 0 / 0; introduced and removed 0       |
| Changed-test TypeScript comparison                                                | PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION: base 1 / candidate 1; introduced and removed 0 |

The inherited TypeScript diagnostic is TS2345 at `test/integration/reference-data-bootstrap.integration.spec.ts:315`: the existing `createInitialPlatformAdministrator` test input lacks `environment`. Its file/line/column/code/message are identical against the authoritative base. It is retained under the brief's Section 27 comparison policy; **clean changed-test typecheck PASS is not claimed**. All three new TypeScript files have no lint or TypeScript diagnostics. Full unfiltered baseline/candidate diagnostic reports and line mappings are retained; no suppression or configuration change is added. A new array-inference diagnostic discovered during development was corrected solely with a type annotation; retained transpilation evidence proves identical emitted JavaScript to the passing scale run.

The five focused Jest groups total **32 suites / 887 tests**, with **zero skipped tests**. Their final shard evidence records PASS and cleanup PASS; all database phases replay the frozen 26 migrations on fresh disposable PostgreSQL. Production typecheck/build and the static comparison exit codes are zero. The 39 migration-governance tests are additional to the Jest total.

Two initial local fixture runs were classified as test defects: the seed used audience combinations rejected by the existing content-type check constraint. The fixture now honors every type/audience rule. These runs and their cleanup evidence remain retained; the successful 49-test run is the completion authority. No production correction was needed.

Route inventory exactly matches base: Student **105** (72 GET/33 non-GET), Parent **77** (65 GET/12 non-GET), Teacher **149** (79 GET/70 non-GET). New routes: **0** in each family. Runtime contracts retain Core consumers **8**, Media consumers **1**, maintenance repeats **9**, API consumers/schedules **0/0**. Permission catalogs, bootstrap implementation, schema/migrations, runtime, infrastructure, CI router and classifier have no production diff.

ACC-10E remains **INCOMPLETE_PENDING_BACKEND_ACCEPTANCE** after implementation evidence. ACC-10F's full closeout matrix and ACC-11 are outside this slice. No Ready, merge, deployment or production mutation is performed.
