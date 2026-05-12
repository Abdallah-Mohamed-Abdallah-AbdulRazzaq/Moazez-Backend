import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { SCHOOL_EMAIL_TEMPLATE_KEYS } from '../../dto/email-template.dto';
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

export const EMAIL_DELIVERY_RECIPIENT_STATUS_VALUES = [
  'PENDING',
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'SKIPPED',
  'CANCELLED',
] as const;

export type EmailRecipientScopeValue =
  (typeof EMAIL_RECIPIENT_SCOPE_VALUES)[number];
export type EmailDeliveryKindValue =
  (typeof EMAIL_DELIVERY_KIND_VALUES)[number];
export type EmailDeliveryBatchStatusValue =
  (typeof EMAIL_DELIVERY_BATCH_STATUS_VALUES)[number];
export type EmailUserTypeApiValue = (typeof USER_TYPE_API_VALUES)[number];
export type CredentialDeliveryModeValue =
  (typeof CREDENTIAL_DELIVERY_MODE_VALUES)[number];
export type EmailDeliveryRecipientStatusValue =
  (typeof EMAIL_DELIVERY_RECIPIENT_STATUS_VALUES)[number];

export class EmailRecipientScopeDto {
  @ApiProperty({
    description: 'Audience selector used to resolve school-scoped recipients.',
    enum: EMAIL_RECIPIENT_SCOPE_VALUES,
    example: 'user_type',
  })
  @IsIn(EMAIL_RECIPIENT_SCOPE_VALUES)
  scope!: EmailRecipientScopeValue;

  @ApiPropertyOptional({
    description: 'Explicit users to target when scope is selected.',
    type: [String],
    format: 'uuid',
    maxItems: 500,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  userIds?: string[];

  @ApiPropertyOptional({
    description: 'Role keys to target when scope is role.',
    type: [String],
    example: ['teacher', 'parent'],
    maxItems: 50,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  roleKeys?: string[];

  @ApiPropertyOptional({
    description: 'User types to target when scope is user_type.',
    enum: USER_TYPE_API_VALUES,
    isArray: true,
    example: ['teacher', 'parent'],
    maxItems: 20,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(USER_TYPE_API_VALUES, { each: true })
  userTypes?: EmailUserTypeApiValue[];
}

export class CredentialDeliveryPreviewRecipientsDto extends EmailRecipientScopeDto {
  @ApiPropertyOptional({
    description: 'Include users who already have a password hash.',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  includeUsersWithPassword?: boolean = false;

  @ApiPropertyOptional({
    description:
      'Include disabled or suspended users in the resolved audience.',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  includeDisabledUsers?: boolean = false;

  @ApiPropertyOptional({
    description: 'Skip users that do not have a contact email.',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  requireContactEmail?: boolean = true;

  @ApiPropertyOptional({
    description: 'Use generated login email when contact email is missing.',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  allowLoginEmailFallback?: boolean = false;

  @ApiPropertyOptional({
    description:
      'Maximum number of preview rows returned per eligible/skipped sample.',
    default: 100,
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;
}

export class CreateCredentialDeliveryDto extends CredentialDeliveryPreviewRecipientsDto {
  @ApiPropertyOptional({
    description: 'Template key used for credential delivery.',
    enum: SCHOOL_EMAIL_TEMPLATE_KEYS,
    default: 'ACCOUNT_CREDENTIALS',
    example: 'ACCOUNT_CREDENTIALS',
  })
  @IsOptional()
  @IsIn(SCHOOL_EMAIL_TEMPLATE_KEYS)
  templateKey?: SchoolEmailTemplateKeyValue = 'ACCOUNT_CREDENTIALS';

  @ApiProperty({
    description:
      'Credential material to include or generate for this delivery.',
    enum: CREDENTIAL_DELIVERY_MODE_VALUES,
    example: 'LOGIN_INFO_ONLY',
  })
  @IsIn(CREDENTIAL_DELIVERY_MODE_VALUES)
  credentialMode!: CredentialDeliveryModeValue;

  @ApiPropertyOptional({
    description: 'Maximum recipients to enqueue for the delivery batch.',
    default: 250,
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxRecipients?: number = 250;

  @ApiPropertyOptional({
    description: 'Create a dry-run batch without sending external email.',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = false;
}

export class CampaignPreviewRecipientsDto {
  @ApiProperty({ type: EmailRecipientScopeDto })
  @ValidateNested()
  @Type(() => EmailRecipientScopeDto)
  recipientScope!: EmailRecipientScopeDto;

  @ApiPropertyOptional({
    description: 'Additional one-off recipient email addresses.',
    type: [String],
    example: ['external.guardian@example.com'],
    maxItems: 500,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsEmail({}, { each: true })
  @MaxLength(254, { each: true })
  customEmails?: string[];

  @ApiPropertyOptional({
    description:
      'Include disabled or suspended users in the resolved audience.',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  includeDisabledUsers?: boolean = false;

  @ApiPropertyOptional({
    description: 'Skip users that do not have a contact email.',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  requireContactEmail?: boolean = true;

  @ApiPropertyOptional({
    description: 'Use generated login email when contact email is missing.',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  allowLoginEmailFallback?: boolean = false;

  @ApiPropertyOptional({
    description:
      'Maximum number of preview rows returned per eligible/skipped sample.',
    default: 100,
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;
}

export class CampaignPreviewDto {
  @ApiPropertyOptional({
    description: 'Template key used as the base for campaign rendering.',
    enum: SCHOOL_EMAIL_TEMPLATE_KEYS,
    default: 'GENERAL_MESSAGE',
    example: 'GENERAL_MESSAGE',
  })
  @IsOptional()
  @IsIn(SCHOOL_EMAIL_TEMPLATE_KEYS)
  templateKey?: SchoolEmailTemplateKeyValue = 'GENERAL_MESSAGE';

  @ApiPropertyOptional({
    description: 'Campaign subject override.',
    example: 'School trip reminder',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional({
    description: 'Campaign title rendered in the email body.',
    example: 'School trip reminder',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({
    description: 'HTML body for the campaign preview or send request.',
    example:
      '<p>Please remember to submit trip permission forms by Thursday.</p>',
    minLength: 1,
    maxLength: 20000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  bodyHtml!: string;

  @ApiPropertyOptional({
    description: 'Plain text campaign body. Null clears it.',
    example: 'Please remember to submit trip permission forms by Thursday.',
    nullable: true,
    maxLength: 20000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  bodyText?: string | null;

  @ApiPropertyOptional({
    description: 'HTML footer override. Null clears it.',
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
      'Example variable values used only for campaign preview rendering.',
    type: 'object',
    additionalProperties: true,
    example: {
      school: { name: 'Demo School' },
      support: { email: 'support@demo-school.moazez.local' },
    },
  })
  @IsOptional()
  @IsObject()
  previewData?: Record<string, unknown>;
}

export class CreateCampaignDto extends CampaignPreviewDto {
  @ApiProperty({ type: EmailRecipientScopeDto })
  @ValidateNested()
  @Type(() => EmailRecipientScopeDto)
  recipientScope!: EmailRecipientScopeDto;

  @ApiPropertyOptional({
    description: 'Additional one-off recipient email addresses.',
    type: [String],
    example: ['external.guardian@example.com'],
    maxItems: 500,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsEmail({}, { each: true })
  @MaxLength(254, { each: true })
  customEmails?: string[];

  @ApiPropertyOptional({
    description:
      'Include disabled or suspended users in the resolved audience.',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  includeDisabledUsers?: boolean = false;

  @ApiPropertyOptional({
    description: 'Skip users that do not have a contact email.',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  requireContactEmail?: boolean = true;

  @ApiPropertyOptional({
    description: 'Use generated login email when contact email is missing.',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  allowLoginEmailFallback?: boolean = false;

  @ApiPropertyOptional({
    description: 'Maximum recipients to enqueue for this campaign.',
    default: 500,
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxRecipients?: number = 500;
}

export class DeliveryListQueryDto {
  @ApiPropertyOptional({
    description: 'Filter delivery batches by kind.',
    enum: EMAIL_DELIVERY_KIND_VALUES,
    example: 'CREDENTIAL_DELIVERY',
  })
  @IsOptional()
  @IsIn(EMAIL_DELIVERY_KIND_VALUES)
  kind?: EmailDeliveryKindValue;

  @ApiPropertyOptional({
    description: 'Filter delivery batches by lifecycle status.',
    enum: EMAIL_DELIVERY_BATCH_STATUS_VALUES,
    example: 'QUEUED',
  })
  @IsOptional()
  @IsIn(EMAIL_DELIVERY_BATCH_STATUS_VALUES)
  status?: EmailDeliveryBatchStatusValue;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class DeliveryRecipientsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 50, default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class DeliveryRecipientPreviewItemDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  userId!: string | null;

  @ApiProperty({ example: 'Nour Ali', nullable: true })
  fullName!: string | null;

  @ApiProperty({ example: 'nour.ali', nullable: true })
  username!: string | null;

  @ApiProperty({
    example: 'nour.ali@demo-school.moazez.local',
    nullable: true,
  })
  loginEmail!: string | null;

  @ApiProperty({ example: 'nour.parent@example.com', nullable: true })
  contactEmail!: string | null;

  @ApiProperty({ example: 'nour.parent@example.com', nullable: true })
  toEmail!: string | null;

  @ApiProperty({
    enum: USER_TYPE_API_VALUES,
    nullable: true,
    example: 'parent',
  })
  userType!: EmailUserTypeApiValue | null;

  @ApiProperty({ example: 'parent', nullable: true })
  roleKey!: string | null;

  @ApiProperty({ example: true, nullable: true })
  hasPassword!: boolean | null;

  @ApiProperty({ example: true, nullable: true })
  mustChangePassword!: boolean | null;

  @ApiProperty({ example: 2, nullable: true })
  credentialVersion!: number | null;

  @ApiProperty({ example: 'missing_contact_email', nullable: true })
  reason!: string | null;
}

export class DeliveryRecipientPreviewSampleDto {
  @ApiProperty({ type: [DeliveryRecipientPreviewItemDto] })
  eligible!: DeliveryRecipientPreviewItemDto[];

  @ApiProperty({ type: [DeliveryRecipientPreviewItemDto] })
  skipped!: DeliveryRecipientPreviewItemDto[];
}

export class DeliveryRecipientPreviewResponseDto {
  @ApiProperty({ example: 120 })
  totalMatched!: number;

  @ApiProperty({ example: 100 })
  eligible!: number;

  @ApiProperty({ example: 20 })
  skipped!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { missing_contact_email: 12, disabled_user: 8 },
  })
  skippedReasons!: Record<string, number>;

  @ApiProperty({ type: DeliveryRecipientPreviewSampleDto })
  sample!: DeliveryRecipientPreviewSampleDto;
}

export class DeliveryBatchSummaryDto {
  @ApiProperty({ format: 'uuid' })
  batchId!: string;

  @ApiProperty({ enum: EMAIL_DELIVERY_BATCH_STATUS_VALUES, example: 'QUEUED' })
  status!: EmailDeliveryBatchStatusValue;

  @ApiProperty({
    enum: EMAIL_DELIVERY_KIND_VALUES,
    example: 'CREDENTIAL_DELIVERY',
  })
  kind!: EmailDeliveryKindValue;

  @ApiProperty({
    enum: SCHOOL_EMAIL_TEMPLATE_KEYS,
    nullable: true,
    example: 'ACCOUNT_CREDENTIALS',
  })
  templateKey!: SchoolEmailTemplateKeyValue | null;

  @ApiProperty({ example: 'Your Moazez account is ready', nullable: true })
  subjectSnapshot!: string | null;

  @ApiProperty({ example: 100 })
  totalRecipients!: number;

  @ApiProperty({ example: 100 })
  queuedCount!: number;

  @ApiProperty({ example: 0 })
  sentCount!: number;

  @ApiProperty({ example: 0 })
  failedCount!: number;

  @ApiProperty({ example: 0 })
  skippedCount!: number;

  @ApiProperty({ format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  completedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  cancelledAt!: string | null;

  @ApiProperty({ example: null, nullable: true })
  failureReason!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({ enum: ['queued'], example: 'queued' })
  deliveryMode?: 'queued';
}

export class DeliveryPaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 100 })
  total!: number;
}

export class DeliveryBatchListResponseDto {
  @ApiProperty({ type: [DeliveryBatchSummaryDto] })
  items!: DeliveryBatchSummaryDto[];

  @ApiProperty({ type: DeliveryPaginationDto })
  pagination!: DeliveryPaginationDto;
}

export class DeliveryRecipientResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  userId!: string | null;

  @ApiProperty({ example: 'nour.parent@example.com' })
  toEmail!: string;

  @ApiProperty({ example: 'Nour Ali', nullable: true })
  displayName!: string | null;

  @ApiProperty({
    enum: EMAIL_DELIVERY_RECIPIENT_STATUS_VALUES,
    example: 'QUEUED',
  })
  status!: EmailDeliveryRecipientStatusValue;

  @ApiProperty({ example: 0 })
  attempts!: number;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastAttemptAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  sentAt!: string | null;

  @ApiProperty({ example: null, nullable: true })
  failureReason!: string | null;

  @ApiProperty({ example: null, nullable: true })
  skippedReason!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class DeliveryRecipientListResponseDto {
  @ApiProperty({ type: [DeliveryRecipientResponseDto] })
  items!: DeliveryRecipientResponseDto[];

  @ApiProperty({ type: DeliveryPaginationDto })
  pagination!: DeliveryPaginationDto;
}

export class CampaignPreviewResponseDto {
  @ApiProperty({ enum: SCHOOL_EMAIL_TEMPLATE_KEYS, example: 'GENERAL_MESSAGE' })
  key!: SchoolEmailTemplateKeyValue;

  @ApiProperty({ example: 'School trip reminder' })
  subject!: string;

  @ApiProperty({ description: 'Rendered HTML preview.' })
  html!: string;

  @ApiProperty({ description: 'Rendered plain text preview.', nullable: true })
  text!: string | null;

  @ApiProperty({ type: [String], example: [] })
  missingVariables!: string[];

  @ApiProperty({ type: [String], example: [] })
  unknownVariables!: string[];
}
