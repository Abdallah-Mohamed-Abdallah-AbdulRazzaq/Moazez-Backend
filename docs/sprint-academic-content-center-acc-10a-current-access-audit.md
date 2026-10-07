# ACC-10A — Current Access, Permissions and Visibility Compatibility

## Authority and boundary

Authoritative base: `ee76002b05c169ff3823832e00ffa09877ce5268`.
The task worktree started clean on
`agent/acc-10a-current-access-permissions-visibility-compatibility`, with
zero ahead/behind commits. ACC-10A implementation evidence remains
`INCOMPLETE_PENDING_BACKEND_ACCEPTANCE`.

This slice adds a shared authorization contract for later Student/Parent
composition. It adds no Student/Parent HTTP routes, DTOs, presenters or asset
signers. ACC-10B through ACC-10F and ACC-11 are outside this implementation.

## Current access

`AcademicContentCurrentAccessService.assertPublicationAccess` resolves the
school-scoped Publication and its exact immutable V2 Revision, checks the
existing hard visibility policy, and revalidates the current actor, active
Student, active Enrollment and live academic hierarchy. Parent access also
requires current Guardian ownership and a current StudentGuardian link.
Every denial uses the same non-disclosing domain 404.

Revision Targets reuse `academicAudienceSubjectRequirements` and
`matchAcademicAudienceStudents`, including SCHOOL, STAGE, GRADE, SECTION and
CLASSROOM. A qualified subject requires the existing live SubjectAllocation
query for the exact school, year, term, grade and subject, with weeklyHours > 0.
No historical recipient query or mutable authoring target authorizes access.

| Current relationship outcome | Result |
| --- | --- |
| Late matching Enrollment | Allow |
| Late matching Guardian link | Allow |
| Former Enrollment | Deny |
| Removed Guardian link | Deny |
| Null historical account, later valid current account | Allow if currently eligible |
| Guardian notification opt-out | Does not deny content access |
| Wrong year, term, school, actor or exact Revision identity | Deny |
| Teacher Preparation or incompatible audience | Deny |
| Future visibleFrom, reached visibleUntil, non-PUBLISHED status | Deny |

The historical publication recipient snapshot remains immutable. Notification
recipient semantics continue to use that snapshot plus current eligibility and
preferences; late actors do not become original notification recipients.

## Permissions and management boundary

Student and Parent receive exactly `academics.academic_content.view`.
Teacher retains view/manage/publish. Management retains the canonical six ACC
permissions. No acknowledgement permission is introduced. Existing management
HTTP actor guards continue to reject Student and Parent, including when they
hold view permission. Canonical reference-data bootstrap remains idempotent.

## Visibility and queue compatibility

Scheduling eligibility permits already-PUBLISHED future-visible sources.
Delivery eligibility additionally requires `visibleFrom <= now`, including
the existing transaction-time source revalidation. Initial and significant
updated notifications use `max(publishedAt, visibleFrom)` as their due instant.

The existing Communication queue, worker, minimum server-owned payload and
logical job identity are preserved. Delay is `max(0, dueAt - enqueueNow)`;
attempts remain 3 with exponential backoff starting at 1000 ms.

Recovery uses a parameterized PostgreSQL due-time query, ordered by
`(GREATEST(published_at, visible_from), id)`, with 100 rows per page. It covers
recent due events within the existing 24-hour recovery window and
already-published future work. Thus a job lost before a due instant several
days after publication is recoverable without extending the historical
publishedAt window. Existing jobs are preserved; lost jobs are restored under
the same identity; delivery retries and reconciliation do not duplicate
notifications. Execution re-reads persisted truth and no-ops for ineligible
sources.

Cancellation before the first due-visible instant suppresses both initial and
cancellation notifications. The decision uses cancelledAt, not worker time.
Normal cancellation at/after first visibility remains supported. Online
session offsets before visibleFrom are skipped in scheduling, recovery and
execution; eligible offsets keep existing stale-grace/start semantics.

## Verification

Final local gate results are recorded below before the one governed commit.
Exact-head remote CI evidence is recorded in the Draft PR and retained local
evidence after pushing; that evidence is distinct from Backend Acceptance.

| Gate | Final local result |
| --- | --- |
| Prisma validate / generate | PASS / PASS |
| Migration governance tests / check | 30 tests PASS / PASS; active 26, new 0 |
| Production typecheck / changed-test typecheck | PASS / PASS |
| Production build / bootstrap build contract | PASS / PASS |
| Changed TypeScript ESLint | All 16 files PASS; 0 errors, 0 warnings |
| Focused unit | 197 tests / 10 suites PASS; 0 skipped |
| PostgreSQL/Redis integration and management security | 437 tests / 9 suites PASS; 0 skipped |
| Queue recovery, runtime topology and management guard | 43 tests / 4 suites PASS; 0 skipped |
| Queue/transaction governance | 186 tests PASS; 0 skipped |
| Local fixture cleanup | PASS |
| Complete diff / whitespace audit | PASS; 17 files, accidental scope 0 |

The local shard evidence records the accepted base as its candidate field
because these checks run against the uncommitted worktree. It is local working
tree evidence, not exact-commit CI evidence. The remote pull_request workflow
must independently bind the normal commit and verify all canonical parity and
cleanup gates.

## Failed-attempt classification

- Default-heap production typecheck exhausted the local Node heap:
  `ENVIRONMENT_DEFECT`. The same compiler runs with a 6144 MiB heap.
- First focused PostgreSQL run: 270 passed / 2 failed / 0 skipped. A stale
  recovery fixture violated publication timing after changing visibleFrom;
  classified `TEST_DEFECT` / `STALE_EXPECTATION` and corrected all associated
  timestamps. The new mutable-target fixture omitted createdByUserId;
  classified `TEST_DEFECT` and supplied the required actor identity.
- Initial changed-file lint found seven unsafe accesses in typed Jest mocks.
  Mock signatures were corrected; no suppression, rule or configuration
  change was made.
- Initial changed-test typecheck identified one ambiguous Parent context
  union. The test helper now returns the Parent member via `Extract`.

Disposable local PostgreSQL/Redis/MinIO fixtures use the repository shard
lifecycle and cleanup contract. Installed dependencies are reused through the
ignored worktree junction; generated Prisma client/schema equality is checked.
Windows CLI invocation is adapted locally. These ignored runner helpers and
logs are not production source or CI workflow changes.

## Scope freeze

Prisma schema and all 26 migrations are unchanged. No new business models,
transactions, queues, workers, consumers, repeats or Redis connections are
introduced. Queue waits remain outside database locks.

Runtime contract: Core consumers 8; Media consumers 1; maintenance repeats 9;
API consumers/schedules 0/0. Queue Redis steady/reserve/governed maximum remains
40/4/44.

Exact production files (9):

- `src/modules/academics/academic-content/academic-content.module.ts`
- `src/modules/academics/academic-content/application/academic-content-current-access.service.ts`
- `src/modules/academics/academic-content/application/academic-content-publication-notification.service.ts`
- `src/modules/academics/academic-content/domain/academic-content-current-access.policy.ts`
- `src/modules/academics/academic-content/domain/academic-content-publication-notification.policy.ts`
- `src/modules/academics/academic-content/infrastructure/academic-content-recipient-read.repository.ts`
- `src/modules/academics/academic-content/infrastructure/academic-content-publication-notification.repository.ts`
- `src/modules/communication/application/communication-notification-queue.service.ts`
- `src/modules/iam/reference-data/system-role-catalog.ts`

Exact test/documentation files (8):

- `src/modules/academics/academic-content/tests/academic-content-current-access.policy.spec.ts`
- `src/modules/academics/academic-content/tests/academic-content-later-notifications.spec.ts`
- `src/modules/academics/academic-content/tests/academic-content-publication-notification.spec.ts`
- `src/modules/communication/tests/communication-academic-content-notifications.spec.ts`
- `src/modules/iam/reference-data/tests/academic-content-permissions.spec.ts`
- `test/integration/academic-content-current-access.integration.spec.ts`
- `test/integration/academic-content-publication-notifications.integration.spec.ts`
- `docs/sprint-academic-content-center-acc-10a-current-access-audit.md`

Total files: 17. Accidental scope: 0. Terraform, deployment, environment files,
generic Files APIs, Teacher/management route semantics and unrelated domains
are unchanged. No production mutation, Ready action, merge or deployment is
authorized by this evidence.
