import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  SCHOOL_EMAIL_TEMPLATE_KEYS,
} from '../../dto/email-template.dto';
import type { SchoolEmailTemplateKeyValue } from '../../dto/email-template.dto';

export const EMAIL_RECIPIENT_SCOPE_VALUES = [
  'selected',
  'role',
  'user_type',
  'missing_password',
  'must_change_password',
  'with_contact_email',
  'all_school_users',
] as const;

export const EMAIL_DELIVERY_KIND_VALUES = [
  'CREDENTIAL_DELIVERY',
  'GENERAL_CAMPAIGN',
] as const;

export const EMAIL_DELIVERY_BATCH_STATUS_VALUES = [
  'DRAFT',
  'QUEUED',
  'PROCESSING',
  'SUCCEEDED',
  'PARTIAL_FAILED',
  'FAILED',
  'CANCELLED',
] as const;

export const USER_TYPE_API_VALUES = [
  'platform_user',
  'organization_user',
  'school_user',
  'teacher',
  'parent',
  'student',
  'applicant',
  'pickup_delegate',
  'service_account',
] as const;

export const CREDENTIAL_DELIVERY_MODE_VALUES = [
  'LOGIN_INFO_ONLY',
  'GENERATE_TEMPORARY_PASSWORD',
  'REGENERATE_TEMPORARY_PASSWORD',
] as const;

export type EmailRecipientScopeValue =
  (typeof EMAIL_RECIPIENT_SCOPE_VALUES)[number];
export type EmailDeliveryKindValue = (typeof EMAIL_DELIVERY_KIND_VALUES)[number];
export type EmailDeliveryBatchStatusValue =
  (typeof EMAIL_DELIVERY_BATCH_STATUS_VALUES)[number];
export type EmailUserTypeApiValue = (typeof USER_TYPE_API_VALUES)[number];
export type CredentialDeliveryModeValue =
  (typeof CREDENTIAL_DELIVERY_MODE_VALUES)[number];

export class EmailRecipientScopeDto {
  @IsIn(EMAIL_RECIPIENT_SCOPE_VALUES)
  scope!: EmailRecipientScopeValue;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  roleKeys?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(USER_TYPE_API_VALUES, { each: true })
  userTypes?: EmailUserTypeApiValue[];
}

export class CredentialDeliveryPreviewRecipientsDto extends EmailRecipientScopeDto {
  @IsOptional()
  @IsBoolean()
  includeUsersWithPassword?: boolean = false;

  @IsOptional()
  @IsBoolean()
  includeDisabledUsers?: boolean = false;

  @IsOptional()
  @IsBoolean()
  requireContactEmail?: boolean = true;

  @IsOptional()
  @IsBoolean()
  allowLoginEmailFallback?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;
}

export class CreateCredentialDeliveryDto extends CredentialDeliveryPreviewRecipientsDto {
  @IsOptional()
  @IsIn(SCHOOL_EMAIL_TEMPLATE_KEYS)
  templateKey?: SchoolEmailTemplateKeyValue = 'ACCOUNT_CREDENTIALS';

  @IsIn(CREDENTIAL_DELIVERY_MODE_VALUES)
  credentialMode!: CredentialDeliveryModeValue;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxRecipients?: number = 250;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = false;
}

export class CampaignPreviewRecipientsDto {
  @ValidateNested()
  @Type(() => EmailRecipientScopeDto)
  recipientScope!: EmailRecipientScopeDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsEmail({}, { each: true })
  @MaxLength(254, { each: true })
  customEmails?: string[];

  @IsOptional()
  @IsBoolean()
  includeDisabledUsers?: boolean = false;

  @IsOptional()
  @IsBoolean()
  requireContactEmail?: boolean = true;

  @IsOptional()
  @IsBoolean()
  allowLoginEmailFallback?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;
}

export class CampaignPreviewDto {
  @IsOptional()
  @IsIn(SCHOOL_EMAIL_TEMPLATE_KEYS)
  templateKey?: SchoolEmailTemplateKeyValue = 'GENERAL_MESSAGE';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  bodyHtml!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  bodyText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  footerHtml?: string | null;

  @IsOptional()
  @IsObject()
  previewData?: Record<string, unknown>;
}

export class CreateCampaignDto extends CampaignPreviewDto {
  @ValidateNested()
  @Type(() => EmailRecipientScopeDto)
  recipientScope!: EmailRecipientScopeDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsEmail({}, { each: true })
  @MaxLength(254, { each: true })
  customEmails?: string[];

  @IsOptional()
  @IsBoolean()
  includeDisabledUsers?: boolean = false;

  @IsOptional()
  @IsBoolean()
  requireContactEmail?: boolean = true;

  @IsOptional()
  @IsBoolean()
  allowLoginEmailFallback?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxRecipients?: number = 500;
}

export class DeliveryListQueryDto {
  @IsOptional()
  @IsIn(EMAIL_DELIVERY_KIND_VALUES)
  kind?: EmailDeliveryKindValue;

  @IsOptional()
  @IsIn(EMAIL_DELIVERY_BATCH_STATUS_VALUES)
  status?: EmailDeliveryBatchStatusValue;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class DeliveryRecipientsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class DeliveryRecipientPreviewItemDto {
  userId!: string | null;
  fullName!: string | null;
  username!: string | null;
  loginEmail!: string | null;
  contactEmail!: string | null;
  toEmail!: string | null;
  userType!: EmailUserTypeApiValue | null;
  roleKey!: string | null;
  hasPassword!: boolean | null;
  mustChangePassword!: boolean | null;
  credentialVersion!: number | null;
  reason!: string | null;
}

export class DeliveryRecipientPreviewResponseDto {
  totalMatched!: number;
  eligible!: number;
  skipped!: number;
  skippedReasons!: Record<string, number>;
  sample!: {
    eligible: DeliveryRecipientPreviewItemDto[];
    skipped: DeliveryRecipientPreviewItemDto[];
  };
}

export class DeliveryBatchSummaryDto {
  batchId!: string;
  status!: EmailDeliveryBatchStatusValue;
  kind!: EmailDeliveryKindValue;
  templateKey!: SchoolEmailTemplateKeyValue | null;
  subjectSnapshot!: string | null;
  totalRecipients!: number;
  queuedCount!: number;
  sentCount!: number;
  failedCount!: number;
  skippedCount!: number;
  startedAt!: string | null;
  completedAt!: string | null;
  cancelledAt!: string | null;
  failureReason!: string | null;
  createdAt!: string;
  updatedAt!: string;
  deliveryMode?: 'queued';
}

export class DeliveryBatchListResponseDto {
  items!: DeliveryBatchSummaryDto[];
  pagination!: {
    page: number;
    limit: number;
    total: number;
  };
}

export class DeliveryRecipientResponseDto {
  id!: string;
  userId!: string | null;
  toEmail!: string;
  displayName!: string | null;
  status!: string;
  attempts!: number;
  lastAttemptAt!: string | null;
  sentAt!: string | null;
  failureReason!: string | null;
  skippedReason!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class DeliveryRecipientListResponseDto {
  items!: DeliveryRecipientResponseDto[];
  pagination!: {
    page: number;
    limit: number;
    total: number;
  };
}

export class CampaignPreviewResponseDto {
  key!: SchoolEmailTemplateKeyValue;
  subject!: string;
  html!: string;
  text!: string | null;
  missingVariables!: string[];
  unknownVariables!: string[];
}
