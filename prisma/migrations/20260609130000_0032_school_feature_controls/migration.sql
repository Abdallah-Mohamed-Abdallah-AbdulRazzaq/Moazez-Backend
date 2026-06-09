-- CreateEnum
CREATE TYPE "school_feature_control_source" AS ENUM ('PLATFORM', 'ENTITLEMENT', 'SYSTEM');

-- CreateTable
CREATE TABLE "school_feature_controls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "feature_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "source" "school_feature_control_source" NOT NULL DEFAULT 'PLATFORM',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_feature_controls_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "school_feature_controls_feature_key_snake_case" CHECK ("feature_key" ~ '^[a-z][a-z0-9_]*$')
);

-- CreateIndex
CREATE UNIQUE INDEX "school_feature_controls_school_id_feature_key_key" ON "school_feature_controls"("school_id", "feature_key");

-- CreateIndex
CREATE INDEX "school_feature_controls_organization_id_idx" ON "school_feature_controls"("organization_id");

-- CreateIndex
CREATE INDEX "school_feature_controls_feature_key_idx" ON "school_feature_controls"("feature_key");

-- CreateIndex
CREATE INDEX "school_feature_controls_enabled_idx" ON "school_feature_controls"("enabled");

-- AddForeignKey
ALTER TABLE "school_feature_controls" ADD CONSTRAINT "school_feature_controls_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_feature_controls" ADD CONSTRAINT "school_feature_controls_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
