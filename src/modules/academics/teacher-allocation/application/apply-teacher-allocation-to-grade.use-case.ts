import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { ApplyTeacherAllocationToGradeDto } from '../dto/teacher-allocation.dto';
import { ApplyTeacherAllocationToGradeResponseDto } from '../dto/teacher-allocation-response.dto';
import {
  TeacherAllocationInvalidScopeException,
  TeacherAllocationMissingSubjectAllocationException,
} from '../domain/teacher-allocation.exceptions';
import { TeacherAllocationRepository } from '../infrastructure/teacher-allocation.repository';
import { presentTeacherAllocations } from '../presenters/teacher-allocation.presenter';
import {
  assertNoDuplicateAllocationPairs,
  assertNoDuplicateClassroomIds,
  assertTermWritable,
  validateTeacherAllocationCandidates,
} from './teacher-allocation-use-case.helpers';

@Injectable()
export class ApplyTeacherAllocationToGradeUseCase {
  constructor(
    private readonly teacherAllocationRepository: TeacherAllocationRepository,
  ) {}

  async execute(
    command: ApplyTeacherAllocationToGradeDto,
  ): Promise<ApplyTeacherAllocationToGradeResponseDto> {
    const scope = requireAcademicsScope();
    const term = assertTermWritable(
      await this.teacherAllocationRepository.findTermById(command.termId),
      command.termId,
    );

    const [grade, subjectAllocation] = await Promise.all([
      this.teacherAllocationRepository.findGradeById(command.gradeId),
      this.teacherAllocationRepository.findSubjectAllocationByKey({
        termId: term.id,
        gradeId: command.gradeId,
        subjectId: command.subjectId,
      }),
    ]);
    if (!grade) {
      throw new TeacherAllocationInvalidScopeException({
        gradeId: command.gradeId,
      });
    }
    if (!subjectAllocation) {
      throw new TeacherAllocationMissingSubjectAllocationException({
        termId: term.id,
        gradeId: command.gradeId,
        subjectId: command.subjectId,
      });
    }

    const classrooms = command.classroomIds
      ? await this.resolveRequestedClassrooms(command.gradeId, command.classroomIds)
      : await this.teacherAllocationRepository.findClassroomsByGradeId(
          command.gradeId,
        );

    const items = classrooms.map((classroom) => ({
      teacherUserId: command.teacherUserId,
      subjectId: command.subjectId,
      classroomId: classroom.id,
    }));
    assertNoDuplicateAllocationPairs(items, term.id);
    await validateTeacherAllocationCandidates(
      this.teacherAllocationRepository,
      term.id,
      items,
    );

    const result = await this.teacherAllocationRepository.bulkSaveAllocations({
      schoolId: scope.schoolId,
      termId: term.id,
      items,
    });

    return {
      ...presentTeacherAllocations(result.allocations),
      summary: {
        requestedClassrooms: classrooms.length,
        createdCount: result.createdCount,
        existingCount: result.existingCount,
      },
    };
  }

  private async resolveRequestedClassrooms(
    gradeId: string,
    classroomIds: string[],
  ) {
    assertNoDuplicateClassroomIds(classroomIds);

    const classrooms =
      await this.teacherAllocationRepository.findClassroomsByIds(classroomIds);
    const classroomById = new Map(
      classrooms.map((classroom) => [classroom.id, classroom]),
    );

    for (const classroomId of classroomIds) {
      const classroom = classroomById.get(classroomId);
      if (!classroom || classroom.section.gradeId !== gradeId) {
        throw new TeacherAllocationInvalidScopeException({
          gradeId,
          classroomId,
        });
      }
    }

    return classroomIds.map((classroomId) => classroomById.get(classroomId)!);
  }
}
