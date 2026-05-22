-- CreateEnum
CREATE TYPE "timetable_scope_type" AS ENUM ('TERM', 'GRADE', 'SECTION', 'CLASSROOM');

-- CreateEnum
CREATE TYPE "timetable_config_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "timetable_period_type" AS ENUM ('CLASS', 'BREAK', 'ASSEMBLY', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "timetable_entry_status" AS ENUM ('DRAFT', 'ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "timetable_publication_status" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "timetable_conflict_type" AS ENUM ('TEACHER', 'ROOM', 'CLASSROOM_SLOT', 'PERIOD_OVERLAP');

-- CreateEnum
CREATE TYPE "timetable_conflict_severity" AS ENUM ('BLOCKING', 'WARNING');

-- CreateEnum
CREATE TYPE "timetable_conflict_status" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "timetable_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "week_start_day" INTEGER NOT NULL DEFAULT 0,
    "active_days" INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[],
    "scope_type" "timetable_scope_type" NOT NULL DEFAULT 'TERM',
    "scope_key" TEXT NOT NULL,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "status" "timetable_config_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "timetable_config_id" UUID NOT NULL,
    "period_index" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "type" "timetable_period_type" NOT NULL DEFAULT 'CLASS',
    "is_instructional" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "timetable_config_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "grade_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "teacher_subject_allocation_id" UUID NOT NULL,
    "room_id" UUID,
    "notes" TEXT,
    "status" "timetable_entry_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "timetable_config_id" UUID NOT NULL,
    "status" "timetable_publication_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "published_by_user_id" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_conflicts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "timetable_config_id" UUID NOT NULL,
    "entry_id" UUID,
    "related_entry_id" UUID,
    "conflict_type" "timetable_conflict_type" NOT NULL,
    "severity" "timetable_conflict_severity" NOT NULL DEFAULT 'BLOCKING',
    "status" "timetable_conflict_status" NOT NULL DEFAULT 'OPEN',
    "day_of_week" INTEGER,
    "period_id" UUID,
    "teacher_user_id" UUID,
    "room_id" UUID,
    "message" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_subject_allocations_id_school_id_key" ON "teacher_subject_allocations"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_configs_id_school_id_key" ON "timetable_configs"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_configs_school_term_scope_key" ON "timetable_configs"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "timetable_configs_school_id_idx" ON "timetable_configs"("school_id");

-- CreateIndex
CREATE INDEX "timetable_configs_academic_year_id_idx" ON "timetable_configs"("academic_year_id");

-- CreateIndex
CREATE INDEX "timetable_configs_term_id_idx" ON "timetable_configs"("term_id");

-- CreateIndex
CREATE INDEX "timetable_configs_grade_id_idx" ON "timetable_configs"("grade_id");

-- CreateIndex
CREATE INDEX "timetable_configs_section_id_idx" ON "timetable_configs"("section_id");

-- CreateIndex
CREATE INDEX "timetable_configs_classroom_id_idx" ON "timetable_configs"("classroom_id");

-- CreateIndex
CREATE INDEX "timetable_configs_school_id_academic_year_id_term_id_status_idx" ON "timetable_configs"("school_id", "academic_year_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "timetable_configs_school_id_term_id_scope_type_scope_key_idx" ON "timetable_configs"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_periods_id_school_id_key" ON "timetable_periods"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_periods_config_index_key" ON "timetable_periods"("school_id", "timetable_config_id", "period_index");

-- CreateIndex
CREATE INDEX "timetable_periods_school_id_idx" ON "timetable_periods"("school_id");

-- CreateIndex
CREATE INDEX "timetable_periods_timetable_config_id_idx" ON "timetable_periods"("timetable_config_id");

-- CreateIndex
CREATE INDEX "timetable_periods_school_id_timetable_config_id_idx" ON "timetable_periods"("school_id", "timetable_config_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_id_school_id_key" ON "timetable_entries"("id", "school_id");

-- CreateIndex
CREATE INDEX "timetable_entries_school_id_idx" ON "timetable_entries"("school_id");

-- CreateIndex
CREATE INDEX "timetable_entries_academic_year_id_idx" ON "timetable_entries"("academic_year_id");

-- CreateIndex
CREATE INDEX "timetable_entries_term_id_idx" ON "timetable_entries"("term_id");

-- CreateIndex
CREATE INDEX "timetable_entries_timetable_config_id_idx" ON "timetable_entries"("timetable_config_id");

-- CreateIndex
CREATE INDEX "timetable_entries_period_id_idx" ON "timetable_entries"("period_id");

-- CreateIndex
CREATE INDEX "timetable_entries_grade_id_idx" ON "timetable_entries"("grade_id");

-- CreateIndex
CREATE INDEX "timetable_entries_section_id_idx" ON "timetable_entries"("section_id");

-- CreateIndex
CREATE INDEX "timetable_entries_classroom_id_idx" ON "timetable_entries"("classroom_id");

-- CreateIndex
CREATE INDEX "timetable_entries_subject_id_idx" ON "timetable_entries"("subject_id");

-- CreateIndex
CREATE INDEX "timetable_entries_teacher_user_id_idx" ON "timetable_entries"("teacher_user_id");

-- CreateIndex
CREATE INDEX "timetable_entries_teacher_subject_allocation_id_idx" ON "timetable_entries"("teacher_subject_allocation_id");

-- CreateIndex
CREATE INDEX "timetable_entries_room_id_idx" ON "timetable_entries"("room_id");

-- CreateIndex
CREATE INDEX "timetable_entries_school_id_term_id_classroom_id_day_of_week_period_id_idx" ON "timetable_entries"("school_id", "term_id", "classroom_id", "day_of_week", "period_id");

-- CreateIndex
CREATE INDEX "timetable_entries_school_id_term_id_teacher_user_id_day_of_week_period_id_idx" ON "timetable_entries"("school_id", "term_id", "teacher_user_id", "day_of_week", "period_id");

-- CreateIndex
CREATE INDEX "timetable_entries_school_id_term_id_room_id_day_of_week_period_id_idx" ON "timetable_entries"("school_id", "term_id", "room_id", "day_of_week", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_publications_id_school_id_key" ON "timetable_publications"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_publications_config_revision_key" ON "timetable_publications"("school_id", "timetable_config_id", "revision");

-- CreateIndex
CREATE INDEX "timetable_publications_school_id_idx" ON "timetable_publications"("school_id");

-- CreateIndex
CREATE INDEX "timetable_publications_academic_year_id_idx" ON "timetable_publications"("academic_year_id");

-- CreateIndex
CREATE INDEX "timetable_publications_term_id_idx" ON "timetable_publications"("term_id");

-- CreateIndex
CREATE INDEX "timetable_publications_timetable_config_id_idx" ON "timetable_publications"("timetable_config_id");

-- CreateIndex
CREATE INDEX "timetable_publications_published_by_user_id_idx" ON "timetable_publications"("published_by_user_id");

-- CreateIndex
CREATE INDEX "timetable_publications_school_id_term_id_status_idx" ON "timetable_publications"("school_id", "term_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_conflicts_id_school_id_key" ON "timetable_conflicts"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_conflicts_school_fingerprint_key" ON "timetable_conflicts"("school_id", "fingerprint");

-- CreateIndex
CREATE INDEX "timetable_conflicts_school_id_idx" ON "timetable_conflicts"("school_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_academic_year_id_idx" ON "timetable_conflicts"("academic_year_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_term_id_idx" ON "timetable_conflicts"("term_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_timetable_config_id_idx" ON "timetable_conflicts"("timetable_config_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_entry_id_idx" ON "timetable_conflicts"("entry_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_related_entry_id_idx" ON "timetable_conflicts"("related_entry_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_period_id_idx" ON "timetable_conflicts"("period_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_teacher_user_id_idx" ON "timetable_conflicts"("teacher_user_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_room_id_idx" ON "timetable_conflicts"("room_id");

-- CreateIndex
CREATE INDEX "timetable_conflicts_school_id_term_id_status_idx" ON "timetable_conflicts"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "timetable_conflicts_school_id_timetable_config_id_conflict_type_status_idx" ON "timetable_conflicts"("school_id", "timetable_config_id", "conflict_type", "status");

-- AddForeignKey
ALTER TABLE "timetable_configs" ADD CONSTRAINT "timetable_configs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_configs" ADD CONSTRAINT "timetable_configs_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_configs" ADD CONSTRAINT "timetable_configs_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_configs" ADD CONSTRAINT "timetable_configs_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_configs" ADD CONSTRAINT "timetable_configs_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_configs" ADD CONSTRAINT "timetable_configs_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_timetable_config_id_school_id_fkey" FOREIGN KEY ("timetable_config_id", "school_id") REFERENCES "timetable_configs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_timetable_config_id_school_id_fkey" FOREIGN KEY ("timetable_config_id", "school_id") REFERENCES "timetable_configs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_period_id_school_id_fkey" FOREIGN KEY ("period_id", "school_id") REFERENCES "timetable_periods"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_teacher_subject_allocation_id_school_id_fkey" FOREIGN KEY ("teacher_subject_allocation_id", "school_id") REFERENCES "teacher_subject_allocations"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_room_id_school_id_fkey" FOREIGN KEY ("room_id", "school_id") REFERENCES "rooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publications_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publications_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publications_timetable_config_id_school_id_fkey" FOREIGN KEY ("timetable_config_id", "school_id") REFERENCES "timetable_configs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publications_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_timetable_config_id_school_id_fkey" FOREIGN KEY ("timetable_config_id", "school_id") REFERENCES "timetable_configs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_entry_id_school_id_fkey" FOREIGN KEY ("entry_id", "school_id") REFERENCES "timetable_entries"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_related_entry_id_school_id_fkey" FOREIGN KEY ("related_entry_id", "school_id") REFERENCES "timetable_entries"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_period_id_school_id_fkey" FOREIGN KEY ("period_id", "school_id") REFERENCES "timetable_periods"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_conflicts" ADD CONSTRAINT "timetable_conflicts_room_id_school_id_fkey" FOREIGN KEY ("room_id", "school_id") REFERENCES "rooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
