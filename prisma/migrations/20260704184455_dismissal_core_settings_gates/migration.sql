CREATE TYPE "dismissal_gate_operational_status" AS ENUM ('OPEN', 'BUSY', 'CLOSED', 'MAINTENANCE');

CREATE TABLE "dismissal_gates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "school_id" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "campus" VARCHAR(160),
  "status" "dismissal_gate_operational_status" NOT NULL DEFAULT 'CLOSED',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "waiting_zones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "dismissal_gates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dismissal_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "school_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Cairo',
  "school_latitude" DECIMAL(9,6),
  "school_longitude" DECIMAL(9,6),
  "allowed_radius_meters" INTEGER NOT NULL DEFAULT 150,
  "request_window_start_local" VARCHAR(5),
  "request_window_end_local" VARCHAR(5),
  "delay_threshold_minutes" INTEGER NOT NULL DEFAULT 15,
  "urgent_threshold_minutes" INTEGER NOT NULL DEFAULT 30,
  "require_pickup_code" BOOLEAN NOT NULL DEFAULT true,
  "allow_delegate_pickup" BOOLEAN NOT NULL DEFAULT true,
  "allow_parent_cancel_before_called" BOOLEAN NOT NULL DEFAULT true,
  "default_gate_id" UUID,
  "updated_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dismissal_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dismissal_gates_id_school_id_key"
  ON "dismissal_gates"("id", "school_id");

CREATE UNIQUE INDEX "dismissal_gates_school_id_code_key"
  ON "dismissal_gates"("school_id", "code");

CREATE INDEX "dismissal_gates_school_id_idx"
  ON "dismissal_gates"("school_id");

CREATE INDEX "dismissal_gates_school_id_status_idx"
  ON "dismissal_gates"("school_id", "status");

CREATE INDEX "dismissal_gates_school_id_is_active_deleted_at_idx"
  ON "dismissal_gates"("school_id", "is_active", "deleted_at");

CREATE INDEX "dismissal_gates_school_id_sort_order_idx"
  ON "dismissal_gates"("school_id", "sort_order");

CREATE INDEX "dismissal_gates_deleted_at_idx"
  ON "dismissal_gates"("deleted_at");

CREATE UNIQUE INDEX "dismissal_settings_school_id_key"
  ON "dismissal_settings"("school_id");

CREATE INDEX "dismissal_settings_default_gate_id_idx"
  ON "dismissal_settings"("default_gate_id");

CREATE INDEX "dismissal_settings_updated_by_id_idx"
  ON "dismissal_settings"("updated_by_id");

ALTER TABLE "dismissal_gates"
  ADD CONSTRAINT "dismissal_gates_school_id_fkey"
  FOREIGN KEY ("school_id")
  REFERENCES "schools"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "dismissal_settings"
  ADD CONSTRAINT "dismissal_settings_school_id_fkey"
  FOREIGN KEY ("school_id")
  REFERENCES "schools"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "dismissal_settings"
  ADD CONSTRAINT "dismissal_settings_default_gate_id_school_id_fkey"
  FOREIGN KEY ("default_gate_id", "school_id")
  REFERENCES "dismissal_gates"("id", "school_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "dismissal_settings"
  ADD CONSTRAINT "dismissal_settings_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
