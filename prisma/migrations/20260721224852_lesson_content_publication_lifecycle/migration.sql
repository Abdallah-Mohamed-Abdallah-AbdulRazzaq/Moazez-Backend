-- CreateEnum
CREATE TYPE "lesson_content_publication_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "lesson_content_items" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by_user_id" UUID,
ADD COLUMN     "publication_status" "lesson_content_publication_status",
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "published_by_user_id" UUID;

-- Preserve the current app-visible contract for every live legacy item.
UPDATE "lesson_content_items"
SET "publication_status" = 'PUBLISHED',
    "published_at" = "created_at",
    "published_by_user_id" = "created_by_user_id",
    "archived_at" = NULL,
    "archived_by_user_id" = NULL
WHERE "deleted_at" IS NULL;

-- Preserve soft-deleted history without inventing a migration actor.
UPDATE "lesson_content_items"
SET "publication_status" = 'ARCHIVED',
    "published_at" = NULL,
    "published_by_user_id" = NULL,
    "archived_at" = "deleted_at",
    "archived_by_user_id" = NULL
WHERE "deleted_at" IS NOT NULL;

ALTER TABLE "lesson_content_items"
ALTER COLUMN "publication_status" SET DEFAULT 'DRAFT',
ALTER COLUMN "publication_status" SET NOT NULL;

-- Prisma cannot represent lifecycle-dependent actor/timestamp pairs.
ALTER TABLE "lesson_content_items"
ADD CONSTRAINT "lesson_content_items_publication_state_check"
CHECK (
  (
    "publication_status" = 'DRAFT'
    AND "published_at" IS NULL
    AND "published_by_user_id" IS NULL
    AND "archived_at" IS NULL
    AND "archived_by_user_id" IS NULL
  )
  OR
  (
    "publication_status" = 'PUBLISHED'
    AND "deleted_at" IS NULL
    AND "published_at" IS NOT NULL
    AND "published_by_user_id" IS NOT NULL
    AND "archived_at" IS NULL
    AND "archived_by_user_id" IS NULL
  )
  OR
  (
    "publication_status" = 'ARCHIVED'
    AND "archived_at" IS NOT NULL
    AND (
      (
        "published_at" IS NULL
        AND "published_by_user_id" IS NULL
      )
      OR
      (
        "published_at" IS NOT NULL
        AND "published_by_user_id" IS NOT NULL
      )
    )
  )
);

-- CreateIndex
CREATE INDEX "lesson_content_items_published_by_user_id_idx" ON "lesson_content_items"("published_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_archived_by_user_id_idx" ON "lesson_content_items"("archived_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_publication_lesson_order_idx" ON "lesson_content_items"("school_id", "publication_status", "lesson_id", "sort_order");

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_archived_by_user_id_fkey" FOREIGN KEY ("archived_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
