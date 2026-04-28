-- CreateEnum
CREATE TYPE "reinforcement_source" AS ENUM ('TEACHER', 'PARENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "reinforcement_task_status" AS ENUM ('NOT_COMPLETED', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "reinforcement_target_scope" AS ENUM ('SCHOOL', 'STAGE', 'GRADE', 'SECTION', 'CLASSROOM', 'STUDENT');

-- CreateEnum
CREATE TYPE "reinforcement_proof_type" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'NONE');

-- CreateEnum
CREATE TYPE "reinforcement_reward_type" AS ENUM ('MORAL', 'FINANCIAL', 'XP', 'BADGE');

-- CreateEnum
CREATE TYPE "reinforcement_submission_status" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "reinforcement_review_outcome" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "xp_source_type" AS ENUM ('REINFORCEMENT_TASK', 'MANUAL_BONUS', 'BEHAVIOR', 'GRADE', 'ATTENDANCE', 'SYSTEM');

-- CreateTable
CREATE TABLE "reinforcement_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "subject_id" UUID,
    "title_en" TEXT,
    "title_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "source" "reinforcement_source" NOT NULL,
    "status" "reinforcement_task_status" NOT NULL DEFAULT 'NOT_COMPLETED',
    "reward_type" "reinforcement_reward_type",
    "reward_value" DECIMAL(10,2),
    "reward_label_en" TEXT,
    "reward_label_ar" TEXT,
    "due_date" TIMESTAMP(3),
    "assigned_by_id" UUID,
    "assigned_by_name" TEXT,
    "created_by_id" UUID,
    "cancelled_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reinforcement_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_task_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "scope_type" "reinforcement_target_scope" NOT NULL,
    "scope_key" TEXT NOT NULL,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "student_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reinforcement_task_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "reinforcement_task_status" NOT NULL DEFAULT 'NOT_COMPLETED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reinforcement_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_task_stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "title_en" TEXT,
    "title_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "proof_type" "reinforcement_proof_type" NOT NULL DEFAULT 'NONE',
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reinforcement_task_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "reinforcement_submission_status" NOT NULL DEFAULT 'PENDING',
    "proof_file_id" UUID,
    "proof_text" TEXT,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMP(3),
    "current_review_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reinforcement_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "reviewed_by_id" UUID NOT NULL,
    "outcome" "reinforcement_review_outcome" NOT NULL,
    "note" TEXT,
    "note_ar" TEXT,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reinforcement_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_task_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "term_id" UUID,
    "name_en" TEXT,
    "name_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "source" "reinforcement_source" NOT NULL DEFAULT 'TEACHER',
    "reward_type" "reinforcement_reward_type",
    "reward_value" DECIMAL(10,2),
    "reward_label_en" TEXT,
    "reward_label_ar" TEXT,
    "metadata" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reinforcement_task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_task_template_stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "title_en" TEXT,
    "title_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "proof_type" "reinforcement_proof_type" NOT NULL DEFAULT 'NONE',
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reinforcement_task_template_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "scope_type" "reinforcement_target_scope" NOT NULL DEFAULT 'SCHOOL',
    "scope_key" TEXT NOT NULL,
    "daily_cap" INTEGER,
    "weekly_cap" INTEGER,
    "cooldown_minutes" INTEGER,
    "allowed_reasons" JSONB,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "xp_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "assignment_id" UUID,
    "policy_id" UUID,
    "source_type" "xp_source_type" NOT NULL,
    "source_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "reason_ar" TEXT,
    "actor_user_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xp_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reinforcement_tasks_school_id_idx" ON "reinforcement_tasks"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_academic_year_id_idx" ON "reinforcement_tasks"("academic_year_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_term_id_idx" ON "reinforcement_tasks"("term_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_subject_id_idx" ON "reinforcement_tasks"("subject_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_assigned_by_id_idx" ON "reinforcement_tasks"("assigned_by_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_created_by_id_idx" ON "reinforcement_tasks"("created_by_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_cancelled_by_id_idx" ON "reinforcement_tasks"("cancelled_by_id");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_school_id_term_id_status_idx" ON "reinforcement_tasks"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_school_id_due_date_idx" ON "reinforcement_tasks"("school_id", "due_date");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_school_id_source_idx" ON "reinforcement_tasks"("school_id", "source");

-- CreateIndex
CREATE INDEX "reinforcement_tasks_deleted_at_idx" ON "reinforcement_tasks"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_tasks_id_school_id_key" ON "reinforcement_tasks"("id", "school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_school_id_idx" ON "reinforcement_task_targets"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_task_id_idx" ON "reinforcement_task_targets"("task_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_stage_id_idx" ON "reinforcement_task_targets"("stage_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_grade_id_idx" ON "reinforcement_task_targets"("grade_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_section_id_idx" ON "reinforcement_task_targets"("section_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_classroom_id_idx" ON "reinforcement_task_targets"("classroom_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_student_id_idx" ON "reinforcement_task_targets"("student_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_targets_school_id_scope_type_scope_key_idx" ON "reinforcement_task_targets"("school_id", "scope_type", "scope_key");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_targets_id_school_id_key" ON "reinforcement_task_targets"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_targets_school_id_task_id_scope_type_sco_key" ON "reinforcement_task_targets"("school_id", "task_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_school_id_idx" ON "reinforcement_assignments"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_task_id_idx" ON "reinforcement_assignments"("task_id");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_academic_year_id_idx" ON "reinforcement_assignments"("academic_year_id");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_term_id_idx" ON "reinforcement_assignments"("term_id");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_student_id_idx" ON "reinforcement_assignments"("student_id");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_enrollment_id_idx" ON "reinforcement_assignments"("enrollment_id");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_school_id_term_id_status_idx" ON "reinforcement_assignments"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "reinforcement_assignments_school_id_student_id_status_idx" ON "reinforcement_assignments"("school_id", "student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_assignments_id_school_id_key" ON "reinforcement_assignments"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_assignments_school_id_task_id_student_id_key" ON "reinforcement_assignments"("school_id", "task_id", "student_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_stages_school_id_idx" ON "reinforcement_task_stages"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_stages_task_id_idx" ON "reinforcement_task_stages"("task_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_stages_school_id_task_id_deleted_at_idx" ON "reinforcement_task_stages"("school_id", "task_id", "deleted_at");

-- CreateIndex
CREATE INDEX "reinforcement_task_stages_deleted_at_idx" ON "reinforcement_task_stages"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_stages_id_school_id_key" ON "reinforcement_task_stages"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_stages_school_id_task_id_sort_order_key" ON "reinforcement_task_stages"("school_id", "task_id", "sort_order");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_school_id_idx" ON "reinforcement_submissions"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_assignment_id_idx" ON "reinforcement_submissions"("assignment_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_task_id_idx" ON "reinforcement_submissions"("task_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_stage_id_idx" ON "reinforcement_submissions"("stage_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_student_id_idx" ON "reinforcement_submissions"("student_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_enrollment_id_idx" ON "reinforcement_submissions"("enrollment_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_proof_file_id_idx" ON "reinforcement_submissions"("proof_file_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_submitted_by_id_idx" ON "reinforcement_submissions"("submitted_by_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_current_review_id_idx" ON "reinforcement_submissions"("current_review_id");

-- CreateIndex
CREATE INDEX "reinforcement_submissions_school_id_status_idx" ON "reinforcement_submissions"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_submissions_id_school_id_key" ON "reinforcement_submissions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_submissions_school_id_assignment_id_stage_id_key" ON "reinforcement_submissions"("school_id", "assignment_id", "stage_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_school_id_idx" ON "reinforcement_reviews"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_submission_id_idx" ON "reinforcement_reviews"("submission_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_assignment_id_idx" ON "reinforcement_reviews"("assignment_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_task_id_idx" ON "reinforcement_reviews"("task_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_stage_id_idx" ON "reinforcement_reviews"("stage_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_student_id_idx" ON "reinforcement_reviews"("student_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_reviewed_by_id_idx" ON "reinforcement_reviews"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_school_id_reviewed_by_id_reviewed_at_idx" ON "reinforcement_reviews"("school_id", "reviewed_by_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "reinforcement_reviews_school_id_outcome_reviewed_at_idx" ON "reinforcement_reviews"("school_id", "outcome", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_reviews_id_school_id_key" ON "reinforcement_reviews"("id", "school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_templates_school_id_idx" ON "reinforcement_task_templates"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_templates_academic_year_id_idx" ON "reinforcement_task_templates"("academic_year_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_templates_term_id_idx" ON "reinforcement_task_templates"("term_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_templates_created_by_id_idx" ON "reinforcement_task_templates"("created_by_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_templates_deleted_at_idx" ON "reinforcement_task_templates"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_templates_id_school_id_key" ON "reinforcement_task_templates"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_templates_school_name_en_active_key" ON "reinforcement_task_templates"("school_id", "name_en") WHERE "name_en" IS NOT NULL AND "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "reinforcement_task_template_stages_school_id_idx" ON "reinforcement_task_template_stages"("school_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_template_stages_template_id_idx" ON "reinforcement_task_template_stages"("template_id");

-- CreateIndex
CREATE INDEX "reinforcement_task_template_stages_deleted_at_idx" ON "reinforcement_task_template_stages"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_template_stages_id_school_id_key" ON "reinforcement_task_template_stages"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_task_template_stages_school_id_template_id_so_key" ON "reinforcement_task_template_stages"("school_id", "template_id", "sort_order");

-- CreateIndex
CREATE INDEX "xp_policies_school_id_idx" ON "xp_policies"("school_id");

-- CreateIndex
CREATE INDEX "xp_policies_academic_year_id_idx" ON "xp_policies"("academic_year_id");

-- CreateIndex
CREATE INDEX "xp_policies_term_id_idx" ON "xp_policies"("term_id");

-- CreateIndex
CREATE INDEX "xp_policies_school_id_term_id_is_active_idx" ON "xp_policies"("school_id", "term_id", "is_active");

-- CreateIndex
CREATE INDEX "xp_policies_school_id_scope_type_scope_key_idx" ON "xp_policies"("school_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "xp_policies_deleted_at_idx" ON "xp_policies"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "xp_policies_id_school_id_key" ON "xp_policies"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "xp_policies_active_scope_key" ON "xp_policies"("school_id", "academic_year_id", "term_id", "scope_type", "scope_key") WHERE "deleted_at" IS NULL AND "is_active" = true;

-- CreateIndex
CREATE INDEX "xp_ledger_school_id_idx" ON "xp_ledger"("school_id");

-- CreateIndex
CREATE INDEX "xp_ledger_academic_year_id_idx" ON "xp_ledger"("academic_year_id");

-- CreateIndex
CREATE INDEX "xp_ledger_term_id_idx" ON "xp_ledger"("term_id");

-- CreateIndex
CREATE INDEX "xp_ledger_student_id_idx" ON "xp_ledger"("student_id");

-- CreateIndex
CREATE INDEX "xp_ledger_enrollment_id_idx" ON "xp_ledger"("enrollment_id");

-- CreateIndex
CREATE INDEX "xp_ledger_assignment_id_idx" ON "xp_ledger"("assignment_id");

-- CreateIndex
CREATE INDEX "xp_ledger_policy_id_idx" ON "xp_ledger"("policy_id");

-- CreateIndex
CREATE INDEX "xp_ledger_actor_user_id_idx" ON "xp_ledger"("actor_user_id");

-- CreateIndex
CREATE INDEX "xp_ledger_school_id_student_id_occurred_at_idx" ON "xp_ledger"("school_id", "student_id", "occurred_at");

-- CreateIndex
CREATE INDEX "xp_ledger_school_id_source_type_source_id_idx" ON "xp_ledger"("school_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "xp_ledger_id_school_id_key" ON "xp_ledger"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "xp_ledger_school_id_source_type_source_id_student_id_key" ON "xp_ledger"("school_id", "source_type", "source_id", "student_id");

-- RenameForeignKey
ALTER TABLE "grade_assessment_question_options" RENAME CONSTRAINT "grade_question_options_assessment_id_school_id_fkey" TO "grade_assessment_question_options_assessment_id_school_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_assessment_question_options" RENAME CONSTRAINT "grade_question_options_question_id_school_id_fkey" TO "grade_assessment_question_options_question_id_school_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_assessment_question_options" RENAME CONSTRAINT "grade_question_options_school_id_fkey" TO "grade_assessment_question_options_school_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_assessment_questions" RENAME CONSTRAINT "grade_questions_assessment_id_school_id_fkey" TO "grade_assessment_questions_assessment_id_school_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_assessment_questions" RENAME CONSTRAINT "grade_questions_school_id_fkey" TO "grade_assessment_questions_school_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_submission_answer_options" RENAME CONSTRAINT "grade_answer_options_answer_id_school_id_fkey" TO "grade_submission_answer_options_answer_id_school_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_submission_answer_options" RENAME CONSTRAINT "grade_answer_options_option_id_school_id_fkey" TO "grade_submission_answer_options_option_id_school_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_submission_answer_options" RENAME CONSTRAINT "grade_answer_options_school_id_fkey" TO "grade_submission_answer_options_school_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_submission_answers" RENAME CONSTRAINT "grade_answers_assessment_id_school_id_fkey" TO "grade_submission_answers_assessment_id_school_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_submission_answers" RENAME CONSTRAINT "grade_answers_question_id_school_id_fkey" TO "grade_submission_answers_question_id_school_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_submission_answers" RENAME CONSTRAINT "grade_answers_reviewed_by_id_fkey" TO "grade_submission_answers_reviewed_by_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_submission_answers" RENAME CONSTRAINT "grade_answers_school_id_fkey" TO "grade_submission_answers_school_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_submission_answers" RENAME CONSTRAINT "grade_answers_student_id_school_id_fkey" TO "grade_submission_answers_student_id_school_id_fkey";

-- RenameForeignKey
ALTER TABLE "grade_submission_answers" RENAME CONSTRAINT "grade_answers_submission_id_school_id_fkey" TO "grade_submission_answers_submission_id_school_id_fkey";

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_tasks" ADD CONSTRAINT "reinforcement_tasks_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_task_id_school_id_fkey" FOREIGN KEY ("task_id", "school_id") REFERENCES "reinforcement_tasks"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_targets" ADD CONSTRAINT "reinforcement_task_targets_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_assignments" ADD CONSTRAINT "reinforcement_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_assignments" ADD CONSTRAINT "reinforcement_assignments_task_id_school_id_fkey" FOREIGN KEY ("task_id", "school_id") REFERENCES "reinforcement_tasks"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_assignments" ADD CONSTRAINT "reinforcement_assignments_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_assignments" ADD CONSTRAINT "reinforcement_assignments_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_assignments" ADD CONSTRAINT "reinforcement_assignments_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_assignments" ADD CONSTRAINT "reinforcement_assignments_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_stages" ADD CONSTRAINT "reinforcement_task_stages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_stages" ADD CONSTRAINT "reinforcement_task_stages_task_id_school_id_fkey" FOREIGN KEY ("task_id", "school_id") REFERENCES "reinforcement_tasks"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_assignment_id_school_id_fkey" FOREIGN KEY ("assignment_id", "school_id") REFERENCES "reinforcement_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_task_id_school_id_fkey" FOREIGN KEY ("task_id", "school_id") REFERENCES "reinforcement_tasks"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "reinforcement_task_stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_proof_file_id_fkey" FOREIGN KEY ("proof_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_submissions" ADD CONSTRAINT "reinforcement_submissions_current_review_id_school_id_fkey" FOREIGN KEY ("current_review_id", "school_id") REFERENCES "reinforcement_reviews"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_submission_id_school_id_fkey" FOREIGN KEY ("submission_id", "school_id") REFERENCES "reinforcement_submissions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_assignment_id_school_id_fkey" FOREIGN KEY ("assignment_id", "school_id") REFERENCES "reinforcement_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_task_id_school_id_fkey" FOREIGN KEY ("task_id", "school_id") REFERENCES "reinforcement_tasks"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "reinforcement_task_stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reviews" ADD CONSTRAINT "reinforcement_reviews_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_templates" ADD CONSTRAINT "reinforcement_task_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_templates" ADD CONSTRAINT "reinforcement_task_templates_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_templates" ADD CONSTRAINT "reinforcement_task_templates_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_templates" ADD CONSTRAINT "reinforcement_task_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_template_stages" ADD CONSTRAINT "reinforcement_task_template_stages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_task_template_stages" ADD CONSTRAINT "reinforcement_task_template_stages_template_id_school_id_fkey" FOREIGN KEY ("template_id", "school_id") REFERENCES "reinforcement_task_templates"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_policies" ADD CONSTRAINT "xp_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_policies" ADD CONSTRAINT "xp_policies_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_policies" ADD CONSTRAINT "xp_policies_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_assignment_id_school_id_fkey" FOREIGN KEY ("assignment_id", "school_id") REFERENCES "reinforcement_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_policy_id_school_id_fkey" FOREIGN KEY ("policy_id", "school_id") REFERENCES "xp_policies"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "grade_question_options_id_school_id_key" RENAME TO "grade_assessment_question_options_id_school_id_key";

-- RenameIndex
ALTER INDEX "grade_question_options_school_question_deleted_at_idx" RENAME TO "grade_assessment_question_options_school_id_question_id_del_idx";

-- RenameIndex
ALTER INDEX "grade_question_options_school_question_sort_order_key" RENAME TO "grade_assessment_question_options_school_id_question_id_sor_key";

-- RenameIndex
ALTER INDEX "grade_questions_school_assessment_deleted_at_idx" RENAME TO "grade_assessment_questions_school_id_assessment_id_deleted__idx";

-- RenameIndex
ALTER INDEX "grade_questions_school_assessment_sort_order_key" RENAME TO "grade_assessment_questions_school_id_assessment_id_sort_ord_key";

-- RenameIndex
ALTER INDEX "grade_submission_answers_school_assessment_student_idx" RENAME TO "grade_submission_answers_school_id_assessment_id_student_id_idx";

-- RenameIndex
ALTER INDEX "grade_submission_answers_school_correction_status_idx" RENAME TO "grade_submission_answers_school_id_correction_status_idx";

-- RenameIndex
ALTER INDEX "grade_submission_answers_school_submission_question_key" RENAME TO "grade_submission_answers_school_id_submission_id_question_i_key";
