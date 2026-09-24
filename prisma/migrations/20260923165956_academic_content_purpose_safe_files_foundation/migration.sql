-- AlterTable
ALTER TABLE "file_upload_sessions" ADD COLUMN     "purpose_context_id" UUID;

-- CreateTable
CREATE TABLE "academic_content_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "academic_content_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_file_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "attachments_enabled" BOOLEAN NOT NULL,
    "maximum_file_size_bytes" BIGINT NOT NULL,
    "documents_enabled" BOOLEAN NOT NULL,
    "images_enabled" BOOLEAN NOT NULL,
    "videos_enabled" BOOLEAN NOT NULL,
    "audio_enabled" BOOLEAN NOT NULL,
    "archives_enabled" BOOLEAN NOT NULL,
    "other_files_enabled" BOOLEAN NOT NULL,
    "allow_student_download" BOOLEAN NOT NULL,
    "allow_guardian_download" BOOLEAN NOT NULL,
    "allow_inline_preview" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_file_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_content_assets_school_id_academic_content_id_idx" ON "academic_content_assets"("school_id", "academic_content_id");

-- CreateIndex
CREATE INDEX "academic_content_assets_school_id_file_id_idx" ON "academic_content_assets"("school_id", "file_id");

-- CreateIndex
CREATE INDEX "academic_content_assets_created_by_user_id_idx" ON "academic_content_assets"("created_by_user_id");

-- CreateIndex
CREATE INDEX "academic_content_assets_deleted_at_idx" ON "academic_content_assets"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_file_policies_school_id_key" ON "academic_content_file_policies"("school_id");

-- AddForeignKey
ALTER TABLE "academic_content_assets" ADD CONSTRAINT "academic_content_assets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_assets" ADD CONSTRAINT "academic_content_assets_academic_content_id_school_id_fkey" FOREIGN KEY ("academic_content_id", "school_id") REFERENCES "academic_contents"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_assets" ADD CONSTRAINT "academic_content_assets_file_id_school_id_fkey" FOREIGN KEY ("file_id", "school_id") REFERENCES "files"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_assets" ADD CONSTRAINT "academic_content_assets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_file_policies" ADD CONSTRAINT "academic_content_file_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express purpose-dependent CHECK constraints. Existing
-- LESSON_CONTENT predicates are wrapped verbatim from their validated catalog
-- definitions; this migration never relaxes their LESSON_CONTENT branch.
-- Generic checks (expected metadata, actual size, checksum format, duration,
-- dimensions, original name, object identity, cleanup chronology) remain
-- unchanged and continue to apply to both purposes.
DO $purpose_checks$
DECLARE
  constraint_name text;
  prior_definition text;
  prior_predicate text;
BEGIN
  FOREACH constraint_name IN ARRAY ARRAY[
    'file_upload_sessions_expiry_check',
    'file_upload_sessions_authoritative_facts_check',
    'file_upload_sessions_created_check',
    'file_upload_sessions_uploading_check',
    'file_upload_sessions_verifying_check',
    'file_upload_sessions_ready_check',
    'file_upload_sessions_legacy_check',
    'file_upload_sessions_failed_check',
    'file_upload_sessions_cancelled_check',
    'file_upload_sessions_expired_check',
    'file_upload_sessions_purged_check'
  ] LOOP
    SELECT pg_get_constraintdef(c.oid)
      INTO prior_definition
    FROM pg_constraint c
    WHERE c.conrelid = 'file_upload_sessions'::regclass
      AND c.conname = constraint_name
      AND c.contype = 'c'
      AND c.convalidated;
    IF prior_definition IS NULL
       OR left(prior_definition, 7) <> 'CHECK ('
       OR right(prior_definition, 1) <> ')' THEN
      RAISE EXCEPTION 'Expected validated Learning Media CHECK is unavailable: %', constraint_name;
    END IF;
    prior_predicate := substring(prior_definition from 8 for char_length(prior_definition) - 8);
    EXECUTE format('ALTER TABLE "file_upload_sessions" DROP CONSTRAINT %I', constraint_name);
    EXECUTE format(
      'ALTER TABLE "file_upload_sessions" ADD CONSTRAINT %I CHECK ("purpose" = ''ACADEMIC_CONTENT'' OR (%s))',
      constraint_name,
      prior_predicate
    );
  END LOOP;
END $purpose_checks$;

ALTER TABLE "file_upload_sessions"
ADD CONSTRAINT "file_upload_sessions_purpose_context_check"
CHECK (
  ("purpose" = 'LESSON_CONTENT' AND "purpose_context_id" IS NULL)
  OR ("purpose" = 'ACADEMIC_CONTENT' AND "purpose_context_id" IS NOT NULL)
),
ADD CONSTRAINT "file_upload_sessions_academic_content_contract_check"
CHECK (
  "purpose" <> 'ACADEMIC_CONTENT'
  OR (
    "purpose_context_id" IS NOT NULL
    AND "staging_bucket" IS NULL
    AND "staging_object_key" IS NULL
    AND "expected_size_bytes" BETWEEN 1 AND 10737418240
    AND "expires_at" > "created_at"
    AND (
      "latest_upload_url_expires_at" IS NULL
      OR "latest_upload_url_expires_at" > "created_at"
    )
    AND (
      "verification_version" IS NULL
      OR "verification_version" = 'academic-content-bounded-v1'
    )
    AND (
      (
        "status" = 'CREATED'
        AND "latest_upload_url_expires_at" IS NULL
        AND "file_id" IS NULL
        AND "completed_at" IS NULL
        AND "failed_at" IS NULL
        AND "cancelled_at" IS NULL
        AND "failure_reason" IS NULL
        AND "verified_mime_type" IS NULL
        AND "actual_size_bytes" IS NULL
        AND "checksum_sha256" IS NULL
        AND "duration_seconds" IS NULL
        AND "width" IS NULL
        AND "height" IS NULL
        AND "verified_at" IS NULL
        AND "verification_version" IS NULL
        AND "staging_cleanup_eligible_at" IS NULL
        AND "staging_cleanup_claimed_at" IS NULL
        AND "staging_object_deleted_at" IS NULL
        AND "final_cleanup_eligible_at" IS NULL
        AND "final_cleanup_claimed_at" IS NULL
        AND "final_object_deleted_at" IS NULL
      )
      OR (
        "status" IN ('UPLOADING', 'VERIFYING')
        AND "file_id" IS NULL
        AND "completed_at" IS NULL
        AND "failed_at" IS NULL
        AND "cancelled_at" IS NULL
        AND "failure_reason" IS NULL
        AND "verified_mime_type" IS NULL
        AND "actual_size_bytes" IS NULL
        AND "checksum_sha256" IS NULL
        AND "duration_seconds" IS NULL
        AND "width" IS NULL
        AND "height" IS NULL
        AND "verified_at" IS NULL
        AND "verification_version" IS NULL
        AND "staging_cleanup_eligible_at" IS NULL
        AND "staging_cleanup_claimed_at" IS NULL
        AND "staging_object_deleted_at" IS NULL
        AND "final_cleanup_eligible_at" IS NULL
        AND "final_cleanup_claimed_at" IS NULL
        AND "final_object_deleted_at" IS NULL
      )
      OR (
        "status" = 'READY'
        AND "file_id" IS NOT NULL
        AND "completed_at" IS NOT NULL
        AND "verified_mime_type" IS NOT NULL
        AND "verified_mime_type" = "expected_mime_type"
        AND "actual_size_bytes" IS NOT NULL
        AND "verified_at" IS NOT NULL
        AND "verification_version" IS NOT NULL
        AND "verification_version" = 'academic-content-bounded-v1'
        AND "failed_at" IS NULL
        AND "cancelled_at" IS NULL
        AND "failure_reason" IS NULL
        AND "staging_cleanup_eligible_at" IS NULL
        AND "staging_cleanup_claimed_at" IS NULL
        AND "staging_object_deleted_at" IS NULL
        AND (
          "final_cleanup_eligible_at" IS NULL
          OR "final_cleanup_eligible_at" >= "completed_at"
        )
        AND "final_cleanup_claimed_at" IS NULL
        AND "final_object_deleted_at" IS NULL
      )
      OR (
        "status" IN ('FAILED', 'CANCELLED', 'EXPIRED')
        AND "file_id" IS NULL
        AND "completed_at" IS NULL
        AND "verified_mime_type" IS NULL
        AND "actual_size_bytes" IS NULL
        AND "checksum_sha256" IS NULL
        AND "duration_seconds" IS NULL
        AND "width" IS NULL
        AND "height" IS NULL
        AND "verified_at" IS NULL
        AND "verification_version" IS NULL
        AND "staging_cleanup_eligible_at" IS NULL
        AND "staging_cleanup_claimed_at" IS NULL
        AND "staging_object_deleted_at" IS NULL
        AND (
          ("status" = 'FAILED' AND "failed_at" IS NOT NULL AND "failure_reason" IS NOT NULL AND "cancelled_at" IS NULL)
          OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "failed_at" IS NULL AND "failure_reason" IS NULL)
          OR ("status" = 'EXPIRED' AND "failed_at" IS NULL AND "cancelled_at" IS NULL AND "failure_reason" IS NULL)
        )
      )
      OR (
        "status" = 'PURGED'
        AND "file_id" IS NOT NULL
        AND "completed_at" IS NOT NULL
        AND "verified_mime_type" IS NOT NULL
        AND "verified_mime_type" = "expected_mime_type"
        AND "actual_size_bytes" IS NOT NULL
        AND "verified_at" IS NOT NULL
        AND "verification_version" IS NOT NULL
        AND "verification_version" = 'academic-content-bounded-v1'
        AND "final_cleanup_eligible_at" IS NOT NULL
        AND "final_cleanup_claimed_at" IS NOT NULL
        AND "final_object_deleted_at" IS NOT NULL
        AND "failed_at" IS NULL
        AND "cancelled_at" IS NULL
        AND "failure_reason" IS NULL
      )
    )
  )
);

-- Prisma cannot express a partial unique index over active soft-delete rows.
CREATE UNIQUE INDEX "academic_content_assets_active_link_key"
ON "academic_content_assets" ("school_id", "academic_content_id", "file_id")
WHERE "deleted_at" IS NULL;

-- Prisma cannot express this policy-bound BIGINT range check.
ALTER TABLE "academic_content_file_policies"
ADD CONSTRAINT "academic_content_file_policies_maximum_file_size_bytes_check"
CHECK ("maximum_file_size_bytes" > 0 AND "maximum_file_size_bytes" <= 10737418240);
