import {
  QuestionEvaluationInputError,
  normalizeOrderingDefinition,
  normalizeOrderingKey,
  normalizeOrderingAnswer,
  normalizeNumericDefinition,
  normalizeNumericKey,
  normalizeNumericAnswer,
  normalizeMathDefinition,
  normalizeMathKey,
  normalizeMathAnswer,
  type AnswerPhase,
  type Phase,
  type OrderingPublicDefinitionV1,
  type NumericPublicDefinitionV1,
  type MathExpressionPublicDefinitionV1,
} from '../../../../common/question-evaluation';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export type GradeEvaluationType = 'ORDERING' | 'NUMERIC' | 'MATH_EXPRESSION';
export type GradeEvaluationDefinition =
  | OrderingPublicDefinitionV1
  | NumericPublicDefinitionV1
  | MathExpressionPublicDefinitionV1;

export function isGradeEvaluationType(
  value: unknown,
): value is GradeEvaluationType {
  return (
    value === 'ORDERING' || value === 'NUMERIC' || value === 'MATH_EXPRESSION'
  );
}

export function assertGradeEvaluationAnswerProvided(
  type: string,
  command: { answerJson?: unknown },
): void {
  if (isGradeEvaluationType(type) && command.answerJson === undefined)
    throw new ValidationDomainException(
      'Question interaction or answer is invalid',
      { field: 'answerJson' },
    );
}

function checked<T>(
  field: 'metadata' | 'answerKey' | 'answerJson',
  operation: () => T,
): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof QuestionEvaluationInputError)
      throw new ValidationDomainException(
        'Question interaction or answer is invalid',
        { field },
      );
    throw error;
  }
}

export function gradeEvaluationDefinition(
  type: GradeEvaluationType,
  value: unknown,
  phase: Phase,
): GradeEvaluationDefinition {
  return checked('metadata', () => {
    switch (type) {
      case 'ORDERING':
        return normalizeOrderingDefinition(value, phase);
      case 'NUMERIC':
        return normalizeNumericDefinition(value, phase);
      case 'MATH_EXPRESSION':
        return normalizeMathDefinition(value, phase);
    }
  });
}

/** Grades keeps its existing plain private-key replacement / explicit null clear API. */
export function normalizeGradeEvaluationQuestion(
  question: {
    type: GradeEvaluationType;
    metadata: unknown;
    answerKey?: unknown;
  },
  phase: Phase,
) {
  const metadata = gradeEvaluationDefinition(
    question.type,
    question.metadata,
    phase,
  );
  const answerKey =
    question.answerKey == null
      ? null
      : checked('answerKey', () => {
          switch (metadata.kind) {
            case 'ordering':
              return normalizeOrderingKey(metadata, question.answerKey);
            case 'numeric':
              return normalizeNumericKey(metadata, question.answerKey);
            case 'math_expression':
              return normalizeMathKey(metadata, question.answerKey);
          }
        });
  return { metadata, answerKey };
}

/** Pure normalization only: no key comparison, persistence or awarded marks. */
export function normalizeGradeEvaluationAnswer(
  definition: GradeEvaluationDefinition,
  value: unknown,
  phase: AnswerPhase,
  required: boolean,
) {
  return checked('answerJson', () => {
    switch (definition.kind) {
      case 'ordering':
        return normalizeOrderingAnswer(definition, value, phase, required);
      case 'numeric':
        return normalizeNumericAnswer(definition, value, phase, required);
      case 'math_expression':
        return normalizeMathAnswer(definition, value, phase, required);
    }
  });
}
