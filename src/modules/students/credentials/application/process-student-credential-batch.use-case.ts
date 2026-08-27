import { Injectable } from '@nestjs/common';
import {
  OrganizationStatus,
  SchoolStatus,
  StudentCredentialBatchStatus,
  StudentCredentialRowStatus,
} from '@prisma/client';
import { PasswordService } from '../../../iam/auth/domain/password.service';
import {
  StudentCredentialExecutionTenantIneligibleException,
  StudentCredentialSecretArtifactException,
} from '../domain/student-credential.exceptions';
import { StudentCredentialBatchRepository } from '../infrastructure/student-credential-batch.repository';
import { StudentCredentialSecretArtifactService } from './student-credential-secret-artifact.service';

@Injectable()
export class ProcessStudentCredentialBatchUseCase {
  constructor(
    private readonly repository: StudentCredentialBatchRepository,
    private readonly artifactService: StudentCredentialSecretArtifactService,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(batchId: string): Promise<void> {
    let batch = await this.repository.findExecutionBatchById(batchId);
    if (!batch || isTerminal(batch.status)) return;
    if (batch.status === StudentCredentialBatchStatus.PENDING) {
      await this.repository.claimBatch({
        batchId: batch.id,
        schoolId: batch.schoolId,
        startedAt: new Date(),
      });
      batch = await this.repository.findExecutionBatchById(batch.id);
    }
    if (!batch || batch.status !== StudentCredentialBatchStatus.PROCESSING) {
      return;
    }

    try {
      if (!isTenantEligible(batch)) {
        throw new StudentCredentialExecutionTenantIneligibleException();
      }
      const rows = await this.repository.listExecutionRows({
        batchId: batch.id,
        schoolId: batch.schoolId,
      });
      const artifact = await this.artifactService.ensureArtifact({
        batch,
        rows,
        now: new Date(),
      });
      const artifactBatch = await this.repository.findExecutionBatchById(
        batch.id,
      );
      if (!artifactBatch?.secretArtifactFileId) {
        throw new StudentCredentialSecretArtifactException(
          'students.credentials.secret_artifact_invalid',
        );
      }
      const entries = new Map(
        artifact.entries.map((entry) => [entry.rowId, entry]),
      );
      const pendingRows = rows.filter(
        (row) => row.status === StudentCredentialRowStatus.PENDING,
      );
      for (const row of pendingRows) {
        const entry = entries.get(row.id);
        if (!entry) {
          throw new StudentCredentialSecretArtifactException(
            'students.credentials.secret_artifact_invalid',
          );
        }
        const passwordHash = await this.passwordService.hash(
          entry.temporaryPassword,
        );
        await this.repository.applyCredentialRow({
          batchId: batch.id,
          schoolId: batch.schoolId,
          rowId: row.id,
          artifactFileId: artifactBatch.secretArtifactFileId,
          artifactVersion: artifact.version,
          artifactEntry: entry,
          passwordHash,
          generatedAt: new Date(),
        });
      }
      await this.repository.finalizeBatch({
        batchId: batch.id,
        schoolId: batch.schoolId,
        completedAt: new Date(),
      });
    } catch (error) {
      if (
        error instanceof StudentCredentialSecretArtifactException ||
        error instanceof StudentCredentialExecutionTenantIneligibleException
      ) {
        const current = await this.repository.findExecutionBatchById(batch.id);
        if (!current?.secretArtifactFileId) {
          await this.artifactService.deletePotentialOrphanSecretArtifact({
            schoolId: batch.schoolId,
            batchId: batch.id,
          });
        }
        await this.repository.terminalizeRemainingPendingRows({
          batchId: batch.id,
          schoolId: batch.schoolId,
          reasonCode: error.code,
          occurredAt: new Date(),
        });
        await this.repository.finalizeBatch({
          batchId: batch.id,
          schoolId: batch.schoolId,
          completedAt: new Date(),
        });
        return;
      }
      throw error;
    }
  }
}

function isTerminal(status: StudentCredentialBatchStatus): boolean {
  return (
    status === StudentCredentialBatchStatus.COMPLETED ||
    status === StudentCredentialBatchStatus.PARTIAL_FAILED ||
    status === StudentCredentialBatchStatus.FAILED
  );
}

function isTenantEligible(batch: {
  schoolId: string;
  organizationId: string;
  school: {
    id: string;
    organizationId: string;
    status: SchoolStatus;
    deletedAt: Date | null;
    organization: {
      id: string;
      status: OrganizationStatus;
      deletedAt: Date | null;
    };
  };
}): boolean {
  return (
    batch.school.id === batch.schoolId &&
    batch.school.organizationId === batch.organizationId &&
    batch.school.status === SchoolStatus.ACTIVE &&
    batch.school.deletedAt === null &&
    batch.school.organization.id === batch.organizationId &&
    batch.school.organization.status === OrganizationStatus.ACTIVE &&
    batch.school.organization.deletedAt === null
  );
}
