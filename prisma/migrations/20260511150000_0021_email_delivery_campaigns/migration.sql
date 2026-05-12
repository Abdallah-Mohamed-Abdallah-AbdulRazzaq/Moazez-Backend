-- CreateEnum
CREATE TYPE "school_email_delivery_kind" AS ENUM ('CREDENTIAL_DELIVERY', 'GENERAL_CAMPAIGN');

-- CreateEnum
CREATE TYPE "school_email_delivery_batch_status" AS ENUM ('DRAFT', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'PARTIAL_FAILED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "school_email_delivery_recipient_status" AS ENUM ('PENDING', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "school_email_delivery_recipient_type" AS ENUM ('USER', 'CUSTOM_EMAIL');

-- CreateTable
CREATE TABLE "settings_school_email_delivery_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "kind" "school_email_delivery_kind" NOT NULL,
    "status" "school_email_delivery_batch_status" NOT NULL DEFAULT 'DRAFT',
    "template_key" "school_email_template_key",
    "subject_snapshot" TEXT,
    "created_by_user_id" UUID,
    "recipient_scope" JSONB,
    "preview_data" JSONB,
    "campaign_content" JSONB,
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "queued_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_school_email_delivery_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_school_email_delivery_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "recipient_type" "school_email_delivery_recipient_type" NOT NULL,
    "user_id" UUID,
    "to_email" TEXT NOT NULL,
    "display_name" TEXT,
    "status" "school_email_delivery_recipient_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "skipped_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_school_email_delivery_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settings_school_email_delivery_batches_school_id_status_kind_idx" ON "settings_school_email_delivery_batches"("school_id", "status", "kind");

-- CreateIndex
CREATE INDEX "settings_school_email_delivery_batches_school_id_created_at_idx" ON "settings_school_email_delivery_batches"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "settings_school_email_delivery_recipients_school_id_batch_id_status_idx" ON "settings_school_email_delivery_recipients"("school_id", "batch_id", "status");

-- CreateIndex
CREATE INDEX "settings_school_email_delivery_recipients_school_id_status_idx" ON "settings_school_email_delivery_recipients"("school_id", "status");

-- CreateIndex
CREATE INDEX "settings_school_email_delivery_recipients_batch_id_idx" ON "settings_school_email_delivery_recipients"("batch_id");

-- CreateIndex
CREATE INDEX "settings_school_email_delivery_recipients_user_id_idx" ON "settings_school_email_delivery_recipients"("user_id");

-- AddForeignKey
ALTER TABLE "settings_school_email_delivery_batches" ADD CONSTRAINT "settings_school_email_delivery_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_email_delivery_recipients" ADD CONSTRAINT "settings_school_email_delivery_recipients_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_email_delivery_recipients" ADD CONSTRAINT "settings_school_email_delivery_recipients_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "settings_school_email_delivery_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_email_delivery_recipients" ADD CONSTRAINT "settings_school_email_delivery_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
