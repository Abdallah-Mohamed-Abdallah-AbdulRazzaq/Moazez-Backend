import { AuditOutcome, SchoolEmailTemplateKey, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { GetEmailTemplateUseCase } from '../application/get-email-template.use-case';
import { PreviewEmailTemplateUseCase } from '../application/preview-email-template.use-case';
import { UpdateEmailTemplateUseCase } from '../application/update-email-template.use-case';
import {
  ACCOUNT_CREDENTIAL_VARIABLES,
  DEFAULT_EMAIL_TEMPLATES,
} from '../domain/default-email-templates';
import { EmailTemplateInvalidException } from '../domain/email.exceptions';
import { renderTemplate } from '../domain/email-template-renderer';
import { EmailSettingsRepository } from '../infrastructure/email-settings.repository';

describe('email template use cases', () => {
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

  function repositories() {
    const templates = new Map<SchoolEmailTemplateKey, any>();
    const emailSettingsRepository = {
      findTemplate: jest.fn((key: SchoolEmailTemplateKey) =>
        Promise.resolve(templates.get(key) ?? null),
      ),
      saveTemplate: jest.fn((_schoolId, key, data) => {
        const now = new Date('2026-05-11T14:00:00.000Z');
        const stored = {
          id: `template-${key}`,
          schoolId: 'school-1',
          key,
          ...data,
          createdAt: templates.get(key)?.createdAt ?? now,
          updatedAt: now,
        };
        templates.set(key, stored);
        return Promise.resolve(stored);
      }),
      findSchoolBranding: jest.fn().mockResolvedValue({
        name: 'Sample School',
        logoUrl: null,
        supportEmail: 'support@school.example',
        supportPhone: '+20 100 000 0000',
      }),
    } as unknown as EmailSettingsRepository;

    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;

    return { emailSettingsRepository, authRepository, templates };
  }

  it('returns default template content when no school customization exists', async () => {
    const { emailSettingsRepository } = repositories();
    const useCase = new GetEmailTemplateUseCase(emailSettingsRepository);

    const result = await runScoped(() =>
      useCase.execute(SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS),
    );

    expect(result.customized).toBe(false);
    expect(result.subject).toBe(
      DEFAULT_EMAIL_TEMPLATES.ACCOUNT_CREDENTIALS.subject,
    );
    expect(result.allowedVariables).toEqual(
      expect.arrayContaining([
        'school.name',
        'user.username',
        'credential.activationUrl',
        'credential.temporaryPassword',
      ]),
    );
  });

  it('updates a school template and audits without rendered credentials', async () => {
    const { emailSettingsRepository, authRepository } = repositories();
    const useCase = new UpdateEmailTemplateUseCase(
      emailSettingsRepository,
      authRepository,
    );

    const result = await runScoped(() =>
      useCase.execute(SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS, {
        subject: 'Access for {{user.fullName}}',
        bodyHtml: '<p>{{credential.activationUrl}}</p>',
        socialLinks: { website: 'https://school.example' },
      }),
    );

    expect(result.customized).toBe(true);
    expect(result.subject).toBe('Access for {{user.fullName}}');
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.email.template.create',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
    expect(
      JSON.stringify((authRepository.createAuditLog as jest.Mock).mock.calls),
    ).not.toContain('MZ-SAMPLE');
  });

  it('rejects unknown variables during template update', async () => {
    const { emailSettingsRepository, authRepository } = repositories();
    const useCase = new UpdateEmailTemplateUseCase(
      emailSettingsRepository,
      authRepository,
    );

    await expect(
      runScoped(() =>
        useCase.execute(SchoolEmailTemplateKey.GENERAL_MESSAGE, {
          subject: 'Hello {{system.secret}}',
          bodyHtml: '<p>Body</p>',
        }),
      ),
    ).rejects.toBeInstanceOf(EmailTemplateInvalidException);
  });

  it('previews variables and reports missing and unknown variables without persisting', async () => {
    const { emailSettingsRepository } = repositories();
    const useCase = new PreviewEmailTemplateUseCase(emailSettingsRepository);

    const result = await runScoped(() =>
      useCase.execute(SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS, {
        subject: 'Hello {{user.fullName}} {{system.secret}}',
        bodyHtml:
          '<p>{{credential.activationUrl}}</p><p>{{credential.temporaryPassword}}</p>',
        previewData: {
          user: { fullName: 'Preview User' },
          credential: { temporaryPassword: null },
        },
      }),
    );

    expect(result.subject).toContain('Preview User');
    expect(result.unknownVariables).toContain('system.secret');
    expect(result.missingVariables).toContain('credential.temporaryPassword');
    expect(result.html).toContain('https://example.com/activate/sample-token');
    expect(
      emailSettingsRepository.saveTemplate as unknown as jest.Mock,
    ).not.toHaveBeenCalled();
  });

  it('escapes HTML variable values and never evaluates code-like templates', () => {
    const result = renderTemplate(
      '<p>{{user.fullName}}</p><p>{{constructor.constructor}}</p>',
      {
        allowedVariables: [...ACCOUNT_CREDENTIAL_VARIABLES],
        data: { user: { fullName: '<script>alert(1)</script>' } },
        escapeHtml: true,
      },
    );

    expect(result.rendered).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result.unknownVariables).toContain('constructor.constructor');
  });

  it('validates social link shape', async () => {
    const { emailSettingsRepository, authRepository } = repositories();
    const useCase = new UpdateEmailTemplateUseCase(
      emailSettingsRepository,
      authRepository,
    );

    await expect(
      runScoped(() =>
        useCase.execute(SchoolEmailTemplateKey.GENERAL_MESSAGE, {
          subject: 'Message from {{school.name}}',
          bodyHtml: '<p>Body</p>',
          socialLinks: { website: 42 } as any,
        }),
      ),
    ).rejects.toBeInstanceOf(EmailTemplateInvalidException);
  });
});
