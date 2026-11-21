BEGIN;

-- CreateEnum
CREATE TYPE "result_reporting_period_kind" AS ENUM ('TERM', 'CUSTOM', 'YEAR');

-- CreateEnum
CREATE TYPE "result_reporting_period_class" AS ENUM ('PROGRESS', 'FINAL');

-- CreateEnum
CREATE TYPE "result_reporting_period_status" AS ENUM ('OPEN', 'ENTRY_CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "result_group_kind" AS ENUM ('SUBJECT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "result_field_kind" AS ENUM ('SCORE', 'PERCENTAGE', 'TEXT', 'SELECT', 'PASS_FAIL', 'BOOLEAN', 'CALCULATED');

-- CreateEnum
CREATE TYPE "result_field_access" AS ENUM ('INHERIT_SHEET', 'SCHOOL_ONLY', 'EXPLICIT_GRANT');

-- CreateEnum
CREATE TYPE "result_value_status" AS ENUM ('RECORDED', 'MISSING', 'ABSENT', 'EXCUSED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "result_pass_fail" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "result_audience" AS ENUM ('STAFF', 'STUDENT', 'PARENT');

-- CreateEnum
CREATE TYPE "result_roster_state" AS ENUM ('ELIGIBLE', 'RECONCILIATION_REQUIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "result_draft_change_source" AS ENUM ('GRID', 'IMPORT', 'DEFINITION_UPGRADE', 'ROSTER_RECONCILIATION');

-- CreateTable
CREATE TABLE "result_reporting_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID,
    "kind" "result_reporting_period_kind" NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name_ar" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "classification" "result_reporting_period_class" NOT NULL DEFAULT 'FINAL',
    "status" "result_reporting_period_status" NOT NULL DEFAULT 'OPEN',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_reporting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "subject_id" UUID,
    "kind" "result_group_kind" NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "label_ar" VARCHAR(200) NOT NULL,
    "label_en" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "archived_at" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_sheets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "reporting_period_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "draft_definition_version_id" UUID,
    "last_accepted_definition_version_id" UUID,
    "sheet_revision" INTEGER NOT NULL DEFAULT 1,
    "data_generation" INTEGER NOT NULL DEFAULT 0,
    "roster_generation" INTEGER NOT NULL DEFAULT 1,
    "roster_as_of" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_sheet_definition_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content_digest" CHAR(64) NOT NULL,
    "label_ar" VARCHAR(200) NOT NULL,
    "label_en" VARCHAR(200) NOT NULL,
    "configuration" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_sheet_definition_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_field_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "kind" "result_field_kind" NOT NULL,
    "semantic_purpose" VARCHAR(128) NOT NULL,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_field_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_release_unit_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "definition_version_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "label_ar" VARCHAR(200) NOT NULL,
    "label_en" VARCHAR(200) NOT NULL,
    "classification" "result_reporting_period_class" NOT NULL DEFAULT 'FINAL',
    "audiences" "result_audience"[],
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_release_unit_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_field_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "definition_version_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "release_unit_id" UUID,
    "kind" "result_field_kind" NOT NULL,
    "output_kind" "result_field_kind",
    "code" VARCHAR(64) NOT NULL,
    "label_ar" VARCHAR(200) NOT NULL,
    "label_en" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "audiences" "result_audience"[],
    "read_rule" "result_field_access" NOT NULL DEFAULT 'INHERIT_SHEET',
    "edit_rule" "result_field_access" NOT NULL DEFAULT 'INHERIT_SHEET',
    "constraints" JSONB NOT NULL,
    "formula" JSONB,
    "derived_disclosure" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "reporting_period_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "roster_state" "result_roster_state" NOT NULL DEFAULT 'ELIGIBLE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "publication_generation" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_cells" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "definition_version_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "field_kind" "result_field_kind" NOT NULL,
    "status" "result_value_status" NOT NULL,
    "numeric_value" DECIMAL(18,6),
    "text_value" VARCHAR(5000),
    "option_code" VARCHAR(64),
    "outcome" "result_pass_fail",
    "boolean_value" BOOLEAN,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_cells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_cell_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "cell_id" UUID NOT NULL,
    "definition_version_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "author_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "source" "result_draft_change_source" NOT NULL,
    "reason" VARCHAR(2000),
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_cell_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "result_reporting_periods_school_id_term_id_academic_year_id_idx" ON "result_reporting_periods"("school_id", "term_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "result_reporting_periods_school_id_status_starts_on_id_idx" ON "result_reporting_periods"("school_id", "status", "starts_on", "id");

-- CreateIndex
CREATE UNIQUE INDEX "result_reporting_periods_id_school_id_key" ON "result_reporting_periods"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_reporting_periods_school_id_academic_year_id_code_key" ON "result_reporting_periods"("school_id", "academic_year_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "result_groups_id_school_id_key" ON "result_groups"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_groups_school_id_code_key" ON "result_groups"("school_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "result_groups_school_id_subject_id_key" ON "result_groups"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "result_sheets_school_id_group_id_idx" ON "result_sheets"("school_id", "group_id");

-- CreateIndex
CREATE INDEX "result_sheets_school_id_classroom_id_idx" ON "result_sheets"("school_id", "classroom_id");

-- CreateIndex
CREATE INDEX "result_sheets_school_id_draft_definition_version_id_idx" ON "result_sheets"("school_id", "draft_definition_version_id");

-- CreateIndex
CREATE INDEX "result_sheet_accepted_definition_idx" ON "result_sheets"("school_id", "last_accepted_definition_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_sheets_id_school_id_key" ON "result_sheets"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_sheet_context_key" ON "result_sheets"("id", "school_id", "reporting_period_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_sheet_canonical_key" ON "result_sheets"("school_id", "reporting_period_id", "classroom_id", "group_id");

-- CreateIndex
CREATE INDEX "result_sheet_definition_versions_created_by_id_idx" ON "result_sheet_definition_versions"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_sheet_definition_versions_id_school_id_key" ON "result_sheet_definition_versions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_definition_sheet_key" ON "result_sheet_definition_versions"("id", "school_id", "sheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_definition_sheet_version_key" ON "result_sheet_definition_versions"("school_id", "sheet_id", "version");

-- CreateIndex
CREATE INDEX "result_field_identities_school_id_idx" ON "result_field_identities"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_field_identities_id_school_id_kind_key" ON "result_field_identities"("id", "school_id", "kind");

-- CreateIndex
CREATE INDEX "result_unit_definition_order_idx" ON "result_release_unit_definitions"("school_id", "definition_version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "result_unit_definition_identity_key" ON "result_release_unit_definitions"("definition_version_id", "school_id", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_unit_definition_code_key" ON "result_release_unit_definitions"("definition_version_id", "code");

-- CreateIndex
CREATE INDEX "result_field_definition_order_idx" ON "result_field_definitions"("school_id", "definition_version_id", "sort_order");

-- CreateIndex
CREATE INDEX "result_field_definitions_school_id_field_id_kind_idx" ON "result_field_definitions"("school_id", "field_id", "kind");

-- CreateIndex
CREATE INDEX "result_field_definition_release_idx" ON "result_field_definitions"("school_id", "definition_version_id", "release_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_field_definitions_definition_version_id_field_id_key" ON "result_field_definitions"("definition_version_id", "field_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_field_definitions_definition_version_id_code_key" ON "result_field_definitions"("definition_version_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "result_field_definition_typed_key" ON "result_field_definitions"("definition_version_id", "school_id", "field_id", "kind");

-- CreateIndex
CREATE INDEX "result_slots_school_id_reporting_period_id_group_id_idx" ON "result_slots"("school_id", "reporting_period_id", "group_id");

-- CreateIndex
CREATE INDEX "result_slots_school_id_group_id_idx" ON "result_slots"("school_id", "group_id");

-- CreateIndex
CREATE INDEX "result_slots_school_id_sheet_id_id_idx" ON "result_slots"("school_id", "sheet_id", "id");

-- CreateIndex
CREATE INDEX "result_slots_school_id_enrollment_id_student_id_idx" ON "result_slots"("school_id", "enrollment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_slots_id_school_id_key" ON "result_slots"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_slot_canonical_key" ON "result_slots"("school_id", "student_id", "reporting_period_id", "group_id");

-- CreateIndex
CREATE INDEX "result_cell_definition_idx" ON "result_cells"("school_id", "definition_version_id", "field_id", "field_kind");

-- CreateIndex
CREATE INDEX "result_cells_school_id_updated_at_id_idx" ON "result_cells"("school_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "result_cells_updated_by_id_idx" ON "result_cells"("updated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_cells_id_school_id_key" ON "result_cells"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_cell_identity_key" ON "result_cells"("school_id", "slot_id", "field_id");

-- CreateIndex
CREATE INDEX "result_cell_revisions_school_id_operation_id_idx" ON "result_cell_revisions"("school_id", "operation_id");

-- CreateIndex
CREATE INDEX "result_cell_revisions_school_id_definition_version_id_idx" ON "result_cell_revisions"("school_id", "definition_version_id");

-- CreateIndex
CREATE INDEX "result_cell_revisions_author_id_idx" ON "result_cell_revisions"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_cell_revisions_school_id_cell_id_version_key" ON "result_cell_revisions"("school_id", "cell_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "term_year_school_identity_key" ON "terms"("id", "school_id", "academic_year_id");

-- AddForeignKey
ALTER TABLE "result_reporting_periods" ADD CONSTRAINT "result_reporting_periods_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_reporting_periods" ADD CONSTRAINT "result_reporting_periods_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_reporting_periods" ADD CONSTRAINT "result_reporting_periods_term_id_school_id_academic_year_i_fkey" FOREIGN KEY ("term_id", "school_id", "academic_year_id") REFERENCES "terms"("id", "school_id", "academic_year_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_groups" ADD CONSTRAINT "result_groups_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_groups" ADD CONSTRAINT "result_groups_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_reporting_period_id_school_id_fkey" FOREIGN KEY ("reporting_period_id", "school_id") REFERENCES "result_reporting_periods"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_group_id_school_id_fkey" FOREIGN KEY ("group_id", "school_id") REFERENCES "result_groups"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheet_draft_definition_fk" FOREIGN KEY ("draft_definition_version_id", "school_id", "id") REFERENCES "result_sheet_definition_versions"("id", "school_id", "sheet_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheet_accepted_definition_fk" FOREIGN KEY ("last_accepted_definition_version_id", "school_id", "id") REFERENCES "result_sheet_definition_versions"("id", "school_id", "sheet_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_sheet_definition_versions" ADD CONSTRAINT "result_sheet_definition_versions_sheet_id_school_id_fkey" FOREIGN KEY ("sheet_id", "school_id") REFERENCES "result_sheets"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_sheet_definition_versions" ADD CONSTRAINT "result_sheet_definition_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_field_identities" ADD CONSTRAINT "result_field_identities_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_release_unit_definitions" ADD CONSTRAINT "result_unit_definition_fk" FOREIGN KEY ("definition_version_id", "school_id") REFERENCES "result_sheet_definition_versions"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_field_definitions" ADD CONSTRAINT "result_field_definition_fk" FOREIGN KEY ("definition_version_id", "school_id") REFERENCES "result_sheet_definition_versions"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_field_definitions" ADD CONSTRAINT "result_field_definitions_field_id_school_id_kind_fkey" FOREIGN KEY ("field_id", "school_id", "kind") REFERENCES "result_field_identities"("id", "school_id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_field_definitions" ADD CONSTRAINT "result_field_release_unit_fk" FOREIGN KEY ("definition_version_id", "school_id", "release_unit_id") REFERENCES "result_release_unit_definitions"("definition_version_id", "school_id", "unit_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_slots" ADD CONSTRAINT "result_slots_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_slots" ADD CONSTRAINT "result_slots_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_slots" ADD CONSTRAINT "result_slots_reporting_period_id_school_id_fkey" FOREIGN KEY ("reporting_period_id", "school_id") REFERENCES "result_reporting_periods"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_slots" ADD CONSTRAINT "result_slots_group_id_school_id_fkey" FOREIGN KEY ("group_id", "school_id") REFERENCES "result_groups"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_slots" ADD CONSTRAINT "result_slot_sheet_context_fk" FOREIGN KEY ("sheet_id", "school_id", "reporting_period_id", "group_id") REFERENCES "result_sheets"("id", "school_id", "reporting_period_id", "group_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_slots" ADD CONSTRAINT "result_slot_enrollment_student_fk" FOREIGN KEY ("enrollment_id", "school_id", "student_id") REFERENCES "student_enrollments"("id", "school_id", "student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_cells" ADD CONSTRAINT "result_cells_slot_id_school_id_fkey" FOREIGN KEY ("slot_id", "school_id") REFERENCES "result_slots"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_cells" ADD CONSTRAINT "result_cell_typed_definition_fk" FOREIGN KEY ("definition_version_id", "school_id", "field_id", "field_kind") REFERENCES "result_field_definitions"("definition_version_id", "school_id", "field_id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_cells" ADD CONSTRAINT "result_cells_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_cell_revisions" ADD CONSTRAINT "result_cell_revisions_cell_id_school_id_fkey" FOREIGN KEY ("cell_id", "school_id") REFERENCES "result_cells"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_cell_revisions" ADD CONSTRAINT "result_revision_definition_fk" FOREIGN KEY ("definition_version_id", "school_id") REFERENCES "result_sheet_definition_versions"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_cell_revisions" ADD CONSTRAINT "result_cell_revisions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- The following domain checks, append-only rules and the deferred sheet
-- constraint are PostgreSQL-specific. Prisma models the relational keys above.
ALTER TABLE "result_reporting_periods"
  ADD CONSTRAINT "result_period_dates_check" CHECK ("starts_on" <= "ends_on"),
  ADD CONSTRAINT "result_period_term_kind_check" CHECK (
    ("kind" = 'YEAR') = ("term_id" IS NULL)
  );

-- PostgreSQL allows multiple nulls in the subject unique key. Only CUSTOM
-- groups use null, and the separate school/code key identifies those groups.
ALTER TABLE "result_groups"
  ADD CONSTRAINT "result_group_subject_kind_check" CHECK (
    ("kind" = 'SUBJECT') = ("subject_id" IS NOT NULL)
  );

ALTER TABLE "result_field_definitions"
  ADD CONSTRAINT "result_field_formula_kind_check" CHECK (
    ("kind" = 'CALCULATED' AND "output_kind" IN ('SCORE','PERCENTAGE','SELECT','PASS_FAIL')
      AND "output_kind" IS NOT NULL AND "formula" IS NOT NULL AND jsonb_typeof("formula") = 'object')
    OR ("kind" <> 'CALCULATED' AND "output_kind" IS NULL AND "formula" IS NULL)
  );

ALTER TABLE "result_cells"
  ADD CONSTRAINT "result_cell_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "result_cell_typed_value_check" CHECK (
    "field_kind" <> 'CALCULATED'
    AND CASE WHEN "status" = 'RECORDED' THEN
      num_nonnulls("numeric_value", "text_value", "option_code", "outcome", "boolean_value") = 1
      AND CASE "field_kind"
        WHEN 'SCORE' THEN "numeric_value" IS NOT NULL AND "numeric_value" <> 'NaN'::numeric
        WHEN 'PERCENTAGE' THEN "numeric_value" IS NOT NULL AND "numeric_value" <> 'NaN'::numeric
        WHEN 'TEXT' THEN "text_value" IS NOT NULL AND "text_value" <> ''
        WHEN 'SELECT' THEN "option_code" IS NOT NULL AND "option_code" <> ''
        WHEN 'PASS_FAIL' THEN "outcome" IS NOT NULL
        WHEN 'BOOLEAN' THEN "boolean_value" IS NOT NULL
        ELSE false
      END
    ELSE num_nonnulls("numeric_value", "text_value", "option_code", "outcome", "boolean_value") = 0
    END
  );

CREATE FUNCTION official_results_require_sheet_definition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM result_sheets
    WHERE id = NEW.id AND school_id = NEW.school_id
      AND draft_definition_version_id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      CONSTRAINT = 'result_sheet_requires_draft_definition',
      MESSAGE = 'An Official Results sheet requires a draft definition';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER result_sheet_requires_draft_definition
AFTER INSERT OR UPDATE OF draft_definition_version_id ON result_sheets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION official_results_require_sheet_definition();

CREATE FUNCTION official_results_preserve_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514',
    MESSAGE = 'Official Results version history is immutable';
END;
$$;

CREATE TRIGGER result_sheet_definition_immutable
BEFORE UPDATE OR DELETE ON result_sheet_definition_versions
FOR EACH ROW EXECUTE FUNCTION official_results_preserve_version();

CREATE TRIGGER result_release_unit_definition_immutable
BEFORE UPDATE OR DELETE ON result_release_unit_definitions
FOR EACH ROW EXECUTE FUNCTION official_results_preserve_version();

CREATE TRIGGER result_field_definition_immutable
BEFORE UPDATE OR DELETE ON result_field_definitions
FOR EACH ROW EXECUTE FUNCTION official_results_preserve_version();

CREATE TRIGGER result_cell_revision_immutable
BEFORE UPDATE OR DELETE ON result_cell_revisions
FOR EACH ROW EXECUTE FUNCTION official_results_preserve_version();

COMMIT;
