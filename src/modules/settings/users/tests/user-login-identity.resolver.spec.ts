import { SchoolLoginSettingsStatus } from '@prisma/client';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { LoginIdentityRepository } from '../../login-identity/infrastructure/login-identity.repository';
import { UserLoginIdentityResolver } from '../application/user-login-identity.resolver';
import { UsersRepository } from '../infrastructure/users.repository';

describe('UserLoginIdentityResolver', () => {
  function buildResolver(params?: {
    existingUser?: unknown;
    settings?: unknown;
  }): UserLoginIdentityResolver {
    const usersRepository = {
      findUserByEmail: jest
        .fn()
        .mockResolvedValue(params?.existingUser ?? null),
    } as unknown as UsersRepository;
    const settings = Object.prototype.hasOwnProperty.call(
      params ?? {},
      'settings',
    )
      ? params?.settings
      : {
          loginDomain: 'school.sa',
          usernameMinLength: 3,
          usernameMaxLength: 40,
          reservedUsernames: [],
          status: SchoolLoginSettingsStatus.ACTIVE,
        };
    const loginIdentityRepository = {
      findCurrentSettings: jest.fn().mockResolvedValue(settings),
    } as unknown as LoginIdentityRepository;

    return new UserLoginIdentityResolver(
      usersRepository,
      loginIdentityRepository,
    );
  }

  it('generates login email from username and stores contactEmail separately', async () => {
    const resolver = buildResolver();

    await expect(
      resolver.resolve({
        username: ' Ahmed.Ali ',
        contactEmail: ' Ahmed.Personal@example.com ',
      }),
    ).resolves.toEqual({
      email: 'ahmed.ali@school.sa',
      username: 'ahmed.ali',
      contactEmail: 'ahmed.personal@example.com',
      generatedLoginEmail: true,
    });
  });

  it('preserves the legacy email-only path', async () => {
    const resolver = buildResolver();

    await expect(
      resolver.resolve({
        email: ' Legacy.User@example.com ',
      }),
    ).resolves.toEqual({
      email: 'legacy.user@example.com',
      username: null,
      contactEmail: null,
      generatedLoginEmail: false,
    });
  });

  it('rejects ambiguous username plus personal email payloads', async () => {
    const resolver = buildResolver();

    await expect(
      resolver.resolve({
        username: 'ahmed.ali',
        email: 'ahmed.personal@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'validation.failed',
    } satisfies Partial<DomainException>);
  });

  it('allows email with username only when it matches the generated login email', async () => {
    const resolver = buildResolver();

    await expect(
      resolver.resolve({
        username: 'ahmed.ali',
        email: 'ahmed.ali@school.sa',
      }),
    ).resolves.toEqual({
      email: 'ahmed.ali@school.sa',
      username: 'ahmed.ali',
      contactEmail: null,
      generatedLoginEmail: true,
    });
  });

  it('rejects username flow when the generated login email already exists', async () => {
    const resolver = buildResolver({
      existingUser: { id: 'user-1', email: 'ahmed.ali@school.sa' },
    });

    await expect(
      resolver.resolve({ username: 'ahmed.ali' }),
    ).rejects.toMatchObject({
      code: 'iam.user.username_taken',
    } satisfies Partial<DomainException>);
  });

  it('rejects username flow when the school login domain is missing', async () => {
    const resolver = buildResolver({ settings: null });

    await expect(
      resolver.resolve({ username: 'ahmed.ali' }),
    ).rejects.toMatchObject({
      code: 'iam.user.login_domain_missing',
    } satisfies Partial<DomainException>);
  });
});
