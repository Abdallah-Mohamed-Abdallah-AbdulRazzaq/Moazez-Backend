-- CreateEnum
CREATE TYPE "grade_question_type" AS ENUM ('MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY', 'FILL_IN_BLANK', 'MATCHING', 'MEDIA');

-- CreateEnum
CREATE TYPE "grade_submission_status" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "grade_answer_correction_status" AS ENUM ('PENDING', 'CORRECTED');

-- CreateTable
CREATE TABLE "grade_assessment_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "type" "grade_question_type" NOT NULL,
    "prompt" TEXT NOT NULL,
    "prompt_ar" TEXT,
    "explanation" TEXT,
    "explanation_ar" TEXT,
    "points" DECIMAL(8,2) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "answer_key" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grade_assessment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_assessment_question_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "label_ar" TEXT,
    "value" TEXT,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grade_assessment_question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "grade_submission_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "corrected_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "total_score" DECIMAL(8,2),
    "max_score" DECIMAL(8,2),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_submission_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "answer_text" TEXT,
    "answer_json" JSONB,
    "correction_status" "grade_answer_correction_status" NOT NULL DEFAULT 'PENDING',
    "awarded_points" DECIMAL(8,2),
    "max_points" DECIMAL(8,2),
    "reviewer_comment" TEXT,
    "reviewer_comment_ar" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_submission_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_submission_answer_options" (
    "school_id" UUID NOT NULL,
    "answer_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_submission_answer_options_pkey" PRIMARY KEY ("answer_id","option_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grade_assessment_questions_id_school_id_key" ON "grade_assessment_questions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_questions_school_assessment_sort_order_key" ON "grade_assessment_questions"("school_id", "assessment_id", "sort_order");

-- CreateIndex
CREATE INDEX "grade_assessment_questions_school_id_idx" ON "grade_assessment_questions"("school_id");

-- CreateIndex
CREATE INDEX "grade_assessment_questions_assessment_id_idx" ON "grade_assessment_questions"("assessment_id");

-- CreateIndex
CREATE INDEX "grade_questions_school_assessment_deleted_at_idx" ON "grade_assessment_questions"("school_id", "assessment_id", "deleted_at");

-- CreateIndex
CREATE INDEX "grade_assessment_questions_school_id_type_idx" ON "grade_assessment_questions"("school_id", "type");

-- CreateIndex
CREATE INDEX "grade_assessment_questions_deleted_at_idx" ON "grade_assessment_questions"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "grade_question_options_id_school_id_key" ON "grade_assessment_question_options"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_question_options_school_question_sort_order_key" ON "grade_assessment_question_options"("school_id", "question_id", "sort_order");

-- CreateIndex
CREATE INDEX "grade_assessment_question_options_school_id_idx" ON "grade_assessment_question_options"("school_id");

-- CreateIndex
CREATE INDEX "grade_assessment_question_options_assessment_id_idx" ON "grade_assessment_question_options"("assessment_id");

-- CreateIndex
CREATE INDEX "grade_assessment_question_options_question_id_idx" ON "grade_assessment_question_options"("question_id");

-- CreateIndex
CREATE INDEX "grade_question_options_school_question_deleted_at_idx" ON "grade_assessment_question_options"("school_id", "question_id", "deleted_at");

-- CreateIndex
CREATE INDEX "grade_assessment_question_options_deleted_at_idx" ON "grade_assessment_question_options"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "grade_submissions_id_school_id_key" ON "grade_submissions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_submissions_school_id_assessment_id_student_id_key" ON "grade_submissions"("school_id", "assessment_id", "student_id");

-- CreateIndex
CREATE INDEX "grade_submissions_school_id_idx" ON "grade_submissions"("school_id");

-- CreateIndex
CREATE INDEX "grade_submissions_assessment_id_idx" ON "grade_submissions"("assessment_id");

-- CreateIndex
CREATE INDEX "grade_submissions_term_id_idx" ON "grade_submissions"("term_id");

-- CreateIndex
CREATE INDEX "grade_submissions_student_id_idx" ON "grade_submissions"("student_id");

-- CreateIndex
CREATE INDEX "grade_submissions_enrollment_id_idx" ON "grade_submissions"("enrollment_id");

-- CreateIndex
CREATE INDEX "grade_submissions_reviewed_by_id_idx" ON "grade_submissions"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "grade_submissions_school_id_assessment_id_status_idx" ON "grade_submissions"("school_id", "assessment_id", "status");

-- CreateIndex
CREATE INDEX "grade_submissions_school_id_term_id_student_id_idx" ON "grade_submissions"("school_id", "term_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_submission_answers_id_school_id_key" ON "grade_submission_answers"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_submission_answers_school_submission_question_key" ON "grade_submission_answers"("school_id", "submission_id", "question_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_school_id_idx" ON "grade_submission_answers"("school_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_submission_id_idx" ON "grade_submission_answers"("submission_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_assessment_id_idx" ON "grade_submission_answers"("assessment_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_question_id_idx" ON "grade_submission_answers"("question_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_student_id_idx" ON "grade_submission_answers"("student_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_reviewed_by_id_idx" ON "grade_submission_answers"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_school_assessment_student_idx" ON "grade_submission_answers"("school_id", "assessment_id", "student_id");

-- CreateIndex
CREATE INDEX "grade_submission_answers_school_correction_status_idx" ON "grade_submission_answers"("school_id", "correction_status");

-- CreateIndex
CREATE INDEX "grade_submission_answer_options_school_id_idx" ON "grade_submission_answer_options"("school_id");

-- CreateIndex
CREATE INDEX "grade_submission_answer_options_answer_id_idx" ON "grade_submission_answer_options"("answer_id");

-- CreateIndex
CREATE INDEX "grade_submission_answer_options_option_id_idx" ON "grade_submission_answer_options"("option_id");

-- AddForeignKey
ALTER TABLE "grade_assessment_questions" ADD CONSTRAINT "grade_questions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessment_questions" ADD CONSTRAINT "grade_questions_assessment_id_school_id_fkey" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_options" ADD CONSTRAINT "grade_question_options_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_options" ADD CONSTRAINT "grade_question_options_assessment_id_school_id_fkey" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_options" ADD CONSTRAINT "grade_question_options_question_id_school_id_fkey" FOREIGN KEY ("question_id", "school_id") REFERENCES "grade_assessment_questions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_assessment_id_school_id_fkey" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submissions" ADD CONSTRAINT "grade_submissions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answers" ADD CONSTRAINT "grade_answers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answers" ADD CONSTRAINT "grade_answers_submission_id_school_id_fkey" FOREIGN KEY ("submission_id", "school_id") REFERENCES "grade_submissions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answers" ADD CONSTRAINT "grade_answers_assessment_id_school_id_fkey" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answers" ADD CONSTRAINT "grade_answers_question_id_school_id_fkey" FOREIGN KEY ("question_id", "school_id") REFERENCES "grade_assessment_questions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answers" ADD CONSTRAINT "grade_answers_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answers" ADD CONSTRAINT "grade_answers_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answer_options" ADD CONSTRAINT "grade_answer_options_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answer_options" ADD CONSTRAINT "grade_answer_options_answer_id_school_id_fkey" FOREIGN KEY ("answer_id", "school_id") REFERENCES "grade_submission_answers"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_submission_answer_options" ADD CONSTRAINT "grade_answer_options_option_id_school_id_fkey" FOREIGN KEY ("option_id", "school_id") REFERENCES "grade_assessment_question_options"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
