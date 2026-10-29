import type { RichContent } from '../../../../common/rich-content/rich-content.types';
import { GradeQuestionType } from '@prisma/client';
import type { ActiveGradeQuestionType } from '../../assessments/domain/grade-runtime-types';
import type { Phase } from '../../../../common/question-evaluation';
import { isGradeEvaluationType } from '../../assessments/domain/grade-question-evaluation';
import {
  gradeQuestionDefinition,
  normalizeStoredGradeAnswer,
  type GradeTypedAnswer,
  type GradeInteractionQuestion,
  type GradePublicDefinition,
} from '../../assessments/domain/grade-question-interaction';
import {
  sanitizeGradeQuestionContent,
  validateGradeQuestionContent,
} from '../../assessments/domain/grade-question-content-policy';

export class GradeQuestionInteractionDto {
  kind!:
    | 'choice'
    | 'text'
    | 'fill'
    | 'matching'
    | 'media'
    | 'ordering'
    | 'numeric'
    | 'math_expression'
    | 'unsupported';
  selectionMode!: 'single' | 'multiple' | null;
  multiline!: boolean;
  supported!: boolean;
  definition?: GradePublicDefinition | null;
}

export function presentGradeOptionValue(
  type: string,
  value: string | null,
): string | null {
  const safe = sanitizeGradeQuestionContent(value) as string | null;
  if (type !== GradeQuestionType.TRUE_FALSE) return safe;
  const normalized = safe?.trim().toLowerCase();
  return normalized === 'true' || normalized === 'false' ? normalized : null;
}

/** Historical answers are never re-written or exposed as arbitrary JSON. */
export function presentSafeGradeAnswer(
  question: GradeInteractionQuestion,
  payload: GradeTypedAnswer,
) {
  const contract = presentGradeQuestionContract(
    String(question.type),
    question,
  );
  let answerJson: unknown = null;
  try {
    if (
      question.options &&
      payload.selectedOptionIds.some(
        (id) =>
          !question.options!.some(
            (option) =>
              !option.deletedAt &&
              option.id?.toLowerCase() === id.toLowerCase(),
          ),
      )
    )
      throw new Error('Unavailable historical selection');
    answerJson = normalizeStoredGradeAnswer(
      question,
      payload,
      'draft',
    ).answerJson;
  } catch {
    contract.interaction = {
      ...contract.interaction,
      supported: false,
      definition: null,
    };
  }
  return {
    canonicalType: contract.canonicalType,
    interaction: contract.interaction,
    answerText: isGradeEvaluationType(question.type)
      ? null
      : (sanitizeGradeQuestionContent(payload.answerText) as string | null),
    answerJson: sanitizeGradeQuestionContent(answerJson, true),
  };
}

export class GradeQuestionContractDto {
  richContent?: RichContent;
  type!: string;
  canonicalType!: GradeQuestionType | null;
  interaction!: GradeQuestionInteractionDto;
}

const TYPES = {
  MCQ_SINGLE: ['multiple_choice', 'choice', 'single', false],
  MCQ_MULTI: ['multiple_choice', 'choice', 'multiple', false],
  TRUE_FALSE: ['true_false', 'choice', 'single', false],
  SHORT_ANSWER: ['essay', 'text', null, false],
  ESSAY: ['essay', 'text', null, true],
  FILL_IN_BLANK: ['fill_blanks', 'fill', null, false],
  MATCHING: ['matching', 'matching', null, false],
  MEDIA: ['media', 'media', null, false],
  ORDERING: ['ordering', 'ordering', null, false],
  NUMERIC: ['numeric', 'numeric', null, false],
  MATH_EXPRESSION: ['math_expression', 'math_expression', null, false],
} as const satisfies Record<
  ActiveGradeQuestionType,
  readonly [
    string,
    GradeQuestionInteractionDto['kind'],
    GradeQuestionInteractionDto['selectionMode'],
    boolean,
  ]
>;

export function presentGradeQuestionContract(
  type: string,
  question?: GradeInteractionQuestion,
  phase: Phase = 'complete',
): GradeQuestionContractDto {
  if (!Object.prototype.hasOwnProperty.call(TYPES, type)) {
    return {
      type: String(type).trim().toLowerCase(),
      canonicalType: null,
      interaction: {
        kind: 'unsupported',
        selectionMode: null,
        multiline: false,
        supported: false,
      },
    };
  }
  const canonicalType = type as ActiveGradeQuestionType;
  const [legacyType, kind, selectionMode, multiline] = TYPES[canonicalType];
  let definition: GradePublicDefinition | null = null;
  let supported = true;
  if (question) {
    try {
      definition = gradeQuestionDefinition(question, phase);
      validateGradeQuestionContent({ metadata: definition });
      definition = sanitizeGradeQuestionContent(
        definition,
      ) as GradePublicDefinition;
    } catch {
      supported = false;
      definition = null;
    }
  }
  return {
    type: legacyType,
    canonicalType,
    interaction: {
      kind,
      selectionMode,
      multiline,
      supported,
      ...(question ? { definition } : {}),
    },
  };
}
