-- CreateTable
CREATE TABLE "communication_notification_push_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "device_token_id" UUID NOT NULL,
    "status" "communication_notification_delivery_status" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempted_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_notification_push_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "communication_notification_push_attempts_delivery_id_device_token_id_key" ON "communication_notification_push_attempts"("delivery_id", "device_token_id");

-- CreateIndex
CREATE INDEX "communication_notification_push_attempts_school_id_idx" ON "communication_notification_push_attempts"("school_id");

-- CreateIndex
CREATE INDEX "communication_notification_push_attempts_delivery_id_idx" ON "communication_notification_push_attempts"("delivery_id");

-- CreateIndex
CREATE INDEX "communication_notification_push_attempts_device_token_id_idx" ON "communication_notification_push_attempts"("device_token_id");

-- CreateIndex
CREATE INDEX "communication_notification_push_attempts_school_id_delivery_id_idx" ON "communication_notification_push_attempts"("school_id", "delivery_id");

-- CreateIndex
CREATE INDEX "communication_notification_push_attempts_school_id_status_idx" ON "communication_notification_push_attempts"("school_id", "status");

-- CreateIndex
CREATE INDEX "communication_notification_push_attempts_school_id_device_token_id_idx" ON "communication_notification_push_attempts"("school_id", "device_token_id");

-- AddForeignKey
ALTER TABLE "communication_notification_push_attempts" ADD CONSTRAINT "communication_notification_push_attempts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notification_push_attempts" ADD CONSTRAINT "communication_notification_push_attempts_delivery_id_school_id_fkey" FOREIGN KEY ("delivery_id", "school_id") REFERENCES "communication_notification_deliveries"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notification_push_attempts" ADD CONSTRAINT "communication_notification_push_attempts_device_token_id_school_id_fkey" FOREIGN KEY ("device_token_id", "school_id") REFERENCES "app_device_tokens"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
