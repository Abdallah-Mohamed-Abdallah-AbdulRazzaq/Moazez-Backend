-- Add explicit terminal-expiry policy for Dismissal requests.
ALTER TABLE "dismissal_settings"
ADD COLUMN "expiry_threshold_minutes" INTEGER NOT NULL DEFAULT 180;

-- Support safe in-app notifications for automatic request expiration.
ALTER TYPE "communication_notification_type"
ADD VALUE 'DISMISSAL_REQUEST_EXPIRED';
