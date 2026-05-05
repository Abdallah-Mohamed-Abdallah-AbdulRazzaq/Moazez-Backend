import {
  ReinforcementProofType,
  ReinforcementReviewOutcome,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
} from '@prisma/client';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import {
  TeacherTaskCardDto,
  TeacherTaskDashboardResponseDto,
  TeacherTaskDetailResponseDto,
  TeacherTaskSelectorsResponseDto,
  TeacherTasksListResponseDto,
} from '../dto/teacher-tasks.dto';
import type {
  TeacherTaskAssignmentRecord,
  TeacherTaskOwnedStudentRecord,
  TeacherTaskRecord,
  TeacherTaskSubmissionRecord,
} from '../infrastructure/teacher-tasks-read.adapter';

const ACTIVE_TASK_STATUSES: ReinforcementTaskStatus[] = [
  ReinforcementTaskStatus.NOT_COMPLETED,
  ReinforcementTaskStatus.IN_PROGRESS,
  ReinforcementTaskStatus.UNDER_REVIEW,
];

export interface TeacherTaskPresenterInput {
  allocations: TeacherAppAllocationRecord[];
  ownedStudents?: TeacherTaskOwnedStudentRecord[];
}

export class TeacherTasksPresenter {
  static presentDashboard(params: {
    tasks: TeacherTaskRecord[];
    allocations: TeacherAppAllocationRecord[];
    ownedStudents: TeacherTaskOwnedStudentRecord[];
  }): TeacherTaskDashboardResponseDto {
    return {
      summary: {
        totalTasks: params.tasks.length,
        pendingTasks: countTasksByStatus(
          params.tasks,
          ReinforcementTaskStatus.NOT_COMPLETED,
        ),
        inProgressTasks: countTasksByStatus(
          params.tasks,
          ReinforcementTaskStatus.IN_PROGRESS,
        ),
        underReviewTasks: countTasksByStatus(
          params.tasks,
          ReinforcementTaskStatus.UNDER_REVIEW,
        ),
        completedTasks: countTasksByStatus(
          params.tasks,
          ReinforcementTaskStatus.COMPLETED,
        ),
      },
      byClass: params.allocations.map((allocation) => {
        const classTasks = params.tasks.filter((task) =>
          taskBelongsToAllocation(task, allocation),
        );

        return {
          classId: allocation.id,
          className: localizedName(allocation.classroom),
          subjectName: localizedName(allocation.subject),
          studentsCount: params.ownedStudents.filter((student) =>
            student.classIds.includes(allocation.id),
          ).length,
          activeTasksCount: classTasks.filter((task) =>
            isActiveTaskStatus(task.status),
          ).length,
          underReviewCount: countTasksByStatus(
            classTasks,
            ReinforcementTaskStatus.UNDER_REVIEW,
          ),
          completedCount: countTasksByStatus(
            classTasks,
            ReinforcementTaskStatus.COMPLETED,
          ),
        };
      }),
      recentTasks: params.tasks
        .slice(0, 5)
        .map((task) =>
          this.presentTaskCard(task, { allocations: params.allocations }),
        ),
    };
  }

  static presentList(params: {
    tasks: TeacherTaskRecord[];
    allocations: TeacherAppAllocationRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
  }): TeacherTasksListResponseDto {
    return {
      tasks: params.tasks.map((task) =>
        this.presentTaskCard(task, { allocations: params.allocations }),
      ),
      pagination: params.pagination,
    };
  }

  static presentSelectors(params: {
    allocations: TeacherAppAllocationRecord[];
    ownedStudents: TeacherTaskOwnedStudentRecord[];
  }): TeacherTaskSelectorsResponseDto {
    return {
      classes: params.allocations.map((allocation) => ({
        classId: allocation.id,
        classroomName: localizedName(allocation.classroom),
        subjectId: allocation.subjectId,
        subjectName: localizedName(allocation.subject),
        gradeName: localizedName(allocation.classroom?.section?.grade),
        sectionName: localizedName(allocation.classroom?.section),
        studentsCount: params.ownedStudents.filter((student) =>
          student.classIds.includes(allocation.id),
        ).length,
      })),
      students: params.ownedStudents.map((student) => ({
        studentId: student.studentId,
        displayName: fullName(student),
        classIds: [...student.classIds],
      })),
      statuses: ['pending', 'inProgress', 'underReview', 'completed'],
      proofTypes: ['image', 'document', 'none'],
      rewardTypes: ['moral', 'financial'],
    };
  }

  static presentDetail(params: {
    task: TeacherTaskRecord;
    allocations: TeacherAppAllocationRecord[];
  }): TeacherTaskDetailResponseDto {
    const task = params.task;
    const assignmentsById = new Map(
      task.assignments.map((assignment) => [assignment.id, assignment]),
    );

    return {
      task: {
        taskId: task.id,
        title: presentTitle(task),
        description: presentDescription(task),
        status: presentTaskStatus(task.status),
        source: presentSource(task.source),
        subject: {
          subjectId: task.subjectId,
          subjectName: task.subject ? localizedName(task.subject) : null,
        },
        reward: presentReward(task),
        dueAt: presentNullableDate(task.dueDate),
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        target: presentTargetSummary(task, params.allocations),
        stages: task.stages.map((stage) => {
          const stageSubmissions = task.submissions.filter(
            (submission) => submission.stageId === stage.id,
          );

          return {
            stageId: stage.id,
            title: presentStageTitle(stage),
            description: presentStageDescription(stage),
            sortOrder: stage.sortOrder,
            proofType: presentProofType(stage.proofType),
            requiresApproval: stage.requiresApproval,
            submissionsCount: stageSubmissions.length,
            underReviewCount: stageSubmissions.filter(isUnderReviewSubmission)
              .length,
            approvedCount: stageSubmissions.filter(isApprovedSubmission).length,
            rejectedCount: stageSubmissions.filter(isRejectedSubmission).length,
          };
        }),
        assignments: task.assignments.map((assignment) => ({
          assignmentId: assignment.id,
          studentId: assignment.studentId,
          studentName: fullName(assignment.student),
          classId:
            findAllocationForAssignment(task, assignment, params.allocations)
              ?.id ?? null,
          status: presentTaskStatus(assignment.status),
          progress: presentProgress(assignment.progress),
          assignedAt: assignment.assignedAt.toISOString(),
          completedAt: presentNullableDate(assignment.completedAt),
        })),
        submissions: task.submissions.map((submission) =>
          presentSubmission({
            submission,
            assignment: assignmentsById.get(submission.assignmentId) ?? null,
          }),
        ),
      },
    };
  }

  private static presentTaskCard(
    task: TeacherTaskRecord,
    input: TeacherTaskPresenterInput,
  ): TeacherTaskCardDto {
    return {
      taskId: task.id,
      title: presentTitle(task),
      description: presentDescription(task),
      status: presentTaskStatus(task.status),
      source: presentSource(task.source),
      target: presentTargetSummary(task, input.allocations),
      reward: presentReward(task),
      proofType: presentProofType(resolveTaskProofType(task)),
      stagesCount: task.stages.length,
      submissionsCount: task.submissions.length,
      underReviewCount: task.submissions.filter(isUnderReviewSubmission).length,
      createdAt: task.createdAt.toISOString(),
      dueAt: presentNullableDate(task.dueDate),
    };
  }
}

function presentSubmission(params: {
  submission: TeacherTaskSubmissionRecord;
  assignment: TeacherTaskAssignmentRecord | null;
}) {
  const review = params.submission.currentReview;

  return {
    submissionId: params.submission.id,
    assignmentId: params.submission.assignmentId,
    stageId: params.submission.stageId,
    studentId: params.submission.studentId,
    studentName: fullName(params.submission.student),
    status: presentSubmissionStatus(params.submission.status),
    proofText: params.submission.proofText,
    proofFile: params.submission.proofFile
      ? {
          id: params.submission.proofFile.id,
          originalName: params.submission.proofFile.originalName,
          mimeType: params.submission.proofFile.mimeType,
          sizeBytes: params.submission.proofFile.sizeBytes.toString(),
          visibility: params.submission.proofFile.visibility.toLowerCase(),
          createdAt: params.submission.proofFile.createdAt.toISOString(),
          downloadPath: `/api/v1/files/${params.submission.proofFile.id}/download`,
        }
      : null,
    submittedAt: presentNullableDate(params.submission.submittedAt),
    reviewedAt: presentNullableDate(params.submission.reviewedAt),
    review: review
      ? {
          id: review.id,
          outcome: review.outcome.toLowerCase(),
          note: review.note ?? review.noteAr,
          reviewedAt: review.reviewedAt.toISOString(),
        }
      : null,
  };
}

function presentTargetSummary(
  task: TeacherTaskRecord,
  allocations: TeacherAppAllocationRecord[],
) {
  const assignments = task.assignments;
  const firstAssignment = assignments[0];
  const allocation = firstAssignment
    ? findAllocationForAssignment(task, firstAssignment, allocations)
    : null;
  const uniqueStudentIds = unique(assignments.map((assignment) => assignment.studentId));

  if (assignments.length === 1 && firstAssignment) {
    return {
      type: 'student' as const,
      classId: allocation?.id ?? null,
      className: allocation ? localizedName(allocation.classroom) : null,
      subjectName:
        allocation?.subject ? localizedName(allocation.subject) : subjectName(task),
      studentsCount: 1,
      studentId: firstAssignment.studentId,
      studentName: fullName(firstAssignment.student),
    };
  }

  return {
    type: allocation ? ('class' as const) : ('mixed' as const),
    classId: allocation?.id ?? null,
    className: allocation ? localizedName(allocation.classroom) : null,
    subjectName:
      allocation?.subject ? localizedName(allocation.subject) : subjectName(task),
    studentsCount: uniqueStudentIds.length,
    studentId: null,
    studentName: null,
  };
}

function taskBelongsToAllocation(
  task: TeacherTaskRecord,
  allocation: TeacherAppAllocationRecord,
): boolean {
  if (task.subjectId && task.subjectId !== allocation.subjectId) {
    return false;
  }

  return task.assignments.some(
    (assignment) =>
      assignment.enrollment.classroomId === allocation.classroomId &&
      assignment.enrollment.termId === allocation.termId,
  );
}

function findAllocationForAssignment(
  task: TeacherTaskRecord,
  assignment: TeacherTaskAssignmentRecord,
  allocations: TeacherAppAllocationRecord[],
): TeacherAppAllocationRecord | null {
  return (
    allocations.find(
      (allocation) =>
        allocation.classroomId === assignment.enrollment.classroomId &&
        allocation.termId === assignment.enrollment.termId &&
        (!task.subjectId || task.subjectId === allocation.subjectId),
    ) ??
    allocations.find(
      (allocation) =>
        allocation.classroomId === assignment.enrollment.classroomId &&
        allocation.termId === assignment.enrollment.termId,
    ) ??
    null
  );
}

function presentTitle(task: {
  titleEn: string | null;
  titleAr: string | null;
}): string {
  return task.titleEn ?? task.titleAr ?? '';
}

function presentDescription(task: {
  descriptionEn: string | null;
  descriptionAr: string | null;
}): string | null {
  return task.descriptionEn ?? task.descriptionAr;
}

function presentStageTitle(stage: {
  titleEn: string | null;
  titleAr: string | null;
}): string {
  return stage.titleEn ?? stage.titleAr ?? '';
}

function presentStageDescription(stage: {
  descriptionEn: string | null;
  descriptionAr: string | null;
}): string | null {
  return stage.descriptionEn ?? stage.descriptionAr;
}

function presentReward(task: Pick<
  TeacherTaskRecord,
  'rewardType' | 'rewardValue' | 'rewardLabelEn' | 'rewardLabelAr'
>) {
  return {
    type: task.rewardType ? presentRewardType(task.rewardType) : null,
    value: presentDecimal(task.rewardValue),
    label: task.rewardLabelEn ?? task.rewardLabelAr,
  };
}

function presentDecimal(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue =
    typeof value === 'object' && 'toNumber' in value
      ? (value as { toNumber: () => number }).toNumber()
      : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
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

function presentSubmissionStatus(status: ReinforcementSubmissionStatus): string {
  return status.toLowerCase();
}

function presentProofType(proofType: ReinforcementProofType): string {
  return proofType.toLowerCase();
}

function presentRewardType(rewardType: ReinforcementRewardType): string {
  return rewardType.toLowerCase();
}

function presentSource(source: ReinforcementSource): string {
  return source.toLowerCase();
}

function resolveTaskProofType(task: TeacherTaskRecord): ReinforcementProofType {
  return (
    task.stages.find((stage) => stage.proofType !== ReinforcementProofType.NONE)
      ?.proofType ?? ReinforcementProofType.NONE
  );
}

function presentProgress(progress: number): number {
  return Math.min(Math.max(progress, 0), 100) / 100;
}

function isUnderReviewSubmission(
  submission: Pick<TeacherTaskSubmissionRecord, 'status'>,
): boolean {
  return submission.status === ReinforcementSubmissionStatus.SUBMITTED;
}

function isApprovedSubmission(
  submission: Pick<TeacherTaskSubmissionRecord, 'status' | 'currentReview'>,
): boolean {
  return (
    submission.status === ReinforcementSubmissionStatus.APPROVED ||
    submission.currentReview?.outcome === ReinforcementReviewOutcome.APPROVED
  );
}

function isRejectedSubmission(
  submission: Pick<TeacherTaskSubmissionRecord, 'status' | 'currentReview'>,
): boolean {
  return (
    submission.status === ReinforcementSubmissionStatus.REJECTED ||
    submission.currentReview?.outcome === ReinforcementReviewOutcome.REJECTED
  );
}

function countTasksByStatus(
  tasks: TeacherTaskRecord[],
  status: ReinforcementTaskStatus,
): number {
  return tasks.filter((task) => task.status === status).length;
}

function isActiveTaskStatus(status: ReinforcementTaskStatus): boolean {
  return ACTIVE_TASK_STATUSES.includes(status);
}

function subjectName(task: TeacherTaskRecord): string | null {
  return task.subject ? localizedName(task.subject) : null;
}

function localizedName(
  value: { nameEn?: string | null; nameAr?: string | null } | null | undefined,
): string {
  return value?.nameEn ?? value?.nameAr ?? '';
}

function fullName(student: { firstName: string; lastName: string }): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
