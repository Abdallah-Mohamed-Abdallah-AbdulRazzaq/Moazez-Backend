# Academic Content Center ACC-6 — final closeout audit candidate

## Authority and decision boundary

The fetched authoritative starting `main=origin/main` was `471dcb8517c17d11525f58b598b98d7bc148ba53`. The trusted remote is `Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend`. Before mutation, `Backend-1` was clean and synchronized; no ACC-6F local/remote branch, worktree or PR collision existed. The new worktree started with this recorded evidence:

| Evidence                    | Initial value                                         |
| --------------------------- | ----------------------------------------------------- |
| Current directory           | `E:\Work and Projects\Moazez\Back-end\Backend-ACC-6F` |
| Branch                      | `agent/acc-6f-security-regression-final-closeout`     |
| HEAD and origin/main        | `471dcb8517c17d11525f58b598b98d7bc148ba53`            |
| Ahead / behind              | 0 / 0                                                 |
| Worktree clean              | YES                                                   |
| Tracked / untracked changes | 0 / 0                                                 |

The managed worktree API could not operate from this chat's non-Git parent directory. A normal linked Git worktree was created from exact `origin/main`; the primary checkout remained preserved. The required single commit/PR title is `test(academic-content): finalize ACC-6 security closeout`. This audit authorizes neither merge nor deployment.

### ACC-6 slice history

| Slice                                         | PR   | Authoritative merge                        |
| --------------------------------------------- | ---- | ------------------------------------------ |
| ACC-6A: policy and approval persistence       | #153 | `2731f7c5d8f164b68c30518f1a731bb3320454f3` |
| ACC-6B: atomic workflow and Revision V2       | #154 | `7af768215f63d8ad5b51340360e79cb415e2145c` |
| ACC-6C: review queue and approval history     | #155 | `35009da915d92c459246b9e533e3c79972d5e96d` |
| ACC-6D: Preparation templates and remediation | #156 | `de98baa35d1740873965dbd887f6fced7ff9b3fd` |
| ACC-6E: HTTP/Swagger/security consolidation   | #163 | `471dcb8517c17d11525f58b598b98d7bc148ba53` |

ACC-0 through ACC-5 and ACC-6A through ACC-6E remain CLOSED/PASS. ACC-6F is a bounded security/regression closeout. Current source proved four tenant-write defect groups and one materially distinct verification gap; these findings justify the exact remediation below.

## Source-first acceptance matrix

Classifications are against the starting commit and are not rewritten after remediation. Each row has exactly one classification. There are **116 gates: 111 COVERED_BY_EXISTING_SOURCE_AND_TESTS, 1 MISSING_VERIFICATION and 4 REAL_DEFECT**. Counts are this audit's inventory, not CI thresholds. The four defect rows group twelve final write sites.

### Evidence key

All production references below are under `src/modules/academics/academic-content/` unless a full path is given. Integration suite short names resolve to `test/integration/academic-content-<name>.integration.spec.ts`. Unit references resolve to committed specs in `tests/` and `files/tests/`.

- **POL**: `infrastructure/academic-content-workflow-policy.repository.ts`, `application/academic-content-workflow-policy.use-cases.ts`, `domain/academic-content-workflow.policy.ts`; workflow-foundation integration.
- **WF**: `infrastructure/academic-content-workflow.repository.ts`, workflow use cases/controller and domain workflow policy; workflow-foundation and workflow-transitions integration.
- **MUT**: lifecycle/authoring policies and core, type-detail, target, links-tags and file repositories; workflow-transitions and draft-lifecycle integration.
- **WRITE**: the four repository defect groups enumerated below; direct ACC-6F PostgreSQL regressions in workflow-transitions, type-authoring and files-foundation.
- **RQ**: `infrastructure/academic-content-review.repository.ts`, `academic-content-library-scope.query.ts`, review use cases/query DTO/presenter; review-reads integration and review use-case unit.
- **SEC**: `application/academic-content-management.scope.ts`, shared School Management/permissions guards; all three `test/security/tenancy.academic-content*.spec.ts` suites; IAM academic-content permissions unit; `src/infrastructure/database/school-scope.extension.ts` and its unit suite.
- **PT**: Preparation template repository/use cases/policy/DTO, schema and template migration; preparation-templates integration and template unit suites.
- **HTTP**: all five `controller/academic-content*.controller.ts` files, DTOs and presenters; `test/security/tenancy.academic-content-management-http.spec.ts`.
- **RV**: revision repository, snapshot policy and presenter; type-authoring, workflow-transitions and links-tags-revisions integration, snapshot unit and HTTP security.
- **REG**: canonical core/target/file/lifecycle/Library/detail/revision source and the named existing suites; foreign owner source and lifecycle topology described below.
- **GOV**: `files/tests/academic-content-prisma-boundary.spec.ts`, `scripts/tests/prd3-g01-b3-transaction-pressure.test.cjs`, migration governance/manifest scripts, `scripts/ci/{plan-ci,run-ci-shard,aggregate-ci}.cjs` and `.github/workflows/ci.yml`.

| Gate | Contract                                                                                                                          | Current source and committed verification                                              | Classification                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| 001  | Workflow policy: Absent row is effectively false                                                                                  | POL — foundation: absent defaults                                                      | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 002  | Workflow policy: GET creates no policy or audit state                                                                             | POL — foundation: absent defaults; workflow use-case unit                              | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 003  | Workflow policy: Effective no-op creates no row or duplicate audit                                                                | POL — foundation: exactly once per effective change                                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 004  | Workflow policy: Real policy changes are transactional                                                                            | POL — policy repository transaction; foundation true/false changes                     | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 005  | Workflow policy: Audit failure rolls back policy creation                                                                         | POL — foundation: audit FK failure                                                     | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 006  | Workflow policy: Audit failure rolls back an existing policy update                                                               | POL — Only creation rollback existed; ACC-6F extends that PostgreSQL test              | MISSING_VERIFICATION                 |
| 007  | Workflow policy: Policy reads and writes are School scoped                                                                        | POL — foundation: School B remains independent                                         | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 008  | Workflow policy: Read requires view permission                                                                                    | POL — foundation HTTP and management HTTP security                                     | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 009  | Workflow policy: Mutation requires settings.manage                                                                                | POL — foundation HTTP and management HTTP security                                     | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 010  | Workflow policy: Policy changes preserve historical and pending approval authority                                                | POL — transitions: pending decision after disable; policy disable versus submit        | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 011  | Approval scope, atomicity and transitions: Approval is operational only for Teacher Preparation; all five other types rejected    | WF — workflow policy unit; transitions: unsupported type                               | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 012  | Approval scope, atomicity and transitions: Reviewer authority is SchoolManagementOnly plus approve permission                     | WF — workflow use-case unit; management HTTP security                                  | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 013  | Approval scope, atomicity and transitions: Submit locks content and revalidates readiness                                         | WF — transitions: missing readiness, inactive/ended term                               | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 014  | Approval scope, atomicity and transitions: Submit captures V2, creates round, sets SUBMITTED and audits in one transaction        | WF — transitions: complete immutable round sequence                                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 015  | Approval scope, atomicity and transitions: Submission audit failure leaves no revision, approval or partial status                | WF — transitions: final submission audit failure                                       | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 016  | Approval scope, atomicity and transitions: Decision audit failure leaves pending approval and SUBMITTED content                   | WF — transitions: decision audit failure                                               | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 017  | Approval scope, atomicity and transitions: Round is positive and unique per submit/resubmit                                       | WF — foundation: round and uniqueness checks; transitions                              | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 018  | Approval scope, atomicity and transitions: Revision belongs to exact content and School                                           | WF — foundation: composite FK pairing and foreign School rejection                     | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 019  | Approval scope, atomicity and transitions: Latest pending round and V2 revision alone authorize decision                          | WF — transitions: missing pending, V1 and non-latest pending rejection                 | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 020  | Approval scope, atomicity and transitions: Old rounds and revisions remain immutable across resubmit                              | WF — transitions: complete immutable round sequence                                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 021  | Approval scope, atomicity and transitions: DRAFT to SUBMITTED and SUBMITTED to APPROVED                                           | WF — transitions: complete immutable round sequence                                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 022  | Approval scope, atomicity and transitions: SUBMITTED to CHANGES_REQUESTED and edited resubmit to SUBMITTED                        | WF — transitions: complete immutable round sequence                                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 023  | Approval scope, atomicity and transitions: No UNDER_REVIEW transition                                                             | WF — workflow policy unit; transition enum source                                      | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 024  | Authoring mutability: DRAFT and CHANGES_REQUESTED use shared mutable status policy                                                | MUT — lifecycle policy unit; transitions: shared guard verification                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 025  | Authoring mutability: SUBMITTED and APPROVED are read-only                                                                        | MUT — workflow/lifecycle policy unit; transitions: shared guards                       | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 026  | Authoring mutability: Metadata remains writable after changes requested                                                           | MUT — transitions: shared authoring guards                                             | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 027  | Authoring mutability: Preparation detail remains writable after changes requested                                                 | MUT — transitions: edit and resubmit; type-authoring integration                       | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 028  | Authoring mutability: Targets retain one shared replacement implementation                                                        | MUT — transitions: shared guards and target races                                      | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 029  | Authoring mutability: Links and tags retain shared replacement implementations                                                    | MUT — transitions: shared guards; links/tags/revisions integration                     | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 030  | Authoring mutability: Files and assets retain shared eligibility, creation and unlink behavior                                    | MUT — transitions: shared guards and post-request asset changes                        | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 031  | Authoring mutability: Archive eligibility and revision-history delete protection remain intact                                    | MUT — transitions: archive CHANGES_REQUESTED; draft-lifecycle integration              | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 032  | Explicit tenant identity at the write predicate: Workflow final content and approval updates carry School identity                | WRITE — Starting workflow repository had three ID-only updates                         | REAL_DEFECT                          |
| 033  | Explicit tenant identity at the write predicate: Shared metadata/archive/restore/delete update carries School identity            | WRITE — Starting core repository mutation had one ID-only update                       | REAL_DEFECT                          |
| 034  | Explicit tenant identity at the write predicate: All five detail updates and their parent touch carry School identity             | WRITE — Starting type-detail repository had six ID-only updates                        | REAL_DEFECT                          |
| 035  | Explicit tenant identity at the write predicate: Upload and asset transaction writes carry School identity and upload purpose     | WRITE — Starting file repository had two ID-only updates                               | REAL_DEFECT                          |
| 036  | Workflow concurrency: Duplicate submit yields one effective round and revision                                                    | WF — transitions: duplicate submit and competing decisions                             | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 037  | Workflow concurrency: Approve versus approve yields one effective decision                                                        | WF — transitions: duplicate approve                                                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 038  | Workflow concurrency: Approve versus request-changes yields one effective decision                                                | WF — transitions: competing decisions                                                  | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 039  | Workflow concurrency: Duplicate request-changes yields one effective decision                                                     | WF — transitions: duplicate request-changes                                            | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 040  | Workflow concurrency: Submit versus metadata update captures coherent winner                                                      | WF — transitions: submit against metadata                                              | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 041  | Workflow concurrency: Submit versus Preparation update captures coherent winner                                                   | WF — transitions: submit against detail                                                | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 042  | Workflow concurrency: Submit versus target replacement captures coherent winner                                                   | WF — transitions: submit against targets                                               | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 043  | Workflow concurrency: Submit versus archive leaves a coherent persistent state                                                    | WF — transitions: submit against archive                                               | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 044  | Workflow concurrency: Resubmit versus edit captures coherent current revision                                                     | WF — transitions: resubmission with existing Preparation edit                          | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 045  | Workflow concurrency: Workflow policy update versus submit preserves coherent pending state                                       | WF — transitions: policy disable against submission                                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 046  | Review queue: Queue is Teacher Preparation only                                                                                   | RQ — review-reads: wrong type excluded                                                 | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 047  | Review queue: Queue requires SUBMITTED content and latest PENDING approval                                                        | RQ — review-reads: wrong status, decided and stale pending excluded                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 048  | Review queue: Queue is current School only and hides deleted content                                                              | RQ — review-reads: foreign School and deleted content excluded                         | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 049  | Review queue: Queue uses submitted revision as review truth                                                                       | RQ — review-reads: mutated current title/year ignored                                  | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 050  | Review queue: Pagination is bounded and stable                                                                                    | RQ — review use-case unit; review-reads: page two                                      | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 051  | Review queue: Ordering is deterministic with approval ID tie-break                                                                | RQ — review-reads: equal submitted times on separate pages                             | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 052  | Review queue: Target and teacher filtering use submitted effective targets                                                        | RQ — review-reads: hierarchy, subject and teacher filters                              | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 053  | Review queue: Search is normalized and bounded to 120 characters                                                                  | RQ — review-reads: title/description/tag search; management HTTP security              | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 054  | Review queue: Parent rows remain unique under multiple targets                                                                    | RQ — review-reads: first request with two targets, total and page IDs                  | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 055  | Review queue: Queue omits full Preparation body and persistence internals                                                         | RQ — review-reads: safe projection; management HTTP security                           | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 056  | Approval history: History is School scoped and missing content is non-disclosing                                                  | RQ — review-reads: local history and foreign/missing content                           | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 057  | Approval history: Deleted content is hidden under current contract                                                                | RQ — review-reads: deleted history content                                             | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 058  | Approval history: History is bounded, newest first and deterministically ordered                                                  | RQ — review use-case unit; review-reads: history pages                                 | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 059  | Approval history: Historical rounds are immutable and no history mutation route exists                                            | RQ — transitions: retained old rounds; exact Swagger inventory                         | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 060  | Security and tenancy: School and Organization management actors require proper permission                                         | SEC — management HTTP security; foundation HTTP                                        | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 061  | Security and tenancy: Teacher, Student, Parent and Applicant actors are denied                                                    | SEC — management HTTP security; targeting and core tenancy security                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 062  | Security and tenancy: View/manage/approve/settings.manage remain separate                                                         | SEC — management HTTP route metadata and permission tests; IAM unit                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 063  | Security and tenancy: Foreign School probes do not disclose existence or foreign reference data                                   | SEC — three security suites; type-authoring and template integration                   | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 064  | Security and tenancy: No role-name hardcoding or permission broadening                                                            | SEC — management scope source; exact permission metadata and IAM unit                  | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 065  | Security and tenancy: Every persisted ACC tenant model has appropriate scope registration                                         | SEC — school-scope registry unit; files registry unit                                  | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 066  | Security and tenancy: Soft-delete registry reflects actual lifecycle semantics                                                    | SEC — school-scope registry unit; policy/approval/revision append-only history source  | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 067  | Preparation templates: School-wide, Stage, Subject and Stage plus Subject scope shapes                                            | PT — templates: all four scopes and exact filters                                      | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 068  | Preparation templates: Stage and Subject belong to same School                                                                    | PT — templates: application checks and compound FKs                                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 069  | Preparation templates: No Teacher allocation prerequisite                                                                         | PT — templates: create all scopes without allocations                                  | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 070  | Preparation templates: Active normalized names are unique                                                                         | PT — templates: names and no-op; normalized-name policy unit                           | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 071  | Preparation templates: Delete is soft and deleted names can be reused                                                             | PT — templates: active names and deleted name reuse                                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 072  | Preparation templates: Partial update preserves unprovided fields                                                                 | PT — templates: partial replacement; management HTTP security                          | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 073  | Preparation templates: Effective no-op creates no audit                                                                           | PT — templates: active names and no-op                                                 | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 074  | Preparation templates: Concurrent duplicate create yields one row and audit                                                       | PT — templates: serializes concurrent duplicate creates                                | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 075  | Preparation templates: Update/delete serialize without reviving deleted row                                                       | PT — templates: delete against update                                                  | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 076  | Preparation templates: Colliding rename is rejected                                                                               | PT — templates: partial replacement and colliding rename                               | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 077  | Preparation templates: Create/update/delete audit failures roll back                                                              | PT — templates: all three audit failure paths                                          | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 078  | Preparation templates: Persisted Preparation is independent after template update/delete                                          | PT — templates: persisted Preparation independence                                     | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 079  | Preparation templates: No department, apply endpoint, live relation or template requirement                                       | PT — template DTO/schema source; exact management HTTP/Swagger inventory               | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 080  | HTTP, Swagger and presenters: Exactly 36 Academic Content management method/path pairs                                            | HTTP — management HTTP security: exact Swagger surface                                 | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 081  | HTTP, Swagger and presenters: All five controllers use SchoolManagementOnly                                                       | HTTP — management HTTP security: exact route metadata                                  | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 082  | HTTP, Swagger and presenters: Each route owns its approved permission                                                             | HTTP — management HTTP security: route permission ownership                            | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 083  | HTTP, Swagger and presenters: Static review/settings/template routes precede dynamic content lookup                               | HTTP — management HTTP security: static routing                                        | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 084  | HTTP, Swagger and presenters: UUID path validation rejects malformed IDs before delegation                                        | HTTP — management HTTP security: parameterized UUID probes                             | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 085  | HTTP, Swagger and presenters: Unknown request fields are rejected                                                                 | HTTP — management HTTP security: DTO and workflow injected fields                      | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 086  | HTTP, Swagger and presenters: Query and body bounds remain enforced                                                               | HTTP — management HTTP security: review and template boundary cases                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 087  | HTTP, Swagger and presenters: Submit omitted body or empty object accepted; properties rejected with 400                          | HTTP — management HTTP security: empty workflow body cases                             | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 088  | HTTP, Swagger and presenters: Approve omitted body or empty object accepted; properties rejected with 400                         | HTTP — management HTTP security: empty workflow body cases                             | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 089  | HTTP, Swagger and presenters: Request-changes note is nonblank and at most 4000 characters                                        | HTTP — management HTTP security: note bounds; workflow use-case unit                   | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 090  | HTTP, Swagger and presenters: Presenters omit tenant internals and storage coordinates                                            | HTTP — management HTTP security: safe DTO and presentation cases                       | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 091  | HTTP, Swagger and presenters: No Publication endpoint or Approval-history mutation endpoint                                       | HTTP — management HTTP security: exact 36-route inventory                              | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 092  | Revision and audit security: V2 snapshots are server generated, immutable and versioned                                           | RV — type-authoring: all five V2 snapshots and races; snapshot unit                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 093  | Revision and audit security: Revision is linked to exact content and School                                                       | RV — foundation FK tests; revisions integration                                        | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 094  | Revision and audit security: Review never falls back to mutable current authoring state                                           | RV — review-reads: submitted revision truth; V1/V2 type-authoring                      | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 095  | Revision and audit security: Raw typeSpecificSnapshot/internalExtra are not presented                                             | RV — management HTTP security: V2 projection; snapshot decoder unit                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 096  | Revision and audit security: Workflow audit records bounded business identities and decision                                      | RV — workflow repository allowlist; transitions: persisted audit assertions            | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 097  | Revision and audit security: Audit payloads omit complete Preparation, session secrets and capabilities                           | RV — type-authoring: secret-free metadata; file unit/integration and presenters        | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 098  | ACC-1 through ACC-5 and foreign-domain regression: Core tenancy and foreign content hiding                                        | REG — core tenancy security; management-bridge integration                             | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 099  | ACC-1 through ACC-5 and foreign-domain regression: Targeting, audience resolution and allocation context                          | REG — targeting security; target/audience unit; draft and type-authoring integration   | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 100  | ACC-1 through ACC-5 and foreign-domain regression: Files/upload/cleanup and purpose isolation                                     | REG — files-foundation and upload-lifecycle integration; nine file unit suites         | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 101  | ACC-1 through ACC-5 and foreign-domain regression: Draft lifecycle and term/write guards                                          | REG — draft-lifecycle integration; lifecycle unit                                      | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 102  | ACC-1 through ACC-5 and foreign-domain regression: Links/tags and immutable Revision V1 history                                   | REG — links/tags/revisions integration                                                 | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 103  | ACC-1 through ACC-5 and foreign-domain regression: Revision V2 typed authoring, readiness and foreign validation                  | REG — type-authoring/type-details integration; readiness and snapshot unit             | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 104  | ACC-1 through ACC-5 and foreign-domain regression: Library filtering, stable parent pagination and safe summaries                 | REG — Library integration; management HTTP security                                    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 105  | ACC-1 through ACC-5 and foreign-domain regression: UTC session filtering remains independent of PostgreSQL session timezone       | REG — Library integration: non-UTC timestamp regression                                | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 106  | ACC-1 through ACC-5 and foreign-domain regression: Soft-deleted FK-backed references remain historical and exact no-op safe       | REG — type-authoring: deleted Curriculum reference on no-op                            | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 107  | ACC-1 through ACC-5 and foreign-domain regression: Hard-deleted non-FK Timetable reference remains historical only on exact no-op | REG — type-authoring: ACC-5F hard-deleted Timetable regression                         | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 108  | ACC-1 through ACC-5 and foreign-domain regression: Same-School/context/subject checks and no cascade ownership of foreign domains | REG — type-authoring: full reference chain/mismatch/foreign cases; schema FK source    | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 109  | Layer, migration and CI authority: Controllers/DTOs/domain/presenters contain no Prisma infrastructure access                     | GOV — Prisma boundary unit; source scan                                                | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 110  | Layer, migration and CI authority: Raw SQL stays in approved infrastructure repositories                                          | GOV — Prisma boundary unit; PRD3 transaction inventory                                 | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 111  | Layer, migration and CI authority: No additional external I/O is added inside locked transactions                                 | GOV — unchanged transaction bodies; PRD3 reviewed facade and typed-authoring inventory | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 112  | Layer, migration and CI authority: Migration chain and artifact checksums remain immutable                                        | GOV — migration governance and artifact manifest tests/verifier                        | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 113  | Layer, migration and CI authority: Schema validates and client generation succeeds                                                | GOV — Prisma validate/generate governed source; current local replay below             | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 114  | Layer, migration and CI authority: Fresh full deploy, second no-op, current status and schema parity                              | GOV — governed migration runner source/tests; current disposable replay below          | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 115  | Layer, migration and CI authority: Exact-head CI is complete repository regression authority                                      | GOV — CI workflow, plan/runner/aggregate source and orchestrator tests                 | COVERED_BY_EXISTING_SOURCE_AND_TESTS |
| 116  | Layer, migration and CI authority: Final ACC-6 closure requires owner merge and exact-main CI                                     | GOV — approved mission boundary; exact-head CI requirements below                      | COVERED_BY_EXISTING_SOURCE_AND_TESTS |

## ACC-6F defects and verification added

### REAL_DEFECT: explicit School identity in final writes

A preceding School-scoped read or row lock does not make an ID-only final write compliant. These were current source violations of the permanent tenancy rule, even though canonical cross-School request probes already failed at earlier reads.

1. **Workflow**: `academic-content-workflow.repository.ts` had ID-only content updates in submit and decide, plus the approval decision update. Content now uses existing `id_schoolId`; Approval uses Prisma's extended unique `{ id, schoolId }` predicate. Approval has no `id_schoolId` schema key, so no schema or migration is invented.
2. **Shared draft lifecycle**: `academic-content.repository.ts` had an ID-only update shared by metadata, archive, restore and soft delete. It now uses existing `id_schoolId`.
3. **Typed authoring**: `academic-content-type-detail.repository.ts` had five ID-only detail updates and an ID-only parent timestamp/actor update. All six use existing `id_schoolId`. These are the same paths used by CHANGES_REQUESTED.
4. **File transaction facade**: `files/infrastructure/academic-content-file.repository.ts` updated an upload and soft-deleted an asset by ID alone. The file transaction interface now carries upload `id/schoolId` and asset `schoolId` to final predicates. Upload updates also retain explicit `purpose=ACADEMIC_CONTENT`. Completion, cancellation and cleanup callers pass the locked session identity; unlink passes the management School identity.

No lock sequence, isolation policy, timeout, transaction boundary, storage operation, route, DTO permission or schema is changed. Existing background discovery/recovery is intentionally cross-School, purpose-bound worker work; its bulk predicates are not management request writes and remain unchanged.

Direct PostgreSQL proof:

- One workflow-transitions test observes the actual Prisma update arguments inside real transactions for metadata/archive/restore/delete, submit, request-changes, resubmit and approve, requiring explicit School identity and the expected row IDs.
- Five type-authoring cases require School identity for creation's parent touch and for each existing typed row update plus its parent touch.
- Six new selector cases failed against the starting production source with ID-only predicate mismatches before remediation.
- One files-foundation test supplies a foreign School to upload/asset writes and requires P2025 plus unchanged persisted rows. It also rejects another upload purpose and proves correct-School updates work. Existing upload/cleanup/unlink unit expectations follow the tenant-bearing interface.

### MISSING_VERIFICATION: existing policy update rollback

The starting workflow-foundation test proved audit-failure rollback for policy **creation** only. ACC-6F extends that test: create a true policy successfully, capture the persisted row, attempt a false update with an invalid audit organization FK, require rejection, and compare the entire row (including timestamp) unchanged with exactly the prior successful audit remaining. Production policy source was already transactional; no policy change was needed.

### Changed-file rationale

| File or group                                                            | Reason                                                                             |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Workflow, core and type-detail repositories                              | The ten ID-only School-owned update sites above                                    |
| File repository and file unit-of-work interface                          | The two ID-only file transaction updates and required tenant identity contract     |
| Upload use cases and cleanup worker                                      | Carry the locked identity through the changed internal contract                    |
| Three file unit specs: cleanup, unlink, upload                           | Maintain existing proof against the changed internal signature                     |
| Workflow-transitions, type-authoring, files-foundation integration specs | Direct regression proof for the four defect groups; existing unlink caller updated |
| Workflow-foundation integration spec                                     | Existing-row policy audit rollback proof                                           |
| This document                                                            | Source-first matrix, observed verification and pending owner/CI authority          |

## Security, workflow, templates and HTTP state

School and Organization management actors remain authorized only through an active School context and the exact required permission. TEACHER, STUDENT, PARENT and APPLICANT remain denied. There is no role-name check or permission catalog change. Cross-School content, template, approval history and foreign reference probes retain generic non-disclosing errors.

Submit/resubmit remain one coherent locked transaction: readiness revalidation, immutable server-generated Revision V2, new pending approval round, SUBMITTED status and bounded audit. Decisions use the latest pending round's exact submitted V2 revision; policy disable does not erase pending/history authority. Old rounds/revisions stay unchanged. Existing PostgreSQL races cover every concurrency row in the matrix. This candidate adds no external I/O in any locked transaction; the pre-existing reviewed READY orphan cleanup storage wait remains governed by PRD3-G01.

DRAFT/CHANGES_REQUESTED share authoring; SUBMITTED/APPROVED are read-only. Queue rows use submitted revision title/year/term/tags/targets, ascending submitted time plus approval ID ordering, bounded filters and one parent per row. Queue projection excludes the Preparation body. Approval history is School-scoped, bounded and newest first, with no mutation route.

Templates remain School-defined presets with four optional Stage/Subject shapes, active normalized-name uniqueness, soft delete/name reuse, partial/no-op updates, serialization and transactional audits. Existing Preparation data remains independent after template update/deletion. No dynamic form builder, department field, apply-template endpoint, template live relation or Preparation template requirement is added.

ACC-6E's exact **36** management Swagger method/path pairs remain intact. All five controllers retain SchoolManagementOnly and exact permission metadata. Static routes, UUID paths, unknown fields, bounded queries/bodies, omitted/empty submit and approve bodies, note limit 4000 and review search limit 120 remain verified. Presenters expose allowlisted business fields; raw snapshot/internalExtra, tenant internals, storage coordinates and capabilities are absent from ordinary responses. There is no Publication route.

Workflow audit metadata is limited to business IDs, round number, status/decision. Policy audits contain the effective boolean. Template summaries and typed-authoring change metadata omit content bodies. Online Session secrets and complete meeting URLs are excluded from audit metadata. Upload capability handling and purpose isolation remain covered by canonical file tests.

## Foreign-domain ownership and lifecycle

Curriculum/Unit/Lesson retain `softDeleteCurriculum`, `softDeleteUnit`, `softDeleteLesson` in the Curriculum repository. Lesson Plan/Item retain `softDeletePlan` and `softDeleteItem`; Homework retains its own cancellation/status path; Assessments retain `softDeleteAssessment`; Timetable owns hard `deleteEntry`.

ACC's same-School Curriculum/Unit/Lesson, Lesson Plan/Item, Homework and Assessment references use composite foreign keys with RESTRICT toward those foreign rows. Soft deletion preserves historical references. Timetable IDs are intentionally non-FK historical references; owner hard deletion is permitted, an exact normalized no-op retains the ID, and new/changed authoring cannot adopt an unavailable entry. The existing ACC-5F PostgreSQL Timetable regression and deleted Curriculum reference regression remain canonical.

ACC does not mutate or cascade into Curriculum, Lesson Plans, Homework, Assessments, Timetable, Teacher allocations, Generic Files or Learning Media ownership. ACC file orchestration remains confined to its purpose-safe upload/asset contracts. Existing files-foundation tests retain representative Learning Media database rejections; the new predicate regression also rejects a Learning Media upload identity. The complete foreign-domain suite inventory belongs to exact-head CI; local work reuses relevant canonical ACC reference tests without duplicating unrelated domain suites.

## Database, migrations and layer boundaries

The starting chain contains **20 discovered migrations, nine ACC migration directories**. This is an observation, not a permanent pass threshold. No migration/schema/manifest file is changed, rewritten, deleted or added.

The ACC chain remains:

```text
20260922163843_academic_content_core_foundation
20260922220822_academic_content_targeting_audience_foundation
20260923165955_academic_content_upload_purpose_enum
20260923165956_academic_content_purpose_safe_files_foundation
20260925120000_academic_content_draft_lifecycle
20260926002741_academic_content_links_tags_revisions
20260926175931_academic_content_type_specific_authoring_foundation
20260927122703_academic_content_workflow_approval_foundation
20260927202842_academic_content_preparation_templates
```

The registry includes every persisted ACC School model, including WorkflowPolicy, Approval and PreparationTemplate. Soft deletion applies to actual lifecycle models, including content/template/assets; approval, policy and revision rows do not gain a false soft-delete lifecycle.

Controllers, DTOs, domain policy and presenters have no Prisma infrastructure access or mutation; approved raw SQL remains in infrastructure. Typed authoring and workflow use existing transaction facades and locks. No direct shared-database SQL, db push, migrate resolve, baseline rewrite or deployment is used.

Fresh replay uses an explicitly named disposable local database, `acc6f_closeout_20261002_b0688e59`, at local PostgreSQL port 5433. Only credentials are loaded into process memory; no environment file or secret is committed. The repository's `db:migrations:deploy` mechanism applies the discovered chain; a second deploy is a no-op, status is current, and `migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` proves no difference. This database is also used for the focused ACC integration/security run and removed after verification. The shared development database is not the test/replay target.

## Local verification and exact-head CI acceptance

All required local checks passed. The migration receipt names matched the discovered directory names exactly (20 applied, nine ACC migrations). The task-owned disposable database was dropped and its absence verified. Initial regression failures were corrected before the final passing run; no skipped ACC verification is counted as a pass.

| Check                                                        | Candidate observation                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| ACC unit suites, including files and IAM permissions         | PASS, 26 suites / 182 tests                                  |
| School-scope registry                                        | PASS, 1 suite / 15 tests                                     |
| Three ACC security suites                                    | PASS, 3 suites / 110 tests                                   |
| Twelve ACC PostgreSQL integration suites                     | PASS, 12 suites / 126 tests, zero skipped                    |
| Prisma validate / generate                                   | PASS / PASS                                                  |
| Migration governance and governance tests                    | PASS, active chain 20, new 0; 39 tests                       |
| Migration artifact manifest                                  | PASS, 20 migrations and aggregate chain checksum verified    |
| Fresh first deploy / second deploy / current status / parity | PASS / no pending migrations / current / no difference       |
| PRD3-G01 transaction-governance tests                        | PASS, 169 tests                                              |
| PRD3-G01-A governance/runtime policy                         | PASS, 45 governance/health tests and 11 runtime-policy tests |
| Build-config tsc noEmit, incremental false                   | PASS                                                         |
| Build and bootstrap postbuild contract                       | PASS                                                         |
| Changed-file ESLint / format / diff check                    | PASS / PASS / PASS                                           |
| Disposable database cleanup                                  | PASS, absence verified                                       |
| Complete canonical repository regression                     | Deferred to exact-head CI as requested                       |

Before owner Ready/merge, the Backend reviewer must independently inspect a completed successful `pull_request` CI run for the exact reviewed final candidate SHA. Its base and merge base must match the authorized starting SHA. All dynamically required jobs must pass, including `CI / Required`, Security, migration governance, fresh PostgreSQL replay and PRD3-G01, with no blocked required shard.

The exact `ci-required-<run-id>-<attempt>` artifact must bind candidate/base/merge-base SHAs and report overall and preflight PASS, discovered=executed with parity PASS, zero missing/duplicate/unexpected/failed/blocked assignments, cleanup PASS and every required domain PASS. Shard/job/test/migration counts are discovered from that run. The prior 35-check observation is context only. Fresh replay is performed by the governed shard runner; a workflow compatibility/aggregate check name alone is insufficient SQL replay evidence.

This implementation stops after the Draft PR and handoff evidence. Exact-head CI acceptance is pending independent Backend review; no historical run is substituted. Final ACC-6 closure further requires owner merge and successful exact-main post-merge CI.

## Deferred scope and pending owner merge

PUBLICATION, SCHEDULED_PUBLICATION, AcademicContentPublication, publishAt/visibleFrom/visibleUntil, AUDIENCE_SNAPSHOT, NOTIFICATIONS/REVIEW_NOTIFICATIONS, Teacher/Student/Parent app ACC consumption, acknowledgement events, engagement, analytics, copy/reuse and custom folders remain NOT_STARTED. There is no notification engine, Publication endpoint, app ACC route, frontend, IaC or production mutation. `ACC_7_STARTED=NO` and `ACC_7_AUTOSTART=NO`.

The locally verified candidate is `ACC-6F=PASS/READY_FOR_INDEPENDENT_REVIEW`, subject to exact-head CI and independent review. `ACC-6=IN_PROGRESS/PENDING_FINAL_MERGE`; `FINAL_ACC_6_MERGE_SHA=PENDING_OWNER_MERGE` and `FINAL_EXACT_MAIN_CI=PENDING_OWNER_MERGE`. The Draft PR must remain Draft until independent Backend review and owner Ready action. No merge, force push or ACC-7 start is authorized.
