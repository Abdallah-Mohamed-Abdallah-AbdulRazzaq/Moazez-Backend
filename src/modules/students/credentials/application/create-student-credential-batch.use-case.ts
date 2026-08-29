import { Injectable } from '@nestjs/common';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { FILES_IMPORT_QUEUE_NAME } from '../../../files/imports/domain/import-job.types';
import { requireStudentsScope } from '../../students/domain/students-scope';
import {
  parseStudentCredentialAudience,
  parseStudentCredentialMode,
} from '../domain/student-credential-audience';
import {
  STUDENT_CREDENTIAL_BATCH_EXECUTE_JOB_NAME,
  studentCredentialBatchExecutionJobId,
} from '../domain/student-credential.constants';
import { StudentCredentialNoEligibleStudentsException } from '../domain/student-credential.exceptions';
import type { CreateStudentCredentialBatchCommand } from '../domain/student-credential.types';
import type { StudentCredentialBatchResponseDto } from '../dto/student-credential-batch.dto';
import { StudentCredentialBatchRepository } from '../infrastructure/student-credential-batch.repository';
import { presentStudentCredentialBatch } from '../presenters/student-credential-batch.presenter';
import { StudentCredentialAudienceService } from './student-credential-audience.service';

@Injectable()
export class CreateStudentCredentialBatchUseCase {
  constructor(
    private readonly audience: StudentCredentialAudienceService,
    private readonly repository: StudentCredentialBatchRepository,
    private readonly bullmq: BullmqService,
  ) {}

  async execute(
    command: CreateStudentCredentialBatchCommand,
  ): Promise<StudentCredentialBatchResponseDto> {
    const scope = requireStudentsScope();
    const selection = parseStudentCredentialAudience(command);
    const credentialMode = parseStudentCredentialMode(command);
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
}
