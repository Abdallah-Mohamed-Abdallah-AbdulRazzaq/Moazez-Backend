import { AuditOutcome } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { GradesScope } from '../../grades-context';
import {
  GradeAssessmentForQuestionManagementRecord,
  GradeAssessmentQuestionRecord,
  GradeAssessmentQuestionWithAssessmentRecord,
  GradesAssessmentQuestionsRepository,
} from '../infrastructure/grades-assessment-questions.repository';
import {
  NormalizedQuestionPayload,
  assertNoDuplicateBulkQuestionPointIds,
  assertNoDuplicateQuestionIds,
  assertQuestionBasedAssessment,
  assertQuestionStructureMutable,
  assertReorderIncludesExactlyActiveQuestions,
  validateQuestionOptionsForType,
  validateQuestionPoints,
} from '../domain/grade-question-domain';
import { presentDecimal } from '../../shared/presenters/grades.presenter';

export async function loadQuestionAssessmentOrThrow(
  repository: GradesAssessmentQuestionsRepository,
  assessmentId: string,
): Promise<GradeAssessmentForQuestionManagementRecord> {
  const assessment =
    await repository.findAssessmentForQuestionManagement(assessmentId);

  if (!assessment) {
    throw new NotFoundDomainException('Grade assessment not found', {
      assessmentId,
    });
  }

  assertQuestionBasedAssessment(assessment);
  return assessment;
}

export async function loadQuestionOrThrow(
  repository: GradesAssessmentQuestionsRepository,
  questionId: string,
): Promise<GradeAssessmentQuestionWithAssessmentRecord> {
  const question = await repository.findQuestionByIdWithAssessment(questionId);

  if (!question) {
    throw new NotFoundDomainException('Grade assessment question not found', {
      questionId,
    });
  }

  assertQuestionBasedAssessment(question.assessment);
  return question;
}

export async function assertQuestionMutationAllowed(params: {
  repository: GradesAssessmentQuestionsRepository;
  assessment:
    | GradeAssessmentForQuestionManagementRecord
    | GradeAssessmentQuestionWithAssessmentRecord['assessment'];
}): Promise<void> {
  const submissionCount = await params.repository.countSubmissionsForAssessment(
    params.assessment.id,
  );

  assertQuestionStructureMutable({
    assessment: params.assessment,
    term: params.assessment.term,
    submissionCount,
  });
}

export async function assertQuestionSortOrderAvailable(params: {
  repository: GradesAssessmentQuestionsRepository;
  assessmentId: string;
  sortOrder: number;
  excludeQuestionId?: string;
}): Promise<void> {
  const isTaken = await params.repository.isQuestionSortOrderTaken(params);
  if (isTaken) {
    throw new ValidationDomainException(
      'Question sort order is already in use',
      {
        field: 'sortOrder',
        assessmentId: params.assessmentId,
        sortOrder: params.sortOrder,
      },
    );
  }
}

export async function resolveCreateQuestionPayload(params: {
  repository: GradesAssessmentQuestionsRepository;
  assessmentId: string;
  payload: NormalizedQuestionPayload;
}): Promise<
  Required<
    Pick<
      NormalizedQuestionPayload,
      'type' | 'prompt' | 'points' | 'sortOrder' | 'required'
    >
  > &
    NormalizedQuestionPayload
> {
  if (
    !params.payload.type ||
    !params.payload.prompt ||
    !params.payload.points
  ) {
    throw new ValidationDomainException('Question payload is incomplete');
  }

  const sortOrder =
    params.payload.sortOrder ??
    (await params.repository.getNextQuestionSortOrder(params.assessmentId));

  if (params.payload.sortOrder !== undefined) {
    await assertQuestionSortOrderAvailable({
      repository: params.repository,
      assessmentId: params.assessmentId,
      sortOrder,
    });
  }

  const options = validateQuestionOptionsForType({
    type: params.payload.type,
    options: params.payload.options ?? [],
    answerKey: params.payload.answerKey,
    metadata: params.payload.metadata,
  });

  return {
    ...params.payload,
    type: params.payload.type,
    prompt: params.payload.prompt,
    points: params.payload.points,
    sortOrder,
    required: params.payload.required ?? true,
    options,
  };
}

export function validateQuestionOwnershipForAssessment(params: {
  assessmentId: string;
  requestedQuestionIds: string[];
  foundQuestions: Array<{ id: string; assessmentId: string }>;
}): void {
  const foundById = new Map(
    params.foundQuestions.map((question) => [question.id, question]),
  );
  const missingQuestionIds = params.requestedQuestionIds.filter(
    (questionId) => !foundById.has(questionId),
  );
  const foreignQuestionIds = params.foundQuestions
    .filter((question) => question.assessmentId !== params.assessmentId)
    .map((question) => question.id);

  if (missingQuestionIds.length > 0 || foreignQuestionIds.length > 0) {
    throw new NotFoundDomainException('Grade assessment question not found', {
      assessmentId: params.assessmentId,
      questionIds: [...missingQuestionIds, ...foreignQuestionIds],
    });
  }
}

export async function validateReorderRequest(params: {
  repository: GradesAssessmentQuestionsRepository;
  assessmentId: string;
  questionIds: string[];
  activeQuestions: GradeAssessmentQuestionRecord[];
}): Promise<void> {
  assertNoDuplicateQuestionIds(params.questionIds);
  const foundQuestions = await params.repository.listQuestionsByIds([
    ...new Set(params.questionIds),
  ]);

  validateQuestionOwnershipForAssessment({
    assessmentId: params.assessmentId,
    requestedQuestionIds: [...new Set(params.questionIds)],
    foundQuestions,
  });

  assertReorderIncludesExactlyActiveQuestions({
    requestedQuestionIds: params.questionIds,
    activeQuestionIds: params.activeQuestions.map((question) => question.id),
  });
}

export async function validateBulkPointsRequest(params: {
  repository: GradesAssessmentQuestionsRepository;
  assessmentId: string;
  items: Array<{ questionId: string; points: number }>;
}): Promise<void> {
  if (params.items.length === 0) {
    throw new ValidationDomainException('Bulk points payload is required', {
      field: 'items',
    });
  }

  assertNoDuplicateBulkQuestionPointIds(params.items);
  for (const item of params.items) {
    validateQuestionPoints(item.points);
  }

  const questionIds = params.items.map((item) => item.questionId);
  const foundQuestions =
    await params.repository.listQuestionsByIds(questionIds);
  validateQuestionOwnershipForAssessment({
    assessmentId: params.assessmentId,
    requestedQuestionIds: questionIds,
    foundQuestions,
  });
}

export function buildQuestionAuditEntry(params: {
  scope: GradesScope;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'grades',
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    outcome: AuditOutcome.SUCCESS,
    ...(params.before ? { before: params.before } : {}),
    ...(params.after ? { after: params.after } : {}),
  };
}

export function summarizeQuestionForAudit(
  question: GradeAssessmentQuestionRecord,
): Record<string, unknown> {
  return {
    id: question.id,
    assessmentId: question.assessmentId,
    type: question.type,
    prompt: question.prompt,
    promptAr: question.promptAr,
    explanation: question.explanation,
    explanationAr: question.explanationAr,
    points: presentDecimal(question.points),
    sortOrder: question.sortOrder,
    required: question.required,
    answerKey: question.answerKey ?? null,
    metadata: question.metadata ?? null,
    optionCount: question.options.length,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
      labelAr: option.labelAr,
      value: option.value,
      isCorrect: option.isCorrect,
      sortOrder: option.sortOrder,
      metadata: option.metadata ?? null,
    })),
    deletedAt: question.deletedAt?.toISOString() ?? null,
  };
}

export function summarizeQuestionListForAudit(
  questions: GradeAssessmentQuestionRecord[],
): Record<string, unknown> {
  return {
    questionIds: questions.map((question) => question.id),
    totalQuestions: questions.length,
    totalPoints: questions.reduce(
      (sum, question) => sum + (presentDecimal(question.points) ?? 0),
      0,
    ),
  };
}
