import {
  PlacementTestStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import { CreatePlacementTestUseCase } from '../application/create-placement-test.use-case';
import { PlacementTestAlreadyScheduledException } from '../domain/placement-test.exceptions';
import { PlacementTestsRepository } from '../infrastructure/placement-tests.repository';
import { presentPlacementTest } from '../presenters/placement-test.presenter';
import { PlacementTestScheduleValidator } from '../validators/placement-test-schedule.validator';

type PlacementTestStoreItem = {
  id: string;
  schoolId: string;
  applicationId: string;
  subjectId: string | null;
  type: string;
  scheduledAt: Date | null;
  score: { toString(): string } | null;
  result: string | null;
  status: PlacementTestStatus;
  createdAt: Date;
  updatedAt: Date;
  application: {
    id: string;
    studentName: string;
    status: 'SUBMITTED';
  };
  subject: {
    id: string;
    nameAr: string;
    nameEn: string;
  } | null;
};

describe('PlacementTests use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['admissions.tests.view', 'admissions.tests.manage'],
      });

      return fn();
    });
  }

  function createApplicationsRepository(): ApplicationsRepository {
    return {
      findApplicationById: jest.fn().mockResolvedValue({
        id: 'application-1',
        schoolId: 'school-1',
        organizationId: 'org-1',
        leadId: null,
        studentName: 'Layla Hassan',
        requestedAcademicYearId: null,
        requestedGradeId: null,
        source: 'REFERRAL',
        status: 'SUBMITTED',
        submittedAt: new Date('2026-04-21T08:00:00.000Z'),
        createdAt: new Date('2026-04-20T08:00:00.000Z'),
        updatedAt: new Date('2026-04-20T08:00:00.000Z'),
        deletedAt: null,
      }),
    } as unknown as ApplicationsRepository;
  }

  function createPlacementTestsRepository(store: PlacementTestStoreItem[] = []) {
    return {
      findSubjectById: jest.fn().mockImplementation(async (subjectId: string) =>
        subjectId === 'subject-1'
          ? {
              id: 'subject-1',
              nameAr: 'رياضيات',
              nameEn: 'Math',
            }
          : null,
      ),
      findConflictingScheduledTest: jest.fn().mockImplementation(
        async ({ applicationId, type, subjectId }: { applicationId: string; type: string; subjectId?: string | null }) => {
          const existing = store.find(
            (placementTest) =>
              placementTest.applicationId === applicationId &&
              placementTest.type === type &&
              placementTest.subjectId === (subjectId ?? null) &&
              [PlacementTestStatus.SCHEDULED, PlacementTestStatus.RESCHEDULED].includes(
                placementTest.status,
              ),
          );

          return existing ? { id: existing.id } : null;
        },
      ),
      createPlacementTest: jest.fn().mockImplementation(async (data) => {
        const placementTest: PlacementTestStoreItem = {
          id: `test-${store.length + 1}`,
          schoolId: String(data.schoolId),
          applicationId: String(data.applicationId),
          subjectId: (data.subjectId as string | null | undefined) ?? null,
          type: String(data.type),
          scheduledAt: data.scheduledAt as Date,
          score: null,
          result: null,
          status: data.status as PlacementTestStatus,
          createdAt: new Date('2026-04-21T09:00:00.000Z'),
          updatedAt: new Date('2026-04-21T09:00:00.000Z'),
          application: {
            id: 'application-1',
            studentName: 'Layla Hassan',
            status: 'SUBMITTED',
          },
          subject:
            data.subjectId === 'subject-1'
              ? {
                  id: 'subject-1',
                  nameAr: 'رياضيات',
                  nameEn: 'Math',
                }
              : null,
        };
        store.push(placementTest);
        return placementTest;
      }),
    } as unknown as PlacementTestsRepository;
  }

  it('creates a placement test successfully', async () => {
    const applicationsRepository = createApplicationsRepository();
    const placementTestsRepository = createPlacementTestsRepository();
    const validator = new PlacementTestScheduleValidator(placementTestsRepository);
    const useCase = new CreatePlacementTestUseCase(
      applicationsRepository,
      placementTestsRepository,
      validator,
    );

    const result = await withScope(() =>
      useCase.execute({
        applicationId: 'application-1',
        type: ' Placement ',
        scheduledAt: '2026-04-22T10:00:00.000Z',
        subjectId: 'subject-1',
      }),
    );

    expect(result).toEqual({
      id: 'test-1',
      applicationId: 'application-1',
      studentName: 'Layla Hassan',
      subjectId: 'subject-1',
      subjectName: 'Math',
      type: 'Placement',
      scheduledAt: '2026-04-22T10:00:00.000Z',
      score: null,
      result: null,
      status: 'scheduled',
      createdAt: '2026-04-21T09:00:00.000Z',
      updatedAt: '2026-04-21T09:00:00.000Z',
    });
  });

  it('rejects conflicting placement test scheduling for the same application', async () => {
    const applicationsRepository = createApplicationsRepository();
    const existingStore: PlacementTestStoreItem[] = [
      {
        id: 'test-existing',
        schoolId: 'school-1',
        applicationId: 'application-1',
        subjectId: 'subject-1',
        type: 'Placement',
        scheduledAt: new Date('2026-04-22T10:00:00.000Z'),
        score: null,
        result: null,
        status: PlacementTestStatus.SCHEDULED,
        createdAt: new Date('2026-04-21T09:00:00.000Z'),
        updatedAt: new Date('2026-04-21T09:00:00.000Z'),
        application: {
          id: 'application-1',
          studentName: 'Layla Hassan',
          status: 'SUBMITTED',
        },
        subject: {
          id: 'subject-1',
          nameAr: 'رياضيات',
          nameEn: 'Math',
        },
      },
    ];
    const placementTestsRepository =
      createPlacementTestsRepository(existingStore);
    const validator = new PlacementTestScheduleValidator(placementTestsRepository);
    const useCase = new CreatePlacementTestUseCase(
      applicationsRepository,
      placementTestsRepository,
      validator,
    );

    await expect(
      withScope(() =>
        useCase.execute({
          applicationId: 'application-1',
          type: 'Placement',
          scheduledAt: '2026-04-23T10:00:00.000Z',
          subjectId: 'subject-1',
        }),
      ),
    ).rejects.toBeInstanceOf(PlacementTestAlreadyScheduledException);
  });

  it('presents placement test records with the bounded API shape', () => {
    const result = presentPlacementTest({
      id: 'test-1',
      schoolId: 'school-1',
      applicationId: 'application-1',
      subjectId: 'subject-1',
      type: 'Placement',
      scheduledAt: new Date('2026-04-22T10:00:00.000Z'),
      score: {
        toString: () => '85.50',
      },
      result: 'Passed',
      status: PlacementTestStatus.COMPLETED,
      createdAt: new Date('2026-04-21T09:00:00.000Z'),
      updatedAt: new Date('2026-04-21T11:00:00.000Z'),
      application: {
        id: 'application-1',
        studentName: 'Layla Hassan',
        status: 'SUBMITTED',
      },
      subject: {
        id: 'subject-1',
        nameAr: 'رياضيات',
        nameEn: 'Math',
      },
    } as PlacementTestStoreItem);

    expect(result).toEqual({
      id: 'test-1',
      applicationId: 'application-1',
      studentName: 'Layla Hassan',
      subjectId: 'subject-1',
      subjectName: 'Math',
      type: 'Placement',
      scheduledAt: '2026-04-22T10:00:00.000Z',
      score: 85.5,
      result: 'Passed',
      status: 'completed',
      createdAt: '2026-04-21T09:00:00.000Z',
      updatedAt: '2026-04-21T11:00:00.000Z',
    });
  });
});
