-- CreateEnum
CREATE TYPE "school_entitlement_status" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'EXPIRED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "school_entitlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "school_entitlement_status" NOT NULL DEFAULT 'TRIAL',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "student_seat_limit" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_entitlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "school_entitlements_student_seat_limit_positive" CHECK ("student_seat_limit" IS NULL OR "student_seat_limit" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "school_entitlements_school_id_key" ON "school_entitlements"("school_id");

-- CreateIndex
CREATE INDEX "school_entitlements_organization_id_idx" ON "school_entitlements"("organization_id");

-- CreateIndex
CREATE INDEX "school_entitlements_status_idx" ON "school_entitlements"("status");

-- CreateIndex
CREATE INDEX "school_entitlements_ends_at_idx" ON "school_entitlements"("ends_at");

-- AddForeignKey
ALTER TABLE "school_entitlements" ADD CONSTRAINT "school_entitlements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_entitlements" ADD CONSTRAINT "school_entitlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
