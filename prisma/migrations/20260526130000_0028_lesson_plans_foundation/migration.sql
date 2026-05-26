-- CreateEnum
CREATE TYPE "lesson_plan_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "lesson_plan_item_status" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'RESCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "teacher_subject_allocation_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "lesson_plan_status" NOT NULL DEFAULT 'DRAFT',
    "week_start_date" DATE NOT NULL,
    "week_end_date" DATE NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "activated_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plan_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "lesson_plan_id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "timetable_entry_id" UUID,
    "planned_date" DATE,
    "day_of_week" INTEGER,
    "period_id" UUID,
    "period_label" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "lesson_plan_item_status" NOT NULL DEFAULT 'PLANNED',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "rescheduled_from_item_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_plans_id_school_id_key" ON "lesson_plans"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_plans_school_allocation_week_active_key" ON "lesson_plans"("school_id", "teacher_subject_allocation_id", "week_start_date") WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_idx" ON "lesson_plans"("school_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_academic_year_id_idx" ON "lesson_plans"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_term_id_idx" ON "lesson_plans"("school_id", "term_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_teacher_subject_allocation_id_idx" ON "lesson_plans"("school_id", "teacher_subject_allocation_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_teacher_user_id_idx" ON "lesson_plans"("school_id", "teacher_user_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_classroom_id_idx" ON "lesson_plans"("school_id", "classroom_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_subject_id_idx" ON "lesson_plans"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_curriculum_id_idx" ON "lesson_plans"("school_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_status_idx" ON "lesson_plans"("school_id", "status");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_week_start_date_idx" ON "lesson_plans"("school_id", "week_start_date");

-- CreateIndex
CREATE INDEX "lesson_plans_created_by_user_id_idx" ON "lesson_plans"("created_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_plans_updated_by_user_id_idx" ON "lesson_plans"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_plans_deleted_at_idx" ON "lesson_plans"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_plan_items_id_school_id_key" ON "lesson_plan_items"("id", "school_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_idx" ON "lesson_plan_items"("school_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_lesson_plan_id_idx" ON "lesson_plan_items"("school_id", "lesson_plan_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_curriculum_id_idx" ON "lesson_plan_items"("school_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_unit_id_idx" ON "lesson_plan_items"("school_id", "unit_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_lesson_id_idx" ON "lesson_plan_items"("school_id", "lesson_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_timetable_entry_id_idx" ON "lesson_plan_items"("school_id", "timetable_entry_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_planned_date_idx" ON "lesson_plan_items"("school_id", "planned_date");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_status_idx" ON "lesson_plan_items"("school_id", "status");

-- CreateIndex
CREATE INDEX "lesson_plan_items_school_id_lesson_plan_id_sort_order_idx" ON "lesson_plan_items"("school_id", "lesson_plan_id", "sort_order");

-- CreateIndex
CREATE INDEX "lesson_plan_items_created_by_user_id_idx" ON "lesson_plan_items"("created_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_updated_by_user_id_idx" ON "lesson_plan_items"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_rescheduled_from_item_id_idx" ON "lesson_plan_items"("rescheduled_from_item_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_deleted_at_idx" ON "lesson_plan_items"("deleted_at");

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_teacher_subject_allocation_id_school_id_fkey" FOREIGN KEY ("teacher_subject_allocation_id", "school_id") REFERENCES "teacher_subject_allocations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_curriculum_id_school_id_fkey" FOREIGN KEY ("curriculum_id", "school_id") REFERENCES "curricula"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_lesson_plan_id_school_id_fkey" FOREIGN KEY ("lesson_plan_id", "school_id") REFERENCES "lesson_plans"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_curriculum_id_school_id_fkey" FOREIGN KEY ("curriculum_id", "school_id") REFERENCES "curricula"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_unit_id_school_id_fkey" FOREIGN KEY ("unit_id", "school_id") REFERENCES "curriculum_units"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_lesson_id_school_id_fkey" FOREIGN KEY ("lesson_id", "school_id") REFERENCES "curriculum_lessons"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_timetable_entry_id_school_id_fkey" FOREIGN KEY ("timetable_entry_id", "school_id") REFERENCES "timetable_entries"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_rescheduled_from_item_id_school_id_fkey" FOREIGN KEY ("rescheduled_from_item_id", "school_id") REFERENCES "lesson_plan_items"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
