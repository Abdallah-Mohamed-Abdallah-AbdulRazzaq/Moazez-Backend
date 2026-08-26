import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireStudentsScope } from '../../students/domain/students-scope';
import type {
  ListStudentBulkRegistrationRowsQueryDto,
  StudentBulkRegistrationRowsResponseDto,
} from '../dto/student-bulk-registration.dto';
import {
  isStudentBulkRegistrationNormalizedData,
  isStudentBulkRegistrationRowErrors,
} from '../domain/student-bulk-registration-csv';
import { StudentBulkRegistrationRepository } from '../infrastructure/student-bulk-registration.repository';

@Injectable()
export class ListStudentBulkRegistrationRowsUseCase {
  constructor(private readonly repository: StudentBulkRegistrationRepository) {}

  async execute(
    batchId: string,
    query: ListStudentBulkRegistrationRowsQueryDto,
  ): Promise<StudentBulkRegistrationRowsResponseDto> {
    requireStudentsScope();
    const result = await this.repository.listRows({
      batchId,
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
    if (!result.batchFound) {
      throw new NotFoundDomainException('Bulk registration batch not found', {
        batchId,
      });
    }
    return {
      items: result.items.map((row) => {
        if (!isStudentBulkRegistrationNormalizedData(row.normalizedDataJson)) {
          throw new Error('bulk_registration_normalized_data_invalid');
        }
        const errors = row.errorsJson ?? [];
        if (!isStudentBulkRegistrationRowErrors(errors)) {
          throw new Error('bulk_registration_row_errors_invalid');
        }
        return {
          id: row.id,
          rowNumber: row.rowNumber,
          status: row.status,
          normalizedData: row.normalizedDataJson,
          errors,
          studentId: row.studentId,
          userId: row.userId,
          enrollmentId: row.enrollmentId,
        };
      }),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
