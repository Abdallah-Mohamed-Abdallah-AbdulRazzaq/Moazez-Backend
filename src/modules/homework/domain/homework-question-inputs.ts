import { HomeworkQuestionType, Prisma } from '@prisma/client';

export interface HomeworkQuestionOptionInput {
  text: string;
  isCorrect?: boolean;
  sortOrder?: number;
  metadata?: Prisma.InputJsonValue | null;
}

export interface CreateHomeworkQuestionInput {
  type: HomeworkQuestionType;
  prompt: string;
  instructions?: string | null;
  points?: number | null;
  sortOrder?: number | null;
  isRequired?: boolean;
  expectedAnswer?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  options?: HomeworkQuestionOptionInput[];
}

export interface UpdateHomeworkQuestionInput {
  type?: HomeworkQuestionType;
  prompt?: string;
  instructions?: string | null;
  points?: number | null;
  isRequired?: boolean;
  expectedAnswer?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export interface ReorderHomeworkQuestionInput {
  sortOrder: number;
}

export interface UpdateHomeworkQuestionOptionInput {
  text?: string;
  isCorrect?: boolean;
  metadata?: Prisma.InputJsonValue | null;
}

export interface ReorderHomeworkQuestionOptionInput {
  sortOrder: number;
}
