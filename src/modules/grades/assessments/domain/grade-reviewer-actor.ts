export type GradeReviewerActor =
  | { surface: 'core' }
  | { surface: 'teacher'; classId: string };

export interface GradeReviewAnswerResource {
  assessmentId: string;
  submissionId: string;
  answerId: string;
}
