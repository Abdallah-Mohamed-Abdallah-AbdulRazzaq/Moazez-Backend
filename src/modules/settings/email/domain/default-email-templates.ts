import { SchoolEmailTemplateKey } from '@prisma/client';

export interface EmailTemplateContent {
  key: SchoolEmailTemplateKey;
  subject: string;
  preheader: string | null;
  title: string | null;
  subtitle: string | null;
  bodyHtml: string;
  bodyText: string | null;
  footerHtml: string | null;
  logoFileId: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  socialLinks: EmailTemplateSocialLinks | null;
  isActive: boolean;
}

export interface EmailTemplateSocialLinks {
  website?: string;
  facebook?: string;
  instagram?: string;
  x?: string;
}

export const SCHOOL_EMAIL_TEMPLATE_KEY_ORDER: SchoolEmailTemplateKey[] = [
  SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS,
  SchoolEmailTemplateKey.PASSWORD_RESET,
  SchoolEmailTemplateKey.GENERAL_MESSAGE,
];

export const COMMON_EMAIL_TEMPLATE_VARIABLES = [
  'school.name',
  'school.logoUrl',
  'user.fullName',
  'user.username',
  'user.loginEmail',
  'support.email',
  'support.phone',
  'social.website',
  'social.facebook',
  'social.instagram',
  'social.x',
] as const;

export const ACCOUNT_CREDENTIAL_VARIABLES = [
  ...COMMON_EMAIL_TEMPLATE_VARIABLES,
  'credential.activationUrl',
  'credential.temporaryPassword',
] as const;

export const PASSWORD_RESET_VARIABLES = [
  ...COMMON_EMAIL_TEMPLATE_VARIABLES,
  'credential.resetUrl',
] as const;

export const GENERAL_MESSAGE_VARIABLES = [
  ...COMMON_EMAIL_TEMPLATE_VARIABLES,
] as const;

export function allowedVariablesForTemplate(
  key: SchoolEmailTemplateKey,
): string[] {
  switch (key) {
    case SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS:
      return [...ACCOUNT_CREDENTIAL_VARIABLES];
    case SchoolEmailTemplateKey.PASSWORD_RESET:
      return [...PASSWORD_RESET_VARIABLES];
    case SchoolEmailTemplateKey.GENERAL_MESSAGE:
      return [...GENERAL_MESSAGE_VARIABLES];
  }
}

export function defaultTemplateForKey(
  key: SchoolEmailTemplateKey,
): EmailTemplateContent {
  return DEFAULT_EMAIL_TEMPLATES[key];
}

export const DEFAULT_EMAIL_TEMPLATES: Record<
  SchoolEmailTemplateKey,
  EmailTemplateContent
> = {
  [SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS]: {
    key: SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS,
    subject: '{{school.name}} account access',
    preheader: 'Your school account is ready.',
    title: 'Welcome to {{school.name}}',
    subtitle: 'Your account access is ready',
    bodyHtml: [
      '<p>Hello {{user.fullName}},</p>',
      '<p>Your school account is ready. Use the details below to sign in.</p>',
      '<ul>',
      '<li>Username: <strong>{{user.username}}</strong></li>',
      '<li>Login email: <strong>{{user.loginEmail}}</strong></li>',
      '</ul>',
      '<p><a href="{{credential.activationUrl}}">Set your password</a></p>',
      '<p>If a temporary password was issued, use this one-time value: <strong>{{credential.temporaryPassword}}</strong></p>',
      '<p>For your safety, do not share your password with anyone.</p>',
    ].join(''),
    bodyText: [
      'Hello {{user.fullName}},',
      '',
      'Your school account is ready.',
      'Username: {{user.username}}',
      'Login email: {{user.loginEmail}}',
      'Activation link: {{credential.activationUrl}}',
      'Temporary password, if issued: {{credential.temporaryPassword}}',
      '',
      'Do not share your password with anyone.',
    ].join('\n'),
    footerHtml:
      '<p>Need help? Contact {{support.email}} or {{support.phone}}.</p>',
    logoFileId: null,
    supportEmail: null,
    supportPhone: null,
    socialLinks: null,
    isActive: true,
  },
  [SchoolEmailTemplateKey.PASSWORD_RESET]: {
    key: SchoolEmailTemplateKey.PASSWORD_RESET,
    subject: 'Reset your {{school.name}} password',
    preheader: 'Use this secure link to reset your password.',
    title: 'Password reset',
    subtitle: '{{school.name}} account security',
    bodyHtml: [
      '<p>Hello {{user.fullName}},</p>',
      '<p>Use the secure link below to reset your school account password.</p>',
      '<p><a href="{{credential.resetUrl}}">Reset password</a></p>',
      '<p>If you did not request this, ignore this message and contact {{support.email}}.</p>',
    ].join(''),
    bodyText: [
      'Hello {{user.fullName}},',
      '',
      'Use this secure link to reset your password:',
      '{{credential.resetUrl}}',
      '',
      'If you did not request this, ignore this message and contact {{support.email}}.',
    ].join('\n'),
    footerHtml:
      '<p>This password reset link is for your school account only.</p>',
    logoFileId: null,
    supportEmail: null,
    supportPhone: null,
    socialLinks: null,
    isActive: true,
  },
  [SchoolEmailTemplateKey.GENERAL_MESSAGE]: {
    key: SchoolEmailTemplateKey.GENERAL_MESSAGE,
    subject: 'Message from {{school.name}}',
    preheader: 'A school update for {{user.fullName}}.',
    title: '{{school.name}} update',
    subtitle: null,
    bodyHtml:
      '<p>Hello {{user.fullName}},</p><p>This is a school message from {{school.name}}.</p>',
    bodyText:
      'Hello {{user.fullName}},\n\nThis is a school message from {{school.name}}.',
    footerHtml: '<p>Support: {{support.email}} {{support.phone}}</p>',
    logoFileId: null,
    supportEmail: null,
    supportPhone: null,
    socialLinks: null,
    isActive: true,
  },
};

export function buildDefaultPreviewData(overrides?: Record<string, unknown>) {
  return deepMerge(
    {
      school: {
        name: 'Moazez Academy',
        logoUrl: 'https://example.com/school-logo.png',
      },
      user: {
        fullName: 'Sample User',
        username: 'sample.user',
        loginEmail: 'sample.user@school.example',
      },
      credential: {
        activationUrl: 'https://example.com/activate/sample-token',
        temporaryPassword: 'MZ-SAMPLE-1234',
        resetUrl: 'https://example.com/reset/sample-token',
      },
      support: {
        email: 'support@school.example',
        phone: '+20 100 000 0000',
      },
      social: {
        website: 'https://school.example',
        facebook: 'https://facebook.com/school',
        instagram: 'https://instagram.com/school',
        x: 'https://x.com/school',
      },
    },
    overrides ?? {},
  );
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
