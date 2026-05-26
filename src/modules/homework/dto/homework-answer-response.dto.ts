export class HomeworkAnswerSelectedOptionResponseDto {
  optionId!: string;
  questionId!: string;
  text!: string;
  isCorrect?: boolean;
  sortOrder!: number;
}

export class HomeworkAnswerPromptSummaryDto {
  questionId!: string;
  type!: string;
  prompt!: string;
  points!: number;
  isRequired!: boolean;
}

export class HomeworkAnswerResponseDto {
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
  createdAt!: string;
  updatedAt!: string;
}

export class HomeworkAnswersListResponseDto {
  items!: HomeworkAnswerResponseDto[];
}

export class HomeworkAnswerDetailResponseDto {
  answer!: HomeworkAnswerResponseDto;
}
