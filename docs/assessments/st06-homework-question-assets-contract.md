# ST-06 Homework Question Assets: implementation and security contract

Status: implementation and security contract for the authorized ST-06 only. Source authority is main `4b148a5131500bdf39930bb3aa9c1e4a2c971b12` (merged ST-05 PR217); its exact-main CI40142912397 attempt1 passed. No ST-07 authority, live migration, deployment or Production mutation.

## 1. Source gap matrix

| Capability | Classification | Source and action |
| --- | --- | --- |
| Exact question asset model, composite FKs, immutable source, live File guard, retained reference | ALREADY_IMPLEMENTED | prisma/schema.prisma; ADR18; ST-05 migration; file-lifetime.repository.ts; preserve exact bytes |
| Core/Teacher question and assignment ownership | REUSE_REQUIRED | homework-context.ts; HomeworkCoreAccessGuard; TeacherHomeworkOwnershipService; operational allocation gate |
| Author asset CRUD/list/reorder/soft delete | MISSING | Add scoped repository and shared Homework application operations; thin Core/Teacher controllers |
| Mutation-time membership/permission/DRAFT checks | RISK | Existing question use cases pre-read status; new asset writes must not copy that pattern |
| Publish serialization | REUSE_REQUIRED | publishAssignmentWithTargets writes the assignment row; serialize asset writes on the same assignment before checking DRAFT |
| Verified managed provenance | REUSE_REQUIRED | AssessmentMediaRepository, AssessmentMediaVerifier, ASSESSMENT_MEDIA_VERSION and SchoolAssessmentMediaPolicy; strict new consumer validation |
| Upload purpose and permission | ALREADY_IMPLEMENTED | HOMEWORK_ASSIGNMENT_MEDIA context is the assignment; assessmentMediaOwner requires homework.attachments.manage; canonical teacher already has this and homework.questions.manage |
| Student visibility and safe projection | REUSE_REQUIRED / MISSING | StudentAppAccessService and StudentHomeworksReadAdapter supply actual active enrollment/target/PUBLISHED-or-CLOSED visibility; add per-question assets at the application/presenter boundary |
| Authorized private bytes | REUSE_REQUIRED / MISSING | Existing openAuthorized/request/stream helpers; new resource resolvers and paths only |
| External link validation | REUSE_REQUIRED | classifyPersistedUrl, configured provider endpoints and ST-02 safeguards intersected with the actual ST-05 SQL grammar |
| Parent question media | RISK / DEFERRED | Guardian flag alone is not a complete approved access contract; no new parent routes/projection |
| Production verification | ALREADY_IMPLEMENTED, DISABLED | Runtime upload policy and UnapprovedAssessmentMediaSecurityGate stay fail-closed |

No unresolved business decision has been identified at design time. A genuine later approval boundary is a DECISION_REQUEST, not silent scope expansion.

## 2. Exact route matrix

Core base C: `/api/v1/homework/assignments/:homeworkId/questions/:questionId/assets`.
Teacher base T: `/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/assets`.
Student base S: `/api/v1/student/homeworks/:homeworkId/questions/:questionId/assets`.

| Surface | Method + suffix | Permission | Result |
| --- | --- | --- | --- |
| Core | GET C; GET C/:assetId | homework.assignments.view | Active collection / one asset |
| Core | POST C | homework.assignments.manage | Create managed or external binding |
| Core | PATCH C/:assetId | homework.assignments.manage | Display metadata only |
| Core | PATCH C/:assetId/reorder | homework.assignments.manage | Nonnegative sort order |
| Core | DELETE C/:assetId | homework.assignments.manage | 204, soft deletion |
| Core | GET/HEAD C/:assetId/preview or /download | homework.assignments.view | Authorized private bytes |
| Teacher | Equivalent T operations | homework.questions.view / homework.questions.manage | Same domain operations behind owned allocation boundary |
| Student | GET existing /api/v1/student/homeworks/:homeworkId | homework.assignments.view | Existing detail plus question.assets[] |
| Student | GET/HEAD S/:assetId/preview or /download | homework.assignments.view | Authorized target/enrollment private bytes |

Every identifier uses UUID validation. Managed creation additionally retains the existing upload-owner `homework.attachments.manage` permission; it is never inferred from question management. No role seeds or broad File permissions change. Author collection wrapper is `{questionId, assets: []}`; detail/create/update wrapper is `{asset: ...}`. Existing question, attachment, submission and review wrappers remain compatible. Author question asset collections are fetched through their exact nested resource; the existing question APIs are not replaced.

No new generic File, public upload, Grades or Parent route is introduced. ST-03's internal producer supplies legitimately verified sessions in isolated tests; DR-07 still prevents production upload execution. This stage exposes consumer binding, not a replacement upload framework.

## 3. Actor and resource authorization

Core: authenticated SCHOOL_USER or ORGANIZATION_USER, current membership/role/permission with the existing non-null School scope (including Organization users), matching active School and Organization; exact assignment/question/asset. Teacher: current TEACHER plus TeacherHomeworkOwnershipService and classId equal to the owned teacher allocation; current classroom/subject/year/term and teacher identity must match the assignment. Read permissions remain distinct from Core.

Student: StudentAppAccessService resolves the actual student and selected active enrollment. Existing read adapter establishes the target and current PUBLISHED/CLOSED visibility. New resource reads revalidate live membership/permission, student/user/enrollment, exact target and assignment visibility, exact question/asset and School/Organization. Caller-provided student IDs never establish ownership. Terminal target status does not replace the existing historical-read policy.

Parent: `PARENT_QUESTION_ASSET_ACCESS=DEFERRED/POLICY_NOT_AUTHORIZED`. Existing parent Homework contracts stay unchanged even if allowGuardianVisibility is set; no new media right is inferred from that flag alone.

## 4. Managed session eligibility

POST MANAGED_FILE requires fileId plus uploadId. The authoritative session must be READY, HOMEWORK_ASSIGNMENT_MEDIA for this exact assignment, same School/Organization and the binding actor's upload. File must match session and asset creator, be PRIVATE/live, same tenant and match final bucket/object, sanitized original identity, expected/verified MIME, actual/expected size, checksum and current verification version. Completion and verification timestamps, terminal state and CLEAN security evidence must be internally consistent. Evidence is server-owned, never accepted from the client. Source/category may not override verified MIME.

Reuse AssessmentMediaRepository's existing READY relationship check and current contract semantics, adding strict consumer eligibility in the shared assessment-media layer. A READY session's historical upload lease expiry does not expire a retained File; EXPIRED/CANCELLED/FAILED or incomplete verification is denied. Binding locks current session/File rows through commit; no storage network operation occurs while those locks are held.

The existing runtime upload gate applies to new managed binding. It remains unconditionally disabled in Production; the unapproved security gate is unchanged. No direct File INSERT or fabricated production attestation is used as a success path.

## 5. School policy and capacity

Use effectiveAssessmentMediaPolicy and established platform caps. Managed creation requires enabled upload/teacher policy, permitted verified MIME/size and existing assignment-scoped reservation policy. Preview/download use their respective current action flags and permitted content; later policy changes affect subsequent reads. Category is descriptive and cannot change trusted File type.

The existing quota resource is the assignment-scoped upload session, not one new question policy. Binding does not create another physical upload or invent a per-question allowance. READY producer reservations remain the quota source; no new upload capacity policy, global allowance or schema constraint is introduced. Each binding still has exactly one immutable question parent; a different assignment/tenant/uploader cannot replay it.

## 6. External HTTPS intersection

Require EXTERNAL_HTTPS, no fileId/uploadId, bounded URL and classification external_https under classifyPersistedUrl with configured provider endpoints. Enforce the actual ST-05 canonical ASCII HTTPS/DNS/unreserved-path grammar as well: no credentials, ports, IP/private/nonpublic destination, provider host, query, fragment, percent-encoding, protected download route, nested capability or executable markup. Reject unsafe normalization rather than changing its meaning. Controlled validation errors never expose raw URLs. No DNS probing, fetch, proxy, provider redirect or fake File row.

## 7. DTO and presentation contract

Create accepts source-specific fields plus bounded plain-text title/description, category and nonnegative order. PATCH exposes title/description and permitted classification only; UUID/School/parent/creator/source/File/URL cannot be changed. Reorder accepts sortOrder only. Immutable or unknown properties are rejected. No source replacement PATCH.

Asset projection: assetId, questionId, sourceType, category, title, description, sortOrder, createdAt/updatedAt, safe File `{filename,mimeType,sizeBytes}` or safe externalUrl, and applicable resource-bound access paths. No internal File ID, upload ID/evidence, bucket/key, provider capability or answer key is returned. Filename is sanitized and byte counts are strings.

Student detail adds assets to each exact question, with `assets: []` when empty. Existing question/option fields and assignment-wide homework.attachments remain unchanged. Unusable managed relationships and unsafe stored links are not exposed to students. A disallowed action has a null/unavailable path. External links are display references and never gain managed byte endpoints. Author reads can retain an unavailable asset's safe display identity to support permitted draft cleanup, while withholding invalid File/link details.

## 8. Transaction and lock strategy

Scoped Prisma transaction for each author mutation. Revalidate current actor, tenant, membership, role and effective required permissions using current rows, then operational allocation ownership, assignment identity/status, exact question and exact active asset. Use the existing allocation gate before locking the assignment, consistent with current Homework/assessment-media ordering. Serialize mutable asset operations on the assignment row before the DRAFT check; lock exact question/asset and required policy/session/File rows in a consistent order. Guard writes by active identity and retain no storage locks while streaming.

Existing publish updates the same assignment row. Publish first -> asset writer sees non-DRAFT and fails; asset write first -> publish waits until committed state. Allocation/membership/permission revocation, question deletion and asset deletion are checked at the final write boundary. Reorder changes the selected row atomically; ties are permitted and sorted by sortOrder, createdAt, id. No speculative unique ordering or renumbering migration.

Read/content resolvers use short current-authorization transactions and avoid target/assignment locks that would invert the existing publish target-first ordering. Resource authorization is rerun by openAuthorized before bytes/headers; no long transaction spans storage I/O.

## 9. Private content

Use PrivateMediaContentService.openAuthorized with a rerunnable resource resolver, privateMediaContentRequest and streamPrivateMediaContent. Preserve GET 200, Range 206/416, HEAD, If-Range, trusted inline MIME only, forced attachment download, sanitized filename, content length/range, no-store/private, nosniff, initialization/size limits and abort/error handling. Missing/mismatched/retired/foreign/policy-denied relationships produce non-disclosing 404; authentication/permission guards keep their established 401/403 semantics.

## 10. Errors and audit

Reuse not_found, validation.failed, homework.question.read_only and existing assessment-media errors as applicable. Validate external representation before persistence and map relevant integrity errors to controlled domain responses; no raw database exception or client capability is reflected. Successful create/metadata/reorder/delete audit is atomic with the write and records actor/School/assignment/question/asset, safe action/source/category/order and correlation context. Do not log provider URLs, object keys, tokens, attestation or student answers.

## 11. Retention and historical compatibility

Soft delete changes the asset lifecycle marker only. It does not clear File identity, delete storage, trigger cleanup or change the immutable source. Preserve all 26 retained consumers/27 physical File references, including soft-deleted assets. No legacy assignment/submission attachment conversion and no other asset family runtime operations. Existing grades, Homework answers/review/Grade Sync and parent projections stay intact.

## 12. Test and acceptance matrix

Real owned disposable PostgreSQL/MinIO fixtures: two questions with distinct legitimately verified Files, a third empty question, exact per-question projection, positive Core/Teacher/Student flows, cross tenant/allocation/target/enrollment/relationship negatives, immutable PATCH and post-publish denials, metadata/reorder/delete/retention, current policy flags and quota scope, managed provenance/MIME/size/checksum/version/security-state corruption, safe/unsafe external inputs and no fetch/File creation, real GET/HEAD/Range/If-Range/disposition/headers/abort/failure/reauthorization. Production security gate stays denied.

Use actual PostgreSQL barriers for publish/write, revocation, deletion, retirement and concurrent reorder. Test-only security provider is isolated from runtime DI and attests only generated owned storage identities with real checksum/object/MIME validation. No direct bare File fabrication is a managed success substitute. Preserve ST01–ST05, generic/private Files and Academic Content regressions. Register new tests from actual CI discovery, run build/postbuild and changed-file non-fixing lint against this exact base, then verify complete exact-head CI and Required artifact provenance.

## 13. Database and release boundaries

NEW_PRISMA_MIGRATIONS=NONE. Existing schema, 31 migrations, manifest and historical SQL remain byte-identical. Only owned disposable databases are migrated for verification. The ST-05 migration must precede any later authorized deployment reading asset tables; this stage performs no live deployment/migration. DR07=OPERATIONAL_RELEASE_PENDING; assessment-media Production upload release remains disabled.

## 14. Deferred scope and evidence

No Grades assets, answer assets, new question types, guardian media rights, scanner/quarantine/worker, generic File expansion, new upload purpose, IAM grants, Production changes or ST-07. Final route/OpenAPI examples, adversarial 28-item review and verification results will be completed here and in the required A–O delivery handoff. Independent reviewer receipt remains PENDING_BACKEND_REVIEW.

## 15. OpenAPI delta and client use

The added contract comprises 12 paths / 24 operations: Core and Teacher each have five nested paths and ten operations, Student has two paths and four content operations. Request models are CreateHomeworkQuestionAssetDto, UpdateHomeworkQuestionAssetDto and ReorderHomeworkQuestionAssetDto. Response models are HomeworkQuestionAssetsResponseDto, HomeworkQuestionAssetResponseDto and safe nested asset/File/access DTOs. Explicit HEAD operations mirror content GET. StudentHomeworkQuestionDto adds assets; the existing detail wrapper is preserved. There is no Parent or generic File contract change.

Clients first obtain legitimate READY upload provenance through the approved producer path, then POST MANAGED_FILE with fileId/uploadId on the exact question. DR-07 remains pending, so this stage does not make that upload producer operational in Production. External references need no upload. Refresh the collection after metadata, reorder or deletion; ties use sortOrder/createdAt/id. Never persist resource access paths as storage identity or use File IDs as media authorization. Use authenticated resource GET/HEAD with existing session/scope; Range is optional. A null action path is unavailable. Handle 404 without resource enumeration, 401/403 using existing session/permission handling, 400 for invalid input and the existing 409 media policy/release or non-DRAFT edit errors.

Configured provider endpoint consumption belongs only to StorageModule. PersistedUrlPolicy exposes classification to Homework; feature code receives no provider configuration. The existing storage source-boundary regression remains enforceable.

## 16. Complete sanitized contract examples

These are illustrative IDs and timestamps, not storage identities or credentials. Core author question collection with zero assets:

```json
{"questionId":"00000000-0000-4000-8000-000000000003","assets":[]}
```

Core author question collection with multiple assets:

```json
{
  "questionId": "00000000-0000-4000-8000-000000000001",
  "assets": [
    {
      "assetId": "00000000-0000-4000-8000-000000000011",
      "questionId": "00000000-0000-4000-8000-000000000001",
      "sourceType": "MANAGED_FILE",
      "category": "DOCUMENT",
      "title": "Reference",
      "description": null,
      "sortOrder": 0,
      "file": {
        "filename": "reference.txt",
        "mimeType": "text/plain",
        "sizeBytes": "24"
      },
      "externalUrl": null,
      "access": {
        "previewPath": "/api/v1/homework/assignments/00000000-0000-4000-8000-000000000010/questions/00000000-0000-4000-8000-000000000001/assets/00000000-0000-4000-8000-000000000011/preview",
        "downloadPath": "/api/v1/homework/assignments/00000000-0000-4000-8000-000000000010/questions/00000000-0000-4000-8000-000000000001/assets/00000000-0000-4000-8000-000000000011/download"
      },
      "createdAt": "2026-10-25T00:00:00.000Z",
      "updatedAt": "2026-10-25T00:00:00.000Z"
    },
    {
      "assetId": "00000000-0000-4000-8000-000000000012",
      "questionId": "00000000-0000-4000-8000-000000000001",
      "sourceType": "MANAGED_FILE",
      "category": "DOCUMENT",
      "title": "Reference",
      "description": null,
      "sortOrder": 0,
      "file": {
        "filename": "reference.txt",
        "mimeType": "text/plain",
        "sizeBytes": "24"
      },
      "externalUrl": null,
      "access": {
        "previewPath": "/api/v1/homework/assignments/00000000-0000-4000-8000-000000000010/questions/00000000-0000-4000-8000-000000000001/assets/00000000-0000-4000-8000-000000000012/preview",
        "downloadPath": "/api/v1/homework/assignments/00000000-0000-4000-8000-000000000010/questions/00000000-0000-4000-8000-000000000001/assets/00000000-0000-4000-8000-000000000012/download"
      },
      "createdAt": "2026-10-25T00:00:00.000Z",
      "updatedAt": "2026-10-25T00:00:00.000Z"
    }
  ]
}
```

Teacher-owned question asset collection:

```json
{
  "questionId": "00000000-0000-4000-8000-000000000001",
  "assets": [
    {
      "assetId": "00000000-0000-4000-8000-000000000011",
      "questionId": "00000000-0000-4000-8000-000000000001",
      "sourceType": "MANAGED_FILE",
      "category": "DOCUMENT",
      "title": "Reference",
      "description": null,
      "sortOrder": 0,
      "file": {
        "filename": "reference.txt",
        "mimeType": "text/plain",
        "sizeBytes": "24"
      },
      "externalUrl": null,
      "access": {
        "previewPath": "/api/v1/teacher/homeworks/classes/00000000-0000-4000-8000-000000000020/assignments/00000000-0000-4000-8000-000000000010/questions/00000000-0000-4000-8000-000000000001/assets/00000000-0000-4000-8000-000000000011/preview",
        "downloadPath": "/api/v1/teacher/homeworks/classes/00000000-0000-4000-8000-000000000020/assignments/00000000-0000-4000-8000-000000000010/questions/00000000-0000-4000-8000-000000000001/assets/00000000-0000-4000-8000-000000000011/download"
      },
      "createdAt": "2026-10-25T00:00:00.000Z",
      "updatedAt": "2026-10-25T00:00:00.000Z"
    }
  ]
}
```

Student detail with two distinct question assets (existing fields retained):

```json
{
  "homework": {
    "homeworkId": "00000000-0000-4000-8000-000000000010",
    "title": "Homework",
    "description": null,
    "mode": "homework",
    "status": "waiting",
    "assignmentStatus": "published",
    "targetStatus": "assigned",
    "subject": {
      "id": "00000000-0000-4000-8000-000000000032",
      "name": "Math",
      "nameAr": null,
      "nameEn": "Math",
      "code": "MATH",
      "color": null
    },
    "teacher": {
      "userId": "00000000-0000-4000-8000-000000000033",
      "fullName": "Teacher"
    },
    "classroom": {
      "id": "00000000-0000-4000-8000-000000000034",
      "name": "Class A",
      "nameAr": null,
      "nameEn": "Class A",
      "section": null,
      "grade": null
    },
    "term": {
      "id": "00000000-0000-4000-8000-000000000031",
      "name": "Term 1",
      "nameAr": null,
      "nameEn": "Term 1"
    },
    "academicYear": {
      "id": "00000000-0000-4000-8000-000000000030",
      "name": "2026",
      "nameAr": null,
      "nameEn": "2026"
    },
    "timetableEntryId": null,
    "scheduleDate": null,
    "dueAt": "2026-10-30T12:00:00.000Z",
    "publishedAt": "2026-10-25T00:00:00.000Z",
    "estimatedMinutes": null,
    "totalMarks": null,
    "isGraded": false,
    "questionCount": 2,
    "attachmentsCount": 0,
    "submittedAt": null,
    "reviewedAt": null,
    "createdAt": "2026-10-25T00:00:00.000Z",
    "updatedAt": "2026-10-25T00:00:00.000Z",
    "publishAt": null,
    "closedAt": null,
    "questions": [
      {
        "questionId": "00000000-0000-4000-8000-000000000001",
        "homeworkId": "00000000-0000-4000-8000-000000000010",
        "type": "short_text",
        "prompt": "Question A",
        "instructions": null,
        "points": 1,
        "sortOrder": 0,
        "isRequired": false,
        "options": [],
        "assets": [
          {
            "assetId": "00000000-0000-4000-8000-000000000011",
            "questionId": "00000000-0000-4000-8000-000000000001",
            "sourceType": "MANAGED_FILE",
            "category": "DOCUMENT",
            "title": "Reference",
            "description": null,
            "sortOrder": 0,
            "file": {
              "filename": "reference.txt",
              "mimeType": "text/plain",
              "sizeBytes": "24"
            },
            "externalUrl": null,
            "access": {
              "previewPath": "/api/v1/student/homeworks/00000000-0000-4000-8000-000000000010/questions/00000000-0000-4000-8000-000000000001/assets/00000000-0000-4000-8000-000000000011/preview",
              "downloadPath": "/api/v1/student/homeworks/00000000-0000-4000-8000-000000000010/questions/00000000-0000-4000-8000-000000000001/assets/00000000-0000-4000-8000-000000000011/download"
            },
            "createdAt": "2026-10-25T00:00:00.000Z",
            "updatedAt": "2026-10-25T00:00:00.000Z"
          }
        ]
      },
      {
        "questionId": "00000000-0000-4000-8000-000000000002",
        "homeworkId": "00000000-0000-4000-8000-000000000010",
        "type": "short_text",
        "prompt": "Question B",
        "instructions": null,
        "points": 1,
        "sortOrder": 1,
        "isRequired": false,
        "options": [],
        "assets": [
          {
            "assetId": "00000000-0000-4000-8000-000000000012",
            "questionId": "00000000-0000-4000-8000-000000000002",
            "sourceType": "MANAGED_FILE",
            "category": "DOCUMENT",
            "title": "Reference",
            "description": null,
            "sortOrder": 0,
            "file": {
              "filename": "reference.txt",
              "mimeType": "text/plain",
              "sizeBytes": "24"
            },
            "externalUrl": null,
            "access": {
              "previewPath": "/api/v1/student/homeworks/00000000-0000-4000-8000-000000000010/questions/00000000-0000-4000-8000-000000000002/assets/00000000-0000-4000-8000-000000000012/preview",
              "downloadPath": "/api/v1/student/homeworks/00000000-0000-4000-8000-000000000010/questions/00000000-0000-4000-8000-000000000002/assets/00000000-0000-4000-8000-000000000012/download"
            },
            "createdAt": "2026-10-25T00:00:00.000Z",
            "updatedAt": "2026-10-25T00:00:00.000Z"
          }
        ]
      }
    ],
    "attachments": [],
    "submission": null
  }
}
```

External-link detail:

```json
{
  "asset": {
    "assetId": "00000000-0000-4000-8000-000000000012",
    "questionId": "00000000-0000-4000-8000-000000000002",
    "sourceType": "EXTERNAL_HTTPS",
    "category": "OTHER",
    "title": "Reference",
    "description": null,
    "sortOrder": 0,
    "file": null,
    "externalUrl": "https://media.example.org/reference.txt",
    "access": null,
    "createdAt": "2026-10-25T00:00:00.000Z",
    "updatedAt": "2026-10-25T00:00:00.000Z"
  }
}
```

Parent: `PARENT_QUESTION_ASSET_ACCESS=DEFERRED/POLICY_NOT_AUTHORIZED`; no new Parent question asset field or content endpoint. Assignment/submission attachment contracts are independent of these question assets.

## 17. Adversarial review (before commit)

All paths below are repository relative. U = src/modules/homework/tests/homework-question-assets.policy.spec.ts; I = test/integration/homework-question-assets.integration.spec.ts; S = test/security/tenancy.homework-question-assets.spec.ts; H = test/e2e/homework-question-assets.e2e-spec.ts. Existing ST-03/05 lifecycle and tenancy regressions remain part of verification.

| # / threat | Relevant source | Protection and test | Result |
| --- | --- | --- | --- |
| 1 File enumeration | homework-question-assets.repository.ts | Session/creator/exact parent, safe presenter; S missing provenance/wrong paths | PASS |
| 2 Cross-school reuse | homework-question-asset-authorization.ts; assessment-media.repository.ts | Scoped tenant/current organization + session/File identity; S tenant matrix, I foreign File | PASS |
| 3 Purpose confusion | assessment-media-ready.ts | Exact HOMEWORK_ASSIGNMENT_MEDIA; S valid wrong-purpose producer | PASS |
| 4 Assignment/question confusion | authorization + composite ST-05 FK | Exact nested question assignment; S mismatched parent, I different assignment | PASS |
| 5 Allocation bypass | teacher-homework-question-assets.service.ts; authorization | Existing owner resolver + current operational gate; S allocation/class/subject, I observed revocation lock | PASS |
| 6 Core escalation | HomeworkCoreAccessGuard; authorization | Existing management user types, School scope and live permissions; H Core/Organization, S teacher Core denial | PASS |
| 7 Target bypass | student-homework-question-assets.service.ts; authorization | Actual Student context + current target/read boundary; S wrong target/student | PASS |
| 8 Inactive enrollment | authorization; StudentAppAccessService | Live matching enrollment/user/class/year/term; S withdrawn enrollment | PASS |
| 9 Wrong asset relationship | repository read/change | Exact question and assignment scoped identity; S wrong-question/asset GET/HEAD | PASS |
| 10 Asset soft deletion | repository | Active row filter, final update lock and stream re-resolution; I observed deletion, H before-byte deletion | PASS |
| 11 Question deletion | authorization | Active exact parent and current stream check; I observed question lock, H before-byte deletion | PASS |
| 12 Permission revocation | authorization | Current joined permission rows locked through mutation; I observed permission revocation, H before-byte permission revocation | PASS |
| 13 Publish race | authorization; homework.repository.ts | Assignment serialization/current DRAFT; I actual publication waits and publish-first denial | PASS |
| 14 Retirement/bind race | assessment-media.repository.ts; file-lifetime.repository.ts | Session/File share locks and conservative retained-reference check; I both observed lock orderings | PASS |
| 15 Retirement/preview race | service openContent; PrivateMediaContentService | Re-resolve active File after lookup before bytes; H before-byte File retirement | PASS |
| 16 Forged READY | assessment-media-ready.ts | Terminal status, immutable identities, version/timestamps/checksum; U corruption matrix, ST-05 SQL lifecycle integration | PASS |
| 17 Fake attestation | assessment-media-ready.ts; AssessmentMediaVerifier | Client fields forbidden, CLEAN server evidence consistency; U evidence matrix, S unapproved actual producer fails | PASS |
| 18 Reused provider URL | homework-question-asset.ts; provider-url.policy.ts | Provider/query/capability URLs rejected; U/S URL cases, no File/fetch | PASS |
| 19 URL normalization | homework-question-asset.ts | Canonical application classifier intersected with SQL grammar; U normalization/private/provider cases | PASS |
| 20 Metadata XSS | homework-question-asset.ts; presenter | Bounded plain text, forbidden markup/controls, safe historical projection; U/S metadata negatives | PASS |
| 21 MIME spoof | assessment-media-ready.ts; content registry | Verified expected/File MIME equality and supported filename/type, derived category; I changed MIME, U classification | PASS |
| 22 Range/HEAD leakage | PrivateMediaContentService; resource controllers | Ownership before all statuses/headers; H actual 200/206/416/HEAD, S denied HEAD | PASS |
| 23 Source switching | DTO + service + ST-05 immutable-source trigger | PATCH whitelist, metadata-only command; S eight immutable PATCH fields, ST-05 SQL | PASS |
| 24 Retention loss | repository soft-delete; file-lifetime.repository.ts | Keep immutable File identity and object; I retained references/object/audit, existing inventory | PASS |
| 25 Parent escalation | unchanged Parent Homeworks; no new Parent controller | Explicitly deferred even with guardian policy flag; S actual existing parent projection/no-route | PASS |
| 26 Retired Staging | unchanged CI ownership/runtime source | Disposable fixture guards; 35 CI planner/retirement governance cases | PASS |
| 27 Migration ordering | contract section13; unchanged migration chain | No schema/migration/live deployment, full fresh disposable replay/status/seed/no-op | PASS |
| 28 Production release gate | unchanged runtime policy/unapproved security provider | Production unconditionally denied; H real managed binding denial plus producer/default gate | PASS |

The successful producer is test-only: generated owned session/context/uploader, real bounded MinIO POST, object stat, bounded real-byte SHA-256 and MIME/size identity, existing verification/complete flow, then strict consumer binding. The application DI security provider stays UnapprovedAssessmentMediaSecurityGate. These tests certify the contract, not operational malware scanning or Production release readiness.

## 18. Local verification receipt

- 127 new ST-06 cases: 56 unit, 27 actual PostgreSQL/MinIO integration, 28 JWT/tenancy/security and 16 real HTTP/streaming cases, all PASS.
- 1,242 unique Jest cases across 84 files including existing Homework, Student/Teacher/Parent, Grades/ST-04, Assessment Media/ST-03, relation/lifecycle/retention/ST-05 and shared/private storage regressions. This includes three specifically selected ST-02/R01/R02 PostgreSQL cases; the other 111 cases in that file were not selected locally. Full CI must execute the complete active inventory. Reruns are not additional cases.
- 35 planner/retirement governance cases PASS. Actual inventory: 1,013 files, 1,003 active, 10 manual. Four new suites have one owner each.
- PostgreSQL 16 / Redis 7 / private MinIO: owned labelled loopback containers with tmpfs storage only. Full 31-migration replay, status, real seed and second-deploy no-op PASS. Prisma validate/generate PASS. Existing schema/migrations/config/deployment manifest and dependency locks unchanged.
- Build and actual postbuild contract PASS. Generated OpenAPI: 12 new paths / 24 operations / 8 new schemas; explicit content GET/HEAD present.
- Non-fixing lint with the exact approved base: 18 existing base files verified by Git blob identity, 36 candidate TypeScript files, identical locked dependencies/Prisma schema. BASELINE_DIAGNOSTICS=219; CANDIDATE_DIAGNOSTICS=219; NEW_DIAGNOSTICS=0. Whole-repository lint is not claimed green; inherited diagnostics remain. The auto-fixing npm lint command was not used.
- Local offline clean npm installation stalled and was preserved outside the worktree. Verification used isolated mutable Prisma client/cache and read-only dependencies from an identical package lock. Exact-head CI must independently prove the normal clean-install path; no local-only fixture may be required.

Independent Backend reviewer receipt remains pending. The Draft PR and final same-SHA/same-attempt Required artifact receipt are delivered separately after remote verification; these local results are not a substitute for that receipt.

The first remote candidate exposed an outdated Teacher App route count. Existing Teacher and Student route/permission inventories now include exactly ten Teacher and four Student handlers, preserving complete-set and least-permission assertions. All three affected existing suites pass locally (87 cases). No runtime or permission-catalog change was needed. The final exact-head receipt must come from the corrected commit.

The remaining ACC-9 cross-slice route graph and explicit Teacher security inventory now include the ten Homework handlers while preserving all existing Academic Content and role-catalog assertions. Both full affected suites pass locally (85 cases). A repository-wide route-inventory search found no remaining 159-route expectation.
