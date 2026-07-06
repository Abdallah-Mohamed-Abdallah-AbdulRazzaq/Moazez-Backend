-- Production hardening indexes for Dismissal / Smart Pickup V1 hot paths.
-- These indexes support scoped list surfaces, parent recent calls,
-- notification center reads, and the global expiry worker candidate scan.

CREATE INDEX IF NOT EXISTS "dismissal_gates_school_active_deleted_sort_idx"
  ON "dismissal_gates"("school_id", "is_active", "deleted_at", "sort_order");

CREATE INDEX IF NOT EXISTS "dismissal_requests_school_status_requested_at_idx"
  ON "dismissal_requests"("school_id", "status", "requested_at");

CREATE INDEX IF NOT EXISTS "dismissal_requests_parent_recent_idx"
  ON "dismissal_requests"("school_id", "requested_by_id", "deleted_at", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "dismissal_requests_school_created_at_desc_idx"
  ON "dismissal_requests"("school_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "dismissal_requests_expiry_scan_idx"
  ON "dismissal_requests"("deleted_at", "status", "requested_at");

CREATE INDEX IF NOT EXISTS "comm_notif_dismissal_recipient_created_idx"
  ON "communication_notifications"("school_id", "recipient_user_id", "source_module", "created_at" DESC);
