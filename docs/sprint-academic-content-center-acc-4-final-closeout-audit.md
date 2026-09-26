# Academic Content Center ACC-4 — Final closeout audit candidate

## Decision and authority

`ACC-4E=PASS/READY_FOR_REVIEW` is the proposed Draft PR decision, subject to the exact-head CI gate below. `ACC-4=IN_PROGRESS/PENDING_FINAL_MERGE`. Independent Backend review, owner Ready action, a normal two-parent merge, and passing exact-main CI remain required before anyone may declare ACC-4 closed. This audit does not claim deployment or production data mutation.

The original ACC-4 base is `8160f6c8d8619c6accb6c188db486b215ee23eda`. The fetched, clean, authoritative ACC-4E starting point was `main=origin/main=457b651bdbc4c7391deba7f5251dceba054e71ed`, with zero ahead/behind and no ACC-4E branch locally or remotely. GitHub reports the following PRs merged, and each merge commit is an ancestor of the next:

| Slice | PR | Merge commit |
| --- | --- | --- |
| ACC-4A | #142 | `04b0bf37be80bc811d95511c3bd0529b656533e4` |
| ACC-4B | #143 | `6f174925ac1d5beaa1ccceb0d941cbe5144b63ec` |
| ACC-4C | #144 | `0fc084126c798c35599b5fbbcce35b864450c7ff` |
| ACC-4D | #145 | `457b651bdbc4c7391deba7f5251dceba054e71ed` |
| ACC-4E | Draft PR, linked from the final handoff | Pending owner merge |

`FINAL_ACC_4_MERGE_SHA=PENDING_OWNER_MERGE`; `FINAL_EXACT_MAIN_CI=PENDING_OWNER_MERGE`. The last pre-ACC-4E exact-main CI was run `36239910358`, PASS, with 35 jobs, 26 regression shards, 897 discovered and executed, and zero missing, duplicate, or unexpected tests. These are historical observations, not acceptance constants. The ACC-4E candidate requires a new exact-head run; its run ID and dynamic inventory belong in the final PR handoff.

## Source-first acceptance matrix

Every gate below was classified against the merged source and committed tests before adding coverage. `COVERED` means `COVERED_BY_EXISTING_SOURCE_AND_TESTS`; `ADDED_VERIFICATION` means a narrow ACC-4E test closes a `MISSING_VERIFICATION` finding. No `REAL_DEFECT` was found in the reviewed runtime paths. Candidate CI must still pass before the decision above is effective.

| Gate | Runtime source | Committed verification | Classification |
| --- | --- | --- | --- |
| Draft envelope, title/description bounds, type/audience validation and immutable context | `src/modules/academics/academic-content/domain/academic-content-lifecycle.policy.ts`, `application/create-academic-content.use-case.ts`, `application/academic-content-lifecycle.use-cases.ts`, request DTOs | `src/modules/academics/academic-content/tests/academic-content-lifecycle.policy.spec.ts`, `academic-content-lifecycle.use-cases.spec.ts`, `test/integration/academic-content-draft-lifecycle.integration.spec.ts`, HTTP security suite | COVERED |
| Draft-only mutation, archive, restore, delete without history, historical read and restrictive archive | Lifecycle use cases and `infrastructure/academic-content.repository.ts` | Draft lifecycle integration and `test/integration/academic-content-links-tags-revisions.integration.spec.ts` | COVERED |
| Closed/future/current term rule with injected time | `domain/academic-content-lifecycle.policy.ts` and aggregate lock paths | Lifecycle policy table uses explicit 2030 clock; draft lifecycle integration tests historical archive/read/write/restore | COVERED |
| Aggregate serialization: archive versus targets, completion, unlink, links and tags | Content, target, file, and links/tags infrastructure repositories use aggregate row locks | Real PostgreSQL races in draft lifecycle and links/tags/revisions integration suites | COVERED |
| Management identity, school scope, permissions and foreign resource non-disclosure | `controller/academic-content.controller.ts`, file-policy controller, `application/academic-content-management.scope.ts`, repositories | `test/security/tenancy.academic-content-management-http.spec.ts`, `test/security/tenancy.academic-content-targeting.spec.ts`, management bridge integration | COVERED |
| Separate view/manage/settings.manage; read-only revisions; app actor denial including Applicant | Both controllers' route decorators and `SchoolManagementOnly` | HTTP security suite tests School/Organization allow, Teacher/Student/Parent/Applicant deny, manage-only revision deny, settings permission and 403 | COVERED |
| Optional school File Policy, 512 MiB default, 10 GiB hard cap, invalid sizes, school override, no GET write, atomic/no-op audit | `files/domain/academic-content-file-policy.ts`, resolver/use cases and file repository | `files/tests/academic-content-file-policy.spec.ts`, `test/integration/academic-content-management-bridge.integration.spec.ts`, files foundation integration | COVERED |
| Upload actor, ACC permission, decimal-string sizes, no client origin/storage coordinates, transient capability, no-store and safe errors | Upload DTO/use cases, controller, presenter, storage adapter | HTTP security suite, `files/tests/academic-content-upload.use-cases.spec.ts`, management bridge integration | COVERED |
| Upload finalization lock/recheck, atomic File+Asset/READY/audit, deterministic order, archive race and idempotent READY replay | `files/application/academic-content-upload.use-cases.ts`, `files/infrastructure/academic-content-file.repository.ts` | Upload use-case tests; `test/integration/academic-content-upload-lifecycle.integration.spec.ts`; draft lifecycle integration | COVERED |
| HTTP(S) links only, unsafe URL/credentials/length rejection and no server fetch | `domain/academic-content-links-tags.policy.ts`, links/tags use cases | `tests/academic-content-links-tags.policy.spec.ts`, links/tags/revisions integration, HTTP security suite | COVERED |
| NFKC/space/case tag identity, uniqueness, order, school isolation and safe presenter | Links/tags policy, repository and presenter | Links/tags policy and integration; HTTP security suite checks no `normalizedValue` | COVERED |
| Revision numbering and concurrent capture; one locked transaction reads all five source sets and writes version-1 append-only children | `infrastructure/academic-content-revision.repository.ts`, revision use cases, Prisma model FKs | Links/tags/revisions integration captures 1/2/3 concurrently and verifies all snapshots against later draft edits | COVERED |
| Revision read scope, page/limit-only query, Swagger and absence of public revision writes | Controller, revision use cases/repository, response DTO/presenter | HTTP security suite and links/tags/revisions integration | COVERED |
| Historical File retention after current unlink and cleanup eligibility | File repository counts live assets **or** revision assets in unlink and READY cleanup; cleanup worker rechecks under lock | Links/tags/revisions real PostgreSQL integration captures, unlinks, reaches eligible time, calls real worker, and asserts File active, revision File FK intact and no object deletion | COVERED |
| Delete-history protection and no hard delete | Lifecycle repository and revision FK restrictions | Links/tags/revisions integration covers draft with/without history; draft lifecycle integration covers archived delete denial | COVERED |
| Library collection, bounded deterministic parent pagination, scalar AND filters and historical/archived reads | `infrastructure/academic-content.repository.ts`, Library query DTO | `test/integration/academic-content-library.integration.spec.ts`, HTTP security suite | COVERED |
| Search/title/description/current tag; exact canonical tag; no revision-history search | Library repository and tag normalizer | Library integration search/tag case; HTTP query bounds | COVERED |
| Effective downward scope and non-disclosing hierarchy validation | Library repository and `domain/academic-content-library.query.ts` | Library integration scope/hierarchy case | COVERED |
| SubjectAllocation year/term/grade/subject/positive hours/live requirements | Library repository and SubjectAllocation relation | Library integration subject allocation case | COVERED |
| Same-target scope/subject/teacher, allocation-derived teacher, parent dedupe before pagination | Library repository parameterized query | Library integration correlation and dedupe cases | COVERED |
| Raw SQL confinement and parameterization | ACC infrastructure repositories only; no unsafe raw APIs | `files/tests/academic-content-prisma-boundary.spec.ts`; source audit of `src/modules/academics/academic-content` | ADDED_VERIFICATION for controller/DTO/presenter/domain boundary |
| All 11 tenant models registered; revision models append-only, not soft-delete models | `src/infrastructure/database/school-scope.extension.ts`, `prisma/schema.prisma` | `src/infrastructure/database/tests/school-scope.extension.spec.ts` | COVERED |
| Exact current School Management route and method inventory; deferred routes absent | ACC controllers and module | HTTP security suite's exact Swagger route/method assertion added in ACC-4E | ADDED_VERIFICATION |

The exact route assertion covers content create/list/detail/update/delete, archive/restore, target/link/tag replacement, revision list/detail, upload intent/complete/cancel, asset unlink, and File Policy GET/PATCH under `/api/v1/academics/academic-content`. It rules out extra ACC routes such as publish, approve, submit, schedule, public revision capture, multipart upload, `/library`, and folder CRUD. `src/modules/academics/academic-content/academic-content.module.ts` registers no Student, Parent or Teacher ACC controller. Existing Curriculum, Lesson Plans, Learning Media and generic Files controllers remain separate.

## Database, architecture and leakage

ACC-4 uses `AcademicContent` as the authoring source of truth, `AcademicContentRevision` as an immutable historical snapshot, `File` as the binary source of truth, and virtual folders only. Its implemented sum is core lifecycle + management API + File Policy API + links + tags + revision foundation + Library. Publication, audience snapshot, notifications and app consumption are deferred.

The four ACC-related migration directories are `20260923165955_academic_content_upload_purpose_enum`, `20260923165956_academic_content_purpose_safe_files_foundation`, `20260925120000_academic_content_draft_lifecycle`, and `20260926002741_academic_content_links_tags_revisions`. No committed migration, schema, manifest, permission catalog, package or IaC file is changed by this candidate. `scripts/check-migration-governance.cjs`, its tests, `scripts/migrations/migration-artifact-manifest.cjs`, the fresh-DB twice-deploy gate in `scripts/ci/run-ci-shard.cjs`, and `.github/workflows/ci.yml` enforce migration integrity and replay. The PRD3-G01 transaction inventory and classification are owned by `scripts/ci/prd3-g01-b3-transaction-pressure.cjs` and its tests. The READY orphan worker's provider deletion inside a locked transaction is an explicitly classified bounded exception in that inventory, not an undiscovered wait.

The ACC HTTP presenters in `src/modules/academics/academic-content/presenters/academic-content.presenter.ts` construct allowlisted responses. The HTTP security suite asserts string serialization for BigInt fields and absence of bucket/object key, identity fingerprint, normalized tag identity and creation/deletion internals. The upload capability appears only on successful intent and is omitted from persisted session, audit and subsequent actor reads. The committed management bridge integration tests second-actor capability isolation. Provider errors are mapped through the upload use case/storage boundary, never returned raw.

## Verification and CI rule

The ACC-4E delta consists of two narrow test assertions and this audit. The HTTP test now requires the **exact** 18 method/path pairs, not a subset. The Prisma boundary test now checks controller, DTO, presenter and domain files as well as the already-covered application/worker paths. Existing tests proved the other gates, so no duplicate integration scenarios were added.

The final candidate must pass Prisma format equivalence, validate, generate, migration governance, fresh PostgreSQL first and second deploy, schema/migration parity, migration manifest, PRD3-G01 governance, typecheck, build, changed-file non-mutating lint, unit, security and integration tests. The exact-head GitHub run in the final handoff is authoritative for complete regression. `CI / Required` must pass with every planned shard, discovered=executed, zero missing/duplicate/unexpected/failed/blocked shards, cleanup PASS and required domains PASS. The dynamic `ci-required-*` JSON artifact must be inspected; the historical inventory above is not used as a threshold.

Local candidate evidence before commit:

| Check | Observed result |
| --- | --- |
| Prisma format equivalence on a disposable schema copy; validate; generate | PASS / PASS / PASS |
| `npm run db:migrations:check`; `npm run test:migration-governance` | PASS; 39 tests passed |
| Fresh disposable local PostgreSQL `migrate deploy` twice | PASS; 17 migrations applied, then no pending migrations |
| Migration chain versus Prisma datamodel via disposable shadow DB | PASS; `No difference detected` |
| `migration-artifact-manifest.cjs verify` | PASS; 17 migrations, aggregate SHA-256 `277c8cd4885615bfb1e760513cb65a1cfb07862988130465d67ef4d4286408e3` |
| PRD3-G01-B3 transaction-pressure governance tests | PASS; 168 tests passed |
| `tsc -p tsconfig.build.json --noEmit`; `npm run build` | PASS / PASS; bootstrap build contract PASS |
| Non-mutating ESLint on changed TypeScript files | PASS; zero diagnostics |
| ACC and school-scope unit sweep | PASS; 18 suites, 152 tests |
| ACC management HTTP security suite | PASS; 40 tests |
| Six ACC PostgreSQL integration suites | PASS; 29 tests |

The repository root `tsconfig.json` includes historical test files, and a broader noncanonical `tsc --noEmit` attempt reported unrelated test typing errors. The production `tsconfig.build.json` typecheck and build passed. Exact-head CI remains the final candidate gate.

This Windows host has 7.82 GiB physical RAM; the audit preflight observed only 0.69–0.98 GiB free with other active containers. The earlier ACC-4D full local regression exhausted memory and produced unrelated Teacher integration failures. A second full local run is not reasonable under this preflight; focused local verification and complete exact-head CI provide candidate evidence. This is a host capacity/test-runner constraint, not an accepted ACC correctness defect. Repository-wide historical lint debt, if still reported, remains separate; changed files must have zero new diagnostics.

`FULL_LOCAL_REGRESSION=HOST_RESOURCE_CONSTRAINED` for this candidate preflight. No canonical full local regression was started in ACC-4E.

## Explicit deferrals and handoff

```text
TYPE_SPECIFIC_DETAILS=NOT_STARTED
PREPARATION_APPROVAL=NOT_STARTED
PUBLICATION=NOT_STARTED
SCHEDULED_PUBLICATION=NOT_STARTED
AUDIENCE_SNAPSHOT=NOT_STARTED
NOTIFICATIONS=NOT_STARTED
STUDENT_APP_ACC=NOT_STARTED
PARENT_APP_ACC=NOT_STARTED
TEACHER_APP_ACC=NOT_STARTED
ENGAGEMENT=NOT_STARTED
ANALYTICS=NOT_STARTED
ACKNOWLEDGEMENT=NOT_STARTED
COPY_REUSE=NOT_STARTED
CUSTOM_FOLDERS=NOT_STARTED
ONLINE_PROVIDER_ATTENDANCE=NOT_STARTED
EXISTING_WORKFLOW_REPLACEMENT=NO
LESSON_PLANS_REPLACED=NO
CURRICULUM_REPLACED=NO
LEARNING_MEDIA_REPLACED=NO
PRODUCTION_MUTATION=NO
ACC_5_ENTRY_READY=PENDING_FINAL_ACC_4_MERGE
ACC_5_AUTOSTART=NO
```

Next action after a passing exact-head run is independent Backend Draft PR review. The owner may then mark Ready and merge through the governed process. ACC-5 planning may consider type-specific content authoring only after final ACC-4 merge and exact-main CI.
