-- AlterEnum
ALTER TYPE "student_credential_mode" ADD VALUE 'SHARED_ADMIN_PROVIDED';

-- AlterTable
ALTER TABLE "student_credential_rows" ADD COLUMN     "enrollment_id" UUID;

-- CreateIndex
CREATE INDEX "student_cred_rows_school_enrollment_idx" ON "student_credential_rows"("school_id", "enrollment_id");

-- AddForeignKey
ALTER TABLE "student_credential_rows" ADD CONSTRAINT "student_cred_rows_enrollment_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
