-- AlterTable
ALTER TABLE "file_upload_sessions" ADD COLUMN     "assessment_security_evidence" JSONB,
ADD COLUMN     "assessment_verification_claim_id" UUID;

-- CreateTable
CREATE TABLE "school_assessment_media_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "uploads_enabled" BOOLEAN NOT NULL DEFAULT false,
    "teacher_uploads_enabled" BOOLEAN NOT NULL DEFAULT false,
    "student_uploads_enabled" BOOLEAN NOT NULL DEFAULT false,
    "allowed_mime_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maximum_file_size_bytes" BIGINT NOT NULL DEFAULT 10485760,
    "maximum_files_per_resource" INTEGER NOT NULL DEFAULT 8,
    "maximum_resource_bytes" BIGINT NOT NULL DEFAULT 83886080,
    "maximum_school_bytes" BIGINT NOT NULL DEFAULT 1073741824,
    "maximum_concurrent_uploads" INTEGER NOT NULL DEFAULT 2,
    "maximum_uploads_per_hour" INTEGER NOT NULL DEFAULT 30,
    "maximum_duration_seconds" INTEGER NOT NULL DEFAULT 3600,
    "maximum_width" INTEGER NOT NULL DEFAULT 1920,
    "maximum_height" INTEGER NOT NULL DEFAULT 1080,
    "allow_inline_preview" BOOLEAN NOT NULL DEFAULT false,
    "allow_download" BOOLEAN NOT NULL DEFAULT false,
    "allow_guardian_visibility" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_assessment_media_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_assessment_media_policies_school_id_key" ON "school_assessment_media_policies"("school_id");

-- AddForeignKey
ALTER TABLE "school_assessment_media_policies" ADD CONSTRAINT "school_assessment_media_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express these purpose-dependent predicates. Preserve each
-- existing validated predicate verbatim for BOTH historical purposes.
DO $assessment_checks$
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
    'file_upload_sessions_purged_check',
    'file_upload_sessions_purpose_context_check'
  ] LOOP
    SELECT pg_get_constraintdef(c.oid) INTO prior_definition
    FROM pg_constraint c WHERE c.conrelid = 'file_upload_sessions'::regclass
      AND c.conname = constraint_name AND c.contype = 'c' AND c.convalidated;
    IF prior_definition IS NULL OR left(prior_definition, 7) <> 'CHECK ('
      OR right(prior_definition, 1) <> ')' THEN
      RAISE EXCEPTION 'Expected validated upload CHECK unavailable: %', constraint_name;
    END IF;
    prior_predicate := substring(prior_definition from 8 for char_length(prior_definition) - 8);
    EXECUTE format('ALTER TABLE file_upload_sessions DROP CONSTRAINT %I', constraint_name);
    EXECUTE format(
      'ALTER TABLE file_upload_sessions ADD CONSTRAINT %I CHECK (purpose IN (''HOMEWORK_ASSIGNMENT_MEDIA'', ''GRADE_ASSESSMENT_MEDIA'', ''HOMEWORK_SUBMISSION_MEDIA'', ''GRADE_SUBMISSION_MEDIA'') OR (%s))',
      constraint_name, prior_predicate);
  END LOOP;
END $assessment_checks$;

ALTER TABLE school_assessment_media_policies
ADD CONSTRAINT assessment_media_policy_bounds_check CHECK (COALESCE(
  allowed_mime_types IS NOT NULL AND cardinality(allowed_mime_types) <= 9
  AND allowed_mime_types <@ ARRAY['text/plain', 'application/pdf', 'image/jpeg', 'image/png',
    'audio/mpeg', 'audio/mp4', 'audio/webm', 'video/mp4', 'video/webm']::text[]
  AND maximum_file_size_bytes BETWEEN 1 AND 209715200
  AND maximum_files_per_resource BETWEEN 1 AND 8
  AND maximum_resource_bytes BETWEEN 1 AND 1677721600
  AND maximum_school_bytes BETWEEN 1 AND 1073741824
  AND maximum_concurrent_uploads BETWEEN 1 AND 2
  AND maximum_uploads_per_hour BETWEEN 1 AND 30
  AND maximum_duration_seconds BETWEEN 1 AND 3600
  AND maximum_width BETWEEN 1 AND 4096 AND maximum_height BETWEEN 1 AND 4096,
false));

ALTER TABLE file_upload_sessions
ADD CONSTRAINT assessment_upload_metadata_isolation_check CHECK (
  purpose IN ('HOMEWORK_ASSIGNMENT_MEDIA', 'GRADE_ASSESSMENT_MEDIA', 'HOMEWORK_SUBMISSION_MEDIA', 'GRADE_SUBMISSION_MEDIA')
  OR (assessment_verification_claim_id IS NULL AND assessment_security_evidence IS NULL)
),
ADD CONSTRAINT assessment_upload_contract_check CHECK (
  purpose NOT IN ('HOMEWORK_ASSIGNMENT_MEDIA', 'GRADE_ASSESSMENT_MEDIA', 'HOMEWORK_SUBMISSION_MEDIA', 'GRADE_SUBMISSION_MEDIA')
  OR COALESCE((
    purpose_context_id IS NOT NULL
    AND staging_bucket IS NOT NULL AND staging_object_key IS NOT NULL
    AND final_bucket = staging_bucket
    AND staging_object_key = 'assessment-media/' || school_id::text || '/staging/' || id::text
    AND final_object_key = 'assessment-media/' || school_id::text || '/verified/' || id::text
    AND expected_size_bytes BETWEEN 1 AND CASE WHEN expected_mime_type IN ('video/mp4', 'video/webm') THEN 209715200 ELSE 10485760 END
    AND expires_at > created_at
    AND (latest_upload_url_expires_at IS NULL OR latest_upload_url_expires_at > created_at)
    -- No new physical-deletion authority, including eligibility/claim evidence.
    AND staging_cleanup_eligible_at IS NULL AND staging_cleanup_claimed_at IS NULL AND staging_object_deleted_at IS NULL
    AND final_cleanup_eligible_at IS NULL AND final_cleanup_claimed_at IS NULL AND final_object_deleted_at IS NULL
    AND (
      (status = 'READY'
        AND file_id IS NOT NULL AND completed_at IS NOT NULL
        AND failed_at IS NULL AND cancelled_at IS NULL AND failure_reason IS NULL
        AND verified_mime_type IS NOT NULL AND verified_mime_type = expected_mime_type
        AND actual_size_bytes IS NOT NULL AND actual_size_bytes = expected_size_bytes
        AND checksum_sha256 IS NOT NULL AND checksum_sha256 ~ '^[a-f0-9]{64}$'
        AND verified_at IS NOT NULL AND verified_at >= created_at AND verified_at <= completed_at
        AND verification_version IS NOT NULL AND verification_version = 'assessment-media-attested-v1'
        AND assessment_verification_claim_id IS NULL AND assessment_security_evidence IS NOT NULL
        AND jsonb_typeof(assessment_security_evidence) = 'object'
        AND assessment_security_evidence ->> 'verdict' = 'CLEAN'
        AND assessment_security_evidence ->> 'checksumSha256' = checksum_sha256
        AND assessment_security_evidence ->> 'provider' ~ '^[a-z0-9._-]{1,80}$'
        AND assessment_security_evidence ->> 'version' ~ '^[a-z0-9._-]{1,80}$'
        AND (
          (expected_mime_type = 'text/plain' AND duration_seconds IS NULL AND width IS NULL AND height IS NULL)
          OR (expected_mime_type IN ('audio/mpeg', 'audio/mp4', 'audio/webm')
            AND duration_seconds IS NOT NULL AND duration_seconds > 0 AND duration_seconds <= 3600 AND width IS NULL AND height IS NULL)
          OR (expected_mime_type IN ('video/mp4', 'video/webm')
            AND duration_seconds IS NOT NULL AND duration_seconds > 0 AND duration_seconds <= 3600
            AND width IS NOT NULL AND height IS NOT NULL AND width BETWEEN 1 AND 1920 AND height BETWEEN 1 AND 1080)
        )
      )
      OR (status IN ('CREATED', 'UPLOADING', 'VERIFYING', 'FAILED', 'CANCELLED', 'EXPIRED')
        AND file_id IS NULL AND completed_at IS NULL AND verified_mime_type IS NULL
        AND actual_size_bytes IS NULL AND checksum_sha256 IS NULL AND duration_seconds IS NULL
        AND width IS NULL AND height IS NULL AND verified_at IS NULL AND verification_version IS NULL
        AND assessment_security_evidence IS NULL
        AND ((status = 'VERIFYING' AND assessment_verification_claim_id IS NOT NULL)
          OR (status <> 'VERIFYING' AND assessment_verification_claim_id IS NULL))
        AND (
          (status = 'CREATED' AND latest_upload_url_expires_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL AND failure_reason IS NULL)
          OR (status IN ('UPLOADING', 'VERIFYING') AND latest_upload_url_expires_at IS NOT NULL
            AND failed_at IS NULL AND cancelled_at IS NULL AND failure_reason IS NULL)
          OR (status = 'FAILED' AND failed_at IS NOT NULL AND failed_at >= created_at
            AND failure_reason IS NOT NULL AND length(failure_reason) BETWEEN 1 AND 80 AND cancelled_at IS NULL)
          OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_at >= created_at AND failed_at IS NULL AND failure_reason IS NULL)
          OR (status = 'EXPIRED' AND failed_at IS NULL AND cancelled_at IS NULL AND failure_reason IS NULL)
        )
      )
    )
  ), false)
);

-- Prisma cannot express polymorphic context existence, immutable intent
-- ownership, legal transitions, or cross-table READY/File consistency.
CREATE FUNCTION enforce_assessment_upload_contract() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $assessment_contract$
DECLARE
  assessment_purposes constant file_upload_purpose[] := ARRAY[
    'HOMEWORK_ASSIGNMENT_MEDIA', 'GRADE_ASSESSMENT_MEDIA', 'HOMEWORK_SUBMISSION_MEDIA', 'GRADE_SUBMISSION_MEDIA'
  ]::file_upload_purpose[];
  context_found boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.purpose = ANY(assessment_purposes) OR NEW.purpose = ANY(assessment_purposes)) THEN
    IF ROW(OLD.id, OLD.organization_id, OLD.school_id, OLD.created_by_user_id, OLD.client_request_id,
           OLD.purpose, OLD.purpose_context_id, OLD.original_name, OLD.expected_mime_type, OLD.expected_size_bytes,
           OLD.staging_bucket, OLD.staging_object_key, OLD.final_bucket, OLD.final_object_key, OLD.expires_at, OLD.created_at)
       IS DISTINCT FROM
       ROW(NEW.id, NEW.organization_id, NEW.school_id, NEW.created_by_user_id, NEW.client_request_id,
           NEW.purpose, NEW.purpose_context_id, NEW.original_name, NEW.expected_mime_type, NEW.expected_size_bytes,
           NEW.staging_bucket, NEW.staging_object_key, NEW.final_bucket, NEW.final_object_key, NEW.expires_at, NEW.created_at) THEN
      RAISE EXCEPTION 'Assessment upload identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'assessment_upload_identity_check';
    END IF;
    IF OLD.status <> NEW.status AND NOT (
      (OLD.status = 'CREATED' AND NEW.status IN ('UPLOADING', 'FAILED', 'CANCELLED', 'EXPIRED'))
      OR (OLD.status = 'UPLOADING' AND NEW.status IN ('VERIFYING', 'FAILED', 'CANCELLED', 'EXPIRED'))
      OR (OLD.status = 'VERIFYING' AND NEW.status IN ('READY', 'FAILED', 'CANCELLED', 'EXPIRED'))
    ) THEN
      RAISE EXCEPTION 'Illegal assessment upload transition' USING ERRCODE = '23514', CONSTRAINT = 'assessment_upload_transition_check';
    END IF;
    IF OLD.status = 'READY' AND ROW(OLD.file_id, OLD.completed_at, OLD.verified_mime_type, OLD.actual_size_bytes,
      OLD.checksum_sha256, OLD.duration_seconds, OLD.width, OLD.height, OLD.verified_at, OLD.verification_version, OLD.assessment_security_evidence)
      IS DISTINCT FROM ROW(NEW.file_id, NEW.completed_at, NEW.verified_mime_type, NEW.actual_size_bytes,
      NEW.checksum_sha256, NEW.duration_seconds, NEW.width, NEW.height, NEW.verified_at, NEW.verification_version, NEW.assessment_security_evidence) THEN
      RAISE EXCEPTION 'Assessment verification evidence is immutable' USING ERRCODE = '23514', CONSTRAINT = 'assessment_upload_evidence_check';
    END IF;
  END IF;
  IF NOT NEW.purpose = ANY(assessment_purposes) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'CREATED' THEN
    RAISE EXCEPTION 'Assessment uploads begin CREATED' USING ERRCODE = '23514', CONSTRAINT = 'assessment_upload_transition_check';
  END IF;
  CASE NEW.purpose
    WHEN 'HOMEWORK_ASSIGNMENT_MEDIA' THEN
      SELECT EXISTS (SELECT 1 FROM homework_assignments WHERE id = NEW.purpose_context_id AND school_id = NEW.school_id) INTO context_found;
    WHEN 'GRADE_ASSESSMENT_MEDIA' THEN
      SELECT EXISTS (SELECT 1 FROM grade_assessments WHERE id = NEW.purpose_context_id AND school_id = NEW.school_id) INTO context_found;
    WHEN 'HOMEWORK_SUBMISSION_MEDIA' THEN
      SELECT EXISTS (SELECT 1 FROM homework_targets t JOIN students s ON s.id = t.student_id AND s.school_id = t.school_id
        WHERE t.id = NEW.purpose_context_id AND t.school_id = NEW.school_id AND s.user_id = NEW.created_by_user_id) INTO context_found;
    WHEN 'GRADE_SUBMISSION_MEDIA' THEN
      SELECT EXISTS (SELECT 1 FROM grade_submissions g JOIN students s ON s.id = g.student_id AND s.school_id = g.school_id
        WHERE g.id = NEW.purpose_context_id AND g.school_id = NEW.school_id AND s.user_id = NEW.created_by_user_id) INTO context_found;
    ELSE context_found := false;
  END CASE;
  IF NOT context_found THEN
    RAISE EXCEPTION 'Assessment upload context unavailable' USING ERRCODE = '23503', CONSTRAINT = 'assessment_upload_context_check';
  END IF;
  IF NEW.status = 'READY' THEN
    PERFORM id FROM files WHERE id = NEW.file_id AND school_id = NEW.school_id AND organization_id = NEW.organization_id
      AND uploader_id = NEW.created_by_user_id AND bucket = NEW.final_bucket AND object_key = NEW.final_object_key
      AND mime_type = NEW.verified_mime_type AND size_bytes = NEW.actual_size_bytes AND checksum_sha256 = NEW.checksum_sha256
      AND visibility = 'PRIVATE' AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Assessment upload File unavailable' USING ERRCODE = '23503', CONSTRAINT = 'assessment_upload_ready_file_check';
    END IF;
  END IF;
  RETURN NEW;
END $assessment_contract$;
REVOKE ALL ON FUNCTION enforce_assessment_upload_contract() FROM PUBLIC;
CREATE TRIGGER assessment_upload_contract_guard BEFORE INSERT OR UPDATE ON file_upload_sessions
FOR EACH ROW EXECUTE FUNCTION enforce_assessment_upload_contract();
