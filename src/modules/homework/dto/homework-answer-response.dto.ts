import type {
  RichQuestionContent,
  RichOptionContent,
} from '../../../common/rich-content/rich-content.types';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class HomeworkAnswerSelectedOptionResponseDto {
  @ApiPropertyOptional({
    type: Object,
    description:
      'Authorized V1 selected-option display; omitted for Parent consumers.',
  })
  richContent?: RichOptionContent;
  optionId!: string;
  questionId!: string;
  text!: string;
  isCorrect?: boolean;
  sortOrder!: number;
}

export class HomeworkAnswerPromptSummaryDto {
  metadata?: import('../domain/homework-typed-contract').HomeworkPublicDefinition;
  @ApiPropertyOptional({
    type: Object,
    description:
      'Authorized V1 question display in the existing Teacher review prompt.',
  })
  richContent?: RichQuestionContent;
  questionId!: string;
  type!: string;
  prompt!: string;
  points!: number;
  isRequired!: boolean;
}

export class HomeworkAnswerReviewedByDto {
  userId!: string;
  fullName!: string;
}

export class HomeworkAnswerResponseDto {
  answerJson?: unknown;
  answerId!: string;
  homeworkId!: string;
  submissionId!: string;
  questionId!: string;
  type!: string;
  prompt?: HomeworkAnswerPromptSummaryDto;
  textAnswer!: string | null;
  selectedOptionIds!: string[];
  selectedOptions!: HomeworkAnswerSelectedOptionResponseDto[];
  isDraft!: boolean;
  teacherComment?: string | null;
  awardedPoints?: number | null;
  reviewedAt?: string | null;
  reviewedBy?: HomeworkAnswerReviewedByDto | null;
  createdAt!: string;
  updatedAt!: string;
}

export class HomeworkAnswersListResponseDto {
  items!: HomeworkAnswerResponseDto[];
}

export class HomeworkAnswerDetailResponseDto {
  answer!: HomeworkAnswerResponseDto;
}
