import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const SCHOOL_EMAIL_TEMPLATE_KEYS = [
  'ACCOUNT_CREDENTIALS',
  'PASSWORD_RESET',
  'GENERAL_MESSAGE',
] as const;

export type SchoolEmailTemplateKeyValue =
  (typeof SCHOOL_EMAIL_TEMPLATE_KEYS)[number];

export class EmailTemplateSocialLinksDto {
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  facebook?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  instagram?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  x?: string;
}

export class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  preheader?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  bodyText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  footerHtml?: string | null;

  @IsOptional()
  @IsUUID('4')
  logoFileId?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  supportEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  supportPhone?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmailTemplateSocialLinksDto)
  socialLinks?: EmailTemplateSocialLinksDto | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PreviewEmailTemplateDto extends UpdateEmailTemplateDto {
  @IsOptional()
  @IsObject()
  previewData?: Record<string, unknown>;
}

export class EmailTemplateResponseDto {
  id!: string | null;
  key!: SchoolEmailTemplateKeyValue;
  customized!: boolean;
  subject!: string;
  preheader!: string | null;
  title!: string | null;
  subtitle!: string | null;
  bodyHtml!: string;
  bodyText!: string | null;
  footerHtml!: string | null;
  logoFileId!: string | null;
  supportEmail!: string | null;
  supportPhone!: string | null;
  socialLinks!: EmailTemplateSocialLinksDto | null;
  isActive!: boolean;
  allowedVariables!: string[];
  createdAt!: string | null;
  updatedAt!: string | null;
}

export class EmailTemplateListResponseDto {
  items!: EmailTemplateResponseDto[];
}

export class EmailTemplatePreviewResponseDto {
  key!: SchoolEmailTemplateKeyValue;
  subject!: string;
  preheader!: string | null;
  html!: string;
  text!: string | null;
  missingVariables!: string[];
  unknownVariables!: string[];
}

export class EmailTemplateKeyParamDto {
  @IsIn(SCHOOL_EMAIL_TEMPLATE_KEYS)
  key!: SchoolEmailTemplateKeyValue;
}
