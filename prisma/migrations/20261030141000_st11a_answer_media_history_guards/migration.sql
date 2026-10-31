-- Additive forward guards after verification of the initial ST11-A schema.
-- No legacy rows are rewritten; historical links remain readable under their old contracts.
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
      AND u.verification_version='assessment-media-attested-v1'
      AND u.verified_at IS NOT NULL AND u.completed_at IS NOT NULL AND u.verified_at>=u.created_at
      AND u.verified_at<=u.completed_at AND u.verified_at<=u.expires_at
      AND u.completed_at<=timezone('UTC',CURRENT_TIMESTAMP)
      AND u.assessment_verification_claim_id IS NULL AND u.failed_at IS NULL AND u.cancelled_at IS NULL
      AND u.final_cleanup_claimed_at IS NULL AND u.final_object_deleted_at IS NULL
      AND u.assessment_security_evidence->>'verdict'='CLEAN'
      AND u.assessment_security_evidence->>'checksumSha256'=u.checksum_sha256
      AND u.assessment_security_evidence->>'provider' ~ '^[a-z0-9._-]{1,80}$'
      AND u.assessment_security_evidence->>'version' ~ '^[a-z0-9._-]{1,80}$'
      AND u.assessment_security_evidence->>'verifiedAt'=to_char(u.verified_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
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

CREATE OR REPLACE FUNCTION public.enforce_answer_asset_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.answer_media_claim_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Answer binding history is retained', CONSTRAINT='answer_asset_claim_retained';
    END IF;
    RETURN OLD;
  END IF;
  IF (TG_OP='INSERT' AND NEW.answer_media_claim_id IS NULL)
    OR (TG_OP='UPDATE' AND (NEW.answer_media_claim_id IS DISTINCT FROM OLD.answer_media_claim_id
      OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL))) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='An immutable answer media claim is required', CONSTRAINT='answer_asset_claim_required';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_answer_asset_claim() FROM PUBLIC;
DROP TRIGGER aaa_answer_asset_claim_homework ON public.homework_answer_assets;
DROP TRIGGER aaa_answer_asset_claim_grades ON public.grade_submission_answer_assets;
CREATE TRIGGER aaa_answer_asset_claim_homework BEFORE INSERT OR UPDATE OR DELETE ON public.homework_answer_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_answer_asset_claim();
CREATE TRIGGER aaa_answer_asset_claim_grades BEFORE INSERT OR UPDATE OR DELETE ON public.grade_submission_answer_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_answer_asset_claim();
