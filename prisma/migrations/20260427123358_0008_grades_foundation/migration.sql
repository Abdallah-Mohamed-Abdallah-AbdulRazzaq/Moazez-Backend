-- CreateEnum
CREATE TYPE "grade_scope_type" AS ENUM ('SCHOOL', 'STAGE', 'GRADE', 'SECTION', 'CLASSROOM');

-- CreateEnum
CREATE TYPE "grade_assessment_type" AS ENUM ('QUIZ', 'MONTH_EXAM', 'MIDTERM', 'TERM_EXAM', 'ASSIGNMENT', 'FINAL', 'PRACTICAL');

-- CreateEnum
CREATE TYPE "grade_assessment_delivery_mode" AS ENUM ('SCORE_ONLY', 'QUESTION_BASED');

-- CreateEnum
CREATE TYPE "grade_assessment_approval_status" AS ENUM ('DRAFT', 'PUBLISHED', 'APPROVED');

-- CreateEnum
CREATE TYPE "grade_item_status" AS ENUM ('ENTERED', 'MISSING', 'ABSENT');

-- CreateEnum
CREATE TYPE "grade_rule_scale" AS ENUM ('PERCENTAGE');

-- CreateEnum
CREATE TYPE "grade_rounding_mode" AS ENUM ('NONE', 'DECIMAL_0', 'DECIMAL_1', 'DECIMAL_2');

-- CreateTable
CREATE TABLE "grade_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "scope_type" "grade_scope_type" NOT NULL,
    "scope_key" UUID NOT NULL,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "title_en" TEXT,
    "title_ar" TEXT,
    "type" "grade_assessment_type" NOT NULL,
    "delivery_mode" "grade_assessment_delivery_mode" NOT NULL DEFAULT 'SCORE_ONLY',
    "date" DATE NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "max_score" DECIMAL(7,2) NOT NULL,
    "expected_time_minutes" INTEGER,
    "approval_status" "grade_assessment_approval_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "locked_at" TIMESTAMP(3),
    "locked_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grade_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "score" DECIMAL(7,2),
    "status" "grade_item_status" NOT NULL DEFAULT 'MISSING',
    "comment" TEXT,
    "entered_by_id" UUID,
    "entered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "scope_type" "grade_scope_type" NOT NULL,
    "scope_key" UUID NOT NULL,
    "grade_id" UUID,
    "grading_scale" "grade_rule_scale" NOT NULL DEFAULT 'PERCENTAGE',
    "pass_mark" DECIMAL(5,2) NOT NULL,
    "rounding" "grade_rounding_mode" NOT NULL DEFAULT 'DECIMAL_2',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grade_assessments_school_id_idx" ON "grade_assessments"("school_id");

-- CreateIndex
CREATE INDEX "grade_assessments_academic_year_id_idx" ON "grade_assessments"("academic_year_id");

-- CreateIndex
CREATE INDEX "grade_assessments_term_id_idx" ON "grade_assessments"("term_id");

-- CreateIndex
CREATE INDEX "grade_assessments_subject_id_idx" ON "grade_assessments"("subject_id");

-- CreateIndex
CREATE INDEX "grade_assessments_stage_id_idx" ON "grade_assessments"("stage_id");

-- CreateIndex
CREATE INDEX "grade_assessments_grade_id_idx" ON "grade_assessments"("grade_id");

-- CreateIndex
CREATE INDEX "grade_assessments_section_id_idx" ON "grade_assessments"("section_id");

-- CreateIndex
CREATE INDEX "grade_assessments_classroom_id_idx" ON "grade_assessments"("classroom_id");

-- CreateIndex
CREATE INDEX "grade_assessments_published_by_id_idx" ON "grade_assessments"("published_by_id");

-- CreateIndex
CREATE INDEX "grade_assessments_approved_by_id_idx" ON "grade_assessments"("approved_by_id");

-- CreateIndex
CREATE INDEX "grade_assessments_locked_by_id_idx" ON "grade_assessments"("locked_by_id");

-- CreateIndex
CREATE INDEX "grade_assessments_created_by_id_idx" ON "grade_assessments"("created_by_id");

-- CreateIndex
CREATE INDEX "grade_assessments_scope_type_scope_key_idx" ON "grade_assessments"("scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "grade_assessments_school_id_academic_year_id_term_id_idx" ON "grade_assessments"("school_id", "academic_year_id", "term_id");

-- CreateIndex
CREATE INDEX "grade_assessments_school_id_term_id_subject_id_idx" ON "grade_assessments"("school_id", "term_id", "subject_id");

-- CreateIndex
CREATE INDEX "grade_assessments_school_id_term_id_scope_type_scope_key_idx" ON "grade_assessments"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "grade_assessments_school_id_term_id_approval_status_idx" ON "grade_assessments"("school_id", "term_id", "approval_status");

-- CreateIndex
CREATE INDEX "grade_assessments_school_id_deleted_at_idx" ON "grade_assessments"("school_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "grade_assessments_id_school_id_unique" ON "grade_assessments"("id", "school_id");

-- CreateIndex
CREATE INDEX "grade_items_school_id_idx" ON "grade_items"("school_id");

-- CreateIndex
CREATE INDEX "grade_items_term_id_idx" ON "grade_items"("term_id");

-- CreateIndex
CREATE INDEX "grade_items_assessment_id_idx" ON "grade_items"("assessment_id");

-- CreateIndex
CREATE INDEX "grade_items_student_id_idx" ON "grade_items"("student_id");

-- CreateIndex
CREATE INDEX "grade_items_enrollment_id_idx" ON "grade_items"("enrollment_id");

-- CreateIndex
CREATE INDEX "grade_items_entered_by_id_idx" ON "grade_items"("entered_by_id");

-- CreateIndex
CREATE INDEX "grade_items_school_id_term_id_student_id_idx" ON "grade_items"("school_id", "term_id", "student_id");

-- CreateIndex
CREATE INDEX "grade_items_school_id_assessment_id_status_idx" ON "grade_items"("school_id", "assessment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "grade_items_school_id_assessment_id_student_id_key" ON "grade_items"("school_id", "assessment_id", "student_id");

-- CreateIndex
CREATE INDEX "grade_rules_school_id_idx" ON "grade_rules"("school_id");

-- CreateIndex
CREATE INDEX "grade_rules_academic_year_id_idx" ON "grade_rules"("academic_year_id");

-- CreateIndex
CREATE INDEX "grade_rules_term_id_idx" ON "grade_rules"("term_id");

-- CreateIndex
CREATE INDEX "grade_rules_scope_type_scope_key_idx" ON "grade_rules"("scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "grade_rules_school_id_academic_year_id_term_id_idx" ON "grade_rules"("school_id", "academic_year_id", "term_id");

-- CreateIndex
CREATE INDEX "grade_rules_school_id_term_id_scope_type_scope_key_idx" ON "grade_rules"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "grade_rules_grade_id_idx" ON "grade_rules"("grade_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_rules_school_id_academic_year_id_term_id_scope_type_s_key" ON "grade_rules"("school_id", "academic_year_id", "term_id", "scope_type", "scope_key");

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_locked_by_id_fkey" FOREIGN KEY ("locked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessments" ADD CONSTRAINT "grade_assessments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_assessment_id_school_id_fkey" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_entered_by_id_fkey" FOREIGN KEY ("entered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_rules" ADD CONSTRAINT "grade_rules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_rules" ADD CONSTRAINT "grade_rules_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_rules" ADD CONSTRAINT "grade_rules_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_rules" ADD CONSTRAINT "grade_rules_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
