-- PostgreSQL-specific deterministic backfill: Prisma cannot express a
-- per-content row_number before making a new column required.
ALTER TABLE "academic_content_assets" ADD COLUMN "sort_order" INTEGER;
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY school_id, academic_content_id
    ORDER BY created_at ASC, id ASC
  ) - 1 AS position
  FROM "academic_content_assets"
)
UPDATE "academic_content_assets" AS asset
SET "sort_order" = ordered.position
FROM ordered WHERE asset.id = ordered.id;
ALTER TABLE "academic_content_assets" ALTER COLUMN "sort_order" SET NOT NULL;
ALTER TABLE "academic_content_assets" ADD CONSTRAINT "academic_content_assets_sort_order_nonnegative_check" CHECK ("sort_order" >= 0);

-- CreateTable
CREATE TABLE "academic_content_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "label" VARCHAR(180) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "display_value" VARCHAR(80) NOT NULL,
    "normalized_value" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "snapshot_contract_version" INTEGER NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "type" "academic_content_type" NOT NULL,
    "audience" "academic_content_audience_type" NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" VARCHAR(4000),
    "source_status" "academic_content_status" NOT NULL,
    "captured_by_user_id" UUID NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_content_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_revision_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "scope_type" "academic_content_target_scope_type" NOT NULL,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "subject_id" UUID,
    "teacher_subject_allocation_id" UUID,
    "identity_fingerprint" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_content_revision_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_revision_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_content_revision_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_revision_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "label" VARCHAR(180) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_content_revision_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_revision_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "display_value" VARCHAR(80) NOT NULL,
    "normalized_value" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_content_revision_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_content_links_school_id_academic_content_id_idx" ON "academic_content_links"("school_id", "academic_content_id");

-- CreateIndex
CREATE INDEX "academic_content_links_created_by_user_id_idx" ON "academic_content_links"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_links_school_id_academic_content_id_sort_o_key" ON "academic_content_links"("school_id", "academic_content_id", "sort_order");

-- CreateIndex
CREATE INDEX "academic_content_tags_school_id_academic_content_id_idx" ON "academic_content_tags"("school_id", "academic_content_id");

-- CreateIndex
CREATE INDEX "academic_content_tags_created_by_user_id_idx" ON "academic_content_tags"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_tags_school_id_academic_content_id_normali_key" ON "academic_content_tags"("school_id", "academic_content_id", "normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_tags_school_id_academic_content_id_sort_or_key" ON "academic_content_tags"("school_id", "academic_content_id", "sort_order");

-- CreateIndex
CREATE INDEX "academic_content_revisions_school_id_academic_content_id_idx" ON "academic_content_revisions"("school_id", "academic_content_id");

-- CreateIndex
CREATE INDEX "academic_content_revisions_academic_year_id_school_id_idx" ON "academic_content_revisions"("academic_year_id", "school_id");

-- CreateIndex
CREATE INDEX "academic_content_revisions_term_id_school_id_idx" ON "academic_content_revisions"("term_id", "school_id");

-- CreateIndex
CREATE INDEX "academic_content_revisions_captured_by_user_id_idx" ON "academic_content_revisions"("captured_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_revisions_id_school_id_key" ON "academic_content_revisions"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_revisions_school_id_academic_content_id_re_key" ON "academic_content_revisions"("school_id", "academic_content_id", "revision_number");

-- CreateIndex
CREATE INDEX "academic_content_revision_targets_school_id_revision_id_idx" ON "academic_content_revision_targets"("school_id", "revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_revision_targets_school_id_revision_id_ide_key" ON "academic_content_revision_targets"("school_id", "revision_id", "identity_fingerprint");

-- CreateIndex
CREATE INDEX "academic_content_revision_assets_school_id_revision_id_idx" ON "academic_content_revision_assets"("school_id", "revision_id");

-- CreateIndex
CREATE INDEX "academic_content_revision_assets_school_id_file_id_idx" ON "academic_content_revision_assets"("school_id", "file_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_revision_assets_school_id_revision_id_file_key" ON "academic_content_revision_assets"("school_id", "revision_id", "file_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_revision_assets_school_id_revision_id_sort_key" ON "academic_content_revision_assets"("school_id", "revision_id", "sort_order");

-- CreateIndex
CREATE INDEX "academic_content_revision_links_school_id_revision_id_idx" ON "academic_content_revision_links"("school_id", "revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_revision_links_school_id_revision_id_sort__key" ON "academic_content_revision_links"("school_id", "revision_id", "sort_order");

-- CreateIndex
CREATE INDEX "academic_content_revision_tags_school_id_revision_id_idx" ON "academic_content_revision_tags"("school_id", "revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_revision_tags_school_id_revision_id_normal_key" ON "academic_content_revision_tags"("school_id", "revision_id", "normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_revision_tags_school_id_revision_id_sort_o_key" ON "academic_content_revision_tags"("school_id", "revision_id", "sort_order");

-- AddForeignKey
ALTER TABLE "academic_content_links" ADD CONSTRAINT "academic_content_links_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_links" ADD CONSTRAINT "academic_content_links_academic_content_id_school_id_fkey" FOREIGN KEY ("academic_content_id", "school_id") REFERENCES "academic_contents"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_links" ADD CONSTRAINT "academic_content_links_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_tags" ADD CONSTRAINT "academic_content_tags_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_tags" ADD CONSTRAINT "academic_content_tags_academic_content_id_school_id_fkey" FOREIGN KEY ("academic_content_id", "school_id") REFERENCES "academic_contents"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_tags" ADD CONSTRAINT "academic_content_tags_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revisions" ADD CONSTRAINT "academic_content_revisions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revisions" ADD CONSTRAINT "academic_content_revisions_academic_content_id_school_id_fkey" FOREIGN KEY ("academic_content_id", "school_id") REFERENCES "academic_contents"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revisions" ADD CONSTRAINT "academic_content_revisions_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revisions" ADD CONSTRAINT "academic_content_revisions_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revisions" ADD CONSTRAINT "academic_content_revisions_captured_by_user_id_fkey" FOREIGN KEY ("captured_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revision_targets" ADD CONSTRAINT "academic_content_revision_targets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revision_targets" ADD CONSTRAINT "academic_content_revision_targets_revision_id_school_id_fkey" FOREIGN KEY ("revision_id", "school_id") REFERENCES "academic_content_revisions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revision_assets" ADD CONSTRAINT "academic_content_revision_assets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revision_assets" ADD CONSTRAINT "academic_content_revision_assets_revision_id_school_id_fkey" FOREIGN KEY ("revision_id", "school_id") REFERENCES "academic_content_revisions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revision_assets" ADD CONSTRAINT "academic_content_revision_assets_file_id_school_id_fkey" FOREIGN KEY ("file_id", "school_id") REFERENCES "files"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revision_links" ADD CONSTRAINT "academic_content_revision_links_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revision_links" ADD CONSTRAINT "academic_content_revision_links_revision_id_school_id_fkey" FOREIGN KEY ("revision_id", "school_id") REFERENCES "academic_content_revisions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revision_tags" ADD CONSTRAINT "academic_content_revision_tags_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_revision_tags" ADD CONSTRAINT "academic_content_revision_tags_revision_id_school_id_fkey" FOREIGN KEY ("revision_id", "school_id") REFERENCES "academic_content_revisions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL-specific checks that Prisma schema cannot represent.
ALTER TABLE "academic_content_links" ADD CONSTRAINT "academic_content_links_sort_order_nonnegative_check" CHECK ("sort_order" >= 0);
ALTER TABLE "academic_content_tags" ADD CONSTRAINT "academic_content_tags_sort_order_nonnegative_check" CHECK ("sort_order" >= 0);
ALTER TABLE "academic_content_revisions" ADD CONSTRAINT "academic_content_revisions_number_positive_check" CHECK ("revision_number" >= 1);
ALTER TABLE "academic_content_revisions" ADD CONSTRAINT "academic_content_revisions_contract_version_positive_check" CHECK ("snapshot_contract_version" >= 1);
ALTER TABLE "academic_content_revision_assets" ADD CONSTRAINT "academic_content_revision_assets_sort_order_nonnegative_check" CHECK ("sort_order" >= 0);
ALTER TABLE "academic_content_revision_links" ADD CONSTRAINT "academic_content_revision_links_sort_order_nonnegative_check" CHECK ("sort_order" >= 0);
ALTER TABLE "academic_content_revision_tags" ADD CONSTRAINT "academic_content_revision_tags_sort_order_nonnegative_check" CHECK ("sort_order" >= 0);
