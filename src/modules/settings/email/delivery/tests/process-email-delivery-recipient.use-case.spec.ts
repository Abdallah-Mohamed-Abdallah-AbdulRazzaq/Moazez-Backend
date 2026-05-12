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
      metadata: null,
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
          credentialMode: 'GENERATE_TEMPORARY_PASSWORD',
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

  function buildUseCase(currentRecipient = recipient()) {
    const sentMetadata: unknown[] = [];
    const deliveryRepository = {
      findRecipientForProcessing: jest.fn().mockResolvedValue(currentRecipient),
      markRecipientSending: jest.fn().mockResolvedValue(true),
      markBatchProcessing: jest.fn().mockResolvedValue(undefined),
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
      findScopedMembershipByUserId: jest.fn().mockResolvedValue(membership()),
      updateUserCredential: jest.fn().mockResolvedValue(membership('hash-new')),
    } as unknown as UserCredentialsRepository;
    const passwordService = {
      hash: jest.fn().mockResolvedValue('hash-new'),
    } as unknown as PasswordService;
    const authRepository = {
      revokeUserSessions: jest.fn().mockResolvedValue({ count: 0 }),
    } as unknown as AuthRepository;
    const transport = {
      sendEmail: jest.fn().mockResolvedValue({
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
      transport,
    );

    return {
      useCase,
      deliveryRepository,
      credentialsRepository,
      passwordService,
      authRepository,
      transport,
      sentMetadata,
    };
  }

  it('generates a temporary password in memory, updates credentials, sends, and stores only safe metadata', async () => {
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
    expect(JSON.stringify(mocks.sentMetadata)).not.toMatch(/MZ-/);
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
