import { Injectable } from '@nestjs/common';
import {
  ImportJobStatus,
  OrganizationStatus,
  SchoolStatus,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
} from '@prisma/client';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import {
  FILES_IMPORT_QUEUE_NAME,
  STUDENT_BULK_REGISTRATION_EXECUTE_JOB_NAME,
  studentBulkRegistrationExecutionJobId,
} from '../../../files/imports/domain/import-job.types';
import { STUDENTS_BULK_REGISTRATION_IMPORT_TYPE } from '../../../files/imports/domain/import-upload.constraints';
import {
  STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_PAGE_SIZE,
  STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_EXPIRED_CODE,
  STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_MS,
  STUDENT_BULK_REGISTRATION_EXECUTION_TENANT_INELIGIBLE_CODE,
} from '../domain/student-bulk-registration.constants';
import { readStudentBulkRegistrationExecutionMetadata } from '../domain/student-bulk-registration-execution.metadata';
import {
  StudentBulkRegistrationExecutionRepository,
  type StudentBulkRegistrationExecutionRecoveryCandidate,
} from '../infrastructure/student-bulk-registration-execution.repository';

export type StudentBulkRegistrationExecutionRecoveryOutcome =
  | 'blocked_invariant'
  | 'finalized'
  | 'terminalized_window_expired'
  | 'terminalized_tenant_ineligible'
  | 'job_created'
  | 'job_replaced'
  | 'job_preserved'
  | 'job_replacement_contended';

export interface StudentBulkRegistrationExecutionRecoverySummary {
  scanned: number;
  blockedInvariant: number;
  finalized: number;
  terminalized: number;
  restored: number;
  preserved: number;
}

@Injectable()
export class StudentBulkRegistrationExecutionReconciliationService {
  constructor(
    private readonly repository: StudentBulkRegistrationExecutionRepository,
    private readonly bullmqService: BullmqService,
  ) {}

  async reconcile(
    now = new Date(),
  ): Promise<StudentBulkRegistrationExecutionRecoverySummary> {
    const summary: StudentBulkRegistrationExecutionRecoverySummary = {
      scanned: 0,
      blockedInvariant: 0,
      finalized: 0,
      terminalized: 0,
      restored: 0,
      preserved: 0,
    };
    let cursor: { createdAt: Date; id: string } | undefined;

    for (;;) {
      const candidates = await this.repository.listExecutionRecoveryCandidates({
        createdBefore: now,
        cursor,
        limit: STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_PAGE_SIZE,
      });
      for (const candidate of candidates) {
        const outcome = await this.reconcileCandidate(candidate, now);
        summary.scanned += 1;
        if (outcome === 'blocked_invariant') summary.blockedInvariant += 1;
        else if (outcome === 'finalized') summary.finalized += 1;
        else if (outcome.startsWith('terminalized_')) summary.terminalized += 1;
        else if (outcome === 'job_created' || outcome === 'job_replaced') {
          summary.restored += 1;
        } else {
          summary.preserved += 1;
        }
      }
      if (
        candidates.length <
        STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_PAGE_SIZE
      ) {
        return summary;
      }
      const last = candidates[candidates.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
    }
  }

  async reconcileCandidate(
    candidate: StudentBulkRegistrationExecutionRecoveryCandidate,
    now: Date,
  ): Promise<StudentBulkRegistrationExecutionRecoveryOutcome> {
    if (!hasValidPersistedExecutionState(candidate)) {
      return 'blocked_invariant';
    }

    const remainingValidRows =
      candidate.rowCounts[StudentBulkRegistrationRowStatus.VALID];
    if (remainingValidRows === 0) {
      await this.repository.finalizeExecution({
        batchId: candidate.id,
        schoolId: candidate.schoolId,
      });
      return 'finalized';
    }

    if (
      candidate.startedAt!.getTime() +
        STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_MS <=
      now.getTime()
    ) {
      await this.terminalizeAndFinalize(
        candidate,
        STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_EXPIRED_CODE,
      );
      return 'terminalized_window_expired';
    }

    if (!isExecutionTenantEligible(candidate)) {
      await this.terminalizeAndFinalize(
        candidate,
        STUDENT_BULK_REGISTRATION_EXECUTION_TENANT_INELIGIBLE_CODE,
      );
      return 'terminalized_tenant_ineligible';
    }

    const ensured = await this.bullmqService.ensureJobFromPersistedTruth(
      FILES_IMPORT_QUEUE_NAME,
      STUDENT_BULK_REGISTRATION_EXECUTE_JOB_NAME,
      { batchId: candidate.id },
      {
        jobId: studentBulkRegistrationExecutionJobId(candidate.id),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    switch (ensured) {
      case 'created':
        return 'job_created';
      case 'replaced':
        return 'job_replaced';
      case 'replacement_contended':
        return 'job_replacement_contended';
      default:
        return 'job_preserved';
    }
  }

  private async terminalizeAndFinalize(
    candidate: StudentBulkRegistrationExecutionRecoveryCandidate,
    reasonCode:
      | typeof STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_EXPIRED_CODE
      | typeof STUDENT_BULK_REGISTRATION_EXECUTION_TENANT_INELIGIBLE_CODE,
  ): Promise<void> {
    await this.repository.terminalizeRemainingValidRows({
      batchId: candidate.id,
      schoolId: candidate.schoolId,
      reasonCode,
    });
    await this.repository.finalizeExecution({
      batchId: candidate.id,
      schoolId: candidate.schoolId,
    });
  }
}

function hasValidPersistedExecutionState(
  candidate: StudentBulkRegistrationExecutionRecoveryCandidate,
): boolean {
  const counts = candidate.rowCounts;
  const countedRows = Object.values(counts).reduce(
    (total, count) => total + count,
    0,
  );
  return (
    candidate.status === StudentBulkRegistrationBatchStatus.EXECUTING &&
    candidate.startedAt !== null &&
    candidate.completedAt === null &&
    candidate.totalRows > 0 &&
    candidate.invalidRows === 0 &&
    candidate.validRows === candidate.totalRows &&
    !candidate.rowSchoolMismatch &&
    countedRows === candidate.totalRows &&
    counts[StudentBulkRegistrationRowStatus.PENDING] === 0 &&
    counts[StudentBulkRegistrationRowStatus.INVALID] === 0 &&
    counts[StudentBulkRegistrationRowStatus.PROCESSING] === 0 &&
    counts[StudentBulkRegistrationRowStatus.VALID] +
      counts[StudentBulkRegistrationRowStatus.CREATED] +
      counts[StudentBulkRegistrationRowStatus.FAILED] ===
      candidate.validRows &&
    counts[StudentBulkRegistrationRowStatus.CREATED] ===
      candidate.createdRows &&
    counts[StudentBulkRegistrationRowStatus.FAILED] === candidate.failedRows &&
    candidate.sourceImportJob.id === candidate.sourceImportJobId &&
    candidate.sourceImportJob.schoolId === candidate.schoolId &&
    candidate.sourceImportJob.type === STUDENTS_BULK_REGISTRATION_IMPORT_TYPE &&
    candidate.sourceImportJob.status === ImportJobStatus.COMPLETED &&
    candidate.school.id === candidate.schoolId &&
    candidate.school.organizationId === candidate.organizationId &&
    candidate.school.organization.id === candidate.organizationId &&
    readStudentBulkRegistrationExecutionMetadata(
      candidate.sourceImportJob.reportJson,
    ) !== null
  );
}

function isExecutionTenantEligible(
  candidate: StudentBulkRegistrationExecutionRecoveryCandidate,
): boolean {
  return (
    candidate.school.status === SchoolStatus.ACTIVE &&
    candidate.school.deletedAt === null &&
    candidate.school.organization.status === OrganizationStatus.ACTIVE &&
    candidate.school.organization.deletedAt === null
  );
}
