-- CreateTable
CREATE TABLE "academic_content_engagement_admissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "window_started_at" TIMESTAMP(3) NOT NULL,
    "request_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_content_engagement_admissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_content_engagement_admissions_actor_user_id_idx" ON "academic_content_engagement_admissions"("actor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "acc_engagement_admission_actor_key" ON "academic_content_engagement_admissions"("school_id", "actor_user_id");

-- AddForeignKey
ALTER TABLE "academic_content_engagement_admissions" ADD CONSTRAINT "academic_content_engagement_admissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "academic_content_engagement_admissions" ADD CONSTRAINT "academic_content_engagement_admissions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- Operational counter bounds are not expressible in Prisma's schema DSL.
ALTER TABLE "academic_content_engagement_admissions" ADD CONSTRAINT "acc_engagement_admission_count_check" CHECK ("request_count" BETWEEN 1 AND 60);
