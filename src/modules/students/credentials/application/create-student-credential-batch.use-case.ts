import { Injectable } from '@nestjs/common';
import { StudentCredentialMode } from '@prisma/client';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { FILES_IMPORT_QUEUE_NAME } from '../../../files/imports/domain/import-job.types';
import { requireStudentsScope } from '../../students/domain/students-scope';
import {
  parseStudentCredentialAudience,
  parseStudentCredentialModeSelection,
} from '../domain/student-credential-audience';
import {
  STUDENT_CREDENTIAL_BATCH_EXECUTE_JOB_NAME,
  studentCredentialBatchExecutionJobId,
} from '../domain/student-credential.constants';
import {
  StudentCredentialExecutionInvariantException,
  StudentCredentialNoEligibleStudentsException,
  StudentCredentialSecretArtifactException,
} from '../domain/student-credential.exceptions';
import type { CreateStudentCredentialBatchCommand } from '../domain/student-credential.types';
import type { StudentCredentialBatchResponseDto } from '../dto/student-credential-batch.dto';
import { StudentCredentialBatchRepository } from '../infrastructure/student-credential-batch.repository';
import { presentStudentCredentialBatch } from '../presenters/student-credential-batch.presenter';
import { StudentCredentialAudienceService } from './student-credential-audience.service';
import { StudentCredentialSecretArtifactService } from './student-credential-secret-artifact.service';

@Injectable()
export class CreateStudentCredentialBatchUseCase {
  constructor(
    private readonly audience: StudentCredentialAudienceService,
    private readonly repository: StudentCredentialBatchRepository,
    private readonly bullmq: BullmqService,
    private readonly artifactService: StudentCredentialSecretArtifactService,
  ) {}

  async execute(
    command: CreateStudentCredentialBatchCommand,
  ): Promise<StudentCredentialBatchResponseDto> {
    const scope = requireStudentsScope();
    const selection = parseStudentCredentialAudience(command);
    const modeSelection = parseStudentCredentialModeSelection(command);
    const { credentialMode } = modeSelection;
    const resolution = await this.audience.resolve(scope, selection);
    if (resolution.eligible.length === 0) {
      throw new StudentCredentialNoEligibleStudentsException();
    }
    const batch = await this.repository.createBatch({
      scope,
      selection,
      credentialMode,
      targets: resolution.eligible.map((target) => ({
        studentId: target.studentId,
        userId: target.userId,
        enrollmentId: target.enrollmentId,
        credentialVersion: target.credentialVersion,
      })),
    });
    if (credentialMode === StudentCredentialMode.SHARED_ADMIN_PROVIDED) {
      await this.stageAdminProvidedArtifact({
        batchId: batch.id,
        sharedPassword: modeSelection.sharedPassword!,
      });
    }
    try {
      await this.bullmq.ensureJobFromPersistedTruth(
        FILES_IMPORT_QUEUE_NAME,
        STUDENT_CREDENTIAL_BATCH_EXECUTE_JOB_NAME,
        { batchId: batch.id },
        {
          jobId: studentCredentialBatchExecutionJobId(batch.id),
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== 'queue_redis_unavailable'
      ) {
        throw error;
      }
    }
    return presentStudentCredentialBatch(batch);
  }

  private async stageAdminProvidedArtifact(input: {
    batchId: string;
    sharedPassword: string;
  }): Promise<void> {
    const batch = await this.repository.findExecutionBatchById(input.batchId);
    if (!batch) {
      throw new StudentCredentialExecutionInvariantException(
        'artifact_batch_disappeared',
      );
    }
    const rows = await this.repository.listExecutionRows({
      batchId: batch.id,
      schoolId: batch.schoolId,
    });
    try {
      await this.artifactService.stageAdminProvidedArtifact({
        batch,
        rows,
        sharedPassword: input.sharedPassword,
        now: new Date(),
      });
    } catch (error) {
      const safeError =
        error instanceof StudentCredentialSecretArtifactException
          ? error
          : new StudentCredentialSecretArtifactException(
              'students.credentials.secret_artifact_unavailable',
            );
      const current = await this.repository
        .findExecutionBatchById(batch.id)
        .catch(() => null);
      if (!current?.secretArtifactFileId) {
        try {
          await this.artifactService.deletePotentialOrphanSecretArtifact({
            schoolId: batch.schoolId,
            batchId: batch.id,
          });
        } catch {
          throw safeError;
        }
        await this.repository.terminalizeRemainingPendingRows({
          batchId: batch.id,
          schoolId: batch.schoolId,
          reasonCode: safeError.code,
          occurredAt: new Date(),
        });
        await this.repository.finalizeBatch({
          batchId: batch.id,
          schoolId: batch.schoolId,
          completedAt: new Date(),
        });
      }
      throw safeError;
    }
  }
}
