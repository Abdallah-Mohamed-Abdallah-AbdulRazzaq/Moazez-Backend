import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { GetGradesBootstrapUseCase } from '../application/get-grades-bootstrap.use-case';
import {
  GradesDashboardBootstrapData,
  GradesDashboardReadRepository,
} from '../infrastructure/grades-dashboard-read.repository';

const SCHOOL_ID = 'school-1';

describe('GetGradesBootstrapUseCase', () => {
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

  function bootstrapData(
    overrides?: Partial<GradesDashboardBootstrapData>,
  ): GradesDashboardBootstrapData {
    return {
      academicYears: [
        {
          id: 'year-1',
          nameAr: 'Year AR',
          nameEn: 'Year EN',
          isActive: true,
          schoolId: SCHOOL_ID,
          createdAt: new Date(),
        } as any,
      ],
      terms: [
        {
          id: 'term-1',
          academicYearId: 'year-1',
          nameAr: 'Term AR',
          nameEn: 'Term EN',
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
          isActive: true,
          deletedAt: null,
        } as any,
      ],
      stages: [
        {
          id: 'stage-1',
          nameAr: 'Stage AR',
          nameEn: 'Stage EN',
          sortOrder: 1,
          schoolId: SCHOOL_ID,
        } as any,
      ],
      grades: [
        {
          id: 'grade-1',
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade EN',
          sortOrder: 2,
          updatedAt: new Date(),
        } as any,
      ],
      sections: [
        {
          id: 'section-1',
          gradeId: 'grade-1',
          nameAr: 'Section AR',
          nameEn: 'Section EN',
          sortOrder: 3,
          organizationId: 'org-leak',
        } as any,
      ],
      classrooms: [
        {
          id: 'classroom-1',
          sectionId: 'section-1',
          nameAr: 'Class AR',
          nameEn: 'Class EN',
          section: { gradeId: 'grade-1' },
          deletedAt: null,
        } as any,
      ],
      subjects: [
        {
          id: 'subject-1',
          nameAr: 'Subject AR',
          nameEn: 'Subject EN',
          code: 'MATH',
          isActive: true,
          schoolId: SCHOOL_ID,
        } as any,
      ],
      ...overrides,
    };
  }

  function repository(data: GradesDashboardBootstrapData) {
    return {
      getBootstrapData: jest.fn().mockResolvedValue(data),
    } as unknown as GradesDashboardReadRepository;
  }

  it('returns dashboard filters, defaults, and enum options without internal fields', async () => {
    const useCase = new GetGradesBootstrapUseCase(
      repository(bootstrapData()),
    );

    const result = await withGradesScope(() => useCase.execute());

    expect(result).toMatchObject({
      academicYears: [
        {
          id: 'year-1',
          nameAr: 'Year AR',
          nameEn: 'Year EN',
          isActive: true,
        },
      ],
      terms: [
        {
          id: 'term-1',
          academicYearId: 'year-1',
          startDate: '2026-09-01',
          endDate: '2026-12-31',
          isActive: true,
        },
      ],
      stages: [{ id: 'stage-1', sortOrder: 1 }],
      grades: [{ id: 'grade-1', stageId: 'stage-1', sortOrder: 2 }],
      sections: [{ id: 'section-1', gradeId: 'grade-1', sortOrder: 3 }],
      classrooms: [
        {
          id: 'classroom-1',
          sectionId: 'section-1',
          gradeId: 'grade-1',
          isActive: true,
        },
      ],
      subjects: [{ id: 'subject-1', code: 'MATH', isActive: true }],
      defaults: { academicYearId: 'year-1', termId: 'term-1' },
      supportedScopes: ['school', 'stage', 'grade', 'section', 'classroom'],
    });
    expect(result.assessmentTypes).toEqual(Object.values(GradeAssessmentType));
    expect(result.deliveryModes).toEqual(
      Object.values(GradeAssessmentDeliveryMode),
    );
    expect(result.approvalStatuses).toEqual(
      Object.values(GradeAssessmentApprovalStatus).map((status) =>
        status.toLowerCase(),
      ),
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('createdAt');
    expect(serialized).not.toContain('updatedAt');
    expect(serialized).not.toContain('deletedAt');
  });

  it('returns null defaults when no active year or term exists', async () => {
    const data = bootstrapData({
      academicYears: [
        {
          id: 'year-2',
          nameAr: 'Inactive Year AR',
          nameEn: 'Inactive Year EN',
          isActive: false,
        },
      ],
      terms: [
        {
          id: 'term-2',
          academicYearId: 'year-2',
          nameAr: 'Inactive Term AR',
          nameEn: 'Inactive Term EN',
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
          isActive: false,
        },
      ],
    } as any);
    const useCase = new GetGradesBootstrapUseCase(repository(data));

    const result = await withGradesScope(() => useCase.execute());

    expect(result.defaults).toEqual({ academicYearId: null, termId: null });
  });

  it('uses valid query ids as explicit defaults without extra calls', async () => {
    const repo = repository(
      bootstrapData({
        academicYears: [
          {
            id: 'year-active',
            nameAr: 'Active Year AR',
            nameEn: 'Active Year EN',
            isActive: true,
          },
          {
            id: 'year-requested',
            nameAr: 'Requested Year AR',
            nameEn: 'Requested Year EN',
            isActive: false,
          },
        ],
        terms: [
          {
            id: 'term-active',
            academicYearId: 'year-active',
            nameAr: 'Active Term AR',
            nameEn: 'Active Term EN',
            startDate: new Date('2026-09-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T00:00:00.000Z'),
            isActive: true,
          },
          {
            id: 'term-requested',
            academicYearId: 'year-requested',
            nameAr: 'Requested Term AR',
            nameEn: 'Requested Term EN',
            startDate: new Date('2027-01-01T00:00:00.000Z'),
            endDate: new Date('2027-03-31T00:00:00.000Z'),
            isActive: true,
          },
        ],
      } as any),
    );
    const useCase = new GetGradesBootstrapUseCase(repo);

    const result = await withGradesScope(() =>
      useCase.execute({
        yearId: 'year-requested',
        termId: 'term-requested',
      }),
    );

    expect(result.defaults).toEqual({
      academicYearId: 'year-requested',
      termId: 'term-requested',
    });
    expect(repo.getBootstrapData).toHaveBeenCalledTimes(1);
  });
});
