BEGIN;
-- CreateEnum
CREATE TYPE "result_import_execution_status" AS ENUM ('QUEUED', 'APPLYING', 'APPLIED', 'PARTIALLY_APPLIED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "result_import_execution_unit_status" AS ENUM ('QUEUED', 'RUNNING', 'APPLIED', 'NO_CHANGES', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "result_import_executions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "batch_revision" INTEGER NOT NULL,
    "review_id" UUID NOT NULL,
    "status" "result_import_execution_status" NOT NULL DEFAULT 'QUEUED',
    "termination_reason" VARCHAR(40),
    "cancellation_note" VARCHAR(2000),
    "dispatch_revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_import_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_import_execution_units" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "status" "result_import_execution_unit_status" NOT NULL DEFAULT 'QUEUED',
    "changed_cells" INTEGER NOT NULL DEFAULT 0,
    "failure_code" VARCHAR(120),
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_token" UUID,
    "lease_until" TIMESTAMPTZ(3),
    "committed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_import_execution_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "result_import_executions_review_id_school_id_batch_id_batch_idx" ON "result_import_executions"("review_id", "school_id", "batch_id", "batch_revision");

-- CreateIndex
CREATE INDEX "result_import_executions_status_updated_at_idx" ON "result_import_executions"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "result_import_executions_id_school_id_key" ON "result_import_executions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_import_executions_batch_id_school_id_batch_revision_key" ON "result_import_executions"("batch_id", "school_id", "batch_revision");

-- CreateIndex
CREATE INDEX "result_import_execution_units_sheet_id_school_id_idx" ON "result_import_execution_units"("sheet_id", "school_id");

-- CreateIndex
CREATE INDEX "result_import_execution_units_status_lease_until_idx" ON "result_import_execution_units"("status", "lease_until");

-- CreateIndex
CREATE UNIQUE INDEX "result_import_execution_units_execution_id_school_id_sheet__key" ON "result_import_execution_units"("execution_id", "school_id", "sheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_import_review_exact_key" ON "result_import_reviews"("id", "school_id", "batch_id", "revision");

-- AddForeignKey
ALTER TABLE "result_import_executions" ADD CONSTRAINT "result_import_executions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_import_executions" ADD CONSTRAINT "result_import_executions_batch_id_school_id_fkey" FOREIGN KEY ("batch_id", "school_id") REFERENCES "result_import_batches"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_import_executions" ADD CONSTRAINT "result_import_executions_review_id_school_id_batch_id_batc_fkey" FOREIGN KEY ("review_id", "school_id", "batch_id", "batch_revision") REFERENCES "result_import_reviews"("id", "school_id", "batch_id", "revision") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_import_execution_units" ADD CONSTRAINT "result_import_execution_units_execution_id_school_id_fkey" FOREIGN KEY ("execution_id", "school_id") REFERENCES "result_import_executions"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_import_execution_units" ADD CONSTRAINT "result_import_execution_units_sheet_id_school_id_fkey" FOREIGN KEY ("sheet_id", "school_id") REFERENCES "result_sheets"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.result_import_executions
  ADD CONSTRAINT result_import_execution_revision_check CHECK (batch_revision > 0 AND dispatch_revision > 0),
  ADD CONSTRAINT result_import_execution_cancellation_check CHECK (
    (termination_reason IS NULL AND cancellation_note IS NULL) OR
    (termination_reason = 'CANCELLED' AND length(btrim(cancellation_note)) > 0)
  );

ALTER TABLE public.result_import_execution_units
  ADD CONSTRAINT result_import_execution_unit_lease_check CHECK (
    (status = 'RUNNING' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status <> 'RUNNING' AND lease_token IS NULL AND lease_until IS NULL)
  ),
  ADD CONSTRAINT result_import_execution_unit_commit_check CHECK (
    (status = 'APPLIED' AND changed_cells > 0 AND committed_at IS NOT NULL)
    OR (status <> 'APPLIED' AND changed_cells = 0 AND committed_at IS NULL)
  ),
  ADD CONSTRAINT result_import_execution_unit_failure_check CHECK (
    attempts >= 0 AND (NOT retryable OR status = 'FAILED')
    AND (status <> 'FAILED' OR failure_code IS NOT NULL)
  );

CREATE TRIGGER result_import_applied_unit_immutable
  BEFORE UPDATE OR DELETE ON public.result_import_execution_units
  FOR EACH ROW WHEN (OLD.status = 'APPLIED')
  EXECUTE FUNCTION public.official_results_preserve_version();
COMMIT;
