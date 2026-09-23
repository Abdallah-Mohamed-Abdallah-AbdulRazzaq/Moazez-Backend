-- ACC-2 has no authorized backfill. Existing content requires an explicit
-- migration decision; fail closed instead of fabricating context or audience.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "academic_contents") THEN
    RAISE EXCEPTION 'ACC-2 migration requires an empty academic_contents table; no automatic backfill is authorized';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "academic_content_audience_type" AS ENUM ('INTERNAL_STAFF', 'STUDENTS', 'GUARDIANS', 'STUDENTS_AND_GUARDIANS');

-- CreateEnum
CREATE TYPE "academic_content_target_scope_type" AS ENUM ('SCHOOL', 'STAGE', 'GRADE', 'SECTION', 'CLASSROOM');

-- AlterTable
ALTER TABLE "academic_contents" ADD COLUMN     "academic_year_id" UUID NOT NULL,
ADD COLUMN     "audience" "academic_content_audience_type" NOT NULL,
ADD COLUMN     "term_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "academic_content_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "scope_type" "academic_content_target_scope_type" NOT NULL,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "subject_id" UUID,
    "teacher_subject_allocation_id" UUID,
    "identity_fingerprint" VARCHAR(64) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_content_targets_school_id_academic_content_id_idx" ON "academic_content_targets"("school_id", "academic_content_id");

-- CreateIndex
CREATE INDEX "academic_content_targets_school_id_scope_type_idx" ON "academic_content_targets"("school_id", "scope_type");

-- CreateIndex
CREATE INDEX "academic_content_targets_stage_id_idx" ON "academic_content_targets"("stage_id");

-- CreateIndex
CREATE INDEX "academic_content_targets_grade_id_idx" ON "academic_content_targets"("grade_id");

-- CreateIndex
CREATE INDEX "academic_content_targets_section_id_idx" ON "academic_content_targets"("section_id");

-- CreateIndex
CREATE INDEX "academic_content_targets_classroom_id_idx" ON "academic_content_targets"("classroom_id");

-- CreateIndex
CREATE INDEX "academic_content_targets_subject_id_idx" ON "academic_content_targets"("subject_id");

-- CreateIndex
CREATE INDEX "academic_content_targets_teacher_subject_allocation_id_idx" ON "academic_content_targets"("teacher_subject_allocation_id");

-- CreateIndex
CREATE INDEX "academic_content_targets_created_by_user_id_idx" ON "academic_content_targets"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_targets_school_id_academic_content_id_iden_key" ON "academic_content_targets"("school_id", "academic_content_id", "identity_fingerprint");

-- CreateIndex
CREATE INDEX "academic_contents_school_id_academic_year_id_term_id_idx" ON "academic_contents"("school_id", "academic_year_id", "term_id");

-- CreateIndex
CREATE INDEX "academic_contents_school_id_audience_idx" ON "academic_contents"("school_id", "audience");

-- AddForeignKey
ALTER TABLE "academic_contents" ADD CONSTRAINT "academic_contents_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_contents" ADD CONSTRAINT "academic_contents_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_targets" ADD CONSTRAINT "academic_content_targets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_targets" ADD CONSTRAINT "academic_content_targets_academic_content_id_school_id_fkey" FOREIGN KEY ("academic_content_id", "school_id") REFERENCES "academic_contents"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_targets" ADD CONSTRAINT "academic_content_targets_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_targets" ADD CONSTRAINT "academic_content_targets_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_targets" ADD CONSTRAINT "academic_content_targets_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_targets" ADD CONSTRAINT "academic_content_targets_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_targets" ADD CONSTRAINT "academic_content_targets_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_targets" ADD CONSTRAINT "academic_content_targets_teacher_subject_allocation_id_sch_fkey" FOREIGN KEY ("teacher_subject_allocation_id", "school_id") REFERENCES "teacher_subject_allocations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_targets" ADD CONSTRAINT "academic_content_targets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot represent these cross-field domain invariants.
ALTER TABLE "academic_contents" ADD CONSTRAINT "academic_contents_type_audience_check"
CHECK (
  ("type" = 'TEACHER_PREPARATION' AND "audience" = 'INTERNAL_STAFF') OR
  ("type" = 'WEEKLY_PLAN' AND "audience" IN ('STUDENTS', 'GUARDIANS', 'STUDENTS_AND_GUARDIANS')) OR
  ("type" = 'GUARDIAN_WEEKLY_NOTE' AND "audience" = 'GUARDIANS') OR
  ("type" = 'SUBJECT_RESOURCE' AND "audience" IN ('STUDENTS', 'GUARDIANS', 'STUDENTS_AND_GUARDIANS')) OR
  ("type" = 'ONLINE_SESSION' AND "audience" IN ('STUDENTS', 'STUDENTS_AND_GUARDIANS')) OR
  ("type" = 'GENERAL_RESOURCE')
);

ALTER TABLE "academic_content_targets" ADD CONSTRAINT "academic_content_targets_scope_shape_check"
CHECK (
  ("scope_type" = 'SCHOOL' AND "stage_id" IS NULL AND "grade_id" IS NULL AND "section_id" IS NULL AND "classroom_id" IS NULL) OR
  ("scope_type" = 'STAGE' AND "stage_id" IS NOT NULL AND "grade_id" IS NULL AND "section_id" IS NULL AND "classroom_id" IS NULL) OR
  ("scope_type" = 'GRADE' AND "stage_id" IS NULL AND "grade_id" IS NOT NULL AND "section_id" IS NULL AND "classroom_id" IS NULL) OR
  ("scope_type" = 'SECTION' AND "stage_id" IS NULL AND "grade_id" IS NULL AND "section_id" IS NOT NULL AND "classroom_id" IS NULL) OR
  ("scope_type" = 'CLASSROOM' AND "stage_id" IS NULL AND "grade_id" IS NULL AND "section_id" IS NULL AND "classroom_id" IS NOT NULL)
);

ALTER TABLE "academic_content_targets" ADD CONSTRAINT "academic_content_targets_teacher_allocation_shape_check"
CHECK (
  "teacher_subject_allocation_id" IS NULL OR
  ("scope_type" = 'CLASSROOM' AND "classroom_id" IS NOT NULL AND "subject_id" IS NOT NULL)
);
