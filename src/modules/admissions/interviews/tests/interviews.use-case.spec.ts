import { InterviewStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import { CreateInterviewUseCase } from '../application/create-interview.use-case';
import { InterviewsRepository } from '../infrastructure/interviews.repository';
import { presentInterview } from '../presenters/interview.presenter';
import { InterviewWorkflowValidator } from '../validators/interview-workflow.validator';

type InterviewStoreItem = {
  id: string;
  schoolId: string;
  applicationId: string;
  scheduledAt: Date | null;
  interviewerUserId: string | null;
  status: InterviewStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  application: {
    id: string;
    studentName: string;
    status: 'SUBMITTED';
  };
  interviewerUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

describe('Interviews use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['admissions.interviews.view', 'admissions.interviews.manage'],
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

  function createInterviewsRepository(store: InterviewStoreItem[] = []) {
    return {
      findScopedInterviewerByUserId: jest.fn().mockImplementation(
        async (userId: string) =>
          userId === 'interviewer-1'
            ? {
                user: {
                  id: 'interviewer-1',
                  firstName: 'Nour',
                  lastName: 'Adel',
                  email: 'nour.adel@example.com',
                  userType: UserType.SCHOOL_USER,
                },
              }
            : null,
      ),
      createInterview: jest.fn().mockImplementation(async (data) => {
        const interview: InterviewStoreItem = {
          id: `interview-${store.length + 1}`,
          schoolId: String(data.schoolId),
          applicationId: String(data.applicationId),
          scheduledAt: data.scheduledAt as Date,
          interviewerUserId:
            (data.interviewerUserId as string | null | undefined) ?? null,
          status: data.status as InterviewStatus,
          notes: (data.notes as string | null | undefined) ?? null,
          createdAt: new Date('2026-04-21T09:00:00.000Z'),
          updatedAt: new Date('2026-04-21T09:00:00.000Z'),
          application: {
            id: 'application-1',
            studentName: 'Layla Hassan',
            status: 'SUBMITTED',
          },
          interviewerUser:
            data.interviewerUserId === 'interviewer-1'
              ? {
                  id: 'interviewer-1',
                  firstName: 'Nour',
                  lastName: 'Adel',
                  email: 'nour.adel@example.com',
                }
              : null,
        };
        store.push(interview);
        return interview;
      }),
    } as unknown as InterviewsRepository;
  }

  it('creates an interview successfully', async () => {
    const applicationsRepository = createApplicationsRepository();
    const interviewsRepository = createInterviewsRepository();
    const validator = new InterviewWorkflowValidator(interviewsRepository);
    const useCase = new CreateInterviewUseCase(
      applicationsRepository,
      interviewsRepository,
      validator,
    );

    const result = await withScope(() =>
      useCase.execute({
        applicationId: 'application-1',
        scheduledAt: '2026-04-22T11:00:00.000Z',
        interviewerUserId: 'interviewer-1',
        notes: '  Parent requested Arabic-friendly interviewer  ',
      }),
    );

    expect(result).toEqual({
      id: 'interview-1',
      applicationId: 'application-1',
      studentName: 'Layla Hassan',
      scheduledAt: '2026-04-22T11:00:00.000Z',
      interviewerUserId: 'interviewer-1',
      interviewerName: 'Nour Adel',
      status: 'scheduled',
      notes: 'Parent requested Arabic-friendly interviewer',
      createdAt: '2026-04-21T09:00:00.000Z',
      updatedAt: '2026-04-21T09:00:00.000Z',
    });
  });

  it('presents interview records with the bounded API shape', () => {
    const result = presentInterview({
      id: 'interview-1',
      schoolId: 'school-1',
      applicationId: 'application-1',
      scheduledAt: new Date('2026-04-22T11:00:00.000Z'),
      interviewerUserId: 'interviewer-1',
      status: InterviewStatus.COMPLETED,
      notes: 'Good communication',
      createdAt: new Date('2026-04-21T09:00:00.000Z'),
      updatedAt: new Date('2026-04-21T12:00:00.000Z'),
      application: {
        id: 'application-1',
        studentName: 'Layla Hassan',
        status: 'SUBMITTED',
      },
      interviewerUser: {
        id: 'interviewer-1',
        firstName: 'Nour',
        lastName: 'Adel',
        email: 'nour.adel@example.com',
      },
    } as InterviewStoreItem);

    expect(result).toEqual({
      id: 'interview-1',
      applicationId: 'application-1',
      studentName: 'Layla Hassan',
      scheduledAt: '2026-04-22T11:00:00.000Z',
      interviewerUserId: 'interviewer-1',
      interviewerName: 'Nour Adel',
      status: 'completed',
      notes: 'Good communication',
      createdAt: '2026-04-21T09:00:00.000Z',
      updatedAt: '2026-04-21T12:00:00.000Z',
    });
  });
});
