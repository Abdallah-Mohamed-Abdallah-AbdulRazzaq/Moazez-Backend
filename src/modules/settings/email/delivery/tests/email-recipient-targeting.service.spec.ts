import { MembershipStatus, UserStatus, UserType } from '@prisma/client';
import { EmailRecipientTargetingService } from '../application/email-recipient-targeting.service';

describe('EmailRecipientTargetingService', () => {
  function serviceWithTargets(targets: any[]) {
    const findMany = jest.fn().mockResolvedValue(targets);
    const service = new EmailRecipientTargetingService({
      scoped: {
        membership: { findMany },
      },
    } as any);

    return { service, findMany };
  }

  function membership(overrides?: {
    id?: string;
    email?: string;
    contactEmail?: string | null;
    status?: UserStatus;
    passwordHash?: string | null;
    userType?: UserType;
    roleKey?: string;
    mustChangePassword?: boolean;
  }) {
    const id = overrides?.id ?? 'user-1';
    return {
      id: `membership-${id}`,
      status: MembershipStatus.ACTIVE,
      deletedAt: null,
      user: {
        id,
        email: overrides?.email ?? `${id}@login.example`,
        username: id,
        contactEmail:
          overrides?.contactEmail === undefined
            ? `${id}@contact.example`
            : overrides.contactEmail,
        passwordHash: overrides?.passwordHash ?? null,
        firstName: 'User',
        lastName: id,
        userType: overrides?.userType ?? UserType.SCHOOL_USER,
        status: overrides?.status ?? UserStatus.ACTIVE,
        mustChangePassword: overrides?.mustChangePassword ?? false,
        passwordProvisionedAt: null,
        credentialVersion: 0,
        deletedAt: null,
      },
      role: {
        key: overrides?.roleKey ?? 'school_admin',
        name: 'School Admin',
      },
    };
  }

  it('skips missing contact email unless login email fallback is explicit', async () => {
    const { service } = serviceWithTargets([
      membership({ id: 'missing', contactEmail: null }),
    ]);

    const strict = await service.resolveTargets({
      recipientScope: { scope: 'selected', userIds: ['missing'] },
      requireContactEmail: true,
    });

    expect(strict.eligible).toHaveLength(0);
    expect(strict.skippedReasons).toEqual({ missing_contact_email: 1 });

    const fallback = await service.resolveTargets({
      recipientScope: { scope: 'selected', userIds: ['missing'] },
      requireContactEmail: false,
      allowLoginEmailFallback: true,
    });

    expect(fallback.eligible).toHaveLength(1);
    expect(fallback.eligible[0].toEmail).toBe('missing@login.example');
  });

  it('deduplicates normalized destination emails and skips invalid emails', async () => {
    const { service } = serviceWithTargets([
      membership({ id: 'one', contactEmail: 'Shared@Example.com' }),
      membership({ id: 'two', contactEmail: ' shared@example.com ' }),
      membership({ id: 'bad', contactEmail: 'not-an-email' }),
    ]);

    const result = await service.resolveTargets({
      recipientScope: { scope: 'all_school_users' },
      requireContactEmail: true,
    });

    expect(result.eligible.map((recipient) => recipient.toEmail)).toEqual([
      'shared@example.com',
    ]);
    expect(result.skippedReasons).toEqual({
      duplicate_email: 1,
      invalid_email: 1,
    });
  });

  it('skips disabled users and existing passwords for generate mode', async () => {
    const { service } = serviceWithTargets([
      membership({ id: 'disabled', status: UserStatus.DISABLED }),
      membership({ id: 'set', passwordHash: 'hash' }),
      membership({ id: 'missing' }),
    ]);

    const result = await service.resolveTargets({
      recipientScope: { scope: 'all_school_users' },
      credentialMode: 'GENERATE_TEMPORARY_PASSWORD',
      requireContactEmail: true,
    });

    expect(result.eligible.map((recipient) => recipient.userId)).toEqual([
      'missing',
    ]);
    expect(result.skippedReasons).toEqual({
      disabled_user: 1,
      already_has_password: 1,
    });
  });

  it('builds selected role user type and credential scope queries over memberships', async () => {
    const { service, findMany } = serviceWithTargets([]);

    await service.resolveTargets({
      recipientScope: { scope: 'role', roleKeys: ['teacher'] },
    });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { key: { in: ['teacher'] } },
        }),
      }),
    );

    await service.resolveTargets({
      recipientScope: { scope: 'user_type', userTypes: ['parent'] },
    });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: expect.objectContaining({ userType: { in: [UserType.PARENT] } }),
        }),
      }),
    );

    await service.resolveTargets({
      recipientScope: { scope: 'must_change_password' },
    });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: expect.objectContaining({ mustChangePassword: true }),
        }),
      }),
    );
  });
});
