# ADR-0016: Staging Retirement and Production Preservation

## Status and authority

Accepted for bounded repository source implementation by the Owner-dispatched independent Backend Engineering decisions of 2026-10-17. This decision authorizes no cloud, live Terraform, database, merge or deployment operation. Immutable engineering baseline: 8449769bcb453dd3ac8436d2b71c133e6369f6fa.

The DevOps handoff reports Staging project moazez-nonprod-91001421934 (number375161231141), billing disabled, lifecycle DELETE_REQUESTED and DNS removed, with reactivation unauthorized. DELETE_REQUESTED does not establish completed physical deletion. Production project moazez-production (number91001421934) remains active according to that handoff. No cloud facts were queried in this source change.

## Decision

Remove exactly the eleven retired Terraform roots and two dedicated Staging workflows listed in the frozen test-only source policy. Retire operational Staging Release authority permanently, including exported mutators, while preserving non-authorizing pure reviewers and the shared release sequence contract. Capacity, migration and storage entrypoints reject retired or forged targets before Git/evidence, provider, Prisma or database effects. Bootstrap CLIs always invoke the real Production validator before any optional injected hook or application initialization.

All eleven shared Terraform environment selectors require explicit, non-null, exact Production and have no default. Ten modules retain their real project_id inputs and independently reject the retired project identity. B-002 approves the runtime exception: runtime-environment has no project_id input; its unchanged closed map derives Production identity from environment. Do not add a project input or change its map, resource bodies, outputs or Production caller. Its four runtime resources continue using local.selected.project_id. Retained Staging map data does not authorize selecting it.

Generic application environment types, CORS isolation, tenancy, authorization, storage/encryption contracts and upload staging business logic remain valid compatibility/security source. Retirement is enforced at operational authority boundaries, not through global text replacement.

## B-001: historical storage acceptance authority

The legacy gcs-batch2-readonly-proof.ps1 path is historical-only and permanently refuses all valid invocations with LEGACY_STORAGE_PROOF_RETIRED, including explicit Production and dot-sourcing. It exposes no parameters or callable cloud functions and performs no command discovery, authentication, bucket/object/IAM inspection or evidence write. Historical logic is available only as immutable Git source and isolated synthetic test functions, never as a runtime mode or bypass.

Its historical production_bucket_not_clean_start empty-bucket prerequisite is superseded as current authority. ADR-0006 and config/deployment/production-data-branch.contract.json remain unchanged and select IN_PLACE_LIVE_PRODUCTION: preserve existing PostgreSQL and object data; no object copy/reseed, clearing, moving or planned destructive cutover. Existing data is never an error to remediate for an obsolete proof.

The separate gcs-batch2-preflight.ps1 requires explicit case-sensitive production, rejects other/omitted targets before command resolution/authentication, and permits only its exact existing Production read-only command vectors. Its schemaVersion2 contains the preserved Production subreport, authentication and inspection status, and READY_FOR_NONPROD_TERRAFORM_PLAN=NO. This is limited read-only inspection, not a complete replacement for historical IAM/CORS acceptance. A modern Production-wide storage compliance proof requires a separate governance decision.

## Historical evidence and current regression obligations

Existing ADRs, dated runbooks and closeouts remain historical evidence, not current operator authorization. Historical positive/negative Staging tests read the exact baseline explicitly; absence at HEAD never triggers a fallback. The FR-07B historical diff uses1225cb0107dbcbadfae5cd51d89747a480cc9d62..8449769bcb453dd3ac8436d2b71c133e6369f6fa. Current Teacher immutable image validation remains on current source, alongside NR11/T6.9 historical endpoints and a current Production source parity guard.

Keep all401 reviewed named test blocks,2373 assertion obligations and52 historical Terraform mock runs reproducible. Current module mock suites mirror reusable Production obligations and add retired/unknown/null/case selector failures; missing-input fixtures reject omission. B-001 preserves its complete22 assertion transition obligations. No skip, quarantine, missing-file fallback, branch-name bypass or weakened historical scope rule is permitted.

Preserve all999 baseline CI ownership assignments and add exactly two active TAP owners: staging-retirement-source-governance and staging-retirement-operational-governance, both runtime-governance. Candidate inventory is1001 total,991 active and10 historical/manual. Native Terraform tests are separate from Node/Jest file inventory.

## Production and external boundaries

All thirteen Production Terraform roots (79 files), twelve Production provider locks, resource bodies/addresses, provider/backend configuration, service identities, IAM, images, networks/edge, migration contracts, Prisma schema/history and application APIs remain protected by the seventeen-invariant matrix. Narrow selector/operator changes must preserve existing valid Production behavior; source parity is not live deployment acceptance.

External followups remain with DevOps: GitHub settings/environments/credential metadata and old-ref WIF eligibility; old immutable refs/images/preserved operational artifacts; frontend/operator consumers of the preflight v2 interface; and future real-provider/browser/FCM/nonproduction acceptance policy. This source change cannot revoke old refs or authorize a replacement cloud environment. No secret values or state/plan contents are evidence for this decision.
