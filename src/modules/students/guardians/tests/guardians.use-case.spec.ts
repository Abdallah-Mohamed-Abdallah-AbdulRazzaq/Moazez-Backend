import { StudentStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { CreateGuardianUseCase } from '../application/create-guardian.use-case';
import { LinkGuardianToStudentUseCase } from '../application/link-guardian-to-student.use-case';
import { UpdateStudentGuardianLinkUseCase } from '../application/update-student-guardian-link.use-case';
import { StudentGuardianPrimaryRequiredException } from '../domain/guardian.exceptions';
import { GuardiansRepository } from '../infrastructure/guardians.repository';

describe('Guardians use cases', () => {
  async function withStudentsScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'students.records.view',
          'students.records.manage',
          'students.guardians.view',
          'students.guardians.manage',
        ],
      });

      return fn();
    });
  }

  function createGuardianRecord(overrides?: Partial<{
    id: string;
    firstName: string;
    lastName: string;
    relation: string;
    email: string | null;
    isPrimary: boolean;
  }>) {
    return {
      id: overrides?.id ?? 'guardian-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      userId: null,
      firstName: overrides?.firstName ?? 'Mohammed',
      lastName: overrides?.lastName ?? 'Hassan',
      phone: '+201001112233',
      email: overrides?.email ?? 'father@example.com',
      relation: overrides?.relation ?? 'father',
      isPrimary: overrides?.isPrimary ?? false,
      createdAt: new Date('2026-04-22T09:00:00.000Z'),
      updatedAt: new Date('2026-04-22T09:00:00.000Z'),
      deletedAt: null,
    };
  }

  function createStudentSummary() {
    return {
      id: 'student-1',
      firstName: 'Ahmed',
      lastName: 'Hassan',
      status: StudentStatus.ACTIVE,
    };
  }

  function createStudentGuardianLink() {
    return {
      id: 'link-1',
      studentId: 'student-1',
      guardianId: 'guardian-1',
      isPrimary: true,
      guardian: createGuardianRecord(),
      student: createStudentSummary(),
    };
  }

  it('creates a guardian successfully', async () => {
    const repository = {
      createGuardian: jest.fn().mockResolvedValue(createGuardianRecord()),
    } as unknown as GuardiansRepository;

    const useCase = new CreateGuardianUseCase(repository);

    const result = await withStudentsScope(() =>
      useCase.execute({
        full_name: 'Mohammed Hassan',
        relation: 'Father',
        phone_primary: '+201001112233',
        email: 'father@example.com',
      }),
    );

    expect((repository.createGuardian as jest.Mock).mock.calls[0][0]).toMatchObject({
      schoolId: 'school-1',
      organizationId: 'org-1',
      firstName: 'Mohammed',
      lastName: 'Hassan',
      relation: 'father',
      phone: '+201001112233',
      email: 'father@example.com',
      isPrimary: false,
    });

    expect(result).toEqual({
      guardianId: 'guardian-1',
      full_name: 'Mohammed Hassan',
      relation: 'father',
      phone_primary: '+201001112233',
      phone_secondary: null,
      email: 'father@example.com',
      national_id: null,
      job_title: null,
      workplace: null,
      is_primary: false,
      can_pickup: null,
      can_receive_notifications: null,
    });
  });

  it('links a guardian to a student successfully', async () => {
    const repository = {
      findStudentById: jest.fn().mockResolvedValue(createStudentSummary()),
      findGuardianById: jest.fn().mockResolvedValue(createGuardianRecord()),
      linkGuardianToStudent: jest.fn().mockResolvedValue(createStudentGuardianLink()),
    } as unknown as GuardiansRepository;

    const useCase = new LinkGuardianToStudentUseCase(repository);

    const result = await withStudentsScope(() =>
      useCase.execute('student-1', {
        guardianId: 'guardian-1',
        is_primary: true,
      }),
    );

    expect((repository.linkGuardianToStudent as jest.Mock).mock.calls[0][0]).toEqual({
      schoolId: 'school-1',
      studentId: 'student-1',
      guardianId: 'guardian-1',
      isPrimary: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        guardianId: 'guardian-1',
        full_name: 'Mohammed Hassan',
        is_primary: true,
      }),
    );
  });

  it('rejects demoting the only primary guardian', async () => {
    const repository = {
      findStudentById: jest.fn().mockResolvedValue(createStudentSummary()),
      findGuardianById: jest.fn().mockResolvedValue(createGuardianRecord()),
      updateStudentGuardianLink: jest
        .fn()
        .mockRejectedValue(
          new StudentGuardianPrimaryRequiredException({
            studentId: 'student-1',
            guardianId: 'guardian-1',
          }),
        ),
    } as unknown as GuardiansRepository;

    const useCase = new UpdateStudentGuardianLinkUseCase(repository);

    await expect(
      withStudentsScope(() =>
        useCase.execute('student-1', 'guardian-1', {
          is_primary: false,
        }),
      ),
    ).rejects.toBeInstanceOf(StudentGuardianPrimaryRequiredException);
  });
});
