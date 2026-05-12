import { SchoolEmailTemplate, SchoolEmailTemplateKey } from '@prisma/client';
import {
  EmailTemplateResponseDto,
  EmailTemplateSocialLinksDto,
} from '../dto/email-template.dto';
import {
  allowedVariablesForTemplate,
  defaultTemplateForKey,
  EmailTemplateContent,
  EmailTemplateSocialLinks,
} from '../domain/default-email-templates';

export type EmailTemplateView = SchoolEmailTemplate | EmailTemplateContent;

export function presentEmailTemplate(
  key: SchoolEmailTemplateKey,
  template: SchoolEmailTemplate | null,
): EmailTemplateResponseDto {
  const view = template ?? defaultTemplateForKey(key);

  return {
    id: 'id' in view ? view.id : null,
    key,
    customized: Boolean(template),
    subject: view.subject,
    preheader: view.preheader,
    title: view.title,
    subtitle: view.subtitle,
    bodyHtml: view.bodyHtml,
    bodyText: view.bodyText,
    footerHtml: view.footerHtml,
    logoFileId: view.logoFileId,
    supportEmail: view.supportEmail,
    supportPhone: view.supportPhone,
    socialLinks: normalizeSocialLinks(view.socialLinks),
    isActive: view.isActive,
    allowedVariables: allowedVariablesForTemplate(key),
    createdAt: 'createdAt' in view ? view.createdAt.toISOString() : null,
    updatedAt: 'updatedAt' in view ? view.updatedAt.toISOString() : null,
  };
}

export function normalizeSocialLinks(
  value: unknown,
): EmailTemplateSocialLinksDto | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as EmailTemplateSocialLinks;

  return {
    ...(record.website ? { website: record.website } : {}),
    ...(record.facebook ? { facebook: record.facebook } : {}),
    ...(record.instagram ? { instagram: record.instagram } : {}),
    ...(record.x ? { x: record.x } : {}),
  };
}
