import {
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { ApproveReinforcementSubmissionUseCase } from '../../../../reinforcement/reviews/application/approve-reinforcement-submission.use-case';
import { RejectReinforcementSubmissionUseCase } from '../../../../reinforcement/reviews/application/reject-reinforcement-submission.use-case';
import { TeacherAppAllocationReadAdapter } from '../../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import {
  TeacherAppAllocationNotFoundException,
  TeacherAppRequiredTeacherException,
} from '../../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';
import { ApproveTeacherTaskReviewSubmissionUseCase } from '../application/approve-teacher-task-review-submission.use-case';
import { GetTeacherTaskReviewSubmissionUseCase } from '../application/get-teacher-task-review-submission.use-case';
import { ListTeacherTaskReviewQueueUseCase } from '../application/list-teacher-task-review-queue.use-case';
import { RejectTeacherTaskReviewSubmissionUseCase } from '../application/reject-teacher-task-review-submission.use-case';
import { TeacherTaskReviewStatusQueryValue } from '../dto/teacher-task-review-queue.dto';
import {
  TeacherTaskReviewReadAdapter,
  TeacherTaskReviewSubmissionRecord,
} from '../infrastructure/teacher-task-review-read.adapter';

const TEACHER_ID = 'teacher-1';

describe('Teacher task review use cases', () => {
  it('list rejects non-teacher actors through the access service', async () => {
    const { listUseCase, accessService } = createUseCases();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(listUseCase.execute({})).rejects.toBeInstanceOf(
      TeacherAppRequiredTeacherException,
    );
  });

  it('detail rejects non-teacher actors through the access service', async () => {
    const { detailUseCase, accessService } = createUseCases();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(detailUseCase.execute('submission-1')).rejects.toBeInstanceOf(
      TeacherAppRequiredTeacherException,
    );
  });

  it('approve and reject reject non-teacher actors before core delegation', async () => {
    const {
      approveUseCase,
      rejectUseCase,
      accessService,
      approveCore,
      rejectCore,
    } = createUseCases();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(
      approveUseCase.execute('submission-1', {}),
    ).rejects.toBeInstanceOf(TeacherAppRequiredTeacherException);
    await expect(
      rejectUseCase.execute('submission-1', { reason: 'Try again' }),
    ).rejects.toBeInstanceOf(TeacherAppRequiredTeacherException);
    expect(approveCore.execute).not.toHaveBeenCalled();
    expect(rejectCore.execute).not.toHaveBeenCalled();
  });

  it('list validates owned class and student boundaries before querying', async () => {
    const { listUseCase, accessService, reviewReadAdapter } = createUseCases();

    await listUseCase.execute({
      classId: 'allocation-1',
      studentId: 'student-1',
      status: TeacherTaskReviewStatusQueryValue.SUBMITTED,
    });

    expect(accessService.assertTeacherOwnsAllocation).toHaveBeenCalledWith(
      'allocation-1',
    );
    expect(reviewReadAdapter.studentBelongsToAllocations).toHaveBeenCalledWith({
      allocations: [allocationFixture()],
      studentId: 'student-1',
    });
    expect(reviewReadAdapter.listReviewQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherUserId: TEACHER_ID,
        allocations: [allocationFixture()],
        filters: expect.objectContaining({
          status: ReinforcementSubmissionStatus.SUBMITTED,
          studentId: 'student-1',
        }),
      }),
    );
  });

  it('list rejects same-school other-teacher class or student targets safely', async () => {
    const { listUseCase, accessService, reviewReadAdapter } = createUseCases();
    accessService.assertTeacherOwnsAllocation.mockRejectedValueOnce(
      new TeacherAppAllocationNotFoundException({ classId: 'other-class' }),
    );

    await expect(
      listUseCase.execute({ classId: 'other-class' }),
    ).rejects.toMatchObject({ code: 'teacher_app.allocation.not_found' });
    expect(reviewReadAdapter.listReviewQueue).not.toHaveBeenCalled();

    reviewReadAdapter.studentBelongsToAllocations.mockResolvedValueOnce(false);
    await expect(
      listUseCase.execute({ studentId: 'other-student' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('detail rejects same-school other-teacher or cross-school submissions', async () => {
    const { detailUseCase, reviewReadAdapter } = createUseCases();
    reviewReadAdapter.findVisibleSubmissionById.mockResolvedValueOnce(null);

    await expect(
      detailUseCase.execute('outside-submission'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('approve and reject reject submissions outside owned classrooms', async () => {
    const {
      approveUseCase,
      rejectUseCase,
      reviewReadAdapter,
      approveCore,
      rejectCore,
    } = createUseCases();
    reviewReadAdapter.findVisibleSubmissionById.mockResolvedValue(null);

    await expect(
      approveUseCase.execute('outside-submission', {}),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      rejectUseCase.execute('outside-submission', { reason: 'Try again' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(approveCore.execute).not.toHaveBeenCalled();
    expect(rejectCore.execute).not.toHaveBeenCalled();
  });

  it('approve delegates to Reinforcement core after boundary validation', async () => {
    const { approveUseCase, reviewReadAdapter, approveCore } = createUseCases();
    reviewReadAdapter.findVisibleSubmissionById
      .mockResolvedValueOnce(submissionFixture())
      .mockResolvedValueOnce(
        submissionFixture({ status: ReinforcementSubmissionStatus.APPROVED }),
      );

    const result = await approveUseCase.execute('submission-1', {
      comment: 'Great work',
    });

    expect(approveCore.execute).toHaveBeenCalledWith('submission-1', {
      note: 'Great work',
      noteAr: null,
    });
    expect(result.submission.status).toBe('approved');
  });

  it('reject delegates to Reinforcement core after boundary validation', async () => {
    const { rejectUseCase, reviewReadAdapter, rejectCore } = createUseCases();
    reviewReadAdapter.findVisibleSubmissionById
      .mockResolvedValueOnce(submissionFixture())
      .mockResolvedValueOnce(
        submissionFixture({ status: ReinforcementSubmissionStatus.REJECTED }),
      );

    const result = await rejectUseCase.execute('submission-1', {
      reason: 'Needs clearer proof',
    });

    expect(rejectCore.execute).toHaveBeenCalledWith('submission-1', {
      note: 'Needs clearer proof',
      noteAr: null,
    });
    expect(result.submission.status).toBe('rejected');
  });
});

function createUseCases(): {
  listUseCase: ListTeacherTaskReviewQueueUseCase;
  detailUseCase: GetTeacherTaskReviewSubmissionUseCase;
  approveUseCase: ApproveTeacherTaskReviewSubmissionUseCase;
  rejectUseCase: RejectTeacherTaskReviewSubmissionUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  allocationReadAdapter: jest.Mocked<TeacherAppAllocationReadAdapter>;
  reviewReadAdapter: jest.Mocked<TeacherTaskReviewReadAdapter>;
  approveCore: jest.Mocked<ApproveReinforcementSubmissionUseCase>;
  rejectCore: jest.Mocked<RejectReinforcementSubmissionUseCase>;
} {
  const allocation = allocationFixture();
  const submission = submissionFixture();
  const accessService = {
    assertCurrentTeacher: jest.fn(() => ({
      teacherUserId: TEACHER_ID,
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    })),
    assertTeacherOwnsAllocation: jest.fn(() => Promise.resolve(allocation)),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const allocationReadAdapter = {
    listAllOwnedAllocations: jest.fn(() => Promise.resolve([allocation])),
  } as unknown as jest.Mocked<TeacherAppAllocationReadAdapter>;
  const reviewReadAdapter = {
    listReviewQueue: jest.fn(() =>
      Promise.resolve({ items: [submission], total: 1, page: 1, limit: 20 }),
    ),
    findVisibleSubmissionById: jest.fn(() => Promise.resolve(submission)),
    studentBelongsToAllocations: jest.fn(() => Promise.resolve(true)),
  } as unknown as jest.Mocked<TeacherTaskReviewReadAdapter>;
  const approveCore = {
    execute: jest.fn(() => Promise.resolve({})),
  } as unknown as jest.Mocked<ApproveReinforcementSubmissionUseCase>;
  const rejectCore = {
    execute: jest.fn(() => Promise.resolve({})),
  } as unknown as jest.Mocked<RejectReinforcementSubmissionUseCase>;

  return {
    listUseCase: new ListTeacherTaskReviewQueueUseCase(
      accessService,
      allocationReadAdapter,
      reviewReadAdapter,
    ),
    detailUseCase: new GetTeacherTaskReviewSubmissionUseCase(
      accessService,
      allocationReadAdapter,
      reviewReadAdapter,
    ),
    approveUseCase: new ApproveTeacherTaskReviewSubmissionUseCase(
      accessService,
      allocationReadAdapter,
      reviewReadAdapter,
      approveCore,
    ),
    rejectUseCase: new RejectTeacherTaskReviewSubmissionUseCase(
      accessService,
      allocationReadAdapter,
      reviewReadAdapter,
      rejectCore,
    ),
    accessService,
    allocationReadAdapter,
    reviewReadAdapter,
    approveCore,
    rejectCore,
  };
}

function allocationFixture(
  overrides?: Partial<TeacherAppAllocationRecord>,
): TeacherAppAllocationRecord {
  const schoolId = 'school-1';

  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: TEACHER_ID,
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

function submissionFixture(
  overrides?: Partial<TeacherTaskReviewSubmissionRecord>,
): TeacherTaskReviewSubmissionRecord {
  const now = new Date('2026-09-16T10:00:00.000Z');
  return {
    id: 'submission-1',
    assignmentId: 'assignment-1',
    taskId: 'task-1',
    stageId: 'stage-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: ReinforcementSubmissionStatus.SUBMITTED,
    proofFileId: null,
    proofText: 'Proof text',
    submittedAt: now,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
    task: {
      id: 'task-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      subjectId: 'subject-1',
      titleEn: 'Practice kindness',
      titleAr: null,
      source: ReinforcementSource.TEACHER,
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      rewardType: ReinforcementRewardType.MORAL,
      rewardValue: null,
      rewardLabelEn: 'Certificate',
      rewardLabelAr: null,
      dueDate: null,
      subject: {
        id: 'subject-1',
        nameAr: 'Math AR',
        nameEn: 'Math',
        code: 'MATH',
      },
    },
    stage: {
      id: 'stage-1',
      taskId: 'task-1',
      sortOrder: 1,
      titleEn: 'Upload proof',
      titleAr: null,
      proofType: ReinforcementProofType.IMAGE,
      requiresApproval: true,
    },
    assignment: {
      id: 'assignment-1',
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      progress: 50,
      assignedAt: now,
      completedAt: null,
    },
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
    proofFile: null,
    currentReview: null,
    reviews: [],
    ...overrides,
  } as TeacherTaskReviewSubmissionRecord;
}
