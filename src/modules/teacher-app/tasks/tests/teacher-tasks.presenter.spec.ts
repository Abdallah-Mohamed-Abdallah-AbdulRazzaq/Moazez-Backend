import {
  FileVisibility,
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import type { TeacherTaskRecord } from '../infrastructure/teacher-tasks-read.adapter';
import { TeacherTasksPresenter } from '../presenters/teacher-tasks.presenter';

describe('TeacherTasksPresenter', () => {
  it('maps task cards with allocation-backed classId and app status labels', () => {
    const result = TeacherTasksPresenter.presentList({
      tasks: [taskFixture()],
      allocations: [allocationFixture()],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    expect(result.tasks[0]).toMatchObject({
      taskId: 'task-1',
      status: 'underReview',
      source: 'teacher',
      target: {
        type: 'student',
        classId: 'allocation-1',
        studentId: 'student-1',
      },
      proofType: 'image',
      submissionsCount: 1,
      underReviewCount: 1,
    });
  });

  it('returns safe detail without schoolId, scheduleId, raw file keys, or raw metadata', () => {
    const result = TeacherTasksPresenter.presentDetail({
      task: taskFixture(),
      allocations: [allocationFixture()],
    });
    const json = JSON.stringify(result);

    expect(result.task.submissions[0].proofFile).toMatchObject({
      id: 'file-1',
      originalName: 'proof.png',
      mimeType: 'image/png',
      sizeBytes: '1234',
      downloadPath: '/api/v1/files/file-1/download',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('bucket');
    expect(json).not.toContain('objectKey');
    expect(json).not.toContain('raw-storage-key');
    expect(json).not.toContain('metadata');
  });

  it('does not treat behavior points as XP while presenting task reward metadata', () => {
    const result = TeacherTasksPresenter.presentDetail({
      task: taskFixture({
        rewardType: ReinforcementRewardType.XP,
        rewardValue: { toNumber: () => 25 } as unknown as never,
        rewardLabelEn: '25 XP',
      }),
      allocations: [allocationFixture()],
    });
    const json = JSON.stringify(result);

    expect(result.task.reward).toEqual({
      type: 'xp',
      value: 25,
      label: '25 XP',
    });
    expect(json).not.toContain('BehaviorPointLedger');
    expect(json).not.toContain('behaviorPoint');
  });

  it('builds selectors for owned classes and students only', () => {
    const result = TeacherTasksPresenter.presentSelectors({
      allocations: [allocationFixture()],
      ownedStudents: [
        {
          studentId: 'student-1',
          firstName: 'Mona',
          lastName: 'Ahmed',
          classIds: ['allocation-1'],
        },
      ],
    });

    expect(result.classes).toEqual([
      expect.objectContaining({
        classId: 'allocation-1',
        studentsCount: 1,
      }),
    ]);
    expect(result.students).toEqual([
      {
        studentId: 'student-1',
        displayName: 'Mona Ahmed',
        classIds: ['allocation-1'],
      },
    ]);
    expect(result.statuses).toEqual([
      'pending',
      'inProgress',
      'underReview',
      'completed',
    ]);
  });
});

function allocationFixture(
  overrides?: Partial<TeacherAppAllocationRecord>,
): TeacherAppAllocationRecord {
  const schoolId = 'school-1';

  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: {
      id: 'subject-1',
      schoolId,
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      schoolId,
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: null,
      section: {
        id: 'section-1',
        schoolId,
        gradeId: 'grade-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          schoolId,
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            schoolId,
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: {
      id: 'term-1',
      schoolId,
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
    ...overrides,
  };
}

function taskFixture(overrides?: Partial<TeacherTaskRecord>): TeacherTaskRecord {
  return {
    id: 'task-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    subjectId: 'subject-1',
    titleEn: 'Kindness Challenge',
    titleAr: null,
    descriptionEn: 'Help a classmate',
    descriptionAr: null,
    source: ReinforcementSource.TEACHER,
    status: ReinforcementTaskStatus.UNDER_REVIEW,
    rewardType: ReinforcementRewardType.MORAL,
    rewardValue: null,
    rewardLabelEn: 'Certificate',
    rewardLabelAr: null,
    dueDate: new Date('2026-09-20T00:00:00.000Z'),
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    updatedAt: new Date('2026-09-01T08:00:00.000Z'),
    subject: {
      id: 'subject-1',
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    targets: [],
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
        createdAt: new Date('2026-09-01T08:00:00.000Z'),
        updatedAt: new Date('2026-09-01T08:00:00.000Z'),
      },
    ],
    assignments: [
      {
        id: 'assignment-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        status: ReinforcementTaskStatus.UNDER_REVIEW,
        progress: 50,
        assignedAt: new Date('2026-09-01T08:00:00.000Z'),
        startedAt: new Date('2026-09-02T08:00:00.000Z'),
        completedAt: null,
        cancelledAt: null,
        createdAt: new Date('2026-09-01T08:00:00.000Z'),
        updatedAt: new Date('2026-09-02T08:00:00.000Z'),
        student: {
          id: 'student-1',
          firstName: 'Mona',
          lastName: 'Ahmed',
          status: StudentStatus.ACTIVE,
        },
        enrollment: {
          id: 'enrollment-1',
          academicYearId: 'year-1',
          termId: 'term-1',
          classroomId: 'classroom-1',
          status: StudentEnrollmentStatus.ACTIVE,
          classroom: {
            id: 'classroom-1',
            nameAr: 'Classroom AR',
            nameEn: 'Classroom',
            section: {
              id: 'section-1',
              nameAr: 'Section AR',
              nameEn: 'Section',
              grade: {
                id: 'grade-1',
                nameAr: 'Grade AR',
                nameEn: 'Grade',
                stage: {
                  id: 'stage-1',
                  nameAr: 'Stage AR',
                  nameEn: 'Stage',
                },
              },
            },
          },
        },
      },
    ],
    submissions: [
      {
        id: 'submission-1',
        assignmentId: 'assignment-1',
        taskId: 'task-1',
        stageId: 'stage-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        status: ReinforcementSubmissionStatus.SUBMITTED,
        proofFileId: 'file-1',
        proofText: 'Done',
        submittedAt: new Date('2026-09-02T08:00:00.000Z'),
        reviewedAt: null,
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        updatedAt: new Date('2026-09-02T08:00:00.000Z'),
        student: {
          id: 'student-1',
          firstName: 'Mona',
          lastName: 'Ahmed',
          status: StudentStatus.ACTIVE,
        },
        proofFile: {
          id: 'file-1',
          originalName: 'proof.png',
          mimeType: 'image/png',
          sizeBytes: BigInt(1234),
          visibility: FileVisibility.PRIVATE,
          createdAt: new Date('2026-09-02T08:00:00.000Z'),
        },
        currentReview: null,
      },
    ],
    ...overrides,
  } as TeacherTaskRecord;
}
