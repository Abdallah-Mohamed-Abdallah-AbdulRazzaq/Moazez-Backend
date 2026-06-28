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
import { UpdateGuardianUseCase } from '../application/update-guardian.use-case';
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
    phone: string;
    phoneSecondary: string | null;
    email: string | null;
    nationalId: string | null;
    jobTitle: string | null;
    workplace: string | null;
    isPrimary: boolean;
    canPickup: boolean | null;
    canReceiveNotifications: boolean | null;
  }>) {
    return {
      id: overrides?.id ?? 'guardian-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      userId: null,
      firstName: overrides?.firstName ?? 'Mohammed',
      lastName: overrides?.lastName ?? 'Hassan',
      phone: overrides?.phone ?? '+201001112233',
      phoneSecondary: overrides?.phoneSecondary ?? null,
      email: overrides?.email ?? 'father@example.com',
      nationalId: overrides?.nationalId ?? null,
      jobTitle: overrides?.jobTitle ?? null,
      workplace: overrides?.workplace ?? null,
      relation: overrides?.relation ?? 'father',
      isPrimary: overrides?.isPrimary ?? false,
      canPickup: overrides?.canPickup ?? null,
      canReceiveNotifications: overrides?.canReceiveNotifications ?? null,
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

  it('creates a guardian with durable profile fields', async () => {
    const repository = {
      createGuardian: jest.fn().mockResolvedValue(
        createGuardianRecord({
          phoneSecondary: '+201004445566',
          nationalId: '29901011234567',
          jobTitle: 'Engineer',
          workplace: 'Cairo Office',
          canPickup: true,
          canReceiveNotifications: true,
        }),
      ),
    } as unknown as GuardiansRepository;

    const useCase = new CreateGuardianUseCase(repository);

    const result = await withStudentsScope(() =>
      useCase.execute({
        full_name: 'Mohammed Hassan',
        relation: 'Father',
        phone_primary: '+201001112233',
        phone_secondary: '+201004445566',
        email: 'father@example.com',
        national_id: '29901011234567',
        job_title: 'Engineer',
        workplace: 'Cairo Office',
        can_pickup: true,
        can_receive_notifications: true,
      }),
    );

    expect((repository.createGuardian as jest.Mock).mock.calls[0][0]).toMatchObject({
      phoneSecondary: '+201004445566',
      nationalId: '29901011234567',
      jobTitle: 'Engineer',
      workplace: 'Cairo Office',
      canPickup: true,
      canReceiveNotifications: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        guardianId: 'guardian-1',
        phone_secondary: '+201004445566',
        national_id: '29901011234567',
        job_title: 'Engineer',
        workplace: 'Cairo Office',
        can_pickup: true,
        can_receive_notifications: true,
      }),
    );
    expect(result).not.toHaveProperty('userId');
  });

  it('updates guardian durable profile fields', async () => {
    const existingGuardian = createGuardianRecord();
    const updatedGuardian = createGuardianRecord({
      phoneSecondary: '+201004445566',
      nationalId: '29901011234567',
      jobTitle: 'Engineer',
      workplace: 'Cairo Office',
      canPickup: true,
      canReceiveNotifications: false,
    });

    const repository = {
      findGuardianById: jest.fn().mockResolvedValue(existingGuardian),
      updateGuardian: jest.fn().mockResolvedValue(updatedGuardian),
    } as unknown as GuardiansRepository;

    const useCase = new UpdateGuardianUseCase(repository);

    const result = await withStudentsScope(() =>
      useCase.execute('guardian-1', {
        phone_secondary: '+201004445566',
        national_id: '29901011234567',
        job_title: 'Engineer',
        workplace: 'Cairo Office',
        can_pickup: true,
        can_receive_notifications: false,
      }),
    );

    expect((repository.updateGuardian as jest.Mock).mock.calls[0]).toEqual([
      'guardian-1',
      {
        phoneSecondary: '+201004445566',
        nationalId: '29901011234567',
        jobTitle: 'Engineer',
        workplace: 'Cairo Office',
        canPickup: true,
        canReceiveNotifications: false,
      },
    ]);

    expect(result).toEqual(
      expect.objectContaining({
        phone_secondary: '+201004445566',
        national_id: '29901011234567',
        job_title: 'Engineer',
        workplace: 'Cairo Office',
        can_pickup: true,
        can_receive_notifications: false,
      }),
    );
  });

  it('clears nullable guardian profile fields on update', async () => {
    const existingGuardian = createGuardianRecord({
      phoneSecondary: '+201004445566',
      nationalId: '29901011234567',
      jobTitle: 'Engineer',
      workplace: 'Cairo Office',
      canPickup: true,
      canReceiveNotifications: true,
    });
    const updatedGuardian = createGuardianRecord();

    const repository = {
      findGuardianById: jest.fn().mockResolvedValue(existingGuardian),
      updateGuardian: jest.fn().mockResolvedValue(updatedGuardian),
    } as unknown as GuardiansRepository;

    const useCase = new UpdateGuardianUseCase(repository);

    await withStudentsScope(() =>
      useCase.execute('guardian-1', {
        phone_secondary: '',
        national_id: null,
        job_title: '',
        workplace: null,
        can_pickup: null,
        can_receive_notifications: null,
      }),
    );

    expect((repository.updateGuardian as jest.Mock).mock.calls[0]).toEqual([
      'guardian-1',
      {
        phoneSecondary: null,
        nationalId: null,
        jobTitle: null,
        workplace: null,
        canPickup: null,
        canReceiveNotifications: null,
      },
    ]);
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
