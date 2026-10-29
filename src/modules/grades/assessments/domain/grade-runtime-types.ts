import { GradeQuestionType } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

/** Explicit ST10-B runtime activation, independent of future enum expansion. */
export const GRADE_RUNTIME_QUESTION_TYPES = Object.freeze([
  GradeQuestionType.MCQ_SINGLE,
  GradeQuestionType.MCQ_MULTI,
  GradeQuestionType.TRUE_FALSE,
  GradeQuestionType.SHORT_ANSWER,
  GradeQuestionType.ESSAY,
  GradeQuestionType.FILL_IN_BLANK,
  GradeQuestionType.MATCHING,
  GradeQuestionType.MEDIA,
  GradeQuestionType.ORDERING,
  GradeQuestionType.NUMERIC,
  GradeQuestionType.MATH_EXPRESSION,
] as const);
export type ActiveGradeQuestionType =
  (typeof GRADE_RUNTIME_QUESTION_TYPES)[number];
export function assertGradeRuntimeQuestionType(
  value: unknown,
): asserts value is ActiveGradeQuestionType {
  if (!GRADE_RUNTIME_QUESTION_TYPES.some((type) => type === value))
    throw new ValidationDomainException('Question type is not active', {
      field: 'type',
    });
}
