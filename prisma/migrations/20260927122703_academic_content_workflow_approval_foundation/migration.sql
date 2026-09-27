-- CreateEnum
CREATE TYPE "academic_content_approval_status" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "academic_content_workflow_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "preparation_approval_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_workflow_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL,
    "status" "academic_content_approval_status" NOT NULL DEFAULT 'PENDING',
    "submitted_by_user_id" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" VARCHAR(4000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_workflow_policies_school_id_key" ON "academic_content_workflow_policies"("school_id");

-- CreateIndex
CREATE INDEX "academic_content_approvals_school_id_academic_content_id_idx" ON "academic_content_approvals"("school_id", "academic_content_id");

-- CreateIndex
CREATE INDEX "academic_content_approvals_school_id_revision_id_academic_c_idx" ON "academic_content_approvals"("school_id", "revision_id", "academic_content_id");

-- CreateIndex
CREATE INDEX "academic_content_approvals_submitted_by_user_id_idx" ON "academic_content_approvals"("submitted_by_user_id");

-- CreateIndex
CREATE INDEX "academic_content_approvals_decided_by_user_id_idx" ON "academic_content_approvals"("decided_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_approvals_school_id_academic_content_id_ro_key" ON "academic_content_approvals"("school_id", "academic_content_id", "round_number");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_approvals_school_id_revision_id_key" ON "academic_content_approvals"("school_id", "revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_revisions_id_school_id_academic_content_id_key" ON "academic_content_revisions"("id", "school_id", "academic_content_id");

-- AddForeignKey
ALTER TABLE "academic_content_workflow_policies" ADD CONSTRAINT "academic_content_workflow_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_approvals" ADD CONSTRAINT "academic_content_approvals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_approvals" ADD CONSTRAINT "academic_content_approvals_academic_content_id_school_id_fkey" FOREIGN KEY ("academic_content_id", "school_id") REFERENCES "academic_contents"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_approvals" ADD CONSTRAINT "academic_content_approvals_revision_id_school_id_academic__fkey" FOREIGN KEY ("revision_id", "school_id", "academic_content_id") REFERENCES "academic_content_revisions"("id", "school_id", "academic_content_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_approvals" ADD CONSTRAINT "academic_content_approvals_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_approvals" ADD CONSTRAINT "academic_content_approvals_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express these approval history invariants.
ALTER TABLE "academic_content_approvals"
  ADD CONSTRAINT "acc_approval_round_positive_check" CHECK ("round_number" >= 1),
  ADD CONSTRAINT "acc_approval_decision_state_check" CHECK (
    ("status" = 'PENDING' AND "decided_by_user_id" IS NULL AND "decided_at" IS NULL AND "decision_note" IS NULL)
    OR ("status" = 'APPROVED' AND "decided_by_user_id" IS NOT NULL AND "decided_at" IS NOT NULL)
    OR ("status" = 'CHANGES_REQUESTED' AND "decided_by_user_id" IS NOT NULL AND "decided_at" IS NOT NULL AND "decision_note" IS NOT NULL AND btrim("decision_note") <> '')
  );

-- Prisma cannot express a partial unique index over live review rounds.
CREATE UNIQUE INDEX "acc_approval_one_pending_per_content_idx"
  ON "academic_content_approvals" ("school_id", "academic_content_id")
  WHERE "status" = 'PENDING';
