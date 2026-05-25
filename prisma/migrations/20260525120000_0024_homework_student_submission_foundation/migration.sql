-- CreateEnum
CREATE TYPE "homework_submission_status" AS ENUM ('DRAFT', 'SUBMITTED', 'LATE');

-- CreateTable
CREATE TABLE "homework_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "homework_target_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "homework_submission_status" NOT NULL DEFAULT 'DRAFT',
    "body_text" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_id_school_id_key" ON "homework_submissions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_school_homework_target_key" ON "homework_submissions"("school_id", "homework_target_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_idx" ON "homework_submissions"("school_id");

-- CreateIndex
CREATE INDEX "homework_submissions_homework_assignment_id_idx" ON "homework_submissions"("homework_assignment_id");

-- CreateIndex
CREATE INDEX "homework_submissions_homework_target_id_idx" ON "homework_submissions"("homework_target_id");

-- CreateIndex
CREATE INDEX "homework_submissions_student_id_idx" ON "homework_submissions"("student_id");

-- CreateIndex
CREATE INDEX "homework_submissions_enrollment_id_idx" ON "homework_submissions"("enrollment_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_homework_assignment_id_idx" ON "homework_submissions"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_homework_target_id_idx" ON "homework_submissions"("school_id", "homework_target_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_student_id_idx" ON "homework_submissions"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_enrollment_id_idx" ON "homework_submissions"("school_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_status_idx" ON "homework_submissions"("school_id", "status");

-- CreateIndex
CREATE INDEX "homework_submissions_school_assignment_status_idx" ON "homework_submissions"("school_id", "homework_assignment_id", "status");

-- CreateIndex
CREATE INDEX "homework_submissions_school_student_status_idx" ON "homework_submissions"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_submitted_at_idx" ON "homework_submissions"("school_id", "submitted_at");

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_assignment_id_school_id_fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_target_id_school_id_fkey" FOREIGN KEY ("homework_target_id", "school_id") REFERENCES "homework_targets"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
