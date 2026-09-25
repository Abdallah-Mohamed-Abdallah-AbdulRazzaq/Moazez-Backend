-- ACC-4A has no truthful source for a required historical title. An explicit
-- Academic Content data migration decision is required before non-empty data
-- can cross this boundary; no automatic backfill is authorized.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "academic_contents") THEN
    RAISE EXCEPTION 'ACC-4A requires an explicit Academic Content data migration decision for existing rows; no title backfill is authorized';
  END IF;
END $$;

CREATE TYPE "academic_content_status" AS ENUM (
  'DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED',
  'PUBLISHED', 'EXPIRED', 'ARCHIVED', 'CANCELLED'
);

ALTER TABLE "academic_contents"
  ADD COLUMN "title" VARCHAR(180) NOT NULL,
  ADD COLUMN "description" VARCHAR(4000),
  ADD COLUMN "status" "academic_content_status" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE INDEX "academic_contents_school_id_status_idx"
  ON "academic_contents"("school_id", "status");

ALTER TABLE "academic_contents"
  ADD CONSTRAINT "academic_contents_archive_state_check"
  CHECK (
    ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL) OR
    ("status" <> 'ARCHIVED' AND "archived_at" IS NULL)
  );
