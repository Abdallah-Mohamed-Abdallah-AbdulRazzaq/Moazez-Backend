import { HomeworkQuestionType } from '@prisma/client';
import { assertHomeworkRuntimeQuestionType } from './homework-runtime-types';
import { HomeworkAssignmentInvalidQuestionStructureException } from './homework-question.exceptions';
import {
  HomeworkAssignmentAlreadyClosedException,
  HomeworkAssignmentAlreadyPublishedException,
  HomeworkAssignmentCancelledException,
  HomeworkAssignmentDueDateInvalidException,
  HomeworkAssignmentNotPublishableException,
} from './homework.exceptions';

export function assertHomeworkPublicationState(assignment: {
  status: string;
  dueAt: Date;
  publishAt: Date | null;
}): void {
  switch (assignment.status) {
    case 'DRAFT':
      break;
    case 'PUBLISHED':
      throw new HomeworkAssignmentAlreadyPublishedException();
    case 'CLOSED':
      throw new HomeworkAssignmentAlreadyClosedException();
    case 'CANCELLED':
      throw new HomeworkAssignmentCancelledException();
    default:
      throw new HomeworkAssignmentNotPublishableException();
  }
  if (
    assignment.dueAt.getTime() <= Date.now() ||
    (assignment.publishAt && assignment.dueAt <= assignment.publishAt)
  )
    throw new HomeworkAssignmentDueDateInvalidException();
}

export function validateHomeworkPublicationStructures(
  questions: ReadonlyArray<{
    id: string;
    type: HomeworkQuestionType;
    prompt: string;
    options: ReadonlyArray<{ isCorrect: boolean }>;
  }>,
): void {
  for (const question of questions) {
    assertHomeworkRuntimeQuestionType(question.type);
    if (!question.prompt.trim())
      throw new HomeworkAssignmentInvalidQuestionStructureException({
        reason: 'prompt_required',
      });
    const { options } = question;
    const correct = options.filter((option) => option.isCorrect).length;
    const invalid =
      question.type === 'SINGLE_CHOICE'
        ? options.length < 2 || correct !== 1
        : question.type === 'MULTIPLE_CHOICE'
          ? options.length < 2 || correct < 1
          : question.type === 'TRUE_FALSE'
            ? options.length !== 2 || correct !== 1
            : options.length !== 0;
    if (invalid)
      throw new HomeworkAssignmentInvalidQuestionStructureException({
        reason: 'invalid_options',
      });
  }
}
