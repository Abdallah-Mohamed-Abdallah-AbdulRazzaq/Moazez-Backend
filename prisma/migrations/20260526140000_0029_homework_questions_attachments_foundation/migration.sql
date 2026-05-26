-- CreateEnum
CREATE TYPE "homework_question_type" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE');

-- CreateTable
CREATE TABLE "homework_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "type" "homework_question_type" NOT NULL,
    "prompt" TEXT NOT NULL,
    "instructions" TEXT,
    "points" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "expected_answer" TEXT,
    "metadata" JSONB,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_question_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_question_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_assignment_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_assignment_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "homework_questions_id_school_id_key" ON "homework_questions"("id", "school_id");

-- CreateIndex
CREATE INDEX "homework_questions_school_id_idx" ON "homework_questions"("school_id");

-- CreateIndex
CREATE INDEX "hw_question_school_assignment_idx" ON "homework_questions"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "hw_question_school_assignment_sort_idx" ON "homework_questions"("school_id", "homework_assignment_id", "sort_order");

-- CreateIndex
CREATE INDEX "homework_questions_school_id_type_idx" ON "homework_questions"("school_id", "type");

-- CreateIndex
CREATE INDEX "homework_questions_created_by_user_id_idx" ON "homework_questions"("created_by_user_id");

-- CreateIndex
CREATE INDEX "homework_questions_updated_by_user_id_idx" ON "homework_questions"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "homework_questions_deleted_at_idx" ON "homework_questions"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "homework_question_options_id_school_id_key" ON "homework_question_options"("id", "school_id");

-- CreateIndex
CREATE INDEX "homework_question_options_school_id_idx" ON "homework_question_options"("school_id");

-- CreateIndex
CREATE INDEX "hw_option_school_question_idx" ON "homework_question_options"("school_id", "homework_question_id");

-- CreateIndex
CREATE INDEX "hw_option_school_question_sort_idx" ON "homework_question_options"("school_id", "homework_question_id", "sort_order");

-- CreateIndex
CREATE INDEX "homework_question_options_deleted_at_idx" ON "homework_question_options"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "homework_assignment_attachments_id_school_id_key" ON "homework_assignment_attachments"("id", "school_id");

-- CreateIndex
CREATE INDEX "homework_assignment_attachments_school_id_idx" ON "homework_assignment_attachments"("school_id");

-- CreateIndex
CREATE INDEX "hw_attach_school_assignment_idx" ON "homework_assignment_attachments"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "hw_attach_school_assignment_sort_idx" ON "homework_assignment_attachments"("school_id", "homework_assignment_id", "sort_order");

-- CreateIndex
CREATE INDEX "homework_assignment_attachments_file_id_idx" ON "homework_assignment_attachments"("file_id");

-- CreateIndex
CREATE INDEX "homework_assignment_attachments_created_by_user_id_idx" ON "homework_assignment_attachments"("created_by_user_id");

-- CreateIndex
CREATE INDEX "homework_assignment_attachments_deleted_at_idx" ON "homework_assignment_attachments"("deleted_at");

-- AddForeignKey
ALTER TABLE "homework_questions" ADD CONSTRAINT "homework_questions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_questions" ADD CONSTRAINT "homework_questions_homework_assignment_id_school_id_fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_questions" ADD CONSTRAINT "homework_questions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_questions" ADD CONSTRAINT "homework_questions_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_question_options" ADD CONSTRAINT "homework_question_options_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_question_options" ADD CONSTRAINT "homework_question_options_homework_question_id_school_id_fkey" FOREIGN KEY ("homework_question_id", "school_id") REFERENCES "homework_questions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignment_attachments" ADD CONSTRAINT "homework_assignment_attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignment_attachments" ADD CONSTRAINT "homework_assignment_attachments_homework_assignment_id_school_id_fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignment_attachments" ADD CONSTRAINT "homework_assignment_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignment_attachments" ADD CONSTRAINT "homework_assignment_attachments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
