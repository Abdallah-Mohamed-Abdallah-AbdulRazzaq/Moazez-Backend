import {
  AuditOutcome,
  SchoolEmailConnectionStatus,
  SchoolEmailDeliveryKind,
  SchoolEmailDeliveryRecipientStatus,
  SchoolEmailProviderType,
  SchoolEmailTemplateKey,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../../common/context/request-context';
import { AuthRepository } from '../../../../iam/auth/infrastructure/auth.repository';
import { EmailSettingsRepository } from '../../infrastructure/email-settings.repository';
import { CreateCredentialDeliveryUseCase } from '../application/create-credential-delivery.use-case';
import { CreateEmailCampaignUseCase } from '../application/create-email-campaign.use-case';
import { GetEmailCampaignUseCase } from '../application/delivery-read.use-cases';
import { PreviewEmailCampaignUseCase } from '../application/preview-email-campaign.use-case';
import { EmailRecipientTargetingService } from '../application/email-recipient-targeting.service';
import { EmailDeliveryRepository } from '../infrastructure/email-delivery.repository';
import { SchoolEmailDeliveryQueueService } from '../application/school-email-delivery-queue.service';
import { SchoolEmailRendererService } from '../application/school-email-renderer.service';
import {
  EmailCampaignCredentialVariablesForbiddenException,
  EmailDeliveryBatchNotFoundException,
} from '../../domain/email.exceptions';

describe('email delivery use cases', () => {
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

  function connection() {
    const now = new Date('2026-05-12T08:00:00.000Z');
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

  function batch(kind = SchoolEmailDeliveryKind.CREDENTIAL_DELIVERY) {
    const now = new Date('2026-05-12T08:00:00.000Z');
    return {
      id: 'batch-1',
      schoolId: 'school-1',
      kind,
      status: 'QUEUED',
      templateKey:
        kind === SchoolEmailDeliveryKind.CREDENTIAL_DELIVERY
          ? SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS
          : SchoolEmailTemplateKey.GENERAL_MESSAGE,
      subjectSnapshot: 'Subject',
      createdByUserId: 'actor-1',
      recipientScope: null,
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
    } as any;
  }

  function eligibleRecipient() {
    return {
      recipientType: 'USER' as const,
      userId: 'user-1',
      toEmail: 'user.contact@example.com',
      displayName: 'User One',
      username: 'user.one',
      loginEmail: 'user.one@login.example',
      contactEmail: 'user.contact@example.com',
      userType: 'school_user' as const,
      roleKey: 'school_admin',
      hasPassword: false,
      mustChangePassword: false,
      credentialVersion: 0,
    };
  }

  function buildUseCaseMocks() {
    const recipientTargeting = {
      resolveTargets: jest.fn().mockResolvedValue({
        totalMatched: 1,
        eligible: [eligibleRecipient()],
        skipped: [],
        skippedReasons: {},
        sampleLimit: 100,
      }),
    } as unknown as EmailRecipientTargetingService;
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
    const deliveryRepository = {
      createBatchWithRecipients: jest.fn().mockResolvedValue({
        batch: batch(),
        queuedRecipientIds: ['recipient-1'],
      }),
    } as unknown as EmailDeliveryRepository;
    const queueService = {
      enqueueRecipientDelivery: jest.fn().mockResolvedValue({ id: 'job-1' }),
    } as unknown as SchoolEmailDeliveryQueueService;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const renderer = new SchoolEmailRendererService(emailSettingsRepository);

    return {
      recipientTargeting,
      emailSettingsRepository,
      deliveryRepository,
      queueService,
      authRepository,
      renderer,
    };
  }

  it('creates a queued credential batch without exposing temporary passwords', async () => {
    const mocks = buildUseCaseMocks();
    const useCase = new CreateCredentialDeliveryUseCase(
      mocks.recipientTargeting,
      mocks.deliveryRepository,
      mocks.emailSettingsRepository,
      mocks.renderer,
      mocks.queueService,
      mocks.authRepository,
    );

    const result = await runScoped(() =>
      useCase.execute({
        scope: 'selected',
        userIds: ['user-1'],
        credentialMode: 'GENERATE_TEMPORARY_PASSWORD',
      }),
    );

    expect(result.deliveryMode).toBe('queued');
    expect(
      mocks.deliveryRepository.createBatchWithRecipients,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: SchoolEmailDeliveryKind.CREDENTIAL_DELIVERY,
        recipients: [
          expect.objectContaining({
            status: SchoolEmailDeliveryRecipientStatus.QUEUED,
            toEmail: 'user.contact@example.com',
          }),
        ],
      }),
    );
    expect(mocks.queueService.enqueueRecipientDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'recipient-1' }),
    );
    expect(
      JSON.stringify(
        (mocks.authRepository.createAuditLog as jest.Mock).mock.calls,
      ),
    ).not.toMatch(/MZ-/);
  });

  it('previews a general campaign and rejects credential variables', async () => {
    const mocks = buildUseCaseMocks();
    const useCase = new PreviewEmailCampaignUseCase(mocks.renderer);

    await expect(
      runScoped(() =>
        useCase.execute({
          bodyHtml: '<p>{{credential.temporaryPassword}}</p>',
        }),
      ),
    ).rejects.toBeInstanceOf(
      EmailCampaignCredentialVariablesForbiddenException,
    );

    const preview = await runScoped(() =>
      useCase.execute({
        subject: 'Hello {{user.fullName}}',
        bodyHtml: '<p>{{school.name}}</p>',
        previewData: { user: { fullName: 'Preview User' } },
      }),
    );

    expect(preview.subject).toContain('Preview User');
    expect(preview.html).toContain('School');
  });

  it('creates a queued general campaign without credential mutation', async () => {
    const mocks = buildUseCaseMocks();
    (
      mocks.deliveryRepository.createBatchWithRecipients as jest.Mock
    ).mockResolvedValue({
      batch: batch(SchoolEmailDeliveryKind.GENERAL_CAMPAIGN),
      queuedRecipientIds: ['recipient-1'],
    });
    const useCase = new CreateEmailCampaignUseCase(
      mocks.recipientTargeting,
      mocks.deliveryRepository,
      mocks.emailSettingsRepository,
      mocks.renderer,
      mocks.queueService,
      mocks.authRepository,
    );

    const result = await runScoped(() =>
      useCase.execute({
        recipientScope: { scope: 'selected', userIds: ['user-1'] },
        subject: 'School update',
        bodyHtml: '<p>Hello {{user.fullName}}</p>',
      }),
    );

    expect(result.kind).toBe(SchoolEmailDeliveryKind.GENERAL_CAMPAIGN);
    expect(
      mocks.deliveryRepository.createBatchWithRecipients,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: SchoolEmailDeliveryKind.GENERAL_CAMPAIGN,
        campaignContent: expect.objectContaining({
          bodyHtml: '<p>Hello {{user.fullName}}</p>',
        }),
      }),
    );
    expect(mocks.authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.email.campaign.queue',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
  });

  it('reads campaign detail only from general campaign batches', async () => {
    const deliveryRepository = {
      findBatchByIdAndKind: jest
        .fn()
        .mockResolvedValueOnce(batch(SchoolEmailDeliveryKind.GENERAL_CAMPAIGN))
        .mockResolvedValueOnce(null),
    } as unknown as EmailDeliveryRepository;
    const useCase = new GetEmailCampaignUseCase(deliveryRepository);

    const result = await useCase.execute('batch-1');

    expect(result.kind).toBe(SchoolEmailDeliveryKind.GENERAL_CAMPAIGN);
    expect(deliveryRepository.findBatchByIdAndKind).toHaveBeenCalledWith(
      'batch-1',
      SchoolEmailDeliveryKind.GENERAL_CAMPAIGN,
    );
    await expect(useCase.execute('credential-batch-1')).rejects.toBeInstanceOf(
      EmailDeliveryBatchNotFoundException,
    );
  });
});
