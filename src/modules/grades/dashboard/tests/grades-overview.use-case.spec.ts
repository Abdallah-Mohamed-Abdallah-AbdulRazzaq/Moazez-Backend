import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeItemStatus,
  GradeRoundingMode,
  GradeRuleScale,
  GradeScopeType,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { GradesReadModelRepository } from '../../shared/infrastructure/grades-read-model.repository';
import { GetGradesOverviewUseCase } from '../application/get-grades-overview.use-case';
import { GradesDashboardReadRepository } from '../infrastructure/grades-dashboard-read.repository';

const SCHOOL_ID = 'school-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const STAGE_ID = 'stage-1';
const GRADE_ID = 'grade-1';
const SECTION_ID = 'section-1';
const CLASSROOM_ID = 'classroom-1';
const SUBJECT_ID = 'subject-1';
const STUDENT_ONE_ID = 'student-1';
const STUDENT_TWO_ID = 'student-2';

describe('GetGradesOverviewUseCase', () => {
  async function withGradesScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['grades.analytics.view'],
      });

      return fn();
    });
  }

  function enrollment(studentId: string, index: number) {
    return {
      id: `enrollment-${index}`,
      schoolId: SCHOOL_ID,
      studentId,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      classroomId: CLASSROOM_ID,
      status: 'ACTIVE',
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      student: {
        id: studentId,
        firstName: studentId === STUDENT_ONE_ID ? 'Ahmed' : 'Mona',
        lastName: 'Ali',
        status: 'ACTIVE',
      },
      classroom: {
        id: CLASSROOM_ID,
        sectionId: SECTION_ID,
        nameAr: 'Class AR',
        nameEn: 'Class A',
        section: {
          id: SECTION_ID,
          gradeId: GRADE_ID,
          nameAr: 'Section AR',
          nameEn: 'Section A',
          grade: {
            id: GRADE_ID,
            stageId: STAGE_ID,
            nameAr: 'Grade AR',
            nameEn: 'Grade A',
            stage: {
              id: STAGE_ID,
              nameAr: 'Stage AR',
              nameEn: 'Stage A',
            },
          },
        },
      },
    };
  }

  function assessment(
    id: string,
    overrides?: Partial<{
      approvalStatus: GradeAssessmentApprovalStatus;
      deliveryMode: GradeAssessmentDeliveryMode;
      maxScore: number;
      weight: number;
      lockedAt: Date | null;
    }>,
  ) {
    return {
      id,
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      subjectId: SUBJECT_ID,
      scopeType: GradeScopeType.GRADE,
      scopeKey: GRADE_ID,
      stageId: STAGE_ID,
      gradeId: GRADE_ID,
      sectionId: null,
      classroomId: null,
      titleEn: `${id} EN`,
      titleAr: `${id} AR`,
      type: GradeAssessmentType.QUIZ,
      deliveryMode:
        overrides?.deliveryMode ?? GradeAssessmentDeliveryMode.SCORE_ONLY,
      date: new Date('2026-09-15T00:00:00.000Z'),
      weight: new Prisma.Decimal(overrides?.weight ?? 50),
      maxScore: new Prisma.Decimal(overrides?.maxScore ?? 20),
      approvalStatus:
        overrides?.approvalStatus ?? GradeAssessmentApprovalStatus.PUBLISHED,
      lockedAt: overrides?.lockedAt ?? null,
      subject: {
        id: SUBJECT_ID,
        nameAr: 'Math AR',
        nameEn: 'Math',
        code: 'MATH',
        color: '#2563eb',
        isActive: true,
      },
    };
  }

  function gradeItem(params: {
    assessmentId: string;
    studentId: string;
    score?: number | null;
    status?: GradeItemStatus;
  }) {
    return {
      id: `item-${params.assessmentId}-${params.studentId}`,
      schoolId: SCHOOL_ID,
      termId: TERM_ID,
      assessmentId: params.assessmentId,
      studentId: params.studentId,
      enrollmentId:
        params.studentId === STUDENT_ONE_ID ? 'enrollment-1' : 'enrollment-2',
      score:
        params.score === undefined || params.score === null
          ? null
          : new Prisma.Decimal(params.score),
      status: params.status ?? GradeItemStatus.ENTERED,
      comment: 'Good',
      enteredAt: new Date('2026-09-15T08:00:00.000Z'),
      createdAt: new Date('2026-09-15T08:00:00.000Z'),
      updatedAt: new Date('2026-09-15T08:00:00.000Z'),
    };
  }

  function gradesRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      findAcademicYear: jest.fn().mockResolvedValue({ id: YEAR_ID }),
      findTerm: jest.fn().mockResolvedValue({
        id: TERM_ID,
        academicYearId: YEAR_ID,
        isActive: true,
      }),
      findSubject: jest.fn().mockResolvedValue({ id: SUBJECT_ID }),
      findGrade: jest.fn().mockResolvedValue({
        id: GRADE_ID,
        stageId: STAGE_ID,
      }),
      findStage: jest.fn().mockResolvedValue({ id: STAGE_ID }),
      findSectionWithGrade: jest.fn(),
      findClassroomWithGrade: jest.fn(),
      listEnrollmentsForScope: jest
        .fn()
        .mockResolvedValue([
          enrollment(STUDENT_ONE_ID, 1),
          enrollment(STUDENT_TWO_ID, 2),
        ]),
      listAssessmentsForScope: jest
        .fn()
        .mockResolvedValue([
          assessment('assessment-1'),
          assessment('assessment-2', {
            approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
            lockedAt: new Date('2026-09-20T08:00:00.000Z'),
          }),
        ]),
      listGradeItems: jest.fn().mockResolvedValue([
        gradeItem({
          assessmentId: 'assessment-1',
          studentId: STUDENT_ONE_ID,
          score: 18,
        }),
        gradeItem({
          assessmentId: 'assessment-1',
          studentId: STUDENT_TWO_ID,
          status: GradeItemStatus.ABSENT,
          score: null,
        }),
      ]),
      findRuleByUniqueScope: jest.fn().mockResolvedValue(null),
      findGradeRule: jest.fn().mockResolvedValue({
        id: 'rule-1',
        schoolId: SCHOOL_ID,
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: GradeScopeType.GRADE,
        scopeKey: GRADE_ID,
        gradeId: GRADE_ID,
        gradingScale: GradeRuleScale.PERCENTAGE,
        passMark: new Prisma.Decimal(40),
        rounding: GradeRoundingMode.DECIMAL_1,
      }),
      findSchoolRule: jest.fn().mockResolvedValue(null),
      ...overrides,
    } as unknown as GradesReadModelRepository;
  }

  function dashboardRepository(label = 'Grade A') {
    return {
      findScopeLabel: jest.fn().mockResolvedValue(label),
    } as unknown as GradesDashboardReadRepository;
  }

  it('composes overview totals, performance, completion, assessments, and rule safely', async () => {
    const gradesRepo = gradesRepository();
    const dashboardRepo = dashboardRepository();
    const useCase = new GetGradesOverviewUseCase(gradesRepo, dashboardRepo);

    const result = await withGradesScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        subjectId: SUBJECT_ID,
        scopeType: 'grade',
        gradeId: GRADE_ID,
      }),
    );

    expect(gradesRepo.listAssessmentsForScope).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: SUBJECT_ID,
        approvalStatuses: [
          GradeAssessmentApprovalStatus.PUBLISHED,
          GradeAssessmentApprovalStatus.APPROVED,
        ],
        scope: expect.objectContaining({
          scopeType: GradeScopeType.GRADE,
          scopeKey: GRADE_ID,
        }),
      }),
    );
    expect(dashboardRepo.findScopeLabel).toHaveBeenCalledWith(
      expect.objectContaining({ scopeKey: GRADE_ID }),
    );
    expect(result).toMatchObject({
      academicYearId: YEAR_ID,
      yearId: YEAR_ID,
      termId: TERM_ID,
      subjectId: SUBJECT_ID,
      scope: {
        scopeType: 'grade',
        scopeId: GRADE_ID,
        label: 'Grade A',
      },
      totals: {
        studentCount: 2,
        assessmentCount: 2,
        completedAssessmentCount: 1,
        publishedAssessmentCount: 1,
        approvedAssessmentCount: 1,
        lockedAssessmentCount: 1,
      },
      performance: {
        averagePercent: 45,
        highestPercent: 45,
        lowestPercent: 45,
        passingCount: 1,
        failingCount: 0,
        incompleteCount: 1,
      },
      completion: {
        enteredCount: 1,
        missingCount: 2,
        absentCount: 1,
        completedWeightAverage: 25,
      },
      rule: {
        source: 'GRADE',
        passMark: 40,
        rounding: 'decimal_1',
      },
      emptyState: null,
    });
    expect(result.assessments[0]).toMatchObject({
      assessmentId: 'assessment-1',
      title: 'assessment-1 EN',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      type: 'QUIZ',
      deliveryMode: 'SCORE_ONLY',
      approvalStatus: 'published',
      date: '2026-09-15',
      weight: 50,
      maxScore: 20,
      averagePercent: 90,
      enteredCount: 1,
      missingCount: 0,
      absentCount: 1,
    });
    expect(result.assessments[1]).toMatchObject({
      assessmentId: 'assessment-2',
      approvalStatus: 'approved',
      averagePercent: null,
      enteredCount: 0,
      missingCount: 2,
      absentCount: 0,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('membershipId');
    expect(serialized).not.toContain('roleId');
    expect(serialized).not.toContain('answerKey');
    expect(serialized).not.toContain('isCorrect');
    expect(serialized).not.toContain('correctAnswer');
    expect(serialized).not.toContain('objectKey');
    expect(serialized).not.toContain('bucket');
  });

  it('returns an empty state when no assessments match the filters', async () => {
    const gradesRepo = gradesRepository({
      listAssessmentsForScope: jest.fn().mockResolvedValue([]),
      listGradeItems: jest.fn().mockResolvedValue([]),
    });
    const useCase = new GetGradesOverviewUseCase(
      gradesRepo,
      dashboardRepository('Grade A'),
    );

    const result = await withGradesScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'grade',
        gradeId: GRADE_ID,
      }),
    );

    expect(result.assessments).toEqual([]);
    expect(result.totals.assessmentCount).toBe(0);
    expect(result.emptyState).toEqual({
      reason: 'no_assessments',
      message: 'No published or approved assessments were found for this selection.',
    });
  });

  it('returns a no-students empty state before assessment empty state', async () => {
    const gradesRepo = gradesRepository({
      listEnrollmentsForScope: jest.fn().mockResolvedValue([]),
      listGradeItems: jest.fn().mockResolvedValue([]),
    });
    const useCase = new GetGradesOverviewUseCase(
      gradesRepo,
      dashboardRepository('Grade A'),
    );

    const result = await withGradesScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'grade',
        gradeId: GRADE_ID,
      }),
    );

    expect(result.totals.studentCount).toBe(0);
    expect(result.emptyState).toEqual({
      reason: 'no_students',
      message: 'No active students were found for the selected grades scope.',
    });
  });
});
