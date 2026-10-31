# ST11-B multipart question groups contract

Implementation mandate: MOAZEZ-ST11-FULL-IMPLEMENTATION-2026-10-30. Initial main: 5f42c4937a4c5bb50680cf78a7b23d2783cf32b2. This is the second, stacked ST11 Draft change; A1/A2 remain the answer-media foundation. Final Planning acceptance is pending.

## Persistence and ownership

HomeworkQuestionGroup belongs to one HomeworkAssignment and School. GradeAssessmentQuestionGroup belongs to one GradeAssessment and School. Each has title, optional instructions, nullable validated shared stimulus, layout order, immutable creator and soft-delete history. Neither has an answer, answer key, score or grading state. Canonical questions retain their identities and all eleven types; nullable group membership uses a composite (group, School, exact parent) FK. No legacy rows are backfilled.

HomeworkQuestionGroupAsset and GradeAssessmentQuestionGroupAsset own their actual group, source and File references. Existing authoring purposes remain HOMEWORK_ASSIGNMENT_MEDIA and GRADE_ASSESSMENT_MEDIA. Managed binding requires genuine server-owned READY evidence, exact School/Organization/parent/uploader, active private File and current policy. Approved external HTTPS uses the existing persisted-URL policy. Source identity and creator are immutable. Metadata update cannot swap sources; replace with a new binding. Delete is soft and cannot revive a binding. All references, including deleted ones, retain the physical File globally.

The migration adds restrictive physical FKs, four identity triggers, two live-File triggers and six membership guards using one private invoker trigger function. It does not alter existing migration SQL or grant function execution to PUBLIC/runtime roles. Group deletion must detach active children first. Direct SQL cannot attach a child to another School/parent or deleted group, reparent a group, revive it, or revive a deleted asset reference. Application lifecycle and current actor authorization remain enforced at the final transaction boundary.

## Authoring and order

Homework group/child/layout request bounds are 100, derived from the enforced Homework answer batch limit. Grades bounds are 200, derived from Grades question bulk validation. Existing maximum-question and QUESTION_BASED publication checks still apply to canonical questions. Title is required, trimmed and at most 255 characters; instructions are nullable and at most 2000. Unsafe controls, HTML and undefined/nested group structures are rejected. Shared stimulus accepts only closed RichQuestionContent V1, without answer keys or raw HTML. Its assetReference IDs must resolve to available assets of that exact group and matching category.

Create/update/remove/membership/order/asset writes revalidate live membership, existing permission, allocation where applicable, parent lifecycle and absence of structural attempts/submissions. Homework is DRAFT only under its existing author rules. Grades is QUESTION_BASED, DRAFT and unlocked under existing Core authority; all Teacher Grades group writes are denied, even with an existing manage grant. No role or permission seed changes.

Lock order is existing authorization/allocation fence, parent, groups ordered by ID, questions ordered by ID, then applicable policy/upload/File/asset rows. The private transaction facade has exactly eight reviewed DB-only callbacks per domain, maxWait 5000 ms and timeout 15000 ms. Provider verification and streaming stay outside those callbacks. No storage bucket resolution occurs while holding their locks.

PUT groups/layout atomically changes explicitly listed children and top-level blocks. Each membership item includes expectedGroupId (including null), desired groupId (including null) and layoutOrder. Duplicate IDs, foreign/deleted groups, foreign questions, grouped questions passed as flat blocks, malformed order and stale membership are rejected; a later invalid item rolls back earlier writes. Concurrent moves with the same expected membership yield one success and one 409. Omitted children remain unchanged. No nested groups or implicit reparenting exists.

Top-level question/group blocks sort by explicit layout order, falling back to legacy question sortOrder, with ID tie-breaks. Children use explicit layout order then legacy sortOrder with ID tie-breaks. Grades' unique legacy sortOrder is never renumbered. DELETE group detaches active children, clears their explicit layout and soft-deletes all active group assets. Their Files remain retained. A referenced asset cannot be removed until the group's AST no longer references it.

## Runtime and compatibility

The existing flat questions and response envelopes remain canonical. Opted-in roots add groups/displayItems, and child DTOs add groupId. Student Homework places the layout under homework; Student Exams retains stages[0].questions; Student Grades retains questions. Core, Teacher author/review and finalized submission projections receive authorized group context. Parent historical projections remain unchanged. No private answer key, correctness flag, bucket, object key or signed provider credential is released through these fields.

Every child remains independently required/optional and uses its existing draft/bulk/final APIs, including ST11-A responseConfig. A group ID cannot be submitted as a question, cannot create an Answer row and never contributes a second score. Group points are a decimal string derived from active children. Grades QUESTION_BASED maxScore must still equal the sum of all active canonical questions. Manual Homework review and Grades finalization remain authoritative; both GradeItem synchronization workflows remain explicit.

Read projection omits unsafe/unavailable shared stimulus and sets sharedStimulusSupported=false; its asset metadata marks unavailable. The same condition blocks publication. Loss of a display File after publication does not block child answers or manual review. Native private streaming rechecks exact parent/group/asset access and current source policy before opening bytes. GET/HEAD/Range, no-store headers, safe inline policy and abort handling reuse the existing transport.

Physical reference quota is shared across assessment/question/group stimulus bindings within the parent (eight active references maximum); same verified source reuse is separately authorized, while physical upload/storage quota is charged once. Existing ungrouped Homework asset behavior remains compatible. Cross-parent, cross-School, different-uploader and answer-upload source reuse are denied by authoritative upload provenance. DR07 execution defaults and Production denial remain unchanged.

## Verification contract

Executable evidence lives in question-group.spec.ts, st11-multipart-runtime.e2e-spec.ts, st11-multipart-security.e2e-spec.ts, st11-multipart-media.e2e-spec.ts and st11-multipart-integrity.integration.spec.ts. These cover deterministic order, real SQL ancestry/history/retention, atomic and concurrent moves, actor revocation, publication, all eleven child types, required/optional behavior, real private storage bytes, group deletion, derived scores and explicit synchronization. Existing ST11-A, eleven-type, rich-content, media and File lifetime regressions remain routed in CI.

Migration gates require fresh 38-migration replay, status, repeat no-op deploy, Prisma validate/generate, all inherited checksums, physical DMMF File-FK/live-trigger parity and private trigger-function ACLs. Exact-head Actions, Required artifact, regression parity and cleanup evidence must be reported in the consolidated ST11 handoff. Full lint and standalone typecheck limitations must be stated separately from focused checks.

ST11_FINAL_PLANNING_ACCEPTANCE=PENDING. DR07_OPERATIONAL_RELEASE=PENDING. PRODUCTION_DEPLOYMENT=NOT_AUTHORIZED. LIVE_MIGRATION=NOT_AUTHORIZED. ST12–ST14=NOT_STARTED.
