# ADR-0021: Homework eight-type runtime and atomic typed writes

## Authority and decision

ST09-B/C combined implementation is authorized by the Owner mandate of
2026-10-28, from `0f55de8d875ba4e0ffb67514b3b8a6f3bc270c0e`. This supersedes
only the inactive-runtime boundary of accepted ST09-A. ADR-0020's persisted
representation and pure contract remain authoritative. No schema/migration,
permission grant, automatic scoring, Production media release or deployment
is authorized here.

Activate an explicit eight-value Homework runtime allowlist. Unknown values
remain denied. Keep the existing Core/Teacher/Student routes and domain
ownership. Reuse the accepted pure Fill/Matching/MEDIA validators, existing
question metadata, private answerKey, answerJson and textAnswer columns.
Extract the existing legacy answer dispatcher into a Homework domain function
and extend that dispatcher explicitly; do not introduce another assessment
engine or reuse Grades scoring.

## Authoring and publication

New-type metadata is an entire closed replacement, never a generic merge.
Private key writes are separately tagged. An omitted key is preserved only
when valid for the resulting definition. An explicit clear writes SQL NULL.
New types cannot acquire legacy options or expectedAnswer. Type transitions
preserve UUID and reject existing current or historical option/answer/asset
relationships. Typed-to-legacy transitions require deliberate metadata
replacement/clear and a clear for any existing private key.

Creation without Rich content and all typed mutations use the existing ST06
protected author boundary. Allocation precedes assignment/question locks.
Every option writer checks the locked current question type; legacy ordinary
display/metadata edits retain the accepted ST08 distinction from protected
Rich mutations. Reordering/deletion cannot bypass a typed parent check.

Publication reuses the existing assignment transaction but first proves the
specific live publication grant and allocation. It rechecks lifecycle and
deadline, current questions/options, complete typed definitions, private-key
compatibility, Rich references, actual MEDIA authority and current targets
before any target/status write. Stale assignment update/target-resolution
paths also check locked DRAFT state, so they cannot overwrite published
targets after an earlier successful read.

MEDIA uses an existing exact HomeworkQuestionAsset only. The Homework-owned
ST06 repository supplies a narrow transaction-aware stimulus check supporting
both verified managed Files and the already permitted external HTTPS binding.
It reuses provenance, policy, MIME/category and tenant/owner checks. It neither
fetches external hosts nor performs provider I/O inside locks. Byte access
continues through the existing ST06 GET/HEAD/Range endpoints, with independent
live authorization. Parent and review-only surfaces acquire no new media
authority.

## Student mutation and review

Requests involving typed questions/fields use one bounded repository
transaction. Live membership and the specific existing operation grant are
held stable before assignment/target/submission locks. A target serializes
the first draft, saves, clears and both submit aliases. Current definitions
and MEDIA authority are re-read; all requested answers are normalized and
written together. A failure rolls back a newly created draft and every earlier
answer in that request. Inline answers and terminal submit share this same
transaction, with authoritative persisted-answer/SQL-null validation and
current body/attachment/deadline checks. Original-five-only behavior remains
on its existing public paths; duplicate bulk identities and incompatible
typed fields are explicitly rejected.

Manual review remains manual. Typed submission review revalidates reviewer
membership, permission and live allocation before parent/submission locks.
It validates current submitted answers and point bounds, serializes concurrent
reviews and recomputes the rollup from actual stored marks. Omitted points or
comments do not overwrite a concurrent review. Required review completion is
checked again before REVIEWED. No private key is consulted for marking, and
the existing Grade Sync delegates retain their existing behavior.

## Private projections and compatibility

Do not widen shared selectors with answerKey or answerJson. Dedicated bounded
queries fetch structured answers and authoritative `IS NULL` facts only for
resolved submissions. Author keys require a separate live management check
and explicit reconstruction; review permission alone never exposes them.
Public definitions are reconstructed through the closed validator. MEDIA
source presentation requires the existing authorized ST06 reader. Parent
omits MEDIA source and Rich content; submitted answers and review-release
timing remain unchanged. Invalid stored JSON is withheld/rejected without
read-time repair. SQL NULL means absence; JSON null is invalid structured
content. Required public definitions reject both null forms.

New fields are additive. Lowercase wire types remain distinct. Clients must
support all eight interactions before a separately approved rollout; unknown
types must not be rendered as generic text/choice questions. A successful
submit-only operation retains ST08-C response behavior without requiring
unrelated view/save permissions or granting media bytes.

## Verification and operational boundary

See the ST09-B/C discovery matrix and versioned client contract. Require
actual HTTP/PG lifecycle tests, real private bytes, negative tenant/permission
cases, observed PostgreSQL lock dependencies, final-row/rollback comparisons,
ST06/ST08/ST09-A/Grades regressions, immutable 33-migration consistency,
build/postbuild, non-fixing exact-base lint comparison and fresh exact-head
CI/artifact integrity. These are acceptance obligations, not an independent
Reviewer Receipt. Keep one Draft PR; no Ready, merge, deployment, live
migration, Terraform apply, physical business File deletion or ST10 work.
