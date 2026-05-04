import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeItemStatus,
  GradeQuestionType,
  GradeSubmissionStatus,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../../common/exceptions/domain-exception';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import {
  TeacherAppAllocationNotFoundException,
  TeacherAppRequiredTeacherException,
} from '../../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';
import { GetTeacherClassroomAssessmentUseCase } from '../application/get-teacher-classroom-assessment.use-case';
import { GetTeacherClassroomGradebookUseCase } from '../application/get-teacher-classroom-gradebook.use-case';
import { ListTeacherClassroomAssignmentsUseCase } from '../application/list-teacher-classroom-assignments.use-case';
import { ListTeacherClassroomAssessmentsUseCase } from '../application/list-teacher-classroom-assessments.use-case';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';

describe('Teacher classroom grades use-cases', () => {
  it('rejects non-teacher actors through the Teacher App access service', async () => {
    for (const scenario of createUseCaseScenarios()) {
      const { useCases, accessService, gradesAdapter } = createUseCases();
      accessService.assertTeacherOwnsAllocation.mockRejectedValue(
        new TeacherAppRequiredTeacherException({ reason: 'actor_not_teacher' }),
      );

      await expect(scenario.execute(useCases)).rejects.toMatchObject({
        code: 'teacher_app.actor.required_teacher',
      });
      expect(gradesAdapter.listAssessments).not.toHaveBeenCalled();
      expect(gradesAdapter.getAssessmentDetail).not.toHaveBeenCalled();
      expect(gradesAdapter.getGradebook).not.toHaveBeenCalled();
      expect(gradesAdapter.listAssignments).not.toHaveBeenCalled();
    }
  });

  it('checks allocation ownership before every grades read', async () => {
    for (const scenario of createUseCaseScenarios()) {
      const { useCases, accessService, gradesAdapter } = createUseCases();

      await scenario.execute(useCases);

      const accessOrder =
        accessService.assertTeacherOwnsAllocation.mock.invocationCallOrder[0];
      const adapterOrder =
        gradesAdapter[scenario.adapterMethod].mock.invocationCallOrder[0];
      expect(accessOrder).toBeLessThan(adapterOrder);
      expect(accessService.assertTeacherOwnsAllocation).toHaveBeenCalledWith(
        'allocation-1',
      );
    }
  });

  it('lists assessment cards for the owned classroom/subject/term only', async () => {
    const { useCases, gradesAdapter } = createUseCases();

    const result = await useCases.listAssessments.execute('allocation-1', {
      status: 'published',
      type: 'quiz',
      search: 'Unit',
      page: 1,
      limit: 10,
    });
    const json = JSON.stringify(result);

    expect(gradesAdapter.listAssessments).toHaveBeenCalledWith({
      allocation: expect.objectContaining({
        id: 'allocation-1',
        classroomId: 'classroom-1',
        subjectId: 'subject-1',
        termId: 'term-1',
      }),
      filters: {
        status: 'published',
        type: 'quiz',
        search: 'Unit',
        page: 1,
        limit: 10,
      },
    });
    expect(result.assessments).toEqual([
      expect.objectContaining({
        assessmentId: 'assessment-1',
        title: 'Unit Quiz',
        type: 'quiz',
        status: 'published',
        maxScore: 20,
        itemsCount: 1,
        submissionsCount: 1,
      }),
    ]);
    expect(json).not.toContain('other-assessment');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('returns safe assessment detail and rejects mismatched assessments', async () => {
    const { useCases, gradesAdapter } = createUseCases();

    const result = await useCases.getAssessment.execute(
      'allocation-1',
      'assessment-1',
    );
    const json = JSON.stringify(result);

    expect(result.assessment).toMatchObject({
      assessmentId: 'assessment-1',
      title: 'Unit Quiz',
      status: 'published',
      isLocked: false,
    });
    expect(result.questions).toEqual([
      {
        questionId: 'question-1',
        type: 'short_answer',
        prompt: 'Explain the idea',
        points: 5,
        sortOrder: 1,
        required: true,
        optionsCount: 0,
      },
    ]);
    expect(result.submissionsSummary.submittedCount).toBe(1);
    expect(json).not.toContain('answerKey');
    expect(json).not.toContain('metadata');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');

    gradesAdapter.getAssessmentDetail.mockRejectedValueOnce(
      new NotFoundDomainException('Grade assessment not found', {
        assessmentId: 'other-assessment',
      }),
    );
    await expect(
      useCases.getAssessment.execute('allocation-1', 'other-assessment'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('returns a classroom gradebook with only owned classroom students', async () => {
    const { useCases } = createUseCases();

    const result = await useCases.getGradebook.execute('allocation-1', {});
    const json = JSON.stringify(result);

    expect(result.students).toEqual([
      {
        studentId: 'student-1',
        displayName: 'Mona Ahmed',
        grades: [
          {
            assessmentId: 'assessment-1',
            assessmentTitle: 'Unit Quiz',
            score: 18,
            maxScore: 20,
            status: 'entered',
            workflowState: 'published',
          },
        ],
      },
    ]);
    expect(json).not.toContain('student-outside');
    expect(json).not.toContain('guardian');
    expect(json).not.toContain('medical');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('derives assignment cards from GradeAssessment and keeps Homework core deferred', async () => {
    const { useCases, gradesAdapter } = createUseCases();

    const result = await useCases.listAssignments.execute('allocation-1', {});
    const json = JSON.stringify(result);

    expect(gradesAdapter.listAssignments).toHaveBeenCalledWith({
      allocation: expect.objectContaining({ id: 'allocation-1' }),
      filters: {},
    });
    expect(result.assignments).toEqual([
      {
        assignmentId: 'assignment-1',
        source: 'grades_assessment',
        title: 'Worksheet',
        type: 'assignment',
        status: 'approved',
        maxScore: 10,
        dueAt: null,
        submissionsCount: 0,
        gradedCount: 1,
      },
    ]);
    expect(json).not.toContain('homeworkId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('schoolId');
  });

  it('rejects same-school and cross-school unowned allocations before grades access', async () => {
    for (const classId of ['same-school-other-teacher', 'cross-school']) {
      const { useCases, accessService, gradesAdapter } = createUseCases();
      accessService.assertTeacherOwnsAllocation.mockRejectedValue(
        new TeacherAppAllocationNotFoundException({ classId }),
      );

      await expect(
        useCases.listAssessments.execute(classId, {}),
      ).rejects.toMatchObject({
        code: 'teacher_app.allocation.not_found',
      });
      expect(gradesAdapter.listAssessments).not.toHaveBeenCalled();
    }
  });
});

function createUseCaseScenarios(): Array<{
  adapterMethod: keyof Pick<
    jest.Mocked<TeacherClassroomGradesReadAdapter>,
    | 'listAssessments'
    | 'getAssessmentDetail'
    | 'getGradebook'
    | 'listAssignments'
  >;
  execute: (
    useCases: ReturnType<typeof createUseCases>['useCases'],
  ) => Promise<unknown>;
}> {
  return [
    {
      adapterMethod: 'listAssessments',
      execute: (useCases) =>
        useCases.listAssessments.execute('allocation-1', {}),
    },
    {
      adapterMethod: 'getAssessmentDetail',
      execute: (useCases) =>
        useCases.getAssessment.execute('allocation-1', 'assessment-1'),
    },
    {
      adapterMethod: 'getGradebook',
      execute: (useCases) => useCases.getGradebook.execute('allocation-1', {}),
    },
    {
      adapterMethod: 'listAssignments',
      execute: (useCases) =>
        useCases.listAssignments.execute('allocation-1', {}),
    },
  ];
}

function createUseCases(): {
  useCases: {
    listAssessments: ListTeacherClassroomAssessmentsUseCase;
    getAssessment: GetTeacherClassroomAssessmentUseCase;
    getGradebook: GetTeacherClassroomGradebookUseCase;
    listAssignments: ListTeacherClassroomAssignmentsUseCase;
  };
  accessService: jest.Mocked<TeacherAppAccessService>;
  gradesAdapter: jest.Mocked<TeacherClassroomGradesReadAdapter>;
} {
  const accessService = {
    assertTeacherOwnsAllocation: jest.fn(() =>
      Promise.resolve(allocationFixture()),
    ),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const gradesAdapter = {
    listAssessments: jest.fn(() =>
      Promise.resolve({
        items: [assessmentFixture()],
        page: 1,
        limit: 20,
        total: 1,
      }),
    ),
    getAssessmentDetail: jest.fn(() =>
      Promise.resolve({
        assessment: assessmentDetailFixture(),
        itemStatusCounts: new Map([[GradeItemStatus.ENTERED, 1]]),
        submissionStatusCounts: new Map([[GradeSubmissionStatus.SUBMITTED, 1]]),
      }),
    ),
    getGradebook: jest.fn(() =>
      Promise.resolve({
        enrollments: [
          {
            id: 'enrollment-1',
            studentId: 'student-1',
            classroomId: 'classroom-1',
            student: {
              id: 'student-1',
              firstName: 'Mona',
              lastName: 'Ahmed',
            },
          },
        ],
        assessments: [assessmentFixture()],
        gradeItems: [
          {
            id: 'item-1',
            assessmentId: 'assessment-1',
            studentId: 'student-1',
            score: 18,
            status: GradeItemStatus.ENTERED,
          },
        ],
        page: 1,
        limit: 50,
        total: 1,
      }),
    ),
    listAssignments: jest.fn(() =>
      Promise.resolve({
        items: [
          assessmentFixture({
            id: 'assignment-1',
            titleEn: 'Worksheet',
            type: GradeAssessmentType.ASSIGNMENT,
            approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
            maxScore: 10,
            _count: { items: 1, submissions: 0, questions: 0 },
          }),
        ],
        gradedCounts: new Map([['assignment-1', 1]]),
        page: 1,
        limit: 20,
        total: 1,
      }),
    ),
  } as unknown as jest.Mocked<TeacherClassroomGradesReadAdapter>;

  return {
    useCases: {
      listAssessments: new ListTeacherClassroomAssessmentsUseCase(
        accessService,
        gradesAdapter,
      ),
      getAssessment: new GetTeacherClassroomAssessmentUseCase(
        accessService,
        gradesAdapter,
      ),
      getGradebook: new GetTeacherClassroomGradebookUseCase(
        accessService,
        gradesAdapter,
      ),
      listAssignments: new ListTeacherClassroomAssignmentsUseCase(
        accessService,
        gradesAdapter,
      ),
    },
    accessService,
    gradesAdapter,
  };
}

function allocationFixture(): TeacherAppAllocationRecord {
  return {
    id: 'allocation-1',
    schoolId: 'school-1',
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: null,
    classroom: null,
    term: {
      id: 'term-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
  };
}

function assessmentFixture(overrides?: Record<string, unknown>) {
  return {
    id: 'assessment-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    titleEn: 'Unit Quiz',
    titleAr: null,
    type: GradeAssessmentType.QUIZ,
    deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
    date: new Date('2026-09-15T00:00:00.000Z'),
    weight: 10,
    maxScore: 20,
    expectedTimeMinutes: null,
    approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
    publishedAt: new Date('2026-09-14T10:00:00.000Z'),
    approvedAt: null,
    lockedAt: null,
    createdAt: new Date('2026-09-13T10:00:00.000Z'),
    updatedAt: new Date('2026-09-14T10:00:00.000Z'),
    _count: { items: 1, submissions: 1, questions: 1 },
    ...overrides,
  };
}

function assessmentDetailFixture() {
  return {
    ...assessmentFixture(),
    questions: [
      {
        id: 'question-1',
        type: GradeQuestionType.SHORT_ANSWER,
        prompt: 'Explain the idea',
        points: 5,
        sortOrder: 1,
        required: true,
        _count: { options: 0 },
      },
    ],
  };
}
