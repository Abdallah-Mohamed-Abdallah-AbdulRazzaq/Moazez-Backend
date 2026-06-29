-- Add Student-owned avatar File reference.
ALTER TABLE "students"
  ADD COLUMN "avatar_file_id" UUID;

CREATE INDEX "students_avatar_file_id_idx"
  ON "students"("avatar_file_id");

ALTER TABLE "students"
  ADD CONSTRAINT "students_avatar_file_id_fkey"
  FOREIGN KEY ("avatar_file_id")
  REFERENCES "files"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
