import { HomeworkQuestionType } from '@prisma/client';
import { HomeworkQuestionInvalidTypePayloadException } from './homework-question.exceptions';

/** Declared persistence types may grow; operational APIs stay at the approved five. */
export const HOMEWORK_RUNTIME_QUESTION_TYPES = Object.freeze([
  HomeworkQuestionType.SHORT_TEXT,
  HomeworkQuestionType.LONG_TEXT,
  HomeworkQuestionType.SINGLE_CHOICE,
  HomeworkQuestionType.MULTIPLE_CHOICE,
  HomeworkQuestionType.TRUE_FALSE,
]);

export function isHomeworkRuntimeQuestionType(value: unknown): boolean {
  return HOMEWORK_RUNTIME_QUESTION_TYPES.some((type) => type === value);
}

export function assertHomeworkRuntimeQuestionType(value: unknown): void {
  if (!isHomeworkRuntimeQuestionType(value))
    throw new HomeworkQuestionInvalidTypePayloadException({
      reason: 'question_type_not_active',
    });
}

export function assertHomeworkRuntimeQuestions(
  questions: ReadonlyArray<{ type: unknown }>,
): void {
  for (const question of questions)
    assertHomeworkRuntimeQuestionType(question.type);
}
