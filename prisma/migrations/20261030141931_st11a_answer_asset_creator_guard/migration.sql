-- Complete the asset creator/immutable consumption relationship without changing legacy rows.
CREATE OR REPLACE FUNCTION public.enforce_answer_asset_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE owner_actor uuid;
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
  IF NEW.answer_media_claim_id IS NOT NULL THEN
    SELECT actor_id INTO owner_actor FROM public.assessment_answer_media_claims WHERE id=NEW.answer_media_claim_id;
    IF FOUND AND owner_actor IS DISTINCT FROM NEW.created_by_user_id THEN
      RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='Answer asset creator must match its immutable claim', CONSTRAINT='answer_asset_claim_creator';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_answer_asset_claim() FROM PUBLIC;
