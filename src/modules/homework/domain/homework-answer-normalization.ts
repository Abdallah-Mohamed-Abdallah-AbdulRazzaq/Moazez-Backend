import { HomeworkQuestionType } from '@prisma/client';
import type {
  HomeworkAnswerInput,
  NormalizedHomeworkAnswerInput,
} from './homework-answer-inputs';
import { assertHomeworkRuntimeQuestionType } from './homework-runtime-types';
import { HomeworkTypedContentError } from './homework-typed-contract';
import {
  classifyStoredHomeworkTypedAnswer,
  normalizeHomeworkDefinition,
  normalizeHomeworkTypedAnswer,
} from './homework-typed-foundation';
import {
  HomeworkAnswerInvalidOptionException,
  HomeworkAnswerInvalidPayloadException,
  HomeworkAnswerMissingRequiredException,
} from './homework-answer.exceptions';

export interface HomeworkAnswerQuestion {
  id: string;
  type: HomeworkQuestionType;
  isRequired: boolean;
  metadata?: unknown;
  options: ReadonlyArray<{ id: string }>;
}
export interface HomeworkStoredAnswer {
  textAnswer: string | null;
  selectedOptionIds: unknown;
  answerJson: unknown;
  answerJsonSqlNull: boolean;
}

export function homeworkSelectedOptionIds(
  value: string[] | null | undefined,
): string[] | null {
  if (!value || value.length === 0) return null;
  const normalized = value
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (!normalized.length) return null;
  if (new Set(normalized).size !== normalized.length)
    throw new HomeworkAnswerInvalidPayloadException({
      reason: 'duplicate_selected_options',
    });
  return normalized;
}

export function normalizeAnswerForQuestion(input: {
  question: HomeworkAnswerQuestion;
  input: HomeworkAnswerInput;
  final: boolean;
  existing?: HomeworkStoredAnswer;
}): NormalizedHomeworkAnswerInput {
  const { question, existing } = input;
  const command = input.input;
  assertHomeworkRuntimeQuestionType(question.type);
  const invalid = (reason: string): never => {
    throw new HomeworkAnswerInvalidPayloadException({ reason });
  };
  const missing = (): never => {
    throw new HomeworkAnswerMissingRequiredException({
      questionId: question.id,
    });
  };
  const typed =
    question.type === 'FILL_IN_BLANK' ||
    question.type === 'MATCHING' ||
    question.type === 'MEDIA';
  if (!typed && command.answerJson !== undefined)
    return invalid('typed_answer_for_legacy_question');
  if (
    command.clearAnswer &&
    (command.textAnswer !== undefined ||
      command.selectedOptionIds !== undefined ||
      command.answerJson !== undefined)
  )
    return invalid('clear_conflicts_with_value');
  if (typed) {
    try {
      const definition = normalizeHomeworkDefinition(
        question.type as 'FILL_IN_BLANK' | 'MATCHING' | 'MEDIA',
        question.metadata,
        'complete',
      );
      if (
        existing &&
        (input.final ||
          (command.answerJson === undefined &&
            command.textAnswer === undefined &&
            !command.clearAnswer)) &&
        ((existing.selectedOptionIds !== null &&
          (!Array.isArray(existing.selectedOptionIds) ||
            existing.selectedOptionIds.length)) ||
          (definition.kind !== 'media' && existing.textAnswer !== null))
      )
        return invalid('invalid_stored_answer');
      const selected = homeworkSelectedOptionIds(command.selectedOptionIds);
      if (selected) return invalid('typed_question_selected_options_forbidden');
      if (
        definition.kind !== 'media' &&
        command.textAnswer != null &&
        command.textAnswer.trim()
      )
        return invalid('structured_question_text_forbidden');
      if (definition.kind === 'media' && command.answerJson !== undefined)
        return invalid('media_structured_answer_forbidden');
      let value: unknown;
      if (command.clearAnswer) value = undefined;
      else if (definition.kind === 'media') {
        if (
          existing &&
          (!existing.answerJsonSqlNull || existing.answerJson !== null)
        )
          return invalid('invalid_stored_answer');
        const text =
          command.textAnswer === undefined
            ? existing?.textAnswer
            : command.textAnswer;
        value = text == null || !text.trim() ? undefined : { textAnswer: text };
      } else if (command.answerJson !== undefined) value = command.answerJson;
      else if (existing) {
        const stored = classifyStoredHomeworkTypedAnswer(
          definition,
          existing.answerJson,
          existing.answerJsonSqlNull,
          input.final ? 'final' : 'draft',
        );
        if (stored.state === 'invalid') return invalid('invalid_stored_answer');
        value = stored.state === 'valid' ? stored.value.answerJson : undefined;
      }
      const answer = normalizeHomeworkTypedAnswer(
        definition,
        value,
        input.final ? 'final' : 'draft',
        question.isRequired,
      );
      return {
        questionId: question.id,
        textAnswer: answer?.textAnswer ?? null,
        selectedOptionIds: null,
        answerJson: answer?.answerJson ?? null,
      };
    } catch (error) {
      if (!(error instanceof HomeworkTypedContentError)) throw error;
      if (error.reason === 'completeness' && input.final && question.isRequired)
        return missing();
      return invalid(error.reason);
    }
  }
  const text = command.clearAnswer ? null : command.textAnswer?.trim() || null;
  const selected = command.clearAnswer
    ? null
    : homeworkSelectedOptionIds(command.selectedOptionIds);
  if (text && selected) return invalid('mixed_text_and_options');
  if (question.type === 'SHORT_TEXT' || question.type === 'LONG_TEXT') {
    if (selected)
      throw new HomeworkAnswerInvalidPayloadException({
        questionId: question.id,
        type: question.type,
        reason: 'text_question_selected_options_forbidden',
      });
    if (input.final && question.isRequired && !text) return missing();
    return {
      questionId: question.id,
      textAnswer: text,
      selectedOptionIds: null,
    };
  }
  if (text)
    throw new HomeworkAnswerInvalidPayloadException({
      questionId: question.id,
      type: question.type,
      reason: 'choice_question_text_forbidden',
    });
  if (!selected) {
    if (input.final && question.isRequired) return missing();
    return {
      questionId: question.id,
      textAnswer: null,
      selectedOptionIds: null,
    };
  }
  const foreign = selected.find(
    (id) => !question.options.some((option) => option.id === id),
  );
  if (foreign)
    throw new HomeworkAnswerInvalidOptionException({
      questionId: question.id,
      optionId: foreign,
    });
  if (
    (question.type === 'SINGLE_CHOICE' || question.type === 'TRUE_FALSE') &&
    selected.length !== 1
  )
    throw new HomeworkAnswerInvalidPayloadException({
      questionId: question.id,
      type: question.type,
      reason: 'exactly_one_option_required',
    });
  if (
    question.type !== 'SINGLE_CHOICE' &&
    question.type !== 'TRUE_FALSE' &&
    question.type !== 'MULTIPLE_CHOICE'
  )
    return invalid('unsupported_question_type');
  return {
    questionId: question.id,
    textAnswer: null,
    selectedOptionIds: selected,
  };
}
