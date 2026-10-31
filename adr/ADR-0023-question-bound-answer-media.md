# ADR-0023: Question-bound student answer media

Status: implemented source contract, pending independent review and operational release.

Authority: `MOAZEZ-ST11-FULL-IMPLEMENTATION-2026-10-30`, approved initial main `5f42c4937a4c5bb50680cf78a7b23d2783cf32b2`. This authorizes ST11-A and ST11-B source implementation and Draft PRs. It does not authorize deployment, live migration, DR07 release, Teacher Grades permission expansion or ST12–ST14.

## Decision

Add nullable, closed V1 response configuration to real Homework/Grades questions. The six modes use one pure modality evaluator; domain adapters retain their own validation errors, enrollment, lifecycle, permissions and review authorities. Configuration is restricted to Homework SHORT_TEXT/LONG_TEXT and Grades SHORT_ANSWER/ESSAY. Absence preserves existing behavior and omits the new DTO field. MEDIA remains stimulus plus text; the eleven enum values remain unchanged.

An upload reservation creates an append-only `AssessmentAnswerUploadIntent` in the same transaction, before any storage capability is returned. It owns the exact School/Organization/actor/Student/purpose/context/question/session/request tuple through discriminated composite FKs. It is not an Answer. The existing purposes retain HomeworkTarget and GradeSubmission contexts. A request ID replay on another question conflicts before capability replay.

The first verified binding creates or reuses the domain Answer and inserts its existing AnswerAsset in one transaction. One append-only `AssessmentAnswerMediaClaim`, globally unique by File and intent, records consumption across both answer-asset families. Discriminated composite FKs bind the exact Answer ancestry, question, Student and File owner. Triggers retain history, require matching asset creator and claim, reject source changes/resurrection and reject Files already linked to legacy answer assets. Nullable historical asset claim IDs are preserved without backfill.

Upload preparation never inserts an Answer. No parallel answer-asset table, temporary answer status, fabricated answer text/JSON, score or automatic sync is introduced. Homework live duplicate Answer rows fail closed; no historical partial uniqueness or row cleanup is imposed.

## Concurrency and transport

Media mutations acquire the existing School reservation mutex before domain-owned Assignment/Assessment and Target/Submission locks. Homework additionally locks an existing draft Submission before Question/Answer, including the first-answer case. The common trailing order is Question, Answer, Intent, UploadSession/File and Asset. Existing student answer/final writers acquire live authorization locks before parent locks. Provider verification and private streaming remain outside transactions. Final submission and manual review recheck current media evidence and modality under domain locks.

Private reads use resource authorization and the existing `PrivateMediaContentService`/Range transport, including authorization before HEAD and conditional reads and again before streaming. Student routes resolve own identities; Teacher routes are read-only and require the exact allocation and submitted resource. Core routes retain management boundaries. Parents receive no new answer-media access. New views expose no storage coordinates, evidence objects or persistent capabilities.

## Retention, migrations and limits

Intents/claims intentionally have only `createdAt`: they are immutable provenance records, not editable resources. Claimed assets are soft-deleted; claimed history cannot be hard-deleted by application operations. Global File lifetime includes claims and old soft-deleted links without tenant filtering. Disposable tests alone may TRUNCATE their owned registry/asset tables for teardown.

The initial schema migration was applied only to the owned disposable fixture. Subsequent SQL history and creator guards are forward migrations; applied SQL remains immutable. The 34 inherited migration directories are unchanged. No old Grade/Homework answer or asset is backfilled.

The active per-answer cap defaults to one and is bounded by three, with the existing resource cap of eight and School caps still authoritative. Opt-in text bounds are 1,000/10,000 code points. Candidate file MIME types are text/plain, PDF, JPEG and PNG; audio types are MPEG, MP4 and WebM. Actual availability intersects the registry, current School policy, technical metadata limits and security verifier. Existing unavailable PDF/image deep inspection remains denied. No video response is supported.

The production security provider remains `UnapprovedAssessmentMediaSecurityGate`; uploads remain default-off and denied in production. Actual audio verification belongs to the pinned media-runtime test owner. Test-only attestation is never registered by application modules. DR07 remains pending.

## Consequences

Legacy flat authoring, question identities, attachments, text/typed answers, manual marks and explicit sync remain their existing authorities. Configured required answers depend on verified eligible assets at final submission, not upload counts. Optional absence is allowed; explicitly supplied partial final answers are rejected. Empty opt-in Grades answers do not count toward pending/progress/review completeness. Multipart groups are a separate ST11-B model and layout change; they do not become another question type or Answer owner.
