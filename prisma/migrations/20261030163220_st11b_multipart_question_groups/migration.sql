-- AlterTable
ALTER TABLE "grade_assessment_questions" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "layout_order" INTEGER;

-- AlterTable
ALTER TABLE "homework_questions" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "layout_order" INTEGER;

-- CreateTable
CREATE TABLE "homework_question_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "instructions" VARCHAR(2000),
    "shared_stimulus" JSONB,
    "layout_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "homework_question_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_question_group_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
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

    CONSTRAINT "homework_question_group_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_assessment_question_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "instructions" VARCHAR(2000),
    "shared_stimulus" JSONB,
    "layout_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grade_assessment_question_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_assessment_question_group_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
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

    CONSTRAINT "grade_assessment_question_group_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hw_group_order_idx" ON "homework_question_groups"("school_id", "homework_assignment_id", "deleted_at", "layout_order", "id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_question_groups_id_school_id_key" ON "homework_question_groups"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "hw_group_root_key" ON "homework_question_groups"("id", "school_id", "homework_assignment_id");

-- CreateIndex
CREATE INDEX "hw_group_asset_order_idx" ON "homework_question_group_assets"("school_id", "group_id", "deleted_at", "sort_order", "id");

-- CreateIndex
CREATE INDEX "hw_group_asset_file_idx" ON "homework_question_group_assets"("file_id", "school_id");

-- CreateIndex
CREATE INDEX "hw_group_asset_creator_idx" ON "homework_question_group_assets"("created_by_user_id");

-- CreateIndex
CREATE INDEX "grade_group_order_idx" ON "grade_assessment_question_groups"("school_id", "assessment_id", "deleted_at", "layout_order", "id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_assessment_question_groups_id_school_id_key" ON "grade_assessment_question_groups"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_group_root_key" ON "grade_assessment_question_groups"("id", "school_id", "assessment_id");

-- CreateIndex
CREATE INDEX "grade_group_asset_order_idx" ON "grade_assessment_question_group_assets"("school_id", "group_id", "deleted_at", "sort_order", "id");

-- CreateIndex
CREATE INDEX "grade_group_asset_file_idx" ON "grade_assessment_question_group_assets"("file_id", "school_id");

-- CreateIndex
CREATE INDEX "grade_group_asset_creator_idx" ON "grade_assessment_question_group_assets"("created_by_user_id");

-- CreateIndex
CREATE INDEX "grade_group_question_idx" ON "grade_assessment_questions"("school_id", "assessment_id", "group_id");

-- CreateIndex
CREATE INDEX "hw_group_question_idx" ON "homework_questions"("school_id", "homework_assignment_id", "group_id");

-- AddForeignKey
ALTER TABLE "grade_assessment_questions" ADD CONSTRAINT "grade_group_question_fk" FOREIGN KEY ("group_id", "school_id", "assessment_id") REFERENCES "grade_assessment_question_groups"("id", "school_id", "assessment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_questions" ADD CONSTRAINT "hw_group_question_fk" FOREIGN KEY ("group_id", "school_id", "homework_assignment_id") REFERENCES "homework_question_groups"("id", "school_id", "homework_assignment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_question_groups" ADD CONSTRAINT "homework_question_groups_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_question_groups" ADD CONSTRAINT "hw_group_root_fk" FOREIGN KEY ("homework_assignment_id", "school_id") REFERENCES "homework_assignments"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_question_groups" ADD CONSTRAINT "homework_question_groups_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_question_group_assets" ADD CONSTRAINT "homework_question_group_assets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_question_group_assets" ADD CONSTRAINT "hw_group_asset_parent_fk" FOREIGN KEY ("group_id", "school_id") REFERENCES "homework_question_groups"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_question_group_assets" ADD CONSTRAINT "hw_group_asset_file_fk" FOREIGN KEY ("file_id", "school_id") REFERENCES "files"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "homework_question_group_assets" ADD CONSTRAINT "homework_question_group_assets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_groups" ADD CONSTRAINT "grade_assessment_question_groups_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_groups" ADD CONSTRAINT "grade_group_root_fk" FOREIGN KEY ("assessment_id", "school_id") REFERENCES "grade_assessments"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_groups" ADD CONSTRAINT "grade_assessment_question_groups_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_group_assets" ADD CONSTRAINT "grade_assessment_question_group_assets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_group_assets" ADD CONSTRAINT "grade_group_asset_parent_fk" FOREIGN KEY ("group_id", "school_id") REFERENCES "grade_assessment_question_groups"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_group_assets" ADD CONSTRAINT "grade_group_asset_file_fk" FOREIGN KEY ("file_id", "school_id") REFERENCES "files"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grade_assessment_question_group_assets" ADD CONSTRAINT "grade_assessment_question_group_assets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.homework_questions ADD CONSTRAINT homework_questions_layout_order_check CHECK (layout_order IS NULL OR layout_order >= 0);
ALTER TABLE public.homework_question_groups ADD CONSTRAINT homework_question_groups_display_check CHECK (length(btrim(title)) > 0 AND layout_order >= 0 AND (shared_stimulus IS NULL OR COALESCE(jsonb_typeof(shared_stimulus)='object' AND shared_stimulus->>'kind'='question' AND shared_stimulus->>'contentVersion'='1', false)));
ALTER TABLE public.homework_question_group_assets ADD CONSTRAINT homework_question_group_assets_source_check CHECK (
 (source_type='MANAGED_FILE' AND file_id IS NOT NULL AND external_url IS NULL) OR
 (source_type='EXTERNAL_HTTPS' AND file_id IS NULL AND external_url IS NOT NULL AND length(external_url)<=2000 AND external_url ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(/[A-Za-z0-9._~/-]*)?$'));
ALTER TABLE public.homework_question_group_assets ADD CONSTRAINT homework_question_group_assets_order_check CHECK (sort_order>=0);
CREATE TRIGGER asset_identity_homework_question_groups BEFORE UPDATE OF id,school_id,homework_assignment_id,created_by_user_id,created_at ON public.homework_question_groups
 FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_asset_identity('homework_assignment_id');
CREATE TRIGGER asset_identity_homework_question_group_assets BEFORE UPDATE OF id,school_id,group_id,created_by_user_id,created_at,source_type,file_id,external_url ON public.homework_question_group_assets
 FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_asset_identity('group_id');
CREATE TRIGGER file_live_ref_homework_question_group_assets_file_id BEFORE INSERT OR UPDATE OF file_id ON public.homework_question_group_assets
 FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

ALTER TABLE public.grade_assessment_questions ADD CONSTRAINT grade_assessment_questions_layout_order_check CHECK (layout_order IS NULL OR layout_order >= 0);
ALTER TABLE public.grade_assessment_question_groups ADD CONSTRAINT grade_assessment_question_groups_display_check CHECK (length(btrim(title)) > 0 AND layout_order >= 0 AND (shared_stimulus IS NULL OR COALESCE(jsonb_typeof(shared_stimulus)='object' AND shared_stimulus->>'kind'='question' AND shared_stimulus->>'contentVersion'='1', false)));
ALTER TABLE public.grade_assessment_question_group_assets ADD CONSTRAINT grade_assessment_question_group_assets_source_check CHECK (
 (source_type='MANAGED_FILE' AND file_id IS NOT NULL AND external_url IS NULL) OR
 (source_type='EXTERNAL_HTTPS' AND file_id IS NULL AND external_url IS NOT NULL AND length(external_url)<=2000 AND external_url ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(/[A-Za-z0-9._~/-]*)?$'));
ALTER TABLE public.grade_assessment_question_group_assets ADD CONSTRAINT grade_assessment_question_group_assets_order_check CHECK (sort_order>=0);
CREATE TRIGGER asset_identity_grade_assessment_question_groups BEFORE UPDATE OF id,school_id,assessment_id,created_by_user_id,created_at ON public.grade_assessment_question_groups
 FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_asset_identity('assessment_id');
CREATE TRIGGER asset_identity_grade_assessment_question_group_assets BEFORE UPDATE OF id,school_id,group_id,created_by_user_id,created_at,source_type,file_id,external_url ON public.grade_assessment_question_group_assets
 FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_asset_identity('group_id');
CREATE TRIGGER file_live_ref_grade_assessment_question_group_assets_file_id BEFORE INSERT OR UPDATE OF file_id ON public.grade_assessment_question_group_assets
 FOR EACH ROW EXECUTE FUNCTION public.enforce_live_file_reference('file_id');

-- Composite FKs enforce ancestry. This trigger adds live-group/soft-delete integrity under concurrent SQL.
CREATE FUNCTION public.enforce_question_group_binding() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
DECLARE
 row_data jsonb := pg_catalog.to_jsonb(NEW);
 group_table text; question_table text; root_column text; referenced uuid; occupied boolean;
BEGIN
 IF TG_TABLE_NAME IN ('homework_questions','homework_question_groups','homework_question_group_assets') THEN
  group_table := 'homework_question_groups'; question_table := 'homework_questions'; root_column := 'homework_assignment_id';
 ELSIF TG_TABLE_NAME IN ('grade_assessment_questions','grade_assessment_question_groups','grade_assessment_question_group_assets') THEN
  group_table := 'grade_assessment_question_groups'; question_table := 'grade_assessment_questions'; root_column := 'assessment_id';
 ELSE RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='question_group_binding_invalid'; END IF;
 IF TG_OP='UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL AND TG_TABLE_NAME<>question_table THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='question_group_history_immutable';
 END IF;
 IF TG_TABLE_NAME=group_table THEN
  IF NEW.deleted_at IS NOT NULL THEN
   EXECUTE pg_catalog.format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE group_id=$1 AND school_id=$2 AND deleted_at IS NULL)',question_table)
    INTO occupied USING NEW.id,NEW.school_id;
   IF occupied THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='question_group_detach_required'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.deleted_at IS NOT NULL OR row_data->>'group_id' IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME=question_table THEN
  EXECUTE pg_catalog.format('SELECT id FROM public.%I WHERE id=$1 AND school_id=$2 AND %I=$3 AND deleted_at IS NULL FOR SHARE',group_table,root_column)
   INTO referenced USING (row_data->>'group_id')::uuid,NEW.school_id,(row_data->>root_column)::uuid;
 ELSE
  EXECUTE pg_catalog.format('SELECT id FROM public.%I WHERE id=$1 AND school_id=$2 AND deleted_at IS NULL FOR SHARE',group_table)
   INTO referenced USING (row_data->>'group_id')::uuid,NEW.school_id;
 END IF;
 IF referenced IS NULL THEN RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='question_group_unavailable'; END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_question_group_binding() FROM PUBLIC;
CREATE TRIGGER group_binding_homework_questions BEFORE INSERT OR UPDATE OF group_id,school_id,homework_assignment_id,deleted_at ON public.homework_questions FOR EACH ROW EXECUTE FUNCTION public.enforce_question_group_binding();
CREATE TRIGGER group_binding_homework_question_groups BEFORE UPDATE OF deleted_at ON public.homework_question_groups FOR EACH ROW EXECUTE FUNCTION public.enforce_question_group_binding();
CREATE TRIGGER group_binding_homework_question_group_assets BEFORE INSERT OR UPDATE OF group_id,school_id,deleted_at ON public.homework_question_group_assets FOR EACH ROW EXECUTE FUNCTION public.enforce_question_group_binding();
CREATE TRIGGER group_binding_grade_assessment_questions BEFORE INSERT OR UPDATE OF group_id,school_id,assessment_id,deleted_at ON public.grade_assessment_questions FOR EACH ROW EXECUTE FUNCTION public.enforce_question_group_binding();
CREATE TRIGGER group_binding_grade_assessment_question_groups BEFORE UPDATE OF deleted_at ON public.grade_assessment_question_groups FOR EACH ROW EXECUTE FUNCTION public.enforce_question_group_binding();
CREATE TRIGGER group_binding_grade_assessment_question_group_assets BEFORE INSERT OR UPDATE OF group_id,school_id,deleted_at ON public.grade_assessment_question_group_assets FOR EACH ROW EXECUTE FUNCTION public.enforce_question_group_binding();
