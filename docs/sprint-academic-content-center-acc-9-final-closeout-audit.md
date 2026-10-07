# ACC-9 final bounded closeout audit

## Authority and scope

Authoritative base: `1be694fcee6b0b8cd158c35bf4a3522096d6a687`.
The clean local `main` and fetched `origin/main` matched this SHA with zero divergence before work began.
Branch: `agent/acc-9f-security-concurrency-regression-final-closeout`.
This candidate changes tests and this document only. Production source, schema, migrations,
controllers, DTOs, permissions, routes, Communication, queues, runtime, Terraform, IAM,
deployment and environment configuration are frozen. ACC-10 and ACC-11 have not started.
The accepted Phase-A audit is historical authority; this task does not restart it.

### Accepted history

All entries below are independently Backend-accepted, normally merged and covered by
the accepted exact-main state. The merge SHAs come from the current first-parent history.

| Slice | Accepted PR | Merge |
| --- | --- | --- |
| ACC-9A: contract, permissions, ownership, read | [#177](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/177) | `e5f87a5e` |
| ACC-9B: authoring and targeting | [#178](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/178) | `f3db4433` |
| ACC-9C: files, access and templates | [#179](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/179) | `73c4d242` |
| ACC-9D: workflow, publication and revision | [#180](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/180) | `14d70687` |
| ACC-9E: review decision notifications | [#181](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/181) | `d84945e0` |
| ACC-9F-R1: terminal cleanup tenant/resource claim | [#182](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/182) | `d9af0fe7` |
| ACC-9F-R2: resource final-write parent scope | [#183](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/183) | `f0521cb4` |
| ACC-9F-R3: push eligibility and notification fencing | [#184](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/184) | `28628f84` |
| ACC-9F-R4: shared File lifetime | [#185](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/185) | `f36b2c17` |
| ACC-9F-R5: READY cleanup transaction boundary | [#186](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/186) | `1be694fc` |

R5 merge parents are `f36b2c177beea9a401f59d975883b460fa192201` and
`ccd2958322ad206c37f26e0e0a028ce159e92ee0`; tree:
`0cd1f259cc9a78d0770dc086d4575c045f35da3a`.
Accepted [exact-main run 37545173592](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/actions/runs/37545173592)
was verified completed/success at that exact merge: 35/35 jobs, 35/35 checks,
26 shards, 947 discovered/executed files, no missing, duplicate, unexpected,
failed or blocked entries; parity and cleanup PASS. Downloaded canonical summary SHA-256:
`4cc0aa2f3a56f9b7fe0d3e8e5768ee0138265cbed614915a553034debe56eae4`.

## Bounded verification matrix

Initial G01–G06 classification found five groups with **missing verification**, not
product defects. G06 already had deterministic real PostgreSQL evidence accepted in R4/R5.
The additions cover 23 missing mutation-family combinations in 46 winner orders:
24 allocation races in the existing operational-write harness and 22 parent-lock races
in the final cross-slice suite. Separate connections, barriers after actual lock acquisition,
and `pg_stat_activity`/`pg_blocking_pids` establish concurrent blocking. Timeout bounds
limit broken tests; arbitrary sleeps do not establish race outcomes.

| Gap | Initial classification / accepted authority | Focused proof | Final status |
| --- | --- | --- | --- |
| G01 | MISSING_VERIFICATION | Allocation reassignment versus archive, restore, delete, links, tags, Preparation, Weekly Plan, Subject Resource and Online Session; existing Guardian Note detail coverage; both orders | PASS / COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| G02 | MISSING_VERIFICATION | Allocation reassignment versus upload intent, cancellation and unlink; both orders; final provider-phase reauthorization preserved | PASS / COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| G03 | MISSING_VERIFICATION | Actual upload completion and unlink versus submit on separate PostgreSQL connections; both revision snapshot orders | PASS / COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| G04 | MISSING_VERIFICATION | Approval versus metadata, targets and assets; prior-round changes request versus resubmit; both orders and immutable round identity | PASS / COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| G05 | MISSING_VERIFICATION | Schedule versus metadata, target, link, detail and asset mutations; both orders and captured revision graph | PASS / COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| G06 | COVERED_BY_EXISTING_SOURCE_AND_TESTS | Existing File lifetime PostgreSQL reference/capture/race and Storage/finalization retry tests | PASS / COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| G07 | Accepted R2 / D01 | Exact Approval parent predicate in workflow transitions regression | PASS |
| G08 | Accepted R2 / D02 | All five type-detail parent predicates in type-authoring regression | PASS |
| G09 | Accepted R2 / D03 | Exact Asset parent predicate in files regression | PASS |
| G10 | Accepted R2 / D04 | Exact upload purpose/context predicate in file repository and upload regression | PASS |
| G11 | Accepted R3 / D05 | Delayed push current eligibility, terminal state and tenant fencing | PASS |
| G12 | Accepted R3 / D06 | Initial generation authorization, policy and lock ordering; missing policy fails closed | PASS |
| G13 | Accepted R4/R5 / D07/D08 | Canonical retained references; cleanup-first/linker-first; committed retirement before external Storage wait and retry | PASS |

### Accepted remediation register

| Defect | Accepted remediation | Regression |
| --- | --- | --- |
| D01: Approval final parent scope | R2, CLOSED/PASS | PASS |
| D02: type-detail final parent scope | R2, CLOSED/PASS | PASS |
| D03: Asset final parent scope | R2, CLOSED/PASS | PASS |
| D04: Upload purpose/context final scope | R2, CLOSED/PASS | PASS |
| D05: push eligibility / terminal fencing | R3, CLOSED/PASS | PASS |
| D06: notification authorization / lock ordering | R3, CLOSED/PASS | PASS |
| D07: shared File reference integrity | R4, CLOSED/PASS | PASS |
| D08: READY cleanup DB / Storage boundary | R5, CLOSED/PASS | PASS |

R1 terminal claims retain persisted school, organization, purpose and resource identity.
R2 regression checks parent-qualified writes and rollback, rather than trusting an earlier lookup.
R3 retains current recipient eligibility and final notification authorization.
R4/R5 retain live-File locks and durable retirement before external deletion.

## Teacher cross-slice contract

The final suite recursively enumerates the actual AppModule controller graph, including imported
Teacher modules. Fresh inventory matches the accepted baseline: **149 Teacher routes, 37 ACC
routes, zero undecorated routes**, all four ACC Teacher controllers registered.
The live permission catalogs contain **242 permissions and 57 Teacher grants**.
ACC Teacher grants are `academics.academic_content.view`, `.manage` and `.publish`.
`.approve`, `.settings.manage` and `.analytics.view` remain withheld; no Teacher approval action.

Academic Content Core is business truth; Teacher App composes its repositories and use cases.
There is no duplicate Teacher ACC persistence. Class identity is `TeacherSubjectAllocation.id`;
academic context is derived on the server from currently owned allocations.
Existing `/api/v1/teacher/lesson-preparation` and LessonPlan remain independent of ACC
`TEACHER_PREPARATION`.

Reads require current owned-target intersection. Mutation additionally requires authorship,
every Teacher-bound target currently owned, and the current status/policy.
Targeted School-created content is readable and read-only for Teachers. Other-Teacher,
mixed-ownership and reassigned-away aggregates cannot be mutated. Historical revision,
publication or approval identity grants no current authority. Focused read, authoring,
files, workflow and HTTP tenancy tests preserve school and cross-Teacher isolation.

Composition covers metadata, all typed details, links, tags, readiness, initial targets,
Preparation templates, resumable uploads, cancellation, unlink and current/revision asset access.
Resource authorization precedes signed capability issuance; raw Storage URLs are not returned.
Workflow composition covers submit/resubmit, approval history, readiness, audience preview,
publish/schedule, unschedule, withdraw, revision start and significant update.
Teacher Preparation remains ineligible for external publication.

Communication remains notification truth and the Teacher notification center. The existing
`academic_content` preference/category serves APPROVED and CHANGES_REQUESTED notifications.
Approval identity produces deterministic job IDs; the review-decision PostgreSQL suite verifies
idempotency and durable recovery. No parallel notification persistence or center is introduced.

## File, transaction, migration and runtime contracts

The existing canonical File inventory and PostgreSQL tests govern **22 physical File FKs**,
**21 retention relations** and no FileUploadSession retention authority. One live-File trigger
function covers **22/22** FKs with zero unguarded references. Cleanup-first rejects stale linking;
linker-first retains the object. Revision capture retains File references.
READY cleanup commits File retirement before Storage deletion, waits for Storage outside the
database transaction and retries both Storage failure and successful deletion followed by
failed DB finalization. No stale File reference may survive purge.

Repository transaction governance is run unchanged, including the accepted R5 classifier.
The inventory contains 229 transactions, zero unknown calls, zero unresolved calls and zero
external waits inside transactions. READY cleanup has no external
Storage wait inside a DB transaction. No classifier or transaction production code is changed.

Migration count remains **26**, latest `20261006155322_file_live_reference_integrity`.
Schema, historical migrations and manifest are unchanged; there is no migration 27.
Normal migration governance/check and canonical CI replay supply migration evidence.
No `db push`, `migrate resolve`, custom migration framework or machine-level probe is used.

Runtime remains **8 Core consumers, 1 Media consumer, 9 maintenance repeats**, and
**0 API consumers / 0 API schedules**. No new queue, worker, consumer or repeat is added.

## Verification and candidate state

Local evidence is retained under ignored `coverage/acc9-final-closeout/` in this worktree.
The existing repository CI shard runner owns and cleans its PostgreSQL/Redis/MinIO fixtures.
Local execution reuses installed dependencies and resolves Windows batch commands to their
Node entry points; the already generated client is reused only after its generated schema
matches the unchanged repository schema. Canonical GitHub CI uses its normal unchanged workflow.

| Local gate | Result |
| --- | --- |
| Existing focused unit tests | PASS: 268 tests / 13 suites |
| Teacher/read/authoring/files/workflow/notification/lifetime/tenancy regression | PASS: 440 tests / 14 suites |
| New final cross-slice suite | PASS: 30 tests, including 22 actual PostgreSQL races |
| Allocation operational-write harness | PASS: 1 wrapper test containing all original cases and 24 added race orders |
| Focused Jest total | PASS: 739 tests / 29 suites; zero skipped |
| PostgreSQL subset | PASS: 380 Jest tests / 13 suites; the allocation wrapper contains multiple race cases |
| Migration and transaction governance tests | PASS: 213 tests; unchanged classifiers |
| Transaction inventory | PASS: 229 transactions; unknown=0, unresolved=0, external wait inside=0 |
| Migration check | PASS: active=26, new=0, rebaseline=off |
| Prisma validate / generate | PASS / PASS |
| Production typecheck / changed-test typecheck | PASS / PASS |
| Build / postbuild contract | PASS / PASS |
| Every changed TS/test file ESLint | PASS: errors=0, warnings=0; no suppression |
| Diff check / production freeze | PASS / PASS |
| Missing verification | Initial=5 groups; final=0 |
| Real product defects | 0 |

Production typechecking uses the repository `tsconfig.build.json`; a local config also checks
the three changed test files. A supplementary whole-tree `tsconfig.json` invocation reported
unrelated existing test type errors; those files were not changed. Both scoped typecheck gates
pass with zero diagnostics. Failed local attempts are retained: Windows launcher/client locking,
test barrier matching, fixture timeout/cleanup and a legacy fixture counter were corrected only
in test execution or tests. The original upload asset counter and zero expectation remain intact,
before new fixtures that intentionally retain an asset after legitimate reassignment. The new
unlink cases independently prove rejection and no mutation by the former owner.

All successful owned fixture runs verify cleanup PASS. The standalone cross-slice result is
the 30 successful cases in the second gap run; the allocation harness's final clean run is
`allocation-attempt-3-evidence.json`. R1–R5 and D01–D08 narrow regression PASS.
Canonical candidate evidence is recorded in the Draft PR after the one normal commit/push;
CI identity and live paginated job/check totals must match that remote head.

Deferred: copy/reuse, custom folders, Ask Teacher context, advanced digests and zero-downtime
published revision replacement. These remain deferred scope, not defects.

Candidate local verification state: **PASS**. Exact candidate CI remains a prerequisite for
the final Codex result and is recorded externally with the immutable candidate commit:

```text
ACC_9F=PASS/READY_FOR_INDEPENDENT_REVIEW
ACC_9=IN_PROGRESS/PENDING_ACC_9F_FINAL_CLOSEOUT_MERGE_AND_EXACT_MAIN_CI
ACC_10_STARTED=NO
ACC_11_STARTED=NO
READY_PRESSED=NO
MERGED=NO
DEPLOYED=NO
PRODUCTION_MUTATION=NO
```

ACC-9 is not fully closed until independent Backend review, owner Ready action, normal merge
of this final closeout PR and successful exact-main CI. Codex PASS does not equal Backend acceptance.
