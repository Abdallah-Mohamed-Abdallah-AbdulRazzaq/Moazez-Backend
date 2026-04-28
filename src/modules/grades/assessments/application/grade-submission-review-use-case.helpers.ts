import { AuditOutcome, Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireGradesScope } from '../../grades-context';
import { presentDecimal } from '../../shared/presenters/grades.presenter';
import {
  BulkReviewGradeSubmissionAnswerItemDto,
  ReviewGradeSubmissionAnswerDto,
} from '../dto/grade-submission-review.dto';
import {
  assertAnswerBelongsToSubmission,
  assertNoDuplicateReviewAnswerIds,
  buildAnswerReviewPayload,
  buildFinalizeSubmissionPayload,
  calculateSubmissionTotalScore,
} from '../domain/grade-submission-review-domain';
import {
  AnswerReviewUpdateInput,
  FinalizeSubmissionInput,
  GradeSubmissionAnswerRecord,
  GradeSubmissionDetailRecord,
  GradeSubmissionQuestionRecord,
  GradesSubmissionsRepository,
} from '../infrastructure/grades-submissions.repository';

export async function findReviewSubmissionOrThrow(
  repository: GradesSubmissionsRepository,
  submissionId: string,
): Promise<GradeSubmissionDetailRecord> {
  const submission = await repository.findSubmissionForReview(submissionId);
  if (!submission) {
    throw new NotFoundDomainException('Grade submission not found', {
      submissionId,
    });
  }

  return submission;
}

export async function findReviewAnswerOrThrow(
  repository: GradesSubmissionsRepository,
  answerId: string,
): Promise<GradeSubmissionAnswerRecord> {
  const answer = await repository.findAnswerForReview(answerId);
  if (!answer) {
    throw new NotFoundDomainException('Grade submission answer not found', {
      answerId,
    });
  }

  return answer;
}

export async function prepareSingleAnswerReviewInput(params: {
  submission: GradeSubmissionDetailRecord;
  answer: GradeSubmissionAnswerRecord;
  command: ReviewGradeSubmissionAnswerDto;
  actorId?: string | null;
}): Promise<AnswerReviewUpdateInput> {
  assertAnswerBelongsToSubmission({
    answer: params.answer,
    submission: params.submission,
  });

  return buildAnswerReviewUpdateInput({
    submissionId: params.submission.id,
    answer: params.answer,
    command: params.command,
    actorId: params.actorId,
  });
}

export async function prepareBulkAnswerReviewInputs(params: {
  repository: GradesSubmissionsRepository;
  submission: GradeSubmissionDetailRecord;
  commands: BulkReviewGradeSubmissionAnswerItemDto[];
  actorId?: string | null;
}): Promise<{
  inputs: AnswerReviewUpdateInput[];
  answersBefore: GradeSubmissionAnswerRecord[];
}> {
  assertNoDuplicateReviewAnswerIds(params.commands);

  const answerIds = params.commands.map((review) => review.answerId);
  const answers = await params.repository.findAnswersForBulkReview(answerIds);
  if (answers.length !== answerIds.length) {
    const foundIds = new Set(answers.map((answer) => answer.id));
    throw new NotFoundDomainException('Grade submission answer not found', {
      answerIds: answerIds.filter((id) => !foundIds.has(id)),
    });
  }

  const answerById = new Map(answers.map((answer) => [answer.id, answer]));
  const inputs = params.commands.map((command) => {
    const answer = answerById.get(command.answerId);
    if (!answer) {
      throw new NotFoundDomainException('Grade submission answer not found', {
        answerId: command.answerId,
      });
    }

    assertAnswerBelongsToSubmission({
      answer,
      submission: params.submission,
    });

    return buildAnswerReviewUpdateInput({
      submissionId: params.submission.id,
      answer,
      command,
      actorId: params.actorId,
    });
  });

  return { inputs, answersBefore: answers };
}

export function prepareFinalizeSubmissionInput(params: {
  submission: GradeSubmissionDetailRecord;
  questions: GradeSubmissionQuestionRecord[];
  actorId?: string | null;
}): FinalizeSubmissionInput {
  const totalScore = calculateSubmissionTotalScore({
    questions: params.questions,
    answers: params.submission.answers,
  });
  const payload = buildFinalizeSubmissionPayload({
    submission: params.submission,
    totalScore,
    actorId: params.actorId,
  });

  return {
    submissionId: params.submission.id,
    status: payload.status,
    correctedAt: payload.correctedAt,
    reviewedById: payload.reviewedById,
    totalScore: new Prisma.Decimal(payload.totalScore),
    maxScore: new Prisma.Decimal(payload.maxScore),
  };
}

export function buildSingleAnswerReviewAuditEntry(params: {
  scope: ReturnType<typeof requireGradesScope>;
  before: GradeSubmissionAnswerRecord;
  after: GradeSubmissionAnswerRecord;
}) {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'grades',
    action: 'grades.submission.answer.review',
    resourceType: 'grade_submission_answer',
    resourceId: params.after.id,
    outcome: AuditOutcome.SUCCESS,
    before: summarizeAnswerReviewForAudit(params.before),
    after: summarizeAnswerReviewForAudit(params.after),
  };
}

export function buildBulkAnswerReviewAuditEntry(params: {
  scope: ReturnType<typeof requireGradesScope>;
  submission: GradeSubmissionDetailRecord;
  answersBefore: GradeSubmissionAnswerRecord[];
  answersAfter: GradeSubmissionAnswerRecord[];
}) {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'grades',
    action: 'grades.submission.answers.bulk_review',
    resourceType: 'grade_submission',
    resourceId: params.submission.id,
    outcome: AuditOutcome.SUCCESS,
    before: {
      answerIds: params.answersBefore.map((answer) => answer.id),
      answers: params.answersBefore.map(summarizeAnswerReviewForAudit),
    },
    after: {
      submissionId: params.submission.id,
      reviewedCount: params.answersAfter.length,
      answerIds: params.answersAfter.map((answer) => answer.id),
      answers: params.answersAfter.map(summarizeAnswerReviewForAudit),
    },
  };
}

export function buildFinalizeSubmissionReviewAuditEntry(params: {
  scope: ReturnType<typeof requireGradesScope>;
  before: GradeSubmissionDetailRecord;
  after: GradeSubmissionDetailRecord;
}) {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'grades',
    action: 'grades.submission.review.finalize',
    resourceType: 'grade_submission',
    resourceId: params.after.id,
    outcome: AuditOutcome.SUCCESS,
    before: summarizeSubmissionReviewForAudit(params.before),
    after: summarizeSubmissionReviewForAudit(params.after),
  };
}

function buildAnswerReviewUpdateInput(params: {
  submissionId: string;
  answer: GradeSubmissionAnswerRecord;
  command: ReviewGradeSubmissionAnswerDto;
  actorId?: string | null;
}): AnswerReviewUpdateInput {
  const payload = buildAnswerReviewPayload({
    command: params.command,
    answer: params.answer,
    actorId: params.actorId,
  });

  return {
    answerId: params.answer.id,
    submissionId: params.submissionId,
    awardedPoints: new Prisma.Decimal(payload.awardedPoints),
    correctionStatus: payload.correctionStatus,
    reviewerComment: payload.reviewerComment,
    reviewerCommentAr: payload.reviewerCommentAr,
    reviewedById: payload.reviewedById,
    reviewedAt: payload.reviewedAt,
  };
}

function summarizeAnswerReviewForAudit(answer: GradeSubmissionAnswerRecord) {
  return {
    id: answer.id,
    submissionId: answer.submissionId,
    assessmentId: answer.assessmentId,
    questionId: answer.questionId,
    studentId: answer.studentId,
    correctionStatus: answer.correctionStatus,
    awardedPoints: presentDecimal(answer.awardedPoints),
    maxPoints: presentDecimal(answer.maxPoints),
    reviewerCommentPresent: Boolean(answer.reviewerComment),
    reviewerCommentArPresent: Boolean(answer.reviewerCommentAr),
    reviewedById: answer.reviewedById,
    reviewedAt: answer.reviewedAt?.toISOString() ?? null,
  };
}

function summarizeSubmissionReviewForAudit(
  submission: GradeSubmissionDetailRecord,
) {
  return {
    id: submission.id,
    assessmentId: submission.assessmentId,
    termId: submission.termId,
    studentId: submission.studentId,
    status: submission.status,
    totalScore: presentDecimal(submission.totalScore),
    maxScore: presentDecimal(submission.maxScore),
    correctedAt: submission.correctedAt?.toISOString() ?? null,
    reviewedById: submission.reviewedById,
  };
}
