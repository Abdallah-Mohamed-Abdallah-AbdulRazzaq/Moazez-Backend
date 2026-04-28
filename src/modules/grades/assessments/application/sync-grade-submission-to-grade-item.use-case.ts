import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { GradesScope, requireGradesScope } from '../../grades-context';
import { presentDecimal } from '../../shared/presenters/grades.presenter';
import {
  assertSubmissionSyncableToGradeItem,
  buildGradeItemFromCorrectedSubmission,
} from '../domain/grade-submission-grade-item-sync-domain';
import {
  GradeItemSyncRecord,
  GradeSubmissionForGradeItemSyncRecord,
  GradesSubmissionGradeItemSyncRepository,
} from '../infrastructure/grades-submission-grade-item-sync.repository';
import { presentGradeSubmissionGradeItemSync } from '../presenters/grade-submission-grade-item-sync.presenter';

@Injectable()
export class SyncGradeSubmissionToGradeItemUseCase {
  constructor(
    private readonly syncRepository: GradesSubmissionGradeItemSyncRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(submissionId: string) {
    const scope = requireGradesScope();
    const submission =
      await this.syncRepository.findSubmissionForGradeItemSync(submissionId);

    if (!submission) {
      throw new NotFoundDomainException('Grade submission not found', {
        submissionId,
      });
    }

    assertSubmissionSyncableToGradeItem(submission);

    const before = await this.syncRepository.findGradeItemForSubmission({
      assessmentId: submission.assessmentId,
      studentId: submission.studentId,
    });
    const built = buildGradeItemFromCorrectedSubmission({
      submission,
      existing: before,
      enteredById: scope.actorId,
      enteredAt: new Date(),
    });
    const gradeItem =
      await this.syncRepository.upsertGradeItemFromSubmission(built.payload);

    await this.authRepository.createAuditLog(
      buildGradeSubmissionGradeItemSyncAuditEntry({
        scope,
        submission,
        before,
        after: gradeItem,
      }),
    );

    return presentGradeSubmissionGradeItemSync({
      submission,
      gradeItem,
      synced: true,
      idempotent: built.idempotent,
    });
  }
}

function buildGradeSubmissionGradeItemSyncAuditEntry(params: {
  scope: GradesScope;
  submission: GradeSubmissionForGradeItemSyncRecord;
  before: GradeItemSyncRecord | null;
  after: GradeItemSyncRecord;
}) {
  const entry = {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'grades',
    action: 'grades.submission.grade_item.sync',
    resourceType: 'grade_submission',
    resourceId: params.submission.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      submission: summarizeSubmissionForAudit(params.submission),
      gradeItem: summarizeGradeItemForAudit(params.after),
    },
  };

  return params.before
    ? {
        ...entry,
        before: {
          gradeItem: summarizeGradeItemForAudit(params.before),
        },
      }
    : entry;
}

function summarizeSubmissionForAudit(
  submission: GradeSubmissionForGradeItemSyncRecord,
) {
  return {
    id: submission.id,
    assessmentId: submission.assessmentId,
    studentId: submission.studentId,
    enrollmentId: submission.enrollmentId,
    status: submission.status,
    totalScore: presentDecimal(submission.totalScore),
    maxScore: presentDecimal(submission.maxScore),
    correctedAt: submission.correctedAt?.toISOString() ?? null,
  };
}

function summarizeGradeItemForAudit(item: GradeItemSyncRecord) {
  return {
    id: item.id,
    assessmentId: item.assessmentId,
    studentId: item.studentId,
    enrollmentId: item.enrollmentId,
    score: presentDecimal(item.score),
    status: item.status,
    enteredById: item.enteredById,
    enteredAt: item.enteredAt?.toISOString() ?? null,
  };
}
