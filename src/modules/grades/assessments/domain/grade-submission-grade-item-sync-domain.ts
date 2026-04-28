import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeItemStatus,
  GradeSubmissionStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  GradeNumericValue,
  toGradeNumber,
} from '../../shared/domain/grade-calculation';
import {
  GradeTermWritableLike,
  assertTermWritable,
  isAssessmentLocked,
  normalizeAssessmentApprovalStatus,
  normalizeDeliveryMode,
} from '../../shared/domain/grade-workflow';
import {
  GradeAssessmentLockedException,
  GradeAssessmentNotPublishedException,
} from './grade-assessment-domain';
import {
  GradeSubmissionNotSubmittedException,
} from './grade-submission-review-domain';
import {
  GradebookNoEnrollmentException,
  GradeItemUpsertPayload,
} from './grade-item-entry-domain';
import { normalizeSubmissionStatus } from './grade-submission-domain';

export interface SubmissionSyncAssessmentLike {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  deliveryMode: GradeAssessmentDeliveryMode | string;
  approvalStatus: GradeAssessmentApprovalStatus | string;
  lockedAt?: Date | string | null;
  isLocked?: boolean | null;
  maxScore?: GradeNumericValue;
  term: GradeTermWritableLike;
}

export interface SubmissionSyncStudentLike {
  id: string;
  schoolId: string;
  status: StudentStatus | string;
  deletedAt?: Date | string | null;
}

export interface SubmissionSyncEnrollmentLike {
  id: string;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  termId?: string | null;
  status: StudentEnrollmentStatus | string;
  deletedAt?: Date | string | null;
}

export interface SubmissionSyncLike {
  id: string;
  schoolId: string;
  assessmentId: string;
  termId: string;
  studentId: string;
  enrollmentId: string;
  status: GradeSubmissionStatus | string;
  correctedAt?: Date | string | null;
  totalScore?: GradeNumericValue;
  maxScore?: GradeNumericValue;
  assessment: SubmissionSyncAssessmentLike;
  student?: SubmissionSyncStudentLike | null;
  enrollment?: SubmissionSyncEnrollmentLike | null;
}

export interface ExistingGradeItemSyncLike {
  score?: GradeNumericValue;
  status: GradeItemStatus | string;
  enrollmentId?: string | null;
  comment?: string | null;
  enteredById?: string | null;
  enteredAt?: Date | null;
}

export interface BuiltGradeItemSyncPayload {
  payload: GradeItemUpsertPayload;
  idempotent: boolean;
}

export function assertSubmissionSyncableToGradeItem(
  submission: SubmissionSyncLike,
): void {
  assertSubmissionCorrected(submission);
  assertQuestionBasedAssessmentForSync(submission.assessment);
  assertSyncAssessmentWritable(submission.assessment);
  assertSubmissionHasScore(submission);
  assertSubmissionStudentAndEnrollmentForSync(submission);
}

export function assertQuestionBasedAssessmentForSync(
  assessment: Pick<SubmissionSyncAssessmentLike, 'id' | 'deliveryMode'>,
): void {
  if (
    normalizeDeliveryMode(assessment.deliveryMode) !==
    GradeAssessmentDeliveryMode.QUESTION_BASED
  ) {
    throw new ValidationDomainException(
      'Assessment must be question-based for GradeItem sync',
      {
        assessmentId: assessment.id,
        deliveryMode: assessment.deliveryMode,
      },
    );
  }
}

export function assertSyncAssessmentWritable(
  assessment: Pick<
    SubmissionSyncAssessmentLike,
    'id' | 'approvalStatus' | 'lockedAt' | 'isLocked' | 'term'
  >,
): void {
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
    throw new GradeAssessmentNotPublishedException({
      assessmentId: assessment.id,
      approvalStatus,
    });
  }

  assertTermWritable(assessment.term);
}

export function assertSubmissionHasScore(
  submission: Pick<SubmissionSyncLike, 'id' | 'totalScore' | 'maxScore'>,
): { totalScore: number; maxScore: number } {
  const totalScore = toGradeNumber(submission.totalScore);
  const maxScore = toGradeNumber(submission.maxScore);

  if (totalScore === null || maxScore === null) {
    throw new ValidationDomainException(
      'Corrected submission must have totalScore and maxScore before GradeItem sync',
      {
        submissionId: submission.id,
        totalScorePresent: totalScore !== null,
        maxScorePresent: maxScore !== null,
      },
    );
  }

  return { totalScore, maxScore };
}

export function deriveGradeItemStatusFromSubmission(
  submission: Pick<SubmissionSyncLike, 'id' | 'status'>,
): GradeItemStatus {
  assertSubmissionCorrected(submission);
  return GradeItemStatus.ENTERED;
}

export function buildGradeItemFromCorrectedSubmission(params: {
  submission: SubmissionSyncLike;
  enteredById: string | null;
  enteredAt: Date;
  existing?: ExistingGradeItemSyncLike | null;
}): BuiltGradeItemSyncPayload {
  const { totalScore } = assertSubmissionHasScore(params.submission);
  const status = deriveGradeItemStatusFromSubmission(params.submission);
  const idempotent = isExistingGradeItemSynced({
    existing: params.existing ?? null,
    score: totalScore,
    status,
    enrollmentId: params.submission.enrollmentId,
  });

  return {
    idempotent,
    payload: {
      schoolId: params.submission.schoolId,
      termId: params.submission.assessment.termId,
      assessmentId: params.submission.assessmentId,
      studentId: params.submission.studentId,
      enrollmentId: params.submission.enrollmentId,
      score: totalScore,
      status,
      comment: params.existing?.comment ?? null,
      enteredById: idempotent
        ? (params.existing?.enteredById ?? params.enteredById)
        : params.enteredById,
      enteredAt: idempotent
        ? (params.existing?.enteredAt ?? params.enteredAt)
        : params.enteredAt,
    },
  };
}

function assertSubmissionCorrected(
  submission: Pick<SubmissionSyncLike, 'id' | 'status'>,
): void {
  const status = normalizeSubmissionStatus(submission.status);
  if (status === GradeSubmissionStatus.CORRECTED) return;

  throw new GradeSubmissionNotSubmittedException({
    submissionId: submission.id,
    status,
    requiredStatus: GradeSubmissionStatus.CORRECTED,
  });
}

function assertSubmissionStudentAndEnrollmentForSync(
  submission: SubmissionSyncLike,
): void {
  if (submission.assessment.schoolId !== submission.schoolId) {
    throw new NotFoundDomainException('Grade assessment not found', {
      assessmentId: submission.assessmentId,
    });
  }

  if (
    !submission.student ||
    submission.student.id !== submission.studentId ||
    submission.student.schoolId !== submission.schoolId ||
    submission.student.deletedAt ||
    String(submission.student.status).trim().toUpperCase() !==
      StudentStatus.ACTIVE
  ) {
    throw new NotFoundDomainException('Student not found', {
      studentId: submission.studentId,
    });
  }

  const enrollment = submission.enrollment;
  if (
    !enrollment ||
    enrollment.id !== submission.enrollmentId ||
    enrollment.schoolId !== submission.schoolId ||
    enrollment.studentId !== submission.studentId ||
    enrollment.academicYearId !== submission.assessment.academicYearId ||
    (enrollment.termId && enrollment.termId !== submission.termId) ||
    enrollment.deletedAt ||
    String(enrollment.status).trim().toUpperCase() !==
      StudentEnrollmentStatus.ACTIVE
  ) {
    throw new GradebookNoEnrollmentException({
      assessmentId: submission.assessmentId,
      studentId: submission.studentId,
      enrollmentId: submission.enrollmentId,
    });
  }
}

function isExistingGradeItemSynced(params: {
  existing: ExistingGradeItemSyncLike | null;
  score: number;
  status: GradeItemStatus;
  enrollmentId: string;
}): boolean {
  if (!params.existing) return false;

  return (
    toGradeNumber(params.existing.score) === params.score &&
    String(params.existing.status).trim().toUpperCase() === params.status &&
    params.existing.enrollmentId === params.enrollmentId &&
    Boolean(params.existing.enteredAt)
  );
}
