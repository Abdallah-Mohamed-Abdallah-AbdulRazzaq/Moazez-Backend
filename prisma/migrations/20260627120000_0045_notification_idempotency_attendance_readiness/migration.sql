-- AlterEnum
ALTER TYPE "communication_notification_type" ADD VALUE 'ATTENDANCE_EARLY_LEAVE';

-- AlterEnum
ALTER TYPE "communication_notification_preference_category" ADD VALUE 'ATTENDANCE';

-- AlterTable
ALTER TABLE "communication_notifications"
ADD COLUMN "idempotency_key" VARCHAR(200);

-- CreateIndex
CREATE UNIQUE INDEX "comm_notif_school_idempotency_key" ON "communication_notifications"("school_id", "idempotency_key");
