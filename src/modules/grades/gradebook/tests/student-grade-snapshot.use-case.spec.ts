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
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { GradesReadModelRepository } from '../../shared/infrastructure/grades-read-model.repository';
import { GetStudentGradeSnapshotUseCase } from '../application/get-student-grade-snapshot.use-case';

const SCHOOL_ID = 'school-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const STAGE_ID = 'stage-1';
const GRADE_ID = 'grade-1';
const SECTION_ID = 'section-1';
const CLASSROOM_ID = 'classroom-1';
const STUDENT_ID = 'student-1';
const MATH_SUBJECT_ID = 'subject-math';
const SCIENCE_SUBJECT_ID = 'subject-science';

describe('GetStudentGradeSnapshotUseCase', () => {
  async function withGradesScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['grades.snapshots.view'],
      });

      return fn();
    });
  }

  function enrollment() {
    return {
      id: 'enrollment-1',
      schoolId: SCHOOL_ID,
      studentId: STUDENT_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      classroomId: CLASSROOM_ID,
      status: 'ACTIVE',
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      student: {
        id: STUDENT_ID,
        firstName: 'Ahmed',
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

  function assessment(id: string, subjectId: string, subjectName: string) {
    return {
      id,
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      subjectId,
      scopeType: GradeScopeType.GRADE,
      scopeKey: GRADE_ID,
      stageId: STAGE_ID,
      gradeId: GRADE_ID,
      sectionId: null,
      classroomId: null,
      titleEn: `${subjectName} Quiz`,
      titleAr: `${subjectName} AR`,
      type: GradeAssessmentType.QUIZ,
      deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
      date: new Date('2026-09-15T00:00:00.000Z'),
      weight: new Prisma.Decimal(50),
      maxScore: new Prisma.Decimal(20),
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      lockedAt: null,
      subject: {
        id: subjectId,
        nameAr: `${subjectName} AR`,
        nameEn: subjectName,
        code: subjectName.toUpperCase(),
        color: null,
        isActive: true,
      },
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
      findSubject: jest.fn(),
      findStudentById: jest.fn().mockResolvedValue({
        id: STUDENT_ID,
        firstName: 'Ahmed',
        lastName: 'Ali',
        status: 'ACTIVE',
      }),
      findActiveEnrollmentForStudent: jest.fn().mockResolvedValue(enrollment()),
      listAssessmentsForScope: jest.fn().mockResolvedValue([
        assessment('assessment-math', MATH_SUBJECT_ID, 'Math'),
        assessment('assessment-science', SCIENCE_SUBJECT_ID, 'Science'),
      ]),
      listGradeItems: jest.fn().mockResolvedValue([
        {
          id: 'item-math',
          schoolId: SCHOOL_ID,
          termId: TERM_ID,
          assessmentId: 'assessment-math',
          studentId: STUDENT_ID,
          enrollmentId: 'enrollment-1',
          score: new Prisma.Decimal(18),
          status: GradeItemStatus.ENTERED,
          comment: 'Strong',
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
      ...overrides,
    } as unknown as GradesReadModelRepository;
  }

  it('validates student ownership through repository not-found behavior', async () => {
    const repo = repository({
      findStudentById: jest.fn().mockResolvedValue(null),
    });
    const useCase = new GetStudentGradeSnapshotUseCase(repo);

    await expect(
      withGradesScope(() =>
        useCase.execute(STUDENT_ID, { yearId: YEAR_ID, termId: TERM_ID }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repo.findActiveEnrollmentForStudent).not.toHaveBeenCalled();
  });

  it('validates active enrollment through repository not-found behavior', async () => {
    const repo = repository({
      findActiveEnrollmentForStudent: jest.fn().mockResolvedValue(null),
    });
    const useCase = new GetStudentGradeSnapshotUseCase(repo);

    await expect(
      withGradesScope(() =>
        useCase.execute(STUDENT_ID, { yearId: YEAR_ID, termId: TERM_ID }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repo.listAssessmentsForScope).not.toHaveBeenCalled();
  });

  it('returns per-subject breakdown and virtual missing assessments', async () => {
    const useCase = new GetStudentGradeSnapshotUseCase(repository());

    const result = await withGradesScope(() =>
      useCase.execute(STUDENT_ID, { yearId: YEAR_ID, termId: TERM_ID }),
    );

    expect(result).toMatchObject({
      studentId: STUDENT_ID,
      enrollmentId: 'enrollment-1',
      finalPercent: 45,
      completedWeight: 50,
      status: 'passing',
    });
    expect(result.subjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId: MATH_SUBJECT_ID,
          subjectName: 'Math',
          finalPercent: 45,
          enteredCount: 1,
        }),
        expect.objectContaining({
          subjectId: SCIENCE_SUBJECT_ID,
          subjectName: 'Science',
          finalPercent: null,
          missingCount: 1,
          status: 'incomplete',
        }),
      ]),
    );
    expect(result.assessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessmentId: 'assessment-science',
          status: 'missing',
          isVirtualMissing: true,
        }),
      ]),
    );
  });
});
