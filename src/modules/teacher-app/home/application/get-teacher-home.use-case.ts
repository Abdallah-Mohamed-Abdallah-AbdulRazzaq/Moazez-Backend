import { Injectable } from '@nestjs/common';
import { ReinforcementTaskStatus } from '@prisma/client';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherMessagesReadAdapter } from '../../messages/infrastructure/teacher-messages-read.adapter';
import { TeacherMessagesPresenter } from '../../messages/presenters/teacher-messages.presenter';
import { TeacherAppRequiredTeacherException } from '../../shared/teacher-app.errors';
import { TeacherAppCompositionReadAdapter } from '../../shared/infrastructure/teacher-app-composition-read.adapter';
import { TeacherTasksReadAdapter } from '../../tasks/infrastructure/teacher-tasks-read.adapter';
import { TeacherTaskReviewReadAdapter } from '../../tasks/review/infrastructure/teacher-task-review-read.adapter';
import { TeacherXpReadAdapter } from '../../xp/infrastructure/teacher-xp-read.adapter';
import { TeacherXpPresenter } from '../../xp/presenters/teacher-xp.presenter';
import { TeacherHomeResponseDto } from '../dto/teacher-home.dto';
import { TeacherHomePresenter } from '../presenters/teacher-home.presenter';

const ACTIVE_TASK_STATUSES = new Set<ReinforcementTaskStatus>([
  ReinforcementTaskStatus.NOT_COMPLETED,
  ReinforcementTaskStatus.IN_PROGRESS,
  ReinforcementTaskStatus.UNDER_REVIEW,
]);

@Injectable()
export class GetTeacherHomeUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly compositionReadAdapter: TeacherAppCompositionReadAdapter,
    private readonly tasksReadAdapter: TeacherTasksReadAdapter,
    private readonly taskReviewReadAdapter: TeacherTaskReviewReadAdapter,
    private readonly xpReadAdapter: TeacherXpReadAdapter,
    private readonly messagesReadAdapter: TeacherMessagesReadAdapter,
  ) {}

  async execute(): Promise<TeacherHomeResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const [teacher, school, allocations] = await Promise.all([
      this.compositionReadAdapter.findTeacherIdentity(context.teacherUserId),
      this.compositionReadAdapter.findSchoolSummary(context),
      this.allocationReadAdapter.listAllOwnedAllocations(
        context.teacherUserId,
      ),
    ]);

    if (!teacher) {
      throw new TeacherAppRequiredTeacherException({
        reason: 'teacher_profile_not_found',
      });
    }

    const classroomIds = allocations.map((allocation) => allocation.classroomId);
    const [
      studentsCount,
      pendingTasksCount,
      taskRecords,
      reviewQueue,
      ownedXpEnrollments,
      messageConversationResult,
      messageUnreadSummary,
    ] = await Promise.all([
      this.compositionReadAdapter.countActiveStudentsAcrossClassrooms(
        classroomIds,
      ),
      this.compositionReadAdapter.countPendingTeacherTaskAssignments({
        teacherUserId: context.teacherUserId,
        classroomIds,
      }),
      this.tasksReadAdapter.listAllVisibleTasks({
        teacherUserId: context.teacherUserId,
        allocations,
      }),
      this.taskReviewReadAdapter.listReviewQueue({
        teacherUserId: context.teacherUserId,
        allocations,
        filters: { page: 1, limit: 1 },
      }),
      this.xpReadAdapter.listOwnedEnrollments({ allocations }),
      this.messagesReadAdapter.listConversations({
        teacherUserId: context.teacherUserId,
        filters: { page: 1, limit: 3 },
      }),
      this.messagesReadAdapter.getUnreadSummary({
        teacherUserId: context.teacherUserId,
      }),
    ]);
    const xpLedger = await this.xpReadAdapter.listAllLedger({
      ownedEnrollments: ownedXpEnrollments,
    });
    const xpDashboard = TeacherXpPresenter.presentDashboard({
      allocations,
      ownedEnrollments: ownedXpEnrollments,
      ledger: xpLedger,
    });
    const messages = TeacherMessagesPresenter.presentHomeSummary({
      result: messageConversationResult,
      teacherUserId: context.teacherUserId,
      unreadSummary: messageUnreadSummary,
    });

    return TeacherHomePresenter.present({
      teacher,
      school,
      classesCount: allocations.length,
      studentsCount,
      pendingTasksCount,
      tasks: {
        activeTasksCount: taskRecords.filter((task) =>
          ACTIVE_TASK_STATUSES.has(task.status),
        ).length,
        pendingReviewCount: reviewQueue.total,
        recentTasks: taskRecords.slice(0, 5).map((task) => ({
          taskId: task.id,
          title: task.titleEn ?? task.titleAr ?? '',
          status: presentTaskStatus(task.status),
          dueAt: task.dueDate ? task.dueDate.toISOString() : null,
        })),
      },
      xp: {
        studentsCount: xpDashboard.summary.studentsCount,
        totalXp: xpDashboard.summary.totalXp,
        averageXp: xpDashboard.summary.averageXp,
        topStudent: xpDashboard.summary.topStudent,
      },
      messages,
      now: new Date(),
    });
  }
}

function presentTaskStatus(status: ReinforcementTaskStatus): string {
  switch (status) {
    case ReinforcementTaskStatus.NOT_COMPLETED:
      return 'pending';
    case ReinforcementTaskStatus.IN_PROGRESS:
      return 'inProgress';
    case ReinforcementTaskStatus.UNDER_REVIEW:
      return 'underReview';
    case ReinforcementTaskStatus.COMPLETED:
      return 'completed';
    case ReinforcementTaskStatus.CANCELLED:
      return 'cancelled';
  }
}
