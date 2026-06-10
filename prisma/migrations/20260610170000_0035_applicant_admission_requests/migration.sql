CREATE TYPE "applicant_admission_request_status" AS ENUM ('DRAFT', 'SUBMITTED');

CREATE TABLE "applicant_admission_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "applicant_user_id" UUID NOT NULL,
  "applicant_profile_id" UUID NOT NULL,
  "school_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "requested_academic_year_id" UUID,
  "requested_grade_id" UUID,
  "child_first_name" VARCHAR(100) NOT NULL,
  "child_last_name" VARCHAR(100),
  "child_full_name" VARCHAR(220) NOT NULL,
  "child_date_of_birth" DATE,
  "child_gender" VARCHAR(40),
  "child_nationality" VARCHAR(80),
  "previous_school" VARCHAR(180),
  "notes" TEXT,
  "status" "applicant_admission_request_status" NOT NULL DEFAULT 'DRAFT',
  "submitted_at" TIMESTAMP(3),
  "application_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "applicant_admission_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "applicant_admission_requests_child_first_name_not_blank" CHECK (length(btrim("child_first_name")) > 0),
  CONSTRAINT "applicant_admission_requests_child_full_name_not_blank" CHECK (length(btrim("child_full_name")) > 0),
  CONSTRAINT "applicant_admission_requests_draft_not_submitted" CHECK ("status" <> 'DRAFT' OR "submitted_at" IS NULL)
);

CREATE UNIQUE INDEX "applicant_admission_requests_id_school_id_key" ON "applicant_admission_requests"("id", "school_id");
CREATE UNIQUE INDEX "applicant_admission_requests_application_id_school_id_key" ON "applicant_admission_requests"("application_id", "school_id");
CREATE INDEX "applicant_admission_requests_applicant_user_id_idx" ON "applicant_admission_requests"("applicant_user_id");
CREATE INDEX "applicant_admission_requests_applicant_profile_id_idx" ON "applicant_admission_requests"("applicant_profile_id");
CREATE INDEX "applicant_admission_requests_school_id_idx" ON "applicant_admission_requests"("school_id");
CREATE INDEX "applicant_admission_requests_organization_id_idx" ON "applicant_admission_requests"("organization_id");
CREATE INDEX "applicant_admission_requests_requested_academic_year_id_idx" ON "applicant_admission_requests"("requested_academic_year_id");
CREATE INDEX "applicant_admission_requests_requested_grade_id_idx" ON "applicant_admission_requests"("requested_grade_id");
CREATE INDEX "applicant_admission_requests_application_id_idx" ON "applicant_admission_requests"("application_id");
CREATE INDEX "applicant_admission_requests_applicant_user_id_deleted_at_created_at_idx" ON "applicant_admission_requests"("applicant_user_id", "deleted_at", "created_at" DESC);
CREATE INDEX "applicant_admission_requests_school_id_deleted_at_created_at_idx" ON "applicant_admission_requests"("school_id", "deleted_at", "created_at" DESC);
CREATE INDEX "applicant_admission_requests_status_deleted_at_idx" ON "applicant_admission_requests"("status", "deleted_at");
CREATE INDEX "applicant_admission_requests_school_id_status_deleted_at_idx" ON "applicant_admission_requests"("school_id", "status", "deleted_at");
CREATE INDEX "applicant_admission_requests_deleted_at_idx" ON "applicant_admission_requests"("deleted_at");

ALTER TABLE "applicant_admission_requests"
  ADD CONSTRAINT "applicant_admission_requests_applicant_user_id_fkey"
  FOREIGN KEY ("applicant_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applicant_admission_requests"
  ADD CONSTRAINT "applicant_admission_requests_applicant_profile_id_fkey"
  FOREIGN KEY ("applicant_profile_id") REFERENCES "applicant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applicant_admission_requests"
  ADD CONSTRAINT "applicant_admission_requests_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applicant_admission_requests"
  ADD CONSTRAINT "applicant_admission_requests_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applicant_admission_requests"
  ADD CONSTRAINT "applicant_admission_requests_requested_academic_year_id_school_id_fkey"
  FOREIGN KEY ("requested_academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applicant_admission_requests"
  ADD CONSTRAINT "applicant_admission_requests_requested_grade_id_school_id_fkey"
  FOREIGN KEY ("requested_grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applicant_admission_requests"
  ADD CONSTRAINT "applicant_admission_requests_application_id_school_id_fkey"
  FOREIGN KEY ("application_id", "school_id") REFERENCES "admission_applications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
