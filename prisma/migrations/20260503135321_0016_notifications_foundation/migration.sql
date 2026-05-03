-- CreateEnum
CREATE TYPE "communication_notification_status" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "communication_notification_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "communication_notification_source_module" AS ENUM ('COMMUNICATION', 'ANNOUNCEMENTS', 'ATTENDANCE', 'GRADES', 'BEHAVIOR', 'REINFORCEMENT', 'ADMISSIONS', 'STUDENTS', 'SYSTEM');

-- CreateEnum
CREATE TYPE "communication_notification_type" AS ENUM ('ANNOUNCEMENT_PUBLISHED', 'MESSAGE_RECEIVED', 'MESSAGE_MENTION', 'ATTENDANCE_ABSENCE', 'ATTENDANCE_LATE', 'GRADE_POSTED', 'BEHAVIOR_RECORD_CREATED', 'REINFORCEMENT_REWARD_GRANTED', 'SYSTEM_ALERT');

-- CreateEnum
CREATE TYPE "communication_notification_delivery_channel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "communication_notification_delivery_status" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "communication_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "template_id" UUID,
    "source_module" "communication_notification_source_module" NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID,
    "type" "communication_notification_type" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "communication_notification_priority" NOT NULL DEFAULT 'NORMAL',
    "status" "communication_notification_status" NOT NULL DEFAULT 'UNREAD',
    "read_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" "communication_notification_delivery_channel" NOT NULL,
    "status" "communication_notification_delivery_status" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempted_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communication_notifications_school_id_idx" ON "communication_notifications"("school_id");

-- CreateIndex
CREATE INDEX "communication_notifications_recipient_user_id_idx" ON "communication_notifications"("recipient_user_id");

-- CreateIndex
CREATE INDEX "communication_notifications_actor_user_id_idx" ON "communication_notifications"("actor_user_id");

-- CreateIndex
CREATE INDEX "communication_notifications_template_id_idx" ON "communication_notifications"("template_id");

-- CreateIndex
CREATE INDEX "communication_notifications_school_id_recipient_user_id_idx" ON "communication_notifications"("school_id", "recipient_user_id");

-- CreateIndex
CREATE INDEX "communication_notifications_school_id_recipient_user_id_sta_idx" ON "communication_notifications"("school_id", "recipient_user_id", "status");

-- CreateIndex
CREATE INDEX "communication_notifications_school_id_created_at_idx" ON "communication_notifications"("school_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "communication_notifications_school_id_source_module_source__idx" ON "communication_notifications"("school_id", "source_module", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "communication_notifications_status_idx" ON "communication_notifications"("status");

-- CreateIndex
CREATE INDEX "communication_notifications_type_idx" ON "communication_notifications"("type");

-- CreateIndex
CREATE INDEX "communication_notifications_expires_at_idx" ON "communication_notifications"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "communication_notifications_id_school_id_key" ON "communication_notifications"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_notification_deliveries_school_id_idx" ON "communication_notification_deliveries"("school_id");

-- CreateIndex
CREATE INDEX "communication_notification_deliveries_notification_id_idx" ON "communication_notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "communication_notification_deliveries_school_id_channel_sta_idx" ON "communication_notification_deliveries"("school_id", "channel", "status");

-- CreateIndex
CREATE INDEX "communication_notification_deliveries_channel_idx" ON "communication_notification_deliveries"("channel");

-- CreateIndex
CREATE INDEX "communication_notification_deliveries_status_idx" ON "communication_notification_deliveries"("status");

-- CreateIndex
CREATE INDEX "communication_notification_deliveries_provider_message_id_idx" ON "communication_notification_deliveries"("provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_notification_deliveries_id_school_id_key" ON "communication_notification_deliveries"("id", "school_id");

-- AddForeignKey
ALTER TABLE "communication_notifications" ADD CONSTRAINT "communication_notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notifications" ADD CONSTRAINT "communication_notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notifications" ADD CONSTRAINT "communication_notifications_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notifications" ADD CONSTRAINT "communication_notifications_template_id_school_id_fkey" FOREIGN KEY ("template_id", "school_id") REFERENCES "settings_notification_templates"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notification_deliveries" ADD CONSTRAINT "communication_notification_deliveries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notification_deliveries" ADD CONSTRAINT "communication_notification_deliveries_notification_id_scho_fkey" FOREIGN KEY ("notification_id", "school_id") REFERENCES "communication_notifications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
