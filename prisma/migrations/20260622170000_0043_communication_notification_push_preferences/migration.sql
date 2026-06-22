-- AlterTable
ALTER TABLE "communication_notification_preferences"
ADD COLUMN "push_enabled" BOOLEAN NOT NULL DEFAULT true;
