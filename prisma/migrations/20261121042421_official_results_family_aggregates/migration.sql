BEGIN;

-- CreateTable
CREATE TABLE "result_read_entitlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "relationship_id" UUID,
    "issued_from_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" UUID,
    "revoke_reason" VARCHAR(2000),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_read_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_aggregate_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_aggregate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_aggregate_profile_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_aggregate_profile_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_aggregate_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "reporting_period_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "profile_version_id" UUID NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "policy_version_id" UUID,
    "content_digest" CHAR(64) NOT NULL,
    "source_publication_ids" UUID[],
    "computed_result" JSONB NOT NULL,
    "status" "result_release_candidate_status" NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_aggregate_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_aggregate_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "candidate_revision" INTEGER NOT NULL,
    "content_digest" CHAR(64) NOT NULL,
    "decision" "result_review_choice" NOT NULL,
    "comment" VARCHAR(2000),
    "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_aggregate_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_aggregate_dependencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,

    CONSTRAINT "result_aggregate_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_aggregate_publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "reporting_period_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_aggregate_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_current_aggregates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "reporting_period_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_current_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "result_read_entitlements_actor_id_revoked_at_school_id_idx" ON "result_read_entitlements"("actor_id", "revoked_at", "school_id");

-- CreateIndex
CREATE INDEX "result_read_entitlements_issued_from_id_school_id_idx" ON "result_read_entitlements"("issued_from_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_read_entitlements_school_id_student_id_actor_id_key" ON "result_read_entitlements"("school_id", "student_id", "actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_aggregate_profiles_id_school_id_key" ON "result_aggregate_profiles"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_aggregate_profiles_school_id_code_key" ON "result_aggregate_profiles"("school_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "result_aggregate_profile_versions_id_school_id_key" ON "result_aggregate_profile_versions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_aggregate_profile_versions_id_school_id_profile_id_key" ON "result_aggregate_profile_versions"("id", "school_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_aggregate_profile_versions_school_id_profile_id_revi_key" ON "result_aggregate_profile_versions"("school_id", "profile_id", "revision");

-- CreateIndex
CREATE INDEX "result_aggregate_candidates_school_id_reporting_period_id_s_idx" ON "result_aggregate_candidates"("school_id", "reporting_period_id", "student_id", "profile_id");

-- CreateIndex
CREATE INDEX "result_aggregate_candidates_school_id_status_created_at_idx" ON "result_aggregate_candidates"("school_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "result_aggregate_candidates_profile_version_id_school_id_pr_idx" ON "result_aggregate_candidates"("profile_version_id", "school_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_aggregate_candidates_id_school_id_key" ON "result_aggregate_candidates"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_aggregate_candidates_id_school_id_student_id_reporti_key" ON "result_aggregate_candidates"("id", "school_id", "student_id", "reporting_period_id", "profile_id");

-- CreateIndex
CREATE INDEX "result_aggregate_decisions_reviewer_id_idx" ON "result_aggregate_decisions"("reviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_aggregate_decisions_candidate_id_school_id_key" ON "result_aggregate_decisions"("candidate_id", "school_id");

-- CreateIndex
CREATE INDEX "result_aggregate_dependencies_school_id_publication_id_cand_idx" ON "result_aggregate_dependencies"("school_id", "publication_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_aggregate_dependencies_school_id_candidate_id_public_key" ON "result_aggregate_dependencies"("school_id", "candidate_id", "publication_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_aggregate_publication_candidate_key" ON "result_aggregate_publications"("candidate_id", "school_id", "student_id", "reporting_period_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_aggregate_publication_key" ON "result_aggregate_publications"("id", "school_id", "student_id", "reporting_period_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_aggregate_publication_revision_key" ON "result_aggregate_publications"("school_id", "student_id", "reporting_period_id", "profile_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "result_current_aggregates_school_id_student_id_reporting_pe_key" ON "result_current_aggregates"("school_id", "student_id", "reporting_period_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_current_aggregate_publication_key" ON "result_current_aggregates"("publication_id", "school_id", "student_id", "reporting_period_id", "profile_id");

-- AddForeignKey
ALTER TABLE "result_read_entitlements" ADD CONSTRAINT "result_read_entitlements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_read_entitlements" ADD CONSTRAINT "result_read_entitlements_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_read_entitlements" ADD CONSTRAINT "result_read_entitlements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_read_entitlements" ADD CONSTRAINT "result_read_entitlements_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_read_entitlements" ADD CONSTRAINT "result_read_entitlements_issued_from_id_school_id_fkey" FOREIGN KEY ("issued_from_id", "school_id") REFERENCES "result_publications"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_aggregate_profiles" ADD CONSTRAINT "result_aggregate_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_aggregate_profile_versions" ADD CONSTRAINT "result_aggregate_profile_versions_profile_id_school_id_fkey" FOREIGN KEY ("profile_id", "school_id") REFERENCES "result_aggregate_profiles"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_aggregate_candidates" ADD CONSTRAINT "result_aggregate_candidates_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_aggregate_candidates" ADD CONSTRAINT "result_aggregate_candidates_reporting_period_id_school_id_fkey" FOREIGN KEY ("reporting_period_id", "school_id") REFERENCES "result_reporting_periods"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_aggregate_candidates" ADD CONSTRAINT "result_aggregate_candidates_profile_version_id_school_id_p_fkey" FOREIGN KEY ("profile_version_id", "school_id", "profile_id") REFERENCES "result_aggregate_profile_versions"("id", "school_id", "profile_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_aggregate_candidates" ADD CONSTRAINT "result_aggregate_candidates_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_aggregate_decisions" ADD CONSTRAINT "result_aggregate_decisions_candidate_id_school_id_fkey" FOREIGN KEY ("candidate_id", "school_id") REFERENCES "result_aggregate_candidates"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_aggregate_decisions" ADD CONSTRAINT "result_aggregate_decisions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_aggregate_dependencies" ADD CONSTRAINT "result_aggregate_dependencies_candidate_id_school_id_fkey" FOREIGN KEY ("candidate_id", "school_id") REFERENCES "result_aggregate_candidates"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_aggregate_dependencies" ADD CONSTRAINT "result_aggregate_dependencies_publication_id_school_id_fkey" FOREIGN KEY ("publication_id", "school_id") REFERENCES "result_publications"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_aggregate_publications" ADD CONSTRAINT "result_aggregate_publication_candidate_fk" FOREIGN KEY ("candidate_id", "school_id", "student_id", "reporting_period_id", "profile_id") REFERENCES "result_aggregate_candidates"("id", "school_id", "student_id", "reporting_period_id", "profile_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_current_aggregates" ADD CONSTRAINT "result_current_aggregate_publication_fk" FOREIGN KEY ("publication_id", "school_id", "student_id", "reporting_period_id", "profile_id") REFERENCES "result_aggregate_publications"("id", "school_id", "student_id", "reporting_period_id", "profile_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE result_read_entitlements ADD CONSTRAINT result_entitlement_revocation_check CHECK (
 (revoked_at IS NULL AND revoked_by_id IS NULL AND revoke_reason IS NULL)
 OR (revoked_at IS NOT NULL AND revoked_by_id IS NOT NULL AND nullif(btrim(revoke_reason), '') IS NOT NULL)
);
ALTER TABLE result_aggregate_candidates ADD CONSTRAINT result_aggregate_candidate_payload_check CHECK (
 revision >= 1 AND content_digest ~ '^[0-9a-f]{64}$' AND jsonb_typeof(computed_result) = 'object'
);
CREATE TRIGGER result_aggregate_profile_version_immutable BEFORE UPDATE OR DELETE ON result_aggregate_profile_versions
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();
CREATE TRIGGER result_aggregate_decision_immutable BEFORE UPDATE OR DELETE ON result_aggregate_decisions
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();
CREATE TRIGGER result_aggregate_publication_immutable BEFORE UPDATE OR DELETE ON result_aggregate_publications
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();
CREATE TRIGGER result_aggregate_dependency_immutable BEFORE UPDATE OR DELETE ON result_aggregate_dependencies
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();

COMMIT;
