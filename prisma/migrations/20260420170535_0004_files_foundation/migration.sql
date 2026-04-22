-- CreateEnum
CREATE TYPE "import_job_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "uploaded_file_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "import_job_status" NOT NULL DEFAULT 'PENDING',
    "report_json" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_file_id_idx" ON "attachments"("file_id");

-- CreateIndex
CREATE INDEX "attachments_school_id_idx" ON "attachments"("school_id");

-- CreateIndex
CREATE INDEX "attachments_school_id_resource_type_resource_id_idx" ON "attachments"("school_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "attachments_created_by_id_idx" ON "attachments"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_file_id_resource_type_resource_id_key" ON "attachments"("file_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "import_jobs_school_id_idx" ON "import_jobs"("school_id");

-- CreateIndex
CREATE INDEX "import_jobs_school_id_status_created_at_idx" ON "import_jobs"("school_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "import_jobs_school_id_type_idx" ON "import_jobs"("school_id", "type");

-- CreateIndex
CREATE INDEX "import_jobs_uploaded_file_id_idx" ON "import_jobs"("uploaded_file_id");

-- CreateIndex
CREATE INDEX "import_jobs_created_by_id_idx" ON "import_jobs"("created_by_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_uploaded_file_id_fkey" FOREIGN KEY ("uploaded_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
