-- CreateEnum
CREATE TYPE "notification_template_status" AS ENUM ('ACTIVE', 'DRAFT');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('EMAIL', 'SMS', 'IN_APP');

-- CreateEnum
CREATE TYPE "integration_connection_status" AS ENUM ('CONNECTED', 'DISCONNECTED', 'NEEDS_ATTENTION');

-- CreateEnum
CREATE TYPE "integration_field_type" AS ENUM ('TEXT', 'PASSWORD', 'URL', 'EMAIL', 'SELECT');

-- CreateEnum
CREATE TYPE "backup_job_status" AS ENUM ('COMPLETED', 'RUNNING', 'FAILED');

-- CreateEnum
CREATE TYPE "backup_job_type" AS ENUM ('BACKUP', 'EXPORT', 'IMPORT', 'MIGRATION');

-- CreateTable
CREATE TABLE "settings_school_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "school_name" TEXT,
    "short_name" TEXT,
    "timezone" TEXT,
    "address_line" TEXT,
    "formatted_address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "footer_signature" TEXT,
    "logo_url" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "map_place_label" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_school_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_security_controls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "enforce_two_factor" BOOLEAN NOT NULL DEFAULT false,
    "ip_allowlist_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ip_allowlist" TEXT,
    "session_timeout_minutes" INTEGER NOT NULL DEFAULT 30,
    "suspicious_login_alerts" BOOLEAN NOT NULL DEFAULT true,
    "password_min_length" INTEGER NOT NULL DEFAULT 10,
    "password_rotation_days" INTEGER NOT NULL DEFAULT 90,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_security_controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_notification_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "notification_template_status" NOT NULL DEFAULT 'DRAFT',
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" TEXT,
    "title_ar" TEXT,
    "message" TEXT,
    "message_ar" TEXT,
    "email_subject" TEXT,
    "email_subject_ar" TEXT,
    "sms_message" TEXT,
    "sms_message_ar" TEXT,
    "priority" TEXT,
    "stage" TEXT,
    "last_test_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_notification_template_channel_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "notification_template_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_notification_template_channel_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_integration_providers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_integration_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_integration_provider_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integration_provider_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "integration_field_type" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "placeholder" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_integration_provider_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_integration_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "integration_provider_id" UUID NOT NULL,
    "status" "integration_connection_status" NOT NULL DEFAULT 'DISCONNECTED',
    "configuration" JSONB,
    "configuration_updated_at" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "last_test_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "health_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_backup_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "type" "backup_job_type" NOT NULL,
    "status" "backup_job_status" NOT NULL DEFAULT 'RUNNING',
    "file_name" TEXT NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_backup_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settings_school_profile_school_id_key" ON "settings_school_profile"("school_id");

-- CreateIndex
CREATE INDEX "settings_school_profile_updated_by_id_idx" ON "settings_school_profile"("updated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_security_controls_school_id_key" ON "settings_security_controls"("school_id");

-- CreateIndex
CREATE INDEX "settings_security_controls_updated_by_id_idx" ON "settings_security_controls"("updated_by_id");

-- CreateIndex
CREATE INDEX "settings_notification_templates_school_id_status_idx" ON "settings_notification_templates"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "settings_notification_templates_school_id_key_key" ON "settings_notification_templates"("school_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "settings_notification_templates_id_school_id_key" ON "settings_notification_templates"("id", "school_id");

-- CreateIndex
CREATE INDEX "settings_notification_template_channel_states_school_id_idx" ON "settings_notification_template_channel_states"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_notification_template_channel_states_notification__key" ON "settings_notification_template_channel_states"("notification_template_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "settings_integration_providers_key_key" ON "settings_integration_providers"("key");

-- CreateIndex
CREATE INDEX "settings_integration_providers_category_idx" ON "settings_integration_providers"("category");

-- CreateIndex
CREATE INDEX "settings_integration_provider_fields_integration_provider_i_idx" ON "settings_integration_provider_fields"("integration_provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_integration_provider_fields_integration_provider_i_key" ON "settings_integration_provider_fields"("integration_provider_id", "key");

-- CreateIndex
CREATE INDEX "settings_integration_connections_school_id_status_idx" ON "settings_integration_connections"("school_id", "status");

-- CreateIndex
CREATE INDEX "settings_integration_connections_integration_provider_id_idx" ON "settings_integration_connections"("integration_provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_integration_connections_school_id_integration_prov_key" ON "settings_integration_connections"("school_id", "integration_provider_id");

-- CreateIndex
CREATE INDEX "settings_backup_jobs_school_id_created_at_idx" ON "settings_backup_jobs"("school_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "settings_backup_jobs_school_id_status_idx" ON "settings_backup_jobs"("school_id", "status");

-- CreateIndex
CREATE INDEX "settings_backup_jobs_school_id_type_idx" ON "settings_backup_jobs"("school_id", "type");

-- CreateIndex
CREATE INDEX "settings_backup_jobs_created_by_id_idx" ON "settings_backup_jobs"("created_by_id");

-- AddForeignKey
ALTER TABLE "settings_school_profile" ADD CONSTRAINT "settings_school_profile_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_profile" ADD CONSTRAINT "settings_school_profile_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_security_controls" ADD CONSTRAINT "settings_security_controls_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_security_controls" ADD CONSTRAINT "settings_security_controls_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_notification_templates" ADD CONSTRAINT "settings_notification_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_notification_template_channel_states" ADD CONSTRAINT "settings_notification_template_channel_states_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_notification_template_channel_states" ADD CONSTRAINT "settings_notification_template_channel_states_notification_fkey" FOREIGN KEY ("notification_template_id", "school_id") REFERENCES "settings_notification_templates"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_integration_provider_fields" ADD CONSTRAINT "settings_integration_provider_fields_integration_provider__fkey" FOREIGN KEY ("integration_provider_id") REFERENCES "settings_integration_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_integration_connections" ADD CONSTRAINT "settings_integration_connections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_integration_connections" ADD CONSTRAINT "settings_integration_connections_integration_provider_id_fkey" FOREIGN KEY ("integration_provider_id") REFERENCES "settings_integration_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_backup_jobs" ADD CONSTRAINT "settings_backup_jobs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_backup_jobs" ADD CONSTRAINT "settings_backup_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
