import {
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementTargetScope,
  ReinforcementTaskStatus,
} from '@prisma/client';
import { presentReinforcementTask } from '../presenters/reinforcement-task.presenter';

describe('Reinforcement task presenter', () => {
  it('maps enums to frontend strings and includes assignment summary', () => {
    const now = new Date('2026-04-28T10:00:00.000Z');

    const result = presentReinforcementTask({
      id: 'task-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      subjectId: 'subject-1',
      titleEn: 'Read',
      titleAr: 'Read AR',
      descriptionEn: null,
      descriptionAr: null,
      source: ReinforcementSource.TEACHER,
      status: ReinforcementTaskStatus.IN_PROGRESS,
      rewardType: ReinforcementRewardType.XP,
      rewardValue: { toNumber: () => 25 },
      rewardLabelEn: '25 XP',
      rewardLabelAr: null,
      dueDate: now,
      assignedById: 'user-1',
      assignedByName: 'Teacher',
      createdById: 'user-1',
      cancelledById: null,
      cancelledAt: null,
      cancellationReason: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      targets: [
        {
          id: 'target-1',
          scopeType: ReinforcementTargetScope.CLASSROOM,
          scopeKey: 'classroom-1',
          stageId: 'stage-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
          classroomId: 'classroom-1',
          studentId: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      stages: [
        {
          id: 'stage-row-1',
          sortOrder: 1,
          titleEn: 'Proof',
          titleAr: null,
          descriptionEn: null,
          descriptionAr: null,
          proofType: ReinforcementProofType.IMAGE,
          requiresApproval: true,
          metadata: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      ],
      assignments: [
        assignment('a-1', ReinforcementTaskStatus.NOT_COMPLETED),
        assignment('a-2', ReinforcementTaskStatus.UNDER_REVIEW),
        assignment('a-3', ReinforcementTaskStatus.COMPLETED),
      ],
    } as never);

    expect(result).toMatchObject({
      id: 'task-1',
      source: 'teacher',
      status: 'in_progress',
      reward: { type: 'xp', value: 25 },
      targets: [expect.objectContaining({ scopeType: 'classroom' })],
      stages: [expect.objectContaining({ proofType: 'image' })],
      assignmentSummary: {
        total: 3,
        notCompleted: 1,
        underReview: 1,
        completed: 1,
      },
    });
  });

  function assignment(id: string, status: ReinforcementTaskStatus) {
    return {
      id,
      studentId: `${id}-student`,
      enrollmentId: `${id}-enrollment`,
      status,
      progress: 0,
      assignedAt: new Date('2026-04-28T10:00:00.000Z'),
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: new Date('2026-04-28T10:00:00.000Z'),
      updatedAt: new Date('2026-04-28T10:00:00.000Z'),
    };
  }
});
