# ST14 governed migration and data integrity handoff

Starting Main SHA: `789fb5311a0d2a182468808b6aafe050ae72164e`. ST14 changes no Prisma schema, migration SQL, manifest, role policy, seed or migration/deployment runner. This document prepares a future separately authorized DevOps review; it executes no live migration.

## Immutable source identity

| Item | Exact source identity |
| --- | --- |
| Active migration count | **39**: 28 before this modernization +11 verified additions |
| Latest directory | `20261031120322_st12_grades_review_release_scoring` |
| Latest SQL SHA256 | `3311350d985bf0ea9e958639cbbc3d89297ddf5bed8a6b32ea4906b4a6abda22` |
| Prisma schema SHA256 | `34ae0228e6cb7d009677872d7864e4929fb92dfe5a90516215275873c1dd9997` |
| Manifest **file-byte** SHA256 | `9c2a757aa83d581df075ed73e954056c4aa2738023b1220181a763e80f99d8e8` |
| Manifest **internal aggregateMigrationChainSha256** | `00236bbdfa80b6f26effc04574841d92fc6fa18f31a93ae1a83bf45f16119214` |

The manifest file hash is not its internal chain hash or embedded schema hash. [The exact manifest](../../config/deployment/migration-artifact-manifest.json) owns schema/config/migration byte identities; [ST14 evidence](st14-evidence-index.json) records independent file-byte hashes for all 39 SQL files, schema, manifest and unchanged requirement matrices. Final scope verification must compare every protected byte to Starting Main. The ST12 pre-merge EOF-only exception is completed history; its approved corrected checksum above remains preserved and authorizes no future applied-migration edit.

## Additions by accepted stage

These additions were verified from each real merge's first-parent diff, not inferred from a title or a stacked PR's aggregate diff. [Stage register](st14-stage-history.csv) and [GitHub evidence](st14-evidence-index.json) supply exact PR, merge SHA and CI provenance.

| Stage / PR | Added immutable migrations |
| --- | --- |
| Before ST00 | 28 preexisting entries in the canonical manifest |
| ST03 / PR215 | `20261024085802_assessment_media_upload_purposes`; `20261024085803_assessment_media_foundation` |
| ST05 / PR217 | `20261024200456_homework_grades_asset_relations_foundation` |
| ST08-A / PR221 | `20261025223827_safe_rich_content_v1_foundation` |
| ST09-A / PR225 | `20261027194623_st09a_homework_typed_foundation` |
| ST10-A / PR227 | `20261028184644_st10a_question_types_foundation` |
| ST11-A / PR229 | `20261030131316_st11a_answer_response_and_provenance`; `20261030141000_st11a_answer_media_history_guards`; `20261030141931_st11a_answer_asset_creator_guard` |
| ST11-B / PR230 | `20261030163220_st11b_multipart_question_groups` |
| ST12 / PR231 | `20261031120322_st12_grades_review_release_scoring` |
| ST00/01/02/04/06/07, ST08-B/C, ST09-B/C, ST10-B, ST13, ST14 | No additional migration |

## Structural and historical integrity

[MIGRATION_GOVERNANCE](../../MIGRATION_GOVERNANCE.md), [Prisma conventions](../../PRISMA_CONVENTIONS.md), [custom SQL inventory](../database/migration-custom-sql-inventory.md), [ADR-0018](../../adr/ADR-0018-homework-grades-asset-relations-foundation.md), [ADR-0023](../../adr/ADR-0023-question-bound-answer-media.md), [ADR-0024](../../adr/ADR-0024-non-answerable-multipart-question-groups.md) and [ADR-0025](../../adr/ADR-0025-scoped-grades-authoring-review-release-and-scoring.md) remain authoritative.

The schema retains independent Homework/Grades ancestry and restrictive composite School/exact-parent/File FKs, immutable source/creator binding, live-File linking guards, append-only answer upload intents/global claims and historical reference retention. Group membership guards prohibit cross-parent/School/deleted-group moves and resurrection; groups own no answers/marks. ST12 adds versioned release policy, current-key approvals and immutable scoring evidence with restrictive relationships and safe audited decisions. Nullable legacy Rich/type/claim/enrollment representations are preserved; there is no historical answer/mark/backfill rewrite.

Prisma drift comparison does not model every partial index, CHECK, invoker function, search-path/ACL or trigger. Verify custom SQL independently using the governed inventory and actual PostgreSQL catalogs/negative behavior. ST13's accepted isolated source evidence records 803 FKs, 124 public CHECKs and 54 user triggers; these are dated observations, not a command to manufacture that count in a live database. Retain exact checksums, partial approval uniqueness, immutable/retention guards and no new PUBLIC/runtime function privileges.

## Existing replay, privileges and compatibility evidence

[ST13 certification](st13-certification-report.md) and merged-main [CI 41286544889 attempt 1](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/actions/runs/41286544889) establish the accepted source baseline. ST13 reports actual owned PostgreSQL 16 fresh replay, Prisma validation/generation/status, all applied checksums, second-deploy no-op, supported drift comparison, historical ST11/ST12 upgrade row/mark preservation and restrictive custom-SQL behavior. Its actual durable G01/G04 stages prove migration ownership and runtime DDL denials; legacy compatibility aliases alone are not that execution proof.

ST14's focused metadata HTTP verification uses a **new isolated disposable database**, replays all 39 migrations, checks Prisma status and proves the second deployment is a no-op. Test seeding is isolated and separate from SQL deployment; no deployed Migration Job seed is implied. Its exact results and ownership-verified cleanup are in the external delivery receipt. Fresh final-head CI must independently verify applicable migration governance, actual G01/G04 durable stages and cleanup before recommending this candidate. A prior-head artifact is insufficient.

Runtime identities remain exact `moazez_api`, `moazez_core_worker`, `moazez_media_worker` under the existing policy; DML-only application access, no DDL/ownership/admin/role impersonation or `_prisma_migrations` access. `moazez_migration` alone owns governed schema objects under its constrained role. The Maintenance Scheduler owns no database. [ADR-0005](../../adr/ADR-0005-cloud-sql-runtime-connections-and-database-role-boundary.md), [role policies](../../config/deployment) and actual durable CI define precise grants and connection limits. Local privilege proof is not a live Cloud SQL IAM/TLS/provider inspection.

## Future eligible deployed mutation path

[ADR-0007](../../adr/ADR-0007-migration-job-and-deployment-ordering.md) and [run-governed-migration-job.cjs](../../scripts/migrations/run-governed-migration-job.cjs) define the sole deployed schema-mutation path. The fixed runner executes manifest preflight, Prisma validate, migrate deploy, status and read-only drift verification without Nest bootstrap or seed. It binds the same immutable final application digest used by compatible runtimes, execution-specific approval/backup/data-authority references, `moazez_migration`, connection allowance 2, one task, parallelism 1, zero automatic retries and 20-minute timeout. It rejects malformed schema/search-path/options before DB access. This describes existing source, not permission to invoke it.

Before any independently authorized execution, Owner and DevOps must approve:

1. Current eligible environment, control source, exact artifact provenance/digest/embedded manifest and data authority. Retired Staging/nonprod is not eligible; [ADR-0016](../../adr/ADR-0016-staging-retirement-and-production-preservation.md) prevents reactivation. Any replacement needs separate approval and a target-eligible governed procedure.
2. Current in-place data preservation under [ADR-0006](../../adr/ADR-0006-production-data-source-object-storage-and-signed-capability-boundary.md), not the superseded clean-start branch. Preserve existing PostgreSQL and both authoritative object resources; no object copy/reseed, database replacement or destructive bootstrap.
3. Tested encrypted backup/PITR and approved isolated restore checkpoint, retention, recovery responsibility, data residency, restoration compatibility and RPO/RTO acceptance. A backup reference alone is not a restore rehearsal. Never use Production data in an unapproved QA environment.
4. Fresh or approved restored disposable rehearsal of the **exact artifact**: migration history/status/checksums, custom SQL, privileges, legacy rows/marks, second no-op, drift, locks, storage identities and runtime compatibility. Review additive enum/FK/trigger locks and required deployment/resource capacity. No inferred automatic online-safety claim.
5. Unique execution-specific approval and observed target identity; bounded migration credentials distinct from runtime, pool allowance, protected network/TLS, and the governed artifact → backup/data checkpoint → migration → verified DB → compatible roles → protected readiness/smoke order. Failure blocks every later step and traffic promotion.

## Stop, recovery and post-deployment verification

Any checksum/history divergence, drift, failed migration/P3009, reset request, manifest tampering, unexpected SQL/custom object/privilege, data loss or high-impact locking is a hard stop. Preserve output and target/artifact/migration identity without secrets. Do not edit applied SQL, `_prisma_migrations`, resolve checksums, invoke schema push, manual DDL, reset/reseed shared data or retry through application startup.

Recovery is an independently approved compatible forward-fix migration or isolated restore under current data authority. Runtime rollback is permitted only to an approved immutable artifact compatible with the actual schema/data and queue/provider state. There is no automatic down migration, destructive schema rollback or reapplication of altered prior SQL. Backup/PITR restoration is a separate data-bearing decision with integrity/reconciliation and write-authority control.

Following any future approved migration, DevOps/Backend must retain actual runner output/exit/timeout, applied row/checksum/status inventory, zero-drift and custom-SQL/ACL checks, current history and legacy data fingerprints, DML/DDL-denial proof, worker/scheduler exclusivity and protected readiness. Execute scoped authenticated author/student/reviewer/release/sync smoke with safe synthetic records as separately allowed; verify audit atomicity, existing marks/GradeItems and private File references. Observe bounded DB/transaction/queue/resource health against approved budgets before traffic authority can be considered. Record cleanup of owned rehearsal resources and preserve migration/source/evidence bytes.

`MIGRATIONS=39_PRESERVED`; `NEW_MIGRATION=NO`; `LIVE_MIGRATION=NO`; `PRODUCTION_DATA_MUTATION=NO`. Those source-preservation claims must be rechecked against the exact final candidate; no deployed data or provider state was mutated or certified by ST14.
