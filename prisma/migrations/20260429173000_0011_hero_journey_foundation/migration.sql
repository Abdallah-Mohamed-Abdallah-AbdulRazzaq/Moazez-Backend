-- CreateEnum
CREATE TYPE "hero_mission_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "hero_mission_objective_type" AS ENUM ('MANUAL', 'LESSON', 'QUIZ', 'ASSESSMENT', 'TASK', 'CUSTOM');

-- CreateEnum
CREATE TYPE "hero_mission_progress_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "hero_journey_event_type" AS ENUM ('MISSION_STARTED', 'OBJECTIVE_COMPLETED', 'MISSION_COMPLETED', 'BADGE_AWARDED', 'XP_GRANTED');

-- AlterEnum
ALTER TYPE "xp_source_type" ADD VALUE 'HERO_MISSION';

-- CreateTable
CREATE TABLE "hero_badges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name_en" TEXT,
    "name_ar" TEXT,
    "description_en" TEXT,
    "description_ar" TEXT,
    "asset_path" TEXT,
    "file_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hero_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_missions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "subject_id" UUID,
    "linked_assessment_id" UUID,
    "linked_lesson_ref" TEXT,
    "title_en" TEXT,
    "title_ar" TEXT,
    "brief_en" TEXT,
    "brief_ar" TEXT,
    "required_level" INTEGER NOT NULL DEFAULT 1,
    "reward_xp" INTEGER NOT NULL DEFAULT 0,
    "badge_reward_id" UUID,
    "status" "hero_mission_status" NOT NULL DEFAULT 'DRAFT',
    "position_x" INTEGER,
    "position_y" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "archived_at" TIMESTAMP(3),
    "archived_by_id" UUID,
    "created_by_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hero_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_mission_objectives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "mission_id" UUID NOT NULL,
    "type" "hero_mission_objective_type" NOT NULL DEFAULT 'MANUAL',
    "title_en" TEXT,
    "title_ar" TEXT,
    "subtitle_en" TEXT,
    "subtitle_ar" TEXT,
    "linked_assessment_id" UUID,
    "linked_lesson_ref" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hero_mission_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_mission_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "mission_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "status" "hero_mission_progress_status" NOT NULL DEFAULT 'NOT_STARTED',
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "xp_ledger_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_mission_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_mission_objective_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "mission_progress_id" UUID NOT NULL,
    "objective_id" UUID NOT NULL,
    "completed_at" TIMESTAMP(3),
    "completed_by_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_mission_objective_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_student_badges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,
    "mission_id" UUID,
    "mission_progress_id" UUID,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_student_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_journey_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "mission_id" UUID,
    "mission_progress_id" UUID,
    "objective_id" UUID,
    "student_id" UUID,
    "enrollment_id" UUID,
    "xp_ledger_id" UUID,
    "badge_id" UUID,
    "type" "hero_journey_event_type" NOT NULL,
    "source_id" TEXT,
    "actor_user_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_journey_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hero_badges_school_id_idx" ON "hero_badges"("school_id");

-- CreateIndex
CREATE INDEX "hero_badges_file_id_idx" ON "hero_badges"("file_id");

-- CreateIndex
CREATE INDEX "hero_badges_school_id_is_active_idx" ON "hero_badges"("school_id", "is_active");

-- CreateIndex
CREATE INDEX "hero_badges_school_id_sort_order_idx" ON "hero_badges"("school_id", "sort_order");

-- CreateIndex
CREATE INDEX "hero_badges_deleted_at_idx" ON "hero_badges"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "hero_badges_id_school_id_key" ON "hero_badges"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_badges_school_id_slug_key" ON "hero_badges"("school_id", "slug");

-- CreateIndex
CREATE INDEX "hero_missions_school_id_idx" ON "hero_missions"("school_id");

-- CreateIndex
CREATE INDEX "hero_missions_academic_year_id_idx" ON "hero_missions"("academic_year_id");

-- CreateIndex
CREATE INDEX "hero_missions_term_id_idx" ON "hero_missions"("term_id");

-- CreateIndex
CREATE INDEX "hero_missions_stage_id_idx" ON "hero_missions"("stage_id");

-- CreateIndex
CREATE INDEX "hero_missions_subject_id_idx" ON "hero_missions"("subject_id");

-- CreateIndex
CREATE INDEX "hero_missions_linked_assessment_id_idx" ON "hero_missions"("linked_assessment_id");

-- CreateIndex
CREATE INDEX "hero_missions_badge_reward_id_idx" ON "hero_missions"("badge_reward_id");

-- CreateIndex
CREATE INDEX "hero_missions_published_by_id_idx" ON "hero_missions"("published_by_id");

-- CreateIndex
CREATE INDEX "hero_missions_archived_by_id_idx" ON "hero_missions"("archived_by_id");

-- CreateIndex
CREATE INDEX "hero_missions_created_by_id_idx" ON "hero_missions"("created_by_id");

-- CreateIndex
CREATE INDEX "hero_missions_school_id_academic_year_id_term_id_stage_id_s_idx" ON "hero_missions"("school_id", "academic_year_id", "term_id", "stage_id", "status");

-- CreateIndex
CREATE INDEX "hero_missions_school_id_stage_id_sort_order_idx" ON "hero_missions"("school_id", "stage_id", "sort_order");

-- CreateIndex
CREATE INDEX "hero_missions_school_id_status_idx" ON "hero_missions"("school_id", "status");

-- CreateIndex
CREATE INDEX "hero_missions_deleted_at_idx" ON "hero_missions"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "hero_missions_id_school_id_key" ON "hero_missions"("id", "school_id");

-- CreateIndex
CREATE INDEX "hero_mission_objectives_school_id_idx" ON "hero_mission_objectives"("school_id");

-- CreateIndex
CREATE INDEX "hero_mission_objectives_mission_id_idx" ON "hero_mission_objectives"("mission_id");

-- CreateIndex
CREATE INDEX "hero_mission_objectives_linked_assessment_id_idx" ON "hero_mission_objectives"("linked_assessment_id");

-- CreateIndex
CREATE INDEX "hero_mission_objectives_school_id_mission_id_deleted_at_idx" ON "hero_mission_objectives"("school_id", "mission_id", "deleted_at");

-- CreateIndex
CREATE INDEX "hero_mission_objectives_deleted_at_idx" ON "hero_mission_objectives"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "hero_mission_objectives_id_school_id_key" ON "hero_mission_objectives"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_mission_objectives_school_id_mission_id_sort_order_key" ON "hero_mission_objectives"("school_id", "mission_id", "sort_order");

-- CreateIndex
CREATE INDEX "hero_mission_progress_school_id_idx" ON "hero_mission_progress"("school_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_mission_id_idx" ON "hero_mission_progress"("mission_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_student_id_idx" ON "hero_mission_progress"("student_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_enrollment_id_idx" ON "hero_mission_progress"("enrollment_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_academic_year_id_idx" ON "hero_mission_progress"("academic_year_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_term_id_idx" ON "hero_mission_progress"("term_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_xp_ledger_id_idx" ON "hero_mission_progress"("xp_ledger_id");

-- CreateIndex
CREATE INDEX "hero_mission_progress_school_id_student_id_status_idx" ON "hero_mission_progress"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "hero_mission_progress_school_id_academic_year_id_term_id_st_idx" ON "hero_mission_progress"("school_id", "academic_year_id", "term_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hero_mission_progress_id_school_id_key" ON "hero_mission_progress"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_mission_progress_school_id_mission_id_student_id_key" ON "hero_mission_progress"("school_id", "mission_id", "student_id");

-- CreateIndex
CREATE INDEX "hero_mission_objective_progress_school_id_idx" ON "hero_mission_objective_progress"("school_id");

-- CreateIndex
CREATE INDEX "hero_mission_objective_progress_mission_progress_id_idx" ON "hero_mission_objective_progress"("mission_progress_id");

-- CreateIndex
CREATE INDEX "hero_mission_objective_progress_objective_id_idx" ON "hero_mission_objective_progress"("objective_id");

-- CreateIndex
CREATE INDEX "hero_mission_objective_progress_completed_by_id_idx" ON "hero_mission_objective_progress"("completed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_mission_objective_progress_id_school_id_key" ON "hero_mission_objective_progress"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_mission_objective_progress_school_id_mission_progress__key" ON "hero_mission_objective_progress"("school_id", "mission_progress_id", "objective_id");

-- CreateIndex
CREATE INDEX "hero_student_badges_school_id_idx" ON "hero_student_badges"("school_id");

-- CreateIndex
CREATE INDEX "hero_student_badges_student_id_idx" ON "hero_student_badges"("student_id");

-- CreateIndex
CREATE INDEX "hero_student_badges_badge_id_idx" ON "hero_student_badges"("badge_id");

-- CreateIndex
CREATE INDEX "hero_student_badges_mission_id_idx" ON "hero_student_badges"("mission_id");

-- CreateIndex
CREATE INDEX "hero_student_badges_mission_progress_id_idx" ON "hero_student_badges"("mission_progress_id");

-- CreateIndex
CREATE INDEX "hero_student_badges_school_id_student_id_earned_at_idx" ON "hero_student_badges"("school_id", "student_id", "earned_at");

-- CreateIndex
CREATE UNIQUE INDEX "hero_student_badges_id_school_id_key" ON "hero_student_badges"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_student_badges_school_id_student_id_badge_id_key" ON "hero_student_badges"("school_id", "student_id", "badge_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_school_id_idx" ON "hero_journey_events"("school_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_mission_id_idx" ON "hero_journey_events"("mission_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_mission_progress_id_idx" ON "hero_journey_events"("mission_progress_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_objective_id_idx" ON "hero_journey_events"("objective_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_student_id_idx" ON "hero_journey_events"("student_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_enrollment_id_idx" ON "hero_journey_events"("enrollment_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_xp_ledger_id_idx" ON "hero_journey_events"("xp_ledger_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_badge_id_idx" ON "hero_journey_events"("badge_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_actor_user_id_idx" ON "hero_journey_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "hero_journey_events_school_id_type_occurred_at_idx" ON "hero_journey_events"("school_id", "type", "occurred_at");

-- CreateIndex
CREATE INDEX "hero_journey_events_school_id_student_id_occurred_at_idx" ON "hero_journey_events"("school_id", "student_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "hero_journey_events_id_school_id_key" ON "hero_journey_events"("id", "school_id");

-- AddForeignKey
ALTER TABLE "hero_badges" ADD CONSTRAINT "hero_badges_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_badges" ADD CONSTRAINT "hero_badges_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_linked_assessment_id_school_id_fkey" FOREIGN KEY ("linked_assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_badge_reward_id_school_id_fkey" FOREIGN KEY ("badge_reward_id", "school_id") REFERENCES "hero_badges"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_missions" ADD CONSTRAINT "hero_missions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objectives" ADD CONSTRAINT "hero_mission_objectives_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objectives" ADD CONSTRAINT "hero_mission_objectives_mission_id_school_id_fkey" FOREIGN KEY ("mission_id", "school_id") REFERENCES "hero_missions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objectives" ADD CONSTRAINT "hero_mission_objectives_linked_assessment_id_school_id_fkey" FOREIGN KEY ("linked_assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_mission_id_school_id_fkey" FOREIGN KEY ("mission_id", "school_id") REFERENCES "hero_missions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_progress" ADD CONSTRAINT "hero_mission_progress_xp_ledger_id_school_id_fkey" FOREIGN KEY ("xp_ledger_id", "school_id") REFERENCES "xp_ledger"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objective_progress" ADD CONSTRAINT "hero_mission_objective_progress_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objective_progress" ADD CONSTRAINT "hero_mission_objective_progress_mission_progress_id_school_fkey" FOREIGN KEY ("mission_progress_id", "school_id") REFERENCES "hero_mission_progress"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objective_progress" ADD CONSTRAINT "hero_mission_objective_progress_objective_id_school_id_fkey" FOREIGN KEY ("objective_id", "school_id") REFERENCES "hero_mission_objectives"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_mission_objective_progress" ADD CONSTRAINT "hero_mission_objective_progress_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_student_badges" ADD CONSTRAINT "hero_student_badges_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_student_badges" ADD CONSTRAINT "hero_student_badges_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_student_badges" ADD CONSTRAINT "hero_student_badges_badge_id_school_id_fkey" FOREIGN KEY ("badge_id", "school_id") REFERENCES "hero_badges"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_student_badges" ADD CONSTRAINT "hero_student_badges_mission_id_school_id_fkey" FOREIGN KEY ("mission_id", "school_id") REFERENCES "hero_missions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_student_badges" ADD CONSTRAINT "hero_student_badges_mission_progress_id_school_id_fkey" FOREIGN KEY ("mission_progress_id", "school_id") REFERENCES "hero_mission_progress"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_mission_id_school_id_fkey" FOREIGN KEY ("mission_id", "school_id") REFERENCES "hero_missions"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_mission_progress_id_school_id_fkey" FOREIGN KEY ("mission_progress_id", "school_id") REFERENCES "hero_mission_progress"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_objective_id_school_id_fkey" FOREIGN KEY ("objective_id", "school_id") REFERENCES "hero_mission_objectives"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_xp_ledger_id_school_id_fkey" FOREIGN KEY ("xp_ledger_id", "school_id") REFERENCES "xp_ledger"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_badge_id_school_id_fkey" FOREIGN KEY ("badge_id", "school_id") REFERENCES "hero_badges"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_journey_events" ADD CONSTRAINT "hero_journey_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
