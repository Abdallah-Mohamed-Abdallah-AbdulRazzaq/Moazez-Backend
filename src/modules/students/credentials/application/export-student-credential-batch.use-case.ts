import { Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  StudentCredentialBatchStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireStudentsScope } from '../../students/domain/students-scope';
import {
  renderStudentCredentialExportCsv,
  type StudentCredentialExportCsvRow,
  type StudentCredentialExportStatus,
} from '../domain/student-credential-export.csv';
import {
  StudentCredentialExecutionInvariantException,
  StudentCredentialExportEmptyException,
  StudentCredentialExportNotReadyException,
} from '../domain/student-credential.exceptions';
import {
  StudentCredentialBatchRepository,
  type StudentCredentialExportRow,
} from '../infrastructure/student-credential-batch.repository';
import { StudentCredentialSecretArtifactService } from './student-credential-secret-artifact.service';

export interface StudentCredentialExportResult {
  body: Buffer;
  filename: string;
}

@Injectable()
export class ExportStudentCredentialBatchUseCase {
  constructor(
    private readonly repository: StudentCredentialBatchRepository,
    private readonly artifactService: StudentCredentialSecretArtifactService,
  ) {}

  async execute(batchId: string): Promise<StudentCredentialExportResult> {
    const scope = requireStudentsScope();
    const batch = await this.repository.findScopedExecutionBatchById(batchId);
    if (
      !batch ||
      batch.schoolId !== scope.schoolId ||
      batch.organizationId !== scope.organizationId
    ) {
      throw new NotFoundDomainException('Credential batch not found');
    }
    if (
      batch.status === StudentCredentialBatchStatus.PENDING ||
      batch.status === StudentCredentialBatchStatus.PROCESSING
    ) {
      throw new StudentCredentialExportNotReadyException();
    }
    if (batch.generatedRows <= 0) {
      throw new StudentCredentialExportEmptyException();
    }
    if (
      batch.status !== StudentCredentialBatchStatus.COMPLETED &&
      batch.status !== StudentCredentialBatchStatus.PARTIAL_FAILED
    ) {
      throw new StudentCredentialExecutionInvariantException(
        'export_terminal_status_invalid',
      );
    }

    const executionRows = await this.repository.listExecutionRows({
      batchId: batch.id,
      schoolId: batch.schoolId,
    });
    const artifact = await this.artifactService.readAndVerify(
      batch,
      executionRows,
      new Date(),
    );
    const rows = await this.repository.listGeneratedExportRows({
      batchId: batch.id,
      schoolId: batch.schoolId,
      organizationId: batch.organizationId,
    });
    if (rows.length !== batch.generatedRows) {
      throw new StudentCredentialExecutionInvariantException(
        'export_generated_row_count_mismatch',
      );
    }
    const artifactEntries = new Map(
      artifact.entries.map((entry) => [entry.rowId, entry]),
    );
    const counts = {
      temporaryCredentialsExported: 0,
      credentialChangedRows: 0,
      accountIneligibleRows: 0,
    };
    const csvRows = rows.map<StudentCredentialExportCsvRow>((row) => {
      const entry = artifactEntries.get(row.id);
      if (!entry) {
        throw new StudentCredentialExecutionInvariantException(
          'export_artifact_entry_missing',
        );
      }
      const credentialStatus = currentCredentialStatus(
        row,
        batch.organizationId,
      );
      if (credentialStatus === 'temporary_credential') {
        counts.temporaryCredentialsExported += 1;
      } else if (credentialStatus === 'credential_changed') {
        counts.credentialChangedRows += 1;
      } else {
        counts.accountIneligibleRows += 1;
      }
      return {
        studentId: row.studentId,
        studentName: `${row.student.firstName} ${row.student.lastName}`.trim(),
        username: row.user?.username ?? '',
        loginEmail: row.user?.email ?? '',
        temporaryPassword:
          credentialStatus === 'temporary_credential'
            ? entry.temporaryPassword
            : '',
        credentialStatus,
        mustChangePassword:
          credentialStatus === 'temporary_credential' ? 'true' : '',
        generatedAt: row.generatedAt?.toISOString() ?? '',
      };
    });
    const body = renderStudentCredentialExportCsv(csvRows);
    await this.repository.recordExportAudit({
      scope,
      batchId: batch.id,
      generatedRows: rows.length,
      ...counts,
    });
    return {
      body,
      filename: `student-credentials-${batch.id}.csv`,
    };
  }
}

function currentCredentialStatus(
  row: StudentCredentialExportRow,
  organizationId: string,
): StudentCredentialExportStatus {
  const user = row.user;
  const identityEligible =
    row.userId !== null &&
    row.credentialVersionAfter !== null &&
    row.generatedAt !== null &&
    row.student.id === row.studentId &&
    row.student.schoolId === row.schoolId &&
    row.student.organizationId === organizationId &&
    row.student.userId === row.userId &&
    row.student.status === StudentStatus.ACTIVE &&
    row.student.deletedAt === null &&
    user !== null &&
    user.id === row.userId &&
    user.userType === UserType.STUDENT &&
    (user.status === UserStatus.ACTIVE || user.status === UserStatus.INVITED) &&
    user.deletedAt === null &&
    user.memberships.some(
      (membership) =>
        membership.schoolId === row.schoolId &&
        membership.organizationId === organizationId &&
        membership.userType === UserType.STUDENT &&
        membership.status === MembershipStatus.ACTIVE &&
        membership.deletedAt === null,
    );
  if (!identityEligible) return 'account_ineligible';
  return user.credentialVersion === row.credentialVersionAfter &&
    user.passwordHash !== null &&
    user.mustChangePassword &&
    user.passwordProvisionedAt?.getTime() === row.generatedAt?.getTime()
    ? 'temporary_credential'
    : 'credential_changed';
}
