-- AlterEnum
ALTER TYPE "homework_submission_status" ADD VALUE 'REVIEWED';

-- AlterTable
ALTER TABLE "homework_submissions"
ADD COLUMN "reviewed_at" TIMESTAMP(3),
ADD COLUMN "reviewed_by_user_id" UUID,
ADD COLUMN "review_note" TEXT,
ADD COLUMN "awarded_marks" DECIMAL(10,2);

-- CreateIndex
CREATE INDEX "homework_submissions_reviewed_by_user_id_idx" ON "homework_submissions"("reviewed_by_user_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_reviewed_at_idx" ON "homework_submissions"("school_id", "reviewed_at");

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
