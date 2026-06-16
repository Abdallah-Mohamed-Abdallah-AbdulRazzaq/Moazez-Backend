import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { DeleteTeacherAllocationResponseDto } from '../dto/teacher-allocation-response.dto';
import {
  TeacherAllocationDeleteConflictException,
} from '../domain/teacher-allocation.exceptions';
import { TeacherAllocationRepository } from '../infrastructure/teacher-allocation.repository';
import {
  assertTermWritable,
  dependencyConflictDetails,
  hasDependencyCounts,
} from './teacher-allocation-use-case.helpers';

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
    assertTermWritable(allocation.term, allocation.termId);

    const dependencyCounts =
      await this.teacherAllocationRepository.countAllocationDependencies([
        allocationId,
      ]);
    if (hasDependencyCounts(dependencyCounts)) {
      throw new TeacherAllocationDeleteConflictException({
        allocationId,
        ...dependencyConflictDetails(dependencyCounts),
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
