-- Add Dismissal notification enum values for the existing Communication notification runtime.
ALTER TYPE "communication_notification_source_module" ADD VALUE IF NOT EXISTS 'DISMISSAL';

ALTER TYPE "communication_notification_type" ADD VALUE IF NOT EXISTS 'DISMISSAL_REQUEST_CREATED';
ALTER TYPE "communication_notification_type" ADD VALUE IF NOT EXISTS 'DISMISSAL_REQUEST_CANCELLED';
ALTER TYPE "communication_notification_type" ADD VALUE IF NOT EXISTS 'DISMISSAL_REQUEST_CALLED';
ALTER TYPE "communication_notification_type" ADD VALUE IF NOT EXISTS 'DISMISSAL_REQUEST_READY';
ALTER TYPE "communication_notification_type" ADD VALUE IF NOT EXISTS 'DISMISSAL_REQUEST_HANDED_OVER';
