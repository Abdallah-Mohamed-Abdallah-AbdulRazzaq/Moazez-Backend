import { HttpStatus } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeQuestionType,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  GradeAssessmentLockedException,
  GradeAssessmentInvalidStatusTransitionException,
} from './grade-assessment-domain';
import {
  GradeTermWritableLike,
  assertTermWritable,
  isAssessmentLocked,
  normalizeAssessmentApprovalStatus,
  normalizeDeliveryMode,
} from '../../shared/domain/grade-workflow';
import { toGradeNumber } from '../../shared/domain/grade-calculation';

export interface QuestionAssessmentLike {
  id: string;
  deliveryMode: GradeAssessmentDeliveryMode | string;
  approvalStatus: GradeAssessmentApprovalStatus | string;
  lockedAt?: Date | string | null;
  isLocked?: boolean | null;
  maxScore?: unknown;
}

export interface QuestionCommandLike {
  type?: GradeQuestionType | string;
  questionType?: GradeQuestionType | string;
  prompt?: string | null;
  questionTextEn?: string | null;
  promptAr?: string | null;
  questionTextAr?: string | null;
  explanation?: string | null;
  explanationAr?: string | null;
  points?: unknown;
  sortOrder?: unknown;
  order?: unknown;
  required?: boolean;
  answerKey?: unknown;
  correctAnswer?: unknown;
  metadata?: Record<string, unknown> | null;
  matchingPairs?: unknown;
  mediaMode?: string | null;
  mediaTitle?: string | null;
  mediaUrl?: string | null;
  mediaFileName?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  sampleAnswerAr?: unknown;
  sampleAnswerEn?: unknown;
  acceptedAnswersAr?: unknown;
  acceptedAnswersEn?: unknown;
  options?: QuestionOptionCommandLike[];
}

export interface QuestionOptionCommandLike {
  label?: string | null;
  textEn?: string | null;
  labelAr?: string | null;
  textAr?: string | null;
  value?: string | null;
  isCorrect?: boolean;
  sortOrder?: unknown;
  order?: unknown;
  metadata?: Record<string, unknown> | null;
}

export interface NormalizedQuestionPayload {
  type?: GradeQuestionType;
  prompt?: string;
  promptAr?: string | null;
  explanation?: string | null;
  explanationAr?: string | null;
  points?: number;
  sortOrder?: number;
  required?: boolean;
  answerKey?: unknown;
  metadata?: unknown;
  options?: NormalizedQuestionOptionPayload[];
}

export interface NormalizedQuestionOptionPayload {
  label: string;
  labelAr: string | null;
  value: string | null;
  isCorrect: boolean;
  sortOrder: number;
  metadata: unknown;
}

export class GradeQuestionStructureLockedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.question.structure_locked',
      message: 'Question structure cannot be changed',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class GradeAnswerInvalidOptionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.answer.invalid_option',
      message: 'Answer references an invalid option',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export function assertQuestionBasedAssessment(
  assessment: QuestionAssessmentLike,
): void {
  if (
    normalizeDeliveryMode(assessment.deliveryMode) !==
    GradeAssessmentDeliveryMode.QUESTION_BASED
  ) {
    throw new ValidationDomainException(
      'Assessment must be question-based for question management',
      {
        assessmentId: assessment.id,
        deliveryMode: assessment.deliveryMode,
      },
    );
  }
}

export function assertQuestionStructureMutable(params: {
  assessment: QuestionAssessmentLike;
  term: GradeTermWritableLike;
  submissionCount: number;
}): void {
  assertDraftUnlockedWritableAssessment(params.assessment, params.term);
  assertNoSubmissionsForQuestionStructureChange(params.submissionCount, {
    assessmentId: params.assessment.id,
  });
}

export function assertDraftUnlockedWritableAssessment(
  assessment: QuestionAssessmentLike,
  term: GradeTermWritableLike,
): void {
  if (isAssessmentLocked(assessment)) {
    throw new GradeAssessmentLockedException({ assessmentId: assessment.id });
  }

  const approvalStatus = normalizeAssessmentApprovalStatus(
    assessment.approvalStatus,
  );
  if (approvalStatus !== GradeAssessmentApprovalStatus.DRAFT) {
    throw new GradeAssessmentInvalidStatusTransitionException({
      assessmentId: assessment.id,
      approvalStatus,
    });
  }

  assertTermWritable(term);
}

export function assertNoSubmissionsForQuestionStructureChange(
  submissionCount: number,
  details?: Record<string, unknown>,
): void {
  if (submissionCount > 0) {
    throw new GradeQuestionStructureLockedException({
      ...details,
      submissionCount,
    });
  }
}

export function normalizeQuestionType(
  input: GradeQuestionType | string | null | undefined,
): GradeQuestionType {
  const normalized = String(input ?? '')
    .trim()
    .toUpperCase();

  switch (normalized) {
    case GradeQuestionType.MCQ_SINGLE:
      return GradeQuestionType.MCQ_SINGLE;
    case GradeQuestionType.MCQ_MULTI:
      return GradeQuestionType.MCQ_MULTI;
    case GradeQuestionType.TRUE_FALSE:
      return GradeQuestionType.TRUE_FALSE;
    case GradeQuestionType.SHORT_ANSWER:
      return GradeQuestionType.SHORT_ANSWER;
    case GradeQuestionType.ESSAY:
      return GradeQuestionType.ESSAY;
    case GradeQuestionType.FILL_IN_BLANK:
      return GradeQuestionType.FILL_IN_BLANK;
    case GradeQuestionType.MATCHING:
      return GradeQuestionType.MATCHING;
    case GradeQuestionType.MEDIA:
      return GradeQuestionType.MEDIA;
    default:
      throw new ValidationDomainException('Question type is invalid', {
        field: 'type',
        value: input,
      });
  }
}

export function normalizeQuestionPayload(
  command: QuestionCommandLike,
  options: {
    requirePrompt?: boolean;
    requireType?: boolean;
    requirePoints?: boolean;
    defaultRequired?: boolean;
  } = {},
): NormalizedQuestionPayload {
  const payload: NormalizedQuestionPayload = {};

  const typeInput = command.type ?? command.questionType;
  if (typeInput !== undefined) {
    payload.type = normalizeQuestionType(typeInput);
  } else if (options.requireType) {
    throw new ValidationDomainException('Question type is required', {
      field: 'type',
    });
  }

  const promptInput = command.prompt ?? command.questionTextEn;
  if (promptInput !== undefined) {
    payload.prompt = requireText(promptInput, 'prompt');
  } else if (options.requirePrompt) {
    throw new ValidationDomainException('Question prompt is required', {
      field: 'prompt',
    });
  }

  if (hasOwn(command, 'promptAr') || hasOwn(command, 'questionTextAr')) {
    payload.promptAr = normalizeNullableText(
      command.promptAr ?? command.questionTextAr,
    );
  }

  if (hasOwn(command, 'explanation')) {
    payload.explanation = normalizeNullableText(command.explanation);
  }

  if (hasOwn(command, 'explanationAr')) {
    payload.explanationAr = normalizeNullableText(command.explanationAr);
  }

  if (hasOwn(command, 'points')) {
    payload.points = validateQuestionPoints(command.points);
  } else if (options.requirePoints) {
    throw new ValidationDomainException('Question points are required', {
      field: 'points',
    });
  }

  if (hasOwn(command, 'sortOrder') || hasOwn(command, 'order')) {
    payload.sortOrder = validateSortOrder(command.sortOrder ?? command.order);
  }

  if (hasOwn(command, 'required')) {
    payload.required =
      command.required === undefined ? undefined : command.required;
  } else if (options.defaultRequired !== undefined) {
    payload.required = options.defaultRequired;
  }

  if (hasOwn(command, 'answerKey') || hasOwn(command, 'correctAnswer')) {
    payload.answerKey = command.answerKey ?? command.correctAnswer ?? null;
  }

  const metadata = buildQuestionMetadata(command);
  if (metadata !== undefined) {
    payload.metadata = metadata;
  }

  if (hasOwn(command, 'options')) {
    payload.options = command.options
      ? buildQuestionOptionsPayload(command.options)
      : [];
  }

  return payload;
}

export function validateQuestionPoints(value: unknown): number {
  const points = Number(value);
  if (!Number.isFinite(points) || points <= 0) {
    throw new ValidationDomainException(
      'Question points must be greater than 0',
      { field: 'points', value },
    );
  }

  return points;
}

export function validateQuestionOptionsForType(params: {
  type: GradeQuestionType | string;
  options: NormalizedQuestionOptionPayload[];
  answerKey?: unknown;
  metadata?: unknown;
}): NormalizedQuestionOptionPayload[] {
  const type = normalizeQuestionType(params.type);
  const options =
    type === GradeQuestionType.TRUE_FALSE && params.options.length === 0
      ? buildTrueFalseOptionsFromAnswerKey(params.answerKey)
      : params.options;
  const correctCount = options.filter((option) => option.isCorrect).length;

  switch (type) {
    case GradeQuestionType.MCQ_SINGLE:
      assertOptionCountAtLeast(type, options, 2);
      if (correctCount !== 1) {
        throwInvalidOption(
          type,
          'MCQ_SINGLE requires exactly one correct option',
        );
      }
      return options;

    case GradeQuestionType.MCQ_MULTI:
      assertOptionCountAtLeast(type, options, 2);
      if (correctCount < 1) {
        throwInvalidOption(
          type,
          'MCQ_MULTI requires at least one correct option',
        );
      }
      return options;

    case GradeQuestionType.TRUE_FALSE:
      if (options.length !== 2 || correctCount !== 1) {
        throwInvalidOption(
          type,
          'TRUE_FALSE requires exactly two options and exactly one correct option',
        );
      }
      return options;

    case GradeQuestionType.SHORT_ANSWER:
    case GradeQuestionType.ESSAY:
    case GradeQuestionType.FILL_IN_BLANK:
    case GradeQuestionType.MEDIA:
      if (options.length > 0) {
        throwInvalidOption(type, `${type} questions do not accept options`);
      }
      return [];

    case GradeQuestionType.MATCHING:
      if (options.length === 0 && !hasUsableMetadata(params.metadata)) {
        throw new ValidationDomainException(
          'MATCHING questions require metadata when options are not provided',
          { field: 'metadata', type },
        );
      }
      return options;
  }
}

export function assertNoDuplicateQuestionIds(questionIds: string[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const questionId of questionIds) {
    if (seen.has(questionId)) {
      duplicates.add(questionId);
      continue;
    }
    seen.add(questionId);
  }

  if (duplicates.size > 0) {
    throw new ValidationDomainException(
      'Duplicate question ids are not allowed',
      {
        field: 'questionIds',
        duplicateQuestionIds: [...duplicates],
      },
    );
  }
}

export function assertReorderIncludesExactlyActiveQuestions(params: {
  requestedQuestionIds: string[];
  activeQuestionIds: string[];
}): void {
  const requested = new Set(params.requestedQuestionIds);
  const active = new Set(params.activeQuestionIds);
  const missing = params.activeQuestionIds.filter((id) => !requested.has(id));
  const foreign = params.requestedQuestionIds.filter((id) => !active.has(id));

  if (
    requested.size !== active.size ||
    missing.length > 0 ||
    foreign.length > 0
  ) {
    throw new ValidationDomainException(
      'Reorder request must include exactly all active question ids',
      {
        field: 'questionIds',
        missingQuestionIds: missing,
        foreignQuestionIds: foreign,
      },
    );
  }
}

export function calculateTotalQuestionPoints(
  questions: Array<{ points: unknown }>,
): number {
  return questions.reduce((total, question) => {
    return (
      total +
      (toGradeNumber(question.points as Parameters<typeof toGradeNumber>[0]) ??
        0)
    );
  }, 0);
}

export function buildQuestionOptionsPayload(
  options: QuestionOptionCommandLike[],
): NormalizedQuestionOptionPayload[] {
  const normalized = options.map((option, index) => {
    const label = requireText(option.label ?? option.textEn, 'options.label');
    return {
      label,
      labelAr: normalizeNullableText(option.labelAr ?? option.textAr),
      value: normalizeNullableText(option.value) ?? label,
      isCorrect: option.isCorrect === true,
      sortOrder: validateSortOrder(
        option.sortOrder ?? option.order ?? index + 1,
      ),
      metadata: option.metadata ?? null,
    };
  });

  assertNoDuplicateSortOrders(
    normalized.map((option) => option.sortOrder),
    'options.sortOrder',
  );

  return normalized.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function assertNoDuplicateBulkQuestionPointIds(
  items: Array<{ questionId: string }>,
): void {
  assertNoDuplicateQuestionIds(items.map((item) => item.questionId));
}

export function pointsMatchMaxScore(params: {
  totalPoints: number;
  maxScore: unknown;
}): boolean {
  const maxScore =
    toGradeNumber(params.maxScore as Parameters<typeof toGradeNumber>[0]) ?? 0;
  return Math.abs(params.totalPoints - maxScore) < 0.005;
}

export function hasOwn<T extends object>(object: T, key: keyof T): boolean {
  return (
    Object.prototype.hasOwnProperty.call(object, key) &&
    object[key] !== undefined
  );
}

export function normalizeNullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function requireText(value: unknown, field: string): string {
  const normalized = normalizeNullableText(value);
  if (!normalized) {
    throw new ValidationDomainException(`${field} is required`, { field });
  }

  return normalized;
}

function validateSortOrder(value: unknown): number {
  const sortOrder = Number(value);
  if (
    !Number.isInteger(sortOrder) ||
    !Number.isFinite(sortOrder) ||
    sortOrder < 1
  ) {
    throw new ValidationDomainException(
      'Sort order must be a positive integer',
      {
        field: 'sortOrder',
        value,
      },
    );
  }

  return sortOrder;
}

function assertNoDuplicateSortOrders(values: number[], field: string): void {
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }

  if (duplicates.size > 0) {
    throw new ValidationDomainException(
      'Duplicate sort orders are not allowed',
      {
        field,
        duplicateSortOrders: [...duplicates],
      },
    );
  }
}

function assertOptionCountAtLeast(
  type: GradeQuestionType,
  options: NormalizedQuestionOptionPayload[],
  minimum: number,
): void {
  if (options.length < minimum) {
    throwInvalidOption(type, `${type} requires at least ${minimum} options`);
  }
}

function throwInvalidOption(type: GradeQuestionType, reason: string): never {
  throw new GradeAnswerInvalidOptionException({ type, reason });
}

function buildTrueFalseOptionsFromAnswerKey(
  answerKey: unknown,
): NormalizedQuestionOptionPayload[] {
  const answer = extractBooleanAnswer(answerKey);
  if (answer === null) {
    return [];
  }

  return [
    {
      label: 'True',
      labelAr: null,
      value: 'true',
      isCorrect: answer === true,
      sortOrder: 1,
      metadata: null,
    },
    {
      label: 'False',
      labelAr: null,
      value: 'false',
      isCorrect: answer === false,
      sortOrder: 2,
      metadata: null,
    },
  ];
}

function extractBooleanAnswer(answerKey: unknown): boolean | null {
  if (typeof answerKey === 'boolean') return answerKey;
  if (typeof answerKey === 'string') {
    const normalized = answerKey.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  if (answerKey && typeof answerKey === 'object') {
    const record = answerKey as Record<string, unknown>;
    return (
      extractBooleanAnswer(record.value) ??
      extractBooleanAnswer(record.answer) ??
      extractBooleanAnswer(record.correct)
    );
  }

  return null;
}

function hasUsableMetadata(metadata: unknown): boolean {
  if (!metadata) return false;
  if (Array.isArray(metadata)) return metadata.length > 0;
  if (typeof metadata === 'object') return Object.keys(metadata).length > 0;
  return true;
}

function buildQuestionMetadata(command: QuestionCommandLike): unknown {
  const extras: Record<string, unknown> = {};

  if (hasOwn(command, 'matchingPairs'))
    extras.matchingPairs = command.matchingPairs;
  if (hasOwn(command, 'mediaMode')) extras.mediaMode = command.mediaMode;
  if (hasOwn(command, 'mediaTitle')) extras.mediaTitle = command.mediaTitle;
  if (hasOwn(command, 'mediaUrl')) extras.mediaUrl = command.mediaUrl;
  if (hasOwn(command, 'mediaFileName'))
    extras.mediaFileName = command.mediaFileName;
  if (hasOwn(command, 'mediaMimeType'))
    extras.mediaMimeType = command.mediaMimeType;
  if (hasOwn(command, 'mediaSize')) extras.mediaSize = command.mediaSize;
  if (hasOwn(command, 'sampleAnswerAr'))
    extras.sampleAnswerAr = command.sampleAnswerAr;
  if (hasOwn(command, 'sampleAnswerEn'))
    extras.sampleAnswerEn = command.sampleAnswerEn;
  if (hasOwn(command, 'acceptedAnswersAr')) {
    extras.acceptedAnswersAr = command.acceptedAnswersAr;
  }
  if (hasOwn(command, 'acceptedAnswersEn')) {
    extras.acceptedAnswersEn = command.acceptedAnswersEn;
  }

  if (hasOwn(command, 'metadata')) {
    return Object.keys(extras).length > 0
      ? { ...(command.metadata ?? {}), ...extras }
      : (command.metadata ?? null);
  }

  return Object.keys(extras).length > 0 ? extras : undefined;
}
