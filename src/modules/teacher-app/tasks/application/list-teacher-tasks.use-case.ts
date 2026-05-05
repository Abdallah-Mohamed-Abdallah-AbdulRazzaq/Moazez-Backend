import { Injectable } from '@nestjs/common';
import {
  ReinforcementSource,
  ReinforcementTaskStatus,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import {
  ListTeacherTasksQueryDto,
  TeacherTaskSourceQueryValue,
  TeacherTaskStatusQueryValue,
  TeacherTasksListResponseDto,
} from '../dto/teacher-tasks.dto';
import {
  TeacherTaskReadFilters,
  TeacherTasksReadAdapter,
} from '../infrastructure/teacher-tasks-read.adapter';
import { TeacherTasksPresenter } from '../presenters/teacher-tasks.presenter';

const STATUS_FILTERS: Record<
  TeacherTaskStatusQueryValue,
  ReinforcementTaskStatus
> = {
  [TeacherTaskStatusQueryValue.PENDING]: ReinforcementTaskStatus.NOT_COMPLETED,
  [TeacherTaskStatusQueryValue.IN_PROGRESS]:
    ReinforcementTaskStatus.IN_PROGRESS,
  [TeacherTaskStatusQueryValue.UNDER_REVIEW]:
    ReinforcementTaskStatus.UNDER_REVIEW,
  [TeacherTaskStatusQueryValue.COMPLETED]: ReinforcementTaskStatus.COMPLETED,
};

const SOURCE_FILTERS: Record<TeacherTaskSourceQueryValue, ReinforcementSource> =
  {
    [TeacherTaskSourceQueryValue.TEACHER]: ReinforcementSource.TEACHER,
    [TeacherTaskSourceQueryValue.PARENT]: ReinforcementSource.PARENT,
    [TeacherTaskSourceQueryValue.SYSTEM]: ReinforcementSource.SYSTEM,
  };

@Injectable()
export class ListTeacherTasksUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly tasksReadAdapter: TeacherTasksReadAdapter,
  ) {}

  async execute(
    query: ListTeacherTasksQueryDto,
  ): Promise<TeacherTasksListResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations = await this.resolveAllocations(query.classId);

    if (query.studentId) {
      const ownedStudent = await this.tasksReadAdapter.findOwnedStudent({
        allocations,
        studentId: query.studentId,
      });

      if (!ownedStudent) {
        throw new NotFoundDomainException('Teacher task student not found', {
          studentId: query.studentId,
        });
      }
    }

    const result = await this.tasksReadAdapter.listTasks({
      teacherUserId: context.teacherUserId,
      allocations,
      filters: mapFilters(query),
    });

    return TeacherTasksPresenter.presentList({
      tasks: result.items,
      allocations,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    });
  }

  private async resolveAllocations(
    classId?: string,
  ): Promise<TeacherAppAllocationRecord[]> {
    if (classId) {
      return [await this.accessService.assertTeacherOwnsAllocation(classId)];
    }

    const context = this.accessService.assertCurrentTeacher();
    return this.allocationReadAdapter.listAllOwnedAllocations(
      context.teacherUserId,
    );
  }
}

function mapFilters(query: ListTeacherTasksQueryDto): TeacherTaskReadFilters {
  return {
    status: query.status ? STATUS_FILTERS[query.status] : undefined,
    source: query.source ? SOURCE_FILTERS[query.source] : ReinforcementSource.TEACHER,
    studentId: query.studentId,
    search: query.search,
    page: query.page,
    limit: query.limit,
  };
}
