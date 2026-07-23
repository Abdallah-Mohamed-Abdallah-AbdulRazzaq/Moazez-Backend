-- CreateEnum
CREATE TYPE "file_upload_purpose" AS ENUM ('LESSON_CONTENT');

-- CreateEnum
CREATE TYPE "file_upload_session_status" AS ENUM (
  'CREATED',
  'UPLOADING',
  'VERIFYING',
  'READY',
  'LEGACY',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'PURGED'
);

-- CreateTable
CREATE TABLE "file_upload_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "school_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "client_request_id" UUID NOT NULL,
  "purpose" "file_upload_purpose" NOT NULL,
  "original_name" TEXT NOT NULL,
  "expected_mime_type" TEXT NOT NULL,
  "expected_size_bytes" BIGINT NOT NULL,
  "staging_bucket" TEXT,
  "staging_object_key" TEXT,
  "final_bucket" TEXT NOT NULL,
  "final_object_key" TEXT NOT NULL,
  "status" "file_upload_session_status" NOT NULL DEFAULT 'CREATED',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "latest_upload_url_expires_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "staging_cleanup_eligible_at" TIMESTAMP(3),
  "staging_cleanup_claimed_at" TIMESTAMP(3),
  "staging_object_deleted_at" TIMESTAMP(3),
  "final_cleanup_eligible_at" TIMESTAMP(3),
  "final_cleanup_claimed_at" TIMESTAMP(3),
  "final_object_deleted_at" TIMESTAMP(3),
  "failure_reason" TEXT,
  "verified_mime_type" TEXT,
  "actual_size_bytes" BIGINT,
  "checksum_sha256" TEXT,
  "duration_seconds" DOUBLE PRECISION,
  "width" INTEGER,
  "height" INTEGER,
  "verified_at" TIMESTAMP(3),
  "verification_version" TEXT,
  "file_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "file_upload_sessions_pkey" PRIMARY KEY ("id")
);

-- One deterministic normalization contract is used by compatibility DML and
-- retained for deployment rehearsal parity against the JavaScript classifier.
CREATE FUNCTION "normalize_learning_media_original_name"(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
AS $function$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(value, '^.*[\\/]', ''),
      U&'[\0001-\001F\007F-\009F]',
      '',
      'g'
    ),
    U&'^[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
    '',
    'g'
  )
$function$;

-- Fail closed if a referenced legacy File cannot become a scoped LEGACY session.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "files" f
    WHERE EXISTS (
      SELECT 1 FROM "lesson_content_items" lci WHERE lci."file_id" = f."id"
    )
      AND (
        f."organization_id" IS NULL
        OR f."school_id" IS NULL
        OR f."uploader_id" IS NULL
        OR char_length(
          "normalize_learning_media_original_name"(f."original_name")
        ) NOT BETWEEN 1 AND 255
      )
  ) THEN
    RAISE EXCEPTION 'Referenced legacy File cannot satisfy FileUploadSession ownership/name contract';
  END IF;
END $$;

-- Preserve referenced legacy Files without touching their storage objects.
INSERT INTO "file_upload_sessions" (
  "organization_id",
  "school_id",
  "created_by_user_id",
  "client_request_id",
  "purpose",
  "original_name",
  "expected_mime_type",
  "expected_size_bytes",
  "final_bucket",
  "final_object_key",
  "status",
  "expires_at",
  "verification_version",
  "file_id",
  "created_at",
  "updated_at"
)
SELECT
  f."organization_id",
  f."school_id",
  f."uploader_id",
  f."id",
  'LESSON_CONTENT',
  "normalize_learning_media_original_name"(f."original_name"),
  lower(btrim(f."mime_type")),
  f."size_bytes",
  f."bucket",
  f."object_key",
  'LEGACY',
  f."created_at",
  'legacy_metadata_v1',
  f."id",
  f."created_at",
  f."updated_at"
FROM "files" f
WHERE EXISTS (
  SELECT 1 FROM "lesson_content_items" lci WHERE lci."file_id" = f."id"
);

-- Lifecycle invariants Prisma cannot express.
ALTER TABLE "file_upload_sessions"
ADD CONSTRAINT "file_upload_sessions_expected_metadata_check"
CHECK (
  "expected_size_bytes" > 0
  AND (
    "staging_object_key" IS NULL
    OR (
      "expected_mime_type" IN (
        'application/pdf', 'text/plain', 'image/jpeg', 'image/png',
        'audio/mpeg', 'audio/mp4', 'audio/webm', 'video/mp4', 'video/webm'
      )
      AND (
        ("expected_mime_type" IN ('video/mp4', 'video/webm') AND "expected_size_bytes" <= 209715200)
        OR
        ("expected_mime_type" NOT IN ('video/mp4', 'video/webm') AND "expected_size_bytes" <= 10485760)
      )
    )
  )
),
ADD CONSTRAINT "file_upload_sessions_actual_size_check"
CHECK (
  "actual_size_bytes" IS NULL
  OR (
    "actual_size_bytes" > 0
    AND "actual_size_bytes" = "expected_size_bytes"
  )
),
ADD CONSTRAINT "file_upload_sessions_checksum_check"
CHECK (
  "checksum_sha256" IS NULL
  OR "checksum_sha256" ~ '^[0-9a-f]{64}$'
),
ADD CONSTRAINT "file_upload_sessions_duration_check"
CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0),
ADD CONSTRAINT "file_upload_sessions_dimensions_check"
CHECK (("width" IS NULL AND "height" IS NULL) OR ("width" > 0 AND "height" > 0)),
ADD CONSTRAINT "file_upload_sessions_original_name_check"
CHECK (
  char_length("original_name") BETWEEN 1 AND 255
  AND "original_name" = "normalize_learning_media_original_name"("original_name")
),
ADD CONSTRAINT "file_upload_sessions_object_identity_check"
CHECK (
  char_length("final_bucket") > 0
  AND char_length("final_object_key") > 0
  AND (
    ("staging_bucket" IS NULL AND "staging_object_key" IS NULL)
    OR (
      "staging_bucket" IS NOT NULL
      AND "staging_object_key" IS NOT NULL
      AND char_length("staging_bucket") > 0
      AND char_length("staging_object_key") > 0
      AND ("staging_bucket", "staging_object_key") <> ("final_bucket", "final_object_key")
    )
  )
),
ADD CONSTRAINT "file_upload_sessions_expiry_check"
CHECK (
  (
    "staging_object_key" IS NULL
    AND "latest_upload_url_expires_at" IS NULL
    AND "expires_at" = "created_at"
  )
  OR (
    "staging_object_key" IS NOT NULL
    AND "expires_at" = "created_at" + INTERVAL '2 hours'
    AND (
      "latest_upload_url_expires_at" IS NULL
      OR "latest_upload_url_expires_at" > "created_at"
    )
    AND (
      ("status" = 'CREATED' AND "latest_upload_url_expires_at" IS NULL)
      OR "status" IN ('FAILED', 'CANCELLED', 'EXPIRED')
      OR (
        "status" NOT IN ('CREATED', 'FAILED', 'CANCELLED', 'EXPIRED')
        AND "latest_upload_url_expires_at" IS NOT NULL
      )
    )
  )
),
ADD CONSTRAINT "file_upload_sessions_cleanup_evidence_check"
CHECK (
  (
    "staging_cleanup_claimed_at" IS NULL
    OR (
      "staging_cleanup_eligible_at" IS NOT NULL
      AND "staging_cleanup_claimed_at" >= "staging_cleanup_eligible_at"
    )
  )
  AND (
    "staging_object_deleted_at" IS NULL
    OR (
      "staging_cleanup_claimed_at" IS NOT NULL
      AND "staging_object_deleted_at" >= "staging_cleanup_claimed_at"
    )
  )
  AND (
    "final_cleanup_claimed_at" IS NULL
    OR (
      "final_cleanup_eligible_at" IS NOT NULL
      AND "final_cleanup_claimed_at" >= "final_cleanup_eligible_at"
    )
  )
  AND (
    "final_object_deleted_at" IS NULL
    OR (
      "final_cleanup_claimed_at" IS NOT NULL
      AND "final_object_deleted_at" >= "final_cleanup_claimed_at"
    )
  )
  AND (
    "staging_cleanup_eligible_at" IS NULL
    OR (
      "status" IN ('READY', 'FAILED', 'CANCELLED', 'EXPIRED', 'PURGED')
      AND "staging_cleanup_eligible_at" >= COALESCE(
        "latest_upload_url_expires_at",
        "failed_at",
        "cancelled_at",
        "expires_at"
      )
    )
  )
),
ADD CONSTRAINT "file_upload_sessions_authoritative_facts_check"
CHECK (
  (
    "verified_mime_type" IS NULL
    AND "actual_size_bytes" IS NULL
    AND "checksum_sha256" IS NULL
    AND "duration_seconds" IS NULL
    AND "width" IS NULL
    AND "height" IS NULL
    AND "verified_at" IS NULL
    AND (
      "verification_version" IS NULL
      OR ("staging_object_key" IS NULL AND "verification_version" = 'legacy_metadata_v1')
    )
  )
  OR (
    "verified_mime_type" = "expected_mime_type"
    AND "actual_size_bytes" IS NOT NULL
    AND "checksum_sha256" IS NOT NULL
    AND "verified_at" IS NOT NULL
    AND "verification_version" = 'ffprobe-5.1.9-debian12-learning-media-v1'
    AND (
      (
        "verified_mime_type" IN ('video/mp4', 'video/webm')
        AND "duration_seconds" IS NOT NULL
        AND "width" IS NOT NULL
        AND "height" IS NOT NULL
      )
      OR (
        "verified_mime_type" IN ('audio/mpeg', 'audio/mp4', 'audio/webm')
        AND "duration_seconds" IS NOT NULL
        AND "width" IS NULL
        AND "height" IS NULL
      )
      OR (
        "verified_mime_type" IN ('image/jpeg', 'image/png')
        AND "duration_seconds" IS NULL
        AND "width" IS NOT NULL
        AND "height" IS NOT NULL
      )
      OR (
        "verified_mime_type" IN ('application/pdf', 'text/plain')
        AND "duration_seconds" IS NULL
        AND "width" IS NULL
        AND "height" IS NULL
      )
    )
  )
),
ADD CONSTRAINT "file_upload_sessions_created_check"
CHECK (
  "status" <> 'CREATED'
  OR (
    "staging_object_key" IS NOT NULL
    AND "latest_upload_url_expires_at" IS NULL
    AND "file_id" IS NULL
    AND "completed_at" IS NULL
    AND "failed_at" IS NULL
    AND "cancelled_at" IS NULL
    AND "staging_cleanup_eligible_at" IS NULL
    AND "staging_cleanup_claimed_at" IS NULL
    AND "staging_object_deleted_at" IS NULL
    AND "final_cleanup_eligible_at" IS NULL
    AND "final_cleanup_claimed_at" IS NULL
    AND "final_object_deleted_at" IS NULL
    AND "failure_reason" IS NULL
    AND "verified_mime_type" IS NULL
  )
),
ADD CONSTRAINT "file_upload_sessions_uploading_check"
CHECK (
  "status" <> 'UPLOADING'
  OR (
    "staging_object_key" IS NOT NULL
    AND "latest_upload_url_expires_at" IS NOT NULL
    AND "file_id" IS NULL
    AND "completed_at" IS NULL
    AND "failed_at" IS NULL
    AND "cancelled_at" IS NULL
    AND "staging_cleanup_eligible_at" IS NULL
    AND "staging_cleanup_claimed_at" IS NULL
    AND "staging_object_deleted_at" IS NULL
    AND "final_cleanup_eligible_at" IS NULL
    AND "final_cleanup_claimed_at" IS NULL
    AND "final_object_deleted_at" IS NULL
    AND "failure_reason" IS NULL
    AND "verified_mime_type" IS NULL
  )
),
ADD CONSTRAINT "file_upload_sessions_verifying_check"
CHECK (
  "status" <> 'VERIFYING'
  OR (
    (
      (
        "staging_object_key" IS NOT NULL
        AND "file_id" IS NULL
      )
      OR (
        "staging_object_key" IS NULL
        AND "file_id" IS NOT NULL
        AND "verification_version" = 'legacy_metadata_v1'
      )
    )
    AND "completed_at" IS NULL
    AND "failed_at" IS NULL
    AND "cancelled_at" IS NULL
    AND "staging_cleanup_eligible_at" IS NULL
    AND "staging_cleanup_claimed_at" IS NULL
    AND "staging_object_deleted_at" IS NULL
    AND "final_object_deleted_at" IS NULL
    AND "verified_mime_type" IS NULL
    AND (
      (
        "failure_reason" IS NULL
        AND "final_cleanup_eligible_at" IS NULL
        AND "final_cleanup_claimed_at" IS NULL
      )
      OR (
        "staging_object_key" IS NOT NULL
        AND "file_id" IS NULL
        AND "latest_upload_url_expires_at" IS NOT NULL
        AND "failure_reason" IS NOT NULL
        AND "failure_reason" = 'finalization_cleanup_pending'
        AND "final_cleanup_eligible_at" IS NOT NULL
      )
    )
  )
),
ADD CONSTRAINT "file_upload_sessions_ready_check"
CHECK (
  "status" <> 'READY'
  OR (
    "file_id" IS NOT NULL
    AND "completed_at" IS NOT NULL
    AND "verified_mime_type" IS NOT NULL
    AND "actual_size_bytes" IS NOT NULL
    AND "checksum_sha256" IS NOT NULL
    AND "verified_at" IS NOT NULL
    AND "verification_version" IS NOT NULL
    AND "final_cleanup_eligible_at" = "completed_at" + INTERVAL '7 days'
    AND (
      ("staging_object_key" IS NOT NULL AND "staging_cleanup_eligible_at" IS NOT NULL)
      OR (
        "staging_object_key" IS NULL
        AND "staging_cleanup_eligible_at" IS NULL
        AND "staging_cleanup_claimed_at" IS NULL
        AND "staging_object_deleted_at" IS NULL
      )
    )
    AND "failure_reason" IS NULL
    AND "failed_at" IS NULL
    AND "cancelled_at" IS NULL
    AND "final_object_deleted_at" IS NULL
  )
),
ADD CONSTRAINT "file_upload_sessions_legacy_check"
CHECK (
  "status" <> 'LEGACY'
  OR (
    "file_id" IS NOT NULL
    AND "staging_bucket" IS NULL
    AND "staging_object_key" IS NULL
    AND "latest_upload_url_expires_at" IS NULL
    AND "verification_version" = 'legacy_metadata_v1'
    AND "verified_mime_type" IS NULL
    AND "actual_size_bytes" IS NULL
    AND "checksum_sha256" IS NULL
    AND "duration_seconds" IS NULL
    AND "width" IS NULL
    AND "height" IS NULL
    AND "verified_at" IS NULL
    AND "completed_at" IS NULL
    AND "failed_at" IS NULL
    AND "cancelled_at" IS NULL
    AND "failure_reason" IS NULL
    AND "staging_cleanup_eligible_at" IS NULL
    AND "staging_cleanup_claimed_at" IS NULL
    AND "staging_object_deleted_at" IS NULL
    AND "final_cleanup_eligible_at" IS NULL
    AND "final_cleanup_claimed_at" IS NULL
    AND "final_object_deleted_at" IS NULL
  )
),
ADD CONSTRAINT "file_upload_sessions_failed_check"
CHECK (
  "status" <> 'FAILED'
  OR (
    "failed_at" IS NOT NULL
    AND "failure_reason" IS NOT NULL
    AND "completed_at" IS NULL
    AND "cancelled_at" IS NULL
    AND "verified_mime_type" IS NULL
    AND (
      (
        "staging_object_key" IS NOT NULL
        AND "file_id" IS NULL
        AND "staging_cleanup_eligible_at" IS NOT NULL
        AND "final_cleanup_eligible_at" IS NULL
        AND "final_cleanup_claimed_at" IS NULL
        AND "final_object_deleted_at" IS NULL
      )
      OR (
        "staging_object_key" IS NULL
        AND "file_id" IS NOT NULL
        AND "staging_cleanup_eligible_at" IS NULL
        AND "staging_cleanup_claimed_at" IS NULL
        AND "staging_object_deleted_at" IS NULL
        AND "final_cleanup_eligible_at" IS NULL
        AND "final_cleanup_claimed_at" IS NULL
        AND "final_object_deleted_at" IS NULL
      )
    )
  )
),
ADD CONSTRAINT "file_upload_sessions_cancelled_check"
CHECK (
  "status" <> 'CANCELLED'
  OR (
    "staging_object_key" IS NOT NULL
    AND "file_id" IS NULL
    AND "cancelled_at" IS NOT NULL
    AND "completed_at" IS NULL
    AND "failed_at" IS NULL
    AND "staging_cleanup_eligible_at" IS NOT NULL
    AND "final_cleanup_eligible_at" IS NULL
    AND "final_cleanup_claimed_at" IS NULL
    AND "final_object_deleted_at" IS NULL
    AND "failure_reason" IS NULL
    AND "verified_mime_type" IS NULL
  )
),
ADD CONSTRAINT "file_upload_sessions_expired_check"
CHECK (
  "status" <> 'EXPIRED'
  OR (
    "staging_object_key" IS NOT NULL
    AND "file_id" IS NULL
    AND "completed_at" IS NULL
    AND "failed_at" IS NULL
    AND "cancelled_at" IS NULL
    AND "staging_cleanup_eligible_at" IS NOT NULL
    AND "final_cleanup_eligible_at" IS NULL
    AND "final_cleanup_claimed_at" IS NULL
    AND "final_object_deleted_at" IS NULL
    AND "failure_reason" IS NULL
    AND "verified_mime_type" IS NULL
  )
),
ADD CONSTRAINT "file_upload_sessions_purged_check"
CHECK (
  "status" <> 'PURGED'
  OR (
    "file_id" IS NOT NULL
    AND "completed_at" IS NOT NULL
    AND "verified_mime_type" IS NOT NULL
    AND "final_cleanup_eligible_at" = "completed_at" + INTERVAL '7 days'
    AND "final_cleanup_claimed_at" IS NOT NULL
    AND "final_object_deleted_at" IS NOT NULL
    AND (
      (
        "staging_object_key" IS NULL
        AND "staging_cleanup_eligible_at" IS NULL
        AND "staging_cleanup_claimed_at" IS NULL
        AND "staging_object_deleted_at" IS NULL
      )
      OR (
        "staging_object_key" IS NOT NULL
        AND "staging_cleanup_eligible_at" IS NOT NULL
        AND "staging_cleanup_claimed_at" IS NOT NULL
        AND "staging_object_deleted_at" IS NOT NULL
      )
    )
    AND "failed_at" IS NULL
    AND "cancelled_at" IS NULL
    AND "failure_reason" IS NULL
  )
);

-- CreateIndex
CREATE UNIQUE INDEX "file_upload_sessions_staging_bucket_object_key_key" ON "file_upload_sessions"("staging_bucket", "staging_object_key");
CREATE UNIQUE INDEX "file_upload_sessions_final_bucket_object_key_key" ON "file_upload_sessions"("final_bucket", "final_object_key");
CREATE UNIQUE INDEX "file_upload_sessions_file_id_key" ON "file_upload_sessions"("file_id");
CREATE UNIQUE INDEX "file_upload_sessions_school_creator_purpose_request_key" ON "file_upload_sessions"("school_id", "created_by_user_id", "purpose", "client_request_id");
CREATE INDEX "file_upload_sessions_school_status_expiry_idx" ON "file_upload_sessions"("school_id", "status", "expires_at");
CREATE INDEX "file_upload_sessions_school_purpose_status_idx" ON "file_upload_sessions"("school_id", "purpose", "status");
CREATE INDEX "file_upload_sessions_creator_idx" ON "file_upload_sessions"("created_by_user_id");
CREATE INDEX "file_upload_sessions_staging_cleanup_discovery_idx" ON "file_upload_sessions"("school_id", "status", "staging_cleanup_eligible_at", "staging_cleanup_claimed_at");
CREATE INDEX "file_upload_sessions_final_cleanup_discovery_idx" ON "file_upload_sessions"("school_id", "status", "final_cleanup_eligible_at", "final_cleanup_claimed_at");

-- AddForeignKey
ALTER TABLE "file_upload_sessions" ADD CONSTRAINT "file_upload_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file_upload_sessions" ADD CONSTRAINT "file_upload_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file_upload_sessions" ADD CONSTRAINT "file_upload_sessions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file_upload_sessions" ADD CONSTRAINT "file_upload_sessions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
