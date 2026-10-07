# ACC-10B — Student Academic Content surface audit

## Authority and acceptance boundary

Baseline: `4ae44b9356dc12b63fc8fa8f3375aa8f867ba50e`. The feature worktree and branch were created directly from this fetched, clean authoritative baseline. ACC-10A is the current-access authority.

ACC-10B remains **INCOMPLETE_PENDING_BACKEND_ACCEPTANCE**. This implementation ends at one normal commit, normal push, one open Draft PR and fresh CI for its exact remote head. Independent backend acceptance, Ready, merge and Exact-Main CI remain pending. No production mutation or deployment is authorized.

## Surface and identity

| Method | Route | Permission |
| --- | --- | --- |
| GET | `/api/v1/student/academic-content` | `academics.academic_content.view` |
| GET | `/api/v1/student/academic-content/:contentId` | `academics.academic_content.view` |

`StudentAppModule` imports the existing `AcademicContentModule`, registers the thin Student controller and the list/detail use cases, and injects the exported Core `AcademicContentCurrentAccessService`. Both routes carry `Cache-Control: no-store, private, max-age=0`.

`StudentAppAccessService.getStudentAppContext()` resolves the authenticated Student user and current active Enrollment before either Core read. Student, School, Enrollment, classroom, academic year and term are supplied by that server context. No client identity, hierarchy, recipient, audience, publication status, teacher or guardian-priority selectors are accepted. Invalid content UUIDs and forbidden query properties are rejected by the existing global validation pipe.

A null current term produces an empty list with the requested valid pagination and total zero. Detail returns the standard non-disclosing `not_found` response without invoking the Core recipient reader.

## Core current access and bounded query

The Student projection extends the Core recipient reader and current-access service; it does not introduce Student-local authorization or use historical publication recipients as an ACL. Existing ACC-10A publication authorization remains intact.

The feed executes one parameterized SQL statement. A shared eligible CTE supplies both the exact count and the bounded page, using the same statement snapshot and authorization predicates. There is no per-publication authorization or SubjectAllocation query, no unbounded publication load into application memory, and no authorization filtering after pagination. Removing the single null row produced by the count/page left join only handles an empty page; it does not filter authorization results. An out-of-range page still returns the correct total.

The SQL explicitly fences School scope, active/nondeleted School and Organization, active/nondeleted Student user and Student, and the exact active/nondeleted current Enrollment with its current classroom/year/term. Classroom, section, grade and stage relationships are nondeleted and School scoped. Only published, nondeleted content with nonnull `publishedAt <= now`, `visibleFrom <= now` and null or future `visibleUntil` qualifies.

The exact `Publication.revisionId` anchors V2 immutable Revision fields, RevisionTarget and RevisionTag. The five target scopes (School, Stage, Grade, Section and Classroom) follow the ACC-10A matching semantics. A subject-qualified target additionally requires a current, positive, nondeleted SubjectAllocation for the same School/year/term/grade/subject. A subject filter qualifies that same matching immutable target, preventing a subject on a different nonmatching target from admitting the content.

Detail first resolves an authorized current publication identity without selecting meeting capabilities. A second bounded read selects immutable detail only after authorization and repeats all live authorization predicates, publication status and exact revision identity. Revocation, cancellation or successor replacement between reads fails closed. A content ID resolves the currently visible successor and never falls back to an old cancelled publication.

## Feed contract

Allowed types are `WEEKLY_PLAN`, `SUBJECT_RESOURCE`, `ONLINE_SESSION` and `GENERAL_RESOURCE`; allowed immutable audiences are `STUDENTS` and `STUDENTS_AND_GUARDIANS`. Guardian Weekly Notes and Teacher Preparation never enter the Student reader, including guessed content IDs.

| Filter | Immutable authority / validation |
| --- | --- |
| type | Four Student types only |
| subjectId | UUID; same matching RevisionTarget and current SubjectAllocation |
| search | Trimmed, at most 120 characters; immutable title/description; literal SQL wildcards |
| tag | Trimmed, at most 80 characters; existing NFKC/whitespace/case normalization; RevisionTag |
| weeklyDateFrom / weeklyDateTo | Strict date-only, ordered; immutable week overlap |
| sessionStartAtFrom / sessionStartAtTo | Strict zoned ISO instants, ordered, normalized UTC; immutable start time |
| sessionPlatform | Existing platform enum; immutable platform |
| page / limit | Positive integers; page defaults to 1, limit defaults to 20 and is at most 100 |

Ordering is `visibleFrom DESC, publicationId DESC`. Count and page share every filter and eligibility predicate.

## Projection and minimization

Cards explicitly whitelist content/publication/revision IDs, type, audience, frozen title/description, publication visibility dates and safe type summary. Weekly summaries expose week dates; Subject summaries expose category; Online summaries expose platform/start/end only; General summaries are null. Feed SQL never selects the full type snapshot or join URL, access code or instructions.

Detail uses the existing V2 snapshot decoder and explicitly projects the appropriate frozen fields and homework/assessment/curriculum/timetable navigation IDs. Authorized Online detail may contain its meeting join URL, access code and instructions. General details are null.

Revision assets expose file ID, original name, MIME type, decimal-string size and sort order. Revision links and tags expose their safe values and sort order. No signer or StorageService is invoked. Raw targets, allocation IDs, historical recipients, audience counts, approval/fingerprint/actor internals, bucket/object key and signed storage URLs are absent. No read state or acknowledgement state is created or projected.

## Regression matrix

| Case | Expected |
| --- | --- |
| Late current matching Enrollment, absent from historical recipients | Feed/detail allowed; historical snapshot unchanged |
| Former/withdrawn/moved Enrollment, historically included | Feed excludes; detail not found; historical snapshot unchanged |
| All five current target scopes | Feed/detail agree with ACC-10A publication authorization |
| Missing/deleted/zero/wrong-context SubjectAllocation | Qualified content denied |
| Mutated current title/detail/targets/tags/links after publication | Immutable Revision truth retained |
| Future/expired/cancelled/scheduled/wrong-audience/wrong-School | Excluded; no meeting capabilities disclosed |
| Known publication/revision ID used as content ID | Non-disclosing not found |
| Legitimate revision and successor lifecycle | Successor identity and immutable payload only |
| Tied publication visibility, multiple pages and empty page | Stable complete page sequence; exact total |
| Missing permission / non-Student actor | Existing permission/Student ownership guards deny |
| Client authority selectors / forbidden type / invalid dates/ranges/pagination | Validation rejects |
| Asset-access, acknowledgement or authoring route | No route exposed |

Focused local verification runs all Student unit suites, the new Core reader unit regression, ACC-10A policy/permission suites, new PostgreSQL Student integration, ACC-10A current-access/publication-notification integration, Student security/final-closeout suites and runtime contracts. PostgreSQL suites use the repository disposable fixture harness with owned cleanup, never a production database. Local Windows adapters only translate executable invocation and reuse verified matching installed dependencies/generated client; tracked CI orchestration and classification are unchanged.

Final local counts and diagnostic comparison are recorded below before commit. Fresh exact-head remote CI and canonical evidence are recorded in the PR/final report because the commit cannot contain evidence from its own future CI run.

Local results: 64 focused unit suites / 416 tests; 3 PostgreSQL integration suites / 110 tests; Student security plus final closeout 2 suites / 79 tests; runtime contracts 2 suites / 26 tests. Each completed with zero skipped tests and repository fixture cleanup `PASS`. The new integration fixture was corrected locally to use schema field names, valid audience/lifecycle records, and an active term for the real successor lifecycle. These were test setup corrections; existing ACC-10A integration regressions passed throughout.

After final inventory wiring, Student security/final closeout passed again (79 tests), and the four new reader/projection suites passed again (45 tests: Core reader 3, presenter 6, query DTO 31, use cases 5). Prisma validate/generate, production typecheck, repository build including its reference-data bootstrap postbuild contract, migration governance and diff whitespace checks passed. The initial default-heap compiler/linter attempts exhausted Node memory; the successful static runs used a local 6144 MiB Node heap without changing repository configuration.

## Static diagnostics

New files must be clean. Changed legacy TypeScript files are compared without exclusions against exact baseline sources under unchanged ESLint and TypeScript configuration. Diagnostic identity includes rule/code/message and source location mapped across inserted lines; retained raw reports include every diagnostic. For Prettier, whole-file diff grouping can describe the identical inherited whitespace repair as an insertion or a replacement. Its identity is therefore the exact mapped source line before and after the diagnostic's repair, together with rule and severity. This preserves every formatter diagnostic and proves the actual repair effects identical without ignoring rules, messages or files in the retained raw reports. Section 87 permits only unchanged inherited diagnostics, reported as `PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION`, never as a clean pass. No suppressions, configuration changes or historical lint debt cleanup are included.

The new controller is registered in the reflective test inventory using its existing `StudentAppControllerClass` contract. This also removes one inherited TypeScript union-cast diagnostic affected by the expanded inventory; the original reflection body is preserved. Removed diagnostics are reported separately, as permitted by Section 87, and are never subtracted from introduced diagnostics.

Exact baseline versus candidate lint: **395 errors / 5 warnings → 395 errors / 5 warnings**, introduced errors/warnings **0/0**, removed diagnostics **0**. Legacy Student security contributes 327 errors / 5 warnings; legacy Student final closeout contributes 68 errors / 0 warnings. Every other changed/new TypeScript file is clean. Changed-file TypeScript: **1 baseline diagnostic → 0 candidate diagnostics**, introduced **0**, removed **1**, with no diagnostic in any new file. Changed-file lint is `PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION`; candidate TypeScript is clean `PASS`. Raw reports and the exact mapped formatter repair effects are retained locally under ignored `coverage/acc10b`.

## Database, runtime and scope freeze

Prisma schema and all 26 migrations are unchanged. No business model, queue, worker, consumer or repeat was added. Core consumers remain 8, Media consumers 1, maintenance repeats 9, and API consumers/schedules 0/0. Communication notifications, Parent/Teacher surfaces, CI routing/classification, Terraform and deployment are unchanged.

AST route inventory: Student 102 → 104 (exactly the two specified GET routes); Parent 73 → 73; Teacher 149 → 149. Existing Student permission and final-closeout inventories were extended only for those two routes.

Deferred: ACC-10C Parent consumption, ACC-10D recipient asset access, ACC-10E scale/index closeout, ACC-10F broader final closeout, and ACC-11 engagement/acknowledgement/analytics. None has started.
