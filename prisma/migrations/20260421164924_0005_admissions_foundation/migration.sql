-- CreateEnum
CREATE TYPE "lead_channel" AS ENUM ('IN_APP', 'REFERRAL', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "admission_application_status" AS ENUM ('SUBMITTED', 'DOCUMENTS_PENDING', 'UNDER_REVIEW', 'ACCEPTED', 'WAITLISTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "admission_application_source" AS ENUM ('IN_APP', 'REFERRAL', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "admission_document_status" AS ENUM ('COMPLETE', 'MISSING');

-- CreateEnum
CREATE TYPE "placement_test_status" AS ENUM ('SCHEDULED', 'COMPLETED', 'FAILED', 'CANCELLED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "interview_status" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "admission_decision_type" AS ENUM ('ACCEPT', 'WAITLIST', 'REJECT');

-- CreateTable
CREATE TABLE "admission_leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_name" TEXT NOT NULL,
    "primary_contact_name" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "channel" "lead_channel" NOT NULL,
    "status" "lead_status" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "owner_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lead_id" UUID,
    "student_name" TEXT NOT NULL,
    "requested_academic_year_id" UUID,
    "requested_grade_id" UUID,
    "status" "admission_application_status" NOT NULL DEFAULT 'SUBMITTED',
    "source" "admission_application_source" NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_application_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "status" "admission_document_status" NOT NULL DEFAULT 'MISSING',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_tests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "subject_id" UUID,
    "type" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "score" DECIMAL(5,2),
    "result" TEXT,
    "status" "placement_test_status" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_interviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "interviewer_user_id" UUID,
    "status" "interview_status" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "decision" "admission_decision_type" NOT NULL,
    "reason" TEXT,
    "decided_by_user_id" UUID NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admission_leads_school_id_idx" ON "admission_leads"("school_id");

-- CreateIndex
CREATE INDEX "admission_leads_organization_id_idx" ON "admission_leads"("organization_id");

-- CreateIndex
CREATE INDEX "admission_leads_owner_user_id_idx" ON "admission_leads"("owner_user_id");

-- CreateIndex
CREATE INDEX "admission_leads_school_id_status_created_at_idx" ON "admission_leads"("school_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admission_leads_school_id_channel_created_at_idx" ON "admission_leads"("school_id", "channel", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admission_leads_deleted_at_idx" ON "admission_leads"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "admission_leads_id_school_id_key" ON "admission_leads"("id", "school_id");

-- CreateIndex
CREATE INDEX "admission_applications_school_id_idx" ON "admission_applications"("school_id");

-- CreateIndex
CREATE INDEX "admission_applications_organization_id_idx" ON "admission_applications"("organization_id");

-- CreateIndex
CREATE INDEX "admission_applications_lead_id_idx" ON "admission_applications"("lead_id");

-- CreateIndex
CREATE INDEX "admission_applications_requested_academic_year_id_idx" ON "admission_applications"("requested_academic_year_id");

-- CreateIndex
CREATE INDEX "admission_applications_requested_grade_id_idx" ON "admission_applications"("requested_grade_id");

-- CreateIndex
CREATE INDEX "admission_applications_school_id_status_created_at_idx" ON "admission_applications"("school_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admission_applications_school_id_submitted_at_idx" ON "admission_applications"("school_id", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "admission_applications_deleted_at_idx" ON "admission_applications"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_id_school_id_key" ON "admission_applications"("id", "school_id");

-- CreateIndex
CREATE INDEX "admission_application_documents_school_id_idx" ON "admission_application_documents"("school_id");

-- CreateIndex
CREATE INDEX "admission_application_documents_application_id_idx" ON "admission_application_documents"("application_id");

-- CreateIndex
CREATE INDEX "admission_application_documents_file_id_idx" ON "admission_application_documents"("file_id");

-- CreateIndex
CREATE INDEX "admission_application_documents_school_id_status_idx" ON "admission_application_documents"("school_id", "status");

-- CreateIndex
CREATE INDEX "admission_application_documents_school_id_application_id_do_idx" ON "admission_application_documents"("school_id", "application_id", "document_type");

-- CreateIndex
CREATE INDEX "admission_tests_school_id_idx" ON "admission_tests"("school_id");

-- CreateIndex
CREATE INDEX "admission_tests_application_id_idx" ON "admission_tests"("application_id");

-- CreateIndex
CREATE INDEX "admission_tests_subject_id_idx" ON "admission_tests"("subject_id");

-- CreateIndex
CREATE INDEX "admission_tests_school_id_status_scheduled_at_idx" ON "admission_tests"("school_id", "status", "scheduled_at" DESC);

-- CreateIndex
CREATE INDEX "admission_interviews_school_id_idx" ON "admission_interviews"("school_id");

-- CreateIndex
CREATE INDEX "admission_interviews_application_id_idx" ON "admission_interviews"("application_id");

-- CreateIndex
CREATE INDEX "admission_interviews_interviewer_user_id_idx" ON "admission_interviews"("interviewer_user_id");

-- CreateIndex
CREATE INDEX "admission_interviews_school_id_status_scheduled_at_idx" ON "admission_interviews"("school_id", "status", "scheduled_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "admission_decisions_application_id_key" ON "admission_decisions"("application_id");

-- CreateIndex
CREATE INDEX "admission_decisions_school_id_idx" ON "admission_decisions"("school_id");

-- CreateIndex
CREATE INDEX "admission_decisions_decided_by_user_id_idx" ON "admission_decisions"("decided_by_user_id");

-- CreateIndex
CREATE INDEX "admission_decisions_school_id_decision_decided_at_idx" ON "admission_decisions"("school_id", "decision", "decided_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "admission_decisions_application_id_school_id_key" ON "admission_decisions"("application_id", "school_id");

-- AddForeignKey
ALTER TABLE "admission_leads" ADD CONSTRAINT "admission_leads_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_leads" ADD CONSTRAINT "admission_leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_leads" ADD CONSTRAINT "admission_leads_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_lead_id_school_id_fkey" FOREIGN KEY ("lead_id", "school_id") REFERENCES "admission_leads"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_requested_academic_year_id_school_i_fkey" FOREIGN KEY ("requested_academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_requested_grade_id_school_id_fkey" FOREIGN KEY ("requested_grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_application_documents" ADD CONSTRAINT "admission_application_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_application_documents" ADD CONSTRAINT "admission_application_documents_application_id_school_id_fkey" FOREIGN KEY ("application_id", "school_id") REFERENCES "admission_applications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_application_documents" ADD CONSTRAINT "admission_application_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_tests" ADD CONSTRAINT "admission_tests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_tests" ADD CONSTRAINT "admission_tests_application_id_school_id_fkey" FOREIGN KEY ("application_id", "school_id") REFERENCES "admission_applications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_tests" ADD CONSTRAINT "admission_tests_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_interviews" ADD CONSTRAINT "admission_interviews_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_interviews" ADD CONSTRAINT "admission_interviews_application_id_school_id_fkey" FOREIGN KEY ("application_id", "school_id") REFERENCES "admission_applications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_interviews" ADD CONSTRAINT "admission_interviews_interviewer_user_id_fkey" FOREIGN KEY ("interviewer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_application_id_school_id_fkey" FOREIGN KEY ("application_id", "school_id") REFERENCES "admission_applications"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
