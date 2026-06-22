-- CreateEnum
CREATE TYPE "app_device_token_platform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "app_device_token_surface" AS ENUM ('PARENT', 'STUDENT', 'TEACHER');

-- CreateTable
CREATE TABLE "app_device_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_ciphertext" TEXT NOT NULL,
    "platform" "app_device_token_platform" NOT NULL,
    "app_surface" "app_device_token_surface" NOT NULL,
    "device_id" TEXT,
    "app_version" TEXT,
    "locale" TEXT,
    "timezone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "last_failure_code" TEXT,
    "last_failure_at" TIMESTAMP(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_device_tokens_id_school_id_key" ON "app_device_tokens"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_device_tokens_school_id_user_id_token_hash_app_surface_key" ON "app_device_tokens"("school_id", "user_id", "token_hash", "app_surface");

-- CreateIndex
CREATE INDEX "app_device_tokens_school_id_idx" ON "app_device_tokens"("school_id");

-- CreateIndex
CREATE INDEX "app_device_tokens_user_id_idx" ON "app_device_tokens"("user_id");

-- CreateIndex
CREATE INDEX "app_device_tokens_school_id_user_id_idx" ON "app_device_tokens"("school_id", "user_id");

-- CreateIndex
CREATE INDEX "app_device_tokens_school_id_user_id_app_surface_idx" ON "app_device_tokens"("school_id", "user_id", "app_surface");

-- CreateIndex
CREATE INDEX "app_device_tokens_school_id_app_surface_is_active_idx" ON "app_device_tokens"("school_id", "app_surface", "is_active");

-- CreateIndex
CREATE INDEX "app_device_tokens_token_hash_idx" ON "app_device_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "app_device_tokens_revoked_at_idx" ON "app_device_tokens"("revoked_at");

-- AddForeignKey
ALTER TABLE "app_device_tokens" ADD CONSTRAINT "app_device_tokens_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_device_tokens" ADD CONSTRAINT "app_device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
