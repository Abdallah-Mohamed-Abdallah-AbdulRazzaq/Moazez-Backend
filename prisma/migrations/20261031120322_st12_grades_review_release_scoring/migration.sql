-- CreateEnum
CREATE TYPE "grade_review_release_level" AS ENUM ('NONE', 'DETAILS', 'KEYS');

-- CreateTable
CREATE TABLE "grade_review_release_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "student_level" "grade_review_release_level" NOT NULL DEFAULT 'NONE',
    "parent_level" "grade_review_release_level" NOT NULL DEFAULT 'NONE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_request_id" UUID NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_review_release_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_question_key_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "question_fingerprint" CHAR(64) NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "approved_by_id" UUID NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_question_key_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_scoring_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "answer_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "key_approval_id" UUID,
    "question_fingerprint" CHAR(64) NOT NULL,
    "answer_fingerprint" CHAR(64) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "evaluation_version" VARCHAR(64) NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "outcome" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(64) NOT NULL,
    "suggested_points" DECIMAL(8,2),
    "max_points" DECIMAL(8,2) NOT NULL,
    "manual_review_required" BOOLEAN NOT NULL,
    "evaluated_by_id" UUID NOT NULL,
    "applied_at" TIMESTAMP(3),
    "applied_by_id" UUID,
    "applied_points" DECIMAL(8,2),
    "decision" VARCHAR(16),
    "override_reason" VARCHAR(64),
    "previous_awarded_points" DECIMAL(8,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_scoring_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grade_review_release_policies_school_id_assessment_id_idx" ON "grade_review_release_policies"("school_id", "assessment_id");

-- CreateIndex
CREATE INDEX "grade_review_release_policies_changed_by_id_idx" ON "grade_review_release_policies"("changed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_review_release_policies_assessment_id_school_id_key" ON "grade_review_release_policies"("assessment_id", "school_id");

-- CreateIndex
CREATE INDEX "grade_question_key_approvals_school_id_assessment_id_questi_idx" ON "grade_question_key_approvals"("school_id", "assessment_id", "question_id");

-- CreateIndex
CREATE INDEX "grade_question_key_approvals_question_id_school_id_assessme_idx" ON "grade_question_key_approvals"("question_id", "school_id", "assessment_id");

-- CreateIndex
CREATE INDEX "grade_question_key_approvals_approved_by_id_idx" ON "grade_question_key_approvals"("approved_by_id");

-- CreateIndex
CREATE INDEX "grade_question_key_approvals_revoked_by_id_idx" ON "grade_question_key_approvals"("revoked_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_question_key_approvals_id_school_id_question_id_asses_key" ON "grade_question_key_approvals"("id", "school_id", "question_id", "assessment_id", "question_fingerprint");

-- CreateIndex
CREATE INDEX "grade_scoring_suggestions_answer_id_school_id_submission_id_idx" ON "grade_scoring_suggestions"("answer_id", "school_id", "submission_id", "question_id", "student_id", "assessment_id");

-- CreateIndex
CREATE INDEX "grade_scoring_suggestions_key_approval_id_school_id_questio_idx" ON "grade_scoring_suggestions"("key_approval_id", "school_id", "question_id", "assessment_id", "question_fingerprint");

-- CreateIndex
CREATE INDEX "grade_scoring_suggestions_school_id_assessment_id_submissio_idx" ON "grade_scoring_suggestions"("school_id", "assessment_id", "submission_id");

-- CreateIndex
CREATE INDEX "grade_scoring_suggestions_evaluated_by_id_idx" ON "grade_scoring_suggestions"("evaluated_by_id");

-- CreateIndex
CREATE INDEX "grade_scoring_suggestions_applied_by_id_idx" ON "grade_scoring_suggestions"("applied_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_scoring_suggestions_school_id_answer_id_fingerprint_key" ON "grade_scoring_suggestions"("school_id", "answer_id", "fingerprint");

-- AddForeignKey
ALTER TABLE "grade_review_release_policies" ADD CONSTRAINT "grade_review_release_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_review_release_policies" ADD CONSTRAINT "grade_review_release_policies_assessment_id_school_id_fkey" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_review_release_policies" ADD CONSTRAINT "grade_review_release_policies_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_question_key_approvals" ADD CONSTRAINT "grade_question_key_approvals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_question_key_approvals" ADD CONSTRAINT "grade_question_key_approvals_question_id_school_id_assessm_fkey" FOREIGN KEY ("question_id", "school_id", "assessment_id") REFERENCES "grade_assessment_questions"("id", "school_id", "assessment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_question_key_approvals" ADD CONSTRAINT "grade_question_key_approvals_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_question_key_approvals" ADD CONSTRAINT "grade_question_key_approvals_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_scoring_suggestions" ADD CONSTRAINT "grade_scoring_suggestions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_scoring_suggestions" ADD CONSTRAINT "grade_scoring_suggestions_answer_id_school_id_submission_i_fkey" FOREIGN KEY ("answer_id", "school_id", "submission_id", "question_id", "student_id", "assessment_id") REFERENCES "grade_submission_answers"("id", "school_id", "submission_id", "question_id", "student_id", "assessment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_scoring_suggestions" ADD CONSTRAINT "grade_scoring_suggestions_key_approval_id_school_id_questi_fkey" FOREIGN KEY ("key_approval_id", "school_id", "question_id", "assessment_id", "question_fingerprint") REFERENCES "grade_question_key_approvals"("id", "school_id", "question_id", "assessment_id", "question_fingerprint") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_scoring_suggestions" ADD CONSTRAINT "grade_scoring_suggestions_evaluated_by_id_fkey" FOREIGN KEY ("evaluated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_scoring_suggestions" ADD CONSTRAINT "grade_scoring_suggestions_applied_by_id_fkey" FOREIGN KEY ("applied_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma does not represent bounded evidence CHECKs, partial uniqueness or
-- immutable-history triggers. These affect only the three new ST12 tables.
ALTER TABLE "grade_review_release_policies" ADD CONSTRAINT "grade_review_policy_version_check"
  CHECK ("version" > 0);
ALTER TABLE "grade_question_key_approvals" ADD CONSTRAINT "grade_key_approval_evidence_check"
  CHECK ("key_version" = 1 AND "question_fingerprint" ~ '^[0-9a-f]{64}$'
    AND (("revoked_at" IS NULL) = ("revoked_by_id" IS NULL)));
CREATE UNIQUE INDEX "grade_key_approval_active_question_key"
  ON "grade_question_key_approvals" ("school_id", "question_id")
  WHERE "revoked_at" IS NULL;

ALTER TABLE "grade_scoring_suggestions" ADD CONSTRAINT "grade_scoring_suggestion_evidence_check"
  CHECK ("question_fingerprint" ~ '^[0-9a-f]{64}$'
    AND "answer_fingerprint" ~ '^[0-9a-f]{64}$' AND "fingerprint" ~ '^[0-9a-f]{64}$'
    AND "evaluation_version" = 'st12-objective-v1' AND "policy_version" = 1
    AND "reason" ~ '^[A-Z][A-Z0-9_]{0,63}$' AND "max_points" > 0
    AND "outcome" IN ('PROVED_EQUIVALENT', 'PROVED_DIFFERENT',
      'UNKNOWN_REQUIRES_MANUAL_REVIEW', 'INVALID_INPUT', 'UNDEFINED_EXPRESSION')
    AND (("outcome" = 'PROVED_EQUIVALENT' AND NOT "manual_review_required" AND "key_approval_id" IS NOT NULL
        AND "suggested_points" IS NOT NULL AND "suggested_points" = "max_points")
      OR ("outcome" = 'PROVED_DIFFERENT' AND NOT "manual_review_required" AND "key_approval_id" IS NOT NULL
        AND "suggested_points" IS NOT NULL AND "suggested_points" = 0)
      OR ("outcome" NOT IN ('PROVED_EQUIVALENT', 'PROVED_DIFFERENT')
        AND "manual_review_required" AND "suggested_points" IS NULL)));
ALTER TABLE "grade_scoring_suggestions" ADD CONSTRAINT "grade_scoring_application_check"
  CHECK (("applied_at" IS NULL AND "applied_by_id" IS NULL AND "applied_points" IS NULL
      AND "decision" IS NULL AND "override_reason" IS NULL AND "previous_awarded_points" IS NULL)
    OR ("applied_at" IS NOT NULL AND "applied_by_id" IS NOT NULL AND "applied_points" IS NOT NULL AND "decision" IS NOT NULL
      AND "applied_points" >= 0 AND "applied_points" <= "max_points"
      AND (("decision" = 'APPLY' AND NOT "manual_review_required" AND "suggested_points" IS NOT NULL
          AND "applied_points" = "suggested_points" AND "override_reason" IS NULL)
        OR ("decision" = 'OVERRIDE' AND "override_reason" IS NOT NULL
          AND "override_reason" IN ('REVIEWER_JUDGMENT', 'PARTIAL_CREDIT', 'KEY_ISSUE')))));

CREATE FUNCTION public.enforce_grade_review_evidence_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Grade review evidence is retained' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'grade_review_release_policies' THEN
    IF (to_jsonb(NEW) - ARRAY['student_level','parent_level','version','last_request_id','changed_by_id','updated_at'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['student_level','parent_level','version','last_request_id','changed_by_id','updated_at'])
      OR NEW.version <> OLD.version + 1 OR NEW.last_request_id = OLD.last_request_id THEN
      RAISE EXCEPTION 'Grade review policy identity or version is immutable' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'grade_question_key_approvals' THEN
    IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
      OR (to_jsonb(NEW) - ARRAY['revoked_at','revoked_by_id','updated_at'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['revoked_at','revoked_by_id','updated_at']) THEN
      RAISE EXCEPTION 'Grade key approval evidence is immutable' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'grade_scoring_suggestions' THEN
    IF OLD.applied_at IS NOT NULL OR NEW.applied_at IS NULL
      OR (to_jsonb(NEW) - ARRAY['applied_at','applied_by_id','applied_points','decision','override_reason','previous_awarded_points','updated_at'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['applied_at','applied_by_id','applied_points','decision','override_reason','previous_awarded_points','updated_at']) THEN
      RAISE EXCEPTION 'Grade scoring evidence is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_grade_review_evidence_identity() FROM PUBLIC;
CREATE TRIGGER "grade_review_policy_identity_guard"
  BEFORE UPDATE OR DELETE ON "grade_review_release_policies"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_grade_review_evidence_identity();
CREATE TRIGGER "grade_key_approval_identity_guard"
  BEFORE UPDATE OR DELETE ON "grade_question_key_approvals"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_grade_review_evidence_identity();
CREATE TRIGGER "grade_scoring_suggestion_identity_guard"
  BEFORE UPDATE OR DELETE ON "grade_scoring_suggestions"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_grade_review_evidence_identity();
