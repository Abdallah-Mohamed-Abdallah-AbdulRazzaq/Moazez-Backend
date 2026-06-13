-- CreateEnum
CREATE TYPE "academic_calendar_event_type" AS ENUM ('HOLIDAY', 'EXAM', 'ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "academic_calendar_event_scope_type" AS ENUM ('SCHOOL', 'STAGE', 'GRADE', 'SECTION');

-- CreateTable
CREATE TABLE "academic_calendar_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "type" "academic_calendar_event_type" NOT NULL,
    "scope_type" "academic_calendar_event_scope_type" NOT NULL,
    "scope_key" UUID,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "all_day" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "deleted_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "academic_calendar_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "academic_calendar_events_date_range_check" CHECK ("start_date" <= "end_date"),
    CONSTRAINT "academic_calendar_events_scope_consistency_check" CHECK (
        (
            "scope_type" = 'SCHOOL'
            AND "scope_key" IS NULL
            AND "stage_id" IS NULL
            AND "grade_id" IS NULL
            AND "section_id" IS NULL
        )
        OR (
            "scope_type" = 'STAGE'
            AND "scope_key" IS NOT NULL
            AND "stage_id" IS NOT NULL
            AND "scope_key" = "stage_id"
            AND "grade_id" IS NULL
            AND "section_id" IS NULL
        )
        OR (
            "scope_type" = 'GRADE'
            AND "scope_key" IS NOT NULL
            AND "grade_id" IS NOT NULL
            AND "scope_key" = "grade_id"
            AND "stage_id" IS NULL
            AND "section_id" IS NULL
        )
        OR (
            "scope_type" = 'SECTION'
            AND "scope_key" IS NOT NULL
            AND "section_id" IS NOT NULL
            AND "scope_key" = "section_id"
            AND "stage_id" IS NULL
            AND "grade_id" IS NULL
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_calendar_events_id_school_id_key" ON "academic_calendar_events"("id", "school_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_school_id_idx" ON "academic_calendar_events"("school_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_academic_year_id_idx" ON "academic_calendar_events"("academic_year_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_term_id_idx" ON "academic_calendar_events"("term_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_stage_id_idx" ON "academic_calendar_events"("stage_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_grade_id_idx" ON "academic_calendar_events"("grade_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_section_id_idx" ON "academic_calendar_events"("section_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_created_by_user_id_idx" ON "academic_calendar_events"("created_by_user_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_updated_by_user_id_idx" ON "academic_calendar_events"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_deleted_by_user_id_idx" ON "academic_calendar_events"("deleted_by_user_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_school_id_academic_year_id_idx" ON "academic_calendar_events"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_school_id_term_id_idx" ON "academic_calendar_events"("school_id", "term_id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_school_id_term_id_start_date_idx" ON "academic_calendar_events"("school_id", "term_id", "start_date");

-- CreateIndex
CREATE INDEX "academic_calendar_events_school_id_term_id_type_idx" ON "academic_calendar_events"("school_id", "term_id", "type");

-- CreateIndex
CREATE INDEX "academic_calendar_events_term_scope_idx" ON "academic_calendar_events"("school_id", "term_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "academic_calendar_events_deleted_at_idx" ON "academic_calendar_events"("deleted_at");

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
