import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const CREDENTIAL_STATUS_VALUES = [
  'missing',
  'set',
  'temporary_or_must_change',
  'must_change',
] as const;

export const CREDENTIAL_BULK_SCOPE_VALUES = [
  'selected',
  'role',
  'user_type',
  'missing_password',
  'all_school_users',
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

export type CredentialStatusValue = (typeof CREDENTIAL_STATUS_VALUES)[number];
export type CredentialBulkScopeValue =
  (typeof CREDENTIAL_BULK_SCOPE_VALUES)[number];
export type UserTypeApiValue = (typeof USER_TYPE_API_VALUES)[number];

export class CredentialStatusQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by school role key.',
    example: 'teacher',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  roleKey?: string;

  @ApiPropertyOptional({
    description: 'Filter by immutable user type.',
    enum: USER_TYPE_API_VALUES,
    example: 'teacher',
  })
  @IsOptional()
  @IsIn(USER_TYPE_API_VALUES)
  userType?: UserTypeApiValue;

  @ApiPropertyOptional({
    description: 'Filter by credential readiness state.',
    enum: CREDENTIAL_STATUS_VALUES,
    example: 'missing',
  })
  @IsOptional()
  @IsIn(CREDENTIAL_STATUS_VALUES)
  credentialStatus?: CredentialStatusValue;

  @ApiPropertyOptional({
    description: 'Search by name, username, login email, or contact email.',
    example: 'nour',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class SetCredentialPasswordDto {
  @ApiProperty({
    description: 'Admin-provided password to hash and store for the user.',
    example: 'S3curePass!2026',
    minLength: 1,
    maxLength: 256,
    writeOnly: true,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;

  @ApiPropertyOptional({
    description: 'Require the user to change this password on next login.',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  forceResetOnLogin?: boolean;
}

export class BulkCredentialSelectionDto {
  @ApiProperty({
    description: 'Audience selector for previewing or generating credentials.',
    enum: CREDENTIAL_BULK_SCOPE_VALUES,
    example: 'missing_password',
  })
  @IsIn(CREDENTIAL_BULK_SCOPE_VALUES)
  scope!: CredentialBulkScopeValue;

  @ApiPropertyOptional({
    description: 'Explicit users to target when scope is selected.',
    type: [String],
    format: 'uuid',
    maxItems: 250,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
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
    example: ['teacher'],
    maxItems: 20,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(USER_TYPE_API_VALUES, { each: true })
  userTypes?: UserTypeApiValue[];

  @ApiPropertyOptional({
    description: 'Allow users that already have passwords to be included.',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  includeUsersWithPassword?: boolean;

  @ApiPropertyOptional({
    description: 'Allow inactive or invited users to be included.',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  includeDisabledUsers?: boolean;
}

export class CredentialPaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;
}

export class CredentialUserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Nour Ali' })
  fullName!: string;

  @ApiProperty({ example: 'nour.ali', nullable: true })
  username!: string | null;

  @ApiProperty({ example: 'nour.ali@demo-school.moazez.local' })
  loginEmail!: string;

  @ApiProperty({ example: 'nour.parent@example.com', nullable: true })
  contactEmail!: string | null;

  @ApiProperty({ enum: USER_TYPE_API_VALUES, example: 'teacher' })
  userType!: UserTypeApiValue;

  @ApiProperty({ format: 'uuid' })
  roleId!: string;

  @ApiProperty({ example: 'teacher' })
  roleKey!: string;

  @ApiProperty({ example: 'Teacher' })
  roleName!: string;

  @ApiProperty({ enum: CREDENTIAL_STATUS_VALUES, example: 'missing' })
  status!: CredentialStatusValue;

  @ApiProperty({ example: false })
  hasPassword!: boolean;

  @ApiProperty({ example: false })
  mustChangePassword!: boolean;

  @ApiProperty({ format: 'date-time', nullable: true })
  passwordChangedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  passwordProvisionedAt!: string | null;

  @ApiProperty({ example: 1 })
  credentialVersion!: number;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastLoginAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class CredentialStatusListResponseDto {
  @ApiProperty({ type: [CredentialUserSummaryDto] })
  items!: CredentialUserSummaryDto[];

  @ApiProperty({ type: CredentialPaginationDto })
  pagination!: CredentialPaginationDto;
}

export class GeneratedCredentialResponseDto {
  @ApiProperty({ type: CredentialUserSummaryDto })
  user!: CredentialUserSummaryDto;

  @ApiProperty({
    description:
      'One-time temporary password. It is never persisted in plain text.',
    example: 'MZ-7KQ9-PL2R',
    readOnly: true,
  })
  temporaryPassword!: string;

  @ApiProperty({ example: true })
  mustChangePassword!: true;

  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;

  @ApiProperty({ example: 2 })
  credentialVersion!: number;
}

export class SetCredentialResponseDto {
  @ApiProperty({ type: CredentialUserSummaryDto })
  user!: CredentialUserSummaryDto;

  @ApiProperty({ example: true })
  mustChangePassword!: boolean;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ example: 2 })
  credentialVersion!: number;
}

export class BulkCredentialPreviewSkippedItemDto {
  @ApiProperty({ type: CredentialUserSummaryDto })
  user!: CredentialUserSummaryDto;

  @ApiProperty({ example: 'has_password' })
  reason!: string;
}

export class BulkCredentialPreviewSampleDto {
  @ApiProperty({ type: [CredentialUserSummaryDto] })
  eligible!: CredentialUserSummaryDto[];

  @ApiProperty({ type: [BulkCredentialPreviewSkippedItemDto] })
  skipped!: BulkCredentialPreviewSkippedItemDto[];
}

export class BulkCredentialPreviewResponseDto {
  @ApiProperty({ example: 30 })
  totalMatched!: number;

  @ApiProperty({ example: 24 })
  eligible!: number;

  @ApiProperty({ example: 6 })
  skipped!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { has_password: 4, inactive: 2 },
  })
  skippedReasons!: Record<string, number>;

  @ApiProperty({ type: BulkCredentialPreviewSampleDto })
  sample!: BulkCredentialPreviewSampleDto;
}

export class BulkGeneratedCredentialItemDto {
  @ApiProperty({ type: CredentialUserSummaryDto })
  user!: CredentialUserSummaryDto;

  @ApiProperty({
    description: 'One-time temporary password for this user.',
    example: 'MZ-8QWA-13ZX',
    readOnly: true,
  })
  temporaryPassword!: string;
}

export class BulkGenerateCredentialsResponseDto {
  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;

  @ApiProperty({ example: 30 })
  totalMatched!: number;

  @ApiProperty({ example: 24 })
  generated!: number;

  @ApiProperty({ example: 6 })
  skipped!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { has_password: 4, inactive: 2 },
  })
  skippedReasons!: Record<string, number>;

  @ApiProperty({ type: [BulkGeneratedCredentialItemDto] })
  items!: BulkGeneratedCredentialItemDto[];
}
