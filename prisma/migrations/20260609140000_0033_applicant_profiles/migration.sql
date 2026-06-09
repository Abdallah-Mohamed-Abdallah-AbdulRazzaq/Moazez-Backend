CREATE TABLE "applicant_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "full_name" VARCHAR(200) NOT NULL,
  "phone_number" VARCHAR(50),
  "city" VARCHAR(120),
  "relationship" VARCHAR(40) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "applicant_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "applicant_profiles_relationship_allowed" CHECK ("relationship" IN ('father', 'mother', 'guardian', 'relative'))
);

CREATE UNIQUE INDEX "applicant_profiles_user_id_key" ON "applicant_profiles"("user_id");
CREATE INDEX "applicant_profiles_relationship_idx" ON "applicant_profiles"("relationship");

ALTER TABLE "applicant_profiles"
  ADD CONSTRAINT "applicant_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
