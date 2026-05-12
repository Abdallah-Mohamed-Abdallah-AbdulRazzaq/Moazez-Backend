import {
  Prisma,
  SchoolEmailTemplate,
  SchoolEmailTemplateKey,
} from '@prisma/client';
import { UpdateEmailTemplateDto } from '../dto/email-template.dto';
import {
  defaultTemplateForKey,
  EmailTemplateContent,
  EmailTemplateSocialLinks,
} from './default-email-templates';
import { collectRenderIssues } from './email-template-renderer';
import { EmailTemplateInvalidException } from './email.exceptions';

export function mergeTemplateContent(
  key: SchoolEmailTemplateKey,
  existing: SchoolEmailTemplate | null,
  command: UpdateEmailTemplateDto,
): EmailTemplateContent {
  const base = existing ?? defaultTemplateForKey(key);
  const content = {
    key,
    subject: command.subject ?? base.subject,
    preheader:
      command.preheader === undefined ? base.preheader : command.preheader,
    title: command.title === undefined ? base.title : command.title,
    subtitle: command.subtitle === undefined ? base.subtitle : command.subtitle,
    bodyHtml: command.bodyHtml ?? base.bodyHtml,
    bodyText: command.bodyText === undefined ? base.bodyText : command.bodyText,
    footerHtml:
      command.footerHtml === undefined ? base.footerHtml : command.footerHtml,
    logoFileId:
      command.logoFileId === undefined ? base.logoFileId : command.logoFileId,
    supportEmail:
      command.supportEmail === undefined
        ? base.supportEmail
        : command.supportEmail,
    supportPhone:
      command.supportPhone === undefined
        ? base.supportPhone
        : command.supportPhone,
    socialLinks:
      command.socialLinks === undefined
        ? normalizeSocialLinks(base.socialLinks)
        : normalizeSocialLinks(command.socialLinks),
    isActive: command.isActive ?? base.isActive,
  };

  validateTemplateContent(content, []);
  return content;
}

export function validateTemplateContent(
  content: EmailTemplateContent,
  allowedVariables: string[],
): void {
  const invalidFields: string[] = [];
  if (!content.subject.trim()) invalidFields.push('subject');
  if (!content.bodyHtml.trim()) invalidFields.push('bodyHtml');

  const issues =
    allowedVariables.length > 0
      ? collectRenderIssues(templateStrings(content), allowedVariables)
      : { unknownVariables: [] };

  if (invalidFields.length > 0 || issues.unknownVariables.length > 0) {
    throw new EmailTemplateInvalidException({
      fields: invalidFields,
      unknownVariables: issues.unknownVariables,
    });
  }
}

export function templateStrings(content: EmailTemplateContent): string[] {
  return [
    content.subject,
    content.preheader,
    content.title,
    content.subtitle,
    content.bodyHtml,
    content.bodyText,
    content.footerHtml,
  ].filter((value): value is string => Boolean(value));
}

export function normalizeSocialLinks(
  socialLinks: unknown,
): EmailTemplateSocialLinks | null {
  if (!socialLinks) return null;
  if (typeof socialLinks !== 'object' || Array.isArray(socialLinks)) {
    throw new EmailTemplateInvalidException({
      fields: ['socialLinks'],
      reason: 'invalid_shape',
    });
  }

  const record = socialLinks as Record<string, unknown>;
  const normalized: EmailTemplateSocialLinks = {};
  const allowedKeys = new Set(['website', 'facebook', 'instagram', 'x']);

  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new EmailTemplateInvalidException({
        fields: ['socialLinks'],
        reason: 'unknown_social_link',
        key,
      });
    }
  }

  for (const key of allowedKeys) {
    const value = record[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string') {
      throw new EmailTemplateInvalidException({
        fields: ['socialLinks'],
        reason: 'invalid_social_link',
        key,
      });
    }
    normalized[key as keyof EmailTemplateSocialLinks] = value;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function socialLinksToJson(
  socialLinks: EmailTemplateSocialLinks | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return socialLinks
    ? (socialLinks as Prisma.InputJsonObject)
    : Prisma.JsonNull;
}
