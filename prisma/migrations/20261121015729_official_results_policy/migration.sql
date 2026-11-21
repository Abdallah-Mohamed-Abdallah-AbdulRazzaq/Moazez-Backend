BEGIN;

-- CreateEnum
CREATE TYPE "result_grant_action" AS ENUM ('VIEW', 'DESIGN', 'EDIT', 'IMPORT', 'EXPORT', 'SUBMIT', 'PUBLISH', 'REQUEST_CORRECTION', 'PUBLISH_CORRECTION');

-- CreateTable
CREATE TABLE "official_result_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "active_version_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_result_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_result_policy_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "configuration" JSONB NOT NULL,
    "content_digest" CHAR(64) NOT NULL,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_result_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_policy_previews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "expected_policy_version_id" UUID,
    "proposal" JSONB NOT NULL,
    "impact" JSONB NOT NULL,
    "digest" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_policy_previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_result_scope_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "grantee_user_id" UUID,
    "grantee_role_id" UUID,
    "reporting_period_ids" UUID[],
    "group_ids" UUID[],
    "classroom_ids" UUID[],
    "field_ids" UUID[],
    "actions" "result_grant_action"[],
    "issuer_id" UUID NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" UUID,
    "revocation_reason" VARCHAR(2000),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_result_scope_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_correction_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "reporting_period_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "release_unit_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "issuer_id" UUID NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_correction_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_command_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "operation" VARCHAR(128) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "outcome" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_command_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "official_result_policies_school_id_key" ON "official_result_policies"("school_id");

-- CreateIndex
CREATE INDEX "official_result_policies_school_id_active_version_id_idx" ON "official_result_policies"("school_id", "active_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "official_result_policies_id_school_id_key" ON "official_result_policies"("id", "school_id");

-- CreateIndex
CREATE INDEX "official_result_policy_versions_author_id_idx" ON "official_result_policy_versions"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "official_result_policy_versions_id_school_id_key" ON "official_result_policy_versions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_policy_owned_version_key" ON "official_result_policy_versions"("id", "school_id", "policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_policy_revision_key" ON "official_result_policy_versions"("school_id", "policy_id", "revision");

-- CreateIndex
CREATE INDEX "result_policy_previews_school_id_author_id_expires_at_idx" ON "result_policy_previews"("school_id", "author_id", "expires_at");

-- CreateIndex
CREATE INDEX "result_policy_previews_school_id_expected_policy_version_id_idx" ON "result_policy_previews"("school_id", "expected_policy_version_id");

-- CreateIndex
CREATE INDEX "result_policy_previews_author_id_idx" ON "result_policy_previews"("author_id");

-- CreateIndex
CREATE INDEX "result_scope_grant_user_idx" ON "official_result_scope_grants"("school_id", "grantee_user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "result_scope_grant_role_idx" ON "official_result_scope_grants"("school_id", "grantee_role_id", "revoked_at");

-- CreateIndex
CREATE INDEX "official_result_scope_grants_school_id_created_at_id_idx" ON "official_result_scope_grants"("school_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "official_result_scope_grants_grantee_user_id_idx" ON "official_result_scope_grants"("grantee_user_id");

-- CreateIndex
CREATE INDEX "official_result_scope_grants_grantee_role_id_idx" ON "official_result_scope_grants"("grantee_role_id");

-- CreateIndex
CREATE INDEX "official_result_scope_grants_issuer_id_idx" ON "official_result_scope_grants"("issuer_id");

-- CreateIndex
CREATE INDEX "official_result_scope_grants_revoked_by_id_idx" ON "official_result_scope_grants"("revoked_by_id");

-- CreateIndex
CREATE INDEX "result_correction_windows_school_id_slot_id_reporting_perio_idx" ON "result_correction_windows"("school_id", "slot_id", "reporting_period_id");

-- CreateIndex
CREATE INDEX "result_correction_window_active_idx" ON "result_correction_windows"("school_id", "actor_id", "slot_id", "release_unit_id", "expires_at");

-- CreateIndex
CREATE INDEX "result_correction_windows_actor_id_idx" ON "result_correction_windows"("actor_id");

-- CreateIndex
CREATE INDEX "result_correction_windows_issuer_id_idx" ON "result_correction_windows"("issuer_id");

-- CreateIndex
CREATE INDEX "result_command_receipts_actor_id_idx" ON "result_command_receipts"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_command_scope_key" ON "result_command_receipts"("school_id", "actor_id", "operation", "key");

-- CreateIndex
CREATE UNIQUE INDEX "result_slot_period_key" ON "result_slots"("id", "school_id", "reporting_period_id");

-- AddForeignKey
ALTER TABLE "official_result_policies" ADD CONSTRAINT "official_result_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "official_result_policies" ADD CONSTRAINT "result_policy_active_version_fk" FOREIGN KEY ("active_version_id", "school_id", "id") REFERENCES "official_result_policy_versions"("id", "school_id", "policy_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "official_result_policy_versions" ADD CONSTRAINT "official_result_policy_versions_policy_id_school_id_fkey" FOREIGN KEY ("policy_id", "school_id") REFERENCES "official_result_policies"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "official_result_policy_versions" ADD CONSTRAINT "official_result_policy_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_policy_previews" ADD CONSTRAINT "result_policy_previews_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_policy_previews" ADD CONSTRAINT "result_policy_previews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_policy_previews" ADD CONSTRAINT "result_policy_preview_version_fk" FOREIGN KEY ("expected_policy_version_id", "school_id") REFERENCES "official_result_policy_versions"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "official_result_scope_grants" ADD CONSTRAINT "official_result_scope_grants_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "official_result_scope_grants" ADD CONSTRAINT "official_result_scope_grants_grantee_user_id_fkey" FOREIGN KEY ("grantee_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "official_result_scope_grants" ADD CONSTRAINT "official_result_scope_grants_grantee_role_id_fkey" FOREIGN KEY ("grantee_role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "official_result_scope_grants" ADD CONSTRAINT "official_result_scope_grants_issuer_id_fkey" FOREIGN KEY ("issuer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "official_result_scope_grants" ADD CONSTRAINT "official_result_scope_grants_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_correction_windows" ADD CONSTRAINT "result_correction_windows_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_correction_windows" ADD CONSTRAINT "result_correction_window_slot_fk" FOREIGN KEY ("slot_id", "school_id", "reporting_period_id") REFERENCES "result_slots"("id", "school_id", "reporting_period_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_correction_windows" ADD CONSTRAINT "result_correction_windows_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_correction_windows" ADD CONSTRAINT "result_correction_windows_issuer_id_fkey" FOREIGN KEY ("issuer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_command_receipts" ADD CONSTRAINT "result_command_receipts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_command_receipts" ADD CONSTRAINT "result_command_receipts_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Cross-column and immutability rules use PostgreSQL checks and the existing
-- Official Results append-only trigger function.
ALTER TABLE "official_result_policy_versions"
  ADD CONSTRAINT "result_policy_payload_check" CHECK (
    "revision" >= 1 AND jsonb_typeof("configuration") = 'object'
  );

ALTER TABLE "official_result_scope_grants"
  ADD CONSTRAINT "result_scope_grant_shape_check" CHECK ((
    num_nonnulls("grantee_user_id", "grantee_role_id") = 1
    AND cardinality("reporting_period_ids") > 0
    AND cardinality("group_ids") > 0
    AND cardinality("classroom_ids") > 0
    AND "field_ids" IS NOT NULL
    AND cardinality("actions") > 0
    AND ("expires_at" IS NULL OR "expires_at" > "starts_at")
    AND num_nonnulls("revoked_at", "revoked_by_id", "revocation_reason") IN (0, 3)
    AND "revision" >= 1
  ) IS TRUE);

CREATE TRIGGER result_policy_version_immutable
BEFORE UPDATE OR DELETE ON official_result_policy_versions
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();

CREATE TRIGGER result_command_receipt_immutable
BEFORE UPDATE OR DELETE ON result_command_receipts
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();

COMMIT;
