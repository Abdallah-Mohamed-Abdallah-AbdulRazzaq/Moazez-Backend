-- Add Student profile correction request workflow.
CREATE TYPE "student_profile_correction_request_status" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

CREATE TABLE "student_profile_correction_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "school_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "requested_by_user_id" UUID,
  "requested_by_type" TEXT NOT NULL,
  "status" "student_profile_correction_request_status" NOT NULL DEFAULT 'PENDING',
  "requested_changes" JSONB NOT NULL,
  "current_snapshot" JSONB,
  "reason" TEXT,
  "reviewer_note" TEXT,
  "approved_at" TIMESTAMP(3),
  "approved_by" UUID,
  "rejected_at" TIMESTAMP(3),
  "rejected_by" UUID,
  "cancelled_at" TIMESTAMP(3),
  "cancelled_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "student_profile_correction_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "student_profile_correction_requests_school_id_student_id_status_created_at_idx"
  ON "student_profile_correction_requests"("school_id", "student_id", "status", "created_at");

CREATE INDEX "student_profile_correction_requests_school_id_status_created_at_idx"
  ON "student_profile_correction_requests"("school_id", "status", "created_at");

CREATE INDEX "student_profile_correction_requests_requested_by_user_id_idx"
  ON "student_profile_correction_requests"("requested_by_user_id");

CREATE INDEX "student_profile_correction_requests_student_id_idx"
  ON "student_profile_correction_requests"("student_id");

CREATE INDEX "student_profile_correction_requests_deleted_at_idx"
  ON "student_profile_correction_requests"("deleted_at");

CREATE UNIQUE INDEX "student_profile_correction_requests_id_school_id_key"
  ON "student_profile_correction_requests"("id", "school_id");

ALTER TABLE "student_profile_correction_requests"
  ADD CONSTRAINT "student_profile_correction_requests_school_id_fkey"
  FOREIGN KEY ("school_id")
  REFERENCES "schools"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "student_profile_correction_requests"
  ADD CONSTRAINT "student_profile_correction_requests_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "student_profile_correction_requests"
  ADD CONSTRAINT "student_profile_correction_requests_student_id_school_id_fkey"
  FOREIGN KEY ("student_id", "school_id")
  REFERENCES "students"("id", "school_id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
