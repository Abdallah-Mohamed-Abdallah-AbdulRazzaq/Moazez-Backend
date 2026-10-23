import { GradeQuestionType } from '@prisma/client';

export class GradeQuestionInteractionDto {
  kind!: 'choice' | 'text' | 'fill' | 'matching' | 'media' | 'unsupported';
  selectionMode!: 'single' | 'multiple' | null;
  multiline!: boolean;
  supported!: boolean;
}

export class GradeQuestionContractDto {
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
} as const satisfies Record<
  GradeQuestionType,
  readonly [
    string,
    GradeQuestionInteractionDto['kind'],
    GradeQuestionInteractionDto['selectionMode'],
    boolean,
  ]
>;

export function presentGradeQuestionContract(
  type: GradeQuestionType | string,
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
  const canonicalType = type as GradeQuestionType;
  const [legacyType, kind, selectionMode, multiline] = TYPES[canonicalType];
  return {
    type: legacyType,
    canonicalType,
    interaction: { kind, selectionMode, multiline, supported: true },
  };
}
