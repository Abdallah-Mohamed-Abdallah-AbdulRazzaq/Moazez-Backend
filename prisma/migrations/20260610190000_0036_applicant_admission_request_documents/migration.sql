CREATE TYPE "applicant_admission_request_document_status" AS ENUM (
  'UPLOADED',
  'NEEDS_REPLACEMENT',
  'ACCEPTED',
  'REJECTED',
  'SUPERSEDED'
);

CREATE TABLE "applicant_admission_request_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID NOT NULL,
  "applicant_user_id" UUID NOT NULL,
  "school_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "required_document_id" UUID,
  "application_document_id" UUID,
  "file_id" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "document_type" VARCHAR(120) NOT NULL,
  "status" "applicant_admission_request_document_status" NOT NULL DEFAULT 'UPLOADED',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "applicant_admission_request_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "applicant_admission_request_documents_title_not_blank" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "applicant_admission_request_documents_type_not_blank" CHECK (length(btrim("document_type")) > 0)
);

CREATE INDEX "applicant_admission_request_documents_request_id_deleted_at_created_at_idx"
  ON "applicant_admission_request_documents"("request_id", "deleted_at", "created_at" DESC);

CREATE INDEX "applicant_admission_request_documents_applicant_user_id_deleted_at_created_at_idx"
  ON "applicant_admission_request_documents"("applicant_user_id", "deleted_at", "created_at" DESC);

CREATE INDEX "applicant_admission_request_documents_school_id_request_id_deleted_at_idx"
  ON "applicant_admission_request_documents"("school_id", "request_id", "deleted_at");

CREATE INDEX "applicant_admission_request_documents_request_id_required_document_id_deleted_at_idx"
  ON "applicant_admission_request_documents"("request_id", "required_document_id", "deleted_at");

CREATE INDEX "applicant_admission_request_documents_file_id_idx"
  ON "applicant_admission_request_documents"("file_id");

CREATE INDEX "applicant_admission_request_documents_status_deleted_at_idx"
  ON "applicant_admission_request_documents"("status", "deleted_at");

CREATE INDEX "applicant_admission_request_documents_school_id_application_document_id_idx"
  ON "applicant_admission_request_documents"("school_id", "application_document_id");

CREATE INDEX "applicant_admission_request_documents_organization_id_idx"
  ON "applicant_admission_request_documents"("organization_id");

ALTER TABLE "applicant_admission_request_documents"
  ADD CONSTRAINT "applicant_admission_request_documents_request_id_school_id_fkey"
  FOREIGN KEY ("request_id", "school_id") REFERENCES "applicant_admission_requests"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applicant_admission_request_documents"
  ADD CONSTRAINT "applicant_admission_request_documents_applicant_user_id_fkey"
  FOREIGN KEY ("applicant_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applicant_admission_request_documents"
  ADD CONSTRAINT "applicant_admission_request_documents_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applicant_admission_request_documents"
  ADD CONSTRAINT "applicant_admission_request_documents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applicant_admission_request_documents"
  ADD CONSTRAINT "applicant_admission_request_documents_required_document_id_school_id_fkey"
  FOREIGN KEY ("required_document_id", "school_id") REFERENCES "admission_required_documents"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applicant_admission_request_documents"
  ADD CONSTRAINT "applicant_admission_request_documents_application_document_id_fkey"
  FOREIGN KEY ("application_document_id") REFERENCES "admission_application_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "applicant_admission_request_documents"
  ADD CONSTRAINT "applicant_admission_request_documents_file_id_fkey"
  FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
