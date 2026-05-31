export interface HomeworkAnswerReviewInput {
  awardedPoints?: number | null;
  teacherComment?: string | null;
}

export interface BulkHomeworkAnswerReviewInput extends HomeworkAnswerReviewInput {
  answerId: string;
}

export interface NormalizedHomeworkAnswerReviewInput {
  answerId: string;
  awardedPoints: number | null;
  teacherComment: string | null;
}
