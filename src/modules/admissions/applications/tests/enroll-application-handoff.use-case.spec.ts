import {
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { EnrollApplicationHandoffUseCase } from '../application/enroll-application-handoff.use-case';
import { ApplicationNotAcceptedException } from '../domain/application.exceptions';
import {
  ApplicationEnrollmentHandoffRecord,
  ApplicationsRepository,
} from '../infrastructure/applications.repository';
import { presentApplicationEnrollmentHandoff } from '../presenters/application.presenter';
import { ApplicationEnrollmentHandoffValidator } from '../validators/application-enrollment-handoff.validator';
import { DecisionRequiresAllStepsException } from '../../decisions/domain/admission-decision.exceptions';

describe('Admissions application enroll handoff', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'admissions.applications.view',
          'admissions.applications.manage',
        ],
      });

      return fn();
    });
  }

  function buildApplication(
    overrides?: Partial<ApplicationEnrollmentHandoffRecord>,
  ): ApplicationEnrollmentHandoffRecord {
    return {
      id: 'application-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      leadId: 'lead-1',
      studentName: 'Layla Hassan',
      requestedAcademicYearId: 'year-1',
      requestedGradeId: 'grade-1',
      status: AdmissionApplicationStatus.ACCEPTED,
      submittedAt: new Date('2026-04-21T08:00:00.000Z'),
      decision: {
        id: 'decision-1',
        decision: AdmissionDecisionType.ACCEPT,
        decidedAt: new Date('2026-04-22T09:00:00.000Z'),
      },
      requestedAcademicYear: {
        id: 'year-1',
        nameAr: 'Academic Year 2026/2027 AR',
        nameEn: 'Academic Year 2026/2027',
        isActive: true,
      },
      requestedGrade: {
        id: 'grade-1',
        stageId: 'stage-1',
        nameAr: 'Grade 4 AR',
        nameEn: 'Grade 4',
      },
      ...overrides,
    };
  }

  function createRepository(params?: {
    application?: ApplicationEnrollmentHandoffRecord | null;
    totalPlacementTests?: number;
    completedPlacementTests?: number;
    totalInterviews?: number;
    completedInterviews?: number;
  }): ApplicationsRepository {
    return {
      findApplicationEnrollmentHandoffById: jest
        .fn()
        .mockResolvedValue(params?.application ?? buildApplication()),
      countPlacementTestsForApplication: jest
        .fn()
        .mockImplementation(
          async ({ status }: { status?: string }) =>
            status === 'COMPLETED'
              ? (params?.completedPlacementTests ?? 1)
              : (params?.totalPlacementTests ?? 1),
        ),
      countInterviewsForApplication: jest
        .fn()
        .mockImplementation(
          async ({ status }: { status?: string }) =>
            status === 'COMPLETED'
              ? (params?.completedInterviews ?? 1)
              : (params?.totalInterviews ?? 1),
        ),
      updateApplication: jest.fn(),
    } as unknown as ApplicationsRepository;
  }

  it('returns a bounded enroll handoff preview for an accepted application', async () => {
    const repository = createRepository();
    const validator = new ApplicationEnrollmentHandoffValidator(repository);
    const useCase = new EnrollApplicationHandoffUseCase(repository, validator);

    const result = await withScope(() => useCase.execute('application-1'));

    expect(result).toEqual({
      applicationId: 'application-1',
      eligible: true,
      handoff: {
        studentDraft: {
          fullName: 'Layla Hassan',
        },
        guardianDrafts: [],
        enrollmentDraft: {
          requestedAcademicYearId: 'year-1',
          requestedAcademicYearName: 'Academic Year 2026/2027',
          requestedGradeId: 'grade-1',
          requestedGradeName: 'Grade 4',
        },
      },
    });
    expect(repository.updateApplication).not.toHaveBeenCalled();
  });

  it('rejects non-accepted applications with the canonical not accepted code', async () => {
    const repository = createRepository({
      application: buildApplication({
        status: AdmissionApplicationStatus.WAITLISTED,
        decision: {
          id: 'decision-1',
          decision: AdmissionDecisionType.WAITLIST,
          decidedAt: new Date('2026-04-22T09:00:00.000Z'),
        },
      }),
    });
    const validator = new ApplicationEnrollmentHandoffValidator(repository);
    const useCase = new EnrollApplicationHandoffUseCase(repository, validator);

    await expect(
      withScope(() => useCase.execute('application-1')),
    ).rejects.toBeInstanceOf(ApplicationNotAcceptedException);
  });

  it('rejects handoff when the current admissions workflow prerequisites are incomplete', async () => {
    const repository = createRepository({
      application: buildApplication({
        status: AdmissionApplicationStatus.SUBMITTED,
        decision: null,
      }),
      totalPlacementTests: 1,
      completedPlacementTests: 0,
      totalInterviews: 1,
      completedInterviews: 1,
    });
    const validator = new ApplicationEnrollmentHandoffValidator(repository);
    const useCase = new EnrollApplicationHandoffUseCase(repository, validator);

    await expect(
      withScope(() => useCase.execute('application-1')),
    ).rejects.toBeInstanceOf(DecisionRequiresAllStepsException);
  });

  it('presents the bounded handoff response shape', () => {
    const result = presentApplicationEnrollmentHandoff(buildApplication());

    expect(result).toEqual({
      applicationId: 'application-1',
      eligible: true,
      handoff: {
        studentDraft: {
          fullName: 'Layla Hassan',
        },
        guardianDrafts: [],
        enrollmentDraft: {
          requestedAcademicYearId: 'year-1',
          requestedAcademicYearName: 'Academic Year 2026/2027',
          requestedGradeId: 'grade-1',
          requestedGradeName: 'Grade 4',
        },
      },
    });
  });
});
