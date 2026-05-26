export interface HomeworkAnswerInput {
  questionId: string;
  textAnswer?: string | null;
  selectedOptionIds?: string[] | null;
}

export interface NormalizedHomeworkAnswerInput {
  questionId: string;
  textAnswer: string | null;
  selectedOptionIds: string[] | null;
}
