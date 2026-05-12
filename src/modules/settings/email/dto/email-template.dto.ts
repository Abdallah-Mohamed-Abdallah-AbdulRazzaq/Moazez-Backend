import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({
    description: 'School website URL.',
    example: 'https://school.example.com',
    maxLength: 500,
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({
    description: 'Facebook profile URL.',
    example: 'https://facebook.com/demo-school',
    maxLength: 500,
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  facebook?: string;

  @ApiPropertyOptional({
    description: 'Instagram profile URL.',
    example: 'https://instagram.com/demo-school',
    maxLength: 500,
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  instagram?: string;

  @ApiPropertyOptional({
    description: 'X profile URL.',
    example: 'https://x.com/demo-school',
    maxLength: 500,
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  x?: string;
}

export class UpdateEmailTemplateDto {
  @ApiPropertyOptional({
    description: 'Email subject template.',
    example: 'Your Moazez account is ready',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional({
    description: 'Short preview text for inbox clients. Null clears it.',
    example: 'Use your school login email to sign in.',
    nullable: true,
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  preheader?: string | null;

  @ApiPropertyOptional({
    description: 'Hero title rendered inside the email body. Null clears it.',
    example: 'Welcome to Moazez',
    nullable: true,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @ApiPropertyOptional({
    description:
      'Hero subtitle rendered inside the email body. Null clears it.',
    example: 'Your school account has been prepared.',
    nullable: true,
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string | null;

  @ApiPropertyOptional({
    description:
      'HTML body template. Only approved template variables are allowed.',
    example:
      '<p>Hello {{user.fullName}}, your login email is {{user.loginEmail}}.</p>',
    maxLength: 20000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  bodyHtml?: string;

  @ApiPropertyOptional({
    description: 'Plain text body template. Null clears it.',
    example:
      'Hello {{user.fullName}}, your login email is {{user.loginEmail}}.',
    nullable: true,
    maxLength: 20000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  bodyText?: string | null;

  @ApiPropertyOptional({
    description: 'HTML footer template. Null clears it.',
    example: '<p>Contact {{support.email}} for help.</p>',
    nullable: true,
    maxLength: 20000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  footerHtml?: string | null;

  @ApiPropertyOptional({
    description:
      'File id for the school logo used by this template. Null clears it.',
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4')
  logoFileId?: string | null;

  @ApiPropertyOptional({
    description: 'Support email rendered in the template. Null clears it.',
    example: 'support@demo-school.moazez.local',
    nullable: true,
    maxLength: 254,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  supportEmail?: string | null;

  @ApiPropertyOptional({
    description: 'Support phone rendered in the template. Null clears it.',
    example: '+201000000000',
    nullable: true,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  supportPhone?: string | null;

  @ApiPropertyOptional({
    description:
      'Social links rendered in the template footer. Null clears them.',
    type: EmailTemplateSocialLinksDto,
    nullable: true,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailTemplateSocialLinksDto)
  socialLinks?: EmailTemplateSocialLinksDto | null;

  @ApiPropertyOptional({
    description: 'Whether this template is active for sends.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PreviewEmailTemplateDto extends UpdateEmailTemplateDto {
  @ApiPropertyOptional({
    description: 'Example variable values used only for preview rendering.',
    type: 'object',
    additionalProperties: true,
    example: {
      user: {
        fullName: 'Nour Ali',
        loginEmail: 'nour.ali@demo-school.moazez.local',
      },
      school: { name: 'Demo School' },
    },
  })
  @IsOptional()
  @IsObject()
  previewData?: Record<string, unknown>;
}

export class EmailTemplateResponseDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  id!: string | null;

  @ApiProperty({
    enum: SCHOOL_EMAIL_TEMPLATE_KEYS,
    example: 'ACCOUNT_CREDENTIALS',
  })
  key!: SchoolEmailTemplateKeyValue;

  @ApiProperty({ example: true })
  customized!: boolean;

  @ApiProperty({ example: 'Your Moazez account is ready' })
  subject!: string;

  @ApiProperty({
    example: 'Use your school login email to sign in.',
    nullable: true,
  })
  preheader!: string | null;

  @ApiProperty({ example: 'Welcome to Moazez', nullable: true })
  title!: string | null;

  @ApiProperty({
    example: 'Your school account has been prepared.',
    nullable: true,
  })
  subtitle!: string | null;

  @ApiProperty({
    example:
      '<p>Hello {{user.fullName}}, your login email is {{user.loginEmail}}.</p>',
  })
  bodyHtml!: string;

  @ApiProperty({
    example:
      'Hello {{user.fullName}}, your login email is {{user.loginEmail}}.',
    nullable: true,
  })
  bodyText!: string | null;

  @ApiProperty({
    example: '<p>Contact {{support.email}} for help.</p>',
    nullable: true,
  })
  footerHtml!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  logoFileId!: string | null;

  @ApiProperty({ example: 'support@demo-school.moazez.local', nullable: true })
  supportEmail!: string | null;

  @ApiProperty({ example: '+201000000000', nullable: true })
  supportPhone!: string | null;

  @ApiProperty({ type: EmailTemplateSocialLinksDto, nullable: true })
  socialLinks!: EmailTemplateSocialLinksDto | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({
    description: 'Template variables accepted for this template key.',
    type: [String],
    example: ['school.name', 'user.fullName', 'user.loginEmail'],
  })
  allowedVariables!: string[];

  @ApiProperty({ format: 'date-time', nullable: true })
  createdAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  updatedAt!: string | null;
}

export class EmailTemplateListResponseDto {
  @ApiProperty({ type: [EmailTemplateResponseDto] })
  items!: EmailTemplateResponseDto[];
}

export class EmailTemplatePreviewResponseDto {
  @ApiProperty({
    enum: SCHOOL_EMAIL_TEMPLATE_KEYS,
    example: 'ACCOUNT_CREDENTIALS',
  })
  key!: SchoolEmailTemplateKeyValue;

  @ApiProperty({ example: 'Your Moazez account is ready' })
  subject!: string;

  @ApiProperty({
    example: 'Use your school login email to sign in.',
    nullable: true,
  })
  preheader!: string | null;

  @ApiProperty({ description: 'Rendered HTML preview.' })
  html!: string;

  @ApiProperty({ description: 'Rendered plain text preview.', nullable: true })
  text!: string | null;

  @ApiProperty({ type: [String], example: [] })
  missingVariables!: string[];

  @ApiProperty({ type: [String], example: [] })
  unknownVariables!: string[];
}

export class EmailTemplateKeyParamDto {
  @ApiProperty({
    enum: SCHOOL_EMAIL_TEMPLATE_KEYS,
    example: 'ACCOUNT_CREDENTIALS',
  })
  @IsIn(SCHOOL_EMAIL_TEMPLATE_KEYS)
  key!: SchoolEmailTemplateKeyValue;
}
