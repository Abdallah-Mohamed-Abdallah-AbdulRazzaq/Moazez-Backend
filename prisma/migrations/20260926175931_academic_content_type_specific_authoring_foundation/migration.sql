-- CreateEnum
CREATE TYPE "academic_guardian_note_priority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');

-- CreateEnum
CREATE TYPE "academic_subject_resource_category" AS ENUM ('WORKSHEET', 'PRESENTATION', 'REFERENCE', 'REVISION', 'ACTIVITY', 'EXAM_PREPARATION', 'VIDEO', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "academic_online_session_platform" AS ENUM ('GOOGLE_MEET', 'ZOOM', 'MICROSOFT_TEAMS', 'WEBEX', 'OTHER');

-- AlterTable
ALTER TABLE "academic_content_revisions" ADD COLUMN     "type_specific_snapshot" JSONB;

-- CreateTable
CREATE TABLE "academic_content_preparation_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "content_type" "academic_content_type" NOT NULL DEFAULT 'TEACHER_PREPARATION',
    "topic" VARCHAR(500),
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "learning_outcomes" JSONB NOT NULL DEFAULT '[]',
    "teaching_strategies" JSONB NOT NULL DEFAULT '[]',
    "activities" JSONB NOT NULL DEFAULT '[]',
    "resource_notes" VARCHAR(4000),
    "assessment_notes" VARCHAR(4000),
    "teacher_notes" VARCHAR(4000),
    "curriculum_id" UUID,
    "curriculum_unit_id" UUID,
    "curriculum_lesson_id" UUID,
    "lesson_plan_id" UUID,
    "lesson_plan_item_id" UUID,
    "timetable_entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_preparation_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_weekly_plan_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "content_type" "academic_content_type" NOT NULL DEFAULT 'WEEKLY_PLAN',
    "week_start_date" DATE NOT NULL,
    "week_end_date" DATE NOT NULL,
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "topics" JSONB NOT NULL DEFAULT '[]',
    "expected_homework" VARCHAR(4000),
    "upcoming_assessments" VARCHAR(4000),
    "notes" VARCHAR(4000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_weekly_plan_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_guardian_note_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "content_type" "academic_content_type" NOT NULL DEFAULT 'GUARDIAN_WEEKLY_NOTE',
    "body" VARCHAR(10000) NOT NULL,
    "priority" "academic_guardian_note_priority" NOT NULL,
    "requires_acknowledgement" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_guardian_note_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_subject_resource_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "content_type" "academic_content_type" NOT NULL DEFAULT 'SUBJECT_RESOURCE',
    "resource_category" "academic_subject_resource_category" NOT NULL,
    "curriculum_id" UUID,
    "curriculum_unit_id" UUID,
    "curriculum_lesson_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_subject_resource_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_online_session_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_content_id" UUID NOT NULL,
    "content_type" "academic_content_type" NOT NULL DEFAULT 'ONLINE_SESSION',
    "platform" "academic_online_session_platform" NOT NULL,
    "provider_name" VARCHAR(180),
    "join_url" VARCHAR(2048) NOT NULL,
    "access_code" VARCHAR(255),
    "instructions" VARCHAR(4000),
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "timezone" VARCHAR(100) NOT NULL,
    "timetable_entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_online_session_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_weekly_plan_homework_references" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "weekly_plan_detail_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_content_weekly_plan_homework_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_content_weekly_plan_assessment_references" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "weekly_plan_detail_id" UUID NOT NULL,
    "grade_assessment_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_content_weekly_plan_assessment_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_content_preparation_details_school_id_curriculum_i_idx" ON "academic_content_preparation_details"("school_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "academic_content_preparation_details_school_id_curriculum_u_idx" ON "academic_content_preparation_details"("school_id", "curriculum_unit_id");

-- CreateIndex
CREATE INDEX "academic_content_preparation_details_school_id_curriculum_l_idx" ON "academic_content_preparation_details"("school_id", "curriculum_lesson_id");

-- CreateIndex
CREATE INDEX "acc_preparation_lesson_plan_idx" ON "academic_content_preparation_details"("school_id", "lesson_plan_id");

-- CreateIndex
CREATE INDEX "acc_preparation_lesson_plan_item_idx" ON "academic_content_preparation_details"("school_id", "lesson_plan_item_id");

-- CreateIndex
CREATE INDEX "academic_content_preparation_details_school_id_timetable_en_idx" ON "academic_content_preparation_details"("school_id", "timetable_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_preparation_details_id_school_id_key" ON "academic_content_preparation_details"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_preparation_details_school_id_academic_con_key" ON "academic_content_preparation_details"("school_id", "academic_content_id");

-- CreateIndex
CREATE UNIQUE INDEX "acc_preparation_parent_type_unique" ON "academic_content_preparation_details"("academic_content_id", "school_id", "content_type");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_weekly_plan_details_id_school_id_key" ON "academic_content_weekly_plan_details"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_weekly_plan_details_school_id_academic_con_key" ON "academic_content_weekly_plan_details"("school_id", "academic_content_id");

-- CreateIndex
CREATE UNIQUE INDEX "acc_weekly_plan_parent_type_unique" ON "academic_content_weekly_plan_details"("academic_content_id", "school_id", "content_type");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_guardian_note_details_id_school_id_key" ON "academic_content_guardian_note_details"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_guardian_note_details_school_id_academic_c_key" ON "academic_content_guardian_note_details"("school_id", "academic_content_id");

-- CreateIndex
CREATE UNIQUE INDEX "acc_guardian_note_parent_type_unique" ON "academic_content_guardian_note_details"("academic_content_id", "school_id", "content_type");

-- CreateIndex
CREATE INDEX "acc_subject_resource_curriculum_idx" ON "academic_content_subject_resource_details"("school_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "acc_subject_resource_unit_idx" ON "academic_content_subject_resource_details"("school_id", "curriculum_unit_id");

-- CreateIndex
CREATE INDEX "acc_subject_resource_lesson_idx" ON "academic_content_subject_resource_details"("school_id", "curriculum_lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_subject_resource_details_id_school_id_key" ON "academic_content_subject_resource_details"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_subject_resource_details_school_id_academi_key" ON "academic_content_subject_resource_details"("school_id", "academic_content_id");

-- CreateIndex
CREATE UNIQUE INDEX "acc_subject_resource_parent_type_unique" ON "academic_content_subject_resource_details"("academic_content_id", "school_id", "content_type");

-- CreateIndex
CREATE INDEX "academic_content_online_session_details_school_id_timetable_idx" ON "academic_content_online_session_details"("school_id", "timetable_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_online_session_details_id_school_id_key" ON "academic_content_online_session_details"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_online_session_details_school_id_academic__key" ON "academic_content_online_session_details"("school_id", "academic_content_id");

-- CreateIndex
CREATE UNIQUE INDEX "acc_online_session_parent_type_unique" ON "academic_content_online_session_details"("academic_content_id", "school_id", "content_type");

-- CreateIndex
CREATE INDEX "acc_weekly_homework_detail_idx" ON "academic_content_weekly_plan_homework_references"("school_id", "weekly_plan_detail_id");

-- CreateIndex
CREATE INDEX "acc_weekly_homework_assignment_idx" ON "academic_content_weekly_plan_homework_references"("school_id", "homework_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_weekly_plan_homework_references_school_id__key" ON "academic_content_weekly_plan_homework_references"("school_id", "weekly_plan_detail_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "acc_weekly_assessment_detail_idx" ON "academic_content_weekly_plan_assessment_references"("school_id", "weekly_plan_detail_id");

-- CreateIndex
CREATE INDEX "acc_weekly_assessment_grade_idx" ON "academic_content_weekly_plan_assessment_references"("school_id", "grade_assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_weekly_plan_assessment_references_school_i_key" ON "academic_content_weekly_plan_assessment_references"("school_id", "weekly_plan_detail_id", "grade_assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_contents_id_school_id_type_key" ON "academic_contents"("id", "school_id", "type");

-- AddForeignKey
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "academic_content_preparation_details_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "academic_content_preparation_details_academic_content_id_s_fkey" FOREIGN KEY ("academic_content_id", "school_id", "content_type") REFERENCES "academic_contents"("id", "school_id", "type") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "academic_content_preparation_details_curriculum_id_school__fkey" FOREIGN KEY ("curriculum_id", "school_id") REFERENCES "curricula"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "academic_content_preparation_details_curriculum_unit_id_sc_fkey" FOREIGN KEY ("curriculum_unit_id", "school_id") REFERENCES "curriculum_units"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "academic_content_preparation_details_curriculum_lesson_id__fkey" FOREIGN KEY ("curriculum_lesson_id", "school_id") REFERENCES "curriculum_lessons"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "academic_content_preparation_details_lesson_plan_id_school_fkey" FOREIGN KEY ("lesson_plan_id", "school_id") REFERENCES "lesson_plans"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "academic_content_preparation_details_lesson_plan_item_id_s_fkey" FOREIGN KEY ("lesson_plan_item_id", "school_id") REFERENCES "lesson_plan_items"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_weekly_plan_details" ADD CONSTRAINT "academic_content_weekly_plan_details_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_weekly_plan_details" ADD CONSTRAINT "academic_content_weekly_plan_details_academic_content_id_s_fkey" FOREIGN KEY ("academic_content_id", "school_id", "content_type") REFERENCES "academic_contents"("id", "school_id", "type") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_guardian_note_details" ADD CONSTRAINT "academic_content_guardian_note_details_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_guardian_note_details" ADD CONSTRAINT "academic_content_guardian_note_details_academic_content_id_fkey" FOREIGN KEY ("academic_content_id", "school_id", "content_type") REFERENCES "academic_contents"("id", "school_id", "type") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_subject_resource_details" ADD CONSTRAINT "academic_content_subject_resource_details_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_subject_resource_details" ADD CONSTRAINT "academic_content_subject_resource_details_academic_content_fkey" FOREIGN KEY ("academic_content_id", "school_id", "content_type") REFERENCES "academic_contents"("id", "school_id", "type") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_subject_resource_details" ADD CONSTRAINT "academic_content_subject_resource_details_curriculum_id_sc_fkey" FOREIGN KEY ("curriculum_id", "school_id") REFERENCES "curricula"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_subject_resource_details" ADD CONSTRAINT "academic_content_subject_resource_details_curriculum_unit__fkey" FOREIGN KEY ("curriculum_unit_id", "school_id") REFERENCES "curriculum_units"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_subject_resource_details" ADD CONSTRAINT "academic_content_subject_resource_details_curriculum_lesso_fkey" FOREIGN KEY ("curriculum_lesson_id", "school_id") REFERENCES "curriculum_lessons"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_online_session_details" ADD CONSTRAINT "academic_content_online_session_details_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_online_session_details" ADD CONSTRAINT "academic_content_online_session_details_academic_content_i_fkey" FOREIGN KEY ("academic_content_id", "school_id", "content_type") REFERENCES "academic_contents"("id", "school_id", "type") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_weekly_plan_homework_references" ADD CONSTRAINT "academic_content_weekly_plan_homework_references_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_weekly_plan_homework_references" ADD CONSTRAINT "academic_content_weekly_plan_homework_references_weekly_pl_fkey" FOREIGN KEY ("weekly_plan_detail_id", "school_id") REFERENCES "academic_content_weekly_plan_details"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_weekly_plan_homework_references" ADD CONSTRAINT "academic_content_weekly_plan_homework_references_homework__fkey" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_weekly_plan_assessment_references" ADD CONSTRAINT "academic_content_weekly_plan_assessment_references_school__fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_weekly_plan_assessment_references" ADD CONSTRAINT "academic_content_weekly_plan_assessment_references_weekly__fkey" FOREIGN KEY ("weekly_plan_detail_id", "school_id") REFERENCES "academic_content_weekly_plan_details"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_weekly_plan_assessment_references" ADD CONSTRAINT "academic_content_weekly_plan_assessment_references_grade_a_fkey" FOREIGN KEY ("grade_assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot model CHECK constraints. Fixed discriminators and the composite
-- parent foreign keys jointly enforce the parent type for every detail row.
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "acc_preparation_fixed_type_check" CHECK ("content_type" = 'TEACHER_PREPARATION');
ALTER TABLE "academic_content_weekly_plan_details" ADD CONSTRAINT "acc_weekly_plan_fixed_type_check" CHECK ("content_type" = 'WEEKLY_PLAN');
ALTER TABLE "academic_content_guardian_note_details" ADD CONSTRAINT "acc_guardian_note_fixed_type_check" CHECK ("content_type" = 'GUARDIAN_WEEKLY_NOTE');
ALTER TABLE "academic_content_subject_resource_details" ADD CONSTRAINT "acc_subject_resource_fixed_type_check" CHECK ("content_type" = 'SUBJECT_RESOURCE');
ALTER TABLE "academic_content_online_session_details" ADD CONSTRAINT "acc_online_session_fixed_type_check" CHECK ("content_type" = 'ONLINE_SESSION');

-- Structured lists are arrays; element and length validation belongs to ACC-5B.
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "acc_preparation_objectives_array_check" CHECK (jsonb_typeof("objectives") = 'array');
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "acc_preparation_outcomes_array_check" CHECK (jsonb_typeof("learning_outcomes") = 'array');
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "acc_preparation_strategies_array_check" CHECK (jsonb_typeof("teaching_strategies") = 'array');
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "acc_preparation_activities_array_check" CHECK (jsonb_typeof("activities") = 'array');
ALTER TABLE "academic_content_weekly_plan_details" ADD CONSTRAINT "acc_weekly_objectives_array_check" CHECK (jsonb_typeof("objectives") = 'array');
ALTER TABLE "academic_content_weekly_plan_details" ADD CONSTRAINT "acc_weekly_topics_array_check" CHECK (jsonb_typeof("topics") = 'array');

-- Optional reference shape; relationship context is validated in ACC-5B.
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "acc_preparation_unit_requires_curriculum_check" CHECK ("curriculum_unit_id" IS NULL OR "curriculum_id" IS NOT NULL);
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "acc_preparation_lesson_requires_unit_check" CHECK ("curriculum_lesson_id" IS NULL OR ("curriculum_id" IS NOT NULL AND "curriculum_unit_id" IS NOT NULL));
ALTER TABLE "academic_content_preparation_details" ADD CONSTRAINT "acc_preparation_item_requires_plan_check" CHECK ("lesson_plan_item_id" IS NULL OR "lesson_plan_id" IS NOT NULL);
ALTER TABLE "academic_content_subject_resource_details" ADD CONSTRAINT "acc_resource_unit_requires_curriculum_check" CHECK ("curriculum_unit_id" IS NULL OR "curriculum_id" IS NOT NULL);
ALTER TABLE "academic_content_subject_resource_details" ADD CONSTRAINT "acc_resource_lesson_requires_unit_check" CHECK ("curriculum_lesson_id" IS NULL OR ("curriculum_id" IS NOT NULL AND "curriculum_unit_id" IS NOT NULL));

ALTER TABLE "academic_content_weekly_plan_details" ADD CONSTRAINT "acc_weekly_date_order_check" CHECK ("week_start_date" <= "week_end_date");
ALTER TABLE "academic_content_online_session_details" ADD CONSTRAINT "acc_session_time_order_check" CHECK ("start_at" < "end_at");
ALTER TABLE "academic_content_online_session_details" ADD CONSTRAINT "acc_session_other_provider_check" CHECK ("platform" <> 'OTHER' OR ("provider_name" IS NOT NULL AND btrim("provider_name") <> ''));
