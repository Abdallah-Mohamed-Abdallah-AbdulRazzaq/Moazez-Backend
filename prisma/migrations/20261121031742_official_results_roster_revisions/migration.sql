BEGIN;

-- CreateEnum
CREATE TYPE "result_placement_action" AS ENUM ('ADD', 'KEEP_HISTORICAL', 'MOVE_DRAFT', 'CLOSE_DRAFT', 'EXEMPT_GROUP', 'REINSTATE_GROUP');

-- AlterEnum
ALTER TYPE "result_configuration_preview_kind" ADD VALUE 'ROSTER_RECONCILIATION';

-- AlterTable
ALTER TABLE "result_cells" ADD COLUMN     "state_reason" VARCHAR(2000);

-- AlterTable
ALTER TABLE "result_slots" ADD COLUMN     "group_exempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "historical_placement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "placement_revision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "result_placement_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "reporting_period_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "action" "result_placement_action" NOT NULL,
    "from_sheet_id" UUID,
    "to_sheet_id" UUID NOT NULL,
    "from_enrollment_id" UUID,
    "to_enrollment_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "roster_as_of" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "field_mapping" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_placement_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "result_placement_revisions_school_id_from_sheet_id_reportin_idx" ON "result_placement_revisions"("school_id", "from_sheet_id", "reporting_period_id", "group_id");

-- CreateIndex
CREATE INDEX "result_placement_revisions_school_id_to_sheet_id_reporting__idx" ON "result_placement_revisions"("school_id", "to_sheet_id", "reporting_period_id", "group_id");

-- CreateIndex
CREATE INDEX "result_placement_revisions_school_id_from_enrollment_id_stu_idx" ON "result_placement_revisions"("school_id", "from_enrollment_id", "student_id");

-- CreateIndex
CREATE INDEX "result_placement_revisions_school_id_to_enrollment_id_stude_idx" ON "result_placement_revisions"("school_id", "to_enrollment_id", "student_id");

-- CreateIndex
CREATE INDEX "result_placement_revisions_school_id_author_id_idx" ON "result_placement_revisions"("school_id", "author_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_placement_revisions_school_id_slot_id_version_key" ON "result_placement_revisions"("school_id", "slot_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "result_slot_placement_context_key" ON "result_slots"("id", "school_id", "student_id", "reporting_period_id", "group_id");

-- AddForeignKey
ALTER TABLE "result_placement_revisions" ADD CONSTRAINT "result_placement_revisions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_placement_revisions" ADD CONSTRAINT "result_placement_revisions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_placement_revisions" ADD CONSTRAINT "result_placement_slot_fk" FOREIGN KEY ("slot_id", "school_id", "student_id", "reporting_period_id", "group_id") REFERENCES "result_slots"("id", "school_id", "student_id", "reporting_period_id", "group_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_placement_revisions" ADD CONSTRAINT "result_placement_from_sheet_fk" FOREIGN KEY ("from_sheet_id", "school_id", "reporting_period_id", "group_id") REFERENCES "result_sheets"("id", "school_id", "reporting_period_id", "group_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_placement_revisions" ADD CONSTRAINT "result_placement_to_sheet_fk" FOREIGN KEY ("to_sheet_id", "school_id", "reporting_period_id", "group_id") REFERENCES "result_sheets"("id", "school_id", "reporting_period_id", "group_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_placement_revisions" ADD CONSTRAINT "result_placement_from_enrollment_fk" FOREIGN KEY ("from_enrollment_id", "school_id", "student_id") REFERENCES "student_enrollments"("id", "school_id", "student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_placement_revisions" ADD CONSTRAINT "result_placement_to_enrollment_fk" FOREIGN KEY ("to_enrollment_id", "school_id", "student_id") REFERENCES "student_enrollments"("id", "school_id", "student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE result_placement_revisions ADD CONSTRAINT result_placement_revision_shape_check CHECK (
  version >= 1 AND btrim(reason) <> ''
  AND (action = 'ADD') = (from_sheet_id IS NULL AND from_enrollment_id IS NULL)
  AND (from_sheet_id IS NULL) = (from_enrollment_id IS NULL)
  AND (field_mapping IS NULL OR (action = 'MOVE_DRAFT' AND jsonb_typeof(field_mapping) = 'array'))
);
CREATE TRIGGER result_placement_revision_immutable
BEFORE UPDATE OR DELETE ON result_placement_revisions
FOR EACH ROW EXECUTE FUNCTION public.official_results_preserve_version();

COMMIT;
