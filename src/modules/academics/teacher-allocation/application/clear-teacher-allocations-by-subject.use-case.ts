import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { ClearTeacherAllocationsBySubjectDto } from '../dto/teacher-allocation.dto';
import { ClearTeacherAllocationsResponseDto } from '../dto/teacher-allocation-response.dto';
import {
  TeacherAllocationClearConflictException,
  TeacherAllocationInvalidScopeException,
} from '../domain/teacher-allocation.exceptions';
import { TeacherAllocationRepository } from '../infrastructure/teacher-allocation.repository';
import {
  assertNoDuplicateClassroomIds,
  assertTermWritable,
  dependencyConflictDetails,
} from './teacher-allocation-use-case.helpers';

@Injectable()
export class ClearTeacherAllocationsBySubjectUseCase {
  constructor(
    private readonly teacherAllocationRepository: TeacherAllocationRepository,
  ) {}

  async execute(
    command: ClearTeacherAllocationsBySubjectDto,
  ): Promise<ClearTeacherAllocationsResponseDto> {
    requireAcademicsScope();

    const term = assertTermWritable(
      await this.teacherAllocationRepository.findTermById(command.termId),
      command.termId,
    );

    const subject = await this.teacherAllocationRepository.findSubjectById(
      command.subjectId,
    );
    if (!subject) {
      throw new TeacherAllocationInvalidScopeException({
        subjectId: command.subjectId,
      });
    }

    let classroomIds: string[] | undefined;
    if (command.gradeId) {
      const grade = await this.teacherAllocationRepository.findGradeById(
        command.gradeId,
      );
      if (!grade) {
        throw new TeacherAllocationInvalidScopeException({
          gradeId: command.gradeId,
        });
      }
    }

    if (command.classroomIds) {
      assertNoDuplicateClassroomIds(command.classroomIds);
      const classrooms =
        await this.teacherAllocationRepository.findClassroomsByIds(
          command.classroomIds,
        );
      const classroomById = new Map(
        classrooms.map((classroom) => [classroom.id, classroom]),
      );
      for (const classroomId of command.classroomIds) {
        const classroom = classroomById.get(classroomId);
        if (
          !classroom ||
          (command.gradeId && classroom.section.gradeId !== command.gradeId)
        ) {
          throw new TeacherAllocationInvalidScopeException({
            gradeId: command.gradeId,
            classroomId,
          });
        }
      }
      classroomIds = command.classroomIds;
    } else if (command.gradeId) {
      classroomIds = (
        await this.teacherAllocationRepository.findClassroomsByGradeId(
          command.gradeId,
        )
      ).map((classroom) => classroom.id);
    }

    const result =
      await this.teacherAllocationRepository.clearSubjectAllocations({
        termId: term.id,
        subjectId: command.subjectId,
        classroomIds,
      });

    if (result.status === 'conflict') {
      throw new TeacherAllocationClearConflictException({
        allocationIds: result.allocationIds,
        ...dependencyConflictDetails(result.dependencyCounts),
      });
    }

    return { ok: true, deletedCount: result.deletedCount };
  }
}
