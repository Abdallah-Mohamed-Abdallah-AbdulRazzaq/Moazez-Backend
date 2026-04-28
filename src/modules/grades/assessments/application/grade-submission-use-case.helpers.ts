import { AuditOutcome, Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireGradesScope } from '../../grades-context';
import { presentDecimal } from '../../shared/presenters/grades.presenter';
import {
  BulkSaveGradeSubmissionAnswerItemDto,
  SaveGradeSubmissionAnswerDto,
} from '../dto/grade-submission.dto';
import {
  assertNoDuplicateAnswerQuestionIds,
  assertQuestionBasedSubmissionAssessment,
  assertQuestionBelongsToSubmissionAssessment,
  normalizeAnswerPayload,
  NormalizedAnswerPayload,
  validateAnswerPayloadForQuestion,
  validateEnrollmentWithinAssessmentScope,
  validateSelectedOptionsForQuestion,
} from '../domain/grade-submission-domain';
import {
  AnswerSaveInput,
  GradeSubmissionAnswerRecord,
  GradeSubmissionAssessmentRecord,
  GradeSubmissionDetailRecord,
  GradeSubmissionQuestionRecord,
  GradesSubmissionsRepository,
} from '../infrastructure/grades-submissions.repository';

export async function findSubmissionAssessmentOrThrow(
  repository: GradesSubmissionsRepository,
  assessmentId: string,
): Promise<GradeSubmissionAssessmentRecord> {
  const assessment = await repository.findAssessmentForSubmission(assessmentId);
  if (!assessment) {
    throw new NotFoundDomainException('Grade assessment not found', {
      assessmentId,
    });
  }

  return assessment;
}

export async function findSubmissionDetailOrThrow(
  repository: GradesSubmissionsRepository,
  submissionId: string,
): Promise<GradeSubmissionDetailRecord> {
  const submission = await repository.findSubmissionDetail(submissionId);
  if (!submission) {
    throw new NotFoundDomainException('Grade submission not found', {
      submissionId,
    });
  }

  return submission;
}

export async function listQuestionsForSubmissionOrThrow(
  repository: GradesSubmissionsRepository,
  assessmentId: string,
): Promise<GradeSubmissionQuestionRecord[]> {
  return repository.findQuestionsForSubmission(assessmentId);
}

export async function resolveQuestionForAnswerOrThrow(params: {
  repository: GradesSubmissionsRepository;
  submission: GradeSubmissionDetailRecord;
  questionId: string;
}): Promise<GradeSubmissionQuestionRecord> {
  const question = await params.repository.findQuestionForAnswer(
    params.questionId,
  );
  if (!question) {
    throw new NotFoundDomainException('Grade assessment question not found', {
      questionId: params.questionId,
    });
  }

  assertQuestionBelongsToSubmissionAssessment({
    question,
    submission: params.submission,
  });

  return question;
}

export async function prepareSingleAnswerSaveInput(params: {
  repository: GradesSubmissionsRepository;
  submission: GradeSubmissionDetailRecord;
  question: GradeSubmissionQuestionRecord;
  command: SaveGradeSubmissionAnswerDto;
}): Promise<AnswerSaveInput> {
  const payload = normalizeAnswerPayload(params.command);

  validateAnswerPayloadForQuestion({
    question: params.question,
    payload,
  });
  await validateSelectedOptionIdsWithRepository({
    repository: params.repository,
    question: params.question,
    payload,
  });

  return buildAnswerSaveInput({
    submission: params.submission,
    question: params.question,
    payload,
  });
}

export async function prepareBulkAnswerSaveInputs(params: {
  repository: GradesSubmissionsRepository;
  submission: GradeSubmissionDetailRecord;
  commands: BulkSaveGradeSubmissionAnswerItemDto[];
}): Promise<AnswerSaveInput[]> {
  assertNoDuplicateAnswerQuestionIds(params.commands);

  const uniqueQuestionIds = [
    ...new Set(params.commands.map((answer) => answer.questionId)),
  ];
  const questions =
    await params.repository.findQuestionsByIds(uniqueQuestionIds);
  if (questions.length !== uniqueQuestionIds.length) {
    const foundIds = new Set(questions.map((question) => question.id));
    throw new NotFoundDomainException('Grade assessment question not found', {
      questionIds: uniqueQuestionIds.filter((id) => !foundIds.has(id)),
    });
  }

  const questionById = new Map(
    questions.map((question) => [question.id, question]),
  );
  const prepared = params.commands.map((command) => {
    const question = questionById.get(command.questionId);
    if (!question) {
      throw new NotFoundDomainException('Grade assessment question not found', {
        questionId: command.questionId,
      });
    }

    assertQuestionBelongsToSubmissionAssessment({
      question,
      submission: params.submission,
    });

    const payload = normalizeAnswerPayload(command);
    validateAnswerPayloadForQuestion({ question, payload });

    return { command, question, payload };
  });

  const uniqueOptionIds = [
    ...new Set(prepared.flatMap((item) => item.payload.selectedOptionIds)),
  ];
  const options = await params.repository.findOptionsByIds(uniqueOptionIds);
  if (options.length !== uniqueOptionIds.length) {
    const foundIds = new Set(options.map((option) => option.id));
    throw new NotFoundDomainException(
      'Grade assessment question option not found',
      {
        optionIds: uniqueOptionIds.filter((id) => !foundIds.has(id)),
      },
    );
  }

  for (const item of prepared) {
    validateSelectedOptionsForQuestion({
      question: item.question,
      selectedOptionIds: item.payload.selectedOptionIds,
      options,
    });
  }

  return prepared.map((item) =>
    buildAnswerSaveInput({
      submission: params.submission,
      question: item.question,
      payload: item.payload,
    }),
  );
}

export function assertAssessmentQuestionBasedForRead(
  assessment: GradeSubmissionAssessmentRecord,
): void {
  assertQuestionBasedSubmissionAssessment(assessment);
}

export function assertSubmissionQuestionBasedForRead(
  submission: GradeSubmissionDetailRecord,
): void {
  assertQuestionBasedSubmissionAssessment(submission.assessment);
}

export function assertResolvedEnrollmentMatchesAssessment(params: {
  assessment: GradeSubmissionAssessmentRecord;
  enrollment: NonNullable<GradeSubmissionDetailRecord['enrollment']>;
}): void {
  validateEnrollmentWithinAssessmentScope({
    assessment: params.assessment,
    enrollment: params.enrollment,
  });
}

export function buildSubmissionAuditEntry(params: {
  scope: ReturnType<typeof requireGradesScope>;
  action: string;
  submission: GradeSubmissionDetailRecord;
  beforeStatus?: string;
  afterMetadata?: Record<string, unknown>;
}) {
  const entry = {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'grades',
    action: params.action,
    resourceType: 'grade_submission',
    resourceId: params.submission.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      ...summarizeSubmissionForAudit(params.submission),
      ...(params.afterMetadata ?? {}),
    },
  };

  return params.beforeStatus
    ? { ...entry, before: { status: params.beforeStatus } }
    : entry;
}

export function buildSingleAnswerAuditEntry(params: {
  scope: ReturnType<typeof requireGradesScope>;
  answer: GradeSubmissionAnswerRecord;
}) {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'grades',
    action: 'grades.submission.answer.save',
    resourceType: 'grade_submission_answer',
    resourceId: params.answer.id,
    outcome: AuditOutcome.SUCCESS,
    after: summarizeAnswerForAudit(params.answer),
  };
}

export function buildBulkAnswerAuditEntry(params: {
  scope: ReturnType<typeof requireGradesScope>;
  submission: GradeSubmissionDetailRecord;
  answers: GradeSubmissionAnswerRecord[];
}) {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'grades',
    action: 'grades.submission.answers.bulk_save',
    resourceType: 'grade_submission',
    resourceId: params.submission.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      submissionId: params.submission.id,
      savedCount: params.answers.length,
      questionIds: params.answers.map((answer) => answer.questionId),
      answerIds: params.answers.map((answer) => answer.id),
    },
  };
}

async function validateSelectedOptionIdsWithRepository(params: {
  repository: GradesSubmissionsRepository;
  question: GradeSubmissionQuestionRecord;
  payload: NormalizedAnswerPayload;
}): Promise<void> {
  const uniqueOptionIds = [...new Set(params.payload.selectedOptionIds)];
  const options = await params.repository.findOptionsByIds(uniqueOptionIds);
  if (options.length !== uniqueOptionIds.length) {
    const foundIds = new Set(options.map((option) => option.id));
    throw new NotFoundDomainException(
      'Grade assessment question option not found',
      {
        optionIds: uniqueOptionIds.filter((id) => !foundIds.has(id)),
      },
    );
  }

  validateSelectedOptionsForQuestion({
    question: params.question,
    selectedOptionIds: params.payload.selectedOptionIds,
    options,
  });
}

function buildAnswerSaveInput(params: {
  submission: GradeSubmissionDetailRecord;
  question: GradeSubmissionQuestionRecord;
  payload: NormalizedAnswerPayload;
}): AnswerSaveInput {
  return {
    schoolId: params.submission.schoolId,
    submissionId: params.submission.id,
    assessmentId: params.submission.assessmentId,
    studentId: params.submission.studentId,
    questionId: params.question.id,
    maxPoints: new Prisma.Decimal(presentDecimal(params.question.points) ?? 0),
    payload: params.payload,
  };
}

function summarizeSubmissionForAudit(submission: GradeSubmissionDetailRecord) {
  return {
    id: submission.id,
    assessmentId: submission.assessmentId,
    termId: submission.termId,
    studentId: submission.studentId,
    enrollmentId: submission.enrollmentId,
    status: submission.status,
    submittedAt: submission.submittedAt?.toISOString() ?? null,
    correctedAt: submission.correctedAt?.toISOString() ?? null,
    totalScore: presentDecimal(submission.totalScore),
    maxScore: presentDecimal(submission.maxScore),
  };
}

function summarizeAnswerForAudit(answer: GradeSubmissionAnswerRecord) {
  return {
    id: answer.id,
    submissionId: answer.submissionId,
    assessmentId: answer.assessmentId,
    questionId: answer.questionId,
    studentId: answer.studentId,
    selectedOptionCount: answer.selectedOptions.length,
    hasAnswerText: Boolean(answer.answerText),
    hasAnswerJson:
      answer.answerJson !== null && answer.answerJson !== undefined,
    correctionStatus: answer.correctionStatus,
    awardedPoints: presentDecimal(answer.awardedPoints),
    maxPoints: presentDecimal(answer.maxPoints),
  };
}
