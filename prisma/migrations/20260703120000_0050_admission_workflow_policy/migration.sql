-- Add school-scoped Admissions workflow policy overrides.
CREATE TABLE "admission_workflow_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "school_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "requires_placement_test" BOOLEAN NOT NULL DEFAULT true,
  "requires_interview" BOOLEAN NOT NULL DEFAULT true,
  "allow_direct_acceptance" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "admission_workflow_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admission_workflow_policies_school_id_key"
  ON "admission_workflow_policies"("school_id");

CREATE INDEX "admission_workflow_policies_organization_id_idx"
  ON "admission_workflow_policies"("organization_id");

ALTER TABLE "admission_workflow_policies"
  ADD CONSTRAINT "admission_workflow_policies_school_id_fkey"
  FOREIGN KEY ("school_id")
  REFERENCES "schools"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "admission_workflow_policies"
  ADD CONSTRAINT "admission_workflow_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
