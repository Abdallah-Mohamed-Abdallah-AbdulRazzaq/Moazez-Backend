import { Injectable } from '@nestjs/common';
import { HomeworkAssignmentNotFoundException } from '../../../homework/domain/homework.exceptions';
import { HomeworkAssignmentResponseDto } from '../../../homework/dto/homework-assignment-response.dto';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { TeacherHomeworksReadAdapter } from '../infrastructure/teacher-homeworks-read.adapter';

export interface TeacherHomeworkOwnedClassContext {
  teacherUserId: string;
  allocation: TeacherAppAllocationRecord;
}

@Injectable()
export class TeacherHomeworkOwnershipService {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly readAdapter: TeacherHomeworksReadAdapter,
  ) {}

  async resolveOwnedClass(
    classId: string,
  ): Promise<TeacherHomeworkOwnedClassContext> {
    const context = this.accessService.assertCurrentTeacher();
    const allocation =
      await this.accessService.assertTeacherOwnsAllocation(classId);

    return {
      teacherUserId: context.teacherUserId,
      allocation,
    };
  }

  async resolveOwnedHomework(params: {
    classId: string;
    homeworkId: string;
  }): Promise<TeacherHomeworkOwnedClassContext> {
    const context = await this.resolveOwnedClass(params.classId);
    const assignment = await this.readAdapter.findOwnedAssignmentBoundary({
      teacherUserId: context.teacherUserId,
      classId: context.allocation.id,
      homeworkId: params.homeworkId,
    });

    if (!assignment) {
      throw new HomeworkAssignmentNotFoundException({
        homeworkId: params.homeworkId,
        classId: params.classId,
      });
    }

    return context;
  }

  assertAssignmentResponseBelongsToClass(params: {
    assignment: HomeworkAssignmentResponseDto;
    classId: string;
    homeworkId?: string;
  }): void {
    if (params.assignment.teacherSubjectAllocationId === params.classId) {
      return;
    }

    throw new HomeworkAssignmentNotFoundException({
      homeworkId: params.homeworkId ?? params.assignment.id,
      classId: params.classId,
    });
  }
}
