-- CreateEnum
CREATE TYPE "student_bulk_registration_batch_status" AS ENUM ('UPLOADED', 'VALIDATING', 'VALIDATION_FAILED', 'READY', 'EXECUTING', 'EXECUTION_PARTIAL_FAILED', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "student_bulk_registration_row_status" AS ENUM ('PENDING', 'VALID', 'INVALID', 'PROCESSING', 'CREATED', 'FAILED');

-- CreateTable
CREATE TABLE "student_bulk_registration_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source_import_job_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID,
    "classroom_id" UUID NOT NULL,
    "enrollment_date" DATE NOT NULL,
    "template_version" INTEGER NOT NULL DEFAULT 1,
    "status" "student_bulk_registration_batch_status" NOT NULL DEFAULT 'UPLOADED',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "created_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "validated_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "student_bulk_registration_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_bulk_registration_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "normalized_data_json" JSONB NOT NULL,
    "row_hash" TEXT NOT NULL,
    "status" "student_bulk_registration_row_status" NOT NULL DEFAULT 'PENDING',
    "errors_json" JSONB,
    "student_id" UUID,
    "user_id" UUID,
    "enrollment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_bulk_registration_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_bulk_batches_school_status_created_idx" ON "student_bulk_registration_batches"("school_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "student_bulk_batches_school_year_classroom_idx" ON "student_bulk_registration_batches"("school_id", "academic_year_id", "classroom_id");

-- CreateIndex
CREATE INDEX "student_bulk_batches_organization_idx" ON "student_bulk_registration_batches"("organization_id");

-- CreateIndex
CREATE INDEX "student_bulk_batches_term_idx" ON "student_bulk_registration_batches"("term_id");

-- CreateIndex
CREATE INDEX "student_bulk_batches_classroom_idx" ON "student_bulk_registration_batches"("classroom_id");

-- CreateIndex
CREATE INDEX "student_bulk_batches_created_by_idx" ON "student_bulk_registration_batches"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_bulk_batches_id_school_key" ON "student_bulk_registration_batches"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_bulk_batches_source_import_job_key" ON "student_bulk_registration_batches"("source_import_job_id", "school_id");

-- CreateIndex
CREATE INDEX "student_bulk_rows_school_batch_status_idx" ON "student_bulk_registration_rows"("school_id", "batch_id", "status");

-- CreateIndex
CREATE INDEX "student_bulk_rows_batch_hash_idx" ON "student_bulk_registration_rows"("batch_id", "row_hash");

-- CreateIndex
CREATE INDEX "student_bulk_rows_student_idx" ON "student_bulk_registration_rows"("student_id");

-- CreateIndex
CREATE INDEX "student_bulk_rows_user_idx" ON "student_bulk_registration_rows"("user_id");

-- CreateIndex
CREATE INDEX "student_bulk_rows_enrollment_idx" ON "student_bulk_registration_rows"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_bulk_rows_batch_row_number_key" ON "student_bulk_registration_rows"("batch_id", "row_number");

-- CreateIndex
CREATE UNIQUE INDEX "import_jobs_id_school_id_key" ON "import_jobs"("id", "school_id");

-- AddForeignKey
ALTER TABLE "student_bulk_registration_batches" ADD CONSTRAINT "student_bulk_registration_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_bulk_registration_batches" ADD CONSTRAINT "student_bulk_registration_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_bulk_registration_batches" ADD CONSTRAINT "student_bulk_registration_batches_source_import_job_id_sch_fkey" FOREIGN KEY ("source_import_job_id", "school_id") REFERENCES "import_jobs"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_bulk_registration_batches" ADD CONSTRAINT "student_bulk_registration_batches_academic_year_id_school__fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_bulk_registration_batches" ADD CONSTRAINT "student_bulk_registration_batches_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_bulk_registration_batches" ADD CONSTRAINT "student_bulk_registration_batches_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_bulk_registration_batches" ADD CONSTRAINT "student_bulk_registration_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_bulk_registration_rows" ADD CONSTRAINT "student_bulk_registration_rows_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_bulk_registration_rows" ADD CONSTRAINT "student_bulk_registration_rows_batch_id_school_id_fkey" FOREIGN KEY ("batch_id", "school_id") REFERENCES "student_bulk_registration_batches"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_bulk_registration_rows" ADD CONSTRAINT "student_bulk_registration_rows_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_bulk_registration_rows" ADD CONSTRAINT "student_bulk_registration_rows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_bulk_registration_rows" ADD CONSTRAINT "student_bulk_registration_rows_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
