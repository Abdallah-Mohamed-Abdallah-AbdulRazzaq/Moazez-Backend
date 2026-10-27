import { presentGradeRichContent } from '../infrastructure/grade-rich-content.projection';
import { sanitizeGradeQuestionContent } from '../domain/grade-question-content-policy';
import { presentGradeQuestionContract } from '../../shared/presenters/grade-question-contract';
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
  authoring = false,
): GradeAssessmentQuestionResponseDto {
  return {
    ...presentGradeRichContent(question),
    id: question.id,
    assessmentId: question.assessmentId,
    type: presentQuestionType(question.type),
    canonicalType: presentGradeQuestionContract(question.type, question)
      .canonicalType,
    interaction: presentGradeQuestionContract(question.type, question)
      .interaction,
    prompt:
      (sanitizeGradeQuestionContent(question.prompt) as string | null) ?? '',
    promptAr: sanitizeGradeQuestionContent(question.promptAr) as string | null,
    explanation: authoring
      ? (sanitizeGradeQuestionContent(question.explanation) as string | null)
      : null,
    explanationAr: authoring
      ? (sanitizeGradeQuestionContent(question.explanationAr) as string | null)
      : null,
    points: presentDecimal(question.points) ?? 0,
    sortOrder: question.sortOrder,
    required: question.required,
    ...(authoring
      ? { answerKey: sanitizeGradeQuestionContent(question.answerKey) }
      : {}),
    metadata: authoring
      ? sanitizeGradeQuestionContent(question.metadata)
      : presentReviewMetadata(question.metadata),
    options: (authoring ||
    presentGradeQuestionContract(question.type).interaction.kind === 'choice'
      ? question.options
      : []
    ).map((option) => presentQuestionOption(option, authoring)),
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
  authoring?: boolean;
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
      presentGradeAssessmentQuestion(question, params.authoring ?? false),
    ),
  };
}

function presentQuestionOption(
  option: QuestionOptionRecord,
  authoring: boolean,
): GradeQuestionOptionResponseDto {
  return {
    ...presentGradeRichContent(option),
    id: option.id,
    label: (sanitizeGradeQuestionContent(option.label) as string | null) ?? '',
    labelAr: sanitizeGradeQuestionContent(option.labelAr) as string | null,
    value: sanitizeGradeQuestionContent(option.value) as string | null,
    ...(authoring ? { isCorrect: option.isCorrect } : {}),
    sortOrder: option.sortOrder,
    metadata: authoring ? sanitizeGradeQuestionContent(option.metadata) : null,
  };
}

function presentQuestionType(type: GradeQuestionType | string): string {
  return String(type).trim().toLowerCase();
}

function presentReviewMetadata(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return null;
  const allowed = new Set([
    'mediaMode',
    'mediaTitle',
    'mediaUrl',
    'mediaFileName',
    'mediaMimeType',
    'mediaSize',
  ]);
  const projection = Object.fromEntries(
    Object.entries(metadata).filter(
      ([key, value]) =>
        allowed.has(key) &&
        (value === null ||
          typeof value === 'string' ||
          typeof value === 'number'),
    ),
  );
  return Object.keys(projection).length
    ? sanitizeGradeQuestionContent(projection, true)
    : null;
}
