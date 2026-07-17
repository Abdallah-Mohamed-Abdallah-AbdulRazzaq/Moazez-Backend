-- AlterTable
ALTER TABLE "settings_school_profile"
ADD COLUMN "logo_file_id" UUID;

-- CreateIndex
CREATE INDEX "settings_school_profile_logo_file_id_idx"
ON "settings_school_profile"("logo_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_id_school_id_key"
ON "files"("id", "school_id");

-- AddForeignKey
ALTER TABLE "settings_school_profile"
ADD CONSTRAINT "settings_school_profile_logo_file_id_school_id_fkey"
FOREIGN KEY ("logo_file_id", "school_id")
REFERENCES "files"("id", "school_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
