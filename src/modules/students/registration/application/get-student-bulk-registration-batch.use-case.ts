import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireStudentsScope } from '../../students/domain/students-scope';
import type { StudentBulkRegistrationBatchDetailResponseDto } from '../dto/student-bulk-registration.dto';
import { StudentBulkRegistrationRepository } from '../infrastructure/student-bulk-registration.repository';
import { presentStudentBulkRegistrationBatchDetail } from '../presenters/student-bulk-registration.presenter';

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
    return presentStudentBulkRegistrationBatchDetail(batch);
  }
}
