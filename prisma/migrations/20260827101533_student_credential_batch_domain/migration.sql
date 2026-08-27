-- CreateEnum
CREATE TYPE "student_credential_audience_mode" AS ENUM ('IMPORT_BATCH', 'SELECTED_STUDENTS', 'ACADEMIC_YEAR', 'STAGE', 'GRADE', 'SECTION', 'CLASSROOM', 'MISSING_PASSWORD');

-- CreateEnum
CREATE TYPE "student_credential_mode" AS ENUM ('UNIQUE_GENERATED', 'SHARED_TEMPORARY');

-- CreateEnum
CREATE TYPE "student_credential_batch_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED');

-- CreateEnum
CREATE TYPE "student_credential_row_status" AS ENUM ('PENDING', 'PROCESSING', 'GENERATED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "student_credential_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "audience_mode" "student_credential_audience_mode" NOT NULL,
    "credential_mode" "student_credential_mode" NOT NULL,
    "source_registration_batch_id" UUID,
    "academic_year_id" UUID,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "secret_artifact_file_id" UUID,
    "secret_artifact_version" INTEGER,
    "secret_artifact_staged_at" TIMESTAMP(3),
    "secret_artifact_expires_at" TIMESTAMP(3),
    "status" "student_credential_batch_status" NOT NULL DEFAULT 'PENDING',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "generated_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "student_credential_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_credential_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "user_id" UUID,
    "status" "student_credential_row_status" NOT NULL DEFAULT 'PENDING',
    "errors_json" JSONB,
    "credential_version_before" INTEGER,
    "credential_version_after" INTEGER,
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_credential_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_credential_batches_secret_file_key" ON "student_credential_batches"("secret_artifact_file_id");

-- CreateIndex
CREATE INDEX "student_credential_batches_school_status_created_idx" ON "student_credential_batches"("school_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "student_credential_batches_school_audience_created_idx" ON "student_credential_batches"("school_id", "audience_mode", "created_at" DESC);

-- CreateIndex
CREATE INDEX "student_cred_batches_source_registration_idx" ON "student_credential_batches"("source_registration_batch_id");

-- CreateIndex
CREATE INDEX "student_cred_batches_academic_year_idx" ON "student_credential_batches"("academic_year_id");

-- CreateIndex
CREATE INDEX "student_cred_batches_stage_idx" ON "student_credential_batches"("stage_id");

-- CreateIndex
CREATE INDEX "student_cred_batches_grade_idx" ON "student_credential_batches"("grade_id");

-- CreateIndex
CREATE INDEX "student_cred_batches_section_idx" ON "student_credential_batches"("section_id");

-- CreateIndex
CREATE INDEX "student_cred_batches_classroom_idx" ON "student_credential_batches"("classroom_id");

-- CreateIndex
CREATE INDEX "student_cred_batches_created_by_idx" ON "student_credential_batches"("created_by_id");

-- CreateIndex
CREATE INDEX "student_cred_batches_organization_idx" ON "student_credential_batches"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_credential_batches_id_school_key" ON "student_credential_batches"("id", "school_id");

-- CreateIndex
CREATE INDEX "student_credential_rows_school_batch_status_idx" ON "student_credential_rows"("school_id", "batch_id", "status");

-- CreateIndex
CREATE INDEX "student_credential_rows_student_idx" ON "student_credential_rows"("student_id");

-- CreateIndex
CREATE INDEX "student_credential_rows_user_idx" ON "student_credential_rows"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_credential_rows_id_school_key" ON "student_credential_rows"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_credential_rows_batch_student_key" ON "student_credential_rows"("batch_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_credential_rows_batch_user_key" ON "student_credential_rows"("batch_id", "user_id");

-- AddForeignKey
ALTER TABLE "student_credential_batches" ADD CONSTRAINT "student_cred_batches_school_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_batches" ADD CONSTRAINT "student_cred_batches_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_batches" ADD CONSTRAINT "student_cred_batches_source_registration_fkey" FOREIGN KEY ("source_registration_batch_id", "school_id") REFERENCES "student_bulk_registration_batches"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_batches" ADD CONSTRAINT "student_cred_batches_academic_year_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_batches" ADD CONSTRAINT "student_cred_batches_stage_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_batches" ADD CONSTRAINT "student_cred_batches_grade_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_batches" ADD CONSTRAINT "student_cred_batches_section_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_batches" ADD CONSTRAINT "student_cred_batches_classroom_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_batches" ADD CONSTRAINT "student_cred_batches_created_by_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_batches" ADD CONSTRAINT "student_cred_batches_secret_file_fkey" FOREIGN KEY ("secret_artifact_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_rows" ADD CONSTRAINT "student_cred_rows_school_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_rows" ADD CONSTRAINT "student_cred_rows_batch_fkey" FOREIGN KEY ("batch_id", "school_id") REFERENCES "student_credential_batches"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_rows" ADD CONSTRAINT "student_cred_rows_student_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credential_rows" ADD CONSTRAINT "student_cred_rows_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

