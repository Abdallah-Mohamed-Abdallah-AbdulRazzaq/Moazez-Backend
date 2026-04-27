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
import { GetGradesAnalyticsDistributionUseCase } from '../application/get-grades-analytics-distribution.use-case';
import { GetGradesAnalyticsSummaryUseCase } from '../application/get-grades-analytics-summary.use-case';

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

describe('grades analytics use cases', () => {
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

  function assessment(id: string) {
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
      weight: new Prisma.Decimal(50),
      maxScore: new Prisma.Decimal(20),
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      lockedAt: null,
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

  function repository() {
    return {
      findAcademicYear: jest.fn().mockResolvedValue({ id: YEAR_ID }),
      findTerm: jest.fn().mockResolvedValue({
        id: TERM_ID,
        academicYearId: YEAR_ID,
        isActive: true,
      }),
      findSubject: jest.fn(),
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
        .mockResolvedValue([assessment('assessment-1'), assessment('assessment-2')]),
      listGradeItems: jest.fn().mockResolvedValue([
        {
          id: 'item-1',
          schoolId: SCHOOL_ID,
          termId: TERM_ID,
          assessmentId: 'assessment-1',
          studentId: STUDENT_ONE_ID,
          enrollmentId: 'enrollment-1',
          score: new Prisma.Decimal(18),
          status: GradeItemStatus.ENTERED,
          comment: 'Good',
          enteredAt: new Date('2026-09-15T08:00:00.000Z'),
          createdAt: new Date('2026-09-15T08:00:00.000Z'),
          updatedAt: new Date('2026-09-15T08:00:00.000Z'),
        },
        {
          id: 'item-2',
          schoolId: SCHOOL_ID,
          termId: TERM_ID,
          assessmentId: 'assessment-1',
          studentId: STUDENT_TWO_ID,
          enrollmentId: 'enrollment-2',
          score: null,
          status: GradeItemStatus.ABSENT,
          comment: null,
          enteredAt: new Date('2026-09-15T08:00:00.000Z'),
          createdAt: new Date('2026-09-15T08:00:00.000Z'),
          updatedAt: new Date('2026-09-15T08:00:00.000Z'),
        },
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
        rounding: GradeRoundingMode.DECIMAL_2,
      }),
      findSchoolRule: jest.fn().mockResolvedValue(null),
    } as unknown as GradesReadModelRepository;
  }

  it('summarizes entered, missing, absent, averages, and pass rate', async () => {
    const result = await withGradesScope(() =>
      new GetGradesAnalyticsSummaryUseCase(repository()).execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'grade',
        gradeId: GRADE_ID,
      }),
    );

    expect(result).toMatchObject({
      studentCount: 2,
      assessmentCount: 2,
      enteredItemCount: 1,
      missingItemCount: 2,
      absentItemCount: 1,
      averagePercent: 45,
      highestPercent: 45,
      lowestPercent: 45,
      passingCount: 1,
      failingCount: 0,
      incompleteCount: 1,
      passRate: 100,
      completedWeightAverage: 25,
    });
  });

  it('builds distribution buckets and separates incomplete students', async () => {
    const result = await withGradesScope(() =>
      new GetGradesAnalyticsDistributionUseCase(repository()).execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'grade',
        gradeId: GRADE_ID,
        bucketSize: 10,
      }),
    );

    expect(result.incompleteCount).toBe(1);
    expect(result.totalStudents).toBe(2);
    expect(result.buckets.find((bucket) => bucket.from === 40)).toEqual({
      from: 40,
      to: 49,
      count: 1,
    });
  });
});
