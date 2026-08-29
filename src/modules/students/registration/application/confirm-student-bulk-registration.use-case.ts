import { Injectable } from '@nestjs/common';
import {
  ImportJobStatus,
  SchoolLoginSettingsStatus,
  StudentBulkRegistrationBatchStatus,
} from '@prisma/client';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  FILES_IMPORT_QUEUE_NAME,
  STUDENT_BULK_REGISTRATION_EXECUTE_JOB_NAME,
  studentBulkRegistrationExecutionJobId,
} from '../../../files/imports/domain/import-job.types';
import {
  LoginDomainInvalidException,
  LoginIdentityNotConfiguredException,
} from '../../../settings/login-identity/domain/login-identity.exceptions';
import {
  normalizeLoginDomain,
  validateLoginDomain,
} from '../../../settings/login-identity/domain/login-identity.policy';
import { LoginIdentityRepository } from '../../../settings/login-identity/infrastructure/login-identity.repository';
import { UsersRepository } from '../../../settings/users/infrastructure/users.repository';
import { StudentRoleMissingException } from '../../account/domain/account-linking.exceptions';
import { requireStudentsScope } from '../../students/domain/students-scope';
import type { StudentBulkRegistrationBatchDetailResponseDto } from '../dto/student-bulk-registration.dto';
import {
  appendStudentBulkRegistrationExecutionMetadata,
  type StudentBulkRegistrationExecutionMetadata,
} from '../domain/student-bulk-registration-execution.metadata';
import {
  StudentBulkRegistrationConfirmConflictException,
  StudentBulkRegistrationExecutionInvariantException,
  StudentBulkRegistrationExecutionMetadataException,
} from '../domain/student-bulk-registration.exceptions';
import { StudentBulkRegistrationPlacementService } from '../domain/student-bulk-registration-placement.service';
import { StudentBulkRegistrationExecutionRepository } from '../infrastructure/student-bulk-registration-execution.repository';
import type { StudentBulkRegistrationBatchRecord } from '../infrastructure/student-bulk-registration.repository';
import { StudentBulkRegistrationRepository } from '../infrastructure/student-bulk-registration.repository';
import { presentStudentBulkRegistrationBatchDetail } from '../presenters/student-bulk-registration.presenter';

@Injectable()
export class ConfirmStudentBulkRegistrationUseCase {
  constructor(
    private readonly repository: StudentBulkRegistrationRepository,
    private readonly executionRepository: StudentBulkRegistrationExecutionRepository,
    private readonly placementService: StudentBulkRegistrationPlacementService,
    private readonly loginIdentityRepository: LoginIdentityRepository,
    private readonly usersRepository: UsersRepository,
    private readonly bullmqService: BullmqService,
  ) {}

  async execute(
    batchId: string,
  ): Promise<StudentBulkRegistrationBatchDetailResponseDto> {
    const scope = requireStudentsScope();
    let batch = await this.repository.findBatchById(batchId);
    if (!batch) {
      throw new NotFoundDomainException('Bulk registration batch not found', {
        batchId,
      });
    }

    if (batch.status === StudentBulkRegistrationBatchStatus.COMPLETED) {
      return presentStudentBulkRegistrationBatchDetail(batch);
    }
    if (batch.status === StudentBulkRegistrationBatchStatus.EXECUTING) {
      await this.ensureExecutionJob(batch.id);
      return presentStudentBulkRegistrationBatchDetail(batch);
    }
    if (batch.status !== StudentBulkRegistrationBatchStatus.READY) {
      throw new StudentBulkRegistrationConfirmConflictException({
        batchId,
        status: batch.status,
      });
    }

    await this.assertReadyInvariant(batch);
    await this.placementService.resolveForValidation(
      {
        academicYearId: batch.academicYearId,
        termId: batch.termId ?? undefined,
        classroomId: batch.classroomId,
        enrollmentDate: batch.enrollmentDate.toISOString().slice(0, 10),
      },
      batch.validRows,
    );
    const settings = await this.loginIdentityRepository.findCurrentSettings();
    if (!settings || settings.status !== SchoolLoginSettingsStatus.ACTIVE) {
      throw new LoginIdentityNotConfiguredException();
    }
    const domain = validateLoginDomain(settings.loginDomain);
    if (!domain.valid) {
      throw new LoginDomainInvalidException(
        domain.reason ?? 'login_domain_invalid_format',
      );
    }
    const studentRole = await this.usersRepository.findAssignableRoleByKey(
      scope.schoolId,
      'student',
    );
    if (!studentRole || studentRole.key !== 'student') {
      throw new StudentRoleMissingException();
    }

    const startedAt = new Date();
    const metadata: StudentBulkRegistrationExecutionMetadata = {
      requestedById: scope.actorId,
      requestedByUserType: scope.userType,
      requestedAt: startedAt.toISOString(),
      loginDomain: normalizeLoginDomain(settings.loginDomain),
      studentRoleId: studentRole.id,
    };
    const reportJson = appendStudentBulkRegistrationExecutionMetadata(
      batch.sourceImportJob.reportJson,
      metadata,
    );
    if (!reportJson) {
      throw new StudentBulkRegistrationExecutionMetadataException();
    }

    const claimed = await this.executionRepository.claimExecution({
      batchId: batch.id,
      schoolId: scope.schoolId,
      organizationId: scope.organizationId,
      sourceImportJobId: batch.sourceImportJobId,
      reportJson,
      actorId: scope.actorId,
      actorUserType: scope.userType,
      validRows: batch.validRows,
      academicYearId: batch.academicYearId,
      classroomId: batch.classroomId,
      startedAt,
    });

    batch = await this.repository.findBatchById(batch.id);
    if (!batch) {
      throw new StudentBulkRegistrationExecutionInvariantException({
        field: 'batch',
      });
    }
    if (
      !claimed &&
      batch.status === StudentBulkRegistrationBatchStatus.COMPLETED
    ) {
      return presentStudentBulkRegistrationBatchDetail(batch);
    }
    if (batch.status !== StudentBulkRegistrationBatchStatus.EXECUTING) {
      throw new StudentBulkRegistrationConfirmConflictException({
        batchId,
        status: batch.status,
      });
    }

    await this.ensureExecutionJob(batch.id);
    return presentStudentBulkRegistrationBatchDetail(batch);
  }

  private async assertReadyInvariant(
    batch: StudentBulkRegistrationBatchRecord,
  ): Promise<void> {
    const counts = await this.repository.countRowsByStatus(batch.id);
    if (
      batch.sourceImportJob.status !== ImportJobStatus.COMPLETED ||
      batch.totalRows <= 0 ||
      batch.invalidRows !== 0 ||
      batch.validRows !== batch.totalRows ||
      batch.createdRows !== 0 ||
      batch.failedRows !== 0 ||
      counts.VALID !== batch.totalRows ||
      counts.PENDING !== 0 ||
      counts.INVALID !== 0 ||
      counts.PROCESSING !== 0 ||
      counts.CREATED !== 0 ||
      counts.FAILED !== 0
    ) {
      throw new StudentBulkRegistrationExecutionInvariantException({
        batchId: batch.id,
      });
    }
  }

  private ensureExecutionJob(batchId: string): Promise<unknown> {
    return this.bullmqService.ensureJobFromPersistedTruth(
      FILES_IMPORT_QUEUE_NAME,
      STUDENT_BULK_REGISTRATION_EXECUTE_JOB_NAME,
      { batchId },
      {
        jobId: studentBulkRegistrationExecutionJobId(batchId),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }
}
