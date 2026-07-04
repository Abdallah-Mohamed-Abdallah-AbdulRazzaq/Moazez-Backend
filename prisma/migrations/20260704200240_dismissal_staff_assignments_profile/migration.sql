-- CreateTable
CREATE TABLE "dismissal_staff_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "gate_id" UUID,
    "stage_id" UUID,
    "grade_id" UUID,
    "section_id" UUID,
    "classroom_id" UUID,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dismissal_staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dismissal_staff_assignments_id_school_id_key" ON "dismissal_staff_assignments"("id", "school_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_school_id_idx" ON "dismissal_staff_assignments"("school_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_staff_user_id_idx" ON "dismissal_staff_assignments"("staff_user_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_gate_id_idx" ON "dismissal_staff_assignments"("gate_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_stage_id_idx" ON "dismissal_staff_assignments"("stage_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_grade_id_idx" ON "dismissal_staff_assignments"("grade_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_section_id_idx" ON "dismissal_staff_assignments"("section_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_classroom_id_idx" ON "dismissal_staff_assignments"("classroom_id");

-- CreateIndex
CREATE INDEX "dismissal_staff_school_staff_active_deleted_idx" ON "dismissal_staff_assignments"("school_id", "staff_user_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "dismissal_staff_school_gate_active_deleted_idx" ON "dismissal_staff_assignments"("school_id", "gate_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "dismissal_staff_school_classroom_active_deleted_idx" ON "dismissal_staff_assignments"("school_id", "classroom_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "dismissal_staff_school_active_deleted_idx" ON "dismissal_staff_assignments"("school_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "dismissal_staff_assignments_deleted_at_idx" ON "dismissal_staff_assignments"("deleted_at");

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_gate_id_school_id_fkey" FOREIGN KEY ("gate_id", "school_id") REFERENCES "dismissal_gates"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_stage_id_school_id_fkey" FOREIGN KEY ("stage_id", "school_id") REFERENCES "stages"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_section_id_school_id_fkey" FOREIGN KEY ("section_id", "school_id") REFERENCES "sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_classroom_id_school_id_fkey" FOREIGN KEY ("classroom_id", "school_id") REFERENCES "classrooms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_staff_assignments" ADD CONSTRAINT "dismissal_staff_assignments_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
