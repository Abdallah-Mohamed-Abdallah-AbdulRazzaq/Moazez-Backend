-- CreateEnum
CREATE TYPE "lesson_content_item_type" AS ENUM ('TEXT', 'FILE', 'VIDEO_LINK', 'EXTERNAL_LINK');

-- CreateTable
CREATE TABLE "lesson_content_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "type" "lesson_content_item_type" NOT NULL,
    "title" TEXT NOT NULL,
    "body_text" TEXT,
    "url" TEXT,
    "file_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "estimated_minutes" INTEGER,
    "metadata" JSONB,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_content_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_content_items_id_school_id_key" ON "lesson_content_items"("id", "school_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_id_idx" ON "lesson_content_items"("school_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_id_curriculum_id_idx" ON "lesson_content_items"("school_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_id_unit_id_idx" ON "lesson_content_items"("school_id", "unit_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_id_lesson_id_idx" ON "lesson_content_items"("school_id", "lesson_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_id_lesson_id_sort_order_idx" ON "lesson_content_items"("school_id", "lesson_id", "sort_order");

-- CreateIndex
CREATE INDEX "lesson_content_items_school_id_type_idx" ON "lesson_content_items"("school_id", "type");

-- CreateIndex
CREATE INDEX "lesson_content_items_file_id_idx" ON "lesson_content_items"("file_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_created_by_user_id_idx" ON "lesson_content_items"("created_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_updated_by_user_id_idx" ON "lesson_content_items"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_content_items_deleted_at_idx" ON "lesson_content_items"("deleted_at");

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_curriculum_id_school_id_fkey" FOREIGN KEY ("curriculum_id", "school_id") REFERENCES "curricula"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_unit_id_school_id_fkey" FOREIGN KEY ("unit_id", "school_id") REFERENCES "curriculum_units"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_lesson_id_school_id_fkey" FOREIGN KEY ("lesson_id", "school_id") REFERENCES "curriculum_lessons"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_content_items" ADD CONSTRAINT "lesson_content_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
