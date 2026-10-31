import {
  evaluateMathExpression,
  evaluateNumeric,
  evaluateOrdering,
  normalizeMathKey,
  normalizeNumericKey,
  normalizeOrderingKey,
  QuestionEvaluationInputError,
  type EvaluationOutcome,
} from '../../../../common/question-evaluation';
import {
  list,
  record,
  text,
  unique,
} from '../../../../common/question-evaluation/strict-data';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import {
  gradeQuestionDefinition,
  normalizeGradeAnswerText,
  normalizeStoredGradeAnswer,
  validateGradeQuestionDefinition,
  type GradeInteractionQuestion,
  type GradeTypedAnswer,
} from './grade-question-interaction';

export const GRADE_SCORING_VERSION = 'st12-objective-v1';
export const GRADE_SCORING_POLICY_VERSION = 1;
const SUBJECTIVE = new Set(['SHORT_ANSWER', 'ESSAY', 'MEDIA']);

export type GradeObjectiveQuestion = GradeInteractionQuestion & {
  points: string;
};
export interface GradeScoringResult {
  evaluationVersion: typeof GRADE_SCORING_VERSION;
  policyVersion: 1;
  outcome: EvaluationOutcome;
  suggestedPoints: string | null;
  maxPoints: string;
  reason: string;
  manualReviewRequired: boolean;
}

type FillKey = {
  keyVersion: 1;
  kind: 'fill';
  normalization: 'NFC_TRIM';
  blanks: { blankId: string; acceptedTexts: string[] }[];
};

/** Canonical private projection used only after author/key-approval authority. */
export function gradeScoringKey(question: GradeInteractionQuestion) {
  validateGradeQuestionDefinition(question, true);
  const definition = gradeQuestionDefinition(question, 'complete');
  if (SUBJECTIVE.has(question.type)) {
    const key = record(
      question.answerKey,
      ['keyVersion', 'kind', 'text'],
      ['textAr'],
    );
    if (key.keyVersion !== 1 || key.kind !== 'model_text')
      throw new QuestionEvaluationInputError();
    return {
      keyVersion: 1 as const,
      kind: 'model_text' as const,
      text: normalizeGradeAnswerText(text(key.text, 10000), 10000),
      ...(key.textAr === undefined
        ? {}
        : { textAr: normalizeGradeAnswerText(text(key.textAr, 10000), 10000) }),
    };
  }
  if (definition.kind === 'choice') {
    const options =
      question.options?.filter((option) => !option.deletedAt) ?? [];
    const ids = options.map((option) => option.id);
    if (
      options.length < 2 ||
      options.length > 50 ||
      ids.some((id) => typeof id !== 'string' || !id)
    )
      throw new QuestionEvaluationInputError();
    unique(ids as string[]);
    if (options.some((option) => typeof option.isCorrect !== 'boolean'))
      throw new QuestionEvaluationInputError();
    const correctOptionIds = options
      .filter((option) => option.isCorrect)
      .map((option) => option.id!)
      .sort();
    if (
      correctOptionIds.length < definition.minSelections ||
      correctOptionIds.length > definition.maxSelections ||
      (question.type !== 'MCQ_MULTI' && correctOptionIds.length !== 1)
    )
      throw new QuestionEvaluationInputError();
    return { kind: 'choice' as const, correctOptionIds };
  }
  if (definition.kind === 'ordering')
    return normalizeOrderingKey(definition, question.answerKey);
  if (definition.kind === 'numeric')
    return normalizeNumericKey(definition, question.answerKey);
  if (definition.kind === 'math_expression') {
    const key = normalizeMathKey(definition, question.answerKey);
    const outcome = evaluateMathExpression(
      definition,
      { state: 'configured', key },
      { expression: key.expression },
    );
    if (outcome === 'UNDEFINED_EXPRESSION' || outcome === 'INVALID_INPUT')
      throw new QuestionEvaluationInputError();
    return key;
  }
  if (definition.kind === 'matching') {
    const source = record(question.answerKey, ['pairs']);
    const answer = normalizeStoredGradeAnswer(
      { ...question, required: true },
      {
        answerText: null,
        answerJson: { pairs: source.pairs },
        selectedOptionIds: [],
        answerJsonSqlNull: false,
      },
    );
    return {
      kind: 'matching' as const,
      pairs: (
        answer.answerJson as { pairs: { leftId: string; rightId: string }[] }
      ).pairs,
    };
  }
  if (definition.kind !== 'fill') throw new QuestionEvaluationInputError();
  const source = record(question.answerKey, [
    'keyVersion',
    'kind',
    'normalization',
    'blanks',
  ]);
  if (
    source.keyVersion !== 1 ||
    source.kind !== 'fill' ||
    source.normalization !== 'NFC_TRIM'
  )
    throw new QuestionEvaluationInputError();
  let byteCount = 0;
  const blanks = list(source.blanks, 50).map((value) => {
    const entry = record(value, ['blankId', 'acceptedTexts']);
    const blankId = text(entry.blankId, 64);
    if (!definition.blanks.some((blank) => blank.id === blankId))
      throw new QuestionEvaluationInputError();
    const acceptedTexts = list(entry.acceptedTexts, 20).map((value) => {
      const normalized = normalizeGradeAnswerText(text(value, 1000), 1000);
      byteCount += Buffer.byteLength(normalized, 'utf8');
      if (byteCount > 64 * 1024) throw new QuestionEvaluationInputError();
      return normalized;
    });
    if (!acceptedTexts.length) throw new QuestionEvaluationInputError();
    unique(acceptedTexts);
    return { blankId, acceptedTexts };
  });
  unique(blanks.map((blank) => blank.blankId));
  if (blanks.length !== definition.blanks.length)
    throw new QuestionEvaluationInputError();
  blanks.sort((left, right) => left.blankId.localeCompare(right.blankId, 'en'));
  return {
    keyVersion: 1,
    kind: 'fill',
    normalization: 'NFC_TRIM',
    blanks,
  } satisfies FillKey;
}

/** Produces evidence only; callers retain explicit reviewer application authority. */
export function evaluateGradeObjectiveAnswer(
  question: GradeObjectiveQuestion,
  answer: GradeTypedAnswer,
  keyApproved: boolean,
): GradeScoringResult {
  const validPoints =
    /^(?:0|[1-9]\d{0,5})\.\d{2}$/u.test(question.points) &&
    question.points !== '0.00';
  const result = (
    outcome: EvaluationOutcome,
    reason: string,
  ): GradeScoringResult => ({
    evaluationVersion: GRADE_SCORING_VERSION,
    policyVersion: GRADE_SCORING_POLICY_VERSION,
    outcome,
    suggestedPoints:
      outcome === 'PROVED_EQUIVALENT'
        ? question.points
        : outcome === 'PROVED_DIFFERENT'
          ? '0.00'
          : null,
    maxPoints: validPoints ? question.points : '0.00',
    reason,
    manualReviewRequired:
      outcome !== 'PROVED_EQUIVALENT' && outcome !== 'PROVED_DIFFERENT',
  });
  if (!validPoints) return result('INVALID_INPUT', 'INVALID_MAX_POINTS');
  if (SUBJECTIVE.has(question.type) || question.responseConfig != null)
    return result('UNKNOWN_REQUIRES_MANUAL_REVIEW', 'SUBJECTIVE_RESPONSE');
  let definition: ReturnType<typeof gradeQuestionDefinition>;
  let key: ReturnType<typeof gradeScoringKey>;
  try {
    definition = gradeQuestionDefinition(question, 'complete');
    key = gradeScoringKey(question);
  } catch (error) {
    if (
      error instanceof DomainException ||
      error instanceof QuestionEvaluationInputError
    )
      return result('INVALID_INPUT', 'INVALID_QUESTION_OR_KEY');
    throw error;
  }
  if (!keyApproved)
    return result('UNKNOWN_REQUIRES_MANUAL_REVIEW', 'KEY_NOT_APPROVED');
  if (
    answer.answerText == null &&
    answer.answerJson == null &&
    !answer.selectedOptionIds.length
  )
    return result('UNKNOWN_REQUIRES_MANUAL_REVIEW', 'ANSWER_ABSENT');
  try {
    const current = normalizeStoredGradeAnswer(
      { ...question, required: true },
      answer,
      'final',
    );
    let outcome: EvaluationOutcome;
    if (definition.kind === 'ordering')
      outcome = evaluateOrdering(
        definition,
        { state: 'configured', key },
        current.answerJson,
      );
    else if (definition.kind === 'numeric')
      outcome = evaluateNumeric(
        definition,
        { state: 'configured', key },
        current.answerJson,
      );
    else if (definition.kind === 'math_expression')
      outcome = evaluateMathExpression(
        definition,
        { state: 'configured', key },
        current.answerJson,
      );
    else if (key.kind === 'choice') {
      const selected = [...current.selectedOptionIds].sort();
      if (
        selected.some(
          (id) =>
            !question.options?.some(
              (option) => option.id === id && !option.deletedAt,
            ),
        )
      )
        throw new QuestionEvaluationInputError();
      outcome =
        selected.length === key.correctOptionIds.length &&
        selected.every((id, index) => id === key.correctOptionIds[index])
          ? 'PROVED_EQUIVALENT'
          : 'PROVED_DIFFERENT';
    } else if (key.kind === 'fill') {
      const entries = (
        current.answerJson as { blanks: { blankId: string; text: string }[] }
      ).blanks;
      outcome = key.blanks.every((blank) => {
        const submitted = entries.find(
          (entry) => entry.blankId === blank.blankId,
        );
        return (
          submitted !== undefined &&
          blank.acceptedTexts.includes(submitted.text)
        );
      })
        ? 'PROVED_EQUIVALENT'
        : 'PROVED_DIFFERENT';
    } else if (key.kind === 'matching') {
      const entries = (
        current.answerJson as { pairs: { leftId: string; rightId: string }[] }
      ).pairs;
      outcome = key.pairs.every((pair) =>
        entries.some(
          (entry) =>
            entry.leftId === pair.leftId && entry.rightId === pair.rightId,
        ),
      )
        ? 'PROVED_EQUIVALENT'
        : 'PROVED_DIFFERENT';
    } else
      return result('UNKNOWN_REQUIRES_MANUAL_REVIEW', 'NO_OBJECTIVE_CONTRACT');
    return result(
      outcome,
      outcome === 'PROVED_EQUIVALENT'
        ? 'EXACT_MATCH'
        : outcome === 'PROVED_DIFFERENT'
          ? 'PROVED_MISMATCH'
          : outcome,
    );
  } catch (error) {
    if (
      error instanceof DomainException ||
      error instanceof QuestionEvaluationInputError
    )
      return result('INVALID_INPUT', 'INVALID_STORED_ANSWER');
    throw error;
  }
}
