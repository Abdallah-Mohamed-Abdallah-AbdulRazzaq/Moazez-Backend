-- CreateTable
CREATE TABLE "academic_content_preparation_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "normalized_name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(1000),
    "stage_id" UUID,
    "subject_id" UUID,
    "topic" VARCHAR(500),
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "learning_outcomes" JSONB NOT NULL DEFAULT '[]',
    "teaching_strategies" JSONB NOT NULL DEFAULT '[]',
    "activities" JSONB NOT NULL DEFAULT '[]',
    "resource_notes" VARCHAR(4000),
    "assessment_notes" VARCHAR(4000),
    "teacher_notes" VARCHAR(4000),
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_preparation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_content_preparation_templates_school_id_idx" ON "academic_content_preparation_templates"("school_id");

-- CreateIndex
CREATE INDEX "academic_content_preparation_templates_school_id_stage_id_idx" ON "academic_content_preparation_templates"("school_id", "stage_id");

-- CreateIndex
CREATE INDEX "academic_content_preparation_templates_school_id_subject_id_idx" ON "academic_content_preparation_templates"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "academic_content_preparation_templates_created_by_user_id_idx" ON "academic_content_preparation_templates"("created_by_user_id");

-- CreateIndex
CREATE INDEX "academic_content_preparation_templates_updated_by_user_id_idx" ON "academic_content_preparation_templates"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "academic_content_preparation_templates_deleted_at_idx" ON "academic_content_preparation_templates"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "academic_content_preparation_templates_id_school_id_key" ON "academic_content_preparation_templates"("id", "school_id");

-- AddForeignKey
ALTER TABLE "academic_content_preparation_templates" ADD CONSTRAINT "academic_content_preparation_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_preparation_templates" ADD CONSTRAINT "academic_content_preparation_templates_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_preparation_templates" ADD CONSTRAINT "academic_content_preparation_templates_subject_id_school_i_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_preparation_templates" ADD CONSTRAINT "academic_content_preparation_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_content_preparation_templates" ADD CONSTRAINT "academic_content_preparation_templates_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma cannot express a soft-delete-aware unique index or JSONB shape checks.
CREATE UNIQUE INDEX "acc_preparation_templates_active_name_key"
  ON "academic_content_preparation_templates"("school_id", "normalized_name")
  WHERE "deleted_at" IS NULL;

ALTER TABLE "academic_content_preparation_templates"
  ADD CONSTRAINT "acc_preparation_template_objectives_array_check" CHECK (jsonb_typeof("objectives") = 'array'),
  ADD CONSTRAINT "acc_preparation_template_outcomes_array_check" CHECK (jsonb_typeof("learning_outcomes") = 'array'),
  ADD CONSTRAINT "acc_preparation_template_strategies_array_check" CHECK (jsonb_typeof("teaching_strategies") = 'array'),
  ADD CONSTRAINT "acc_preparation_template_activities_array_check" CHECK (jsonb_typeof("activities") = 'array');
