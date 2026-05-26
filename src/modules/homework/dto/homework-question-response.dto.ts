export class HomeworkQuestionOptionResponseDto {
  optionId!: string;
  questionId!: string;
  text!: string;
  isCorrect?: boolean;
  sortOrder!: number;
  createdAt!: string;
  updatedAt!: string;
}

export class HomeworkQuestionResponseDto {
  questionId!: string;
  homeworkId!: string;
  type!: string;
  prompt!: string;
  instructions!: string | null;
  points!: number;
  sortOrder!: number;
  isRequired!: boolean;
  expectedAnswer?: string | null;
  options!: HomeworkQuestionOptionResponseDto[];
  createdAt!: string;
  updatedAt!: string;
}

export class HomeworkQuestionsListResponseDto {
  items!: HomeworkQuestionResponseDto[];
}

export class HomeworkQuestionDetailResponseDto {
  question!: HomeworkQuestionResponseDto;
}
