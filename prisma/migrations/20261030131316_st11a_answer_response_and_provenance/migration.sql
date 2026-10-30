-- AlterTable
ALTER TABLE "grade_assessment_questions" ADD COLUMN     "response_config" JSONB;

-- AlterTable
ALTER TABLE "grade_submission_answer_assets" ADD COLUMN     "answer_media_claim_id" UUID;

-- AlterTable
ALTER TABLE "homework_answer_assets" ADD COLUMN     "answer_media_claim_id" UUID;

-- AlterTable
ALTER TABLE "homework_questions" ADD COLUMN     "response_config" JSONB;

-- CreateTable
CREATE TABLE "assessment_answer_upload_intents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "purpose" "file_upload_purpose" NOT NULL,
    "context_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "client_request_id" UUID NOT NULL,
    "homework_target_id" UUID,
    "homework_question_id" UUID,
    "grade_submission_id" UUID,
    "grade_question_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "homework_assignment_id" UUID,
    "grade_assessment_id" UUID,

    CONSTRAINT "assessment_answer_upload_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_answer_media_claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "intent_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "homework_answer_id" UUID,
    "grade_answer_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "purpose" "file_upload_purpose" NOT NULL,
    "context_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "homework_assignment_id" UUID,
    "homework_submission_id" UUID,
    "grade_assessment_id" UUID,

    CONSTRAINT "assessment_answer_media_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_answer_upload_intents_upload_id_key" ON "assessment_answer_upload_intents"("upload_id");

-- CreateIndex
CREATE INDEX "assessment_answer_upload_intents_school_id_context_id_quest_idx" ON "assessment_answer_upload_intents"("school_id", "context_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_answer_upload_intents_id_school_id_key" ON "assessment_answer_upload_intents"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_upload_intent_request_key" ON "assessment_answer_upload_intents"("school_id", "actor_id", "purpose", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_upload_intent_owner_key" ON "assessment_answer_upload_intents"("upload_id", "school_id", "organization_id", "actor_id", "purpose", "context_id", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_intent_complete_owner_key" ON "assessment_answer_upload_intents"("id", "school_id", "organization_id", "actor_id", "student_id", "purpose", "context_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_intent_homework_root_key" ON "assessment_answer_upload_intents"("id", "school_id", "homework_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_intent_grade_root_key" ON "assessment_answer_upload_intents"("id", "school_id", "grade_assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_answer_media_claims_intent_id_key" ON "assessment_answer_media_claims"("intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_answer_media_claims_file_id_key" ON "assessment_answer_media_claims"("file_id");

-- CreateIndex
CREATE INDEX "assessment_answer_media_claims_school_id_homework_answer_id_idx" ON "assessment_answer_media_claims"("school_id", "homework_answer_id");

-- CreateIndex
CREATE INDEX "assessment_answer_media_claims_school_id_grade_answer_id_idx" ON "assessment_answer_media_claims"("school_id", "grade_answer_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_answer_media_claims_id_school_id_key" ON "assessment_answer_media_claims"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_answer_media_claims_intent_id_school_id_key" ON "assessment_answer_media_claims"("intent_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_claim_intent_complete_owner_key" ON "assessment_answer_media_claims"("intent_id", "school_id", "organization_id", "actor_id", "student_id", "purpose", "context_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_claim_homework_asset_key" ON "assessment_answer_media_claims"("id", "school_id", "file_id", "homework_answer_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_claim_grade_asset_key" ON "assessment_answer_media_claims"("id", "school_id", "file_id", "grade_answer_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_upload_session_owner_key" ON "file_upload_sessions"("id", "school_id", "organization_id", "created_by_user_id", "purpose", "purpose_context_id", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_claim_file_owner_key" ON "files"("id", "school_id", "organization_id", "uploader_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_intent_grade_question_key" ON "grade_assessment_questions"("id", "school_id", "assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_submission_answer_assets_answer_media_claim_id_key" ON "grade_submission_answer_assets"("answer_media_claim_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_submission_answer_assets_answer_media_claim_id_school_key" ON "grade_submission_answer_assets"("answer_media_claim_id", "school_id", "file_id", "answer_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_claim_grade_answer_key" ON "grade_submission_answers"("id", "school_id", "submission_id", "question_id", "student_id", "assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_intent_grade_submission_key" ON "grade_submissions"("id", "school_id", "assessment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_answer_assets_answer_media_claim_id_key" ON "homework_answer_assets"("answer_media_claim_id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_answer_assets_answer_media_claim_id_school_id_file_key" ON "homework_answer_assets"("answer_media_claim_id", "school_id", "file_id", "homework_submission_answer_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_intent_homework_question_key" ON "homework_questions"("id", "school_id", "homework_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_claim_homework_answer_key" ON "homework_submission_answers"("id", "school_id", "homework_submission_id", "homework_target_id", "homework_question_id", "homework_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_claim_homework_submission_key" ON "homework_submissions"("id", "school_id", "homework_target_id", "student_id", "homework_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_intent_homework_target_key" ON "homework_targets"("id", "school_id", "homework_assignment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_intent_school_organization_key" ON "schools"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_intent_student_actor_key" ON "students"("id", "school_id", "user_id");

-- AddForeignKey
ALTER TABLE "grade_submission_answer_assets" ADD CONSTRAINT "grade_submission_answer_assets_answer_media_claim_id_schoo_fkey" FOREIGN KEY ("answer_media_claim_id", "school_id", "file_id", "answer_id") REFERENCES "assessment_answer_media_claims"("id", "school_id", "file_id", "grade_answer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_answer_assets" ADD CONSTRAINT "homework_answer_assets_answer_media_claim_id_school_id_fil_fkey" FOREIGN KEY ("answer_media_claim_id", "school_id", "file_id", "homework_submission_answer_id") REFERENCES "assessment_answer_media_claims"("id", "school_id", "file_id", "homework_answer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_upload_intents" ADD CONSTRAINT "assessment_answer_upload_intents_school_id_organization_id_fkey" FOREIGN KEY ("school_id", "organization_id") REFERENCES "schools"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_upload_intents" ADD CONSTRAINT "assessment_answer_upload_intents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_upload_intents" ADD CONSTRAINT "assessment_answer_upload_intents_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_upload_intents" ADD CONSTRAINT "assessment_answer_upload_intents_student_id_school_id_acto_fkey" FOREIGN KEY ("student_id", "school_id", "actor_id") REFERENCES "students"("id", "school_id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_upload_intents" ADD CONSTRAINT "answer_upload_intent_session_owner_fk" FOREIGN KEY ("upload_id", "school_id", "organization_id", "actor_id", "purpose", "context_id", "client_request_id") REFERENCES "file_upload_sessions"("id", "school_id", "organization_id", "created_by_user_id", "purpose", "purpose_context_id", "client_request_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_upload_intents" ADD CONSTRAINT "assessment_answer_upload_intents_homework_target_id_school_fkey" FOREIGN KEY ("homework_target_id", "school_id", "homework_assignment_id", "student_id") REFERENCES "homework_targets"("id", "school_id", "homework_assignment_id", "student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_upload_intents" ADD CONSTRAINT "assessment_answer_upload_intents_homework_question_id_scho_fkey" FOREIGN KEY ("homework_question_id", "school_id", "homework_assignment_id") REFERENCES "homework_questions"("id", "school_id", "homework_assignment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_upload_intents" ADD CONSTRAINT "assessment_answer_upload_intents_grade_submission_id_schoo_fkey" FOREIGN KEY ("grade_submission_id", "school_id", "grade_assessment_id", "student_id") REFERENCES "grade_submissions"("id", "school_id", "assessment_id", "student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_upload_intents" ADD CONSTRAINT "assessment_answer_upload_intents_grade_question_id_school__fkey" FOREIGN KEY ("grade_question_id", "school_id", "grade_assessment_id") REFERENCES "grade_assessment_questions"("id", "school_id", "assessment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_media_claims" ADD CONSTRAINT "assessment_answer_media_claims_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_media_claims" ADD CONSTRAINT "assessment_answer_media_claims_intent_id_school_id_organiz_fkey" FOREIGN KEY ("intent_id", "school_id", "organization_id", "actor_id", "student_id", "purpose", "context_id", "question_id") REFERENCES "assessment_answer_upload_intents"("id", "school_id", "organization_id", "actor_id", "student_id", "purpose", "context_id", "question_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_media_claims" ADD CONSTRAINT "answer_media_claim_file_fk" FOREIGN KEY ("file_id", "school_id", "organization_id", "actor_id") REFERENCES "files"("id", "school_id", "organization_id", "uploader_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_media_claims" ADD CONSTRAINT "assessment_answer_media_claims_homework_answer_id_school_i_fkey" FOREIGN KEY ("homework_answer_id", "school_id", "homework_submission_id", "context_id", "question_id", "homework_assignment_id") REFERENCES "homework_submission_answers"("id", "school_id", "homework_submission_id", "homework_target_id", "homework_question_id", "homework_assignment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_media_claims" ADD CONSTRAINT "assessment_answer_media_claims_grade_answer_id_school_id_c_fkey" FOREIGN KEY ("grade_answer_id", "school_id", "context_id", "question_id", "student_id", "grade_assessment_id") REFERENCES "grade_submission_answers"("id", "school_id", "submission_id", "question_id", "student_id", "assessment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_answer_media_claims" ADD CONSTRAINT "assessment_answer_media_claims_homework_submission_id_scho_fkey" FOREIGN KEY ("homework_submission_id", "school_id", "context_id", "student_id", "homework_assignment_id") REFERENCES "homework_submissions"("id", "school_id", "homework_target_id", "student_id", "homework_assignment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ST11 security invariants: Prisma cannot express closed JSON CHECKs or identity/live-reference triggers.

ALTER TABLE public.homework_questions ADD CONSTRAINT homework_questions_response_config_v1 CHECK (
  response_config IS NULL OR CASE WHEN jsonb_typeof(response_config) = 'object' THEN (
    type::text IN ('SHORT_TEXT','LONG_TEXT') AND response_config->'version' = '1'::jsonb
    AND response_config ?& ARRAY['version','mode']
    AND ((response_config->>'mode' = 'TEXT_ONLY' AND response_config - ARRAY['version','mode'] = '{}'::jsonb)
      OR (response_config->>'mode' IN ('FILE_ONLY','AUDIO_ONLY','TEXT_OR_FILE','TEXT_AND_FILE','FILE_OR_AUDIO')
        AND response_config->'maxFiles' IN ('1'::jsonb,'2'::jsonb,'3'::jsonb)
        AND response_config - ARRAY['version','mode','maxFiles'] = '{}'::jsonb))
  ) IS TRUE ELSE false END
);

ALTER TABLE public.grade_assessment_questions ADD CONSTRAINT grade_assessment_questions_response_config_v1 CHECK (
  response_config IS NULL OR CASE WHEN jsonb_typeof(response_config) = 'object' THEN (
    type::text IN ('SHORT_ANSWER','ESSAY') AND response_config->'version' = '1'::jsonb
    AND response_config ?& ARRAY['version','mode']
    AND ((response_config->>'mode' = 'TEXT_ONLY' AND response_config - ARRAY['version','mode'] = '{}'::jsonb)
      OR (response_config->>'mode' IN ('FILE_ONLY','AUDIO_ONLY','TEXT_OR_FILE','TEXT_AND_FILE','FILE_OR_AUDIO')
        AND response_config->'maxFiles' IN ('1'::jsonb,'2'::jsonb,'3'::jsonb)
        AND response_config - ARRAY['version','mode','maxFiles'] = '{}'::jsonb))
  ) IS TRUE ELSE false END
);

ALTER TABLE public.assessment_answer_upload_intents ADD CONSTRAINT answer_upload_intent_domain CHECK (
  (purpose = 'HOMEWORK_SUBMISSION_MEDIA' AND homework_target_id IS NOT NULL AND homework_question_id IS NOT NULL
    AND homework_assignment_id IS NOT NULL AND context_id=homework_target_id AND question_id=homework_question_id
    AND grade_submission_id IS NULL AND grade_question_id IS NULL AND grade_assessment_id IS NULL)
  OR (purpose = 'GRADE_SUBMISSION_MEDIA' AND grade_submission_id IS NOT NULL AND grade_question_id IS NOT NULL
    AND grade_assessment_id IS NOT NULL AND context_id=grade_submission_id AND question_id=grade_question_id
    AND homework_target_id IS NULL AND homework_question_id IS NULL AND homework_assignment_id IS NULL)
);
ALTER TABLE public.assessment_answer_media_claims ADD CONSTRAINT answer_media_claim_domain CHECK (
  (purpose='HOMEWORK_SUBMISSION_MEDIA' AND homework_answer_id IS NOT NULL AND homework_submission_id IS NOT NULL
    AND homework_assignment_id IS NOT NULL AND grade_answer_id IS NULL AND grade_assessment_id IS NULL)
  OR (purpose='GRADE_SUBMISSION_MEDIA' AND grade_answer_id IS NOT NULL AND grade_assessment_id IS NOT NULL
    AND homework_answer_id IS NULL AND homework_submission_id IS NULL AND homework_assignment_id IS NULL)
);

CREATE FUNCTION public.enforce_answer_media_append_only() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Answer media provenance is immutable', CONSTRAINT='answer_media_provenance_immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_answer_media_append_only() FROM PUBLIC;
CREATE TRIGGER answer_upload_intent_immutable BEFORE UPDATE OR DELETE ON public.assessment_answer_upload_intents
FOR EACH ROW EXECUTE FUNCTION public.enforce_answer_media_append_only();
CREATE TRIGGER answer_media_claim_immutable BEFORE UPDATE OR DELETE ON public.assessment_answer_media_claims
FOR EACH ROW EXECUTE FUNCTION public.enforce_answer_media_append_only();

CREATE FUNCTION public.enforce_answer_media_claim() RETURNS trigger
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
CREATE TRIGGER answer_media_claim_ready BEFORE INSERT ON public.assessment_answer_media_claims
FOR EACH ROW EXECUTE FUNCTION public.enforce_answer_media_claim();
CREATE TRIGGER file_live_ref_assessment_answer_media_claims_file_id BEFORE INSERT OR UPDATE OF file_id ON public.assessment_answer_media_claims
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE FUNCTION public.enforce_answer_asset_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF (TG_OP='INSERT' AND NEW.answer_media_claim_id IS NULL)
    OR (TG_OP='UPDATE' AND NEW.answer_media_claim_id IS DISTINCT FROM OLD.answer_media_claim_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='An immutable answer media claim is required', CONSTRAINT='answer_asset_claim_required';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_answer_asset_claim() FROM PUBLIC;
CREATE TRIGGER aaa_answer_asset_claim_homework BEFORE INSERT OR UPDATE ON public.homework_answer_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_answer_asset_claim();
CREATE TRIGGER aaa_answer_asset_claim_grades BEFORE INSERT OR UPDATE ON public.grade_submission_answer_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_answer_asset_claim();
