import { Prisma } from '@prisma/client';
import { HomeworkQuestionInvalidTypePayloadException } from '../domain/homework-question.exceptions';
import {
  HomeworkTypedContentError,
  type HomeworkFoundationType,
  type HomeworkPrivateAnswerKey,
  type HomeworkPublicDefinition,
} from '../domain/homework-typed-contract';
import {
  classifyStoredHomeworkPrivateAnswerKey,
  normalizeHomeworkDefinition,
  normalizeHomeworkPrivateAnswerKey,
} from '../domain/homework-typed-foundation';
import {
  homeworkAnswerKeyPersistence,
  type HomeworkTypedWrite,
} from '../infrastructure/homework-typed-persistence';

export function isHomeworkTypedType(
  value: unknown,
): value is HomeworkFoundationType {
  return (
    value === 'FILL_IN_BLANK' ||
    value === 'MATCHING' ||
    value === 'MEDIA' ||
    value === 'ORDERING' ||
    value === 'NUMERIC' ||
    value === 'MATH_EXPRESSION'
  );
}

export function homeworkTypedQuestionValidation<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (!(error instanceof HomeworkTypedContentError)) throw error;
    throw new HomeworkQuestionInvalidTypePayloadException({
      reason: error.reason,
    });
  }
}

/** Do not accept JSON null as a clear or allow extra fields around a tagged write. */
export function normalizeHomeworkTypedWrite(
  input: unknown,
): HomeworkTypedWrite {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new HomeworkTypedContentError('shape');
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null)
    throw new HomeworkTypedContentError('shape');
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(input),
  ))
    if (!Object.hasOwn(descriptor, 'value'))
      throw new HomeworkTypedContentError('shape');
  const value = input as Record<string, unknown>;
  if (value.state === 'clear' && Object.keys(value).length === 1)
    return { state: 'clear' };
  if (
    value.state === 'value' &&
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, 'value')
  )
    return { state: 'value', value: value.value };
  throw new HomeworkTypedContentError('shape');
}

export function normalizeHomeworkTypedQuestionMutation(input: {
  type: HomeworkFoundationType;
  metadata: unknown;
  expectedAnswer: unknown;
  optionCount: number;
  keyWrite?: unknown;
  currentKey?: { value: unknown; sqlNull: boolean };
}): {
  definition: HomeworkPublicDefinition;
  metadata: Prisma.InputJsonValue;
  answerKey: Prisma.InputJsonValue | Prisma.NullTypes.DbNull;
} {
  return homeworkTypedQuestionValidation(() => {
    if (
      input.optionCount !== 0 ||
      (input.expectedAnswer !== null && input.expectedAnswer !== undefined)
    )
      throw new HomeworkTypedContentError('association');
    const definition = normalizeHomeworkDefinition(
      input.type,
      input.metadata,
      'draft',
    );
    let write: HomeworkTypedWrite;
    if (input.keyWrite !== undefined)
      write = normalizeHomeworkTypedWrite(input.keyWrite);
    else if (input.currentKey) {
      const key = classifyStoredHomeworkPrivateAnswerKey(
        definition,
        input.currentKey.value,
        input.currentKey.sqlNull,
      );
      if (key.state === 'invalid')
        throw new HomeworkTypedContentError('association');
      write =
        key.state === 'absent'
          ? { state: 'clear' }
          : { state: 'value', value: key.value };
    } else write = { state: 'clear' };
    return {
      definition,
      metadata: definition as unknown as Prisma.InputJsonValue,
      answerKey: homeworkAnswerKeyPersistence(definition, write),
    };
  });
}

/** Already audience-authorized values only. Never placed in shared Prisma selects. */
const authorKeys = new WeakMap<object, HomeworkPrivateAnswerKey | null>();
const mediaSources = new WeakMap<object, boolean>();

/** Only pass asset IDs reconstructed by the existing live resource-authorized ST06 reader. */
export function authorizeHomeworkMediaProjection(
  question: { type: unknown; metadata?: unknown },
  assetIds: ReadonlySet<string>,
): void {
  if (question.type !== 'MEDIA') return;
  const definition = homeworkTypedQuestionValidation(() =>
    normalizeHomeworkDefinition('MEDIA', question.metadata, 'draft'),
  );
  mediaSources.set(
    question,
    definition.kind === 'media' &&
      !!definition.source &&
      assetIds.has(definition.source.assetId),
  );
}
export function attachHomeworkAuthorKey(
  question: object,
  definition: HomeworkPublicDefinition,
  value: unknown,
  sqlNull: boolean,
): void {
  const classified = classifyStoredHomeworkPrivateAnswerKey(
    definition,
    value,
    sqlNull,
  );
  if (classified.state === 'invalid') return;
  authorKeys.set(
    question,
    classified.state === 'valid'
      ? normalizeHomeworkPrivateAnswerKey(definition, classified.value)
      : null,
  );
}
export function presentHomeworkAuthorKey(question: object): {
  answerKey?: HomeworkPrivateAnswerKey | null;
} {
  return authorKeys.has(question)
    ? { answerKey: authorKeys.get(question) }
    : {};
}

/** A new-type definition is mandatory; SQL NULL and JSON null both fail closed. */
export function presentHomeworkTypedDefinition(question: {
  type: unknown;
  metadata?: unknown;
}): { metadata?: HomeworkPublicDefinition } {
  if (!isHomeworkTypedType(question.type)) return {};
  return homeworkTypedQuestionValidation(() => {
    const metadata = normalizeHomeworkDefinition(
      question.type as HomeworkFoundationType,
      question.metadata,
      'draft',
    );
    return metadata.kind === 'media' &&
      metadata.source &&
      mediaSources.get(question) !== true
      ? {}
      : { metadata };
  });
}
