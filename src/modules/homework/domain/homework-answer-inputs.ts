export interface HomeworkAnswerInput {
  questionId: string;
  textAnswer?: string | null;
  selectedOptionIds?: string[] | null;
  answerJson?: unknown;
  clearAnswer?: boolean;
}

export interface NormalizedHomeworkAnswerInput {
  questionId: string;
  textAnswer: string | null;
  selectedOptionIds: string[] | null;
  answerJson?: unknown;
}
