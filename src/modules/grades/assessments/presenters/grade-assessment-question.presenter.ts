import { GradeQuestionType } from '@prisma/client';
import { presentDecimal } from '../../shared/presenters/grades.presenter';
import {
  GradeAssessmentQuestionResponseDto,
  GradeAssessmentQuestionsListResponseDto,
  GradeQuestionOptionResponseDto,
} from '../dto/grade-assessment-question.dto';
import { pointsMatchMaxScore } from '../domain/grade-question-domain';
import {
  GradeAssessmentForQuestionManagementRecord,
  GradeAssessmentQuestionRecord,
} from '../infrastructure/grades-assessment-questions.repository';

type QuestionOptionRecord = GradeAssessmentQuestionRecord['options'][number];

export function presentGradeAssessmentQuestion(
  question: GradeAssessmentQuestionRecord,
): GradeAssessmentQuestionResponseDto {
  return {
    id: question.id,
    assessmentId: question.assessmentId,
    type: presentQuestionType(question.type),
    prompt: question.prompt,
    promptAr: question.promptAr,
    explanation: question.explanation,
    explanationAr: question.explanationAr,
    points: presentDecimal(question.points) ?? 0,
    sortOrder: question.sortOrder,
    required: question.required,
    answerKey: question.answerKey ?? null,
    metadata: question.metadata ?? null,
    options: question.options.map((option) => presentQuestionOption(option)),
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  };
}

export function presentGradeAssessmentQuestions(params: {
  assessment: Pick<
    GradeAssessmentForQuestionManagementRecord,
    'id' | 'maxScore'
  >;
  questions: GradeAssessmentQuestionRecord[];
}): GradeAssessmentQuestionsListResponseDto {
  const totalPoints = params.questions.reduce(
    (sum, question) => sum + (presentDecimal(question.points) ?? 0),
    0,
  );

  return {
    assessmentId: params.assessment.id,
    totalQuestions: params.questions.length,
    totalPoints,
    pointsMatchMaxScore: pointsMatchMaxScore({
      totalPoints,
      maxScore: params.assessment.maxScore,
    }),
    questions: params.questions.map((question) =>
      presentGradeAssessmentQuestion(question),
    ),
  };
}

function presentQuestionOption(
  option: QuestionOptionRecord,
): GradeQuestionOptionResponseDto {
  return {
    id: option.id,
    label: option.label,
    labelAr: option.labelAr,
    value: option.value,
    isCorrect: option.isCorrect,
    sortOrder: option.sortOrder,
    metadata: option.metadata ?? null,
  };
}

function presentQuestionType(type: GradeQuestionType | string): string {
  return String(type).trim().toLowerCase();
}
