import {
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
} from '@prisma/client';
import { StudentTasksPresenter } from '../presenters/student-tasks.presenter';

describe('StudentTasksPresenter', () => {
  it('presents safe task and proof metadata without storage internals', () => {
    const result = StudentTasksPresenter.presentTask(taskFixture() as any);
    const serialized = JSON.stringify(result);

    expect(result.task).toMatchObject({
      taskId: 'task-1',
      assignmentId: 'assignment-1',
      status: 'under_review',
      progress: 0.5,
      subject_name: 'Math',
    });
    expect(result.task.submissions[0]).toMatchObject({
      submissionId: 'submission-1',
      status: 'submitted',
      proofFile: {
        fileId: 'file-1',
        filename: 'proof.png',
        mimeType: 'image/png',
        size: '123',
      },
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
    expect(serialized).not.toContain('bucket');
    expect(serialized).not.toContain('objectKey');
    expect(serialized).not.toContain('storageKey');
  });
});

function taskFixture() {
  return {
    id: 'assignment-1',
    taskId: 'task-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: ReinforcementTaskStatus.UNDER_REVIEW,
    progress: 50,
    assignedAt: new Date('2026-01-01T08:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    task: {
      id: 'task-1',
      titleEn: 'Read chapter',
      titleAr: null,
      descriptionEn: 'Complete the reading',
      descriptionAr: null,
      source: ReinforcementSource.TEACHER,
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      rewardType: ReinforcementRewardType.XP,
      rewardValue: { toNumber: () => 5 },
      rewardLabelEn: '5 XP',
      rewardLabelAr: null,
      dueDate: new Date('2026-01-03T08:00:00.000Z'),
      assignedByName: 'Teacher',
      subject: {
        id: 'subject-1',
        nameEn: 'Math',
        nameAr: 'رياضيات',
        code: 'MATH',
      },
      stages: [
        {
          id: 'stage-1',
          sortOrder: 1,
          titleEn: 'Upload proof',
          titleAr: null,
          descriptionEn: null,
          descriptionAr: null,
          proofType: ReinforcementProofType.IMAGE,
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
        submittedAt: new Date('2026-01-02T08:00:00.000Z'),
        reviewedAt: null,
        proofFile: {
          id: 'file-1',
          originalName: 'proof.png',
          mimeType: 'image/png',
          sizeBytes: 123n,
        },
      },
    ],
  };
}
