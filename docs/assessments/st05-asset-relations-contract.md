# ST-05 asset relations, migration and File lifetime contract

Authority: Planning Authority ST-05 order, 2026-10-24. Base: `0d89519008879e393822a22f246224c5388a3cb0`. Design: [ADR-0018](../../adr/ADR-0018-homework-grades-asset-relations-foundation.md). Proposed implementation awaiting independent Backend review. ST-06 is not started.

## Exact relational contract

| Model / table | Exact parent / column | SQL constraint prefix | Source |
| --- | --- | --- | --- |
| HomeworkQuestionAsset / homework_question_assets | HomeworkQuestion / homework_question_id | hw_question_asset | Managed or external |
| GradeAssessmentQuestionAsset / grade_assessment_question_assets | GradeAssessmentQuestion / question_id | grade_question_asset | Managed or external |
| GradeAssessmentAsset / grade_assessment_assets | GradeAssessment / assessment_id | grade_assessment_asset | Managed or external |
| HomeworkAnswerAsset / homework_answer_assets | HomeworkSubmissionAnswer / homework_submission_answer_id | hw_answer_asset | Managed only |
| GradeSubmissionAnswerAsset / grade_submission_answer_assets | GradeSubmissionAnswer / answer_id | grade_answer_asset | Managed only |

Every prefix has exact suffixes `_parent_fk`, `_file_fk`, `_school_fk`, `_creator_fk`, `_sort_check`, `_source_check`. Parent is (exact-parent-column, school_id) -> parent(id, school_id); File is (file_id, school_id) -> files(id, school_id). School/creator are required physical FKs; all delete/key-update actions are RESTRICT. Indexes are `_parent_order_idx` (school, parent, deleted_at, sort_order, id), `_file_idx` (file_id, school_id), and `_creator_idx`. No speculative uniqueness or duplicate ancestry scalars.

All five model definitions (schema is authoritative):

```prisma
model HomeworkQuestionAsset {
  id                 String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  schoolId           String                    @map("school_id") @db.Uuid
  homeworkQuestionId String                    @map("homework_question_id") @db.Uuid
  fileId             String?                   @map("file_id") @db.Uuid
  externalUrl        String?                   @map("external_url") @db.VarChar(2000)
  sourceType         AssessmentAssetSourceType @default(MANAGED_FILE) @map("source_type")
  category           AssessmentAssetCategory   @default(OTHER)
  title              String?                   @db.VarChar(255)
  description        String?                   @db.VarChar(2000)
  sortOrder          Int                       @default(0) @map("sort_order")
  createdByUserId    String                    @map("created_by_user_id") @db.Uuid
  createdAt          DateTime                  @default(now()) @map("created_at")
  updatedAt          DateTime                  @updatedAt @map("updated_at")
  deletedAt          DateTime?                 @map("deleted_at")

  school           School           @relation(fields: [schoolId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "hw_question_asset_school_fk")
  homeworkQuestion HomeworkQuestion @relation(fields: [homeworkQuestionId, schoolId], references: [id, schoolId], onDelete: Restrict, onUpdate: Restrict, map: "hw_question_asset_parent_fk")
  file             File?            @relation(fields: [fileId, schoolId], references: [id, schoolId], onDelete: Restrict, onUpdate: Restrict, map: "hw_question_asset_file_fk")
  createdBy        User             @relation("HomeworkQuestionAssetCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "hw_question_asset_creator_fk")

  @@index([schoolId, homeworkQuestionId, deletedAt, sortOrder, id], map: "hw_question_asset_parent_order_idx")
  @@index([fileId, schoolId], map: "hw_question_asset_file_idx")
  @@index([createdByUserId], map: "hw_question_asset_creator_idx")
  @@map("homework_question_assets")
}
```

```prisma
model GradeAssessmentQuestionAsset {
  id              String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  schoolId        String                    @map("school_id") @db.Uuid
  questionId      String                    @map("question_id") @db.Uuid
  fileId          String?                   @map("file_id") @db.Uuid
  externalUrl     String?                   @map("external_url") @db.VarChar(2000)
  sourceType      AssessmentAssetSourceType @default(MANAGED_FILE) @map("source_type")
  category        AssessmentAssetCategory   @default(OTHER)
  title           String?                   @db.VarChar(255)
  description     String?                   @db.VarChar(2000)
  sortOrder       Int                       @default(0) @map("sort_order")
  createdByUserId String                    @map("created_by_user_id") @db.Uuid
  createdAt       DateTime                  @default(now()) @map("created_at")
  updatedAt       DateTime                  @updatedAt @map("updated_at")
  deletedAt       DateTime?                 @map("deleted_at")

  school                  School                  @relation(fields: [schoolId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "grade_question_asset_school_fk")
  gradeAssessmentQuestion GradeAssessmentQuestion @relation(fields: [questionId, schoolId], references: [id, schoolId], onDelete: Restrict, onUpdate: Restrict, map: "grade_question_asset_parent_fk")
  file                    File?                   @relation(fields: [fileId, schoolId], references: [id, schoolId], onDelete: Restrict, onUpdate: Restrict, map: "grade_question_asset_file_fk")
  createdBy               User                    @relation("GradeAssessmentQuestionAssetCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "grade_question_asset_creator_fk")

  @@index([schoolId, questionId, deletedAt, sortOrder, id], map: "grade_question_asset_parent_order_idx")
  @@index([fileId, schoolId], map: "grade_question_asset_file_idx")
  @@index([createdByUserId], map: "grade_question_asset_creator_idx")
  @@map("grade_assessment_question_assets")
}
```

```prisma
model GradeAssessmentAsset {
  id              String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  schoolId        String                    @map("school_id") @db.Uuid
  assessmentId    String                    @map("assessment_id") @db.Uuid
  fileId          String?                   @map("file_id") @db.Uuid
  externalUrl     String?                   @map("external_url") @db.VarChar(2000)
  sourceType      AssessmentAssetSourceType @default(MANAGED_FILE) @map("source_type")
  category        AssessmentAssetCategory   @default(OTHER)
  title           String?                   @db.VarChar(255)
  description     String?                   @db.VarChar(2000)
  sortOrder       Int                       @default(0) @map("sort_order")
  createdByUserId String                    @map("created_by_user_id") @db.Uuid
  createdAt       DateTime                  @default(now()) @map("created_at")
  updatedAt       DateTime                  @updatedAt @map("updated_at")
  deletedAt       DateTime?                 @map("deleted_at")

  school          School          @relation(fields: [schoolId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "grade_assessment_asset_school_fk")
  gradeAssessment GradeAssessment @relation(fields: [assessmentId, schoolId], references: [id, schoolId], onDelete: Restrict, onUpdate: Restrict, map: "grade_assessment_asset_parent_fk")
  file            File?           @relation(fields: [fileId, schoolId], references: [id, schoolId], onDelete: Restrict, onUpdate: Restrict, map: "grade_assessment_asset_file_fk")
  createdBy       User            @relation("GradeAssessmentAssetCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "grade_assessment_asset_creator_fk")

  @@index([schoolId, assessmentId, deletedAt, sortOrder, id], map: "grade_assessment_asset_parent_order_idx")
  @@index([fileId, schoolId], map: "grade_assessment_asset_file_idx")
  @@index([createdByUserId], map: "grade_assessment_asset_creator_idx")
  @@map("grade_assessment_assets")
}
```

```prisma
model HomeworkAnswerAsset {
  id                         String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  schoolId                   String                    @map("school_id") @db.Uuid
  homeworkSubmissionAnswerId String                    @map("homework_submission_answer_id") @db.Uuid
  fileId                     String                    @map("file_id") @db.Uuid
  sourceType                 AssessmentAssetSourceType @default(MANAGED_FILE) @map("source_type")
  category                   AssessmentAssetCategory   @default(OTHER)
  title                      String?                   @db.VarChar(255)
  description                String?                   @db.VarChar(2000)
  sortOrder                  Int                       @default(0) @map("sort_order")
  createdByUserId            String                    @map("created_by_user_id") @db.Uuid
  createdAt                  DateTime                  @default(now()) @map("created_at")
  updatedAt                  DateTime                  @updatedAt @map("updated_at")
  deletedAt                  DateTime?                 @map("deleted_at")

  school                   School                   @relation(fields: [schoolId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "hw_answer_asset_school_fk")
  homeworkSubmissionAnswer HomeworkSubmissionAnswer @relation(fields: [homeworkSubmissionAnswerId, schoolId], references: [id, schoolId], onDelete: Restrict, onUpdate: Restrict, map: "hw_answer_asset_parent_fk")
  file                     File                     @relation(fields: [fileId, schoolId], references: [id, schoolId], onDelete: Restrict, onUpdate: Restrict, map: "hw_answer_asset_file_fk")
  createdBy                User                     @relation("HomeworkAnswerAssetCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "hw_answer_asset_creator_fk")

  @@index([schoolId, homeworkSubmissionAnswerId, deletedAt, sortOrder, id], map: "hw_answer_asset_parent_order_idx")
  @@index([fileId, schoolId], map: "hw_answer_asset_file_idx")
  @@index([createdByUserId], map: "hw_answer_asset_creator_idx")
  @@map("homework_answer_assets")
}
```

```prisma
model GradeSubmissionAnswerAsset {
  id              String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  schoolId        String                    @map("school_id") @db.Uuid
  answerId        String                    @map("answer_id") @db.Uuid
  fileId          String                    @map("file_id") @db.Uuid
  sourceType      AssessmentAssetSourceType @default(MANAGED_FILE) @map("source_type")
  category        AssessmentAssetCategory   @default(OTHER)
  title           String?                   @db.VarChar(255)
  description     String?                   @db.VarChar(2000)
  sortOrder       Int                       @default(0) @map("sort_order")
  createdByUserId String                    @map("created_by_user_id") @db.Uuid
  createdAt       DateTime                  @default(now()) @map("created_at")
  updatedAt       DateTime                  @updatedAt @map("updated_at")
  deletedAt       DateTime?                 @map("deleted_at")

  school                School                @relation(fields: [schoolId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "grade_answer_asset_school_fk")
  gradeSubmissionAnswer GradeSubmissionAnswer @relation(fields: [answerId, schoolId], references: [id, schoolId], onDelete: Restrict, onUpdate: Restrict, map: "grade_answer_asset_parent_fk")
  file                  File                  @relation(fields: [fileId, schoolId], references: [id, schoolId], onDelete: Restrict, onUpdate: Restrict, map: "grade_answer_asset_file_fk")
  createdBy             User                  @relation("GradeSubmissionAnswerAssetCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "grade_answer_asset_creator_fk")

  @@index([schoolId, answerId, deletedAt, sortOrder, id], map: "grade_answer_asset_parent_order_idx")
  @@index([fileId, schoolId], map: "grade_answer_asset_file_idx")
  @@index([createdByUserId], map: "grade_answer_asset_creator_idx")
  @@map("grade_submission_answer_assets")
}
```

## PostgreSQL-only contracts

Ten validated CHECKs enforce nonnegative order and exact source combinations. Managed requires File and forbids URL. External requires URL and null File. Answers have no URL column and accept MANAGED_FILE only. File.schoolId remains nullable in the existing model; a null-school File cannot satisfy these composite links.

External representation is a bounded canonical ASCII HTTPS DNS URL with unreserved/slash path only. Query, fragment, userinfo, port, IP, percent encoding, whitespace, nonpublic suffixes, known GCS/S3/MinIO hosts and generic protected download paths are rejected. This is deliberately narrower than a full URL parser. No fetch, DNS check, content approval or upload verification is claimed. Future binders must reuse the existing ST-02 policy, including configured provider endpoints, and enforce domain ownership/security approval. Unknown custom storage hosts or opaque capability paths cannot be fully recognized by a static DB predicate. ST-04 MEDIA metadata remains unchanged and is not converted.

Five `asset_identity_<table>` triggers call `public.enforce_assessment_asset_identity()` (SECURITY INVOKER, pg_catalog search path, no PUBLIC EXECUTE). Row UUID, school, exact parent, creator, creation time, source type, File and external URL are immutable. Metadata/order/deletedAt remain mutable. Replacement requires a new row plus soft deletion; old File retention survives. This is structural identity, not a submission-state authorization service.

Five `file_live_ref_<table>_file_id` BEFORE INSERT OR UPDATE OF file_id triggers call the existing unchanged live-reference function. Inserts of retired/missing Files fail SQLSTATE 23503. File retargeting UPDATE fails identity SQLSTATE 23514 first; it must not be misreported as a live-reference-trigger failure. Catalog tests verify both trigger families. The live-reference function holds KEY SHARE; the established retirement protocol takes File FOR UPDATE and rechecks global retention. Both real lock schedules are tested for each family. Arbitrary bare File.deletedAt updates outside that protocol are not newly made safe.

## File lifetime inventory

Baseline: 22 physical File FKs, 21 retained consumers, one provenance-only link. ST-05 actual generated DMMF: 27 physical FKs, 26 retained consumers, one provenance-only link. All five additions are global consumers, including soft-deleted/historical rows. The old 21 SQL predicates are preserved; the sole old AcademicContentAsset live-row exception stays intact. FileUploadSession is excluded. No physical object deletion or cleanup worker is introduced.

| Exact physical table.column | Treatment |
| --- | --- |
| academic_content_assets.file_id | Retained consumer (existing live-row exception) |
| academic_content_revision_assets.file_id | Retained consumer (all persisted rows) |
| admission_application_documents.file_id | Retained consumer (all persisted rows) |
| applicant_admission_request_documents.file_id | Retained consumer (all persisted rows) |
| attachments.file_id | Retained consumer (all persisted rows) |
| communication_announcement_attachments.file_id | Retained consumer (all persisted rows) |
| communication_announcements.image_file_id | Retained consumer (all persisted rows) |
| communication_conversations.avatar_file_id | Retained consumer (all persisted rows) |
| communication_message_attachments.file_id | Retained consumer (all persisted rows) |
| file_upload_sessions.file_id | Provenance only; excluded |
| grade_assessment_assets.file_id | Retained consumer (all persisted rows) |
| grade_assessment_question_assets.file_id | Retained consumer (all persisted rows) |
| grade_submission_answer_assets.file_id | Retained consumer (all persisted rows) |
| hero_badges.file_id | Retained consumer (all persisted rows) |
| homework_answer_assets.file_id | Retained consumer (all persisted rows) |
| homework_assignment_attachments.file_id | Retained consumer (all persisted rows) |
| homework_question_assets.file_id | Retained consumer (all persisted rows) |
| homework_submission_attachments.file_id | Retained consumer (all persisted rows) |
| import_jobs.uploaded_file_id | Retained consumer (all persisted rows) |
| lesson_content_items.file_id | Retained consumer (all persisted rows) |
| reinforcement_submissions.proof_file_id | Retained consumer (all persisted rows) |
| reward_catalog_items.image_file_id | Retained consumer (all persisted rows) |
| settings_school_profile.logo_file_id | Retained consumer (all persisted rows) |
| student_credential_batches.secret_artifact_file_id | Retained consumer (all persisted rows) |
| student_documents.file_id | Retained consumer (all persisted rows) |
| students.avatar_file_id | Retained consumer (all persisted rows) |
| teacher_profiles.avatar_file_id | Retained consumer (all persisted rows) |

## Database and test evidence

`test/security/tenancy.assessment-assets.spec.ts`: 53 real-PostgreSQL cases across the five families: permitted links, foreign/wrong-family/missing/null parents, foreign/global/missing/retired Files, invalid School/creator/order/source, coordinated and same-school retargeting, source conflicts, unsafe external representations, actual scoped reads and soft-delete opt-in. These assert database SQLSTATE, not repository mocks.

`test/integration/assessment-asset-relations.integration.spec.ts`: 28 cases: five exact-parent positives, five historical retention/deletion restrictions, three external positives, global/all-five consumers, corrupt legacy cross-school retention, derived answer ancestry, actual FK/CHECK/index catalogs, immutable trigger/function privileges, ten observed PostgreSQL blocking schedules. `file-lifetime-integrity.integration.spec.ts` contributes 12 existing lifecycle/catalog regressions; combined run: 93 passed, three suites. Inventory/scope unit contract: 22 passed, two suites.

Migration `20261024200456_homework_grades_asset_relations_foundation` was created via Prisma migrate dev --create-only, reviewed/generated/custom SQL assembled before first application. It adds two enums, five tables, 15 secondary indexes, 20 FKs, ten CHECKs, one invoker function, five identity triggers and five live-File triggers. No old DDL/DML/backfill. The 30 existing SQL files and migration lock are immutable. Manifest and custom-SQL inventory govern exact bytes. Live/shared databases are never a test target.

Populated pre-migration snapshot: all 175 old public tables had identical row counts and ordered JSONB fingerprints after deployment; 32 tables were populated, including old Homework/Grades answers and both old attachment families. All five new tables had zero rows, proving no backfill. Owned disposable fixture teardown is separate from product deletion policy.

CI ownership is derived from actual discovery: 1,009 files, 999 active, ten historical/manual; new security and integration suites each have one pull-request owner. Final exact-commit CI, Required artifact provenance, lint comparison, complete regression/replay/build results are supplied in the ST-05 delivery handoff; this source contract does not self-issue a reviewer receipt.

## Adversarial review (source + actual database tests)

| Question | Result and evidence |
| --- | --- |
| School A -> School B File? | Denied by composite File FK; all five negative cases |
| School A -> School B parent? | Denied by composite parent FK; all five cases |
| Nonexistent parent? | Denied 23503; all five cases |
| Answer confused with assignment asset? | Separate typed tables/FKs; wrong-family 23503 and exact answer joins |
| Managed null File? | CHECK or NOT NULL denial; all five cases |
| External URL plus File? | CHECK denial; each dual family |
| Retired File? | Live trigger denial 23503 on INSERT; immutable binding denial on retarget |
| Concurrent retirement/link? | Both observed lock orders per family under established retirement protocol |
| Soft-delete loses retention? | No; five historical-row cases and global helper |
| Upload session counted? | No; generated DMMF/SQL parity and existing provenance regression |
| Old Homework links forgotten? | Old predicates unchanged; DMMF parity and legacy regressions |
| Old Grades answers changed? | No; populated pre/post migration fingerprints |
| Null File School bypass? | No; five real composite FK denials |
| Duplicate ancestry disagreement? | No duplicate ancestry stored; exact answer join tests |
| Provider URL treated as verified File? | No File is invented; strict source CHECK and unsafe-URL tests; future binder approval still required |
| Broader runtime privileges? | No new grants/policy SQL; invoker function with PUBLIC EXECUTE revoked; exact role harness covers current catalog |
| New model bypasses school extension? | All five registered; actual scoped DB reads/soft-delete tests |
| Fixture mutates shared DB? | Disposable-target guard before connect; owned labelled loopback/tmpfs containers only |
| Legacy rows broken? | Additive objects only; old-row fingerprints and fresh replay/no-op checks |
| DR-07 bypassed? | No endpoint/binding/upload/scanner/release-switch change; media remains disabled |

## Deferred authority and operational limits

Future domain binders must validate live membership, allocation/target/student, exact ancestry, submission lifecycle and final transaction eligibility, File purpose/creator/private status, READY and technical/security evidence. A global creator FK, same-school relation or classification enum proves none of these. No new public route, IAM permission, upload flow or worker ships here.

DR-07 operational release remains pending; DR-08 is QA-only; assessment media release is disabled. Physical deletion is not authorized. Conservative historical links can intentionally block File/parent hard deletion until a later approved retention policy. Deploy the additive migration before starting application code that queries the five new retention tables. Deployment requires a separately authorized governed artifact/migration job, backup/data authority and lock-impact review. Do not edit applied migrations, reset, resolve or push schema as recovery. Drift, failure or checksum mismatch is an Owner decision stop.

## Completed local verification

- Final real PostgreSQL/security/HTTP regression run: 342 passed in 13 suites, including the 93 asset/File Lifetime cases; real owned private-file bytes are exercised by the existing Homework/private-content regressions. Includes ST02-R01/R02 and ST-04 eight-type HTTP contracts.
- Final focused unit run: 110 passed in seven suites. Earlier inventory-only and repeated runs are subsets, not additional unique tests.
- Selected migration/manifest/CI ownership/governance Node tests: 134 passed. Actual G01-C disposable-role harness: 18 positive checks, 57 negative checks, nine role-switch denials, zero remaining containers/networks/sessions.
- Prisma format, validate, generate; Build and current-worktree postbuild; migration governance, exact-byte manifest, old SQL/lock hashes: PASS.
- Fresh empty PostgreSQL: all 31 migrations replayed, status up to date, reference/demo seed succeeded, second deployment reported no pending migrations. Populated pre-migration fingerprints are described above.
- Non-fixing lint: four baseline TS files verified by Git blob against the approved SHA, seven candidate TS files, baseline/candidate diagnostics 0/0, introduced 0. Full-repository lint cleanliness is not claimed; inherited global diagnostics were not cleaned up.
- Local dependency installation stalled; exact-lock dependency reuse kept the old generated client unchanged and isolated this worktree's Prisma client/cache. The missing command shim required invoking the same seed through installed ts-node JavaScript. Final remote CI must independently prove its normal clean install.
- Owned loopback/tmpfs PostgreSQL, Redis and MinIO fixtures were removed after verification. Existing worktrees/evidence were preserved. Initial incomplete/misconfigured test attempts were superseded by the successful final runs above; no migration failed or was recovered/edited after application.

Final exact-head remote CI and Required artifact ID/digest/run/attempt are delivery evidence, recorded in the PR/handoff after this source commit, without changing the reviewed commit to insert its own SHA.
