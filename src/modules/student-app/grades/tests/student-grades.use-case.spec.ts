import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import { GetStudentAssessmentGradeUseCase } from '../application/get-student-assessment-grade.use-case';
import { GetStudentGradesSummaryUseCase } from '../application/get-student-grades-summary.use-case';
import { ListStudentGradesUseCase } from '../application/list-student-grades.use-case';
import {
  StudentGradesReadAdapter,
  type StudentAssessmentGradeDetailReadResult,
  type StudentGradesReadResult,
} from '../infrastructure/student-grades-read.adapter';

describe('Student Grades use-cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.listGrades).not.toHaveBeenCalled();
  });

  it('lists current student grade assessments only from the read adapter', async () => {
    const { listUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listGrades.mockResolvedValue(gradesReadResultFixture());

    const result = await listUseCase.execute({ subjectId: 'subject-1' });

    expect(readAdapter.listGrades).toHaveBeenCalledWith({
      context: contextFixture(),
      query: { subjectId: 'subject-1' },
    });
    expect(result.assessments).toEqual([
      expect.objectContaining({
        assessmentId: 'assessment-1',
        subjectId: 'subject-1',
        score: 8,
        maxScore: 10,
        itemStatus: 'entered',
      }),
    ]);
  });

  it('summarizes grades using current student data only', async () => {
    const { summaryUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listGrades.mockResolvedValue(gradesReadResultFixture());

    const result = await summaryUseCase.execute();

    expect(readAdapter.listGrades).toHaveBeenCalledWith({
      context: contextFixture(),
      query: undefined,
      paginate: false,
    });
    expect(result.summary).toMatchObject({
      totalEarned: 8,
      totalMax: 10,
      percentage: 80,
    });
  });

  it('rejects assessment grade details outside current ownership', async () => {
    const { assessmentUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findAssessmentGrade.mockResolvedValue(null);

    await expect(
      assessmentUseCase.execute('outside-assessment'),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('returns safe assessment grade details without answer data', async () => {
    const { assessmentUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findAssessmentGrade.mockResolvedValue(
      assessmentGradeReadResultFixture(),
    );

    const result = await assessmentUseCase.execute('assessment-1');
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      assessment: {
        assessmentId: 'assessment-1',
        subject: { subjectId: 'subject-1' },
      },
      grade: {
        gradeItemId: 'grade-item-1',
        score: 8,
        maxScore: 10,
        isVirtualMissing: false,
      },
      submission: {
        submissionId: 'submission-1',
        status: 'submitted',
      },
    });
    expect(serialized).not.toContain('answerKey');
    expect(serialized).not.toContain('correctAnswer');
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
  });
});

function createUseCases(): {
  listUseCase: ListStudentGradesUseCase;
  summaryUseCase: GetStudentGradesSummaryUseCase;
  assessmentUseCase: GetStudentAssessmentGradeUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentGradesReadAdapter>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    listGrades: jest.fn(),
    findAssessmentGrade: jest.fn(),
  } as unknown as jest.Mocked<StudentGradesReadAdapter>;

  return {
    listUseCase: new ListStudentGradesUseCase(accessService, readAdapter),
    summaryUseCase: new GetStudentGradesSummaryUseCase(
      accessService,
      readAdapter,
    ),
    assessmentUseCase: new GetStudentAssessmentGradeUseCase(
      accessService,
      readAdapter,
    ),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
    currentStudentFixture(),
  );
  return created;
}

function currentStudentFixture(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: contextFixture(),
    student: {} as StudentAppCurrentStudentWithEnrollment['student'],
    enrollment: {} as StudentAppCurrentStudentWithEnrollment['enrollment'],
  };
}

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function gradesReadResultFixture(): StudentGradesReadResult {
  return {
    enrollment: enrollmentFixture(),
    assessments: [assessmentFixture()],
    gradeItems: [
      {
        id: 'grade-item-1',
        assessmentId: 'assessment-1',
        score: 8,
        status: 'ENTERED',
        comment: 'Visible feedback',
        enteredAt: new Date('2026-10-04T08:00:00.000Z'),
      },
    ],
    page: 1,
    limit: 50,
    total: 1,
  } as unknown as StudentGradesReadResult;
}

function assessmentGradeReadResultFixture(): StudentAssessmentGradeDetailReadResult {
  return {
    enrollment: enrollmentFixture(),
    assessment: assessmentFixture(),
    gradeItem: {
      id: 'grade-item-1',
      assessmentId: 'assessment-1',
      score: 8,
      status: 'ENTERED',
      comment: 'Visible feedback',
      enteredAt: new Date('2026-10-04T08:00:00.000Z'),
    },
    submission: {
      id: 'submission-1',
      assessmentId: 'assessment-1',
      status: 'SUBMITTED',
      totalScore: 8,
      maxScore: 10,
      submittedAt: new Date('2026-10-04T08:30:00.000Z'),
      correctedAt: new Date('2026-10-05T08:00:00.000Z'),
    },
  } as unknown as StudentAssessmentGradeDetailReadResult;
}

function enrollmentFixture() {
  return {
    id: 'enrollment-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    academicYear: {
      id: 'year-1',
      nameAr: 'Year 1 AR',
      nameEn: 'Year 1',
    },
    term: {
      id: 'term-1',
      nameAr: 'Term 1 AR',
      nameEn: 'Term 1',
    },
    classroom: {
      id: 'classroom-1',
      section: {
        id: 'section-1',
        grade: {
          id: 'grade-1',
          stage: {
            id: 'stage-1',
          },
        },
      },
    },
  };
}

function assessmentFixture() {
  return {
    id: 'assessment-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    subjectId: 'subject-1',
    titleEn: 'Quiz 1',
    titleAr: null,
    type: 'QUIZ',
    deliveryMode: 'QUESTION_BASED',
    date: new Date('2026-10-01T00:00:00.000Z'),
    weight: 10,
    maxScore: 10,
    expectedTimeMinutes: 30,
    approvalStatus: 'PUBLISHED',
    lockedAt: null,
    subject: {
      id: 'subject-1',
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
  };
}
