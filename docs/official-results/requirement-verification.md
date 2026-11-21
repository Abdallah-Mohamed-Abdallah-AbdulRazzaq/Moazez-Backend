# Official Results requirement and verification map

The normative acceptance entries and actual outcomes are in [acceptance-matrix.json](../../verification/acceptance-matrix.json). The [phase ledger](../../verification/implementation-ledger.json) binds the recorded checks and migration evidence to implementation commits. The API's [generated OpenAPI](openapi.json) covers every approved catalog operation and the two documented archive access-revocation operations.

| Requirement | Implementation | Direct acceptance evidence |
| --- | --- | --- |
| R01 Independent results | Canonical `ResultSheet` and `ResultSlot`, typed cells and append-only revisions. Assessment, homework, behavior and reinforcement grades stay in their original stores. | T001 and T088 |
| R02 Standard and freeform sheets | Template and design services with accepted and draft pointers, preview/adoption, and versioned field mappings. | T004, T008, T016–T025 |
| R03 Starter and copy | MOAZEZ starter definition, source lineage, school clone logic and normalized field identities. | T016–T023 |
| R04 Academic selectors | Scope resolver and export planner intersect school, stage, grade, section, classrooms, period and resulting offered groups. | T002, T007, T019, T057–T061 |
| R05 Current roster | Academic period, enrollment, validated school membership, allocated teacher/subject/class tuples, reconcile and placement revision history. | T003, T005–T007, T013–T015, T067 |
| R06 Dynamic field types | Typed values and calculated fields, reasoned states, custom group identity and accepted field protections. | T026–T038, T065–T066 |
| R07 Policy | Versioned MANAGED/AUTONOMOUS modes, typed scoped overrides, reasoned lifecycle, rollout controls. | T008–T015, T096, T098 |
| R08 Current scope | Exact tenant/teacher authorization across gradebook, exports/imports, history and archival controls. | T007, T013–T015, T060, T064, T085, T090 |
| R09 Managed teaching | Draft definition and grade writes under teacher scope and current protection, school decision gates official publication. | T008–T010, T023, T099 |
| R10 Publication policy | Frozen candidate, accepted review and direct-publication mode with exact current authority. | T039–T046 |
| R11 Draft versus published | Actual draft revisions independent of immutable releases and active publication pointers. | T039, T043–T049, T075 |
| R12 Corrections and audit | Exact correction snapshot, new publication revision, prior version, history, correction-window control and revocation. | T043–T047, T051–T056, T085–T087 |
| R13 Selected units | Configured disjoint releases and atomic topology replacement; completeness survives family projection. | T042, T049, T097 |
| R14 Calculations | Exact fractions, rounding/scales, availability, eligible weights and current aggregate dependency tracking. | T026–T038, T054 |
| R15 Populated export | Real roster, display and academic context, selected field columns, homogeneous parts and private files. | T057, T058, T061 |
| R16 Durable file identity | Unique bounded names, private export manifests and row refs, stable scope/definition/placement/versions. | T057, T059, T061 |
| R17 Import review and commit | Private immutable source versions, exact header/identity matching, typed command validation, three-way merge, paged diff, explicit acknowledgment and fenced atomic per-sheet CAS. | T062–T080, T100–T101 |
| R18 Same bulk flow by scope | Teacher and school API surfaces run the same planner and validator with current permissions and exact tuples. | T058–T060, T064, T078 |
| R19 XLSX and CSV | Shared manifest and semantic/write pipeline, native bounded Open XML adapter and reversible CSV text codec. | T081–T084 |
| R20 Draft editing | Grid and per-student operations, per-cell expected versions, explicit bulk changes and audited undo. | T026, T035–T038 |
| R21 Staff operational experience | Reusable templates, scoped missing report, typed revision history and same-presenter family preview. | T017, T026, T048, T085 |
| R22 Archives | Archived lifecycles, retained verified ownership, reasoned windows and frozen published snapshots. | T051–T053, T086–T087, T098 |
| R23 Flexible family reads | Dynamic typed family result API with explicit audience, release units and retained historical proof. | T048–T056 |
| R24 Security and reliability | Scoped constraints and guards, release/retention/notification jobs, governed migration chain and acceptance suites. | T088–T096, T100–T101 |
| R25 Ordered delivery | Phase-ledger, source commits, validation receipts, stacked Draft PRs and operator/client handoff. | Ledger and this map |
| R26 Deferred certificates | Certificate generation, PDF, signing and QR verification remain a separate feature. | Outside this delivery |
