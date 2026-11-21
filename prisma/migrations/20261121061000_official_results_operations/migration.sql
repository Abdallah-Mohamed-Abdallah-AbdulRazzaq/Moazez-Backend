BEGIN;
-- AlterEnum
ALTER TYPE "result_configuration_preview_kind" ADD VALUE 'PERIOD_REOPEN';

-- CreateTable
CREATE TABLE "result_issue_reports" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "result_export_status" NOT NULL DEFAULT 'QUEUED',
    "bucket" VARCHAR(255) NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "size_bytes" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "lease_until" TIMESTAMPTZ(3),
    "lease_token" UUID,

    CONSTRAINT "result_issue_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "result_issue_reports_file_id_key" ON "result_issue_reports"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_issue_reports_object_key_key" ON "result_issue_reports"("object_key");

-- CreateIndex
CREATE INDEX "result_issue_reports_school_id_batch_id_idx" ON "result_issue_reports"("school_id", "batch_id");

-- CreateIndex
CREATE INDEX "result_issue_reports_review_id_school_id_batch_id_revision_idx" ON "result_issue_reports"("review_id", "school_id", "batch_id", "revision");

-- CreateIndex
CREATE INDEX "result_issue_reports_status_lease_until_idx" ON "result_issue_reports"("status", "lease_until");

-- CreateIndex
CREATE INDEX "result_issue_reports_expires_at_deleted_at_idx" ON "result_issue_reports"("expires_at", "deleted_at");

-- AddForeignKey
ALTER TABLE "result_issue_reports" ADD CONSTRAINT "result_issue_reports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_issue_reports" ADD CONSTRAINT "result_issue_reports_review_id_school_id_batch_id_revision_fkey" FOREIGN KEY ("review_id", "school_id", "batch_id", "revision") REFERENCES "result_import_reviews"("id", "school_id", "batch_id", "revision") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.result_issue_reports
  ADD CONSTRAINT result_issue_report_lease_check CHECK (
    (status = 'GENERATING' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status <> 'GENERATING' AND lease_token IS NULL AND lease_until IS NULL)
  ),
  ADD CONSTRAINT result_issue_report_ready_check CHECK (
    status <> 'READY' OR (size_bytes IS NOT NULL AND size_bytes BETWEEN 1 AND 20971520 AND deleted_at IS NULL)
  );

CREATE INDEX result_notice_pending_scan_idx
  ON public.result_publication_notices (created_at, id) WHERE status = 'PENDING';
COMMIT;
