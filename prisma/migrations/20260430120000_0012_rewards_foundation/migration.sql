-- CreateEnum
CREATE TYPE "reward_catalog_item_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "reward_catalog_item_type" AS ENUM ('PHYSICAL', 'DIGITAL', 'PRIVILEGE', 'CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "reward_redemption_status" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "reward_redemption_request_source" AS ENUM ('DASHBOARD', 'TEACHER', 'STUDENT_APP', 'PARENT_APP', 'SYSTEM');

-- CreateTable
CREATE TABLE "reward_catalog_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "term_id" UUID,
    "title_en" TEXT,
    "title_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "type" "reward_catalog_item_type" NOT NULL DEFAULT 'OTHER',
    "status" "reward_catalog_item_status" NOT NULL DEFAULT 'DRAFT',
    "min_total_xp" INTEGER,
    "stock_quantity" INTEGER,
    "stock_remaining" INTEGER,
    "is_unlimited" BOOLEAN NOT NULL DEFAULT true,
    "image_file_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "archived_at" TIMESTAMP(3),
    "archived_by_id" UUID,
    "created_by_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reward_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_redemptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "catalog_item_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "academic_year_id" UUID,
    "term_id" UUID,
    "status" "reward_redemption_status" NOT NULL DEFAULT 'REQUESTED',
    "request_source" "reward_redemption_request_source" NOT NULL DEFAULT 'DASHBOARD',
    "requested_by_id" UUID,
    "reviewed_by_id" UUID,
    "fulfilled_by_id" UUID,
    "cancelled_by_id" UUID,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "request_note_en" TEXT,
    "request_note_ar" TEXT,
    "review_note_en" TEXT,
    "review_note_ar" TEXT,
    "fulfillment_note_en" TEXT,
    "fulfillment_note_ar" TEXT,
    "cancellation_reason_en" TEXT,
    "cancellation_reason_ar" TEXT,
    "eligibility_snapshot" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reward_catalog_items_school_id_idx" ON "reward_catalog_items"("school_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_academic_year_id_idx" ON "reward_catalog_items"("academic_year_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_term_id_idx" ON "reward_catalog_items"("term_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_image_file_id_idx" ON "reward_catalog_items"("image_file_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_published_by_id_idx" ON "reward_catalog_items"("published_by_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_archived_by_id_idx" ON "reward_catalog_items"("archived_by_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_created_by_id_idx" ON "reward_catalog_items"("created_by_id");

-- CreateIndex
CREATE INDEX "reward_catalog_items_school_id_status_idx" ON "reward_catalog_items"("school_id", "status");

-- CreateIndex
CREATE INDEX "reward_catalog_items_school_id_type_idx" ON "reward_catalog_items"("school_id", "type");

-- CreateIndex
CREATE INDEX "reward_catalog_items_school_year_term_status_idx" ON "reward_catalog_items"("school_id", "academic_year_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "reward_catalog_items_school_id_sort_order_idx" ON "reward_catalog_items"("school_id", "sort_order");

-- CreateIndex
CREATE INDEX "reward_catalog_items_deleted_at_idx" ON "reward_catalog_items"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reward_catalog_items_id_school_id_key" ON "reward_catalog_items"("id", "school_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_school_id_idx" ON "reward_redemptions"("school_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_catalog_item_id_idx" ON "reward_redemptions"("catalog_item_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_student_id_idx" ON "reward_redemptions"("student_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_enrollment_id_idx" ON "reward_redemptions"("enrollment_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_academic_year_id_idx" ON "reward_redemptions"("academic_year_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_term_id_idx" ON "reward_redemptions"("term_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_requested_by_id_idx" ON "reward_redemptions"("requested_by_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_reviewed_by_id_idx" ON "reward_redemptions"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_fulfilled_by_id_idx" ON "reward_redemptions"("fulfilled_by_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_cancelled_by_id_idx" ON "reward_redemptions"("cancelled_by_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_school_id_status_idx" ON "reward_redemptions"("school_id", "status");

-- CreateIndex
CREATE INDEX "reward_redemptions_school_catalog_item_status_idx" ON "reward_redemptions"("school_id", "catalog_item_id", "status");

-- CreateIndex
CREATE INDEX "reward_redemptions_school_student_status_idx" ON "reward_redemptions"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "reward_redemptions_school_year_term_status_idx" ON "reward_redemptions"("school_id", "academic_year_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "reward_redemptions_school_id_requested_at_idx" ON "reward_redemptions"("school_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "reward_redemptions_id_school_id_key" ON "reward_redemptions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_redemptions_one_open_per_student_item" ON "reward_redemptions"("school_id", "catalog_item_id", "student_id") WHERE "status" IN ('REQUESTED', 'APPROVED');

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_catalog_item_id_school_id_fkey" FOREIGN KEY ("catalog_item_id", "school_id") REFERENCES "reward_catalog_items"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_fulfilled_by_id_fkey" FOREIGN KEY ("fulfilled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
