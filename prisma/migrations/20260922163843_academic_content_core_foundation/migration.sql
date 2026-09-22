-- CreateEnum
CREATE TYPE "academic_content_type" AS ENUM ('TEACHER_PREPARATION', 'WEEKLY_PLAN', 'GUARDIAN_WEEKLY_NOTE', 'SUBJECT_RESOURCE', 'ONLINE_SESSION', 'GENERAL_RESOURCE');

-- CreateTable
CREATE TABLE "academic_contents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "type" "academic_content_type" NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_contents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_contents_school_id_idx" ON "academic_contents"("school_id");

-- CreateIndex
CREATE INDEX "academic_contents_school_id_type_idx" ON "academic_contents"("school_id", "type");

-- CreateIndex
CREATE INDEX "academic_contents_created_by_user_id_idx" ON "academic_contents"("created_by_user_id");

-- CreateIndex
CREATE INDEX "academic_contents_updated_by_user_id_idx" ON "academic_contents"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "academic_contents_deleted_at_idx" ON "academic_contents"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "academic_contents_id_school_id_key" ON "academic_contents"("id", "school_id");

-- AddForeignKey
ALTER TABLE "academic_contents" ADD CONSTRAINT "academic_contents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_contents" ADD CONSTRAINT "academic_contents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_contents" ADD CONSTRAINT "academic_contents_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
