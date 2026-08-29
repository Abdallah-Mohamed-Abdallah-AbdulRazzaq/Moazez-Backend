import { Injectable } from '@nestjs/common';
import {
  OrganizationStatus,
  SchoolStatus,
  StudentCredentialBatchStatus,
  StudentCredentialRowStatus,
} from '@prisma/client';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { FILES_IMPORT_QUEUE_NAME } from '../../../files/imports/domain/import-job.types';
import {
  STUDENT_CREDENTIAL_BATCH_EXECUTE_JOB_NAME,
  STUDENT_CREDENTIAL_EXECUTION_RECOVERY_PAGE_SIZE,
  STUDENT_CREDENTIAL_EXECUTION_RECOVERY_WINDOW_EXPIRED_CODE,
  STUDENT_CREDENTIAL_EXECUTION_RECOVERY_WINDOW_MS,
  STUDENT_CREDENTIAL_EXECUTION_TENANT_INELIGIBLE_CODE,
  studentCredentialBatchExecutionJobId,
} from '../domain/student-credential.constants';
import {
  StudentCredentialBatchRepository,
  type StudentCredentialRecoveryCandidate,
} from '../infrastructure/student-credential-batch.repository';
import { StudentCredentialSecretArtifactService } from './student-credential-secret-artifact.service';

export interface StudentCredentialRecoverySummary {
  scanned: number;
  restored: number;
  preserved: number;
  finalized: number;
  terminalized: number;
  blockedInvariant: number;
}

@Injectable()
export class StudentCredentialBatchReconciliationService {
  constructor(
    private readonly repository: StudentCredentialBatchRepository,
    private readonly bullmq: BullmqService,
    private readonly artifactService: StudentCredentialSecretArtifactService,
  ) {}

  async reconcile(now = new Date()): Promise<StudentCredentialRecoverySummary> {
    const summary: StudentCredentialRecoverySummary = {
      scanned: 0,
      restored: 0,
      preserved: 0,
      finalized: 0,
      terminalized: 0,
      blockedInvariant: 0,
    };
    let cursor: { createdAt: Date; id: string } | undefined;
    for (;;) {
      const candidates = await this.repository.listRecoveryCandidates({
        createdBefore: now,
        limit: STUDENT_CREDENTIAL_EXECUTION_RECOVERY_PAGE_SIZE,
        cursor,
      });
      for (const candidate of candidates) {
        summary.scanned += 1;
        const outcome = await this.reconcileCandidate(candidate, now);
        summary[outcome] += 1;
      }
      if (candidates.length < STUDENT_CREDENTIAL_EXECUTION_RECOVERY_PAGE_SIZE) {
        return summary;
      }
      const last = candidates[candidates.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
    }
  }

  private async reconcileCandidate(
    candidate: StudentCredentialRecoveryCandidate,
    now: Date,
  ): Promise<keyof Omit<StudentCredentialRecoverySummary, 'scanned'>> {
    const counts = candidate.rowCounts;
    const counted = Object.values(counts).reduce(
      (sum, count) => sum + count,
      0,
    );
    if (
      candidate.totalRows <= 0 ||
      counted !== candidate.totalRows ||
      candidate.rowSchoolMismatch ||
      counts[StudentCredentialRowStatus.PROCESSING] > 0 ||
      counts[StudentCredentialRowStatus.GENERATED] !==
        candidate.generatedRows ||
      counts[StudentCredentialRowStatus.SKIPPED] !== candidate.skippedRows ||
      counts[StudentCredentialRowStatus.FAILED] !== candidate.failedRows ||
      (candidate.status === StudentCredentialBatchStatus.PENDING &&
        (candidate.startedAt !== null ||
          counts[StudentCredentialRowStatus.PENDING] !== candidate.totalRows ||
          candidate.generatedRows !== 0 ||
          candidate.skippedRows !== 0 ||
          candidate.failedRows !== 0 ||
          hasAnyArtifactMetadata(candidate))) ||
      (candidate.status === StudentCredentialBatchStatus.PROCESSING &&
        candidate.startedAt === null)
    ) {
      return 'blockedInvariant';
    }
    if (counts[StudentCredentialRowStatus.PENDING] === 0) {
      await this.repository.finalizeBatch({
        batchId: candidate.id,
        schoolId: candidate.schoolId,
        completedAt: now,
      });
      return 'finalized';
    }
    const recoveryAnchor =
      candidate.status === StudentCredentialBatchStatus.PENDING
        ? candidate.createdAt
        : candidate.startedAt!;
    if (
      recoveryAnchor.getTime() +
        STUDENT_CREDENTIAL_EXECUTION_RECOVERY_WINDOW_MS <=
      now.getTime()
    ) {
      await this.terminalize(
        candidate,
        now,
        STUDENT_CREDENTIAL_EXECUTION_RECOVERY_WINDOW_EXPIRED_CODE,
      );
      return 'terminalized';
    }
    if (!isTenantEligible(candidate)) {
      await this.terminalize(
        candidate,
        now,
        STUDENT_CREDENTIAL_EXECUTION_TENANT_INELIGIBLE_CODE,
      );
      return 'terminalized';
    }
    const ensured = await this.bullmq.ensureJobFromPersistedTruth(
      FILES_IMPORT_QUEUE_NAME,
      STUDENT_CREDENTIAL_BATCH_EXECUTE_JOB_NAME,
      { batchId: candidate.id },
      {
        jobId: studentCredentialBatchExecutionJobId(candidate.id),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    return ensured === 'created' || ensured === 'replaced'
      ? 'restored'
      : 'preserved';
  }

  private async terminalize(
    candidate: StudentCredentialRecoveryCandidate,
    now: Date,
    reasonCode: string,
  ): Promise<void> {
    const current = await this.repository.findExecutionBatchById(candidate.id);
    if (!current?.secretArtifactFileId) {
      await this.artifactService.deletePotentialOrphanSecretArtifact({
        schoolId: candidate.schoolId,
        batchId: candidate.id,
      });
    }
    await this.repository.terminalizeRemainingPendingRows({
      batchId: candidate.id,
      schoolId: candidate.schoolId,
      reasonCode,
      occurredAt: now,
    });
    await this.repository.finalizeBatch({
      batchId: candidate.id,
      schoolId: candidate.schoolId,
      completedAt: now,
    });
  }
}

function hasAnyArtifactMetadata(
  candidate: StudentCredentialRecoveryCandidate,
): boolean {
  return (
    candidate.secretArtifactFileId !== null ||
    candidate.secretArtifactVersion !== null ||
    candidate.secretArtifactStagedAt !== null ||
    candidate.secretArtifactExpiresAt !== null
  );
}

function isTenantEligible(
  candidate: StudentCredentialRecoveryCandidate,
): boolean {
  return (
    candidate.school.id === candidate.schoolId &&
    candidate.school.organizationId === candidate.organizationId &&
    candidate.school.status === SchoolStatus.ACTIVE &&
    candidate.school.deletedAt === null &&
    candidate.school.organization.id === candidate.organizationId &&
    candidate.school.organization.status === OrganizationStatus.ACTIVE &&
    candidate.school.organization.deletedAt === null
  );
}
