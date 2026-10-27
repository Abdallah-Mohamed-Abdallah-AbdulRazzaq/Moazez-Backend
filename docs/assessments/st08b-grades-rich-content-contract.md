# ST08-B Grades Safe Rich AST V1 integration

Implementation for independent Backend Engineering review. Authorized source:
`aaa12c81933b78710c25a8dbdf6c6b0c3bb0545c`, Owner order 2026-10-26.
ST08-A is closed. This unit integrates Grades only. ST08-C Homework integration
and final cross-domain verification, ST09–ST14, Ready for review, merge and
deployment remain unauthorized.

## Source discovery and ownership

The clean baseline had the four nullable columns and strict shared validator,
but no Grades DTO input, write, explicit selection or presenter integration.
Grades option replacement reused actual IDs or its legacy sort-order fallback.
Exams, Grades, Core submissions and Teacher Classroom each have distinct read
models. ST07 already owns resource-bound question assets and private bytes.

This change retains ADR-0019, the V1 grammar, shared limits, eight question
types, interaction/answer/scoring contracts, and the existing migration. Core
Grades owns normalization, persistence, resource resolution and safe display
projection. App adapters retain their own audience/selection rules. Controllers
and routes are unchanged. No dedicated question-detail GET route is added.

## Requests and presence semantics

Existing routes:

- `POST /api/v1/grades/assessments/:assessmentId/questions`
- `PATCH /api/v1/grades/questions/:questionId`
- `GET /api/v1/grades/assessments/:assessmentId/questions`

Question and option request DTOs add `richContent`. The field is retained by
the DTO whitelist; Grades calls the shared strict validator, independently of
DTO optional/object decorators. Unsupported/malformed envelopes and contradictory
explicit legacy fields use the existing HTTP 400 `validation.failed` contract.
Errors contain a fixed field/reason and never rejected content or resource IDs.

Question envelopes map `stem` to `prompt` (5000 characters), `stemAr` to
`promptAr` (5000); `instructions` is rejected. Option envelopes map `label` and
`labelAr` to the corresponding legacy fields (1000 each). The shared fallback
retains scientific notation and accessible asset descriptions. It never derives
answers, option value, correctness, points or interaction metadata.

`questionTextEn/Ar` and `textEn/Ar` remain valid aliases. When an AST is supplied,
every explicitly supplied alias/canonical field must agree with its generated
fallback. Omitting a translation in a replacement envelope clears the associated
stale translated legacy field to null. No AST partial merge is supported.

| Operation | Final transaction behavior |
| --- | --- |
| Rich create | Validate full envelope; derive legacy fields before prompt/label requirements; write both atomically |
| Rich replacement | Revalidate full envelope and context; replace AST and its associated fallbacks |
| Genuine legacy display change | Clear the whole associated AST with `Prisma.DbNull`; apply the display patch |
| Supplied unchanged legacy text | Preserve AST |
| Points/order/metadata-only change | Preserve AST |
| Omitted `richContent` | Preserve unless an actual legacy display change clears it |
| Explicit null | Store SQL NULL; retain legacy text unless explicitly patched |
| Historical SQL NULL | Omit the response Rich field; preserve the legacy response |
| JSON null, malformed/future stored JSON, stale asset | Withhold that envelope; preserve stored bytes and safe legacy presentation |

Options retain their existing replacement-array contract, including labels,
correctness, value, order, metadata and retirement. For an explicit option clear,
send the stable option ID, `richContent:null` and the existing replacement fields.
An omitted Arabic field on an unchanged/cleared rich row preserves its current
legacy translation; an explicit Arabic patch still applies.

## Option identity and mutation serialization

The final authorized assessment transaction resolves every incoming option ID
against the exact active question before any option order/retirement changes.
Foreign, retired and duplicate IDs are rejected. An id-less incoming rich update
that collides with an active row, or an id-less legacy update targeting a rich
row, is ambiguous and rejected: clients must use the returned stable option ID.
No rich content follows an array index, label or coincident sort order.

Legacy rows without AST retain their existing sort-order replacement fallback.
New options receive new server-generated IDs; rich content is validated against
that actual row within the same transaction. Reorder and retirement retain each
row's identity/history. Concurrent writers serialize through the existing
assessment mutation lock and recompute the plan against the current row.

Existing `grades.questions.manage`, live membership, school/organization scope,
allocation, DRAFT/unlocked, writable term and submission-count structural guards
remain mandatory. Rich Teacher writes reuse ST07's exact CLASSROOM + creator
boundary and allocation/hierarchy locks before the assessment lock. There are
no permission grants or broader Teacher authoring rights. Invalid AST, identity,
resource, lifecycle or asset checks roll back the entire operation.

An implicit clear from a legacy question/option display edit is a Rich mutation
when the final locked row contains stored JSON. The database's `not: Prisma.DbNull`
filter distinguishes that state from SQL NULL, including stored JSON null.
Option identity and its display-change plan are resolved together before writes.
If ordinary authorization discovers such a clear, that attempt rolls back before
any question or option write. One fresh transaction then acquires
the existing ST07 locks first, revalidates ownership and lifecycle, and recomputes
all plans from the current rows and the original command. Authorization is never
escalated while retaining an assessment lock from the discovery attempt; there
are no nested transactions. Explicit Rich writes use the same ST07 path directly.
SQL-null legacy rows, unchanged display values, and points/order/metadata-only
updates retain their existing authorization behavior.

## Reads, SQL null evidence and privacy

All affected read models explicitly select Rich columns. The core projection
reads `rich_content` and `rich_content IS NULL` together in parameterized,
school/assessment/question-scoped batches of at most 200 questions, with an
exact-parent join for active options. It supplies the actual SQL-null evidence
to `readStoredRichContent`; JavaScript null alone is never used as that proof.

Only repository-authorized, validated objects receive an internal WeakMap
projection. Presenters explicitly add the resulting optional `richContent`;
they never spread Prisma entities or echo raw JSON. SQL NULL is absent, JSON
null is invalid, and a structurally recognizable future envelope is unsupported.
These states are internal; the client retains its existing legacy presentation.
A concurrent mismatch between the selected legacy display and current AST also
withholds the envelope. No read repairs, backfills or rewrites persisted JSON.

Student Exams reuses its own current enrollment/term/subject, publication and
exam-type predicate within the final read transaction. Student Grades separately
reuses its broader legitimate assessment predicate. Assignment visibility in
Grades does not grant Exams access. Both recheck live membership/permission and
their existing ST07 current-term authorization. `answer:null`, answer-key
privacy, option correctness privacy and existing release/reveal behavior remain.

Core question authoring/list, Core submission question display and Teacher
Classroom assessment/submission review add validated Rich fields where those
responses already display questions or selected options. Teacher read composition
rechecks exact live allocation ownership; review, marks, feedback, answer
visibility, scoring and Grade Item synchronization are unchanged.
Single and bulk review replies resolve only their affected questions through
the same authorized repository projection before adding selected-option Rich
display. They retain existing marks, comments, status and response fields.

## Embedded question assets

The resolver implements the shared `RichAssetResolver` port using
`GradeAssessmentQuestionAsset`. It checks trusted actor/membership/permission,
school/organization, exact assessment/question and actual option row, active
binding and matching AST kind/category. It reuses ST07 URL validation, media
policy and genuine private File/READY server provenance. Author checks hold
binding/policy/File/session locks in the existing authorized transaction.

The sequence remains Create Question → Bind Question Asset → Update Rich AST.
Neither `File.id`, upload ID, assessment-wide asset ID nor an arbitrary UUID is
accepted as a substitute. Stale/deleted/ineligible references withhold the
associated envelope on reads. An accessible fallback contains descriptive text,
not a working unauthorized link. Same-assessment reuse retains ST07 ownership,
capacity, provenance and retention invariants; AST references do not create a
physical upload or new asset binding.

GET/HEAD/Range byte requests remain in ST07's controllers and private streaming
service, with fresh resource authorization. No generic File-download substitute,
new purpose/permission, signed/public URL, storage identity or physical deletion
is added. DR07 Production media release remains disabled/unapproved.

## Verified API examples and test ownership

`st08b-grades-rich-content.examples.json` contains nine actual request/response
examples captured by the JWT HTTP test using owned disposable tenants/storage:
question create, option create, rich update, legacy edit/clear, Exams display,
Grades display, Teacher review, unsupported stored fallback and an embedded
authorized managed question asset. Fixture UUIDs/timestamps identify disposable
rows, not Production data. Clients consume the same existing routes and legacy
fields; an absent Rich field means use escaped legacy text. Follow ST08-A's
explicit direction/language isolation and safe structured rendering contract.

| Test | Evidence responsibility |
| --- | --- |
| `src/modules/grades/assessments/tests/grade-rich-content.spec.ts` | Rich-only/bilingual normalization, aliases/conflicts, limits/invalid structure, DTO presence, update plans, raw-JSON withholding |
| `test/integration/grade-rich-content.integration.spec.ts` | Real PostgreSQL atomic persistence, SQL/JSON null classification, stable/concurrent option edits, rollback, lifecycle/membership/allocation/permission revocation, asset ancestry/category/provenance, legacy compatibility and distinct Student audiences |
| `test/e2e/grade-rich-content.e2e-spec.ts` | Actual JWT author/student/Teacher contracts, nine examples, unpublished/cross-school denial, no key/correctness/storage leakage, real GET/HEAD/Range/416 bytes |

Existing Grades/Student/Teacher unit tests, Grades security tests and ST07
database/private-media E2E remain regression obligations. Canonical CI discovers
all three new files exactly once. The retirement inventory assertion adds those
owners to both verified inventory-count guards; CI routing and aggregation are unchanged.
The existing transaction-audit ledger records only the seven affected Grades
transaction owners and exact bounded validator/URL helpers, allocation-gate
dispatch and concrete resolver calls. A new audit test requires no unresolved
calls or external waits for those owners; existing negative classifier checks
remain enabled. Private bucket configuration is resolved before transactions.
Two explicit `Buffer` annotations in the reused media/ST06/ST07 fixture chain correct an
inherited Node type-inference mismatch exposed by compiling the new Grades tests.
It changes no fixture bytes or Homework runtime/integration behavior.

Final local commands/results, failed probes/resolutions, non-mutating same-base
lint comparison and exact-head CI/artifact evidence belong to the implementation
handoff. This document issues no independent Reviewer Receipt. Prisma schema,
all 32 migration sources/manifest, Homework runtime, IAM seeds, deployments,
Production data, File Lifetime, ACC12 terminal snapshots and ACC9C pool observer
remain unchanged. Release dependency remains governed ST05/ST08-A migrations →
verified database state → compatible runtime; this PR authorizes no deployment.
