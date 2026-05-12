import { Injectable } from '@nestjs/common';
import {
  SchoolEmailTemplate,
  SchoolEmailTemplateKey,
} from '@prisma/client';
import {
  allowedVariablesForTemplate,
  buildDefaultPreviewData,
  defaultTemplateForKey,
  EmailTemplateContent,
  GENERAL_MESSAGE_VARIABLES,
} from '../../domain/default-email-templates';
import { validateTemplateContent } from '../../domain/email-template-content';
import {
  collectRenderIssues,
  escapeHtml,
  renderTemplate,
} from '../../domain/email-template-renderer';
import {
  EmailCampaignCredentialVariablesForbiddenException,
  EmailCampaignInvalidException,
  EmailDeliveryTemplateMissingException,
} from '../../domain/email.exceptions';
import { EmailSettingsRepository } from '../../infrastructure/email-settings.repository';

export interface CampaignContentInput {
  subject?: string | null;
  title?: string | null;
  bodyHtml: string;
  bodyText?: string | null;
  footerHtml?: string | null;
}

export interface RenderedSchoolEmail {
  subject: string;
  html: string;
  text: string | null;
  missingVariables: string[];
  unknownVariables: string[];
}

export interface RenderUserData {
  fullName: string | null;
  username: string | null;
  loginEmail: string | null;
}

@Injectable()
export class SchoolEmailRendererService {
  constructor(
    private readonly emailSettingsRepository: EmailSettingsRepository,
  ) {}

  async renderCredentialEmail(args: {
    schoolId: string;
    templateKey: SchoolEmailTemplateKey;
    user: RenderUserData;
    temporaryPassword?: string | null;
  }): Promise<RenderedSchoolEmail> {
    const [content, branding] = await Promise.all([
      this.loadTemplateContent(args.templateKey),
      this.emailSettingsRepository.findSchoolBranding(args.schoolId),
    ]);
    const allowedVariables = allowedVariablesForTemplate(args.templateKey);
    validateTemplateContent(content, allowedVariables);

    return this.renderContent(content, allowedVariables, {
      school: {
        name: branding.name,
        logoUrl: branding.logoUrl,
      },
      user: {
        fullName: args.user.fullName ?? '',
        username: args.user.username ?? '',
        loginEmail: args.user.loginEmail ?? '',
      },
      credential: {
        activationUrl: null,
        temporaryPassword: args.temporaryPassword ?? null,
      },
      support: {
        email: content.supportEmail ?? branding.supportEmail,
        phone: content.supportPhone ?? branding.supportPhone,
      },
      social: content.socialLinks ?? {},
    });
  }

  async renderCampaignEmail(args: {
    schoolId: string;
    templateKey: SchoolEmailTemplateKey;
    campaignContent: CampaignContentInput;
    user: RenderUserData;
    previewData?: Record<string, unknown> | null;
  }): Promise<RenderedSchoolEmail> {
    const [template, branding] = await Promise.all([
      this.loadTemplateContent(args.templateKey),
      this.emailSettingsRepository.findSchoolBranding(args.schoolId),
    ]);
    const content: EmailTemplateContent = {
      ...template,
      subject: args.campaignContent.subject ?? template.subject,
      title: args.campaignContent.title ?? template.title,
      bodyHtml: args.campaignContent.bodyHtml,
      bodyText:
        args.campaignContent.bodyText === undefined
          ? template.bodyText
          : args.campaignContent.bodyText,
      footerHtml:
        args.campaignContent.footerHtml === undefined
          ? template.footerHtml
          : args.campaignContent.footerHtml,
    };

    this.validateGeneralCampaignContent(content);

    return this.renderContent(
      content,
      [...GENERAL_MESSAGE_VARIABLES],
      buildDefaultPreviewData(
        deepMerge(
          {
            school: {
              name: branding.name,
              logoUrl: branding.logoUrl,
            },
            user: {
              fullName: args.user.fullName ?? '',
              username: args.user.username ?? '',
              loginEmail: args.user.loginEmail ?? '',
            },
            support: {
              email: content.supportEmail ?? branding.supportEmail,
              phone: content.supportPhone ?? branding.supportPhone,
            },
            social: content.socialLinks ?? {},
          },
          args.previewData ?? {},
        ),
      ),
    );
  }

  async previewCampaign(args: {
    schoolId: string;
    templateKey: SchoolEmailTemplateKey;
    campaignContent: CampaignContentInput;
    previewData?: Record<string, unknown> | null;
  }): Promise<RenderedSchoolEmail> {
    return this.renderCampaignEmail({
      schoolId: args.schoolId,
      templateKey: args.templateKey,
      campaignContent: args.campaignContent,
      previewData: args.previewData,
      user: {
        fullName: 'Sample User',
        username: 'sample.user',
        loginEmail: 'sample.user@school.example',
      },
    });
  }

  async loadTemplateContent(
    key: SchoolEmailTemplateKey,
  ): Promise<EmailTemplateContent> {
    const existing = await this.emailSettingsRepository.findTemplate(key);
    if (existing && !existing.isActive) {
      throw new EmailDeliveryTemplateMissingException({ templateKey: key });
    }

    return existing ? templateRecordToContent(existing) : defaultTemplateForKey(key);
  }

  validateGeneralCampaignContent(content: EmailTemplateContent): void {
    const templates = [
      content.subject,
      content.title,
      content.bodyHtml,
      content.bodyText,
      content.footerHtml,
    ].filter((value): value is string => Boolean(value));
    const issues = collectRenderIssues(templates, [...GENERAL_MESSAGE_VARIABLES]);
    const credentialVariables = issues.unknownVariables.filter((variable) =>
      variable.startsWith('credential.'),
    );

    if (credentialVariables.length > 0) {
      throw new EmailCampaignCredentialVariablesForbiddenException(
        credentialVariables,
      );
    }

    if (!content.bodyHtml.trim() || issues.unknownVariables.length > 0) {
      throw new EmailCampaignInvalidException({
        fields: content.bodyHtml.trim() ? [] : ['bodyHtml'],
        unknownVariables: issues.unknownVariables,
      });
    }
  }

  private renderContent(
    content: EmailTemplateContent,
    allowedVariables: string[],
    data: Record<string, unknown>,
  ): RenderedSchoolEmail {
    const subject = renderTemplate(content.subject, {
      allowedVariables,
      data,
    });
    const title = renderOptional(content.title, {
      allowedVariables,
      data,
    });
    const subtitle = renderOptional(content.subtitle, {
      allowedVariables,
      data,
    });
    const bodyHtml = renderTemplate(content.bodyHtml, {
      allowedVariables,
      data,
      escapeHtml: true,
    });
    const footerHtml = renderOptional(content.footerHtml, {
      allowedVariables,
      data,
      escapeHtml: true,
    });
    const text = renderOptional(content.bodyText, {
      allowedVariables,
      data,
    });

    return {
      subject: subject.rendered,
      html: buildEmailHtml({
        logoFileId: content.logoFileId,
        title: title.rendered,
        subtitle: subtitle.rendered,
        bodyHtml: bodyHtml.rendered,
        footerHtml: footerHtml.rendered,
      }),
      text: text.rendered,
      missingVariables: uniqueSorted(
        [subject, title, subtitle, bodyHtml, footerHtml, text].flatMap(
          (result) => result.missingVariables,
        ),
      ),
      unknownVariables: uniqueSorted(
        [subject, title, subtitle, bodyHtml, footerHtml, text].flatMap(
          (result) => result.unknownVariables,
        ),
      ),
    };
  }
}

function templateRecordToContent(
  template: SchoolEmailTemplate,
): EmailTemplateContent {
  return {
    key: template.key,
    subject: template.subject,
    preheader: template.preheader,
    title: template.title,
    subtitle: template.subtitle,
    bodyHtml: template.bodyHtml,
    bodyText: template.bodyText,
    footerHtml: template.footerHtml,
    logoFileId: template.logoFileId,
    supportEmail: template.supportEmail,
    supportPhone: template.supportPhone,
    socialLinks: (template.socialLinks ?? null) as EmailTemplateContent['socialLinks'],
    isActive: template.isActive,
  };
}

function renderOptional(
  value: string | null,
  options: {
    allowedVariables: string[];
    data: Record<string, unknown>;
    escapeHtml?: boolean;
  },
): {
  rendered: string | null;
  variables: string[];
  missingVariables: string[];
  unknownVariables: string[];
} {
  if (!value) {
    return {
      rendered: null,
      variables: [],
      missingVariables: [],
      unknownVariables: [],
    };
  }

  return renderTemplate(value, options);
}

function buildEmailHtml(input: {
  logoFileId: string | null;
  title: string | null;
  subtitle: string | null;
  bodyHtml: string;
  footerHtml: string | null;
}): string {
  const logo = input.logoFileId
    ? `<div data-logo-file-id="${escapeHtml(input.logoFileId)}"></div>`
    : '';
  const title = input.title ? `<h1>${escapeHtml(input.title)}</h1>` : '';
  const subtitle = input.subtitle
    ? `<p class="subtitle">${escapeHtml(input.subtitle)}</p>`
    : '';
  const footer = input.footerHtml ? `<footer>${input.footerHtml}</footer>` : '';

  return [
    '<!doctype html>',
    '<html><body>',
    '<main dir="auto">',
    logo,
    title,
    subtitle,
    `<section>${input.bodyHtml}</section>`,
    footer,
    '</main>',
    '</body></html>',
  ].join('');
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    if (
      value &&
      current &&
      typeof value === 'object' &&
      typeof current === 'object' &&
      !Array.isArray(value) &&
      !Array.isArray(current)
    ) {
      result[key] = deepMerge(
        current as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      continue;
    }

    result[key] = value;
  }

  return result;
}
