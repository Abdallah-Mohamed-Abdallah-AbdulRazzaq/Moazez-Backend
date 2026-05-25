-- CreateEnum
CREATE TYPE "curriculum_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "curricula" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "curriculum_status" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "estimated_lessons" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_lessons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "objectives" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "estimated_minutes" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "curricula_id_school_id_key" ON "curricula"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "curricula_one_non_deleted_scope_key" ON "curricula"("school_id", "academic_year_id", "term_id", "grade_id", "subject_id") WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "curricula_school_id_idx" ON "curricula"("school_id");

-- CreateIndex
CREATE INDEX "curricula_school_id_academic_year_id_idx" ON "curricula"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "curricula_school_id_term_id_idx" ON "curricula"("school_id", "term_id");

-- CreateIndex
CREATE INDEX "curricula_school_id_grade_id_idx" ON "curricula"("school_id", "grade_id");

-- CreateIndex
CREATE INDEX "curricula_school_id_subject_id_idx" ON "curricula"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "curricula_school_id_status_idx" ON "curricula"("school_id", "status");

-- CreateIndex
CREATE INDEX "curricula_school_id_academic_scope_idx" ON "curricula"("school_id", "academic_year_id", "term_id", "grade_id", "subject_id");

-- CreateIndex
CREATE INDEX "curricula_created_by_user_id_idx" ON "curricula"("created_by_user_id");

-- CreateIndex
CREATE INDEX "curricula_updated_by_user_id_idx" ON "curricula"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "curricula_deleted_at_idx" ON "curricula"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_units_id_school_id_key" ON "curriculum_units"("id", "school_id");

-- CreateIndex
CREATE INDEX "curriculum_units_school_id_idx" ON "curriculum_units"("school_id");

-- CreateIndex
CREATE INDEX "curriculum_units_school_id_curriculum_id_idx" ON "curriculum_units"("school_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "curriculum_units_school_id_curriculum_id_sort_order_idx" ON "curriculum_units"("school_id", "curriculum_id", "sort_order");

-- CreateIndex
CREATE INDEX "curriculum_units_deleted_at_idx" ON "curriculum_units"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_lessons_id_school_id_key" ON "curriculum_lessons"("id", "school_id");

-- CreateIndex
CREATE INDEX "curriculum_lessons_school_id_idx" ON "curriculum_lessons"("school_id");

-- CreateIndex
CREATE INDEX "curriculum_lessons_school_id_curriculum_id_idx" ON "curriculum_lessons"("school_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "curriculum_lessons_school_id_unit_id_idx" ON "curriculum_lessons"("school_id", "unit_id");

-- CreateIndex
CREATE INDEX "curriculum_lessons_school_id_unit_id_sort_order_idx" ON "curriculum_lessons"("school_id", "unit_id", "sort_order");

-- CreateIndex
CREATE INDEX "curriculum_lessons_deleted_at_idx" ON "curriculum_lessons"("deleted_at");

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_units" ADD CONSTRAINT "curriculum_units_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_units" ADD CONSTRAINT "curriculum_units_curriculum_id_school_id_fkey" FOREIGN KEY ("curriculum_id", "school_id") REFERENCES "curricula"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_lessons" ADD CONSTRAINT "curriculum_lessons_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_lessons" ADD CONSTRAINT "curriculum_lessons_curriculum_id_school_id_fkey" FOREIGN KEY ("curriculum_id", "school_id") REFERENCES "curricula"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_lessons" ADD CONSTRAINT "curriculum_lessons_unit_id_school_id_fkey" FOREIGN KEY ("unit_id", "school_id") REFERENCES "curriculum_units"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
