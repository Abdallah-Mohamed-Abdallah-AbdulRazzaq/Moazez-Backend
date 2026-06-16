import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { CreateTeacherAllocationDto } from '../dto/teacher-allocation.dto';
import { TeacherAllocationResponseDto } from '../dto/teacher-allocation-response.dto';
import {
  isUniqueConstraintError,
  TeacherAllocationConflictException,
} from '../domain/teacher-allocation.exceptions';
import { TeacherAllocationRepository } from '../infrastructure/teacher-allocation.repository';
import { presentTeacherAllocation } from '../presenters/teacher-allocation.presenter';
import {
  assertNoDuplicateAllocationPairs,
  assertTermWritable,
  validateTeacherAllocationCandidates,
} from './teacher-allocation-use-case.helpers';

@Injectable()
export class CreateTeacherAllocationUseCase {
  constructor(
    private readonly teacherAllocationRepository: TeacherAllocationRepository,
  ) {}

  async execute(
    command: CreateTeacherAllocationDto,
  ): Promise<TeacherAllocationResponseDto> {
    const scope = requireAcademicsScope();

    const term = assertTermWritable(
      await this.teacherAllocationRepository.findTermById(command.termId),
      command.termId,
    );
    const candidates = [
      {
        teacherUserId: command.teacherUserId,
        subjectId: command.subjectId,
        classroomId: command.classroomId,
      },
    ];
    assertNoDuplicateAllocationPairs(candidates, term.id);
    await validateTeacherAllocationCandidates(
      this.teacherAllocationRepository,
      term.id,
      candidates,
    );

    try {
      const allocation = await this.teacherAllocationRepository.createAllocation({
        schoolId: scope.schoolId,
        teacherUserId: command.teacherUserId,
        subjectId: command.subjectId,
        classroomId: command.classroomId,
        termId: command.termId,
      });

      return presentTeacherAllocation(allocation);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new TeacherAllocationConflictException();
      }

      throw error;
    }
  }
}
