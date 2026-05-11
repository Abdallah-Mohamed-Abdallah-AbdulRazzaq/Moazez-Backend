-- CreateEnum
CREATE TYPE "school_login_settings_status" AS ENUM ('ACTIVE', 'DISABLED');

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "username" TEXT,
ADD COLUMN "contact_email" TEXT;

-- CreateTable
CREATE TABLE "settings_school_login_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "login_domain" TEXT NOT NULL,
    "username_min_length" INTEGER NOT NULL DEFAULT 3,
    "username_max_length" INTEGER NOT NULL DEFAULT 40,
    "allowed_characters" TEXT,
    "reserved_usernames" JSONB,
    "status" "school_login_settings_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_school_login_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_contact_email_idx" ON "users"("contact_email");

-- CreateIndex
CREATE UNIQUE INDEX "settings_school_login_settings_school_id_key" ON "settings_school_login_settings"("school_id");

-- CreateIndex
CREATE INDEX "settings_school_login_settings_school_id_status_idx" ON "settings_school_login_settings"("school_id", "status");

-- AddForeignKey
ALTER TABLE "settings_school_login_settings" ADD CONSTRAINT "settings_school_login_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
