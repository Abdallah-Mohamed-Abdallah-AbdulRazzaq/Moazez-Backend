import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { BulkSaveTeacherAllocationsDto } from '../dto/teacher-allocation.dto';
import { TeacherAllocationsBulkResponseDto } from '../dto/teacher-allocation-response.dto';
import {
  isUniqueConstraintError,
  TeacherAllocationConflictException,
} from '../domain/teacher-allocation.exceptions';
import { TeacherAllocationRepository } from '../infrastructure/teacher-allocation.repository';
import { presentTeacherAllocations } from '../presenters/teacher-allocation.presenter';
import {
  assertNoDuplicateAllocationPairs,
  assertTermWritable,
  assertValidBulkSize,
  validateTeacherAllocationCandidates,
} from './teacher-allocation-use-case.helpers';

@Injectable()
export class BulkSaveTeacherAllocationsUseCase {
  constructor(
    private readonly teacherAllocationRepository: TeacherAllocationRepository,
  ) {}

  async execute(
    command: BulkSaveTeacherAllocationsDto,
  ): Promise<TeacherAllocationsBulkResponseDto> {
    const scope = requireAcademicsScope();
    assertValidBulkSize(command.items);
    assertNoDuplicateAllocationPairs(command.items, command.termId);

    const term = assertTermWritable(
      await this.teacherAllocationRepository.findTermById(command.termId),
      command.termId,
    );
    await validateTeacherAllocationCandidates(
      this.teacherAllocationRepository,
      term.id,
      command.items,
    );

    try {
      const result = await this.teacherAllocationRepository.bulkSaveAllocations({
        schoolId: scope.schoolId,
        termId: term.id,
        items: command.items.map((item) => ({
          teacherUserId: item.teacherUserId,
          subjectId: item.subjectId,
          classroomId: item.classroomId,
        })),
      });

      return {
        ...presentTeacherAllocations(result.allocations),
        summary: {
          requestedCount: command.items.length,
          createdCount: result.createdCount,
          existingCount: result.existingCount,
        },
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new TeacherAllocationConflictException({ termId: term.id });
      }

      throw error;
    }
  }
}
