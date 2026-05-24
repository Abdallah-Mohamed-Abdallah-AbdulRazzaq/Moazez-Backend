-- CreateEnum
CREATE TYPE "homework_assignment_mode" AS ENUM ('HOMEWORK', 'WORKSHEET', 'WRITING_TASK', 'QUIZ', 'READING', 'PROJECT');

-- CreateEnum
CREATE TYPE "homework_assignment_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "homework_target_mode" AS ENUM ('CLASSROOM', 'SELECTED_STUDENTS');

-- CreateEnum
CREATE TYPE "homework_target_status" AS ENUM ('ASSIGNED', 'VIEWED', 'SUBMITTED', 'LATE', 'MISSING', 'REVIEWED', 'EXCUSED');

-- CreateTable
CREATE TABLE "homework_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "teacher_subject_allocation_id" UUID NOT NULL,
    "timetable_entry_id" UUID,
    "schedule_date" DATE,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mode" "homework_assignment_mode" NOT NULL DEFAULT 'HOMEWORK',
    "status" "homework_assignment_status" NOT NULL DEFAULT 'DRAFT',
    "target_mode" "homework_target_mode" NOT NULL DEFAULT 'CLASSROOM',
    "publish_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "estimated_minutes" INTEGER,
    "total_marks" DECIMAL(7,2),
    "is_graded" BOOLEAN NOT NULL DEFAULT false,
    "grade_assessment_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "published_by_user_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "homework_target_status" NOT NULL DEFAULT 'ASSIGNED',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "excused_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "homework_assignments_id_school_id_key" ON "homework_assignments"("id", "school_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_idx" ON "homework_assignments"("school_id");

-- CreateIndex
CREATE INDEX "homework_assignments_academic_year_id_idx" ON "homework_assignments"("academic_year_id");

-- CreateIndex
CREATE INDEX "homework_assignments_term_id_idx" ON "homework_assignments"("term_id");

-- CreateIndex
CREATE INDEX "homework_assignments_classroom_id_idx" ON "homework_assignments"("classroom_id");

-- CreateIndex
CREATE INDEX "homework_assignments_subject_id_idx" ON "homework_assignments"("subject_id");

-- CreateIndex
CREATE INDEX "homework_assignments_teacher_user_id_idx" ON "homework_assignments"("teacher_user_id");

-- CreateIndex
CREATE INDEX "homework_assignments_teacher_subject_allocation_id_idx" ON "homework_assignments"("teacher_subject_allocation_id");

-- CreateIndex
CREATE INDEX "homework_assignments_timetable_entry_id_idx" ON "homework_assignments"("timetable_entry_id");

-- CreateIndex
CREATE INDEX "homework_assignments_grade_assessment_id_idx" ON "homework_assignments"("grade_assessment_id");

-- CreateIndex
CREATE INDEX "homework_assignments_created_by_user_id_idx" ON "homework_assignments"("created_by_user_id");

-- CreateIndex
CREATE INDEX "homework_assignments_published_by_user_id_idx" ON "homework_assignments"("published_by_user_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_academic_year_id_term_id_idx" ON "homework_assignments"("school_id", "academic_year_id", "term_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_classroom_id_term_id_idx" ON "homework_assignments"("school_id", "classroom_id", "term_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_teacher_user_id_term_id_idx" ON "homework_assignments"("school_id", "teacher_user_id", "term_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_teacher_subject_allocation_idx" ON "homework_assignments"("school_id", "teacher_subject_allocation_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_status_idx" ON "homework_assignments"("school_id", "status");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_due_at_idx" ON "homework_assignments"("school_id", "due_at");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_timetable_entry_id_idx" ON "homework_assignments"("school_id", "timetable_entry_id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_grade_assessment_id_idx" ON "homework_assignments"("school_id", "grade_assessment_id");

-- CreateIndex
CREATE INDEX "homework_assignments_deleted_at_idx" ON "homework_assignments"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "homework_targets_id_school_id_key" ON "homework_targets"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_targets_school_assignment_student_key" ON "homework_targets"("school_id", "homework_assignment_id", "student_id");

-- CreateIndex
CREATE INDEX "homework_targets_school_id_idx" ON "homework_targets"("school_id");

-- CreateIndex
CREATE INDEX "homework_targets_homework_assignment_id_idx" ON "homework_targets"("homework_assignment_id");

-- CreateIndex
CREATE INDEX "homework_targets_student_id_idx" ON "homework_targets"("student_id");

-- CreateIndex
CREATE INDEX "homework_targets_enrollment_id_idx" ON "homework_targets"("enrollment_id");

-- CreateIndex
CREATE INDEX "homework_targets_school_id_homework_assignment_id_idx" ON "homework_targets"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "homework_targets_school_id_student_id_idx" ON "homework_targets"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "homework_targets_school_id_enrollment_id_idx" ON "homework_targets"("school_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "homework_targets_school_id_status_idx" ON "homework_targets"("school_id", "status");

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_allocation_id_school_id_fkey" FOREIGN KEY ("teacher_subject_allocation_id", "school_id") REFERENCES "teacher_subject_allocations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_timetable_entry_id_school_id_fkey" FOREIGN KEY ("timetable_entry_id", "school_id") REFERENCES "timetable_entries"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_grade_assessment_id_school_id_fkey" FOREIGN KEY ("grade_assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_homework_assignment_id_school_id_fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
