-- CreateEnum
CREATE TYPE "academic_content_engagement_actor_kind" AS ENUM ('STUDENT', 'PARENT');

-- CreateEnum
CREATE TYPE "academic_content_engagement_event_type" AS ENUM ('CONTENT_VIEWED', 'FILE_PREVIEWED', 'FILE_DOWNLOADED', 'LINK_CLICKED', 'JOIN_LINK_CLICKED');

-- CreateTable
CREATE TABLE "academic_content_engagement_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "actor_kind" "academic_content_engagement_actor_kind" NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "guardian_id" UUID,
    "event_type" "academic_content_engagement_event_type" NOT NULL,
    "file_id" UUID,
    "revision_link_id" UUID,
    "client_request_id" UUID NOT NULL,
    "request_fingerprint" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_content_engagement_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_acknowledgements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_content_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acc_engagement_content_publication_time_idx" ON "academic_content_engagement_events"("school_id", "academic_content_id", "publication_id", "created_at");

-- CreateIndex
CREATE INDEX "acc_engagement_publication_idx" ON "academic_content_engagement_events"("publication_id", "school_id", "revision_id");

-- CreateIndex
CREATE INDEX "acc_engagement_revision_idx" ON "academic_content_engagement_events"("revision_id", "school_id", "academic_content_id");

-- CreateIndex
CREATE INDEX "academic_content_engagement_events_actor_user_id_idx" ON "academic_content_engagement_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "academic_content_engagement_events_student_id_school_id_idx" ON "academic_content_engagement_events"("student_id", "school_id");

-- CreateIndex
CREATE INDEX "acc_engagement_enrollment_idx" ON "academic_content_engagement_events"("enrollment_id", "school_id", "student_id");

-- CreateIndex
CREATE INDEX "academic_content_engagement_events_guardian_id_school_id_idx" ON "academic_content_engagement_events"("guardian_id", "school_id");

-- CreateIndex
CREATE INDEX "acc_engagement_revision_asset_idx" ON "academic_content_engagement_events"("school_id", "revision_id", "file_id");

-- CreateIndex
CREATE INDEX "acc_engagement_revision_link_idx" ON "academic_content_engagement_events"("revision_link_id", "school_id", "revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "acc_engagement_actor_request_key" ON "academic_content_engagement_events"("school_id", "actor_user_id", "client_request_id");

-- CreateIndex
CREATE INDEX "acc_acknowledgement_content_publication_idx" ON "academic_content_acknowledgements"("school_id", "academic_content_id", "publication_id");

-- CreateIndex
CREATE INDEX "acc_acknowledgement_publication_idx" ON "academic_content_acknowledgements"("publication_id", "school_id", "revision_id");

-- CreateIndex
CREATE INDEX "acc_acknowledgement_revision_idx" ON "academic_content_acknowledgements"("revision_id", "school_id", "academic_content_id");

-- CreateIndex
CREATE INDEX "academic_content_acknowledgements_student_id_school_id_idx" ON "academic_content_acknowledgements"("student_id", "school_id");

-- CreateIndex
CREATE INDEX "acc_acknowledgement_enrollment_idx" ON "academic_content_acknowledgements"("enrollment_id", "school_id", "student_id");

-- CreateIndex
CREATE INDEX "academic_content_acknowledgements_actor_user_id_idx" ON "academic_content_acknowledgements"("actor_user_id");

-- CreateIndex
CREATE INDEX "academic_content_acknowledgements_guardian_id_school_id_idx" ON "academic_content_acknowledgements"("guardian_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "acc_acknowledgement_parent_child_publication_key" ON "academic_content_acknowledgements"("school_id", "publication_id", "student_id", "actor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "acc_revision_link_identity_key" ON "academic_content_revision_links"("id", "school_id", "revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "acc_enrollment_student_identity_key" ON "student_enrollments"("id", "school_id", "student_id");

-- AddForeignKey
ALTER TABLE "academic_content_engagement_events" ADD CONSTRAINT "academic_content_engagement_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_engagement_events" ADD CONSTRAINT "acc_engagement_publication_fkey" FOREIGN KEY ("publication_id", "school_id", "revision_id") REFERENCES "academic_content_publications"("id", "school_id", "revision_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_engagement_events" ADD CONSTRAINT "acc_engagement_revision_fkey" FOREIGN KEY ("revision_id", "school_id", "academic_content_id") REFERENCES "academic_content_revisions"("id", "school_id", "academic_content_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_engagement_events" ADD CONSTRAINT "academic_content_engagement_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_engagement_events" ADD CONSTRAINT "academic_content_engagement_events_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_engagement_events" ADD CONSTRAINT "acc_engagement_enrollment_fkey" FOREIGN KEY ("enrollment_id", "school_id", "student_id") REFERENCES "student_enrollments"("id", "school_id", "student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_engagement_events" ADD CONSTRAINT "academic_content_engagement_events_guardian_id_school_id_fkey" FOREIGN KEY ("guardian_id", "school_id") REFERENCES "guardians"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_engagement_events" ADD CONSTRAINT "acc_engagement_revision_asset_fkey" FOREIGN KEY ("school_id", "revision_id", "file_id") REFERENCES "academic_content_revision_assets"("school_id", "revision_id", "file_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_engagement_events" ADD CONSTRAINT "acc_engagement_revision_link_fkey" FOREIGN KEY ("revision_link_id", "school_id", "revision_id") REFERENCES "academic_content_revision_links"("id", "school_id", "revision_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_acknowledgements" ADD CONSTRAINT "academic_content_acknowledgements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_acknowledgements" ADD CONSTRAINT "acc_acknowledgement_publication_fkey" FOREIGN KEY ("publication_id", "school_id", "revision_id") REFERENCES "academic_content_publications"("id", "school_id", "revision_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_acknowledgements" ADD CONSTRAINT "acc_acknowledgement_revision_fkey" FOREIGN KEY ("revision_id", "school_id", "academic_content_id") REFERENCES "academic_content_revisions"("id", "school_id", "academic_content_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_acknowledgements" ADD CONSTRAINT "academic_content_acknowledgements_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_acknowledgements" ADD CONSTRAINT "acc_acknowledgement_enrollment_fkey" FOREIGN KEY ("enrollment_id", "school_id", "student_id") REFERENCES "student_enrollments"("id", "school_id", "student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_acknowledgements" ADD CONSTRAINT "academic_content_acknowledgements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_acknowledgements" ADD CONSTRAINT "academic_content_acknowledgements_guardian_id_school_id_fkey" FOREIGN KEY ("guardian_id", "school_id") REFERENCES "guardians"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma cannot express conditional reference/actor shapes or a fingerprint regex.
-- These predicates are reviewed before first application and inventoried/tested.
ALTER TABLE "academic_content_engagement_events"
  ADD CONSTRAINT "acc_engagement_actor_guardian_check" CHECK (
    ("actor_kind" = 'STUDENT' AND "guardian_id" IS NULL)
    OR ("actor_kind" = 'PARENT' AND "guardian_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "acc_engagement_reference_shape_check" CHECK (
    ("event_type" IN ('CONTENT_VIEWED', 'JOIN_LINK_CLICKED') AND "file_id" IS NULL AND "revision_link_id" IS NULL)
    OR ("event_type" IN ('FILE_PREVIEWED', 'FILE_DOWNLOADED') AND "file_id" IS NOT NULL AND "revision_link_id" IS NULL)
    OR ("event_type" = 'LINK_CLICKED' AND "file_id" IS NULL AND "revision_link_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "acc_engagement_request_fingerprint_check" CHECK (
    "request_fingerprint" ~ '^[a-f0-9]{64}$'
  );
