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
import { GetGradesGradebookUseCase } from '../application/get-grades-gradebook.use-case';
import { GradesReadModelRepository } from '../../shared/infrastructure/grades-read-model.repository';

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

describe('GetGradesGradebookUseCase', () => {
  async function withGradesScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['grades.gradebook.view'],
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
      deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
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

  function repository(overrides?: Partial<Record<string, jest.Mock>>) {
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

  it('builds columns from published and approved score-only assessments', async () => {
    const repo = repository();
    const useCase = new GetGradesGradebookUseCase(repo);

    const result = await withGradesScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'grade',
        gradeId: GRADE_ID,
      }),
    );

    expect(repo.listAssessmentsForScope).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalStatuses: [
          GradeAssessmentApprovalStatus.PUBLISHED,
          GradeAssessmentApprovalStatus.APPROVED,
        ],
      }),
    );
    expect(result.columns.map((column) => column.assessmentId)).toEqual([
      'assessment-1',
      'assessment-2',
    ]);
    expect(result.columns[1]).toMatchObject({
      approvalStatus: 'approved',
      isLocked: true,
    });
  });

  it('builds enrolled student rows and virtual missing cells', async () => {
    const useCase = new GetGradesGradebookUseCase(repository());

    const result = await withGradesScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'grade',
        gradeId: GRADE_ID,
      }),
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      studentId: STUDENT_ONE_ID,
      totalEnteredCount: 1,
      missingCount: 1,
      completedWeight: 50,
      finalPercent: 45,
      status: 'passing',
    });
    expect(result.rows[0].cells[1]).toMatchObject({
      assessmentId: 'assessment-2',
      status: 'missing',
      isVirtualMissing: true,
    });
  });

  it('computes percent and weighted contribution with effective rule rounding', async () => {
    const repo = repository({
      listAssessmentsForScope: jest.fn().mockResolvedValue([
        assessment('assessment-1', {
          maxScore: 3,
          weight: 10,
        }),
      ]),
      listGradeItems: jest.fn().mockResolvedValue([
        gradeItem({
          assessmentId: 'assessment-1',
          studentId: STUDENT_ONE_ID,
          score: 2,
        }),
      ]),
    });
    const useCase = new GetGradesGradebookUseCase(repo);

    const result = await withGradesScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'grade',
        gradeId: GRADE_ID,
      }),
    );

    expect(result.rows[0].cells[0]).toMatchObject({
      percent: 66.7,
      weightedContribution: 6.7,
    });
    expect(result.rows[0]).toMatchObject({
      finalPercent: 6.7,
      completedWeight: 10,
      status: 'failing',
    });
  });

  it('marks rows without entered scores as incomplete', async () => {
    const result = await withGradesScope(() =>
      new GetGradesGradebookUseCase(repository()).execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'grade',
        gradeId: GRADE_ID,
      }),
    );

    expect(result.rows[1]).toMatchObject({
      studentId: STUDENT_TWO_ID,
      totalEnteredCount: 0,
      absentCount: 1,
      missingCount: 1,
      finalPercent: null,
      status: 'incomplete',
    });
    expect(result.summary).toMatchObject({
      studentCount: 2,
      assessmentCount: 2,
      passingCount: 1,
      failingCount: 0,
      incompleteCount: 1,
    });
  });
});
