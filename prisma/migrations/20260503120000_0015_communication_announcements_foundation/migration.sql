-- CreateEnum
CREATE TYPE "communication_announcement_status" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "communication_announcement_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "communication_announcement_audience_type" AS ENUM ('SCHOOL', 'STAGE', 'GRADE', 'SECTION', 'CLASSROOM', 'CUSTOM');

-- CreateTable
CREATE TABLE "communication_announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "communication_announcement_status" NOT NULL DEFAULT 'DRAFT',
    "priority" "communication_announcement_priority" NOT NULL DEFAULT 'NORMAL',
    "audience_type" "communication_announcement_audience_type" NOT NULL DEFAULT 'SCHOOL',
    "category" TEXT,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "pinned_until" TIMESTAMP(3),
    "action_label" TEXT,
    "action_url" TEXT,
    "image_file_id" UUID,
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "published_by_id" UUID,
    "archived_by_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_announcement_audiences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "audience_type" "communication_announcement_audience_type" NOT NULL,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "student_id" UUID,
    "guardian_id" UUID,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_announcement_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_announcement_reads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_announcement_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_announcement_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_by_id" UUID,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_announcement_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communication_announcements_school_id_idx" ON "communication_announcements"("school_id");

-- CreateIndex
CREATE INDEX "communication_announcements_school_id_status_idx" ON "communication_announcements"("school_id", "status");

-- CreateIndex
CREATE INDEX "communication_announcements_school_id_created_at_idx" ON "communication_announcements"("school_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "communication_announcements_school_id_published_at_idx" ON "communication_announcements"("school_id", "published_at" DESC);

-- CreateIndex
CREATE INDEX "communication_announcements_school_id_audience_type_idx" ON "communication_announcements"("school_id", "audience_type");

-- CreateIndex
CREATE INDEX "communication_announcements_image_file_id_idx" ON "communication_announcements"("image_file_id");

-- CreateIndex
CREATE INDEX "communication_announcements_created_by_id_idx" ON "communication_announcements"("created_by_id");

-- CreateIndex
CREATE INDEX "communication_announcements_updated_by_id_idx" ON "communication_announcements"("updated_by_id");

-- CreateIndex
CREATE INDEX "communication_announcements_published_by_id_idx" ON "communication_announcements"("published_by_id");

-- CreateIndex
CREATE INDEX "communication_announcements_archived_by_id_idx" ON "communication_announcements"("archived_by_id");

-- CreateIndex
CREATE INDEX "communication_announcements_scheduled_at_idx" ON "communication_announcements"("scheduled_at");

-- CreateIndex
CREATE INDEX "communication_announcements_expires_at_idx" ON "communication_announcements"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "communication_announcements_id_school_id_key" ON "communication_announcements"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_school_id_idx" ON "communication_announcement_audiences"("school_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_announcement_id_idx" ON "communication_announcement_audiences"("announcement_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_audience_type_idx" ON "communication_announcement_audiences"("audience_type");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_school_id_audience_typ_idx" ON "communication_announcement_audiences"("school_id", "audience_type");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_stage_id_idx" ON "communication_announcement_audiences"("stage_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_grade_id_idx" ON "communication_announcement_audiences"("grade_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_section_id_idx" ON "communication_announcement_audiences"("section_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_classroom_id_idx" ON "communication_announcement_audiences"("classroom_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_student_id_idx" ON "communication_announcement_audiences"("student_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_guardian_id_idx" ON "communication_announcement_audiences"("guardian_id");

-- CreateIndex
CREATE INDEX "communication_announcement_audiences_user_id_idx" ON "communication_announcement_audiences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_announcement_audiences_id_school_id_key" ON "communication_announcement_audiences"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_announcement_reads_school_id_idx" ON "communication_announcement_reads"("school_id");

-- CreateIndex
CREATE INDEX "communication_announcement_reads_announcement_id_idx" ON "communication_announcement_reads"("announcement_id");

-- CreateIndex
CREATE INDEX "communication_announcement_reads_user_id_idx" ON "communication_announcement_reads"("user_id");

-- CreateIndex
CREATE INDEX "communication_announcement_reads_school_id_user_id_read_at_idx" ON "communication_announcement_reads"("school_id", "user_id", "read_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "communication_announcement_reads_announcement_id_user_id_key" ON "communication_announcement_reads"("announcement_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_announcement_reads_id_school_id_key" ON "communication_announcement_reads"("id", "school_id");

-- CreateIndex
CREATE INDEX "communication_announcement_attachments_school_id_idx" ON "communication_announcement_attachments"("school_id");

-- CreateIndex
CREATE INDEX "communication_announcement_attachments_announcement_id_idx" ON "communication_announcement_attachments"("announcement_id");

-- CreateIndex
CREATE INDEX "communication_announcement_attachments_file_id_idx" ON "communication_announcement_attachments"("file_id");

-- CreateIndex
CREATE INDEX "communication_announcement_attachments_created_by_id_idx" ON "communication_announcement_attachments"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_announcement_attachments_id_school_id_key" ON "communication_announcement_attachments"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_announcement_attachments_announcement_id_file_key" ON "communication_announcement_attachments"("announcement_id", "file_id");

-- AddForeignKey
ALTER TABLE "communication_announcements" ADD CONSTRAINT "communication_announcements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcements" ADD CONSTRAINT "communication_announcements_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcements" ADD CONSTRAINT "communication_announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcements" ADD CONSTRAINT "communication_announcements_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcements" ADD CONSTRAINT "communication_announcements_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcements" ADD CONSTRAINT "communication_announcements_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_announcement_id_schoo_fkey" FOREIGN KEY ("announcement_id", "school_id") REFERENCES "communication_announcements"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_classroom_id_school_i_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_guardian_id_school_id_fkey" FOREIGN KEY ("guardian_id", "school_id") REFERENCES "guardians"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_audiences" ADD CONSTRAINT "communication_announcement_audiences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_reads" ADD CONSTRAINT "communication_announcement_reads_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_reads" ADD CONSTRAINT "communication_announcement_reads_announcement_id_school_id_fkey" FOREIGN KEY ("announcement_id", "school_id") REFERENCES "communication_announcements"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_reads" ADD CONSTRAINT "communication_announcement_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_attachments" ADD CONSTRAINT "communication_announcement_attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_attachments" ADD CONSTRAINT "communication_announcement_attachments_announcement_id_sch_fkey" FOREIGN KEY ("announcement_id", "school_id") REFERENCES "communication_announcements"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_attachments" ADD CONSTRAINT "communication_announcement_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_announcement_attachments" ADD CONSTRAINT "communication_announcement_attachments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
