ALTER TABLE "students"
  ADD COLUMN "father_name_en" TEXT,
  ADD COLUMN "grandfather_name_en" TEXT,
  ADD COLUMN "first_name_ar" TEXT,
  ADD COLUMN "father_name_ar" TEXT,
  ADD COLUMN "grandfather_name_ar" TEXT,
  ADD COLUMN "family_name_ar" TEXT,
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "address_line" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "student_phone" TEXT,
  ADD COLUMN "student_email" TEXT;

ALTER TABLE "guardians"
  ADD COLUMN "phone_secondary" TEXT,
  ADD COLUMN "national_id" TEXT,
  ADD COLUMN "job_title" TEXT,
  ADD COLUMN "workplace" TEXT,
  ADD COLUMN "can_pickup" BOOLEAN,
  ADD COLUMN "can_receive_notifications" BOOLEAN;
