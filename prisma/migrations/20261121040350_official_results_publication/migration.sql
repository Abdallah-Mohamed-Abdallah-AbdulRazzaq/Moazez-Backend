BEGIN;

-- CreateEnum
CREATE TYPE "result_release_intent" AS ENUM ('REVIEW', 'DIRECT_PUBLICATION');

-- CreateEnum
CREATE TYPE "result_release_candidate_status" AS ENUM ('SUBMITTED', 'READY_FOR_DIRECT', 'APPROVED', 'RETURNED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "result_review_choice" AS ENUM ('APPROVE', 'RETURN');

-- CreateEnum
CREATE TYPE "result_release_authorization" AS ENUM ('APPROVED', 'DIRECT', 'APPROVE_AND_PUBLISH');

-- CreateEnum
CREATE TYPE "result_release_event_type" AS ENUM ('PUBLISHED', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "result_notice_status" AS ENUM ('PENDING', 'DELIVERED', 'SKIPPED', 'FAILED');

-- AlterEnum
ALTER TYPE "result_configuration_preview_kind" ADD VALUE 'PUBLICATION_TOPOLOGY';

-- CreateTable
CREATE TABLE "result_release_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "definition_version_id" UUID NOT NULL,
    "release_unit_id" UUID NOT NULL,
    "policy_version_id" UUID,
    "correction_draft_id" UUID,
    "submitted_by_id" UUID NOT NULL,
    "intent" "result_release_intent" NOT NULL,
    "content_digest" CHAR(64) NOT NULL,
    "source_fingerprint" CHAR(64) NOT NULL,
    "captured_slot_revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_release_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_release_candidate_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "status" "result_release_candidate_status" NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_release_candidate_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_review_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "candidate_revision" INTEGER NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "policy_version_id" UUID,
    "content_digest" CHAR(64) NOT NULL,
    "decision" "result_review_choice" NOT NULL,
    "comment" VARCHAR(2000),
    "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "release_unit_id" UUID NOT NULL,
    "definition_version_id" UUID NOT NULL,
    "predecessor_id" UUID,
    "review_decision_id" UUID,
    "policy_version_id" UUID,
    "published_by_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "publication_generation" INTEGER NOT NULL,
    "authorization_mode" "result_release_authorization" NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_current_releases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "release_unit_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_current_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_release_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "publication_generation" INTEGER NOT NULL,
    "event" "result_release_event_type" NOT NULL,
    "reason" VARCHAR(2000),
    "replacement_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_release_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_correction_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "previous_publication_id" UUID NOT NULL,
    "opened_by_id" UUID NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_correction_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_publication_notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "status" "result_notice_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_publication_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "result_release_candidates_school_id_slot_id_release_unit_id_idx" ON "result_release_candidates"("school_id", "slot_id", "release_unit_id", "submitted_at");

-- CreateIndex
CREATE INDEX "result_release_candidates_school_id_sheet_id_submitted_at_idx" ON "result_release_candidates"("school_id", "sheet_id", "submitted_at");

-- CreateIndex
CREATE INDEX "result_release_candidates_definition_version_id_school_id_s_idx" ON "result_release_candidates"("definition_version_id", "school_id", "sheet_id");

-- CreateIndex
CREATE INDEX "result_release_candidates_definition_version_id_school_id_r_idx" ON "result_release_candidates"("definition_version_id", "school_id", "release_unit_id");

-- CreateIndex
CREATE INDEX "result_release_candidates_policy_version_id_school_id_idx" ON "result_release_candidates"("policy_version_id", "school_id");

-- CreateIndex
CREATE INDEX "result_release_candidates_correction_draft_id_school_id_slo_idx" ON "result_release_candidates"("correction_draft_id", "school_id", "slot_id");

-- CreateIndex
CREATE INDEX "result_release_candidates_submitted_by_id_idx" ON "result_release_candidates"("submitted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_release_candidates_id_school_id_key" ON "result_release_candidates"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_candidate_frozen_target_key" ON "result_release_candidates"("id", "school_id", "slot_id", "release_unit_id", "definition_version_id");

-- CreateIndex
CREATE INDEX "result_release_candidate_states_school_id_status_updated_at_idx" ON "result_release_candidate_states"("school_id", "status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "result_release_candidate_states_candidate_id_school_id_key" ON "result_release_candidate_states"("candidate_id", "school_id");

-- CreateIndex
CREATE INDEX "result_review_decisions_school_id_decided_at_id_idx" ON "result_review_decisions"("school_id", "decided_at", "id");

-- CreateIndex
CREATE INDEX "result_review_decisions_reviewer_id_idx" ON "result_review_decisions"("reviewer_id");

-- CreateIndex
CREATE INDEX "result_review_decisions_policy_version_id_school_id_idx" ON "result_review_decisions"("policy_version_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_review_decisions_candidate_id_school_id_key" ON "result_review_decisions"("candidate_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_review_decisions_id_school_id_candidate_id_key" ON "result_review_decisions"("id", "school_id", "candidate_id");

-- CreateIndex
CREATE INDEX "result_publications_school_id_slot_id_published_at_idx" ON "result_publications"("school_id", "slot_id", "published_at");

-- CreateIndex
CREATE INDEX "result_publications_predecessor_id_school_id_slot_id_releas_idx" ON "result_publications"("predecessor_id", "school_id", "slot_id", "release_unit_id");

-- CreateIndex
CREATE INDEX "result_publications_policy_version_id_school_id_idx" ON "result_publications"("policy_version_id", "school_id");

-- CreateIndex
CREATE INDEX "result_publications_published_by_id_idx" ON "result_publications"("published_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_publications_id_school_id_key" ON "result_publications"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_publication_slot_key" ON "result_publications"("id", "school_id", "slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_publication_unit_key" ON "result_publications"("id", "school_id", "slot_id", "release_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_publication_candidate_key" ON "result_publications"("candidate_id", "school_id", "slot_id", "release_unit_id", "definition_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_publication_decision_key" ON "result_publications"("review_decision_id", "school_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_publication_slot_revision_key" ON "result_publications"("school_id", "slot_id", "release_unit_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "result_current_releases_school_id_slot_id_release_unit_id_key" ON "result_current_releases"("school_id", "slot_id", "release_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_current_releases_publication_id_school_id_slot_id_re_key" ON "result_current_releases"("publication_id", "school_id", "slot_id", "release_unit_id");

-- CreateIndex
CREATE INDEX "result_release_events_school_id_slot_id_recorded_at_idx" ON "result_release_events"("school_id", "slot_id", "recorded_at");

-- CreateIndex
CREATE INDEX "result_release_events_actor_id_idx" ON "result_release_events"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_release_events_school_id_publication_id_event_key" ON "result_release_events"("school_id", "publication_id", "event");

-- CreateIndex
CREATE INDEX "result_correction_drafts_school_id_slot_id_opened_at_idx" ON "result_correction_drafts"("school_id", "slot_id", "opened_at");

-- CreateIndex
CREATE INDEX "result_correction_drafts_opened_by_id_idx" ON "result_correction_drafts"("opened_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_correction_drafts_id_school_id_slot_id_key" ON "result_correction_drafts"("id", "school_id", "slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_correction_drafts_previous_publication_id_school_id__key" ON "result_correction_drafts"("previous_publication_id", "school_id", "slot_id");

-- CreateIndex
CREATE INDEX "result_publication_notices_school_id_status_created_at_idx" ON "result_publication_notices"("school_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "result_publication_notices_publication_id_school_id_key" ON "result_publication_notices"("publication_id", "school_id");

-- AddForeignKey
ALTER TABLE "result_release_candidates" ADD CONSTRAINT "result_release_candidates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_release_candidates" ADD CONSTRAINT "result_release_candidates_slot_id_school_id_fkey" FOREIGN KEY ("slot_id", "school_id") REFERENCES "result_slots"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_release_candidates" ADD CONSTRAINT "result_candidate_schema_fk" FOREIGN KEY ("definition_version_id", "school_id", "sheet_id") REFERENCES "result_sheet_definition_versions"("id", "school_id", "sheet_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_release_candidates" ADD CONSTRAINT "result_candidate_release_unit_fk" FOREIGN KEY ("definition_version_id", "school_id", "release_unit_id") REFERENCES "result_release_unit_definitions"("definition_version_id", "school_id", "unit_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_release_candidates" ADD CONSTRAINT "result_release_candidates_policy_version_id_school_id_fkey" FOREIGN KEY ("policy_version_id", "school_id") REFERENCES "official_result_policy_versions"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_release_candidates" ADD CONSTRAINT "result_release_candidates_correction_draft_id_school_id_sl_fkey" FOREIGN KEY ("correction_draft_id", "school_id", "slot_id") REFERENCES "result_correction_drafts"("id", "school_id", "slot_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_release_candidates" ADD CONSTRAINT "result_release_candidates_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_release_candidate_states" ADD CONSTRAINT "result_release_candidate_states_candidate_id_school_id_fkey" FOREIGN KEY ("candidate_id", "school_id") REFERENCES "result_release_candidates"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_review_decisions" ADD CONSTRAINT "result_review_decisions_candidate_id_school_id_fkey" FOREIGN KEY ("candidate_id", "school_id") REFERENCES "result_release_candidates"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_review_decisions" ADD CONSTRAINT "result_review_decisions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_review_decisions" ADD CONSTRAINT "result_review_decisions_policy_version_id_school_id_fkey" FOREIGN KEY ("policy_version_id", "school_id") REFERENCES "official_result_policy_versions"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publication_candidate_fk" FOREIGN KEY ("candidate_id", "school_id", "slot_id", "release_unit_id", "definition_version_id") REFERENCES "result_release_candidates"("id", "school_id", "slot_id", "release_unit_id", "definition_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_slot_id_school_id_fkey" FOREIGN KEY ("slot_id", "school_id") REFERENCES "result_slots"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publication_predecessor_fk" FOREIGN KEY ("predecessor_id", "school_id", "slot_id", "release_unit_id") REFERENCES "result_publications"("id", "school_id", "slot_id", "release_unit_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publication_decision_fk" FOREIGN KEY ("review_decision_id", "school_id", "candidate_id") REFERENCES "result_review_decisions"("id", "school_id", "candidate_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_policy_version_id_school_id_fkey" FOREIGN KEY ("policy_version_id", "school_id") REFERENCES "official_result_policy_versions"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_current_releases" ADD CONSTRAINT "result_current_release_publication_fk" FOREIGN KEY ("publication_id", "school_id", "slot_id", "release_unit_id") REFERENCES "result_publications"("id", "school_id", "slot_id", "release_unit_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_release_events" ADD CONSTRAINT "result_release_events_publication_id_school_id_slot_id_fkey" FOREIGN KEY ("publication_id", "school_id", "slot_id") REFERENCES "result_publications"("id", "school_id", "slot_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_release_events" ADD CONSTRAINT "result_release_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_correction_drafts" ADD CONSTRAINT "result_correction_drafts_previous_publication_id_school_id_fkey" FOREIGN KEY ("previous_publication_id", "school_id", "slot_id") REFERENCES "result_publications"("id", "school_id", "slot_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_correction_drafts" ADD CONSTRAINT "result_correction_drafts_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_publication_notices" ADD CONSTRAINT "result_publication_notices_publication_id_school_id_fkey" FOREIGN KEY ("publication_id", "school_id") REFERENCES "result_publications"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE result_release_candidates ADD CONSTRAINT result_candidate_frozen_payload_check CHECK (
  captured_slot_revision >= 1 AND jsonb_typeof(snapshot) = 'object'
  AND content_digest ~ '^[0-9a-f]{64}$' AND source_fingerprint ~ '^[0-9a-f]{64}$'
);
ALTER TABLE result_publications ADD CONSTRAINT result_publication_review_check CHECK (
  revision >= 1 AND publication_generation >= 1
  AND (authorization_mode = 'DIRECT') = (review_decision_id IS NULL)
);
ALTER TABLE result_review_decisions ADD CONSTRAINT result_review_comment_check CHECK (
  candidate_revision >= 1 AND (decision <> 'RETURN' OR nullif(btrim(comment), '') IS NOT NULL)
);
ALTER TABLE result_release_events ADD CONSTRAINT result_release_event_check CHECK (
  publication_generation >= 1 AND (event <> 'REVOKED' OR nullif(btrim(reason), '') IS NOT NULL)
);
CREATE TRIGGER result_release_candidate_immutable BEFORE UPDATE OR DELETE ON result_release_candidates
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();
CREATE TRIGGER result_review_decision_immutable BEFORE UPDATE OR DELETE ON result_review_decisions
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();
CREATE TRIGGER result_publication_immutable BEFORE UPDATE OR DELETE ON result_publications
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();
CREATE TRIGGER result_release_event_immutable BEFORE UPDATE OR DELETE ON result_release_events
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();
CREATE TRIGGER result_correction_draft_immutable BEFORE UPDATE OR DELETE ON result_correction_drafts
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();

COMMIT;
