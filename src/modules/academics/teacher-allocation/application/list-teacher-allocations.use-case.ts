import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ListTeacherAllocationsQueryDto } from '../dto/teacher-allocation.dto';
import { TeacherAllocationsListResponseDto } from '../dto/teacher-allocation-response.dto';
import { TeacherAllocationRepository } from '../infrastructure/teacher-allocation.repository';
import { presentTeacherAllocations } from '../presenters/teacher-allocation.presenter';

@Injectable()
export class ListTeacherAllocationsUseCase {
  constructor(
    private readonly teacherAllocationRepository: TeacherAllocationRepository,
  ) {}

  async execute(
    query: ListTeacherAllocationsQueryDto,
  ): Promise<TeacherAllocationsListResponseDto> {
    if (query.termId) {
      const term = await this.teacherAllocationRepository.findTermById(query.termId);
      if (!term) {
        throw new NotFoundDomainException('Term not found', {
          termId: query.termId,
        });
      }
    }

    if (query.classroomId) {
      const classroom =
        await this.teacherAllocationRepository.findClassroomById(query.classroomId);
      if (!classroom) {
        throw new NotFoundDomainException('Classroom not found', {
          classroomId: query.classroomId,
        });
      }
    }

    const allocations = await this.teacherAllocationRepository.listAllocations({
      termId: query.termId,
      classroomId: query.classroomId,
    });

    return presentTeacherAllocations(allocations);
  }
}
