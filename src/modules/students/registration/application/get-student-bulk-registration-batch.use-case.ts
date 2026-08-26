import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { readImportJobBatchValidationErrors } from '../../../files/imports/domain/import-job.report';
import { requireStudentsScope } from '../../students/domain/students-scope';
import type { StudentBulkRegistrationBatchDetailResponseDto } from '../dto/student-bulk-registration.dto';
import { StudentBulkRegistrationRepository } from '../infrastructure/student-bulk-registration.repository';

@Injectable()
export class GetStudentBulkRegistrationBatchUseCase {
  constructor(private readonly repository: StudentBulkRegistrationRepository) {}

  async execute(
    batchId: string,
  ): Promise<StudentBulkRegistrationBatchDetailResponseDto> {
    requireStudentsScope();
    const batch = await this.repository.findBatchById(batchId);
    if (!batch) {
      throw new NotFoundDomainException('Bulk registration batch not found', {
        batchId,
      });
    }
    return {
      id: batch.id,
      sourceImportJobId: batch.sourceImportJobId,
      status: batch.status,
      templateVersion: batch.templateVersion,
      placement: {
        academicYearId: batch.academicYearId,
        termId: batch.termId,
        classroomId: batch.classroomId,
        enrollmentDate: batch.enrollmentDate.toISOString().slice(0, 10),
      },
      counters: {
        totalRows: batch.totalRows,
        validRows: batch.validRows,
        invalidRows: batch.invalidRows,
        createdRows: batch.createdRows,
        failedRows: batch.failedRows,
      },
      validatedAt: batch.validatedAt?.toISOString() ?? null,
      validationErrors: readImportJobBatchValidationErrors(
        batch.sourceImportJob.reportJson,
      ),
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    };
  }
}
