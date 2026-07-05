-- AlterTable
ALTER TABLE "dismissal_requests"
ADD COLUMN "pickup_code_hash" VARCHAR(255),
ADD COLUMN "pickup_code_salt" VARCHAR(64),
ADD COLUMN "pickup_code_issued_at" TIMESTAMP(3),
ADD COLUMN "pickup_code_verified_at" TIMESTAMP(3),
ADD COLUMN "handed_over_at" TIMESTAMP(3),
ADD COLUMN "handed_over_by_id" UUID,
ADD COLUMN "handover_receiver_name" VARCHAR(120),
ADD COLUMN "handover_receiver_relation" VARCHAR(80),
ADD COLUMN "handover_note" TEXT;

-- CreateIndex
CREATE INDEX "dismissal_requests_handed_over_by_id_idx" ON "dismissal_requests"("handed_over_by_id");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_handed_over_at_idx" ON "dismissal_requests"("school_id", "handed_over_at");

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_handed_over_by_id_fkey" FOREIGN KEY ("handed_over_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
