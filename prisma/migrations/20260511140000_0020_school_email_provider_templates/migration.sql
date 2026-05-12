-- CreateEnum
CREATE TYPE "school_email_provider_type" AS ENUM ('SMTP', 'SENDGRID', 'MAILGUN', 'SES', 'CUSTOM');

-- CreateEnum
CREATE TYPE "school_email_connection_status" AS ENUM ('DRAFT', 'VERIFIED', 'ACTIVE', 'DISABLED', 'FAILED');

-- CreateEnum
CREATE TYPE "school_email_template_key" AS ENUM ('ACCOUNT_CREDENTIALS', 'PASSWORD_RESET', 'GENERAL_MESSAGE');

-- CreateTable
CREATE TABLE "settings_school_email_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "provider_type" "school_email_provider_type" NOT NULL DEFAULT 'SMTP',
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "reply_to_email" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "encrypted_password" TEXT,
    "encrypted_api_key" TEXT,
    "status" "school_email_connection_status" NOT NULL DEFAULT 'DRAFT',
    "last_tested_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_school_email_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_school_email_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "key" "school_email_template_key" NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "title" TEXT,
    "subtitle" TEXT,
    "body_html" TEXT NOT NULL,
    "body_text" TEXT,
    "footer_html" TEXT,
    "logo_file_id" UUID,
    "support_email" TEXT,
    "support_phone" TEXT,
    "social_links" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_school_email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settings_school_email_connections_school_id_key" ON "settings_school_email_connections"("school_id");

-- CreateIndex
CREATE INDEX "settings_school_email_connections_school_id_status_idx" ON "settings_school_email_connections"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "settings_school_email_templates_school_id_key_key" ON "settings_school_email_templates"("school_id", "key");

-- CreateIndex
CREATE INDEX "settings_school_email_templates_school_id_is_active_idx" ON "settings_school_email_templates"("school_id", "is_active");

-- AddForeignKey
ALTER TABLE "settings_school_email_connections" ADD CONSTRAINT "settings_school_email_connections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_school_email_templates" ADD CONSTRAINT "settings_school_email_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
