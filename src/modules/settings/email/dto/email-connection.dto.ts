import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const SCHOOL_EMAIL_PROVIDER_TYPES = [
  'SMTP',
  'SENDGRID',
  'MAILGUN',
  'SES',
  'CUSTOM',
] as const;

export const SCHOOL_EMAIL_CONNECTION_STATUSES = [
  'DRAFT',
  'VERIFIED',
  'ACTIVE',
  'DISABLED',
  'FAILED',
] as const;

export type SchoolEmailProviderTypeValue =
  (typeof SCHOOL_EMAIL_PROVIDER_TYPES)[number];
export type SchoolEmailConnectionStatusValue =
  (typeof SCHOOL_EMAIL_CONNECTION_STATUSES)[number];

export class UpdateEmailConnectionDto {
  @ApiPropertyOptional({
    description: 'Outbound provider type for school-managed email.',
    enum: SCHOOL_EMAIL_PROVIDER_TYPES,
    example: 'SMTP',
  })
  @IsOptional()
  @IsIn(SCHOOL_EMAIL_PROVIDER_TYPES)
  providerType?: SchoolEmailProviderTypeValue;

  @ApiPropertyOptional({
    description: 'Display name used in the From header.',
    example: 'Moazez Demo School',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fromName?: string;

  @ApiPropertyOptional({
    description: 'Email address used in the From header.',
    example: 'no-reply@demo-school.moazez.local',
    maxLength: 254,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  fromEmail?: string;

  @ApiPropertyOptional({
    description: 'Reply-To email address. Null clears the current value.',
    example: 'support@demo-school.moazez.local',
    nullable: true,
    maxLength: 254,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  replyToEmail?: string | null;

  @ApiPropertyOptional({
    description: 'SMTP host or provider endpoint.',
    example: 'smtp.example.com',
    maxLength: 253,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(253)
  host?: string;

  @ApiPropertyOptional({
    description: 'SMTP port.',
    example: 587,
    minimum: 1,
    maximum: 65535,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({
    description: 'Whether SMTP should use a TLS-wrapped connection.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @ApiPropertyOptional({
    description:
      'Provider username. Secrets are stored encrypted and never returned.',
    example: 'smtp-user',
    maxLength: 254,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  username?: string;

  @ApiPropertyOptional({
    description: 'Provider password. Stored encrypted and never returned.',
    example: 'smtp-password',
    maxLength: 1000,
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  password?: string;

  @ApiPropertyOptional({
    description:
      'API key for API-backed providers. Stored encrypted and never returned.',
    example: 'SG.xxxxx',
    maxLength: 2000,
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  apiKey?: string;
}

export class TestEmailConnectionDto {
  @ApiPropertyOptional({
    description: 'Optional recipient for the bounded connection test.',
    example: 'it-admin@example.com',
    maxLength: 254,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  toEmail?: string;
}

export class SchoolEmailConnectionResponseDto {
  @ApiProperty({
    description: 'Whether a school email connection exists.',
    example: true,
  })
  configured!: boolean;

  @ApiProperty({
    enum: SCHOOL_EMAIL_PROVIDER_TYPES,
    nullable: true,
    example: 'SMTP',
  })
  providerType!: SchoolEmailProviderTypeValue | null;

  @ApiProperty({ example: 'Moazez Demo School', nullable: true })
  fromName!: string | null;

  @ApiProperty({ example: 'no-reply@demo-school.moazez.local', nullable: true })
  fromEmail!: string | null;

  @ApiProperty({ example: 'support@demo-school.moazez.local', nullable: true })
  replyToEmail!: string | null;

  @ApiProperty({ example: 'smtp.example.com', nullable: true })
  host!: string | null;

  @ApiProperty({ example: 587, nullable: true })
  port!: number | null;

  @ApiProperty({ example: false, nullable: true })
  secure!: boolean | null;

  @ApiProperty({ example: 'smtp-user', nullable: true })
  username!: string | null;

  @ApiProperty({
    description: 'Whether an encrypted provider password is stored.',
    example: true,
  })
  hasPassword!: boolean;

  @ApiProperty({
    description: 'Whether an encrypted provider API key is stored.',
    example: false,
  })
  hasApiKey!: boolean;

  @ApiProperty({
    enum: SCHOOL_EMAIL_CONNECTION_STATUSES,
    nullable: true,
    example: 'VERIFIED',
  })
  status!: SchoolEmailConnectionStatusValue | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastTestedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  verifiedAt!: string | null;

  @ApiProperty({ example: null, nullable: true })
  failureReason!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  createdAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  updatedAt!: string | null;
}

export class TestEmailConnectionResponseDto extends SchoolEmailConnectionResponseDto {
  @ApiProperty({ example: 'it-admin@example.com' })
  testRecipient!: string;

  @ApiProperty({
    enum: ['configuration_validation'],
    example: 'configuration_validation',
  })
  deliveryMode!: 'configuration_validation';

  @ApiProperty({
    example:
      'SMTP configuration was validated. No bulk or credential email was sent.',
  })
  message!: string;
}
