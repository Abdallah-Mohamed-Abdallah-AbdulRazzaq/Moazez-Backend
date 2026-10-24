-- CreateEnum
CREATE TYPE "AssessmentAssetSourceType" AS ENUM ('MANAGED_FILE', 'EXTERNAL_HTTPS');

-- CreateEnum
CREATE TYPE "AssessmentAssetCategory" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'OTHER');

-- CreateTable
CREATE TABLE "grade_assessment_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "file_id" UUID,
    "external_url" VARCHAR(2000),
    "source_type" "AssessmentAssetSourceType" NOT NULL DEFAULT 'MANAGED_FILE',
    "category" "AssessmentAssetCategory" NOT NULL DEFAULT 'OTHER',
    "title" VARCHAR(255),
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grade_assessment_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_assessment_question_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "file_id" UUID,
    "external_url" VARCHAR(2000),
    "source_type" "AssessmentAssetSourceType" NOT NULL DEFAULT 'MANAGED_FILE',
    "category" "AssessmentAssetCategory" NOT NULL DEFAULT 'OTHER',
    "title" VARCHAR(255),
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grade_assessment_question_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_submission_answer_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "answer_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "source_type" "AssessmentAssetSourceType" NOT NULL DEFAULT 'MANAGED_FILE',
    "category" "AssessmentAssetCategory" NOT NULL DEFAULT 'OTHER',
    "title" VARCHAR(255),
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grade_submission_answer_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_question_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_question_id" UUID NOT NULL,
    "file_id" UUID,
    "external_url" VARCHAR(2000),
    "source_type" "AssessmentAssetSourceType" NOT NULL DEFAULT 'MANAGED_FILE',
    "category" "AssessmentAssetCategory" NOT NULL DEFAULT 'OTHER',
    "title" VARCHAR(255),
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "homework_question_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_answer_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_submission_answer_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "source_type" "AssessmentAssetSourceType" NOT NULL DEFAULT 'MANAGED_FILE',
    "category" "AssessmentAssetCategory" NOT NULL DEFAULT 'OTHER',
    "title" VARCHAR(255),
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "homework_answer_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grade_assessment_asset_parent_order_idx" ON "grade_assessment_assets"("school_id", "assessment_id", "deleted_at", "sort_order", "id");

-- CreateIndex
CREATE INDEX "grade_assessment_asset_file_idx" ON "grade_assessment_assets"("file_id", "school_id");

-- CreateIndex
CREATE INDEX "grade_assessment_asset_creator_idx" ON "grade_assessment_assets"("created_by_user_id");

-- CreateIndex
CREATE INDEX "grade_question_asset_parent_order_idx" ON "grade_assessment_question_assets"("school_id", "question_id", "deleted_at", "sort_order", "id");

-- CreateIndex
CREATE INDEX "grade_question_asset_file_idx" ON "grade_assessment_question_assets"("file_id", "school_id");

-- CreateIndex
CREATE INDEX "grade_question_asset_creator_idx" ON "grade_assessment_question_assets"("created_by_user_id");

-- CreateIndex
CREATE INDEX "grade_answer_asset_parent_order_idx" ON "grade_submission_answer_assets"("school_id", "answer_id", "deleted_at", "sort_order", "id");

-- CreateIndex
CREATE INDEX "grade_answer_asset_file_idx" ON "grade_submission_answer_assets"("file_id", "school_id");

-- CreateIndex
CREATE INDEX "grade_answer_asset_creator_idx" ON "grade_submission_answer_assets"("created_by_user_id");

-- CreateIndex
CREATE INDEX "hw_question_asset_parent_order_idx" ON "homework_question_assets"("school_id", "homework_question_id", "deleted_at", "sort_order", "id");

-- CreateIndex
CREATE INDEX "hw_question_asset_file_idx" ON "homework_question_assets"("file_id", "school_id");

-- CreateIndex
CREATE INDEX "hw_question_asset_creator_idx" ON "homework_question_assets"("created_by_user_id");

-- CreateIndex
CREATE INDEX "hw_answer_asset_parent_order_idx" ON "homework_answer_assets"("school_id", "homework_submission_answer_id", "deleted_at", "sort_order", "id");

-- CreateIndex
CREATE INDEX "hw_answer_asset_file_idx" ON "homework_answer_assets"("file_id", "school_id");

-- CreateIndex
CREATE INDEX "hw_answer_asset_creator_idx" ON "homework_answer_assets"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "grade_assessment_assets" ADD CONSTRAINT "grade_assessment_asset_school_fk" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_assets" ADD CONSTRAINT "grade_assessment_asset_parent_fk" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_assets" ADD CONSTRAINT "grade_assessment_asset_file_fk" FOREIGN KEY ("file_id", "school_id") REFERENCES "files"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_assets" ADD CONSTRAINT "grade_assessment_asset_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_assets" ADD CONSTRAINT "grade_question_asset_school_fk" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_assets" ADD CONSTRAINT "grade_question_asset_parent_fk" FOREIGN KEY ("question_id", "school_id") REFERENCES "grade_assessment_questions"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_assets" ADD CONSTRAINT "grade_question_asset_file_fk" FOREIGN KEY ("file_id", "school_id") REFERENCES "files"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_assets" ADD CONSTRAINT "grade_question_asset_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_submission_answer_assets" ADD CONSTRAINT "grade_answer_asset_school_fk" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_submission_answer_assets" ADD CONSTRAINT "grade_answer_asset_parent_fk" FOREIGN KEY ("answer_id", "school_id") REFERENCES "grade_submission_answers"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_submission_answer_assets" ADD CONSTRAINT "grade_answer_asset_file_fk" FOREIGN KEY ("file_id", "school_id") REFERENCES "files"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_submission_answer_assets" ADD CONSTRAINT "grade_answer_asset_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_question_assets" ADD CONSTRAINT "hw_question_asset_school_fk" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_question_assets" ADD CONSTRAINT "hw_question_asset_parent_fk" FOREIGN KEY ("homework_question_id", "school_id") REFERENCES "homework_questions"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_question_assets" ADD CONSTRAINT "hw_question_asset_file_fk" FOREIGN KEY ("file_id", "school_id") REFERENCES "files"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_question_assets" ADD CONSTRAINT "hw_question_asset_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_answer_assets" ADD CONSTRAINT "hw_answer_asset_school_fk" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_answer_assets" ADD CONSTRAINT "hw_answer_asset_parent_fk" FOREIGN KEY ("homework_submission_answer_id", "school_id") REFERENCES "homework_submission_answers"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_answer_assets" ADD CONSTRAINT "hw_answer_asset_file_fk" FOREIGN KEY ("file_id", "school_id") REFERENCES "files"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_answer_assets" ADD CONSTRAINT "hw_answer_asset_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma cannot represent these source/ordering predicates or row identity triggers.
-- New tables only: no historical DML, lifecycle-enum guess, backfill or old DDL.
ALTER TABLE public.homework_question_assets ADD CONSTRAINT hw_question_asset_sort_check CHECK (sort_order >= 0);
ALTER TABLE public.homework_question_assets ADD CONSTRAINT hw_question_asset_source_check CHECK ((
    (source_type = 'MANAGED_FILE' AND file_id IS NOT NULL AND external_url IS NULL)
    OR (source_type = 'EXTERNAL_HTTPS' AND file_id IS NULL AND external_url IS NOT NULL
      AND external_url ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(/[A-Za-z0-9._~/-]*)?$'
      AND pg_catalog.char_length(pg_catalog.substring(external_url, '^https://([^/]+)')) <= 253
      AND external_url !~* '^https://([a-z0-9-]+\.)*(googleapis\.com|cloud\.google\.com|amazonaws\.com|amazonaws\.com\.cn)(/|$)'
      AND pg_catalog.substring(external_url, '^https://([^/]+)') !~* '(^|\.)(minio|minio-[a-z0-9-]+|[a-z0-9-]+-minio)(\.|$)'
      AND pg_catalog.substring(external_url, '^https://([^/]+)') !~* '\.(localhost|local|localdomain|internal|intranet|lan|home|arpa|test|example|invalid)$'
      AND external_url !~* '/api/v1/files/[^/]+/download(/|$)' )
  ) IS TRUE);
ALTER TABLE public.grade_assessment_question_assets ADD CONSTRAINT grade_question_asset_sort_check CHECK (sort_order >= 0);
ALTER TABLE public.grade_assessment_question_assets ADD CONSTRAINT grade_question_asset_source_check CHECK ((
    (source_type = 'MANAGED_FILE' AND file_id IS NOT NULL AND external_url IS NULL)
    OR (source_type = 'EXTERNAL_HTTPS' AND file_id IS NULL AND external_url IS NOT NULL
      AND external_url ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(/[A-Za-z0-9._~/-]*)?$'
      AND pg_catalog.char_length(pg_catalog.substring(external_url, '^https://([^/]+)')) <= 253
      AND external_url !~* '^https://([a-z0-9-]+\.)*(googleapis\.com|cloud\.google\.com|amazonaws\.com|amazonaws\.com\.cn)(/|$)'
      AND pg_catalog.substring(external_url, '^https://([^/]+)') !~* '(^|\.)(minio|minio-[a-z0-9-]+|[a-z0-9-]+-minio)(\.|$)'
      AND pg_catalog.substring(external_url, '^https://([^/]+)') !~* '\.(localhost|local|localdomain|internal|intranet|lan|home|arpa|test|example|invalid)$'
      AND external_url !~* '/api/v1/files/[^/]+/download(/|$)' )
  ) IS TRUE);
ALTER TABLE public.grade_assessment_assets ADD CONSTRAINT grade_assessment_asset_sort_check CHECK (sort_order >= 0);
ALTER TABLE public.grade_assessment_assets ADD CONSTRAINT grade_assessment_asset_source_check CHECK ((
    (source_type = 'MANAGED_FILE' AND file_id IS NOT NULL AND external_url IS NULL)
    OR (source_type = 'EXTERNAL_HTTPS' AND file_id IS NULL AND external_url IS NOT NULL
      AND external_url ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(/[A-Za-z0-9._~/-]*)?$'
      AND pg_catalog.char_length(pg_catalog.substring(external_url, '^https://([^/]+)')) <= 253
      AND external_url !~* '^https://([a-z0-9-]+\.)*(googleapis\.com|cloud\.google\.com|amazonaws\.com|amazonaws\.com\.cn)(/|$)'
      AND pg_catalog.substring(external_url, '^https://([^/]+)') !~* '(^|\.)(minio|minio-[a-z0-9-]+|[a-z0-9-]+-minio)(\.|$)'
      AND pg_catalog.substring(external_url, '^https://([^/]+)') !~* '\.(localhost|local|localdomain|internal|intranet|lan|home|arpa|test|example|invalid)$'
      AND external_url !~* '/api/v1/files/[^/]+/download(/|$)' )
  ) IS TRUE);
ALTER TABLE public.homework_answer_assets ADD CONSTRAINT hw_answer_asset_sort_check CHECK (sort_order >= 0);
ALTER TABLE public.homework_answer_assets ADD CONSTRAINT hw_answer_asset_source_check CHECK (source_type = 'MANAGED_FILE');
ALTER TABLE public.grade_submission_answer_assets ADD CONSTRAINT grade_answer_asset_sort_check CHECK (sort_order >= 0);
ALTER TABLE public.grade_submission_answer_assets ADD CONSTRAINT grade_answer_asset_source_check CHECK (source_type = 'MANAGED_FILE');

-- Identity is structural and independent of Homework/Grades lifecycle enums.
-- Replacing a binding requires a new row; soft deletion retains the old File.
CREATE FUNCTION public.enforce_assessment_asset_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  identity_column text;
BEGIN
  IF TG_OP <> 'UPDATE' OR TG_NARGS <> 1
     OR NOT (pg_catalog.to_jsonb(NEW) ? TG_ARGV[0]) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'assessment_asset_identity_immutable';
  END IF;
  FOREACH identity_column IN ARRAY ARRAY[
    'id', 'school_id', TG_ARGV[0], 'created_by_user_id', 'created_at',
    'source_type', 'file_id', 'external_url'
  ] LOOP
    IF (pg_catalog.to_jsonb(NEW) -> identity_column)
       IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) -> identity_column) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'assessment_asset_identity_immutable';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_assessment_asset_identity() FROM PUBLIC;

CREATE TRIGGER asset_identity_homework_question_assets
BEFORE UPDATE OF id, school_id, homework_question_id, created_by_user_id, created_at, source_type, file_id, external_url ON public.homework_question_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_asset_identity('homework_question_id');

CREATE TRIGGER file_live_ref_homework_question_assets_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.homework_question_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER asset_identity_grade_assessment_question_assets
BEFORE UPDATE OF id, school_id, question_id, created_by_user_id, created_at, source_type, file_id, external_url ON public.grade_assessment_question_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_asset_identity('question_id');

CREATE TRIGGER file_live_ref_grade_assessment_question_assets_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.grade_assessment_question_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER asset_identity_grade_assessment_assets
BEFORE UPDATE OF id, school_id, assessment_id, created_by_user_id, created_at, source_type, file_id, external_url ON public.grade_assessment_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_asset_identity('assessment_id');

CREATE TRIGGER file_live_ref_grade_assessment_assets_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.grade_assessment_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER asset_identity_homework_answer_assets
BEFORE UPDATE OF id, school_id, homework_submission_answer_id, created_by_user_id, created_at, source_type, file_id ON public.homework_answer_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_asset_identity('homework_submission_answer_id');

CREATE TRIGGER file_live_ref_homework_answer_assets_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.homework_answer_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

CREATE TRIGGER asset_identity_grade_submission_answer_assets
BEFORE UPDATE OF id, school_id, answer_id, created_by_user_id, created_at, source_type, file_id ON public.grade_submission_answer_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_asset_identity('answer_id');

CREATE TRIGGER file_live_ref_grade_submission_answer_assets_file_id
BEFORE INSERT OR UPDATE OF file_id ON public.grade_submission_answer_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');
