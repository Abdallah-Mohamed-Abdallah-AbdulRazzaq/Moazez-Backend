import type { Prisma } from '@prisma/client';
import type { QUESTION_FOR_SUBMISSION_ARGS } from './grades-submissions.repository';

export type GradeReleasedQuestionRecord =
  Prisma.GradeAssessmentQuestionGetPayload<typeof QUESTION_FOR_SUBMISSION_ARGS>;
/** Detailed reviewer fields are selected only after current audience release authorization. */
export const GRADE_RELEASED_ANSWER_SELECT = {
  id: true,
  questionId: true,
  answerText: true,
  answerJson: true,
  awardedPoints: true,
  maxPoints: true,
  reviewerComment: true,
  reviewerCommentAr: true,
  reviewedAt: true,
  selectedOptions: { select: { optionId: true } },
} satisfies Prisma.GradeSubmissionAnswerSelect;
export type GradeReleasedAnswerRecord = Prisma.GradeSubmissionAnswerGetPayload<{
  select: typeof GRADE_RELEASED_ANSWER_SELECT;
}>;
