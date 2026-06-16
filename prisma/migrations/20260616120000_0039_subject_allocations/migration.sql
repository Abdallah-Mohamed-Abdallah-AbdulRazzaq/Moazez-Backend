-- CreateTable
CREATE TABLE "subject_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "weekly_hours" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "subject_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subject_allocations_id_school_id_key" ON "subject_allocations"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_allocations_school_id_term_id_grade_id_subject_id_key" ON "subject_allocations"("school_id", "term_id", "grade_id", "subject_id");

-- CreateIndex
CREATE INDEX "subject_allocations_school_id_idx" ON "subject_allocations"("school_id");

-- CreateIndex
CREATE INDEX "subject_allocations_academic_year_id_idx" ON "subject_allocations"("academic_year_id");

-- CreateIndex
CREATE INDEX "subject_allocations_term_id_idx" ON "subject_allocations"("term_id");

-- CreateIndex
CREATE INDEX "subject_allocations_grade_id_idx" ON "subject_allocations"("grade_id");

-- CreateIndex
CREATE INDEX "subject_allocations_subject_id_idx" ON "subject_allocations"("subject_id");

-- CreateIndex
CREATE INDEX "subject_allocations_school_id_academic_year_id_idx" ON "subject_allocations"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "subject_allocations_school_id_term_id_idx" ON "subject_allocations"("school_id", "term_id");

-- CreateIndex
CREATE INDEX "subject_allocations_school_id_term_id_grade_id_idx" ON "subject_allocations"("school_id", "term_id", "grade_id");

-- CreateIndex
CREATE INDEX "subject_allocations_school_id_term_id_subject_id_idx" ON "subject_allocations"("school_id", "term_id", "subject_id");

-- CreateIndex
CREATE INDEX "subject_allocations_deleted_at_idx" ON "subject_allocations"("deleted_at");

-- AddForeignKey
ALTER TABLE "subject_allocations" ADD CONSTRAINT "subject_allocations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_allocations" ADD CONSTRAINT "subject_allocations_academic_year_id_school_id_fkey" FOREIGN KEY ("academic_year_id", "school_id") REFERENCES "academic_years"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_allocations" ADD CONSTRAINT "subject_allocations_term_id_school_id_fkey" FOREIGN KEY ("term_id", "school_id") REFERENCES "terms"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_allocations" ADD CONSTRAINT "subject_allocations_grade_id_school_id_fkey" FOREIGN KEY ("grade_id", "school_id") REFERENCES "grades"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_allocations" ADD CONSTRAINT "subject_allocations_subject_id_school_id_fkey" FOREIGN KEY ("subject_id", "school_id") REFERENCES "subjects"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
