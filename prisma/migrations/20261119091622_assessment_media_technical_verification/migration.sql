-- Prisma cannot express the purpose/version CHECK or cross-row claim and identity triggers.
-- Preserve historical predicates without rewriting existing evidence.
BEGIN;

ALTER TABLE public.file_upload_sessions DROP CONSTRAINT assessment_upload_contract_check;
ALTER TABLE public.file_upload_sessions
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
        AND assessment_verification_claim_id IS NULL
        AND (
          -- Historical security attestations use the original READY predicate.
          (verification_version = 'assessment-media-attested-v1'
            AND assessment_security_evidence IS NOT NULL
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
          OR (verification_version = 'assessment-media-technical-v1'
            AND latest_upload_url_expires_at IS NOT NULL
            AND verified_at <= expires_at AND completed_at <= expires_at
            AND CASE WHEN jsonb_typeof(assessment_security_evidence) = 'object'
              THEN assessment_security_evidence - ARRAY['kind', 'checksumSha256', 'verifiedAt', 'objectIdentity'] = '{}'::jsonb
              ELSE false END
            AND assessment_security_evidence ->> 'kind' = 'TECHNICAL'
            AND jsonb_typeof(assessment_security_evidence -> 'checksumSha256') = 'string'
            AND assessment_security_evidence ->> 'checksumSha256' = checksum_sha256
            AND assessment_security_evidence ->> 'verifiedAt' = to_char(verified_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            AND jsonb_typeof(assessment_security_evidence -> 'objectIdentity') = 'string'
            AND assessment_security_evidence ->> 'objectIdentity' ~ '^[a-f0-9]{64}$'
            AND (
              (expected_mime_type IN ('text/plain', 'application/pdf')
                AND duration_seconds IS NULL AND width IS NULL AND height IS NULL)
              OR (expected_mime_type IN ('image/jpeg', 'image/png')
                AND duration_seconds IS NULL AND width BETWEEN 1 AND 4096 AND height BETWEEN 1 AND 4096)
              OR (expected_mime_type IN ('audio/mpeg', 'audio/mp4', 'audio/webm')
                AND duration_seconds > 0 AND duration_seconds <= 3600 AND width IS NULL AND height IS NULL)
              OR (expected_mime_type IN ('video/mp4', 'video/webm')
                AND duration_seconds > 0 AND duration_seconds <= 3600
                AND width BETWEEN 1 AND 1920 AND height BETWEEN 1 AND 1080)
            )
          )
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

CREATE OR REPLACE FUNCTION public.enforce_assessment_upload_contract() RETURNS trigger
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
      AND visibility = 'PRIVATE' AND deleted_at IS NULL
      AND (NEW.verification_version IS DISTINCT FROM 'assessment-media-technical-v1' OR original_name = NEW.original_name)
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Assessment upload File unavailable' USING ERRCODE = '23503', CONSTRAINT = 'assessment_upload_ready_file_check';
    END IF;
  END IF;
  RETURN NEW;
END $assessment_contract$;
REVOKE ALL ON FUNCTION enforce_assessment_upload_contract() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enforce_answer_media_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE i public.assessment_answer_upload_intents%ROWTYPE;
  config jsonb; mime text; existing_count bigint;
BEGIN
  -- Same Answer -> Intent -> UploadSession -> File order as both owning domain binders.
  IF NEW.homework_answer_id IS NOT NULL THEN
    PERFORM id FROM public.homework_submission_answers WHERE id=NEW.homework_answer_id AND school_id=NEW.school_id FOR UPDATE;
  ELSE
    PERFORM id FROM public.grade_submission_answers WHERE id=NEW.grade_answer_id AND school_id=NEW.school_id FOR UPDATE;
  END IF;
  SELECT * INTO i FROM public.assessment_answer_upload_intents WHERE id=NEW.intent_id AND school_id=NEW.school_id FOR UPDATE;
  IF NOT FOUND OR i.purpose IS DISTINCT FROM NEW.purpose
    OR i.homework_assignment_id IS DISTINCT FROM NEW.homework_assignment_id
    OR i.grade_assessment_id IS DISTINCT FROM NEW.grade_assessment_id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invalid answer media provenance', CONSTRAINT='answer_media_claim_provenance';
  END IF;
  SELECT f.mime_type INTO mime FROM public.file_upload_sessions u JOIN public.files f ON f.id=u.file_id
    WHERE u.id=i.upload_id AND f.id=NEW.file_id AND u.school_id=NEW.school_id AND f.school_id=NEW.school_id
      AND u.organization_id=NEW.organization_id AND f.organization_id=NEW.organization_id
      AND u.created_by_user_id=NEW.actor_id AND f.uploader_id=NEW.actor_id
      AND u.status='READY' AND f.deleted_at IS NULL AND f.visibility='PRIVATE'
      AND u.final_bucket=f.bucket AND u.final_object_key=f.object_key AND u.original_name=f.original_name
      AND u.verified_mime_type=f.mime_type AND u.expected_mime_type=f.mime_type
      AND u.actual_size_bytes=f.size_bytes AND u.expected_size_bytes=f.size_bytes AND f.size_bytes>0
      AND u.checksum_sha256=f.checksum_sha256 AND u.checksum_sha256 ~ '^[a-f0-9]{64}$'
      AND u.verified_at IS NOT NULL AND u.completed_at IS NOT NULL AND u.verified_at>=u.created_at
      AND u.verified_at<=u.completed_at AND u.verified_at<=u.expires_at
      AND u.completed_at<=timezone('UTC',CURRENT_TIMESTAMP)
      AND u.assessment_verification_claim_id IS NULL AND u.failed_at IS NULL AND u.cancelled_at IS NULL
      AND u.final_cleanup_claimed_at IS NULL AND u.final_object_deleted_at IS NULL
      -- The validated session CHECK supplies the technical evidence predicate.
      AND (u.verification_version='assessment-media-technical-v1'
        OR (u.verification_version='assessment-media-attested-v1'
          AND u.assessment_security_evidence->>'verdict'='CLEAN'
          AND u.assessment_security_evidence->>'checksumSha256'=u.checksum_sha256
          AND u.assessment_security_evidence->>'provider' ~ '^[a-z0-9._-]{1,80}$'
          AND u.assessment_security_evidence->>'version' ~ '^[a-z0-9._-]{1,80}$'
          AND u.assessment_security_evidence->>'verifiedAt'=to_char(u.verified_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    FOR SHARE OF u,f;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invalid verified answer file', CONSTRAINT='answer_media_claim_ready';
  END IF;
  -- Legacy links predate the registry. Their Files are consumed too, even after soft deletion.
  IF EXISTS (SELECT 1 FROM public.homework_answer_assets WHERE file_id=NEW.file_id)
    OR EXISTS (SELECT 1 FROM public.grade_submission_answer_assets WHERE file_id=NEW.file_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Answer File already consumed', CONSTRAINT='answer_media_claim_history';
  END IF;
  IF NEW.purpose='HOMEWORK_SUBMISSION_MEDIA' THEN
    SELECT response_config INTO config FROM public.homework_questions WHERE id=NEW.question_id AND school_id=NEW.school_id AND deleted_at IS NULL;
    SELECT count(*) INTO existing_count FROM public.homework_answer_assets WHERE homework_submission_answer_id=NEW.homework_answer_id AND school_id=NEW.school_id AND deleted_at IS NULL;
  ELSE
    SELECT response_config INTO config FROM public.grade_assessment_questions WHERE id=NEW.question_id AND school_id=NEW.school_id AND deleted_at IS NULL;
    SELECT count(*) INTO existing_count FROM public.grade_submission_answer_assets WHERE answer_id=NEW.grade_answer_id AND school_id=NEW.school_id AND deleted_at IS NULL;
  END IF;
  IF config IS NULL OR existing_count>=COALESCE((config->>'maxFiles')::integer,0)
    OR NOT (CASE config->>'mode'
      WHEN 'AUDIO_ONLY' THEN mime IN ('audio/mpeg','audio/mp4','audio/webm')
      WHEN 'FILE_OR_AUDIO' THEN mime IN ('audio/mpeg','audio/mp4','audio/webm','text/plain','application/pdf','image/jpeg','image/png')
      WHEN 'FILE_ONLY' THEN mime IN ('text/plain','application/pdf','image/jpeg','image/png')
      WHEN 'TEXT_OR_FILE' THEN mime IN ('text/plain','application/pdf','image/jpeg','image/png')
      WHEN 'TEXT_AND_FILE' THEN mime IN ('text/plain','application/pdf','image/jpeg','image/png')
      ELSE false END) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invalid answer media modality', CONSTRAINT='answer_media_claim_modality';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_answer_media_claim() FROM PUBLIC;

-- Preserve the identity of the private File behind new technical evidence.
-- Historical Files and non-assessment purposes keep their existing behavior.
CREATE FUNCTION public.enforce_assessment_verified_file_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.file_upload_sessions
    WHERE file_id = OLD.id AND status = 'READY'
      AND verification_version = 'assessment-media-technical-v1') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Verified assessment File identity is immutable',
      CONSTRAINT='assessment_verified_file_identity';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_assessment_verified_file_identity() FROM PUBLIC;
CREATE TRIGGER assessment_verified_file_identity_guard
BEFORE UPDATE OF id, school_id, organization_id, uploader_id, bucket, object_key,
  original_name, mime_type, size_bytes, checksum_sha256, visibility ON public.files
FOR EACH ROW WHEN (
  ROW(OLD.id, OLD.school_id, OLD.organization_id, OLD.uploader_id, OLD.bucket, OLD.object_key,
    OLD.original_name, OLD.mime_type, OLD.size_bytes, OLD.checksum_sha256, OLD.visibility)
  IS DISTINCT FROM
  ROW(NEW.id, NEW.school_id, NEW.organization_id, NEW.uploader_id, NEW.bucket, NEW.object_key,
    NEW.original_name, NEW.mime_type, NEW.size_bytes, NEW.checksum_sha256, NEW.visibility)
) EXECUTE FUNCTION public.enforce_assessment_verified_file_identity();

COMMIT;
