-- ADM-REG-DOC-1B: source metadata for staff-confirmed Admissions document imports.
ALTER TABLE "student_documents"
  ADD COLUMN "source_application_id" UUID,
  ADD COLUMN "source_application_document_id" UUID,
  ADD COLUMN "source_applicant_request_document_id" UUID,
  ADD COLUMN "imported_at" TIMESTAMP(3),
  ADD COLUMN "imported_by" UUID,
  ADD COLUMN "source_document_type" TEXT,
  ADD COLUMN "source_review_status" TEXT,
  ADD COLUMN "source_notes" TEXT,
  ADD COLUMN "source_file_id" UUID;

CREATE INDEX "student_documents_source_application_id_idx"
  ON "student_documents"("source_application_id");

CREATE INDEX "student_documents_source_application_document_id_idx"
  ON "student_documents"("source_application_document_id");

CREATE INDEX "student_documents_source_applicant_request_document_id_idx"
  ON "student_documents"("source_applicant_request_document_id");

CREATE INDEX "student_documents_source_file_id_idx"
  ON "student_documents"("source_file_id");

CREATE UNIQUE INDEX "student_documents_source_import_key"
  ON "student_documents"("school_id", "student_id", "source_application_document_id");
