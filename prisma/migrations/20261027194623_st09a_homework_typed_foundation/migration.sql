-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "homework_question_type" ADD VALUE 'FILL_IN_BLANK';
ALTER TYPE "homework_question_type" ADD VALUE 'MATCHING';
ALTER TYPE "homework_question_type" ADD VALUE 'MEDIA';

-- AlterTable
ALTER TABLE "homework_questions" ADD COLUMN     "answer_key" JSONB;

-- AlterTable
ALTER TABLE "homework_submission_answers" ADD COLUMN     "answer_json" JSONB;
