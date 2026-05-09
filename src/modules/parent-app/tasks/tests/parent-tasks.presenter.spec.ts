import {
  ReinforcementProofType,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
} from '@prisma/client';
import { ParentTasksPresenter } from '../presenters/parent-tasks.presenter';
import type { ParentTaskAssignmentReadModel } from '../infrastructure/parent-tasks-read.adapter';

describe('ParentTasksPresenter', () => {
  it('presents child task and proof metadata without raw storage or review internals', () => {
    const result = ParentTasksPresenter.presentTask(assignmentFixture());
    const serialized = JSON.stringify(result);

    expect(result.task).toMatchObject({
      taskId: 'task-1',
      assignmentId: 'assignment-1',
      status: 'under_review',
      progress: 0.5,
    });
    expect(result.task.stages[0].submission?.proofFile).toEqual({
      fileId: 'file-1',
      filename: 'proof.pdf',
      mimeType: 'application/pdf',
      size: '1234',
    });
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'bucket',
      'objectKey',
      'storageKey',
      'reviewNote',
      'reviewedById',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function assignmentFixture(): ParentTaskAssignmentReadModel {
  return {
    id: 'assignment-1',
    taskId: 'task-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: ReinforcementTaskStatus.UNDER_REVIEW,
    progress: 50,
    assignedAt: new Date('2026-01-01T00:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    task: {
      id: 'task-1',
      titleEn: 'Read chapter',
      titleAr: null,
      descriptionEn: 'Practice reading',
      descriptionAr: null,
      source: ReinforcementSource.TEACHER,
      status: ReinforcementTaskStatus.IN_PROGRESS,
      rewardType: null,
      rewardValue: null,
      rewardLabelEn: null,
      rewardLabelAr: null,
      dueDate: null,
      assignedByName: 'Teacher',
      subject: {
        id: 'subject-1',
        nameEn: 'English',
        nameAr: 'English',
        code: 'ENG',
      },
      stages: [
        {
          id: 'stage-1',
          sortOrder: 1,
          titleEn: 'Upload proof',
          titleAr: null,
          descriptionEn: null,
          descriptionAr: null,
          proofType: ReinforcementProofType.DOCUMENT,
          requiresApproval: true,
        },
      ],
    },
    submissions: [
      {
        id: 'submission-1',
        assignmentId: 'assignment-1',
        taskId: 'task-1',
        stageId: 'stage-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        status: ReinforcementSubmissionStatus.SUBMITTED,
        proofText: 'Done',
        submittedAt: new Date('2026-01-02T00:00:00.000Z'),
        reviewedAt: null,
        proofFile: {
          id: 'file-1',
          originalName: 'proof.pdf',
          mimeType: 'application/pdf',
          sizeBytes: BigInt(1234),
        },
      },
    ],
  } as unknown as ParentTaskAssignmentReadModel;
}
