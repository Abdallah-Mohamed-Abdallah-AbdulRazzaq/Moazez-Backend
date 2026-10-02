-- CreateEnum
CREATE TYPE "academic_content_publication_status" AS ENUM ('SCHEDULED', 'PUBLISHED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "academic_content_audience_recipient_kind" AS ENUM ('STUDENT', 'GUARDIAN');

-- CreateTable
CREATE TABLE "academic_content_publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "client_request_id" UUID NOT NULL,
    "request_fingerprint" VARCHAR(64) NOT NULL,
    "source_content_status" "academic_content_status" NOT NULL,
    "status" "academic_content_publication_status" NOT NULL,
    "publish_at" TIMESTAMP(3) NOT NULL,
    "visible_from" TIMESTAMP(3) NOT NULL,
    "visible_until" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "student_recipient_count" INTEGER NOT NULL DEFAULT 0,
    "guardian_recipient_context_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_audience_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "recipient_kind" "academic_content_audience_recipient_kind" NOT NULL,
    "identity_fingerprint" VARCHAR(64) NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "guardian_id" UUID,
    "recipient_user_id" UUID,
    "guardian_can_receive_notifications" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_content_audience_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_audience_recipient_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "revision_target_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_content_audience_recipient_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_content_publications_school_id_academic_content_id_idx" ON "academic_content_publications"("school_id", "academic_content_id");

-- CreateIndex
CREATE INDEX "academic_content_publications_revision_id_school_id_academi_idx" ON "academic_content_publications"("revision_id", "school_id", "academic_content_id");

-- CreateIndex
CREATE INDEX "academic_content_publications_created_by_user_id_idx" ON "academic_content_publications"("created_by_user_id");

-- CreateIndex
CREATE INDEX "academic_content_publications_cancelled_by_user_id_idx" ON "academic_content_publications"("cancelled_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_publications_id_school_id_revision_id_key" ON "academic_content_publications"("id", "school_id", "revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_publications_school_id_client_request_id_key" ON "academic_content_publications"("school_id", "client_request_id");

-- CreateIndex
CREATE INDEX "academic_content_audience_recipients_publication_id_school__idx" ON "academic_content_audience_recipients"("publication_id", "school_id", "revision_id");

-- CreateIndex
CREATE INDEX "academic_content_audience_recipients_student_id_school_id_idx" ON "academic_content_audience_recipients"("student_id", "school_id");

-- CreateIndex
CREATE INDEX "academic_content_audience_recipients_enrollment_id_school_i_idx" ON "academic_content_audience_recipients"("enrollment_id", "school_id");

-- CreateIndex
CREATE INDEX "academic_content_audience_recipients_classroom_id_school_id_idx" ON "academic_content_audience_recipients"("classroom_id", "school_id");

-- CreateIndex
CREATE INDEX "academic_content_audience_recipients_guardian_id_school_id_idx" ON "academic_content_audience_recipients"("guardian_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_audience_recipients_id_school_id_revision__key" ON "academic_content_audience_recipients"("id", "school_id", "revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_audience_recipients_school_id_publication__key" ON "academic_content_audience_recipients"("school_id", "publication_id", "identity_fingerprint");

-- CreateIndex
CREATE INDEX "academic_content_audience_recipient_targets_recipient_id_sc_idx" ON "academic_content_audience_recipient_targets"("recipient_id", "school_id", "revision_id");

-- CreateIndex
CREATE INDEX "academic_content_audience_recipient_targets_revision_target_idx" ON "academic_content_audience_recipient_targets"("revision_target_id", "school_id", "revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_audience_recipient_targets_school_id_recip_key" ON "academic_content_audience_recipient_targets"("school_id", "recipient_id", "revision_target_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_revision_targets_id_school_id_revision_id_key" ON "academic_content_revision_targets"("id", "school_id", "revision_id");

-- AddForeignKey
ALTER TABLE "academic_content_publications" ADD CONSTRAINT "academic_content_publications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_publications" ADD CONSTRAINT "academic_content_publications_academic_content_id_school_i_fkey" FOREIGN KEY ("academic_content_id", "school_id") REFERENCES "academic_contents"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_publications" ADD CONSTRAINT "academic_content_publications_revision_id_school_id_academ_fkey" FOREIGN KEY ("revision_id", "school_id", "academic_content_id") REFERENCES "academic_content_revisions"("id", "school_id", "academic_content_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_publications" ADD CONSTRAINT "academic_content_publications_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_publications" ADD CONSTRAINT "academic_content_publications_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_audience_recipients" ADD CONSTRAINT "academic_content_audience_recipients_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_audience_recipients" ADD CONSTRAINT "academic_content_audience_recipients_publication_id_school_fkey" FOREIGN KEY ("publication_id", "school_id", "revision_id") REFERENCES "academic_content_publications"("id", "school_id", "revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_audience_recipients" ADD CONSTRAINT "academic_content_audience_recipients_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_audience_recipients" ADD CONSTRAINT "academic_content_audience_recipients_enrollment_id_school__fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_audience_recipients" ADD CONSTRAINT "academic_content_audience_recipients_classroom_id_school_i_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_audience_recipients" ADD CONSTRAINT "academic_content_audience_recipients_guardian_id_school_id_fkey" FOREIGN KEY ("guardian_id", "school_id") REFERENCES "guardians"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_audience_recipient_targets" ADD CONSTRAINT "academic_content_audience_recipient_targets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_audience_recipient_targets" ADD CONSTRAINT "academic_content_audience_recipient_targets_recipient_id_s_fkey" FOREIGN KEY ("recipient_id", "school_id", "revision_id") REFERENCES "academic_content_audience_recipients"("id", "school_id", "revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_audience_recipient_targets" ADD CONSTRAINT "academic_content_audience_recipient_targets_revision_targe_fkey" FOREIGN KEY ("revision_target_id", "school_id", "revision_id") REFERENCES "academic_content_revision_targets"("id", "school_id", "revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express partial uniqueness or CHECK predicates. These custom
-- invariants are added to the generated schema delta before first application.
CREATE UNIQUE INDEX "acc_publication_one_active_per_content_idx"
ON "academic_content_publications" ("school_id", "academic_content_id")
WHERE "status" IN ('SCHEDULED', 'PUBLISHED');

ALTER TABLE "academic_content_publications"
ADD CONSTRAINT "acc_publication_timing_check" CHECK (
  "visible_from" >= "publish_at"
  AND ("visible_until" IS NULL OR "visible_until" > "visible_from")
),
ADD CONSTRAINT "acc_publication_source_status_check" CHECK (
  "source_content_status" IN ('DRAFT', 'APPROVED')
),
ADD CONSTRAINT "acc_publication_lifecycle_check" CHECK (
  ("status" = 'SCHEDULED' AND "published_at" IS NULL AND "expired_at" IS NULL AND "cancelled_at" IS NULL)
  OR ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL AND "expired_at" IS NULL AND "cancelled_at" IS NULL)
  OR ("status" = 'EXPIRED' AND "expired_at" IS NOT NULL AND "cancelled_at" IS NULL)
  OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "expired_at" IS NULL)
),
ADD CONSTRAINT "acc_publication_counts_nonnegative_check" CHECK (
  "student_recipient_count" >= 0 AND "guardian_recipient_context_count" >= 0
),
ADD CONSTRAINT "acc_publication_request_fingerprint_check" CHECK (
  "request_fingerprint" ~ '^[0-9a-f]{64}$'
);

ALTER TABLE "academic_content_audience_recipients"
ADD CONSTRAINT "acc_audience_recipient_identity_fingerprint_check" CHECK (
  "identity_fingerprint" ~ '^[0-9a-f]{64}$'
),
ADD CONSTRAINT "acc_audience_recipient_shape_check" CHECK (
  ("recipient_kind" = 'STUDENT' AND "guardian_id" IS NULL)
  OR ("recipient_kind" = 'GUARDIAN' AND "guardian_id" IS NOT NULL)
);
