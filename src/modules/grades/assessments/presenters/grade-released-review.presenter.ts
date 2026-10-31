import type {
  GradeReleasedAnswerRecord,
  GradeReleasedQuestionRecord,
} from '../infrastructure/grade-review-read.select';
import type { GradeReleasedReviewQuestionDto } from '../dto/grade-review.dto';
import { gradeAnswerNullFact } from '../infrastructure/grade-typed-answer.projection';
import { presentGradeRichContent } from '../infrastructure/grade-rich-content.projection';
import {
  presentGradeOptionValue,
  presentGradeQuestionContract,
  presentSafeGradeAnswer,
} from '../../shared/presenters/grade-question-contract';
import { sanitizeGradeQuestionContent } from '../domain/grade-question-content-policy';

const safeText = (value: string | null): string | null =>
  sanitizeGradeQuestionContent(value) as string | null;
/** Closed audience-authorized projection. Raw JSON/Prisma relations never reach clients. */
export function presentReleasedGradeReviewQuestion(
  question: GradeReleasedQuestionRecord,
  answer: GradeReleasedAnswerRecord | undefined,
  key: Pick<
    GradeReleasedReviewQuestionDto,
    'correctAnswerAvailable' | 'correctAnswer' | 'explanation' | 'explanationAr'
  >,
): GradeReleasedReviewQuestionDto {
  return {
    id: question.id,
    ...presentGradeQuestionContract(question.type, question),
    prompt: safeText(question.prompt) ?? '',
    promptAr: safeText(question.promptAr),
    points: question.points.toNumber(),
    required: question.required,
    ...presentGradeRichContent(question),
    options: question.options.map((option) => ({
      id: option.id,
      label: safeText(option.label) ?? '',
      labelAr: safeText(option.labelAr),
      value: presentGradeOptionValue(question.type, option.value),
      ...presentGradeRichContent(option),
    })),
    answer: answer
      ? {
          id: answer.id,
          ...presentSafeGradeAnswer(question, {
            answerText: answer.answerText,
            answerJson: answer.answerJson,
            selectedOptionIds: answer.selectedOptions.map(
              (option) => option.optionId,
            ),
            answerJsonSqlNull: gradeAnswerNullFact(answer),
          }),
          selectedOptionIds: answer.selectedOptions.map(
            (option) => option.optionId,
          ),
          awardedPoints: answer.awardedPoints?.toNumber() ?? null,
          maxPoints: answer.maxPoints?.toNumber() ?? null,
          reviewerComment: safeText(answer.reviewerComment),
          reviewerCommentAr: safeText(answer.reviewerCommentAr),
          reviewedAt: answer.reviewedAt?.toISOString() ?? null,
        }
      : null,
    ...key,
  };
}
