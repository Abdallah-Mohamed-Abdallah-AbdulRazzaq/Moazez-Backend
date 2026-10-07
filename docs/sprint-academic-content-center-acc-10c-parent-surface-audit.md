# ACC-10C — Parent Academic Content surface audit

## Authority and boundary

Implementation starts directly from verified `origin/main` commit
`a7a0ba7e58f7ce91ae1acf393c152b302760372e`, with a clean task worktree on
`agent/acc-10c-parent-academic-content-surface`. ACC-10A and ACC-10B are accepted
baseline contracts. ACC-10C remains **INCOMPLETE_PENDING_BACKEND_ACCEPTANCE**;
this implementation does not establish merge or Exact-Main acceptance.

Exactly three read routes require `academics.academic_content.view`:

- `GET /api/v1/parent/children/:studentId/academic-content`
- `GET /api/v1/parent/children/:studentId/academic-content/:contentId`
- `GET /api/v1/parent/academic-content/:contentId/accessible-children`

Parent routes increase from 73 to 76 (GET 61 to 64; non-GET remains 12).
Student routes remain 104 and Teacher routes remain 149. The existing Parent
role remains 47 permissions; the role catalog is unchanged. All three routes
use `Cache-Control: no-store, private, max-age=0`.

## Current authorization

`ParentAppAccessService`, `ParentAppGuardianReadAdapter` and `ParentAppContext`
remain the identity and ownership authority. The small `getOwnedStudentContext`
extension returns the existing owned-child check and its current context in one
operation; other callers retain their existing behavior. Child identity is
`Student.id`. The only School is the active Membership School.

Core reads repeat persisted authorization: active, nondeleted Parent user;
currently owned, nondeleted Guardian; current StudentGuardian link; active,
nondeleted Student and exact Enrollment/student/classroom/year/term; active,
nondeleted School and Organization; live hierarchy; immutable matching target
and positive, nondeleted current SubjectAllocation for a subject-qualified
target. Notification preference does not grant or deny content access.

Historical audience recipients and notification metadata never enter an ACL.
Late Guardian links can qualify; removed links deny even while historical
recipients remain. Non-owned, foreign-School and random child identities fail
with the existing non-disclosing Parent child NOT_FOUND contract.

Null-term feed returns an empty page with valid bounded pagination. Null-term
detail returns NOT_FOUND. Accessible children excludes null-term children;
there is no client or Publication term fallback.

## Shared Core reader and immutable projection

One common `currentRecipientPublicationQuery` supplies current visibility,
Revision V2, Enrollment and tenancy predicates, with actor-specific relationship,
audience and type predicates. The target matcher, filters, card columns,
count/page statement, detail projection and stable order are shared. Feed uses
one query after resolving the selected child; it performs no per-Publication
authorization, Guardian or SubjectAllocation lookups.

Student retains its four recipient types and two audiences. Parent accepts
GUARDIANS/STUDENTS_AND_GUARDIANS and five types, including GUARDIAN_WEEKLY_NOTE;
it denies STUDENTS/INTERNAL_STAFF and TEACHER_PREPARATION. The default normalizer
remains Student-compatible; Parent explicitly chooses its allowlist.

Publication's exact immutable Revision supplies title, description, tags,
links, assets and type detail. Mutable authoring is never recipient truth.
Detail first reads only authorized Publication/Revision identity, then repeats
all live predicates in the sensitive read. Default Parent detail also samples
the clock again for that final read; an explicit Core test clock stays pinned.
The stable content identity resolves the current visible successor.

Parent DTOs and presenter whitelist fields. Guardian Note feed exposes only
priority/requiresAcknowledgement; detail may expose the frozen body. Online
Session feed exposes platform/start/end without join URL, access code or
instructions; authorized detail may expose those frozen capabilities. Assets
are safe metadata, without signed URLs or storage coordinates. No read state,
acknowledgement state, raw targets, Guardian/Enrollment authorization IDs,
historical recipients, audience counts, approval or capture internals are
returned.

## Accessible children and existing deep links

The resolver takes only server-resolved current child contexts, in one
parameterized Core statement using `jsonb_to_recordset`, shared live predicates
and target matching. It never loops through full child detail reads. It binds
every returned child to the canonical current Publication/Revision. Stable
`studentId` ascending order is explicit. Zero eligible children returns
NOT_FOUND; response fields are only academicContentId, publicationId and
children containing studentId.

The existing Communication presenter is unchanged: one distinct historical
studentId gives a single-child deep link; multiple IDs give studentId=null.
Detail reauthorizes the single child. The resolver supplies only current
eligible children for the multi-child link, including later eligible children
and excluding former/foreign children. Old Publication identity never overrides
current successor truth or current ownership.

## Verification and diagnostic governance

Tests cover Parent query validation, five-type projection, meeting/Guardian
body minimization, null-term and ownership coordination, batched query
architecture, and final sensitive-read fencing. PostgreSQL fixtures exercise
all five target scopes, audience/type matrices, current and late Guardian
links, removed/deleted/disabled actors, opt-out, live Enrollment and subject
applicability, immutable filters/projection, paging/sort, multi-child resolution,
existing deep links, stale links and governed successor publication.

The Parent security and final-closeout inventories are extended for exactly
three GET routes. HTTP tests exercise permission denial, non-Parent denial,
foreign/random child non-disclosure, UUID/query validation, private cache and
unsupported writes/assets/acknowledgement routes. ACC-10A policy, PostgreSQL,
permissions and notification compatibility plus every ACC-10B Student suite
and relevant Parent access/domain/notification suites are regression gates.

Section 99 permits inherited static diagnostics only with an exact comparison
against the authoritative base proving zero new lint errors/warnings and zero
new TypeScript diagnostics. Every changed/new TypeScript file is included under
unchanged configuration. Raw diagnostic reports are retained. Line positions
are mapped across authorized insertions; Prettier repair identity compares the
exact mapped source line before/after the repair, as whole-file diff grouping
can change its insertion/replacement message. This retains every diagnostic
and does not manufacture a clean gate by excluding historical files or rules.
Inherited debt is reported as `PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION`.
The reflective controller inventory uses its existing controller-class type
contract, removing one directly affected inherited union-cast diagnostic;
unrelated historical diagnostics are preserved. No suppression or config
change is introduced.

Local raw reports, source hashes, test JSON, disposable-fixture cleanup,
route inventories and canonical CI evidence are retained in ignored
`coverage/acc10c`. Each evidence result is bound to the tested candidate.

Final local results:

| Gate | Result |
| --- | --- |
| Parent/Student unit and required Core/permission/notification regressions | PASS: 120 suites, 688 tests |
| Parent/Student/current-access/publication-notification PostgreSQL | PASS: 4 suites, 184 tests |
| Parent/Student security and final closeout | PASS: 4 suites, 129 tests |
| Final Parent PostgreSQL plus existing app notification HTTP compatibility | PASS: 2 suites, 92 tests |
| Runtime consumer/repeat contracts | PASS: 2 suites, 26 tests |
| Parent DTO / presenter / use cases / Core Parent reader | PASS: 32 / 8 / 6 / 5 tests |
| Parent PostgreSQL / security / final closeout | PASS: 74 / 32 / 18 tests |
| Existing app notification HTTP compatibility | PASS: 18 tests |
| Skips and disposable fixture cleanup | 0 skips; cleanup PASS in every phase |
| Prisma validate/generate, production typecheck, build, postbuild contract, diff check | PASS |
| Changed-file lint | PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION |
| Changed-file TypeScript | PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION |

Lint baseline/candidate are **210 errors / 4 warnings → 210 errors / 4
warnings**, with **0 new errors, 0 new warnings and 0 removed diagnostics**.
Parent security retains 140 errors / 3 warnings; Parent final closeout retains
70 errors / 1 warning. All other changed/new TypeScript files have zero lint
errors and warnings. Changed-file TypeScript is **5 → 4**, with **0 new
diagnostics and 1 removed diagnostic** from the directly affected reflective
inventory contract. The four inherited sprint-marker diagnostics remain.
Neither aggregate static gate is a clean pass. Every new file is clean.

The initial PostgreSQL sort fixture failed the existing publish-timing check;
its timestamps were corrected and the complete integration gate passed on
retry. Initial diagnostics in the new HTTP fixture were corrected by using its
actual Supertest App contract; no suppression/configuration change was made.
The final Parent/notification integration rerun covers the final source.

Local phase plans identify the authorized base; retained source hashes bind
the uncommitted candidate files. The remote pull_request canonical artifact
will independently bind execution to the single committed feature head.

## Database, runtime and deferred scope

Prisma schema and all 26 migration files are unchanged. There are no new
models, indexes, queues, workers, consumers or repeats. Core Worker remains
8 consumers, Media Worker 1, maintenance 9 repeats, and API consumers/schedules
0/0. Runtime contract tests verify this boundary. Notification runtime,
persistence, generation and deep-link presenter are unchanged.

ACC-10D asset capabilities, ACC-10E index/scale closeout, ACC-10F broader final
closeout and ACC-11 engagement/acknowledgement/analytics remain deferred.
No Ready, merge, deployment or production mutation is authorized here.
