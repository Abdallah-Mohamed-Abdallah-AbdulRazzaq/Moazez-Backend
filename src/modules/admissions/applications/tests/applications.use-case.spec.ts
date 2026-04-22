import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { CreateApplicationUseCase } from '../application/create-application.use-case';
import { SubmitApplicationUseCase } from '../application/submit-application.use-case';
import { ApplicationSubmitConflictException } from '../domain/application.exceptions';
import { ApplicationsRepository } from '../infrastructure/applications.repository';

type ApplicationStoreItem = {
  id: string;
  schoolId: string;
  organizationId: string;
  leadId: string | null;
  studentName: string;
  requestedAcademicYearId: string | null;
  requestedGradeId: string | null;
  source: AdmissionApplicationSource;
  status: AdmissionApplicationStatus;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

describe('Admissions applications use cases', () => {
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

  function createRepository(): ApplicationsRepository {
    const store: ApplicationStoreItem[] = [];

    return {
      findLeadById: jest.fn().mockImplementation(async (leadId: string) =>
        leadId === 'lead-1' ? { id: 'lead-1' } : null,
      ),
      findAcademicYearById: jest.fn().mockImplementation(
        async (academicYearId: string) =>
          academicYearId === 'year-1' ? { id: 'year-1' } : null,
      ),
      findGradeById: jest.fn().mockImplementation(async (gradeId: string) =>
        gradeId === 'grade-1' ? { id: 'grade-1' } : null,
      ),
      createApplication: jest.fn().mockImplementation(async (data) => {
        const now = new Date('2026-04-21T11:00:00.000Z');
        const application: ApplicationStoreItem = {
          id: `application-${store.length + 1}`,
          schoolId: String(data.schoolId),
          organizationId: String(data.organizationId),
          leadId: (data.leadId as string | null | undefined) ?? null,
          studentName: String(data.studentName),
          requestedAcademicYearId:
            (data.requestedAcademicYearId as string | null | undefined) ?? null,
          requestedGradeId:
            (data.requestedGradeId as string | null | undefined) ?? null,
          source: data.source as AdmissionApplicationSource,
          status: data.status as AdmissionApplicationStatus,
          submittedAt: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        store.push(application);
        return application;
      }),
      findApplicationById: jest.fn().mockImplementation(async (id: string) => {
        return store.find((application) => application.id === id) ?? null;
      }),
      updateApplication: jest.fn().mockImplementation(async (id: string, data) => {
        const application = store.find((item) => item.id === id);
        if (!application) {
          return null;
        }

        Object.assign(application, data, {
          updatedAt: new Date('2026-04-21T12:00:00.000Z'),
        });

        return application;
      }),
      listApplications: jest.fn(),
    } as unknown as ApplicationsRepository;
  }

  it('creates an application successfully in documents_pending state', async () => {
    const repository = createRepository();
    const useCase = new CreateApplicationUseCase(repository);

    const result = await withScope(() =>
      useCase.execute({
        leadId: 'lead-1',
        studentName: '  Sara Ahmed ',
        requestedAcademicYearId: 'year-1',
        requestedGradeId: 'grade-1',
        source: 'referral',
      }),
    );

    expect(result).toEqual({
      id: 'application-1',
      leadId: 'lead-1',
      studentName: 'Sara Ahmed',
      requestedAcademicYearId: 'year-1',
      requestedGradeId: 'grade-1',
      source: 'referral',
      status: 'documents_pending',
      submittedAt: null,
      createdAt: '2026-04-21T11:00:00.000Z',
      updatedAt: '2026-04-21T11:00:00.000Z',
    });
  });

  it('submits an application once and rejects duplicate submit attempts with conflict', async () => {
    const repository = createRepository();
    const createUseCase = new CreateApplicationUseCase(repository);
    const submitUseCase = new SubmitApplicationUseCase(repository);

    const created = await withScope(() =>
      createUseCase.execute({
        studentName: 'Salma Nabil',
        source: 'in_app',
      }),
    );

    const submitted = await withScope(() =>
      submitUseCase.execute(created.id),
    );

    expect(submitted.status).toBe('submitted');
    expect(submitted.submittedAt).toEqual(expect.any(String));

    await expect(
      withScope(() => submitUseCase.execute(created.id)),
    ).rejects.toBeInstanceOf(ApplicationSubmitConflictException);
  });
});
