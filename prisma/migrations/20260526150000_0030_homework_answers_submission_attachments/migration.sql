-- CreateTable
CREATE TABLE "homework_submission_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_submission_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "homework_target_id" UUID NOT NULL,
    "homework_question_id" UUID NOT NULL,
    "text_answer" TEXT,
    "selected_option_ids" JSONB,
    "is_draft" BOOLEAN NOT NULL DEFAULT true,
    "teacher_comment" TEXT,
    "awarded_points" DECIMAL(7,2),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submission_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_submission_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_submission_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "homework_target_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submission_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "homework_submission_answers_id_school_id_key" ON "homework_submission_answers"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "hw_submission_answers_current_unique" ON "homework_submission_answers"("homework_submission_id", "homework_question_id") WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "homework_submission_answers_school_id_idx" ON "homework_submission_answers"("school_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_school_id_homework_submission_id_idx" ON "homework_submission_answers"("school_id", "homework_submission_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_school_id_homework_assignment_id_idx" ON "homework_submission_answers"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_school_id_homework_target_id_idx" ON "homework_submission_answers"("school_id", "homework_target_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_school_id_homework_question_id_idx" ON "homework_submission_answers"("school_id", "homework_question_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_reviewed_by_user_id_idx" ON "homework_submission_answers"("reviewed_by_user_id");

-- CreateIndex
CREATE INDEX "homework_submission_answers_deleted_at_idx" ON "homework_submission_answers"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submission_attachments_id_school_id_key" ON "homework_submission_attachments"("id", "school_id");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_school_id_idx" ON "homework_submission_attachments"("school_id");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_school_id_homework_submission_id_idx" ON "homework_submission_attachments"("school_id", "homework_submission_id");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_school_id_homework_assignment_id_idx" ON "homework_submission_attachments"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_school_id_homework_target_id_idx" ON "homework_submission_attachments"("school_id", "homework_target_id");

-- CreateIndex
CREATE INDEX "hw_submission_attach_school_submission_sort_idx" ON "homework_submission_attachments"("school_id", "homework_submission_id", "sort_order");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_file_id_idx" ON "homework_submission_attachments"("file_id");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_created_by_user_id_idx" ON "homework_submission_attachments"("created_by_user_id");

-- CreateIndex
CREATE INDEX "homework_submission_attachments_deleted_at_idx" ON "homework_submission_attachments"("deleted_at");

-- AddForeignKey
ALTER TABLE "homework_submission_answers" ADD CONSTRAINT "homework_submission_answers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_answers" ADD CONSTRAINT "homework_submission_answers_homework_submission_id_school_id_fkey" FOREIGN KEY ("homework_submission_id", "school_id") REFERENCES "homework_submissions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_answers" ADD CONSTRAINT "homework_submission_answers_homework_assignment_id_school_id_fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_answers" ADD CONSTRAINT "homework_submission_answers_homework_target_id_school_id_fkey" FOREIGN KEY ("homework_target_id", "school_id") REFERENCES "homework_targets"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_answers" ADD CONSTRAINT "homework_submission_answers_homework_question_id_school_id_fkey" FOREIGN KEY ("homework_question_id", "school_id") REFERENCES "homework_questions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_answers" ADD CONSTRAINT "homework_submission_answers_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_submission_attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_submission_attachments_homework_submission_id_school_id_fkey" FOREIGN KEY ("homework_submission_id", "school_id") REFERENCES "homework_submissions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_submission_attachments_homework_assignment_id_school_id_fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_submission_attachments_homework_target_id_school_id_fkey" FOREIGN KEY ("homework_target_id", "school_id") REFERENCES "homework_targets"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_submission_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_submission_attachments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
