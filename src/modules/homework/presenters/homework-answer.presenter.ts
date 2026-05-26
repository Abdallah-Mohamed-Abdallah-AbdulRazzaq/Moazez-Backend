import { Prisma } from '@prisma/client';
import {
  HomeworkAnswerDetailResponseDto,
  HomeworkAnswerResponseDto,
  HomeworkAnswersListResponseDto,
} from '../dto/homework-answer-response.dto';

interface HomeworkAnswerQuestionOptionPresenterModel {
  id: string;
  homeworkQuestionId: string;
  text: string;
  isCorrect: boolean;
  sortOrder: number;
}

export interface HomeworkAnswerPresenterModel {
  id: string;
  homeworkSubmissionId: string;
  homeworkAssignmentId: string;
  homeworkQuestionId: string;
  textAnswer: string | null;
  selectedOptionIds: Prisma.JsonValue | null;
  isDraft: boolean;
  teacherComment: string | null;
  awardedPoints: Prisma.Decimal | number | string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  homeworkQuestion: {
    id: string;
    type: string;
    prompt: string;
    points: Prisma.Decimal | number | string;
    isRequired: boolean;
    options: HomeworkAnswerQuestionOptionPresenterModel[];
  };
}

export function presentHomeworkAnswerStudent(
  answer: HomeworkAnswerPresenterModel,
): HomeworkAnswerResponseDto {
  return presentHomeworkAnswer(answer, {
    includePrompt: false,
    includeCorrectOptions: false,
    includeReviewFields: false,
  });
}

export function presentHomeworkAnswerParent(
  answer: HomeworkAnswerPresenterModel,
): HomeworkAnswerResponseDto {
  return presentHomeworkAnswerStudent(answer);
}

export function presentHomeworkAnswerTeacher(
  answer: HomeworkAnswerPresenterModel,
): HomeworkAnswerResponseDto {
  return presentHomeworkAnswer(answer, {
    includePrompt: true,
    includeCorrectOptions: true,
    includeReviewFields: true,
  });
}

export function presentHomeworkAnswersStudent(
  answers: HomeworkAnswerPresenterModel[],
): HomeworkAnswersListResponseDto {
  return {
    items: answers.map((answer) => presentHomeworkAnswerStudent(answer)),
  };
}

export function presentHomeworkAnswersParent(
  answers: HomeworkAnswerPresenterModel[],
): HomeworkAnswersListResponseDto {
  return {
    items: answers.map((answer) => presentHomeworkAnswerParent(answer)),
  };
}

export function presentHomeworkAnswersTeacher(
  answers: HomeworkAnswerPresenterModel[],
): HomeworkAnswersListResponseDto {
  return {
    items: answers.map((answer) => presentHomeworkAnswerTeacher(answer)),
  };
}

export function presentHomeworkAnswerDetailTeacher(
  answer: HomeworkAnswerPresenterModel,
): HomeworkAnswerDetailResponseDto {
  return { answer: presentHomeworkAnswerTeacher(answer) };
}

function presentHomeworkAnswer(
  answer: HomeworkAnswerPresenterModel,
  options: {
    includePrompt: boolean;
    includeCorrectOptions: boolean;
    includeReviewFields: boolean;
  },
): HomeworkAnswerResponseDto {
  const selectedOptionIds = toStringArray(answer.selectedOptionIds);
  const selectedOptionSet = new Set(selectedOptionIds);
  const selectedOptions = answer.homeworkQuestion.options
    .filter((option) => selectedOptionSet.has(option.id))
    .map((option) => ({
      optionId: option.id,
      questionId: option.homeworkQuestionId,
      text: option.text,
      ...(options.includeCorrectOptions ? { isCorrect: option.isCorrect } : {}),
      sortOrder: option.sortOrder,
    }));

  return {
    answerId: answer.id,
    homeworkId: answer.homeworkAssignmentId,
    submissionId: answer.homeworkSubmissionId,
    questionId: answer.homeworkQuestionId,
    type: answer.homeworkQuestion.type.toLowerCase(),
    ...(options.includePrompt
      ? {
          prompt: {
            questionId: answer.homeworkQuestion.id,
            type: answer.homeworkQuestion.type.toLowerCase(),
            prompt: answer.homeworkQuestion.prompt,
            points: presentDecimal(answer.homeworkQuestion.points) ?? 0,
            isRequired: answer.homeworkQuestion.isRequired,
          },
        }
      : {}),
    textAnswer: answer.textAnswer ?? null,
    selectedOptionIds,
    selectedOptions,
    isDraft: answer.isDraft,
    ...(options.includeReviewFields
      ? {
          teacherComment: answer.teacherComment ?? null,
          awardedPoints: presentDecimal(answer.awardedPoints),
          reviewedAt: answer.reviewedAt
            ? answer.reviewedAt.toISOString()
            : null,
        }
      : {}),
    createdAt: answer.createdAt.toISOString(),
    updatedAt: answer.updatedAt.toISOString(),
  };
}

function toStringArray(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function presentDecimal(
  value: Prisma.Decimal | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'toNumber' in value) {
    return value.toNumber();
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
