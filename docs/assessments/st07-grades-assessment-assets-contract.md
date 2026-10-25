# ST-07 Grades assessment and question assets contract

Status: implementation contract; independent review pending. Authority: Owner ST-07 execution order and the two explicit Owner decision responses. Base: `b4333aeaa43d645d07aad68fd9c0d330c47fc896`. ST-07 only; no operational release.

## 1. Source discovery and gaps

| Status | Source | Finding / correction |
| --- | --- | --- |
| ALREADY_IMPLEMENTED | `prisma/schema.prisma`, ST-05 migration | Both normalized asset tables, immutable identity constraints, tenant FKs and retained File consumers exist. No migration needed. |
| REUSE_REQUIRED | `files/assessment-media`, `storage/private-media-content.service.ts` | Existing producer, policy, File provenance and private HTTP streaming remain authoritative. |
| MISSING | `grades/assessments` | Assessment-wide and question asset authoring, safe metadata and resource content routes. |
| RISK | `grades-resource-access.ts` | Teacher broad read scope must not confer write ownership. |
| RISK | `assessment-media-ready.ts` | READY consumer is Homework-specific; extend with an internal typed expected authoring purpose, preserving the Homework wrapper. |
| RISK | `grades-media-authorization.ts` | Existing author upload requires question-based mode. Allow legitimate SCORE_ONLY assessment media through equivalent DRAFT/unlocked/term/submission guards. |
| MISSING | Student Exams / Grades presenters | Add assets without changing existing envelopes, questions, answers or grade release. These audiences differ. |
| DECISION_RESOLVED | Owner ST07_TEACHER_AUTHORING | Exact CLASSROOM allocation plus creator, existing manage permission, final transactional revalidation. |
| DECISION_RESOLVED | Owner ST07_SAME_ASSESSMENT_FILE_REUSE | Same-assessment verified physical File reuse, each reference authorized, quota once, reference capacity separately enforced. |

Paths above are relative to `src/modules/` unless stated otherwise.

## 2. Ownership matrix

Assessment assets belong to the exact active GradeAssessment. Question assets belong to an actual active GradeAssessmentQuestion of that assessment, in QUESTION_BASED mode. School and Organization must match at every boundary. Core authors are active School/Organization actors; Teacher uses the narrower policy below. Students receive only their current authorized assessment projection; Parent is excluded. Asset IDs and File IDs alone confer no authority.

## 3. Core route matrix

Under `/api/v1/grades/assessments/:assessmentId/assets` and `/api/v1/grades/assessments/:assessmentId/questions/:questionId/assets`: GET collection, GET `/:assetId`, POST collection, PATCH `/:assetId`, PATCH `/:assetId/reorder`, DELETE `/:assetId`, GET/HEAD `/:assetId/preview`, GET/HEAD `/:assetId/download`. UUID parameters and validated DTOs are required. Assessment family reads/writes use existing `grades.assessments.view/manage`; question family uses `grades.questions.view/manage`. Managed binding additionally requires the existing upload-purpose permission `grades.questions.manage`. No grant changes.

## 4. Teacher routes and approved authoring decision

Equivalent families under `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId`. `classId` means the existing owned allocation ID. Reuse TeacherAppAccessService, ownedAllocationWhere and TeacherAllocationOperationalWriteGate. Reads retain existing allocation scope. Writes require ALL Owner conditions: TEACHER identity; active membership and existing operation-specific manage permission; exact live owned allocation; CLASSROOM scope and exact classroom; assessment creator equals authenticated user; School/Organization, subject, year and term match; DRAFT/unlocked and applicable structural/submission guards; current membership/permission/allocation/lifecycle revalidated in the write transaction. Broader SCHOOL/STAGE/GRADE/SECTION write scopes are denied. Canonical Teacher roles lacking manage permission remain denied; no ST-12 expansion.

## 5. Student Exams audience

Reuse the existing Exams enrollment, allocated subjects, year/term, scope, published/approved and exam-type filter. Private GET/HEAD paths are rooted at `/api/v1/student/exams/:assessmentId`; assessment assets and exact question assets use `assets/:assetId/{preview,download}`. Re-resolve actual Student context and current visibility for every private content authorization pass.

## 6. Student Grades audience

Reuse the existing Grades assessment audience, including legitimate non-exam types; never return Exams paths for these resources. Paths use `/api/v1/student/grades/assessments/:assessmentId` with the same resource suffixes. Existing `grades.assessments.view` permission applies. No grade, answer-key or result release changes.

## 7. JSON contracts

Author collections return assessmentId, optional questionId and assets; exact detail returns asset. Safe asset fields include assetId, assessmentId, questionId when applicable, sourceType, category, bounded plain title/description, sortOrder, sanitized original filename/MIME/decimal-string size, external URL and authorized access paths. No File ID, bucket, object key, security evidence, uploader identity or signed capability is exposed. Student Exams detail adds root assets and per-question assets; Student Grades adds assessment.assets and per-question assets. Zero assets is `[]`. Unusable historical sources have null access for authors and are withheld from Students.

## 8. Managed eligibility and approved reuse decision

Only genuinely READY server-verified `GRADE_ASSESSMENT_MEDIA` uploads with exact purposeContextId, School, Organization and uploader are eligible. Verify session/File identity, immutable private bucket/key/name, MIME, size, checksum, version, timestamps, CLEAN evidence and deletion/cleanup state. Client attestation cannot manufacture READY. Homework and submission purposes, generic files, other contexts, tenants or uploaders are denied.

The Owner permits one verified physical File across an assessment asset and multiple exact question assets of that SAME assessment. Every binding is independently authorized. Physical upload/storage reservations are charged once by the existing producer. Existing policy resource limits also bound active logical references across both asset families in the assessment, under the assessment lock; reuse cannot create unbounded references. No new quota settings or uniqueness rules. Soft-deleting a reference never deletes the physical File.

## 9. External HTTPS

Reuse the configured PersistedUrlPolicy and the ST-05 database-compatible restrictive HTTPS grammar through shared pure technical utilities. No server fetching. Reject credentials, signed/storage/provider/private/internal URLs, query/fragment capability URLs, unsafe schemes and generic File download URLs. External sources never create File rows or private byte routes. Immutable URL replacement requires a new asset.

## 10. Delivery modes

SCORE_ONLY supports assessment-wide assets, no question asset mutation, no fabricated question, and supportsQuestionSubmission remains false. QUESTION_BASED supports both families with exact parent identity and existing structural/submission guards. Assets are optional for publication.

## 11. ST-04 compatibility

All eight types and canonical interactions remain unchanged. MEDIA remains approved external HTTPS stimulus plus bounded manually reviewed text response; asset delivery does not introduce another answer mode. No correct answer, grading metadata or draft material is added to Student projections.

## 12. Transaction and locks

Use school-scoped interactive transactions. Revalidate live membership, permission, school/org and actor first; Teacher allocation gate precedes assessment lock. Lock the exact assessment FOR UPDATE, reread lifecycle and term, apply existing domain guards, then lock exact question, exact asset and applicable policy/session/File rows. Managed bindings recheck current provenance and policy inside this transaction. All writes and audit commit atomically. Keep storage I/O outside write transactions. Existing lifecycle operations take the same assessment row, so publish/approve/lock serialize against asset edits. Do not upgrade School SHARE locks after taking the live permission lock. Current active logical-reference count is checked while the assessment is locked. Metadata/reorder/delete cannot alter source identity.

## 13. File Lifetime

Preserve all 26 retained File consumers, including deleted/historical asset references. No physical deletion, object rewrite, quota refund, cleanup worker expansion or retention exception is authorized. ST-05 migrations must exist before runtime, verified only on owned disposable fixtures.

## 14. Private preview and download

Reuse PrivateMediaContentService and existing streaming helpers: GET/HEAD, 200/206/416, Range and If-Range, trusted MIME inline policy, attachment disposition, private no-store/nosniff, bounded response and abort handling. Preview/download school flags apply independently. Every resolver pass rechecks resource authorization and current File eligibility. Unsafe sources return non-disclosing 404.

## 15. DR-07

Production media release remains unapproved and disabled, including when a feature flag is set. No runtime fake scanner or security bypass. Real tests use isolated owned storage and a test-only explicitly supplied security verifier; report that this is not operational approval.

## 16. Parent and Reviewer

No Parent metadata/content route or permission is added. Existing Reviewer read/permission semantics apply without authoring expansion. Core access is School/Organization; Teacher access uses only its dedicated allocation wrapper.

## 17. Acceptance mapping

Unit: immutable DTO/source/text/URL and purpose-bound READY evidence. Real PostgreSQL: both asset lifecycles, exact relationships/tenants, zero and SCORE_ONLY, allowed and denied Teacher decisions, same-assessment reuse and physical/reference quota, revoked permissions/membership/allocation, lifecycle/submission/retirement/reorder races, retention. HTTP/private MinIO: actual bytes, supported MIME, preview/download policy, GET/HEAD/Range/If-Range/416/abort and reauthorization; Student Exams and broader Grades audiences. Regress ST-04 eight types, Homework/ST-06, ST-05 integrity/File Lifetime, Student and Teacher contracts, submission/GradeItem synchronization. Verify route inventories and CI ownership, build/postbuild, migration governance and non-mutating lint against the exact base; full inherited lint failures must be reported. Fresh exact-HEAD CI, Required artifacts/digests and owned-fixture cleanup are delivery gates.

## 18. Deferred scope and delivery

No unresolved Owner policy decisions. No schema/migration, new purpose/grant, generic upload redesign, Homework behavior redesign, Production/cloud/shared database change, DR-07 release, Parent media, broader Teacher authoring or ST-08+. Normal commit/push and exactly one Draft PR; do not mark Ready, merge or deploy. Independent Backend review and acceptance remain pending. Evidence and final route manifest will be recorded after verification; this contract does not certify unrun tests.

### Verified discovery: technical media release limitations

The existing ST-03 AssessmentMediaVerifier deliberately returns `assessment_media.verifier_unavailable` for images and PDFs after bounded signature/dimension inspection; those checks do not supply approved deep integrity or malware evidence. ST-07 preserves that gate. Real PNG/PDF upload bytes must fail closed and produce no bindable File. Audio/video remain subject to the existing restrictive school MIME policy and pinned runtime/security requirements. Actual text private bytes exercise the authorized streaming path. None of these isolated tests grants DR-07 release approval.

The ST-03 producer is an internal AssessmentMediaService API, as preserved by ST-06. No public upload-lifecycle REST endpoint is added here. Managed binding consumes legitimately READY IDs from an approved server integration; direct client managed uploads remain operationally unavailable. Generic File uploads cannot substitute for the required purpose-bound producer. External reference authoring needs no upload.

Canonical Teacher permissions in `src/modules/iam/reference-data/system-role-catalog.ts` include view/review but omit `grades.assessments.manage` and `grades.questions.manage`. Consequently default Teachers cannot author these assets; positive author tests use previously granted permissions in owned test roles. No runtime permission seeds or role grants change.

## Implemented exact REST manifest

Every path includes the framework prefix. Managed request IDs are accepted only in CreateGradeAssetDto and never returned in asset metadata. Actor ownership is defined in sections 2–6 and checked again by the resource repository; each row uses that exact rule. New author endpoints require the existing operation permission below. Student content always requires current audience resolution. Common errors: 401 unauthenticated; 403 missing route permission; non-disclosing 404 inaccessible/mismatched/unusable resource; 400 invalid DTO/source/metadata; existing 409 lifecycle/policy/quota errors; private media may return 206 or 416. POST returns 201, DELETE 204, other successful metadata operations 200. GET/HEAD content follows existing private-media responses.

Test mapping: `test/security/tenancy.grade-assets.spec.ts` verifies author, tenant, immutable identity and provenance denials; `test/e2e/grade-assets.e2e-spec.ts` verifies both author families, Student surfaces, safe JSON, all 56 OpenAPI operations and actual HTTP/private bytes; `test/integration/grade-assets.integration.spec.ts` verifies the actual transactional guards and races. Route/permission inventories separately enumerate every new Teacher and Student handler.

| Actor | Method | Exact path | Existing permission | Request DTO | Response |
| --- | --- | --- | --- | --- | --- |
| Core School/Organization | GET | `/api/v1/grades/assessments/:assessmentId/assets` | `grades.assessments.view` | none | GradeAssetsResponseDto |
| Core School/Organization | POST | `/api/v1/grades/assessments/:assessmentId/assets` | `grades.assessments.manage` | CreateGradeAssetDto | GradeAssetResponseDto |
| Core School/Organization | DELETE | `/api/v1/grades/assessments/:assessmentId/assets/:assetId` | `grades.assessments.manage` | none | 204 |
| Core School/Organization | GET | `/api/v1/grades/assessments/:assessmentId/assets/:assetId` | `grades.assessments.view` | none | GradeAssetResponseDto |
| Core School/Organization | PATCH | `/api/v1/grades/assessments/:assessmentId/assets/:assetId` | `grades.assessments.manage` | UpdateGradeAssetDto | GradeAssetResponseDto |
| Core School/Organization | GET | `/api/v1/grades/assessments/:assessmentId/assets/:assetId/download` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Core School/Organization | HEAD | `/api/v1/grades/assessments/:assessmentId/assets/:assetId/download` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Core School/Organization | GET | `/api/v1/grades/assessments/:assessmentId/assets/:assetId/preview` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Core School/Organization | HEAD | `/api/v1/grades/assessments/:assessmentId/assets/:assetId/preview` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Core School/Organization | PATCH | `/api/v1/grades/assessments/:assessmentId/assets/:assetId/reorder` | `grades.assessments.manage` | ReorderGradeAssetDto | GradeAssetResponseDto |
| Core School/Organization | GET | `/api/v1/grades/assessments/:assessmentId/questions/:questionId/assets` | `grades.questions.view` | none | GradeAssetsResponseDto |
| Core School/Organization | POST | `/api/v1/grades/assessments/:assessmentId/questions/:questionId/assets` | `grades.questions.manage` | CreateGradeAssetDto | GradeAssetResponseDto |
| Core School/Organization | DELETE | `/api/v1/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId` | `grades.questions.manage` | none | 204 |
| Core School/Organization | GET | `/api/v1/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId` | `grades.questions.view` | none | GradeAssetResponseDto |
| Core School/Organization | PATCH | `/api/v1/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId` | `grades.questions.manage` | UpdateGradeAssetDto | GradeAssetResponseDto |
| Core School/Organization | GET | `/api/v1/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/download` | `grades.questions.view` | none | private bytes / HEAD headers |
| Core School/Organization | HEAD | `/api/v1/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/download` | `grades.questions.view` | none | private bytes / HEAD headers |
| Core School/Organization | GET | `/api/v1/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/preview` | `grades.questions.view` | none | private bytes / HEAD headers |
| Core School/Organization | HEAD | `/api/v1/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/preview` | `grades.questions.view` | none | private bytes / HEAD headers |
| Core School/Organization | PATCH | `/api/v1/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/reorder` | `grades.questions.manage` | ReorderGradeAssetDto | GradeAssetResponseDto |
| Student | GET | `/api/v1/student/exams/:assessmentId/assets/:assetId/download` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | HEAD | `/api/v1/student/exams/:assessmentId/assets/:assetId/download` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | GET | `/api/v1/student/exams/:assessmentId/assets/:assetId/preview` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | HEAD | `/api/v1/student/exams/:assessmentId/assets/:assetId/preview` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | GET | `/api/v1/student/exams/:assessmentId/questions/:questionId/assets/:assetId/download` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | HEAD | `/api/v1/student/exams/:assessmentId/questions/:questionId/assets/:assetId/download` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | GET | `/api/v1/student/exams/:assessmentId/questions/:questionId/assets/:assetId/preview` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | HEAD | `/api/v1/student/exams/:assessmentId/questions/:questionId/assets/:assetId/preview` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | GET | `/api/v1/student/grades/assessments/:assessmentId/assets/:assetId/download` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | HEAD | `/api/v1/student/grades/assessments/:assessmentId/assets/:assetId/download` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | GET | `/api/v1/student/grades/assessments/:assessmentId/assets/:assetId/preview` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | HEAD | `/api/v1/student/grades/assessments/:assessmentId/assets/:assetId/preview` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | GET | `/api/v1/student/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/download` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | HEAD | `/api/v1/student/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/download` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | GET | `/api/v1/student/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/preview` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Student | HEAD | `/api/v1/student/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/preview` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Teacher | GET | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/assets` | `grades.assessments.view` | none | GradeAssetsResponseDto |
| Teacher | POST | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/assets` | `grades.assessments.manage` | CreateGradeAssetDto | GradeAssetResponseDto |
| Teacher | DELETE | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/assets/:assetId` | `grades.assessments.manage` | none | 204 |
| Teacher | GET | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/assets/:assetId` | `grades.assessments.view` | none | GradeAssetResponseDto |
| Teacher | PATCH | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/assets/:assetId` | `grades.assessments.manage` | UpdateGradeAssetDto | GradeAssetResponseDto |
| Teacher | GET | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/assets/:assetId/download` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Teacher | HEAD | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/assets/:assetId/download` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Teacher | GET | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/assets/:assetId/preview` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Teacher | HEAD | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/assets/:assetId/preview` | `grades.assessments.view` | none | private bytes / HEAD headers |
| Teacher | PATCH | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/assets/:assetId/reorder` | `grades.assessments.manage` | ReorderGradeAssetDto | GradeAssetResponseDto |
| Teacher | GET | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/questions/:questionId/assets` | `grades.questions.view` | none | GradeAssetsResponseDto |
| Teacher | POST | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/questions/:questionId/assets` | `grades.questions.manage` | CreateGradeAssetDto | GradeAssetResponseDto |
| Teacher | DELETE | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId` | `grades.questions.manage` | none | 204 |
| Teacher | GET | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId` | `grades.questions.view` | none | GradeAssetResponseDto |
| Teacher | PATCH | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId` | `grades.questions.manage` | UpdateGradeAssetDto | GradeAssetResponseDto |
| Teacher | GET | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/download` | `grades.questions.view` | none | private bytes / HEAD headers |
| Teacher | HEAD | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/download` | `grades.questions.view` | none | private bytes / HEAD headers |
| Teacher | GET | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/preview` | `grades.questions.view` | none | private bytes / HEAD headers |
| Teacher | HEAD | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/preview` | `grades.questions.view` | none | private bytes / HEAD headers |
| Teacher | PATCH | `/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/questions/:questionId/assets/:assetId/reorder` | `grades.questions.manage` | ReorderGradeAssetDto | GradeAssetResponseDto |

### Client usage and OpenAPI additions

Teacher Dashboard selects the existing allocation ID as `classId`, then uses the assessment collection or the exact question collection. Obtain a READY upload through the existing Grades assessment-media producer before POSTing a managed binding. A file may be reused only within this assessment by its authorized uploader; each POST creates another independently governed reference. Metadata PATCH accepts only title, description and category; use the dedicated reorder PATCH for sortOrder. Replacement creates a new reference and soft-deletes the old one.

Student App uses the returned `assets` and `access.previewPath`/`access.downloadPath` from its actual Exams or Grades detail response. Send the existing authenticated School context for GET/HEAD and optional single-byte Range/If-Range requests. Null paths mean the action is unavailable. External assets have an approved HTTPS reference and no managed-content path. Do not substitute generic File-ID downloads or derive an Exams URL for a Grades-only assessment.

OpenAPI adds 56 operations across 28 paths, the create/update/reorder and safe asset response DTO schemas, root Student Exam assets, Student Grades assessment.assets and the two per-question arrays. Existing paths, response envelopes and answer/submission DTOs are retained. A valid resource with no assets serializes an empty array.

## Adversarial implementation review

This is implementation self-review, not the independent Backend Reviewer Receipt. Sources below are under the owning module paths listed above; PrivateMedia classes are in infrastructure/storage. PASS denotes the stated implemented control and executed test, while DR-07 operational release remains blocked.

| Threat | Source path | Mitigation | Executed evidence | Result |
| --- | --- | --- | --- | --- |
| Cross-assessment File reuse | grade-assets.repository.ts; assessment-media.repository.ts | Exact Grade purpose/context/creator/tenant READY predicate | Security same-assessment reuse and different-context denial | PASS |
| Cross-question asset access | grade-asset-authorization.ts; grade-assets.repository.ts | Resolve and lock actual active question under exact assessment; query exact asset parent | Security mismatched question and cross-resource cases | PASS |
| Teacher SCHOOL-scope escalation | grade-asset-authorization.ts; grades-media-authorization.ts | Dedicated Teacher wrapper; CLASSROOM plus creator; broader readable scopes denied for writes | Security four broad scopes, creator and Core-route bypass denials | PASS |
| Stale permission use | grade-asset-authorization.ts; grades-resource-access.ts | Live membership/role/grant SQL locks at final transaction boundary | Integration permission/membership wins; HTTP permission reauthorization | PASS |
| Assessment lifecycle TOCTOU | grade-asset-authorization.ts | Assessment FOR UPDATE and current DRAFT/unlocked/term/submission guards | Integration publish/approve/lock/submission wins | PASS |
| Publish/edit race | grade-assets.repository.ts; grades-assessments.repository.ts | Shared assessment lock with existing publication repository | Integration actual repository publication waits for asset commit | PASS |
| File retirement race | grade-assets.repository.ts; assessment-media.repository.ts | Session/File shared locks before binding and retained-reference lifetime checks | Integration both retirement-first and binding-first lock schedules | PASS |
| Fake READY | assessment-media-ready.ts; assessment-media.repository.ts | Exact terminal server-owned provenance; no direct File creation or HTTP attestation | Unit evidence matrix; Security bare/foreign source and immutable-session attempts | PASS |
| Forged CLEAN | assessment-media-ready.ts | Full evidence/file/session checksum, version, identity and timestamp consistency; DB immutable verification evidence | Unit malformed evidence; real database forgery rejection | PASS |
| File-ID enumeration | grade-assets.service.ts; grade-assets.repository.ts | Resource authorization precedes lookup; safe DTO omits File ID; inaccessible source becomes 404 | Security guessed IDs, wrong uploader/context; E2E generic File download remains denied | PASS |
| Student audience bypass | Student Exams/Grades read adapters | Actual current Student/enrollment, allocated subject, scope, year/term and published/approved filter | Security unpublished/wrong classroom/foreign student; HTTP enrollment reauthorization | PASS |
| Exams/Grades mismatch | student-grade-assets.service.ts; grade-asset.presenter.ts | Reuse each existing audience builder; issue a matching surface URL | E2E legitimate ASSIGNMENT Grades-only access with Exams denial | PASS |
| Answer-key leakage | Student Exams/Grades presenters; grade-asset.presenter.ts | Add safe assets only; preserve existing question/answer projections | E2E withheld keys and MEDIA contract; eight-type regression suite | PASS |
| Unsafe external URL | assessment-asset-content.ts | Configured provider classifier intersected with ST-05 SQL grammar; no remote fetching | Unit URL/display matrix and HTTP unsafe-reference denials | PASS |
| Provider capability leakage | grade-asset.presenter.ts; grade-assets.service.ts | Resource-relative content paths; no bucket/key/evidence/File ID in DTO | E2E safe JSON and actual JWT/compiled-app contract capture | PASS |
| HEAD/Range failure | PrivateMediaContentService; private-media-content.response.ts | Reuse bounded single-range streaming, secure headers, If-Range and abort handling | E2E real bytes GET/HEAD/206/416/If-Range/abort; shared private-media units | PASS |
| Physical retention loss | File Lifetime repository; both ST-05 asset models | Soft-delete reference only; all 26 retained consumers unchanged | ST-05 integrity/security regressions; reuse/deletion and retirement integration | PASS |
| Schema drift | prisma/schema.prisma; prisma/migrations | No schema/migration change; fresh immutable 31-migration replay and governance | ST-05 real PostgreSQL relations; 74 governance/planning cases; migration status | PASS |
| Runtime release bypass | AssessmentMediaRuntimePolicy; AssessmentMediaVerifier | Production execution and default security provider remain fail-closed; image/PDF deep verifier unavailable | Security actual Production binding denial; real PNG/PDF rejection; audio/video policy denials | PASS |

Local verification: 158 new cases (56 unit, 58 real JWT/security, 22 HTTP/private-media, 22 real PostgreSQL integration). Including affected regressions, 1,165 distinct Jest cases across 50 files pass; reruns are not counted twice. Governance/CI-planning adds 74 passing Node tests. Existing eight-type, Homework/ST-06, ST-05 relations and retained-consumer, Student/Teacher, GradeItem/submission and Grade Sync regressions pass. Teacher route assertions retain the canonical role prohibitions and admit manage-permission usage only on the exact eight Owner-approved asset handlers. The existing Homework OpenAPI assertion remains scoped to its six content paths.

Build and the reference-data bootstrap postbuild contract pass. Generated OpenAPI contains 28 additive paths / 56 operations and eight asset DTO schemas. The same verified base is used for non-mutating lint comparison; inherited whole-repository failures are reported separately in the delivery receipt. Exact final HEAD CI and artifact provenance are reported with the Draft PR and final handoff. No independent acceptance, Ready transition, merge, deployment or operational media release is implied.

## Sanitized actual Student contracts

The following seven payloads were captured through actual JWT-authenticated HTTP against the compiled application and owned disposable PostgreSQL/private storage. No application security provider was replaced. UUIDs are consistently anonymized; all other fields preserve the captured response shape. Multiple-asset cases demonstrate assessment assets, distinct per-question collections, an empty question, QUESTION_BASED mode and the existing MEDIA stimulus/text-answer definition. SCORE_ONLY contains no question and remains non-submittable. The final ASSIGNMENT demonstrates the broader Grades audience and Grades-specific paths.

### zero-assets-exams

```json
{
  "assets": [],
  "id": "00000000-0000-4000-8000-000000000001",
  "assessmentId": "00000000-0000-4000-8000-000000000001",
  "subject_name": "Subject",
  "subjectName": "Subject",
  "exam_name": "Owned assessment fixture",
  "examName": "Owned assessment fixture",
  "description": null,
  "skill_tag": null,
  "status": "not_started",
  "total_xp": 0,
  "duration_minutes": null,
  "question_count": 3,
  "type": "quiz",
  "date": "2026-10-25",
  "maxScore": 3,
  "deliveryMode": "question_based",
  "supportsQuestionSubmission": true,
  "stages": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "title": "Owned assessment fixture",
      "subtitle": null,
      "type": "essay",
      "question_count": 3,
      "questions": [
        {
          "assets": [],
          "id": "00000000-0000-4000-8000-000000000002",
          "questionId": "00000000-0000-4000-8000-000000000002",
          "type": "essay",
          "canonicalType": "SHORT_ANSWER",
          "interaction": {
            "kind": "text",
            "selectionMode": null,
            "multiline": false,
            "supported": true,
            "definition": {
              "kind": "text",
              "maxLength": 1000,
              "multiline": false
            }
          },
          "title": "Question A",
          "body": "Question A",
          "options": [],
          "answer": null,
          "points": 1,
          "sortOrder": 0,
          "required": true
        },
        {
          "assets": [],
          "id": "00000000-0000-4000-8000-000000000003",
          "questionId": "00000000-0000-4000-8000-000000000003",
          "type": "essay",
          "canonicalType": "SHORT_ANSWER",
          "interaction": {
            "kind": "text",
            "selectionMode": null,
            "multiline": false,
            "supported": true,
            "definition": {
              "kind": "text",
              "maxLength": 1000,
              "multiline": false
            }
          },
          "title": "Question B",
          "body": "Question B",
          "options": [],
          "answer": null,
          "points": 1,
          "sortOrder": 1,
          "required": true
        },
        {
          "assets": [],
          "id": "00000000-0000-4000-8000-000000000004",
          "questionId": "00000000-0000-4000-8000-000000000004",
          "type": "essay",
          "canonicalType": "SHORT_ANSWER",
          "interaction": {
            "kind": "text",
            "selectionMode": null,
            "multiline": false,
            "supported": true,
            "definition": {
              "kind": "text",
              "maxLength": 1000,
              "multiline": false
            }
          },
          "title": "No assets",
          "body": "No assets",
          "options": [],
          "answer": null,
          "points": 1,
          "sortOrder": 2,
          "required": true
        }
      ]
    }
  ]
}
```

### zero-assets-grades

```json
{
  "assessment": {
    "assets": [],
    "assessmentId": "00000000-0000-4000-8000-000000000001",
    "title": "Owned assessment fixture",
    "subject": {
      "subjectId": "00000000-0000-4000-8000-000000000005",
      "name": "Subject",
      "code": "fixture"
    },
    "type": "quiz",
    "status": "published",
    "deliveryMode": "question_based",
    "supportsQuestionSubmission": true,
    "date": "2026-10-25",
    "maxScore": 3,
    "weight": 1,
    "expectedTimeMinutes": null
  },
  "grade": {
    "gradeItemId": null,
    "status": "missing",
    "score": null,
    "maxScore": 3,
    "percent": null,
    "comment": null,
    "enteredAt": null,
    "isVirtualMissing": true
  },
  "gradeItem": {
    "gradeItemId": null,
    "status": "missing",
    "score": null,
    "maxScore": 3,
    "percent": null,
    "comment": null,
    "enteredAt": null,
    "isVirtualMissing": true
  },
  "submission": null,
  "questions": [
    {
      "assets": [],
      "id": "00000000-0000-4000-8000-000000000002",
      "questionId": "00000000-0000-4000-8000-000000000002",
      "type": "essay",
      "canonicalType": "SHORT_ANSWER",
      "interaction": {
        "kind": "text",
        "selectionMode": null,
        "multiline": false,
        "supported": true,
        "definition": {
          "kind": "text",
          "maxLength": 1000,
          "multiline": false
        }
      },
      "title": "Question A",
      "body": "Question A",
      "points": 1,
      "required": true,
      "sortOrder": 0,
      "options": []
    },
    {
      "assets": [],
      "id": "00000000-0000-4000-8000-000000000003",
      "questionId": "00000000-0000-4000-8000-000000000003",
      "type": "essay",
      "canonicalType": "SHORT_ANSWER",
      "interaction": {
        "kind": "text",
        "selectionMode": null,
        "multiline": false,
        "supported": true,
        "definition": {
          "kind": "text",
          "maxLength": 1000,
          "multiline": false
        }
      },
      "title": "Question B",
      "body": "Question B",
      "points": 1,
      "required": true,
      "sortOrder": 1,
      "options": []
    },
    {
      "assets": [],
      "id": "00000000-0000-4000-8000-000000000004",
      "questionId": "00000000-0000-4000-8000-000000000004",
      "type": "essay",
      "canonicalType": "SHORT_ANSWER",
      "interaction": {
        "kind": "text",
        "selectionMode": null,
        "multiline": false,
        "supported": true,
        "definition": {
          "kind": "text",
          "maxLength": 1000,
          "multiline": false
        }
      },
      "title": "No assets",
      "body": "No assets",
      "points": 1,
      "required": true,
      "sortOrder": 2,
      "options": []
    }
  ]
}
```

### multiple-assets-question-based-exams

```json
{
  "assets": [
    {
      "assetId": "00000000-0000-4000-8000-000000000006",
      "assessmentId": "00000000-0000-4000-8000-000000000007",
      "sourceType": "MANAGED_FILE",
      "category": "DOCUMENT",
      "title": "Verified reference",
      "description": null,
      "sortOrder": 0,
      "file": {
        "filename": "reference.txt",
        "mimeType": "text/plain",
        "sizeBytes": "25"
      },
      "externalUrl": null,
      "access": {
        "previewPath": "/api/v1/student/exams/00000000-0000-4000-8000-000000000007/assets/00000000-0000-4000-8000-000000000006/preview",
        "downloadPath": "/api/v1/student/exams/00000000-0000-4000-8000-000000000007/assets/00000000-0000-4000-8000-000000000006/download"
      },
      "createdAt": "2026-10-25T10:46:38.218Z",
      "updatedAt": "2026-10-25T10:46:38.218Z"
    },
    {
      "assetId": "00000000-0000-4000-8000-000000000008",
      "assessmentId": "00000000-0000-4000-8000-000000000007",
      "sourceType": "EXTERNAL_HTTPS",
      "category": "OTHER",
      "title": "External reference",
      "description": null,
      "sortOrder": 0,
      "file": null,
      "externalUrl": "https://media.example.org/reference.txt",
      "access": null,
      "createdAt": "2026-10-25T10:46:38.295Z",
      "updatedAt": "2026-10-25T10:46:38.295Z"
    }
  ],
  "id": "00000000-0000-4000-8000-000000000007",
  "assessmentId": "00000000-0000-4000-8000-000000000007",
  "subject_name": "Subject",
  "subjectName": "Subject",
  "exam_name": "Owned assessment fixture",
  "examName": "Owned assessment fixture",
  "description": null,
  "skill_tag": null,
  "status": "not_started",
  "total_xp": 0,
  "duration_minutes": null,
  "question_count": 3,
  "type": "quiz",
  "date": "2026-10-25",
  "maxScore": 3,
  "deliveryMode": "question_based",
  "supportsQuestionSubmission": true,
  "stages": [
    {
      "id": "00000000-0000-4000-8000-000000000007",
      "title": "Owned assessment fixture",
      "subtitle": null,
      "type": "mixed",
      "question_count": 3,
      "questions": [
        {
          "assets": [
            {
              "assetId": "00000000-0000-4000-8000-000000000009",
              "assessmentId": "00000000-0000-4000-8000-000000000007",
              "questionId": "00000000-0000-4000-8000-000000000010",
              "sourceType": "MANAGED_FILE",
              "category": "DOCUMENT",
              "title": "Verified reference",
              "description": null,
              "sortOrder": 0,
              "file": {
                "filename": "reference.txt",
                "mimeType": "text/plain",
                "sizeBytes": "25"
              },
              "externalUrl": null,
              "access": {
                "previewPath": "/api/v1/student/exams/00000000-0000-4000-8000-000000000007/questions/00000000-0000-4000-8000-000000000010/assets/00000000-0000-4000-8000-000000000009/preview",
                "downloadPath": "/api/v1/student/exams/00000000-0000-4000-8000-000000000007/questions/00000000-0000-4000-8000-000000000010/assets/00000000-0000-4000-8000-000000000009/download"
              },
              "createdAt": "2026-10-25T10:46:38.374Z",
              "updatedAt": "2026-10-25T10:46:38.374Z"
            }
          ],
          "id": "00000000-0000-4000-8000-000000000010",
          "questionId": "00000000-0000-4000-8000-000000000010",
          "type": "media",
          "canonicalType": "MEDIA",
          "interaction": {
            "kind": "media",
            "selectionMode": null,
            "multiline": false,
            "supported": true,
            "definition": {
              "kind": "media",
              "source": {
                "url": "https://media.example.org/lesson.mp4",
                "title": "External stimulus",
                "mode": "video"
              },
              "answer": {
                "kind": "text",
                "maxLength": 10000,
                "multiline": true
              }
            }
          },
          "title": "Question A",
          "body": "Question A",
          "options": [],
          "answer": null,
          "points": 1,
          "sortOrder": 0,
          "required": true
        },
        {
          "assets": [
            {
              "assetId": "00000000-0000-4000-8000-000000000011",
              "assessmentId": "00000000-0000-4000-8000-000000000007",
              "questionId": "00000000-0000-4000-8000-000000000012",
              "sourceType": "EXTERNAL_HTTPS",
              "category": "OTHER",
              "title": "External reference",
              "description": null,
              "sortOrder": 0,
              "file": null,
              "externalUrl": "https://media.example.org/reference.txt",
              "access": null,
              "createdAt": "2026-10-25T10:46:38.441Z",
              "updatedAt": "2026-10-25T10:46:38.441Z"
            }
          ],
          "id": "00000000-0000-4000-8000-000000000012",
          "questionId": "00000000-0000-4000-8000-000000000012",
          "type": "essay",
          "canonicalType": "SHORT_ANSWER",
          "interaction": {
            "kind": "text",
            "selectionMode": null,
            "multiline": false,
            "supported": true,
            "definition": {
              "kind": "text",
              "maxLength": 1000,
              "multiline": false
            }
          },
          "title": "Question B",
          "body": "Question B",
          "options": [],
          "answer": null,
          "points": 1,
          "sortOrder": 1,
          "required": true
        },
        {
          "assets": [],
          "id": "00000000-0000-4000-8000-000000000013",
          "questionId": "00000000-0000-4000-8000-000000000013",
          "type": "essay",
          "canonicalType": "SHORT_ANSWER",
          "interaction": {
            "kind": "text",
            "selectionMode": null,
            "multiline": false,
            "supported": true,
            "definition": {
              "kind": "text",
              "maxLength": 1000,
              "multiline": false
            }
          },
          "title": "No assets",
          "body": "No assets",
          "options": [],
          "answer": null,
          "points": 1,
          "sortOrder": 2,
          "required": true
        }
      ]
    }
  ]
}
```

### multiple-assets-question-based-grades

```json
{
  "assessment": {
    "assets": [
      {
        "assetId": "00000000-0000-4000-8000-000000000006",
        "assessmentId": "00000000-0000-4000-8000-000000000007",
        "sourceType": "MANAGED_FILE",
        "category": "DOCUMENT",
        "title": "Verified reference",
        "description": null,
        "sortOrder": 0,
        "file": {
          "filename": "reference.txt",
          "mimeType": "text/plain",
          "sizeBytes": "25"
        },
        "externalUrl": null,
        "access": {
          "previewPath": "/api/v1/student/grades/assessments/00000000-0000-4000-8000-000000000007/assets/00000000-0000-4000-8000-000000000006/preview",
          "downloadPath": "/api/v1/student/grades/assessments/00000000-0000-4000-8000-000000000007/assets/00000000-0000-4000-8000-000000000006/download"
        },
        "createdAt": "2026-10-25T10:46:38.218Z",
        "updatedAt": "2026-10-25T10:46:38.218Z"
      },
      {
        "assetId": "00000000-0000-4000-8000-000000000008",
        "assessmentId": "00000000-0000-4000-8000-000000000007",
        "sourceType": "EXTERNAL_HTTPS",
        "category": "OTHER",
        "title": "External reference",
        "description": null,
        "sortOrder": 0,
        "file": null,
        "externalUrl": "https://media.example.org/reference.txt",
        "access": null,
        "createdAt": "2026-10-25T10:46:38.295Z",
        "updatedAt": "2026-10-25T10:46:38.295Z"
      }
    ],
    "assessmentId": "00000000-0000-4000-8000-000000000007",
    "title": "Owned assessment fixture",
    "subject": {
      "subjectId": "00000000-0000-4000-8000-000000000005",
      "name": "Subject",
      "code": "fixture"
    },
    "type": "quiz",
    "status": "published",
    "deliveryMode": "question_based",
    "supportsQuestionSubmission": true,
    "date": "2026-10-25",
    "maxScore": 3,
    "weight": 1,
    "expectedTimeMinutes": null
  },
  "grade": {
    "gradeItemId": null,
    "status": "missing",
    "score": null,
    "maxScore": 3,
    "percent": null,
    "comment": null,
    "enteredAt": null,
    "isVirtualMissing": true
  },
  "gradeItem": {
    "gradeItemId": null,
    "status": "missing",
    "score": null,
    "maxScore": 3,
    "percent": null,
    "comment": null,
    "enteredAt": null,
    "isVirtualMissing": true
  },
  "submission": null,
  "questions": [
    {
      "assets": [
        {
          "assetId": "00000000-0000-4000-8000-000000000009",
          "assessmentId": "00000000-0000-4000-8000-000000000007",
          "questionId": "00000000-0000-4000-8000-000000000010",
          "sourceType": "MANAGED_FILE",
          "category": "DOCUMENT",
          "title": "Verified reference",
          "description": null,
          "sortOrder": 0,
          "file": {
            "filename": "reference.txt",
            "mimeType": "text/plain",
            "sizeBytes": "25"
          },
          "externalUrl": null,
          "access": {
            "previewPath": "/api/v1/student/grades/assessments/00000000-0000-4000-8000-000000000007/questions/00000000-0000-4000-8000-000000000010/assets/00000000-0000-4000-8000-000000000009/preview",
            "downloadPath": "/api/v1/student/grades/assessments/00000000-0000-4000-8000-000000000007/questions/00000000-0000-4000-8000-000000000010/assets/00000000-0000-4000-8000-000000000009/download"
          },
          "createdAt": "2026-10-25T10:46:38.374Z",
          "updatedAt": "2026-10-25T10:46:38.374Z"
        }
      ],
      "id": "00000000-0000-4000-8000-000000000010",
      "questionId": "00000000-0000-4000-8000-000000000010",
      "type": "media",
      "canonicalType": "MEDIA",
      "interaction": {
        "kind": "media",
        "selectionMode": null,
        "multiline": false,
        "supported": true,
        "definition": {
          "kind": "media",
          "source": {
            "url": "https://media.example.org/lesson.mp4",
            "title": "External stimulus",
            "mode": "video"
          },
          "answer": {
            "kind": "text",
            "maxLength": 10000,
            "multiline": true
          }
        }
      },
      "title": "Question A",
      "body": "Question A",
      "points": 1,
      "required": true,
      "sortOrder": 0,
      "options": []
    },
    {
      "assets": [
        {
          "assetId": "00000000-0000-4000-8000-000000000011",
          "assessmentId": "00000000-0000-4000-8000-000000000007",
          "questionId": "00000000-0000-4000-8000-000000000012",
          "sourceType": "EXTERNAL_HTTPS",
          "category": "OTHER",
          "title": "External reference",
          "description": null,
          "sortOrder": 0,
          "file": null,
          "externalUrl": "https://media.example.org/reference.txt",
          "access": null,
          "createdAt": "2026-10-25T10:46:38.441Z",
          "updatedAt": "2026-10-25T10:46:38.441Z"
        }
      ],
      "id": "00000000-0000-4000-8000-000000000012",
      "questionId": "00000000-0000-4000-8000-000000000012",
      "type": "essay",
      "canonicalType": "SHORT_ANSWER",
      "interaction": {
        "kind": "text",
        "selectionMode": null,
        "multiline": false,
        "supported": true,
        "definition": {
          "kind": "text",
          "maxLength": 1000,
          "multiline": false
        }
      },
      "title": "Question B",
      "body": "Question B",
      "points": 1,
      "required": true,
      "sortOrder": 1,
      "options": []
    },
    {
      "assets": [],
      "id": "00000000-0000-4000-8000-000000000013",
      "questionId": "00000000-0000-4000-8000-000000000013",
      "type": "essay",
      "canonicalType": "SHORT_ANSWER",
      "interaction": {
        "kind": "text",
        "selectionMode": null,
        "multiline": false,
        "supported": true,
        "definition": {
          "kind": "text",
          "maxLength": 1000,
          "multiline": false
        }
      },
      "title": "No assets",
      "body": "No assets",
      "points": 1,
      "required": true,
      "sortOrder": 2,
      "options": []
    }
  ]
}
```

### score-only-exams

```json
{
  "assets": [
    {
      "assetId": "00000000-0000-4000-8000-000000000014",
      "assessmentId": "00000000-0000-4000-8000-000000000015",
      "sourceType": "MANAGED_FILE",
      "category": "DOCUMENT",
      "title": null,
      "description": null,
      "sortOrder": 0,
      "file": {
        "filename": "reference.txt",
        "mimeType": "text/plain",
        "sizeBytes": "25"
      },
      "externalUrl": null,
      "access": {
        "previewPath": "/api/v1/student/exams/00000000-0000-4000-8000-000000000015/assets/00000000-0000-4000-8000-000000000014/preview",
        "downloadPath": "/api/v1/student/exams/00000000-0000-4000-8000-000000000015/assets/00000000-0000-4000-8000-000000000014/download"
      },
      "createdAt": "2026-10-25T10:46:39.080Z",
      "updatedAt": "2026-10-25T10:46:39.080Z"
    }
  ],
  "id": "00000000-0000-4000-8000-000000000015",
  "assessmentId": "00000000-0000-4000-8000-000000000015",
  "subject_name": "Subject",
  "subjectName": "Subject",
  "exam_name": "Owned assessment fixture",
  "examName": "Owned assessment fixture",
  "description": null,
  "skill_tag": null,
  "status": "not_started",
  "total_xp": 0,
  "duration_minutes": null,
  "question_count": 0,
  "type": "quiz",
  "date": "2026-10-25",
  "maxScore": 3,
  "deliveryMode": "score_only",
  "supportsQuestionSubmission": false,
  "stages": [
    {
      "id": "00000000-0000-4000-8000-000000000015",
      "title": "Owned assessment fixture",
      "subtitle": null,
      "type": "mixed",
      "question_count": 0,
      "questions": []
    }
  ]
}
```

### score-only-grades

```json
{
  "assessment": {
    "assets": [
      {
        "assetId": "00000000-0000-4000-8000-000000000014",
        "assessmentId": "00000000-0000-4000-8000-000000000015",
        "sourceType": "MANAGED_FILE",
        "category": "DOCUMENT",
        "title": null,
        "description": null,
        "sortOrder": 0,
        "file": {
          "filename": "reference.txt",
          "mimeType": "text/plain",
          "sizeBytes": "25"
        },
        "externalUrl": null,
        "access": {
          "previewPath": "/api/v1/student/grades/assessments/00000000-0000-4000-8000-000000000015/assets/00000000-0000-4000-8000-000000000014/preview",
          "downloadPath": "/api/v1/student/grades/assessments/00000000-0000-4000-8000-000000000015/assets/00000000-0000-4000-8000-000000000014/download"
        },
        "createdAt": "2026-10-25T10:46:39.080Z",
        "updatedAt": "2026-10-25T10:46:39.080Z"
      }
    ],
    "assessmentId": "00000000-0000-4000-8000-000000000015",
    "title": "Owned assessment fixture",
    "subject": {
      "subjectId": "00000000-0000-4000-8000-000000000005",
      "name": "Subject",
      "code": "fixture"
    },
    "type": "quiz",
    "status": "published",
    "deliveryMode": "score_only",
    "supportsQuestionSubmission": false,
    "date": "2026-10-25",
    "maxScore": 3,
    "weight": 1,
    "expectedTimeMinutes": null
  },
  "grade": {
    "gradeItemId": null,
    "status": "missing",
    "score": null,
    "maxScore": 3,
    "percent": null,
    "comment": null,
    "enteredAt": null,
    "isVirtualMissing": true
  },
  "gradeItem": {
    "gradeItemId": null,
    "status": "missing",
    "score": null,
    "maxScore": 3,
    "percent": null,
    "comment": null,
    "enteredAt": null,
    "isVirtualMissing": true
  },
  "submission": null,
  "questions": []
}
```

### broader-grades-only

```json
{
  "assessment": {
    "assets": [
      {
        "assetId": "00000000-0000-4000-8000-000000000014",
        "assessmentId": "00000000-0000-4000-8000-000000000015",
        "sourceType": "MANAGED_FILE",
        "category": "DOCUMENT",
        "title": null,
        "description": null,
        "sortOrder": 0,
        "file": {
          "filename": "reference.txt",
          "mimeType": "text/plain",
          "sizeBytes": "25"
        },
        "externalUrl": null,
        "access": {
          "previewPath": "/api/v1/student/grades/assessments/00000000-0000-4000-8000-000000000015/assets/00000000-0000-4000-8000-000000000014/preview",
          "downloadPath": "/api/v1/student/grades/assessments/00000000-0000-4000-8000-000000000015/assets/00000000-0000-4000-8000-000000000014/download"
        },
        "createdAt": "2026-10-25T10:46:39.080Z",
        "updatedAt": "2026-10-25T10:46:39.080Z"
      }
    ],
    "assessmentId": "00000000-0000-4000-8000-000000000015",
    "title": "Owned assessment fixture",
    "subject": {
      "subjectId": "00000000-0000-4000-8000-000000000005",
      "name": "Subject",
      "code": "fixture"
    },
    "type": "assignment",
    "status": "published",
    "deliveryMode": "score_only",
    "supportsQuestionSubmission": false,
    "date": "2026-10-25",
    "maxScore": 3,
    "weight": 1,
    "expectedTimeMinutes": null
  },
  "grade": {
    "gradeItemId": null,
    "status": "missing",
    "score": null,
    "maxScore": 3,
    "percent": null,
    "comment": null,
    "enteredAt": null,
    "isVirtualMissing": true
  },
  "gradeItem": {
    "gradeItemId": null,
    "status": "missing",
    "score": null,
    "maxScore": 3,
    "percent": null,
    "comment": null,
    "enteredAt": null,
    "isVirtualMissing": true
  },
  "submission": null,
  "questions": []
}
```

## Changed-file manifest

Every changed or created file is listed below. No schema, migration, role/permission seed, workflow, generic File endpoint or Production configuration is changed.

| File | Change | Reason |
| --- | --- | --- |
| `docs/assessments/st07-grades-assessment-assets-contract.md` | new | ST-07 contract, Owner decisions, exact routes, security review and actual sanitized HTTP samples. |
| `scripts/tests/plan-ci.test.cjs` | modified | Register the four new test files and verify exact CI discovery/ownership counts. |
| `scripts/tests/staging-retirement-source.test.cjs` | modified | Register the four new test files and verify exact CI discovery/ownership counts. |
| `src/modules/files/assessment-media/domain/assessment-asset-content.ts` | new | Shared pure display, URL and category policy extracted without changing Homework behavior. |
| `src/modules/files/assessment-media/domain/assessment-media-ready.ts` | modified | Typed expected authoring purpose while retaining Homework default verification. |
| `src/modules/files/assessment-media/infrastructure/assessment-media.repository.ts` | modified | Purpose-bound READY wrappers and assessment reservation checks; physical quota remains producer-owned. |
| `src/modules/grades/assessments/application/grade-assets.service.ts` | new | Validated commands, safe metadata and rerunnable private content authorization. |
| `src/modules/grades/assessments/assessments.module.ts` | modified | Register and export only the necessary ST-07 providers/controllers and existing infrastructure. |
| `src/modules/grades/assessments/controller/grade-assessment-assets.controller.ts` | new | Thin explicit resource routes with UUIDs, existing permissions, DTOs and secure GET/HEAD delegation. |
| `src/modules/grades/assessments/controller/grade-question-assets.controller.ts` | new | Thin explicit resource routes with UUIDs, existing permissions, DTOs and secure GET/HEAD delegation. |
| `src/modules/grades/assessments/domain/grade-asset.ts` | new | Typed internal actor and exact assessment/question/asset resource identities. |
| `src/modules/grades/assessments/dto/grade-asset.dto.ts` | new | Explicit immutable-source create and display/update/reorder/response DTO contracts. |
| `src/modules/grades/assessments/infrastructure/grade-asset-authorization.ts` | new | Final transactional role, permission, ownership, academic hierarchy and lifecycle checks. |
| `src/modules/grades/assessments/infrastructure/grade-assets.repository.ts` | new | Both normalized asset families, verified binding, reference capacity, deterministic order, soft deletion and atomic audit. |
| `src/modules/grades/assessments/infrastructure/grades-media-authorization.ts` | modified | Guarded SCORE_ONLY producer eligibility and exact Teacher creator/allocation boundary. |
| `src/modules/grades/assessments/presenters/grade-asset.presenter.ts` | new | Safe fields and actor-specific resource URLs without private File coordinates. |
| `src/modules/grades/assessments/tests/grade-assets.policy.spec.ts` | new | 56 domain, URL, DTO immutability and strict purpose-bound evidence cases. |
| `src/modules/homework/domain/homework-question-asset.ts` | modified | Compatibility re-exports of unchanged pure technical policies. |
| `src/modules/student-app/assessment-assets/student-exams-assessment-assets.controller.ts` | new | Thin explicit resource routes with UUIDs, existing permissions, DTOs and secure GET/HEAD delegation. |
| `src/modules/student-app/assessment-assets/student-exams-question-assets.controller.ts` | new | Thin explicit resource routes with UUIDs, existing permissions, DTOs and secure GET/HEAD delegation. |
| `src/modules/student-app/assessment-assets/student-grade-assets.service.ts` | new | Keep Exams and broader Grades audience resolution separate while sharing content behavior. |
| `src/modules/student-app/assessment-assets/student-grades-assessment-assets.controller.ts` | new | Thin explicit resource routes with UUIDs, existing permissions, DTOs and secure GET/HEAD delegation. |
| `src/modules/student-app/assessment-assets/student-grades-question-assets.controller.ts` | new | Thin explicit resource routes with UUIDs, existing permissions, DTOs and secure GET/HEAD delegation. |
| `src/modules/student-app/exams/application/get-student-exam.use-case.ts` | modified | Resolve current safe assets for the existing detail response. |
| `src/modules/student-app/exams/dto/student-exams.dto.ts` | modified | Add explicit safe asset arrays to existing Student detail and question schemas. |
| `src/modules/student-app/exams/infrastructure/student-exams-read.adapter.ts` | modified | Reuse the existing audience predicate inside the supplied asset authorization transaction. |
| `src/modules/student-app/exams/presenters/student-exams.presenter.ts` | modified | Preserve existing envelopes/interactions and add exact assessment/question asset arrays. |
| `src/modules/student-app/exams/tests/student-exams.use-case.spec.ts` | modified | Supply the asset dependency in affected detail-use-case unit fixtures. |
| `src/modules/student-app/grades/application/get-student-assessment-grade.use-case.ts` | modified | Resolve current safe assets for the existing detail response. |
| `src/modules/student-app/grades/dto/student-grades.dto.ts` | modified | Add explicit safe asset arrays to existing Student detail and question schemas. |
| `src/modules/student-app/grades/infrastructure/student-grades-read.adapter.ts` | modified | Reuse the existing audience predicate inside the supplied asset authorization transaction. |
| `src/modules/student-app/grades/presenters/student-grades.presenter.ts` | modified | Preserve existing envelopes/interactions and add exact assessment/question asset arrays. |
| `src/modules/student-app/grades/tests/student-grades.use-case.spec.ts` | modified | Supply the asset dependency in affected detail-use-case unit fixtures. |
| `src/modules/student-app/student-app.module.ts` | modified | Register and export only the necessary ST-07 providers/controllers and existing infrastructure. |
| `src/modules/teacher-app/classroom/grades/application/teacher-grade-assets.service.ts` | new | Thin TeacherAppAccess composition over the final core resource boundary. |
| `src/modules/teacher-app/classroom/grades/controller/teacher-grade-assessment-assets.controller.ts` | new | Thin explicit resource routes with UUIDs, existing permissions, DTOs and secure GET/HEAD delegation. |
| `src/modules/teacher-app/classroom/grades/controller/teacher-grade-question-assets.controller.ts` | new | Thin explicit resource routes with UUIDs, existing permissions, DTOs and secure GET/HEAD delegation. |
| `src/modules/teacher-app/teacher-app.module.ts` | modified | Register and export only the necessary ST-07 providers/controllers and existing infrastructure. |
| `test/e2e/grade-assets.e2e-spec.ts` | new | 22 actual HTTP cases: both families, audiences, safe legacy projection and real private streaming/abort. |
| `test/e2e/homework-question-assets.e2e-spec.ts` | modified | Keep the existing Homework OpenAPI assertion scoped to its own unchanged content routes. |
| `test/e2e/student-app-final-closeout.e2e-spec.ts` | modified | Explicitly enumerate new routes/permissions while preserving canonical role and unrelated route prohibitions. |
| `test/e2e/teacher-app-final-closeout.e2e-spec.ts` | modified | Explicitly enumerate new routes/permissions while preserving canonical role and unrelated route prohibitions. |
| `test/fixtures/grade-assets.fixture.ts` | new | Owned disposable tenant graph, genuine test-only verified private objects and actual JWT/HTTP fixtures. |
| `test/fixtures/grade-assets.http.ts` | new | Owned disposable tenant graph, genuine test-only verified private objects and actual JWT/HTTP fixtures. |
| `test/integration/academic-content-acc9-final-closeout.integration.spec.ts` | modified | Explicitly enumerate new routes/permissions while preserving canonical role and unrelated route prohibitions. |
| `test/integration/grade-assets.integration.spec.ts` | new | 22 real PostgreSQL cases including observed lock schedules, retirement and concurrent capacity/reorder. |
| `test/security/tenancy.grade-assets.spec.ts` | new | 58 actual JWT/security cases covering both Owner decisions, tenants, provenance and release/policy denials. |
| `test/security/tenancy.student-app.spec.ts` | modified | Explicitly enumerate new routes/permissions while preserving canonical role and unrelated route prohibitions. |
| `test/security/tenancy.teacher-app.spec.ts` | modified | Explicitly enumerate new routes/permissions while preserving canonical role and unrelated route prohibitions. |

## Lint receipt and verification limits

The non-mutating changed-file comparison uses exact base `b4333aeaa43d645d07aad68fd9c0d330c47fc896`, the same installed lockfile/dependencies/generated Prisma SDK and independently blob-verified baseline files. Across 46 changed TypeScript files (23 existing baseline files), baseline diagnostics are 217 and candidate diagnostics 216: introduced diagnostics 0, compared by file/rule/severity/message multiset with line shifts ignored. No fixing ESLint command or global cleanup was used.

The whole-repository `lint:check` equivalent was also attempted with its configured 4096 MiB heap. It exhausted the heap and exited 134 without producing a complete diagnostic inventory. An initial default-heap invocation likewise exhausted its heap. Full repository lint is therefore **not certified PASS**, and no whole-repository diagnostic count is claimed. The reproducible changed-file comparison supplies the no-introduced-diagnostics evidence; inherited baseline diagnostics remain. Exact-head CI must independently verify its required preflight and all test shards.

The first local dependency installation stalled and was preserved. Local verification uses read-only package junctions from an identical lockfile with private mutable Prisma client, generated SDK, cache and shims. A fresh exact-head CI clean installation is a required independent delivery gate; no local-only verifier or storage fixture is part of application wiring.

## Student connection-pool boundary

Resolve the actual Student context before acquiring the asset transaction. Inside that transaction, the existing audience adapter revalidates the live student/enrollment, exact academic scope and visible assessment using the supplied transaction client. Every private-content resolver pass obtains a fresh context before that transaction. No context lookup requests a second pooled connection while the asset transaction holds one.

The real PostgreSQL regression `authorizes both Student surfaces and private content with one database connection` uses a separate PrismaService configured with connection_limit=1 and pool_timeout=2. It verifies Exams and Grades metadata plus rerunnable private-content authorization against genuinely verified private bytes. This protects bounded transactions and connection-pool availability while preserving final transactional authorization.
