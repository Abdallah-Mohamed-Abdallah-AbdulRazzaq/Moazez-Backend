-- AlterTable
ALTER TABLE "grade_assessment_question_options" ADD COLUMN     "rich_content" JSONB;

-- AlterTable
ALTER TABLE "grade_assessment_questions" ADD COLUMN     "rich_content" JSONB;

-- AlterTable
ALTER TABLE "homework_question_options" ADD COLUMN     "rich_content" JSONB;

-- AlterTable
ALTER TABLE "homework_questions" ADD COLUMN     "rich_content" JSONB;
