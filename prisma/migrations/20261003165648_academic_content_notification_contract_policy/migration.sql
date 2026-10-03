-- AlterEnum
ALTER TYPE "communication_notification_source_module" ADD VALUE 'ACADEMICS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "communication_notification_type" ADD VALUE 'ACADEMIC_CONTENT_PUBLISHED';
ALTER TYPE "communication_notification_type" ADD VALUE 'ACADEMIC_CONTENT_UPDATED';
ALTER TYPE "communication_notification_type" ADD VALUE 'ACADEMIC_CONTENT_CANCELLED';
ALTER TYPE "communication_notification_type" ADD VALUE 'ONLINE_SESSION_REMINDER';

-- AlterEnum
ALTER TYPE "communication_notification_preference_category" ADD VALUE 'ACADEMIC_CONTENT';

-- CreateTable
CREATE TABLE "academic_content_notification_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "student_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "guardian_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "weekly_plan_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "guardian_weekly_note_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "subject_resource_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "online_session_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "general_resource_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "significant_update_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "cancellation_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "online_session_reminders_enabled" BOOLEAN NOT NULL DEFAULT false,
    "online_session_reminder_offsets_minutes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_notification_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_notification_policies_school_id_key" ON "academic_content_notification_policies"("school_id");

-- AddForeignKey
ALTER TABLE "academic_content_notification_policies" ADD CONSTRAINT "academic_content_notification_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot represent CHECK predicates and omits scalar-list NOT NULL.
-- Application owns duplicate rejection and ascending canonical order.
ALTER TABLE "academic_content_notification_policies"
  ADD CONSTRAINT "acc_notification_policy_offsets_cardinality_check"
    CHECK (cardinality("online_session_reminder_offsets_minutes") <= 5),
  ADD CONSTRAINT "acc_notification_policy_offsets_bounds_check"
    CHECK (
      array_position("online_session_reminder_offsets_minutes", NULL) IS NULL
      AND 5 <= ALL("online_session_reminder_offsets_minutes")
      AND 10080 >= ALL("online_session_reminder_offsets_minutes")
    );
