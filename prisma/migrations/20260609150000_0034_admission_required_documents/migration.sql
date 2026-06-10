CREATE TABLE "admission_required_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "school_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "grade_id" UUID,
  "title" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
  "accepted_file_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "max_files" INTEGER NOT NULL DEFAULT 1,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "admission_required_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admission_required_documents_title_not_blank" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "admission_required_documents_max_files_positive" CHECK ("max_files" > 0)
);

CREATE UNIQUE INDEX "admission_required_documents_id_school_id_key" ON "admission_required_documents"("id", "school_id");
CREATE INDEX "admission_required_documents_school_id_idx" ON "admission_required_documents"("school_id");
CREATE INDEX "admission_required_documents_organization_id_idx" ON "admission_required_documents"("organization_id");
CREATE INDEX "admission_required_documents_grade_id_idx" ON "admission_required_documents"("grade_id");
CREATE INDEX "admission_required_documents_school_id_is_active_deleted_at_idx" ON "admission_required_documents"("school_id", "is_active", "deleted_at");
CREATE INDEX "admission_required_documents_school_id_grade_id_is_active_deleted_at_idx" ON "admission_required_documents"("school_id", "grade_id", "is_active", "deleted_at");
CREATE INDEX "admission_required_documents_deleted_at_idx" ON "admission_required_documents"("deleted_at");

ALTER TABLE "admission_required_documents"
  ADD CONSTRAINT "admission_required_documents_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admission_required_documents"
  ADD CONSTRAINT "admission_required_documents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admission_required_documents"
  ADD CONSTRAINT "admission_required_documents_grade_id_school_id_fkey"
  FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
