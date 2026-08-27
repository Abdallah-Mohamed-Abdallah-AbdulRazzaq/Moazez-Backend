import { Module } from '@nestjs/common';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { AuthModule } from '../../iam/auth/auth.module';
import { CreateStudentCredentialBatchUseCase } from './application/create-student-credential-batch.use-case';
import { ExportStudentCredentialBatchUseCase } from './application/export-student-credential-batch.use-case';
import { GetStudentCredentialBatchUseCase } from './application/get-student-credential-batch.use-case';
import { PreviewStudentCredentialBatchUseCase } from './application/preview-student-credential-batch.use-case';
import { ProcessStudentCredentialBatchUseCase } from './application/process-student-credential-batch.use-case';
import { StudentCredentialAudienceService } from './application/student-credential-audience.service';
import { StudentCredentialBatchReconciliationService } from './application/student-credential-batch-reconciliation.service';
import { StudentCredentialSecretArtifactService } from './application/student-credential-secret-artifact.service';
import { StudentCredentialSecretArtifactCleanupService } from './application/student-credential-secret-artifact-cleanup.service';
import { StudentCredentialBatchController } from './controller/student-credential-batch.controller';
import { StudentCredentialBatchRepository } from './infrastructure/student-credential-batch.repository';

export const STUDENT_CREDENTIAL_RUNTIME_PROVIDERS = [
  StudentCredentialBatchRepository,
  StudentCredentialSecretArtifactService,
  ProcessStudentCredentialBatchUseCase,
  StudentCredentialBatchReconciliationService,
  StudentCredentialSecretArtifactCleanupService,
] as const;

@Module({
  imports: [AuthModule, QueueModule, StorageModule],
  controllers: [StudentCredentialBatchController],
  providers: [
    StudentCredentialBatchRepository,
    StudentCredentialAudienceService,
    StudentCredentialSecretArtifactService,
    PreviewStudentCredentialBatchUseCase,
    CreateStudentCredentialBatchUseCase,
    GetStudentCredentialBatchUseCase,
    ExportStudentCredentialBatchUseCase,
    ProcessStudentCredentialBatchUseCase,
    StudentCredentialBatchReconciliationService,
    StudentCredentialSecretArtifactCleanupService,
  ],
})
export class StudentCredentialsModule {}
