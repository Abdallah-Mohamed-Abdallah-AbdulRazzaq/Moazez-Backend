import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { GetParentChildAssessmentGradeUseCase } from '../application/get-parent-child-assessment-grade.use-case';
import { GetParentChildGradesSummaryUseCase } from '../application/get-parent-child-grades-summary.use-case';
import { ListParentChildGradesUseCase } from '../application/list-parent-child-grades.use-case';
import {
  ParentGradesReadAdapter,
  type ParentAssessmentGradeDetailReadResult,
  type ParentGradesReadResult,
} from '../infrastructure/parent-grades-read.adapter';

describe('Parent Grades use-cases', () => {
  it('rejects non-parent actors through ParentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertParentOwnsStudent.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(listUseCase.execute('student-1')).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readAdapter.listGrades).not.toHaveBeenCalled();
  });

  it('validates parent ownership before listing child grade data', async () => {
    const { listUseCase, accessService, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.listGrades.mockResolvedValue(gradesReadResultFixture());

    const result = await listUseCase.execute('student-1', {
      subjectId: 'subject-1',
    });

    expect(accessService.assertParentOwnsStudent).toHaveBeenCalledWith(
      'student-1',
    );
    expect(readAdapter.listGrades).toHaveBeenCalledWith({
      child: childFixture(),
      query: { subjectId: 'subject-1' },
    });
    expect(result.assessments).toEqual([
      expect.objectContaining({
        assessmentId: 'assessment-1',
        subjectId: 'subject-1',
        score: 8,
        maxScore: 10,
      }),
    ]);
  });

  it('summarizes grades using owned child data only', async () => {
    const { summaryUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listGrades.mockResolvedValue(gradesReadResultFixture());

    const result = await summaryUseCase.execute('student-1');

    expect(readAdapter.listGrades).toHaveBeenCalledWith({
      child: childFixture(),
      query: undefined,
      paginate: false,
    });
    expect(result.summary).toMatchObject({
      totalEarned: 8,
      totalMax: 10,
      percentage: 80,
    });
  });

  it('rejects inaccessible assessment details', async () => {
    const { assessmentUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findAssessmentGrade.mockResolvedValue(null);

    await expect(
      assessmentUseCase.execute('student-1', 'outside-assessment'),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('returns safe assessment details without answer keys or tenant fields', async () => {
    const { assessmentUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findAssessmentGrade.mockResolvedValue(
      assessmentGradeReadResultFixture(),
    );

    const result = await assessmentUseCase.execute('student-1', 'assessment-1');
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      child: {
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
      },
      assessment: {
        assessmentId: 'assessment-1',
        subject: { subjectId: 'subject-1' },
      },
      grade: {
        gradeItemId: 'grade-item-1',
        score: 8,
        maxScore: 10,
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
  listUseCase: ListParentChildGradesUseCase;
  summaryUseCase: GetParentChildGradesSummaryUseCase;
  assessmentUseCase: GetParentChildAssessmentGradeUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentGradesReadAdapter>;
} {
  const accessService = {
    assertParentOwnsStudent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    listGrades: jest.fn(),
    findAssessmentGrade: jest.fn(),
  } as unknown as jest.Mocked<ParentGradesReadAdapter>;

  return {
    listUseCase: new ListParentChildGradesUseCase(accessService, readAdapter),
    summaryUseCase: new GetParentChildGradesSummaryUseCase(
      accessService,
      readAdapter,
    ),
    assessmentUseCase: new GetParentChildAssessmentGradeUseCase(
      accessService,
      readAdapter,
    ),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.assertParentOwnsStudent.mockResolvedValue(
    childFixture(),
  );
  return created;
}

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function gradesReadResultFixture(): ParentGradesReadResult {
  return {
    child: childFixture(),
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
  } as unknown as ParentGradesReadResult;
}

function assessmentGradeReadResultFixture(): ParentAssessmentGradeDetailReadResult {
  return {
    child: childFixture(),
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
  } as unknown as ParentAssessmentGradeDetailReadResult;
}

function enrollmentFixture() {
  return {
    id: 'enrollment-1',
    schoolId: 'school-1',
    studentId: 'student-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    academicYear: { id: 'year-1', nameAr: 'Year AR', nameEn: 'Year' },
    term: { id: 'term-1', nameAr: 'Term AR', nameEn: 'Term' },
    classroom: {
      id: 'classroom-1',
      section: {
        id: 'section-1',
        grade: {
          id: 'grade-1',
          stage: { id: 'stage-1' },
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
