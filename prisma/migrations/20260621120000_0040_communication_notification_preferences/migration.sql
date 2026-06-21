-- CreateEnum
CREATE TYPE "communication_notification_preference_category" AS ENUM ('MESSAGE_RECEIVED', 'ANNOUNCEMENT');

-- CreateTable
CREATE TABLE "communication_notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "communication_notification_preference_category" NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "communication_notification_preferences_id_school_id_key" ON "communication_notification_preferences"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "comm_notif_pref_school_user_category_key" ON "communication_notification_preferences"("school_id", "user_id", "category");

-- CreateIndex
CREATE INDEX "communication_notification_preferences_school_id_idx" ON "communication_notification_preferences"("school_id");

-- CreateIndex
CREATE INDEX "communication_notification_preferences_user_id_idx" ON "communication_notification_preferences"("user_id");

-- CreateIndex
CREATE INDEX "communication_notification_preferences_school_user_idx" ON "communication_notification_preferences"("school_id", "user_id");

-- CreateIndex
CREATE INDEX "communication_notification_preferences_category_idx" ON "communication_notification_preferences"("category");

-- AddForeignKey
ALTER TABLE "communication_notification_preferences" ADD CONSTRAINT "communication_notification_preferences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_notification_preferences" ADD CONSTRAINT "communication_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
