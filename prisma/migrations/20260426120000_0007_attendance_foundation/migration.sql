-- CreateEnum
CREATE TYPE "attendance_scope_type" AS ENUM ('SCHOOL', 'STAGE', 'GRADE', 'SECTION', 'CLASSROOM');

-- CreateEnum
CREATE TYPE "attendance_mode" AS ENUM ('DAILY', 'PERIOD');

-- CreateEnum
CREATE TYPE "daily_computation_strategy" AS ENUM ('MANUAL', 'DERIVED_FROM_PERIODS');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'EARLY_LEAVE', 'UNMARKED');

-- CreateEnum
CREATE TYPE "attendance_session_status" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "attendance_excuse_type" AS ENUM ('ABSENCE', 'LATE', 'EARLY_LEAVE');

-- CreateEnum
CREATE TYPE "attendance_excuse_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "attendance_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "scope_type" "attendance_scope_type" NOT NULL,
    "scope_key" TEXT NOT NULL,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description_ar" TEXT,
    "description_en" TEXT,
    "notes" TEXT,
    "mode" "attendance_mode" NOT NULL,
    "daily_computation_strategy" "daily_computation_strategy" NOT NULL DEFAULT 'MANUAL',
    "require_excuse_attachment" BOOLEAN NOT NULL DEFAULT false,
    "allow_parent_excuse_requests" BOOLEAN NOT NULL DEFAULT true,
    "notify_guardians_on_absence" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATE,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "scope_type" "attendance_scope_type" NOT NULL,
    "scope_key" TEXT NOT NULL,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "mode" "attendance_mode" NOT NULL,
    "period_id" TEXT,
    "period_key" TEXT NOT NULL,
    "period_label_ar" TEXT,
    "period_label_en" TEXT,
    "policy_id" UUID,
    "status" "attendance_session_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "submitted_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "status" "attendance_status" NOT NULL DEFAULT 'UNMARKED',
    "late_minutes" INTEGER,
    "early_leave_minutes" INTEGER,
    "excuse_reason" TEXT,
    "note" TEXT,
    "marked_by_id" UUID,
    "marked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_excuse_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "attendance_excuse_type" NOT NULL,
    "status" "attendance_excuse_status" NOT NULL DEFAULT 'PENDING',
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "selected_period_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "late_minutes" INTEGER,
    "early_leave_minutes" INTEGER,
    "reason_ar" TEXT,
    "reason_en" TEXT,
    "decision_note" TEXT,
    "created_by_id" UUID,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "attendance_excuse_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_excuse_request_sessions" (
    "school_id" UUID NOT NULL,
    "attendance_excuse_request_id" UUID NOT NULL,
    "attendance_session_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_excuse_request_sessions_pkey" PRIMARY KEY ("attendance_excuse_request_id","attendance_session_id")
);

-- CreateIndex
CREATE INDEX "attendance_policies_school_id_idx" ON "attendance_policies"("school_id");

-- CreateIndex
CREATE INDEX "attendance_policies_academic_year_id_idx" ON "attendance_policies"("academic_year_id");

-- CreateIndex
CREATE INDEX "attendance_policies_term_id_idx" ON "attendance_policies"("term_id");

-- CreateIndex
CREATE INDEX "attendance_policies_stage_id_idx" ON "attendance_policies"("stage_id");

-- CreateIndex
CREATE INDEX "attendance_policies_grade_id_idx" ON "attendance_policies"("grade_id");

-- CreateIndex
CREATE INDEX "attendance_policies_section_id_idx" ON "attendance_policies"("section_id");

-- CreateIndex
CREATE INDEX "attendance_policies_classroom_id_idx" ON "attendance_policies"("classroom_id");

-- CreateIndex
CREATE INDEX "attendance_policies_school_id_academic_year_id_term_id_idx" ON "attendance_policies"("school_id", "academic_year_id", "term_id");

-- CreateIndex
CREATE INDEX "attendance_policies_school_id_term_id_scope_type_scope_key_idx" ON "attendance_policies"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "attendance_policies_school_id_is_active_deleted_at_idx" ON "attendance_policies"("school_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "attendance_policies_deleted_at_idx" ON "attendance_policies"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policies_id_school_id_key" ON "attendance_policies"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policies_scope_name_ar_key" ON "attendance_policies"("school_id", "academic_year_id", "term_id", "scope_type", "scope_key", "name_ar");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policies_scope_name_en_key" ON "attendance_policies"("school_id", "academic_year_id", "term_id", "scope_type", "scope_key", "name_en");

-- CreateIndex
CREATE INDEX "attendance_sessions_school_id_idx" ON "attendance_sessions"("school_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_academic_year_id_idx" ON "attendance_sessions"("academic_year_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_term_id_idx" ON "attendance_sessions"("term_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_date_idx" ON "attendance_sessions"("date");

-- CreateIndex
CREATE INDEX "attendance_sessions_status_idx" ON "attendance_sessions"("status");

-- CreateIndex
CREATE INDEX "attendance_sessions_stage_id_idx" ON "attendance_sessions"("stage_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_grade_id_idx" ON "attendance_sessions"("grade_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_section_id_idx" ON "attendance_sessions"("section_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_classroom_id_idx" ON "attendance_sessions"("classroom_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_policy_id_idx" ON "attendance_sessions"("policy_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_submitted_by_id_idx" ON "attendance_sessions"("submitted_by_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_school_id_term_id_date_idx" ON "attendance_sessions"("school_id", "term_id", "date");

-- CreateIndex
CREATE INDEX "attendance_sessions_school_id_term_id_status_idx" ON "attendance_sessions"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "attendance_sessions_school_id_term_id_scope_type_scope_key_idx" ON "attendance_sessions"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "attendance_sessions_deleted_at_idx" ON "attendance_sessions"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_id_school_id_key" ON "attendance_sessions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_school_id_academic_year_id_term_id_date_key" ON "attendance_sessions"("school_id", "academic_year_id", "term_id", "date", "scope_type", "scope_key", "mode", "period_key");

-- CreateIndex
CREATE INDEX "attendance_entries_school_id_idx" ON "attendance_entries"("school_id");

-- CreateIndex
CREATE INDEX "attendance_entries_session_id_idx" ON "attendance_entries"("session_id");

-- CreateIndex
CREATE INDEX "attendance_entries_student_id_idx" ON "attendance_entries"("student_id");

-- CreateIndex
CREATE INDEX "attendance_entries_enrollment_id_idx" ON "attendance_entries"("enrollment_id");

-- CreateIndex
CREATE INDEX "attendance_entries_status_idx" ON "attendance_entries"("status");

-- CreateIndex
CREATE INDEX "attendance_entries_marked_by_id_idx" ON "attendance_entries"("marked_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_entries_id_school_id_key" ON "attendance_entries"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_entries_school_id_session_id_student_id_key" ON "attendance_entries"("school_id", "session_id", "student_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_school_id_idx" ON "attendance_excuse_requests"("school_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_academic_year_id_idx" ON "attendance_excuse_requests"("academic_year_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_term_id_idx" ON "attendance_excuse_requests"("term_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_student_id_idx" ON "attendance_excuse_requests"("student_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_status_idx" ON "attendance_excuse_requests"("status");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_date_from_date_to_idx" ON "attendance_excuse_requests"("date_from", "date_to");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_created_by_id_idx" ON "attendance_excuse_requests"("created_by_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_decided_by_id_idx" ON "attendance_excuse_requests"("decided_by_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_deleted_at_idx" ON "attendance_excuse_requests"("deleted_at");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_school_id_term_id_status_idx" ON "attendance_excuse_requests"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_school_id_student_id_date_from_d_idx" ON "attendance_excuse_requests"("school_id", "student_id", "date_from", "date_to");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_excuse_requests_id_school_id_key" ON "attendance_excuse_requests"("id", "school_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_request_sessions_school_id_idx" ON "attendance_excuse_request_sessions"("school_id");

-- CreateIndex
CREATE INDEX "attendance_excuse_request_sessions_attendance_session_id_idx" ON "attendance_excuse_request_sessions"("attendance_session_id");

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_policy_id_school_id_fkey" FOREIGN KEY ("policy_id", "school_id") REFERENCES "attendance_policies"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_session_id_school_id_fkey" FOREIGN KEY ("session_id", "school_id") REFERENCES "attendance_sessions"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_marked_by_id_fkey" FOREIGN KEY ("marked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_request_sessions" ADD CONSTRAINT "attendance_excuse_request_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_request_sessions" ADD CONSTRAINT "attendance_excuse_request_sessions_attendance_excuse_reque_fkey" FOREIGN KEY ("attendance_excuse_request_id", "school_id") REFERENCES "attendance_excuse_requests"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_request_sessions" ADD CONSTRAINT "attendance_excuse_request_sessions_attendance_session_id_s_fkey" FOREIGN KEY ("attendance_session_id", "school_id") REFERENCES "attendance_sessions"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;
