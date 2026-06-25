import {
  MembershipStatus,
  SchoolEmailConnectionStatus,
  SchoolEmailDeliveryBatchStatus,
  SchoolEmailDeliveryKind,
  SchoolEmailDeliveryRecipientStatus,
  SchoolEmailProviderType,
  SchoolEmailTemplateKey,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../../common/context/request-context';
import { PasswordService } from '../../../../iam/auth/domain/password.service';
import { AuthRepository } from '../../../../iam/auth/infrastructure/auth.repository';
import { UserCredentialsRepository } from '../../../users/credentials/infrastructure/user-credentials.repository';
import { EmailSecretCrypto } from '../../domain/email-secret-crypto';
import { EmailSettingsRepository } from '../../infrastructure/email-settings.repository';
import { ProcessEmailDeliveryRecipientUseCase } from '../application/process-email-delivery-recipient.use-case';
import { SchoolEmailRendererService } from '../application/school-email-renderer.service';
import { EmailDeliveryRepository } from '../infrastructure/email-delivery.repository';
import { SchoolEmailTransport } from '../transport/email-transport';

describe('ProcessEmailDeliveryRecipientUseCase', () => {
  function runScoped<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'actor-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [],
      });

      return fn();
    });
  }

  const now = new Date('2026-05-12T08:00:00.000Z');

  function connection() {
    return {
      id: 'connection-1',
      schoolId: 'school-1',
      providerType: SchoolEmailProviderType.SMTP,
      fromName: 'School Mail',
      fromEmail: 'mail@example.com',
      replyToEmail: null,
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      username: 'mail@example.com',
      encryptedPassword: 'encrypted',
      encryptedApiKey: null,
      status: SchoolEmailConnectionStatus.ACTIVE,
      lastTestedAt: now,
      verifiedAt: now,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  function recipient(overrides?: {
    status?: SchoolEmailDeliveryRecipientStatus;
    batchStatus?: SchoolEmailDeliveryBatchStatus;
    credentialMode?: string;
    metadata?: Record<string, unknown> | null;
  }) {
    return {
      id: 'recipient-1',
      schoolId: 'school-1',
      batchId: 'batch-1',
      recipientType: 'USER',
      userId: 'user-1',
      toEmail: 'contact@example.com',
      displayName: 'User One',
      status: overrides?.status ?? SchoolEmailDeliveryRecipientStatus.QUEUED,
      attempts: 0,
      lastAttemptAt: null,
      sentAt: null,
      failureReason: null,
      skippedReason: null,
      metadata: overrides?.metadata ?? null,
      createdAt: now,
      updatedAt: now,
      batch: {
        id: 'batch-1',
        schoolId: 'school-1',
        kind: SchoolEmailDeliveryKind.CREDENTIAL_DELIVERY,
        status: overrides?.batchStatus ?? SchoolEmailDeliveryBatchStatus.QUEUED,
        templateKey: SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS,
        subjectSnapshot: null,
        createdByUserId: 'actor-1',
        recipientScope: {
          credentialMode:
            overrides?.credentialMode ?? 'GENERATE_TEMPORARY_PASSWORD',
        },
        previewData: null,
        campaignContent: null,
        totalRecipients: 1,
        queuedCount: 1,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        failureReason: null,
        createdAt: now,
        updatedAt: now,
      },
    } as any;
  }

  function membership(passwordHash: string | null = null) {
    return {
      id: 'membership-1',
      userId: 'user-1',
      status: MembershipStatus.ACTIVE,
      deletedAt: null,
      user: {
        id: 'user-1',
        email: 'user@login.example',
        username: 'user.one',
        contactEmail: 'contact@example.com',
        passwordHash,
        firstName: 'User',
        lastName: 'One',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        lastLoginAt: null,
        mustChangePassword: Boolean(passwordHash),
        passwordChangedAt: null,
        passwordProvisionedAt: passwordHash ? now : null,
        credentialVersion: passwordHash ? 1 : 0,
        createdAt: now,
        deletedAt: null,
      },
      roleId: 'role-1',
      role: {
        id: 'role-1',
        key: 'school_admin',
        name: 'School Admin',
      },
    };
  }

  function buildUseCase(
    currentRecipient = recipient(),
    options?: {
      sendEmail?: jest.Mock;
      membershipRecord?: ReturnType<typeof membership>;
    },
  ) {
    const sentMetadata: unknown[] = [];
    const updatedMetadata: unknown[] = [];
    const deliveryRepository = {
      findRecipientForProcessing: jest.fn().mockResolvedValue(currentRecipient),
      markRecipientSending: jest.fn().mockResolvedValue(true),
      markBatchProcessing: jest.fn().mockResolvedValue(undefined),
      updateRecipientMetadata: jest.fn((recipientId, metadata) => {
        updatedMetadata.push(metadata);
        if (currentRecipient.id === recipientId) {
          currentRecipient.metadata = metadata;
        }
        return Promise.resolve();
      }),
      markRecipientSent: jest.fn((args) => {
        sentMetadata.push(args.metadata);
        return Promise.resolve();
      }),
      markRecipientFailed: jest.fn().mockResolvedValue(undefined),
      markRecipientCancelled: jest.fn().mockResolvedValue(undefined),
      refreshBatchStatus: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailDeliveryRepository;
    const emailSettingsRepository = {
      findConnection: jest.fn().mockResolvedValue(connection()),
      findTemplate: jest.fn().mockResolvedValue(null),
      findSchoolBranding: jest.fn().mockResolvedValue({
        name: 'School',
        logoUrl: null,
        supportEmail: 'support@example.com',
        supportPhone: null,
      }),
    } as unknown as EmailSettingsRepository;
    const credentialsRepository = {
      findScopedMembershipByUserId: jest
        .fn()
        .mockResolvedValue(options?.membershipRecord ?? membership()),
      updateUserCredential: jest.fn().mockResolvedValue(membership('hash-new')),
    } as unknown as UserCredentialsRepository;
    const passwordService = {
      hash: jest.fn().mockResolvedValue('hash-new'),
    } as unknown as PasswordService;
    const authRepository = {
      revokeUserSessions: jest.fn().mockResolvedValue({ count: 0 }),
    } as unknown as AuthRepository;
    const emailSecretCrypto = {
      encrypt: jest.fn((plainText: string) => `encrypted:${plainText}`),
      decrypt: jest.fn((cipherText: string) =>
        cipherText.replace(/^encrypted:/, ''),
      ),
    } as unknown as EmailSecretCrypto;
    const transport = {
      sendEmail:
        options?.sendEmail ??
        jest.fn().mockResolvedValue({
          providerMessageId: 'provider-1',
          accepted: ['contact@example.com'],
          rejected: [],
        }),
    } as unknown as SchoolEmailTransport;
    const renderer = new SchoolEmailRendererService(emailSettingsRepository);
    const useCase = new ProcessEmailDeliveryRecipientUseCase(
      deliveryRepository,
      emailSettingsRepository,
      credentialsRepository,
      passwordService,
      authRepository,
      renderer,
      emailSecretCrypto,
      transport,
    );

    return {
      useCase,
      deliveryRepository,
      credentialsRepository,
      passwordService,
      authRepository,
      emailSecretCrypto,
      transport,
      sentMetadata,
      updatedMetadata,
    };
  }

  it('generates one pending temporary password, sends, applies credentials, and stores only safe sent metadata', async () => {
    const mocks = buildUseCase();

    await runScoped(() =>
      mocks.useCase.execute({
        schoolId: 'school-1',
        organizationId: 'org-1',
        batchId: 'batch-1',
        recipientId: 'recipient-1',
        actorUserId: 'actor-1',
        actorUserType: UserType.SCHOOL_USER,
      }),
    );

    expect(mocks.passwordService.hash).toHaveBeenCalledWith(
      expect.stringMatching(/^MZ-/),
    );
    expect(mocks.credentialsRepository.updateUserCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        mustChangePassword: true,
      }),
    );
    expect(mocks.authRepository.revokeUserSessions).toHaveBeenCalledWith(
      'user-1',
    );
    expect(mocks.transport.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'contact@example.com',
        html: expect.stringContaining('MZ-'),
      }),
    );
    expect(mocks.deliveryRepository.updateRecipientMetadata).toHaveBeenCalledWith(
      'recipient-1',
      expect.objectContaining({
        pendingCredential: expect.objectContaining({
          encryptedTemporaryPassword: expect.stringMatching(/^encrypted:MZ-/),
        }),
      }),
    );
    expect(JSON.stringify(mocks.sentMetadata)).not.toMatch(/MZ-/);
    expect(JSON.stringify(mocks.sentMetadata)).not.toContain(
      'pendingCredential',
    );
  });

  it('does not mutate user credentials when SMTP send fails', async () => {
    const sendEmail = jest
      .fn()
      .mockRejectedValue(new Error('smtp temporary failure MZ-LEAK-1234'));
    const mocks = buildUseCase(recipient(), { sendEmail });

    await expect(
      runScoped(() =>
        mocks.useCase.execute({
          schoolId: 'school-1',
          organizationId: 'org-1',
          batchId: 'batch-1',
          recipientId: 'recipient-1',
          actorUserId: 'actor-1',
          actorUserType: UserType.SCHOOL_USER,
        }),
      ),
    ).rejects.toThrow('smtp temporary failure [redacted]');

    expect(mocks.credentialsRepository.updateUserCredential).not.toHaveBeenCalled();
    expect(mocks.authRepository.revokeUserSessions).not.toHaveBeenCalled();
    expect(mocks.deliveryRepository.markRecipientFailed).toHaveBeenCalledWith({
      recipientId: 'recipient-1',
      failureReason: 'smtp temporary failure [redacted]',
    });
    expect(JSON.stringify(mocks.updatedMetadata)).toContain(
      'encryptedTemporaryPassword',
    );
    expect(JSON.stringify(mocks.updatedMetadata)).not.toMatch(/"MZ-/);
  });

  it('reuses the same pending temporary password on retry', async () => {
    const firstSend = jest
      .fn()
      .mockRejectedValue(new Error('smtp temporary failure'));
    const firstRun = buildUseCase(recipient(), { sendEmail: firstSend });

    await expect(
      runScoped(() =>
        firstRun.useCase.execute({
          schoolId: 'school-1',
          organizationId: 'org-1',
          batchId: 'batch-1',
          recipientId: 'recipient-1',
          actorUserId: 'actor-1',
          actorUserType: UserType.SCHOOL_USER,
        }),
      ),
    ).rejects.toThrow('smtp temporary failure');

    const firstHtml = firstSend.mock.calls[0][0].html as string;
    const firstTemporaryPassword = firstHtml.match(/MZ-[A-Z0-9-]+/)?.[0];
    expect(firstTemporaryPassword).toBeTruthy();

    const retryRecipient = recipient({
      status: SchoolEmailDeliveryRecipientStatus.FAILED,
      metadata: firstRun.updatedMetadata[0] as Record<string, unknown>,
    });
    const retrySend = jest.fn().mockResolvedValue({
      providerMessageId: 'provider-2',
      accepted: ['contact@example.com'],
      rejected: [],
    });
    const retryRun = buildUseCase(retryRecipient, { sendEmail: retrySend });

    await runScoped(() =>
      retryRun.useCase.execute({
        schoolId: 'school-1',
        organizationId: 'org-1',
        batchId: 'batch-1',
        recipientId: 'recipient-1',
        actorUserId: 'actor-1',
        actorUserType: UserType.SCHOOL_USER,
      }),
    );

    const retryHtml = retrySend.mock.calls[0][0].html as string;
    expect(retryHtml).toContain(firstTemporaryPassword);
    expect(retryRun.emailSecretCrypto.encrypt).not.toHaveBeenCalled();
    expect(retryRun.credentialsRepository.updateUserCredential).toHaveBeenCalledTimes(1);
  });

  it('rejects generate mode for existing-password users before delivery', async () => {
    const mocks = buildUseCase(recipient(), {
      membershipRecord: membership('existing-hash'),
    });

    await expect(
      runScoped(() =>
        mocks.useCase.execute({
          schoolId: 'school-1',
          organizationId: 'org-1',
          batchId: 'batch-1',
          recipientId: 'recipient-1',
          actorUserId: 'actor-1',
          actorUserType: UserType.SCHOOL_USER,
        }),
      ),
    ).rejects.toThrow('credential_recipient_already_has_password');

    expect(mocks.transport.sendEmail).not.toHaveBeenCalled();
    expect(mocks.credentialsRepository.updateUserCredential).not.toHaveBeenCalled();
  });

  it('revokes sessions after successful regenerate delivery', async () => {
    const mocks = buildUseCase(
      recipient({ credentialMode: 'REGENERATE_TEMPORARY_PASSWORD' }),
      {
        membershipRecord: membership('existing-hash'),
      },
    );

    await runScoped(() =>
      mocks.useCase.execute({
        schoolId: 'school-1',
        organizationId: 'org-1',
        batchId: 'batch-1',
        recipientId: 'recipient-1',
        actorUserId: 'actor-1',
        actorUserType: UserType.SCHOOL_USER,
      }),
    );

    expect(mocks.authRepository.revokeUserSessions).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('does not resend already sent recipients', async () => {
    const mocks = buildUseCase(
      recipient({ status: SchoolEmailDeliveryRecipientStatus.SENT }),
    );

    await runScoped(() =>
      mocks.useCase.execute({
        schoolId: 'school-1',
        organizationId: 'org-1',
        batchId: 'batch-1',
        recipientId: 'recipient-1',
        actorUserId: 'actor-1',
        actorUserType: UserType.SCHOOL_USER,
      }),
    );

    expect(mocks.transport.sendEmail).not.toHaveBeenCalled();
    expect(mocks.deliveryRepository.markRecipientSending).not.toHaveBeenCalled();
  });

  it('respects cancelled batches', async () => {
    const mocks = buildUseCase(
      recipient({ batchStatus: SchoolEmailDeliveryBatchStatus.CANCELLED }),
    );

    await runScoped(() =>
      mocks.useCase.execute({
        schoolId: 'school-1',
        organizationId: 'org-1',
        batchId: 'batch-1',
        recipientId: 'recipient-1',
        actorUserId: 'actor-1',
        actorUserType: UserType.SCHOOL_USER,
      }),
    );

    expect(mocks.deliveryRepository.markRecipientCancelled).toHaveBeenCalledWith(
      'recipient-1',
      'batch_cancelled',
    );
    expect(mocks.transport.sendEmail).not.toHaveBeenCalled();
  });
});
