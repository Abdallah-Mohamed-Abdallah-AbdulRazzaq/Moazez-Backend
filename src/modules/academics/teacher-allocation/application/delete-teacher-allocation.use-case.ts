import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { DeleteTeacherAllocationResponseDto } from '../dto/teacher-allocation-response.dto';
import {
  TeacherAllocationDeleteConflictException,
  isForeignKeyConstraintError,
} from '../domain/teacher-allocation.exceptions';
import {
  DeleteTeacherAllocationResult,
  TeacherAllocationRepository,
} from '../infrastructure/teacher-allocation.repository';
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

    let result: DeleteTeacherAllocationResult;
    try {
      result =
        await this.teacherAllocationRepository.deleteAllocation(allocationId);
    } catch (error) {
      if (!isForeignKeyConstraintError(error)) throw error;
      const currentCounts =
        await this.teacherAllocationRepository.countAllocationDependencies([
          allocationId,
        ]);
      throw new TeacherAllocationDeleteConflictException({
        allocationId,
        ...dependencyConflictDetails(currentCounts),
      });
    }
    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Teacher allocation not found', {
        allocationId,
      });
    }

    return { ok: true };
  }
}
