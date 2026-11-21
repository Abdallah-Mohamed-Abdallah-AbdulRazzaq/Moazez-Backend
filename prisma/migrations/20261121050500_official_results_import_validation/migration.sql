BEGIN;
-- CreateEnum
CREATE TYPE "result_import_status" AS ENUM ('UPLOADED', 'VALIDATING', 'CORRECTIONS_REQUIRED', 'READY_TO_CONFIRM', 'NO_CHANGES', 'APPLYING', 'APPLIED', 'PARTIALLY_APPLIED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "result_import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "export_id" UUID NOT NULL,
    "actor_context" JSONB NOT NULL,
    "status" "result_import_status" NOT NULL DEFAULT 'UPLOADED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "source_version" INTEGER NOT NULL DEFAULT 1,
    "options" JSONB NOT NULL,
    "corrections" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_token" UUID,
    "lease_until" TIMESTAMPTZ(3),
    "failure_code" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "result_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_import_sources" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "format" "result_bulk_format" NOT NULL,
    "bucket" VARCHAR(255) NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "options" JSONB NOT NULL,
    "stored_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "result_import_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_import_reviews" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "source_version" INTEGER NOT NULL,
    "digest" CHAR(64) NOT NULL,
    "binding" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "units" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "issues" JSONB NOT NULL,
    "corrections" JSONB NOT NULL,
    "status" "result_import_status" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "result_import_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "result_import_batches_school_id_creator_id_id_idx" ON "result_import_batches"("school_id", "creator_id", "id");

-- CreateIndex
CREATE INDEX "result_import_batches_export_id_school_id_idx" ON "result_import_batches"("export_id", "school_id");

-- CreateIndex
CREATE INDEX "result_import_batches_status_lease_until_idx" ON "result_import_batches"("status", "lease_until");

-- CreateIndex
CREATE INDEX "result_import_batches_expires_at_idx" ON "result_import_batches"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "result_import_batches_id_school_id_key" ON "result_import_batches"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_import_sources_object_key_key" ON "result_import_sources"("object_key");

-- CreateIndex
CREATE INDEX "result_import_sources_school_id_batch_id_idx" ON "result_import_sources"("school_id", "batch_id");

-- CreateIndex
CREATE INDEX "result_import_sources_expires_at_deleted_at_idx" ON "result_import_sources"("expires_at", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "result_import_sources_batch_id_school_id_version_key" ON "result_import_sources"("batch_id", "school_id", "version");

-- CreateIndex
CREATE INDEX "result_import_reviews_batch_id_school_id_source_version_idx" ON "result_import_reviews"("batch_id", "school_id", "source_version");

-- CreateIndex
CREATE UNIQUE INDEX "result_import_reviews_id_school_id_key" ON "result_import_reviews"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_import_reviews_batch_id_school_id_revision_key" ON "result_import_reviews"("batch_id", "school_id", "revision");

-- AddForeignKey
ALTER TABLE "result_import_batches" ADD CONSTRAINT "result_import_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_import_batches" ADD CONSTRAINT "result_import_batches_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_import_batches" ADD CONSTRAINT "result_import_batches_export_id_school_id_fkey" FOREIGN KEY ("export_id", "school_id") REFERENCES "result_exports"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_import_sources" ADD CONSTRAINT "result_import_sources_batch_id_school_id_fkey" FOREIGN KEY ("batch_id", "school_id") REFERENCES "result_import_batches"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_import_reviews" ADD CONSTRAINT "result_import_reviews_batch_id_school_id_fkey" FOREIGN KEY ("batch_id", "school_id") REFERENCES "result_import_batches"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_import_reviews" ADD CONSTRAINT "result_import_reviews_batch_id_school_id_source_version_fkey" FOREIGN KEY ("batch_id", "school_id", "source_version") REFERENCES "result_import_sources"("batch_id", "school_id", "version") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.result_import_batches
  ADD CONSTRAINT result_import_batch_revision_check CHECK (revision > 0 AND source_version > 0 AND attempts >= 0),
  ADD CONSTRAINT result_import_batch_lease_check CHECK (
    (status = 'VALIDATING' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status <> 'VALIDATING' AND lease_token IS NULL AND lease_until IS NULL)
  );

ALTER TABLE public.result_import_sources
  ADD CONSTRAINT result_import_source_size_and_hash_check CHECK (version > 0 AND size_bytes BETWEEN 1 AND 20971520 AND checksum ~ '^[0-9a-f]{64}$');

ALTER TABLE public.result_import_reviews
  ADD CONSTRAINT result_import_review_status_check CHECK (
    revision > 0 AND source_version > 0 AND digest ~ '^[0-9a-f]{64}$'
    AND status IN ('CORRECTIONS_REQUIRED', 'READY_TO_CONFIRM', 'NO_CHANGES')
  );

CREATE TRIGGER result_import_review_immutable
  BEFORE UPDATE OR DELETE ON public.result_import_reviews
  FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();

CREATE TRIGGER result_import_source_delete_guard
  BEFORE DELETE ON public.result_import_sources
  FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();

CREATE TRIGGER result_import_source_payload_immutable
  BEFORE UPDATE ON public.result_import_sources
  FOR EACH ROW WHEN (
    (to_jsonb(OLD) - ARRAY['stored_at', 'deleted_at']) IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['stored_at', 'deleted_at'])
    OR (OLD.stored_at IS NOT NULL AND NEW.stored_at IS DISTINCT FROM OLD.stored_at)
    OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
  )
  EXECUTE FUNCTION public.official_results_preserve_version();
COMMIT;
