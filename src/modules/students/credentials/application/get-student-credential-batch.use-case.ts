import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireStudentsScope } from '../../students/domain/students-scope';
import type { StudentCredentialBatchResponseDto } from '../dto/student-credential-batch.dto';
import { StudentCredentialBatchRepository } from '../infrastructure/student-credential-batch.repository';
import { presentStudentCredentialBatch } from '../presenters/student-credential-batch.presenter';

@Injectable()
export class GetStudentCredentialBatchUseCase {
  constructor(private readonly repository: StudentCredentialBatchRepository) {}

  async execute(batchId: string): Promise<StudentCredentialBatchResponseDto> {
    requireStudentsScope();
    const batch = await this.repository.findScopedBatchById(batchId);
    if (!batch) throw new NotFoundDomainException('Credential batch not found');
    return presentStudentCredentialBatch(batch);
  }
}
