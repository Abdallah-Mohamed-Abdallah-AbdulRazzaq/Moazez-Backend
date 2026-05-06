-- Add nullable Student-to-User identity foundation for Student App ownership.
ALTER TABLE "students" ADD COLUMN "user_id" UUID;

CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
