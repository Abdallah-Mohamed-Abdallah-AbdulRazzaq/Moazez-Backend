import {
  ReinforcementReviewOutcome,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  XpSourceType,
} from '@prisma/client';
import {
  presentClassroomReinforcementSummary,
  presentEnum,
  presentReinforcementOverview,
  presentStudentReinforcementProgress,
} from '../presenters/reinforcement-overview.presenter';

describe('reinforcement overview presenter', () => {
  it('maps enum values to lowercase in overview responses', () => {
    const response = presentReinforcementOverview({
      scope: {
        academicYearId: 'year-1',
        yearId: 'year-1',
        termId: 'term-1',
        stageId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
        studentId: null,
        source: ReinforcementSource.TEACHER,
      },
      dataset: {
        tasks: [task()],
        assignments: [assignment()],
        submissions: [submission()],
        reviews: [review()],
        xpLedger: [xpLedger()],
      },
    });

    expect(response.scope.source).toBe('teacher');
    expect(response.tasks.bySource).toContainEqual({
      source: 'teacher',
      count: 1,
    });
    expect(response.tasks.byStatus).toContainEqual({
      status: 'completed',
      count: 1,
    });
    expect(response.xp.bySourceType).toContainEqual({
      sourceType: 'manual_bonus',
      count: 1,
      totalXp: 15,
    });
    expect(response.recentActivity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'review', outcome: 'approved' }),
        expect.objectContaining({
          type: 'submission',
          status: 'submitted',
        }),
      ]),
    );
  });

  it('does not expose schoolId', () => {
    const response = presentStudentReinforcementProgress({
      student: student(),
      enrollment: enrollment(),
      tasks: [task()],
      assignments: [assignment()],
      submissions: [submission()],
      reviews: [review()],
      xpLedger: [xpLedger()],
    });

    expect(JSON.stringify(response)).not.toContain('schoolId');
  });

  it('keeps unavailable student fields explicitly null', () => {
    const response = presentStudentReinforcementProgress({
      student: student(),
      enrollment: enrollment(),
      tasks: [],
      assignments: [],
      submissions: [],
      reviews: [],
      xpLedger: [],
    });

    expect(response.student).toMatchObject({
      nameAr: null,
      code: null,
      admissionNo: null,
    });
  });

  it('builds classroom student rows with compact per-student metrics', () => {
    const response = presentClassroomReinforcementSummary({
      classroom: classroom(),
      enrollments: [enrollment()],
      tasks: [task()],
      assignments: [assignment()],
      submissions: [submission()],
      reviews: [review()],
      xpLedger: [xpLedger()],
    });

    expect(response.studentsCount).toBe(1);
    expect(response.students[0]).toMatchObject({
      studentId: 'student-1',
      name: 'Ada Lovelace',
      totalXp: 15,
      assignmentsTotal: 1,
      assignmentsCompleted: 1,
      completionRate: 1,
      pendingReviews: 1,
    });
  });

  it('exports the shared enum presenter as lowercase', () => {
    expect(presentEnum(ReinforcementTaskStatus.UNDER_REVIEW)).toBe(
      'under_review',
    );
  });
});

function student() {
  return {
    id: 'student-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    status: 'ACTIVE',
    schoolId: 'should-not-leak',
  } as any;
}

function classroom() {
  return {
    id: 'classroom-1',
    nameAr: 'Class AR',
    nameEn: 'Class EN',
    sectionId: 'section-1',
    schoolId: 'should-not-leak',
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
