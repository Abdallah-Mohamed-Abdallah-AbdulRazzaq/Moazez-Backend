BEGIN;
-- CreateEnum
CREATE TYPE "result_bulk_format" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "result_export_mode" AS ENUM ('EDIT_DRAFT', 'READ_PUBLISHED');

-- CreateEnum
CREATE TYPE "result_export_status" AS ENUM ('QUEUED', 'GENERATING', 'READY', 'FAILED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "result_configuration_preview_kind" ADD VALUE 'EXPORT';

-- CreateTable
CREATE TABLE "result_exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "reporting_period_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "actor_context" JSONB NOT NULL,
    "request" JSONB NOT NULL,
    "selection_digest" CHAR(64) NOT NULL,
    "summary" JSONB NOT NULL,
    "format" "result_bulk_format" NOT NULL,
    "mode" "result_export_mode" NOT NULL,
    "status" "result_export_status" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_token" UUID,
    "lease_until" TIMESTAMPTZ(3),
    "failure_code" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "reuse_until" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "result_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_export_files" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "export_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "filename" VARCHAR(180) NOT NULL,
    "media_type" VARCHAR(140) NOT NULL,
    "bucket" VARCHAR(255) NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "manifest" JSONB,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_export_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "result_exports_school_id_creator_id_id_idx" ON "result_exports"("school_id", "creator_id", "id");

-- CreateIndex
CREATE INDEX "result_exports_reporting_period_id_school_id_idx" ON "result_exports"("reporting_period_id", "school_id");

-- CreateIndex
CREATE INDEX "result_exports_status_lease_until_idx" ON "result_exports"("status", "lease_until");

-- CreateIndex
CREATE INDEX "result_exports_expires_at_idx" ON "result_exports"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "result_exports_id_school_id_key" ON "result_exports"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_export_files_object_key_key" ON "result_export_files"("object_key");

-- CreateIndex
CREATE INDEX "result_export_files_school_id_export_id_idx" ON "result_export_files"("school_id", "export_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_export_files_id_school_id_key" ON "result_export_files"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_export_files_export_id_position_key" ON "result_export_files"("export_id", "position");

-- AddForeignKey
ALTER TABLE "result_exports" ADD CONSTRAINT "result_exports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_exports" ADD CONSTRAINT "result_exports_reporting_period_id_school_id_fkey" FOREIGN KEY ("reporting_period_id", "school_id") REFERENCES "result_reporting_periods"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_exports" ADD CONSTRAINT "result_exports_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_export_files" ADD CONSTRAINT "result_export_files_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_export_files" ADD CONSTRAINT "result_export_files_export_id_school_id_fkey" FOREIGN KEY ("export_id", "school_id") REFERENCES "result_exports"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.result_exports
  ADD CONSTRAINT result_export_lease_consistent CHECK (
    (status = 'GENERATING' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status <> 'GENERATING' AND lease_token IS NULL AND lease_until IS NULL)
  ),
  ADD CONSTRAINT result_export_valid_lifetime CHECK (created_at < reuse_until AND reuse_until <= expires_at),
  ADD CONSTRAINT result_export_positive_attempts CHECK (attempts >= 0);

ALTER TABLE public.result_export_files
  ADD CONSTRAINT result_export_file_metadata CHECK (position >= 0 AND size_bytes > 0 AND checksum ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT result_export_file_manifest CHECK (
    (media_type = 'application/zip' AND manifest IS NULL) OR
    (media_type <> 'application/zip' AND manifest IS NOT NULL)
  );
COMMIT;
