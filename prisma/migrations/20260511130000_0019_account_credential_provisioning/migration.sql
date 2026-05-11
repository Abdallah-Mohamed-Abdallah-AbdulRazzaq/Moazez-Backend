-- Add credential metadata for password provisioning without backfilling credentials.
ALTER TABLE "users"
ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "password_changed_at" TIMESTAMP(3),
ADD COLUMN "password_provisioned_at" TIMESTAMP(3),
ADD COLUMN "credential_version" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "users_must_change_password_idx" ON "users"("must_change_password");
CREATE INDEX "users_password_provisioned_at_idx" ON "users"("password_provisioned_at");
