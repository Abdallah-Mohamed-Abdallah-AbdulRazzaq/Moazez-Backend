import {
  ReinforcementReviewOutcome,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  XpSourceType,
} from '@prisma/client';
import { GetClassroomReinforcementSummaryUseCase } from '../application/get-classroom-reinforcement-summary.use-case';
import { GetReinforcementOverviewUseCase } from '../application/get-reinforcement-overview.use-case';
import { GetStudentReinforcementProgressUseCase } from '../application/get-student-reinforcement-progress.use-case';

jest.mock('../../reinforcement-context', () => ({
  requireReinforcementScope: jest.fn(() => ({
    actorId: 'actor-1',
    userType: 'SCHOOL_USER',
    organizationId: 'organization-1',
    schoolId: 'school-1',
    roleId: 'role-1',
  })),
}));

describe('reinforcement overview use-cases', () => {
  let repository: ReturnType<typeof createRepositoryMock>;

  beforeEach(() => {
    repository = createRepositoryMock();
  });

  it('returns combined task, assignment, review, and XP summary', async () => {
    repository.loadOverviewData.mockResolvedValue(dataset());

    const response = await new GetReinforcementOverviewUseCase(
      repository as any,
    ).execute({ academicYearId: 'year-1', termId: 'term-1' });

    expect(response.tasks.total).toBe(1);
    expect(response.assignments.completed).toBe(1);
    expect(response.reviewQueue.pendingReview).toBe(1);
    expect(response.xp.totalXp).toBe(15);
    expect(response.topStudents[0]).toMatchObject({
      studentId: 'student-1',
      totalXp: 15,
      completedAssignments: 1,
    });
    expect(repository.createTaskWithTargetsStagesAssignments).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
    expect(repository.recordAudit).not.toHaveBeenCalled();
  });

  it('rejects invalid date ranges', async () => {
    await expect(
      new GetReinforcementOverviewUseCase(repository as any).execute({
        academicYearId: 'year-1',
        termId: 'term-1',
        dateFrom: '2026-04-03',
        dateTo: '2026-04-02',
      }),
    ).rejects.toThrow('Reinforcement overview date range');
  });

  it('validates student ownership for progress reads', async () => {
    repository.findStudent.mockResolvedValue(null);

    await expect(
      new GetStudentReinforcementProgressUseCase(repository as any).execute(
        'student-from-another-school',
        { academicYearId: 'year-1', termId: 'term-1' },
      ),
    ).rejects.toThrow('Student not found');
    expect(repository.loadStudentProgressData).not.toHaveBeenCalled();
  });

  it('returns student assignment, XP, and review summary', async () => {
    repository.loadStudentProgressData.mockResolvedValue({
      ...dataset(),
      student: student(),
      enrollment: enrollment(),
    });

    const response = await new GetStudentReinforcementProgressUseCase(
      repository as any,
    ).execute('student-1', { academicYearId: 'year-1', termId: 'term-1' });

    expect(response.student.id).toBe('student-1');
    expect(response.assignments.completed).toBe(1);
    expect(response.xp.totalXp).toBe(15);
    expect(response.recentReviews[0]).toMatchObject({
      id: 'review-1',
      outcome: 'approved',
    });
  });

  it('validates classroom ownership for classroom summaries', async () => {
    repository.findClassroom.mockResolvedValue(null);

    await expect(
      new GetClassroomReinforcementSummaryUseCase(repository as any).execute(
        'classroom-from-another-school',
        { academicYearId: 'year-1', termId: 'term-1' },
      ),
    ).rejects.toThrow('Classroom not found');
    expect(repository.loadClassroomSummaryData).not.toHaveBeenCalled();
  });

  it('aggregates classroom rows from enrolled classroom students', async () => {
    repository.loadClassroomSummaryData.mockResolvedValue({
      ...dataset(),
      classroom: classroom(),
      enrollments: [enrollment()],
    });

    const response = await new GetClassroomReinforcementSummaryUseCase(
      repository as any,
    ).execute('classroom-1', { academicYearId: 'year-1', termId: 'term-1' });

    expect(repository.loadClassroomSummaryData).toHaveBeenCalledWith(
      expect.objectContaining({ classroomId: 'classroom-1' }),
    );
    expect(response.studentsCount).toBe(1);
    expect(response.students.map((row) => row.studentId)).toEqual(['student-1']);
  });
});

function createRepositoryMock() {
  return {
    findAcademicYear: jest.fn().mockResolvedValue({
      id: 'year-1',
      nameAr: 'Year AR',
      nameEn: 'Year EN',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      isActive: true,
    }),
    findActiveAcademicYear: jest.fn(),
    findTerm: jest.fn().mockResolvedValue({
      id: 'term-1',
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term EN',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T00:00:00.000Z'),
      isActive: true,
    }),
    findActiveTerm: jest.fn(),
    findStage: jest.fn(),
    findGrade: jest.fn(),
    findSection: jest.fn(),
    findClassroom: jest.fn().mockResolvedValue(classroom()),
    findStudent: jest.fn().mockResolvedValue(student()),
    findActiveEnrollmentForStudent: jest.fn().mockResolvedValue(enrollment()),
    loadOverviewData: jest.fn(),
    loadStudentProgressData: jest.fn(),
    loadClassroomSummaryData: jest.fn(),
    createTaskWithTargetsStagesAssignments: jest.fn(),
    createXpLedger: jest.fn(),
    updateXpPolicy: jest.fn(),
    recordAudit: jest.fn(),
  };
}

function dataset() {
  return {
    tasks: [task()],
    assignments: [assignment()],
    submissions: [submission()],
    reviews: [review()],
    xpLedger: [xpLedger()],
  };
}

function student() {
  return {
    id: 'student-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    status: 'ACTIVE',
  } as any;
}

function classroom() {
  return {
    id: 'classroom-1',
    nameAr: 'Class AR',
    nameEn: 'Class EN',
    sectionId: 'section-1',
    section: {
      id: 'section-1',
      nameAr: 'Section AR',
      nameEn: 'Section EN',
      gradeId: 'grade-1',
      grade: {
        id: 'grade-1',
        nameAr: 'Grade AR',
        nameEn: 'Grade EN',
        stageId: 'stage-1',
        stage: {
          id: 'stage-1',
          nameAr: 'Stage AR',
          nameEn: 'Stage EN',
        },
      },
    },
  } as any;
}

function enrollment() {
  return {
    id: 'enrollment-1',
    studentId: 'student-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: 'classroom-1',
    status: 'ACTIVE',
    enrolledAt: new Date('2026-04-01T00:00:00.000Z'),
    student: student(),
    classroom: classroom(),
  } as any;
}

function task() {
  return {
    id: 'task-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    subjectId: null,
    titleEn: 'Task',
    titleAr: null,
    source: ReinforcementSource.TEACHER,
    status: ReinforcementTaskStatus.COMPLETED,
    dueDate: null,
    assignedById: null,
    assignedByName: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    targets: [],
  } as any;
}

function assignment() {
  return {
    id: 'assignment-1',
    taskId: 'task-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: ReinforcementTaskStatus.COMPLETED,
    progress: 100,
    assignedAt: new Date('2026-04-01T00:00:00.000Z'),
    startedAt: new Date('2026-04-01T00:00:00.000Z'),
    completedAt: new Date('2026-04-02T00:00:00.000Z'),
    cancelledAt: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-02T00:00:00.000Z'),
    student: student(),
    enrollment: enrollment(),
    task: task(),
  } as any;
}

function submission() {
  return {
    id: 'submission-1',
    assignmentId: 'assignment-1',
    taskId: 'task-1',
    stageId: 'stage-row-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: ReinforcementSubmissionStatus.SUBMITTED,
    proofFileId: null,
    proofText: 'proof',
    submittedById: null,
    submittedAt: new Date('2026-04-03T00:00:00.000Z'),
    reviewedAt: null,
    createdAt: new Date('2026-04-03T00:00:00.000Z'),
    updatedAt: new Date('2026-04-03T00:00:00.000Z'),
    student: student(),
    enrollment: enrollment(),
    task: task(),
    stage: {
      id: 'stage-row-1',
      sortOrder: 1,
      titleEn: 'Stage',
      titleAr: null,
      proofType: 'NONE',
      requiresApproval: true,
    },
  } as any;
}

function review() {
  return {
    id: 'review-1',
    submissionId: 'submission-1',
    assignmentId: 'assignment-1',
    taskId: 'task-1',
    stageId: 'stage-row-1',
    studentId: 'student-1',
    reviewedById: 'reviewer-1',
    outcome: ReinforcementReviewOutcome.APPROVED,
    note: 'ok',
    noteAr: null,
    reviewedAt: new Date('2026-04-04T00:00:00.000Z'),
    createdAt: new Date('2026-04-04T00:00:00.000Z'),
    updatedAt: new Date('2026-04-04T00:00:00.000Z'),
    student: student(),
    assignment: assignment(),
    task: task(),
    stage: {
      id: 'stage-row-1',
      sortOrder: 1,
      titleEn: 'Stage',
      titleAr: null,
    },
  } as any;
}

function xpLedger() {
  return {
    id: 'ledger-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    assignmentId: 'assignment-1',
    policyId: null,
    sourceType: XpSourceType.MANUAL_BONUS,
    sourceId: 'bonus-1',
    amount: 15,
    reason: 'bonus',
    reasonAr: null,
    actorUserId: null,
    occurredAt: new Date('2026-04-05T00:00:00.000Z'),
    createdAt: new Date('2026-04-05T00:00:00.000Z'),
    student: student(),
    enrollment: enrollment(),
    assignment: { id: 'assignment-1', task: task() },
  } as any;
}
