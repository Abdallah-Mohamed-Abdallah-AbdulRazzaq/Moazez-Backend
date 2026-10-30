import { GradeQuestionType } from '@prisma/client';
import { gradeResponseConfig } from './grade-response-config';
import { assertResponseModalities } from '../../../../common/assessment-answer/response-config';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { validateGradeQuestionContent } from './grade-question-content-policy';
import {
  isGradeEvaluationType,
  gradeEvaluationDefinition,
  normalizeGradeEvaluationQuestion,
  normalizeGradeEvaluationAnswer,
  type GradeEvaluationDefinition,
} from './grade-question-evaluation';
import type {
  AnswerPhase,
  Phase,
} from '../../../../common/question-evaluation';

export const GRADE_TEXT_LIMITS = Object.freeze({
  short: 1000,
  essay: 10000,
  media: 10000,
  blank: 1000,
});
export const GRADE_STRUCTURED_ITEM_LIMIT = 50;
type PublicItem = { id: string; label: string; labelAr: string | null };
type FillSegment = { text: string } | { blankId: string };
export type GradePublicDefinition =
  | GradeEvaluationDefinition
  | { kind: 'choice'; minSelections: number; maxSelections: number }
  | { kind: 'text'; maxLength: number; multiline: boolean }
  | {
      kind: 'fill';
      blanks: Array<{ id: string; order: number }>;
      segments: FillSegment[];
      maxAnswerLength: number;
    }
  | {
      kind: 'matching';
      left: PublicItem[];
      right: PublicItem[];
      reuseRight: false;
    }
  | {
      kind: 'media';
      source: { url: string; title: string | null; mode: string | null };
      answer: { kind: 'text'; maxLength: number; multiline: true };
    };

export interface GradeInteractionQuestion {
  responseConfig?: unknown;
  type: string;
  prompt?: string | null;
  metadata?: unknown;
  answerKey?: unknown;
  required?: boolean;
  options?: ReadonlyArray<{
    id?: string;
    label?: string;
    value?: string | null;
    isCorrect?: boolean;
    deletedAt?: unknown;
  }>;
}
export interface GradeTypedAnswer {
  answerText: string | null;
  answerJson: unknown;
  selectedOptionIds: string[];
  /** Internal authoritative SQL fact, never a public request field. */
  answerJsonSqlNull?: boolean;
}

/** Read/submit compatibility for the documented former SHORT_ANSWER text bound.
 * Never used by new answer saves, and never rewrites historical persistence. */
export function normalizeStoredGradeAnswer(
  question: GradeInteractionQuestion,
  payload: GradeTypedAnswer,
  phase: AnswerPhase = 'final',
): GradeTypedAnswer {
  if (
    isGradeEvaluationType(question.type) &&
    payload.answerJson == null &&
    payload.answerJsonSqlNull !== true
  )
    invalid('answerJson');
  if (
    question.type === GradeQuestionType.SHORT_ANSWER &&
    question.responseConfig == null &&
    payload.answerJson == null &&
    payload.selectedOptionIds.length === 0
  ) {
    return {
      answerText: normalizeGradeAnswerText(payload.answerText, 10000),
      answerJson: null,
      selectedOptionIds: [],
    };
  }
  return normalizeTypedGradeAnswer(question, payload, phase);
}

function invalid(field: string): never {
  throw new ValidationDomainException(
    'Question interaction or answer is invalid',
    { field },
  );
}
function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid(field);
  return value as Record<string, unknown>;
}
function onlyKeys(
  value: Record<string, unknown>,
  keys: string[],
  field: string,
): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid(field);
}
function list(value: unknown, field: string, minimum = 1): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > GRADE_STRUCTURED_ITEM_LIMIT
  )
    invalid(field);
  return value;
}
function identifier(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(value)
  )
    invalid(field);
  return value;
}
function hasInvalidAnswerCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0)!;
    return (
      (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
      code === 127 ||
      (code >= 0xd800 && code <= 0xdfff)
    );
  });
}
export function normalizeGradeAnswerText(
  value: unknown,
  maximum: number,
  field = 'answerText',
): string {
  if (
    typeof value !== 'string' ||
    Array.from(value).length > maximum ||
    hasInvalidAnswerCharacters(value)
  )
    invalid(field);
  const result = value.replace(/\r\n?/gu, '\n').normalize('NFC').trim();
  if (!result || Array.from(result).length > maximum) invalid(field);
  return result;
}
function unique(values: string[], field: string): void {
  if (new Set(values).size !== values.length) invalid(field);
}
function boundedInteger(
  value: unknown,
  fallback: number,
  maximum: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > maximum
  )
    invalid(field);
  return value;
}

/** Public allowlist, never a copy of author metadata or correct-pair relations. */
export function gradeQuestionDefinition(
  question: GradeInteractionQuestion,
  phase: Phase = 'complete',
): GradePublicDefinition {
  const type = String(question.type).toUpperCase();
  if (
    question.prompt !== undefined &&
    (typeof question.prompt !== 'string' || !question.prompt.trim())
  )
    invalid('prompt');
  if (
    !['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE'].includes(type) &&
    question.options?.length
  )
    invalid('options');
  if (isGradeEvaluationType(type))
    return gradeEvaluationDefinition(type, question.metadata, phase);
  const metadata =
    question.metadata == null ? {} : record(question.metadata, 'metadata');
  switch (type) {
    case GradeQuestionType.MCQ_SINGLE:
      if (
        question.options &&
        (question.options.length < 2 || question.options.length > 50)
      )
        invalid('options');
      return { kind: 'choice', minSelections: 1, maxSelections: 1 };
    case GradeQuestionType.TRUE_FALSE:
      if (question.options) {
        const values = question.options.map((option) =>
          String(option.value ?? option.label ?? '')
            .trim()
            .toLowerCase(),
        );
        if (
          values.length !== 2 ||
          !values.includes('true') ||
          !values.includes('false')
        )
          invalid('options.value');
      }
      return { kind: 'choice', minSelections: 1, maxSelections: 1 };
    case GradeQuestionType.MCQ_MULTI: {
      const optionCount =
        question.options?.filter((option) => !option.deletedAt).length ?? 50;
      const minSelections = boundedInteger(
        metadata.minSelections,
        1,
        optionCount,
        'metadata.minSelections',
      );
      const maxSelections = boundedInteger(
        metadata.maxSelections,
        optionCount,
        optionCount,
        'metadata.maxSelections',
      );
      if (minSelections > maxSelections) invalid('metadata.minSelections');
      return { kind: 'choice', minSelections, maxSelections };
    }
    case GradeQuestionType.SHORT_ANSWER:
      return {
        kind: 'text',
        maxLength: GRADE_TEXT_LIMITS.short,
        multiline: false,
      };
    case GradeQuestionType.ESSAY:
      return {
        kind: 'text',
        maxLength: GRADE_TEXT_LIMITS.essay,
        multiline: true,
      };
    case GradeQuestionType.FILL_IN_BLANK: {
      const blanks = list(metadata.blanks, 'metadata.blanks')
        .map((entry, index) => {
          const blank = record(entry, 'metadata.blanks');
          const id = identifier(blank.id, 'metadata.blanks.id');
          const order = boundedInteger(
            blank.order,
            index + 1,
            GRADE_STRUCTURED_ITEM_LIMIT,
            'metadata.blanks.order',
          );
          return { id, order };
        })
        .sort((a, b) => a.order - b.order);
      unique(
        blanks.map((blank) => blank.id),
        'metadata.blanks.id',
      );
      unique(
        blanks.map((blank) => String(blank.order)),
        'metadata.blanks.order',
      );
      const segments = list(metadata.segments, 'metadata.segments').map(
        (entry): FillSegment => {
          const segment = record(entry, 'metadata.segments');
          onlyKeys(segment, ['text', 'blankId'], 'metadata.segments');
          if ('text' in segment && !('blankId' in segment)) {
            if (
              typeof segment.text !== 'string' ||
              Array.from(segment.text).length > 5000 ||
              hasInvalidAnswerCharacters(segment.text)
            )
              invalid('metadata.segments.text');
            return {
              text: segment.text.replace(/\r\n?/gu, '\n').normalize('NFC'),
            };
          }
          if ('blankId' in segment && !('text' in segment))
            return {
              blankId: identifier(segment.blankId, 'metadata.segments.blankId'),
            };
          return invalid('metadata.segments');
        },
      );
      const references = segments.flatMap((segment) =>
        'blankId' in segment ? [segment.blankId] : [],
      );
      if (
        references.length !== blanks.length ||
        references.some((id, index) => id !== blanks[index].id)
      )
        invalid('metadata.segments.blankId');
      return {
        kind: 'fill',
        blanks,
        segments,
        maxAnswerLength: GRADE_TEXT_LIMITS.blank,
      };
    }
    case GradeQuestionType.MATCHING: {
      if (metadata.reuseRight !== undefined && metadata.reuseRight !== false)
        invalid('metadata.reuseRight');
      const side = (value: unknown, field: string): PublicItem[] => {
        const items = list(value, field, 2).map((entry) => {
          const item = record(entry, field);
          return {
            id: identifier(item.id, `${field}.id`),
            label: normalizeGradeAnswerText(item.label, 1000, `${field}.label`),
            labelAr:
              item.labelAr == null
                ? null
                : normalizeGradeAnswerText(
                    item.labelAr,
                    1000,
                    `${field}.labelAr`,
                  ),
          };
        });
        unique(
          items.map((item) => item.id),
          `${field}.id`,
        );
        return items;
      };
      const left = side(metadata.left, 'metadata.left'),
        right = side(metadata.right, 'metadata.right');
      if (right.length < left.length) invalid('metadata.right');
      return { kind: 'matching', left, right, reuseRight: false };
    }
    case GradeQuestionType.MEDIA: {
      const url = normalizeGradeAnswerText(
        metadata.mediaUrl,
        2000,
        'metadata.mediaUrl',
      );
      validateGradeQuestionContent({ metadata: { mediaUrl: url } });
      return {
        kind: 'media',
        source: {
          url,
          title:
            metadata.mediaTitle == null
              ? null
              : normalizeGradeAnswerText(
                  metadata.mediaTitle,
                  500,
                  'metadata.mediaTitle',
                ),
          mode:
            metadata.mediaMode == null
              ? null
              : normalizeGradeAnswerText(
                  metadata.mediaMode,
                  100,
                  'metadata.mediaMode',
                ),
        },
        answer: {
          kind: 'text',
          maxLength: GRADE_TEXT_LIMITS.media,
          multiline: true,
        },
      };
    }
    default:
      return invalid('type');
  }
}

export function validateGradeQuestionDefinition(
  question: GradeInteractionQuestion,
  complete = false,
): void {
  const type = String(question.type).toUpperCase();
  if (
    !['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE'].includes(type) &&
    question.options?.length
  )
    invalid('options');
  if (isGradeEvaluationType(type)) {
    normalizeGradeEvaluationQuestion(
      { ...question, type, metadata: question.metadata },
      complete ? 'complete' : 'draft',
    );
    return;
  }
  const metadata =
    question.metadata == null ? {} : record(question.metadata, 'metadata');
  // Existing incomplete structured drafts remain editable; supplied structures must be valid.
  if (
    !complete &&
    type === GradeQuestionType.FILL_IN_BLANK &&
    !('blanks' in metadata) &&
    !('segments' in metadata)
  )
    return;
  if (
    !complete &&
    type === GradeQuestionType.MATCHING &&
    !('left' in metadata) &&
    !('right' in metadata)
  )
    return;
  if (
    !complete &&
    type === GradeQuestionType.MEDIA &&
    metadata.mediaUrl == null
  )
    return;
  const definition = gradeQuestionDefinition(question);
  if (type === GradeQuestionType.TRUE_FALSE && question.options) {
    const options = question.options.filter((option) => !option.deletedAt);
    const values = options.map((option) =>
      String(option.value ?? option.label ?? '')
        .trim()
        .toLowerCase(),
    );
    if (
      options.length !== 2 ||
      !values.includes('true') ||
      !values.includes('false')
    )
      invalid('options.value');
    if (question.answerKey != null) {
      const extract = (value: unknown, depth = 0): boolean => {
        if (
          value === true ||
          (typeof value === 'string' && value.trim().toLowerCase() === 'true')
        )
          return true;
        if (
          value === false ||
          (typeof value === 'string' && value.trim().toLowerCase() === 'false')
        )
          return false;
        if (depth > 16) return invalid('answerKey');
        const source = record(value, 'answerKey');
        const answers = ['value', 'answer', 'correct']
          .filter((key) => key in source)
          .map((key) => extract(source[key], depth + 1));
        if (!answers.length || answers.some((answer) => answer !== answers[0]))
          return invalid('answerKey');
        return answers[0];
      };
      const correct = options.findIndex((option) => option.isCorrect);
      if (
        correct < 0 ||
        (values[correct] === 'true') !== extract(question.answerKey)
      )
        invalid('answerKey');
    }
  }
  if (definition.kind === 'matching' && question.answerKey != null) {
    const key = record(question.answerKey, 'answerKey');
    validateMatchingPairs(definition, key.pairs, true);
  }
}

function validateMatchingPairs(
  definition: Extract<GradePublicDefinition, { kind: 'matching' }>,
  value: unknown,
  required: boolean,
) {
  const pairs = list(value, 'answerJson.pairs').map((entry) => {
    const pair = record(entry, 'answerJson.pairs');
    onlyKeys(pair, ['leftId', 'rightId'], 'answerJson.pairs');
    const leftId = identifier(pair.leftId, 'answerJson.pairs.leftId'),
      rightId = identifier(pair.rightId, 'answerJson.pairs.rightId');
    if (
      !definition.left.some((item) => item.id === leftId) ||
      !definition.right.some((item) => item.id === rightId)
    )
      invalid('answerJson.pairs');
    return { leftId, rightId };
  });
  unique(
    pairs.map((pair) => pair.leftId),
    'answerJson.pairs.leftId',
  );
  unique(
    pairs.map((pair) => pair.rightId),
    'answerJson.pairs.rightId',
  );
  if (required && pairs.length !== definition.left.length)
    invalid('answerJson.pairs');
  return pairs.sort(
    (a, b) =>
      definition.left.findIndex((item) => item.id === a.leftId) -
      definition.left.findIndex((item) => item.id === b.leftId),
  );
}

/** One canonical write representation, shared by single/bulk and final DB validation. */
export function normalizeTypedGradeAnswer(
  question: GradeInteractionQuestion,
  payload: GradeTypedAnswer,
  phase: AnswerPhase = 'final',
): GradeTypedAnswer {
  const responseConfig = gradeResponseConfig(
    question.type,
    question.responseConfig,
  );
  if (responseConfig) {
    if (payload.answerJson != null || payload.selectedOptionIds.length)
      invalid('answerJson');
    const answerText =
      payload.answerText == null
        ? null
        : normalizeGradeAnswerText(
            payload.answerText,
            question.type === 'SHORT_ANSWER'
              ? GRADE_TEXT_LIMITS.short
              : GRADE_TEXT_LIMITS.essay,
          );
    try {
      assertResponseModalities({
        config: responseConfig,
        hasText: !!answerText,
        assets: [],
        required: false,
        phase: 'draft',
      });
    } catch {
      invalid('answerText');
    }
    return { answerText, answerJson: null, selectedOptionIds: [] };
  }
  const definition = gradeQuestionDefinition(question);
  unique(
    payload.selectedOptionIds.map((id) => id.toLowerCase()),
    'selectedOptionIds',
  );
  if (definition.kind === 'choice') {
    if (
      payload.answerText != null ||
      payload.answerJson != null ||
      payload.selectedOptionIds.length < definition.minSelections ||
      payload.selectedOptionIds.length > definition.maxSelections
    )
      invalid('selectedOptionIds');
    return {
      answerText: null,
      answerJson: null,
      selectedOptionIds: payload.selectedOptionIds.map((id) =>
        id.toLowerCase(),
      ),
    };
  }
  if (payload.selectedOptionIds.length) invalid('selectedOptionIds');
  if (
    definition.kind === 'ordering' ||
    definition.kind === 'numeric' ||
    definition.kind === 'math_expression'
  ) {
    if (payload.answerText != null) invalid('answerText');
    if (payload.answerJson === undefined) invalid('answerJson');
    return {
      answerText: null,
      answerJson: normalizeGradeEvaluationAnswer(
        definition,
        payload.answerJson,
        phase,
        question.required !== false,
      ),
      selectedOptionIds: [],
    };
  }
  if (definition.kind === 'text' || definition.kind === 'media') {
    if (payload.answerJson != null) invalid('answerJson');
    const maximum =
      definition.kind === 'text'
        ? definition.maxLength
        : definition.answer.maxLength;
    const answerText = normalizeGradeAnswerText(payload.answerText, maximum);
    if (definition.kind === 'media')
      validateGradeQuestionContent({ prompt: answerText });
    return { answerText, answerJson: null, selectedOptionIds: [] };
  }
  if (definition.kind === 'fill') {
    // Safe legacy alias: text can represent exactly one explicitly identified blank.
    const value =
      payload.answerJson == null &&
      payload.answerText != null &&
      definition.blanks.length === 1
        ? {
            blanks: [
              { blankId: definition.blanks[0].id, text: payload.answerText },
            ],
          }
        : payload.answerJson;
    if (payload.answerJson != null && payload.answerText != null)
      invalid('answerText');
    const source = record(value, 'answerJson');
    onlyKeys(source, ['blanks'], 'answerJson');
    const blanks = list(source.blanks, 'answerJson.blanks').map((entry) => {
      const blank = record(entry, 'answerJson.blanks');
      onlyKeys(blank, ['blankId', 'text'], 'answerJson.blanks');
      const blankId = identifier(blank.blankId, 'answerJson.blanks.blankId');
      if (!definition.blanks.some((item) => item.id === blankId))
        invalid('answerJson.blanks.blankId');
      return {
        blankId,
        text: normalizeGradeAnswerText(
          blank.text,
          GRADE_TEXT_LIMITS.blank,
          'answerJson.blanks.text',
        ),
      };
    });
    unique(
      blanks.map((blank) => blank.blankId),
      'answerJson.blanks.blankId',
    );
    if (
      question.required !== false &&
      blanks.length !== definition.blanks.length
    )
      invalid('answerJson.blanks');
    blanks.sort(
      (a, b) =>
        definition.blanks.findIndex((blank) => blank.id === a.blankId) -
        definition.blanks.findIndex((blank) => blank.id === b.blankId),
    );
    return { answerText: null, answerJson: { blanks }, selectedOptionIds: [] };
  }
  if (payload.answerText != null) invalid('answerText');
  const source = record(payload.answerJson, 'answerJson');
  onlyKeys(source, ['pairs'], 'answerJson');
  return {
    answerText: null,
    answerJson: {
      pairs: validateMatchingPairs(
        definition,
        source.pairs,
        question.required !== false,
      ),
    },
    selectedOptionIds: [],
  };
}
