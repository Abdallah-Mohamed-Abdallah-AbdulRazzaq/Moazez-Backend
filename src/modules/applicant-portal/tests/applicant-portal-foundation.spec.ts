import { AuditOutcome, UserStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { DomainException } from '../../../common/exceptions/domain-exception';
import { PasswordService } from '../../iam/auth/domain/password.service';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { CreateApplicantAccountUseCase } from '../application/create-applicant-account.use-case';
import { ApplicantPortalAccessService } from '../application/applicant-portal-access.service';
import {
  ApplicantPortalRepository,
  ApplicantProfileRecord,
} from '../infrastructure/applicant-portal.repository';
import { presentApplicantProfile } from '../presenters/applicant-profile.presenter';

const APPLICANT_USER_ID = '00000000-0000-0000-0000-000000000001';
const APPLICANT_PROFILE_ID = '00000000-0000-0000-0000-000000000002';

describe('Applicant Portal account foundation', () => {
  it('creates a UserType.APPLICANT user and applicant profile without membership data', async () => {
    const tx = {
      user: {
        create: jest.fn().mockResolvedValue({ id: APPLICANT_USER_ID }),
      },
      applicantProfile: {
        create: jest.fn().mockResolvedValue(applicantProfileFixture()),
      },
      membership: {
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const repository = new ApplicantPortalRepository(prisma as never);

    await repository.createApplicantAccount({
      email: 'applicant@example.test',
      passwordHash: 'hashed-password',
      firstName: 'Nour',
      lastName: 'Ali',
      fullName: 'Nour Ali',
      phoneNumber: '+20 100 000 0000',
      city: 'Cairo',
      relationship: 'guardian',
    });

    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'applicant@example.test',
        contactEmail: 'applicant@example.test',
        firstName: 'Nour',
        lastName: 'Ali',
        userType: UserType.APPLICANT,
        status: UserStatus.ACTIVE,
        passwordHash: 'hashed-password',
        mustChangePassword: false,
        credentialVersion: 1,
      }),
      select: { id: true },
    });
    expect(tx.applicantProfile.create).toHaveBeenCalledWith({
      data: {
        userId: APPLICANT_USER_ID,
        fullName: 'Nour Ali',
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      },
      include: { user: true },
    });
    expect(tx.membership.create).not.toHaveBeenCalled();
  });

  it('normalizes applicant input and writes a safe audit log on account creation', async () => {
    const repository = mockApplicantRepository();
    repository.findUserByEmail.mockResolvedValue(null);
    repository.createApplicantAccount.mockResolvedValue(
      applicantProfileFixture({
        fullName: 'Nour Ali',
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      }),
    );
    const authRepository = mockAuthRepository();
    const passwordService = mockPasswordService();
    const useCase = new CreateApplicantAccountUseCase(
      repository,
      authRepository,
      passwordService,
    );

    const response = await useCase.execute({
      fullName: '  Nour   Ali  ',
      email: ' Applicant@Example.TEST ',
      password: 'Applicant18BPass!',
      phoneNumber: ' +20 100 000 0000 ',
      city: ' Cairo ',
      relationship: 'GUARDIAN',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(repository.findUserByEmail).toHaveBeenCalledWith(
      'applicant@example.test',
    );
    expect(passwordService.hash).toHaveBeenCalledWith('Applicant18BPass!');
    expect(repository.createApplicantAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'applicant@example.test',
        passwordHash: 'hashed-password',
        firstName: 'Nour',
        lastName: 'Ali',
        fullName: 'Nour Ali',
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      }),
    );
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: APPLICANT_USER_ID,
        userType: UserType.APPLICANT,
        organizationId: null,
        schoolId: null,
        module: 'applicant_portal',
        action: 'applicant.account.create',
        resourceType: 'applicant_profile',
        resourceId: APPLICANT_PROFILE_ID,
        outcome: AuditOutcome.SUCCESS,
      }),
    );
    expect(response).toMatchObject({
      applicantId: APPLICANT_PROFILE_ID,
      userId: APPLICANT_USER_ID,
      email: 'applicant@example.test',
      loginEmail: 'applicant@example.test',
      userType: 'applicant',
      relationship: 'guardian',
    });
  });

  it('rejects duplicate applicant email before creating a profile', async () => {
    const repository = mockApplicantRepository();
    repository.findUserByEmail.mockResolvedValue({ id: APPLICANT_USER_ID });
    const useCase = new CreateApplicantAccountUseCase(
      repository,
      mockAuthRepository(),
      mockPasswordService(),
    );

    await expect(
      useCase.execute({
        fullName: 'Nour Ali',
        email: 'applicant@example.test',
        password: 'Applicant18BPass!',
        relationship: 'guardian',
      }),
    ).rejects.toMatchObject({
      code: 'iam.user.email_taken',
    });
    expect(repository.createApplicantAccount).not.toHaveBeenCalled();
  });

  it('rejects invalid applicant relationships', async () => {
    const repository = mockApplicantRepository();
    repository.findUserByEmail.mockResolvedValue(null);
    const useCase = new CreateApplicantAccountUseCase(
      repository,
      mockAuthRepository(),
      mockPasswordService(),
    );

    await expect(
      useCase.execute({
        fullName: 'Nour Ali',
        email: 'applicant@example.test',
        password: 'Applicant18BPass!',
        relationship: 'uncle',
      }),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      details: expect.objectContaining({
        field: 'relationship',
      }),
    });
    expect(repository.createApplicantAccount).not.toHaveBeenCalled();
  });

  it('does not leak unsafe fields through the presenter', () => {
    const response = presentApplicantProfile(
      applicantProfileFixture({
        user: {
          ...applicantProfileFixture().user,
          passwordHash: 'never-return',
          memberships: [{ schoolId: 'school-1', organizationId: 'org-1' }],
        } as unknown as ApplicantProfileRecord['user'],
      }),
    );
    const serialized = JSON.stringify(response);

    expect(response).toEqual({
      applicantId: APPLICANT_PROFILE_ID,
      userId: APPLICANT_USER_ID,
      fullName: 'Nour Ali',
      email: 'applicant@example.test',
      loginEmail: 'applicant@example.test',
      contactEmail: 'applicant@example.test',
      phoneNumber: '+20 100 000 0000',
      city: 'Cairo',
      relationship: 'guardian',
      userType: 'applicant',
      createdAt: '2026-06-09T10:00:00.000Z',
      updatedAt: '2026-06-09T10:05:00.000Z',
    });
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('memberships');
  });
});

describe('Applicant Portal access service', () => {
  it('loads an applicant profile for an authenticated membershipless applicant', async () => {
    const repository = mockApplicantRepository();
    repository.countActiveMembershipsForUser.mockResolvedValue(0);
    repository.findApplicantProfileByUserId.mockResolvedValue(
      applicantProfileFixture(),
    );
    const service = new ApplicantPortalAccessService(repository);

    const context = await withActor(UserType.APPLICANT, () =>
      service.getApplicantContext(),
    );

    expect(context).toMatchObject({
      applicantUserId: APPLICANT_USER_ID,
      applicantProfileId: APPLICANT_PROFILE_ID,
    });
  });

  it('rejects non-applicant actors before loading applicant profile', async () => {
    const repository = mockApplicantRepository();
    const service = new ApplicantPortalAccessService(repository);

    await expect(
      withActor(UserType.PARENT, () => service.getApplicantContext()),
    ).rejects.toMatchObject({
      code: 'auth.scope.missing',
    });
    expect(repository.findApplicantProfileByUserId).not.toHaveBeenCalled();
  });

  it('rejects applicant actors with active memberships', async () => {
    const repository = mockApplicantRepository();
    const service = new ApplicantPortalAccessService(repository);

    await expect(
      withActor(
        UserType.APPLICANT,
        () => service.getApplicantContext(),
        true,
      ),
    ).rejects.toMatchObject({
      code: 'auth.scope.missing',
      details: { reason: 'applicant_membership_not_allowed' },
    });
    expect(repository.findApplicantProfileByUserId).not.toHaveBeenCalled();
  });

  it('rejects applicant actors when the profile is missing', async () => {
    const repository = mockApplicantRepository();
    repository.countActiveMembershipsForUser.mockResolvedValue(0);
    repository.findApplicantProfileByUserId.mockResolvedValue(null);
    const service = new ApplicantPortalAccessService(repository);

    await expect(
      withActor(UserType.APPLICANT, () => service.getApplicantContext()),
    ).rejects.toBeInstanceOf(DomainException);
    await expect(
      withActor(UserType.APPLICANT, () => service.getApplicantContext()),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

function applicantProfileFixture(
  overrides?: Partial<ApplicantProfileRecord>,
): ApplicantProfileRecord {
  return {
    id: APPLICANT_PROFILE_ID,
    userId: APPLICANT_USER_ID,
    fullName: 'Nour Ali',
    phoneNumber: '+20 100 000 0000',
    city: 'Cairo',
    relationship: 'guardian',
    createdAt: new Date('2026-06-09T10:00:00.000Z'),
    updatedAt: new Date('2026-06-09T10:05:00.000Z'),
    user: {
      id: APPLICANT_USER_ID,
      email: 'applicant@example.test',
      contactEmail: 'applicant@example.test',
      userType: UserType.APPLICANT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    ...overrides,
  } as ApplicantProfileRecord;
}

function mockApplicantRepository(): jest.Mocked<ApplicantPortalRepository> {
  return {
    findUserByEmail: jest.fn(),
    createApplicantAccount: jest.fn(),
    findApplicantProfileByUserId: jest.fn(),
    countActiveMembershipsForUser: jest.fn(),
  } as unknown as jest.Mocked<ApplicantPortalRepository>;
}

function mockAuthRepository(): jest.Mocked<AuthRepository> {
  return {
    createAuditLog: jest.fn(),
  } as unknown as jest.Mocked<AuthRepository>;
}

function mockPasswordService(): jest.Mocked<PasswordService> {
  return {
    hash: jest.fn().mockResolvedValue('hashed-password'),
  } as unknown as jest.Mocked<PasswordService>;
}

async function withActor<T>(
  userType: UserType,
  fn: () => Promise<T>,
  withMembership = false,
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: APPLICANT_USER_ID, userType });
    if (withMembership) {
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [],
      });
    }

    return fn();
  });
}
