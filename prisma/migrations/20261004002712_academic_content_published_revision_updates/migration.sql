-- CreateEnum
CREATE TYPE "AcademicContentPublicationCancellationReason" AS ENUM ('UNSCHEDULED', 'WITHDRAWN', 'REVISION_STARTED');

-- CreateEnum
CREATE TYPE "AcademicContentChangeSignificance" AS ENUM ('MINOR', 'SIGNIFICANT');

-- AlterTable
ALTER TABLE "academic_content_publications" ADD COLUMN     "cancellation_reason" "AcademicContentPublicationCancellationReason",
ADD COLUMN     "change_significance" "AcademicContentChangeSignificance",
ADD COLUMN     "notify_minor_update" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supersedes_publication_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_publications_id_school_id_academic_content_key" ON "academic_content_publications"("id", "school_id", "academic_content_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_publications_school_id_supersedes_publicat_key" ON "academic_content_publications"("school_id", "supersedes_publication_id");

-- AddForeignKey
ALTER TABLE "academic_content_publications" ADD CONSTRAINT "academic_content_publications_supersedes_publication_id_sc_fkey" FOREIGN KEY ("supersedes_publication_id", "school_id", "academic_content_id") REFERENCES "academic_content_publications"("id", "school_id", "academic_content_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma cannot express the legacy compatibility DML or CHECK predicates.
-- Existing cancellation history has no revision-start meaning.
UPDATE "academic_content_publications"
SET "cancellation_reason" = CASE WHEN "published_at" IS NULL
  THEN 'UNSCHEDULED'::"AcademicContentPublicationCancellationReason"
  ELSE 'WITHDRAWN'::"AcademicContentPublicationCancellationReason" END
WHERE "status" = 'CANCELLED';

ALTER TABLE "academic_content_publications"
ADD CONSTRAINT "acc_publication_cancellation_reason_check" CHECK (
  ("status" = 'CANCELLED' AND "cancellation_reason" IS NOT NULL)
  OR ("status" <> 'CANCELLED' AND "cancellation_reason" IS NULL)
),
ADD CONSTRAINT "acc_publication_cancellation_kind_check" CHECK (
  "cancellation_reason" IS NULL
  OR ("cancellation_reason" = 'UNSCHEDULED' AND "published_at" IS NULL)
  OR ("cancellation_reason" IN ('WITHDRAWN', 'REVISION_STARTED') AND "published_at" IS NOT NULL)
),
ADD CONSTRAINT "acc_publication_update_linkage_check" CHECK (
  ("supersedes_publication_id" IS NULL AND "change_significance" IS NULL AND NOT "notify_minor_update")
  OR ("supersedes_publication_id" IS NOT NULL AND "change_significance" IS NOT NULL)
),
ADD CONSTRAINT "acc_publication_no_self_supersede_check" CHECK (
  "supersedes_publication_id" IS NULL OR "supersedes_publication_id" <> "id"
);
