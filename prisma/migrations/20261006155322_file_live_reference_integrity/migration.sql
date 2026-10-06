-- Prisma cannot express a foreign key's live-parent predicate or row lock.
-- File is the serialization parent: cleanup UPDATE conflicts with KEY SHARE.
CREATE FUNCTION public.enforce_live_file_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  referenced_file_id uuid;
BEGIN
  -- Arguments are static metadata owned by this migration, never client SQL.
  IF TG_NARGS <> 1 OR NOT (pg_catalog.to_jsonb(NEW) ? TG_ARGV[0]) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'file_live_reference_required';
  END IF;
  referenced_file_id := (pg_catalog.to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  IF referenced_file_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND (pg_catalog.to_jsonb(OLD) ->> TG_ARGV[0])::uuid IS NOT DISTINCT FROM referenced_file_id THEN
    RETURN NEW;
  END IF;

  PERFORM f.id FROM public.files AS f
  WHERE f.id = referenced_file_id AND f.deleted_at IS NULL
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'file_live_reference_required';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_live_file_reference() FROM PUBLIC;

CREATE TRIGGER file_live_ref_settings_school_profile_logo_file_id
BEFORE INSERT OR UPDATE OF logo_file_id ON public.settings_school_profile
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('logo_file_id');

CREATE TRIGGER file_live_ref_admission_application_documents_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.admission_application_documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER file_live_ref_applicant_admission_request_documents_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.applicant_admission_request_documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER file_live_ref_academic_content_assets_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.academic_content_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER file_live_ref_academic_content_revision_assets_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.academic_content_revision_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER file_live_ref_lesson_content_items_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.lesson_content_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER file_live_ref_teacher_profiles_avatar_file_id
BEFORE INSERT OR UPDATE OF avatar_file_id ON public.teacher_profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('avatar_file_id');

CREATE TRIGGER file_live_ref_students_avatar_file_id
BEFORE INSERT OR UPDATE OF avatar_file_id ON public.students
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('avatar_file_id');

CREATE TRIGGER file_live_ref_student_credential_batches_secret_artifact_file_id
BEFORE INSERT OR UPDATE OF secret_artifact_file_id ON public.student_credential_batches
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('secret_artifact_file_id');

CREATE TRIGGER file_live_ref_student_documents_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.student_documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER file_live_ref_homework_submission_attachments_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.homework_submission_attachments
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER file_live_ref_homework_assignment_attachments_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.homework_assignment_attachments
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER file_live_ref_reinforcement_submissions_proof_file_id
BEFORE INSERT OR UPDATE OF proof_file_id ON public.reinforcement_submissions
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('proof_file_id');

CREATE TRIGGER file_live_ref_reward_catalog_items_image_file_id
BEFORE INSERT OR UPDATE OF image_file_id ON public.reward_catalog_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('image_file_id');

CREATE TRIGGER file_live_ref_hero_badges_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.hero_badges
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER file_live_ref_communication_conversations_avatar_file_id
BEFORE INSERT OR UPDATE OF avatar_file_id ON public.communication_conversations
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('avatar_file_id');

CREATE TRIGGER file_live_ref_communication_message_attachments_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.communication_message_attachments
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER file_live_ref_communication_announcements_image_file_id
BEFORE INSERT OR UPDATE OF image_file_id ON public.communication_announcements
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('image_file_id');

CREATE TRIGGER file_live_ref_communication_announcement_attachments_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.communication_announcement_attachments
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER file_live_ref_attachments_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.attachments
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER file_live_ref_import_jobs_uploaded_file_id
BEFORE INSERT OR UPDATE OF uploaded_file_id ON public.import_jobs
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('uploaded_file_id');

-- Upload provenance is guarded on linking but deliberately does not retain.
CREATE TRIGGER file_live_ref_file_upload_sessions_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.file_upload_sessions
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');
