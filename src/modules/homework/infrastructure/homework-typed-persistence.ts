import { Prisma } from '@prisma/client';
import type {
  HomeworkAnswerMode,
  HomeworkPublicDefinition,
} from '../domain/homework-typed-contract';
import {
  normalizeHomeworkPrivateAnswerKey,
  normalizeHomeworkTypedAnswer,
} from '../domain/homework-typed-foundation';
import { HomeworkTypedContentError } from '../domain/homework-typed-contract';

/** Foundation-only mappings, not wired into operational repositories or DTOs.
 * Clearing is explicit: raw JSON null is never promoted to a valid typed value. */
export type HomeworkTypedWrite =
  | { state: 'clear' }
  | { state: 'value'; value: unknown };

export function homeworkAnswerKeyPersistence(
  definition: HomeworkPublicDefinition,
  write: HomeworkTypedWrite,
): Prisma.InputJsonValue | Prisma.NullTypes.DbNull {
  if (write.state === 'clear') return Prisma.DbNull;
  if (write.state !== 'value') throw new HomeworkTypedContentError('shape');
  const key = normalizeHomeworkPrivateAnswerKey(definition, write.value);
  if (!key) throw new HomeworkTypedContentError('shape');
  if (key.kind === 'fill')
    return {
      keyVersion: 1,
      kind: 'fill',
      blanks: key.blanks.map((blank) => ({
        blankId: blank.blankId,
        acceptedAnswers: [...blank.acceptedAnswers],
      })),
    };
  return {
    keyVersion: 1,
    kind: 'matching',
    pairs: key.pairs.map((pair) => ({
      leftId: pair.leftId,
      rightId: pair.rightId,
    })),
  };
}

export function homeworkAnswerJsonPersistence(
  definition: HomeworkPublicDefinition,
  write: HomeworkTypedWrite,
  mode: HomeworkAnswerMode,
  required: boolean,
): Prisma.InputJsonValue | Prisma.NullTypes.DbNull {
  if (write.state === 'clear') {
    if (definition.kind !== 'media' && mode === 'final' && required)
      throw new HomeworkTypedContentError('completeness');
    return Prisma.DbNull;
  }
  if (write.state !== 'value') throw new HomeworkTypedContentError('shape');
  const answer = normalizeHomeworkTypedAnswer(
    definition,
    write.value,
    mode,
    required,
  );
  if (!answer || answer.type === 'MEDIA')
    throw new HomeworkTypedContentError('shape');
  if (answer.type === 'FILL_IN_BLANK')
    return {
      blanks: answer.answerJson.blanks.map((blank) => ({
        blankId: blank.blankId,
        text: blank.text,
      })),
    };
  return {
    pairs: answer.answerJson.pairs.map((pair) => ({
      leftId: pair.leftId,
      rightId: pair.rightId,
    })),
  };
}
