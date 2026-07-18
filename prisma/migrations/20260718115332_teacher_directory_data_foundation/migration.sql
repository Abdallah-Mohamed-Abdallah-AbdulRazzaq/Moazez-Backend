-- CreateEnum
CREATE TYPE "teacher_gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "teacher_employment_status" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "teacher_employment_type" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT');

-- CreateEnum
CREATE TYPE "teacher_work_day" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "teacher_code" VARCHAR(20),
    "first_name_ar" VARCHAR(50),
    "last_name_ar" VARCHAR(50),
    "first_name_en" VARCHAR(50),
    "last_name_en" VARCHAR(50),
    "gender" "teacher_gender",
    "employment_status" "teacher_employment_status" NOT NULL DEFAULT 'INACTIVE',
    "department" VARCHAR(120),
    "specialization" VARCHAR(120),
    "employment_type" "teacher_employment_type",
    "experience_years" INTEGER,
    "hire_date" DATE,
    -- Prisma requires this scalar list but does not emit PostgreSQL NOT NULL
    -- for it. Harden the generated migration before its first application.
    "working_days" "teacher_work_day"[] NOT NULL DEFAULT ARRAY[]::"teacher_work_day"[],
    "work_start_time" TIME(0),
    "work_end_time" TIME(0),
    "notes_ar" VARCHAR(500),
    "notes_en" VARCHAR(500),
    "avatar_file_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_profiles_school_id_idx" ON "teacher_profiles"("school_id");

-- CreateIndex
CREATE INDEX "teacher_profiles_user_id_idx" ON "teacher_profiles"("user_id");

-- CreateIndex
CREATE INDEX "teacher_profiles_school_id_employment_status_deleted_at_idx" ON "teacher_profiles"("school_id", "employment_status", "deleted_at");

-- CreateIndex
CREATE INDEX "teacher_profiles_avatar_file_id_idx" ON "teacher_profiles"("avatar_file_id");

-- CreateIndex
CREATE INDEX "teacher_profiles_deleted_at_idx" ON "teacher_profiles"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_id_school_id_key" ON "teacher_profiles"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_school_id_user_id_key" ON "teacher_profiles"("school_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_school_id_teacher_code_key" ON "teacher_profiles"("school_id", "teacher_code");

-- PostgreSQL permits multiple NULL values in this compound unique index. It
-- therefore enforces school-local uniqueness only for configured codes.

-- Prisma cannot express a partial unique index. This preserves cross-school
-- history while allowing at most one non-deleted profile for a User globally.
CREATE UNIQUE INDEX "teacher_profiles_one_live_per_user_idx"
ON "teacher_profiles" ("user_id")
WHERE "deleted_at" IS NULL;

-- Prisma cannot express these domain checks. Application validation supplies
-- friendly errors; the constraints remain the final integrity boundary.
ALTER TABLE "teacher_profiles"
ADD CONSTRAINT "teacher_profiles_teacher_code_normalized_chk"
CHECK (
  "teacher_code" IS NULL OR (
    char_length("teacher_code") BETWEEN 1 AND 20
    AND "teacher_code" = upper("teacher_code")
    AND "teacher_code" !~ '[[:space:]]'
  )
);

ALTER TABLE "teacher_profiles"
ADD CONSTRAINT "teacher_profiles_experience_years_range_chk"
CHECK (
  "experience_years" IS NULL
  OR "experience_years" BETWEEN 0 AND 60
);

ALTER TABLE "teacher_profiles"
ADD CONSTRAINT "teacher_profiles_work_time_pair_chk"
CHECK (
  ("work_start_time" IS NULL AND "work_end_time" IS NULL)
  OR ("work_start_time" IS NOT NULL AND "work_end_time" IS NOT NULL)
);

ALTER TABLE "teacher_profiles"
ADD CONSTRAINT "teacher_profiles_work_time_order_chk"
CHECK (
  "work_start_time" IS NULL
  OR "work_end_time" > "work_start_time"
);

ALTER TABLE "teacher_profiles"
ADD CONSTRAINT "teacher_profiles_working_days_cardinality_chk"
CHECK (
  cardinality("working_days") <= 7
);

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_avatar_file_id_school_id_fkey" FOREIGN KEY ("avatar_file_id", "school_id") REFERENCES "files"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;
