# ADR-0024: Non-answerable multipart question groups

Status: implemented for ST11-B Draft review; final Planning acceptance pending.

The ST11 mandate authorizes multipart display in Homework and Grades while keeping their existing eleven question types, answer rows, review and explicit grade synchronization. These domains retain separate models, resource authorization and lifecycle rules.

Add separate HomeworkQuestionGroup and GradeAssessmentQuestionGroup models, each bound physically to its School and exact parent. Canonical questions receive nullable groupId and independent layoutOrder. A group owns no answer, answer key, points or awarded score. Its displayed points are the sum of active children. Existing question IDs and Grades' unique sortOrder remain unchanged. There is no backfill or implicit reparenting.

Membership changes require an explicit expectedGroupId and run atomically under the existing parent mutation fence, followed by sorted group and question locks. A stale move returns 409. Deleting a group detaches active children, clears their explicit layout order and soft-deletes its assets in that transaction. Deleted group identities and asset bindings cannot revive. Physical ancestry FKs and membership/identity triggers enforce the structural boundary independently of HTTP validation.

Groups own shared, closed ST08 RichQuestionContent V1 and their own asset bindings. Verified managed sources reuse existing authoring purposes and exact parent/uploader provenance; approved external HTTPS uses the existing URL policy. File references are immutable, private, counted against the existing parent reference limit and globally retained after link deletion. Reusing the same verified physical source within one parent charges physical storage once; every binding is separately authorized. No answer upload can become a group stimulus.

Only existing Core School/Organization authorities may author Grades groups. Teachers may read authorized Grades group context through existing submission-view rights, including exact allocation checks, and have no group mutation surface. Homework preserves its existing Core and allocated Teacher authoring rules. Parents receive no new group/media release. No IAM grants change.

Authorized projections register group context alongside the existing question records. Legacy flat collections omit new fields until groups or explicit layout are used. Invalid or unavailable stored stimulus is omitted with sharedStimulusSupported=false on reads; publication rejects it. Child answer validation and manual review do not depend on display media availability. Real provider reads and native streaming occur after the authorization transaction closes.

The additive migration is 20261030163220_st11b_multipart_question_groups. All 37 predecessor migrations remain immutable. See the ST11 multipart contract and client API handoff for limits, routes, errors and compatibility evidence. Production migration, DR07 release, Ready and merge remain owner-controlled and unauthorized by this implementation.
