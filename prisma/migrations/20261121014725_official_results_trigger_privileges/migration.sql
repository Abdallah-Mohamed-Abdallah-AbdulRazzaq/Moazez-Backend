BEGIN;

-- Restrict direct execution and pin function name resolution for triggers.
CREATE OR REPLACE FUNCTION public.official_results_require_sheet_definition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.result_sheets
    WHERE id = NEW.id AND school_id = NEW.school_id
      AND draft_definition_version_id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      CONSTRAINT = 'result_sheet_requires_draft_definition',
      MESSAGE = 'An Official Results sheet requires a draft definition';
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION public.official_results_preserve_version()
  SET search_path TO pg_catalog;

REVOKE ALL ON FUNCTION public.official_results_require_sheet_definition() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.official_results_preserve_version() FROM PUBLIC;

COMMIT;
