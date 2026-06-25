-- AlterTable
ALTER TABLE "attendance_policies"
ADD COLUMN "selected_period_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "late_threshold_minutes" INTEGER,
ADD COLUMN "early_leave_threshold_minutes" INTEGER,
ADD COLUMN "auto_absent_after_minutes" INTEGER,
ADD COLUMN "absent_if_missed_periods_count" INTEGER,
ADD COLUMN "require_excuse_reason" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notify_teachers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notify_students" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notify_on_late" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notify_on_early_leave" BOOLEAN NOT NULL DEFAULT false;
