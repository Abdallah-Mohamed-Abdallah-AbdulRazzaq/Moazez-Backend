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
  @IsOptional()
  @IsIn(SCHOOL_EMAIL_PROVIDER_TYPES)
  providerType?: SchoolEmailProviderTypeValue;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fromName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  fromEmail?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  replyToEmail?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(253)
  host?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  apiKey?: string;
}

export class TestEmailConnectionDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  toEmail?: string;
}

export class SchoolEmailConnectionResponseDto {
  configured!: boolean;
  providerType!: SchoolEmailProviderTypeValue | null;
  fromName!: string | null;
  fromEmail!: string | null;
  replyToEmail!: string | null;
  host!: string | null;
  port!: number | null;
  secure!: boolean | null;
  username!: string | null;
  hasPassword!: boolean;
  hasApiKey!: boolean;
  status!: SchoolEmailConnectionStatusValue | null;
  lastTestedAt!: string | null;
  verifiedAt!: string | null;
  failureReason!: string | null;
  createdAt!: string | null;
  updatedAt!: string | null;
}

export class TestEmailConnectionResponseDto extends SchoolEmailConnectionResponseDto {
  testRecipient!: string;
  deliveryMode!: 'configuration_validation';
  message!: string;
}
