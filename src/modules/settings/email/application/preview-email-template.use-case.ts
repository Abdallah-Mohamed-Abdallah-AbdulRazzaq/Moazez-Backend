import { Injectable } from '@nestjs/common';
import { SchoolEmailTemplateKey } from '@prisma/client';
import { requireSettingsScope } from '../../settings-context';
import {
  allowedVariablesForTemplate,
  buildDefaultPreviewData,
} from '../domain/default-email-templates';
import { mergeTemplateContent } from '../domain/email-template-content';
import { escapeHtml, renderTemplate } from '../domain/email-template-renderer';
import {
  EmailTemplatePreviewResponseDto,
  PreviewEmailTemplateDto,
} from '../dto/email-template.dto';
import { EmailSettingsRepository } from '../infrastructure/email-settings.repository';

@Injectable()
export class PreviewEmailTemplateUseCase {
  constructor(
    private readonly emailSettingsRepository: EmailSettingsRepository,
  ) {}

  async execute(
    key: SchoolEmailTemplateKey,
    command: PreviewEmailTemplateDto,
  ): Promise<EmailTemplatePreviewResponseDto> {
    const scope = requireSettingsScope();
    const [existing, branding] = await Promise.all([
      this.emailSettingsRepository.findTemplate(key),
      this.emailSettingsRepository.findSchoolBranding(scope.schoolId),
    ]);
    const content = mergeTemplateContent(key, existing, command);
    const allowedVariables = allowedVariablesForTemplate(key);
    const previewData = buildDefaultPreviewData(
      deepMerge(
        {
          school: {
            name: branding.name,
            logoUrl: branding.logoUrl,
          },
          support: {
            email: content.supportEmail ?? branding.supportEmail,
            phone: content.supportPhone ?? branding.supportPhone,
          },
          social: content.socialLinks ?? {},
        },
        command.previewData ?? {},
      ),
    );

    const renderedSubject = renderTemplate(content.subject, {
      allowedVariables,
      data: previewData,
    });
    const renderedPreheader = renderOptionalPlain(content.preheader, {
      allowedVariables,
      data: previewData,
    });
    const renderedTitle = renderOptionalPlain(content.title, {
      allowedVariables,
      data: previewData,
    });
    const renderedSubtitle = renderOptionalPlain(content.subtitle, {
      allowedVariables,
      data: previewData,
    });
    const renderedBodyHtml = renderTemplate(content.bodyHtml, {
      allowedVariables,
      data: previewData,
      escapeHtml: true,
    });
    const renderedFooterHtml = renderOptionalHtml(content.footerHtml, {
      allowedVariables,
      data: previewData,
    });
    const renderedText = renderOptionalPlain(content.bodyText, {
      allowedVariables,
      data: previewData,
    });

    return {
      key,
      subject: renderedSubject.rendered,
      preheader: renderedPreheader.rendered,
      html: buildPreviewHtml({
        logoFileId: content.logoFileId,
        title: renderedTitle.rendered,
        subtitle: renderedSubtitle.rendered,
        bodyHtml: renderedBodyHtml.rendered,
        footerHtml: renderedFooterHtml.rendered,
      }),
      text: renderedText.rendered,
      missingVariables: uniqueSorted(
        [
          renderedSubject,
          renderedPreheader,
          renderedTitle,
          renderedSubtitle,
          renderedBodyHtml,
          renderedFooterHtml,
          renderedText,
        ].flatMap((result) => result.missingVariables),
      ),
      unknownVariables: uniqueSorted(
        [
          renderedSubject,
          renderedPreheader,
          renderedTitle,
          renderedSubtitle,
          renderedBodyHtml,
          renderedFooterHtml,
          renderedText,
        ].flatMap((result) => result.unknownVariables),
      ),
    };
  }
}

function renderOptionalPlain(
  value: string | null,
  options: { allowedVariables: string[]; data: Record<string, unknown> },
): OptionalTemplateRenderResult {
  if (!value) {
    return emptyRender(null);
  }

  return renderTemplate(value, options);
}

function renderOptionalHtml(
  value: string | null,
  options: { allowedVariables: string[]; data: Record<string, unknown> },
): OptionalTemplateRenderResult {
  if (!value) {
    return emptyRender(null);
  }

  return renderTemplate(value, { ...options, escapeHtml: true });
}

interface OptionalTemplateRenderResult {
  rendered: string | null;
  variables: string[];
  missingVariables: string[];
  unknownVariables: string[];
}

function emptyRender(rendered: string | null): OptionalTemplateRenderResult {
  return {
    rendered,
    variables: [],
    missingVariables: [],
    unknownVariables: [],
  };
}

function buildPreviewHtml(input: {
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
