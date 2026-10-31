# ST12 Grades authoring, review release and scoring client contract

This is the canonical ST12 client handoff. It extends [ST11](st11-client-api-handoff.md) and [ADR-0025](../../adr/ADR-0025-scoped-grades-authoring-review-release-and-scoring.md). All paths below include the existing `/api/v1` prefix. Implementation and verification evidence belongs to the final PR handoff; this document does not certify unperformed checks.

## Authority and resource identity

`classId` always means `TeacherSubjectAllocation.id`. Every new Teacher authoring operation requires the opt-in `grades.teacher_authoring.manage` permission, active membership/user/School/Organization, an exact live owned allocation, current academic year/term, matching subject and classroom hierarchy, a CLASSROOM assessment created by that Teacher, DRAFT/unlocked state and no existing attempt. The final transaction repeats these checks in the established allocation/assessment lock order.

The new permission is registered in the governed catalog and excluded from every default role bundle, including platform bundles. Existing assessment listing/detail, review/finalization and synchronization permissions remain separate. Eligible Teacher-created drafts use the existing authorized Core assessment creation workflow; this capability grants question/group/asset authoring on those drafts. Publication and approval retain their existing management permissions. Broader SCHOOL/STAGE/GRADE/SECTION assessments remain readable under existing read rules and cannot be mutated through the new authoring surface.

## Teacher authoring

Let `A=/teacher/classroom/:classId/grades/assessments/:assessmentId/authoring`.

| Method/path | Request / response |
| --- | --- |
| GET A/questions | GradeAssessmentQuestionsListResponseDto; private author keys and correctness only after the full authoring fence |
| POST A/questions | Existing CreateGradeAssessmentQuestionDto; GradeAssessmentQuestionResponseDto; 201 |
| PATCH A/questions/:questionId | UpdateTeacherGradeQuestionDto; required expectedQuestionUpdatedAt ISO revision; question response |
| DELETE A/questions/:questionId | Existing DeleteGradeAssessmentQuestionResponseDto; last canonical question cannot be removed |
| PUT A/questions/reorder | Existing ReorderGradeAssessmentQuestionsDto, exact current question IDs |
| PUT A/questions/points | Existing BulkUpdateGradeAssessmentQuestionPointsDto; canonical sum updates assessment.maxScore atomically |
| GET/POST A/groups | Existing QuestionGroupResponseDto / CreateQuestionGroupDto |
| PUT A/groups/layout | Existing expected-membership ChangeQuestionGroupLayoutDto |
| PATCH/DELETE A/groups/:groupId | Existing UpdateQuestionGroupDto / soft removal; unchanged ST11 membership rules |
| POST A/groups/:groupId/assets | Existing CreateQuestionGroupAssetDto; direct QuestionGroupAssetResponseDto |
| PATCH/DELETE A/groups/:groupId/assets/:assetId | Existing UpdateQuestionGroupAssetDto / reference soft removal |
| GET/POST A/assets, A/questions/:questionId/assets | Existing GradeAssetsResponseDto / CreateGradeAssetDto and GradeAssetResponseDto |
| GET/PATCH/DELETE .../assets/:assetId | Existing asset DTOs; identity and provenance are immutable |
| PATCH .../assets/:assetId/reorder | Existing ReorderGradeAssetDto |
| POST A/uploads | CreateAnswerUploadDto transport fields; existing assessment upload response, 201 |
| GET A/uploads/:uploadId | Uploader-only status; no capability on retry |
| POST A/uploads/:uploadId/complete or /cancel | Existing verified upload lifecycle; 201 |

Question authoring supports all eleven active Grades types, Rich V1 and applicable ST11 responseConfig. The existing canonical normalizers remain authoritative. Point sums must fit the unchanged Decimal(7,2) assessment column; at most 200 active questions are exposed in this authoring contract. Group points derive from canonical children; groups are not answerable or scored. Reordering does not create new option identities.

Asset preview/download paths append `/:assetId/preview` or `/:assetId/download` to the relevant asset collection. Group paths are `A/groups/:groupId/assets/:assetId/{preview|download}`. GET and HEAD use existing private streaming, MIME/inline policy, no-store headers, abort handling and 200/206/416 Range semantics. Managed uploads reuse GRADE_ASSESSMENT_MEDIA and the same assessment context, READY attestation, uploader, quota and File Lifetime rules. Reference removal never deletes the physical File. DR07 upload execution remains separately gated.

Ordinary Teacher question/review endpoints never project author keys or option correctness, even when a role separately has a manage permission.

## Management key approval and audience release

Only current School/Organization management authority may use these operations.

| Method/path under /grades/assessments/:assessmentId | Required permissions | Contract |
| --- | --- | --- |
| POST questions/:questionId/key-approval | grades.questions.manage + grades.assessments.approve | ApproveGradeKeyDto.expectedQuestionUpdatedAt; GradeKeyApprovalResponseDto, 201 |
| POST questions/:questionId/key-approval/revoke | Same | RevokeGradeKeyDto.approvalId; approval response, 201 |
| GET review-release | grades.assessments.approve | GradeReviewReleaseResponseDto; missing row is version 0, NONE/NONE |
| PUT review-release | Same | SetGradeReviewReleaseDto; expectedVersion, UUID requestId, independent studentLevel/parentLevel; 200 |

Paper approval is distinct from current-key approval. Key approvals bind a private bounded question/key/options revision fingerprint. Approving the same current revision is idempotent; replacing/revoking an approval invalidates dependent scoring snapshots and future correct-answer disclosure. Fingerprints and private key values never appear in audit or reviewer suggestion payloads.

Audience levels are NONE, DETAILS and KEYS. Missing, SQL NULL or unknown effective state denies new disclosure. A non-NONE release requires APPROVED/LOCKED paper status with approvedAt, at least one started submission and all started submissions finalized as CORRECTED with correctedAt/reviewedById. Every target read independently repeats approval and that target's finalized-state checks. KEYS additionally requires current approvals for every configured valid key; a non-choice question with SQL NULL key remains unavailable for correct-answer projection. JSON null/malformed configured keys fail closed. No historical row is backfilled or released automatically.

Policy writes serialize on the assessment. The first write expects version 0. Every committed change increments version. UUID request IDs are case-normalized. Repeating the latest identical requestId/body/expectedVersion returns its committed response without another audit. Stale versions, reuse of the latest request ID with a changed body, and older retries with their original expectedVersion conflict. Retry deduplication retains the latest command only; clients must generate a fresh UUID for every new version. A NONE/NONE revocation is permitted without release prerequisites. Subsequent reads and resource media authorization observe the current policy; bytes previously legitimately downloaded cannot be revoked.

## Student and Parent reads

| GET path | Audience |
| --- | --- |
| /student/grades/assessments/:assessmentId/review | Current owning Student |
| /student/exams/:assessmentId/review | Same ownership plus existing exam-type boundary |
| /parent/children/:studentId/grades/assessments/:assessmentId/review | Current ParentAppAccessService child authority and live guardian link |

These routes require grades.assessments.view and return GradeReleasedReviewResponseDto. Parent and Student releases are independent. Submitted/corrected/synchronized status alone grants no detailed review. Wrong Student, child, School, submission, enrollment, academic target or missing release returns non-disclosing 404.

DETAILS includes canonical display/question/option content, typed submitted answers, awarded points and reviewer comments. It excludes raw metadata, private solution JSON, option isCorrect and keys/explanations. KEYS adds only the exact currently approved closed correctAnswer variant plus approved explanations. Corrupt/revoked/unapproved current keys produce correctAnswerAvailable=false. Rich content and group stimulus use their existing closed validators; invalid asset references fall back safely. Parent private-media metadata additionally requires School policy allowGuardianVisibility; it defaults false.

Existing authorized grade/result summaries and own draft answers retain their contracts. Legacy Student Grades/Exams and generic Core submission (including nested question answers) per-answer correctionStatus, awarded points, review timestamp and comments require a fresh request-local disclosure fact; missing facts return pending/null. Revocation applies there too. Parent legacy summary/detail does not acquire new key or reviewer authority.

Under each review route, use:
- GET assets or questions/:questionId/assets for exact released paper metadata.
- GET submissions/:submissionId/questions/:questionId/answer-assets for exact released answer metadata.
- GET/HEAD assets/:assetId/{preview|download}, questions/:questionId/assets/:assetId/{preview|download}, groups/:groupId/assets/:assetId/{preview|download}, or submissions/:submissionId/questions/:questionId/answer-assets/:assetId/{preview|download} for bytes.

Every media authorization repeats release, current ownership and applicable guardian policy before existing READY/File/provenance/MIME/stream checks. Parent receives no general reviewer or files.downloads.view grant. Existing Student own answer-media workflow remains independently authorized.

## Reviewer scoring

Let `R=/grades/assessments/:assessmentId/submissions/:submissionId/answers/:answerId/scoring`. Teacher routes prefix `/teacher/classroom/:classId` before `/grades` and require that exact current allocation. Core routes require School/Organization user type. Both require live grades.submissions.review.

| Method/path | Contract |
| --- | --- |
| POST R/suggestions | Evaluate/persist immutable suggestion; 201; changes no answer mark, submission total or GradeItem |
| GET R/suggestions/:suggestionId | GradeScoringSuggestionResponseDto with PENDING, MANUAL_ONLY, STALE or APPLIED |
| POST R/suggestions/:suggestionId/apply | ApplyGradeScoringSuggestionDto; explicit APPLY or OVERRIDE; 201 |

Suggestion responses expose opaque UUID identity, evaluationVersion=st12-objective-v1, policyVersion=1, exact resources, outcome, suggestedPoints or null, maxPoints, safe reason, manual-review/applicability state and decision timestamps. Private hashes, raw keys and proof material are excluded.

| Grades type | Deterministic behavior |
| --- | --- |
| MCQ_SINGLE / TRUE_FALSE | Exact valid canonical selected option against approved correct option |
| MCQ_MULTI | Exact complete option set; full points or zero; no invented partial credit |
| FILL_IN_BLANK | Explicit V1 fill key, normalization=NFC_TRIM, complete blank IDs; case-sensitive exact accepted texts |
| MATCHING | Exact complete validated pair mapping |
| ORDERING | Existing ST10 complete identity order comparison |
| NUMERIC | Existing exact-decimal semantics and explicitly configured comparison policy; canonical strings may use exponent notation; no implicit tolerance or unit conversion |
| MATH_EXPRESSION | Unchanged ST10 proof engine; proved constants may score; variable/unknown proof results require manual review |
| SHORT_ANSWER / ESSAY / MEDIA | Manual; an approved bounded model_text key may be released but never makes the response deterministic |
| ST11 File/Audio/subjective responseConfig | Manual |

PROVED_EQUIVALENT suggests full canonical points; PROVED_DIFFERENT suggests zero. UNKNOWN_REQUIRES_MANUAL_REVIEW, INVALID_INPUT and UNDEFINED_EXPRESSION suggest no points. Missing approval, malformed key, absent answer and unsupported proof fail closed.

Repeated evaluation of the same current snapshot returns the same suggestion. APPLY requires a current deterministic PENDING suggestion and accepts no extra points/reason. OVERRIDE requires explicit bounded points (at most two decimals) and REVIEWER_JUDGMENT, PARTIAL_CREDIT or KEY_ISSUE. A reviewed answer requires an explicit manual decision. Changed answer/question/key approval or versions makes old evidence STALE. Any second application conflicts; simultaneous decisions serialize. Finalized/locked submissions cannot receive new marks. APPLIED history remains readable only under current reviewer resource authority.

Application reuses the existing Core answer review validation/write in the same transaction as suggestion decision and audit. Previous authoritative marks are retained in evidence and safe audit; existing manual review/finalization audit now uses the locked transaction state. Existing reviewer comments, required-answer rules, finalization and explicit synchronization remain authoritative.

GradeItem synchronization is still a separate existing /grades/submissions/:submissionId/sync-grade-item operation (or the existing Teacher Assignment adapter). Evaluation, final submit, suggestion application and finalization never implicitly synchronize.

## Errors, storage and rollout

Existing 400 validation and scoped 403/404 errors remain. New grades.review.conflict (409) identifies stale_version, not_finalized, not_approved, key_not_approved, already_applied, stale_suggestion or manual_decision_required without private values. Existing lifecycle/lock error codes remain intact.

Migration 20261031120322_st12_grades_review_release_scoring adds a release enum and three School/exact-resource tables: grade_review_release_policies, grade_question_key_approvals and grade_scoring_suggestions. Restrictive composite FKs, partial active-approval uniqueness, bounded checks and an invoker/private-execution retention/identity trigger protect evidence. The inherited 38 migrations remain immutable. This migration contains no backfill or historical mark changes. Deploying/applying it to a live environment requires the existing separate Owner/governed release process.

ST13/ST14, Production deployment, live migration and DR07 operational release remain outside ST12 authorization.
