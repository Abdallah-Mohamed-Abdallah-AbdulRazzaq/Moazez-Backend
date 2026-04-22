import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { DeleteTeacherAllocationResponseDto } from '../dto/teacher-allocation-response.dto';
import { TeacherAllocationRepository } from '../infrastructure/teacher-allocation.repository';

@Injectable()
export class DeleteTeacherAllocationUseCase {
  constructor(
    private readonly teacherAllocationRepository: TeacherAllocationRepository,
  ) {}

  async execute(
    allocationId: string,
  ): Promise<DeleteTeacherAllocationResponseDto> {
    const allocation =
      await this.teacherAllocationRepository.findAllocationById(allocationId);
    if (!allocation) {
      throw new NotFoundDomainException('Teacher allocation not found', {
        allocationId,
      });
    }

    const result =
      await this.teacherAllocationRepository.deleteAllocation(allocationId);
    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Teacher allocation not found', {
        allocationId,
      });
    }

    return { ok: true };
  }
}
