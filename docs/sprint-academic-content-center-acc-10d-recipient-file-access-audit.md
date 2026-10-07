# ACC-10D — Recipient File Capability Access Audit

## Authority and boundary

- Authoritative fetched `origin/main`: `e58c59bea28751a08efb94f7d4bc379888f9a5c8`.
- Clean task worktree; branch `agent/acc-10d-recipient-file-access`; zero entry divergence.
- ACC-10D remains **INCOMPLETE_PENDING_BACKEND_ACCEPTANCE**. This audit does not close the slice.
- Final boundary: one normal commit, normal push, one Draft PR, fresh exact-head CI evidence.
- ACC-10E scale/index work, ACC-10F final closeout, and ACC-11 engagement remain deferred.
- No Ready, merge, deployment, production mutation, or preserved-worktree cleanup.

## Source findings and shared signer

The existing `AcademicContentAssetAccessOperations` resolves Teacher allocation access,
then current mutable Asset or exact RevisionAsset, then File metadata. Its signing
step used the School inline-preview policy, existing file registry, sanitized original
name, persisted MIME, inline/attachment disposition, and a 300 second capability.

`AcademicContentAuthorizedFileSigner` now owns that signing step. It has no actor,
Guardian, Enrollment, Publication, repository, or Prisma dependency. Callers must first
authorize the exact resource/File relationship. Only `{ url }` leaves the signer.
Storage provider failure behavior propagates unchanged. No object stat/existence lookup
is used for authorization. No URL, token, expiry, access grant, or engagement state is
persisted.

Teacher current/revision authorization and routes remain unchanged. Teacher downloads
still skip recipient flags and policy lookup; preview retains its existing policy and
registry behavior. The normal Teacher TTL remains 300 seconds.

## Canonical Publication and RevisionAsset authority

`AcademicContentRecipientReadRepository.findCurrentRecipientAsset` uses one bounded,
parameterized SQL statement. Its materialized canonical-publication CTE reuses
`currentRecipientPublicationQuery` and `matchingRevisionTarget`, orders by
`visible_from DESC, id DESC`, and limits to one publication **before** any file filter.
The outer join requires the requested File in that exact RevisionAsset and School.
An older Revision cannot satisfy a successor request when the successor lacks the File.

The shared predicates retain active User, current Student/Guardian ownership, current
Student/Enrollment, School/Organization, academic year/term, immutable targets, current
positive SubjectAllocation, audience/type, publication status and visibility checks.
Historical audience rows and notification metadata are not ACLs. Late current
relationships can read; former relationships cannot. Guardian notification opt-out
does not affect access.

Student allows `STUDENTS`/`STUDENTS_AND_GUARDIANS`, retains its four types, and denies
Guardian Weekly Note and Teacher Preparation. Parent allows
`GUARDIANS`/`STUDENTS_AND_GUARDIANS`, its five types, and denies Teacher Preparation.

## Thin app use cases and exact HTTP surface

| Actor | Route |
| --- | --- |
| Student | `GET /api/v1/student/academic-content/:contentId/assets/:fileId/access` |
| Parent | `GET /api/v1/parent/children/:studentId/academic-content/:contentId/assets/:fileId/access` |

Both routes require exactly `academics.academic_content.view`, UUID path validation,
and required `mode=preview|download`. Missing/invalid modes and unapproved query
properties fail validation. Successful access returns a 307 Temporary Redirect with
`Cache-Control: no-store, private, max-age=0`.

Student derives its context from `StudentAppAccessService`. Parent derives the current
owned child from `ParentAppAccessService`, using `Student.id` as the child identity.
Both reuse the existing server-owned recipient context builders and deny null-term
asset access without calling Core. App code performs no File/Prisma lookup.

## Private File and current read policy

Recipient resolution requires same-School File identity, exact RevisionAsset membership,
`deletedAt=null`, positive size, and `visibility=PRIVATE`. Foreign, missing, deleted,
public, zero-size, mutable-only, other-content, and predecessor-only Files yield
non-disclosing `not_found`/404 before any signing call.

Current `AcademicContentFilePolicyResolver` controls:

- Student download: `allowStudentDownload`.
- Guardian download: `allowGuardianDownload`.
- Preview: `allowInlinePreview` plus registry `inlinePreviewSupported`.

Download denial uses `academic_content.file.download_unavailable`/403. Preview denial
preserves `academic_content.file.preview_unavailable`/403. Both are documented in
`ERROR_CATALOG.md`. Preview is independent from download policy. Authoring category,
attachment, and maximum-size toggles never become retroactive published-read ACLs.

PDF/image/video/audio preview uses the current registry. DOCX, archive, unsupported
type, and MIME/extension mismatch cannot receive inline capabilities.

## Capability visibility

The signer samples time after authorization and policy resolution, immediately before
`StorageService.createDownloadUrl`. TTL is 300 seconds without `visibleUntil`; otherwise
`min(300, floor((visibleUntil - Date.now()) / 1000))`. Zero or fewer whole seconds gives
`not_found`/404 without signing. This bounds the new capability at issuance; it does not
promise revocation of capabilities already issued before a later relationship change.

Only the signed redirect capability reaches the client. File bucket/object coordinates,
provider metadata, credentials, and capability expiry are not separate response fields.

## Frozen routes, permissions, persistence, and runtime

| Inventory | Base total / GET / non-GET | Candidate total / GET / non-GET |
| --- | --- | --- |
| Student | 104 / 71 / 33 | 105 / 72 / 33 |
| Parent | 76 / 64 / 12 | 77 / 65 / 12 |
| Teacher | 149 / 79 / 70 | 149 / 79 / 70 |

AST inventories verify only the two authorized GET additions, no removed routes, and
identical Teacher routes. Existing Student/Parent security and final-closeout inventories
include these additions. The previous assertion that asset access is absent is updated
to the new validated, authorized route contract.

Generic `/files/:id/download`, `SchoolManagementOnly`, and Parent child task/reinforcement
File routes remain unchanged. Their ownership proofs do not authorize Academic Content.
Student/Parent role permission counts remain 58/47; no role grant or permission catalog
changes. No schema/migration changes (26 migrations), no lifetime/cleanup changes,
notification runtime changes, publication lifecycle changes, feed/resolver changes,
Storage provider changes, infrastructure/deployment/environment changes, new queue,
worker, consumer, or repeat. Runtime topology remains Core consumers 8, Media consumers
1, maintenance repeats 9, API consumers 0, and API schedules 0.

## Verification evidence

Final local gate results and exact baseline diagnostic comparison are recorded below
before commit. Raw evidence remains in ignored `coverage/acc10d/`; exact-head canonical
CI evidence is collected after the single commit/push and Draft PR creation.

The first local PostgreSQL attempt was a TEST_DEFECT: the new fixture used
`studentGuardianLink` instead of the source's `studentGuardian` Prisma delegate.
The failing report is retained; the fixture was corrected without production changes.

### Final local gates

| Phase | Suites | Tests | Result / skips / cleanup |
| --- | --- | --- | --- |
| unit | 149 | 1029 | PASS / 0 / PASS |
| integration | 4 | 245 | PASS / 0 / PASS |
| security | 6 | 144 | PASS / 0 / PASS |
| teacher | 6 | 221 | PASS / 0 / PASS |
| runtime | 4 | 51 | PASS / 0 / PASS |

Prisma validate/generate, production typecheck, standard production build (including
reference-data bootstrap contract), and diff check passed. Runtime recheck includes
final signer and canonical-query test source after the fixture/type corrections.

The changed-file lint gate is **PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION**: 605 errors / 9 warnings at the exact base and 605 errors / 9 warnings at the candidate; zero introduced and zero removed diagnostics.
The changed-file TypeScript gate is **PASS_WITH_DOCUMENTED_BASELINE_EXCEPTION**: 5 baseline / 5 candidate diagnostics, zero introduced and zero removed.
New files have zero lint errors/warnings and zero TypeScript diagnostics.
Production typecheck is a clean PASS. Changed-file lint/typecheck are not clean PASS.

Raw diagnostic reports retain every diagnostic. Comparison maps candidate source
positions to the exact base using Git hunks; unchanged Prettier repair effects are
compared when whole-file diagnostic grouping changes. No configuration changes,
suppressions, excluded diagnostics, or unrelated historical debt fixes were used.
Section 99 authorizes these inherited baseline exceptions.

Local harness SHA labels identify the precommit base. Tests execute worktree source;
precommit file SHA-256 values bind that source to the single committed candidate.
Fresh exact-head CI independently verifies the committed source.

Additional local TEST_DEFECT corrections: Teacher Preparation fixture authoring
audience now respects the existing INTERNAL_STAFF constraint; the legacy Student
read inventory stays at 68 because Academic Content uses a separate permission
case inventory. Final combined permission and HTTP route inventories include the
new route. Failed-attempt reports remain in ignored evidence.

The initial generated-client byte comparison differed because Prisma records the
schema source path and relative path of the task worktree. Regeneration from the
exact accepted schema and the candidate schema proves identical type declarations
and identical runtime code except those two location fields. Candidate generation
is repeatable. The schema and engine version are unchanged; the comparison and raw
generated-code diff are retained in ignored evidence.
