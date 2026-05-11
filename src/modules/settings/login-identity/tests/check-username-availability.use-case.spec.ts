import { SchoolLoginSettingsStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { CheckUsernameAvailabilityUseCase } from '../application/check-username-availability.use-case';
import { LoginIdentityRepository } from '../infrastructure/login-identity.repository';

describe('CheckUsernameAvailabilityUseCase', () => {
  function runScoped<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'actor-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['settings.users.view'],
      });

      return fn();
    });
  }

  it('returns missing-domain when settings are not configured', async () => {
    const repository = {
      findCurrentSettings: jest.fn().mockResolvedValue(null),
      findUserByLoginEmail: jest.fn(),
    } as unknown as LoginIdentityRepository;
    const useCase = new CheckUsernameAvailabilityUseCase(repository);

    const result = await runScoped(() =>
      useCase.execute({ username: 'Ahmed.Ali' }),
    );

    expect(result).toEqual({
      username: 'ahmed.ali',
      loginEmail: null,
      available: false,
      reason: 'login_domain_missing',
    });
    expect(repository.findUserByLoginEmail).not.toHaveBeenCalled();
  });

  it('detects available generated login emails', async () => {
    const repository = {
      findCurrentSettings: jest.fn().mockResolvedValue({
        loginDomain: 'school.sa',
        usernameMinLength: 3,
        usernameMaxLength: 40,
        reservedUsernames: [],
        status: SchoolLoginSettingsStatus.ACTIVE,
      }),
      findUserByLoginEmail: jest.fn().mockResolvedValue(null),
    } as unknown as LoginIdentityRepository;
    const useCase = new CheckUsernameAvailabilityUseCase(repository);

    const result = await runScoped(() =>
      useCase.execute({ username: 'Ahmed.Ali' }),
    );

    expect(repository.findUserByLoginEmail).toHaveBeenCalledWith(
      'ahmed.ali@school.sa',
    );
    expect(result).toEqual({
      username: 'ahmed.ali',
      loginEmail: 'ahmed.ali@school.sa',
      available: true,
      reason: null,
    });
  });

  it('returns unavailable when the generated login email is taken', async () => {
    const repository = {
      findCurrentSettings: jest.fn().mockResolvedValue({
        loginDomain: 'school.sa',
        usernameMinLength: 3,
        usernameMaxLength: 40,
        reservedUsernames: [],
        status: SchoolLoginSettingsStatus.ACTIVE,
      }),
      findUserByLoginEmail: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', email: 'ahmed.ali@school.sa' }),
    } as unknown as LoginIdentityRepository;
    const useCase = new CheckUsernameAvailabilityUseCase(repository);

    const result = await runScoped(() =>
      useCase.execute({ username: 'Ahmed.Ali' }),
    );

    expect(result.available).toBe(false);
    expect(result.reason).toBe('login_email_taken');
  });

  it('returns a reserved username reason separately from general invalidity', async () => {
    const repository = {
      findCurrentSettings: jest.fn().mockResolvedValue({
        loginDomain: 'school.sa',
        usernameMinLength: 3,
        usernameMaxLength: 40,
        reservedUsernames: [],
        status: SchoolLoginSettingsStatus.ACTIVE,
      }),
      findUserByLoginEmail: jest.fn(),
    } as unknown as LoginIdentityRepository;
    const useCase = new CheckUsernameAvailabilityUseCase(repository);

    const result = await runScoped(() =>
      useCase.execute({ username: 'admin' }),
    );

    expect(result).toEqual({
      username: 'admin',
      loginEmail: null,
      available: false,
      reason: 'reserved_username',
    });
  });
});
