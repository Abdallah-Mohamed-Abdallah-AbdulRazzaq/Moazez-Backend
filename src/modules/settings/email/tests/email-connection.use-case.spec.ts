import {
  AuditOutcome,
  SchoolEmailConnectionStatus,
  SchoolEmailProviderType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { ActivateEmailConnectionUseCase } from '../application/activate-email-connection.use-case';
import { DisableEmailConnectionUseCase } from '../application/disable-email-connection.use-case';
import { UpdateEmailConnectionUseCase } from '../application/update-email-connection.use-case';
import { EmailConnectionNotVerifiedException } from '../domain/email.exceptions';
import { EmailSecretCrypto } from '../domain/email-secret-crypto';
import { EmailSettingsRepository } from '../infrastructure/email-settings.repository';

describe('email connection use cases', () => {
  function runScoped<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'actor-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['settings.security.view', 'settings.security.manage'],
      });

      return fn();
    });
  }

  function connection(
    overrides?: Partial<{
      status: SchoolEmailConnectionStatus;
      encryptedPassword: string | null;
    }>,
  ) {
    const now = new Date('2026-05-11T14:00:00.000Z');
    return {
      id: 'connection-1',
      schoolId: 'school-1',
      providerType: SchoolEmailProviderType.SMTP,
      fromName: 'Moazez School',
      fromEmail: 'school@example.com',
      replyToEmail: null,
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      username: 'school@example.com',
      encryptedPassword: overrides?.encryptedPassword ?? 'encrypted-old',
      encryptedApiKey: null,
      status: overrides?.status ?? SchoolEmailConnectionStatus.DRAFT,
      lastTestedAt: null,
      verifiedAt: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  function repositories(current: ReturnType<typeof connection> | null) {
    let stored = current;
    const emailSettingsRepository = {
      findConnection: jest.fn(() => Promise.resolve(stored)),
      saveConnection: jest.fn((_schoolId, data) => {
        stored = { ...(stored ?? connection()), ...data };
        return Promise.resolve(stored);
      }),
      updateConnectionState: jest.fn((_id, data) => {
        stored = { ...(stored ?? connection()), ...data };
        return Promise.resolve(stored);
      }),
    } as unknown as EmailSettingsRepository;

    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;

    const emailSecretCrypto = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn((value: string) => value.replace(/^encrypted:/, '')),
    } as unknown as EmailSecretCrypto;

    return { emailSettingsRepository, authRepository, emailSecretCrypto };
  }

  it('updates SMTP settings while preserving an omitted password secret', async () => {
    const { emailSettingsRepository, authRepository, emailSecretCrypto } =
      repositories(connection());
    const useCase = new UpdateEmailConnectionUseCase(
      emailSettingsRepository,
      authRepository,
      emailSecretCrypto,
    );

    const result = await runScoped(() =>
      useCase.execute({
        fromName: 'Updated School',
        fromEmail: 'updated@example.com',
        host: 'smtp.updated.example.com',
        port: 587,
        secure: false,
        username: 'updated@example.com',
      }),
    );

    expect(emailSettingsRepository.saveConnection).toHaveBeenCalledWith(
      'school-1',
      expect.objectContaining({
        encryptedPassword: 'encrypted-old',
        status: SchoolEmailConnectionStatus.DRAFT,
      }),
    );
    expect(emailSecretCrypto.encrypt).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('encryptedPassword');
    expect(result.hasPassword).toBe(true);
    expect(JSON.stringify(result)).not.toContain('school-1');
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.email.connection.update',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
    expect(
      JSON.stringify((authRepository.createAuditLog as jest.Mock).mock.calls),
    ).not.toContain('encrypted-old');
  });

  it('encrypts a newly provided password without exposing it', async () => {
    const { emailSettingsRepository, authRepository, emailSecretCrypto } =
      repositories(null);
    const useCase = new UpdateEmailConnectionUseCase(
      emailSettingsRepository,
      authRepository,
      emailSecretCrypto,
    );

    const result = await runScoped(() =>
      useCase.execute({
        fromName: 'Moazez School',
        fromEmail: 'school@example.com',
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        username: 'school@example.com',
        password: 'smtp-secret',
      }),
    );

    expect(emailSettingsRepository.saveConnection).toHaveBeenCalledWith(
      'school-1',
      expect.objectContaining({
        encryptedPassword: 'encrypted:smtp-secret',
      }),
    );
    expect(JSON.stringify(result)).not.toContain('smtp-secret');
  });

  it('requires verification before activation', async () => {
    const { emailSettingsRepository, authRepository } = repositories(
      connection({ status: SchoolEmailConnectionStatus.DRAFT }),
    );
    const useCase = new ActivateEmailConnectionUseCase(
      emailSettingsRepository,
      authRepository,
    );

    await expect(runScoped(() => useCase.execute())).rejects.toBeInstanceOf(
      EmailConnectionNotVerifiedException,
    );
    expect(
      emailSettingsRepository.updateConnectionState,
    ).not.toHaveBeenCalled();
  });

  it('activates a verified connection and disables it later', async () => {
    const { emailSettingsRepository, authRepository } = repositories(
      connection({ status: SchoolEmailConnectionStatus.VERIFIED }),
    );
    const activateUseCase = new ActivateEmailConnectionUseCase(
      emailSettingsRepository,
      authRepository,
    );
    const disableUseCase = new DisableEmailConnectionUseCase(
      emailSettingsRepository,
      authRepository,
    );

    const active = await runScoped(() => activateUseCase.execute());
    expect(active.status).toBe('ACTIVE');

    const disabled = await runScoped(() => disableUseCase.execute());
    expect(disabled.status).toBe('DISABLED');
  });
});
