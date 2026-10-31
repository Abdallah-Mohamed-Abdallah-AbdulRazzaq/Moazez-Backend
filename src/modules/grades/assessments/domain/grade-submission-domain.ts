import { gradeResponseConfig } from './grade-response-config';
import { assertResponseModalities } from '../../../../common/assessment-answer/response-config';
import { HttpStatus } from '@nestjs/common';
import {
  GradeAnswerCorrectionStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeQuestionType,
  GradeScopeType,
  GradeSubmissionStatus,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  GradeTermWritableLike,
  assertTermWritable,
  isAssessmentLocked,
  normalizeAssessmentApprovalStatus,
  normalizeDeliveryMode,
} from '../../shared/domain/grade-workflow';
import { GradeAssessmentLockedException } from './grade-assessment-domain';
import { GradebookNoEnrollmentException } from './grade-item-entry-domain';
import { isGradeEvaluationType } from './grade-question-evaluation';
import {
  normalizeTypedGradeAnswer,
  normalizeStoredGradeAnswer,
  type GradeInteractionQuestion,
} from './grade-question-interaction';

export interface SubmissionAssessmentLike {
  id: string;
  academicYearId: string;
  termId: string;
  scopeType: GradeScopeType | string;
  scopeKey: string;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  deliveryMode: GradeAssessmentDeliveryMode | string;
  approvalStatus: GradeAssessmentApprovalStatus | string;
  lockedAt?: Date | string | null;
  isLocked?: boolean | null;
}

export interface SubmissionLike {
  id: string;
  assessmentId: string;
  studentId: string;
  status: GradeSubmissionStatus | string;
  assessment?: SubmissionAssessmentLike | null;
}

export interface SubmissionEnrollmentLike {
  id: string;
  studentId: string;
  academicYearId: string;
  termId?: string | null;
  classroomId: string;
  classroom?: {
    id: string;
    sectionId?: string | null;
    section?: {
      id: string;
      gradeId?: string | null;
      grade?: {
        id: string;
        stageId?: string | null;
      } | null;
    } | null;
  } | null;
}

export interface SubmissionQuestionLike extends GradeInteractionQuestion {
  id: string;
  assessmentId: string;
  type: GradeQuestionType | string;
  required: boolean;
  points?: unknown;
  options?: SubmissionOptionLike[];
}

export interface SubmissionOptionLike {
  id: string;
  questionId: string;
  deletedAt?: Date | string | null;
}

export interface SubmissionAnswerLike {
  assets?: Array<{ file: { mimeType: string } }>;
  questionId: string;
  answerText?: string | null;
  answerJson?: unknown;
  correctionStatus?: GradeAnswerCorrectionStatus | string;
  selectedOptions?: Array<{ optionId: string }>;
}

export interface AnswerPayloadCommand {
  answerText?: string | null;
  answerJson?: unknown;
  selectedOptionIds?: string[] | null;
}

export interface NormalizedAnswerPayload {
  answerText: string | null;
  answerJson: unknown;
  selectedOptionIds: string[];
  answerJsonSqlNull?: boolean;
}

export interface SubmissionAnswerProgress {
  totalQuestions: number;
  answeredCount: number;
  requiredQuestionCount: number;
  requiredAnsweredCount: number;
  pendingCorrectionCount: number;
}

export class GradeSubmissionAlreadySubmittedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.submission.already_submitted',
      message: 'Submission is already submitted',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class GradeSubmissionLockedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.submission.locked',
      message: 'Submission cannot be changed',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class GradeAnswerInvalidQuestionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.answer.invalid_question',
      message: 'Answer references an invalid question',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class GradeAnswerInvalidOptionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.answer.invalid_option',
      message: 'Answer references an invalid option',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export function assertSubmissionAssessmentAcceptsDrafts(
  assessment: SubmissionAssessmentLike,
  term: GradeTermWritableLike,
): void {
  assertQuestionBasedSubmissionAssessment(assessment);

  if (isAssessmentLocked(assessment)) {
    throw new GradeAssessmentLockedException({ assessmentId: assessment.id });
  }

  const approvalStatus = normalizeAssessmentApprovalStatus(
    assessment.approvalStatus,
  );
  if (
    approvalStatus !== GradeAssessmentApprovalStatus.PUBLISHED &&
    approvalStatus !== GradeAssessmentApprovalStatus.APPROVED
  ) {
    throw new DomainException({
      code: 'grades.assessment.not_published',
      message: 'Assessment must be published first',
      httpStatus: HttpStatus.CONFLICT,
      details: { assessmentId: assessment.id, approvalStatus },
    });
  }

  assertTermWritable(term);
}

export function assertSubmissionMutable(submission: SubmissionLike): void {
  const status = normalizeSubmissionStatus(submission.status);
  if (status === GradeSubmissionStatus.IN_PROGRESS) return;

  if (status === GradeSubmissionStatus.SUBMITTED) {
    throw new GradeSubmissionAlreadySubmittedException({
      submissionId: submission.id,
    });
  }

  throw new GradeSubmissionLockedException({ submissionId: submission.id });
}

export function assertSubmissionSubmittable(submission: SubmissionLike): void {
  assertSubmissionMutable(submission);
}

export function assertQuestionBelongsToSubmissionAssessment(params: {
  question: SubmissionQuestionLike;
  submission: Pick<SubmissionLike, 'assessmentId'>;
}): void {
  if (params.question.assessmentId !== params.submission.assessmentId) {
    throw new GradeAnswerInvalidQuestionException({
      questionId: params.question.id,
      assessmentId: params.submission.assessmentId,
    });
  }
}

export function validateAnswerPayloadForQuestion(params: {
  question: SubmissionQuestionLike;
  payload: NormalizedAnswerPayload;
}): NormalizedAnswerPayload {
  return normalizeTypedGradeAnswer(params.question, params.payload, 'draft');
}

export function validateStoredAnswerPayloadForQuestion(params: {
  question: SubmissionQuestionLike;
  payload: NormalizedAnswerPayload;
}): NormalizedAnswerPayload {
  return normalizeStoredGradeAnswer(params.question, params.payload);
}

export function validateSelectedOptionsForQuestion(params: {
  question: SubmissionQuestionLike;
  selectedOptionIds: string[];
  options: SubmissionOptionLike[];
}): void {
  assertNoDuplicateSelectedOptionIds(params.selectedOptionIds);

  if (params.selectedOptionIds.length === 0) return;

  const optionsById = new Map(
    params.options.map((option) => [option.id, option]),
  );
  const invalidOptionIds = params.selectedOptionIds.filter((optionId) => {
    const option = optionsById.get(optionId);
    return (
      !option ||
      option.questionId !== params.question.id ||
      Boolean(option.deletedAt)
    );
  });

  if (invalidOptionIds.length > 0) {
    throw new GradeAnswerInvalidOptionException({
      questionId: params.question.id,
      optionIds: invalidOptionIds,
    });
  }
}

export function assertNoDuplicateAnswerQuestionIds(
  items: Array<{ questionId: string }>,
): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of items) {
    if (seen.has(item.questionId)) {
      duplicates.add(item.questionId);
      continue;
    }
    seen.add(item.questionId);
  }

  if (duplicates.size > 0) {
    throw new ValidationDomainException(
      'Duplicate question ids are not allowed in bulk answer save',
      {
        field: 'answers.questionId',
        duplicateQuestionIds: [...duplicates],
      },
    );
  }
}

export function calculateSubmissionAnswerProgress(params: {
  questions: SubmissionQuestionLike[];
  answers: SubmissionAnswerLike[];
}): SubmissionAnswerProgress {
  const answerByQuestionId = new Map(
    params.answers.map((answer) => [answer.questionId, answer]),
  );
  const requiredQuestions = params.questions.filter(
    (question) => question.required,
  );

  const answeredCount = params.questions.filter((question) => {
    const answer = answerByQuestionId.get(question.id);
    return answer ? isAnswerMeaningfulForQuestion(question, answer) : false;
  }).length;

  const requiredAnsweredCount = requiredQuestions.filter((question) => {
    const answer = answerByQuestionId.get(question.id);
    return answer ? isAnswerMeaningfulForQuestion(question, answer) : false;
  }).length;

  const pendingCorrectionCount = params.answers.filter((answer) => {
    const question = params.questions.find((q) => q.id === answer.questionId);
    if (
      question?.responseConfig != null &&
      !isAnswerMeaningfulForQuestion(question, answer)
    )
      return false;
    return (
      String(answer.correctionStatus ?? GradeAnswerCorrectionStatus.PENDING)
        .trim()
        .toUpperCase() === GradeAnswerCorrectionStatus.PENDING
    );
  }).length;

  return {
    totalQuestions: params.questions.length,
    answeredCount,
    requiredQuestionCount: requiredQuestions.length,
    requiredAnsweredCount,
    pendingCorrectionCount,
  };
}

export function assertRequiredQuestionsAnswered(params: {
  questions: SubmissionQuestionLike[];
  answers: SubmissionAnswerLike[];
}): void {
  const answersByQuestionId = new Map(
    params.answers.map((answer) => [answer.questionId, answer]),
  );
  const missingQuestionIds: string[] = [];

  for (const question of params.questions) {
    if (!question.required) continue;

    const answer = answersByQuestionId.get(question.id);
    if (!answer || !isAnswerMeaningfulForQuestion(question, answer)) {
      missingQuestionIds.push(question.id);
    }
  }

  if (missingQuestionIds.length > 0) {
    throw new ValidationDomainException(
      'All required questions must be answered before submission',
      { field: 'answers', missingQuestionIds },
    );
  }
}

export function normalizeAnswerPayload(
  command: AnswerPayloadCommand,
): NormalizedAnswerPayload {
  return {
    answerText: normalizeNullableText(command.answerText),
    answerJson:
      command.answerJson === undefined ? null : (command.answerJson ?? null),
    selectedOptionIds: command.selectedOptionIds
      ? [...command.selectedOptionIds]
      : [],
  };
}

export function validateEnrollmentWithinAssessmentScope(params: {
  assessment: SubmissionAssessmentLike;
  enrollment: SubmissionEnrollmentLike;
}): void {
  if (
    params.enrollment.academicYearId !== params.assessment.academicYearId ||
    (params.enrollment.termId &&
      params.enrollment.termId !== params.assessment.termId)
  ) {
    throwNoEnrollment(params);
  }

  if (!isEnrollmentInsideAssessmentScope(params)) {
    throwNoEnrollment(params);
  }
}

export function assertQuestionBasedSubmissionAssessment(
  assessment: Pick<SubmissionAssessmentLike, 'id' | 'deliveryMode'>,
): void {
  if (
    normalizeDeliveryMode(assessment.deliveryMode) !==
    GradeAssessmentDeliveryMode.QUESTION_BASED
  ) {
    throw new ValidationDomainException(
      'Assessment must be question-based for submissions',
      {
        assessmentId: assessment.id,
        deliveryMode: assessment.deliveryMode,
      },
    );
  }
}

export function normalizeSubmissionStatus(
  input: GradeSubmissionStatus | string,
): GradeSubmissionStatus {
  const normalized = String(input).trim().toUpperCase();

  switch (normalized) {
    case GradeSubmissionStatus.IN_PROGRESS:
      return GradeSubmissionStatus.IN_PROGRESS;
    case GradeSubmissionStatus.SUBMITTED:
      return GradeSubmissionStatus.SUBMITTED;
    case GradeSubmissionStatus.CORRECTED:
      return GradeSubmissionStatus.CORRECTED;
    default:
      throw new ValidationDomainException('Submission status is invalid', {
        field: 'status',
        value: input,
      });
  }
}

export function isAnswerMeaningfulForQuestion(
  question: SubmissionQuestionLike,
  answer: SubmissionAnswerLike,
): boolean {
  if (question.responseConfig != null) {
    try {
      const config = gradeResponseConfig(
        question.type,
        question.responseConfig,
      )!;
      validateStoredAnswerPayloadForQuestion({
        question,
        payload: normalizeAnswerPayload({
          answerText: answer.answerText,
          answerJson: answer.answerJson,
          selectedOptionIds:
            answer.selectedOptions?.map((o) => o.optionId) ?? [],
        }),
      });
      const assets = answer.assets?.map((a) => a.file) ?? [];
      if (!answer.answerText?.trim() && assets.length === 0) return false;
      assertResponseModalities({
        config,
        hasText: !!answer.answerText?.trim(),
        assets,
        required: true,
        phase: 'final',
      });
      return true;
    } catch {
      return false;
    }
  }
  if (isGradeEvaluationType(question.type) && answer.answerJson == null)
    return false;
  const payload = normalizeAnswerPayload({
    answerText: answer.answerText ?? null,
    answerJson: answer.answerJson ?? null,
    selectedOptionIds:
      answer.selectedOptions?.map((option) => option.optionId) ?? [],
  });

  try {
    validateStoredAnswerPayloadForQuestion({ question, payload });
    if (question.options)
      validateSelectedOptionsForQuestion({
        question,
        selectedOptionIds: payload.selectedOptionIds,
        options: question.options,
      });
    return true;
  } catch {
    return false;
  }
}

function assertNoDuplicateSelectedOptionIds(optionIds: string[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const optionId of optionIds) {
    if (seen.has(optionId)) {
      duplicates.add(optionId);
      continue;
    }
    seen.add(optionId);
  }

  if (duplicates.size > 0) {
    throw new ValidationDomainException(
      'Duplicate selected option ids are not allowed',
      {
        field: 'selectedOptionIds',
        duplicateOptionIds: [...duplicates],
      },
    );
  }
}

function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function isEnrollmentInsideAssessmentScope(params: {
  assessment: SubmissionAssessmentLike;
  enrollment: SubmissionEnrollmentLike;
}): boolean {
  const classroom = params.enrollment.classroom;
  const section = classroom?.section;
  const grade = section?.grade;

  switch (params.assessment.scopeType) {
    case GradeScopeType.SCHOOL:
      return true;
    case GradeScopeType.STAGE:
      return grade?.stageId === params.assessment.stageId;
    case GradeScopeType.GRADE:
      return section?.gradeId === params.assessment.gradeId;
    case GradeScopeType.SECTION:
      return classroom?.sectionId === params.assessment.sectionId;
    case GradeScopeType.CLASSROOM:
      return params.enrollment.classroomId === params.assessment.classroomId;
    default:
      return false;
  }
}

function throwNoEnrollment(params: {
  assessment: SubmissionAssessmentLike;
  enrollment: SubmissionEnrollmentLike;
}): never {
  throw new GradebookNoEnrollmentException({
    assessmentId: params.assessment.id,
    studentId: params.enrollment.studentId,
  });
}
