import { Prisma } from '@prisma/client';
import {
  HomeworkQuestionDetailResponseDto,
  HomeworkQuestionResponseDto,
  HomeworkQuestionsListResponseDto,
} from '../dto/homework-question-response.dto';

interface HomeworkQuestionOptionPresenterModel {
  id: string;
  homeworkQuestionId: string;
  text: string;
  isCorrect: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface HomeworkQuestionPresenterModel {
  id: string;
  homeworkAssignmentId: string;
  type: string;
  prompt: string;
  instructions: string | null;
  points: Prisma.Decimal | number | string;
  sortOrder: number;
  isRequired: boolean;
  expectedAnswer: string | null;
  options: HomeworkQuestionOptionPresenterModel[];
  createdAt: Date;
  updatedAt: Date;
}

export function presentHomeworkQuestionAdmin(
  question: HomeworkQuestionPresenterModel,
): HomeworkQuestionResponseDto {
  return presentHomeworkQuestion(question, { includeAnswers: true });
}

export function presentHomeworkQuestionSafe(
  question: HomeworkQuestionPresenterModel,
): HomeworkQuestionResponseDto {
  return presentHomeworkQuestion(question, { includeAnswers: false });
}

export function presentHomeworkQuestionsAdmin(
  questions: HomeworkQuestionPresenterModel[],
): HomeworkQuestionsListResponseDto {
  return {
    items: questions.map((question) => presentHomeworkQuestionAdmin(question)),
  };
}

export function presentHomeworkQuestionsSafe(
  questions: HomeworkQuestionPresenterModel[],
): HomeworkQuestionsListResponseDto {
  return {
    items: questions.map((question) => presentHomeworkQuestionSafe(question)),
  };
}

export function presentHomeworkQuestionDetailAdmin(
  question: HomeworkQuestionPresenterModel,
): HomeworkQuestionDetailResponseDto {
  return { question: presentHomeworkQuestionAdmin(question) };
}

function presentHomeworkQuestion(
  question: HomeworkQuestionPresenterModel,
  options: { includeAnswers: boolean },
): HomeworkQuestionResponseDto {
  const response: HomeworkQuestionResponseDto = {
    questionId: question.id,
    homeworkId: question.homeworkAssignmentId,
    type: question.type.toLowerCase(),
    prompt: question.prompt,
    instructions: question.instructions ?? null,
    points: presentDecimal(question.points),
    sortOrder: question.sortOrder,
    isRequired: question.isRequired,
    options: question.options.map((option) => ({
      optionId: option.id,
      questionId: option.homeworkQuestionId,
      text: option.text,
      ...(options.includeAnswers ? { isCorrect: option.isCorrect } : {}),
      sortOrder: option.sortOrder,
      createdAt: option.createdAt.toISOString(),
      updatedAt: option.updatedAt.toISOString(),
    })),
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  };

  if (options.includeAnswers) {
    response.expectedAnswer = question.expectedAnswer ?? null;
  }

  return response;
}

function presentDecimal(value: Prisma.Decimal | number | string): number {
  if (typeof value === 'object' && 'toNumber' in value) {
    return value.toNumber();
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
