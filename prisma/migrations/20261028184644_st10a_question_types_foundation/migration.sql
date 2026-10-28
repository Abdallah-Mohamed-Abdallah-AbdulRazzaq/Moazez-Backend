-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "grade_question_type" ADD VALUE 'ORDERING';
ALTER TYPE "grade_question_type" ADD VALUE 'NUMERIC';
ALTER TYPE "grade_question_type" ADD VALUE 'MATH_EXPRESSION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "homework_question_type" ADD VALUE 'ORDERING';
ALTER TYPE "homework_question_type" ADD VALUE 'NUMERIC';
ALTER TYPE "homework_question_type" ADD VALUE 'MATH_EXPRESSION';
