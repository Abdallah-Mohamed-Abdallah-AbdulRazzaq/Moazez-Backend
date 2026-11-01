# MOAZEZ — Homework & Assessments Modernization V1.0 — Final Backend Closeout

Mandate: `MOAZEZ-ST14-FINAL-PROGRAM-CLOSEOUT-2026-11-01`. Starting Main SHA and certified merged Backend source: `789fb5311a0d2a182468808b6aafe050ae72164e`. Node: `v22.23.1`. This is the ST14 **candidate for independent Backend Engineering review**, not final Planning acceptance, an operational release or a merged-main receipt.

The Owner's current mandate accepts ST00–ST13 as CLOSED/APPROVED/PASS: fourteen of fifteen macro stages. ST14 reconciles their history, source contracts, security and operational dependencies. ST14 remains IN_PROGRESS; Engineering review and Planning final acceptance remain PENDING. Historical NEXT/STAGE/PENDING statements in earlier reports and ADRs describe their publication date and are preserved. The current Owner decision and verified GitHub history supersede those mutable historical statuses without rewriting architectural decisions.

## Delivered goals and remaining authority

The original goals were secure owner-bound files; distinct, complete question interactions; safe scientific/bilingual display; independent Homework and Grades authoring and student lifecycles; manual review plus explicit scoring decisions; and evidence-based certification. The delivered source supports eleven distinct question types in each domain, question/assessment/group assets, six question-bound File/Audio response modes, non-answerable multipart groups, scoped opt-in Teacher Grades authoring, current key approval, independent audience release, deterministic suggestions and explicit GradeItem synchronization.

This package changes documentation and the demonstrated Teacher sync OpenAPI response annotation only. It adds no business behavior, type, permission, release level, architecture, schema, migration, feature flag, worker, workflow/routing/aggregator change or Production configuration. No historical report/ADR is rewritten. No release tag is created.

| Authority/outcome | Current classification | Evidence or remaining condition |
| --- | --- | --- |
| BACKEND_SOURCE_COMPLETION | ST00–ST13 accepted; ST14 candidate complete only after final external verification | Owner mandate; [history](st14-stage-history.csv); independent ST14 review pending |
| BACKEND_SOURCE_CERTIFICATION | ST13 PASS; ST14 exact-head CI must be verified in the external delivery receipt | [ST13 report](st13-certification-report.md); merged-main [CI 41286544889 attempt 1](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/actions/runs/41286544889) |
| CLIENT_INTEGRATION_CERTIFICATION | NOT_RUN / NOT_CERTIFIED | Actual Dashboard/Teacher/Student/Parent builds and product journeys required |
| STAGING_EXECUTION_APPROVAL | NOT_AUTHORIZED; planning may be CONDITIONAL_READY | Eligible independently approved target required; retired Staging cannot reactivate |
| PRODUCTION_PROMOTION_APPROVAL | NOT_AUTHORIZED | Separate Owner/DevOps release, data, capacity and product authority |
| MEDIA_OPERATIONAL_RELEASE | DR07 PENDING | Real provider/scanner/security/runtime evidence and separate release approval |

## Program chronology and evidence

[The 15-row machine-readable history](st14-stage-history.csv) records ST00–ST14 scope, acceptance authority, actual PRs, head/merge SHAs, CI event/attempt/result, migrations, ADRs, contracts and risks. [The evidence index](st14-evidence-index.json) contains the retrieved GitHub facts, immutable source checksums and actual before/after OpenAPI operations. Twenty merged PRs (#213–#232) are associated with fourteen completed macro stages; PR count is not stage count. Every retrieved merge is an ancestor of Starting Main.

ST02 deliberately preceded ST01. ST07's original merged run `40208771396` failed; repair PR220's merged run `40222087391` passed. ST08-B's original merged run `40466265664` failed; repair PR223's merged run `40482170550` passed. Those failures are retained, not relabeled as successful original-head runs. ST08 ownership is A shared foundation, B Grades integration, C Homework integration and final cross-domain verification. ST11-A/B migration counts use each merge's first-parent diff so stacked A changes are not counted twice.

ST00 was read-only discovery at `5a16a5e061c333b1160bc90afa4d391e9a41238e`, with no implementation PR or runtime execution. The approved external ST00 handoff has SHA256 `8324a10a8ad7ae7679e09cf8b28b3ba03d202b1e553e459b197f7f5e3c9ffb40`; [baseline CI 39280231099 attempt 2](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/actions/runs/39280231099) is historical CI, not a new ST00 test run. Current ST00 acceptance comes from the Owner mandate. ST14 does not manufacture earlier individual Reviewer Receipts.

## Requirement closure

The immutable [requirements CSV](st13-requirements-traceability.csv) retains Q-01–Q-16, FM-01–FM-13 and F-12: **30/30 PASS at ST13**. The immutable [coverage CSV](st13-question-actor-state-coverage.csv) contains 189 meaningful classes: VALID 171, INVALID 14, UNSUPPORTED 2, IMPOSSIBLE 2. Supported/expected-denial PASS=185; justified NOT_APPLICABLE=4. INVALID means an expected denial was proved. These are not Cartesian-product coverage percentages. ST14 validates both files' exact starting hashes and structure, not a new runtime certification of all requirements.

F-12 is reproduced exactly:

> Legacy test infrastructure available; new actor/type/asset/codec coverage and runtime proof absent — FM13 / ST13.

Its provenance is the approved ST00 **regrouped program-level gap mapping**, linked to FM-13 and ST13 Full Certification. `F12_ST00_PROGRAM_AUTHORITY=APPROVED`; `F12_ORIGINAL_VERBATIM_WORDING=NOT_INDEPENDENTLY_VERIFIED`. The historic wording describes a testing/runtime-evidence gap requiring certification, not proof that it remains open today. ST13 closes the supported actor/type/asset/codec/authorization/runtime obligations with actual evidence. Infrastructure existence alone did not establish PASS. Client execution and operational media approval are separate authorities, not silently converted into Backend requirement failures.

## Final architecture and source index

The modular monolith remains one repository with independent Core domains. App-facing modules compose Core behavior and audience-specific read models. PostgreSQL owns normalized business truth; scoped Prisma repositories enforce School/Organization boundaries alongside live guards and domain predicates. Binary objects remain external. See [architecture](../../ARCHITECTURE_DECISION.md), [security](../../SECURITY_MODEL.md), [ADR-0001](../../adr/ADR-0001-multi-tenancy-enforcement.md), and [Prisma conventions](../../PRISMA_CONVENTIONS.md). Current domain source and later accepted ADRs govern precise resource behavior; older generic download examples do not grant assessment byte access.

| Boundary | Current responsibilities and exact source |
| --- | --- |
| Homework identity | `HomeworkAssignment` → `HomeworkTarget` → `HomeworkSubmission` → `HomeworkSubmissionAnswer`; independent of `GradeAssessment.type=ASSIGNMENT`. [Schema](../../prisma/schema.prisma), [repository](../../src/modules/homework/infrastructure/homework.repository.ts), [submission use cases](../../src/modules/homework/application/homework-submissions.use-cases.ts) |
| Homework author/publication | Core management or exact current owned TeacherSubjectAllocation; DRAFT structural editing, complete current question/target validation before publication. [Question use cases](../../src/modules/homework/application/homework-questions.use-cases.ts), [Teacher controller](../../src/modules/teacher-app/homeworks/controller/teacher-homeworks.controller.ts), [ADR-0021](../../adr/ADR-0021-homework-eight-type-runtime-and-atomic-typed-writes.md) |
| Homework student/reviewer | Own active target/enrollment, atomic typed single/bulk/final writes; required/optional and terminal-state rules; manual answer review/rollup; legacy Parent review only; explicit supported Grade Sync. [Student controller](../../src/modules/student-app/homeworks/controller/student-homeworks.controller.ts), [review contract](st09bc-homework-eight-type-runtime-contract.md), [Parent controller](../../src/modules/parent-app/homeworks/controller/parent-homeworks.controller.ts) |
| Grades Core/Teacher | Core assessment administration remains separate from Teacher opt-in question/group/asset authoring. Exact allocation, CLASSROOM, creator, subject/year/term, live grants, DRAFT/unlocked/no-attempt fence. [Teacher authoring controller](../../src/modules/teacher-app/classroom/grades/controller/teacher-grade-authoring.controller.ts), [ADR-0025](../../adr/ADR-0025-scoped-grades-authoring-review-release-and-scoring.md) |
| Grades student answers | Assessment → current own GradeSubmission → canonical GradeSubmissionAnswer/options; exact enrollment/term and lifecycle, atomic single/bulk writes and final validation. [Submission repository](../../src/modules/grades/assessments/infrastructure/grades-submissions.repository.ts), [resource access](../../src/modules/grades/assessments/infrastructure/grades-resource-access.ts), [Student Exams](../../src/modules/student-app/exams/controller/student-exams.controller.ts) |
| Review/scoring/release | Manual review/finalization; read-only deterministic evaluation suggestions; explicit current APPLY or reasoned OVERRIDE; separately approved current keys and independent Student/Parent NONE/DETAILS/KEYS release/revocation. [Scoring controller](../../src/modules/grades/assessments/controller/grade-scoring.controller.ts), [release controller](../../src/modules/grades/assessments/controller/grade-review-management.controller.ts), [ST12 contract](st12-client-api-handoff.md) |
| Explicit GradeItem sync | Current authorization/lifecycle/GradeItem validation, upsert and audit share one scoped transaction; Core review grant and Teacher item-management grant remain distinct. [Use case](../../src/modules/grades/assessments/application/sync-grade-submission-to-grade-item.use-case.ts), [repository](../../src/modules/grades/assessments/infrastructure/grades-submission-grade-item-sync.repository.ts). Evaluation/finalization does not auto-sync |
| Media and retention | Separate domain-owned assets, exact immutable provenance/claims, private streaming and global retained references. [Assessment media](../../src/modules/files/assessment-media/assessment-media.module.ts), [private transport](../../src/infrastructure/storage/private-media-content.service.ts), [File Lifetime](../../src/modules/files/shared/infrastructure/file-lifetime.repository.ts), [ADR-0018](../../adr/ADR-0018-homework-grades-asset-relations-foundation.md), [ADR-0023](../../adr/ADR-0023-question-bound-answer-media.md) |

### Eleven distinct types in each domain

| Homework enum | Grades enum | Interaction |
| --- | --- | --- |
| SHORT_TEXT | SHORT_ANSWER | Bounded short text; eligible responseConfig family |
| LONG_TEXT | ESSAY | Bounded extended text; eligible responseConfig family |
| SINGLE_CHOICE | MCQ_SINGLE | One canonical option identity |
| MULTIPLE_CHOICE | MCQ_MULTI | Multiple canonical option identities |
| TRUE_FALSE | TRUE_FALSE | Canonical boolean-choice options |
| FILL_IN_BLANK | FILL_IN_BLANK | Stable blank IDs and bounded answers |
| MATCHING | MATCHING | Complete stable pair mapping |
| MEDIA | MEDIA | Approved stimulus plus bounded text; no arbitrary JSON/file answer mode |
| ORDERING | ORDERING | Complete permutation of stable item IDs |
| NUMERIC | NUMERIC | Exact bounded decimal strings, explicit units/comparison policy |
| MATH_EXPRESSION | MATH_EXPRESSION | Closed bounded syntax; undefined/unknown proof never implies a mark |

[ST10-B](st10b-eleven-type-runtime-contract.md) and the [shared pure evaluator](../../src/common/question-evaluation) define grammar, normalization and proof limits. Homework and Grades retain distinct wire types, null/clear representations and state machines. No inferred tolerance, unit conversion, partial-credit rule or symbolic-equivalence promise is added.

### Safe Rich AST, media and groups

[ADR-0019](../../adr/ADR-0019-safe-rich-content-contract-and-persistence.md) and the [shared V1 contract](st08-safe-rich-ast-contract.md) define closed Question/Option envelopes, paragraphs, escaped text, line breaks, emphasis, structured sub/superscripts, fractions, radicals, math, chemical species/reactions and resource asset references. Inputs are bounded (64 KiB, 1,024 containers, depth 16); arbitrary HTML/SVG/scripts/TeX/macros, URL nodes and private-key/correctness metadata are rejected. Display math/chemistry is neither an equation solver nor a scorer.

Language/direction fields support Arabic/English, RTL/LTR/auto, supported numeral scripts, alt text and captions. Clients isolate directional fragments and render structured escaped content. Valid full AST replacements and derived legacy text persist atomically. Genuine legacy display edits clear contradictory AST; historical absent/invalid/future/stale AST falls back safely without read-time repair or raw rejected JSON. Stable Grades option UUIDs do not follow array position. See [Grades integration](st08b-grades-rich-content-contract.md) and [Homework integration](st08c-homework-rich-content-contract.md).

Assignment attachments, student submission attachments, question/assessment stimulus, group stimulus and question-bound answer assets are distinct resources. The six modes are TEXT_ONLY, FILE_ONLY, AUDIO_ONLY, TEXT_OR_FILE, TEXT_AND_FILE and FILE_OR_AUDIO, only on the approved short/long text families. Final eligibility uses current bound verified assets, not stale upload counts; file-only responses need no fabricated text. Managed intent → upload → technical/security verification → READY → exact immutable binding preserves private File identity, quotas and retained history. Missing capability fails closed; test attestation is not Production malware scanning. [Answer-media contract](st11-answer-media-contract.md), [media/DevOps handoff](st14-devops-operational-handoff.md).

[ADR-0024](../../adr/ADR-0024-non-answerable-multipart-question-groups.md) governs separate non-answerable group containers. Children keep canonical question/answer identity; group points derive from active children and are never counted twice. Expected membership/version checks serialize moves; deleting a group detaches children and soft-deletes references, retaining Files. Historical flat collections remain compatible. ST12's opt-in Teacher authoring is the later accepted exception to ST11's historical Teacher group-write denial; ordinary Teacher read/review still grants no mutation authority.

## Security and authorization closure

JWT, active membership and School/Organization scope precede operation permission and exact resource authorization. `classId` in Teacher routes is **TeacherSubjectAllocation.id**, not a classroom ID. Current subject, classroom hierarchy, academic year/term, teacher identity and creator checks remain mandatory at the final transactional boundary. Same-school wrong-class or wrong-subject access is denied; so are foreign School/Organization, wrong Student and unrelated Parent access. Parent reads revalidate the current guardian/child relation and academic eligibility.

`grades.teacher_authoring.manage` exists once in the production catalog and is absent from all seven default roles, including Platform Super Admin. No new default grant exists. Opt-in possession alone grants neither broad-scope authoring nor management publication/approval. Core management, Teacher authoring, reviewer, Student and Parent projections remain distinct. Resource media cannot be replaced by general `files.downloads.view` or bare File UUID access.

Keys/correctness are author-private or explicitly approved/released. Paper approval, current key fingerprint approval and audience release are separate. NONE denies detailed review; DETAILS withholds keys; KEYS requires current approvals and target finalization. Revocation affects subsequent detailed and legacy reads and authorized media. It cannot revoke bytes legitimately downloaded earlier. Safe audits contain action/resource identity and bounded decision information, never raw keys, answers, credentials or storage coordinates. [ST13 evidence](st13-certification-report.md) covers real lock/storage barriers, concurrent permission revocation, audit rollback and legacy nullable GradeItem enrollment.

## ST13 findings and ST14 metadata reconciliation

ST13's accepted merged-main run passed 35/35 jobs, 26/26 regression shards and 1058/1058 active-file parity. Its [defect register](st13-defect-register.md) retains the reproduced/fixed stale sync lifecycle and non-atomic sync audit defects, initial local permission correction, coverage gaps, Buffer inference fix and clock-sensitive fixture repair. Zero CRITICAL/HIGH source defects remained. Historical local/failed-head provenance is not erased.

ST13-API-001's inherited description incorrectly attributed `ApiOkResponse` to both sync methods. Actual generated OpenAPI at Starting Main shows Core already has response `201` (no explicit response DTO schema); Teacher sync has `200` with `TeacherClassroomSubmissionGradeItemSyncResponseDto`. The candidate changes only that Teacher method's response decorator to `ApiCreatedResponse`, retaining the same DTO schema and established runtime 201. Core is unchanged; unrelated Teacher review/finalize metadata is unchanged. [Before/after evidence](st14-evidence-index.json) and focused authenticated sync tests in the final delivery receipt are the closure authority. The [new risk register](st14-residual-risk-register.csv) records this corrected finding without rewriting ST13 history.

## Residual risks and source-readiness recommendation

[The risk register](st14-residual-risk-register.csv) transfers each limitation to an owner and closure condition. Whole-project lint remains NOT_CERTIFIED (bounded timeout); standalone whole-project TypeScript remains NOT_CERTIFIED (heap exhaustion). Focused typing/lint delta and normal build are distinct PASS evidence. [Performance evidence](st13-performance-evidence.md) is an isolated measurement, not an approved SLO or Production capacity proof. Frontend/mobile and complete product acceptance remain untested. DR07, real scanner/provider approval, eligible QA target and Production promotion remain separately gated.

No remaining operational restriction is closed just because this document exists. [Five independent GO/NO-GO decisions](st14-go-no-go-matrix.md) distinguish Backend source review, staging planning, media, client/product and Production promotion. The recommendation is to review this bounded Backend closeout candidate after exact-head CI and artifact verification; no single overall operational GO is issued.

## Package and final acceptance index

Focused ST14 verification: actual Swagger generation before/after and from normal-build compiled controllers preserves Core 201 and the Teacher response DTO schema; existing authenticated PostgreSQL/Redis/MinIO HTTP certification passes 25/25 cases, including both sync surfaces, grant revocation, audit rollback and current lifecycle. Existing sync/review unit suites pass 19/19. Normal build/postbuild passes. Non-mutating same-path/locked-config ESLint compares exact Starting Main bytes with candidate bytes: 0 baseline errors/warnings, 0 candidate errors/warnings and 0 introduced diagnostics for the sole changed TypeScript file. Fresh owned 39-migration replay/status/second-deploy no-op and label-verified cleanup pass. These focused results do not resolve inherited whole-project lint/typecheck or operational/client limitations.

The package's additional route CSV, monitoring CSV and evidence JSON directly support the mandate's complete API contracts, signal transfer and recoverable historical/checksum/OpenAPI provenance. They add no executable runtime or CI infrastructure. The external delivery retains validation scripts, full focused results, any failed local setup/check attempts and final exact-head evidence; those task-owned logs are not placed in source.

| Artifact | Purpose |
| --- | --- |
| [Stage history](st14-stage-history.csv) | Fifteen macro stages, real PR/merge/CI/migration relationships |
| [Evidence index](st14-evidence-index.json) | Retrieved immutable historical facts, protected-file hashes and OpenAPI evidence |
| [Client handoff](st14-final-client-api-handoff.md) / [route register](st14-client-route-register.csv) | Source-verified contracts, ownership, DTOs, status, journeys and client responsibilities |
| [DevOps handoff](st14-devops-operational-handoff.md) | Target approval, runtime/media/DR07, monitoring, capacity, verification and rollback dependencies |
| [Migration/data handoff](st14-migration-data-integrity-handoff.md) | Immutable 39-chain, true manifest-file hash, deployed-role and data-preservation authority |
| [Risk register](st14-residual-risk-register.csv) / [decision matrix](st14-go-no-go-matrix.md) | Explicit remaining statuses, owners, closure conditions and hard stops |
| [ST13 requirements](st13-requirements-traceability.csv) / [coverage](st13-question-actor-state-coverage.csv) | Unchanged canonical requirements and evidence-dependent coverage |

The external final Engineering handoff must bind actual Draft PR/head/base/tree, complete changed-file inventory, local check receipts, fresh exact-head run/attempt/event/all jobs/shards/parity/cleanup and independently hashed Required artifact. A candidate cannot contain its own final commit SHA. After independent review the Owner controls Ready/Merge; merged-main CI and final Planning acceptance are subsequent separate decisions. No Reviewer Receipt, merge, deployment, live migration or DR07 release is self-issued here.
