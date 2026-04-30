-- CreateEnum
CREATE TYPE "behavior_record_type" AS ENUM ('POSITIVE', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "behavior_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "behavior_record_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "behavior_point_ledger_entry_type" AS ENUM ('AWARD', 'PENALTY', 'REVERSAL');

-- CreateTable
CREATE TABLE "behavior_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT,
    "name_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "type" "behavior_record_type" NOT NULL,
    "default_severity" "behavior_severity" NOT NULL DEFAULT 'LOW',
    "default_points" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "behavior_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "category_id" UUID,
    "type" "behavior_record_type" NOT NULL,
    "severity" "behavior_severity" NOT NULL DEFAULT 'LOW',
    "status" "behavior_record_status" NOT NULL DEFAULT 'DRAFT',
    "title_en" TEXT,
    "title_ar" TEXT,
    "note_en" TEXT,
    "note_ar" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" UUID,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "review_note_en" TEXT,
    "review_note_ar" TEXT,
    "cancellation_reason_en" TEXT,
    "cancellation_reason_ar" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "behavior_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_point_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "record_id" UUID NOT NULL,
    "category_id" UUID,
    "entry_type" "behavior_point_ledger_entry_type" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason_en" TEXT,
    "reason_ar" TEXT,
    "actor_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "behavior_point_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "behavior_categories_school_id_idx" ON "behavior_categories"("school_id");

-- CreateIndex
CREATE INDEX "behavior_categories_school_id_type_idx" ON "behavior_categories"("school_id", "type");

-- CreateIndex
CREATE INDEX "behavior_categories_school_id_is_active_idx" ON "behavior_categories"("school_id", "is_active");

-- CreateIndex
CREATE INDEX "behavior_categories_school_id_sort_order_idx" ON "behavior_categories"("school_id", "sort_order");

-- CreateIndex
CREATE INDEX "behavior_categories_created_by_id_idx" ON "behavior_categories"("created_by_id");

-- CreateIndex
CREATE INDEX "behavior_categories_deleted_at_idx" ON "behavior_categories"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_categories_school_id_code_key" ON "behavior_categories"("school_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_categories_id_school_id_key" ON "behavior_categories"("id", "school_id");

-- CreateIndex
CREATE INDEX "behavior_records_school_id_idx" ON "behavior_records"("school_id");

-- CreateIndex
CREATE INDEX "behavior_records_academic_year_id_idx" ON "behavior_records"("academic_year_id");

-- CreateIndex
CREATE INDEX "behavior_records_term_id_idx" ON "behavior_records"("term_id");

-- CreateIndex
CREATE INDEX "behavior_records_student_id_idx" ON "behavior_records"("student_id");

-- CreateIndex
CREATE INDEX "behavior_records_enrollment_id_idx" ON "behavior_records"("enrollment_id");

-- CreateIndex
CREATE INDEX "behavior_records_category_id_idx" ON "behavior_records"("category_id");

-- CreateIndex
CREATE INDEX "behavior_records_created_by_id_idx" ON "behavior_records"("created_by_id");

-- CreateIndex
CREATE INDEX "behavior_records_submitted_by_id_idx" ON "behavior_records"("submitted_by_id");

-- CreateIndex
CREATE INDEX "behavior_records_reviewed_by_id_idx" ON "behavior_records"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "behavior_records_cancelled_by_id_idx" ON "behavior_records"("cancelled_by_id");

-- CreateIndex
CREATE INDEX "behavior_records_school_id_academic_year_id_term_id_idx" ON "behavior_records"("school_id", "academic_year_id", "term_id");

-- CreateIndex
CREATE INDEX "behavior_records_school_id_student_id_status_idx" ON "behavior_records"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "behavior_records_school_id_type_status_idx" ON "behavior_records"("school_id", "type", "status");

-- CreateIndex
CREATE INDEX "behavior_records_school_id_occurred_at_idx" ON "behavior_records"("school_id", "occurred_at");

-- CreateIndex
CREATE INDEX "behavior_records_school_id_status_occurred_at_idx" ON "behavior_records"("school_id", "status", "occurred_at");

-- CreateIndex
CREATE INDEX "behavior_records_deleted_at_idx" ON "behavior_records"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_records_id_school_id_key" ON "behavior_records"("id", "school_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_school_id_idx" ON "behavior_point_ledger"("school_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_academic_year_id_idx" ON "behavior_point_ledger"("academic_year_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_term_id_idx" ON "behavior_point_ledger"("term_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_student_id_idx" ON "behavior_point_ledger"("student_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_enrollment_id_idx" ON "behavior_point_ledger"("enrollment_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_record_id_idx" ON "behavior_point_ledger"("record_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_category_id_idx" ON "behavior_point_ledger"("category_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_actor_id_idx" ON "behavior_point_ledger"("actor_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_school_id_student_id_occurred_at_idx" ON "behavior_point_ledger"("school_id", "student_id", "occurred_at");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_school_id_academic_year_id_term_id_st_idx" ON "behavior_point_ledger"("school_id", "academic_year_id", "term_id", "student_id");

-- CreateIndex
CREATE INDEX "behavior_point_ledger_school_id_entry_type_idx" ON "behavior_point_ledger"("school_id", "entry_type");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_point_ledger_id_school_id_key" ON "behavior_point_ledger"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_point_ledger_one_effective_entry_per_record" ON "behavior_point_ledger"("school_id", "record_id") WHERE "entry_type" IN ('AWARD', 'PENALTY');

-- AddForeignKey
ALTER TABLE "behavior_categories" ADD CONSTRAINT "behavior_categories_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_categories" ADD CONSTRAINT "behavior_categories_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_category_id_school_id_fkey" FOREIGN KEY ("category_id", "school_id") REFERENCES "behavior_categories"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_record_id_school_id_fkey" FOREIGN KEY ("record_id", "school_id") REFERENCES "behavior_records"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_category_id_school_id_fkey" FOREIGN KEY ("category_id", "school_id") REFERENCES "behavior_categories"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_point_ledger" ADD CONSTRAINT "behavior_point_ledger_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
