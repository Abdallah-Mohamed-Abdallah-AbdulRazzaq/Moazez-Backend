BEGIN;

-- CreateEnum
CREATE TYPE "result_design_status" AS ENUM ('IN_REVIEW', 'ACCEPTED', 'RETURNED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "result_template_assignment_mode" AS ENUM ('REPLACE', 'EXTEND');

-- CreateEnum
CREATE TYPE "result_configuration_preview_kind" AS ENUM ('TEMPLATE_ACTIVATION', 'SCOPE_RESOLUTION', 'DEFINITION_ADOPTION');

-- CreateEnum
CREATE TYPE "result_operation_status" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "result_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "label_ar" VARCHAR(200) NOT NULL,
    "label_en" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "latest_version_id" UUID,
    "active_version_id" UUID,
    "archived_at" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_template_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "origin" JSONB NOT NULL,
    "content_digest" CHAR(64) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_scope_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_scope_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_template_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "base_template_version_id" UUID,
    "mode" "result_template_assignment_mode" NOT NULL,
    "selector" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scope_revision" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_template_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_design_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "definition_version_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "status" "result_design_status" NOT NULL DEFAULT 'IN_REVIEW',
    "decision_actor_id" UUID,
    "decision_comment" VARCHAR(2000),
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_design_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_configuration_previews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "kind" "result_configuration_preview_kind" NOT NULL,
    "resource_id" UUID,
    "binding" JSONB NOT NULL,
    "digest" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_configuration_previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "operation_type" VARCHAR(64) NOT NULL,
    "status" "result_operation_status" NOT NULL,
    "counts" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "result_templates_school_id_archived_at_id_idx" ON "result_templates"("school_id", "archived_at", "id");

-- CreateIndex
CREATE INDEX "result_templates_school_id_latest_version_id_idx" ON "result_templates"("school_id", "latest_version_id");

-- CreateIndex
CREATE INDEX "result_templates_school_id_active_version_id_idx" ON "result_templates"("school_id", "active_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_templates_id_school_id_key" ON "result_templates"("id", "school_id");

-- CreateIndex
CREATE INDEX "result_template_versions_created_by_id_idx" ON "result_template_versions"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_template_versions_id_school_id_key" ON "result_template_versions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_template_version_template_key" ON "result_template_versions"("id", "school_id", "template_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_template_versions_school_id_template_id_version_key" ON "result_template_versions"("school_id", "template_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "result_scope_revisions_school_id_key" ON "result_scope_revisions"("school_id");

-- CreateIndex
CREATE INDEX "result_template_assignments_school_id_enabled_id_idx" ON "result_template_assignments"("school_id", "enabled", "id");

-- CreateIndex
CREATE INDEX "result_template_assignments_school_id_template_version_id_idx" ON "result_template_assignments"("school_id", "template_version_id");

-- CreateIndex
CREATE INDEX "result_template_assignments_school_id_base_template_version_idx" ON "result_template_assignments"("school_id", "base_template_version_id");

-- CreateIndex
CREATE INDEX "result_design_candidates_school_id_sheet_id_status_idx" ON "result_design_candidates"("school_id", "sheet_id", "status");

-- CreateIndex
CREATE INDEX "result_design_candidates_author_id_idx" ON "result_design_candidates"("author_id");

-- CreateIndex
CREATE INDEX "result_design_candidates_decision_actor_id_idx" ON "result_design_candidates"("decision_actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_design_candidates_school_id_definition_version_id_key" ON "result_design_candidates"("school_id", "definition_version_id");

-- CreateIndex
CREATE INDEX "result_configuration_previews_school_id_author_id_kind_expi_idx" ON "result_configuration_previews"("school_id", "author_id", "kind", "expires_at");

-- CreateIndex
CREATE INDEX "result_configuration_previews_author_id_idx" ON "result_configuration_previews"("author_id");

-- CreateIndex
CREATE INDEX "result_operations_school_id_actor_id_created_at_idx" ON "result_operations"("school_id", "actor_id", "created_at");

-- CreateIndex
CREATE INDEX "result_operations_actor_id_idx" ON "result_operations"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_operations_id_school_id_key" ON "result_operations"("id", "school_id");

-- AddForeignKey
ALTER TABLE "result_templates" ADD CONSTRAINT "result_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_templates" ADD CONSTRAINT "result_template_latest_fk" FOREIGN KEY ("latest_version_id", "school_id", "id") REFERENCES "result_template_versions"("id", "school_id", "template_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_templates" ADD CONSTRAINT "result_template_active_fk" FOREIGN KEY ("active_version_id", "school_id", "id") REFERENCES "result_template_versions"("id", "school_id", "template_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_template_versions" ADD CONSTRAINT "result_template_versions_template_id_school_id_fkey" FOREIGN KEY ("template_id", "school_id") REFERENCES "result_templates"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_template_versions" ADD CONSTRAINT "result_template_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_scope_revisions" ADD CONSTRAINT "result_scope_revisions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_template_assignments" ADD CONSTRAINT "result_template_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_template_assignments" ADD CONSTRAINT "result_assignment_version_fk" FOREIGN KEY ("template_version_id", "school_id") REFERENCES "result_template_versions"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_template_assignments" ADD CONSTRAINT "result_assignment_base_version_fk" FOREIGN KEY ("base_template_version_id", "school_id") REFERENCES "result_template_versions"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_design_candidates" ADD CONSTRAINT "result_design_candidate_definition_fk" FOREIGN KEY ("definition_version_id", "school_id", "sheet_id") REFERENCES "result_sheet_definition_versions"("id", "school_id", "sheet_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_design_candidates" ADD CONSTRAINT "result_design_candidates_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_design_candidates" ADD CONSTRAINT "result_design_candidates_decision_actor_id_fkey" FOREIGN KEY ("decision_actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_configuration_previews" ADD CONSTRAINT "result_configuration_previews_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_configuration_previews" ADD CONSTRAINT "result_configuration_previews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_operations" ADD CONSTRAINT "result_operations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_operations" ADD CONSTRAINT "result_operations_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- PostgreSQL enforces the exact extension base and a single open design.
ALTER TABLE "result_template_assignments"
  ADD CONSTRAINT "result_assignment_mode_check" CHECK (
    ("mode" = 'EXTEND') = ("base_template_version_id" IS NOT NULL)
    AND "template_version_id" IS DISTINCT FROM "base_template_version_id"
    AND jsonb_typeof("selector") = 'object'
  );

CREATE UNIQUE INDEX result_one_open_design_per_sheet
  ON result_design_candidates(school_id, sheet_id) WHERE status = 'IN_REVIEW';

CREATE TRIGGER result_template_version_immutable
BEFORE UPDATE OR DELETE ON result_template_versions
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();

COMMIT;
