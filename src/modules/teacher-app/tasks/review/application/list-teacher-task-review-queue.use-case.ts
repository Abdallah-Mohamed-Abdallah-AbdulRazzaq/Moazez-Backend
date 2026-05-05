import { Injectable } from '@nestjs/common';
import { ReinforcementSubmissionStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../../common/exceptions/domain-exception';
import { TeacherAppAllocationReadAdapter } from '../../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';
import {
  ListTeacherTaskReviewQueueQueryDto,
  TeacherTaskReviewQueueResponseDto,
  TeacherTaskReviewStatusQueryValue,
} from '../dto/teacher-task-review-queue.dto';
import {
  TeacherTaskReviewReadAdapter,
  TeacherTaskReviewReadFilters,
} from '../infrastructure/teacher-task-review-read.adapter';
import { TeacherTaskReviewPresenter } from '../presenters/teacher-task-review.presenter';

const STATUS_FILTERS: Record<
  TeacherTaskReviewStatusQueryValue,
  ReinforcementSubmissionStatus
> = {
  [TeacherTaskReviewStatusQueryValue.PENDING]:
    ReinforcementSubmissionStatus.PENDING,
  [TeacherTaskReviewStatusQueryValue.SUBMITTED]:
    ReinforcementSubmissionStatus.SUBMITTED,
  [TeacherTaskReviewStatusQueryValue.APPROVED]:
    ReinforcementSubmissionStatus.APPROVED,
  [TeacherTaskReviewStatusQueryValue.REJECTED]:
    ReinforcementSubmissionStatus.REJECTED,
};

@Injectable()
export class ListTeacherTaskReviewQueueUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly reviewReadAdapter: TeacherTaskReviewReadAdapter,
  ) {}

  async execute(
    query: ListTeacherTaskReviewQueueQueryDto,
  ): Promise<TeacherTaskReviewQueueResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations = await this.resolveAllocations(query.classId);

    if (query.studentId) {
      const ownsStudent =
        await this.reviewReadAdapter.studentBelongsToAllocations({
          allocations,
          studentId: query.studentId,
        });

      if (!ownsStudent) {
        throw new NotFoundDomainException(
          'Teacher task review student not found',
          { studentId: query.studentId },
        );
      }
    }

    const result = await this.reviewReadAdapter.listReviewQueue({
      teacherUserId: context.teacherUserId,
      allocations,
      filters: mapFilters(query),
    });

    return TeacherTaskReviewPresenter.presentQueue({
      submissions: result.items,
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

function mapFilters(
  query: ListTeacherTaskReviewQueueQueryDto,
): TeacherTaskReviewReadFilters {
  return {
    status: query.status ? STATUS_FILTERS[query.status] : undefined,
    studentId: query.studentId,
    search: query.search,
    page: query.page,
    limit: query.limit,
  };
}
